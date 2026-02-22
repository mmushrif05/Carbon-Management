const admin = require('firebase-admin');

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

// ===== SECURITY HEADERS =====
// CORS: Restrict to configured allowed origins (no more wildcard '*')
// Security headers: Prevent clickjacking, XSS, MIME sniffing, etc.
function getSecurityHeaders(event) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  const requestOrigin = event && event.headers && (event.headers.origin || event.headers.Origin);

  // Determine CORS origin — if ALLOWED_ORIGINS is set, enforce it; otherwise allow all (dev mode)
  let corsOrigin = '*';
  if (allowedOrigins.length > 0 && requestOrigin) {
    corsOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
  } else if (requestOrigin && allowedOrigins.length > 0) {
    corsOrigin = allowedOrigins[0];
  }

  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    // Security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  };
}

// Backward-compatible static headers (used by functions that don't pass event)
const headers = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',')[0].trim() : '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

function respond(statusCode, body, event) {
  const h = event ? getSecurityHeaders(event) : headers;
  return { statusCode, headers: h, body: JSON.stringify(body) };
}

function optionsResponse(event) {
  const h = event ? getSecurityHeaders(event) : headers;
  return { statusCode: 204, headers: h, body: '' };
}

module.exports = { getDb, getAuth, verifyToken, headers, getSecurityHeaders, respond, optionsResponse };
