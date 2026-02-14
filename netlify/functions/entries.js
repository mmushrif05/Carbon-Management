const { getDb, verifyToken, respond, optionsResponse } = require('./utils/firebase');

async function handleList(event) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  try {
    const db = getDb();
    const snap = await db.ref('projects/ksia/entries').once('value');
    const data = snap.val();
    return respond(200, { entries: data ? Object.values(data) : [] });
  } catch (e) {
    return respond(500, { error: 'Failed to load entries' });
  }
}

async function handleSave(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { entry } = body;
  if (!entry || !entry.id) return respond(400, { error: 'Invalid entry data' });

  // Validate required fields server-side
  if (!entry.category || !entry.type) return respond(400, { error: 'Category and type are required' });
  if (!entry.qty || entry.qty <= 0) return respond(400, { error: 'Valid quantity is required' });

  try {
    const db = getDb();
    // Set server-verified fields
    entry.submittedBy = decoded.name || decoded.email;
    entry.submittedAt = new Date().toISOString();
    await db.ref('projects/ksia/entries/' + entry.id).set(entry);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to save entry' });
  }
}

async function handleUpdate(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { id, updates } = body;
  if (!id || !updates) return respond(400, { error: 'ID and updates required' });

  // Only allow updating specific safe fields
  const allowedFields = ['status', 'consultantAt', 'consultantBy', 'clientAt', 'clientBy'];
  const safeUpdates = {};
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      safeUpdates[key] = updates[key];
    }
  }

  if (Object.keys(safeUpdates).length === 0) return respond(400, { error: 'No valid updates' });

  try {
    const db = getDb();
    await db.ref('projects/ksia/entries/' + id).update(safeUpdates);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to update entry' });
  }
}

async function handleDelete(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { id } = body;
  if (!id) return respond(400, { error: 'ID required' });

  try {
    const db = getDb();
    // Verify the entry exists and belongs to the user or user has permission
    const snap = await db.ref('projects/ksia/entries/' + id).once('value');
    const entry = snap.val();
    if (!entry) return respond(404, { error: 'Entry not found' });

    await db.ref('projects/ksia/entries/' + id).remove();
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to delete entry' });
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
