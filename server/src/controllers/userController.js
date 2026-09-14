const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLE_PRESETS } = require('../config/constants');
const { recordAudit } = require('../services/auditService');

const list = asyncHandler(async (req, res) => {
  const users = await User.find({ organizationId: req.organizationId }).select('-passwordHash').sort({ name: 1 }).lean();
  res.json({ items: users });
});

const create = asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const existing = await User.findOne({ organizationId: req.organizationId, email });
  if (existing) throw ApiError.conflict('A user with this email already exists', 'DUPLICATE_EMAIL');

  const permissions = req.body.permissions?.length ? req.body.permissions : ROLE_PRESETS[req.body.roleLabel] || [];
  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const user = await User.create({
    organizationId: req.organizationId,
    name: req.body.name.trim(),
    email,
    passwordHash,
    roleLabel: req.body.roleLabel,
    permissions,
    slackEmail: req.body.slackEmail ? req.body.slackEmail.trim().toLowerCase() : null,
  });
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'USER_CREATE', entityType: 'User', entityId: user._id, after: user.toSafeJSON(), req });
  res.status(201).json({ user: user.toSafeJSON() });
});

const update = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!user) throw ApiError.notFound('User not found');
  const before = user.toSafeJSON();

  if (req.body.name) user.name = req.body.name.trim();
  if (req.body.email) {
    const email = req.body.email.trim().toLowerCase();
    if (email !== user.email) {
      const existing = await User.findOne({ organizationId: req.organizationId, email, _id: { $ne: user._id } });
      if (existing) throw ApiError.conflict('A user with this email already exists', 'DUPLICATE_EMAIL');
      user.email = email;
    }
  }
  if (req.body.roleLabel) {
    user.roleLabel = req.body.roleLabel;
    // Switching role re-syncs permissions to the new preset unless the
    // caller explicitly also sent a custom permissions array.
    if (!req.body.permissions) user.permissions = ROLE_PRESETS[req.body.roleLabel] || user.permissions;
  }
  if (req.body.permissions) user.permissions = req.body.permissions;
  if (req.body.isActive !== undefined) user.isActive = req.body.isActive;
  if (req.body.slackEmail !== undefined) user.slackEmail = req.body.slackEmail ? req.body.slackEmail.trim().toLowerCase() : null;
  if (req.body.password) user.passwordHash = await bcrypt.hash(req.body.password, 10);

  await user.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'USER_UPDATE', entityType: 'User', entityId: user._id, before, after: user.toSafeJSON(), req });
  res.json({ user: user.toSafeJSON() });
});

// "Delete" deactivates rather than hard-deletes: a User is referenced by
// Expense.createdBy/approvedBy, FundLedgerEntry.createdBy, AuditEvent.actorId,
// etc. across the historical record, so removing the document would either
// break those references or silently rewrite history. Deactivating blocks
// login/access immediately while preserving authorship on everything they
// touched — the same pattern already used for sites/categories.
const remove = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!user) throw ApiError.notFound('User not found');
  if (String(user._id) === String(req.user._id)) throw ApiError.badRequest('You cannot delete your own account', 'CANNOT_DELETE_SELF');
  const before = user.toSafeJSON();
  user.isActive = false;
  await user.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'USER_DELETE', entityType: 'User', entityId: user._id, before, after: user.toSafeJSON(), req });
  res.status(204).send();
});

module.exports = { list, create, update, remove };
