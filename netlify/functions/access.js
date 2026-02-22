/**
 * Enterprise Access Management Endpoints
 * Handles: org link workflows, user assignments, role changes, scope queries
 *
 * Endpoints:
 *   POST /access with action:
 *     - linkOrgRequest: Initiate org link workflow
 *     - approveLink: Client admin approves org link
 *     - acceptLink: Org director accepts org link
 *     - assignUser: Assign user to project/package with role
 *     - changeRole: Change user's role binding
 *     - revoke: Revoke access/role binding
 *     - myScopes: Get current user's permissions & scopes
 *     - breakGlass: Emergency bypass (logged)
 */

const { getDb, verifyToken, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { CONFIG, hasPermission, writeAuditLog, shouldAutoApprove, breakGlassOverride } = require('./lib/permissions');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

// === LINK ORG REQUEST (Workflow) ===
async function handleLinkOrgRequest(body, decoded) {
  const { projectId, orgId, packages, proposedRoleTemplate, justification } = body;
  if (!projectId || !orgId) return respond(400, { error: 'Project ID and Org ID are required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();

  // Verify project and org exist
  const [projSnap, orgSnap] = await Promise.all([
    db.ref('projects/' + projectId).once('value'),
    db.ref('organizations/' + orgId).once('value'),
  ]);
  const project = projSnap.val();
  const org = orgSnap.val();
  if (!project) return respond(404, { error: 'Project not found.' });
  if (!org) return respond(404, { error: 'Organization not found.' });

  // Check for duplicate pending request
  const existingSnap = await db.ref('accessRequests').once('value');
  const existingRequests = Object.values(existingSnap.val() || {});
  const duplicate = existingRequests.find(r =>
    r.type === 'link_org' && r.projectId === projectId && r.orgId === orgId &&
    !['revoked', 'rejected'].includes(r.status)
  );
  if (duplicate) {
    return respond(400, { error: 'A link request already exists for this org and project (status: ' + duplicate.status + ').' });
  }

  const requestId = Date.now().toString();
  const request = {
    id: requestId,
    tenantId: profile.tenantId || 'default',
    type: 'link_org',
    projectId,
    projectName: project.name,
    orgId,
    orgName: org.name,
    orgType: org.type,
    packages: packages || [],
    proposedRoleTemplate: proposedRoleTemplate || '',
    justification: (justification || '').trim(),
    status: 'submitted',
    initiatedBy: decoded.uid,
    initiatedByName: profile.name || profile.email,
    initiatedAt: new Date().toISOString(),
    trialAutoApproved: false,
    steps: [
      { step: 'client_approval', assignee: project.createdBy || null, status: 'pending', completedAt: null, note: '' },
      { step: 'org_acceptance', assignee: org.directorUid || null, status: 'pending', completedAt: null, note: '' },
    ],
    auditTrail: [
      { action: 'submitted', by: decoded.uid, at: new Date().toISOString(), note: justification || '' },
    ],
  };

  // TRIAL MODE: Auto-approve both steps
  if (shouldAutoApprove()) {
    request.steps[0].status = 'auto_approved';
    request.steps[0].completedAt = new Date().toISOString();
    request.steps[0].note = 'Auto-approved: TRIAL_MODE active';
    request.steps[1].status = 'auto_approved';
    request.steps[1].completedAt = new Date().toISOString();
    request.steps[1].note = 'Auto-approved: TRIAL_MODE active';
    request.status = 'active';
    request.trialAutoApproved = true;
    request.auditTrail.push(
      { action: 'auto_approved_client', by: 'system', at: new Date().toISOString(), note: 'TRIAL_MODE' },
      { action: 'auto_approved_org', by: 'system', at: new Date().toISOString(), note: 'TRIAL_MODE' },
    );

    // Also create the actual org-project link since it's now active
    const linkId = Date.now().toString() + '_link';
    const link = {
      id: linkId,
      orgId, orgName: org.name, orgType: org.type,
      role: proposedRoleTemplate || (org.type === 'consultant_firm' ? 'Consultant' : 'Contractor'),
      projectId, projectName: project.name,
      accessRequestId: requestId,
      createdBy: decoded.uid,
      createdByName: profile.name || profile.email,
      createdByRole: profile.role,
      createdAt: new Date().toISOString(),
    };
    await db.ref('project_org_links/' + linkId).set(link);
  }

  await db.ref('accessRequests/' + requestId).set(request);

  await writeAuditLog(db, {
    action: 'link_org_request_created',
    actor: decoded.uid,
    targetType: 'access_request',
    targetId: requestId,
    projectId,
    details: { orgName: org.name, orgType: org.type, trialAutoApproved: request.trialAutoApproved },
  });

  return respond(200, { request });
}

// === APPROVE LINK (Client) ===
async function handleApproveLink(body, decoded) {
  const { requestId, note } = body;
  if (!requestId) return respond(400, { error: 'Request ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });
  if (profile.role !== 'client') return respond(403, { error: 'Only clients can approve link requests.' });

  const db = getDb();
  const snap = await db.ref('accessRequests/' + requestId).once('value');
  const request = snap.val();
  if (!request) return respond(404, { error: 'Request not found.' });
  if (request.status !== 'submitted') return respond(400, { error: 'Request is not in submitted status.' });

  request.steps[0].status = 'approved';
  request.steps[0].completedAt = new Date().toISOString();
  request.steps[0].note = note || '';
  request.status = 'approved_by_client';
  request.auditTrail.push({ action: 'approved_by_client', by: decoded.uid, at: new Date().toISOString(), note: note || '' });

  await db.ref('accessRequests/' + requestId).update(request);

  // Create notification for org director
  if (request.steps[1].assignee) {
    const notifId = Date.now().toString();
    await db.ref('notifications/' + notifId).set({
      id: notifId,
      tenantId: request.tenantId,
      recipientUid: request.steps[1].assignee,
      type: 'org_acceptance_required',
      title: 'Organization link request requires your acceptance for project: ' + request.projectName,
      referenceType: 'access_request',
      referenceId: requestId,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }

  await writeAuditLog(db, {
    action: 'link_org_approved_by_client',
    actor: decoded.uid,
    targetType: 'access_request',
    targetId: requestId,
    projectId: request.projectId,
    details: { orgName: request.orgName, note },
  });

  return respond(200, { request });
}

// === ACCEPT LINK (Org Director) ===
async function handleAcceptLink(body, decoded) {
  const { requestId, note } = body;
  if (!requestId) return respond(400, { error: 'Request ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('accessRequests/' + requestId).once('value');
  const request = snap.val();
  if (!request) return respond(404, { error: 'Request not found.' });
  if (request.status !== 'approved_by_client') return respond(400, { error: 'Request must be approved by client first.' });

  // Verify this user is from the org being linked
  if (profile.organizationId !== request.orgId && profile.role !== 'client') {
    return respond(403, { error: 'Only the organization director or client can accept this request.' });
  }

  request.steps[1].status = 'accepted';
  request.steps[1].completedAt = new Date().toISOString();
  request.steps[1].note = note || '';
  request.status = 'active';
  request.auditTrail.push({ action: 'accepted_by_org', by: decoded.uid, at: new Date().toISOString(), note: note || '' });

  await db.ref('accessRequests/' + requestId).update(request);

  // Create the actual org-project link
  const linkId = Date.now().toString() + '_link';
  const org = (await db.ref('organizations/' + request.orgId).once('value')).val();
  const link = {
    id: linkId,
    orgId: request.orgId,
    orgName: request.orgName,
    orgType: request.orgType,
    role: request.proposedRoleTemplate || (request.orgType === 'consultant_firm' ? 'Consultant' : 'Contractor'),
    projectId: request.projectId,
    projectName: request.projectName,
    accessRequestId: requestId,
    createdBy: decoded.uid,
    createdByName: profile.name || profile.email,
    createdByRole: profile.role,
    createdAt: new Date().toISOString(),
  };
  await db.ref('project_org_links/' + linkId).set(link);

  await writeAuditLog(db, {
    action: 'link_org_accepted_by_org',
    actor: decoded.uid,
    targetType: 'access_request',
    targetId: requestId,
    projectId: request.projectId,
    details: { orgName: request.orgName, note },
  });

  return respond(200, { request, link });
}

// === ASSIGN USER (with role binding) ===
async function handleAssignUser(body, decoded) {
  const { userId, projectId, packageId, role, designation } = body;
  if (!userId || !projectId) return respond(400, { error: 'User ID and Project ID are required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();

  const [userSnap, projSnap] = await Promise.all([
    db.ref('users/' + userId).once('value'),
    db.ref('projects/' + projectId).once('value'),
  ]);
  const user = userSnap.val();
  const project = projSnap.val();
  if (!user) return respond(404, { error: 'User not found.' });
  if (!project) return respond(404, { error: 'Project not found.' });

  // Create role binding
  const bindingId = Date.now().toString();
  const binding = {
    id: bindingId,
    tenantId: profile.tenantId || 'default',
    uid: userId,
    userName: user.name || user.email,
    userRole: user.role,
    userOrgId: user.organizationId || null,
    userOrgName: user.organizationName || null,
    role: role || 'data_entry',
    designation: designation || 'team_member',
    scope: packageId ? 'package' : 'project',
    scopeId: packageId || projectId,
    projectId,
    projectName: project.name,
    packageId: packageId || null,
    grantedBy: decoded.uid,
    grantedByName: profile.name || profile.email,
    grantedByRole: profile.role,
    grantedAt: new Date().toISOString(),
    status: 'active',
  };

  await db.ref('roleBindings/' + bindingId).set(binding);

  // Also create project_assignment for backward compatibility
  const assignmentId = bindingId + '_assign';
  const assignment = {
    id: assignmentId,
    userId,
    userName: user.name || user.email,
    userEmail: user.email,
    userRole: user.role,
    userOrgId: user.organizationId || null,
    userOrgName: user.organizationName || null,
    designation: designation || 'team_member',
    projectId,
    projectName: project.name,
    roleBindingId: bindingId,
    createdBy: decoded.uid,
    createdByName: profile.name || profile.email,
    createdByRole: profile.role,
    createdAt: new Date().toISOString(),
  };
  await db.ref('project_assignments/' + assignmentId).set(assignment);

  // Update denormalized indexes
  await Promise.all([
    db.ref('_indexes/userScopes/' + userId + '/projects/' + projectId).set({
      role: role || 'data_entry', bindingId, designation: designation || 'team_member',
    }),
    db.ref('_indexes/projectMembers/' + projectId + '/users/' + userId).set({
      role: role || 'data_entry', orgId: user.organizationId || null, designation: designation || 'team_member',
    }),
  ]);

  if (packageId) {
    await db.ref('_indexes/packageMembers/' + packageId + '/users/' + userId).set({
      role: role || 'data_entry', bindingId,
    });
  }

  await writeAuditLog(db, {
    action: 'user_assigned',
    actor: decoded.uid,
    targetType: 'user',
    targetId: userId,
    projectId,
    details: { userName: user.name, role: role || 'data_entry', designation: designation || 'team_member', packageId },
  });

  return respond(200, { binding, assignment });
}

// === CHANGE ROLE ===
async function handleChangeRole(body, decoded) {
  const { bindingId, newRole } = body;
  if (!bindingId || !newRole) return respond(400, { error: 'Binding ID and new role are required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('roleBindings/' + bindingId).once('value');
  const binding = snap.val();
  if (!binding) return respond(404, { error: 'Role binding not found.' });

  const oldRole = binding.role;
  await db.ref('roleBindings/' + bindingId).update({
    role: newRole,
    updatedBy: decoded.uid,
    updatedAt: new Date().toISOString(),
  });

  // Update indexes
  const indexPath = binding.scope === 'package'
    ? '_indexes/packageMembers/' + binding.scopeId + '/users/' + binding.uid + '/role'
    : '_indexes/projectMembers/' + binding.projectId + '/users/' + binding.uid + '/role';
  await db.ref(indexPath).set(newRole);

  await writeAuditLog(db, {
    action: 'role_changed',
    actor: decoded.uid,
    targetType: 'role_binding',
    targetId: bindingId,
    projectId: binding.projectId,
    details: { uid: binding.uid, oldRole, newRole },
  });

  return respond(200, { success: true, oldRole, newRole });
}

// === REVOKE ACCESS ===
async function handleRevoke(body, decoded) {
  const { bindingId, reason } = body;
  if (!bindingId) return respond(400, { error: 'Binding ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('roleBindings/' + bindingId).once('value');
  const binding = snap.val();
  if (!binding) return respond(404, { error: 'Role binding not found.' });

  await db.ref('roleBindings/' + bindingId).update({
    status: 'revoked',
    revokedBy: decoded.uid,
    revokedAt: new Date().toISOString(),
    revokeReason: reason || '',
  });

  // Clean up indexes
  await Promise.all([
    db.ref('_indexes/userScopes/' + binding.uid + '/projects/' + binding.projectId).remove(),
    db.ref('_indexes/projectMembers/' + binding.projectId + '/users/' + binding.uid).remove(),
  ]);
  if (binding.packageId) {
    await db.ref('_indexes/packageMembers/' + binding.packageId + '/users/' + binding.uid).remove();
  }

  await writeAuditLog(db, {
    action: 'access_revoked',
    actor: decoded.uid,
    targetType: 'role_binding',
    targetId: bindingId,
    projectId: binding.projectId,
    details: { uid: binding.uid, role: binding.role, reason },
  });

  return respond(200, { success: true });
}

// === MY SCOPES ===
async function handleMyScopes(body, decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();

  // Get user's scopes from denormalized index
  const scopesSnap = await db.ref('_indexes/userScopes/' + decoded.uid).once('value');
  const scopes = scopesSnap.val() || {};

  // Get direct role bindings
  const bindingsSnap = await db.ref('roleBindings')
    .orderByChild('uid')
    .equalTo(decoded.uid)
    .once('value');
  const bindings = Object.values(bindingsSnap.val() || {}).filter(b => b.status === 'active');

  // Get active delegations
  const now = new Date().toISOString();
  const delegationsSnap = await db.ref('delegations')
    .orderByChild('delegateeId')
    .equalTo(decoded.uid)
    .once('value');
  const delegations = Object.values(delegationsSnap.val() || {}).filter(d =>
    d.status === 'active' && d.startDate <= now && d.endDate >= now
  );

  return respond(200, {
    uid: decoded.uid,
    profile: { name: profile.name, email: profile.email, role: profile.role, orgId: profile.organizationId },
    scopes,
    bindings,
    delegations,
    trialMode: CONFIG.TRIAL_MODE,
  });
}

// === BREAK GLASS ===
async function handleBreakGlass(body, decoded) {
  const { requestId, note } = body;
  if (!requestId) return respond(400, { error: 'Request ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  try {
    await breakGlassOverride(db, requestId, decoded.uid, note);
  } catch (e) {
    return respond(400, { error: 'Break-glass override failed.' });
  }

  // Force-activate the request
  const snap = await db.ref('accessRequests/' + requestId).once('value');
  const request = snap.val();
  if (!request) return respond(404, { error: 'Request not found.' });

  request.status = 'active';
  request.steps.forEach(s => {
    if (s.status === 'pending') {
      s.status = 'break_glass_override';
      s.completedAt = new Date().toISOString();
      s.note = 'Break-glass override by ' + (profile.name || profile.email) + ': ' + note;
    }
  });
  request.auditTrail.push({
    action: 'break_glass_override',
    by: decoded.uid,
    at: new Date().toISOString(),
    note,
    severity: 'HIGH',
  });

  await db.ref('accessRequests/' + requestId).update(request);

  return respond(200, { request, breakGlass: true });
}

// === LIST ACCESS REQUESTS ===
async function handleListAccessRequests(body, decoded) {
  const { status, projectId } = body;

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('accessRequests').once('value');
  let requests = Object.values(snap.val() || {});

  if (projectId) requests = requests.filter(r => r.projectId === projectId);
  if (status) requests = requests.filter(r => r.status === status);

  // Filter based on role
  if (profile.role === 'consultant' || profile.role === 'contractor') {
    requests = requests.filter(r =>
      r.orgId === profile.organizationId || r.initiatedBy === decoded.uid
    );
  }

  requests.sort((a, b) => (b.initiatedAt || '').localeCompare(a.initiatedAt || ''));
  return respond(200, { requests });
}

// === MAIN HANDLER ===
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Authentication required.' });

  const db = getDb();
  const clientId = getClientId(event, decoded);
  const rateCheck = await checkRateLimit(db, clientId, 'api');
  if (!rateCheck.allowed) {
    return respond(429, { error: 'Too many requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;
    console.log('[ACCESS] Action:', action, 'User:', decoded.uid);

    switch (action) {
      case 'linkOrgRequest':     return await handleLinkOrgRequest(body, decoded);
      case 'approveLink':        return await handleApproveLink(body, decoded);
      case 'acceptLink':         return await handleAcceptLink(body, decoded);
      case 'assignUser':         return await handleAssignUser(body, decoded);
      case 'changeRole':         return await handleChangeRole(body, decoded);
      case 'revoke':             return await handleRevoke(body, decoded);
      case 'myScopes':           return await handleMyScopes(body, decoded);
      case 'breakGlass':         return await handleBreakGlass(body, decoded);
      case 'listRequests':       return await handleListAccessRequests(body, decoded);
      default: return respond(400, { error: 'Invalid action.' });
    }
  } catch (err) {
    console.error('[ACCESS] Error:', err);
    return respond(500, { error: 'Internal server error.' });
  }
};
