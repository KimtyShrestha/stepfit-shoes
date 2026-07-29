const express = require('express');
const { query, withTransaction } = require('../db');
const { validatePassword, hashPassword, verifyPassword } = require('../utils/password');
const {
  signToken,
  setSessionCookie,
  clearSessionCookie,
  signMfaPendingToken,
  setMfaPendingCookie,
} = require('../utils/jwt');

const { requireAuth } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// --- Account lockout policy ---
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// A valid bcrypt hash of a random string. Used to burn the same amount
// of CPU time when the email does not exist, so response timing cannot
// reveal which accounts are real.
const DUMMY_HASH = '$2b$12$abcdefghijklmnopqrstuuNQtE9jZ5rUZQ1DGKQXQ4hVJq3hZ8Aq';

// Deliberately permissive. Strict RFC-5322 validation rejects valid
// addresses and provides no security benefit - the real check is
// whether a confirmation email arrives.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST /api/auth/register
 * Creates a new customer account.
 */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const body = req.body || {};

    // --- Normalise input -----------------------------------------
    // Only accept strings. If someone posts an object or array here,
    // treating it as a string prevents type-confusion bugs downstream.
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    // --- Validate email ------------------------------------------
    const errors = [];
    if (!email) {
      errors.push('Email is required.');
    } else if (email.length > 255) {
      errors.push('Email is too long.');
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.push('Email format is invalid.');
    }

    // --- Validate name -------------------------------------------
    if (!fullName) {
      errors.push('Full name is required.');
    } else if (fullName.length < 2 || fullName.length > 120) {
      errors.push('Full name must be between 2 and 120 characters.');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    // --- Validate password against the policy --------------------
    const policy = validatePassword(password, { email, fullName });
    if (!policy.valid) {
      return res.status(400).json({
        error: 'Password does not meet the security policy',
        details: policy.errors,
        strength: policy.strength,
      });
    }

    // --- Create the account --------------------------------------
    const user = await withTransaction(async (client) => {
      const passwordHash = await hashPassword(password);

      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, full_name, role, created_at`,
        [email, passwordHash, fullName]
      );
      const created = inserted.rows[0];

      // Store the hash in history so it cannot be reused later.
      await client.query(
        `INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)`,
        [created.id, passwordHash]
      );

      // Audit trail. Note: no password material is recorded.
      await client.query(
        `INSERT INTO activity_logs (user_id, action, status, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          created.id,
          'USER_REGISTERED',
          'success',
          req.ip,
          (req.get('user-agent') || '').slice(0, 500),
        ]
      );

      return created;
    });

    // Note we return the user object built from RETURNING, which
    // never included password_hash. The hash cannot leak by accident.
    return res.status(201).json({
      message: 'Account created successfully. You can now sign in.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    // 23505 is PostgreSQL's unique-constraint violation code.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    console.error('[auth:register]', err.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', loginLimiter, async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const ip = req.ip;
  const userAgent = (req.get('user-agent') || '').slice(0, 500);

  // Records an attempt without leaking credentials into the log.
  const log = async (userId, status, reason) =>
    query(
      `INSERT INTO activity_logs (user_id, action, status, ip_address, user_agent, metadata)
       VALUES ($1, 'LOGIN_ATTEMPT', $2, $3, $4, $5)`,
      [userId, status, ip, userAgent, JSON.stringify({ reason, email })]
    );

  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await query(
      `SELECT id, email, full_name, password_hash, role, token_version,
              mfa_enabled, failed_login_attempts, lock_until
       FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];

    // --- Unknown account -----------------------------------------
    if (!user) {
      // Still run bcrypt so the response takes the same time as a
      // real account with a wrong password.
      await verifyPassword(password, DUMMY_HASH);
      await log(null, 'failure', 'unknown_account');
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // --- Locked out ----------------------------------------------
    if (user.lock_until && new Date(user.lock_until) > new Date()) {
      const secondsLeft = Math.ceil((new Date(user.lock_until) - new Date()) / 1000);
      await log(user.id, 'failure', 'account_locked');
      return res.status(423).json({
        error: 'Account temporarily locked due to repeated failed sign-in attempts.',
        retryAfterSeconds: secondsLeft,
      });
    }

    // --- Wrong password ------------------------------------------
    const passwordOk = await verifyPassword(password, user.password_hash);

    if (!passwordOk) {
      // A single atomic statement: increment, and lock if the
      // threshold is reached. Doing this in one UPDATE avoids the
      // read-then-write race where parallel requests overwrite
      // each other's counter.
      await query(
        `UPDATE users
         SET failed_login_attempts = failed_login_attempts + 1,
             lock_until = CASE
               WHEN failed_login_attempts + 1 >= $2
               THEN NOW() + ($3 || ' minutes')::interval
               ELSE lock_until
             END
         WHERE id = $1`,
        [user.id, MAX_FAILED_ATTEMPTS, String(LOCKOUT_MINUTES)]
      );

      await log(user.id, 'failure', 'bad_password');
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // --- Success: reset counters ---------------------------------
    await query(
      `UPDATE users
       SET failed_login_attempts = 0, lock_until = NULL
       WHERE id = $1`,
      [user.id]
    );

  // --- Second factor required? ---------------------------------
    if (user.mfa_enabled) {
      // Password is correct, but this token cannot access anything.
      // It only permits a call to /api/auth/mfa/challenge.
      setMfaPendingCookie(res, signMfaPendingToken(user));
      await log(user.id, 'success', 'password_ok_mfa_required');

      return res.json({
        message: 'Password accepted. Enter your authenticator code to continue.',
        mfaRequired: true,
      });
    }

    const token = signToken(user);
    setSessionCookie(res, token);

    await log(user.id, 'success', 'password_ok');
    

    return res.json({
      message: 'Signed in successfully.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        mfaEnabled: user.mfa_enabled,
      },
    });
  } catch (err) {
    console.error('[auth:login]', err.message);
    return res.status(500).json({ error: 'Sign-in failed. Please try again.' });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    clearSessionCookie(res);
    await query(
      `INSERT INTO activity_logs (user_id, action, status, ip_address, user_agent)
       VALUES ($1, 'LOGOUT', 'success', $2, $3)`,
      [req.user.id, req.ip, (req.get('user-agent') || '').slice(0, 500)]
    );
    return res.json({ message: 'Signed out successfully.' });
  } catch (err) {
    console.error('[auth:logout]', err.message);
    return res.status(500).json({ error: 'Sign-out failed.' });
  }
});

/**
 * GET /api/auth/me
 * Returns the current session's user. Used by the frontend on load.
 */
router.get('/me', requireAuth, (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      fullName: req.user.full_name,
      role: req.user.role,
      mfaEnabled: req.user.mfa_enabled,
    },
  });
});

module.exports = router;