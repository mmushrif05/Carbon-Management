// ===== DASHBOARD =====
function renderDashboard(el) {
  const d=state.entries; let tB=0,tA=0,tA4=0;
  d.forEach(e=>{tB+=e.a13B||0;tA+=e.a13A||0;tA4+=e.a4||0});
  let a5T=0; state.a5entries.forEach(e=>{a5T+=e.emission||0});
  const rP=tB>0?((tB-tA)/tB)*100:0;
  const matB={}; d.forEach(e=>{if(!matB[e.category])matB[e.category]={b:0,a:0};matB[e.category].b+=e.a13B||0;matB[e.category].a+=e.a13A||0});
  const mMap={}; d.forEach(e=>{const k=e.monthKey;if(!mMap[k])mMap[k]={b:0,a:0,l:e.monthLabel};mMap[k].b+=e.a13B||0;mMap[k].a+=e.a13A||0});
  const mArr=Object.entries(mMap).sort((a,b)=>a[0].localeCompare(b[0]));
  const cols={Concrete:'var(--slate4)',Steel:'var(--blue)',Asphalt:'var(--orange)',Aluminum:'var(--purple)',Glass:'var(--cyan)',Pipes:'var(--yellow)',Earthwork:'#a3e635'};

  const subs=state.submissions;
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
  <div class="card"><div class="card-title">Monthly Packages</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">
    <div><div style="font-size:24px;font-weight:800;color:var(--yellow)">${d.filter(e=>e.status==='draft').length}</div><div style="font-size:10px;color:var(--slate5)">Draft</div></div>
    <div><div style="font-size:24px;font-weight:800;color:var(--blue)">${subs.filter(s=>s.status==='submitted').length}</div><div style="font-size:10px;color:var(--slate5)">Submitted</div></div>
    <div><div style="font-size:24px;font-weight:800;color:var(--orange)">${subs.filter(s=>s.status==='returned').length}</div><div style="font-size:10px;color:var(--slate5)">Returned</div></div>
    <div><div style="font-size:24px;font-weight:800;color:var(--green)">${subs.filter(s=>s.status==='approved').length}</div><div style="font-size:10px;color:var(--slate5)">Approved</div></div>
  </div></div>`;

  if(mArr.length){const mx=Math.max(...mArr.map(([k,v])=>Math.max(v.b,v.a)),1);$('dc').innerHTML=mArr.map(([k,v])=>`<div class="bar-group"><div class="bar-pair"><div class="bar baseline" style="height:${(v.b/mx)*170}px"></div><div class="bar actual" style="height:${(v.a/mx)*170}px"></div></div><div class="bar-label">${v.l}</div></div>`).join('');}
  if(Object.keys(matB).length){const tot=Object.values(matB).reduce((s,v)=>s+v.a,0)||1;let ang=0,sh='',lh='';Object.entries(matB).forEach(([c,v])=>{const p=v.a/tot;const a1=ang;ang+=p*360;const lg=p>.5?1:0;const r=55,cx=70,cy=70;const x1=cx+r*Math.cos((a1-90)*Math.PI/180),y1=cy+r*Math.sin((a1-90)*Math.PI/180);const x2=cx+r*Math.cos((ang-90)*Math.PI/180),y2=cy+r*Math.sin((ang-90)*Math.PI/180);const cl=cols[c]||'var(--slate4)';if(p>.001)sh+=`<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${lg},1 ${x2},${y2} Z" fill="${cl}" opacity="0.7" stroke="var(--bg2)" stroke-width="1.5"/>`;lh+=`<div class="donut-legend-item"><div class="donut-legend-dot" style="background:${cl}"></div>${c}: ${fmt(v.a)} tCO\u2082 (${(p*100).toFixed(1)}%)</div>`;});$('dn').innerHTML=sh;$('dl').innerHTML=lh;}
}

// ===== ENTRY =====
function renderEntry(el) {
  const yr=new Date().getFullYear(),mo=String(new Date().getMonth()+1).padStart(2,'0');
  el.innerHTML=`<div class="card"><div class="card-title">New Material Entry \u2014 A1-A4</div>
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
  <div class="btn-row"><button class="btn btn-primary" onclick="submitEntry()">\ud83d\udcbe Submit Entry</button><button class="btn btn-secondary" onclick="navigate('entry_a13')">\ud83d\udd04 Clear</button></div></div>
  <div class="card"><div class="card-title">Recent Entries</div><div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Material</th><th>Type</th><th class="r">Qty</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">A4</th><th class="r">Total</th><th>Status</th><th></th></tr></thead><tbody id="reTbl"></tbody></table></div></div>`;
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
    status:'draft',submittedBy:state.name,role:state.role,createdByUid:state.uid,submittedAt:new Date().toISOString()};

  await DB.saveEntry(entry);
  state.entries.push(entry);
  buildSidebar(); renderRecent();
  $('ePrev').innerHTML='<div style="padding:12px;background:rgba(52,211,153,0.1);border-radius:10px;color:var(--green);text-align:center;font-weight:600">\u2705 Entry saved as draft'+(dbConnected?' & synced to cloud':'')+'. Go to Monthly Packages to submit.</div>';
}

function renderRecent(){
  const t=$('reTbl');if(!t)return;
  const r=[...state.entries].reverse().slice(0,15);
  t.innerHTML=r.length?r.map(e=>`<tr><td>${e.monthLabel}</td><td>${e.category}</td><td>${e.type}</td><td class="r mono">${fmtI(e.qty)}</td><td class="r mono">${fmt(e.a13B)}</td><td class="r mono">${fmt(e.a13A)}</td><td class="r mono">${fmt(e.a4)}</td><td class="r mono" style="font-weight:700">${fmt(e.a14)}</td><td><span class="badge ${e.status==='needs_fix'?'rejected':e.status}">${e.status}</span></td><td>${e.status==='draft'?`<button class="btn btn-danger btn-sm" onclick="delEntry(${e.id})">\u2715</button>`:''}</td></tr>`).join(''):'<tr><td colspan="10" class="empty">No entries</td></tr>';
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

// ===== MONTHLY PACKAGES (APPROVALS) =====
let _expandedSub = null; // currently expanded submission ID
let _expandedEntries = []; // entries for expanded submission

function renderApprovals(el) {
  const r = state.role;
  if (r === 'contractor') renderContractorPackages(el);
  else renderReviewerPackages(el);
}

// --- CONTRACTOR VIEW ---
function renderContractorPackages(el) {
  // Group draft entries by month
  const drafts = state.entries.filter(e => e.status === 'draft');
  const byMonth = {};
  drafts.forEach(e => {
    if (!byMonth[e.monthKey]) byMonth[e.monthKey] = { label: e.monthLabel, items: [], b: 0, a: 0, a4: 0, t: 0 };
    const g = byMonth[e.monthKey];
    g.items.push(e); g.b += e.a13B || 0; g.a += e.a13A || 0; g.a4 += e.a4 || 0; g.t += e.a14 || 0;
  });
  const months = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));

  const subs = state.submissions;
  const returned = subs.filter(s => s.status === 'returned');
  const submitted = subs.filter(s => s.status === 'submitted');
  const approved = subs.filter(s => s.status === 'approved');

  let h = `<div class="card"><div class="card-title">Workflow</div>
  <div class="flow-steps"><div class="flow-step"><div class="flow-dot current">\ud83c\udfd7\ufe0f</div><div class="flow-label">Contractor</div></div><div class="flow-line"></div><div class="flow-step"><div class="flow-dot">\ud83d\udccb</div><div class="flow-label">Consultant</div></div><div class="flow-line"></div><div class="flow-step"><div class="flow-dot">\ud83d\udc54</div><div class="flow-label">Client</div></div></div></div>`;

  // Draft entries ready for submission
  if (months.length) {
    h += `<div class="card"><div class="card-title">\ud83d\udcdd Draft Entries</div>`;
    months.forEach(([mk, g]) => {
      const pct = g.b > 0 ? ((g.b - g.a) / g.b) * 100 : 0;
      h += `<div style="border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div><strong style="color:var(--text1)">${g.label}</strong> <span style="color:var(--slate5);font-size:12px">${g.items.length} item(s)</span></div>
          <button class="btn btn-primary btn-sm" onclick="submitMonthlyPackage('${mk}',this)">\ud83d\udce6 Submit Monthly Package</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;font-size:11px;text-align:center">
          <div><div style="color:var(--slate5)">Baseline</div><div class="mono" style="font-weight:700">${fmt(g.b)}</div></div>
          <div><div style="color:var(--slate5)">Actual</div><div class="mono" style="font-weight:700;color:var(--blue)">${fmt(g.a)}</div></div>
          <div><div style="color:var(--slate5)">A4</div><div class="mono" style="font-weight:700">${fmt(g.a4)}</div></div>
          <div><div style="color:var(--slate5)">Reduction</div><div class="mono" style="font-weight:700;color:${pct > 20 ? 'var(--green)' : 'var(--orange)'}">${fmt(pct)}%</div></div>
        </div>
        <div class="tbl-wrap"><table><thead><tr><th>Material</th><th>Type</th><th class="r">Qty</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">Total</th></tr></thead><tbody>
        ${g.items.map(e => `<tr><td>${e.category}</td><td>${e.type}</td><td class="r mono">${fmtI(e.qty)}</td><td class="r mono">${fmt(e.a13B)}</td><td class="r mono">${fmt(e.a13A)}</td><td class="r mono" style="font-weight:700">${fmt(e.a14)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    });
    h += `</div>`;
  } else {
    h += `<div class="card"><div class="card-title">\ud83d\udcdd Draft Entries</div><div class="empty"><div class="empty-icon">\ud83d\udce6</div>No draft entries. Add materials in A1-A3 entry page, then submit here.</div></div>`;
  }

  // Returned packages needing correction
  if (returned.length) {
    h += `<div class="card"><div class="card-title" style="color:var(--orange)">\ud83d\udd04 Returned for Correction</div>`;
    returned.forEach(s => {
      const flagged = s.lineItemReviews ? Object.values(s.lineItemReviews).filter(r => r.status === 'needs_fix').length : 0;
      h += `<div style="border:1px solid rgba(251,191,36,0.3);border-radius:10px;padding:16px;margin-bottom:12px;background:rgba(251,191,36,0.03)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div><strong style="color:var(--text1)">${s.monthLabel}</strong> <span class="badge rejected">returned</span> <span style="color:var(--orange);font-size:11px">${flagged} item(s) flagged</span></div>
          <div><button class="btn btn-secondary btn-sm" onclick="expandSubmission('${s.id}',this)">\u25bc Details</button> <button class="btn btn-primary btn-sm" onclick="resubmitPackage('${s.id}',this)">\ud83d\udce6 Resubmit</button></div>
        </div>
        <div style="font-size:11px;color:var(--slate5)">Returned by ${s.reviewedByName || '\u2014'} on ${s.returnedAt ? new Date(s.returnedAt).toLocaleDateString() : '\u2014'}</div>
        <div id="subDetail_${s.id}"></div>
      </div>`;
    });
    h += `</div>`;
  }

  // Submitted packages (waiting for review)
  if (submitted.length) {
    h += `<div class="card"><div class="card-title">\u23f3 Awaiting Review</div>`;
    submitted.forEach(s => {
      h += `<div style="border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong style="color:var(--text1)">${s.monthLabel}</strong> <span class="badge review">submitted</span> <span style="color:var(--slate5);font-size:11px">${s.itemCount} items \u2022 ${fmt(s.totalA14)} tCO\u2082eq</span></div>
          <div style="font-size:11px;color:var(--slate5)">Submitted ${new Date(s.submittedAt).toLocaleDateString()}</div>
        </div>
      </div>`;
    });
    h += `</div>`;
  }

  // Approved
  if (approved.length) {
    h += `<div class="card"><div class="card-title">\u2705 Approved</div>`;
    approved.forEach(s => {
      h += `<div style="border:1px solid rgba(52,211,153,0.2);border-radius:10px;padding:16px;margin-bottom:12px;background:rgba(52,211,153,0.03)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong style="color:var(--text1)">${s.monthLabel}</strong> <span class="badge approved">approved</span> <span style="color:var(--slate5);font-size:11px">${s.itemCount} items \u2022 ${fmt(s.totalA14)} tCO\u2082eq</span></div>
          <div style="font-size:11px;color:var(--green)">Approved by ${s.reviewedByName || '\u2014'} on ${s.approvedAt ? new Date(s.approvedAt).toLocaleDateString() : '\u2014'}</div>
        </div>
      </div>`;
    });
    h += `</div>`;
  }

  el.innerHTML = h;
}

// --- REVIEWER VIEW (Consultant/Client) ---
function renderReviewerPackages(el) {
  const r = state.role;
  const subs = state.submissions;
  const submitted = subs.filter(s => s.status === 'submitted');
  const returned = subs.filter(s => s.status === 'returned');
  const approved = subs.filter(s => s.status === 'approved');

  let h = `<div class="card"><div class="card-title">Workflow</div>
  <div class="flow-steps"><div class="flow-step"><div class="flow-dot done">\ud83c\udfd7\ufe0f</div><div class="flow-label">Contractor</div></div><div class="flow-line done"></div><div class="flow-step"><div class="flow-dot ${r === 'consultant' ? 'current' : 'done'}">\ud83d\udccb</div><div class="flow-label">Consultant</div></div><div class="flow-line ${r === 'client' ? 'done' : ''}"></div><div class="flow-step"><div class="flow-dot ${r === 'client' ? 'current' : ''}">\ud83d\udc54</div><div class="flow-label">Client</div></div></div></div>`;

  // Packages pending review
  if (submitted.length) {
    h += `<div class="card"><div class="card-title">\ud83d\udccb Pending Review (${submitted.length})</div>`;
    submitted.forEach(s => {
      const pct = s.totalA13B > 0 ? ((s.totalA13B - s.totalA13A) / s.totalA13B) * 100 : 0;
      h += `<div style="border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div><strong style="color:var(--text1)">${s.monthLabel}</strong> by <strong style="color:var(--green)">${s.createdByName}</strong> <span style="color:var(--slate5);font-size:11px">\u2022 ${s.itemCount} items</span></div>
          <button class="btn btn-primary btn-sm" onclick="expandReview('${s.id}',this)">\ud83d\udd0d Review Package</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:11px;text-align:center">
          <div><div style="color:var(--slate5)">Baseline</div><div class="mono" style="font-weight:700">${fmt(s.totalA13B)}</div></div>
          <div><div style="color:var(--slate5)">Actual</div><div class="mono" style="font-weight:700;color:var(--blue)">${fmt(s.totalA13A)}</div></div>
          <div><div style="color:var(--slate5)">A4</div><div class="mono" style="font-weight:700">${fmt(s.totalA4)}</div></div>
          <div><div style="color:var(--slate5)">Reduction</div><div class="mono" style="font-weight:700;color:${pct > 20 ? 'var(--green)' : 'var(--orange)'}">${fmt(pct)}%</div></div>
        </div>
        <div id="reviewDetail_${s.id}"></div>
      </div>`;
    });
    h += `</div>`;
  } else {
    h += `<div class="card"><div class="card-title">\ud83d\udccb Pending Review</div><div class="empty"><div class="empty-icon">\u2705</div>No packages awaiting review.</div></div>`;
  }

  // Returned
  if (returned.length) {
    h += `<div class="card"><div class="card-title" style="color:var(--orange)">\ud83d\udd04 Returned (${returned.length})</div>`;
    returned.forEach(s => {
      const flagged = s.lineItemReviews ? Object.values(s.lineItemReviews).filter(r => r.status === 'needs_fix').length : 0;
      h += `<div style="border:1px solid rgba(251,191,36,0.2);border-radius:10px;padding:12px;margin-bottom:8px">
        <strong>${s.monthLabel}</strong> by ${s.createdByName} \u2014 <span style="color:var(--orange)">${flagged} flagged</span>
        <span style="color:var(--slate5);font-size:11px;float:right">${s.returnedAt ? new Date(s.returnedAt).toLocaleDateString() : ''}</span>
      </div>`;
    });
    h += `</div>`;
  }

  // Approved
  if (approved.length) {
    h += `<div class="card"><div class="card-title">\u2705 Approved (${approved.length})</div>`;
    approved.forEach(s => {
      h += `<div style="border:1px solid rgba(52,211,153,0.2);border-radius:10px;padding:12px;margin-bottom:8px;background:rgba(52,211,153,0.03)">
        <strong>${s.monthLabel}</strong> by ${s.createdByName} \u2014 <span style="color:var(--green)">${s.itemCount} items \u2022 ${fmt(s.totalA14)} tCO\u2082eq</span>
        <span style="color:var(--slate5);font-size:11px;float:right">${s.approvedAt ? new Date(s.approvedAt).toLocaleDateString() : ''}</span>
      </div>`;
    });
    h += `</div>`;
  }

  el.innerHTML = h;
}

// --- SUBMIT MONTHLY PACKAGE ---
async function submitMonthlyPackage(monthKey, btn) {
  if (!confirm('Submit all draft entries for this month as a package? They will be locked for review.')) return;
  btn.disabled = true; btn.textContent = 'Submitting...';
  try {
    const result = await DB.submitPackage(monthKey);
    // Update local state
    state.entries.forEach(e => {
      if (e.monthKey === monthKey && e.status === 'draft' && e.createdByUid === state.uid) {
        e.status = 'submitted'; e.submissionId = result.submission.id; e.locked = true;
      }
    });
    state.submissions.push(result.submission);
    buildSidebar();
    // Send notification (fire and forget)
    DB.sendSubmissionNotification(result.submission.id, 'submitted');
    navigate('approvals');
  } catch (e) {
    alert(e.message || 'Failed to submit package.');
    btn.disabled = false; btn.textContent = '\ud83d\udce6 Submit Monthly Package';
  }
}

// --- RESUBMIT PACKAGE ---
async function resubmitPackage(subId, btn) {
  if (!confirm('Resubmit this package for review?')) return;
  btn.disabled = true; btn.textContent = 'Resubmitting...';
  try {
    await DB.resubmitPackage(subId);
    // Refresh data
    state.submissions = await DB.getSubmissions();
    state.entries = await DB.getEntries();
    buildSidebar();
    DB.sendSubmissionNotification(subId, 'submitted');
    navigate('approvals');
  } catch (e) {
    alert(e.message || 'Failed to resubmit.');
    btn.disabled = false; btn.textContent = '\ud83d\udce6 Resubmit';
  }
}

// --- EXPAND SUBMISSION DETAILS (Contractor — returned packages) ---
async function expandSubmission(subId, btn) {
  const el = $('subDetail_' + subId);
  if (!el) return;
  if (el.innerHTML) { el.innerHTML = ''; btn.textContent = '\u25bc Details'; return; }
  btn.textContent = 'Loading...';
  try {
    const data = await DB.getSubmission(subId);
    const sub = data.submission;
    const entries = data.entries;
    const reviews = sub.lineItemReviews || {};

    let rows = '';
    entries.forEach(e => {
      const rev = reviews[e.id];
      const flagged = rev && rev.status === 'needs_fix';
      const rowStyle = flagged ? 'background:rgba(251,191,36,0.06);' : '';
      rows += `<tr style="${rowStyle}">
        <td>${e.category}</td><td>${e.type}</td><td class="r mono">${fmtI(e.qty)}</td>
        <td class="r mono">${fmt(e.a13B)}</td><td class="r mono">${fmt(e.a13A)}</td><td class="r mono">${fmt(e.a14)}</td>
        <td>${flagged ? '<span class="badge rejected">needs fix</span>' : '<span class="badge approved">ok</span>'}</td>
        <td>${flagged ? `<span style="color:var(--orange);font-size:11px">${rev.reason}</span>` : ''}</td>
        <td>${flagged ? `<button class="btn btn-secondary btn-sm" onclick="editFlaggedEntry(${e.id},'${subId}')">Edit</button>` : ''}</td>
      </tr>`;
    });

    el.innerHTML = `<div style="margin-top:12px"><div class="tbl-wrap"><table>
      <thead><tr><th>Material</th><th>Type</th><th class="r">Qty</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">Total</th><th>Status</th><th>Reason</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
    btn.textContent = '\u25b2 Hide';
  } catch (e) {
    el.innerHTML = `<div style="color:var(--red);padding:8px;font-size:12px">${e.message || 'Failed to load details.'}</div>`;
    btn.textContent = '\u25bc Details';
  }
}

// --- EDIT FLAGGED ENTRY (Contractor correction) ---
async function editFlaggedEntry(entryId, subId) {
  const entry = state.entries.find(e => e.id === entryId);
  if (!entry) { alert('Entry not found.'); return; }

  const m = MATERIALS[entry.category];
  if (!m) { alert('Unknown material category.'); return; }

  const newQty = prompt('Quantity (' + m.unit + '):', entry.qty);
  if (newQty === null) return;
  const q = parseFloat(newQty);
  if (isNaN(q) || q <= 0) { alert('Invalid quantity.'); return; }

  const newActual = prompt('Actual GWP/EPD (' + m.efUnit + '):', entry.actual);
  if (newActual === null) return;
  const a = parseFloat(newActual);
  if (isNaN(a) || a <= 0) { alert('Invalid actual GWP.'); return; }

  const rd = parseFloat(prompt('Road km:', entry.road || 0)) || 0;
  const se = parseFloat(prompt('Sea km:', entry.sea || 0)) || 0;
  const tr = parseFloat(prompt('Train km:', entry.train || 0)) || 0;
  const notes = prompt('Notes:', entry.notes || '') || '';

  // Recalculate
  const mass = q * m.massFactor;
  const b = (q * entry.baseline) / 1000;
  const ac = (q * a) / 1000;
  const a4 = (mass * rd * TEF.road + mass * se * TEF.sea + mass * tr * TEF.train) / 1000;

  const updated = { ...entry, qty: q, actual: a, road: rd, sea: se, train: tr, notes: notes,
    a13B: b, a13A: ac, a4: a4, a14: ac + a4, pct: b > 0 ? ((b - ac) / b) * 100 : 0 };

  try {
    await DB.editEntry(updated);
    // Update local state
    const idx = state.entries.findIndex(e => e.id === entryId);
    if (idx !== -1) Object.assign(state.entries[idx], updated);
    alert('Entry updated. You can now resubmit the package.');
    // Refresh the expanded detail view
    const detailEl = $('subDetail_' + subId);
    if (detailEl) { detailEl.innerHTML = ''; expandSubmission(subId, detailEl.parentElement.querySelector('.btn-secondary')); }
  } catch (e) {
    alert(e.message || 'Failed to save edit.');
  }
}

// --- EXPAND REVIEW (Reviewer — line item review form) ---
async function expandReview(subId, btn) {
  const el = $('reviewDetail_' + subId);
  if (!el) return;
  if (el.innerHTML) { el.innerHTML = ''; btn.textContent = '\ud83d\udd0d Review Package'; return; }
  btn.textContent = 'Loading...';
  try {
    const data = await DB.getSubmission(subId);
    _expandedSub = subId;
    _expandedEntries = data.entries;

    let rows = '';
    data.entries.forEach(e => {
      rows += `<tr>
        <td>${e.category}</td><td>${e.type}</td><td class="r mono">${fmtI(e.qty)}</td>
        <td class="r mono">${fmt(e.a13B)}</td><td class="r mono">${fmt(e.a13A)}</td><td class="r mono">${fmt(e.a14)}</td>
        <td class="r mono" style="color:${e.pct > 20 ? 'var(--green)' : 'var(--orange)'}">${fmt(e.pct)}%</td>
        <td>${e.notes || '\u2014'}</td>
        <td><input type="checkbox" class="rev-check" data-id="${e.id}" onchange="toggleReviewReason(this)"></td>
        <td><input type="text" class="rev-reason" data-id="${e.id}" placeholder="Reason..." style="width:100%;display:none;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg3);color:var(--text1);font-size:11px"></td>
      </tr>`;
    });

    el.innerHTML = `<div style="margin-top:16px">
      <div class="tbl-wrap"><table>
        <thead><tr><th>Material</th><th>Type</th><th class="r">Qty</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">Total</th><th class="r">Red%</th><th>Notes</th><th style="width:30px">Flag</th><th>Reason</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-approve" onclick="approveSubmission('${subId}',this)">\u2713 Approve Package</button>
        <button class="btn btn-danger" onclick="returnSubmission('${subId}',this)">\u2715 Return with Feedback</button>
      </div>
    </div>`;
    btn.textContent = '\u25b2 Close';
  } catch (e) {
    el.innerHTML = `<div style="color:var(--red);padding:8px;font-size:12px">${e.message || 'Failed to load.'}</div>`;
    btn.textContent = '\ud83d\udd0d Review Package';
  }
}

function toggleReviewReason(cb) {
  const id = cb.getAttribute('data-id');
  const reason = cb.closest('tr').querySelector('.rev-reason[data-id="' + id + '"]');
  if (reason) reason.style.display = cb.checked ? 'block' : 'none';
}

// --- APPROVE SUBMISSION ---
async function approveSubmission(subId, btn) {
  if (!confirm('Approve this entire monthly package?')) return;
  btn.disabled = true; btn.textContent = 'Approving...';
  try {
    await DB.reviewSubmission(subId, 'approve', null);
    state.submissions = await DB.getSubmissions();
    state.entries = await DB.getEntries();
    buildSidebar();
    DB.sendSubmissionNotification(subId, 'approved');
    navigate('approvals');
  } catch (e) {
    alert(e.message || 'Failed to approve.');
    btn.disabled = false; btn.textContent = '\u2713 Approve Package';
  }
}

// --- RETURN SUBMISSION ---
async function returnSubmission(subId, btn) {
  // Collect line item reviews
  const el = $('reviewDetail_' + subId);
  if (!el) return;

  const checks = el.querySelectorAll('.rev-check');
  const lineItemReviews = {};
  let flaggedCount = 0;

  checks.forEach(cb => {
    const id = cb.getAttribute('data-id');
    if (cb.checked) {
      const reasonEl = el.querySelector('.rev-reason[data-id="' + id + '"]');
      const reason = reasonEl ? reasonEl.value.trim() : '';
      if (!reason) { alert('Please provide a reason for each flagged item.'); return; }
      lineItemReviews[id] = { status: 'needs_fix', reason: reason };
      flaggedCount++;
    } else {
      lineItemReviews[id] = { status: 'ok' };
    }
  });

  if (flaggedCount === 0) { alert('Flag at least one item as needs_fix before returning.'); return; }

  // Validate all flagged have reasons
  for (const [id, rev] of Object.entries(lineItemReviews)) {
    if (rev.status === 'needs_fix' && (!rev.reason || !rev.reason.trim())) {
      alert('Please provide a reason for all flagged items.');
      return;
    }
  }

  if (!confirm('Return this package with ' + flaggedCount + ' flagged item(s)?')) return;
  btn.disabled = true; btn.textContent = 'Returning...';
  try {
    await DB.reviewSubmission(subId, 'return', lineItemReviews);
    state.submissions = await DB.getSubmissions();
    state.entries = await DB.getEntries();
    buildSidebar();
    DB.sendSubmissionNotification(subId, 'returned');
    navigate('approvals');
  } catch (e) {
    alert(e.message || 'Failed to return submission.');
    btn.disabled = false; btn.textContent = '\u2715 Return with Feedback';
  }
}

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
      <div class="form-row c3">
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
          <label>Message (optional)</label>
          <input id="invMsg" placeholder="Welcome to the project..." />
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="sendInvitation()">✉️ Send Invitation</button>
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

  // Load invitations
  if (canInvite) loadInvitations();
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
    if (status === 'pending' || status === 'expired') {
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
      '<td style="color:' + (expired ? 'var(--red)' : 'var(--slate5)') + ';font-size:11px">' + (inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : '—') + '</td>' +
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

  if (!email) { showError('invError', 'Please enter an email address.'); return; }
  if (!role) { showError('invError', 'Please select a role.'); return; }

  try {
    // Create invitation
    const result = await DB.createInvitation(email, role, message);

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

// ===== INTEGRATIONS =====
function renderIntegrations(el){
  const apis=[{i:"\ud83d\udd17",n:"EPD Hub API",d:"Auto-fetch emission factors"},{i:"\ud83d\udcca",n:"EC3 / Building Transparency",d:"Material carbon benchmarks"},{i:"\ud83c\udf10",n:"One Click LCA",d:"Whole-building LCA sync"},{i:"\ud83d\udce1",n:"IEA Data API",d:"Grid emission factors by region"},{i:"\ud83d\udcc1",n:"Power BI Export",d:"Advanced analytics export"},{i:"\ud83d\udd10",n:"KSIA Portal",d:"Project management sync"},{i:"\u2601\ufe0f",n:"Firebase Cloud DB",d:"Real-time cloud database",on:dbConnected},{i:"\ud83d\udce7",n:"Email Notifications",d:"Stakeholder alerts"}];
  el.innerHTML=`<div class="card"><div class="card-title">Integration Hub</div>${apis.map(a=>`<div class="api-item"><div class="api-left"><span class="api-icon">${a.i}</span><div><div class="api-name">${a.n}</div><div class="api-desc">${a.d}</div></div></div><div class="toggle${a.on?' on':''}" onclick="this.classList.toggle('on')"></div></div>`).join('')}</div>
  <div class="card"><div class="card-title">Database Status</div><div style="padding:16px;background:var(--bg3);border-radius:10px;font-size:13px"><strong style="color:${dbConnected?'var(--green)':'var(--red)'}">●</strong> ${dbConnected?'Connected to Firebase Cloud Database \u2014 data syncs in real-time across all users':'Running in offline mode \u2014 data saved locally. Connect Firebase for cloud sync.'}<br><br><span style="color:var(--slate5);font-size:11px">Database: Firebase Realtime DB | Project: KSIA | Path: /projects/ksia/</span></div></div>`;
}
