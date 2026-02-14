// ===== SIDEBAR =====
function buildSidebar() {
  const r=state.role;
  const pending=state.entries.filter(e=>e.status==='pending').length;
  const review=state.entries.filter(e=>e.status==='review').length;
  let items=[{section:"Main"},{id:'dashboard',icon:'\ud83d\udcca',label:'Dashboard'}];
  if(r==='contractor'||r==='consultant'){items.push({section:"Data Entry"},{id:'entry_a13',icon:'\ud83e\uddf1',label:'A1-A3 Materials'},{id:'entry_a5',icon:'\u26a1',label:'A5 Site Emissions'});}
  items.push({section:"Workflow"},{id:'approvals',icon:'\u2705',label:'Approvals',badge:r==='consultant'?pending:(r==='client'?review:0)});
  items.push({section:"Reports"},{id:'monthly',icon:'\ud83d\udcc5',label:'Monthly Report'},{id:'cumulative',icon:'\ud83d\udcc8',label:'Cumulative'});
  if(r==='consultant'||r==='client'){items.push({section:"Config"},{id:'baselines',icon:'\u2699\ufe0f',label:'Baseline EFs'});}
  items.push({id:'certifications',icon:'\ud83c\udfc6',label:'Certifications'},{id:'integrations',icon:'\ud83d\udd0c',label:'API Hub'});

  $('sidebarNav').innerHTML = items.map(it => it.section ? `<div class="sb-section">${it.section}</div>` :
    `<div class="sb-item${state.page===it.id?' active':''}" onclick="navigate('${it.id}')"><span class="sb-icon">${it.icon}</span>${it.label}${it.badge>0?`<span class="sb-badge">${it.badge}</span>`:''}</div>`
  ).join('');
}

// ===== NAV =====
function navigate(page) {
  state.page = page; buildSidebar();
  const titles={dashboard:["Dashboard","Project carbon performance & sustainability metrics"],entry_a13:["A1-A3 Material Entry","Enter material quantities and emission factors"],entry_a5:["A5 Site Emissions","Monthly fuel and water consumption"],approvals:["Approval Workflow","Review and approve carbon data"],monthly:["Monthly Report","Monthly emissions breakdown"],cumulative:["Cumulative Report","Running totals and trends"],baselines:["Baseline EFs","Emission factor reference data"],certifications:["Certifications","Track sustainability certification credits"],integrations:["API Hub","External integrations and data sources"]};
  const[t,d]=titles[page]||["",""];
  $('pageTitle').textContent=t; $('pageDesc').textContent=d;
  const R={dashboard:renderDashboard,entry_a13:renderEntry,entry_a5:renderA5,approvals:renderApprovals,monthly:renderMonthly,cumulative:renderCumulative,baselines:renderBaselines,certifications:renderCerts,integrations:renderIntegrations};
  if(R[page]) R[page]($('pageBody'));
  $('sidebar').classList.remove('open');
}

// ===== INIT =====
async function init() {
  // Wait a moment for Firebase to connect
  setTimeout(async () => {
    updateDbStatus();
    await loadAllData();
    $('loadingOverlay').style.display = 'none';

    // Listen for auth state changes
    if (auth) {
      auth.onAuthStateChanged(async (user) => {
        if (user) {
          // User is signed in — load their profile to get role
          const profile = await loadUserProfile(user.uid);
          if (profile) {
            enterApp(profile.name || user.displayName || 'User', profile.role || 'contractor');
          } else {
            // Profile missing (edge case) — sign out and ask to re-register
            auth.signOut();
            $('loginScreen').style.display = 'flex';
            showError('loginError', 'Account profile not found. Please register again.');
          }
        } else {
          // User is signed out — show login
          $('appShell').style.display = 'none';
          $('loginScreen').style.display = 'flex';
        }
      });
    } else {
      // Firebase not configured — check for offline session
      const session = JSON.parse(localStorage.getItem('ct_auth_session') || 'null');
      if (session) {
        const users = offlineGetUsers();
        const user = users[session.email];
        if (user) {
          enterApp(user.name, user.role);
          return;
        }
      }
      $('loginScreen').style.display = 'flex';
    }
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
  }
});
