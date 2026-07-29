const jwt = require('jsonwebtoken');

// Short lifetime. A stolen token is only useful for this long.
const TOKEN_TTL = '30m';

const COOKIE_NAME = 'stepfit_session';

/**
 * Builds a signed token describing who the user is.
 *
 * tokenVersion is the revocation mechanism: it is copied from the
 * user's row at sign-in and re-checked on every request. Incrementing
 * the database value instantly invalidates every token issued before.
 */
function signToken(user) {
  const payload = {
    sub: user.id,
    role: user.role,
    tokenVersion: user.token_version,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL,
    algorithm: 'HS256',
    issuer: 'stepfit-api',
    audience: 'stepfit-client',
  });
}

/**
 * Verifies a token's signature and claims.
 * Throws if the token is expired, tampered with, or not ours.
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    // Pinning the algorithm is essential. Without it, an attacker can
    // supply a token with "alg":"none" and the library may accept it
    // unsigned. This is a well-known JWT attack class.
    algorithms: ['HS256'],
    issuer: 'stepfit-api',
    audience: 'stepfit-client',
  });
}

/** Attaches the token to the response as a hardened cookie. */
function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    // JavaScript cannot read this cookie. If an XSS flaw ever exists,
    // the attacker still cannot steal the session token.
    httpOnly: true,

    // Only sent over HTTPS in production.
    secure: process.env.NODE_ENV === 'production',

    // Not sent on cross-site requests, which blocks most CSRF.
    sameSite: 'lax',

    path: '/',
    maxAge: 30 * 60 * 1000, // 30 minutes, matching TOKEN_TTL
  });
}

/** Removes the session cookie on logout. */
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

module.exports = {
  signToken,
  verifyToken,
  setSessionCookie,
  clearSessionCookie,
  COOKIE_NAME,
  TOKEN_TTL,
};