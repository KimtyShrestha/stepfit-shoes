const bcrypt = require('bcryptjs');

// --- Policy configuration ---------------------------------------
const MIN_LENGTH = 12;

// bcrypt only reads the first 72 BYTES of a password and silently
// ignores the rest. Rejecting anything longer is safer than letting
// a user believe their 200-character passphrase is fully used.
const MAX_LENGTH = 72;

// Cost factor. Each +1 doubles the hashing time, making offline
// cracking of a stolen database twice as slow. 12 is the current
// practical baseline (roughly 200-300ms per hash).
const BCRYPT_ROUNDS = 12;

// The number of previous passwords a user may not reuse.
const HISTORY_DEPTH = 5;

// A small blocklist of passwords that pass complexity rules on paper
// but appear in every breach corpus.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd',
  'qwerty123', 'admin123', 'welcome123', 'letmein123', 'iloveyou1',
  'abc123456', '123456789', 'football1', 'monkey123', 'dragon123',
  'sunshine1', 'princess1', 'shoes123', 'stepfit123',
]);

/**
 * Checks a password against the policy.
 * Returns every failure at once so the user can fix them in one go,
 * rather than discovering rules one at a time.
 */
function validatePassword(password, context = {}) {
  const errors = [];

  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, errors: ['Password is required.'], score: 0, strength: 'unacceptable' };
  }

  // --- Length ---
  if (password.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters long.`);
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_LENGTH) {
    errors.push(`Password must be no longer than ${MAX_LENGTH} bytes.`);
  }

  // --- Complexity ---
  if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter.');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter.');
  if (!/[0-9]/.test(password)) errors.push('Password must contain a number.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must contain a symbol.');

  // --- Whitespace at the edges causes silent login failures later ---
  if (password !== password.trim()) {
    errors.push('Password must not begin or end with a space.');
  }

  const lower = password.toLowerCase();

  // --- Known-weak passwords ---
  if (COMMON_PASSWORDS.has(lower)) {
    errors.push('This password is too common. Choose something less predictable.');
  }

  // --- Must not contain the user's own details ---
  if (context.email) {
    const localPart = String(context.email).split('@')[0].toLowerCase();
    if (localPart.length >= 3 && lower.includes(localPart)) {
      errors.push('Password must not contain your email address.');
    }
  }
  if (context.fullName) {
    for (const namePart of String(context.fullName).toLowerCase().split(/\s+/)) {
      if (namePart.length >= 3 && lower.includes(namePart)) {
        errors.push('Password must not contain your name.');
        break;
      }
    }
  }

  // --- Repetition and simple sequences ---
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password must not repeat the same character three times in a row.');
  }
  if (/(abc|bcd|cde|def|123|234|345|456|567|678|789|qwe|wer|ert|asd)/.test(lower)) {
    errors.push('Password must not contain simple sequences such as "abc" or "123".');
  }

  const { score, strength } = scorePassword(password);

  return { valid: errors.length === 0, errors, score, strength };
}

/**
 * Produces the strength feedback shown to the user as they type.
 * This is guidance, not enforcement - the rules above are what
 * actually gate registration.
 */
function scorePassword(password) {
  let score = 0;

  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 20) score += 1;

  let variety = 0;
  if (/[a-z]/.test(password)) variety += 1;
  if (/[A-Z]/.test(password)) variety += 1;
  if (/[0-9]/.test(password)) variety += 1;
  if (/[^A-Za-z0-9]/.test(password)) variety += 1;
  score += variety;

  // Reward genuine variety of characters used.
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= 10) score += 1;

  if (COMMON_PASSWORDS.has(password.toLowerCase())) score = 0;

  const labels = ['unacceptable', 'very weak', 'weak', 'fair', 'good', 'strong', 'very strong'];
  const capped = Math.min(score, labels.length - 1);

  return { score: capped, strength: labels[capped] };
}

/** Turns a plaintext password into a bcrypt hash. */
async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Checks a plaintext password against a stored hash. */
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = {
  validatePassword,
  scorePassword,
  hashPassword,
  verifyPassword,
  MIN_LENGTH,
  MAX_LENGTH,
  BCRYPT_ROUNDS,
  HISTORY_DEPTH,
};