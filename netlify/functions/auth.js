const { getDb, getAuth, verifyToken, respond, optionsResponse } = require('./utils/firebase');

const VALID_ROLES = ['contractor', 'consultant', 'client'];

// Firebase Auth REST API base
const AUTH_API = 'https://identitytoolkit.googleapis.com/v1/accounts';
const TOKEN_API = 'https://securetoken.googleapis.com/v1/token';

async function firebaseSignIn(email, password) {
  const apiKey = process.env.FIREBASE_API_KEY;
  const res = await fetch(`${AUTH_API}:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (data.error) throw { code: data.error.message, message: data.error.message };
  return data;
}

async function firebaseSignUp(email, password) {
  const apiKey = process.env.FIREBASE_API_KEY;
  const res = await fetch(`${AUTH_API}:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (data.error) throw { code: data.error.message, message: data.error.message };
  return data;
}

async function firebaseRefresh(refreshToken) {
  const apiKey = process.env.FIREBASE_API_KEY;
  const res = await fetch(`${TOKEN_API}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const data = await res.json();
  if (data.error) throw { code: data.error.message, message: data.error.message };
  return data;
}

function authErrorMessage(code) {
  const map = {
    'EMAIL_EXISTS': 'An account with this email already exists.',
    'INVALID_EMAIL': 'Please enter a valid email address.',
    'WEAK_PASSWORD': 'Password must be at least 6 characters.',
    'EMAIL_NOT_FOUND': 'No account found with this email.',
    'INVALID_PASSWORD': 'Incorrect password.',
    'INVALID_LOGIN_CREDENTIALS': 'Invalid email or password.',
    'TOO_MANY_ATTEMPTS_TRY_LATER': 'Too many attempts. Please try again later.',
    'USER_DISABLED': 'This account has been disabled.'
  };
  return map[code] || 'Authentication failed. Please try again.';
}

// === HANDLERS ===

async function handleRegister(body) {
  const { name, email, password, role } = body;

  if (!name || !name.trim()) return respond(400, { error: 'Please enter your name.' });
  if (!email || !email.trim()) return respond(400, { error: 'Please enter your email.' });
  if (!password) return respond(400, { error: 'Please enter a password.' });
  if (password.length < 6) return respond(400, { error: 'Password must be at least 6 characters.' });
  if (!role || !VALID_ROLES.includes(role)) return respond(400, { error: 'Please select a valid role.' });

  try {
    // Create user via Firebase Auth REST API
    const signUpData = await firebaseSignUp(email.trim(), password);
    const uid = signUpData.localId;

    // Update display name via Admin SDK
    const auth = getAuth();
    await auth.updateUser(uid, { displayName: name.trim() });

    // Save profile to database
    const db = getDb();
    await db.ref('users/' + uid).set({
      name: name.trim(),
      email: email.trim(),
      role,
      createdAt: new Date().toISOString()
    });

    return respond(200, {
      token: signUpData.idToken,
      refreshToken: signUpData.refreshToken,
      user: { uid, name: name.trim(), email: email.trim(), role }
    });
  } catch (e) {
    return respond(400, { error: authErrorMessage(e.code || e.message) });
  }
}

async function handleLogin(body) {
  const { email, password } = body;

  if (!email || !email.trim()) return respond(400, { error: 'Please enter your email.' });
  if (!password) return respond(400, { error: 'Please enter your password.' });

  try {
    // Sign in via Firebase Auth REST API
    const signInData = await firebaseSignIn(email.trim(), password);
    const uid = signInData.localId;

    // Load user profile from database
    const db = getDb();
    const snap = await db.ref('users/' + uid).once('value');
    let profile = snap.val();

    if (!profile) {
      // Profile missing — create a basic one
      profile = { name: signInData.displayName || email.split('@')[0], email: email.trim(), role: 'contractor' };
      await db.ref('users/' + uid).set({ ...profile, createdAt: new Date().toISOString() });
    }

    return respond(200, {
      token: signInData.idToken,
      refreshToken: signInData.refreshToken,
      user: { uid, name: profile.name, email: profile.email, role: profile.role }
    });
  } catch (e) {
    return respond(401, { error: authErrorMessage(e.code || e.message) });
  }
}

async function handleVerify(event) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(200, { authenticated: false });

  try {
    const db = getDb();
    const snap = await db.ref('users/' + decoded.uid).once('value');
    const profile = snap.val();

    if (!profile) return respond(200, { authenticated: false });

    return respond(200, {
      authenticated: true,
      user: { uid: decoded.uid, name: profile.name, email: profile.email, role: profile.role }
    });
  } catch (e) {
    return respond(200, { authenticated: false });
  }
}

async function handleRefresh(body) {
  const { refreshToken } = body;
  if (!refreshToken) return respond(400, { error: 'Refresh token required.' });

  try {
    const data = await firebaseRefresh(refreshToken);
    return respond(200, {
      token: data.id_token,
      refreshToken: data.refresh_token
    });
  } catch (e) {
    return respond(401, { error: 'Session expired. Please sign in again.' });
  }
}

// === MAIN HANDLER ===
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    switch (action) {
      case 'register': return await handleRegister(body);
      case 'login':    return await handleLogin(body);
      case 'verify':   return await handleVerify(event);
      case 'refresh':  return await handleRefresh(body);
      default:         return respond(400, { error: 'Invalid action' });
    }
  } catch (e) {
    return respond(500, { error: 'Server error' });
  }
};
