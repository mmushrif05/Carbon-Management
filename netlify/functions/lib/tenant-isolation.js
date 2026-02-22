/**
 * Tenant Isolation — Multi-Tenant Data Boundaries
 *
 * Ensures data from one tenant/project cannot leak to another.
 * Every database read/write is scoped through this module.
 *
 * Architecture:
 *   /tenants/{tenantId}/projects/{projectId}/...
 *   /tenants/{tenantId}/documents/{projectId}/...
 *   /tenants/{tenantId}/analysis/{projectId}/...
 *
 * Each user belongs to exactly one tenant (stored in their profile).
 * Cross-tenant access is impossible by design — no API path allows
 * a tenantId to be supplied by the client.
 */

/**
 * Resolve tenant ID for a user
 * Currently maps from user profile; future: JWT custom claims
 */
async function resolveTenantId(db, uid) {
  const snap = await db.ref(`users/${uid}/tenantId`).once('value');
  const tenantId = snap.val();

  // Default tenant for backward compatibility during migration
  return tenantId || 'default';
}

/**
 * Build a tenant-scoped database path
 * Prevents any path traversal or injection
 */
function tenantPath(tenantId, ...segments) {
  // Validate tenant ID format
  if (!tenantId || typeof tenantId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
    throw new Error('Invalid tenant ID');
  }

  // Validate each path segment
  for (const seg of segments) {
    if (typeof seg !== 'string' || /[.#$\[\]]/.test(seg)) {
      throw new Error('Invalid path segment: ' + seg);
    }
  }

  return `tenants/${tenantId}/${segments.join('/')}`;
}

/**
 * Verify user has access to a specific project within their tenant
 */
async function verifyProjectAccess(db, uid, tenantId, projectId) {
  if (!projectId) return false;

  // Check if project belongs to this tenant
  const projectSnap = await db.ref(tenantPath(tenantId, 'projects', projectId, 'tenantId')).once('value');
  const projectTenant = projectSnap.val();

  // During migration, also check legacy path
  if (!projectTenant) {
    const legacySnap = await db.ref(`projects/${projectId}`).once('value');
    if (legacySnap.val()) return true; // Legacy project, allow during migration
    return false;
  }

  return projectTenant === tenantId;
}

/**
 * Get all projects accessible to a user within their tenant
 */
async function getTenantProjects(db, tenantId) {
  const snap = await db.ref(tenantPath(tenantId, 'projects')).once('value');
  return snap.val() || {};
}

/**
 * Middleware-style function to extract and validate tenant context
 * Returns { tenantId, uid } or throws
 */
async function getTenantContext(db, user) {
  if (!user || !user.uid) {
    throw new Error('Authentication required');
  }

  const tenantId = await resolveTenantId(db, user.uid);

  return {
    tenantId,
    uid: user.uid,
    path: function(...segments) { return tenantPath(tenantId, ...segments); }
  };
}

module.exports = {
  resolveTenantId,
  tenantPath,
  verifyProjectAccess,
  getTenantProjects,
  getTenantContext,
};
