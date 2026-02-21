/**
 * Enterprise Permission Engine
 * Computes effective permissions from roleBindings + delegations + trial mode
 */

const CONFIG = {
  TRIAL_MODE: process.env.TRIAL_MODE === 'true' || true, // Default true for now
  BREAK_GLASS_ENABLED: process.env.BREAK_GLASS_ENABLED === 'true' || true,
};

// Role hierarchy (higher index = more authority)
const ROLE_HIERARCHY = {
  'viewer': 0,
  'package_viewer': 1,
  'data_entry': 2,
  'package_contributor': 3,
  'package_reviewer': 4,
  'package_lead': 5,
  'reviewer': 6,
  'project_manager': 7,
  'project_admin': 8,
  'org_manager': 9,
  'org_admin': 10,
  'org_director': 11,
  'portfolio_admin': 12,
  'tenant_super_admin': 13,
};

// Permission definitions per role
const ROLE_PERMISSIONS = {
  'tenant_super_admin': ['*'],
  'portfolio_admin': [
    'project.create', 'project.read', 'project.update', 'project.delete',
    'package.create', 'package.read', 'package.update', 'package.delete',
    'emission.read', 'emission.approve',
    'user.invite', 'user.manage', 'org.link', 'org.link.approve',
    'dashboard.tenant', 'dashboard.project', 'dashboard.cluster',
  ],
  'org_director': [
    'org.manage', 'org.users.manage', 'org.link.accept',
    'user.invite', 'user.manage',
    'project.read', 'package.read',
    'emission.read', 'emission.approve',
    'delegation.create', 'delegation.revoke',
    'dashboard.org',
  ],
  'org_admin': [
    'org.users.manage', 'user.invite',
    'project.read', 'package.read',
    'emission.read',
    'dashboard.org',
  ],
  'org_manager': [
    'project.read', 'package.read',
    'emission.read', 'emission.review',
    'user.invite',
    'dashboard.org',
  ],
  'project_admin': [
    'project.read', 'project.update',
    'package.create', 'package.read', 'package.update', 'package.delete',
    'emission.read', 'emission.approve',
    'user.assign', 'user.change_role', 'user.revoke',
    'org.link', 'org.link.approve',
    'evidence.read',
    'dashboard.project',
  ],
  'project_manager': [
    'project.read', 'project.update',
    'package.create', 'package.read', 'package.update',
    'emission.read', 'emission.review', 'emission.approve',
    'user.assign',
    'org.link',
    'evidence.read',
    'dashboard.project',
  ],
  'reviewer': [
    'project.read', 'package.read',
    'emission.read', 'emission.review',
    'evidence.read',
    'dashboard.project',
  ],
  'data_entry': [
    'project.read', 'package.read',
    'emission.create', 'emission.read', 'emission.update', 'emission.submit',
    'evidence.upload', 'evidence.read',
    'dashboard.project',
  ],
  'viewer': [
    'project.read', 'package.read',
    'emission.read', 'evidence.read',
    'dashboard.project',
  ],
  'package_lead': [
    'package.read', 'package.update',
    'emission.create', 'emission.read', 'emission.update', 'emission.submit', 'emission.approve',
    'evidence.upload', 'evidence.read',
    'user.assign',
  ],
  'package_reviewer': [
    'package.read',
    'emission.read', 'emission.review',
    'evidence.read',
  ],
  'package_contributor': [
    'package.read',
    'emission.create', 'emission.read', 'emission.update', 'emission.submit',
    'evidence.upload', 'evidence.read',
  ],
  'package_viewer': [
    'package.read', 'emission.read', 'evidence.read',
  ],
};

/**
 * Compute effective permissions for a user in a given scope
 * Checks: roleBindings + active delegations + trial mode
 */
async function getEffectivePermissions(db, uid, scope, scopeId) {
  // 1. Get direct role bindings
  const bindingsSnap = await db.ref('roleBindings')
    .orderByChild('uid')
    .equalTo(uid)
    .once('value');
  const allBindings = Object.values(bindingsSnap.val() || {});
  const activeBindings = allBindings.filter(b =>
    b.status === 'active' &&
    (b.scope === scope && b.scopeId === scopeId ||
     b.scope === 'tenant' ||
     (scope === 'package' && b.scope === 'project'))
  );

  // 2. Get active delegations
  const now = new Date().toISOString();
  const delegationsSnap = await db.ref('delegations')
    .orderByChild('delegateeId')
    .equalTo(uid)
    .once('value');
  const activeDelegations = Object.values(delegationsSnap.val() || {}).filter(d =>
    d.status === 'active' &&
    d.startDate <= now &&
    d.endDate >= now &&
    (d.scope === scope && d.scopeId === scopeId)
  );

  // 3. Collect all permissions
  const permissions = new Set();
  let highestRole = 'viewer';

  activeBindings.forEach(b => {
    const rolePerms = ROLE_PERMISSIONS[b.role] || [];
    rolePerms.forEach(p => permissions.add(p));
    if ((ROLE_HIERARCHY[b.role] || 0) > (ROLE_HIERARCHY[highestRole] || 0)) {
      highestRole = b.role;
    }
  });

  activeDelegations.forEach(d => {
    (d.permissions || []).forEach(p => permissions.add(p));
  });

  // Wildcard check
  if (permissions.has('*')) {
    return { permissions: ['*'], role: highestRole, isWildcard: true, delegations: activeDelegations };
  }

  return {
    permissions: Array.from(permissions),
    role: highestRole,
    isWildcard: false,
    delegations: activeDelegations,
  };
}

/**
 * Check if user has a specific permission in scope
 */
async function hasPermission(db, uid, permission, scope, scopeId) {
  const effective = await getEffectivePermissions(db, uid, scope, scopeId);
  return effective.isWildcard || effective.permissions.includes(permission);
}

/**
 * Write an audit log entry
 */
async function writeAuditLog(db, entry) {
  const auditId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6);
  const log = {
    id: auditId,
    tenantId: entry.tenantId || 'default',
    action: entry.action,
    actor: entry.actor,
    actedAs: entry.actedAs || null,
    delegationId: entry.delegationId || null,
    targetType: entry.targetType || null,
    targetId: entry.targetId || null,
    projectId: entry.projectId || null,
    details: entry.details || {},
    trialMode: CONFIG.TRIAL_MODE,
    breakGlass: entry.breakGlass || false,
    timestamp: new Date().toISOString(),
  };
  await db.ref('auditLogs/' + auditId).set(log);
  return log;
}

/**
 * Process approval step — auto-approves in TRIAL_MODE
 */
function shouldAutoApprove() {
  return CONFIG.TRIAL_MODE;
}

/**
 * Break-glass override — requires justification, logged as HIGH severity
 */
async function breakGlassOverride(db, requestId, userId, note) {
  if (!CONFIG.BREAK_GLASS_ENABLED) {
    throw new Error('Break-glass override is not enabled.');
  }
  if (!note || note.trim().length < 10) {
    throw new Error('Break-glass requires a justification note (min 10 characters).');
  }
  await writeAuditLog(db, {
    action: 'break_glass_override',
    actor: userId,
    targetType: 'access_request',
    targetId: requestId,
    details: { note, severity: 'HIGH' },
    breakGlass: true,
  });
  return true;
}

module.exports = {
  CONFIG,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  getEffectivePermissions,
  hasPermission,
  writeAuditLog,
  shouldAutoApprove,
  breakGlassOverride,
};
