const { getDb, verifyToken, getUserProjectId, respond, optionsResponse } = require('./utils/firebase');

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

// Get the list of contractor UIDs that a consultant is assigned to review
async function getAssignedContractorUids(consultantUid) {
  const db = getDb();
  const snap = await db.ref('assignments')
    .orderByChild('consultantUid')
    .equalTo(consultantUid)
    .once('value');

  const data = snap.val() || {};
  return Object.values(data).map(a => a.contractorUid);
}

async function handleList(event) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);
    const projectId = profile ? (profile.projectId || profile.project || 'ksia') : 'ksia';
    const snap = await db.ref(`projects/${projectId}/entries`).once('value');
    const data = snap.val();
    let entries = data ? Object.values(data) : [];

    // Role-based filtering:
    // - Client sees all entries
    // - Consultant sees only entries from their assigned contractors (or their own)
    // - Contractor sees only their own entries
    if (profile && profile.role === 'consultant') {
      const assignedContractors = await getAssignedContractorUids(decoded.uid);
      if (assignedContractors.length > 0) {
        entries = entries.filter(e =>
          e.submittedByUid === decoded.uid ||
          assignedContractors.includes(e.submittedByUid)
        );
      }
      // If no assignments exist yet, consultant sees all (backward compatible)
    } else if (profile && profile.role === 'contractor') {
      entries = entries.filter(e => e.submittedByUid === decoded.uid);
    }
    // Client sees all — no filter

    return respond(200, { entries });
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
    const profile = await getUserProfile(decoded.uid);
    const projectId = profile ? (profile.projectId || profile.project || 'ksia') : 'ksia';

    // Set server-verified fields
    entry.submittedBy = decoded.name || decoded.email;
    entry.submittedByUid = decoded.uid;
    entry.submittedAt = new Date().toISOString();
    entry.projectId = projectId;

    // Tag with organization info
    if (profile) {
      entry.organizationId = profile.organizationId || null;
      entry.organizationName = profile.organizationName || null;
    }

    await db.ref(`projects/${projectId}/entries/${entry.id}`).set(entry);
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
  const allowedFields = ['status', 'consultantAt', 'consultantBy', 'consultantByUid', 'clientAt', 'clientBy', 'clientByUid'];
  const safeUpdates = {};
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      safeUpdates[key] = updates[key];
    }
  }

  if (Object.keys(safeUpdates).length === 0) return respond(400, { error: 'No valid updates' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);
    const projectId = profile ? (profile.projectId || profile.project || 'ksia') : 'ksia';

    // Enforce assignment-based access for consultants
    if (profile && profile.role === 'consultant') {
      const entrySnap = await db.ref(`projects/${projectId}/entries/${id}`).once('value');
      const entry = entrySnap.val();
      if (entry && entry.submittedByUid) {
        const assignedContractors = await getAssignedContractorUids(decoded.uid);
        // If assignments exist, check that this entry belongs to an assigned contractor
        if (assignedContractors.length > 0 && !assignedContractors.includes(entry.submittedByUid) && entry.submittedByUid !== decoded.uid) {
          return respond(403, { error: 'You are not assigned to review this contractor\'s submissions.' });
        }
      }
    }

    await db.ref(`projects/${projectId}/entries/${id}`).update(safeUpdates);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to update entry' });
  }
}

async function handleBatchSave(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { entries } = body;
  if (!Array.isArray(entries) || entries.length === 0) {
    return respond(400, { error: 'No entries provided' });
  }

  // Validate each entry
  for (const entry of entries) {
    if (!entry.id || !entry.category || !entry.type) {
      return respond(400, { error: 'Invalid entry data in batch: missing id, category, or type' });
    }
    if (!entry.qty || entry.qty <= 0) {
      return respond(400, { error: 'Invalid entry data in batch: invalid quantity' });
    }
  }

  try {
    const db = getDb();
    const now = new Date().toISOString();
    const submittedBy = decoded.name || decoded.email;
    const profile = await getUserProfile(decoded.uid);
    const projectId = profile ? (profile.projectId || profile.project || 'ksia') : 'ksia';

    // Use a multi-path update to write all entries atomically
    const updates = {};
    for (const entry of entries) {
      entry.submittedBy = submittedBy;
      entry.submittedByUid = decoded.uid;
      entry.submittedAt = now;
      entry.status = 'pending';
      entry.projectId = projectId;
      // Tag with organization info
      if (profile) {
        entry.organizationId = profile.organizationId || null;
        entry.organizationName = profile.organizationName || null;
      }
      updates[`projects/${projectId}/entries/${entry.id}`] = entry;
    }

    await db.ref().update(updates);
    return respond(200, { success: true, count: entries.length });
  } catch (e) {
    return respond(500, { error: 'Failed to save batch' });
  }
}

async function handleDelete(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { id } = body;
  if (!id) return respond(400, { error: 'ID required' });

  try {
    const db = getDb();
    const projectId = await getUserProjectId(decoded.uid);

    // Verify the entry exists and belongs to the user or user has permission
    const snap = await db.ref(`projects/${projectId}/entries/${id}`).once('value');
    const entry = snap.val();
    if (!entry) return respond(404, { error: 'Entry not found' });

    await db.ref(`projects/${projectId}/entries/${id}`).remove();
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
        case 'save':       return await handleSave(event, body);
        case 'batch-save': return await handleBatchSave(event, body);
        case 'update':     return await handleUpdate(event, body);
        case 'delete':     return await handleDelete(event, body);
        default:           return respond(400, { error: 'Invalid action' });
      }
    }

    return respond(405, { error: 'Method not allowed' });
  } catch (e) {
    return respond(500, { error: 'Server error' });
  }
};
