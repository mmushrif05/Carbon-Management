const { getDb, verifyToken, respond, optionsResponse } = require('./utils/firebase');

// ===== PACKAGE TEMPLATES API =====
// Tenant-configurable package templates. No hard-coded names.
// Templates are reusable across projects; projects select from available templates.

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

// === CREATE TEMPLATE ===
async function handleCreate(body, decoded) {
  const { name, code } = body;
  if (!name || !name.trim()) return respond(400, { error: 'Package template name is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });
  if (profile.role !== 'client') return respond(403, { error: 'Only clients can create package templates.' });

  const db = getDb();
  const templateId = 'tpl_' + Date.now().toString();

  const template = {
    id: templateId,
    name: name.trim(),
    code: (code || '').trim(),
    isActive: true,
    createdBy: decoded.uid,
    createdByName: profile.name || profile.email,
    createdAt: new Date().toISOString()
  };

  await db.ref('packageTemplates/' + templateId).set(template);

  // Audit log
  const auditId = 'aud_' + Date.now();
  await db.ref('auditLogs/' + auditId).set({
    id: auditId,
    actorUid: decoded.uid,
    actorName: profile.name || profile.email,
    action: 'PACKAGE_TEMPLATE_CREATED',
    entityRef: { type: 'packageTemplate', id: templateId },
    after: { name: template.name, code: template.code },
    createdAt: new Date().toISOString()
  });

  console.log('[PKG_TPL] Created:', templateId, name.trim());
  return respond(200, { template });
}

// === UPDATE TEMPLATE ===
async function handleUpdate(body, decoded) {
  const { templateId, name, code, isActive } = body;
  if (!templateId) return respond(400, { error: 'Template ID is required.' });

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });
  if (profile.role !== 'client') return respond(403, { error: 'Only clients can update package templates.' });

  const db = getDb();
  const snap = await db.ref('packageTemplates/' + templateId).once('value');
  const existing = snap.val();
  if (!existing) return respond(404, { error: 'Package template not found.' });

  const before = { name: existing.name, code: existing.code, isActive: existing.isActive };
  const updates = { updatedAt: new Date().toISOString(), updatedBy: decoded.uid };
  if (name !== undefined) updates.name = name.trim();
  if (code !== undefined) updates.code = (code || '').trim();
  if (isActive !== undefined) updates.isActive = !!isActive;

  await db.ref('packageTemplates/' + templateId).update(updates);

  // Audit log
  const auditId = 'aud_' + Date.now();
  await db.ref('auditLogs/' + auditId).set({
    id: auditId,
    actorUid: decoded.uid,
    actorName: profile.name || profile.email,
    action: isActive === false ? 'PACKAGE_TEMPLATE_DEACTIVATED' : 'PACKAGE_TEMPLATE_UPDATED',
    entityRef: { type: 'packageTemplate', id: templateId },
    before,
    after: updates,
    createdAt: new Date().toISOString()
  });

  console.log('[PKG_TPL] Updated:', templateId);
  return respond(200, { success: true });
}

// === LIST TEMPLATES ===
async function handleList(body, decoded) {
  const { includeInactive } = body || {};

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const snap = await db.ref('packageTemplates').once('value');
  const data = snap.val() || {};
  let templates = Object.values(data);

  // Non-clients only see active templates
  if (!includeInactive || profile.role !== 'client') {
    templates = templates.filter(t => t.isActive !== false);
  }

  templates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return respond(200, { templates });
}

// === MIGRATE OLD PACKAGES ===
// Converts legacy "Package 1/2/3" string values on projects into packageTemplate references
async function handleMigrate(body, decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });
  if (profile.role !== 'client') return respond(403, { error: 'Only clients can run migrations.' });

  const db = getDb();

  // 1. Scan all projects for legacy `package` string field
  const projSnap = await db.ref('projects').once('value');
  const projects = projSnap.val() || {};
  const legacyValues = new Set();

  Object.values(projects).forEach(p => {
    if (p.package && typeof p.package === 'string' && p.package.trim()) {
      legacyValues.add(p.package.trim());
    }
  });

  if (legacyValues.size === 0) {
    return respond(200, { migrated: 0, message: 'No legacy package values found.' });
  }

  // 2. Load existing templates to avoid duplicates
  const tplSnap = await db.ref('packageTemplates').once('value');
  const existingTemplates = Object.values(tplSnap.val() || {});
  const nameToId = {};
  existingTemplates.forEach(t => { nameToId[t.name] = t.id; });

  // 3. Create templates for any legacy values that don't have a matching template
  const newTemplates = {};
  legacyValues.forEach(name => {
    if (!nameToId[name]) {
      const templateId = 'tpl_mig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      newTemplates[templateId] = {
        id: templateId,
        name,
        code: '',
        isActive: true,
        createdBy: decoded.uid,
        createdByName: 'Migration',
        createdAt: new Date().toISOString(),
        migratedFrom: 'legacy_package_field'
      };
      nameToId[name] = templateId;
    }
  });

  // 4. Write new templates
  const updates = {};
  Object.entries(newTemplates).forEach(([id, tpl]) => {
    updates['packageTemplates/' + id] = tpl;
  });

  // 5. Update each project: set packageIds map and keep legacy field for backward compat
  let migratedCount = 0;
  Object.entries(projects).forEach(([pid, p]) => {
    if (p.package && typeof p.package === 'string' && p.package.trim() && !p.packageIds) {
      const tplId = nameToId[p.package.trim()];
      if (tplId) {
        updates['projects/' + pid + '/packageIds'] = { [tplId]: true };
        migratedCount++;
      }
    }
  });

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }

  // 6. Audit log
  const auditId = 'aud_' + Date.now();
  await db.ref('auditLogs/' + auditId).set({
    id: auditId,
    actorUid: decoded.uid,
    actorName: profile.name || profile.email,
    action: 'PACKAGE_MIGRATION_COMPLETED',
    entityRef: { type: 'migration', id: 'packages' },
    after: {
      legacyValues: Array.from(legacyValues),
      templatesCreated: Object.keys(newTemplates).length,
      projectsMigrated: migratedCount
    },
    createdAt: new Date().toISOString()
  });

  console.log('[PKG_TPL] Migration complete:', migratedCount, 'projects,', Object.keys(newTemplates).length, 'new templates');
  return respond(200, {
    migrated: migratedCount,
    templatesCreated: Object.keys(newTemplates).length,
    legacyValues: Array.from(legacyValues),
    message: 'Migration complete.'
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
    console.log('[PKG_TPL] Action:', action, 'User:', decoded.uid);

    switch (action) {
      case 'create':   return await handleCreate(body, decoded);
      case 'update':   return await handleUpdate(body, decoded);
      case 'list':     return await handleList(body, decoded);
      case 'migrate':  return await handleMigrate(body, decoded);
      default: return respond(400, { error: 'Invalid action: ' + action });
    }
  } catch (e) {
    console.error('[PKG_TPL] Error:', e.message || e);
    return respond(500, { error: 'Server error: ' + (e.message || 'Unknown') });
  }
};
