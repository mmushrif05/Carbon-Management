/**
 * Data Encryption at Rest — AES-256-GCM
 *
 * Encrypts sensitive document content before storing in Firebase.
 * Uses AES-256-GCM (authenticated encryption) with per-record random IVs.
 *
 * Required environment variable:
 *   DATA_ENCRYPTION_KEY — 64-char hex string (32 bytes / 256 bits)
 *   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;         // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;   // 128-bit auth tag

function getEncryptionKey() {
  const keyHex = process.env.DATA_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('DATA_ENCRYPTION_KEY must be a 64-character hex string (256 bits). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt plaintext string → base64 encoded ciphertext
 * Format: base64(IV + AuthTag + Ciphertext)
 */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return plaintext;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: IV (12) + AuthTag (16) + Ciphertext (variable)
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt base64 ciphertext → plaintext string
 */
function decrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;

  const key = getEncryptionKey();
  const packed = Buffer.from(ciphertext, 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Check if encryption is configured and available
 */
function isEncryptionEnabled() {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt an object's specified fields in-place
 * Returns a new object with encrypted values
 */
function encryptFields(obj, fields) {
  if (!isEncryptionEnabled()) return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = encrypt(result[field]);
      result[field + '_encrypted'] = true;
    }
  }
  return result;
}

/**
 * Decrypt an object's specified fields
 * Returns a new object with decrypted values
 */
function decryptFields(obj, fields) {
  if (!isEncryptionEnabled()) return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] && result[field + '_encrypted']) {
      result[field] = decrypt(result[field]);
      delete result[field + '_encrypted'];
    }
  }
  return result;
}

module.exports = {
  encrypt,
  decrypt,
  isEncryptionEnabled,
  encryptFields,
  decryptFields,
};
