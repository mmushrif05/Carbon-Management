/**
 * Emissions Approval Workflow Endpoints
 * Handles: submit → review → approve → lock
 *
 * POST /emissions with action:
 *   - submit: Data entry submits emission entry for review
 *   - review: Reviewer marks entry as reviewed
 *   - approve: Approver approves entry → locks it
 *   - reject: Reviewer/approver sends back with comments
 *   - listApprovals: List approval queue for current user
 */

const { getDb, verifyToken, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { writeAuditLog, shouldAutoApprove } = require('./lib/permissions');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

// === SUBMIT EMISSION ENTRY ===
async function handleSubmitEmission(body, decoded) {
  const { entryId, projectId, packageId } = body;
  if (!entryId || !projectId) return respond(400, { error: 'Entry ID and Project ID are required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();

  const approvalId = Date.now().toString();
  const approval = {
    id: approvalId,
    tenantId: profile.tenantId || 'default',
    type: 'emission_entry',
    targetId: entryId,
    projectId,
    packageId: packageId || null,
    status: 'submitted',
    submittedBy: decoded.uid,
    submittedByName: profile.name || profile.email,
    submittedAt: new Date().toISOString(),
    reviewerUid: null,
    reviewedAt: null,
    reviewNote: null,
    approverUid: null,
    approvedAt: null,
    approveNote: null,
    comments: [],
    trialAutoApproved: false,
  };

  // TRIAL MODE: Auto-approve
  if (shouldAutoApprove()) {
    approval.status = 'approved';
    approval.reviewerUid = 'system';
    approval.reviewedAt = new Date().toISOString();
    approval.reviewNote = 'Auto-reviewed: TRIAL_MODE';
    approval.approverUid = 'system';
    approval.approvedAt = new Date().toISOString();
    approval.approveNote = 'Auto-approved: TRIAL_MODE';
    approval.trialAutoApproved = true;
  }

  await db.ref('approvals/' + approvalId).set(approval);

  await writeAuditLog(db, {
    action: 'emission_submitted',
    actor: decoded.uid,
    targetType: 'emission_entry',
    targetId: entryId,
    projectId,
    details: { packageId, trialAutoApproved: approval.trialAutoApproved },
  });

  return respond(200, { approval });
}

// === REVIEW EMISSION ENTRY ===
async function handleReviewEmission(body, decoded) {
  const { approvalId, note } = body;
  if (!approvalId) return respond(400, { error: 'Approval ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('approvals/' + approvalId).once('value');
  const approval = snap.val();
  if (!approval) return respond(404, { error: 'Approval not found.' });
  if (approval.status !== 'submitted') return respond(400, { error: 'Entry must be in submitted status to review.' });

  await db.ref('approvals/' + approvalId).update({
    status: 'under_review',
    reviewerUid: decoded.uid,
    reviewedAt: new Date().toISOString(),
    reviewNote: note || '',
  });

  await writeAuditLog(db, {
    action: 'emission_reviewed',
    actor: decoded.uid,
    targetType: 'approval',
    targetId: approvalId,
    projectId: approval.projectId,
    details: { entryId: approval.targetId, note },
  });

  return respond(200, { success: true, status: 'under_review' });
}

// === APPROVE EMISSION ENTRY ===
async function handleApproveEmission(body, decoded) {
  const { approvalId, note } = body;
  if (!approvalId) return respond(400, { error: 'Approval ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('approvals/' + approvalId).once('value');
  const approval = snap.val();
  if (!approval) return respond(404, { error: 'Approval not found.' });
  if (!['submitted', 'under_review'].includes(approval.status)) {
    return respond(400, { error: 'Entry must be in submitted or under_review status to approve.' });
  }

  await db.ref('approvals/' + approvalId).update({
    status: 'approved',
    approverUid: decoded.uid,
    approvedAt: new Date().toISOString(),
    approveNote: note || '',
  });

  // Lock the emission entry
  if (approval.targetId) {
    await db.ref('entries/' + approval.targetId + '/locked').set(true);
    await db.ref('entries/' + approval.targetId + '/lockedAt').set(new Date().toISOString());
    await db.ref('entries/' + approval.targetId + '/lockedBy').set(decoded.uid);
  }

  await writeAuditLog(db, {
    action: 'emission_approved',
    actor: decoded.uid,
    targetType: 'approval',
    targetId: approvalId,
    projectId: approval.projectId,
    details: { entryId: approval.targetId, note },
  });

  return respond(200, { success: true, status: 'approved' });
}

// === REJECT EMISSION ENTRY ===
async function handleRejectEmission(body, decoded) {
  const { approvalId, note } = body;
  if (!approvalId) return respond(400, { error: 'Approval ID is required.' });
  if (!note || !note.trim()) return respond(400, { error: 'A rejection note is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('approvals/' + approvalId).once('value');
  const approval = snap.val();
  if (!approval) return respond(404, { error: 'Approval not found.' });

  const comment = {
    by: decoded.uid,
    byName: profile.name || profile.email,
    at: new Date().toISOString(),
    text: note.trim(),
    type: 'rejection',
  };
  const comments = approval.comments || [];
  comments.push(comment);

  await db.ref('approvals/' + approvalId).update({
    status: 'rejected',
    comments,
  });

  await writeAuditLog(db, {
    action: 'emission_rejected',
    actor: decoded.uid,
    targetType: 'approval',
    targetId: approvalId,
    projectId: approval.projectId,
    details: { entryId: approval.targetId, note },
  });

  return respond(200, { success: true, status: 'rejected' });
}

// === LIST APPROVALS (Inbox) ===
async function handleListApprovals(body, decoded) {
  const { projectId, status, type } = body;

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('approvals').once('value');
  let approvals = Object.values(snap.val() || {});

  if (projectId) approvals = approvals.filter(a => a.projectId === projectId);
  if (status) approvals = approvals.filter(a => a.status === status);
  if (type) approvals = approvals.filter(a => a.type === type);

  // Filter by visibility
  if (profile.role !== 'client') {
    // Non-clients see only approvals for their assigned projects
    const assignSnap = await db.ref('project_assignments').once('value');
    const myProjectIds = new Set();
    Object.values(assignSnap.val() || {}).forEach(a => {
      if (a.userId === decoded.uid) myProjectIds.add(a.projectId);
    });
    approvals = approvals.filter(a => myProjectIds.has(a.projectId) || a.submittedBy === decoded.uid);
  }

  approvals.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  return respond(200, { approvals });
}

// === MAIN HANDLER ===
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  // CSRF validation
  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Authentication required.' });

  // Rate limiting
  const db = getDb();
  const clientId = getClientId(event, decoded);
  const rateCheck = await checkRateLimit(db, clientId, 'api');
  if (!rateCheck.allowed) {
    return respond(429, { error: 'Too many requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;
    console.log('[EMISSIONS] Action:', action, 'User:', decoded.uid);

    switch (action) {
      case 'submit':          return await handleSubmitEmission(body, decoded);
      case 'review':          return await handleReviewEmission(body, decoded);
      case 'approve':         return await handleApproveEmission(body, decoded);
      case 'reject':          return await handleRejectEmission(body, decoded);
      case 'listApprovals':   return await handleListApprovals(body, decoded);
      default: return respond(400, { error: 'Invalid action: ' + action });
    }
  } catch (err) {
    console.error('[EMISSIONS] Error:', err);
    return respond(500, { error: 'Internal server error.' });
  }
};
