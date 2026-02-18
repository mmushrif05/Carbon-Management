const { getDb, verifyToken, getUserProject, respond, optionsResponse } = require('./utils/firebase');

async function handleList(event) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const project = await getUserProject(decoded.uid);
  if (!project) return respond(403, { error: 'No project assigned to this user.' });

  try {
    const db = getDb();
    const snap = await db.ref(`projects/${project}/tenderScenarios`).once('value');
    const data = snap.val();
    return respond(200, { scenarios: data ? Object.values(data) : [] });
  } catch (e) {
    return respond(500, { error: 'Failed to load tender scenarios' });
  }
}

async function handleSave(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const project = await getUserProject(decoded.uid);
  if (!project) return respond(403, { error: 'No project assigned to this user.' });

  const { scenario } = body;
  if (!scenario || !scenario.id) return respond(400, { error: 'Invalid scenario data' });
  if (!scenario.name) return respond(400, { error: 'Scenario name is required' });

  try {
    const db = getDb();
    scenario.createdBy = scenario.createdBy || decoded.name || decoded.email;
    scenario.updatedAt = new Date().toISOString();
    scenario.project = project;
    await db.ref(`projects/${project}/tenderScenarios/${scenario.id}`).set(scenario);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to save scenario' });
  }
}

async function handleUpdate(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const project = await getUserProject(decoded.uid);
  if (!project) return respond(403, { error: 'No project assigned to this user.' });

  const { id, updates } = body;
  if (!id || !updates) return respond(400, { error: 'ID and updates required' });

  const allowedFields = ['name', 'description', 'status', 'items', 'totalBaseline', 'totalTarget', 'reductionPct', 'updatedAt'];
  const safeUpdates = {};
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) safeUpdates[key] = updates[key];
  }

  if (Object.keys(safeUpdates).length === 0) return respond(400, { error: 'No valid updates' });
  safeUpdates.updatedAt = new Date().toISOString();

  try {
    const db = getDb();
    await db.ref(`projects/${project}/tenderScenarios/${id}`).update(safeUpdates);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to update scenario' });
  }
}

async function handleDelete(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const project = await getUserProject(decoded.uid);
  if (!project) return respond(403, { error: 'No project assigned to this user.' });

  const { id } = body;
  if (!id) return respond(400, { error: 'ID required' });

  try {
    const db = getDb();
    const snap = await db.ref(`projects/${project}/tenderScenarios/${id}`).once('value');
    if (!snap.val()) return respond(404, { error: 'Scenario not found' });
    await db.ref(`projects/${project}/tenderScenarios/${id}`).remove();
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
