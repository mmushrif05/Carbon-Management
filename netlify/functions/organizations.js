const { getDb, verifyToken, respond, optionsResponse } = require('./utils/firebase');

// ===== ORGANIZATIONS & ASSIGNMENTS API =====
// Manages the enterprise hierarchy:
//   Client (KSIA) → Consultant Firms (Parsons, Bechtel) → Contractor Companies
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
  const project = profile.project || 'ksia';
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
  const project = profile.project || 'ksia';

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
  if (!snap.val()) return respond(404, { error: 'Organization not found.' });

  await db.ref('organizations/' + orgId).update({
    name: name.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: decoded.uid
  });

  return respond(200, { success: true });
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
  const { userId, orgId } = body;
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

  // Update user profile with organization
  await db.ref('users/' + userId).update({
    organizationId: orgId,
    organizationName: org.name
  });

  console.log('[ORG] User', userId, 'assigned to org:', orgId, org.name);
  return respond(200, { success: true });
}

// === LINK CONTRACTOR COMPANY TO CONSULTANT FIRM ===
// This creates the relationship: which consultant firm oversees which contractor company
async function handleLinkOrgs(body, decoded) {
  const { consultantOrgId, contractorOrgId } = body;
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

  // Check if link already exists
  const existingSnap = await db.ref('org_links').once('value');
  const existingLinks = existingSnap.val() || {};
  const alreadyLinked = Object.values(existingLinks).find(
    l => l.consultantOrgId === consultantOrgId && l.contractorOrgId === contractorOrgId
  );
  if (alreadyLinked) {
    return respond(400, { error: 'These organizations are already linked.' });
  }

  const linkId = Date.now().toString();
  const link = {
    id: linkId,
    consultantOrgId,
    consultantOrgName: consultantOrg.name,
    contractorOrgId,
    contractorOrgName: contractorOrg.name,
    project: profile.project || 'ksia',
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
  const project = profile.project || 'ksia';

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
  const { consultantUid, contractorUid } = body;
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

  // Check for existing assignment
  const existingSnap = await db.ref('assignments').once('value');
  const existing = existingSnap.val() || {};
  const alreadyAssigned = Object.values(existing).find(
    a => a.consultantUid === consultantUid && a.contractorUid === contractorUid
  );
  if (alreadyAssigned) {
    return respond(400, { error: 'This assignment already exists.' });
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
    project: profile.project || 'ksia',
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
  const project = profile.project || 'ksia';

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
  })).filter(u => u.project === (profile.project || 'ksia'));

  return respond(200, { users });
}

// === MAIN HANDLER ===
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Authentication required.' });

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

      // User listing
      case 'list-users':         return await handleListUsers(decoded);

      default: return respond(400, { error: 'Invalid action.' });
    }
  } catch (e) {
    console.error('[ORG] Server error:', e);
    return respond(500, { error: 'Server error: ' + (e.message || 'Unknown') });
  }
};
