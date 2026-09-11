const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), organizationId: String(user.organizationId), permissions: user.permissions },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: String(user._id) }, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpiresIn });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, hashToken };
