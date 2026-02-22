const { getDb, verifyToken, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

// ===== PROJECTS API =====
// Manages projects within the platform.
// A client may have 10-15 projects. Consultants and contractors are assigned to specific projects.
// All organization links, user assignments, and data entries are scoped to projects.

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

// === CREATE PROJECT ===
async function handleCreateProject(body, decoded) {
  const { name, description, code, status, packageIds } = body;

  if (!name || !name.trim()) return respond(400, { error: 'Project name is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) {
    console.error('[PROJECT] Profile not found for uid:', decoded.uid);
    return respond(403, { error: 'User profile not found in the database. This can happen if the account was created but the profile was not saved. Please contact an administrator.' });
  }

  if (profile.role !== 'client') {
    console.warn('[PROJECT] Role check failed:', profile.role, 'for uid:', decoded.uid);
    return respond(403, { error: 'Only clients can create projects. Your role is: ' + profile.role });
  }

  const db = getDb();
  const projectId = Date.now().toString();

  const project = {
    id: projectId,
    name: name.trim(),
    description: (description || '').trim(),
    code: (code || '').trim(),
    packageIds: (packageIds && typeof packageIds === 'object') ? packageIds : {},
    status: status || 'active',
    createdBy: decoded.uid,
    createdByName: profile.name || profile.email,
    createdByRole: profile.role,
    createdAt: new Date().toISOString()
  };

  await db.ref('projects/' + projectId).set(project);
  console.log('[PROJECT] Created project:', projectId, name.trim());

  return respond(200, { project });
}

// === LIST PROJECTS ===
async function handleListProjects(decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('projects').once('value');
  const data = snap.val() || {};
  let projects = Object.values(data);

  // Clean up corrupted entries (missing name) — remove from DB in background
  const corrupted = projects.filter(p => !p.name);
  if (corrupted.length > 0) {
    const cleanup = {};
    corrupted.forEach(p => { if (p.id) cleanup['projects/' + p.id] = null; });
    db.ref().update(cleanup).catch(e => console.warn('[PROJECT] Cleanup error:', e.message));
    projects = projects.filter(p => p.name);
  }

  // If consultant or contractor, show projects they are assigned to, org-linked to, or created
  if (profile.role === 'consultant' || profile.role === 'contractor') {
    const [assignSnap, orgLinkSnap] = await Promise.all([
      db.ref('project_assignments').once('value'),
      db.ref('project_org_links').once('value')
    ]);
    const myProjectIds = new Set();
    // User-level assignments
    Object.values(assignSnap.val() || {}).forEach(a => {
      if (a.userId === decoded.uid) myProjectIds.add(a.projectId);
    });
    // Org-level links (show projects where my org is linked)
    if (profile.organizationId) {
      Object.values(orgLinkSnap.val() || {}).forEach(l => {
        if (l.orgId === profile.organizationId) myProjectIds.add(l.projectId);
      });
    }
    projects = projects.filter(p => myProjectIds.has(p.id) || p.createdBy === decoded.uid);
  }

  projects.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return respond(200, { projects });
}

// === GET PROJECT ===
async function handleGetProject(body, decoded) {
  const { projectId } = body;
  if (!projectId) return respond(400, { error: 'Project ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('projects/' + projectId).once('value');
  const project = snap.val();
  if (!project) return respond(404, { error: 'Project not found.' });

  return respond(200, { project });
}

// === UPDATE PROJECT ===
async function handleUpdateProject(body, decoded) {
  const { projectId, name, description, code, status, packageIds } = body;
  if (!projectId) return respond(400, { error: 'Project ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (profile.role !== 'client') {
    return respond(403, { error: 'Only clients can update projects.' });
  }

  const db = getDb();
  const snap = await db.ref('projects/' + projectId).once('value');
  if (!snap.val()) return respond(404, { error: 'Project not found.' });

  const updates = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
  if (name) updates.name = name.trim();
  if (description !== undefined) updates.description = (description || '').trim();
  if (code !== undefined) updates.code = (code || '').trim();
  if (packageIds !== undefined) updates.packageIds = (packageIds && typeof packageIds === 'object') ? packageIds : {};
  if (status) updates.status = status;

  await db.ref('projects/' + projectId).update(updates);
  console.log('[PROJECT] Updated project:', projectId);

  return respond(200, { success: true });
}

// === DELETE PROJECT ===
async function handleDeleteProject(body, decoded) {
  const { projectId } = body;
  if (!projectId) return respond(400, { error: 'Project ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (profile.role !== 'client') {
    return respond(403, { error: 'Only clients can delete projects.' });
  }

  const db = getDb();
  const snap = await db.ref('projects/' + projectId).once('value');
  if (!snap.val()) return respond(404, { error: 'Project not found.' });

  // Remove associated project assignments
  const assignSnap = await db.ref('project_assignments').once('value');
  const assignments = assignSnap.val() || {};
  const toDelete = {};
  for (const [id, a] of Object.entries(assignments)) {
    if (a.projectId === projectId) {
      toDelete['project_assignments/' + id] = null;
    }
  }

  // Remove associated project org links
  const orgLinkSnap = await db.ref('project_org_links').once('value');
  const orgLinks = orgLinkSnap.val() || {};
  for (const [id, l] of Object.entries(orgLinks)) {
    if (l.projectId === projectId) {
      toDelete['project_org_links/' + id] = null;
    }
  }

  toDelete['projects/' + projectId] = null;

  await db.ref().update(toDelete);
  console.log('[PROJECT] Deleted project:', projectId);

  return respond(200, { success: true });
}

// === BULK DELETE PROJECTS ===
async function handleBulkDeleteProjects(body, decoded) {
  const { projectIds } = body;
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return respond(400, { error: 'projectIds array is required.' });
  }

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });
  if (profile.role !== 'client') {
    return respond(403, { error: 'Only clients can delete projects.' });
  }

  const db = getDb();
  const toDelete = {};

  // Collect all associated assignments and org links
  const [assignSnap, orgLinkSnap] = await Promise.all([
    db.ref('project_assignments').once('value'),
    db.ref('project_org_links').once('value')
  ]);
  const assignments = assignSnap.val() || {};
  const orgLinks = orgLinkSnap.val() || {};
  const idSet = new Set(projectIds);

  for (const [id, a] of Object.entries(assignments)) {
    if (idSet.has(a.projectId)) toDelete['project_assignments/' + id] = null;
  }
  for (const [id, l] of Object.entries(orgLinks)) {
    if (idSet.has(l.projectId)) toDelete['project_org_links/' + id] = null;
  }
  for (const pid of projectIds) {
    toDelete['projects/' + pid] = null;
  }

  await db.ref().update(toDelete);
  console.log('[PROJECT] Bulk deleted', projectIds.length, 'projects');

  return respond(200, { success: true, deleted: projectIds.length });
}

// === ASSIGN USER TO PROJECT ===
async function handleAssignUserToProject(body, decoded) {
  const { userId, projectId, designation } = body;
  if (!userId || !projectId) return respond(400, { error: 'User ID and Project ID are required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  // Enterprise authority model:
  // - Client: can assign any user to any project
  // - Consultant (in-charge on project): can assign own org members + contractor users
  // - Contractor (in-charge on project): can assign own org members only
  const db = getDb();

  if (profile.role === 'contractor') {
    // Contractor in-charge can only assign members of their own org
    const assignSnap = await db.ref('project_assignments').once('value');
    const allAssignments = Object.values(assignSnap.val() || {});
    const isInCharge = allAssignments.find(
      a => a.userId === decoded.uid && a.projectId === projectId && a.designation === 'in_charge'
    );
    if (!isInCharge) {
      return respond(403, { error: 'Only contractor in-charge personnel can assign team members to this project.' });
    }
  } else if (profile.role === 'consultant') {
    // Consultant must be assigned (in-charge) on this project
    const assignSnap = await db.ref('project_assignments').once('value');
    const allAssignments = Object.values(assignSnap.val() || {});
    const isInCharge = allAssignments.find(
      a => a.userId === decoded.uid && a.projectId === projectId && a.designation === 'in_charge'
    );
    if (!isInCharge) {
      return respond(403, { error: 'Only consultant in-charge personnel can assign team members to this project.' });
    }
  } else if (profile.role !== 'client') {
    return respond(403, { error: 'You do not have permission to assign users to projects.' });
  }

  // Verify project exists
  const projSnap = await db.ref('projects/' + projectId).once('value');
  const project = projSnap.val();
  if (!project) return respond(404, { error: 'Project not found.' });

  // Verify user exists
  const userSnap = await db.ref('users/' + userId).once('value');
  const user = userSnap.val();
  if (!user) return respond(404, { error: 'User not found.' });

  // Contractor in-charge can only assign members from their own organization
  if (profile.role === 'contractor') {
    if (user.organizationId !== profile.organizationId) {
      return respond(403, { error: 'Contractors can only assign members from their own organization.' });
    }
  }

  // Consultant in-charge can assign own org members + contractor users
  if (profile.role === 'consultant') {
    if (user.role === 'client') {
      return respond(403, { error: 'Consultants cannot assign client users.' });
    }
    // If assigning a contractor, verify the contractor's org is linked to this project
    if (user.role === 'contractor' && user.organizationId) {
      const orgLinksSnap = await db.ref('project_org_links').once('value');
      const orgLinks = Object.values(orgLinksSnap.val() || {});
      const contractorOrgLinked = orgLinks.find(
        l => l.orgId === user.organizationId && l.projectId === projectId
      );
      if (!contractorOrgLinked) {
        return respond(403, { error: 'The contractor\'s organization must be linked to this project first.' });
      }
    }
  }

  // Check for existing assignment (prevent duplicates)
  const existingSnap2 = await db.ref('project_assignments').once('value');
  const existing = existingSnap2.val() || {};
  const alreadyAssigned = Object.values(existing).find(
    a => a.userId === userId && a.projectId === projectId
  );
  if (alreadyAssigned) {
    return respond(400, { error: 'This user is already assigned to this project.' });
  }

  const validDesignation = designation === 'in_charge' ? 'in_charge' : 'team_member';

  const assignmentId = Date.now().toString();
  const assignment = {
    id: assignmentId,
    userId,
    userName: user.name || user.email,
    userEmail: user.email,
    userRole: user.role,
    userOrgId: user.organizationId || null,
    userOrgName: user.organizationName || null,
    designation: validDesignation,
    projectId,
    projectName: project.name,
    createdBy: decoded.uid,
    createdByName: profile.name || profile.email,
    createdByRole: profile.role,
    createdAt: new Date().toISOString()
  };

  await db.ref('project_assignments/' + assignmentId).set(assignment);
  console.log('[PROJECT] User', user.name, '(' + validDesignation + ') assigned to project:', project.name, 'by', profile.role);

  return respond(200, { assignment });
}

// === REMOVE USER FROM PROJECT ===
async function handleRemoveUserFromProject(body, decoded) {
  const { assignmentId } = body;
  if (!assignmentId) return respond(400, { error: 'Assignment ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('project_assignments/' + assignmentId).once('value');
  const assignment = snap.val();
  if (!assignment) return respond(404, { error: 'Assignment not found.' });

  // Authority: client can remove anyone; consultant/contractor in-charge can remove their team
  if (profile.role === 'client') {
    // Client can remove any assignment
  } else if (profile.role === 'consultant' || profile.role === 'contractor') {
    const allAssignSnap = await db.ref('project_assignments').once('value');
    const allAssign = Object.values(allAssignSnap.val() || {});
    const isInCharge = allAssign.find(
      a => a.userId === decoded.uid && a.projectId === assignment.projectId && a.designation === 'in_charge'
    );
    if (!isInCharge) {
      return respond(403, { error: 'Only in-charge personnel can remove project assignments.' });
    }
    if (profile.role === 'contractor' && assignment.userOrgId !== profile.organizationId) {
      return respond(403, { error: 'Contractors can only remove members from their own organization.' });
    }
  } else {
    return respond(403, { error: 'You do not have permission to remove project assignments.' });
  }

  await db.ref('project_assignments/' + assignmentId).remove();
  console.log('[PROJECT] Removed project assignment:', assignmentId);

  return respond(200, { success: true });
}

// === LIST PROJECT ASSIGNMENTS ===
async function handleListProjectAssignments(body, decoded) {
  const { projectId } = body;

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  let snap;

  if (projectId) {
    // Get assignments for a specific project
    snap = await db.ref('project_assignments')
      .orderByChild('projectId')
      .equalTo(projectId)
      .once('value');
  } else {
    // Get all project assignments
    snap = await db.ref('project_assignments').once('value');
  }

  const data = snap.val() || {};
  let assignments = Object.values(data);

  // Enterprise visibility:
  // - Client: sees all assignments
  // - Consultant/Contractor in-charge: sees all assignments for projects they are in-charge of
  // - Consultant/Contractor team member: sees only their own assignments
  if (profile.role === 'consultant' || profile.role === 'contractor') {
    // Find projects where this user is in-charge
    const allSnap = await db.ref('project_assignments').once('value');
    const allAssign = Object.values(allSnap.val() || {});
    const inChargeProjectIds = new Set(
      allAssign
        .filter(a => a.userId === decoded.uid && a.designation === 'in_charge')
        .map(a => a.projectId)
    );
    // Show all assignments for in-charge projects, plus own assignments for other projects
    assignments = assignments.filter(a =>
      inChargeProjectIds.has(a.projectId) || a.userId === decoded.uid
    );
  }

  assignments.sort((a, b) => (a.projectName || '').localeCompare(b.projectName || ''));
  return respond(200, { assignments });
}

// === LINK ORG TO PROJECT ===
// Associate an organization (consultant firm or contractor company) with a project
// Supports role field for consultant orgs: Consultant, PMC, Delivery Partner, Engineer
async function handleLinkOrgToProject(body, decoded) {
  const { orgId, projectId, role } = body;
  if (!orgId || !projectId) return respond(400, { error: 'Organization ID and Project ID are required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();

  // Fetch org to determine its type
  const [orgSnap, projSnap] = await Promise.all([
    db.ref('organizations/' + orgId).once('value'),
    db.ref('projects/' + projectId).once('value')
  ]);

  const org = orgSnap.val();
  const project = projSnap.val();
  if (!org) return respond(404, { error: 'Organization not found.' });
  if (!project) return respond(404, { error: 'Project not found.' });

  // Authority model for linking organizations:
  // - Client: can link any org (consultant or contractor) to any project
  // - Consultant (in-charge on project): can link contractor companies to the project
  // - Contractor: cannot link organizations
  if (profile.role === 'client') {
    // Client can link any org
  } else if (profile.role === 'consultant') {
    // Consultant can only link contractor companies (not other consultant firms)
    if (org.type !== 'contractor_company') {
      return respond(403, { error: 'Consultants can only link contractor companies to projects. Contact the client to link consultant firms.' });
    }
    // Must be in-charge on this project
    const assignSnap = await db.ref('project_assignments').once('value');
    const allAssign = Object.values(assignSnap.val() || {});
    const isInCharge = allAssign.find(
      a => a.userId === decoded.uid && a.projectId === projectId && a.designation === 'in_charge'
    );
    if (!isInCharge) {
      return respond(403, { error: 'Only consultant in-charge can link contractor companies to this project.' });
    }
    // Check projectConsultants permissions from client
    if (!profile.organizationId) {
      return respond(403, { error: 'Your account has no organization. Contact your administrator.' });
    }
    const permSnap = await db.ref('projectConsultants/' + projectId + '/' + profile.organizationId).once('value');
    const perms = permSnap.val();
    if (!perms || !perms.canLinkContractors) {
      return respond(403, { error: 'Client has not granted contractor-linking permission for this project. Contact the client.' });
    }
    // Check if this contractor org is in the allowed list (if list is defined)
    if (perms.allowedContractorOrgIds && Object.keys(perms.allowedContractorOrgIds).length > 0) {
      if (!perms.allowedContractorOrgIds[orgId]) {
        return respond(403, { error: 'This contractor organization is not in the allowed list for this project.' });
      }
    }
  } else {
    return respond(403, { error: 'Only clients and consultants can link organizations to projects.' });
  }

  // Check for existing link (prevent duplicates)
  const existingSnap = await db.ref('project_org_links').once('value');
  const existing = existingSnap.val() || {};
  const alreadyLinked = Object.values(existing).find(
    l => l.orgId === orgId && l.projectId === projectId
  );
  if (alreadyLinked) {
    return respond(400, { error: 'This organization is already linked to this project.' });
  }

  // Validate role for consultant firms
  const validConsultantRoles = ['Consultant', 'PMC', 'Delivery Partner', 'Engineer'];
  let linkRole = '';
  if (org.type === 'consultant_firm') {
    linkRole = validConsultantRoles.includes(role) ? role : 'Consultant';
  } else {
    linkRole = 'Contractor';
  }

  const linkId = Date.now().toString();
  const link = {
    id: linkId,
    orgId,
    orgName: org.name,
    orgType: org.type,
    role: linkRole,
    projectId,
    projectName: project.name,
    createdBy: decoded.uid,
    createdByName: profile.name || profile.email,
    createdByRole: profile.role,
    createdAt: new Date().toISOString()
  };

  await db.ref('project_org_links/' + linkId).set(link);
  console.log('[PROJECT] Org', org.name, '(' + linkRole + ') linked to project:', project.name, 'by', profile.role);

  return respond(200, { link });
}

// === UNLINK ORG FROM PROJECT ===
async function handleUnlinkOrgFromProject(body, decoded) {
  const { linkId } = body;
  if (!linkId) return respond(400, { error: 'Link ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('project_org_links/' + linkId).once('value');
  const link = snap.val();
  if (!link) return respond(404, { error: 'Link not found.' });

  // Authority: only client can unlink organizations from projects
  if (profile.role !== 'client') {
    return respond(403, { error: 'Only clients can unlink organizations from projects.' });
  }

  await db.ref('project_org_links/' + linkId).remove();
  console.log('[PROJECT] Removed org-project link:', linkId);

  return respond(200, { success: true });
}

// === LIST PROJECT ORG LINKS ===
async function handleListProjectOrgLinks(body, decoded) {
  const { projectId } = body;

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  let snap;

  if (projectId) {
    snap = await db.ref('project_org_links')
      .orderByChild('projectId')
      .equalTo(projectId)
      .once('value');
  } else {
    snap = await db.ref('project_org_links').once('value');
  }

  const data = snap.val() || {};
  const links = Object.values(data).sort((a, b) => (a.projectName || '').localeCompare(b.projectName || ''));

  return respond(200, { links });
}

// === SET CONSULTANT PERMISSIONS ===
// Client defines what a consultant org can do on a specific project
async function handleSetConsultantPermissions(body, decoded) {
  const { projectId, consultantOrgId, canLinkContractors, allowedContractorOrgIds } = body;
  if (!projectId || !consultantOrgId) return respond(400, { error: 'Project ID and Consultant Org ID are required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });
  if (profile.role !== 'client') return respond(403, { error: 'Only clients can set consultant permissions.' });

  const db = getDb();

  // Verify the consultant org is linked to this project
  const orgLinkSnap = await db.ref('project_org_links').once('value');
  const isLinked = Object.values(orgLinkSnap.val() || {}).find(
    l => l.orgId === consultantOrgId && l.projectId === projectId && l.orgType === 'consultant_firm'
  );
  if (!isLinked) return respond(400, { error: 'This consultant organization is not linked to this project.' });

  const permissions = {
    projectId,
    consultantOrgId,
    canLinkContractors: !!canLinkContractors,
    allowedContractorOrgIds: (allowedContractorOrgIds && typeof allowedContractorOrgIds === 'object') ? allowedContractorOrgIds : {},
    updatedBy: decoded.uid,
    updatedAt: new Date().toISOString()
  };

  await db.ref('projectConsultants/' + projectId + '/' + consultantOrgId).set(permissions);
  console.log('[PROJECT] Set consultant permissions:', projectId, consultantOrgId, 'canLink:', !!canLinkContractors);

  return respond(200, { permissions });
}

// === GET CONSULTANT PERMISSIONS ===
// Returns projectConsultants permissions. Client sees all; consultant sees own org only.
async function handleGetConsultantPermissions(body, decoded) {
  const { projectId } = body;

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();

  if (projectId) {
    const snap = await db.ref('projectConsultants/' + projectId).once('value');
    const allPerms = snap.val() || {};
    // Consultant: filter to own org only
    if (profile.role !== 'client' && profile.organizationId) {
      const own = allPerms[profile.organizationId];
      return respond(200, { permissions: own ? { [profile.organizationId]: own } : {} });
    }
    return respond(200, { permissions: allPerms });
  }

  // Return all permissions
  const snap = await db.ref('projectConsultants').once('value');
  const allPerms = snap.val() || {};

  if (profile.role === 'client') {
    return respond(200, { permissions: allPerms });
  }

  // For consultant: filter to own org
  const result = {};
  if (profile.organizationId) {
    Object.entries(allPerms).forEach(([projId, orgs]) => {
      if (orgs[profile.organizationId]) {
        result[projId] = { [profile.organizationId]: orgs[profile.organizationId] };
      }
    });
  }

  return respond(200, { permissions: result });
}

// === TENANT SETTINGS ===
async function handleGetSettings(body, decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('tenantSettings').once('value');
  const settings = snap.val() || {};

  return respond(200, { settings: { reductionTarget: settings.reductionTarget || 20 } });
}

async function handleSetSettings(body, decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (profile.role !== 'client') {
    return respond(403, { error: 'Only clients can modify tenant settings.' });
  }

  const db = getDb();
  const updates = {};
  if (body.reductionTarget !== undefined) {
    const val = parseFloat(body.reductionTarget);
    if (isNaN(val) || val < 0 || val > 100) return respond(400, { error: 'Reduction target must be between 0 and 100.' });
    updates.reductionTarget = val;
  }
  updates.updatedAt = new Date().toISOString();
  updates.updatedBy = decoded.uid;

  await db.ref('tenantSettings').update(updates);
  console.log('[SETTINGS] Updated tenant settings:', updates);

  return respond(200, { success: true, settings: updates });
}

// === GET PROJECT SUMMARY (for dashboard) ===
async function handleGetProjectSummary(body, decoded) {
  const { projectId } = body;
  if (!projectId) return respond(400, { error: 'Project ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();

  // Get project
  const projSnap = await db.ref('projects/' + projectId).once('value');
  const project = projSnap.val();
  if (!project) return respond(404, { error: 'Project not found.' });

  // Get assignments for this project
  const assignSnap = await db.ref('project_assignments')
    .orderByChild('projectId')
    .equalTo(projectId)
    .once('value');
  const assignments = Object.values(assignSnap.val() || {});

  // Get org links for this project
  const orgLinkSnap = await db.ref('project_org_links')
    .orderByChild('projectId')
    .equalTo(projectId)
    .once('value');
  const orgLinks = Object.values(orgLinkSnap.val() || {});

  return respond(200, {
    project,
    assignmentCount: assignments.length,
    consultantCount: assignments.filter(a => a.userRole === 'consultant').length,
    contractorCount: assignments.filter(a => a.userRole === 'contractor').length,
    orgCount: orgLinks.length,
    consultantFirmCount: orgLinks.filter(l => l.orgType === 'consultant_firm').length,
    contractorCompanyCount: orgLinks.filter(l => l.orgType === 'contractor_company').length
  });
}

// === MAIN HANDLER ===
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  // CSRF validation
  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Authentication required. Please sign in again.' });

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
    console.log('[PROJECT] Action:', action, 'User:', decoded.uid);

    switch (action) {
      // Project CRUD
      case 'create':              return await handleCreateProject(body, decoded);
      case 'list':                return await handleListProjects(decoded);
      case 'get':                 return await handleGetProject(body, decoded);
      case 'update':              return await handleUpdateProject(body, decoded);
      case 'delete':              return await handleDeleteProject(body, decoded);
      case 'bulk-delete':         return await handleBulkDeleteProjects(body, decoded);

      // User-to-project assignments
      case 'assign-user':         return await handleAssignUserToProject(body, decoded);
      case 'remove-user':         return await handleRemoveUserFromProject(body, decoded);
      case 'list-assignments':    return await handleListProjectAssignments(body, decoded);

      // Org-to-project links
      case 'link-org':            return await handleLinkOrgToProject(body, decoded);
      case 'unlink-org':          return await handleUnlinkOrgFromProject(body, decoded);
      case 'list-org-links':      return await handleListProjectOrgLinks(body, decoded);

      // Consultant permissions
      case 'set-consultant-perms': return await handleSetConsultantPermissions(body, decoded);
      case 'get-consultant-perms': return await handleGetConsultantPermissions(body, decoded);

      // Tenant settings
      case 'get-settings':        return await handleGetSettings(body, decoded);
      case 'set-settings':        return await handleSetSettings(body, decoded);

      // Dashboard summary
      case 'summary':             return await handleGetProjectSummary(body, decoded);

      default: return respond(400, { error: 'Invalid action.' });
    }
  } catch (e) {
    console.error('[PROJECT] Server error:', e.message || e);
    return respond(500, { error: 'An error occurred processing your request. Please try again.' });
  }
};
