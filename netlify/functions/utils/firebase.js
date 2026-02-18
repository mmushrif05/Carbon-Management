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

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

function respond(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function optionsResponse() {
  return { statusCode: 204, headers, body: '' };
}

// Get user profile and resolve their projectId
async function getUserProjectId(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  const profile = snap.val();
  return profile ? (profile.projectId || profile.project || 'ksia') : 'ksia';
}

module.exports = { getDb, getAuth, verifyToken, getUserProjectId, headers, respond, optionsResponse };
