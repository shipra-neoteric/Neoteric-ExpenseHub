const router = require('express').Router();
const userController = require('../controllers/userController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { PERMISSIONS } = require('../config/constants');
const { userCreateSchema } = require('../validators/schemas');

router.use(requireAuth, requirePermission(PERMISSIONS.USER_SCOPE_MANAGE));

router.get('/', userController.list);
router.post('/', validate(userCreateSchema), userController.create);
router.patch('/:id', userController.update);
router.delete('/:id', userController.remove);

module.exports = router;
