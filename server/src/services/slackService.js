const crypto = require('crypto');
const env = require('../config/env');
const { paiseToRupeesString } = require('../utils/money');
const { signAttachmentToken } = require('../utils/signedLink');

const SLACK_API = 'https://slack.com/api';

function isConfigured() {
  return !!(env.slack.botToken && env.slack.signingSecret);
}

// Slack's request-signing scheme: v0:<timestamp>:<raw body>, HMAC-SHA256 with
// the app's signing secret, compared to the X-Slack-Signature header. The
// 5-minute window rejects replayed requests.
function verifySlackSignature({ rawBody, timestamp, signature }) {
  if (!isConfigured() || !timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', env.slack.signingSecret).update(base).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Classic form-encoding, not JSON: some Web API methods (users.lookupByEmail
// among them) reject a JSON body with "invalid_arguments" even though the
// same arguments are perfectly valid — form-encoding is the one format every
// Slack Web API method has always accepted. Non-string values (blocks, view)
// are JSON-stringified into a single form field, which is exactly how Slack
// expects structured arguments to arrive over form-encoding.
async function slackApi(method, body) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    params.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Authorization: `Bearer ${env.slack.botToken}` },
    body: params.toString(),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack API ${method} failed: ${data.error}`);
  return data;
}

async function openDmByEmail(email) {
  const lookup = await slackApi('users.lookupByEmail', { email });
  const opened = await slackApi('conversations.open', { users: lookup.user.id });
  return opened.channel.id;
}

// Shared by the initial approval request and the post-action update, so
// approving/rejecting never has to throw away the expense detail to show
// the outcome — only the trailing block (buttons vs. a result line) differs.
function buildDetailBlocks(expense, attachment, headerText) {
  const amount = `Rs. ${paiseToRupeesString(expense.amountPaise)}`;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: headerText, emoji: true } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Expense:*\n${expense.expenseNumber}` },
        { type: 'mrkdwn', text: `*Site:*\n${expense.siteName}` },
        { type: 'mrkdwn', text: `*Amount:*\n${amount}` },
        { type: 'mrkdwn', text: `*Date:*\n${new Date(expense.expenseDate).toLocaleDateString('en-IN')}` },
        { type: 'mrkdwn', text: `*Category:*\n${expense.categorySnapshot?.name || ''}` },
        { type: 'mrkdwn', text: `*Payment Mode:*\n${expense.paymentMode}` },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*Description:*\n${expense.description}${expense.merchant ? `\n*Merchant:* ${expense.merchant}` : ''}` } },
  ];

  if (attachment) {
    const url = `${env.appBaseUrl}/api/public/attachments/${attachment._id}?token=${signAttachmentToken(String(attachment._id))}`;
    if (attachment.mimeType.startsWith('image/')) {
      blocks.push({ type: 'image', image_url: url, alt_text: 'Receipt', title: { type: 'plain_text', text: 'Receipt' } });
    } else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Receipt:* <${url}|Open receipt (PDF)>` } });
    }
  } else {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_No receipt attached._' } });
  }
  return blocks;
}

function buildApprovalBlocks(expense, attachment) {
  const blocks = buildDetailBlocks(expense, attachment, 'Expense awaiting your approval');
  blocks.push({
    type: 'actions',
    block_id: 'expense_approval_actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Approve', emoji: true }, style: 'primary', value: String(expense._id), action_id: 'expense_approve' },
      { type: 'button', text: { type: 'plain_text', text: 'Reject', emoji: true }, style: 'danger', value: String(expense._id), action_id: 'expense_reject' },
    ],
  });
  return blocks;
}

// Same detail blocks as the original request, with the buttons swapped for
// a static result line — the message keeps showing everything (amount,
// category, description, receipt) instead of collapsing to one line, and
// can't be clicked twice since the buttons are gone.
function buildOutcomeBlocks(expense, attachment, outcomeText) {
  const blocks = buildDetailBlocks(expense, attachment, `Expense ${expense.expenseNumber}`);
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: outcomeText } });
  return blocks;
}

// Fire-and-forget from the caller's point of view: a Slack DM failing to
// send must never block or roll back the actual expense submission, so
// callers should not await this inline with the submit transaction — see
// expenseService.submitExpense.
async function sendApprovalRequest({ expense, siteName, approvers, attachment }) {
  if (!isConfigured()) return { skipped: true, reason: 'SLACK_NOT_CONFIGURED' };
  const results = [];
  for (const user of approvers) {
    if (!user.slackEmail) {
      results.push({ userId: user._id, skipped: true, reason: 'NO_SLACK_EMAIL' });
      continue;
    }
    try {
      const channel = await openDmByEmail(user.slackEmail);
      const posted = await slackApi('chat.postMessage', {
        channel,
        blocks: buildApprovalBlocks({ ...expense.toObject?.() ?? expense, siteName }, attachment),
        text: `Expense ${expense.expenseNumber} needs your approval`,
      });
      results.push({ userId: user._id, ok: true, channel, ts: posted.ts });
    } catch (err) {
      results.push({ userId: user._id, ok: false, error: err.message });
    }
  }
  return { results };
}

// Replaces the interactive buttons with a static outcome line once the AGM
// acts, while rebuilding the same detail blocks (amount, category,
// description, receipt) so the message stays fully informative instead of
// collapsing to a single line — the Slack message becomes the audit trail
// of what happened, and can't be clicked twice.
async function updateMessageAfterAction({ responseUrl, outcomeText, expense, attachment }) {
  const body = expense
    ? { replace_original: true, text: outcomeText, blocks: buildOutcomeBlocks(expense, attachment, outcomeText) }
    : { replace_original: true, text: outcomeText };
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function slackUserEmail(slackUserId) {
  const info = await slackApi('users.info', { user: slackUserId });
  return info.user?.profile?.email || null;
}

// responseUrl is threaded through private_metadata (as JSON, alongside the
// expenseId) rather than looked up later — Slack's view_submission payload
// for the modal has no response_url of its own, since a modal submission is
// a distinct interaction from the button click that opened it. Carrying it
// through this way lets the eventual reject still update the *original*
// message in place, exactly like Approve does, instead of posting a new one.
async function openRejectReasonModal({ triggerId, expenseId, responseUrl }) {
  await slackApi('views.open', {
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: 'expense_reject_reason',
      private_metadata: JSON.stringify({ expenseId, responseUrl }),
      title: { type: 'plain_text', text: 'Reject expense' },
      submit: { type: 'plain_text', text: 'Reject' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [
        {
          type: 'input',
          block_id: 'reason_block',
          label: { type: 'plain_text', text: 'Reason (the fund will still be deducted)' },
          element: { type: 'plain_text_input', action_id: 'reason_input', multiline: true, min_length: 3 },
        },
      ],
    },
  });
}

module.exports = { isConfigured, verifySlackSignature, sendApprovalRequest, updateMessageAfterAction, slackUserEmail, openRejectReasonModal };
