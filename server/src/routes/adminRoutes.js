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

// One-time test-data cleanup — see the controller for why this exists.
// ?expenseNumber=<e.g. EXP-2026-000120> required. Safe to call repeatedly.
router.post('/delete-test-expense', requireAutomationSecret, adminController.deleteTestExpense);

// One-time rename — see the controller for why this exists.
// ?from=<old name>&to=<new name> required. Safe to call repeatedly.
router.post('/rename-site', requireAutomationSecret, adminController.renameSite);

// Read-only — see the controller. ?site=<name> required.
router.get('/site-status', requireAutomationSecret, adminController.siteStatus);

module.exports = router;
