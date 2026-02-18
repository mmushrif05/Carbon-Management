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

// Fetch the project ID that a user belongs to.
// Every user record has a `project` field set at registration via invitation.
async function getUserProject(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  const profile = snap.val();
  return profile ? (profile.project || null) : null;
}

// Fetch all users in a project that have a given role.
async function getProjectUsersByRole(project, role) {
  const db = getDb();
  const snap = await db.ref('users').orderByChild('project').equalTo(project).once('value');
  const all = snap.val() || {};
  return Object.values(all).filter(u => u.role === role && u.email);
}

module.exports = { getDb, getAuth, verifyToken, getUserProject, getProjectUsersByRole, headers, respond, optionsResponse };
