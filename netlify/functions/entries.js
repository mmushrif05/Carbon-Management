const { getDb, verifyToken, getUserProjectId, respond, optionsResponse } = require('./utils/firebase');

// ===== EMISSION FACTOR DATA (server-side copy for validation) =====
const MATERIALS = {
  Concrete:{unit:"m³",massFactor:2400,types:{
    "C15-20":{baseline:323,target:220},"C20-30":{baseline:354,target:301},"C30-40":{baseline:431,target:340},
    "C40-50":{baseline:430,target:360},"C50-60":{baseline:483,target:342},"C60-70":{baseline:522,target:345}}},
  Steel:{unit:"kg",massFactor:1,types:{
    "Structural (I sections)":{baseline:2.46,target:1.78},"Rebar":{baseline:2.26,target:1.30},
    "Hollow (Tube) sections":{baseline:2.52,target:1.83},"Hot Dip Galvanized":{baseline:2.74,target:2.07}}},
  Asphalt:{unit:"tons",massFactor:1000,types:{
    "3% Binder":{baseline:50.1,target:40.08},"3.5% Binder":{baseline:51.1,target:40.88},"4% Binder":{baseline:52.2,target:41.76},
    "4.5% Binder":{baseline:53.2,target:42.56},"5% Binder":{baseline:54.2,target:43.36},"5.5% Binder":{baseline:55.3,target:44.24},
    "6% Binder":{baseline:56.3,target:45.04},"6.5% Binder":{baseline:57.3,target:45.84},"7% Binder":{baseline:58.4,target:46.72}}},
  Aluminum:{unit:"kg",massFactor:1,types:{
    "Profile Without Coating":{baseline:8.24,target:6.59},"Profile With Coating":{baseline:9.12,target:7.30},
    "Sheets Without Coating":{baseline:7.85,target:6.28},"Anodized Sections":{baseline:10.20,target:8.16}}},
  Glass:{unit:"kg",massFactor:1,types:{
    "Annealed":{baseline:1.30,target:1.04},"Coated":{baseline:1.60,target:1.28},
    "Laminated":{baseline:1.80,target:1.44},"IGU":{baseline:2.50,target:2.00}}},
  Pipes:{unit:"m",massFactor:1,types:{
    "Precast 600mm":{baseline:138.89,target:138.89},"Precast 800mm":{baseline:241.29,target:241.29},
    "Precast 1000mm":{baseline:394.70,target:394.70},"Precast 1200mm":{baseline:543.80,target:543.80}}},
  Earthwork:{unit:"tons",massFactor:1000,types:{
    "Excavation/Hauling":{baseline:3.50,target:2.80},"Coarse Aggregate":{baseline:5.20,target:4.16},"Sand":{baseline:4.80,target:3.84}}}
};
const TEF = { road: 0.0000121, sea: 0.0000026, train: 0.0000052 };

// Server-side recalculation of emission values
function validateAndRecalcEmissions(entry) {
  const mat = MATERIALS[entry.category];
  if (!mat) return { valid: false, error: 'Unknown material category: ' + entry.category };

  const typeData = mat.types[entry.type];
  if (!typeData) return { valid: false, error: 'Unknown material type: ' + entry.type + ' in ' + entry.category };

  const qty = parseFloat(entry.qty);
  const actual = parseFloat(entry.actual);
  if (isNaN(qty) || qty <= 0) return { valid: false, error: 'Invalid quantity' };
  if (isNaN(actual) || actual <= 0) return { valid: false, error: 'Invalid actual GWP value' };

  const mass = qty * mat.massFactor;
  const road = parseFloat(entry.road) || 0;
  const sea = parseFloat(entry.sea) || 0;
  const train = parseFloat(entry.train) || 0;

  // Recalculate server-side
  const a13B = (qty * typeData.baseline) / 1000;
  const a13A = (qty * actual) / 1000;
  const a4 = (mass * road * TEF.road + mass * sea * TEF.sea + mass * train * TEF.train) / 1000;
  const a14 = a13A + a4;
  const pct = a13B > 0 ? ((a13B - a13A) / a13B) * 100 : 0;

  return {
    valid: true,
    verified: { a13B, a13A, a4, a14, pct, baseline: typeData.baseline, target: typeData.target }
  };
}

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
      } else {
        // No assignments — consultant sees only their own entries
        entries = entries.filter(e => e.submittedByUid === decoded.uid);
      }
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

  // Validate ID format — prevent path traversal
  if (typeof entry.id !== 'string' || entry.id.includes('/') || entry.id.includes('.') || entry.id.includes('$') || entry.id.includes('#') || entry.id.includes('[') || entry.id.includes(']')) {
    return respond(400, { error: 'Invalid entry ID format.' });
  }

  // Validate required fields server-side
  if (!entry.category || !entry.type) return respond(400, { error: 'Category and type are required' });
  if (!entry.qty || entry.qty <= 0) return respond(400, { error: 'Valid quantity is required' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);
    const projectId = profile ? (profile.projectId || profile.project || 'ksia') : 'ksia';

    // Server-side emission recalculation — override client values
    const validation = validateAndRecalcEmissions(entry);
    if (!validation.valid) {
      return respond(400, { error: validation.error });
    }
    // Overwrite client-submitted emission values with server-calculated ones
    entry.a13B = validation.verified.a13B;
    entry.a13A = validation.verified.a13A;
    entry.a4 = validation.verified.a4;
    entry.a14 = validation.verified.a14;
    entry.pct = validation.verified.pct;
    entry.baseline = validation.verified.baseline;
    entry.target = validation.verified.target;
    entry.serverVerified = true;

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

// Valid status transitions (approval state machine)
// pending → review (consultant reviews)
// review → approved (client approves) OR review → rejected (client/consultant rejects)
// rejected → pending (resubmission allowed)
const VALID_STATUS_TRANSITIONS = {
  'pending':  ['review'],
  'review':   ['approved', 'rejected'],
  'rejected': ['pending']
};

async function handleUpdate(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { id, updates } = body;
  if (!id || !updates) return respond(400, { error: 'ID and updates required' });

  // Validate ID format — prevent path traversal
  if (typeof id !== 'string' || id.includes('/') || id.includes('.') || id.includes('$') || id.includes('#') || id.includes('[') || id.includes(']')) {
    return respond(400, { error: 'Invalid entry ID format.' });
  }

  // Only allow updating specific safe fields
  const allowedFields = ['status', 'consultantAt', 'consultantBy', 'consultantByUid', 'clientAt', 'clientBy', 'clientByUid', 'rejectionReason'];
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

    // Fetch the entry to check current state
    const entrySnap = await db.ref(`projects/${projectId}/entries/${id}`).once('value');
    const entry = entrySnap.val();
    if (!entry) return respond(404, { error: 'Entry not found.' });

    // ===== SELF-APPROVAL PREVENTION =====
    // The person who submitted the entry cannot approve/review their own submission
    if (safeUpdates.status && safeUpdates.status !== 'rejected' && safeUpdates.status !== 'pending') {
      if (entry.submittedByUid === decoded.uid) {
        return respond(403, { error: 'You cannot approve or review your own submission. Another reviewer must handle this entry.' });
      }
    }

    // ===== APPROVAL STATE MACHINE =====
    if (safeUpdates.status) {
      const currentStatus = entry.status || 'pending';
      const newStatus = safeUpdates.status;
      const allowed = VALID_STATUS_TRANSITIONS[currentStatus];

      if (!allowed || !allowed.includes(newStatus)) {
        return respond(400, { error: `Invalid status transition: "${currentStatus}" → "${newStatus}". Allowed transitions from "${currentStatus}": ${(allowed || []).join(', ') || 'none'}.` });
      }

      // Role-based transition enforcement:
      // pending → review: consultant or client
      // review → approved: client only
      // review → rejected: consultant or client
      // rejected → pending: contractor (resubmission) or client
      if (currentStatus === 'review' && newStatus === 'approved') {
        if (profile.role !== 'client') {
          return respond(403, { error: 'Only clients can give final approval.' });
        }
      }
    }

    // ===== ASSIGNMENT-BASED ACCESS FOR CONSULTANTS =====
    if (profile && profile.role === 'consultant') {
      if (entry.submittedByUid) {
        const assignedContractors = await getAssignedContractorUids(decoded.uid);
        if (assignedContractors.length > 0 && !assignedContractors.includes(entry.submittedByUid) && entry.submittedByUid !== decoded.uid) {
          return respond(403, { error: 'You are not assigned to review this contractor\'s submissions.' });
        }
        // If no assignments exist, consultant is blocked from updating ANY entry
        if (assignedContractors.length === 0) {
          return respond(403, { error: 'You have no contractor assignments. Contact the client to get assigned.' });
        }
      }
    }

    // Contractor can only update their own entries (resubmission)
    if (profile && profile.role === 'contractor') {
      if (entry.submittedByUid !== decoded.uid) {
        return respond(403, { error: 'You can only update your own submissions.' });
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

  // Batch size limit to prevent abuse
  if (entries.length > 500) {
    return respond(400, { error: 'Batch size limit is 500 entries. Please split into smaller batches.' });
  }

  // Validate each entry
  for (const entry of entries) {
    if (!entry.id || !entry.category || !entry.type) {
      return respond(400, { error: 'Invalid entry data in batch: missing id, category, or type' });
    }
    if (typeof entry.id !== 'string' || entry.id.includes('/') || entry.id.includes('.') || entry.id.includes('$') || entry.id.includes('#') || entry.id.includes('[') || entry.id.includes(']')) {
      return respond(400, { error: 'Invalid entry ID format in batch.' });
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
      // Server-side emission recalculation for each entry
      const validation = validateAndRecalcEmissions(entry);
      if (!validation.valid) {
        return respond(400, { error: 'Batch validation failed for entry ' + entry.id + ': ' + validation.error });
      }
      entry.a13B = validation.verified.a13B;
      entry.a13A = validation.verified.a13A;
      entry.a4 = validation.verified.a4;
      entry.a14 = validation.verified.a14;
      entry.pct = validation.verified.pct;
      entry.baseline = validation.verified.baseline;
      entry.target = validation.verified.target;
      entry.serverVerified = true;

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

  // Validate ID format — prevent path traversal
  if (typeof id !== 'string' || id.includes('/') || id.includes('.') || id.includes('$') || id.includes('#') || id.includes('[') || id.includes(']')) {
    return respond(400, { error: 'Invalid entry ID format.' });
  }

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);
    const projectId = profile ? (profile.projectId || profile.project || 'ksia') : 'ksia';

    const snap = await db.ref(`projects/${projectId}/entries/${id}`).once('value');
    const entry = snap.val();
    if (!entry) return respond(404, { error: 'Entry not found' });

    // Ownership & role-based delete permissions:
    // - Client can delete any entry
    // - Consultant can delete entries from their assigned contractors
    // - Contractor can only delete their own entries (and only if still pending)
    if (profile.role === 'contractor') {
      if (entry.submittedByUid !== decoded.uid) {
        return respond(403, { error: 'You can only delete your own entries.' });
      }
      if (entry.status && entry.status !== 'pending') {
        return respond(403, { error: 'You can only delete entries that are still in "pending" status.' });
      }
    } else if (profile.role === 'consultant') {
      const assignedContractors = await getAssignedContractorUids(decoded.uid);
      if (entry.submittedByUid !== decoded.uid && !assignedContractors.includes(entry.submittedByUid)) {
        return respond(403, { error: 'You can only delete entries from your assigned contractors.' });
      }
    }
    // Client can delete any entry — no restriction

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
