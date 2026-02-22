const { getDb, verifyToken, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');
const { dbPath } = require('./utils/config');

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

async function handleList(event) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);
    const snap = await db.ref(dbPath('a5entries')).once('value');
    const data = snap.val();
    let entries = data ? Object.values(data) : [];

    // Role-based filtering (same as A1-A3 entries):
    // - Client sees all entries
    // - Contractor sees only their own entries
    if (profile && profile.role === 'contractor') {
      entries = entries.filter(e => e.submittedByUid === decoded.uid);
    }

    return respond(200, { entries });
  } catch (e) {
    return respond(500, { error: 'Failed to load A5 entries' });
  }
}

async function handleSave(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { entry } = body;
  if (!entry || !entry.id) return respond(400, { error: 'Invalid entry data' });
  if (!entry.source) return respond(400, { error: 'Source is required' });
  if (!entry.qty || entry.qty <= 0) return respond(400, { error: 'Valid quantity is required' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);

    // Set server-verified fields
    entry.submittedBy = decoded.name || decoded.email;
    entry.submittedByUid = decoded.uid;
    entry.submittedAt = new Date().toISOString();

    // Tag with organization info
    if (profile) {
      entry.organizationId = profile.organizationId || null;
      entry.organizationName = profile.organizationName || null;
    }

    await db.ref(dbPath('a5entries') + '/' + entry.id).set(entry);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to save A5 entry' });
  }
}

async function handleDelete(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { id } = body;
  if (!id) return respond(400, { error: 'ID required' });

  try {
    const db = getDb();
    await db.ref(dbPath('a5entries') + '/' + id).remove();
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to delete A5 entry' });
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const db = getDb();
  const clientId = getClientId(event, decoded);
  const rateCheck = await checkRateLimit(db, clientId, 'api');
  if (!rateCheck.allowed) {
    return respond(429, { error: 'Too many requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
  }

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
