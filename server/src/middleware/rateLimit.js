const rateLimit = require('express-rate-limit');

/**
 * Shared response for any limit breach.
 * Deliberately vague - we do not confirm which limit was hit.
 */
function limitReached(req, res) {
  return res.status(429).json({
    error: 'Too many requests. Please wait and try again.',
  });
}

/**
 * Strict limiter for sign-in.
 *
 * Keyed on IP + email together, not IP alone. Keying on IP only would
 * let one attacker on a shared network lock out every user behind it,
 * turning our own control into a denial-of-service tool.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : 'anonymous';
    return `${req.ip}|${email}`;
  },
  handler: limitReached,
});

/**
 * Registration limiter - blocks automated account farming.
 * Keyed on IP alone, since there is no account to target yet.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limitReached,
});

/**
 * Baseline limiter applied to the whole API.
 * Generous enough for normal browsing, tight enough to blunt scraping
 * and automated scanning.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limitReached,
});

module.exports = { loginLimiter, registerLimiter, globalLimiter };