const ExpenseCategory = require('../models/ExpenseCategory');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { rupeesToPaise } = require('../utils/money');
const { recordAudit } = require('../services/auditService');

function normalize(name) {
  return name.trim().toLowerCase();
}

const list = asyncHandler(async (req, res) => {
  const onlyActive = req.query.all !== 'true';
  const query = { organizationId: req.organizationId };
  if (onlyActive) query.isActive = true;
  const items = await ExpenseCategory.find(query).sort({ displayOrder: 1, name: 1 }).lean();
  res.json({ items });
});

const create = asyncHandler(async (req, res) => {
  const normalizedName = normalize(req.body.name);
  const code = req.body.code.trim().toUpperCase();
  const dupe = await ExpenseCategory.findOne({ organizationId: req.organizationId, $or: [{ normalizedName }, { code }] });
  if (dupe) throw ApiError.conflict('A category with this name or code already exists', 'DUPLICATE_CATEGORY');

  const category = await ExpenseCategory.create({
    organizationId: req.organizationId,
    name: req.body.name.trim(),
    normalizedName,
    code,
    icon: req.body.icon || 'Receipt',
    receiptRule: req.body.receiptRule,
    receiptThresholdPaise: req.body.receiptThresholdAmount ? rupeesToPaise(req.body.receiptThresholdAmount) : null,
    displayOrder: req.body.displayOrder ?? 0,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'CATEGORY_CREATE', entityType: 'ExpenseCategory', entityId: category._id, after: category.toObject(), req });
  res.status(201).json({ category });
});

const update = asyncHandler(async (req, res) => {
  const category = await ExpenseCategory.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!category) throw ApiError.notFound('Category not found');
  const before = category.toObject();

  if (req.body.name) {
    const normalizedName = normalize(req.body.name);
    const dupe = await ExpenseCategory.findOne({ organizationId: req.organizationId, normalizedName, _id: { $ne: category._id } });
    if (dupe) throw ApiError.conflict('A category with this name already exists', 'DUPLICATE_CATEGORY');
    category.name = req.body.name.trim();
    category.normalizedName = normalizedName;
  }
  if (req.body.icon) category.icon = req.body.icon;
  if (req.body.receiptRule) category.receiptRule = req.body.receiptRule;
  if (req.body.receiptThresholdAmount !== undefined) category.receiptThresholdPaise = rupeesToPaise(req.body.receiptThresholdAmount);
  if (req.body.displayOrder !== undefined) category.displayOrder = req.body.displayOrder;
  if (req.body.isActive !== undefined) category.isActive = req.body.isActive; // deactivate, never hard-delete
  category.updatedBy = req.user._id;
  await category.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'CATEGORY_UPDATE', entityType: 'ExpenseCategory', entityId: category._id, before, after: category.toObject(), req });
  res.json({ category });
});

module.exports = { list, create, update };
