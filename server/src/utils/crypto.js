const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96 bits, the recommended size for GCM
const TAG_LENGTH = 16;  // 128-bit authentication tag

/**
 * Loads and validates the encryption key from the environment.
 * Read lazily so a missing key fails loudly at first use rather
 * than silently producing broken ciphertext.
 */
function getKey() {
  const hex = process.env.MFA_ENCRYPTION_KEY;

  if (!hex) {
    throw new Error('MFA_ENCRYPTION_KEY is not set.');
  }

  const key = Buffer.from(hex, 'hex');

  // AES-256 requires exactly 32 bytes (64 hex characters).
  if (key.length !== 32) {
    throw new Error('MFA_ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
  }

  return key;
}

/**
 * Encrypts a string using AES-256-GCM.
 * Output format:  <iv>:<authTag>:<ciphertext>   (all hex)
 */
function encrypt(plaintext) {
  const key = getKey();

  // A fresh random IV per encryption. Reusing an IV with GCM is
  // catastrophic - it allows recovery of the plaintext.
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypts a value produced by encrypt().
 * Throws if the ciphertext has been tampered with.
 */
function decrypt(payload) {
  const key = getKey();

  const parts = String(payload).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed ciphertext.');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const ciphertext = Buffer.from(parts[2], 'hex');

  if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH) {
    throw new Error('Malformed ciphertext.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  // This is what makes GCM "authenticated" encryption: if a single
  // bit of the ciphertext was altered, final() throws instead of
  // returning corrupted plaintext.
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };