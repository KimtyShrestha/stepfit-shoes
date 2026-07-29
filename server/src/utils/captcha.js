const crypto = require('crypto');

const TTL_MS = 5 * 60 * 1000;
const FAILURE_THRESHOLD = 3;

/**
 * Tracks recent authentication failures per source address.
 *
 * Deliberately keyed on IP rather than on the target account: keying on
 * the account would mean a CAPTCHA appears only for addresses that
 * exist, turning the control itself into a user enumeration oracle.
 */
const failures = new Map();

function recordFailure(ip) {
  const entry = failures.get(ip) || { count: 0, firstSeen: Date.now() };
  entry.count += 1;
  failures.set(ip, entry);
}

function clearFailures(ip) {
  failures.delete(ip);
}

function isRequired(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;

  // Expire stale entries so a legitimate user is not penalised
  // indefinitely for old mistakes.
  if (Date.now() - entry.firstSeen > 15 * 60 * 1000) {
    failures.delete(ip);
    return false;
  }

  return entry.count >= FAILURE_THRESHOLD;
}

/**
 * Issues an arithmetic challenge.
 *
 * The expected answer never leaves the server in readable form. It is
 * carried in an HMAC over the answer plus a nonce and expiry, so the
 * token is stateless yet unforgeable, and cannot be replayed after it
 * expires.
 */
function issueChallenge() {
  const a = crypto.randomInt(3, 12);
  const b = crypto.randomInt(3, 12);
  const answer = a + b;
  const nonce = crypto.randomBytes(9).toString('hex');
  const expires = Date.now() + TTL_MS;

  return {
    question: `What is ${a} plus ${b}?`,
    token: `${nonce}.${expires}.${sign(answer, nonce, expires)}`,
  };
}

function sign(answer, nonce, expires) {
  return crypto
    .createHmac('sha256', process.env.COOKIE_SECRET)
    .update(`${answer}:${nonce}:${expires}`)
    .digest('hex');
}

/** Verifies a submitted answer against its token. */
function verifyChallenge(token, submittedAnswer) {
  if (typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [nonce, expiresRaw, providedMac] = parts;
  const expires = Number.parseInt(expiresRaw, 10);

  if (!Number.isInteger(expires) || Date.now() > expires) return false;

  const answer = Number.parseInt(submittedAnswer, 10);
  if (!Number.isInteger(answer)) return false;

  const expectedMac = sign(answer, nonce, expires);

  // Constant-time comparison. A naive === leaks how many leading bytes
  // matched through response timing, which allows a MAC to be forged
  // byte by byte.
  const a = Buffer.from(providedMac, 'hex');
  const b = Buffer.from(expectedMac, 'hex');
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  recordFailure,
  clearFailures,
  isRequired,
  issueChallenge,
  verifyChallenge,
  FAILURE_THRESHOLD,
};