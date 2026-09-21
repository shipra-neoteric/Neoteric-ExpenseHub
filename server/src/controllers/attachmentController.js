const crypto = require('crypto');
const Expense = require('../models/Expense');
const ExpenseAttachment = require('../models/ExpenseAttachment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../services/auditService');
const { getAccessibleSiteIds } = require('../middleware/siteScope');
const { EXPENSE_STATUS } = require('../config/constants');
const cloudinary = require('../config/cloudinary');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

async function loadExpenseWithAccess(req) {
  const expense = await Expense.findOne({ _id: req.params.expenseId, organizationId: req.organizationId });
  if (!expense) throw ApiError.notFound('Expense not found');
  const accessible = await getAccessibleSiteIds(req.user);
  if (!accessible.includes(String(expense.siteId))) throw ApiError.forbidden('You do not have access to this site', 'SITE_ACCESS_DENIED');
  return expense;
}

function uploadBufferToCloudinary(buffer, { resourceType, folder }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ resource_type: resourceType, folder }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    stream.end(buffer);
  });
}

const upload = asyncHandler(async (req, res) => {
  const expense = await loadExpenseWithAccess(req);
  if (![EXPENSE_STATUS.DRAFT, EXPENSE_STATUS.RETURNED].includes(expense.status)) {
    throw ApiError.conflict('Attachments can only be changed on draft or returned expenses', 'NOT_EDITABLE');
  }
  if (!req.file) throw ApiError.badRequest('No file uploaded', 'FILE_REQUIRED');
  if (!ALLOWED_MIME.has(req.file.mimetype)) {
    throw ApiError.badRequest('Unsupported file type. Use JPG, PNG, WEBP, or PDF.', 'UNSUPPORTED_MIME');
  }

  const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const dupe = await ExpenseAttachment.findOne({ expenseId: expense._id, checksum, removedAt: null });
  if (dupe) {
    throw ApiError.conflict('This file was already uploaded for this expense', 'DUPLICATE_ATTACHMENT');
  }

  const resourceType = req.file.mimetype === 'application/pdf' ? 'raw' : 'image';
  const result = await uploadBufferToCloudinary(req.file.buffer, { resourceType, folder: 'expensehub/receipts' });

  const attachment = await ExpenseAttachment.create({
    organizationId: req.organizationId,
    expenseId: expense._id,
    url: result.secure_url,
    publicId: result.public_id,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    checksum,
    scanStatus: 'SKIPPED',
    uploadedBy: req.user._id,
  });

  await recordAudit({
    organizationId: req.organizationId,
    actorId: req.user._id,
    action: 'ATTACHMENT_UPLOAD',
    entityType: 'ExpenseAttachment',
    entityId: attachment._id,
    after: { originalName: attachment.originalName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes },
    req,
  });

  res.status(201).json({ attachment });
});

const download = asyncHandler(async (req, res) => {
  const expense = await loadExpenseWithAccess(req);
  const attachment = await ExpenseAttachment.findOne({ _id: req.params.attachmentId, expenseId: expense._id, removedAt: null });
  if (!attachment) throw ApiError.notFound('Attachment not found');
  if (!attachment.url) throw ApiError.notFound('File not found');

  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'ATTACHMENT_DOWNLOAD', entityType: 'ExpenseAttachment', entityId: attachment._id, req });
  res.redirect(attachment.url);
});

const remove = asyncHandler(async (req, res) => {
  const expense = await loadExpenseWithAccess(req);
  if (![EXPENSE_STATUS.DRAFT, EXPENSE_STATUS.RETURNED].includes(expense.status)) {
    throw ApiError.conflict('Attachments can only be changed on draft or returned expenses', 'NOT_EDITABLE');
  }
  const attachment = await ExpenseAttachment.findOne({ _id: req.params.attachmentId, expenseId: expense._id });
  if (!attachment) throw ApiError.notFound('Attachment not found');
  attachment.removedAt = new Date();
  await attachment.save();
  if (attachment.publicId) {
    const resourceType = attachment.mimeType === 'application/pdf' ? 'raw' : 'image';
    cloudinary.uploader.destroy(attachment.publicId, { resource_type: resourceType }).catch(() => {});
  }
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'ATTACHMENT_REMOVE', entityType: 'ExpenseAttachment', entityId: attachment._id, req });
  res.status(204).send();
});

module.exports = { upload, download, remove };
