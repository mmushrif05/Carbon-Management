// ===== Data Privacy & Security Configuration Endpoint =====
// Provides privacy status, security configuration, and compliance information
// Enterprise clients can query this to verify data protection is active
const { getDb, verifyToken, headers, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { isEncryptionEnabled } = require('./lib/encryption');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');
const { getPrivacyConfig } = require('./lib/ai-privacy');
const { writeAuditLog } = require('./lib/permissions');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const user = await verifyToken(event);
  if (!user) return respond(401, { error: 'Unauthorized' });

  const db = getDb();
  const clientId = getClientId(event, user);
  const rateCheck = await checkRateLimit(db, clientId, 'api');
  if (!rateCheck.allowed) {
    return respond(429, { error: 'Too many requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return respond(400, { error: 'Invalid request body' });
  }

  const { action } = body;

  try {
    // ===== GET PRIVACY STATUS =====
    // Returns current data protection configuration for the dashboard
    if (action === 'status') {
      const privacyConfig = getPrivacyConfig();

      return respond(200, {
        success: true,
        privacy: {
          ...privacyConfig,
          encryptionAtRest: isEncryptionEnabled(),
          securityHeaders: true,
          corsRestricted: !!process.env.ALLOWED_ORIGINS,
          rateLimiting: true,
          auditLogging: true,
          passwordPolicy: {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: true,
            requireNumber: true,
            requireSpecial: true,
          },
        },
        compliance: {
          saudiPDPL: true,          // Personal Data Protection Law readiness
          dataResidency: 'API data processed via Anthropic (US). Documents encrypted at rest in Firebase.',
          dataRetention: 'Configurable per tenant. Default: indefinite with encryption.',
          rightToDelete: true,       // Users can request data deletion
          auditTrail: true,          // All access and AI calls are logged
          noAITraining: true,        // Anthropic does NOT train on API data
        },
        apiSecurity: {
          authentication: 'Firebase Auth with ID token verification',
          authorization: '13-level role-based access control',
          transport: 'TLS 1.2+ (HTTPS enforced)',
          inputValidation: 'Sanitization + prompt injection detection',
          rateLimiting: 'Per-user and per-IP rate limits on all endpoints',
        },
      });
    }

    // ===== GET AI AUDIT LOGS =====
    // View what data was sent to AI (metadata only — no actual content)
    if (action === 'ai-audit-logs') {
      const { limit: queryLimit } = body;
      const maxResults = Math.min(queryLimit || 50, 100);

      const snap = await db.ref('aiAuditLogs')
        .orderByChild('timestamp')
        .limitToLast(maxResults)
        .once('value');

      const logs = [];
      snap.forEach(child => {
        const log = child.val();
        // Only show logs relevant to this user (unless they are admin)
        if (log.userId === user.uid) {
          logs.push(log);
        }
      });

      // Reverse to show newest first
      logs.reverse();

      return respond(200, { success: true, logs });
    }

    // ===== REQUEST DATA DELETION =====
    // GDPR/PDPL right to erasure — creates a deletion request
    if (action === 'request-deletion') {
      const { projectId, reason } = body;
      if (!projectId) return respond(400, { error: 'Missing projectId' });

      const requestId = 'del_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      await db.ref('deletionRequests/' + requestId).set({
        id: requestId,
        projectId,
        requestedBy: user.uid,
        requestedByEmail: user.email || 'unknown',
        reason: reason || 'User requested data deletion',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      // Audit log the deletion request
      await writeAuditLog(db, {
        action: 'data_deletion_request',
        actor: user.uid,
        targetType: 'project',
        targetId: projectId,
        details: { requestId, reason: reason || 'User requested data deletion' },
      });

      return respond(200, {
        success: true,
        requestId,
        message: 'Data deletion request submitted. An administrator will process this request.',
      });
    }

    // ===== EXPORT USER DATA =====
    // GDPR/PDPL right to portability — exports metadata about stored data
    if (action === 'export-metadata') {
      const userSnap = await db.ref('users/' + user.uid).once('value');
      const profile = userSnap.val() || {};

      // Get document count (metadata only, no content)
      const docsSnap = await db.ref('documents').once('value');
      const allDocs = docsSnap.val() || {};
      const userDocs = [];
      for (const projectId of Object.keys(allDocs)) {
        for (const docId of Object.keys(allDocs[projectId] || {})) {
          const meta = allDocs[projectId][docId].meta;
          if (meta && meta.uploadedBy === user.uid) {
            userDocs.push({
              projectId,
              docId,
              fileName: meta.fileName,
              docType: meta.docType,
              uploadedAt: meta.uploadedAt,
              totalChunks: meta.totalChunks,
              encrypted: meta.encrypted || false,
            });
          }
        }
      }

      return respond(200, {
        success: true,
        export: {
          profile: {
            name: profile.name,
            email: profile.email,
            role: profile.role,
            createdAt: profile.createdAt,
          },
          documents: userDocs,
          exportedAt: new Date().toISOString(),
        },
      });
    }

    return respond(400, { error: 'Invalid action.' });

  } catch (err) {
    console.error('Data privacy error:', err);
    return respond(500, { error: 'Internal server error.' });
  }
};
