const { getDb, verifyToken, respond, optionsResponse } = require('./utils/firebase');

async function getUserProfile(uid) {
  const db = getDb();
  const snap = await db.ref('users/' + uid).once('value');
  return snap.val();
}

// === LIST SUBMISSIONS ===
async function handleList(decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const db = getDb();
  const project = profile.project || 'ksia';
  const snap = await db.ref('projects/' + project + '/submissions').once('value');
  const data = snap.val() || {};
  let submissions = Object.values(data);

  if (profile.role === 'contractor') {
    submissions = submissions.filter(s => s.createdBy === decoded.uid);
  }
  // consultant/client see all non-draft submissions (there are no draft submissions in practice)

  submissions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return respond(200, { submissions });
}

// === SUBMIT MONTHLY PACKAGE ===
async function handleSubmit(body, decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });
  if (profile.role !== 'contractor') {
    return respond(403, { error: 'Only contractors can submit packages.' });
  }

  const { month } = body;
  if (!month) return respond(400, { error: 'Month is required.' });

  const db = getDb();
  const project = profile.project || 'ksia';

  // Get all entries for this month by this contractor that are draft
  const entriesSnap = await db.ref('projects/' + project + '/entries').once('value');
  const allEntries = entriesSnap.val() || {};
  const draftEntries = Object.entries(allEntries)
    .filter(([key, e]) => e.monthKey === month && e.createdByUid === decoded.uid && e.status === 'draft');

  if (draftEntries.length === 0) {
    return respond(400, { error: 'No draft entries found for this month.' });
  }

  let totalA13B = 0, totalA13A = 0, totalA4 = 0, totalA14 = 0;
  const itemIds = [];
  for (const [key, e] of draftEntries) {
    totalA13B += e.a13B || 0;
    totalA13A += e.a13A || 0;
    totalA4 += e.a4 || 0;
    totalA14 += e.a14 || 0;
    itemIds.push(e.id);
  }

  const submissionId = Date.now().toString();
  const monthLabel = draftEntries[0][1].monthLabel;
  const now = new Date().toISOString();

  const submission = {
    id: submissionId,
    month,
    monthLabel,
    status: 'submitted',
    createdBy: decoded.uid,
    createdByName: profile.name,
    project,
    itemIds,
    itemCount: itemIds.length,
    totalA13B,
    totalA13A,
    totalA4,
    totalA14,
    createdAt: now,
    submittedAt: now
  };

  // Save submission and lock all entries atomically
  const updates = {};
  updates['projects/' + project + '/submissions/' + submissionId] = submission;
  for (const [key, e] of draftEntries) {
    updates['projects/' + project + '/entries/' + e.id + '/status'] = 'submitted';
    updates['projects/' + project + '/entries/' + e.id + '/submissionId'] = submissionId;
    updates['projects/' + project + '/entries/' + e.id + '/locked'] = true;
  }
  await db.ref().update(updates);

  console.log('[SUBMISSIONS] Package submitted:', submissionId, month, itemIds.length, 'items by', decoded.uid);
  return respond(200, { submission });
}

// === REVIEW (Approve or Return) ===
async function handleReview(body, decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });
  if (profile.role !== 'consultant' && profile.role !== 'client') {
    return respond(403, { error: 'Only consultants and clients can review submissions.' });
  }

  const { submissionId, reviewAction, lineItemReviews } = body;
  if (!submissionId) return respond(400, { error: 'Submission ID is required.' });
  if (reviewAction !== 'approve' && reviewAction !== 'return') {
    return respond(400, { error: 'Action must be "approve" or "return".' });
  }

  const db = getDb();
  const project = profile.project || 'ksia';
  const subSnap = await db.ref('projects/' + project + '/submissions/' + submissionId).once('value');
  const submission = subSnap.val();

  if (!submission) return respond(404, { error: 'Submission not found.' });
  if (submission.status !== 'submitted') {
    return respond(400, { error: 'Only submitted packages can be reviewed. Current status: ' + submission.status });
  }

  const now = new Date().toISOString();
  const updates = {};

  if (reviewAction === 'approve') {
    updates['projects/' + project + '/submissions/' + submissionId + '/status'] = 'approved';
    updates['projects/' + project + '/submissions/' + submissionId + '/approvedAt'] = now;
    updates['projects/' + project + '/submissions/' + submissionId + '/reviewedBy'] = decoded.uid;
    updates['projects/' + project + '/submissions/' + submissionId + '/reviewedByName'] = profile.name;
    updates['projects/' + project + '/submissions/' + submissionId + '/reviewedByRole'] = profile.role;

    for (const itemId of submission.itemIds) {
      updates['projects/' + project + '/entries/' + itemId + '/status'] = 'approved';
    }

    await db.ref().update(updates);
    console.log('[SUBMISSIONS] Approved:', submissionId, 'by', decoded.uid);
    return respond(200, { success: true, status: 'approved' });
  }

  // reviewAction === 'return'
  if (!lineItemReviews || typeof lineItemReviews !== 'object') {
    return respond(400, { error: 'Line item reviews are required when returning a submission.' });
  }

  const flaggedItems = Object.entries(lineItemReviews).filter(([id, r]) => r.status === 'needs_fix');
  if (flaggedItems.length === 0) {
    return respond(400, { error: 'Mark at least one line item as needs_fix.' });
  }

  for (const [id, review] of flaggedItems) {
    if (!review.reason || !review.reason.trim()) {
      return respond(400, { error: 'A reason is required for each flagged item.' });
    }
  }

  // Add reviewer metadata to each review
  const enrichedReviews = {};
  for (const [id, review] of Object.entries(lineItemReviews)) {
    enrichedReviews[id] = {
      ...review,
      reviewedBy: profile.name,
      reviewedByRole: profile.role,
      date: now
    };
  }

  updates['projects/' + project + '/submissions/' + submissionId + '/status'] = 'returned';
  updates['projects/' + project + '/submissions/' + submissionId + '/returnedAt'] = now;
  updates['projects/' + project + '/submissions/' + submissionId + '/reviewedBy'] = decoded.uid;
  updates['projects/' + project + '/submissions/' + submissionId + '/reviewedByName'] = profile.name;
  updates['projects/' + project + '/submissions/' + submissionId + '/reviewedByRole'] = profile.role;
  updates['projects/' + project + '/submissions/' + submissionId + '/lineItemReviews'] = enrichedReviews;

  for (const itemId of submission.itemIds) {
    const review = enrichedReviews[itemId];
    if (review && review.status === 'needs_fix') {
      updates['projects/' + project + '/entries/' + itemId + '/status'] = 'needs_fix';
      updates['projects/' + project + '/entries/' + itemId + '/locked'] = false;
      updates['projects/' + project + '/entries/' + itemId + '/needsFix'] = true;
    }
    // Items marked 'ok' stay locked with status 'submitted'
  }

  await db.ref().update(updates);
  console.log('[SUBMISSIONS] Returned:', submissionId, flaggedItems.length, 'items flagged by', decoded.uid);
  return respond(200, { success: true, status: 'returned', flaggedCount: flaggedItems.length });
}

// === RESUBMIT PACKAGE ===
async function handleResubmit(body, decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });
  if (profile.role !== 'contractor') {
    return respond(403, { error: 'Only contractors can resubmit packages.' });
  }

  const { submissionId } = body;
  if (!submissionId) return respond(400, { error: 'Submission ID is required.' });

  const db = getDb();
  const project = profile.project || 'ksia';
  const subSnap = await db.ref('projects/' + project + '/submissions/' + submissionId).once('value');
  const submission = subSnap.val();

  if (!submission) return respond(404, { error: 'Submission not found.' });
  if (submission.status !== 'returned') {
    return respond(400, { error: 'Only returned packages can be resubmitted.' });
  }
  if (submission.createdBy !== decoded.uid) {
    return respond(403, { error: 'You can only resubmit your own packages.' });
  }

  // Recalculate totals from current entry data
  let totalA13B = 0, totalA13A = 0, totalA4 = 0, totalA14 = 0;
  for (const itemId of submission.itemIds) {
    const entrySnap = await db.ref('projects/' + project + '/entries/' + itemId).once('value');
    const entry = entrySnap.val();
    if (entry) {
      totalA13B += entry.a13B || 0;
      totalA13A += entry.a13A || 0;
      totalA4 += entry.a4 || 0;
      totalA14 += entry.a14 || 0;
    }
  }

  const now = new Date().toISOString();
  const updates = {};

  updates['projects/' + project + '/submissions/' + submissionId + '/status'] = 'submitted';
  updates['projects/' + project + '/submissions/' + submissionId + '/submittedAt'] = now;
  updates['projects/' + project + '/submissions/' + submissionId + '/returnedAt'] = null;
  updates['projects/' + project + '/submissions/' + submissionId + '/lineItemReviews'] = null;
  updates['projects/' + project + '/submissions/' + submissionId + '/totalA13B'] = totalA13B;
  updates['projects/' + project + '/submissions/' + submissionId + '/totalA13A'] = totalA13A;
  updates['projects/' + project + '/submissions/' + submissionId + '/totalA4'] = totalA4;
  updates['projects/' + project + '/submissions/' + submissionId + '/totalA14'] = totalA14;

  for (const itemId of submission.itemIds) {
    updates['projects/' + project + '/entries/' + itemId + '/status'] = 'submitted';
    updates['projects/' + project + '/entries/' + itemId + '/locked'] = true;
    updates['projects/' + project + '/entries/' + itemId + '/needsFix'] = false;
  }

  await db.ref().update(updates);
  console.log('[SUBMISSIONS] Resubmitted:', submissionId, 'by', decoded.uid);
  return respond(200, { success: true, status: 'submitted' });
}

// === GET SUBMISSION WITH ENTRIES ===
async function handleGet(body, decoded) {
  const profile = await getUserProfile(decoded.uid);
  if (!profile) return respond(403, { error: 'Profile not found.' });

  const { submissionId } = body;
  if (!submissionId) return respond(400, { error: 'Submission ID is required.' });

  const db = getDb();
  const project = profile.project || 'ksia';
  const subSnap = await db.ref('projects/' + project + '/submissions/' + submissionId).once('value');
  const submission = subSnap.val();

  if (!submission) return respond(404, { error: 'Submission not found.' });

  // Contractor can only see their own; consultant/client can see all
  if (profile.role === 'contractor' && submission.createdBy !== decoded.uid) {
    return respond(403, { error: 'Access denied.' });
  }

  const entries = [];
  for (const itemId of submission.itemIds) {
    const entrySnap = await db.ref('projects/' + project + '/entries/' + itemId).once('value');
    const entry = entrySnap.val();
    if (entry) entries.push(entry);
  }

  return respond(200, { submission, entries });
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

    switch (action) {
      case 'list':     return await handleList(decoded);
      case 'submit':   return await handleSubmit(body, decoded);
      case 'review':   return await handleReview(body, decoded);
      case 'resubmit': return await handleResubmit(body, decoded);
      case 'get':      return await handleGet(body, decoded);
      default:         return respond(400, { error: 'Invalid action.' });
    }
  } catch (e) {
    console.error('[SUBMISSIONS] Server error:', e);
    return respond(500, { error: 'Server error: ' + (e.message || 'Unknown') });
  }
};
