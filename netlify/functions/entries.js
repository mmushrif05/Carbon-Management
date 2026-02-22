const { getDb, verifyToken, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

// Get the list of contractor UIDs that a consultant is assigned to review (legacy assignments table)
async function getAssignedContractorUids(consultantUid) {
  const db = getDb();
  const snap = await db.ref('assignments')
    .orderByChild('consultantUid')
    .equalTo(consultantUid)
    .once('value');

  const data = snap.val() || {};
  return Object.values(data).map(a => a.contractorUid);
}

// Get project IDs assigned to a user via project_assignments or org links
async function getAssignedProjectIds(uid, profile) {
  const db = getDb();
  const [assignSnap, orgLinkSnap] = await Promise.all([
    db.ref('project_assignments').once('value'),
    db.ref('project_org_links').once('value')
  ]);
  const projectIds = new Set();
  Object.values(assignSnap.val() || {}).forEach(a => {
    if (a.userId === uid && a.projectId) projectIds.add(String(a.projectId));
  });
  if (profile && profile.organizationId) {
    Object.values(orgLinkSnap.val() || {}).forEach(l => {
      if (l.orgId === profile.organizationId && l.projectId) projectIds.add(String(l.projectId));
    });
  }
  return projectIds;
}

async function handleList(event) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);
    const snap = await db.ref('projects/ksia/entries').once('value');
    const data = snap.val();
    let entries = data ? Object.values(data) : [];

    // Role-based filtering
    if (profile && profile.role === 'consultant') {
      // Use both old assignments AND new project_assignments
      const assignedContractors = await getAssignedContractorUids(decoded.uid);
      const assignedProjectIds = await getAssignedProjectIds(decoded.uid, profile);
      if (assignedContractors.length > 0 || assignedProjectIds.size > 0) {
        entries = entries.filter(e =>
          e.submittedByUid === decoded.uid ||
          assignedContractors.includes(e.submittedByUid) ||
          (e.projectId && assignedProjectIds.has(String(e.projectId)))
        );
      }
      // If no assignments exist yet, consultant sees all (backward compatible)
    } else if (profile && profile.role === 'contractor') {
      // Contractor sees entries from their organization
      if (profile.organizationId) {
        entries = entries.filter(e => e.organizationId === profile.organizationId);
      } else {
        entries = entries.filter(e => e.submittedByUid === decoded.uid);
      }
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

  // ===== ANOMALY GUARD — Block extreme EF values =====
  const baseEF = Number(entry.baselineEF || entry.baseline || 0);
  const actEF = Number(entry.actualEF || entry.actual || 0);
  if (baseEF > 0 && actEF > 0) {
    const ratio = actEF / baseEF;
    if (ratio > 100) {
      return respond(400, {
        error: 'BLOCKED: Actual EF (' + actEF + ') is ' + Math.round(ratio) + 'x the baseline (' + baseEF + '). ' +
          'You likely entered the TOTAL carbon instead of the per-unit emission factor. ' +
          'Please enter the EF from the EPD (per ' + (entry.unit || 'unit') + '), not the total.'
      });
    }
    // Flag suspicious entries (10x-100x) so consultant sees warning
    if (ratio > 10) {
      entry._anomalyFlag = 'EF_RATIO_' + Math.round(ratio) + 'X';
      entry._anomalyRatio = ratio;
    }
  }

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

    // Enforce assignment-based access for consultants
    if (profile && profile.role === 'consultant') {
      const entrySnap = await db.ref('projects/ksia/entries/' + id).once('value');
      const entry = entrySnap.val();
      if (entry && entry.submittedByUid) {
        const assignedContractors = await getAssignedContractorUids(decoded.uid);
        // If assignments exist, check that this entry belongs to an assigned contractor
        if (assignedContractors.length > 0 && !assignedContractors.includes(entry.submittedByUid) && entry.submittedByUid !== decoded.uid) {
          return respond(403, { error: 'You are not assigned to review this contractor\'s submissions.' });
        }
      }
    }

    await db.ref('projects/ksia/entries/' + id).update(safeUpdates);
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

    // Use a multi-path update to write all entries atomically
    const updates = {};
    for (const entry of entries) {
      entry.submittedBy = submittedBy;
      entry.submittedByUid = decoded.uid;
      entry.submittedAt = now;
      entry.status = 'pending';
      // Tag with organization info
      if (profile) {
        entry.organizationId = profile.organizationId || null;
        entry.organizationName = profile.organizationName || null;
      }
      updates['projects/ksia/entries/' + entry.id] = entry;
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

// ===== EDIT/DELETE REQUEST WORKFLOW =====

// Contractor requests permission to edit or delete an entry
async function handleRequestChange(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { entryId, requestType, reason, proposedChanges } = body;
  if (!entryId || !requestType) return respond(400, { error: 'entryId and requestType required' });
  if (!['edit', 'delete'].includes(requestType)) return respond(400, { error: 'requestType must be edit or delete' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);

    // Verify the entry exists and belongs to the requester (by UID or organization)
    const entrySnap = await db.ref('projects/ksia/entries/' + String(entryId)).once('value');
    const entry = entrySnap.val();
    if (!entry) return respond(404, { error: 'Entry not found' });
    const isOwner = entry.submittedByUid === decoded.uid ||
      (profile && profile.organizationId && entry.organizationId === profile.organizationId);
    if (!isOwner) {
      return respond(403, { error: 'You can only request changes to your own entries' });
    }

    const requestId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const request = {
      id: requestId,
      entryId: String(entryId),
      requestType,
      reason: reason || '',
      proposedChanges: requestType === 'edit' ? (proposedChanges || {}) : null,
      status: 'pending',
      requestedBy: decoded.name || decoded.email,
      requestedByUid: decoded.uid,
      organizationId: profile ? profile.organizationId : null,
      organizationName: profile ? profile.organizationName : null,
      projectId: entry.projectId ? String(entry.projectId) : null,
      projectName: entry.projectName || null,
      entryCategory: entry.category,
      entryType: entry.type,
      entryMonth: entry.monthLabel,
      requestedAt: new Date().toISOString()
    };

    await db.ref('projects/ksia/editRequests/' + requestId).set(request);

    // Mark the entry with a pending request flag — store enough info on the entry itself
    // so consultants can see and act on requests directly from the entry list
    await db.ref('projects/ksia/entries/' + String(entryId)).update({
      editRequestId: requestId,
      editRequestType: requestType,
      editRequestStatus: 'pending',
      editRequestReason: reason || '',
      editRequestBy: decoded.name || decoded.email,
      editRequestByOrg: profile ? (profile.organizationName || null) : null
    });

    return respond(200, { success: true, requestId });
  } catch (e) {
    return respond(500, { error: 'Failed to create change request' });
  }
}

// List edit/delete requests (for consultant/client approval)
async function handleListRequests(event) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);
    const snap = await db.ref('projects/ksia/editRequests').once('value');
    const data = snap.val();
    let requests = data ? Object.values(data) : [];

    // Filter by role — only contractors are restricted to their own requests
    if (profile && profile.role === 'contractor') {
      if (profile.organizationId) {
        requests = requests.filter(r => r.organizationId === profile.organizationId);
      } else {
        requests = requests.filter(r => r.requestedByUid === decoded.uid);
      }
    } else if (profile && profile.role === 'consultant') {
      // Consultant sees requests for projects they have access to
      const assignedContractors = await getAssignedContractorUids(decoded.uid);
      const assignedProjectIds = await getAssignedProjectIds(decoded.uid, profile);

      // Also include projects the consultant created
      const projSnap = await db.ref('projects').once('value');
      const projData = projSnap.val() || {};
      Object.values(projData).forEach(p => {
        if (p && p.id && p.createdBy === decoded.uid) assignedProjectIds.add(String(p.id));
      });

      if (assignedContractors.length > 0 || assignedProjectIds.size > 0) {
        requests = requests.filter(r =>
          r.status === 'pending' || // ALWAYS show all pending requests to consultant
          r.requestedByUid === decoded.uid ||
          assignedContractors.includes(r.requestedByUid) ||
          (r.projectId && assignedProjectIds.has(String(r.projectId)))
        );
      }
      // If no assignments, consultant sees all (backward compatible)
    }
    // Consultants and clients see ALL requests — project-level filtering
    // is handled in the frontend when displaying per-project views

    return respond(200, { requests });
  } catch (e) {
    console.error('[EDIT_REQUESTS] list-requests error:', e.message);
    return respond(500, { error: 'Failed to load requests' });
  }
}

// Consultant/client approves or rejects a change request
async function handleResolveRequest(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { requestId, resolution } = body;
  if (!requestId || !resolution) return respond(400, { error: 'requestId and resolution required' });
  if (!['approved', 'rejected'].includes(resolution)) return respond(400, { error: 'resolution must be approved or rejected' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);

    // Only consultants and clients can resolve requests
    if (profile && profile.role === 'contractor') {
      return respond(403, { error: 'Contractors cannot approve/reject requests' });
    }

    const reqSnap = await db.ref('projects/ksia/editRequests/' + requestId).once('value');
    const request = reqSnap.val();
    if (!request) return respond(404, { error: 'Request not found' });
    if (request.status !== 'pending') return respond(400, { error: 'Request already resolved' });

    // Update request status
    await db.ref('projects/ksia/editRequests/' + requestId).update({
      status: resolution,
      resolvedBy: decoded.name || decoded.email,
      resolvedByUid: decoded.uid,
      resolvedAt: new Date().toISOString()
    });

    // Update the entry's request flag
    const entryRef = db.ref('projects/ksia/entries/' + request.entryId);
    const entrySnap = await entryRef.once('value');
    const entry = entrySnap.val();

    if (entry) {
      if (resolution === 'approved') {
        if (request.requestType === 'delete') {
          // Delete approved — remove the entry
          await entryRef.remove();
        } else if (request.requestType === 'edit') {
          // Edit approved — mark entry as editable by the contractor
          await entryRef.update({
            editRequestStatus: 'approved',
            editApprovedBy: decoded.name || decoded.email,
            editApprovedAt: new Date().toISOString()
          });
        }
      } else {
        // Rejected — clear the request flags from the entry
        await entryRef.update({
          editRequestId: null,
          editRequestType: null,
          editRequestStatus: null,
          editRequestReason: null,
          editRequestBy: null,
          editRequestByOrg: null
        });
      }
    }

    return respond(200, { success: true, deleted: resolution === 'approved' && request.requestType === 'delete' });
  } catch (e) {
    return respond(500, { error: 'Failed to resolve request' });
  }
}

// Contractor applies approved edit changes
async function handleApplyEdit(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { entryId, changes } = body;
  if (!entryId || !changes) return respond(400, { error: 'entryId and changes required' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);
    const entryRef = db.ref('projects/ksia/entries/' + String(entryId));
    const entrySnap = await entryRef.once('value');
    const entry = entrySnap.val();

    if (!entry) return respond(404, { error: 'Entry not found' });
    const isOwner = entry.submittedByUid === decoded.uid ||
      (profile && profile.organizationId && entry.organizationId === profile.organizationId);
    if (!isOwner) return respond(403, { error: 'Not your entry' });

    // Only allow updating data fields (not status/metadata)
    const editableFields = ['qty', 'actual', 'actualEF', 'road', 'sea', 'train', 'notes',
      'a13B', 'a13A', 'a4', 'a14', 'pct', 'epdId', 'epdRef'];
    const safeChanges = {};
    for (const key of Object.keys(changes)) {
      if (editableFields.includes(key)) {
        safeChanges[key] = changes[key];
      }
    }

    if (Object.keys(safeChanges).length === 0) return respond(400, { error: 'No valid changes' });

    // Apply changes and clear edit flags, reset status to pending for re-review
    safeChanges.editRequestId = null;
    safeChanges.editRequestType = null;
    safeChanges.editRequestStatus = null;
    safeChanges.editRequestReason = null;
    safeChanges.editRequestBy = null;
    safeChanges.editRequestByOrg = null;
    safeChanges.editApprovedBy = null;
    safeChanges.editApprovedAt = null;
    safeChanges.status = 'pending';
    safeChanges.lastEditedAt = new Date().toISOString();
    safeChanges.lastEditedBy = decoded.name || decoded.email;

    await entryRef.update(safeChanges);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to apply edit' });
  }
}

// ===== FORCE DELETE — Consultant/Client can delete ANY entry (even approved) =====
async function handleForceDelete(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { id, reason } = body;
  if (!id) return respond(400, { error: 'Entry ID required' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);

    // Only consultant and client can force-delete
    if (!profile || (profile.role !== 'consultant' && profile.role !== 'client')) {
      return respond(403, { error: 'Only consultants and clients can force-delete entries' });
    }

    const snap = await db.ref('projects/ksia/entries/' + id).once('value');
    const entry = snap.val();
    if (!entry) return respond(404, { error: 'Entry not found' });

    // Log the deletion for audit trail
    const auditId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    await db.ref('projects/ksia/auditLog/' + auditId).set({
      action: 'force-delete',
      entryId: id,
      entryCategory: entry.category,
      entryType: entry.type,
      entryActualEF: entry.actualEF || entry.actual,
      entryBaselineEF: entry.baselineEF || entry.baseline,
      entryQty: entry.qty,
      previousStatus: entry.status,
      reason: reason || 'No reason provided',
      deletedBy: decoded.name || decoded.email,
      deletedByUid: decoded.uid,
      deletedByRole: profile.role,
      deletedAt: new Date().toISOString()
    });

    // Remove the entry
    await db.ref('projects/ksia/entries/' + id).remove();

    // Also clean up any pending edit requests for this entry
    const reqSnap = await db.ref('projects/ksia/editRequests').orderByChild('entryId').equalTo(String(id)).once('value');
    const requests = reqSnap.val() || {};
    for (const reqId of Object.keys(requests)) {
      await db.ref('projects/ksia/editRequests/' + reqId).update({ status: 'resolved_by_delete', resolvedAt: new Date().toISOString() });
    }

    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to force-delete. Please try again.' });
  }
}

// ===== FORCE CORRECT — Consultant/Client can fix an entry's EF directly =====
async function handleForceCorrect(event, body) {
  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Unauthorized' });

  const { id, corrections, reason } = body;
  if (!id || !corrections) return respond(400, { error: 'Entry ID and corrections required' });

  try {
    const db = getDb();
    const profile = await getUserProfile(decoded.uid);

    // Only consultant and client
    if (!profile || (profile.role !== 'consultant' && profile.role !== 'client')) {
      return respond(403, { error: 'Only consultants and clients can force-correct entries' });
    }

    const entryRef = db.ref('projects/ksia/entries/' + id);
    const snap = await entryRef.once('value');
    const entry = snap.val();
    if (!entry) return respond(404, { error: 'Entry not found' });

    // Only allow correcting data fields
    const allowedCorrectionFields = ['actualEF', 'actual', 'qty', 'a13A', 'a13B', 'a4', 'a14', 'pct', 'notes'];
    const safeFixes = {};
    for (const key of Object.keys(corrections)) {
      if (allowedCorrectionFields.includes(key)) {
        safeFixes[key] = corrections[key];
      }
    }

    if (Object.keys(safeFixes).length === 0) return respond(400, { error: 'No valid corrections' });

    // Audit trail
    const auditId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    await db.ref('projects/ksia/auditLog/' + auditId).set({
      action: 'force-correct',
      entryId: id,
      previousValues: Object.fromEntries(Object.keys(safeFixes).map(k => [k, entry[k]])),
      newValues: safeFixes,
      reason: reason || 'Data correction',
      correctedBy: decoded.name || decoded.email,
      correctedByUid: decoded.uid,
      correctedByRole: profile.role,
      correctedAt: new Date().toISOString()
    });

    // Apply corrections
    safeFixes._correctedBy = decoded.name || decoded.email;
    safeFixes._correctedAt = new Date().toISOString();
    safeFixes._anomalyFlag = null; // Clear anomaly flag after correction

    await entryRef.update(safeFixes);
    return respond(200, { success: true });
  } catch (e) {
    return respond(500, { error: 'Failed to force-correct. Please try again.' });
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  // CSRF validation on state-changing requests
  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  try {
    // Rate limiting
    const decoded = await verifyToken(event);
    if (decoded) {
      const db = getDb();
      const clientId = getClientId(event, decoded);
      const rateCheck = await checkRateLimit(db, clientId, 'api');
      if (!rateCheck.allowed) {
        return respond(429, { error: 'Too many requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
      }
    }

    if (event.httpMethod === 'GET') {
      return await handleList(event);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action } = body;

      switch (action) {
        case 'save':            return await handleSave(event, body);
        case 'batch-save':      return await handleBatchSave(event, body);
        case 'update':          return await handleUpdate(event, body);
        case 'delete':          return await handleDelete(event, body);
        case 'force-delete':    return await handleForceDelete(event, body);
        case 'force-correct':   return await handleForceCorrect(event, body);
        case 'request-change':  return await handleRequestChange(event, body);
        case 'list-requests':   return await handleListRequests(event);
        case 'resolve-request': return await handleResolveRequest(event, body);
        case 'apply-edit':      return await handleApplyEdit(event, body);
        default:                return respond(400, { error: 'Invalid action' });
      }
    }

    return respond(405, { error: 'Method not allowed' });
  } catch (e) {
    return respond(500, { error: 'Server error' });
  }
};
