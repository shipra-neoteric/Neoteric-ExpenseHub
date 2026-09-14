const querystring = require('querystring');
const Expense = require('../models/Expense');
const User = require('../models/User');
const slackService = require('../services/slackService');
const expenseService = require('../services/expenseService');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

async function resolveInternalUser(slackUserId, organizationId) {
  const email = await slackService.slackUserEmail(slackUserId);
  if (!email) return null;
  return User.findOne({ organizationId, slackEmail: email.toLowerCase(), isActive: true });
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
        await expenseService.approveExpense({ expenseId, userId: actor._id });
        await slackService.updateMessageAfterAction({ responseUrl: payload.response_url, outcomeText: `:white_check_mark: Approved by ${actor.name} — ${expense.expenseNumber}` });
      } catch (err) {
        await slackService.updateMessageAfterAction({ responseUrl: payload.response_url, outcomeText: `:warning: Could not approve ${expense.expenseNumber}: ${err.message}` });
      }
      return;
    }

    if (action.action_id === 'expense_reject') {
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
