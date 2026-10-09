const router = require('express').Router();
const adminController = require('../controllers/adminController');
const requireAutomationSecret = require('../middleware/requireAutomationSecret');

// Machine-to-machine only — see requireAutomationSecret. Intended to be hit
// by an external scheduler (GitHub Actions cron, cron-job.org, etc.) once a
// day; see DEPLOYMENT.md for the exact setup.
router.post('/monthly-rollover', requireAutomationSecret, adminController.runMonthlyRolloverForAllOrganizations);

// Hit daily by the same external scheduler; internally a no-op on every day
// except the last day of the month (see isLastDayOfMonth in the controller).
router.post('/month-end-summary', requireAutomationSecret, adminController.runMonthEndSummaryForAllOrganizations);

// One-time data fix — see the controller for why this exists. Safe to call
// more than once (no-ops after the first successful run).
router.post('/fix-garden-city-october-topup', requireAutomationSecret, adminController.fixGardenCityOctoberTopUp);

// Generic one-time catch-up for any site whose rollover ran before the
// top-up-cap fix was deployed. ?site=<name> required. Safe to call
// repeatedly — a site already correct is reported as such and left alone.
router.post('/reconcile-site-topup', requireAutomationSecret, adminController.reconcileSiteTopUp);

// One-time data fix — see the controller for why this exists.
router.post('/remove-nature-park-bridge-topup', requireAutomationSecret, adminController.removeNatureParkBridgeTopUp);

module.exports = router;
