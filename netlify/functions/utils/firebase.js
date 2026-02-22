const admin = require('firebase-admin');
const { generateRequestId, validateCSRF, sanitizeErrorMessage } = require('../lib/security-middleware');

let initialized = false;

function initFirebase() {
  if (!initialized) {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    initialized = true;
  }
}

function getDb() {
  initFirebase();
  return admin.database();
}

function getAuth() {
  initFirebase();
  return admin.auth();
}

async function verifyToken(event) {
  initFirebase();
  const authHeader = (event.headers && event.headers.authorization) || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (e) {
    return null;
  }
}

// ===== SECURITY HEADERS (OWASP ASVS Level 2) =====
// CORS: Restrict to configured allowed origins (no more wildcard '*')
// Security headers: Prevent clickjacking, XSS, MIME sniffing, etc.
// CSRF: Validate custom header on state-changing requests
function getSecurityHeaders(event, requestId) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  const requestOrigin = event && event.headers && (event.headers.origin || event.headers.Origin);

  // Determine CORS origin — if ALLOWED_ORIGINS is set, enforce it; otherwise allow all (dev mode)
  let corsOrigin = '*';
  if (allowedOrigins.length > 0 && requestOrigin) {
    corsOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
  } else if (requestOrigin && allowedOrigins.length > 0) {
    corsOrigin = allowedOrigins[0];
  }

  const h = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Request-ID',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Request-ID',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    // Security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  };

  // Add request correlation ID
  if (requestId) {
    h['X-Request-ID'] = requestId;
  }

  return h;
}

// Backward-compatible static headers (used by functions that don't pass event)
const headers = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',')[0].trim() : '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Request-ID',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

function respond(statusCode, body, event) {
  const reqId = generateRequestId();
  const h = event ? getSecurityHeaders(event, reqId) : { ...headers, 'X-Request-ID': reqId };

  // Sanitize error messages in non-2xx responses to prevent info leakage
  if (statusCode >= 400 && body && body.error) {
    body.error = sanitizeErrorMessage(body.error, 'api-response');
  }

  return { statusCode, headers: h, body: JSON.stringify(body) };
}

function optionsResponse(event) {
  const h = event ? getSecurityHeaders(event) : headers;
  return { statusCode: 204, headers: h, body: '' };
}

// ===== CSRF CHECK HELPER =====
// Returns a reject response if CSRF check fails, or null if OK
function csrfCheck(event) {
  const check = validateCSRF(event);
  if (!check.valid) {
    return respond(403, { error: check.error }, event);
  }
  return null;
}

module.exports = { getDb, getAuth, verifyToken, headers, getSecurityHeaders, respond, optionsResponse, csrfCheck };
