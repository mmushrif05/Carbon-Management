// ===== APPLICATION STATE & UTILITIES =====
let state = { role:null, name:'', uid:null, organizationId:null, organizationName:null, page:'dashboard', entries:[], a5entries:[], invitations:[], tenderScenarios:[], organizations:[], orgLinks:[], assignments:[], users:[], projects:[], projectAssignments:[], projectOrgLinks:[], packageTemplates:[], consultantPermissions:{}, editRequests:[], selectedProjectId:null, reductionTarget:20, documents:[], analysisResults:[] };

const fmt=v=>(v==null||isNaN(v))?"\u2014":v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtI=v=>(v==null||isNaN(v))?"\u2014":Math.round(v).toLocaleString();
const $=id=>document.getElementById(id);

// ===== LOAD DATA =====
async function loadAllData() {
  // Load core data
  const [entries, a5entries, tenderScenarios] = await Promise.all([
    DB.getEntries(),
    DB.getA5Entries(),
    DB.getTenderScenarios()
  ]);
  state.entries = entries;
  state.a5entries = a5entries;
  state.tenderScenarios = tenderScenarios;

  // Load assignments (needed for approval workflow info display)
  try {
    state.assignments = await DB.getAssignments();
  } catch (e) {
    state.assignments = [];
  }

  // Load projects, project assignments, and tenant settings
  try {
    state.projects = await DB.getProjects();
  } catch (e) {
    state.projects = [];
  }
  try {
    state.projectAssignments = await DB.getProjectAssignments();
  } catch (e) {
    state.projectAssignments = [];
  }
  try {
    const settings = await DB.getSettings();
    state.reductionTarget = settings.reductionTarget || 20;
  } catch (e) {
    state.reductionTarget = 20;
  }
  try {
    state.editRequests = await DB.getEditRequests();
  } catch (e) {
    state.editRequests = [];
  }

  // Setup real-time listeners
  // IMPORTANT: Never re-render via navigate() while user is editing a tender form (_tenderEdit !== null).
  // Polling data still updates state silently — the UI refreshes only on explicit user actions.
  // Pages with forms that should NOT be re-rendered by background polling
  const _formPages = new Set(['projects', 'team', 'organizations', 'entry_a13', 'entry_a4', 'entry_a5']);
  const _safeToRefresh = () => !_tenderEdit && !_formPages.has(state.page);

  DB.onEntriesChange(data => { state.entries = data; if (state.page && _safeToRefresh()) navigate(state.page); });
  DB.onA5Change(data => { state.a5entries = data; if ((state.page === 'entry_a5' || state.page === 'entry_a4' || state.page === 'dashboard') && _safeToRefresh()) navigate(state.page); });
  DB.onTenderChange(data => { state.tenderScenarios = data; if ((state.page === 'tender_entry' || state.page === 'tender_compare') && _safeToRefresh()) navigate(state.page); });

  // Poll edit requests for consultants and contractors
  if (dbConnected) {
    setInterval(async () => {
      try { state.editRequests = await DB.getEditRequests(); } catch (e) {}
    }, 30000);
  }
}
