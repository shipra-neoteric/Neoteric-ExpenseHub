const router = require('express').Router();
const publicAttachmentController = require('../controllers/publicAttachmentController');

// No requireAuth on this router — see publicAttachmentController for why.
router.get('/attachments/:attachmentId', publicAttachmentController.download);

module.exports = router;
