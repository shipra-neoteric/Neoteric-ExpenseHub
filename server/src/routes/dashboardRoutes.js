const router = require('express').Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { requireSiteAccess } = require('../middleware/siteScope');
const { PERMISSIONS } = require('../config/constants');

router.use(requireAuth, requirePermission(PERMISSIONS.VIEW));

router.get('/summary', requireSiteAccess((req) => req.query.siteId), dashboardController.summary);

module.exports = router;
