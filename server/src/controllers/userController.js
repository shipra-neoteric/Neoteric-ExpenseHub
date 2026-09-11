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
  });
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'USER_CREATE', entityType: 'User', entityId: user._id, after: user.toSafeJSON(), req });
  res.status(201).json({ user: user.toSafeJSON() });
});

const update = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!user) throw ApiError.notFound('User not found');
  const before = user.toSafeJSON();
  if (req.body.name) user.name = req.body.name.trim();
  if (req.body.roleLabel) user.roleLabel = req.body.roleLabel;
  if (req.body.permissions) user.permissions = req.body.permissions;
  if (req.body.isActive !== undefined) user.isActive = req.body.isActive;
  await user.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'USER_UPDATE', entityType: 'User', entityId: user._id, before, after: user.toSafeJSON(), req });
  res.json({ user: user.toSafeJSON() });
});

module.exports = { list, create, update };
