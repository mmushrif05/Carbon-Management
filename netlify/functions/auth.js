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

async function handleForgotPassword(body) {
  const { email } = body;
  if (!email || !email.trim()) return respond(400, { error: 'Please enter your email address.' });

  const trimmedEmail = email.trim().toLowerCase();
  const db = getDb();

  // Check if user exists in our database
  const usersSnap = await db.ref('users')
    .orderByChild('email')
    .equalTo(trimmedEmail)
    .once('value');

  if (!usersSnap.val()) {
    // Don't reveal whether email exists — always show success
    return respond(200, { success: true, message: 'If an account exists with this email, a password reset link has been sent.' });
  }

  try {
    const auth = getAuth();
    const resetLink = await auth.generatePasswordResetLink(trimmedEmail);

    // Try to send branded email via SMTP
    const sent = await sendResetEmail(trimmedEmail, resetLink);
    if (!sent) {
      // Fallback: use Firebase REST API to send default reset email
      const apiKey = process.env.FIREBASE_API_KEY;
      await fetch(`${AUTH_API}:sendOobCode?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: trimmedEmail })
      });
    }

    console.log('[AUTH] Password reset sent to:', trimmedEmail);
    return respond(200, { success: true, message: 'Password reset link has been sent to your email.' });
  } catch (e) {
    console.error('[AUTH] Forgot password error:', e.message || e);
    // Don't reveal specifics — always show generic message
    return respond(200, { success: true, message: 'If an account exists with this email, a password reset link has been sent.' });
  }
}

async function sendResetEmail(email, resetLink) {
  try {
    const nodemailer = require('nodemailer');
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return false;

    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass }
    });

    const fromEmail = process.env.SMTP_FROM || user;

    await transporter.sendMail({
      from: `"CarbonTrack Pro" <${fromEmail}>`,
      to: email,
      subject: 'Reset Your CarbonTrack Pro Password',
      text: `Password Reset Request\n\nYou requested a password reset for your CarbonTrack Pro account.\n\nClick the link below to reset your password:\n${resetLink}\n\nIf you did not request this, you can safely ignore this email.\n\nCarbonTrack Pro — KSIA Sustainability Program`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0b0f0e;font-family:'Segoe UI',system-ui,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#111916;border:1px solid rgba(52,211,153,0.12);border-radius:16px;overflow:hidden">
<div style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(52,211,153,0.08)">
<div style="font-size:36px;margin-bottom:8px">🌍</div>
<div style="font-size:22px;font-weight:800;color:#ecfdf5;letter-spacing:-0.5px">Carbon<span style="color:#34d399">Track</span> Pro</div>
<div style="font-size:12px;color:#64748b;margin-top:4px">Construction Embodied Carbon Platform</div></div>
<div style="padding:32px">
<h2 style="color:#ecfdf5;font-size:18px;margin:0 0 16px">Password Reset</h2>
<p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px">You requested a password reset for your CarbonTrack Pro account. Click the button below to set a new password.</p>
<div style="text-align:center;margin-bottom:24px">
<a href="${resetLink}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#047857,#059669);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px">Reset Password</a></div>
<p style="color:#64748b;font-size:11px;text-align:center;margin:0">If the button doesn't work, copy and paste this link:<br>
<a href="${resetLink}" style="color:#34d399;word-break:break-all">${resetLink}</a></p></div>
<div style="padding:20px 32px;border-top:1px solid rgba(52,211,153,0.08);text-align:center">
<p style="color:#475569;font-size:10px;margin:0">If you did not request this reset, you can safely ignore this email.<br>CarbonTrack Pro v2.0 — KSIA Sustainability Program</p></div></div></body></html>`
    });
    return true;
  } catch (e) {
    console.warn('[AUTH] SMTP reset email failed, using Firebase fallback:', e.message);
    return false;
  }
}

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
      organizationId: invitation.organizationId || null,
      organizationName: invitation.organizationName || null,
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
      user: { uid, name: name.trim(), email: trimmedEmail, role, project, organizationId: invitation.organizationId || null, organizationName: invitation.organizationName || null }
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
      // Profile missing — user was not properly registered through invitation system
      console.error('[AUTH] Login blocked: no profile for uid', uid, email.trim());
      return respond(403, { error: 'Your account is not registered in this project. Please contact an admin for an invitation.' });
    }

    console.log('[AUTH] User signed in:', uid, email.trim());

    return respond(200, {
      token: signInData.idToken,
      refreshToken: signInData.refreshToken,
      user: { uid, name: signInData.displayName || profile.name || email.split('@')[0], email: profile.email, role: profile.role, organizationId: profile.organizationId || null, organizationName: profile.organizationName || null }
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
      user: { uid: decoded.uid, name: profile.name, email: profile.email, role: profile.role, organizationId: profile.organizationId || null, organizationName: profile.organizationName || null }
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
      case 'register':        return await handleRegister(body);
      case 'login':           return await handleLogin(body);
      case 'verify':          return await handleVerify(event);
      case 'refresh':         return await handleRefresh(body);
      case 'forgot-password': return await handleForgotPassword(body);
      default:                return respond(400, { error: 'Invalid action' });
    }
  } catch (e) {
    console.error('[AUTH] Server error:', e);
    return respond(500, { error: 'Server error: ' + (e.message || 'Unknown') });
  }
};
