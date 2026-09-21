const ExpenseAttachment = require('../models/ExpenseAttachment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAttachmentToken } = require('../utils/signedLink');

// Deliberately outside the authenticated /expenses/:id/attachments route —
// this is the one place a request with no login session (Slack's own
// server, fetching an image block for a DM preview) can read a receipt, and
// only with a valid short-lived signed token for that exact attachment.
const download = asyncHandler(async (req, res) => {
  const attachment = await ExpenseAttachment.findOne({ _id: req.params.attachmentId, removedAt: null });
  if (!attachment) throw ApiError.notFound('Attachment not found');
  if (!verifyAttachmentToken(String(attachment._id), req.query.token)) {
    throw ApiError.unauthorized('Invalid or expired link', 'INVALID_TOKEN');
  }
  if (!attachment.url) throw ApiError.notFound('File not found');

  res.redirect(attachment.url);
});

module.exports = { download };
