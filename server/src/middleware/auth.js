const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/tokens');

const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired session', 'TOKEN_INVALID');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not available', 'ACCOUNT_INACTIVE');

  // Permissions are re-read from the DB on every request, not trusted from the token,
  // so a permission change or deactivation takes effect immediately.
  req.user = user;
  req.organizationId = String(user.organizationId);
  next();
});

function requirePermission(...permissions) {
  return (req, res, next) => {
    const ok = permissions.some((p) => req.user.hasPermission(p));
    if (!ok) return next(ApiError.forbidden(`Missing permission: ${permissions.join(' or ')}`));
    next();
  };
}

module.exports = { requireAuth, requirePermission };
