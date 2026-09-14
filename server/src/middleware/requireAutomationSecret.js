const ApiError = require('../utils/ApiError');
const env = require('../config/env');

// Machine-to-machine auth for the scheduled rollover trigger: no human is
// logged in for a cron job, so this checks a static shared secret header
// instead of a user JWT. Never reuse this pattern for anything a browser
// calls — it's deliberately narrow (one automation endpoint only).
module.exports = function requireAutomationSecret(req, res, next) {
  if (!env.automationSecret) {
    throw ApiError.forbidden('Automation endpoint is not configured', 'AUTOMATION_NOT_CONFIGURED');
  }
  const provided = req.headers['x-automation-secret'];
  if (!provided || provided !== env.automationSecret) {
    throw ApiError.unauthorized('Invalid automation secret', 'INVALID_AUTOMATION_SECRET');
  }
  next();
};
