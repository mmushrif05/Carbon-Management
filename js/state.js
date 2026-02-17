// ===== APPLICATION STATE & UTILITIES =====
let state = { role:null, uid:'', name:'', page:'dashboard', entries:[], a5entries:[], invitations:[], tenderScenarios:[], submissions:[] };

const fmt=v=>(v==null||isNaN(v))?"\u2014":v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtI=v=>(v==null||isNaN(v))?"\u2014":Math.round(v).toLocaleString();
const $=id=>document.getElementById(id);

// Pages safe to re-render on poll (read-only, no user input forms)
const _safePages = ['dashboard', 'monthly', 'cumulative', 'tender_compare'];
let _listenersInit = false;

// ===== LOAD DATA =====
async function loadAllData() {
  state.entries = await DB.getEntries();
  state.a5entries = await DB.getA5Entries();
  state.tenderScenarios = await DB.getTenderScenarios();
  state.submissions = await DB.getSubmissions();

  // Setup polling listeners only once (prevent stacking intervals)
  if (_listenersInit) return;
  _listenersInit = true;

  // Polling updates state silently; only re-renders pages without forms.
  // Pages with forms (entry_a13, entry_a5, tender_entry, approvals, team)
  // get fresh data when user navigates to them, but are never force-refreshed.
  DB.onEntriesChange(data => {
    state.entries = data;
    if (_safePages.includes(state.page)) navigate(state.page);
    else if (typeof buildSidebar === 'function') buildSidebar();
  });
  DB.onA5Change(data => {
    state.a5entries = data;
    if (state.page === 'dashboard') navigate(state.page);
  });
  DB.onTenderChange(data => {
    state.tenderScenarios = data;
    if (state.page === 'tender_compare') navigate(state.page);
  });
  DB.onSubmissionsChange(data => {
    state.submissions = data;
    if (_safePages.includes(state.page)) navigate(state.page);
    else if (typeof buildSidebar === 'function') buildSidebar();
  });
}
