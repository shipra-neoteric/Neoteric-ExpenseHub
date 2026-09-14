const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../helpers/db');
const app = require('../../src/app');
const Organization = require('../../src/models/Organization');
const Site = require('../../src/models/Site');
const User = require('../../src/models/User');
const ExpenseCategory = require('../../src/models/ExpenseCategory');
const ExpenseAttachment = require('../../src/models/ExpenseAttachment');
const SiteUserAssignment = require('../../src/models/SiteUserAssignment');
const fundService = require('../../src/services/fundService');
const { ROLE_PRESETS } = require('../../src/config/constants');

beforeAll(async () => db.connect());
afterAll(async () => db.disconnect());
afterEach(async () => db.clearDatabase());

async function setup() {
  const org = await Organization.create({ name: 'Neoteric Properties', code: 'NEOTERIC' });
  const siteA = await Site.create({ organizationId: org._id, code: 'SITE-A', name: 'Site A' });
  const siteB = await Site.create({ organizationId: org._id, code: 'SITE-B', name: 'Site B' });
  await ExpenseCategory.create({ organizationId: org._id, name: 'Pantry & Refreshments', normalizedName: 'pantry & refreshments', code: 'PANTRY' });

  const passwordHash = await bcrypt.hash('Password123!', 10);
  const master = await User.create({ organizationId: org._id, name: 'Master', email: 'master@test.com', passwordHash, roleLabel: 'MASTER_ADMIN', permissions: ROLE_PRESETS.MASTER_ADMIN });
  const frontDesk = await User.create({ organizationId: org._id, name: 'Front Desk', email: 'fd@test.com', passwordHash, roleLabel: 'FRONT_DESK_EXECUTIVE', permissions: ROLE_PRESETS.FRONT_DESK_EXECUTIVE });
  await SiteUserAssignment.create({ organizationId: org._id, userId: frontDesk._id, siteId: siteA._id, isActive: true, createdBy: master._id });

  await fundService.createOpeningAllocation({ organizationId: org._id, siteId: siteA._id, amountPaise: 500000, label: 'API-TEST', startDate: new Date(), userId: master._id });

  return { org, siteA, siteB, master, frontDesk };
}

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
  return res.body.accessToken;
}

describe('HTTP API', () => {
  test('rejects requests with no token', async () => {
    const res = await request(app).get('/api/expenses');
    expect(res.status).toBe(401);
  });

  test('rejects a user acting on a site they are not assigned to', async () => {
    const { siteB, frontDesk } = await setup();
    const token = await loginAs(frontDesk.email);
    const res = await request(app)
      .get('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .query({ siteId: String(siteB._id) });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SITE_ACCESS_DENIED');
  });

  test('a front desk user without master_manage cannot access master-only routes', async () => {
    const { frontDesk } = await setup();
    const token = await loginAs(frontDesk.email);
    const res = await request(app).get('/api/sites').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('front desk can create and submit an expense for their assigned site over HTTP', async () => {
    const { siteA, frontDesk } = await setup();
    const token = await loginAs(frontDesk.email);
    const category = await ExpenseCategory.findOne({ name: 'Pantry & Refreshments' });

    const createRes = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteA._id), expenseDate: new Date().toISOString(), categoryId: String(category._id), description: 'Milk and biscuits', amount: '150.00', paymentMode: 'CASH' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.expense.status).toBe('DRAFT');

    // A receipt is mandatory to submit — inserted directly rather than via
    // the real upload endpoint to keep this test focused and disk-free.
    await ExpenseAttachment.create({
      organizationId: siteA.organizationId,
      expenseId: createRes.body.expense._id,
      storageKey: 'fake-key.jpg',
      originalName: 'receipt.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      checksum: 'fake-checksum',
      uploadedBy: frontDesk._id,
    });

    const submitRes = await request(app).post(`/api/expenses/${createRes.body.expense._id}/submit`).set('Authorization', `Bearer ${token}`).send({});
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.expense.status).toBe('PENDING_APPROVAL');
  });

  test('legacy sheet import dry-run works over multipart HTTP', async () => {
    const { master } = await setup();
    const token = await loginAs(master.email);
    const csv = 'site,expenseDate,category,description,amount\nSITE-A,2026-08-20,Pantry & Refreshments,Milk and biscuits,150.00\nSITE-A,2026-08-21,Pantry & Refreshments,,\n';

    const res = await request(app)
      .post('/api/imports/dry-run')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), { filename: 'legacy.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toHaveLength(1);
    expect(res.body.rejected).toHaveLength(1);
  });

  test('a non-master, non-finance user cannot access the import endpoint', async () => {
    const { frontDesk } = await setup();
    const token = await loginAs(frontDesk.email);
    const res = await request(app)
      .post('/api/imports/dry-run')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('site,expenseDate,category,description,amount\n'), { filename: 'x.csv', contentType: 'text/csv' });
    expect(res.status).toBe(403);
  });
});
