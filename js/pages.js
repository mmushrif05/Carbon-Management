// ===== DASHBOARD =====
function renderDashboard(el) {
  const d=state.entries; let tB=0,tA=0,tA4=0;
  d.forEach(e=>{tB+=e.a13B||0;tA+=e.a13A||0;tA4+=e.a4||0});
  let a5T=0; state.a5entries.forEach(e=>{a5T+=e.emission||0});
  const rP=tB>0?((tB-tA)/tB)*100:0;
  const matB={}; d.forEach(e=>{if(!matB[e.category])matB[e.category]={b:0,a:0};matB[e.category].b+=e.a13B||0;matB[e.category].a+=e.a13A||0});
  const mMap={}; d.forEach(e=>{const k=e.monthKey;if(!mMap[k])mMap[k]={b:0,a:0,l:e.monthLabel};mMap[k].b+=e.a13B||0;mMap[k].a+=e.a13A||0});
  const mArr=Object.entries(mMap).sort((a,b)=>a[0].localeCompare(b[0]));
  const cols={Concrete:'var(--slate4)',Steel:'var(--blue)',Asphalt:'var(--orange)',Aluminum:'var(--purple)',Glass:'var(--cyan)',Earth_Work:'#a3e635',Subgrade:'#facc15',Pipes:'var(--yellow)'};

  el.innerHTML=`
  <div class="stats-row">
    <div class="stat-card slate"><div class="sc-label">A1-A3 Baseline</div><div class="sc-value">${fmt(tB)}</div><div class="sc-sub">ton CO\u2082eq</div></div>
    <div class="stat-card blue"><div class="sc-label">A1-A3 Actual</div><div class="sc-value">${fmt(tA)}</div><div class="sc-sub">ton CO\u2082eq</div></div>
    <div class="stat-card orange"><div class="sc-label">A4 Transport</div><div class="sc-value">${fmt(tA4)}</div><div class="sc-sub">ton CO\u2082eq</div></div>
    <div class="stat-card cyan"><div class="sc-label">A5 Site</div><div class="sc-value">${fmt(a5T)}</div><div class="sc-sub">ton CO\u2082eq</div></div>
    <div class="stat-card green"><div class="sc-label">A1-A5 Total</div><div class="sc-value">${fmt(tA+tA4+a5T)}</div><div class="sc-sub">ton CO\u2082eq</div></div>
    <div class="stat-card ${rP>20?'green':rP>=10?'orange':'purple'}"><div class="sc-label">Reduction</div><div class="sc-value">${fmt(rP)}%</div><div class="sc-sub">${fmt(tB-tA)} saved</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
    <div class="card"><div class="card-title">Monthly Trend</div>${mArr.length?`<div class="bar-chart" id="dc"></div><div class="chart-legend"><span><span class="chart-legend-dot" style="background:rgba(148,163,184,0.4)"></span> Baseline</span><span><span class="chart-legend-dot" style="background:rgba(96,165,250,0.5)"></span> Actual</span></div>`:'<div class="empty"><div class="empty-icon">\ud83d\udcca</div>Add entries to see trends</div>'}</div>
    <div class="card"><div class="card-title">By Material</div>${Object.keys(matB).length?`<div class="donut-wrap"><svg class="donut-svg" viewBox="0 0 140 140" id="dn"></svg><div class="donut-legend" id="dl"></div></div>`:'<div class="empty"><div class="empty-icon">\ud83e\uddf1</div>No data yet</div>'}</div>
  </div>
  <div class="card"><div class="card-title">Approvals</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">
    <div><div style="font-size:24px;font-weight:800;color:var(--yellow)">${d.filter(e=>e.status==='pending').length}</div><div style="font-size:10px;color:var(--slate5)">Pending</div></div>
    <div><div style="font-size:24px;font-weight:800;color:var(--blue)">${d.filter(e=>e.status==='review').length}</div><div style="font-size:10px;color:var(--slate5)">Review</div></div>
    <div><div style="font-size:24px;font-weight:800;color:var(--green)">${d.filter(e=>e.status==='approved').length}</div><div style="font-size:10px;color:var(--slate5)">Approved</div></div>
    <div><div style="font-size:24px;font-weight:800;color:var(--red)">${d.filter(e=>e.status==='rejected').length}</div><div style="font-size:10px;color:var(--slate5)">Rejected</div></div>
  </div></div>`;

  if(mArr.length){const mx=Math.max(...mArr.map(([k,v])=>Math.max(v.b,v.a)),1);$('dc').innerHTML=mArr.map(([k,v])=>`<div class="bar-group"><div class="bar-pair"><div class="bar baseline" style="height:${(v.b/mx)*170}px"></div><div class="bar actual" style="height:${(v.a/mx)*170}px"></div></div><div class="bar-label">${v.l}</div></div>`).join('');}
  if(Object.keys(matB).length){const tot=Object.values(matB).reduce((s,v)=>s+v.a,0)||1;let ang=0,sh='',lh='';Object.entries(matB).forEach(([c,v])=>{const p=v.a/tot;const a1=ang;ang+=p*360;const lg=p>.5?1:0;const r=55,cx=70,cy=70;const x1=cx+r*Math.cos((a1-90)*Math.PI/180),y1=cy+r*Math.sin((a1-90)*Math.PI/180);const x2=cx+r*Math.cos((ang-90)*Math.PI/180),y2=cy+r*Math.sin((ang-90)*Math.PI/180);const cl=cols[c]||'var(--slate4)';if(p>.001)sh+=`<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${lg},1 ${x2},${y2} Z" fill="${cl}" opacity="0.7" stroke="var(--bg2)" stroke-width="1.5"/>`;lh+=`<div class="donut-legend-item"><div class="donut-legend-dot" style="background:${cl}"></div>${c}: ${fmt(v.a)} tCO\u2082 (${(p*100).toFixed(1)}%)</div>`;});$('dn').innerHTML=sh;$('dl').innerHTML=lh;}
}

// ===== ENTRY (BATCH WORKFLOW) =====
function renderEntry(el) {
  const yr=new Date().getFullYear(),mo=String(new Date().getMonth()+1).padStart(2,'0');
  const isContractor = state.role === 'contractor';
  el.innerHTML=`
  <div class="card"><div class="card-title">Add Material \u2014 A1-A4</div>
  ${isContractor?`<div style="padding:10px 14px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--blue)">
    <strong>Batch Mode:</strong> Add as many entries as you need, then submit them all to the consultant at once.
  </div>`:''}
  <div class="form-row c4"><div class="fg"><label>Year</label><select id="eY">${[yr-1,yr,yr+1].map(y=>`<option ${y===yr?'selected':''}>${y}</option>`).join('')}</select></div>
  <div class="fg"><label>Month</label><select id="eM">${MONTHS.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0')===mo?'selected':''}>${m}</option>`).join('')}</select></div>
  <div class="fg"><label>District</label><input id="eD" value="A"></div>
  <div class="fg"><label>Contract</label><input id="eC" placeholder="e.g. PA Apron Phase 0"></div></div>
  <div class="form-row c3"><div class="fg"><label>Category</label><select id="eCat" onchange="onCat()"><option value="">Select...</option>${Object.keys(MATERIALS).map(c=>`<option>${c}</option>`).join('')}</select></div>
  <div class="fg"><label>Type</label><select id="eType" onchange="onType()"><option>Select category</option></select></div>
  <div class="fg"><label>Quantity</label><input type="number" id="eQ" placeholder="Enter amount" oninput="preview()"><div class="fg-help" id="eQU">\u2014</div></div></div>
  <div class="form-row c3"><div class="fg"><label>Baseline EF</label><input id="eBL" class="fg-readonly" readonly></div>
  <div class="fg"><label>Target EF</label><input id="eTG" class="fg-readonly" readonly></div>
  <div class="fg"><label>Actual GWP (EPD)</label><input type="number" id="eA" step="0.01" placeholder="From EPD" oninput="preview()"><div class="fg-help" id="eAU">\u2014</div></div></div>
  <div class="form-row c3"><div class="fg"><label>Road (km)</label><input type="number" id="eR" value="0" oninput="preview()"></div>
  <div class="fg"><label>Sea (km)</label><input type="number" id="eS" value="0" oninput="preview()"></div>
  <div class="fg"><label>Train (km)</label><input type="number" id="eT" value="0" oninput="preview()"></div></div>
  <div class="fg" style="margin-bottom:12px"><label>Notes</label><input id="eN" placeholder="EPD reference, assumptions..."></div>
  <div id="ePrev"></div>
  <div class="btn-row">
    ${isContractor
      ? `<button class="btn btn-primary" onclick="addToBatch()">+ Add to Batch</button><button class="btn btn-secondary" onclick="navigate('entry_a13')">\ud83d\udd04 Clear</button>`
      : `<button class="btn btn-primary" onclick="submitEntry()">\ud83d\udcbe Submit Entry</button><button class="btn btn-secondary" onclick="navigate('entry_a13')">\ud83d\udd04 Clear</button>`
    }
  </div></div>

  ${isContractor ? `
  <div class="card" id="batchCard">
    <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
      <span>Batch Queue <span id="batchCount" style="display:inline-block;background:var(--blue);color:#fff;border-radius:20px;padding:1px 10px;font-size:12px;margin-left:6px">0</span></span>
      <div id="submitBatchRow" style="display:none">
        <button class="btn btn-primary" onclick="submitBatch()" style="margin:0">\ud83d\ude80 Submit All to Consultant</button>
      </div>
    </div>
    <div id="batchMsg"></div>
    <div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Material</th><th>Type</th><th class="r">Qty</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">A4</th><th class="r">Total</th><th></th></tr></thead><tbody id="batchTbl"></tbody></table></div>
  </div>` : ''}

  <div class="card"><div class="card-title">${isContractor ? 'Submitted Entries' : 'Recent Entries'}</div><div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Material</th><th>Type</th><th class="r">Qty</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">A4</th><th class="r">Total</th><th>Status</th><th></th></tr></thead><tbody id="reTbl"></tbody></table></div></div>`;

  if (isContractor) renderBatch();
  renderRecent();
}

function onCat(){const c=$('eCat').value;if(!c||!MATERIALS[c])return;$('eType').innerHTML='<option value="">Select...</option>'+MATERIALS[c].types.map((t,i)=>`<option value="${i}">${t.name}</option>`).join('');$('eQU').textContent='Unit: '+MATERIALS[c].unit;$('eAU').textContent=MATERIALS[c].efUnit;$('eBL').value='';$('eTG').value='';preview();}
function onType(){const c=$('eCat').value,i=$('eType').value;if(!c||i==='')return;const t=MATERIALS[c].types[i];$('eBL').value=t.baseline+' '+MATERIALS[c].efUnit;$('eTG').value=t.target+' '+MATERIALS[c].efUnit;preview();}

function preview(){
  const c=$('eCat').value,i=$('eType').value,q=parseFloat($('eQ').value),a=parseFloat($('eA').value);
  if(!c||i===''||isNaN(q)||isNaN(a)||q<=0||a<=0){$('ePrev').innerHTML='';return;}
  const m=MATERIALS[c],t=m.types[i],mass=q*m.massFactor;
  const rd=parseFloat($('eR').value)||0,se=parseFloat($('eS').value)||0,tr=parseFloat($('eT').value)||0;
  const b=(q*t.baseline)/1000,ac=(q*a)/1000,a4=(mass*rd*TEF.road+mass*se*TEF.sea+mass*tr*TEF.train)/1000;
  const tot=ac+a4,p=b>0?((b-ac)/b)*100:0,cl=p>20?'green':p>=10?'orange':'purple';
  $('ePrev').innerHTML=`<div class="stats-row" style="margin:16px 0 8px"><div class="stat-card slate"><div class="sc-label">A1-A3 Baseline</div><div class="sc-value">${fmt(b)}</div><div class="sc-sub">ton CO\u2082eq</div></div><div class="stat-card blue"><div class="sc-label">A1-A3 Actual</div><div class="sc-value">${fmt(ac)}</div><div class="sc-sub">ton CO\u2082eq</div></div><div class="stat-card orange"><div class="sc-label">A4 Transport</div><div class="sc-value">${fmt(a4)}</div><div class="sc-sub">ton CO\u2082eq</div></div><div class="stat-card green"><div class="sc-label">A1-A4 Total</div><div class="sc-value">${fmt(tot)}</div><div class="sc-sub">ton CO\u2082eq</div></div><div class="stat-card ${cl}"><div class="sc-label">Reduction</div><div class="sc-value">${fmt(p)}%</div><div class="sc-sub">${fmt(b-ac)} saved</div></div></div>`;
}

// Add an entry to the local draft batch (contractor only)
function addToBatch() {
  const c=$('eCat').value,i=$('eType').value,q=parseFloat($('eQ').value),a=parseFloat($('eA').value);
  if(!c||i===''||isNaN(q)||isNaN(a)||q<=0||a<=0){alert('Fill all required fields');return;}
  const m=MATERIALS[c],t=m.types[i],mass=q*m.massFactor;
  const rd=parseFloat($('eR').value)||0,se=parseFloat($('eS').value)||0,tr=parseFloat($('eT').value)||0;
  const b=(q*t.baseline)/1000,ac=(q*a)/1000,a4=(mass*rd*TEF.road+mass*se*TEF.sea+mass*tr*TEF.train)/1000;
  const yr=$('eY').value,mo=$('eM').value;

  const entry={id:Date.now(),category:c,type:t.name,qty:q,unit:m.unit,actual:a,baseline:t.baseline,target:t.target,
    road:rd,sea:se,train:tr,a13B:b,a13A:ac,a4,a14:ac+a4,pct:b>0?((b-ac)/b)*100:0,
    year:yr,month:mo,monthKey:yr+'-'+mo,monthLabel:MONTHS[parseInt(mo)-1]+' '+yr,
    district:$('eD').value,contract:$('eC').value,notes:$('eN').value,
    addedAt:new Date().toISOString()};

  DB.addDraftEntry(entry);
  buildSidebar();
  renderBatch();
  // Clear form fields to allow easy entry of the next item
  ['eQ','eA','eN'].forEach(id=>{const el=$( id);if(el)el.value='';});
  $('ePrev').innerHTML='<div style="padding:10px 14px;background:rgba(52,211,153,0.1);border-radius:10px;color:var(--green);font-weight:600">\u2705 Item added to batch</div>';
}

function removeDraftEntry(id) {
  DB.removeDraftEntry(id);
  buildSidebar();
  renderBatch();
}

function renderBatch() {
  const drafts = DB.getDraftEntries();
  const countEl = $('batchCount');
  const tbl = $('batchTbl');
  const submitRow = $('submitBatchRow');
  if (!tbl) return;

  if (countEl) countEl.textContent = drafts.length;
  if (submitRow) submitRow.style.display = drafts.length > 0 ? '' : 'none';

  tbl.innerHTML = drafts.length
    ? drafts.map(e=>`<tr>
        <td>${e.monthLabel}</td><td>${e.category}</td><td>${e.type}</td>
        <td class="r mono">${fmtI(e.qty)}</td>
        <td class="r mono">${fmt(e.a13B)}</td>
        <td class="r mono">${fmt(e.a13A)}</td>
        <td class="r mono">${fmt(e.a4)}</td>
        <td class="r mono" style="font-weight:700">${fmt(e.a14)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="removeDraftEntry(${e.id})">\u2715</button></td>
      </tr>`).join('')
    : '<tr><td colspan="9" class="empty">No items in batch — add entries above</td></tr>';
}

// Submit all draft entries to the server at once, then notify consultants
async function submitBatch() {
  const drafts = DB.getDraftEntries();
  if (drafts.length === 0) { alert('Batch is empty. Add entries first.'); return; }
  if (!dbConnected) { alert('No server connection. Please connect to the internet and try again.'); return; }
  if (!confirm(`Submit ${drafts.length} entr${drafts.length===1?'y':'ies'} to the consultant?`)) return;

  const msgEl = $('batchMsg');
  if (msgEl) msgEl.innerHTML = '<div style="padding:10px 14px;background:rgba(96,165,250,0.08);border-radius:10px;color:var(--blue);font-weight:600">Submitting batch...</div>';

  try {
    // Stamp status + submitter before sending
    const stamped = drafts.map(e => ({
      ...e,
      status: 'pending',
      submittedBy: state.name,
      role: state.role,
      submittedAt: new Date().toISOString()
    }));

    await DB.submitBatch(stamped);

    // Add to local state so UI reflects immediately
    stamped.forEach(e => state.entries.push(e));

    // Clear draft queue
    DB.clearDraftEntries();

    // Notify consultants (best-effort — failure doesn't block workflow)
    await DB.notifyBatchSubmitted(state.name, stamped.length);

    buildSidebar();
    renderBatch();
    renderRecent();

    if (msgEl) msgEl.innerHTML = `<div style="padding:12px 16px;background:rgba(52,211,153,0.1);border-radius:10px;color:var(--green);font-weight:600">\u2705 ${stamped.length} entr${stamped.length===1?'y':'ies'} submitted to consultant. They have been notified.</div>`;
  } catch (e) {
    if (msgEl) msgEl.innerHTML = `<div style="padding:10px 14px;background:rgba(239,68,68,0.1);border-radius:10px;color:var(--red);font-weight:600">\u274c Submission failed: ${e.message}</div>`;
  }
}

// Direct submit (for non-contractor roles who still submit one at a time)
async function submitEntry(){
  const c=$('eCat').value,i=$('eType').value,q=parseFloat($('eQ').value),a=parseFloat($('eA').value);
  if(!c||i===''||isNaN(q)||isNaN(a)||q<=0||a<=0){alert('Fill all required fields');return;}
  const m=MATERIALS[c],t=m.types[i],mass=q*m.massFactor;
  const rd=parseFloat($('eR').value)||0,se=parseFloat($('eS').value)||0,tr=parseFloat($('eT').value)||0;
  const b=(q*t.baseline)/1000,ac=(q*a)/1000,a4=(mass*rd*TEF.road+mass*se*TEF.sea+mass*tr*TEF.train)/1000;
  const yr=$('eY').value,mo=$('eM').value;

  const entry={id:Date.now(),category:c,type:t.name,qty:q,unit:m.unit,actual:a,baseline:t.baseline,target:t.target,
    road:rd,sea:se,train:tr,a13B:b,a13A:ac,a4,a14:ac+a4,pct:b>0?((b-ac)/b)*100:0,
    year:yr,month:mo,monthKey:yr+'-'+mo,monthLabel:MONTHS[parseInt(mo)-1]+' '+yr,
    district:$('eD').value,contract:$('eC').value,notes:$('eN').value,
    status:'pending',submittedBy:state.name,role:state.role,submittedAt:new Date().toISOString()};

  await DB.saveEntry(entry);
  state.entries.push(entry);
  buildSidebar(); renderRecent();
  $('ePrev').innerHTML='<div style="padding:12px;background:rgba(52,211,153,0.1);border-radius:10px;color:var(--green);text-align:center;font-weight:600">\u2705 Entry submitted'+(dbConnected?' & synced to cloud':'')+'</div>';
}

function renderRecent(){
  const t=$('reTbl');if(!t)return;
  const r=[...state.entries].reverse().slice(0,15);
  t.innerHTML=r.length?r.map(e=>`<tr><td>${e.monthLabel}</td><td>${e.category}</td><td>${e.type}</td><td class="r mono">${fmtI(e.qty)}</td><td class="r mono">${fmt(e.a13B)}</td><td class="r mono">${fmt(e.a13A)}</td><td class="r mono">${fmt(e.a4)}</td><td class="r mono" style="font-weight:700">${fmt(e.a14)}</td><td><span class="badge ${e.status}">${e.status}</span></td><td>${e.status==='pending'?`<button class="btn btn-danger btn-sm" onclick="delEntry(${e.id})">\u2715</button>`:''}</td></tr>`).join(''):'<tr><td colspan="10" class="empty">No entries</td></tr>';
}

async function delEntry(id){await DB.deleteEntry(id);state.entries=state.entries.filter(e=>e.id!==id);navigate(state.page);}

// ===== A5 =====
function renderA5(el){
  const yr=new Date().getFullYear(),mo=String(new Date().getMonth()+1).padStart(2,'0');
  el.innerHTML=`<div class="card"><div class="card-title">A5 \u2014 Site Energy & Water</div>
  <div class="form-row c3"><div class="fg"><label>Year</label><select id="a5Y">${[yr-1,yr,yr+1].map(y=>`<option ${y===yr?'selected':''}>${y}</option>`).join('')}</select></div>
  <div class="fg"><label>Month</label><select id="a5M">${MONTHS.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0')===mo?'selected':''}>${m}</option>`).join('')}</select></div>
  <div class="fg"><label>Source</label><select id="a5S" onchange="onA5S()"><optgroup label="Energy">${A5_EFS.energy.map((e,i)=>`<option value="e${i}">${e.name}</option>`).join('')}</optgroup><optgroup label="Water">${A5_EFS.water.map((e,i)=>`<option value="w${i}">${e.name}</option>`).join('')}</optgroup></select></div></div>
  <div class="form-row c3"><div class="fg"><label>Quantity</label><input type="number" id="a5Q" placeholder="Amount" oninput="calcA5()"><div class="fg-help" id="a5U">L</div></div>
  <div class="fg"><label>EF (auto)</label><input id="a5E" class="fg-readonly" readonly></div>
  <div class="fg"><label>Emission</label><input id="a5R" class="fg-readonly" readonly></div></div>
  <div class="btn-row"><button class="btn btn-primary" onclick="subA5()">\ud83d\udcbe Submit</button></div></div>
  <div class="card"><div class="card-title">A5 Entries</div><div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Source</th><th class="r">Qty</th><th>Unit</th><th class="r">Emission</th><th></th></tr></thead><tbody id="a5B"></tbody></table></div></div>`;
  onA5S(); rA5();
}
function getA5S(){const v=$('a5S').value;const t=v[0],i=parseInt(v.slice(1));return t==='e'?A5_EFS.energy[i]:A5_EFS.water[i];}
function onA5S(){const s=getA5S();$('a5E').value=s.ef+' '+s.efUnit;$('a5U').textContent=s.unit;calcA5();}
function calcA5(){const s=getA5S(),q=parseFloat($('a5Q').value);$('a5R').value=isNaN(q)?'':fmt((q*s.ef)/1000)+' tCO\u2082eq';}
async function subA5(){const s=getA5S(),q=parseFloat($('a5Q').value);if(isNaN(q)||q<=0){alert('Enter quantity');return;}const yr=$('a5Y').value,mo=$('a5M').value;const e={id:Date.now(),source:s.name,qty:q,unit:s.unit,ef:s.ef,emission:(q*s.ef)/1000,year:yr,month:mo,monthKey:yr+'-'+mo,monthLabel:MONTHS[parseInt(mo)-1]+' '+yr};await DB.saveA5Entry(e);state.a5entries.push(e);rA5();$('a5Q').value='';$('a5R').value='\u2705 Saved';}
function rA5(){const t=$('a5B');if(!t)return;const a=[...state.a5entries].reverse();t.innerHTML=a.length?a.map(e=>`<tr><td>${e.monthLabel}</td><td>${e.source}</td><td class="r mono">${fmtI(e.qty)}</td><td>${e.unit}</td><td class="r mono" style="font-weight:700">${fmt(e.emission)}</td><td><button class="btn btn-danger btn-sm" onclick="dA5(${e.id})">\u2715</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">No entries</td></tr>';}
async function dA5(id){await DB.deleteA5Entry(id);state.a5entries=state.a5entries.filter(e=>e.id!==id);rA5();}

// ===== APPROVALS =====
function renderApprovals(el){
  const r=state.role;
  // Consultant sees both pending (to forward/approve) and review (to approve) items
  // Entries are already filtered server-side by assignment
  const items=r==='consultant'?state.entries.filter(e=>e.status==='pending'||e.status==='review'):r==='client'?state.entries.filter(e=>e.status==='review'):state.entries;

  // Show assignment info banner for consultants
  const assignInfo = r==='consultant' && state.assignments.length > 0
    ? `<div class="card"><div class="card-title">Your Assignments</div><div style="padding:10px 14px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:10px;font-size:13px;color:var(--blue)">You are reviewing submissions from <strong>${state.assignments.map(a=>a.contractorName).join(', ')}</strong>. Only their entries appear here.</div></div>`
    : '';

  el.innerHTML=`${assignInfo}<div class="card"><div class="card-title">Workflow</div>
  <div class="flow-steps"><div class="flow-step"><div class="flow-dot done">\ud83c\udfd7\ufe0f</div><div class="flow-label">Contractor</div></div><div class="flow-line done"></div><div class="flow-step"><div class="flow-dot ${r==='consultant'?'current':'done'}">\ud83d\udccb</div><div class="flow-label">Consultant</div></div><div class="flow-line ${r==='client'||r==='consultant'?'done':''}"></div><div class="flow-step"><div class="flow-dot ${r==='client'?'current':(r==='consultant'?'done':'')}">\ud83d\udc54</div><div class="flow-label">Client</div></div></div></div>
  <div class="card"><div class="card-title">${items.length} Items</div><div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Material</th><th>Type</th><th>By</th><th>Org</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">Reduction</th><th>Status</th>${r!=='contractor'?'<th>Actions</th>':''}</tr></thead><tbody>${items.length?items.map(e=>`<tr><td>${e.monthLabel}</td><td>${e.category}</td><td>${e.type}</td><td>${e.submittedBy||'\u2014'}</td><td style="font-size:11px;color:var(--slate5)">${e.organizationName||'\u2014'}</td><td class="r mono">${fmt(e.a13B)}</td><td class="r mono">${fmt(e.a13A)}</td><td class="r mono" style="color:${e.pct>20?'var(--green)':'var(--orange)'};font-weight:700">${fmt(e.pct)}%</td><td><span class="badge ${e.status}">${e.status}</span></td>${r==='consultant'?`<td>${e.status==='pending'?`<button class="btn btn-approve btn-sm" onclick="appr(${e.id},'review')">\u2713 Forward</button> `:''}${e.status==='pending'||e.status==='review'?`<button class="btn btn-primary btn-sm" onclick="appr(${e.id},'approved')">\u2713 Approve</button> `:''}<button class="btn btn-danger btn-sm" onclick="appr(${e.id},'rejected')">\u2715 Reject</button></td>`:''}${r==='client'?`<td><button class="btn btn-approve btn-sm" onclick="appr(${e.id},'approved')">\u2713 Approve</button> <button class="btn btn-danger btn-sm" onclick="appr(${e.id},'rejected')">\u2715 Reject</button></td>`:''}</tr>`).join(''):'<tr><td colspan="10" class="empty">No pending items</td></tr>'}</tbody></table></div></div>`;
}
async function appr(id,s){await DB.updateEntry(id,{status:s,[state.role+'At']:new Date().toISOString(),[state.role+'By']:state.name,[state.role+'ByUid']:state.uid});const e=state.entries.find(x=>x.id===id);if(e)e.status=s;buildSidebar();navigate('approvals');}

// ===== MONTHLY =====
function renderMonthly(el){
  const map={};state.entries.forEach(e=>{if(!map[e.monthKey])map[e.monthKey]={l:e.monthLabel,n:0,b:0,a:0,a4:0,t:0};const m=map[e.monthKey];m.n++;m.b+=e.a13B;m.a+=e.a13A;m.a4+=e.a4;m.t+=e.a14;});
  const arr=Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
  let gB=0,gA=0,gA4=0,gT=0;
  el.innerHTML=`<div class="card"><div class="card-title">Monthly Summary</div><div class="tbl-wrap"><table><thead><tr><th>Month</th><th class="r">Entries</th><th class="r">A1-A3 Baseline</th><th class="r">A1-A3 Actual</th><th class="r">A4</th><th class="r">A1-A4 Total</th><th class="r">Reduction</th></tr></thead><tbody>${arr.length?arr.map(([k,m])=>{gB+=m.b;gA+=m.a;gA4+=m.a4;gT+=m.t;const p=m.b>0?((m.b-m.a)/m.b)*100:0;return`<tr><td>${m.l}</td><td class="r">${m.n}</td><td class="r mono">${fmt(m.b)}</td><td class="r mono">${fmt(m.a)}</td><td class="r mono">${fmt(m.a4)}</td><td class="r mono" style="font-weight:700">${fmt(m.t)}</td><td class="r mono" style="color:${p>20?'var(--green)':'var(--orange)'};font-weight:700">${fmt(p)}%</td></tr>`;}).join('')+(arr.length>1?`<tr class="total-row"><td>Total</td><td class="r">${state.entries.length}</td><td class="r">${fmt(gB)}</td><td class="r">${fmt(gA)}</td><td class="r">${fmt(gA4)}</td><td class="r">${fmt(gT)}</td><td class="r" style="color:var(--green)">${fmt(gB>0?((gB-gA)/gB)*100:0)}%</td></tr>`:''):'<tr><td colspan="7" class="empty">No data</td></tr>'}</tbody></table></div></div>`;
}

// ===== CUMULATIVE =====
function renderCumulative(el){
  const map={};state.entries.forEach(e=>{if(!map[e.monthKey])map[e.monthKey]={l:e.monthLabel,b:0,a:0,a4:0};map[e.monthKey].b+=e.a13B;map[e.monthKey].a+=e.a13A;map[e.monthKey].a4+=e.a4;});
  const arr=Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
  let cB=0,cA=0,cA4=0;
  const cum=arr.map(([k,v])=>{cB+=v.b;cA+=v.a;cA4+=v.a4;return{l:v.l,mb:v.b,ma:v.a,cB,cA,cA4,cT:cA+cA4,cP:cB>0?((cB-cA)/cB)*100:0};});
  const mx=Math.max(...cum.map(c=>Math.max(c.cB,c.cA)),1);
  el.innerHTML=`<div class="card"><div class="card-title">Cumulative Tracking</div>${cum.length?`<div class="chart-legend"><span><span class="chart-legend-dot" style="background:rgba(148,163,184,0.4)"></span> Baseline</span><span><span class="chart-legend-dot" style="background:rgba(96,165,250,0.5)"></span> Actual</span></div><div class="bar-chart" style="height:180px">${cum.map(c=>`<div class="bar-group"><div class="bar-pair"><div class="bar baseline" style="height:${(c.cB/mx)*160}px"></div><div class="bar actual" style="height:${(c.cA/mx)*160}px"></div></div><div class="bar-label">${c.l}</div></div>`).join('')}</div>`:''}
  <div class="tbl-wrap" style="margin-top:16px"><table><thead><tr><th>Month</th><th class="r">Mth Base</th><th class="r">Mth Actual</th><th class="r">Cum Base</th><th class="r">Cum Actual</th><th class="r">Cum A4</th><th class="r">Cum Total</th><th class="r">Cum Red%</th></tr></thead><tbody>${cum.length?cum.map(c=>`<tr><td>${c.l}</td><td class="r mono">${fmt(c.mb)}</td><td class="r mono">${fmt(c.ma)}</td><td class="r mono" style="font-weight:700">${fmt(c.cB)}</td><td class="r mono" style="font-weight:700;color:var(--blue)">${fmt(c.cA)}</td><td class="r mono">${fmt(c.cA4)}</td><td class="r mono" style="font-weight:700;color:var(--green)">${fmt(c.cT)}</td><td class="r mono" style="color:${c.cP>20?'var(--green)':'var(--orange)'};font-weight:700">${fmt(c.cP)}%</td></tr>`).join(''):'<tr><td colspan="8" class="empty">No data</td></tr>'}</tbody></table></div></div>`;
}

// ===== BASELINES =====
function renderBaselines(el){
  let h='';Object.entries(MATERIALS).forEach(([c,m])=>{h+=`<div class="card"><div class="card-title">${c}</div><div class="tbl-wrap"><table><thead><tr><th>Type</th><th class="r">Baseline EF</th><th class="r">Target EF</th><th>Unit</th><th class="r">Mass Factor</th></tr></thead><tbody>${m.types.map(t=>`<tr><td>${t.name}</td><td class="r mono">${t.baseline}</td><td class="r mono" style="color:var(--green)">${t.target}</td><td>${m.efUnit}</td><td class="r mono">${m.massFactor}</td></tr>`).join('')}</tbody></table></div></div>`;});
  h+=`<div class="card"><div class="card-title">A5 Emission Factors</div><div class="tbl-wrap"><table><thead><tr><th>Source</th><th class="r">EF</th><th>Unit</th></tr></thead><tbody>${[...A5_EFS.energy,...A5_EFS.water].map(e=>`<tr><td>${e.name}</td><td class="r mono" style="color:var(--green)">${e.ef}</td><td>${e.efUnit}</td></tr>`).join('')}</tbody></table></div></div>`;
  el.innerHTML=h;
}

// ===== CERTS =====
function renderCerts(el){
  el.innerHTML=`<div class="card"><div class="card-title">Certification Tracker</div><div class="cert-grid">${CERTS.map(c=>`<div class="cert-card"><div class="cc-icon">${c.icon}</div><div class="cc-name">${c.name}</div><div class="cc-status">${c.tgt}/${c.cr} credits</div><div class="cc-bar"><div class="cc-fill" style="width:${(c.tgt/c.cr)*100}%;background:${c.color}"></div></div></div>`).join('')}</div></div>
  <div class="card"><div class="card-title">Credit Mapping</div><div class="tbl-wrap"><table><thead><tr><th>Cert</th><th>Credit</th><th>Name</th><th>Carbon Link</th><th>Status</th></tr></thead><tbody>
  <tr><td>Envision</td><td>CR1.1</td><td>Reduce Embodied Carbon</td><td>A1-A3</td><td><span class="badge review">In Progress</span></td></tr>
  <tr><td>LEED</td><td>MRc2</td><td>Life-Cycle Impact</td><td>A1-A4</td><td><span class="badge pending">Pending</span></td></tr>
  <tr><td>Mostadam</td><td>MAT-1</td><td>Embodied Carbon</td><td>A1-A3</td><td><span class="badge review">In Progress</span></td></tr>
  <tr><td>BREEAM</td><td>Mat01</td><td>Life Cycle Impacts</td><td>A1-A5</td><td><span class="badge pending">Pending</span></td></tr>
  <tr><td>WELL</td><td>A08</td><td>Healthy Materials</td><td>EPDs</td><td><span class="badge pending">Pending</span></td></tr>
  </tbody></table></div></div>`;
}

// ===== TEAM & INVITATIONS =====
function renderTeam(el) {
  const r = state.role;
  const canInvite = r === 'client' || r === 'consultant';
  const allowedRoles = r === 'consultant' || r === 'client' ? ['client', 'consultant', 'contractor'] : [];

  el.innerHTML = `
  ${canInvite ? `
  <div class="card">
    <div class="card-title">Send Invitation</div>
    <div class="invite-form">
      <div class="form-row c4">
        <div class="fg">
          <label>Email Address</label>
          <input type="email" id="invEmail" placeholder="contractor@company.com" />
        </div>
        <div class="fg">
          <label>Role</label>
          <select id="invRole">
            ${allowedRoles.map(role => `<option value="${role}">${role.charAt(0).toUpperCase() + role.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="fg">
          <label>Organization (optional)</label>
          <select id="invOrg">
            <option value="">None — assign later</option>
          </select>
        </div>
        <div class="fg">
          <label>Message (optional)</label>
          <input id="invMsg" placeholder="Welcome to the project..." />
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="sendInvitation()">Send Invitation</button>
      </div>
      <div class="login-error" id="invError" style="margin-top:12px"></div>
      <div class="login-error" id="invSuccess" style="margin-top:12px"></div>
    </div>
  </div>` : `
  <div class="card">
    <div class="card-title">Team</div>
    <div class="empty"><div class="empty-icon">👥</div>Only clients and consultants can manage invitations.</div>
  </div>`}

  <div class="card">
    <div class="card-title">Invitations</div>
    <div id="invList">
      <div class="empty"><div class="empty-icon">⏳</div>Loading invitations...</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Roles & Permissions</div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr><th>Role</th><th>Data Entry</th><th>Review</th><th>Approve</th><th>Invite</th><th>Reports</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge" style="background:rgba(167,139,250,0.1);color:var(--purple);border:1px solid rgba(167,139,250,0.2)">Client</span></td>
            <td style="color:var(--red)">—</td>
            <td style="color:var(--red)">—</td>
            <td style="color:var(--green)">✓ Final</td>
            <td style="color:var(--green)">✓ All Roles</td>
            <td style="color:var(--green)">✓ All</td>
          </tr>
          <tr>
            <td><span class="badge" style="background:rgba(52,211,153,0.1);color:var(--green);border:1px solid rgba(52,211,153,0.2)">Consultant</span></td>
            <td style="color:var(--green)">✓</td>
            <td style="color:var(--green)">✓ Forward/Reject</td>
            <td style="color:var(--green)">✓ Full</td>
            <td style="color:var(--green)">✓ All Roles</td>
            <td style="color:var(--green)">✓ All</td>
          </tr>
          <tr>
            <td><span class="badge" style="background:rgba(96,165,250,0.1);color:var(--blue);border:1px solid rgba(96,165,250,0.2)">Contractor</span></td>
            <td style="color:var(--green)">✓</td>
            <td style="color:var(--red)">—</td>
            <td style="color:var(--red)">—</td>
            <td style="color:var(--red)">—</td>
            <td style="color:var(--green)">✓ Own</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;

  // Load invitations and populate org dropdown
  if (canInvite) {
    loadInvitations();
    loadInviteOrgDropdown();
  }
}

async function loadInviteOrgDropdown() {
  try {
    const orgs = await DB.getOrganizations();
    state.organizations = orgs;
    const sel = $('invOrg');
    if (sel) {
      sel.innerHTML = '<option value="">None — assign later</option>' +
        orgs.map(o => `<option value="${o.id}" data-name="${o.name}">${o.name} (${o.type.replace('_', ' ')})</option>`).join('');
    }
  } catch (e) {
    console.warn('Failed to load orgs for invite:', e);
  }
}

async function loadInvitations() {
  try {
    const invitations = await DB.getInvitations();
    state.invitations = invitations;
    renderInvitationList(invitations);
  } catch (e) {
    const el = $('invList');
    if (el) el.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>' + (e.message || 'Failed to load invitations.') + '</div>';
  }
}

function renderInvitationList(invitations) {
  const el = $('invList');
  if (!el) return;

  if (!invitations.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>No invitations sent yet. Use the form above to invite team members.</div>';
    return;
  }

  const statusBadge = function(s) {
    const map = { pending: 'pending', accepted: 'approved', revoked: 'rejected', expired: 'rejected' };
    return '<span class="badge ' + (map[s] || 'pending') + '">' + s + '</span>';
  };

  var rows = '';
  for (var i = 0; i < invitations.length; i++) {
    var inv = invitations[i];
    var expired = new Date(inv.expiresAt) < new Date() && inv.status === 'pending';
    var status = expired ? 'expired' : inv.status;
    var roleBadge = inv.role === 'contractor' ? 'review' : inv.role === 'consultant' ? 'approved' : 'pending';
    var actions = '';
    if (status === 'pending') {
      actions = '<button class="btn btn-secondary btn-sm inv-resend" data-id="' + inv.id + '">↻ Resend</button> <button class="btn btn-danger btn-sm inv-revoke" data-id="' + inv.id + '">✕ Revoke</button>';
    } else if (status === 'accepted') {
      actions = '<span style="color:var(--green);font-size:11px">✓ Joined</span>';
    } else {
      actions = '—';
    }
    rows += '<tr>' +
      '<td style="font-weight:600">' + inv.email + '</td>' +
      '<td><span class="badge ' + roleBadge + '" style="text-transform:capitalize">' + inv.role + '</span></td>' +
      '<td>' + statusBadge(status) + '</td>' +
      '<td>' + (inv.invitedByName || '—') + '</td>' +
      '<td style="color:var(--slate5);font-size:11px">' + new Date(inv.createdAt).toLocaleDateString() + '</td>' +
      '<td style="color:' + (expired ? 'var(--red)' : 'var(--slate5)') + ';font-size:11px">' + new Date(inv.expiresAt).toLocaleDateString() + '</td>' +
      '<td style="white-space:nowrap">' + actions + '</td>' +
      '</tr>';
  }

  el.innerHTML = '<div class="tbl-wrap"><table>' +
    '<thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Invited By</th><th>Sent</th><th>Expires</th><th>Actions</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';

  // Attach click handlers via event delegation (more reliable than inline onclick)
  // Remove previous listener to prevent stacking on list refresh
  el.removeEventListener('click', handleInvListClick);
  el.addEventListener('click', handleInvListClick);
}

function handleInvListClick(e) {
  var btn = e.target.closest('.inv-revoke');
  if (btn) { revokeInvite(btn.getAttribute('data-id')); return; }
  btn = e.target.closest('.inv-resend');
  if (btn) { resendInvite(btn.getAttribute('data-id')); return; }
}

async function sendInvitation() {
  const errEl = $('invError');
  const sucEl = $('invSuccess');
  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  const email = $('invEmail').value.trim();
  const role = $('invRole').value;
  const message = $('invMsg').value.trim();
  const orgSel = $('invOrg');
  const organizationId = orgSel ? orgSel.value : '';
  const organizationName = orgSel && orgSel.selectedOptions[0] ? orgSel.selectedOptions[0].getAttribute('data-name') || '' : '';

  if (!email) { showError('invError', 'Please enter an email address.'); return; }
  if (!role) { showError('invError', 'Please select a role.'); return; }

  try {
    // Create invitation with organization context
    const result = await DB.createInvitation(email, role, message, organizationId, organizationName);

    // Send email notification
    try {
      await DB.sendInvitationEmail(result.invitation.id);
      showSuccess('invSuccess', '✓ Invitation sent to ' + email + ' — Email delivered!');
    } catch (emailErr) {
      // Invitation was created but email failed
      showSuccess('invSuccess', '✓ Invitation created for ' + email + '. Note: Email delivery failed — ' + emailErr.message);
    }

    // Clear form
    $('invEmail').value = '';
    $('invMsg').value = '';

    // Reload invitation list
    loadInvitations();
  } catch (e) {
    showError('invError', e.message || 'Failed to send invitation.');
  }
}

async function revokeInvite(id) {
  if (!confirm('Revoke this invitation? The user will no longer be able to register with this link.')) return;
  try {
    await DB.revokeInvitation(id);
    loadInvitations();
  } catch (e) {
    alert(e.message || 'Failed to revoke invitation.');
  }
}

async function resendInvite(id) {
  try {
    // Resend generates new token and extends expiry
    const result = await DB.resendInvitation(id);
    // Send email with new token
    try {
      await DB.sendInvitationEmail(id);
      alert('Invitation resent with new link — email delivered!');
    } catch (emailErr) {
      alert('Invitation renewed but email failed: ' + emailErr.message);
    }
    loadInvitations();
  } catch (e) {
    alert(e.message || 'Failed to resend invitation.');
  }
}

// ===== ORGANIZATIONS & ASSIGNMENTS =====
async function renderOrganizations(el) {
  const r = state.role;
  const canManage = r === 'client' || r === 'consultant';

  if (!canManage) {
    el.innerHTML = '<div class="card"><div class="card-title">Organizations</div><div class="empty"><div class="empty-icon">🏢</div>Only clients and consultants can manage organizations.</div></div>';
    return;
  }

  el.innerHTML = `
  <!-- Hierarchy explanation -->
  <div class="card">
    <div class="card-title">Enterprise Hierarchy</div>
    <div style="padding:12px 16px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:10px;font-size:13px;color:var(--slate4);line-height:1.7">
      <strong style="color:var(--blue)">How it works:</strong> The client (KSIA) hires consultant firms (e.g., Parsons, Bechtel).
      Each consultant firm oversees contractor companies. Within a firm, specific consultants are assigned to review
      specific contractors' carbon data submissions.<br>
      <span style="color:var(--slate5)">Client → Consultant Firms → Contractor Companies → Individual Assignments</span>
    </div>
  </div>

  <!-- Create Organization -->
  <div class="card">
    <div class="card-title">Add Organization</div>
    <div class="form-row c3">
      <div class="fg">
        <label>Organization Name</label>
        <input id="orgName" placeholder="e.g. Parsons, Bechtel, ABC Contractors" />
      </div>
      <div class="fg">
        <label>Type</label>
        <select id="orgType">
          <option value="consultant_firm">Consultant Firm</option>
          <option value="contractor_company">Contractor Company</option>
        </select>
      </div>
      <div class="fg" style="display:flex;align-items:flex-end">
        <button class="btn btn-primary" onclick="createOrg()">+ Add Organization</button>
      </div>
    </div>
    <div class="login-error" id="orgError" style="margin-top:12px"></div>
    <div class="login-error" id="orgSuccess" style="margin-top:12px"></div>
  </div>

  <!-- Organizations List -->
  <div class="card">
    <div class="card-title">Organizations</div>
    <div id="orgList"><div class="empty"><div class="empty-icon">...</div>Loading...</div></div>
  </div>

  <!-- Link Orgs (consultant firm ↔ contractor company) -->
  <div class="card">
    <div class="card-title">Link Consultant Firm to Contractor Company</div>
    <div style="padding:10px 14px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--green)">
      Define which consultant firm oversees which contractor company.
    </div>
    <div class="form-row c3">
      <div class="fg">
        <label>Consultant Firm</label>
        <select id="linkConsultantOrg"><option value="">Select...</option></select>
      </div>
      <div class="fg">
        <label>Contractor Company</label>
        <select id="linkContractorOrg"><option value="">Select...</option></select>
      </div>
      <div class="fg" style="display:flex;align-items:flex-end">
        <button class="btn btn-primary" onclick="linkOrganizations()">Link</button>
      </div>
    </div>
    <div class="login-error" id="linkError" style="margin-top:12px"></div>
    <div id="linkList" style="margin-top:12px"></div>
  </div>

  <!-- Assign Consultant to Contractor (user-level) -->
  <div class="card">
    <div class="card-title">Assign Consultant to Contractor</div>
    <div style="padding:10px 14px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--yellow)">
      Assign a specific consultant to review a specific contractor's submissions. This controls who sees what in the approval workflow.
    </div>
    <div class="form-row c3">
      <div class="fg">
        <label>Consultant</label>
        <select id="assignConsultant"><option value="">Select consultant...</option></select>
      </div>
      <div class="fg">
        <label>Contractor</label>
        <select id="assignContractor"><option value="">Select contractor...</option></select>
      </div>
      <div class="fg" style="display:flex;align-items:flex-end">
        <button class="btn btn-primary" onclick="createUserAssignment()">Assign</button>
      </div>
    </div>
    <div class="login-error" id="assignError" style="margin-top:12px"></div>
    <div id="assignList" style="margin-top:12px"></div>
  </div>

  <!-- Assign Users to Organizations -->
  <div class="card">
    <div class="card-title">Assign User to Organization</div>
    <div style="padding:10px 14px;background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.15);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--purple)">
      Assign team members to their organization (firm or company).
    </div>
    <div class="form-row c3">
      <div class="fg">
        <label>User</label>
        <select id="userToAssign"><option value="">Select user...</option></select>
      </div>
      <div class="fg">
        <label>Organization</label>
        <select id="orgToAssignTo"><option value="">Select organization...</option></select>
      </div>
      <div class="fg" style="display:flex;align-items:flex-end">
        <button class="btn btn-primary" onclick="assignUserToOrganization()">Assign</button>
      </div>
    </div>
    <div class="login-error" id="userOrgError" style="margin-top:12px"></div>
    <div id="userOrgList" style="margin-top:12px"></div>
  </div>`;

  // Load data
  await loadOrgData();
}

async function loadOrgData() {
  try {
    const [orgs, links, assignments, users] = await Promise.all([
      DB.getOrganizations(),
      DB.getOrgLinks(),
      DB.getAssignments(),
      DB.getUsers()
    ]);
    state.organizations = orgs;
    state.orgLinks = links;
    state.assignments = assignments;
    state.users = users;

    renderOrgList(orgs);
    renderLinkList(links);
    renderAssignmentList(assignments);
    renderUserOrgList(users);
    populateOrgDropdowns(orgs, users);
  } catch (e) {
    console.warn('Failed to load org data:', e);
  }
}

function renderOrgList(orgs) {
  const el = $('orgList');
  if (!el) return;

  if (!orgs.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🏢</div>No organizations yet. Create one above.</div>';
    return;
  }

  const firms = orgs.filter(o => o.type === 'consultant_firm');
  const companies = orgs.filter(o => o.type === 'contractor_company');

  el.innerHTML = `
    <div class="tbl-wrap"><table>
      <thead><tr><th>Name</th><th>Type</th><th>Created By</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>
        ${firms.length ? '<tr><td colspan="5" style="font-size:11px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:1px;padding:12px 8px 4px">Consultant Firms</td></tr>' : ''}
        ${firms.map(o => `<tr>
          <td style="font-weight:600">${o.name}</td>
          <td><span class="badge approved" style="text-transform:capitalize">${o.type.replace('_', ' ')}</span></td>
          <td style="color:var(--slate5);font-size:12px">${o.createdByName || '—'}</td>
          <td style="color:var(--slate5);font-size:11px">${new Date(o.createdAt).toLocaleDateString()}</td>
          <td>${state.role === 'client' ? `<button class="btn btn-danger btn-sm" onclick="deleteOrg('${o.id}')">Delete</button>` : '—'}</td>
        </tr>`).join('')}
        ${companies.length ? '<tr><td colspan="5" style="font-size:11px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:1px;padding:12px 8px 4px">Contractor Companies</td></tr>' : ''}
        ${companies.map(o => `<tr>
          <td style="font-weight:600">${o.name}</td>
          <td><span class="badge review" style="text-transform:capitalize">${o.type.replace('_', ' ')}</span></td>
          <td style="color:var(--slate5);font-size:12px">${o.createdByName || '—'}</td>
          <td style="color:var(--slate5);font-size:11px">${new Date(o.createdAt).toLocaleDateString()}</td>
          <td>${state.role === 'client' ? `<button class="btn btn-danger btn-sm" onclick="deleteOrg('${o.id}')">Delete</button>` : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

function renderLinkList(links) {
  const el = $('linkList');
  if (!el) return;

  if (!links.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--slate5);text-align:center;padding:8px">No org links yet.</div>';
    return;
  }

  el.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>Consultant Firm</th><th></th><th>Contractor Company</th><th>Actions</th></tr></thead>
    <tbody>${links.map(l => `<tr>
      <td style="font-weight:600;color:var(--green)">${l.consultantOrgName}</td>
      <td style="color:var(--slate5);text-align:center">→</td>
      <td style="font-weight:600;color:var(--blue)">${l.contractorOrgName}</td>
      <td><button class="btn btn-danger btn-sm" onclick="unlinkOrganizations('${l.id}')">Unlink</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderAssignmentList(assignments) {
  const el = $('assignList');
  if (!el) return;

  if (!assignments.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--slate5);text-align:center;padding:8px">No assignments yet. Assign consultants to contractors above.</div>';
    return;
  }

  el.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>Consultant</th><th>Org</th><th></th><th>Contractor</th><th>Org</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>${assignments.map(a => `<tr>
      <td style="font-weight:600;color:var(--green)">${a.consultantName}</td>
      <td style="font-size:11px;color:var(--slate5)">${a.consultantOrgName || '—'}</td>
      <td style="color:var(--slate5);text-align:center">→</td>
      <td style="font-weight:600;color:var(--blue)">${a.contractorName}</td>
      <td style="font-size:11px;color:var(--slate5)">${a.contractorOrgName || '—'}</td>
      <td style="font-size:11px;color:var(--slate5)">${new Date(a.createdAt).toLocaleDateString()}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteUserAssignment('${a.id}')">Remove</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderUserOrgList(users) {
  const el = $('userOrgList');
  if (!el) return;

  const usersWithOrg = users.filter(u => u.organizationName);
  if (!usersWithOrg.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--slate5);text-align:center;padding:8px">No users assigned to organizations yet.</div>';
    return;
  }

  el.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>User</th><th>Role</th><th>Organization</th></tr></thead>
    <tbody>${usersWithOrg.map(u => `<tr>
      <td style="font-weight:600">${u.name}</td>
      <td><span class="badge ${u.role === 'consultant' ? 'approved' : u.role === 'contractor' ? 'review' : 'pending'}" style="text-transform:capitalize">${u.role}</span></td>
      <td style="color:var(--green)">${u.organizationName}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function populateOrgDropdowns(orgs, users) {
  const firms = orgs.filter(o => o.type === 'consultant_firm');
  const companies = orgs.filter(o => o.type === 'contractor_company');
  const consultants = users.filter(u => u.role === 'consultant');
  const contractors = users.filter(u => u.role === 'contractor');

  // Link dropdowns
  const lcEl = $('linkConsultantOrg');
  const lrEl = $('linkContractorOrg');
  if (lcEl) lcEl.innerHTML = '<option value="">Select consultant firm...</option>' + firms.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  if (lrEl) lrEl.innerHTML = '<option value="">Select contractor company...</option>' + companies.map(o => `<option value="${o.id}">${o.name}</option>`).join('');

  // Assignment dropdowns
  const acEl = $('assignConsultant');
  const arEl = $('assignContractor');
  if (acEl) acEl.innerHTML = '<option value="">Select consultant...</option>' + consultants.map(u => `<option value="${u.uid}">${u.name} (${u.email})${u.organizationName ? ' — ' + u.organizationName : ''}</option>`).join('');
  if (arEl) arEl.innerHTML = '<option value="">Select contractor...</option>' + contractors.map(u => `<option value="${u.uid}">${u.name} (${u.email})${u.organizationName ? ' — ' + u.organizationName : ''}</option>`).join('');

  // User-to-org dropdowns
  const uEl = $('userToAssign');
  const oEl = $('orgToAssignTo');
  if (uEl) uEl.innerHTML = '<option value="">Select user...</option>' + users.filter(u => u.role !== 'client').map(u => `<option value="${u.uid}">${u.name} (${u.role})${u.organizationName ? ' — ' + u.organizationName : ''}</option>`).join('');
  if (oEl) oEl.innerHTML = '<option value="">Select organization...</option>' + orgs.map(o => `<option value="${o.id}">${o.name} (${o.type.replace('_', ' ')})</option>`).join('');
}

async function createOrg() {
  const errEl = $('orgError');
  const sucEl = $('orgSuccess');
  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  const name = $('orgName').value.trim();
  const type = $('orgType').value;

  if (!name) { showError('orgError', 'Please enter an organization name.'); return; }

  try {
    await DB.createOrganization(name, type);
    showSuccess('orgSuccess', 'Organization "' + name + '" created.');
    $('orgName').value = '';
    await loadOrgData();
  } catch (e) {
    showError('orgError', e.message || 'Failed to create organization.');
  }
}

async function deleteOrg(orgId) {
  if (!confirm('Delete this organization? Users must be reassigned first.')) return;
  try {
    await DB.deleteOrganization(orgId);
    await loadOrgData();
  } catch (e) {
    alert(e.message || 'Failed to delete organization.');
  }
}

async function linkOrganizations() {
  const errEl = $('linkError');
  errEl.style.display = 'none';

  const consultantOrgId = $('linkConsultantOrg').value;
  const contractorOrgId = $('linkContractorOrg').value;

  if (!consultantOrgId || !contractorOrgId) { showError('linkError', 'Select both a consultant firm and a contractor company.'); return; }

  try {
    await DB.linkOrgs(consultantOrgId, contractorOrgId);
    await loadOrgData();
  } catch (e) {
    showError('linkError', e.message || 'Failed to link organizations.');
  }
}

async function unlinkOrganizations(linkId) {
  if (!confirm('Remove this organization link?')) return;
  try {
    await DB.unlinkOrgs(linkId);
    await loadOrgData();
  } catch (e) {
    alert(e.message || 'Failed to unlink organizations.');
  }
}

async function createUserAssignment() {
  const errEl = $('assignError');
  errEl.style.display = 'none';

  const consultantUid = $('assignConsultant').value;
  const contractorUid = $('assignContractor').value;

  if (!consultantUid || !contractorUid) { showError('assignError', 'Select both a consultant and a contractor.'); return; }

  try {
    await DB.createAssignment(consultantUid, contractorUid);
    showSuccess('assignError', 'Assignment created.');
    await loadOrgData();
  } catch (e) {
    showError('assignError', e.message || 'Failed to create assignment.');
  }
}

async function deleteUserAssignment(assignmentId) {
  if (!confirm('Remove this consultant-contractor assignment?')) return;
  try {
    await DB.deleteAssignment(assignmentId);
    await loadOrgData();
  } catch (e) {
    alert(e.message || 'Failed to delete assignment.');
  }
}

async function assignUserToOrganization() {
  const errEl = $('userOrgError');
  errEl.style.display = 'none';

  const userId = $('userToAssign').value;
  const orgId = $('orgToAssignTo').value;

  if (!userId || !orgId) { showError('userOrgError', 'Select both a user and an organization.'); return; }

  try {
    await DB.assignUserToOrg(userId, orgId);
    showSuccess('userOrgError', 'User assigned to organization.');
    await loadOrgData();
  } catch (e) {
    showError('userOrgError', e.message || 'Failed to assign user.');
  }
}

// ===== INTEGRATIONS =====
function renderIntegrations(el){
  const apis=[{i:"\ud83d\udd17",n:"EPD Hub API",d:"Auto-fetch emission factors"},{i:"\ud83d\udcca",n:"EC3 / Building Transparency",d:"Material carbon benchmarks"},{i:"\ud83c\udf10",n:"One Click LCA",d:"Whole-building LCA sync"},{i:"\ud83d\udce1",n:"IEA Data API",d:"Grid emission factors by region"},{i:"\ud83d\udcc1",n:"Power BI Export",d:"Advanced analytics export"},{i:"\ud83d\udd10",n:"KSIA Portal",d:"Project management sync"},{i:"\u2601\ufe0f",n:"Firebase Cloud DB",d:"Real-time cloud database",on:dbConnected},{i:"\ud83d\udce7",n:"Email Notifications",d:"Stakeholder alerts"}];
  el.innerHTML=`<div class="card"><div class="card-title">Integration Hub</div>${apis.map(a=>`<div class="api-item"><div class="api-left"><span class="api-icon">${a.i}</span><div><div class="api-name">${a.n}</div><div class="api-desc">${a.d}</div></div></div><div class="toggle${a.on?' on':''}" onclick="this.classList.toggle('on')"></div></div>`).join('')}</div>
  <div class="card"><div class="card-title">Database Status</div><div style="padding:16px;background:var(--bg3);border-radius:10px;font-size:13px"><strong style="color:${dbConnected?'var(--green)':'var(--red)'}">●</strong> ${dbConnected?'Connected to Firebase Cloud Database \u2014 data syncs in real-time across all users':'Running in offline mode \u2014 data saved locally. Connect Firebase for cloud sync.'}<br><br><span style="color:var(--slate5);font-size:11px">Database: Firebase Realtime DB | Project: KSIA | Path: /projects/ksia/</span></div></div>`;
}
