const express = require('express');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const { query } = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');
const { verifyPassword } = require('../utils/password');
const { requireAuth } = require('../middleware/auth');
const { mfaLimiter } = require('../middleware/rateLimit');
const {
  verifyToken,
  signToken,
  setSessionCookie,
  clearMfaPendingCookie,
  MFA_COOKIE_NAME,
} = require('../utils/jwt');

const router = express.Router();

// Accepts codes from one step either side of now (±30 seconds),
// tolerating minor clock drift on the user's device.
const TOTP_WINDOW = 1;

/** Records an MFA-related event without logging any secret material. */
async function logMfa(userId, action, status, req, reason) {
  await query(
    `INSERT INTO activity_logs (user_id, action, status, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      action,
      status,
      req.ip,
      (req.get('user-agent') || '').slice(0, 500),
      JSON.stringify({ reason: reason || null }),
    ]
  );
}

/**
 * POST /api/auth/mfa/setup
 * Generates a secret and returns a QR code for enrolment.
 * MFA is NOT enabled until the user proves they can generate a code.
 */
router.post('/setup', requireAuth, async (req, res) => {
  try {
    if (req.user.mfa_enabled) {
      return res.status(409).json({ error: 'Multi-factor authentication is already enabled.' });
    }

    const secret = speakeasy.generateSecret({
      name: `StepFit Shoes (${req.user.email})`,
      length: 20,
    });

    // Stored encrypted, and only provisionally - mfa_enabled stays false.
    await query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [
      encrypt(secret.base32),
      req.user.id,
    ]);

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    await logMfa(req.user.id, 'MFA_SETUP_STARTED', 'success', req);

    return res.json({
      message: 'Scan this QR code with your authenticator app, then confirm with a code.',
      qrCode: qrDataUrl,
      manualEntryKey: secret.base32,
    });
  } catch (err) {
    console.error('[mfa:setup]', err.message);
    return res.status(500).json({ error: 'Could not start MFA setup.' });
  }
});

/**
 * POST /api/auth/mfa/verify-setup
 * Confirms enrolment by checking the user's first code.
 */
router.post('/verify-setup', requireAuth, mfaLimiter, async (req, res) => {
  try {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'A six-digit code is required.' });
    }

    const result = await query('SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1', [
      req.user.id,
    ]);
    const row = result.rows[0];

    if (!row?.mfa_secret) {
      return res.status(400).json({ error: 'No pending MFA setup found. Start setup first.' });
    }
    if (row.mfa_enabled) {
      return res.status(409).json({ error: 'Multi-factor authentication is already enabled.' });
    }

    const valid = speakeasy.totp.verify({
      secret: decrypt(row.mfa_secret),
      encoding: 'base32',
      token: code,
      window: TOTP_WINDOW,
    });

    if (!valid) {
      await logMfa(req.user.id, 'MFA_SETUP_FAILED', 'failure', req, 'invalid_code');
      return res.status(401).json({ error: 'Invalid code. Please try again.' });
    }

    await query('UPDATE users SET mfa_enabled = TRUE WHERE id = $1', [req.user.id]);
    await logMfa(req.user.id, 'MFA_ENABLED', 'success', req);

    return res.json({ message: 'Multi-factor authentication is now enabled.' });
  } catch (err) {
    console.error('[mfa:verify-setup]', err.message);
    return res.status(500).json({ error: 'Could not complete MFA setup.' });
  }
});

/**
 * POST /api/auth/mfa/challenge
 * Second step of sign-in. Exchanges the pending-MFA cookie for a
 * real session once a valid code is supplied.
 */
router.post('/challenge', mfaLimiter, async (req, res) => {
  try {
    const pending = req.cookies?.[MFA_COOKIE_NAME];
    if (!pending) {
      return res.status(401).json({ error: 'No pending sign-in. Please start again.' });
    }

    let claims;
    try {
      claims = verifyToken(pending);
    } catch {
      return res.status(401).json({ error: 'Sign-in expired. Please start again.' });
    }

    // Only a pending-MFA token is acceptable here.
    if (claims.scope !== 'mfa_pending') {
      return res.status(401).json({ error: 'Invalid sign-in state.' });
    }

    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'A six-digit code is required.' });
    }

    const result = await query(
      `SELECT id, email, full_name, role, token_version, mfa_secret, mfa_enabled
       FROM users WHERE id = $1`,
      [claims.sub]
    );
    const user = result.rows[0];

    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      return res.status(401).json({ error: 'Invalid sign-in state.' });
    }

    const valid = speakeasy.totp.verify({
      secret: decrypt(user.mfa_secret),
      encoding: 'base32',
      token: code,
      window: TOTP_WINDOW,
    });

    if (!valid) {
      await logMfa(user.id, 'MFA_CHALLENGE', 'failure', req, 'invalid_code');
      return res.status(401).json({ error: 'Invalid code. Please try again.' });
    }

    // Second factor satisfied - issue the real session.
    clearMfaPendingCookie(res);
    setSessionCookie(res, signToken(user));

    await logMfa(user.id, 'MFA_CHALLENGE', 'success', req);

    return res.json({
      message: 'Signed in successfully.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        mfaEnabled: true,
      },
    });
  } catch (err) {
    console.error('[mfa:challenge]', err.message);
    return res.status(500).json({ error: 'Sign-in failed. Please try again.' });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Requires BOTH the current password and a valid code.
 */
router.post('/disable', requireAuth, mfaLimiter, async (req, res) => {
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';

    if (!password || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Password and a six-digit code are required.' });
    }

    const result = await query(
      'SELECT password_hash, mfa_secret, mfa_enabled FROM users WHERE id = $1',
      [req.user.id]
    );
    const row = result.rows[0];

    if (!row?.mfa_enabled) {
      return res.status(409).json({ error: 'Multi-factor authentication is not enabled.' });
    }

    const passwordOk = await verifyPassword(password, row.password_hash);
    const codeOk = speakeasy.totp.verify({
      secret: decrypt(row.mfa_secret),
      encoding: 'base32',
      token: code,
      window: TOTP_WINDOW,
    });

    // Both factors must pass. A single generic message avoids
    // revealing which one failed.
    if (!passwordOk || !codeOk) {
      await logMfa(req.user.id, 'MFA_DISABLE', 'failure', req, 'invalid_credentials');
      return res.status(401).json({ error: 'Verification failed.' });
    }

    // Clear the secret entirely, and invalidate every existing session
    // since the account's security level has changed.
    await query(
      `UPDATE users
       SET mfa_enabled = FALSE, mfa_secret = NULL, token_version = token_version + 1
       WHERE id = $1`,
      [req.user.id]
    );

    await logMfa(req.user.id, 'MFA_DISABLE', 'success', req);

    return res.json({ message: 'Multi-factor authentication disabled. Please sign in again.' });
  } catch (err) {
    console.error('[mfa:disable]', err.message);
    return res.status(500).json({ error: 'Could not disable MFA.' });
  }
});

module.exports = router;