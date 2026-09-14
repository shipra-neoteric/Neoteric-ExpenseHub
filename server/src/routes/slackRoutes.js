const router = require('express').Router();
const slackController = require('../controllers/slackController');

// No requireAuth: Slack's own servers call this, authenticated instead via
// the request-signature check inside the controller. Body arrives as a raw
// Buffer (see app.js) so that check can verify the exact bytes Slack signed.
router.post('/interactions', slackController.handleInteraction);

module.exports = router;
