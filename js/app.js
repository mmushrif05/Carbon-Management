// ===== SIDEBAR =====
function buildSidebar() {
  const r=state.role;
  // Badge: contractor sees drafts to submit + returned packages; reviewer sees submitted packages
  const draftCount=r==='contractor'?state.entries.filter(e=>e.status==='draft').length:0;
  const submittedPkgs=state.submissions.filter(s=>s.status==='submitted').length;
  const returnedPkgs=r==='contractor'?state.submissions.filter(s=>s.status==='returned').length:0;
  const approvalBadge=r==='contractor'?(draftCount>0?draftCount:0)+returnedPkgs:(r==='consultant'||r==='client'?submittedPkgs:0);
  let items=[{section:"Main"},{id:'dashboard',icon:'\ud83d\udcca',label:'Dashboard'}];
  if(r==='contractor'||r==='consultant'){items.push({section:"Data Entry"},{id:'entry_a13',icon:'\ud83e\uddf1',label:'A1-A3 Materials'},{id:'entry_a5',icon:'\u26a1',label:'A5 Site Emissions'});}
  items.push({section:"Tender"},{id:'tender_entry',icon:'\ud83d\udccb',label:'Tender Quantities'},{id:'tender_compare',icon:'\ud83d\udcca',label:'Compare Scenarios'});
  items.push({section:"Workflow"},{id:'approvals',icon:'\ud83d\udce6',label:'Monthly Packages',badge:approvalBadge});
  items.push({section:"Reports"},{id:'monthly',icon:'\ud83d\udcc5',label:'Monthly Report'},{id:'cumulative',icon:'\ud83d\udcc8',label:'Cumulative'});
  if(r==='consultant'||r==='client'){items.push({section:"Config"},{id:'baselines',icon:'\u2699\ufe0f',label:'Baseline EFs'});}
  items.push({section:"Manage"},{id:'team',icon:'\ud83d\udc65',label:'Team'});
  items.push({id:'certifications',icon:'\ud83c\udfc6',label:'Certifications'},{id:'integrations',icon:'\ud83d\udd0c',label:'API Hub'});

  $('sidebarNav').innerHTML = items.map(it => it.section ? `<div class="sb-section">${it.section}</div>` :
    `<div class="sb-item${state.page===it.id?' active':''}" onclick="navigate('${it.id}')"><span class="sb-icon">${it.icon}</span>${it.label}${it.badge>0?`<span class="sb-badge">${it.badge}</span>`:''}</div>`
  ).join('');
}

// ===== NAV =====
function navigate(page) {
  state.page = page; buildSidebar();
  const titles={dashboard:["Dashboard","Project carbon performance & sustainability metrics"],entry_a13:["A1-A3 Material Entry","Enter material quantities and emission factors"],entry_a5:["A5 Site Emissions","Monthly fuel and water consumption"],approvals:["Monthly Packages","Submit and review monthly emission packages"],monthly:["Monthly Report","Monthly emissions breakdown"],cumulative:["Cumulative Report","Running totals and trends"],baselines:["Baseline EFs","Emission factor reference data"],team:["Team Management","Invite and manage project team members"],certifications:["Certifications","Track sustainability certification credits"],integrations:["API Hub","External integrations and data sources"],tender_entry:["Tender Quantities","Create and manage tender emission scenarios from BOQ quantities"],tender_compare:["Compare Scenarios","Side-by-side comparison of tender emission projections"]};
  const[t,d]=titles[page]||["",""];
  $('pageTitle').textContent=t; $('pageDesc').textContent=d;
  const R={dashboard:renderDashboard,entry_a13:renderEntry,entry_a5:renderA5,approvals:renderApprovals,monthly:renderMonthly,cumulative:renderCumulative,baselines:renderBaselines,team:renderTeam,certifications:renderCerts,integrations:renderIntegrations,tender_entry:renderTenderEntry,tender_compare:renderTenderCompare};
  if(R[page]) R[page]($('pageBody'));
  $('sidebar').classList.remove('open');
}

// ===== INIT =====
async function init() {
  setTimeout(async () => {
    // Clear old insecure offline auth data (pre-invitation system)
    localStorage.removeItem('ct_auth_users');
    localStorage.removeItem('ct_auth_session');

    // Check if server/database is reachable
    await checkDbConnection();

    // Check for invitation token in URL — must await so register form is ready
    const hasInvite = await checkInviteToken();

    // If invite link was clicked, skip session restore and show login/register screen
    if (hasInvite) {
      await loadAllData();
      $('loadingOverlay').style.display = 'none';
      $('loginScreen').style.display = 'flex';
      return;
    }

    // Try to restore session from stored token (SERVER VERIFIED ONLY)
    const token = localStorage.getItem('ct_auth_token');
    const serverVerified = localStorage.getItem('ct_server_verified');

    if (token && dbConnected) {
      // Server is reachable — verify the token is still valid
      try {
        const res = await apiCall('/auth', {
          method: 'POST',
          body: JSON.stringify({ action: 'verify' })
        });
        const data = await res.json();

        if (data.authenticated) {
          localStorage.setItem('ct_server_verified', 'true');
          await loadAllData();
          $('loadingOverlay').style.display = 'none';
          enterApp(data.user.name, data.user.role);
          return;
        }
      } catch (e) {
        console.warn('Session verify failed:', e);
      }
    }

    // Server not reachable but user was previously server-verified
    // Allow temporary offline access with cached profile
    if (token && serverVerified === 'true' && !dbConnected) {
      const profile = JSON.parse(localStorage.getItem('ct_user_profile') || 'null');
      if (profile && profile.name && profile.role) {
        console.log('[AUTH] Offline mode — using server-verified cached profile');
        await loadAllData();
        $('loadingOverlay').style.display = 'none';
        enterApp(profile.name, profile.role);
        return;
      }
    }

    // No valid session — show login screen
    await loadAllData();
    $('loadingOverlay').style.display = 'none';

    // Clear any stale auth data since session is invalid
    localStorage.removeItem('ct_auth_token');
    localStorage.removeItem('ct_refresh_token');
    localStorage.removeItem('ct_server_verified');
    localStorage.removeItem('ct_user_profile');

    $('loginScreen').style.display = 'flex';
  }, 1500);
}
init();

// Allow Enter key to submit login/register forms
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    if ($('loginForm').style.display !== 'none' && $('loginScreen').style.display !== 'none') {
      if (document.activeElement === $('loginEmail') || document.activeElement === $('loginPassword')) {
        handleLogin();
      }
    }
    if ($('registerForm').style.display !== 'none') {
      if (document.activeElement === $('regName') || document.activeElement === $('regEmail') || document.activeElement === $('regPassword')) {
        handleRegister();
      }
    }
    if ($('forgotForm') && $('forgotForm').style.display !== 'none') {
      if (document.activeElement === $('forgotEmail')) {
        handleForgotPassword();
      }
    }
  }
});
