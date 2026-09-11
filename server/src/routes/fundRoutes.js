const router = require('express').Router();
const fundController = require('../controllers/fundController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { requireSiteAccess } = require('../middleware/siteScope');
const { requireFundPeriodSiteAccess } = require('../middleware/fundPeriodScope');
const validate = require('../middleware/validate');
const { PERMISSIONS } = require('../config/constants');
const { openingAllocationSchema, ledgerMovementSchema, adjustmentSchema, closePeriodSchema } = require('../validators/schemas');

router.use(requireAuth, requirePermission(PERMISSIONS.FUND_VIEW, PERMISSIONS.FUND_MANAGE));

router.get('/periods', requireSiteAccess((req) => req.query.siteId), fundController.listPeriods);
router.get('/periods/:periodId/balance', requireFundPeriodSiteAccess, fundController.getBalance);
router.get('/periods/:periodId/ledger', requireFundPeriodSiteAccess, fundController.getLedger);

router.post(
  '/opening-allocation',
  requirePermission(PERMISSIONS.FUND_MANAGE),
  validate(openingAllocationSchema),
  requireSiteAccess((req) => req.body.siteId),
  fundController.openingAllocation
);
router.post(
  '/periods/:periodId/top-up',
  requirePermission(PERMISSIONS.FUND_MANAGE),
  requireFundPeriodSiteAccess,
  validate(ledgerMovementSchema),
  fundController.topUp
);
router.post(
  '/periods/:periodId/adjustment',
  requirePermission(PERMISSIONS.FUND_MANAGE),
  requireFundPeriodSiteAccess,
  validate(adjustmentSchema),
  fundController.adjustment
);
router.post(
  '/periods/:periodId/close',
  requirePermission(PERMISSIONS.FUND_MANAGE),
  requireFundPeriodSiteAccess,
  validate(closePeriodSchema),
  fundController.closePeriod
);
router.post(
  '/periods/:periodId/reopen',
  requirePermission(PERMISSIONS.MASTER_MANAGE),
  requireFundPeriodSiteAccess,
  fundController.reopenPeriod
);

module.exports = router;
