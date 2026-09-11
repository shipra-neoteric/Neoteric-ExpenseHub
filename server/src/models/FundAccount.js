const { Schema, model } = require('mongoose');

// One active fund account per site for L1; schema allows more later via the
// unique (site, name) pair instead of a hard one-per-site constraint.
const fundAccountSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    name: { type: String, default: 'Primary Imprest' },
    status: { type: String, enum: ['ACTIVE', 'CLOSED'], default: 'ACTIVE' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

fundAccountSchema.index({ siteId: 1, name: 1 }, { unique: true });

module.exports = model('FundAccount', fundAccountSchema);
