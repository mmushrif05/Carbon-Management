const { getDb, getAuth, verifyToken, respond, optionsResponse } = require('./utils/firebase');
const crypto = require('crypto');

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
  const { name, email, password, inviteToken } = body;

  if (!name || !name.trim()) return respond(400, { error: 'Please enter your name.' });
  if (!email || !email.trim()) return respond(400, { error: 'Please enter your email.' });
  if (!password) return respond(400, { error: 'Please enter a password.' });
  if (password.length < 6) return respond(400, { error: 'Password must be at least 6 characters.' });

  const trimmedEmail = email.trim().toLowerCase();
  const db = getDb();

  // === INVITATION ENFORCEMENT ===
  // Registration requires a valid invitation token
  if (!inviteToken) {
    return respond(403, { error: 'Registration requires an invitation. Please contact a client or consultant to get an invitation link.' });
  }

  // Look up invitation by token
  const invSnap = await db.ref('invitations')
    .orderByChild('token')
    .equalTo(inviteToken)
    .once('value');

  const invData = invSnap.val();
  if (!invData) {
    return respond(403, { error: 'Invalid invitation link. Please request a new invitation.' });
  }

  const inviteId = Object.keys(invData)[0];
  const invitation = invData[inviteId];

  if (invitation.status !== 'pending') {
    return respond(400, { error: 'This invitation has already been ' + invitation.status + '.' });
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    return respond(400, { error: 'This invitation has expired. Please request a new one.' });
  }

  if (invitation.email !== trimmedEmail) {
    return respond(400, { error: 'This invitation was sent to a different email address. Please use the email: ' + invitation.email });
  }

  // Use the role from the invitation (not user-selected)
  const role = invitation.role;
  const project = invitation.project || 'ksia';

  try {
    // Create user via Firebase Auth REST API (createUserWithEmailAndPassword)
    const signUpData = await firebaseSignUp(trimmedEmail, password);
    const uid = signUpData.localId;

    // Update display name via Admin SDK
    const auth = getAuth();
    await auth.updateUser(uid, { displayName: name.trim() });

    // Save profile to Realtime Database at /users/{uid}
    await db.ref('users/' + uid).set({
      email: trimmedEmail,
      name: name.trim(),
      role,
      project,
      invitedBy: invitation.invitedBy,
      createdAt: new Date().toISOString()
    });

    // Mark invitation as accepted
    await db.ref('invitations/' + inviteId).update({
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      acceptedBy: uid
    });

    console.log('[AUTH] User registered via invitation:', uid, trimmedEmail, role, 'invited by', invitation.invitedBy);

    return respond(200, {
      token: signUpData.idToken,
      refreshToken: signUpData.refreshToken,
      user: { uid, name: name.trim(), email: trimmedEmail, role, project }
    });
  } catch (e) {
    const errorCode = e.code || e.message || 'UNKNOWN';
    const errorMsg = authErrorMessage(errorCode);
    console.error('[AUTH] Register error:', errorCode, e.message || e);
    return respond(400, { error: errorMsg, code: errorCode });
  }
}

async function handleLogin(body) {
  const { email, password } = body;

  if (!email || !email.trim()) return respond(400, { error: 'Please enter your email.' });
  if (!password) return respond(400, { error: 'Please enter your password.' });

  try {
    // Sign in via Firebase Auth REST API (signInWithEmailAndPassword)
    const signInData = await firebaseSignIn(email.trim(), password);
    const uid = signInData.localId;

    // Load user profile from database
    const db = getDb();
    const snap = await db.ref('users/' + uid).once('value');
    let profile = snap.val();

    if (!profile) {
      // Profile missing — create a basic one
      profile = { email: email.trim(), role: 'contractor', project: 'ksia', createdAt: new Date().toISOString() };
      await db.ref('users/' + uid).set(profile);
    }

    console.log('[AUTH] User signed in:', uid, email.trim());

    return respond(200, {
      token: signInData.idToken,
      refreshToken: signInData.refreshToken,
      user: { uid, name: signInData.displayName || profile.name || email.split('@')[0], email: profile.email, role: profile.role }
    });
  } catch (e) {
    const errorCode = e.code || e.message || 'UNKNOWN';
    const errorMsg = authErrorMessage(errorCode);
    console.error('[AUTH] Login error:', errorCode, e.message || e);
    return respond(401, { error: errorMsg, code: errorCode });
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
    console.error('[AUTH] Server error:', e);
    return respond(500, { error: 'Server error: ' + (e.message || 'Unknown') });
  }
};
