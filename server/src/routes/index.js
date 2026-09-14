const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/sites', require('./siteRoutes'));
router.use('/categories', require('./categoryRoutes'));
router.use('/policies', require('./policyRoutes'));
router.use('/funds', require('./fundRoutes'));
router.use('/expenses', require('./expenseRoutes'));
router.use('/dashboard', require('./dashboardRoutes'));
router.use('/assignments', require('./assignmentRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/reports', require('./reportRoutes'));
router.use('/imports', require('./importRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/slack', require('./slackRoutes'));
router.use('/public', require('./publicRoutes'));

module.exports = router;
