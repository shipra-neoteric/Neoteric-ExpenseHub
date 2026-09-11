const router = require('express').Router();
const categoryController = require('../controllers/categoryController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { PERMISSIONS } = require('../config/constants');
const { categoryCreateSchema } = require('../validators/schemas');

router.use(requireAuth);

router.get('/', requirePermission(PERMISSIONS.VIEW), categoryController.list);
router.post('/', requirePermission(PERMISSIONS.MASTER_MANAGE), validate(categoryCreateSchema), categoryController.create);
router.patch('/:id', requirePermission(PERMISSIONS.MASTER_MANAGE), categoryController.update);

module.exports = router;
