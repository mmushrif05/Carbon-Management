const { getDb, verifyToken, respond, optionsResponse } = require('./utils/firebase');

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
  const { name, description, code, status } = body;

  if (!name || !name.trim()) return respond(400, { error: 'Project name is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can create projects.' });
  }

  const db = getDb();
  const projectId = Date.now().toString();

  const project = {
    id: projectId,
    name: name.trim(),
    description: (description || '').trim(),
    code: (code || '').trim(),
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

  // If consultant or contractor, show projects they are assigned to OR created
  if (profile.role === 'consultant' || profile.role === 'contractor') {
    const assignSnap = await db.ref('project_assignments').once('value');
    const assignments = assignSnap.val() || {};
    const myProjectIds = new Set();
    Object.values(assignments).forEach(a => {
      if (a.userId === decoded.uid) {
        myProjectIds.add(a.projectId);
      }
    });
    projects = projects.filter(p => myProjectIds.has(p.id) || p.createdBy === decoded.uid);
  }

  projects.sort((a, b) => a.name.localeCompare(b.name));
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
  const { projectId, name, description, code, status } = body;
  if (!projectId) return respond(400, { error: 'Project ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can update projects.' });
  }

  const db = getDb();
  const snap = await db.ref('projects/' + projectId).once('value');
  if (!snap.val()) return respond(404, { error: 'Project not found.' });

  const updates = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
  if (name) updates.name = name.trim();
  if (description !== undefined) updates.description = (description || '').trim();
  if (code !== undefined) updates.code = (code || '').trim();
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

// === ASSIGN USER TO PROJECT ===
async function handleAssignUserToProject(body, decoded) {
  const { userId, projectId } = body;
  if (!userId || !projectId) return respond(400, { error: 'User ID and Project ID are required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can assign users to projects.' });
  }

  const db = getDb();

  // Verify project exists
  const projSnap = await db.ref('projects/' + projectId).once('value');
  const project = projSnap.val();
  if (!project) return respond(404, { error: 'Project not found.' });

  // Verify user exists
  const userSnap = await db.ref('users/' + userId).once('value');
  const user = userSnap.val();
  if (!user) return respond(404, { error: 'User not found.' });

  // Check for existing assignment
  const existingSnap = await db.ref('project_assignments').once('value');
  const existing = existingSnap.val() || {};
  const alreadyAssigned = Object.values(existing).find(
    a => a.userId === userId && a.projectId === projectId
  );
  if (alreadyAssigned) {
    return respond(400, { error: 'This user is already assigned to this project.' });
  }

  const assignmentId = Date.now().toString();
  const assignment = {
    id: assignmentId,
    userId,
    userName: user.name || user.email,
    userEmail: user.email,
    userRole: user.role,
    userOrgId: user.organizationId || null,
    userOrgName: user.organizationName || null,
    projectId,
    projectName: project.name,
    createdBy: decoded.uid,
    createdByName: profile.name || profile.email,
    createdAt: new Date().toISOString()
  };

  await db.ref('project_assignments/' + assignmentId).set(assignment);
  console.log('[PROJECT] User', user.name, 'assigned to project:', project.name);

  return respond(200, { assignment });
}

// === REMOVE USER FROM PROJECT ===
async function handleRemoveUserFromProject(body, decoded) {
  const { assignmentId } = body;
  if (!assignmentId) return respond(400, { error: 'Assignment ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can remove project assignments.' });
  }

  const db = getDb();
  const snap = await db.ref('project_assignments/' + assignmentId).once('value');
  if (!snap.val()) return respond(404, { error: 'Assignment not found.' });

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

  // If consultant or contractor, only show their own assignments
  if (profile.role === 'consultant' || profile.role === 'contractor') {
    assignments = assignments.filter(a => a.userId === decoded.uid);
  }

  assignments.sort((a, b) => a.projectName.localeCompare(b.projectName));
  return respond(200, { assignments });
}

// === LINK ORG TO PROJECT ===
// Associate an organization (consultant firm or contractor company) with a project
async function handleLinkOrgToProject(body, decoded) {
  const { orgId, projectId } = body;
  if (!orgId || !projectId) return respond(400, { error: 'Organization ID and Project ID are required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can link organizations to projects.' });
  }

  const db = getDb();

  const [orgSnap, projSnap] = await Promise.all([
    db.ref('organizations/' + orgId).once('value'),
    db.ref('projects/' + projectId).once('value')
  ]);

  const org = orgSnap.val();
  const project = projSnap.val();
  if (!org) return respond(404, { error: 'Organization not found.' });
  if (!project) return respond(404, { error: 'Project not found.' });

  // Check for existing link
  const existingSnap = await db.ref('project_org_links').once('value');
  const existing = existingSnap.val() || {};
  const alreadyLinked = Object.values(existing).find(
    l => l.orgId === orgId && l.projectId === projectId
  );
  if (alreadyLinked) {
    return respond(400, { error: 'This organization is already linked to this project.' });
  }

  const linkId = Date.now().toString();
  const link = {
    id: linkId,
    orgId,
    orgName: org.name,
    orgType: org.type,
    projectId,
    projectName: project.name,
    createdBy: decoded.uid,
    createdByName: profile.name || profile.email,
    createdAt: new Date().toISOString()
  };

  await db.ref('project_org_links/' + linkId).set(link);
  console.log('[PROJECT] Org', org.name, 'linked to project:', project.name);

  return respond(200, { link });
}

// === UNLINK ORG FROM PROJECT ===
async function handleUnlinkOrgFromProject(body, decoded) {
  const { linkId } = body;
  if (!linkId) return respond(400, { error: 'Link ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  if (!['client', 'consultant'].includes(profile.role)) {
    return respond(403, { error: 'Only clients and consultants can unlink organizations from projects.' });
  }

  const db = getDb();
  const snap = await db.ref('project_org_links/' + linkId).once('value');
  if (!snap.val()) return respond(404, { error: 'Link not found.' });

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
  const links = Object.values(data).sort((a, b) => a.projectName.localeCompare(b.projectName));

  return respond(200, { links });
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

  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Authentication required.' });

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    switch (action) {
      // Project CRUD
      case 'create':              return await handleCreateProject(body, decoded);
      case 'list':                return await handleListProjects(decoded);
      case 'get':                 return await handleGetProject(body, decoded);
      case 'update':              return await handleUpdateProject(body, decoded);
      case 'delete':              return await handleDeleteProject(body, decoded);

      // User-to-project assignments
      case 'assign-user':         return await handleAssignUserToProject(body, decoded);
      case 'remove-user':         return await handleRemoveUserFromProject(body, decoded);
      case 'list-assignments':    return await handleListProjectAssignments(body, decoded);

      // Org-to-project links
      case 'link-org':            return await handleLinkOrgToProject(body, decoded);
      case 'unlink-org':          return await handleUnlinkOrgFromProject(body, decoded);
      case 'list-org-links':      return await handleListProjectOrgLinks(body, decoded);

      // Dashboard summary
      case 'summary':             return await handleGetProjectSummary(body, decoded);

      default: return respond(400, { error: 'Invalid action.' });
    }
  } catch (e) {
    console.error('[PROJECT] Server error:', e);
    return respond(500, { error: 'Server error: ' + (e.message || 'Unknown') });
  }
};
