const { getDb, verifyToken, getUserProject, respond, optionsResponse } = require('./utils/firebase');

async function handleList(event) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const project = await getUserProject(decoded.uid);
  if (!project) return respond(403, { error: 'No project assigned to this user.' });

  try {
    const db = getDb();
    const snap = await db.ref(`projects/${project}/a5entries`).once('value');
    const data = snap.val();
    return respond(200, { entries: data ? Object.values(data) : [] });
  } catch (e) {
    return respond(500, { error: 'Failed to load A5 entries' });
  }
}

async function handleSave(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const project = await getUserProject(decoded.uid);
  if (!project) return respond(403, { error: 'No project assigned to this user.' });

  const { entry } = body;
  if (!entry || !entry.id) return respond(400, { error: 'Invalid entry data' });
  if (!entry.source) return respond(400, { error: 'Source is required' });
  if (!entry.qty || entry.qty <= 0) return respond(400, { error: 'Valid quantity is required' });

  try {
    const db = getDb();
    entry.submittedAt = new Date().toISOString();
    entry.submitterUid = decoded.uid;
    entry.project = project;
    await db.ref(`projects/${project}/a5entries/${entry.id}`).set(entry);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to save A5 entry' });
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
    await db.ref(`projects/${project}/a5entries/${id}`).remove();
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to delete A5 entry' });
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
        case 'delete': return await handleDelete(event, body);
        default:       return respond(400, { error: 'Invalid action' });
      }
    }

    return respond(405, { error: 'Method not allowed' });
  } catch (e) {
    return respond(500, { error: 'Server error' });
  }
};
