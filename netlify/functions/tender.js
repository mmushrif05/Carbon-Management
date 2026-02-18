const { getDb, verifyToken, getUserProjectId, respond, optionsResponse } = require('./utils/firebase');

async function getDbPath(uid) {
  const projectId = await getUserProjectId(uid);
  return `projects/${projectId}/tenderScenarios`;
}

async function handleList(event) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  try {
    const db = getDb();
    const dbPath = await getDbPath(decoded.uid);
    const snap = await db.ref(dbPath).once('value');
    const data = snap.val();
    return respond(200, { scenarios: data ? Object.values(data) : [] });
  } catch (e) {
    return respond(500, { error: 'Failed to load tender scenarios' });
  }
}

async function handleSave(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { scenario } = body;
  if (!scenario || !scenario.id) return respond(400, { error: 'Invalid scenario data' });
  if (!scenario.name) return respond(400, { error: 'Scenario name is required' });

  try {
    const db = getDb();
    const dbPath = await getDbPath(decoded.uid);
    scenario.createdBy = scenario.createdBy || decoded.name || decoded.email;
    scenario.updatedAt = new Date().toISOString();
    await db.ref(dbPath + '/' + scenario.id).set(scenario);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to save scenario' });
  }
}

async function handleUpdate(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { id, updates } = body;
  if (!id || !updates) return respond(400, { error: 'ID and updates required' });

  const allowedFields = ['name', 'description', 'status', 'items', 'totalBaseline', 'totalTarget', 'reductionPct', 'updatedAt'];
  const safeUpdates = {};
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      safeUpdates[key] = updates[key];
    }
  }

  if (Object.keys(safeUpdates).length === 0) return respond(400, { error: 'No valid updates' });

  safeUpdates.updatedAt = new Date().toISOString();

  try {
    const db = getDb();
    const dbPath = await getDbPath(decoded.uid);
    await db.ref(dbPath + '/' + id).update(safeUpdates);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to update scenario' });
  }
}

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

async function handleDelete(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { id } = body;
  if (!id) return respond(400, { error: 'ID required' });

  // Validate ID format — prevent path traversal
  if (typeof id !== 'string' || id.includes('/') || id.includes('.') || id.includes('$') || id.includes('#') || id.includes('[') || id.includes(']')) {
    return respond(400, { error: 'Invalid scenario ID format.' });
  }

  try {
    const db = getDb();
    const dbPath = await getDbPath(decoded.uid);
    const snap = await db.ref(dbPath + '/' + id).once('value');
    const scenario = snap.val();
    if (!scenario) return respond(404, { error: 'Scenario not found' });

    // Ownership check: only client or the creator can delete
    const profile = await getUserProfile(decoded.uid);
    if (profile.role !== 'client' && scenario.createdBy !== decoded.uid && scenario.createdBy !== (decoded.name || decoded.email)) {
      return respond(403, { error: 'You can only delete scenarios you created.' });
    }

    await db.ref(dbPath + '/' + id).remove();
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to delete scenario' });
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  try {
    if (event.httpMethod === 'GET') {
      return await handleList(event);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action } = body;

      switch (action) {
        case 'save':   return await handleSave(event, body);
        case 'update': return await handleUpdate(event, body);
        case 'delete': return await handleDelete(event, body);
        default:       return respond(400, { error: 'Invalid action' });
      }
    }

    return respond(405, { error: 'Method not allowed' });
  } catch (e) {
    return respond(500, { error: 'Server error' });
  }
};
