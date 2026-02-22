const { getDb, getAuth, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

// Firebase Auth REST API
const AUTH_API = 'https://identitytoolkit.googleapis.com/v1/accounts';

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

/**
 * ONE-TIME BOOTSTRAP: Creates the first client (admin) user.
 *
 * This endpoint ONLY works when NO users exist in the database.
 * Once the first user is created, this endpoint is permanently disabled.
 *
 * Requires a setup key set via BOOTSTRAP_KEY environment variable for security.
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, email, password, setupKey } = body;

    // Rate limit bootstrap attempts (use IP-based since there's no auth token)
    const db = getDb();
    const clientId = getClientId(event);
    const rateCheck = await checkRateLimit(db, clientId, 'api');
    if (!rateCheck.allowed) {
      return respond(429, { error: 'Too many requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
    }

    // Validate setup key
    const expectedKey = process.env.BOOTSTRAP_KEY;
    if (!expectedKey) {
      return respond(403, { error: 'Bootstrap is not configured. Set the BOOTSTRAP_KEY environment variable in Netlify.' });
    }
    if (setupKey !== expectedKey) {
      return respond(403, { error: 'Invalid setup key.' });
    }

    // Check if any users already exist — if so, bootstrap is disabled
    const usersSnap = await db.ref('users').limitToFirst(1).once('value');
    if (usersSnap.val()) {
      return respond(403, { error: 'Bootstrap is disabled. Users already exist. Use the invitation system to add new users.' });
    }

    // Validate inputs
    if (!name || !name.trim()) return respond(400, { error: 'Please enter your name.' });
    if (!email || !email.trim()) return respond(400, { error: 'Please enter your email.' });
    if (!password) return respond(400, { error: 'Please enter a password.' });
    // Enforce strong password policy (OWASP ASVS Level 2)
    if (password.length < 12) return respond(400, { error: 'Password must be at least 12 characters.' });
    if (!/[A-Z]/.test(password)) return respond(400, { error: 'Password must contain at least one uppercase letter.' });
    if (!/[a-z]/.test(password)) return respond(400, { error: 'Password must contain at least one lowercase letter.' });
    if (!/\d/.test(password)) return respond(400, { error: 'Password must contain at least one number.' });
    if (!/[^A-Za-z0-9]/.test(password)) return respond(400, { error: 'Password must contain at least one special character.' });

    // Create user in Firebase Auth
    const signUpData = await firebaseSignUp(email.trim().toLowerCase(), password);
    const uid = signUpData.localId;

    // Update display name
    const auth = getAuth();
    await auth.updateUser(uid, { displayName: name.trim() });

    // Save as CLIENT role (highest permission — can invite everyone)
    await db.ref('users/' + uid).set({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role: 'client',
      project: 'ksia',
      isBootstrap: true,
      createdAt: new Date().toISOString()
    });

    console.log('[BOOTSTRAP] First client user created:', uid, email.trim());

    return respond(200, {
      success: true,
      message: 'First client account created! You can now sign in and invite other users.',
      token: signUpData.idToken,
      refreshToken: signUpData.refreshToken,
      user: { uid, name: name.trim(), email: email.trim().toLowerCase(), role: 'client', project: 'ksia' }
    });
  } catch (e) {
    console.error('[BOOTSTRAP] Error:', e);
    const msg = e.code === 'EMAIL_EXISTS'
      ? 'This email is already registered. Try logging in instead.'
      : 'Setup failed. Please try again.';
    return respond(500, { error: msg });
  }
};
