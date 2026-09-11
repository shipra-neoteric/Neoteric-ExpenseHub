const router = require('express').Router();
const multer = require('multer');
const importController = require('../controllers/importController');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/constants');

// CSV files only, kept in memory (never written to the receipts upload dir) —
// small legacy sheets, not the multi-MB receipt attachments.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.use(requireAuth, requirePermission(PERMISSIONS.MASTER_MANAGE, PERMISSIONS.FUND_MANAGE));

router.post('/dry-run', upload.single('file'), importController.dryRun);
router.post('/commit', upload.single('file'), importController.commit);

module.exports = router;
