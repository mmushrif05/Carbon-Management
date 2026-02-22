const nodemailer = require('nodemailer');
const { getDb, verifyToken, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

// Create reusable transporter using SMTP env vars
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

function getAppUrl() {
  return process.env.APP_URL || process.env.URL || 'https://your-app.netlify.app';
}

function buildInvitationEmail(invitation, appUrl) {
  const inviteLink = `${appUrl}?invite=${invitation.token}`;
  const roleLabels = { contractor: 'Contractor', consultant: 'Consultant', client: 'Client' };
  const roleLabel = roleLabels[invitation.role] || invitation.role;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0b0f0e;font-family:'Segoe UI',system-ui,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#111916;border:1px solid rgba(52,211,153,0.12);border-radius:16px;overflow:hidden">
    <!-- Header -->
    <div style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(52,211,153,0.08)">
      <div style="font-size:36px;margin-bottom:8px">🌍</div>
      <div style="font-size:22px;font-weight:800;color:#ecfdf5;letter-spacing:-0.5px">
        Carbon<span style="color:#34d399">Track</span> Pro
      </div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Construction Embodied Carbon Platform</div>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <h2 style="color:#ecfdf5;font-size:18px;margin:0 0 16px">You've Been Invited!</h2>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 16px">
        <strong style="color:#a7f3d0">${invitation.invitedByName}</strong> has invited you to join
        <strong style="color:#a7f3d0">CarbonTrack Pro</strong> as a
        <strong style="color:#34d399">${roleLabel}</strong>.
      </p>

      ${invitation.message ? `
      <div style="padding:12px 16px;background:rgba(52,211,153,0.06);border-left:3px solid #34d399;border-radius:0 8px 8px 0;margin-bottom:20px">
        <p style="color:#a7f3d0;font-size:13px;margin:0;font-style:italic">"${invitation.message}"</p>
      </div>
      ` : ''}

      <div style="background:#16201b;border:1px solid rgba(52,211,153,0.1);border-radius:10px;padding:16px;margin-bottom:24px">
        <div style="display:flex;margin-bottom:8px">
          <span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:80px">ROLE</span>
          <span style="color:#34d399;font-size:13px;font-weight:600">${roleLabel}</span>
        </div>
        <div style="display:flex;margin-bottom:8px">
          <span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:80px">PROJECT</span>
          <span style="color:#ecfdf5;font-size:13px">KSIA — King Salman International Airport</span>
        </div>
        <div style="display:flex">
          <span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:80px">EXPIRES</span>
          <span style="color:#fb923c;font-size:13px">${new Date(invitation.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      <div style="text-align:center;margin-bottom:24px">
        <a href="${inviteLink}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#047857,#059669);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px">
          Accept Invitation & Create Account
        </a>
      </div>

      <p style="color:#64748b;font-size:11px;text-align:center;margin:0">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${inviteLink}" style="color:#34d399;word-break:break-all">${inviteLink}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid rgba(52,211,153,0.08);text-align:center">
      <p style="color:#475569;font-size:10px;margin:0">
        CarbonTrack Pro v2.0 — KSIA Sustainability Program<br>
        This invitation expires in 7 days. If you didn't expect this email, you can ignore it.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `You've Been Invited to CarbonTrack Pro!

${invitation.invitedByName} has invited you to join CarbonTrack Pro as a ${roleLabel}.

${invitation.message ? `Message: "${invitation.message}"\n` : ''}
Role: ${roleLabel}
Project: KSIA — King Salman International Airport
Expires: ${new Date(invitation.expiresAt).toLocaleDateString()}

Accept your invitation and create your account:
${inviteLink}

This invitation expires in 7 days.
CarbonTrack Pro v2.0 — KSIA Sustainability Program`;

  return { html, text };
}

// === SEND INVITATION EMAIL ===
async function handleSendInvite(body, decoded) {
  const { inviteId } = body;
  if (!inviteId) return respond(400, { error: 'Invitation ID is required.' });

  const db = getDb();
  const snap = await db.ref('invitations/' + inviteId).once('value');
  const invitation = snap.val();

  if (!invitation) return respond(404, { error: 'Invitation not found.' });
  if (invitation.status !== 'pending') {
    return respond(400, { error: 'Only pending invitations can be emailed.' });
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.warn('[EMAIL] SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.');
    return respond(500, { error: 'Email service not configured. Please set SMTP environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).' });
  }

  const appUrl = getAppUrl();
  const { html, text } = buildInvitationEmail(invitation, appUrl);
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    await transporter.sendMail({
      from: `"CarbonTrack Pro" <${fromEmail}>`,
      to: invitation.email,
      subject: `You're invited to CarbonTrack Pro as a ${invitation.role}`,
      text,
      html
    });

    // Mark email as sent
    await db.ref('invitations/' + inviteId).update({
      emailSent: true,
      emailSentAt: new Date().toISOString()
    });

    console.log('[EMAIL] Invitation email sent to:', invitation.email);
    return respond(200, { success: true, message: 'Invitation email sent successfully.' });
  } catch (e) {
    console.error('[EMAIL] Failed to send:', e.message || e);
    return respond(500, { error: 'Failed to send email. Please try again or contact support.' });
  }
}

// === BATCH SUBMISSION NOTIFICATION ===
function buildBatchNotificationEmail(contractorName, entryCount, appUrl) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0b0f0e;font-family:'Segoe UI',system-ui,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#111916;border:1px solid rgba(52,211,153,0.12);border-radius:16px;overflow:hidden">
    <!-- Header -->
    <div style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(52,211,153,0.08)">
      <div style="font-size:36px;margin-bottom:8px">🌍</div>
      <div style="font-size:22px;font-weight:800;color:#ecfdf5;letter-spacing:-0.5px">
        Carbon<span style="color:#34d399">Track</span> Pro
      </div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Construction Embodied Carbon Platform</div>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <h2 style="color:#ecfdf5;font-size:18px;margin:0 0 16px">New Data Batch Ready for Review</h2>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px">
        <strong style="color:#a7f3d0">${contractorName}</strong> has submitted a batch of
        <strong style="color:#34d399">${entryCount} material entr${entryCount === 1 ? 'y' : 'ies'}</strong>
        for your review on the KSIA project.
      </p>

      <div style="background:#16201b;border:1px solid rgba(52,211,153,0.1);border-radius:10px;padding:16px;margin-bottom:24px">
        <div style="display:flex;margin-bottom:8px">
          <span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:120px">SUBMITTED BY</span>
          <span style="color:#ecfdf5;font-size:13px;font-weight:600">${contractorName}</span>
        </div>
        <div style="display:flex;margin-bottom:8px">
          <span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:120px">ENTRIES</span>
          <span style="color:#34d399;font-size:13px;font-weight:600">${entryCount} item${entryCount === 1 ? '' : 's'} pending review</span>
        </div>
        <div style="display:flex">
          <span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:120px">PROJECT</span>
          <span style="color:#ecfdf5;font-size:13px">KSIA — King Salman International Airport</span>
        </div>
      </div>

      <div style="text-align:center;margin-bottom:24px">
        <a href="${appUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#047857,#059669);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px">
          Review Submissions
        </a>
      </div>

      <p style="color:#64748b;font-size:11px;text-align:center;margin:0">
        Log in and go to <strong>Approvals</strong> to review and forward these entries.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid rgba(52,211,153,0.08);text-align:center">
      <p style="color:#475569;font-size:10px;margin:0">
        CarbonTrack Pro v2.0 — KSIA Sustainability Program<br>
        You are receiving this because you are a Consultant on this project.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `New Data Batch Ready for Review — CarbonTrack Pro

${contractorName} has submitted ${entryCount} material entr${entryCount === 1 ? 'y' : 'ies'} for your review on the KSIA project.

Log in to CarbonTrack Pro and go to the Approvals section to review and forward these entries.

${appUrl}

CarbonTrack Pro v2.0 — KSIA Sustainability Program`;

  return { html, text };
}

async function handleBatchNotify(body, decoded) {
  const { contractorName, entryCount } = body;
  if (!contractorName || !entryCount) {
    return respond(400, { error: 'contractorName and entryCount are required.' });
  }

  const db = getDb();

  // Find assigned consultants for this contractor (assignment-based routing)
  let consultants = [];

  // Check if the submitter has assignments
  const assignSnap = await db.ref('assignments')
    .orderByChild('contractorUid')
    .equalTo(decoded.uid)
    .once('value');

  const assignments = assignSnap.val() || {};
  const assignedConsultantUids = Object.values(assignments).map(a => a.consultantUid);

  const usersSnap = await db.ref('users').once('value');
  const usersData = usersSnap.val() || {};

  if (assignedConsultantUids.length > 0) {
    // Only notify assigned consultants
    consultants = Object.entries(usersData)
      .filter(([uid, u]) => assignedConsultantUids.includes(uid) && u.email)
      .map(([uid, u]) => u);
    console.log('[EMAIL] Notifying assigned consultants only:', assignedConsultantUids);
  } else {
    // Fallback: if no assignments exist, notify all consultants (backward compatible)
    consultants = Object.values(usersData).filter(u => u.role === 'consultant' && u.email);
    console.log('[EMAIL] No assignments found — notifying all consultants.');
  }

  if (consultants.length === 0) {
    console.log('[EMAIL] No consultants found to notify.');
    return respond(200, { success: true, message: 'No consultants to notify.' });
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.warn('[EMAIL] SMTP not configured — skipping batch notification.');
    return respond(200, { success: true, message: 'Notification skipped — SMTP not configured.' });
  }

  const appUrl = getAppUrl();
  const { html, text } = buildBatchNotificationEmail(contractorName, entryCount, appUrl);
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
  const toAddresses = consultants.map(u => u.email).join(', ');

  try {
    await transporter.sendMail({
      from: `"CarbonTrack Pro" <${fromEmail}>`,
      to: toAddresses,
      subject: `${contractorName} submitted ${entryCount} entr${entryCount === 1 ? 'y' : 'ies'} for review — CarbonTrack Pro`,
      text,
      html
    });

    console.log('[EMAIL] Batch notification sent to consultants:', toAddresses);
    return respond(200, { success: true, message: `Notification sent to ${consultants.length} consultant(s).` });
  } catch (e) {
    console.error('[EMAIL] Failed to send batch notification:', e.message || e);
    return respond(500, { error: 'Failed to send notification email. Please try again or contact support.' });
  }
}

// === MAIN HANDLER ===
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const decoded = await verifyToken(event);
  if (!decoded) return respond(401, { error: 'Authentication required.' });

  const db = getDb();
  const clientId = getClientId(event, decoded);
  const rateCheck = await checkRateLimit(db, clientId, 'api');
  if (!rateCheck.allowed) {
    return respond(429, { error: 'Too many requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    switch (action) {
      case 'send-invite':  return await handleSendInvite(body, decoded);
      case 'notify-batch': return await handleBatchNotify(body, decoded);
      default: return respond(400, { error: 'Invalid action.' });
    }
  } catch (e) {
    console.error('[EMAIL] Server error:', e);
    return respond(500, { error: 'Internal server error.' });
  }
};
