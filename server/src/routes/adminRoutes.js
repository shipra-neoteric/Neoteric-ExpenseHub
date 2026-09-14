const router = require('express').Router();
const adminController = require('../controllers/adminController');
const requireAutomationSecret = require('../middleware/requireAutomationSecret');

// Machine-to-machine only — see requireAutomationSecret. Intended to be hit
// by an external scheduler (GitHub Actions cron, cron-job.org, etc.) once a
// day; see DEPLOYMENT.md for the exact setup.
router.post('/monthly-rollover', requireAutomationSecret, adminController.runMonthlyRolloverForAllOrganizations);

module.exports = router;
