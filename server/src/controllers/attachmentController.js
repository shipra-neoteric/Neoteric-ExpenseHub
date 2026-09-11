const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Expense = require('../models/Expense');
const ExpenseAttachment = require('../models/ExpenseAttachment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../services/auditService');
const { getAccessibleSiteIds } = require('../middleware/siteScope');
const { EXPENSE_STATUS } = require('../config/constants');
const env = require('../config/env');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

async function loadExpenseWithAccess(req) {
  const expense = await Expense.findOne({ _id: req.params.expenseId, organizationId: req.organizationId });
  if (!expense) throw ApiError.notFound('Expense not found');
  const accessible = await getAccessibleSiteIds(req.user);
  if (!accessible.includes(String(expense.siteId))) throw ApiError.forbidden('You do not have access to this site', 'SITE_ACCESS_DENIED');
  return expense;
}

const upload = asyncHandler(async (req, res) => {
  const expense = await loadExpenseWithAccess(req);
  if (![EXPENSE_STATUS.DRAFT, EXPENSE_STATUS.RETURNED].includes(expense.status)) {
    throw ApiError.conflict('Attachments can only be changed on draft or returned expenses', 'NOT_EDITABLE');
  }
  if (!req.file) throw ApiError.badRequest('No file uploaded', 'FILE_REQUIRED');
  if (!ALLOWED_MIME.has(req.file.mimetype)) {
    fs.unlink(req.file.path, () => {});
    throw ApiError.badRequest('Unsupported file type. Use JPG, PNG, WEBP, or PDF.', 'UNSUPPORTED_MIME');
  }

  const checksum = crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
  const dupe = await ExpenseAttachment.findOne({ expenseId: expense._id, checksum, removedAt: null });
  if (dupe) {
    fs.unlink(req.file.path, () => {});
    throw ApiError.conflict('This file was already uploaded for this expense', 'DUPLICATE_ATTACHMENT');
  }

  const attachment = await ExpenseAttachment.create({
    organizationId: req.organizationId,
    expenseId: expense._id,
    storageKey: req.file.filename,
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

  const filePath = path.join(process.cwd(), env.uploadDir, attachment.storageKey);
  if (!fs.existsSync(filePath)) throw ApiError.notFound('File not found');

  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'ATTACHMENT_DOWNLOAD', entityType: 'ExpenseAttachment', entityId: attachment._id, req });
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalName)}"`);
  fs.createReadStream(filePath).pipe(res);
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
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'ATTACHMENT_REMOVE', entityType: 'ExpenseAttachment', entityId: attachment._id, req });
  res.status(204).send();
});

module.exports = { upload, download, remove };
