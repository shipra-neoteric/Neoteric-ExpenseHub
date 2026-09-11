const router = require('express').Router();
const expenseController = require('../controllers/expenseController');
const attachmentController = require('../controllers/attachmentController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { requireSiteAccess } = require('../middleware/siteScope');
const validate = require('../middleware/validate');
const upload = require('../config/upload');
const { PERMISSIONS } = require('../config/constants');
const {
  expenseCreateSchema,
  expenseUpdateSchema,
  submitSchema,
  reasonSchema,
} = require('../validators/schemas');

router.use(requireAuth);

router.get('/', requirePermission(PERMISSIONS.VIEW), expenseController.list);
router.get('/:id', requirePermission(PERMISSIONS.VIEW), expenseController.getOne);

router.post(
  '/',
  requirePermission(PERMISSIONS.CREATE),
  validate(expenseCreateSchema),
  requireSiteAccess((req) => req.body.siteId),
  expenseController.createDraft
);

router.patch('/:id', requirePermission(PERMISSIONS.EDIT_OWN_DRAFT), validate(expenseUpdateSchema), expenseController.update);
router.post('/:id/submit', requirePermission(PERMISSIONS.SUBMIT), validate(submitSchema), expenseController.submit);
router.delete('/:id', requirePermission(PERMISSIONS.EDIT_OWN_DRAFT), expenseController.remove);

router.post('/:id/approve', requirePermission(PERMISSIONS.APPROVE), expenseController.approve);
router.post('/:id/return', requirePermission(PERMISSIONS.REJECT_RETURN), validate(reasonSchema), expenseController.returnForCorrection);
router.post('/:id/reject', requirePermission(PERMISSIONS.REJECT_RETURN), validate(reasonSchema), expenseController.reject);
router.post('/:id/void', requirePermission(PERMISSIONS.VOID), validate(reasonSchema), expenseController.voidExpense);

router.post('/:expenseId/attachments', requirePermission(PERMISSIONS.CREATE), upload.single('file'), attachmentController.upload);
router.get('/:expenseId/attachments/:attachmentId', requirePermission(PERMISSIONS.VIEW), attachmentController.download);
router.delete('/:expenseId/attachments/:attachmentId', requirePermission(PERMISSIONS.EDIT_OWN_DRAFT), attachmentController.remove);

module.exports = router;
