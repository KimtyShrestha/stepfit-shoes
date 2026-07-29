const { query } = require('../db');
const { verifyToken, COOKIE_NAME } = require('../utils/jwt');

/**
 * Rejects the request unless a valid session cookie is present.
 * On success, attaches req.user for downstream handlers.
 */
async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  let claims;
  try {
    claims = verifyToken(token);
  } catch (err) {
    // Expired, tampered, or forged - all get the same generic reply.
    return res.status(401).json({ error: 'Session invalid or expired.' });
  }
  // A pending-MFA token is NOT a session. Reject it here so the
  // second factor cannot be bypassed by reusing the interim token.
  if (claims.scope !== 'session') {
    return res.status(401).json({ error: 'Session invalid or expired.' });
  }

  // The token proves what was true at sign-in. We re-read the user
  // every request so that role changes and revocations take effect
  // immediately rather than waiting for the token to expire.
  const result = await query(
    `SELECT id, email, full_name, role, token_version, mfa_enabled
     FROM users WHERE id = $1`,
    [claims.sub]
  );

  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Session invalid or expired.' });
  }

  // The revocation check.
  if (user.token_version !== claims.tokenVersion) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }

  req.user = user;
  next();
}

module.exports = { requireAuth };