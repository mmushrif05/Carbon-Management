const { getDb, verifyToken, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');
const { PROJECT_ID } = require('./utils/config');

// ===== ORGANIZATIONS & ASSIGNMENTS API =====
// Manages the enterprise hierarchy:
//   Client → Consultant Firms → Contractor Companies
// And the assignment of specific consultants to specific contractors.

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

// === CREATE ORGANIZATION ===
async function handleCreateOrg(body, decoded) {
  const { name, type } = body;

  if (!name || !name.trim()) return respond(400, { error: 'Organization name is required.' });
  if (!type || !['consultant_firm', 'contractor_company'].includes(type)) {
    return respond(400, { error: 'Type must be "consultant_firm" or "contractor_company".' });
  }

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  // Only clients and consultants can create organizations
  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can create organizations.' });
  }

  const db = getDb();
  const project = profile.project || PROJECT_ID;
  const orgId = Date.now().toString();

  const org = {
    id: orgId,
    name: name.trim(),
    type,
    project,
    createdBy: decoded.uid,
    createdByName: profile.name || profile.email,
    createdAt: new Date().toISOString()
  };

  await db.ref('organizations/' + orgId).set(org);
  console.log('[ORG] Created organization:', orgId, name.trim(), type);

  return respond(200, { organization: org });
}

// === LIST ORGANIZATIONS ===
async function handleListOrgs(decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const project = profile.project || PROJECT_ID;

  const snap = await db.ref('organizations')
    .orderByChild('project')
    .equalTo(project)
    .once('value');

  const data = snap.val() || {};
  const organizations = Object.values(data)
    .sort((a, b) => a.name.localeCompare(b.name));

  return respond(200, { organizations });
}

// === UPDATE ORGANIZATION ===
// Cascades the name change to all related records:
// users, org_links, assignments, project_org_links, entries, a5entries
async function handleUpdateOrg(body, decoded) {
  const { orgId, name } = body;
  if (!orgId) return respond(400, { error: 'Organization ID is required.' });
  if (!name || !name.trim()) return respond(400, { error: 'Organization name is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can update organizations.' });
  }

  const db = getDb();
  const snap = await db.ref('organizations/' + orgId).once('value');
  const org = snap.val();
  if (!org) return respond(404, { error: 'Organization not found.' });

  const newName = name.trim();
  const updates = {};

  // 1. Update the organization record itself
  updates['organizations/' + orgId + '/name'] = newName;
  updates['organizations/' + orgId + '/updatedAt'] = new Date().toISOString();
  updates['organizations/' + orgId + '/updatedBy'] = decoded.uid;

  // 2. Cascade to users with this organizationId
  const usersSnap = await db.ref('users')
    .orderByChild('organizationId')
    .equalTo(orgId)
    .once('value');
  const users = usersSnap.val() || {};
  for (const uid of Object.keys(users)) {
    updates['users/' + uid + '/organizationName'] = newName;
  }

  // 3. Cascade to org_links (consultant firm ↔ contractor company)
  const orgLinksSnap = await db.ref('org_links').once('value');
  const orgLinks = orgLinksSnap.val() || {};
  for (const [linkId, link] of Object.entries(orgLinks)) {
    if (link.consultantOrgId === orgId) {
      updates['org_links/' + linkId + '/consultantOrgName'] = newName;
    }
    if (link.contractorOrgId === orgId) {
      updates['org_links/' + linkId + '/contractorOrgName'] = newName;
    }
  }

  // 4. Cascade to assignments (consultant ↔ contractor user-level)
  const assignSnap = await db.ref('assignments').once('value');
  const assignments = assignSnap.val() || {};
  for (const [aId, a] of Object.entries(assignments)) {
    if (a.consultantOrgId === orgId) {
      updates['assignments/' + aId + '/consultantOrgName'] = newName;
    }
    if (a.contractorOrgId === orgId) {
      updates['assignments/' + aId + '/contractorOrgName'] = newName;
    }
  }

  // 5. Cascade to project_org_links
  const projOrgSnap = await db.ref('project_org_links').once('value');
  const projOrgLinks = projOrgSnap.val() || {};
  for (const [lId, l] of Object.entries(projOrgLinks)) {
    if (l.orgId === orgId) {
      updates['project_org_links/' + lId + '/orgName'] = newName;
    }
  }

  // 6. Cascade to entries (A1-A3)
  const project = profile.project || PROJECT_ID;
  const entriesSnap = await db.ref('projects/' + project + '/entries').once('value');
  const entries = entriesSnap.val() || {};
  for (const [eId, e] of Object.entries(entries)) {
    if (e.organizationId === orgId) {
      updates['projects/' + project + '/entries/' + eId + '/organizationName'] = newName;
    }
  }

  // 7. Cascade to A5 entries
  const a5Snap = await db.ref('projects/' + project + '/a5entries').once('value');
  const a5entries = a5Snap.val() || {};
  for (const [eId, e] of Object.entries(a5entries)) {
    if (e.organizationId === orgId) {
      updates['projects/' + project + '/a5entries/' + eId + '/organizationName'] = newName;
    }
  }

  // Apply all updates atomically
  await db.ref().update(updates);

  const cascadeCount = Object.keys(updates).length - 3; // minus the 3 org fields
  console.log('[ORG] Renamed organization:', orgId, '"' + org.name + '" → "' + newName + '"', '(' + cascadeCount + ' related records updated)');

  return respond(200, { success: true, cascadeCount });
}

// === DELETE ORGANIZATION ===
async function handleDeleteOrg(body, decoded) {
  const { orgId } = body;
  if (!orgId) return respond(400, { error: 'Organization ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  // Only clients can delete organizations
  if (profile.role !== 'client') {
    return respond(403, { error: 'Only clients can delete organizations.' });
  }

  const db = getDb();
  const snap = await db.ref('organizations/' + orgId).once('value');
  if (!snap.val()) return respond(404, { error: 'Organization not found.' });

  // Check if any users are assigned to this organization
  const usersSnap = await db.ref('users')
    .orderByChild('organizationId')
    .equalTo(orgId)
    .once('value');

  if (usersSnap.val()) {
    return respond(400, { error: 'Cannot delete organization with assigned users. Reassign them first.' });
  }

  await db.ref('organizations/' + orgId).remove();

  // Also remove any assignments referencing this org
  const assignSnap = await db.ref('assignments').once('value');
  const assignments = assignSnap.val() || {};
  const toDelete = {};
  for (const [id, a] of Object.entries(assignments)) {
    if (a.consultantOrgId === orgId || a.contractorOrgId === orgId) {
      toDelete['assignments/' + id] = null;
    }
  }
  if (Object.keys(toDelete).length > 0) {
    await db.ref().update(toDelete);
  }

  console.log('[ORG] Deleted organization:', orgId);
  return respond(200, { success: true });
}

// === ASSIGN USER TO ORGANIZATION ===
async function handleAssignUserToOrg(body, decoded) {
  const { userId, orgId, projectId } = body;
  if (!userId || !orgId) return respond(400, { error: 'User ID and Organization ID are required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can assign users to organizations.' });
  }

  const db = getDb();

  // Verify the organization exists
  const orgSnap = await db.ref('organizations/' + orgId).once('value');
  const org = orgSnap.val();
  if (!org) return respond(404, { error: 'Organization not found.' });

  // Verify the user exists
  const userSnap = await db.ref('users/' + userId).once('value');
  const user = userSnap.val();
  if (!user) return respond(404, { error: 'User not found.' });

  // Validate: consultants go to consultant_firm, contractors go to contractor_company
  if (user.role === 'consultant' && org.type !== 'consultant_firm') {
    return respond(400, { error: 'Consultants can only be assigned to consultant firms.' });
  }
  if (user.role === 'contractor' && org.type !== 'contractor_company') {
    return respond(400, { error: 'Contractors can only be assigned to contractor companies.' });
  }

  // Optionally verify project exists
  let projectName = null;
  if (projectId) {
    const projSnap = await db.ref('projects/' + projectId).once('value');
    const proj = projSnap.val();
    if (!proj) return respond(404, { error: 'Project not found.' });
    projectName = proj.name;
  }

  // Update user profile with organization
  const updates = {
    organizationId: orgId,
    organizationName: org.name
  };
  if (projectId) {
    // Add project to user's project list (stored as comma-separated or array)
    const userSnap2 = await db.ref('users/' + userId).once('value');
    const currentUser = userSnap2.val() || {};
    const existingProjects = currentUser.projectIds || [];
    if (!existingProjects.includes(projectId)) {
      updates.projectIds = [...existingProjects, projectId];
    }
  }
  await db.ref('users/' + userId).update(updates);

  console.log('[ORG] User', userId, 'assigned to org:', orgId, org.name, projectId ? '(project: ' + projectName + ')' : '');
  return respond(200, { success: true });
}

// === LINK CONTRACTOR COMPANY TO CONSULTANT FIRM ===
// This creates the relationship: which consultant firm oversees which contractor company
async function handleLinkOrgs(body, decoded) {
  const { consultantOrgId, contractorOrgId, projectId } = body;
  if (!consultantOrgId || !contractorOrgId) {
    return respond(400, { error: 'Both consultant firm ID and contractor company ID are required.' });
  }

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can link organizations.' });
  }

  const db = getDb();

  // Verify both orgs exist and are correct types
  const [cSnap, rSnap] = await Promise.all([
    db.ref('organizations/' + consultantOrgId).once('value'),
    db.ref('organizations/' + contractorOrgId).once('value')
  ]);

  const consultantOrg = cSnap.val();
  const contractorOrg = rSnap.val();

  if (!consultantOrg) return respond(404, { error: 'Consultant firm not found.' });
  if (!contractorOrg) return respond(404, { error: 'Contractor company not found.' });

  if (consultantOrg.type !== 'consultant_firm') {
    return respond(400, { error: 'First organization must be a consultant firm.' });
  }
  if (contractorOrg.type !== 'contractor_company') {
    return respond(400, { error: 'Second organization must be a contractor company.' });
  }

  // Optionally verify project exists
  let projectName = null;
  if (projectId) {
    const projSnap = await db.ref('projects/' + projectId).once('value');
    const proj = projSnap.val();
    if (!proj) return respond(404, { error: 'Project not found.' });
    projectName = proj.name;
  }

  // Check if link already exists (same orgs + same project)
  const existingSnap = await db.ref('org_links').once('value');
  const existingLinks = existingSnap.val() || {};
  const alreadyLinked = Object.values(existingLinks).find(
    l => l.consultantOrgId === consultantOrgId && l.contractorOrgId === contractorOrgId && (l.projectId || null) === (projectId || null)
  );
  if (alreadyLinked) {
    return respond(400, { error: 'These organizations are already linked' + (projectId ? ' for this project.' : '.') });
  }

  const linkId = Date.now().toString();
  const link = {
    id: linkId,
    consultantOrgId,
    consultantOrgName: consultantOrg.name,
    contractorOrgId,
    contractorOrgName: contractorOrg.name,
    projectId: projectId || null,
    projectName: projectName,
    project: profile.project || PROJECT_ID,
    createdBy: decoded.uid,
    createdAt: new Date().toISOString()
  };

  await db.ref('org_links/' + linkId).set(link);
  console.log('[ORG] Linked orgs:', consultantOrg.name, '→', contractorOrg.name);

  return respond(200, { link });
}

// === UNLINK ORGANIZATIONS ===
async function handleUnlinkOrgs(body, decoded) {
  const { linkId } = body;
  if (!linkId) return respond(400, { error: 'Link ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can unlink organizations.' });
  }

  const db = getDb();
  const snap = await db.ref('org_links/' + linkId).once('value');
  if (!snap.val()) return respond(404, { error: 'Link not found.' });

  await db.ref('org_links/' + linkId).remove();
  console.log('[ORG] Unlinked orgs:', linkId);

  return respond(200, { success: true });
}

// === LIST ORG LINKS ===
async function handleListLinks(decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const project = profile.project || PROJECT_ID;

  const snap = await db.ref('org_links')
    .orderByChild('project')
    .equalTo(project)
    .once('value');

  const data = snap.val() || {};
  const links = Object.values(data)
    .sort((a, b) => a.consultantOrgName.localeCompare(b.consultantOrgName));

  return respond(200, { links });
}

// === ASSIGN CONSULTANT TO CONTRACTOR (user-level assignment) ===
// A specific consultant user is assigned to review a specific contractor user's submissions
async function handleCreateAssignment(body, decoded) {
  const { consultantUid, contractorUid, projectId } = body;
  if (!consultantUid || !contractorUid) {
    return respond(400, { error: 'Both consultant and contractor user IDs are required.' });
  }

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can create assignments.' });
  }

  const db = getDb();

  // Verify both users exist and have correct roles
  const [consSnap, contrSnap] = await Promise.all([
    db.ref('users/' + consultantUid).once('value'),
    db.ref('users/' + contractorUid).once('value')
  ]);

  const consultant = consSnap.val();
  const contractor = contrSnap.val();

  if (!consultant) return respond(404, { error: 'Consultant user not found.' });
  if (!contractor) return respond(404, { error: 'Contractor user not found.' });

  if (consultant.role !== 'consultant') {
    return respond(400, { error: 'The first user must be a consultant.' });
  }
  if (contractor.role !== 'contractor') {
    return respond(400, { error: 'The second user must be a contractor.' });
  }

  // Optionally verify project exists
  let projectName = null;
  if (projectId) {
    const db2 = getDb();
    const projSnap = await db2.ref('projects/' + projectId).once('value');
    const proj = projSnap.val();
    if (!proj) return respond(404, { error: 'Project not found.' });
    projectName = proj.name;
  }

  // Check for existing assignment (same users + same project)
  const existingSnap = await db.ref('assignments').once('value');
  const existing = existingSnap.val() || {};
  const alreadyAssigned = Object.values(existing).find(
    a => a.consultantUid === consultantUid && a.contractorUid === contractorUid && (a.projectId || null) === (projectId || null)
  );
  if (alreadyAssigned) {
    return respond(400, { error: 'This assignment already exists' + (projectId ? ' for this project.' : '.') });
  }

  const assignmentId = Date.now().toString();
  const assignment = {
    id: assignmentId,
    consultantUid,
    consultantName: consultant.name || consultant.email,
    consultantOrgId: consultant.organizationId || null,
    consultantOrgName: consultant.organizationName || null,
    contractorUid,
    contractorName: contractor.name || contractor.email,
    contractorOrgId: contractor.organizationId || null,
    contractorOrgName: contractor.organizationName || null,
    projectId: projectId || null,
    projectName: projectName,
    project: profile.project || PROJECT_ID,
    createdBy: decoded.uid,
    createdByName: profile.name || profile.email,
    createdAt: new Date().toISOString()
  };

  await db.ref('assignments/' + assignmentId).set(assignment);
  console.log('[ORG] Assignment created:', consultant.name, '→', contractor.name);

  return respond(200, { assignment });
}

// === DELETE ASSIGNMENT ===
async function handleDeleteAssignment(body, decoded) {
  const { assignmentId } = body;
  if (!assignmentId) return respond(400, { error: 'Assignment ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can remove assignments.' });
  }

  const db = getDb();
  const snap = await db.ref('assignments/' + assignmentId).once('value');
  if (!snap.val()) return respond(404, { error: 'Assignment not found.' });

  await db.ref('assignments/' + assignmentId).remove();
  console.log('[ORG] Assignment deleted:', assignmentId);

  return respond(200, { success: true });
}

// === LIST ASSIGNMENTS ===
async function handleListAssignments(decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const project = profile.project || PROJECT_ID;

  const snap = await db.ref('assignments')
    .orderByChild('project')
    .equalTo(project)
    .once('value');

  const data = snap.val() || {};
  let assignments = Object.values(data);

  // If the user is a consultant, only show their own assignments
  if (profile.role === 'consultant') {
    assignments = assignments.filter(a => a.consultantUid === decoded.uid);
  }

  assignments.sort((a, b) => (a.consultantName || '').localeCompare(b.consultantName || ''));

  return respond(200, { assignments });
}

// === LIST USERS (for assignment UI) ===
async function handleListUsers(decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can view the user list.' });
  }

  const db = getDb();
  const snap = await db.ref('users').once('value');
  const data = snap.val() || {};

  const users = Object.entries(data).map(([uid, u]) => ({
    uid,
    name: u.name || u.email,
    email: u.email,
    role: u.role,
    organizationId: u.organizationId || null,
    organizationName: u.organizationName || null,
    project: u.project
  })).filter(u => u.project === (profile.project || PROJECT_ID));

  return respond(200, { users });
}

// === UPDATE USER NAME ===
// Cascades the name change to all related records:
// assignments, project_assignments, entries, a5entries
async function handleUpdateUserName(body, decoded) {
  const { userId, name } = body;
  if (!userId) return respond(400, { error: 'User ID is required.' });
  if (!name || !name.trim()) return respond(400, { error: 'User name is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can update user names.' });
  }

  const db = getDb();
  const userSnap = await db.ref('users/' + userId).once('value');
  const user = userSnap.val();
  if (!user) return respond(404, { error: 'User not found.' });

  const newName = name.trim();
  const updates = {};

  // 1. Update the user record itself
  updates['users/' + userId + '/name'] = newName;

  // 2. Cascade to assignments (consultant ↔ contractor user-level)
  const assignSnap = await db.ref('assignments').once('value');
  const assignments = assignSnap.val() || {};
  for (const [aId, a] of Object.entries(assignments)) {
    if (a.consultantUid === userId) {
      updates['assignments/' + aId + '/consultantName'] = newName;
    }
    if (a.contractorUid === userId) {
      updates['assignments/' + aId + '/contractorName'] = newName;
    }
  }

  // 3. Cascade to project_assignments
  const paSnap = await db.ref('project_assignments').once('value');
  const projectAssignments = paSnap.val() || {};
  for (const [paId, pa] of Object.entries(projectAssignments)) {
    if (pa.userId === userId) {
      updates['project_assignments/' + paId + '/userName'] = newName;
    }
    if (pa.createdBy === userId) {
      updates['project_assignments/' + paId + '/createdByName'] = newName;
    }
  }

  // 4. Cascade to entries (A1-A3) - submittedBy / approvedBy
  const project = user.project || profile.project || PROJECT_ID;
  const entriesSnap = await db.ref('projects/' + project + '/entries').once('value');
  const entries = entriesSnap.val() || {};
  for (const [eId, e] of Object.entries(entries)) {
    if (e.submittedBy === userId) {
      updates['projects/' + project + '/entries/' + eId + '/submittedByName'] = newName;
    }
  }

  // 5. Cascade to A5 entries
  const a5Snap = await db.ref('projects/' + project + '/a5entries').once('value');
  const a5entries = a5Snap.val() || {};
  for (const [eId, e] of Object.entries(a5entries)) {
    if (e.submittedBy === userId) {
      updates['projects/' + project + '/a5entries/' + eId + '/submittedByName'] = newName;
    }
  }

  // 6. Cascade to project_org_links (createdByName)
  const polSnap = await db.ref('project_org_links').once('value');
  const projOrgLinks = polSnap.val() || {};
  for (const [lId, l] of Object.entries(projOrgLinks)) {
    if (l.createdBy === userId) {
      updates['project_org_links/' + lId + '/createdByName'] = newName;
    }
  }

  // Apply all updates atomically
  await db.ref().update(updates);

  const cascadeCount = Object.keys(updates).length - 1;
  console.log('[ORG] Renamed user:', userId, '"' + (user.name || user.email) + '" → "' + newName + '"', '(' + cascadeCount + ' related records updated)');

  return respond(200, { success: true, cascadeCount });
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

    switch (action) {
      // Organizations
      case 'create-org':         return await handleCreateOrg(body, decoded);
      case 'list-orgs':          return await handleListOrgs(decoded);
      case 'update-org':         return await handleUpdateOrg(body, decoded);
      case 'delete-org':         return await handleDeleteOrg(body, decoded);

      // User-to-org assignment
      case 'assign-user-to-org': return await handleAssignUserToOrg(body, decoded);

      // Org-to-org links (consultant firm ↔ contractor company)
      case 'link-orgs':          return await handleLinkOrgs(body, decoded);
      case 'unlink-orgs':        return await handleUnlinkOrgs(body, decoded);
      case 'list-links':         return await handleListLinks(decoded);

      // User-to-user assignments (consultant ↔ contractor)
      case 'create-assignment':  return await handleCreateAssignment(body, decoded);
      case 'delete-assignment':  return await handleDeleteAssignment(body, decoded);
      case 'list-assignments':   return await handleListAssignments(decoded);

      // User management
      case 'list-users':         return await handleListUsers(decoded);
      case 'update-user':        return await handleUpdateUserName(body, decoded);

      default: return respond(400, { error: 'Invalid action.' });
    }
  } catch (e) {
    console.error('[ORG] Server error:', e);
    return respond(500, { error: 'Internal server error.' });
  }
};
