const router = require('express').Router();
const assignmentController = require('../controllers/assignmentController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { PERMISSIONS } = require('../config/constants');
const { assignmentCreateSchema } = require('../validators/schemas');

router.use(requireAuth, requirePermission(PERMISSIONS.USER_SCOPE_MANAGE));

router.get('/', assignmentController.list);
router.post('/', validate(assignmentCreateSchema), assignmentController.create);
router.post('/:id/deactivate', assignmentController.deactivate);

module.exports = router;
