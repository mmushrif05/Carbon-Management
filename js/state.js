// ===== APPLICATION STATE & UTILITIES =====
let state = { role:null, name:'', page:'dashboard', entries:[], a5entries:[], invitations:[], tenderScenarios:[] };

const fmt=v=>(v==null||isNaN(v))?"\u2014":v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtI=v=>(v==null||isNaN(v))?"\u2014":Math.round(v).toLocaleString();
const $=id=>document.getElementById(id);

// ===== LOAD DATA =====
async function loadAllData() {
  state.entries = await DB.getEntries();
  state.a5entries = await DB.getA5Entries();
  state.tenderScenarios = await DB.getTenderScenarios();

  // Setup real-time listeners
  DB.onEntriesChange(data => { state.entries = data; if (state.page) navigate(state.page); });
  DB.onA5Change(data => { state.a5entries = data; if (state.page === 'entry_a5' || state.page === 'dashboard') navigate(state.page); });
  DB.onTenderChange(data => { state.tenderScenarios = data; if (state.page === 'tender_entry' || state.page === 'tender_compare') navigate(state.page); });
}
