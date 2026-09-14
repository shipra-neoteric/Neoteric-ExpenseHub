const crypto = require('crypto');
const env = require('../config/env');

// Short-lived, HMAC-signed access to one attachment for contexts with no
// logged-in browser session — specifically, Slack's own servers fetching a
// receipt image to render it inline in a DM. Never a substitute for the
// normal authenticated download route; this only ever grants read access to
// exactly the one attachment the token was minted for, and only briefly.
function signAttachmentToken(attachmentId, expiresInMs = 24 * 60 * 60 * 1000) {
  const expires = Date.now() + expiresInMs;
  const payload = `${attachmentId}.${expires}`;
  const sig = crypto.createHmac('sha256', env.jwt.accessSecret).update(payload).digest('hex');
  return `${expires}.${sig}`;
}

function verifyAttachmentToken(attachmentId, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [expiresStr, sig] = token.split('.');
  const expires = parseInt(expiresStr, 10);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const payload = `${attachmentId}.${expires}`;
  const expected = crypto.createHmac('sha256', env.jwt.accessSecret).update(payload).digest('hex');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { signAttachmentToken, verifyAttachmentToken };
