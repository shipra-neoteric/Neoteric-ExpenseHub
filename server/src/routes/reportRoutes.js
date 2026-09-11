const router = require('express').Router();
const reportController = require('../controllers/reportController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/constants');

router.use(requireAuth, requirePermission(PERMISSIONS.REPORT_EXPORT));

router.get('/summary', reportController.summary);
router.get('/export.csv', reportController.exportCsv);
router.get('/export.pdf', reportController.exportPdf);

module.exports = router;
