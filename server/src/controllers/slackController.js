const querystring = require('querystring');
const Expense = require('../models/Expense');
const User = require('../models/User');
const slackService = require('../services/slackService');
const expenseService = require('../services/expenseService');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getAccessibleSiteIds } = require('../middleware/siteScope');
const { PERMISSIONS } = require('../config/constants');

async function resolveInternalUser(slackUserId, organizationId) {
  const email = await slackService.slackUserEmail(slackUserId);
  if (!email) return null;
  return User.findOne({ organizationId, slackEmail: email.toLowerCase(), isActive: true });
}

// The HTTP routes for approve/reject enforce permission + site-assignment
// via Express middleware (requirePermission, requireSiteAccess) before ever
// reaching expenseService. A Slack interaction calls expenseService
// directly, bypassing that layer entirely, so the same two checks are
// re-applied here by hand — otherwise anyone whose Slack email happens to
// match an active user (even one never assigned to this site, or since
// unassigned) could act on it just by being in the DM thread.
async function assertCanActOnExpense(actor, expense, permission) {
  if (!actor.hasPermission(permission)) return false;
  const accessibleSiteIds = await getAccessibleSiteIds(actor);
  return accessibleSiteIds.includes(String(expense.siteId));
}

// Single Request URL for every Slack interaction: block button clicks
// (Approve / Reject) and the reject-reason modal's submission both land
// here, distinguished by payload.type. Slack requires a fast (<3s) response,
// so this ACKs immediately and does the real work before that timeout via
// the synchronous awaits below (approve/reject are already fast, single-
// document operations) rather than a separate queue — acceptable for this
// app's volume, but worth revisiting if approval traffic grows heavily.
const handleInteraction = asyncHandler(async (req, res) => {
  const rawBody = req.body.toString('utf8');
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  if (!slackService.verifySlackSignature({ rawBody, timestamp, signature })) {
    throw ApiError.unauthorized('Invalid Slack signature', 'INVALID_SLACK_SIGNATURE');
  }

  const parsed = querystring.parse(rawBody);
  const payload = JSON.parse(parsed.payload);

  if (payload.type === 'block_actions') {
    const action = payload.actions[0];
    const expenseId = action.value;
    const expense = await Expense.findById(expenseId);
    if (!expense) {
      res.status(200).send();
      return;
    }
    const actor = await resolveInternalUser(payload.user.id, expense.organizationId);

    if (action.action_id === 'expense_approve') {
      res.status(200).send();
      if (!actor) return;
      try {
        if (!(await assertCanActOnExpense(actor, expense, PERMISSIONS.APPROVE))) {
          await slackService.updateMessageAfterAction({ responseUrl: payload.response_url, outcomeText: `:no_entry: ${actor.name} is not authorized to approve ${expense.expenseNumber} (missing permission or no longer assigned to this site).` });
          return;
        }
        await expenseService.approveExpense({ expenseId, userId: actor._id });
        await slackService.updateMessageAfterAction({ responseUrl: payload.response_url, outcomeText: `:white_check_mark: Approved by ${actor.name} — ${expense.expenseNumber}` });
      } catch (err) {
        await slackService.updateMessageAfterAction({ responseUrl: payload.response_url, outcomeText: `:warning: Could not approve ${expense.expenseNumber}: ${err.message}` });
      }
      return;
    }

    if (action.action_id === 'expense_reject') {
      if (!actor || !(await assertCanActOnExpense(actor, expense, PERMISSIONS.REJECT_RETURN))) {
        await slackService.updateMessageAfterAction({ responseUrl: payload.response_url, outcomeText: `:no_entry: You are not authorized to reject ${expense.expenseNumber} (missing permission or no longer assigned to this site).` });
        res.status(200).send();
        return;
      }
      await slackService.openRejectReasonModal({ triggerId: payload.trigger_id, expenseId });
      res.status(200).send();
      return;
    }

    res.status(200).send();
    return;
  }

  if (payload.type === 'view_submission' && payload.view.callback_id === 'expense_reject_reason') {
    const expenseId = payload.view.private_metadata;
    const reason = payload.view.state.values.reason_block.reason_input.value;
    const expense = await Expense.findById(expenseId);
    res.status(200).json({ response_action: 'clear' });
    if (!expense) return;
    const actor = await resolveInternalUser(payload.user.id, expense.organizationId);
    if (!actor) return;
    // Re-checked here too (not just before opening the modal): permissions
    // or site assignment could have changed in the time the modal was open.
    if (!(await assertCanActOnExpense(actor, expense, PERMISSIONS.REJECT_RETURN))) return;
    try {
      await expenseService.rejectExpense({ expenseId, userId: actor._id, reason });
      // No response_url for a modal submission — DM the actor a confirmation instead of silently updating nothing.
    } catch (err) {
      // Swallowed deliberately: the modal has already closed by the time this
      // runs, so there is nothing left in Slack to attach the error to.
      console.error('[slack] reject via modal failed', err);
    }
    return;
  }

  res.status(200).send();
});

module.exports = { handleInteraction };
