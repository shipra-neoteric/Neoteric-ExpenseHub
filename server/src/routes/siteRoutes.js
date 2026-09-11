const router = require('express').Router();
const siteController = require('../controllers/siteController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { PERMISSIONS } = require('../config/constants');
const { siteCreateSchema } = require('../validators/schemas');

router.use(requireAuth);

router.get('/mine', requirePermission(PERMISSIONS.VIEW), siteController.listMine);
router.get('/', requirePermission(PERMISSIONS.MASTER_MANAGE), siteController.listAll);
router.post('/', requirePermission(PERMISSIONS.MASTER_MANAGE), validate(siteCreateSchema), siteController.create);
router.patch('/:id', requirePermission(PERMISSIONS.MASTER_MANAGE), siteController.update);

module.exports = router;
