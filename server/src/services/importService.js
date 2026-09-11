const crypto = require('crypto');
const mongoose = require('mongoose');
const Site = require('../models/Site');
const ExpenseCategory = require('../models/ExpenseCategory');
const Expense = require('../models/Expense');
const ExpenseApprovalAction = require('../models/ExpenseApprovalAction');
const FundLedgerEntry = require('../models/FundLedgerEntry');
const ImportRecord = require('../models/ImportRecord');
const fundService = require('./fundService');
const { nextExpenseNumber } = require('./numberingService');
const { recordAudit } = require('./auditService');
const { EXPENSE_STATUS, LEDGER_ENTRY_TYPE, PAYMENT_MODES } = require('../config/constants');

const REQUIRED_COLUMNS = ['site', 'expenseDate', 'category', 'description', 'amount'];

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const splitLine = (line) => {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };
  const header = splitLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line, i) => {
    const cells = splitLine(line);
    const obj = {};
    header.forEach((h, idx) => (obj[h] = cells[idx] ?? ''));
    return { rowNumber: i + 2, raw: obj };
  });
  return { header, rows };
}

// Deterministic date parsing only: ISO (YYYY-MM-DD) and Indian day-first
// (D/M/YYYY or D-M-YYYY, 2 or 4 digit year). Anything else is ambiguous and
// must go to review rather than guessed at.
function normalizeDate(value) {
  const s = String(value || '').trim();
  if (!s) return { error: 'blank date' };
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Number.isNaN(d.getTime()) ? { error: 'invalid date' } : { date: d };
  }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, day, month, year] = m;
    if (year.length === 2) year = `20${year}`;
    day = +day;
    month = +month;
    year = +year;
    if (day < 1 || day > 31 || month < 1 || month > 12) return { error: 'ambiguous or invalid date' };
    const d = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(d.getTime()) || d.getUTCDate() !== day) return { error: 'invalid date' };
    return { date: d };
  }
  return { error: 'unrecognized date format' };
}

// Blank/whitespace/non-numeric amounts are never guessed — they are rejected
// for manual review, per spec (the sheet's blank "Kitchen Expense" row).
function normalizeAmount(value) {
  const s = String(value ?? '').trim();
  if (!s) return { error: 'blank amount' };
  const cleaned = s.replace(/,/g, '').replace(/^Rs\.?\s*/i, '').replace(/^₹\s*/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { error: `invalid amount "${s}"` };
  const amountPaise = Math.round(parseFloat(cleaned) * 100);
  if (amountPaise <= 0) return { error: 'amount must be greater than zero' };
  return { amountPaise };
}

async function buildLookups(organizationId) {
  const sites = await Site.find({ organizationId }).lean();
  const categories = await ExpenseCategory.find({ organizationId }).lean();
  const siteByCode = new Map(sites.map((s) => [s.code.toLowerCase(), s]));
  const siteByName = new Map(sites.map((s) => [s.name.toLowerCase(), s]));
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const categoryByCode = new Map(categories.map((c) => [c.code.toLowerCase(), c]));
  return { siteByCode, siteByName, categoryByName, categoryByCode };
}

function resolveSite(value, lookups) {
  const key = String(value || '').trim().toLowerCase();
  return lookups.siteByCode.get(key) || lookups.siteByName.get(key) || null;
}

function resolveCategory(value, lookups) {
  const key = String(value || '').trim().toLowerCase();
  return lookups.categoryByCode.get(key) || lookups.categoryByName.get(key) || null;
}

async function validateRows(rows, lookups) {
  const results = [];
  for (const row of rows) {
    const errors = [];
    const missing = REQUIRED_COLUMNS.filter((c) => !row.raw[c] || !String(row.raw[c]).trim());
    if (missing.length) errors.push(`missing required field(s): ${missing.join(', ')}`);

    const site = resolveSite(row.raw.site, lookups);
    if (row.raw.site && !site) errors.push(`unknown site "${row.raw.site}"`);

    const category = resolveCategory(row.raw.category, lookups);
    if (row.raw.category && !category) errors.push(`unknown category "${row.raw.category}"`);

    const dateResult = normalizeDate(row.raw.expenseDate);
    if (dateResult.error) errors.push(dateResult.error);

    const amountResult = normalizeAmount(row.raw.amount);
    if (amountResult.error) errors.push(amountResult.error);

    const description = String(row.raw.description || '').trim();
    if (row.raw.description !== undefined && description.length < 3) errors.push('description too short or missing');

    const paymentMode = String(row.raw.paymentMode || 'CASH').trim().toUpperCase();
    if (row.raw.paymentMode && !PAYMENT_MODES.includes(paymentMode)) errors.push(`unknown payment mode "${row.raw.paymentMode}"`);

    results.push({
      rowNumber: row.rowNumber,
      raw: row.raw,
      valid: errors.length === 0,
      errors,
      normalized: errors.length === 0 ? { siteId: site._id, categoryId: category._id, category, site, expenseDate: dateResult.date, amountPaise: amountResult.amountPaise, description, merchant: (row.raw.merchant || '').trim(), paymentMode, legacyRowRef: (row.raw.legacyRowRef || '').trim() } : null,
    });
  }
  return results;
}

async function dryRun({ organizationId, fileBuffer }) {
  const text = fileBuffer.toString('utf-8');
  const { rows } = parseCsv(text);
  const lookups = await buildLookups(organizationId);
  const validated = await validateRows(rows, lookups);

  const accepted = validated.filter((r) => r.valid);
  const rejected = validated.filter((r) => !r.valid);
  const acceptedTotalPaise = accepted.reduce((sum, r) => sum + r.normalized.amountPaise, 0);
  const fileChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  return {
    fileChecksum,
    totalRows: rows.length,
    accepted: accepted.map((r) => ({ rowNumber: r.rowNumber, ...r.normalized, amountPaise: r.normalized.amountPaise })),
    rejected: rejected.map((r) => ({ rowNumber: r.rowNumber, raw: r.raw, errors: r.errors })),
    acceptedTotalPaise,
  };
}

// Commits only the rows that passed dry-run validation. Each row is posted in
// its own transaction (one bad row never rolls back the rest of the batch),
// and skips any row already recorded for this exact file (idempotent re-run).
async function commit({ organizationId, fileBuffer, userId, req }) {
  const text = fileBuffer.toString('utf-8');
  const { rows } = parseCsv(text);
  const lookups = await buildLookups(organizationId);
  const validated = await validateRows(rows, lookups);
  const fileChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  const summary = { imported: 0, rejected: 0, possibleDuplicates: 0, alreadyImported: 0, importedTotalPaise: 0, rows: [] };

  for (const row of validated) {
    const rowRef = row.normalized?.legacyRowRef || `row-${row.rowNumber}`;
    // Only a previously *imported* row is skipped — it already has a real
    // ledger entry that must never be posted twice. A previously rejected row
    // is re-validated every run so its reason stays current and a fixed
    // source file can succeed on a later attempt.
    const existing = await ImportRecord.findOne({ organizationId, fileChecksum, rowRef, status: 'IMPORTED' });
    if (existing) {
      summary.alreadyImported += 1;
      summary.rows.push({ rowNumber: row.rowNumber, status: 'ALREADY_IMPORTED' });
      continue;
    }

    if (!row.valid) {
      summary.rejected += 1;
      await ImportRecord.findOneAndUpdate(
        { organizationId, fileChecksum, rowRef },
        { $set: { status: 'REJECTED', reason: row.errors.join('; '), rawRow: row.raw, createdBy: userId } },
        { upsert: true }
      );
      summary.rows.push({ rowNumber: row.rowNumber, status: 'REJECTED', reason: row.errors.join('; ') });
      continue;
    }

    const n = row.normalized;
    const session = await mongoose.startSession();
    try {
      let outcome = null;
      await session.withTransaction(async () => {
        const fundAccount = await fundService.getActiveFundAccount(n.siteId, organizationId);
        if (!fundAccount) {
          outcome = { status: 'REJECTED', reason: 'no active fund account for site' };
          return;
        }
        const period = await fundService.getOpenPeriod(fundAccount._id);
        if (!period) {
          outcome = { status: 'REJECTED', reason: 'no open fund period for site' };
          return;
        }
        const balance = await fundService.computeBalance(period._id);
        if (balance.available - n.amountPaise < 0) {
          outcome = { status: 'REJECTED', reason: 'insufficient available balance to post this row' };
          return;
        }

        const dupes = await Expense.find({
          organizationId,
          siteId: n.siteId,
          expenseDate: n.expenseDate,
          amountPaise: n.amountPaise,
          status: { $ne: EXPENSE_STATUS.REJECTED },
        }).session(session);
        const isDuplicate = dupes.some((d) => d.description.trim().toLowerCase() === n.description.toLowerCase());

        const expenseNumber = await nextExpenseNumber(organizationId, session);
        const [expense] = await Expense.create(
          [
            {
              organizationId,
              siteId: n.siteId,
              fundAccountId: fundAccount._id,
              fundPeriodId: period._id,
              expenseNumber,
              status: EXPENSE_STATUS.APPROVED,
              expenseDate: n.expenseDate,
              categoryId: n.categoryId,
              categorySnapshot: { name: n.category.name, code: n.category.code },
              description: n.description,
              merchant: n.merchant,
              amountPaise: n.amountPaise,
              paymentMode: n.paymentMode,
              paidByUserId: userId,
              notes: isDuplicate ? 'Imported from legacy sheet (flagged as a possible duplicate at import time).' : 'Imported from legacy sheet.',
              submittedAt: new Date(),
              approvedAt: new Date(),
              approvedBy: userId,
              createdBy: userId,
              updatedBy: userId,
            },
          ],
          { session }
        );

        const [ledgerEntry] = await FundLedgerEntry.create(
          [{ organizationId, siteId: n.siteId, fundAccountId: fundAccount._id, fundPeriodId: period._id, type: LEDGER_ENTRY_TYPE.EXPENSE_POSTED, amountPaise: -n.amountPaise, relatedExpenseId: expense._id, reason: 'Legacy sheet import', createdBy: userId }],
          { session }
        );
        expense.ledgerEntryId = ledgerEntry._id;
        await expense.save({ session });

        await ExpenseApprovalAction.create([{ organizationId, expenseId: expense._id, action: 'SUBMIT', actorId: userId, toStatus: EXPENSE_STATUS.PENDING_APPROVAL }], { session });
        await ExpenseApprovalAction.create([{ organizationId, expenseId: expense._id, action: 'APPROVE', actorId: userId, reason: 'Imported from legacy sheet', fromStatus: EXPENSE_STATUS.PENDING_APPROVAL, toStatus: EXPENSE_STATUS.APPROVED }], { session });
        await recordAudit({ organizationId, actorId: userId, action: 'EXPENSE_IMPORT', entityType: 'Expense', entityId: expense._id, after: expense.toObject(), req, session });
        await ImportRecord.create([{ organizationId, fileChecksum, rowRef, status: 'IMPORTED', expenseId: expense._id, rawRow: row.raw, createdBy: userId }], { session });

        outcome = { status: 'IMPORTED', expenseId: expense._id, isDuplicate };
      });

      if (outcome.status === 'IMPORTED') {
        summary.imported += 1;
        summary.importedTotalPaise += n.amountPaise;
        if (outcome.isDuplicate) summary.possibleDuplicates += 1;
        summary.rows.push({ rowNumber: row.rowNumber, status: 'IMPORTED', expenseId: outcome.expenseId, possibleDuplicate: outcome.isDuplicate });
      } else {
        summary.rejected += 1;
        await ImportRecord.findOneAndUpdate(
          { organizationId, fileChecksum, rowRef },
          { $set: { status: 'REJECTED', reason: outcome.reason, rawRow: row.raw, createdBy: userId } },
          { upsert: true }
        );
        summary.rows.push({ rowNumber: row.rowNumber, status: 'REJECTED', reason: outcome.reason });
      }
    } finally {
      session.endSession();
    }
  }

  return summary;
}

module.exports = { parseCsv, normalizeDate, normalizeAmount, dryRun, commit };
