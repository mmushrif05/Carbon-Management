/**
 * Rate Limiting for Netlify Functions
 *
 * Uses Firebase Realtime Database to track request counts per IP/user.
 * Protects against brute force attacks and API abuse.
 *
 * Note: For production at scale, consider replacing with Redis or
 * a dedicated rate limiting service (e.g., Cloudflare, AWS WAF).
 */

const WINDOW_MS = 60 * 1000; // 1 minute window

// Default limits per endpoint category
const RATE_LIMITS = {
  auth: { maxRequests: 10, windowMs: WINDOW_MS },       // Login/register: 10/min
  ai: { maxRequests: 5, windowMs: WINDOW_MS },           // AI calls: 5/min
  upload: { maxRequests: 10, windowMs: WINDOW_MS },      // Document uploads: 10/min
  api: { maxRequests: 200, windowMs: WINDOW_MS },        // General API: 200/min (SPA makes many parallel calls per page)
};

/**
 * Extract client identifier from event (IP address or user ID)
 */
function getClientId(event, user) {
  // Prefer user ID if authenticated (more reliable than IP)
  if (user && user.uid) return 'user_' + user.uid;

  // Fall back to IP address
  const forwarded = event.headers && (event.headers['x-forwarded-for'] || event.headers['x-nf-client-connection-ip']);
  if (forwarded) return 'ip_' + forwarded.split(',')[0].trim();

  return 'ip_unknown';
}

/**
 * Check rate limit using Firebase
 * Returns { allowed: boolean, remaining: number, retryAfter?: number }
 */
async function checkRateLimit(db, clientId, category) {
  // Skip rate limiting for general API calls from authenticated users
  // Rate limiting is most important for auth endpoints (brute force protection)
  if (category === 'api' && clientId.startsWith('user_')) {
    return { allowed: true, remaining: -1 };
  }

  const config = RATE_LIMITS[category] || RATE_LIMITS.api;
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const rateLimitPath = `_rateLimits/${category}/${clientId.replace(/[.#$\[\]]/g, '_')}`;

  try {
    const snap = await db.ref(rateLimitPath).once('value');
    const data = snap.val() || { count: 0, windowStart: now };

    // If window has expired, reset
    if (data.windowStart < windowStart) {
      await db.ref(rateLimitPath).set({ count: 1, windowStart: now });
      return { allowed: true, remaining: config.maxRequests - 1 };
    }

    // Check if over limit
    if (data.count >= config.maxRequests) {
      const retryAfter = Math.ceil((data.windowStart + config.windowMs - now) / 1000);
      return { allowed: false, remaining: 0, retryAfter: (retryAfter > 0 && isFinite(retryAfter)) ? retryAfter : 5 };
    }

    // Increment counter
    await db.ref(rateLimitPath).update({ count: data.count + 1 });
    return { allowed: true, remaining: config.maxRequests - data.count - 1 };
  } catch (err) {
    // If rate limiting fails, allow the request (fail open)
    // but log the error for monitoring
    console.error('[RATE_LIMIT] Error checking rate limit:', err.message);
    return { allowed: true, remaining: -1 };
  }
}

/**
 * Clean up expired rate limit entries (call periodically)
 */
async function cleanupRateLimits(db) {
  const cutoff = Date.now() - 5 * 60 * 1000; // Remove entries older than 5 minutes
  try {
    for (const category of Object.keys(RATE_LIMITS)) {
      const snap = await db.ref(`_rateLimits/${category}`)
        .orderByChild('windowStart')
        .endAt(cutoff)
        .once('value');
      const expired = snap.val();
      if (expired) {
        const updates = {};
        for (const key of Object.keys(expired)) {
          updates[key] = null;
        }
        await db.ref(`_rateLimits/${category}`).update(updates);
      }
    }
  } catch (err) {
    console.error('[RATE_LIMIT] Cleanup error:', err.message);
  }
}

module.exports = {
  RATE_LIMITS,
  getClientId,
  checkRateLimit,
  cleanupRateLimits,
};
