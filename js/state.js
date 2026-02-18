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

  // Setup real-time listeners.
  // For data-entry pages, only update the relevant table in place instead of
  // re-rendering the whole page — this preserves any in-progress form data.
  DB.onEntriesChange(data => {
    state.entries = data;
    if (state.page === 'entry_a13') {
      renderRecent(); // refresh submitted-entries table only; form stays intact
    } else if (state.page) {
      navigate(state.page);
    }
  });
  DB.onA5Change(data => {
    state.a5entries = data;
    if (state.page === 'entry_a5') {
      rA5(); // refresh A5 table only; form stays intact
    } else if (state.page === 'dashboard') {
      navigate('dashboard');
    }
  });
  DB.onTenderChange(data => { state.tenderScenarios = data; if (state.page === 'tender_entry' || state.page === 'tender_compare') navigate(state.page); });
}
