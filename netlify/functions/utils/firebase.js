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

// CORS: restrict to site origin. Falls back to same-origin ('') if env var not set.
// On Netlify, functions and frontend share the same domain, so CORS is implicit.
// The SITE_URL env var is auto-set by Netlify (e.g., https://your-site.netlify.app).
function getAllowedOrigin() {
  return process.env.SITE_URL || process.env.URL || '';
}

function getHeaders() {
  const origin = getAllowedOrigin();
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}

// Keep a static reference for backward compatibility
const headers = getHeaders();

function respond(statusCode, body) {
  return { statusCode, headers: getHeaders(), body: JSON.stringify(body) };
}

function optionsResponse() {
  return { statusCode: 204, headers: getHeaders(), body: '' };
}

// Get user profile and resolve their projectId
async function getUserProjectId(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  const profile = snap.val();
  return profile ? (profile.projectId || profile.project || 'ksia') : 'ksia';
}

module.exports = { getDb, getAuth, verifyToken, getUserProjectId, headers, respond, optionsResponse };
