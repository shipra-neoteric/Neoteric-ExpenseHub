const Expense = require('../models/Expense');
const ExpenseApprovalAction = require('../models/ExpenseApprovalAction');
const ExpenseAttachment = require('../models/ExpenseAttachment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { rupeesToPaise } = require('../utils/money');
const { PERMISSIONS } = require('../config/constants');
const expenseService = require('../services/expenseService');
const fundService = require('../services/fundService');
const { getAccessibleSiteIds } = require('../middleware/siteScope');

function toPaisePayload(body) {
  const payload = { ...body };
  if (payload.amount !== undefined) {
    payload.amountPaise = rupeesToPaise(payload.amount);
    delete payload.amount;
  }
  return payload;
}

async function loadOwnedExpense(req, { requireSiteAccess = true } = {}) {
  const expense = await Expense.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!expense) throw ApiError.notFound('Expense not found');
  if (requireSiteAccess) {
    const accessible = await getAccessibleSiteIds(req.user);
    if (!accessible.includes(String(expense.siteId))) throw ApiError.forbidden('You do not have access to this site', 'SITE_ACCESS_DENIED');
  }
  return expense;
}

const list = asyncHandler(async (req, res) => {
  const accessible = await getAccessibleSiteIds(req.user);
  const { siteId, status, category, paymentMode, receiptStatus, submitter, dateFrom, dateTo, search, page = '1', limit = '20' } = req.query;

  const query = { organizationId: req.organizationId };
  if (siteId) {
    if (!accessible.includes(String(siteId))) throw ApiError.forbidden('You do not have access to this site', 'SITE_ACCESS_DENIED');
    query.siteId = siteId;
  } else {
    query.siteId = { $in: accessible };
  }
  if (status) query.status = { $in: String(status).split(',') };
  if (category) query.categoryId = { $in: String(category).split(',') };
  if (paymentMode) query.paymentMode = { $in: String(paymentMode).split(',') };
  if (submitter) query.createdBy = submitter;
  if (dateFrom || dateTo) {
    query.expenseDate = {};
    if (dateFrom) query.expenseDate.$gte = new Date(dateFrom);
    if (dateTo) query.expenseDate.$lte = new Date(dateTo);
  }
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ expenseNumber: rx }, { description: rx }, { merchant: rx }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  let items = await Expense.find(query)
    .sort({ expenseDate: -1, createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .populate('paidByUserId', 'name')
    .populate('createdBy', 'name')
    .lean();

  const ids = items.map((i) => i._id);
  const counts = await ExpenseAttachment.aggregate([
    { $match: { expenseId: { $in: ids }, removedAt: null } },
    { $group: { _id: '$expenseId', c: { $sum: 1 } } },
  ]);
  const withReceipt = new Set(counts.map((c) => String(c._id)));
  items = items.map((i) => ({ ...i, hasReceipt: withReceipt.has(String(i._id)) }));

  if (receiptStatus === 'missing' || receiptStatus === 'attached') {
    items = items.filter((i) => (receiptStatus === 'missing' ? !i.hasReceipt : i.hasReceipt));
  }

  const total = await Expense.countDocuments(query);
  res.json({ items, page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) });
});

const getOne = asyncHandler(async (req, res) => {
  const expense = await loadOwnedExpense(req);
  const [attachments, timeline] = await Promise.all([
    ExpenseAttachment.find({ expenseId: expense._id, removedAt: null }).lean(),
    ExpenseApprovalAction.find({ expenseId: expense._id }).sort({ createdAt: 1 }).populate('actorId', 'name').lean(),
  ]);
  const balance = await fundService.computeBalance(expense.fundPeriodId);
  res.json({ expense, attachments, timeline, balance });
});

const createDraft = asyncHandler(async (req, res) => {
  const payload = toPaisePayload(req.body);
  const expense = await expenseService.createDraft({
    organizationId: req.organizationId,
    siteId: req.body.siteId,
    userId: req.user._id,
    payload,
    req,
  });
  res.status(201).json({ expense });
});

const update = asyncHandler(async (req, res) => {
  const expense = await loadOwnedExpense(req);
  const canEditAny = req.user.hasPermission(PERMISSIONS.APPROVE) || req.user.hasPermission(PERMISSIONS.MASTER_MANAGE);
  if (String(expense.createdBy) !== String(req.user._id) && !canEditAny) {
    throw ApiError.forbidden('You can only edit your own expense', 'NOT_OWNER');
  }
  const payload = toPaisePayload(req.body);
  const updated = await expenseService.updateExpense({ expense, userId: req.user._id, payload, expectedVersion: req.body.expectedVersion, req });
  res.json({ expense: updated });
});

const submit = asyncHandler(async (req, res) => {
  const expense = await loadOwnedExpense(req);
  if (String(expense.createdBy) !== String(req.user._id)) throw ApiError.forbidden('You can only submit your own expense', 'NOT_OWNER');
  const updated = await expenseService.submitExpense({ expense, userId: req.user._id, duplicateOverrideReason: req.body.duplicateOverrideReason, req });
  res.json({ expense: updated });
});

const approve = asyncHandler(async (req, res) => {
  await loadOwnedExpense(req);
  const updated = await expenseService.approveExpense({ expenseId: req.params.id, userId: req.user._id, req });
  res.json({ expense: updated });
});

const returnForCorrection = asyncHandler(async (req, res) => {
  await loadOwnedExpense(req);
  const updated = await expenseService.returnExpense({ expenseId: req.params.id, userId: req.user._id, reason: req.body.reason, req });
  res.json({ expense: updated });
});

const reject = asyncHandler(async (req, res) => {
  await loadOwnedExpense(req);
  const updated = await expenseService.rejectExpense({ expenseId: req.params.id, userId: req.user._id, reason: req.body.reason, req });
  res.json({ expense: updated });
});

const voidExpense = asyncHandler(async (req, res) => {
  await loadOwnedExpense(req);
  const updated = await expenseService.voidExpense({ expenseId: req.params.id, userId: req.user._id, reason: req.body.reason, req });
  res.json({ expense: updated });
});

const remove = asyncHandler(async (req, res) => {
  const expense = await loadOwnedExpense(req);
  if (String(expense.createdBy) !== String(req.user._id)) throw ApiError.forbidden('You can only delete your own draft', 'NOT_OWNER');
  await expenseService.deleteDraft({ expenseId: expense._id, userId: req.user._id, req });
  res.status(204).send();
});

module.exports = { list, getOne, createDraft, update, submit, approve, returnForCorrection, reject, voidExpense, remove };
