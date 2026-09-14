const { z } = require('zod');
const { PAYMENT_MODES, RECEIPT_RULE, OVERDRAW_BEHAVIOR } = require('../config/constants');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const moneyRupees = z.union([z.string(), z.number()]).refine((v) => {
  const s = String(v).trim().replace(/,/g, '');
  return /^\d+(\.\d{1,2})?$/.test(s) && parseFloat(s) > 0;
}, 'Amount must be a positive number with at most 2 decimals');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const expenseCreateSchema = z.object({
  siteId: objectId,
  expenseDate: z.coerce.date(),
  categoryId: objectId,
  description: z.string().trim().min(3, 'Description is too short'),
  merchant: z.string().trim().max(200).optional().default(''),
  amount: moneyRupees,
  paymentMode: z.enum(PAYMENT_MODES),
  paidByUserId: objectId.optional(),
  notes: z.string().trim().max(1000).optional().default(''),
  idempotencyKey: z.string().max(100).optional(),
});

const expenseUpdateSchema = z.object({
  expenseDate: z.coerce.date().optional(),
  categoryId: objectId.optional(),
  description: z.string().trim().min(3).optional(),
  merchant: z.string().trim().max(200).optional(),
  amount: moneyRupees.optional(),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
  paidByUserId: objectId.optional(),
  notes: z.string().trim().max(1000).optional(),
  expectedVersion: z.coerce.number().int().optional(),
});

const submitSchema = z.object({
  duplicateOverrideReason: z.string().trim().max(500).optional(),
});

const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(1000),
});

const siteCreateSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  salesOfficeLabel: z.string().trim().optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const categoryCreateSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  icon: z.string().trim().optional(),
  receiptRule: z.enum(Object.values(RECEIPT_RULE)).optional(),
  receiptThresholdAmount: moneyRupees.optional(),
  displayOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const policyUpdateSchema = z.object({
  defaultAllocationAmount: moneyRupees.optional(),
  overdrawBehavior: z.enum(Object.values(OVERDRAW_BEHAVIOR)).optional(),
  receiptRequiredThresholdAmount: moneyRupees.optional(),
  backdateLimitDays: z.coerce.number().int().min(0).max(365).optional(),
  allowedPaymentModes: z.array(z.enum(PAYMENT_MODES)).min(1).optional(),
  approverUserIds: z.array(objectId).optional(),
  allowSelfApproval: z.boolean().optional(),
});

const openingAllocationSchema = z.object({
  siteId: objectId,
  amount: moneyRupees,
  label: z.string().trim().min(1),
  startDate: z.coerce.date().optional(),
});

const ledgerMovementSchema = z.object({
  amount: moneyRupees,
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().max(100).optional(),
});

const adjustmentSchema = z.object({
  amount: z.union([z.string(), z.number()]).refine((v) => {
    const s = String(v).trim().replace(/,/g, '');
    return /^-?\d+(\.\d{1,2})?$/.test(s) && parseFloat(s) !== 0;
  }, 'Amount must be a non-zero number with at most 2 decimals'),
  reason: z.string().trim().min(3).max(500),
});

const closePeriodSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  carryForward: z.boolean().optional().default(true),
});

const assignmentCreateSchema = z.object({
  userId: objectId,
  siteId: objectId,
  effectiveStart: z.coerce.date().optional(),
  effectiveEnd: z.coerce.date().optional().nullable(),
});

const userCreateSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  roleLabel: z.string().trim().min(1),
  permissions: z.array(z.string()).optional(),
  slackEmail: z.string().email().optional(),
});

module.exports = {
  objectId,
  loginSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  submitSchema,
  reasonSchema,
  siteCreateSchema,
  categoryCreateSchema,
  policyUpdateSchema,
  openingAllocationSchema,
  ledgerMovementSchema,
  adjustmentSchema,
  closePeriodSchema,
  assignmentCreateSchema,
  userCreateSchema,
};
