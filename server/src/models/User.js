const { Schema, model } = require('mongoose');
const bcrypt = require('bcryptjs');
const { ALL_PERMISSIONS } = require('../config/constants');

const userSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    roleLabel: { type: String, required: true }, // preset used at creation time, display only
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.every((p) => ALL_PERMISSIONS.includes(p)),
        message: 'Unknown permission in user.permissions',
      },
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    // Email registered on the org's Slack workspace, used to DM this user
    // approval requests (via Slack's users.lookupByEmail). Independent of
    // the login email above, since they need not match.
    slackEmail: { type: String, trim: true, lowercase: true, default: null },
  },
  { timestamps: true }
);

userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.hasPermission = function hasPermission(permission) {
  return this.permissions.includes(permission);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    organizationId: this.organizationId,
    name: this.name,
    email: this.email,
    roleLabel: this.roleLabel,
    permissions: this.permissions,
    isActive: this.isActive,
    slackEmail: this.slackEmail || null,
  };
};

module.exports = model('User', userSchema);
