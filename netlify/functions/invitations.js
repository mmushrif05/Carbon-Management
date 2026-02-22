const { getDb, getAuth, verifyToken, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const crypto = require('crypto');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

const VALID_ROLES = ['contractor', 'consultant', 'client'];

// Only clients and consultants can send invitations
const INVITER_ROLES = ['client', 'consultant'];

// Role hierarchy: who can invite whom
// Consultant-centric: consultants have full invitation permissions
const INVITE_PERMISSIONS = {
  client: ['client', 'consultant', 'contractor'],
  consultant: ['client', 'consultant', 'contractor']
};

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

// === CREATE INVITATION ===
async function handleCreate(body, decoded) {
  const { email, role, message } = body;

  if (!email || !email.trim()) return respond(400, { error: 'Please enter an email address.' });
  if (!role || !VALID_ROLES.includes(role)) return respond(400, { error: 'Please select a valid role.' });

  // Get inviter's profile
  const inviterProfile = await getUserProfile(decoded.uid);
  if (!inviterProfile) return respond(403, { error: 'Your profile was not found.' });

  const inviterRole = inviterProfile.role;
  if (!INVITER_ROLES.includes(inviterRole)) {
    return respond(403, { error: 'Only clients and consultants can send invitations.' });
  }

  // Check role permission hierarchy
  const allowedRoles = INVITE_PERMISSIONS[inviterRole] || [];
  if (!allowedRoles.includes(role)) {
    return respond(403, { error: `As a ${inviterRole}, you cannot invite ${role}s.` });
  }

  const db = getDb();
  const project = inviterProfile.project || 'ksia';
  const trimmedEmail = email.trim().toLowerCase();

  // Check if user already registered — one email, one role only
  const usersSnap = await db.ref('users')
    .orderByChild('email')
    .equalTo(trimmedEmail)
    .once('value');
  if (usersSnap.val()) {
    return respond(400, { error: 'A user with this email is already registered. One email can only have one role.' });
  }

  // Check if invitation already exists for this email+project
  const existingSnap = await db.ref('invitations')
    .orderByChild('email')
    .equalTo(trimmedEmail)
    .once('value');

  const existing = existingSnap.val();
  if (existing) {
    const allInvites = Object.values(existing).filter(inv => inv.project === project);

    // Block if there's already an accepted invitation
    const accepted = allInvites.find(inv => inv.status === 'accepted');
    if (accepted) {
      return respond(400, { error: 'This user has already accepted an invitation as ' + accepted.role + '. One email can only have one role.' });
    }

    // Block if there's already a pending invitation
    const pending = allInvites.find(inv => inv.status === 'pending');
    if (pending) {
      return respond(400, { error: 'An invitation is already pending for this email (as ' + pending.role + '). Revoke it first to send a new one.' });
    }
  }

  // Create invitation
  const token = generateToken();
  const inviteId = Date.now().toString();
  const invitation = {
    id: inviteId,
    email: trimmedEmail,
    role,
    project,
    token,
    message: message || '',
    status: 'pending',
    invitedBy: decoded.uid,
    invitedByName: inviterProfile.name || inviterProfile.email || 'Unknown',
    invitedByRole: inviterRole,
    // Organization context: pass the inviter's org so the invitee inherits the right org
    organizationId: body.organizationId || inviterProfile.organizationId || null,
    organizationName: body.organizationName || inviterProfile.organizationName || null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  };

  await db.ref('invitations/' + inviteId).set(invitation);

  console.log('[INVITE] Created invitation:', inviteId, trimmedEmail, role, 'by', decoded.uid);

  return respond(200, { invitation: { ...invitation, token } });
}

// === LIST INVITATIONS ===
async function handleList(decoded) {
  const inviterProfile = await getUserProfile(decoded.uid);
  if (!inviterProfile) return respond(403, { error: 'Profile not found.' });

  if (!INVITER_ROLES.includes(inviterProfile.role)) {
    return respond(403, { error: 'Only clients and consultants can view invitations.' });
  }

  const db = getDb();
  const project = inviterProfile.project || 'ksia';

  // Get all invitations for this project
  const snap = await db.ref('invitations')
    .orderByChild('project')
    .equalTo(project)
    .once('value');

  const data = snap.val() || {};
  const invitations = Object.values(data)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Don't send tokens to client for security
  const sanitized = invitations.map(inv => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    invitedByName: inv.invitedByName,
    invitedByRole: inv.invitedByRole,
    createdAt: inv.createdAt,
    expiresAt: inv.expiresAt,
    acceptedAt: inv.acceptedAt || null
  }));

  return respond(200, { invitations: sanitized });
}

// === VALIDATE INVITATION TOKEN ===
async function handleValidate(body) {
  const { token } = body;
  if (!token) return respond(400, { error: 'Invitation token is required.' });

  const db = getDb();
  const snap = await db.ref('invitations')
    .orderByChild('token')
    .equalTo(token)
    .once('value');

  const data = snap.val();
  if (!data) return respond(404, { error: 'Invalid invitation link.' });

  const invitation = Object.values(data)[0];
  if (invitation.status !== 'pending') {
    return respond(400, { error: 'This invitation has already been ' + invitation.status + '.' });
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    return respond(400, { error: 'This invitation has expired. Please request a new one.' });
  }

  return respond(200, {
    valid: true,
    invitation: {
      email: invitation.email,
      role: invitation.role,
      project: invitation.project,
      invitedByName: invitation.invitedByName
    }
  });
}

// === REVOKE INVITATION ===
async function handleRevoke(body, decoded) {
  const { inviteId } = body;
  if (!inviteId) return respond(400, { error: 'Invitation ID is required.' });

  const inviterProfile = await getUserProfile(decoded.uid);
  if (!inviterProfile) return respond(403, { error: 'Profile not found.' });

  if (!INVITER_ROLES.includes(inviterProfile.role)) {
    return respond(403, { error: 'Only clients and consultants can revoke invitations.' });
  }

  const db = getDb();
  const snap = await db.ref('invitations/' + inviteId).once('value');
  const invitation = snap.val();

  if (!invitation) return respond(404, { error: 'Invitation not found.' });
  if (invitation.status !== 'pending') {
    return respond(400, { error: 'Only pending invitations can be revoked.' });
  }

  await db.ref('invitations/' + inviteId).update({ status: 'revoked' });

  console.log('[INVITE] Revoked invitation:', inviteId, 'by', decoded.uid);

  return respond(200, { success: true });
}

// === RESEND INVITATION ===
async function handleResend(body, decoded) {
  const { inviteId } = body;
  if (!inviteId) return respond(400, { error: 'Invitation ID is required.' });

  const inviterProfile = await getUserProfile(decoded.uid);
  if (!inviterProfile) return respond(403, { error: 'Profile not found.' });

  if (!INVITER_ROLES.includes(inviterProfile.role)) {
    return respond(403, { error: 'Only clients and consultants can resend invitations.' });
  }

  const db = getDb();
  const snap = await db.ref('invitations/' + inviteId).once('value');
  const invitation = snap.val();

  if (!invitation) return respond(404, { error: 'Invitation not found.' });
  if (invitation.status !== 'pending') {
    return respond(400, { error: 'Only pending invitations can be resent.' });
  }

  // Generate new token and extend expiry
  const newToken = generateToken();
  await db.ref('invitations/' + inviteId).update({
    token: newToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });

  console.log('[INVITE] Resend invitation:', inviteId, 'by', decoded.uid);

  return respond(200, {
    invitation: { ...invitation, token: newToken, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }
  });
}

// === MAIN HANDLER ===
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  // CSRF validation
  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    // Validate action does not require auth
    if (action === 'validate') {
      return await handleValidate(body);
    }

    // All other actions require auth
    if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

    const decoded = await verifyToken(event);
    if (!decoded) return respond(401, { error: 'Authentication required.' });

    // Rate limiting
    const db = getDb();
    const clientId = getClientId(event, decoded);
    const rateCheck = await checkRateLimit(db, clientId, 'api');
    if (!rateCheck.allowed) {
      return respond(429, { error: 'Too many requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
    }

    switch (action) {
      case 'create':  return await handleCreate(body, decoded);
      case 'list':    return await handleList(decoded);
      case 'revoke':  return await handleRevoke(body, decoded);
      case 'resend':  return await handleResend(body, decoded);
      default:        return respond(400, { error: 'Invalid action.' });
    }
  } catch (e) {
    console.error('[INVITE] Server error:', e);
    return respond(500, { error: 'An error occurred processing your request. Please try again.' });
  }
};
