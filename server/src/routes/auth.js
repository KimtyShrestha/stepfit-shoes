const express = require('express');
const { query, withTransaction } = require('../db');
const { validatePassword, hashPassword } = require('../utils/password');

const router = express.Router();

// Deliberately permissive. Strict RFC-5322 validation rejects valid
// addresses and provides no security benefit - the real check is
// whether a confirmation email arrives.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST /api/auth/register
 * Creates a new customer account.
 */
router.post('/register', async (req, res) => {
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

module.exports = router;