const nodemailer = require('nodemailer');
const { getDb, verifyToken, respond, optionsResponse } = require('./utils/firebase');

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

// === SUBMISSION NOTIFICATION EMAIL ===
function buildSubmissionEmail(type, submission, reviewerName) {
  const appUrl = getAppUrl();
  const statusLabels = { submitted: 'Submitted for Review', returned: 'Returned for Correction', approved: 'Approved' };
  const statusIcons = { submitted: '📦', returned: '🔄', approved: '✅' };
  const color = type === 'returned' ? '#fb923c' : '#34d399';
  const label = statusLabels[type] || type;
  const icon = statusIcons[type] || '📋';

  let bodyText = '';
  if (type === 'submitted') {
    bodyText = `<strong style="color:#a7f3d0">${submission.createdByName}</strong> has submitted a monthly package for review.`;
  } else if (type === 'returned') {
    bodyText = `Your monthly package for <strong style="color:#a7f3d0">${submission.monthLabel}</strong> has been returned by <strong style="color:#a7f3d0">${reviewerName}</strong> with feedback. Please review the flagged items and resubmit.`;
  } else if (type === 'approved') {
    bodyText = `Your monthly package for <strong style="color:#a7f3d0">${submission.monthLabel}</strong> has been approved by <strong style="color:#a7f3d0">${reviewerName}</strong>.`;
  }

  const flaggedCount = submission.lineItemReviews
    ? Object.values(submission.lineItemReviews).filter(r => r.status === 'needs_fix').length : 0;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0b0f0e;font-family:'Segoe UI',system-ui,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#111916;border:1px solid rgba(52,211,153,0.12);border-radius:16px;overflow:hidden">
<div style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(52,211,153,0.08)"><div style="font-size:36px;margin-bottom:8px">🌍</div><div style="font-size:22px;font-weight:800;color:#ecfdf5">Carbon<span style="color:#34d399">Track</span> Pro</div></div>
<div style="padding:32px">
<h2 style="color:#ecfdf5;font-size:18px;margin:0 0 16px">${icon} Monthly Package ${label}</h2>
<p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 16px">${bodyText}</p>
<div style="background:#16201b;border:1px solid rgba(52,211,153,0.1);border-radius:10px;padding:16px;margin-bottom:24px">
<div style="display:flex;margin-bottom:8px"><span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:100px">MONTH</span><span style="color:#ecfdf5;font-size:13px;font-weight:600">${submission.monthLabel}</span></div>
<div style="display:flex;margin-bottom:8px"><span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:100px">ITEMS</span><span style="color:#ecfdf5;font-size:13px">${submission.itemCount}</span></div>
<div style="display:flex;margin-bottom:8px"><span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:100px">STATUS</span><span style="color:${color};font-size:13px;font-weight:600">${label}</span></div>
<div style="display:flex"><span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:100px">TOTAL</span><span style="color:#60a5fa;font-size:13px">${(submission.totalA14 || 0).toFixed(2)} tCO₂eq</span></div>
${type === 'returned' && flaggedCount > 0 ? `<div style="display:flex;margin-top:8px"><span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:100px">FLAGGED</span><span style="color:#fb923c;font-size:13px;font-weight:600">${flaggedCount} item(s) need correction</span></div>` : ''}
</div>
<div style="text-align:center;margin-bottom:24px"><a href="${appUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#047857,#059669);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700">Open CarbonTrack Pro</a></div>
</div>
<div style="padding:20px 32px;border-top:1px solid rgba(52,211,153,0.08);text-align:center"><p style="color:#475569;font-size:10px;margin:0">CarbonTrack Pro v2.0 — KSIA Sustainability Program</p></div>
</div></body></html>`;

  const text = `Monthly Package ${label}\n\n${type === 'submitted' ? submission.createdByName + ' has submitted a monthly package for review.' : type === 'returned' ? 'Your package for ' + submission.monthLabel + ' was returned by ' + reviewerName + '.' : 'Your package for ' + submission.monthLabel + ' was approved by ' + reviewerName + '.'}\n\nMonth: ${submission.monthLabel}\nItems: ${submission.itemCount}\nTotal: ${(submission.totalA14 || 0).toFixed(2)} tCO₂eq\n\nOpen CarbonTrack Pro: ${appUrl}`;

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
    return respond(500, { error: 'Failed to send email: ' + (e.message || 'Unknown error') });
  }
}

// === SEND SUBMISSION NOTIFICATION ===
async function handleSubmissionNotify(body, decoded) {
  const { submissionId, type } = body;
  if (!submissionId) return respond(400, { error: 'Submission ID is required.' });
  if (!type || !['submitted', 'returned', 'approved'].includes(type)) {
    return respond(400, { error: 'Type must be submitted, returned, or approved.' });
  }

  const db = getDb();
  const profile = await db.ref('users/' + decoded.uid).once('value').then(s => s.val());
  const project = (profile && profile.project) || 'ksia';

  const subSnap = await db.ref('projects/' + project + '/submissions/' + submissionId).once('value');
  const submission = subSnap.val();
  if (!submission) return respond(404, { error: 'Submission not found.' });

  const transporter = createTransporter();
  if (!transporter) {
    return respond(200, { success: true, skipped: true, message: 'SMTP not configured.' });
  }

  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
  const reviewerName = submission.reviewedByName || (profile ? profile.name : 'Reviewer');

  // Determine recipients
  let recipients = [];
  const usersSnap = await db.ref('users').once('value');
  const users = usersSnap.val() || {};

  if (type === 'submitted') {
    recipients = Object.values(users).filter(u =>
      (u.role === 'consultant' || u.role === 'client') && (!u.project || u.project === project)
    ).map(u => u.email);
  } else {
    const contractorProfile = await db.ref('users/' + submission.createdBy).once('value').then(s => s.val());
    if (contractorProfile && contractorProfile.email) {
      recipients = [contractorProfile.email];
    }
  }

  if (recipients.length === 0) {
    return respond(200, { success: true, sent: 0 });
  }

  const { html, text } = buildSubmissionEmail(type, submission, reviewerName);
  const statusLabels = { submitted: 'Submitted for Review', returned: 'Returned for Correction', approved: 'Approved' };

  let sent = 0;
  for (const email of recipients) {
    try {
      await transporter.sendMail({
        from: `"CarbonTrack Pro" <${fromEmail}>`,
        to: email,
        subject: `Monthly Package ${submission.monthLabel} — ${statusLabels[type]}`,
        text,
        html
      });
      sent++;
    } catch (e) {
      console.error('[EMAIL] Failed to send to', email, ':', e.message);
    }
  }

  console.log('[EMAIL] Submission notification:', type, submissionId, sent + '/' + recipients.length);
  return respond(200, { success: true, sent, total: recipients.length });
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
      case 'send-invite': return await handleSendInvite(body, decoded);
      case 'submission-notify': return await handleSubmissionNotify(body, decoded);
      default: return respond(400, { error: 'Invalid action.' });
    }
  } catch (e) {
    console.error('[EMAIL] Server error:', e);
    return respond(500, { error: 'Server error: ' + (e.message || 'Unknown') });
  }
};
