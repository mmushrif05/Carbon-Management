/**
 * Security Middleware — OWASP ASVS Level 2 Compliance
 *
 * Provides:
 * 1. CSRF protection via custom header validation
 * 2. Request correlation IDs for audit traceability
 * 3. Account lockout after repeated failed login attempts
 * 4. Error message sanitization (prevent info leakage)
 * 5. Security event logging for suspicious activities
 */

const crypto = require('crypto');

// ===== REQUEST CORRELATION IDs =====
function generateRequestId() {
  return 'req_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

// ===== CSRF PROTECTION =====
// Validates that the X-Requested-With header is present on state-changing requests.
// CORS preflight prevents cross-origin requests from setting custom headers,
// so this effectively blocks CSRF attacks.
function validateCSRF(event) {
  // Only enforce on state-changing methods
  if (event.httpMethod === 'GET' || event.httpMethod === 'OPTIONS') {
    return { valid: true };
  }

  const requestedWith = event.headers && (
    event.headers['x-requested-with'] ||
    event.headers['X-Requested-With']
  );

  // Accept requests with valid X-Requested-With header
  // Also accept requests with Authorization header (API clients using Bearer tokens)
  const hasAuth = event.headers && (
    event.headers['authorization'] ||
    event.headers['Authorization']
  );

  if (requestedWith === 'CarbonTrackPro' || hasAuth) {
    return { valid: true };
  }

  return {
    valid: false,
    error: 'Invalid request origin'
  };
}

// ===== ACCOUNT LOCKOUT =====
const LOCKOUT_CONFIG = {
  maxFailedAttempts: 5,        // Lock after 5 failed attempts
  lockoutDurationMs: 15 * 60 * 1000, // 15 minute lockout
  trackingWindowMs: 30 * 60 * 1000,  // 30 minute sliding window
};

async function checkAccountLockout(db, identifier) {
  const safePath = identifier.replace(/[.#$\[\]\/]/g, '_');
  const lockoutPath = `_security/lockouts/${safePath}`;

  try {
    const snap = await db.ref(lockoutPath).once('value');
    const data = snap.val();

    if (!data) return { locked: false, attempts: 0 };

    const now = Date.now();

    // Check if currently locked out
    if (data.lockedUntil && data.lockedUntil > now) {
      const remainingMs = data.lockedUntil - now;
      const remainingMin = Math.ceil(remainingMs / 60000);
      return {
        locked: true,
        attempts: data.failedAttempts || 0,
        remainingMinutes: remainingMin,
        error: 'Account temporarily locked. Try again in ' + remainingMin + ' minutes.'
      };
    }

    // If lockout has expired, reset
    if (data.lockedUntil && data.lockedUntil <= now) {
      await db.ref(lockoutPath).remove();
      return { locked: false, attempts: 0 };
    }

    // Check if tracking window has expired
    if (data.windowStart && (now - data.windowStart) > LOCKOUT_CONFIG.trackingWindowMs) {
      await db.ref(lockoutPath).remove();
      return { locked: false, attempts: 0 };
    }

    return { locked: false, attempts: data.failedAttempts || 0 };
  } catch (err) {
    console.error('[SECURITY] Lockout check error:', err.message);
    return { locked: false, attempts: 0 }; // Fail open
  }
}

async function recordFailedAttempt(db, identifier) {
  const safePath = identifier.replace(/[.#$\[\]\/]/g, '_');
  const lockoutPath = `_security/lockouts/${safePath}`;

  try {
    const snap = await db.ref(lockoutPath).once('value');
    const data = snap.val() || { failedAttempts: 0, windowStart: Date.now() };
    const now = Date.now();

    // Reset window if expired
    if (data.windowStart && (now - data.windowStart) > LOCKOUT_CONFIG.trackingWindowMs) {
      data.failedAttempts = 0;
      data.windowStart = now;
    }

    data.failedAttempts = (data.failedAttempts || 0) + 1;
    data.lastFailedAt = now;

    // Trigger lockout if threshold exceeded
    if (data.failedAttempts >= LOCKOUT_CONFIG.maxFailedAttempts) {
      data.lockedUntil = now + LOCKOUT_CONFIG.lockoutDurationMs;
      console.warn('[SECURITY] Account locked out:', identifier, 'after', data.failedAttempts, 'failed attempts');
    }

    await db.ref(lockoutPath).set(data);
    return data;
  } catch (err) {
    console.error('[SECURITY] Record failed attempt error:', err.message);
  }
}

async function clearFailedAttempts(db, identifier) {
  const safePath = identifier.replace(/[.#$\[\]\/]/g, '_');
  try {
    await db.ref(`_security/lockouts/${safePath}`).remove();
  } catch (err) {
    // Non-critical
  }
}

// ===== ERROR MESSAGE SANITIZATION =====
// Prevent leaking internal details in API responses
function sanitizeErrorMessage(error, context) {
  const message = typeof error === 'string' ? error : (error && error.message) || 'Unknown error';

  // Patterns that indicate internal details that should NOT be exposed
  const internalPatterns = [
    /firebase/i,
    /FIREBASE_/,
    /credential/i,
    /service.account/i,
    /database.?url/i,
    /stack\s*trace/i,
    /at\s+\w+\s+\(/,  // Stack trace line
    /node_modules/,
    /internal/i,
    /ECONNREFUSED/,
    /ENOTFOUND/,
    /ETIMEDOUT/,
  ];

  for (const pattern of internalPatterns) {
    if (pattern.test(message)) {
      console.error('[SECURITY] Suppressed internal error in ' + (context || 'unknown') + ':', message);
      return 'An internal error occurred. Please try again or contact support.';
    }
  }

  return message;
}

// ===== SECURITY EVENT LOGGING =====
async function logSecurityEvent(db, event) {
  const eventId = 'sec_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
  try {
    await db.ref('_security/events/' + eventId).set({
      id: eventId,
      type: event.type,           // e.g., 'login_failed', 'lockout_triggered', 'csrf_blocked', 'rate_limited'
      severity: event.severity || 'MEDIUM',  // LOW, MEDIUM, HIGH, CRITICAL
      actor: event.actor || null,  // User ID or IP
      ip: event.ip || null,
      details: event.details || {},
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[SECURITY] Failed to log security event:', err.message);
  }
}

// ===== CLEANUP OLD SECURITY DATA =====
async function cleanupSecurityData(db) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
  try {
    // Clean expired lockouts
    const snap = await db.ref('_security/lockouts').once('value');
    const lockouts = snap.val() || {};
    const updates = {};
    for (const [key, data] of Object.entries(lockouts)) {
      if (data.lastFailedAt && data.lastFailedAt < cutoff && (!data.lockedUntil || data.lockedUntil < Date.now())) {
        updates[key] = null;
      }
    }
    if (Object.keys(updates).length > 0) {
      await db.ref('_security/lockouts').update(updates);
    }

    // Clean old security events (keep last 7 days)
    const eventCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const eventSnap = await db.ref('_security/events')
      .orderByChild('timestamp')
      .endAt(new Date(eventCutoff).toISOString())
      .limitToFirst(100)
      .once('value');
    const oldEvents = eventSnap.val();
    if (oldEvents) {
      const eventUpdates = {};
      for (const key of Object.keys(oldEvents)) {
        eventUpdates[key] = null;
      }
      await db.ref('_security/events').update(eventUpdates);
    }
  } catch (err) {
    console.error('[SECURITY] Cleanup error:', err.message);
  }
}

module.exports = {
  generateRequestId,
  validateCSRF,
  checkAccountLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  sanitizeErrorMessage,
  logSecurityEvent,
  cleanupSecurityData,
  LOCKOUT_CONFIG,
};
