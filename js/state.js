// ===== APPLICATION STATE & UTILITIES =====
let state = { role:null, name:'', uid:null, organizationId:null, organizationName:null, page:'dashboard', entries:[], a5entries:[], invitations:[], tenderScenarios:[], organizations:[], orgLinks:[], assignments:[], users:[] };

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

  // Setup real-time listeners (skip re-render on tender page while BOQ file is being processed)
  DB.onEntriesChange(data => { state.entries = data; if (state.page && !(state.page === 'tender_entry' && _tenderBOQProcessing)) navigate(state.page); });
  DB.onA5Change(data => { state.a5entries = data; if (state.page === 'entry_a5' || state.page === 'dashboard') navigate(state.page); });
  DB.onTenderChange(data => { state.tenderScenarios = data; if ((state.page === 'tender_entry' || state.page === 'tender_compare') && !_tenderBOQProcessing) navigate(state.page); });
}
