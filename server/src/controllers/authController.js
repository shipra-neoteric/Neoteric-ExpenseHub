const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } = require('../utils/tokens');
const env = require('../config/env');

const REFRESH_COOKIE = 'eh_refresh';

// In production the client (Vercel) and API (Render) are on different
// domains, so the refresh cookie must be sent cross-site — that requires
// SameSite=None, which browsers only honor when Secure is also set. In local
// dev the client proxies /api through Vite onto the same origin, so the
// stricter Lax (and no Secure, since dev runs over http) is used instead.
function refreshCookieOptions() {
  const crossSite = env.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  const ok = await user.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  res.json({ accessToken, user: user.toSafeJSON() });
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No session', 'NO_REFRESH_TOKEN');
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Session expired', 'REFRESH_INVALID');
  }
  const stored = await RefreshToken.findOne({ userId: payload.sub, tokenHash: hashToken(token), revokedAt: null });
  if (!stored || stored.expiresAt < new Date()) throw ApiError.unauthorized('Session expired', 'REFRESH_EXPIRED');

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not available', 'ACCOUNT_INACTIVE');

  const accessToken = signAccessToken(user);
  res.json({ accessToken, user: user.toSafeJSON() });
});

const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await RefreshToken.updateMany({ tokenHash: hashToken(token) }, { revokedAt: new Date() });
  }
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  res.status(204).send();
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = { login, refresh, logout, me };
