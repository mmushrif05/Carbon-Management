// ===== DASHBOARD =====
function renderDashboard(el) {
  const projects = state.projects || [];
  if (projects.length > 0) {
    renderPortfolioDashboard(el, projects);
  } else {
    renderClassicDashboard(el);
  }
}

// ===== CHART HELPERS =====
const MATCOLS={Concrete:'var(--slate4)',Steel:'var(--blue)',Asphalt:'var(--orange)',Aluminum:'var(--purple)',Glass:'var(--cyan)',Earth_Work:'#a3e635',Subgrade:'#facc15',Pipes:'var(--yellow)'};

function buildLineChart(entries, chartId, compact) {
  const mMap={};entries.forEach(e=>{const k=e.monthKey;if(!mMap[k])mMap[k]={b:0,a:0,l:e.monthLabel};mMap[k].b+=e.a13B||0;mMap[k].a+=e.a13A||0;});
  const mArr=Object.entries(mMap).sort((a,b)=>a[0].localeCompare(b[0]));
  if(!mArr.length) return '<div class="empty" style="padding:12px"><div style="font-size:10px;color:var(--slate5)">No entries yet</div></div>';
  const h=compact?100:180, w=compact?280:480, pad=compact?30:40, padR=compact?10:16, padB=compact?22:28;
  const plotW=w-pad-padR, plotH=h-padB-10;
  const mx=Math.max(...mArr.map(([k,v])=>Math.max(v.b,v.a)),1);
  const pts=mArr.map(([k,v],i)=>{
    const x=pad+(mArr.length===1?plotW/2:i/(mArr.length-1)*plotW);
    return {x, yB:10+plotH-(v.b/mx)*plotH, yA:10+plotH-(v.a/mx)*plotH, l:v.l};
  });
  const lineB=pts.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+','+p.yB.toFixed(1)).join(' ');
  const lineA=pts.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+','+p.yA.toFixed(1)).join(' ');
  const areaA='M'+pts[0].x.toFixed(1)+','+(10+plotH)+' '+pts.map(p=>'L'+p.x.toFixed(1)+','+p.yA.toFixed(1)).join(' ')+' L'+pts[pts.length-1].x.toFixed(1)+','+(10+plotH)+' Z';
  const gridCount=compact?3:4;
  let gridLines='';
  for(let i=0;i<=gridCount;i++){
    const y=10+plotH-i/gridCount*plotH;const val=(mx*i/gridCount);
    gridLines+=`<line x1="${pad}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="rgba(148,163,184,0.08)" stroke-width="1"/>`;
    gridLines+=`<text x="${pad-4}" y="${y+3}" fill="rgba(148,163,184,0.4)" font-size="${compact?7:8}" text-anchor="end" font-family="system-ui">${val>=1000?(val/1000).toFixed(1)+'k':Math.round(val)}</text>`;
  }
  const dotsB=pts.map(p=>`<circle cx="${p.x}" cy="${p.yB}" r="${compact?2.5:3.5}" fill="rgba(148,163,184,0.6)" stroke="var(--bg2)" stroke-width="1.5"/>`).join('');
  const dotsA=pts.map(p=>`<circle cx="${p.x}" cy="${p.yA}" r="${compact?2.5:3.5}" fill="rgba(96,165,250,0.9)" stroke="var(--bg2)" stroke-width="1.5"/>`).join('');
  const labels=pts.map(p=>`<text x="${p.x}" y="${h-4}" fill="rgba(148,163,184,0.5)" font-size="${compact?7:9}" text-anchor="middle" font-family="system-ui">${p.l}</text>`).join('');
  return `<div id="${chartId}"><svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;overflow:visible">
    ${gridLines}<path d="${areaA}" fill="rgba(96,165,250,0.07)"/>
    <path d="${lineB}" fill="none" stroke="rgba(148,163,184,0.35)" stroke-width="${compact?1.5:2}" stroke-dasharray="4 3"/>
    <path d="${lineA}" fill="none" stroke="rgba(96,165,250,0.8)" stroke-width="${compact?1.5:2.5}" stroke-linecap="round" stroke-linejoin="round"/>
    ${dotsB}${dotsA}${labels}</svg></div>
  ${compact?'':'<div class="chart-legend" style="margin-top:6px"><span><span class="chart-legend-dot" style="background:rgba(148,163,184,0.4)"></span> BAU Baseline</span><span><span class="chart-legend-dot" style="background:rgba(96,165,250,0.8)"></span> Actual</span></div>'}`;
}

function buildMiniSparkline(entries) {
  const mMap={};entries.forEach(e=>{const k=e.monthKey;if(!mMap[k])mMap[k]={a:0};mMap[k].a+=e.a13A||0;});
  const mArr=Object.entries(mMap).sort((a,b)=>a[0].localeCompare(b[0]));
  if(!mArr.length) return '<svg viewBox="0 0 48 16" style="width:48px;height:16px"><line x1="0" y1="8" x2="48" y2="8" stroke="rgba(148,163,184,0.15)" stroke-width="1"/></svg>';
  const vals=mArr.map(([k,v])=>v.a);const mx=Math.max(...vals,1);
  const pts=vals.map((v,i)=>{const x=vals.length===1?24:i/(vals.length-1)*44+2;const y=14-(v/mx)*12;return `${x},${y}`;});
  return `<svg viewBox="0 0 48 16" style="width:48px;height:16px">
    <polyline points="${pts.join(' ')}" fill="none" stroke="rgba(96,165,250,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.length===1?`<circle cx="${pts[0].split(',')[0]}" cy="${pts[0].split(',')[1]}" r="2" fill="rgba(96,165,250,0.9)"/>`:''}
  </svg>`;
}

function buildDonutChart(entries, svgId, legendId) {
  const matB={};entries.forEach(e=>{if(!matB[e.category])matB[e.category]={b:0,a:0};matB[e.category].b+=e.a13B||0;matB[e.category].a+=e.a13A||0;});
  if(!Object.keys(matB).length) return '<div class="empty" style="padding:20px"><div class="empty-icon">\ud83e\uddf1</div>No data yet</div>';
  return `<div class="donut-wrap"><svg class="donut-svg" viewBox="0 0 140 140" id="${svgId}"></svg><div class="donut-legend" id="${legendId}"></div></div>`;
}

function renderDonutSvg(entries, svgId, legendId) {
  const matB={};entries.forEach(e=>{if(!matB[e.category])matB[e.category]={b:0,a:0};matB[e.category].b+=e.a13B||0;matB[e.category].a+=e.a13A||0;});
  const svgEl=$(svgId),lgEl=$(legendId);if(!svgEl||!Object.keys(matB).length)return;
  const tot=Object.values(matB).reduce((s,v)=>s+v.a,0)||1;let ang=0,sh='',lh='';
  Object.entries(matB).forEach(([c,v])=>{const p=v.a/tot;const a1=ang;ang+=p*360;const lg=p>.5?1:0;const r=55,cx=70,cy=70;const x1=cx+r*Math.cos((a1-90)*Math.PI/180),y1=cy+r*Math.sin((a1-90)*Math.PI/180);const x2=cx+r*Math.cos((ang-90)*Math.PI/180),y2=cy+r*Math.sin((ang-90)*Math.PI/180);const cl=MATCOLS[c]||'var(--slate4)';if(p>.001)sh+=`<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${lg},1 ${x2},${y2} Z" fill="${cl}" opacity="0.7" stroke="var(--bg2)" stroke-width="1.5"/>`;lh+=`<div class="donut-legend-item"><div class="donut-legend-dot" style="background:${cl}"></div>${c}: ${fmt(v.a)} tCO\u2082 (${(p*100).toFixed(1)}%)</div>`;});
  svgEl.innerHTML=sh;if(lgEl)lgEl.innerHTML=lh;
}

function buildReductionGauge(actual, baseline, target) {
  const pct = baseline > 0 ? ((baseline - actual) / baseline) * 100 : 0;
  const meetsTarget = pct >= target;
  const gaugeColor = meetsTarget ? 'var(--green)' : pct >= target * 0.5 ? 'var(--orange)' : 'var(--red)';
  const gaugeWidth = Math.min(Math.max(pct, 0), 100);
  return `<div style="position:relative;background:var(--bg3);border-radius:8px;height:28px;overflow:hidden;margin:8px 0">
    <div style="height:100%;width:${gaugeWidth}%;background:${gaugeColor};opacity:0.3;border-radius:8px;transition:width 0.5s"></div>
    <div style="position:absolute;left:${target}%;top:0;bottom:0;width:2px;background:var(--red);z-index:2" title="Target: ${target}%"></div>
    <div style="position:absolute;left:${Math.max(target-4,0)}%;top:-2px;font-size:8px;color:var(--red);font-weight:700;z-index:3">${target}%</div>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${gaugeColor};z-index:1">${fmt(pct)}% reduction</div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--slate5)">
    <span>BAU: ${fmt(baseline)} tCO\u2082</span>
    <span style="color:${gaugeColor};font-weight:700">${meetsTarget ? 'Target Met' : 'Below Target'}</span>
    <span>Actual: ${fmt(actual)} tCO\u2082</span>
  </div>`;
}

function toggleProjectDetail(idx) {
  const el = $('projDetail'+idx);const btn = $('projToggle'+idx);if (!el) return;
  const hidden = el.style.display === 'none';el.style.display = hidden ? 'block' : 'none';
  if (btn) btn.textContent = hidden ? 'Hide Entries \u25B2' : 'View Entries \u25BC';
}

// ===== COLOR HELPERS =====
function _rc(pct, t) { return pct >= t ? 'var(--green)' : pct >= t*0.5 ? 'var(--orange)' : 'var(--red)'; }
function _rbg(pct, t) { return pct >= t ? 'rgba(52,211,153,0.08)' : pct >= t*0.5 ? 'rgba(251,146,60,0.08)' : 'rgba(248,113,113,0.08)'; }

// ===== DASHBOARD FILTER STATE =====
let _dashFilter = { sort: 'worst', search: '' };
function dashSetSort(v) { _dashFilter.sort = v; navigate('dashboard'); }
function dashSearch(v) { _dashFilter.search = v; navigate('dashboard'); }

// ===== AGGREGATION HELPERS =====
function _aggContractors(entries) {
  const m={};entries.forEach(e=>{const k=e.organizationId||e.submittedByUid||'unk';if(!m[k])m[k]={name:e.organizationName||e.submittedBy||'Unknown',b:0,a:0,n:0};m[k].b+=e.a13B||0;m[k].a+=e.a13A||0;m[k].n++;});
  return Object.values(m).filter(o=>o.n>0).map(o=>({...o,pct:o.b>0?((o.b-o.a)/o.b)*100:0})).sort((a,b)=>a.pct-b.pct);
}
function _aggMaterials(entries) {
  const m={};entries.forEach(e=>{const c=e.category||'Other';if(!m[c])m[c]={name:c,b:0,a:0,n:0};m[c].b+=e.a13B||0;m[c].a+=e.a13A||0;m[c].n++;});
  return Object.values(m).sort((a,b)=>b.a-a.a);
}

// ===== BOTTOM SHEET MODAL (Apple-style, tabbed) =====
function openProjectModal(idx, opts) {
  opts = opts || {};
  const projects = state.projects || [];
  const p = projects[idx]; if (!p) return;
  const d = state.entries || [];
  const a5e = state.a5entries || [];
  const pa = state.projectAssignments || [];
  const target = state.reductionTarget || 20;
  const r = state.role;
  // Role scoping: contractor sees only own org entries
  let pe, pa5;
  if (r === 'contractor' && state.organizationId) {
    pe = d.filter(e => e.projectId === p.id && e.organizationId === state.organizationId);
    pa5 = a5e.filter(e => e.projectId === p.id && e.organizationId === state.organizationId);
  } else {
    pe = d.filter(e => e.projectId === p.id);
    pa5 = a5e.filter(e => e.projectId === p.id);
  }
  const pAsgn = pa.filter(a => a.projectId === p.id);
  const pOrgLinks = (state.projectOrgLinks || []).filter(l => l.projectId === p.id);
  const pConsOrgs = pOrgLinks.filter(l => l.orgType === 'consultant_firm');
  let pB=0,pA=0,pA4=0; pe.forEach(e=>{pB+=e.a13B||0;pA+=e.a13A||0;pA4+=e.a4||0;});
  let pA5=0; pa5.forEach(e=>{pA5+=e.emission||0;});
  const pRed=pB>0?((pB-pA)/pB)*100:0, pTotal=pA+pA4+pA5, pSav=Math.max(pB-pA,0);
  const rc=_rc(pRed,target);
  const consC=pAsgn.filter(a=>a.userRole==='consultant').length;
  const contC=pAsgn.filter(a=>a.userRole==='contractor').length;
  const contractors=_aggContractors(pe);
  const materials=_aggMaterials(pe);
  const activeTab = opts.tab || 'overview';
  const svgId='mSvg'+idx, lgId='mLg'+idx;

  // Remove old
  const old=document.getElementById('projectModalOverlay'); if(old)old.remove();
  const ov=document.createElement('div');ov.id='projectModalOverlay';ov.className='pm-overlay';

  // --- TAB: Overview ---
  const tabOv=`<div class="pm-tab-pane" data-tab="overview" style="display:${activeTab==='overview'?'block':'none'}">
    <div class="stats-row" style="margin-bottom:10px;grid-template-columns:repeat(5,1fr)">
      <div class="stat-card slate" style="padding:8px 10px"><div class="sc-label" style="font-size:9px">BAU Baseline</div><div class="sc-value" style="font-size:16px">${fmt(pB)}</div><div class="sc-sub">tCO\u2082eq</div></div>
      <div class="stat-card blue" style="padding:8px 10px"><div class="sc-label" style="font-size:9px">Actual</div><div class="sc-value" style="font-size:16px">${fmt(pA)}</div><div class="sc-sub">tCO\u2082eq</div></div>
      <div class="stat-card green" style="padding:8px 10px"><div class="sc-label" style="font-size:9px">Savings</div><div class="sc-value" style="font-size:16px">${fmt(pSav)}</div><div class="sc-sub">tCO\u2082eq</div></div>
      <div class="stat-card" style="padding:8px 10px;background:${_rbg(pRed,target)};border:1px solid ${rc}22"><div class="sc-label" style="font-size:9px;color:${rc}">Reduction</div><div class="sc-value" style="font-size:16px;color:${rc}">${fmt(pRed)}%</div><div class="sc-sub" style="color:${rc}">vs ${target}%</div></div>
      <div class="stat-card orange" style="padding:8px 10px"><div class="sc-label" style="font-size:9px">A4+A5</div><div class="sc-value" style="font-size:16px">${fmt(pA4+pA5)}</div><div class="sc-sub">tCO\u2082eq</div></div>
    </div>
    ${buildReductionGauge(pA, pB, target)}
    ${pe.length>0?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px">
      <div><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">BAU vs Actual Trend</div>${buildLineChart(pe,'mLine'+idx,false)}</div>
      <div><div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Materials Mix</div>${buildDonutChart(pe,svgId,lgId)}</div>
    </div>`:'<div style="padding:24px;text-align:center;color:var(--slate5);font-size:12px">No entries yet.</div>'}
  </div>`;

  // --- TAB: Contractors ---
  const tabCon=`<div class="pm-tab-pane" data-tab="contractors" style="display:${activeTab==='contractors'?'block':'none'}">
    ${contractors.length>0?`<div class="tbl-wrap"><table>
      <thead><tr><th>Contractor</th><th class="r">Entries</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">Savings</th><th class="r">Reduction</th><th>Status</th></tr></thead>
      <tbody>${contractors.map((o,ci)=>{const ok=o.pct>=target;return`<tr style="${!ok?'background:rgba(248,113,113,0.05)':''}">
        <td style="font-weight:600">${o.name}</td><td class="r">${o.n}</td>
        <td class="r mono">${fmt(o.b)}</td><td class="r mono">${fmt(o.a)}</td>
        <td class="r mono" style="color:var(--green)">${fmt(Math.max(o.b-o.a,0))}</td>
        <td class="r mono" style="font-weight:700;color:${ok?'var(--green)':'var(--red)'}">${fmt(o.pct)}%</td>
        <td>${ok?'<span class="badge approved" style="font-size:9px">On Track</span>':'<span class="badge" style="background:rgba(248,113,113,0.15);color:var(--red);font-size:9px">Below</span>'}</td>
      </tr>`;}).join('')}</tbody></table></div>`:'<div style="padding:24px;text-align:center;color:var(--slate5);font-size:12px">No contractor data.</div>'}
  </div>`;

  // --- TAB: Materials ---
  const tabMat=`<div class="pm-tab-pane" data-tab="materials" style="display:${activeTab==='materials'?'block':'none'}">
    ${materials.length>0?`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin-bottom:12px">
      ${materials.map(m=>{const pct=m.b>0?((m.b-m.a)/m.b)*100:0;const cl=MATCOLS[m.name]||'var(--slate4)';return`<div style="padding:10px 12px;background:var(--bg3);border-radius:10px;border-left:3px solid ${cl}">
        <div style="font-size:12px;font-weight:700;color:var(--text)">${m.name.replace('_',' ')}</div>
        <div style="font-size:10px;color:var(--slate5)">${m.n} entries</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:3px">
          <div style="font-size:15px;font-weight:800;color:var(--blue)">${fmt(m.a)}</div>
          <div style="font-size:11px;font-weight:700;color:${_rc(pct,20)}">${fmt(pct)}%</div>
        </div><div style="font-size:8px;color:var(--slate5)">tCO\u2082 actual | reduction</div>
      </div>`;}).join('')}</div>
    ${buildDonutChart(pe,'matSvg'+idx,'matLg'+idx)}`:'<div style="padding:24px;text-align:center;color:var(--slate5);font-size:12px">No material data.</div>'}
  </div>`;

  // --- TAB: Contributors (raw traceability table) ---
  const sorted=[...pe].sort((a,b)=>(b.a13A||0)-(a.a13A||0));
  const isContr = r === 'contractor';
  const isAuth = r === 'consultant' || r === 'client';
  const isCons = r === 'consultant';
  const _ctbActions = (e) => {
    // === CONSULTANT/CLIENT: force-delete any entry + fix EF on suspect entries ===
    if (isAuth) {
      const blEF=e.baselineEF||e.baseline;const acEF=e.actualEF||e.actual;
      const suspect=blEF&&acEF&&blEF>0&&acEF/blEF>10;
      // If consultant and there's a pending delete request, show approve/reject + force actions
      if (isCons && e.editRequestStatus === 'pending' && e.editRequestType === 'delete' && e.editRequestId) {
        return `<td style="min-width:180px">
          <div style="font-size:9px;color:var(--orange);font-weight:700;margin-bottom:2px">DELETE REQUEST</div>
          ${e.editRequestReason?`<div style="font-size:8px;color:var(--slate5);margin-bottom:3px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(e.editRequestReason||'').replace(/"/g,'&quot;')}">${e.editRequestReason}</div>`:''}
          <div style="display:flex;gap:3px;flex-wrap:wrap">
            <button class="btn btn-sm" onclick="resolveEditRequestFromEntry('${e.id}','approved')" style="font-size:8px;padding:2px 6px;background:rgba(52,211,153,0.15);color:var(--green);border:1px solid rgba(52,211,153,0.3);font-weight:700">Approve</button>
            <button class="btn btn-sm" onclick="resolveEditRequestFromEntry('${e.id}','rejected')" style="font-size:8px;padding:2px 6px;background:rgba(248,113,113,0.15);color:var(--red);border:1px solid rgba(248,113,113,0.3);font-weight:700">Reject</button>
            <button class="btn btn-sm force-del-btn" onclick="forceDeleteEntry('${e.id}')" title="Force delete">Del</button>
          </div>
        </td>`;
      }
      // Otherwise show force-delete + fix EF (for suspect entries)
      return `<td class="force-actions">${suspect?`<button class="btn btn-sm anomaly-fix-btn" onclick="showCorrectModal('${e.id}')" title="Fix anomalous EF value">Fix EF</button>`:''}<button class="btn btn-sm force-del-btn" onclick="forceDeleteEntry('${e.id}')" title="Force delete this entry">Del</button></td>`;
    }
    // === CONTRACTOR actions — direct edit (no approval needed), delete still needs request ===
    if (!isContr) return '';
    if (e.editRequestStatus === 'pending' && e.editRequestType === 'delete') {
      return `<td><span class="badge review" style="font-size:8px">Del Requested</span></td>`;
    }
    const delBtn = e.status !== 'pending'
      ? `<button class="btn btn-sm" onclick="requestDeleteEntry('${e.id}')" style="font-size:8px;padding:2px 5px;background:rgba(248,113,113,0.12);color:var(--red);border:1px solid rgba(248,113,113,0.2);margin-left:2px" title="Request Delete">Del</button>`
      : `<button class="btn btn-sm" onclick="delEntry('${e.id}')" style="font-size:8px;padding:2px 5px;background:rgba(248,113,113,0.12);color:var(--red);border:1px solid rgba(248,113,113,0.2);margin-left:2px" title="Delete">Del</button>`;
    return `<td class="edit-req-actions"><button class="btn btn-sm" onclick="openEditEntryForm('${e.id}')" style="font-size:8px;padding:2px 5px;background:rgba(96,165,250,0.12);color:var(--blue);border:1px solid rgba(96,165,250,0.2)" title="Edit Entry">Edit</button>${delBtn}</td>`;
  };
  const tabCtb=`<div class="pm-tab-pane" data-tab="contributors" style="display:${activeTab==='contributors'?'block':'none'}">
    ${sorted.length>0?`
    <div style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <select onchange="_filterCtb(this.value,'month')" style="padding:3px 6px;font-size:10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)">
        <option value="all">All Months</option>${[...new Set(pe.map(e=>e.monthLabel))].map(m=>`<option value="${m}">${m}</option>`).join('')}
      </select>
      <select onchange="_filterCtb(this.value,'contractor')" style="padding:3px 6px;font-size:10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)">
        <option value="all">All Contractors</option>${[...new Set(pe.map(e=>e.organizationName||e.submittedBy||'Unknown'))].map(c=>`<option value="${c}">${c}</option>`).join('')}
      </select>
      <select onchange="_filterCtb(this.value,'material')" style="padding:3px 6px;font-size:10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)">
        <option value="all">All Materials</option>${[...new Set(pe.map(e=>e.category).filter(Boolean))].map(c=>`<option value="${c}">${c}</option>`).join('')}
      </select>
      <select onchange="_filterCtb(this.value,'estatus')" style="padding:3px 6px;font-size:10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)">
        <option value="all">All Statuses</option><option value="pending">Pending</option><option value="review">Review</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
      </select>
    </div>
    <div class="tbl-wrap" id="ctbTbl"><table>
      <thead><tr><th>Month</th><th>Contractor</th><th>Material</th><th>Type</th><th class="r">Qty</th><th class="r">BL EF</th><th class="r">Act EF</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">Savings</th><th class="r">Red%</th><th>EPD</th><th>Status</th>${(isContr||isAuth)?'<th>Actions</th>':''}</tr></thead>
      <tbody>${sorted.map(e=>{const pct=e.a13B>0?((e.a13B-e.a13A)/e.a13B)*100:0;const sav=Math.max((e.a13B||0)-(e.a13A||0),0);
      const blEF=e.baselineEF||e.baseline;const acEF=e.actualEF||e.actual;
      const suspect=blEF&&acEF&&blEF>0&&acEF/blEF>10;
      return`<tr data-month="${e.monthLabel||''}" data-contractor="${e.organizationName||e.submittedBy||'Unknown'}" data-material="${e.category||''}" data-estatus="${e.status||'pending'}" ${suspect?'style="background:rgba(248,113,113,0.06)"':''}>
        <td style="font-size:10px">${e.monthLabel||'--'}</td><td style="font-size:10px">${e.organizationName||e.submittedBy||'--'}</td>
        <td style="font-weight:600;font-size:10px">${e.category||'--'}</td><td style="font-size:10px">${e.type||'--'}</td>
        <td class="r mono" style="font-size:10px">${fmtI(e.qty)}</td>
        <td class="r mono" style="font-size:10px">${blEF?fmt(blEF):'--'}</td>
        <td class="r mono" style="font-size:10px${suspect?';color:var(--red)':''}">${acEF?fmt(acEF):'--'}${suspect?' !':''}</td>
        <td class="r mono" style="font-size:10px">${fmt(e.a13B)}</td><td class="r mono" style="font-size:10px">${fmt(e.a13A)}</td>
        <td class="r mono" style="font-size:10px;color:${sav>=0?'var(--green)':'var(--red)'}">${fmt(sav)}</td>
        <td class="r mono" style="font-size:10px;font-weight:700;color:${_rc(pct,target)}">${fmt(pct)}%${suspect?' !!':''}</td>
        <td style="font-size:9px;color:var(--blue)">${e.epdId||e.epdRef||'--'}</td>
        <td><span class="badge ${e.status||'pending'}" style="font-size:9px">${e.status||'pending'}</span></td>
        ${_ctbActions(e)}
      </tr>`;}).join('')}</tbody></table></div>
    ${pa5.length>0?`<div style="margin-top:10px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:4px">A5 Site (${pa5.length})</div>
    <div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Source</th><th class="r">Qty</th><th>Unit</th><th class="r">Emission</th><th>By</th></tr></thead>
    <tbody>${[...pa5].sort((a,b)=>(b.emission||0)-(a.emission||0)).map(e=>`<tr><td style="font-size:10px">${e.monthLabel||'--'}</td><td style="font-weight:600;font-size:10px">${e.source||'--'}</td><td class="r mono" style="font-size:10px">${fmtI(e.qty)}</td><td style="font-size:10px">${e.unit||'--'}</td><td class="r mono" style="font-size:10px;font-weight:700">${fmt(e.emission)}</td><td style="font-size:9px;color:var(--slate5)">${e.submittedBy||'--'}</td></tr>`).join('')}</tbody></table></div>`:''}
    `:'<div style="padding:24px;text-align:center;color:var(--slate5);font-size:12px">No entries yet. Contributors appear here when data is submitted.</div>'}
  </div>`;

  ov.innerHTML=`
    <div class="pm-sheet" id="pmSheet">
      <div class="pm-handle" onclick="closeProjectModal()"><div class="pm-handle-bar"></div></div>
      <div class="pm-close" onclick="closeProjectModal()">&times;</div>
      <div class="pm-scroll">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
          <div>
            <div style="font-size:18px;font-weight:800;color:var(--text)">${p.name}</div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:2px;flex-wrap:wrap">
              ${p.code?`<span style="font-size:10px;color:var(--blue);font-family:monospace">${p.code}</span>`:''}
              ${pConsOrgs.length>0?pConsOrgs.map(l=>`<span style="font-size:9px;padding:2px 6px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2);border-radius:4px;color:var(--green)">${l.orgName}</span>`).join(''):''}
              <span style="font-size:10px;color:var(--slate5)">${consC} cons, ${contC} contr</span>
              <span class="badge ${p.status==='active'?'approved':'review'}" style="font-size:9px;text-transform:capitalize">${p.status||'active'}</span>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:center">
            <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:${rc}">${fmt(pRed)}%</div><div style="font-size:8px;color:var(--slate5)">Reduction</div></div>
            <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:var(--blue)">${fmt(pTotal)}</div><div style="font-size:8px;color:var(--slate5)">tCO\u2082</div></div>
          </div>
        </div>
        <div class="pm-tabs">
          <button class="pm-tab ${activeTab==='overview'?'active':''}" onclick="_switchTab('overview')">Overview</button>
          <button class="pm-tab ${activeTab==='contractors'?'active':''}" onclick="_switchTab('contractors')">Contractors</button>
          <button class="pm-tab ${activeTab==='materials'?'active':''}" onclick="_switchTab('materials')">Materials</button>
          <button class="pm-tab ${activeTab==='contributors'?'active':''}" onclick="_switchTab('contributors')">Contributors</button>
          ${(r==='consultant'||r==='contractor')?`<button class="pm-tab ${activeTab==='requests'?'active':''}" onclick="_switchTab('requests')" style="color:var(--orange)">Requests${(state.editRequests||[]).filter(rq=>rq.status==='pending'&&String(rq.projectId)===String(p.id)).length>0?' <span style="background:var(--orange);color:#000;border-radius:50%;padding:0 5px;font-size:8px;font-weight:800;margin-left:3px">'+((state.editRequests||[]).filter(rq=>rq.status==='pending'&&String(rq.projectId)===String(p.id)).length)+'</span>':''}</button>`:''}
          ${r==='consultant'?`<button class="pm-tab ${activeTab==='advisor'?'active':''}" onclick="_switchTab('advisor')" style="color:var(--purple)">AI Advisor</button>`:''}
        </div>
        ${tabOv}${tabCon}${tabMat}${tabCtb}
        ${(r==='consultant'||r==='contractor')?(() => {
          const projReqs = (state.editRequests||[]).filter(rq=>String(rq.projectId)===String(p.id)).sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||(new Date(b.requestedAt)-new Date(a.requestedAt)));
          const pendingReqs = projReqs.filter(rq=>rq.status==='pending');
          const resolvedReqs = projReqs.filter(rq=>rq.status!=='pending');
          return `<div class="pm-tab-pane" data-tab="requests" style="display:${activeTab==='requests'?'block':'none'}">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(251,146,60,0.15);display:flex;align-items:center;justify-content:center;font-size:18px">&#x1F4DD;</div>
              <div>
                <div style="font-size:14px;font-weight:800;color:var(--text)">${r==='contractor'?'Your Edit / Delete Requests':'Edit / Delete Requests'}</div>
                <div style="font-size:10px;color:var(--slate5)">${r==='contractor'?'Track the status of your edit and delete requests':'Contractors request permission to edit or delete their submitted entries'}</div>
              </div>
            </div>
            ${pendingReqs.length>0?`<div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--orange);text-transform:uppercase;margin-bottom:8px">${r==='contractor'?'Awaiting Approval':'Pending Requests'} (${pendingReqs.length})</div>
            ${pendingReqs.map(rq=>{
              const origEntry = (state.entries||[]).find(e=>String(e.id)===String(rq.entryId));
              return `<div class="edit-request-card pending">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
                  <div>
                    <span class="badge ${rq.requestType==='delete'?'rejected':'review'}" style="font-size:8px;text-transform:uppercase">${rq.requestType}</span>
                    <span style="font-size:12px;font-weight:700;color:var(--text);margin-left:6px">${rq.entryCategory} \u2014 ${rq.entryType}</span>
                  </div>
                  <div style="font-size:9px;color:var(--slate5)">${rq.entryMonth||''}</div>
                </div>
                ${r==='consultant'?`<div style="font-size:11px;color:var(--slate4);margin-bottom:4px">
                  <strong>By:</strong> ${rq.requestedBy} (${rq.organizationName||'--'})
                </div>`:''}
                <div style="font-size:11px;color:var(--slate4);margin-bottom:8px">
                  <strong>Reason:</strong> ${rq.reason||'No reason provided'}
                </div>
                ${origEntry?`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px;padding:8px;background:var(--bg4);border-radius:6px">
                  <div style="text-align:center"><div style="font-size:8px;color:var(--slate5)">Qty</div><div style="font-size:11px;font-weight:700;color:var(--text)">${fmtI(origEntry.qty)}</div></div>
                  <div style="text-align:center"><div style="font-size:8px;color:var(--slate5)">Baseline</div><div style="font-size:11px;font-weight:700;color:var(--slate3)">${fmt(origEntry.a13B)}</div></div>
                  <div style="text-align:center"><div style="font-size:8px;color:var(--slate5)">Actual</div><div style="font-size:11px;font-weight:700;color:var(--blue)">${fmt(origEntry.a13A)}</div></div>
                  <div style="text-align:center"><div style="font-size:8px;color:var(--slate5)">Red%</div><div style="font-size:11px;font-weight:700;color:${_rc(origEntry.pct||0,target)}">${fmt(origEntry.pct||0)}%</div></div>
                </div>`:''}
                ${r==='consultant'?`<div style="display:flex;gap:6px;justify-content:flex-end">
                  <button class="btn btn-sm" onclick="resolveEditRequest('${rq.id}','approved')" style="background:rgba(52,211,153,0.15);color:var(--green);border:1px solid rgba(52,211,153,0.3);padding:4px 12px;font-size:10px;font-weight:700">\u2713 Approve</button>
                  <button class="btn btn-sm" onclick="resolveEditRequest('${rq.id}','rejected')" style="background:rgba(248,113,113,0.15);color:var(--red);border:1px solid rgba(248,113,113,0.3);padding:4px 12px;font-size:10px;font-weight:700">\u2715 Reject</button>
                </div>`:`<div style="display:flex;justify-content:flex-end"><span class="badge review" style="font-size:9px;padding:4px 10px">Awaiting consultant approval</span></div>`}
              </div>`;}).join('')}`
            :`<div style="padding:20px;text-align:center;color:var(--green);font-size:12px;background:rgba(52,211,153,0.05);border-radius:8px;margin-bottom:14px">${r==='contractor'?'No pending requests. Use the Edit/Del buttons in Contributors tab to request changes.':'No pending requests'}</div>`}
            ${resolvedReqs.length>0?`<div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--slate5);text-transform:uppercase;margin:14px 0 8px">History (${resolvedReqs.length})</div>
            ${resolvedReqs.slice(0,10).map(rq=>{
              const isApproved = rq.status === 'approved';
              return `<div class="edit-request-card resolved" style="opacity:0.7">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <span class="badge ${rq.requestType==='delete'?'rejected':'review'}" style="font-size:8px;text-transform:uppercase">${rq.requestType}</span>
                  <span style="font-size:11px;font-weight:600;color:var(--text);margin-left:6px">${rq.entryCategory} \u2014 ${rq.entryType}</span>
                  ${r==='consultant'?`<span style="font-size:10px;color:var(--slate5);margin-left:6px">by ${rq.requestedBy}</span>`:''}
                </div>
                <div>
                  <span class="badge ${rq.status}" style="font-size:8px">${rq.status}</span>
                  <span style="font-size:9px;color:var(--slate6);margin-left:4px">${r==='contractor'&&isApproved&&rq.requestType==='edit'?'<strong style="color:var(--green)">Ready to edit</strong>':'by '+(rq.resolvedBy||'--')}</span>
                </div>
              </div>
            </div>`;}).join('')}`:''}
          </div>`;
        })():''}
        ${r==='consultant'?`<div class="pm-tab-pane" data-tab="advisor" style="display:${activeTab==='advisor'?'block':'none'}">
          <div class="ai-advisor-panel">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(167,139,250,0.15);display:flex;align-items:center;justify-content:center;font-size:18px">&#x1F9E0;</div>
              <div>
                <div style="font-size:14px;font-weight:800;color:var(--text)">Carbon Reduction Advisor</div>
                <div style="font-size:10px;color:var(--slate5)">AI-powered analysis of emission contributors and reduction strategies</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
              <div style="padding:10px;background:var(--bg3);border-radius:8px;text-align:center">
                <div style="font-size:16px;font-weight:800;color:var(--blue)">${fmt(pTotal)}</div>
                <div style="font-size:8px;color:var(--slate5)">Total tCO\u2082</div>
              </div>
              <div style="padding:10px;background:var(--bg3);border-radius:8px;text-align:center">
                <div style="font-size:16px;font-weight:800;color:${rc}">${fmt(pRed)}%</div>
                <div style="font-size:8px;color:var(--slate5)">Current Reduction</div>
              </div>
              <div style="padding:10px;background:var(--bg3);border-radius:8px;text-align:center">
                <div style="font-size:16px;font-weight:800;color:var(--red)">${target}%</div>
                <div style="font-size:8px;color:var(--slate5)">Target</div>
              </div>
            </div>
            <div style="margin-bottom:14px">
              <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Contribution Breakdown</div>
              ${materials.map(m=>{const mPct=pA>0?(m.a/pA)*100:0;const mRed=m.b>0?((m.b-m.a)/m.b)*100:0;const cl=MATCOLS[m.name]||'var(--slate4)';return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <div style="width:80px;font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name.replace('_',' ')}</div>
                <div style="flex:1;height:16px;background:var(--bg3);border-radius:4px;overflow:hidden;position:relative">
                  <div style="height:100%;width:${Math.min(mPct,100)}%;background:${cl};opacity:0.5;border-radius:4px"></div>
                  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--text)">${fmt(mPct)}%</div>
                </div>
                <div style="font-size:10px;font-weight:700;color:${_rc(mRed,target)};width:50px;text-align:right">${fmt(mRed)}%</div>
              </div>`;}).join('')}
            </div>
            ${contractors.length>0?`<div style="margin-bottom:14px">
              <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Contractor Performance Gap</div>
              ${contractors.filter(c=>c.pct<target).map(c=>{const gap=target-c.pct;const needed=c.b>0?(c.b*target/100)-(c.b-c.a):0;return`<div style="padding:8px 10px;background:rgba(248,113,113,0.05);border:1px solid rgba(248,113,113,0.1);border-radius:8px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">
                <div><div style="font-size:11px;font-weight:700;color:var(--text)">${c.name}</div><div style="font-size:9px;color:var(--red)">Needs ${fmt(gap)}% more reduction (${fmt(Math.abs(needed))} tCO\u2082)</div></div>
                <div style="font-size:12px;font-weight:800;color:var(--red)">${fmt(c.pct)}%</div>
              </div>`;}).join('')||'<div style="font-size:11px;color:var(--green);padding:8px">All contractors meeting target</div>'}
            </div>`:''}
            <button class="btn btn-primary" onclick="runCarbonAdvisor(${idx})" id="aiAdvisorBtn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px">
              <span>&#x1F9E0;</span> Generate AI Reduction Strategy
            </button>
            <div id="aiAdvisorResult" style="margin-top:14px"></div>
          </div>
        </div>`:''}
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.setAttribute('data-proj-idx', idx);
  requestAnimationFrame(()=>{ov.classList.add('pm-visible');document.getElementById('pmSheet').classList.add('pm-sheet-visible');});
  ov.addEventListener('click',e=>{if(e.target===ov)closeProjectModal();});
  const escH=e=>{if(e.key==='Escape'){closeProjectModal();document.removeEventListener('keydown',escH);}};
  document.addEventListener('keydown',escH);
  setTimeout(()=>{renderDonutSvg(pe,svgId,lgId);renderDonutSvg(pe,'matSvg'+idx,'matLg'+idx);},60);
}

let _reqTabRefreshing = false;
function _switchTab(tab) {
  document.querySelectorAll('.pm-tab-pane').forEach(el=>{el.style.display=el.getAttribute('data-tab')===tab?'block':'none';});
  const tabMap={'Overview':'overview','Contractors':'contractors','Materials':'materials','Contributors':'contributors','AI Advisor':'advisor','Requests':'requests'};
  document.querySelectorAll('.pm-tab').forEach(btn=>{const txt=btn.textContent.trim().replace(/\s*\d+$/,'');btn.classList.toggle('active',(tabMap[txt]||txt.toLowerCase())===tab);});
  // Refresh edit requests from server when switching to Requests tab
  if (tab === 'requests' && !_reqTabRefreshing) {
    _reqTabRefreshing = true;
    DB.getEditRequests().then(reqs => {
      state.editRequests = reqs;
      const modalEl = document.getElementById('projectModalOverlay');
      if (modalEl) {
        const projIdx = modalEl.getAttribute('data-proj-idx');
        if (projIdx !== null) openProjectModal(parseInt(projIdx), {tab:'requests'});
      }
    }).catch(() => {}).finally(() => { _reqTabRefreshing = false; });
  }
}

function _filterCtb(val, field) {
  const tbl=document.getElementById('ctbTbl');if(!tbl)return;
  tbl.querySelectorAll('tbody tr').forEach(row=>{row.style.display=(val==='all'||row.getAttribute('data-'+field)===val)?'':'none';});
}

function closeProjectModal() {
  const ov=document.getElementById('projectModalOverlay');if(!ov)return;
  const sh=document.getElementById('pmSheet');if(sh)sh.classList.remove('pm-sheet-visible');
  ov.classList.remove('pm-visible');setTimeout(()=>ov.remove(),350);
}

// ===== AI CARBON REDUCTION ADVISOR =====
async function runCarbonAdvisor(idx) {
  const btn = document.getElementById('aiAdvisorBtn');
  const resultEl = document.getElementById('aiAdvisorResult');
  if (!btn || !resultEl) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner" style="width:16px;height:16px;border-width:2px;display:inline-block"></span> Analyzing with AI...';
  resultEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--slate5);font-size:11px">Generating reduction strategy... This may take 15-20 seconds.</div>';

  const projects = state.projects || [];
  const p = projects[idx]; if (!p) { resultEl.innerHTML = '<div style="color:var(--red)">Project not found.</div>'; return; }
  const pe = (state.entries || []).filter(e => e.projectId === p.id);
  const pa5 = (state.a5entries || []).filter(e => e.projectId === p.id);
  const target = state.reductionTarget || 20;

  // Build analysis payload
  const contractors = _aggContractors(pe);
  const materials = _aggMaterials(pe);
  let tB=0,tA=0; pe.forEach(e=>{tB+=e.a13B||0;tA+=e.a13A||0;});
  let a5T=0; pa5.forEach(e=>{a5T+=e.emission||0;});
  const reduction = tB>0?((tB-tA)/tB)*100:0;

  const payload = {
    project: { name: p.name, code: p.code || '' },
    target,
    totals: { baseline: tB, actual: tA, a5: a5T, reduction: +reduction.toFixed(2) },
    materials: materials.map(m => ({ name: m.name, baseline: m.b, actual: m.a, entries: m.n, reduction: m.b>0?+((m.b-m.a)/m.b*100).toFixed(2):0 })),
    contractors: contractors.map(c => ({ name: c.name, baseline: c.b, actual: c.a, entries: c.n, reduction: +c.pct.toFixed(2) }))
  };

  try {
    const res = await apiCall('/carbon-advisor', { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) { const err = await res.text(); throw new Error(err); }
    const data = await safeJsonParse(res);
    if (!data.analysis) throw new Error('No analysis returned');

    // Render AI response
    resultEl.innerHTML = `<div class="ai-result-card">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--purple);text-transform:uppercase;margin-bottom:8px">AI Analysis Results</div>
      <div class="ai-result-body">${_renderAdvisorMarkdown(data.analysis)}</div>
      <div style="font-size:8px;color:var(--slate6);margin-top:10px;text-align:right">Powered by Claude AI</div>
    </div>`;
  } catch (e) {
    resultEl.innerHTML = `<div style="padding:12px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:8px;color:var(--red);font-size:11px">Analysis failed: ${e.message||'Unknown error'}. Please try again.</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>&#x1F9E0;</span> Generate AI Reduction Strategy';
  }
}

function _renderAdvisorMarkdown(text) {
  return text
    .replace(/###\s*(.+)/g, '<div style="font-size:13px;font-weight:800;color:var(--text);margin:14px 0 6px">$1</div>')
    .replace(/##\s*(.+)/g, '<div style="font-size:14px;font-weight:800;color:var(--green);margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border2)">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
    .replace(/\n- /g, '\n<div style="display:flex;gap:6px;margin:3px 0;font-size:11px;color:var(--slate3)"><span style="color:var(--green);flex-shrink:0">&#x2022;</span><span>')
    .replace(/\n(?=<div style="display:flex)/g, '</span></div>\n')
    .replace(/\n/g, '<br>')
    .replace(/([\d.]+%)/g, '<span style="font-weight:700;color:var(--blue)">$1</span>')
    .replace(/([\d,.]+\s*tCO)/g, '<span style="font-weight:700">$1</span>');
}

function buildEntryTable(entries, a5entries) {
  const sorted=[...entries].sort((a,b)=>(b.a13A||0)-(a.a13A||0));let html='';
  const target=state.reductionTarget||20;
  if(sorted.length>0){
    const byCat={};sorted.forEach(e=>{if(!byCat[e.category])byCat[e.category]={b:0,a:0,count:0};byCat[e.category].b+=e.a13B||0;byCat[e.category].a+=e.a13A||0;byCat[e.category].count++;});
    const catArr=Object.entries(byCat).sort((a,b)=>b[1].a-a[1].a);
    html+=`<div style="margin-bottom:14px"><div style="font-size:12px;font-weight:700;color:var(--slate4);margin-bottom:6px">Top Carbon Contributors</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${catArr.map(([cat,v])=>{const pct=v.b>0?((v.b-v.a)/v.b)*100:0;const cl=MATCOLS[cat]||'var(--slate4)';
      return`<div style="padding:8px 14px;background:var(--bg3);border-radius:10px;border-left:3px solid ${cl};min-width:140px">
        <div style="font-size:13px;font-weight:700;color:var(--slate3)">${cat.replace('_',' ')}</div>
        <div style="font-size:11px;color:var(--slate5)">${v.count} entries</div>
        <div style="font-size:14px;font-weight:800;color:var(--blue);margin-top:2px">${fmt(v.a)} tCO\u2082</div>
        <div style="font-size:10px;color:${_rc(pct,target)};font-weight:600">${fmt(pct)}% reduction</div>
      </div>`;}).join('')}</div></div>`;
    html+=`<div style="font-size:12px;font-weight:700;color:var(--slate4);margin-bottom:6px">All Entries (${sorted.length})</div>
    <div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Material</th><th>Type</th><th class="r">Qty</th><th class="r">BL EF</th><th class="r">Act EF</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">A4</th><th class="r">Total</th><th class="r">Red%</th><th>By</th><th>Org</th><th>Status</th></tr></thead>
    <tbody>${sorted.map(e=>{const pct=e.a13B>0?((e.a13B-e.a13A)/e.a13B)*100:0;const blEF=e.baselineEF||e.baseline;const acEF=e.actualEF||e.actual;const suspect=blEF&&acEF&&blEF>0&&acEF/blEF>10;return`<tr${suspect?' style="background:rgba(248,113,113,0.06)"':''}>
      <td style="font-size:11px">${e.monthLabel||'--'}</td><td style="font-weight:600">${e.category||'--'}</td><td style="font-size:11px">${e.type||'--'}</td>
      <td class="r mono" style="font-size:11px">${fmtI(e.qty)}</td>
      <td class="r mono" style="font-size:11px">${blEF?fmt(blEF):'--'}</td>
      <td class="r mono" style="font-size:11px${suspect?';color:var(--red)':''}">${acEF?fmt(acEF):'--'}${suspect?' !':''}</td>
      <td class="r mono" style="font-size:11px">${fmt(e.a13B)}</td><td class="r mono" style="font-size:11px">${fmt(e.a13A)}</td>
      <td class="r mono" style="font-size:11px">${fmt(e.a4)}</td><td class="r mono" style="font-size:11px;font-weight:700">${fmt(e.a14)}</td>
      <td class="r mono" style="font-size:11px;font-weight:700;color:${_rc(pct,target)}">${fmt(pct)}%${suspect?' !!':''}</td>
      <td style="font-size:10px;color:var(--slate5)">${e.submittedBy||'--'}</td><td style="font-size:10px;color:var(--slate5)">${e.organizationName||'--'}</td>
      <td><span class="badge ${e.status||'pending'}" style="font-size:10px">${e.status||'pending'}</span></td>
    </tr>`;}).join('')}</tbody></table></div>`;
  }
  if(a5entries&&a5entries.length>0){const s5=[...a5entries].sort((a,b)=>(b.emission||0)-(a.emission||0));
    html+=`<div style="margin-top:14px;font-size:12px;font-weight:700;color:var(--slate4);margin-bottom:6px">A5 Site (${s5.length})</div>
    <div class="tbl-wrap"><table><thead><tr><th>Month</th><th>Source</th><th class="r">Qty</th><th>Unit</th><th class="r">Emission</th><th>By</th><th>Org</th></tr></thead>
    <tbody>${s5.map(e=>`<tr><td style="font-size:11px">${e.monthLabel||'--'}</td><td style="font-weight:600">${e.source||'--'}</td><td class="r mono" style="font-size:11px">${fmtI(e.qty)}</td><td style="font-size:11px">${e.unit||'--'}</td><td class="r mono" style="font-size:11px;font-weight:700">${fmt(e.emission)}</td><td style="font-size:10px;color:var(--slate5)">${e.submittedBy||'--'}</td><td style="font-size:10px;color:var(--slate5)">${e.organizationName||'--'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  if(!html) html='<div style="padding:16px;text-align:center;color:var(--slate5);font-size:12px">No entries yet.</div>';
  return html;
}

function buildContractorPerformance(entries, assignments, target) {
  const byOrg={};entries.forEach(e=>{const k=e.organizationId||e.submittedByUid||'unknown';if(!byOrg[k])byOrg[k]={name:e.organizationName||e.submittedBy||'Unknown',b:0,a:0,count:0};byOrg[k].b+=e.a13B||0;byOrg[k].a+=e.a13A||0;byOrg[k].count++;});
  const orgs=Object.values(byOrg).filter(o=>o.count>0).sort((a,b)=>{const pa=a.b>0?((a.b-a.a)/a.b)*100:0;const pb=b.b>0?((b.b-b.a)/b.b)*100:0;return pa-pb;});
  if(!orgs.length)return'';
  return`<div class="tbl-wrap"><table><thead><tr><th>Contractor</th><th class="r">Entries</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">Reduction</th><th>Status</th></tr></thead>
  <tbody>${orgs.map(o=>{const pct=o.b>0?((o.b-o.a)/o.b)*100:0;const ok=pct>=target;return`<tr style="${!ok?'background:rgba(248,113,113,0.06)':''}">
    <td style="font-weight:600">${o.name}</td><td class="r">${o.count}</td><td class="r mono">${fmt(o.b)}</td><td class="r mono">${fmt(o.a)}</td>
    <td class="r mono" style="font-weight:700;color:${ok?'var(--green)':'var(--red)'}">${fmt(pct)}%</td>
    <td>${ok?'<span class="badge approved">On Track</span>':'<span class="badge" style="background:rgba(248,113,113,0.15);color:var(--red)">Below Target</span>'}</td>
  </tr>`;}).join('')}</tbody></table></div>`;
}

// ===== PORTFOLIO DASHBOARD — one-screen command center =====
function renderPortfolioDashboard(el, projects) {
  const r = state.role;
  const pa = state.projectAssignments || [];
  const target = state.reductionTarget || 20;

  // Role-based data scoping
  let d, a5e;
  if (r === 'contractor' && state.organizationId) {
    d = (state.entries || []).filter(e => e.organizationId === state.organizationId);
    a5e = (state.a5entries || []).filter(e => e.organizationId === state.organizationId);
    const myProjIds = new Set(d.map(e => e.projectId).concat(a5e.map(e => e.projectId)));
    projects = projects.filter(p => myProjIds.has(p.id));
  } else if (r === 'consultant') {
    const myProjIds = new Set(pa.filter(a => a.userId === state.uid && a.userRole === 'consultant').map(a => a.projectId));
    d = (state.entries || []).filter(e => myProjIds.has(e.projectId));
    a5e = (state.a5entries || []).filter(e => myProjIds.has(e.projectId));
    projects = projects.filter(p => myProjIds.has(p.id));
  } else {
    d = state.entries || [];
    a5e = state.a5entries || [];
  }

  // Totals
  let tB=0,tA=0,tA4=0; d.forEach(e=>{tB+=e.a13B||0;tA+=e.a13A||0;tA4+=e.a4||0;});
  let a5T=0; a5e.forEach(e=>{a5T+=e.emission||0;});
  const rP=tB>0?((tB-tA)/tB)*100:0;
  const tTotal=tA+tA4+a5T, tSav=Math.max(tB-tA,0);
  const orc=_rc(rP,target), onTrack=rP>=target;

  // Aggregate per-project
  const projOrgLinks = state.projectOrgLinks || [];
  const allProjects = state.projects || [];
  const projData=projects.map((p)=>{
    // Use index in the ORIGINAL state.projects so openProjectModal resolves correctly
    const idx = allProjects.findIndex(sp => sp.id === p.id);
    const pe=d.filter(e=>e.projectId===p.id);
    const pa5=a5e.filter(e=>e.projectId===p.id);
    let pB=0,pA=0,pA4=0;pe.forEach(e=>{pB+=e.a13B||0;pA+=e.a13A||0;pA4+=e.a4||0;});
    let pA5=0;pa5.forEach(e=>{pA5+=e.emission||0;});
    const pRed=pB>0?((pB-pA)/pB)*100:0, pTotal=pA+pA4+pA5, pSav=Math.max(pB-pA,0);
    // Worst contractor per project
    const orgs=_aggContractors(pe);
    const worstOrg=orgs.length>0?orgs[0]:null;
    // Materials breakdown per project
    const mats=_aggMaterials(pe);
    // Consultancy firm for this project
    const consLinks=projOrgLinks.filter(l=>l.projectId===p.id&&l.orgType==='consultant_firm');
    const consName=consLinks.length>0?consLinks[0].orgName:'Unassigned';
    return {p,idx,pe,pB,pA,pA4,pRed,pTotal,pSav,worstOrg,mats,consName};
  });

  // Decision row data
  const allCon=_aggContractors(d);const allMat=_aggMaterials(d);
  const belowTarget=projData.filter(pd=>pd.pRed<target&&pd.pe.length>0);
  const worstProj=projData.filter(pd=>pd.pe.length>0&&pd.pB>0).sort((a,b)=>a.pRed-b.pRed)[0]||null;
  const worstCon=allCon.length>0?allCon[0]:null;
  const bigMat=allMat.length>0?allMat[0]:null;

  // Filtered + sorted project list
  let filtered=[...projData];
  if(_dashFilter.search){const q=_dashFilter.search.toLowerCase();filtered=filtered.filter(pd=>pd.p.name.toLowerCase().includes(q)||(pd.p.code||'').toLowerCase().includes(q));}
  switch(_dashFilter.sort){
    case'worst':filtered.sort((a,b)=>a.pRed-b.pRed);break;
    case'best':filtered.sort((a,b)=>b.pRed-a.pRed);break;
    case'alpha':filtered.sort((a,b)=>a.p.name.localeCompare(b.p.name));break;
    case'below':filtered.sort((a,b)=>a.pRed-b.pRed);break;
  }

  // Build tile HTML for a single project
  function _buildTile(pd) {
    const{p,idx,pe,pB,pA,pRed,pTotal,pSav,worstOrg,mats,consName}=pd;
    const rc=_rc(pRed,target);const gw=Math.min(Math.max(pRed,0),100);
    const woC=worstOrg?_rc(worstOrg.pct,target):'';
    // Material-wise mini breakdown (top 3)
    const topMats=mats.slice(0,3);
    const matHtml=topMats.map(m=>{const mRed=m.b>0?((m.b-m.a)/m.b)*100:0;const mc=_rc(mRed,target);const share=pA>0?((m.a/pA)*100):0;
      return`<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
        <div style="width:4px;height:4px;border-radius:50%;background:${MATCOLS[m.name]||'var(--slate4)'};flex-shrink:0"></div>
        <div style="font-size:8px;color:var(--slate5);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.name.replace('_',' ')}</div>
        <div style="font-size:8px;font-weight:700;color:${mc}">${fmt(mRed)}%</div>
      </div>`;
    }).join('');
    return`<div class="pcard" onclick="openProjectModal(${idx})">
      <div class="pcard-top"><div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="pcard-name">${p.name}</div>
        <span class="pcard-red-badge" style="background:${_rbg(pRed,target)};color:${rc}">${fmt(pRed)}%</span>
      </div>${p.code?`<div class="pcard-code">${p.code}</div>`:''}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <div style="font-size:9px;color:var(--slate5)"><span style="color:var(--slate4);font-weight:600">${fmt(pB)}</span> BL</div>
        <div style="font-size:9px;color:var(--slate5)">\u2192</div>
        <div style="font-size:9px;color:var(--blue);font-weight:600">${fmt(pA)} <span style="color:var(--slate5);font-weight:400">Act</span></div>
      </div>
      <div class="pcard-gauge"><div class="pcard-gauge-track"><div class="pcard-gauge-fill" style="width:${gw}%;background:${rc}"></div></div></div>
      ${matHtml?`<div style="margin:5px 0 3px">${matHtml}</div>`:''}
      <div class="pcard-footer">
        <div class="pcard-spark">${buildMiniSparkline(pe)}</div>
        ${r==='contractor'?`<span style="font-size:9px;color:var(--slate5)">${pe.length} entries</span>`
         :worstOrg?`<div style="font-size:8px;color:${woC};max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${worstOrg.name}: ${fmt(worstOrg.pct)}%">${worstOrg.name}</div>`:`<span style="font-size:9px;color:var(--slate5)">${pe.length} entries</span>`}
      </div>
    </div>`;
  }

  // Build tiles — for contractor: group by consultancy, others: flat grid
  let tilesHtml;
  if (r === 'contractor') {
    const byConsultancy = {};
    filtered.forEach(pd => {
      const key = pd.consName;
      if (!byConsultancy[key]) byConsultancy[key] = [];
      byConsultancy[key].push(pd);
    });
    const groups = Object.entries(byConsultancy);
    tilesHtml = groups.map(([cName, pds]) => {
      // Group-level totals
      let gB=0,gA=0;pds.forEach(pd=>{gB+=pd.pB;gA+=pd.pA;});
      const gRed=gB>0?((gB-gA)/gB)*100:0;const grc=_rc(gRed,target);
      return `<div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding:6px 10px;background:var(--bg3);border-radius:8px;border-left:3px solid var(--green)">
          <div>
            <div style="font-size:11px;font-weight:800;color:var(--text)">${cName}</div>
            <div style="font-size:8px;color:var(--slate5)">${pds.length} project${pds.length!==1?'s':''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;color:var(--slate5)">${fmt(gB)} BL \u2192 <span style="color:var(--blue);font-weight:600">${fmt(gA)}</span> Act</div>
            <div style="font-size:12px;font-weight:800;color:${grc}">${fmt(gRed)}% <span style="font-size:8px;font-weight:600">reduction</span></div>
          </div>
        </div>
        <div class="pcard-grid">${pds.map(pd=>_buildTile(pd)).join('')}</div>
      </div>`;
    }).join('');
  } else {
    tilesHtml = filtered.map(pd=>_buildTile(pd)).join('');
  }

  // Role-specific data
  const pendReqs = (state.editRequests||[]).filter(rq=>rq.status==='pending');
  const pendCount = d.filter(e=>e.status==='pending').length;
  const reviewCount = d.filter(e=>e.status==='review').length;
  const approvedCount = d.filter(e=>e.status==='approved').length;
  const rejectedCount = d.filter(e=>e.status==='rejected').length;

  // Role label & accent
  const roleLabel = r==='client'?'Executive Overview':r==='consultant'?'Consultant Dashboard':'Contractor Dashboard';
  const roleAccent = r==='client'?'var(--green)':r==='consultant'?'var(--purple)':'var(--blue)';

  // --- CLIENT: extra charts + approval pipeline ---
  const clientExtra = r==='client'?`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div style="padding:12px;background:var(--bg3);border-radius:10px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Emission Trend</div>
        ${d.length>0?buildLineChart(d,'dashLineClient',true):'<div style="padding:12px;text-align:center;color:var(--slate5);font-size:11px">No data</div>'}
      </div>
      <div style="padding:12px;background:var(--bg3);border-radius:10px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Materials Breakdown</div>
        ${d.length>0?buildDonutChart(d,'dashDonutClient','dashDonutLgClient'):'<div style="padding:12px;text-align:center;color:var(--slate5);font-size:11px">No data</div>'}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">
      <div style="padding:10px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.12);border-radius:8px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--yellow)">${pendCount}</div>
        <div style="font-size:9px;color:var(--slate5)">Pending</div>
      </div>
      <div style="padding:10px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.12);border-radius:8px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--blue)">${reviewCount}</div>
        <div style="font-size:9px;color:var(--slate5)">In Review</div>
      </div>
      <div style="padding:10px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.12);border-radius:8px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--green)">${approvedCount}</div>
        <div style="font-size:9px;color:var(--slate5)">Approved</div>
      </div>
      <div style="padding:10px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.12);border-radius:8px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--red)">${rejectedCount}</div>
        <div style="font-size:9px;color:var(--slate5)">Rejected</div>
      </div>
    </div>
    ${allCon.length>0?`<div style="margin-bottom:14px;padding:12px;background:var(--bg3);border-radius:10px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:8px">Contractor Performance</div>
      ${allCon.slice(0,6).map(c=>{const ok=c.pct>=target;return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
        <div style="width:120px;font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
        <div style="flex:1;height:14px;background:var(--bg4);border-radius:4px;overflow:hidden;position:relative">
          <div style="height:100%;width:${Math.min(Math.max(c.pct,0),100)}%;background:${ok?'var(--green)':'var(--red)'};opacity:0.4;border-radius:4px"></div>
          <div style="position:absolute;left:${target}%;top:0;bottom:0;width:1px;background:var(--red);z-index:1"></div>
        </div>
        <div style="font-size:10px;font-weight:700;color:${ok?'var(--green)':'var(--red)'};width:45px;text-align:right">${fmt(c.pct)}%</div>
      </div>`;}).join('')}
    </div>`:''}`:'';

  // --- CONSULTANT: pending requests banner + review queue ---
  const consultantExtra = r==='consultant'?`
    ${pendReqs.length>0?`<div style="padding:10px 14px;background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.15);border-radius:10px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:20px">&#x1F4DD;</div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--orange)">${pendReqs.length} Edit/Delete Request${pendReqs.length!==1?'s':''} Pending</div>
          <div style="font-size:10px;color:var(--slate5)">Contractors are waiting for your approval to modify entries</div>
        </div>
      </div>
      <button class="btn btn-sm" onclick="navigate('approvals')" style="background:rgba(251,146,60,0.15);color:var(--orange);border:1px solid rgba(251,146,60,0.3);font-size:10px">Review</button>
    </div>`:''}
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
      <div style="padding:10px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.12);border-radius:8px;text-align:center;cursor:pointer" onclick="navigate('approvals')">
        <div style="font-size:20px;font-weight:800;color:var(--yellow)">${pendCount}</div>
        <div style="font-size:9px;color:var(--slate5)">Pending Review</div>
      </div>
      <div style="padding:10px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.12);border-radius:8px;text-align:center;cursor:pointer" onclick="navigate('approvals')">
        <div style="font-size:20px;font-weight:800;color:var(--blue)">${reviewCount}</div>
        <div style="font-size:9px;color:var(--slate5)">In Review</div>
      </div>
      <div style="padding:10px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.12);border-radius:8px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--green)">${approvedCount}</div>
        <div style="font-size:9px;color:var(--slate5)">Approved</div>
      </div>
    </div>
    ${d.length>0?`<div style="padding:12px;background:var(--bg3);border-radius:10px;margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Emission Trend</div>
      ${buildLineChart(d,'dashLineConsultant',true)}
    </div>`:''}`:'';

  // --- CONTRACTOR: submission stats + edit request status ---
  const myReqs = r==='contractor'?(state.editRequests||[]).filter(rq=>rq.requestedByUid===state.uid||rq.organizationId===state.organizationId):[];
  const contractorExtra = r==='contractor'?`
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">
      <div style="padding:10px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.12);border-radius:8px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--blue)">${d.length}</div>
        <div style="font-size:9px;color:var(--slate5)">Total Entries</div>
      </div>
      <div style="padding:10px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.12);border-radius:8px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--yellow)">${pendCount}</div>
        <div style="font-size:9px;color:var(--slate5)">Pending</div>
      </div>
      <div style="padding:10px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.12);border-radius:8px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--green)">${approvedCount}</div>
        <div style="font-size:9px;color:var(--slate5)">Approved</div>
      </div>
      <div style="padding:10px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.12);border-radius:8px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:var(--red)">${rejectedCount}</div>
        <div style="font-size:9px;color:var(--slate5)">Rejected</div>
      </div>
    </div>
    ${myReqs.filter(rq=>rq.status==='pending').length>0?`<div style="padding:10px 14px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.12);border-radius:10px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--blue)">&#x23F3; ${myReqs.filter(rq=>rq.status==='pending').length} edit/delete request${myReqs.filter(rq=>rq.status==='pending').length!==1?'s':''} awaiting consultant approval</div>
    </div>`:''}
    ${myReqs.filter(rq=>rq.status==='approved'&&rq.requestType==='edit').length>0?`<div style="padding:10px 14px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.12);border-radius:10px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--green)">\u2713 ${myReqs.filter(rq=>rq.status==='approved'&&rq.requestType==='edit').length} edit request${myReqs.filter(rq=>rq.status==='approved'&&rq.requestType==='edit').length!==1?'s':''} approved \u2014 open project details to edit</div>
    </div>`:''}`:'';

  el.innerHTML=`
  <!-- Role Badge -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-size:14px;font-weight:800;letter-spacing:0.5px;color:${roleAccent}">${roleLabel}</div>
      <span style="font-size:9px;padding:2px 8px;background:${roleAccent}15;border:1px solid ${roleAccent}30;border-radius:4px;color:${roleAccent};font-weight:700;text-transform:uppercase">${r}</span>
    </div>
    ${r==='client'?`<div style="font-size:9px;color:var(--slate5)">${(state.organizations||[]).length} organizations | ${(state.projectAssignments||[]).length} assignments</div>`:''}
    ${r==='consultant'?`<div style="font-size:9px;color:var(--slate5)">${state.name||''} | ${state.organizationName||'Unassigned'}</div>`:''}
    ${r==='contractor'?`<div style="font-size:9px;color:var(--slate5)">${state.organizationName||state.name||''}</div>`:''}
  </div>

  <!-- Sticky Header -->
  <div class="dash-sticky">
    <div class="dash-kpi-row">
      <div class="dash-kpi"><div class="dash-kpi-v" style="color:var(--slate3)">${fmt(tB)}</div><div class="dash-kpi-l">BAU Baseline</div></div>
      <div class="dash-kpi-sep"></div>
      <div class="dash-kpi"><div class="dash-kpi-v" style="color:var(--blue)">${fmt(tTotal)}</div><div class="dash-kpi-l">Actual</div></div>
      <div class="dash-kpi-sep"></div>
      <div class="dash-kpi"><div class="dash-kpi-v" style="color:var(--green)">${fmt(tSav)}</div><div class="dash-kpi-l">Savings</div></div>
      <div class="dash-kpi-sep"></div>
      <div class="dash-kpi"><div class="dash-kpi-v" style="color:${orc}">${fmt(rP)}%</div><div class="dash-kpi-l">Reduction</div></div>
      <div class="dash-kpi-sep"></div>
      <div class="dash-kpi">
        ${r==='client'?`<div style="display:flex;align-items:center;gap:3px">
          <input type="number" id="dashTarget" value="${target}" min="0" max="100" step="1" class="dash-target-input"/>
          <span style="font-size:10px;color:var(--red);font-weight:700">%</span>
          <button class="btn btn-sm" onclick="saveReductionTarget()" style="font-size:9px;padding:2px 8px">Set</button>
        </div>`:`<div class="dash-kpi-v" style="color:var(--red)">${target}%</div>`}
        <div class="dash-kpi-l">Target</div>
      </div>
      <div class="dash-kpi-sep"></div>
      <div class="dash-kpi"><div class="dash-track-badge ${onTrack?'on':'off'}">${onTrack?'ON TRACK':'OFF TRACK'}</div></div>
    </div>
    <div class="dash-filter-row">
      <input type="text" placeholder="Search projects..." value="${_dashFilter.search||''}" oninput="dashSearch(this.value)" class="dash-search-input"/>
      <div style="display:flex;gap:3px;align-items:center">
        <span style="font-size:9px;color:var(--slate5);font-weight:700">SORT:</span>
        <button class="dash-sort ${_dashFilter.sort==='worst'?'active':''}" onclick="dashSetSort('worst')">Worst First</button>
        <button class="dash-sort ${_dashFilter.sort==='best'?'active':''}" onclick="dashSetSort('best')">Best Reduction</button>
        <button class="dash-sort ${_dashFilter.sort==='alpha'?'active':''}" onclick="dashSetSort('alpha')">A-Z</button>
        <button class="dash-sort ${_dashFilter.sort==='below'?'active':''}" onclick="dashSetSort('below')">Below Target</button>
      </div>
    </div>
  </div>

  <!-- Role-Specific Section -->
  ${clientExtra}${consultantExtra}${contractorExtra}

  <!-- Decision Row -->
  <div class="dash-decision-row">
    ${worstProj?(worstProj.pRed<target
      ?`<div class="dash-dcard dash-dcard-red" onclick="openProjectModal(${worstProj.idx})">
        <div class="dash-dcard-icon" style="background:rgba(248,113,113,0.15);color:var(--red)">!</div>
        <div><div class="dash-dcard-title">Needs Attention</div><div class="dash-dcard-val">${worstProj.p.name}</div>
          <div class="dash-dcard-sub" style="color:var(--red);font-weight:600">${fmt(worstProj.pRed)}% vs ${target}% target</div>
          <div class="dash-dcard-sub">${fmt(worstProj.pA)} tCO\u2082 | ${fmt(target-worstProj.pRed)}% gap to close</div></div>
      </div>`
      :`<div class="dash-dcard dash-dcard-green" onclick="openProjectModal(${worstProj.idx})">
        <div class="dash-dcard-icon" style="background:rgba(52,211,153,0.15);color:var(--green)">\u2713</div>
        <div><div class="dash-dcard-title">All On Track</div><div class="dash-dcard-val" style="color:var(--green)">${worstProj.p.name}</div>
          <div class="dash-dcard-sub" style="color:var(--green)">${fmt(worstProj.pRed)}% vs ${target}% target</div>
          <div class="dash-dcard-sub">Lowest margin | ${fmt(worstProj.pA)} tCO\u2082</div></div>
      </div>`)
    :''}
    ${worstCon&&worstCon.pct<target?`<div class="dash-dcard dash-dcard-red" onclick="openProjectModal(${worstProj?worstProj.idx:0},{tab:'contractors'})">
      <div class="dash-dcard-icon" style="background:rgba(248,113,113,0.15);color:var(--red)">!</div>
      <div><div class="dash-dcard-title">Worst Contractor</div><div class="dash-dcard-val">${worstCon.name}</div>
        <div class="dash-dcard-sub" style="color:var(--red);font-weight:600">${fmt(worstCon.pct)}% vs ${target}% target</div>
        <div class="dash-dcard-sub">${fmt(worstCon.a)} tCO\u2082 | ${worstCon.n} entries</div>
        ${allCon.filter(c=>c.pct<target).length>1?`<div class="dash-dcard-sub" style="color:var(--orange)">${allCon.filter(c=>c.pct<target).length} contractors below target</div>`:''}</div>
    </div>`:(allCon.length>0?`<div class="dash-dcard dash-dcard-green">
      <div class="dash-dcard-icon" style="background:rgba(52,211,153,0.15);color:var(--green)">\u2713</div>
      <div><div class="dash-dcard-title">Contractors</div><div class="dash-dcard-val" style="color:var(--green)">All on track</div><div class="dash-dcard-sub">${allCon.length} total</div></div>
    </div>`:'')}
    ${bigMat?`<div class="dash-dcard" onclick="openProjectModal(${worstProj?worstProj.idx:0},{tab:'materials'})">
      <div class="dash-dcard-icon" style="background:rgba(96,165,250,0.15);color:var(--blue)">\u25CF</div>
      <div><div class="dash-dcard-title">Material Hotspot</div><div class="dash-dcard-val">${bigMat.name.replace('_',' ')}</div>
        <div class="dash-dcard-sub">${fmt(bigMat.a)} tCO\u2082 (${bigMat.n} entries)</div></div>
    </div>`:''}
    <div class="dash-dcard ${belowTarget.length>0?'dash-dcard-amber':'dash-dcard-green'}">
      <div class="dash-dcard-icon" style="background:${belowTarget.length>0?'rgba(251,191,36,0.15)':'rgba(52,211,153,0.15)'};color:${belowTarget.length>0?'var(--yellow)':'var(--green)'}">${belowTarget.length>0?belowTarget.length:'\u2713'}</div>
      <div><div class="dash-dcard-title">Below Target</div><div class="dash-dcard-val" style="color:${belowTarget.length>0?'var(--yellow)':'var(--green)'}">${belowTarget.length>0?belowTarget.length+' project'+(belowTarget.length!==1?'s':''):'All meeting target'}</div><div class="dash-dcard-sub">vs ${target}%</div></div>
    </div>
  </div>

  <!-- Project Grid -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--text3);text-transform:uppercase">${r==='contractor'?'My Projects':r==='consultant'?'Assigned Projects':'All Projects'}</div>
    <div style="font-size:10px;color:var(--slate5)">${filtered.length} of ${projects.length} | Click to drill down</div>
  </div>
  ${r==='contractor'?tilesHtml||'<div style="padding:24px;text-align:center;color:var(--slate5);font-size:12px">No projects match your search.</div>'
   :`<div class="pcard-grid">${tilesHtml||'<div style="padding:24px;text-align:center;color:var(--slate5);font-size:12px;grid-column:1/-1">No projects match your search.</div>'}</div>`}`;

  // Render donut charts for client dashboard
  if (r === 'client' && d.length > 0) {
    setTimeout(()=>{renderDonutSvg(d,'dashDonutClient','dashDonutLgClient');},60);
  }
}

async function saveReductionTarget() {
  const val = parseFloat($('dashTarget') && $('dashTarget').value);
  if (isNaN(val) || val < 0 || val > 100) { alert('Target must be 0-100%'); return; }
  try {
    await DB.setSettings({ reductionTarget: val });
    state.reductionTarget = val;
    navigate('dashboard');
  } catch (e) { alert(e.message || 'Failed to save target.'); }
}

// Classic Dashboard — fallback when no projects defined
function renderClassicDashboard(el) {
  const d=getFilteredEntries();const target=state.reductionTarget||20;
  let tB=0,tA=0,tA4=0;d.forEach(e=>{tB+=e.a13B||0;tA+=e.a13A||0;tA4+=e.a4||0;});
  let a5T=0;state.a5entries.forEach(e=>{a5T+=e.emission||0;});
  const a5Arr=state.a5entries||[];
  el.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <div style="font-size:16px;font-weight:700;color:var(--slate2)">Carbon Overview</div>
    ${d.length>0?`<button class="btn btn-sm" id="projToggleAll" onclick="toggleProjectDetail('All')" style="font-size:11px">View All Entries \u25BC</button>`:''}
  </div>
  <div class="stats-row">
    <div class="stat-card slate"><div class="sc-label">A1-A3 BAU Baseline</div><div class="sc-value">${fmt(tB)}</div><div class="sc-sub">tCO\u2082eq</div></div>
    <div class="stat-card blue"><div class="sc-label">A1-A3 Actual</div><div class="sc-value">${fmt(tA)}</div><div class="sc-sub">tCO\u2082eq</div></div>
    <div class="stat-card orange"><div class="sc-label">A4 Transport</div><div class="sc-value">${fmt(tA4)}</div><div class="sc-sub">tCO\u2082eq</div></div>
    <div class="stat-card cyan"><div class="sc-label">A5 Site</div><div class="sc-value">${fmt(a5T)}</div><div class="sc-sub">tCO\u2082eq</div></div>
    <div class="stat-card green"><div class="sc-label">A1-A5 Total</div><div class="sc-value">${fmt(tA+tA4+a5T)}</div><div class="sc-sub">tCO\u2082eq</div></div>
  </div>
  ${buildReductionGauge(tA, tB, target)}
  ${d.length>0?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0">
    <div class="card"><div class="card-title">Monthly Trend</div>${buildLineChart(d,'dc',false)}</div>
    <div class="card"><div class="card-title">By Material</div>${buildDonutChart(d,'dn','dl')}</div>
  </div>
  <div id="projDetailAll" style="display:none;margin:0 0 16px;padding:16px;background:var(--bg2);border-radius:12px;border:1px solid var(--border)">
    ${buildEntryTable(d, a5Arr)}
  </div>`:''}
  <div class="card"><div class="card-title">Approvals</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">
    <div><div style="font-size:24px;font-weight:800;color:var(--yellow)">${d.filter(e=>e.status==='pending').length}</div><div style="font-size:10px;color:var(--slate5)">Pending</div></div>
    <div><div style="font-size:24px;font-weight:800;color:var(--blue)">${d.filter(e=>e.status==='review').length}</div><div style="font-size:10px;color:var(--slate5)">Review</div></div>
    <div><div style="font-size:24px;font-weight:800;color:var(--green)">${d.filter(e=>e.status==='approved').length}</div><div style="font-size:10px;color:var(--slate5)">Approved</div></div>
    <div><div style="font-size:24px;font-weight:800;color:var(--red)">${d.filter(e=>e.status==='rejected').length}</div><div style="font-size:10px;color:var(--slate5)">Rejected</div></div>
  </div></div>`;
  setTimeout(()=>{renderDonutSvg(d,'dn','dl');},50);
}

// ===== ENTRY (BATCH WORKFLOW) =====
function renderEntry(el) {
  const yr=new Date().getFullYear(),mo=String(new Date().getMonth()+1).padStart(2,'0');
  const isContractor = state.role === 'contractor';
  // Build project options from user's assigned projects
  const myProjects = (state.projects || []).filter(p => p.status === 'active');
  const projOptions = myProjects.length
    ? myProjects.map(p => `<option value="${p.id}" ${state.selectedProjectId === p.id ? 'selected' : ''}>${p.name}${p.code ? ' (' + p.code + ')' : ''}</option>`).join('')
    : '';

  el.innerHTML=`
  <div class="card"><div class="card-title">Add Material \u2014 A1-A4</div>
  ${isContractor?`<div style="padding:10px 14px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--blue)">
    <strong>Batch Mode:</strong> Add as many entries as you need, then submit them all to the consultant at once.
  </div>`:''}
  ${myProjects.length > 0 ? `<div class="form-row" style="margin-bottom:12px">
    <div class="fg" style="max-width:400px">
      <label style="font-weight:700;color:var(--blue)">Project <span style="color:var(--red)">*</span></label>
      <select id="eProj" onchange="onProjectSelect(this.value)">
        <option value="">Select project...</option>
        ${projOptions}
      </select>
    </div>
    ${state.selectedProjectId ? `<div style="display:flex;align-items:flex-end;padding-bottom:4px"><span class="badge approved" style="font-size:11px">${myProjects.find(p=>p.id===state.selectedProjectId)?.name || ''}</span></div>` : ''}
  </div>` : `<div style="padding:10px 14px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--red)">
    No projects assigned to you yet. Contact your administrator to assign you to a project before entering data.
  </div>`}
  <div class="form-row c4"><div class="fg"><label>Year</label><select id="eY">${[yr-1,yr,yr+1].map(y=>`<option ${y===yr?'selected':''}>${y}</option>`).join('')}</select></div>
  <div class="fg"><label>Month</label><select id="eM">${MONTHS.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0')===mo?'selected':''}>${m}</option>`).join('')}</select></div>
  <div class="fg"><label>District</label><input id="eD" value="A"></div>
  <div class="fg"><label>Contract</label><input id="eC" placeholder="e.g. PA Apron Phase 0"></div></div>
  <div class="form-row c3"><div class="fg"><label>Category</label><select id="eCat" onchange="onCat()"><option value="">Select...</option>${Object.keys(MATERIALS).map(c=>`<option>${c}</option>`).join('')}</select></div>
  <div class="fg"><label>Type</label><select id="eType" onchange="onType()"><option>Select category</option></select></div>
  <div class="fg"><label>Quantity</label><input type="number" id="eQ" placeholder="Enter amount" oninput="preview()"><div class="fg-help" id="eQU">\u2014</div></div></div>
  <div class="form-row c3"><div class="fg"><label>Baseline EF</label><input id="eBL" class="fg-readonly" readonly></div>
  <div class="fg"><label>Target EF</label><input id="eTG" class="fg-readonly" readonly></div>
  <div class="fg"><label>Actual EF (from EPD)</label><input type="number" id="eA" step="0.01" placeholder="EF per unit" oninput="preview()"><div class="fg-help" id="eAU">\u2014</div></div></div>
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
    <div class="tbl-wrap"><table><thead><tr><th>Project</th><th>Month</th><th>Material</th><th>Type</th><th class="r">Qty</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">A4</th><th class="r">Total</th><th></th></tr></thead><tbody id="batchTbl"></tbody></table></div>
  </div>` : ''}

  <div class="card"><div class="card-title">${isContractor ? 'Submitted Entries' : 'Recent Entries'}</div><div class="tbl-wrap"><table><thead><tr><th>Project</th><th>Month</th><th>Material</th><th>Type</th><th class="r">Qty</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">A4</th><th class="r">Total</th><th>Status</th><th></th></tr></thead><tbody id="reTbl"></tbody></table></div></div>`;

  if (isContractor) renderBatch();
  renderRecent();
}

function onProjectSelect(val) { state.selectedProjectId = val || null; }

function onCat(){const c=$('eCat').value;if(!c||!MATERIALS[c])return;$('eType').innerHTML='<option value="">Select...</option>'+MATERIALS[c].types.map((t,i)=>`<option value="${i}">${t.name}</option>`).join('');$('eQU').textContent='Unit: '+MATERIALS[c].unit;$('eAU').textContent=MATERIALS[c].efUnit;$('eBL').value='';$('eTG').value='';preview();}
function onType(){const c=$('eCat').value,i=$('eType').value;if(!c||i==='')return;const t=MATERIALS[c].types[i];$('eBL').value=t.baseline+' '+MATERIALS[c].efUnit;$('eTG').value=t.target+' '+MATERIALS[c].efUnit;preview();}

function preview(){
  const c=$('eCat').value,i=$('eType').value,q=parseFloat($('eQ').value),a=parseFloat($('eA').value);
  if(!c||i===''||isNaN(q)||isNaN(a)||q<=0||a<=0){$('ePrev').innerHTML='';return;}
  const m=MATERIALS[c],t=m.types[i],mass=q*m.massFactor;
  const rd=parseFloat($('eR').value)||0,se=parseFloat($('eS').value)||0,tr=parseFloat($('eT').value)||0;
  const b=(q*t.baseline)/1000,ac=(q*a)/1000,a4=(mass*rd*TEF.road+mass*se*TEF.sea+mass*tr*TEF.train)/1000;
  const tot=ac+a4,p=b>0?((b-ac)/b)*100:0,cl=p>20?'green':p>=10?'orange':'purple';
  // Validate: warn if actualEF is unreasonable vs baseline
  const efRatio=t.baseline>0?a/t.baseline:0;
  const warn=efRatio>5?`<div style="padding:8px 12px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.2);border-radius:8px;color:var(--red);font-size:11px;margin-bottom:8px"><strong>Warning:</strong> Actual EF (${a} ${m.efUnit}) is ${efRatio.toFixed(0)}x the baseline (${t.baseline} ${m.efUnit}). Please check — you should enter the <strong>Emission Factor per ${m.unit}</strong> from the EPD, not the total emission value.</div>`:efRatio>3?`<div style="padding:8px 12px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);border-radius:8px;color:var(--orange);font-size:11px;margin-bottom:8px"><strong>Note:</strong> Actual EF (${a}) is higher than baseline (${t.baseline}). Ensure you are entering the EF in ${m.efUnit}.</div>`:'';
  $('ePrev').innerHTML=`${warn}<div class="stats-row" style="margin:16px 0 8px"><div class="stat-card slate"><div class="sc-label">A1-A3 Baseline</div><div class="sc-value">${fmt(b)}</div><div class="sc-sub">ton CO\u2082eq</div></div><div class="stat-card blue"><div class="sc-label">A1-A3 Actual</div><div class="sc-value">${fmt(ac)}</div><div class="sc-sub">ton CO\u2082eq</div></div><div class="stat-card orange"><div class="sc-label">A4 Transport</div><div class="sc-value">${fmt(a4)}</div><div class="sc-sub">ton CO\u2082eq</div></div><div class="stat-card green"><div class="sc-label">A1-A4 Total</div><div class="sc-value">${fmt(tot)}</div><div class="sc-sub">ton CO\u2082eq</div></div><div class="stat-card ${cl}"><div class="sc-label">Reduction</div><div class="sc-value">${fmt(p)}%</div><div class="sc-sub">${fmt(b-ac)} saved</div></div></div>`;
}

// Add an entry to the local draft batch (contractor only)
function addToBatch() {
  const c=$('eCat').value,i=$('eType').value,q=parseFloat($('eQ').value),a=parseFloat($('eA').value);
  if(!c||i===''||isNaN(q)||isNaN(a)||q<=0||a<=0){alert('Fill all required fields');return;}

  // Require project selection
  const projEl = $('eProj');
  const projId = projEl ? projEl.value : '';
  if (!projId) { alert('Please select a project first.'); return; }
  const proj = (state.projects || []).find(p => p.id === projId);

  const m=MATERIALS[c],t=m.types[i],mass=q*m.massFactor;
  // Validate actualEF vs baselineEF
  const efRatio=t.baseline>0?a/t.baseline:0;
  if(efRatio>10){if(!confirm(`Warning: Actual EF (${a} ${m.efUnit}) is ${efRatio.toFixed(0)}x the baseline (${t.baseline} ${m.efUnit}).\n\nYou should enter the Emission Factor per ${m.unit} from the EPD, NOT the total emission.\n\nAre you sure this value is correct?`))return;}
  const rd=parseFloat($('eR').value)||0,se=parseFloat($('eS').value)||0,tr=parseFloat($('eT').value)||0;
  const b=(q*t.baseline)/1000,ac=(q*a)/1000,a4=(mass*rd*TEF.road+mass*se*TEF.sea+mass*tr*TEF.train)/1000;
  const yr=$('eY').value,mo=$('eM').value;

  const entry={id:Date.now(),category:c,type:t.name,qty:q,unit:m.unit,actual:a,baseline:t.baseline,target:t.target,baselineEF:t.baseline,actualEF:a,
    road:rd,sea:se,train:tr,a13B:b,a13A:ac,a4,a14:ac+a4,pct:b>0?((b-ac)/b)*100:0,
    year:yr,month:mo,monthKey:yr+'-'+mo,monthLabel:MONTHS[parseInt(mo)-1]+' '+yr,
    district:$('eD').value,contract:$('eC').value,notes:$('eN').value,
    projectId:projId,projectName:proj?proj.name:'',
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
        <td style="font-weight:600;color:var(--blue);font-size:11px">${e.projectName||'--'}</td>
        <td>${e.monthLabel}</td><td>${e.category}</td><td>${e.type}</td>
        <td class="r mono">${fmtI(e.qty)}</td>
        <td class="r mono">${fmt(e.a13B)}</td>
        <td class="r mono">${fmt(e.a13A)}</td>
        <td class="r mono">${fmt(e.a4)}</td>
        <td class="r mono" style="font-weight:700">${fmt(e.a14)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="removeDraftEntry(${e.id})">\u2715</button></td>
      </tr>`).join('')
    : '<tr><td colspan="10" class="empty">No items in batch — add entries above</td></tr>';
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
    // Stamp status + submitter before sending (projectId already set per entry in addToBatch)
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

  // Require project selection
  const projEl = $('eProj');
  const projId = projEl ? projEl.value : '';
  if (!projId) { alert('Please select a project first.'); return; }
  const proj = (state.projects || []).find(p => p.id === projId);

  const m=MATERIALS[c],t=m.types[i],mass=q*m.massFactor;
  // Validate actualEF vs baselineEF
  const efRatio=t.baseline>0?a/t.baseline:0;
  if(efRatio>10){if(!confirm(`Warning: Actual EF (${a} ${m.efUnit}) is ${efRatio.toFixed(0)}x the baseline (${t.baseline} ${m.efUnit}).\n\nYou should enter the Emission Factor per ${m.unit} from the EPD, NOT the total emission.\n\nAre you sure this value is correct?`))return;}
  const rd=parseFloat($('eR').value)||0,se=parseFloat($('eS').value)||0,tr=parseFloat($('eT').value)||0;
  const b=(q*t.baseline)/1000,ac=(q*a)/1000,a4=(mass*rd*TEF.road+mass*se*TEF.sea+mass*tr*TEF.train)/1000;
  const yr=$('eY').value,mo=$('eM').value;

  const entry={id:Date.now(),category:c,type:t.name,qty:q,unit:m.unit,actual:a,baseline:t.baseline,target:t.target,baselineEF:t.baseline,actualEF:a,
    road:rd,sea:se,train:tr,a13B:b,a13A:ac,a4,a14:ac+a4,pct:b>0?((b-ac)/b)*100:0,
    year:yr,month:mo,monthKey:yr+'-'+mo,monthLabel:MONTHS[parseInt(mo)-1]+' '+yr,
    district:$('eD').value,contract:$('eC').value,notes:$('eN').value,
    projectId:projId,projectName:proj?proj.name:'',
    status:'pending',submittedBy:state.name,role:state.role,submittedAt:new Date().toISOString()};

  await DB.saveEntry(entry);
  state.entries.push(entry);
  buildSidebar(); renderRecent();
  $('ePrev').innerHTML='<div style="padding:12px;background:rgba(52,211,153,0.1);border-radius:10px;color:var(--green);text-align:center;font-weight:600">\u2705 Entry submitted'+(dbConnected?' & synced to cloud':'')+'</div>';
}

function renderRecent(){
  const t=$('reTbl');if(!t)return;
  const r=[...state.entries].reverse().slice(0,15);
  const isContr = state.role === 'contractor';
  t.innerHTML=r.length?r.map(e=>{const blEF=e.baselineEF||e.baseline;const acEF=e.actualEF||e.actual;const suspect=blEF&&acEF&&blEF>0&&acEF/blEF>10;const pct=e.a13B>0?((e.a13B-e.a13A)/e.a13B)*100:0;
    // Action column logic for contractor — direct edit, no approval needed
    let actionHtml = '';
    if (isContr) {
      if (e.editRequestStatus === 'pending' && e.editRequestType === 'delete') {
        actionHtml = `<span class="badge review" style="font-size:8px">Del Req</span>`;
      } else {
        // Edit button always available — opens edit form directly
        actionHtml = `<button class="btn btn-sm" onclick="openEditEntryForm('${e.id}')" style="font-size:8px;padding:2px 5px;background:rgba(96,165,250,0.12);color:var(--blue);border:1px solid rgba(96,165,250,0.2)" title="Edit Entry">Edit</button>`;
        // Delete: direct delete if pending, otherwise request
        if (e.status === 'pending') {
          actionHtml += `<button class="btn btn-danger btn-sm" onclick="delEntry('${e.id}')" style="margin-left:2px">\u2715</button>`;
        } else {
          actionHtml += `<button class="btn btn-sm" onclick="requestDeleteEntry('${e.id}')" style="font-size:8px;padding:2px 5px;background:rgba(248,113,113,0.12);color:var(--red);border:1px solid rgba(248,113,113,0.2);margin-left:2px" title="Request Delete">Del</button>`;
        }
      }
    } else if (state.role === 'consultant') {
      // Consultant sees approve/reject only for delete requests
      if (e.editRequestStatus === 'pending' && e.editRequestType === 'delete' && e.editRequestId) {
        actionHtml = `<span style="font-size:8px;color:var(--orange);font-weight:700">DEL REQ</span> `
          + `<button class="btn btn-sm" onclick="resolveEditRequestFromEntry('${e.id}','approved')" style="font-size:8px;padding:1px 5px;background:rgba(52,211,153,0.15);color:var(--green);border:1px solid rgba(52,211,153,0.3)">Approve</button> `
          + `<button class="btn btn-sm" onclick="resolveEditRequestFromEntry('${e.id}','rejected')" style="font-size:8px;padding:1px 5px;background:rgba(248,113,113,0.15);color:var(--red);border:1px solid rgba(248,113,113,0.3)">Reject</button>`;
      } else if (e.status === 'pending') {
        actionHtml = `<button class="btn btn-danger btn-sm" onclick="delEntry('${e.id}')">\u2715</button>`;
      }
    } else {
      // Consultant/Client: force-delete any entry + fix EF on suspect
      const _sus=blEF&&acEF&&blEF>0&&acEF/blEF>10;
      actionHtml = `${_sus?`<button class="btn btn-sm anomaly-fix-btn" onclick="showCorrectModal('${e.id}')" style="font-size:8px;padding:2px 5px" title="Fix EF">Fix</button>`:''}<button class="btn btn-sm force-del-btn" onclick="forceDeleteEntry('${e.id}')" style="font-size:8px;padding:2px 5px" title="Force delete">Del</button>`;
    }
    return`<tr${suspect?' style="background:rgba(248,113,113,0.06)"':''}>
    <td style="font-weight:600;color:var(--blue);font-size:11px">${e.projectName||'--'}</td><td>${e.monthLabel}</td><td>${e.category}</td><td>${e.type}</td>
    <td class="r mono">${fmtI(e.qty)}</td><td class="r mono">${fmt(e.a13B)}</td><td class="r mono"${suspect?' style="color:var(--red)"':''}>${fmt(e.a13A)}${suspect?' !':''}</td><td class="r mono">${fmt(e.a4)}</td><td class="r mono" style="font-weight:700">${fmt(e.a14)}</td>
    <td><span class="badge ${e.status}">${e.status}</span></td>
    <td>${actionHtml}</td></tr>`;}).join(''):'<tr><td colspan="11" class="empty">No entries</td></tr>';
}

async function delEntry(id){await DB.deleteEntry(id);state.entries=state.entries.filter(e=>String(e.id)!==String(id));navigate(state.page);}

// ===== EDIT/DELETE REQUEST WORKFLOW =====

// Contractor requests permission to edit an entry
async function requestEditEntry(entryId) {
  const entry = state.entries.find(e => String(e.id) === String(entryId));
  if (!entry) { alert('Entry not found'); return; }
  const reason = prompt('Reason for edit request:\n(e.g. "Wrong EF value entered", "Quantity correction needed")');
  if (reason === null) return;
  if (!reason.trim()) { alert('Please provide a reason for the edit request.'); return; }
  try {
    const res = await DB.requestChange(String(entryId), 'edit', reason.trim());
    entry.editRequestId = res.requestId;
    entry.editRequestType = 'edit';
    entry.editRequestStatus = 'pending';
    entry.editRequestReason = reason.trim();
    entry.editRequestBy = state.name;
    entry.editRequestByOrg = state.organizationName || null;
    try { state.editRequests = await DB.getEditRequests(); } catch (e2) {}
    alert('Edit request sent to consultant for approval.');
    navigate(state.page);
  } catch (e) { alert('Failed: ' + (e.message || 'Unknown error')); }
}

// Contractor requests permission to delete an entry
async function requestDeleteEntry(entryId) {
  const entry = state.entries.find(e => String(e.id) === String(entryId));
  if (!entry) { alert('Entry not found'); return; }
  const reason = prompt('Reason for deletion request:\n(e.g. "Duplicate entry", "Wrong project")');
  if (reason === null) return;
  if (!reason.trim()) { alert('Please provide a reason for the delete request.'); return; }
  if (!confirm('Request deletion of this entry?\n\n' + entry.category + ' - ' + entry.type + '\nQty: ' + fmtI(entry.qty) + ', Actual: ' + fmt(entry.a13A) + ' tCO\u2082')) return;
  try {
    const delRes = await DB.requestChange(String(entryId), 'delete', reason.trim());
    entry.editRequestId = delRes.requestId;
    entry.editRequestType = 'delete';
    entry.editRequestStatus = 'pending';
    entry.editRequestReason = reason.trim();
    entry.editRequestBy = state.name;
    entry.editRequestByOrg = state.organizationName || null;
    try { state.editRequests = await DB.getEditRequests(); } catch (e2) {}
    alert('Delete request sent to consultant for approval.');
    navigate(state.page);
  } catch (e) { alert('Failed: ' + (e.message || 'Unknown error')); }
}

// Consultant approves or rejects a request
async function resolveEditRequest(requestId, resolution) {
  const req = state.editRequests.find(r => r.id === requestId);
  if (!req) { alert('Request not found'); return; }
  const action = resolution === 'approved' ? 'approve' : 'reject';
  if (!confirm(action.charAt(0).toUpperCase() + action.slice(1) + ' this ' + req.requestType + ' request from ' + req.requestedBy + '?')) return;
  try {
    const res = await DB.resolveRequest(requestId, resolution);
    req.status = resolution;
    // If delete was approved, remove entry from local state
    if (resolution === 'approved' && req.requestType === 'delete') {
      state.entries = state.entries.filter(e => String(e.id) !== String(req.entryId));
    } else if (resolution === 'approved' && req.requestType === 'edit') {
      const entry = state.entries.find(e => String(e.id) === String(req.entryId));
      if (entry) entry.editRequestStatus = 'approved';
    } else {
      // Rejected — clear flags
      const entry = state.entries.find(e => String(e.id) === String(req.entryId));
      if (entry) { entry.editRequestId = null; entry.editRequestType = null; entry.editRequestStatus = null; entry.editRequestReason = null; entry.editRequestBy = null; entry.editRequestByOrg = null; }
    }
    try { state.editRequests = await DB.getEditRequests(); } catch (e2) {}
    // Re-open the modal on the requests tab
    const modalEl = document.getElementById('projectModalOverlay');
    if (modalEl) {
      const projIdx = modalEl.getAttribute('data-proj-idx');
      if (projIdx !== null) openProjectModal(parseInt(projIdx), {tab:'requests'});
    } else {
      navigate(state.page);
    }
  } catch (e) { alert('Failed: ' + (e.message || 'Unknown error')); }
}

// Consultant approves/rejects directly from entry row (no editRequests lookup needed)
async function resolveEditRequestFromEntry(entryId, resolution) {
  const entry = state.entries.find(e => String(e.id) === String(entryId));
  if (!entry) { alert('Entry not found'); return; }
  if (!entry.editRequestId) { alert('No edit request found on this entry.'); return; }

  const action = resolution === 'approved' ? 'approve' : 'reject';
  const reqType = entry.editRequestType || 'edit';
  const reqBy = entry.editRequestBy || 'contractor';
  if (!confirm(action.charAt(0).toUpperCase() + action.slice(1) + ' this ' + reqType + ' request from ' + reqBy + '?')) return;

  try {
    const res = await DB.resolveRequest(entry.editRequestId, resolution);

    if (resolution === 'approved' && reqType === 'delete') {
      state.entries = state.entries.filter(e => String(e.id) !== String(entryId));
    } else if (resolution === 'approved' && reqType === 'edit') {
      entry.editRequestStatus = 'approved';
    } else {
      entry.editRequestId = null;
      entry.editRequestType = null;
      entry.editRequestStatus = null;
      entry.editRequestReason = null;
      entry.editRequestBy = null;
      entry.editRequestByOrg = null;
    }

    try { state.editRequests = await DB.getEditRequests(); } catch (e2) {}

    // Re-open the modal on the contributors tab so consultant sees the update
    const modalEl = document.getElementById('projectModalOverlay');
    if (modalEl) {
      const projIdx = modalEl.getAttribute('data-proj-idx');
      if (projIdx !== null) openProjectModal(parseInt(projIdx), {tab:'contributors'});
    } else {
      navigate(state.page);
    }
  } catch (e) { alert('Failed: ' + (e.message || 'Unknown error')); }
}

// ===== FORCE DELETE / CORRECT (Consultant & Client) =====

// Force delete any entry — bypasses workflow, requires reason, creates audit trail
async function forceDeleteEntry(entryId) {
  const entry = state.entries.find(e => String(e.id) === String(entryId));
  if (!entry) { alert('Entry not found'); return; }
  const r = state.role;
  if (r !== 'consultant' && r !== 'client') { alert('Only consultants and clients can force-delete entries.'); return; }

  const blEF = entry.baselineEF || entry.baseline || 0;
  const acEF = entry.actualEF || entry.actual || 0;
  const ratio = blEF > 0 && acEF > 0 ? Math.round(acEF / blEF) : 0;
  const warning = ratio > 10 ? '\n\nThis entry has an EF ratio of ' + ratio + 'x (suspect data).' : '';

  const reason = prompt(
    'FORCE DELETE — ' + (entry.category || '') + ' - ' + (entry.type || '') +
    '\nStatus: ' + (entry.status || 'unknown') + ' | Actual: ' + fmt(entry.a13A) + ' tCO\u2082' +
    warning +
    '\n\nThis action is permanent and creates an audit trail.\nReason for deletion:'
  );
  if (reason === null) return;
  if (!reason.trim()) { alert('A reason is required for force-delete (audit trail).'); return; }

  if (!confirm('Permanently delete this entry?\n\n' + entry.category + ' - ' + entry.type + '\nQty: ' + fmtI(entry.qty) + ', Actual: ' + fmt(entry.a13A) + ' tCO\u2082\n\nThis cannot be undone.')) return;

  try {
    await DB.forceDeleteEntry(String(entryId), reason.trim());
    state.entries = state.entries.filter(e => String(e.id) !== String(entryId));
    alert('Entry deleted. Audit trail recorded.');
    // Refresh current view
    const modalEl = document.getElementById('projectModalOverlay');
    if (modalEl) {
      const projIdx = modalEl.getAttribute('data-proj-idx');
      if (projIdx !== null) openProjectModal(parseInt(projIdx), {tab: 'contributors'});
    } else {
      navigate(state.page);
    }
  } catch (e) { alert('Force delete failed: ' + (e.message || 'Unknown error')); }
}

// Show modal to correct EF value on a suspect entry
function showCorrectModal(entryId) {
  const entry = state.entries.find(e => String(e.id) === String(entryId));
  if (!entry) { alert('Entry not found'); return; }
  const r = state.role;
  if (r !== 'consultant' && r !== 'client') { alert('Only consultants and clients can correct entries.'); return; }

  const blEF = entry.baselineEF || entry.baseline || 0;
  const acEF = entry.actualEF || entry.actual || 0;
  const ratio = blEF > 0 && acEF > 0 ? Math.round(acEF / blEF) : 0;

  // Remove old modal
  const old = document.getElementById('correctEfOverlay'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'correctEfOverlay';
  ov.className = 'pm-overlay';

  ov.innerHTML = `
    <div class="pm-sheet" id="correctSheet" style="max-height:60vh;max-width:500px">
      <div class="pm-handle" onclick="document.getElementById('correctEfOverlay').remove()"><div class="pm-handle-bar"></div></div>
      <div class="pm-close" onclick="document.getElementById('correctEfOverlay').remove()">&times;</div>
      <div class="pm-scroll" style="padding:20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="width:40px;height:40px;border-radius:10px;background:rgba(248,113,113,0.15);display:flex;align-items:center;justify-content:center;font-size:20px">&#x26A0;&#xFE0F;</div>
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--text)">Correct EF Value</div>
            <div style="font-size:11px;color:var(--slate5)">${entry.category} - ${entry.type} | ${entry.monthLabel||'--'}</div>
          </div>
        </div>

        <div class="anomaly-banner" style="margin-bottom:16px;padding:10px 14px">
          <div style="font-size:12px;font-weight:700;color:var(--red)">Anomaly Detected: ${ratio}x baseline</div>
          <div style="font-size:11px;color:var(--slate4);margin-top:4px">The Actual EF (<strong>${fmt(acEF)}</strong>) is ${ratio}x the Baseline EF (<strong>${fmt(blEF)}</strong>). This is likely a typo where the total carbon was entered instead of the per-unit EF.</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div class="fg">
            <label style="font-size:11px;font-weight:700;color:var(--slate5)">Baseline EF</label>
            <input type="text" value="${fmt(blEF)}" disabled style="background:var(--bg4);color:var(--slate4);font-family:monospace" />
          </div>
          <div class="fg">
            <label style="font-size:11px;font-weight:700;color:var(--red)">Current Actual EF (wrong)</label>
            <input type="text" value="${fmt(acEF)}" disabled style="background:rgba(248,113,113,0.08);color:var(--red);font-family:monospace;font-weight:700" />
          </div>
        </div>

        <div class="fg" style="margin-bottom:12px">
          <label style="font-size:12px;font-weight:700;color:var(--green)">Corrected Actual EF</label>
          <input type="number" step="any" id="correctNewEF" placeholder="e.g. ${fmt(blEF * 0.8)}" style="font-size:14px;font-family:monospace;font-weight:700" />
          <div style="font-size:10px;color:var(--slate5);margin-top:4px">Enter the correct per-unit emission factor from the EPD</div>
        </div>

        <div class="fg" style="margin-bottom:16px">
          <label style="font-size:12px;font-weight:700;color:var(--text)">Reason for correction</label>
          <input type="text" id="correctReason" placeholder="e.g. Contractor entered total carbon instead of per-unit EF" />
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-sm" onclick="document.getElementById('correctEfOverlay').remove()" style="padding:8px 18px;font-size:12px;background:var(--bg3);color:var(--text);border:1px solid var(--border)">Cancel</button>
          <button class="btn btn-sm" onclick="submitCorrectEF('${entryId}')" style="padding:8px 18px;font-size:12px;background:rgba(52,211,153,0.15);color:var(--green);border:1px solid rgba(52,211,153,0.3);font-weight:700">Apply Correction</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(ov);
  setTimeout(() => {
    ov.classList.add('open');
    const sheet = document.getElementById('correctSheet');
    if (sheet) sheet.classList.add('open');
    document.getElementById('correctNewEF').focus();
  }, 50);
}

// Submit the EF correction
async function submitCorrectEF(entryId) {
  const entry = state.entries.find(e => String(e.id) === String(entryId));
  if (!entry) { alert('Entry not found'); return; }

  const newEF = parseFloat(document.getElementById('correctNewEF').value);
  const reason = (document.getElementById('correctReason').value || '').trim();

  if (isNaN(newEF) || newEF <= 0) { alert('Please enter a valid positive EF value.'); return; }
  if (!reason) { alert('A reason is required for the audit trail.'); return; }

  // Recalculate derived values
  const qty = Number(entry.qty) || 0;
  const massFactor = Number(entry.massFactor) || 1;
  const blEF = Number(entry.baselineEF || entry.baseline) || 0;
  const newActual = qty * massFactor * newEF / 1000; // tCO2
  const newBaseline = qty * massFactor * blEF / 1000;

  if (!confirm('Correct this entry?\n\nActual EF: ' + fmt(entry.actualEF || entry.actual) + ' \u2192 ' + fmt(newEF) + '\nActual tCO\u2082: ' + fmt(entry.a13A) + ' \u2192 ' + fmt(newActual) + '\n\nThis creates an audit trail.')) return;

  try {
    const corrections = {
      actualEF: newEF,
      actual: newEF,
      a13A: newActual,
      a13B: newBaseline,
      pct: newBaseline > 0 ? ((newBaseline - newActual) / newBaseline) * 100 : 0,
      a14: newActual + (Number(entry.a4) || 0)
    };
    await DB.forceCorrectEntry(String(entryId), corrections, reason);

    // Update local state
    Object.assign(entry, corrections);
    entry._anomalyFlag = null;
    entry._anomalyRatio = null;

    // Close modal and refresh
    const ov = document.getElementById('correctEfOverlay');
    if (ov) ov.remove();
    alert('Entry corrected. Audit trail recorded.');

    const modalEl = document.getElementById('projectModalOverlay');
    if (modalEl) {
      const projIdx = modalEl.getAttribute('data-proj-idx');
      if (projIdx !== null) openProjectModal(parseInt(projIdx), {tab: 'contributors'});
    } else {
      navigate(state.page);
    }
  } catch (e) { alert('Correction failed: ' + (e.message || 'Unknown error')); }
}

// Contractor opens edit form for an approved-edit entry
function openEditEntryForm(entryId) {
  const entry = state.entries.find(e => String(e.id) === String(entryId));
  if (!entry) { alert('Entry not found'); return; }
  // Remove old edit overlay
  const old = document.getElementById('editEntryOverlay'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'editEntryOverlay';
  ov.className = 'pm-overlay';

  const m = MATERIALS[entry.category];
  const efUnit = m ? m.efUnit : '';
  const unit = m ? m.unit : '';

  ov.innerHTML = `
    <div class="pm-sheet" id="editSheet" style="max-height:70vh">
      <div class="pm-handle" onclick="closeEditForm()"><div class="pm-handle-bar"></div></div>
      <div class="pm-close" onclick="closeEditForm()">&times;</div>
      <div class="pm-scroll">
        <div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:4px">Edit Entry</div>
        <div style="font-size:11px;color:var(--slate5);margin-bottom:14px">${entry.category} \u2014 ${entry.type} | ${entry.monthLabel} | ${entry.projectName||''}</div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
          <div class="fg"><label style="font-size:10px;font-weight:700;color:var(--text3)">Quantity (${unit})</label>
            <input type="number" id="editQty" value="${entry.qty}" style="width:100%;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px"></div>
          <div class="fg"><label style="font-size:10px;font-weight:700;color:var(--text3)">Actual EF (${efUnit})</label>
            <input type="number" id="editActEF" value="${entry.actualEF||entry.actual||''}" step="0.01" style="width:100%;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px"></div>
          <div class="fg"><label style="font-size:10px;font-weight:700;color:var(--text3)">Baseline EF</label>
            <input id="editBlEF" value="${entry.baselineEF||entry.baseline||''} ${efUnit}" readonly class="fg-readonly" style="width:100%;padding:8px 10px;background:var(--bg4);border:1px solid var(--border2);border-radius:8px;color:var(--slate5);font-size:13px"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
          <div class="fg"><label style="font-size:10px;font-weight:700;color:var(--text3)">Road (km)</label>
            <input type="number" id="editRoad" value="${entry.road||0}" style="width:100%;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px"></div>
          <div class="fg"><label style="font-size:10px;font-weight:700;color:var(--text3)">Sea (km)</label>
            <input type="number" id="editSea" value="${entry.sea||0}" style="width:100%;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px"></div>
          <div class="fg"><label style="font-size:10px;font-weight:700;color:var(--text3)">Train (km)</label>
            <input type="number" id="editTrain" value="${entry.train||0}" style="width:100%;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px"></div>
        </div>
        <div class="fg" style="margin-bottom:14px"><label style="font-size:10px;font-weight:700;color:var(--text3)">Notes</label>
          <input id="editNotes" value="${entry.notes||''}" style="width:100%;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px"></div>
        <div id="editPreview" style="margin-bottom:14px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" onclick="applyEntryEdit('${entryId}')" style="flex:1">Save Changes</button>
          <button class="btn btn-secondary" onclick="closeEditForm()">Cancel</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(ov);
  requestAnimationFrame(() => { ov.classList.add('pm-visible'); document.getElementById('editSheet').classList.add('pm-sheet-visible'); });
  ov.addEventListener('click', e => { if (e.target === ov) closeEditForm(); });

  // Preview the recalculated values
  previewEdit(entryId);
  ['editQty', 'editActEF', 'editRoad', 'editSea', 'editTrain'].forEach(id => {
    const el = $(id); if (el) el.addEventListener('input', () => previewEdit(entryId));
  });
}

function previewEdit(entryId) {
  const entry = state.entries.find(e => String(e.id) === String(entryId));
  if (!entry) return;
  const prev = $('editPreview'); if (!prev) return;
  const q = parseFloat($('editQty').value), a = parseFloat($('editActEF').value);
  if (isNaN(q) || isNaN(a) || q <= 0 || a <= 0) { prev.innerHTML = ''; return; }
  const m = MATERIALS[entry.category]; if (!m) return;
  const t = m.types.find(t => t.name === entry.type); if (!t) return;
  const mass = q * m.massFactor;
  const rd = parseFloat($('editRoad').value) || 0, se = parseFloat($('editSea').value) || 0, tr = parseFloat($('editTrain').value) || 0;
  const b = (q * t.baseline) / 1000, ac = (q * a) / 1000, a4 = (mass * rd * TEF.road + mass * se * TEF.sea + mass * tr * TEF.train) / 1000;
  const tot = ac + a4, pct = b > 0 ? ((b - ac) / b) * 100 : 0;
  const rc = _rc(pct, state.reductionTarget || 20);
  prev.innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
    <div style="padding:8px;background:var(--bg3);border-radius:8px;text-align:center"><div style="font-size:9px;color:var(--slate5)">Baseline</div><div style="font-size:14px;font-weight:800;color:var(--slate3)">${fmt(b)}</div></div>
    <div style="padding:8px;background:var(--bg3);border-radius:8px;text-align:center"><div style="font-size:9px;color:var(--slate5)">Actual</div><div style="font-size:14px;font-weight:800;color:var(--blue)">${fmt(ac)}</div></div>
    <div style="padding:8px;background:var(--bg3);border-radius:8px;text-align:center"><div style="font-size:9px;color:var(--slate5)">A4</div><div style="font-size:14px;font-weight:800;color:var(--orange)">${fmt(a4)}</div></div>
    <div style="padding:8px;background:var(--bg3);border-radius:8px;text-align:center"><div style="font-size:9px;color:var(--slate5)">Reduction</div><div style="font-size:14px;font-weight:800;color:${rc}">${fmt(pct)}%</div></div>
  </div>`;
}

async function applyEntryEdit(entryId) {
  const entry = state.entries.find(e => String(e.id) === String(entryId));
  if (!entry) { alert('Entry not found'); return; }
  const q = parseFloat($('editQty').value), a = parseFloat($('editActEF').value);
  if (isNaN(q) || isNaN(a) || q <= 0 || a <= 0) { alert('Enter valid Quantity and Actual EF.'); return; }

  const m = MATERIALS[entry.category]; if (!m) { alert('Material not found'); return; }
  const t = m.types.find(t => t.name === entry.type); if (!t) { alert('Type not found'); return; }
  const mass = q * m.massFactor;
  const rd = parseFloat($('editRoad').value) || 0, se = parseFloat($('editSea').value) || 0, tr = parseFloat($('editTrain').value) || 0;
  const b = (q * t.baseline) / 1000, ac = (q * a) / 1000, a4 = (mass * rd * TEF.road + mass * se * TEF.sea + mass * tr * TEF.train) / 1000;
  const pct = b > 0 ? ((b - ac) / b) * 100 : 0;

  const changes = {
    qty: q, actual: a, actualEF: a,
    road: rd, sea: se, train: tr,
    a13B: b, a13A: ac, a4, a14: ac + a4, pct,
    notes: $('editNotes').value || ''
  };

  if (!confirm('Apply these changes? The entry will be re-submitted for review.')) return;

  try {
    await DB.applyEdit(entryId, changes);
    // Update local state
    Object.assign(entry, changes);
    entry.editRequestId = null;
    entry.editRequestType = null;
    entry.editRequestStatus = null;
    entry.editRequestReason = null;
    entry.editRequestBy = null;
    entry.editRequestByOrg = null;
    entry.status = 'pending';
    try { state.editRequests = await DB.getEditRequests(); } catch (e2) {}
    closeEditForm();
    alert('Changes applied. Entry re-submitted for review.');
    navigate(state.page);
  } catch (e) { alert('Failed: ' + (e.message || 'Unknown error')); }
}

function closeEditForm() {
  const ov = document.getElementById('editEntryOverlay'); if (!ov) return;
  const sh = document.getElementById('editSheet'); if (sh) sh.classList.remove('pm-sheet-visible');
  ov.classList.remove('pm-visible'); setTimeout(() => ov.remove(), 350);
}

// ===== A5 =====
function renderA5(el){
  const yr=new Date().getFullYear(),mo=String(new Date().getMonth()+1).padStart(2,'0');
  const myProjects = (state.projects || []).filter(p => p.status === 'active');
  const projOptions = myProjects.map(p => `<option value="${p.id}" ${state.selectedProjectId === p.id ? 'selected' : ''}>${p.name}${p.code ? ' (' + p.code + ')' : ''}</option>`).join('');

  el.innerHTML=`<div class="card"><div class="card-title">A5 \u2014 Site Energy & Water</div>
  ${myProjects.length > 0 ? `<div class="form-row" style="margin-bottom:12px">
    <div class="fg" style="max-width:400px">
      <label style="font-weight:700;color:var(--blue)">Project <span style="color:var(--red)">*</span></label>
      <select id="a5Proj" onchange="onProjectSelect(this.value)">
        <option value="">Select project...</option>
        ${projOptions}
      </select>
    </div>
  </div>` : `<div style="padding:10px 14px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--red)">
    No projects assigned to you yet. Contact your administrator to assign you to a project before entering data.
  </div>`}
  <div class="form-row c3"><div class="fg"><label>Year</label><select id="a5Y">${[yr-1,yr,yr+1].map(y=>`<option ${y===yr?'selected':''}>${y}</option>`).join('')}</select></div>
  <div class="fg"><label>Month</label><select id="a5M">${MONTHS.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0')===mo?'selected':''}>${m}</option>`).join('')}</select></div>
  <div class="fg"><label>Source</label><select id="a5S" onchange="onA5S()"><optgroup label="Energy">${A5_EFS.energy.map((e,i)=>`<option value="e${i}">${e.name}</option>`).join('')}</optgroup><optgroup label="Water">${A5_EFS.water.map((e,i)=>`<option value="w${i}">${e.name}</option>`).join('')}</optgroup></select></div></div>
  <div class="form-row c3"><div class="fg"><label>Quantity</label><input type="number" id="a5Q" placeholder="Amount" oninput="calcA5()"><div class="fg-help" id="a5U">L</div></div>
  <div class="fg"><label>EF (auto)</label><input id="a5E" class="fg-readonly" readonly></div>
  <div class="fg"><label>Emission</label><input id="a5R" class="fg-readonly" readonly></div></div>
  <div class="btn-row"><button class="btn btn-primary" onclick="subA5()">\ud83d\udcbe Submit</button></div></div>
  <div class="card"><div class="card-title">A5 Entries</div><div class="tbl-wrap"><table><thead><tr><th>Project</th><th>Month</th><th>Source</th><th class="r">Qty</th><th>Unit</th><th class="r">Emission</th><th></th></tr></thead><tbody id="a5B"></tbody></table></div></div>`;
  onA5S(); rA5();
}
function getA5S(){const v=$('a5S').value;const t=v[0],i=parseInt(v.slice(1));return t==='e'?A5_EFS.energy[i]:A5_EFS.water[i];}
function onA5S(){const s=getA5S();$('a5E').value=s.ef+' '+s.efUnit;$('a5U').textContent=s.unit;calcA5();}
function calcA5(){const s=getA5S(),q=parseFloat($('a5Q').value);$('a5R').value=isNaN(q)?'':fmt((q*s.ef)/1000)+' tCO\u2082eq';}
async function subA5(){const s=getA5S(),q=parseFloat($('a5Q').value);if(isNaN(q)||q<=0){alert('Enter quantity');return;}
  const projEl=$('a5Proj');const projId=projEl?projEl.value:'';
  if(!projId){alert('Please select a project first.');return;}
  const proj=(state.projects||[]).find(p=>p.id===projId);
  const yr=$('a5Y').value,mo=$('a5M').value;const e={id:Date.now(),source:s.name,qty:q,unit:s.unit,ef:s.ef,emission:(q*s.ef)/1000,year:yr,month:mo,monthKey:yr+'-'+mo,monthLabel:MONTHS[parseInt(mo)-1]+' '+yr,projectId:projId,projectName:proj?proj.name:'',submittedBy:state.name,role:state.role};await DB.saveA5Entry(e);state.a5entries.push(e);rA5();$('a5Q').value='';$('a5R').value='\u2705 Saved';}
function rA5(){const t=$('a5B');if(!t)return;const a=[...state.a5entries].reverse();t.innerHTML=a.length?a.map(e=>`<tr><td style="font-weight:600;color:var(--blue);font-size:11px">${e.projectName||'--'}</td><td>${e.monthLabel}</td><td>${e.source}</td><td class="r mono">${fmtI(e.qty)}</td><td>${e.unit}</td><td class="r mono" style="font-weight:700">${fmt(e.emission)}</td><td><button class="btn btn-danger btn-sm" onclick="dA5(${e.id})">\u2715</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">No entries</td></tr>';}
async function dA5(id){await DB.deleteA5Entry(id);state.a5entries=state.a5entries.filter(e=>e.id!==id);rA5();}

// ===== APPROVALS =====
function renderApprovals(el){
  const r=state.role;
  // Consultant sees both pending (to forward/approve) and review (to approve) items
  // Entries are already filtered server-side by assignment
  const items=r==='consultant'?state.entries.filter(e=>e.status==='pending'||e.status==='review'):r==='client'?state.entries.filter(e=>e.status==='review'):state.entries;

  // Detect outlier entries across ALL entries (not just pending)
  const outliers = state.entries.filter(e => {
    const bl = e.baselineEF || e.baseline || 0;
    const ac = e.actualEF || e.actual || 0;
    return bl > 0 && ac > 0 && ac / bl > 10;
  });
  const anomalyBanner = (r === 'consultant' || r === 'client') && outliers.length > 0
    ? `<div class="card anomaly-banner">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-size:28px">&#x26A0;&#xFE0F;</div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:800;color:var(--red)">Data Integrity Alert: ${outliers.length} Suspect Entr${outliers.length===1?'y':'ies'}</div>
            <div style="font-size:11px;color:var(--slate4);margin-top:2px">Entries where Actual EF exceeds 10x the Baseline EF. These may be typos or malicious data that will corrupt analytics. Use <strong>Fix EF</strong> to correct or <strong>Del</strong> to remove.</div>
          </div>
        </div>
        <div class="tbl-wrap" style="margin-top:10px"><table>
          <thead><tr><th>Project</th><th>Month</th><th>Material</th><th>Type</th><th>By</th><th class="r">BL EF</th><th class="r">Act EF</th><th class="r">Ratio</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${outliers.map(e => {
            const bl=e.baselineEF||e.baseline;const ac=e.actualEF||e.actual;const ratio=Math.round(ac/bl);
            return `<tr style="background:rgba(248,113,113,0.06)">
              <td style="font-weight:600;color:var(--blue);font-size:11px">${e.projectName||'--'}</td>
              <td style="font-size:11px">${e.monthLabel||'--'}</td>
              <td style="font-size:11px;font-weight:600">${e.category||'--'}</td>
              <td style="font-size:11px">${e.type||'--'}</td>
              <td style="font-size:11px">${e.submittedBy||'--'}</td>
              <td class="r mono" style="font-size:11px">${fmt(bl)}</td>
              <td class="r mono" style="font-size:11px;color:var(--red);font-weight:700">${fmt(ac)}</td>
              <td class="r mono" style="font-size:11px;color:var(--red);font-weight:800">${ratio}x</td>
              <td><span class="badge ${e.status}" style="font-size:9px">${e.status}</span></td>
              <td class="force-actions"><button class="btn btn-sm anomaly-fix-btn" onclick="showCorrectModal('${e.id}')" title="Fix EF value">Fix EF</button><button class="btn btn-sm force-del-btn" onclick="forceDeleteEntry('${e.id}')" title="Force delete">Del</button></td>
            </tr>`;}).join('')}
          </tbody>
        </table></div>
      </div>`
    : '';

  // Show assignment info banner for consultants
  const assignInfo = r==='consultant' && state.assignments.length > 0
    ? `<div class="card"><div class="card-title">Your Assignments</div><div style="padding:10px 14px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:10px;font-size:13px;color:var(--blue)">You are reviewing submissions from <strong>${state.assignments.map(a=>a.contractorName).join(', ')}</strong>. Only their entries appear here.</div></div>`
    : '';

  // Build delete requests section for consultant (edit requests no longer needed — contractors edit directly)
  const editReqHtml = r === 'consultant' ? (() => {
    const delReqEntries = state.entries.filter(e => e.editRequestStatus === 'pending' && e.editRequestType === 'delete' && e.editRequestId);
    if (delReqEntries.length === 0) return '';
    return `<div class="card" style="border:1px solid rgba(251,146,60,0.3);background:rgba(251,146,60,0.03)"><div class="card-title" style="color:var(--orange)">Delete Requests (${delReqEntries.length})</div>
    <div style="font-size:11px;color:var(--slate5);margin:-8px 14px 10px 14px">Contractors are requesting permission to delete entries below</div>
    <div class="tbl-wrap"><table><thead><tr><th>Project</th><th>Material</th><th>Type</th><th>By</th><th>Reason</th><th class="r">Qty</th><th class="r">Actual</th><th>Actions</th></tr></thead>
    <tbody>${delReqEntries.map(e => `<tr>
      <td style="font-weight:600;color:var(--blue);font-size:11px">${e.projectName||'--'}</td>
      <td>${e.category||'--'}</td><td>${e.type||'--'}</td>
      <td style="font-size:11px">${e.editRequestBy||e.submittedBy||'--'}<br><span style="font-size:9px;color:var(--slate5)">${e.editRequestByOrg||e.organizationName||''}</span></td>
      <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(e.editRequestReason||'').replace(/"/g,'&quot;')}">${e.editRequestReason||'--'}</td>
      <td class="r mono">${fmtI(e.qty)}</td><td class="r mono">${fmt(e.a13A)}</td>
      <td><button class="btn btn-sm" onclick="resolveEditRequestFromEntry('${e.id}','approved')" style="font-size:9px;padding:2px 8px;background:rgba(52,211,153,0.15);color:var(--green);border:1px solid rgba(52,211,153,0.3);font-weight:700">Approve</button> <button class="btn btn-sm" onclick="resolveEditRequestFromEntry('${e.id}','rejected')" style="font-size:9px;padding:2px 8px;background:rgba(248,113,113,0.15);color:var(--red);border:1px solid rgba(248,113,113,0.3);font-weight:700">Reject</button></td>
    </tr>`).join('')}</tbody></table></div></div>`;
  })() : '';

  el.innerHTML=`${anomalyBanner}${assignInfo}${editReqHtml}<div class="card"><div class="card-title">Workflow</div>
  <div class="flow-steps"><div class="flow-step"><div class="flow-dot done">\ud83c\udfd7\ufe0f</div><div class="flow-label">Contractor</div></div><div class="flow-line done"></div><div class="flow-step"><div class="flow-dot ${r==='consultant'?'current':'done'}">\ud83d\udccb</div><div class="flow-label">Consultant</div></div><div class="flow-line ${r==='client'||r==='consultant'?'done':''}"></div><div class="flow-step"><div class="flow-dot ${r==='client'?'current':(r==='consultant'?'done':'')}">\ud83d\udc54</div><div class="flow-label">Client</div></div></div></div>
  <div class="card"><div class="card-title">${items.length} Items</div><div class="tbl-wrap"><table><thead><tr><th>Project</th><th>Month</th><th>Material</th><th>Type</th><th>By</th><th>Org</th><th class="r">Baseline</th><th class="r">Actual</th><th class="r">Reduction</th><th>Status</th>${r!=='contractor'?'<th>Actions</th>':''}</tr></thead><tbody>${items.length?items.map(e=>{const _bl=e.baselineEF||e.baseline||0;const _ac=e.actualEF||e.actual||0;const _suspect=_bl>0&&_ac>0&&_ac/_bl>10;return`<tr${_suspect?' style="background:rgba(248,113,113,0.06)"':''}>
  <td style="font-weight:600;color:var(--blue);font-size:11px">${e.projectName||'--'}</td><td>${e.monthLabel}</td><td>${e.category}</td><td>${e.type}</td><td>${e.submittedBy||'\u2014'}</td><td style="font-size:11px;color:var(--slate5)">${e.organizationName||'\u2014'}</td><td class="r mono">${fmt(e.a13B)}</td><td class="r mono"${_suspect?' style="color:var(--red);font-weight:700"':''}>${fmt(e.a13A)}${_suspect?' !!':''}</td><td class="r mono" style="color:${e.pct>20?'var(--green)':'var(--orange)'};font-weight:700">${fmt(e.pct)}%</td><td><span class="badge ${e.status}">${e.status}</span></td>${r==='consultant'?`<td>${e.status==='pending'?`<button class="btn btn-approve btn-sm" onclick="appr('${e.id}','review')">\u2713 Forward</button> `:''}${e.status==='pending'||e.status==='review'?`<button class="btn btn-primary btn-sm" onclick="appr('${e.id}','approved')">\u2713 Approve</button> `:''}<button class="btn btn-danger btn-sm" onclick="appr('${e.id}','rejected')">\u2715 Reject</button>${_suspect?` <button class="btn btn-sm anomaly-fix-btn" onclick="showCorrectModal('${e.id}')">Fix</button>`:''} <button class="btn btn-sm force-del-btn" onclick="forceDeleteEntry('${e.id}')">Del</button></td>`:''}${r==='client'?`<td><button class="btn btn-approve btn-sm" onclick="appr('${e.id}','approved')">\u2713 Approve</button> <button class="btn btn-danger btn-sm" onclick="appr('${e.id}','rejected')">\u2715 Reject</button>${_suspect?` <button class="btn btn-sm anomaly-fix-btn" onclick="showCorrectModal('${e.id}')">Fix</button>`:''} <button class="btn btn-sm force-del-btn" onclick="forceDeleteEntry('${e.id}')">Del</button></td>`:''}</tr>`}).join(''):'<tr><td colspan="11" class="empty">No pending items</td></tr>'}</tbody></table></div></div>`;
}
async function appr(id,s){await DB.updateEntry(id,{status:s,[state.role+'At']:new Date().toISOString(),[state.role+'By']:state.name,[state.role+'ByUid']:state.uid});const e=state.entries.find(x=>String(x.id)===String(id));if(e)e.status=s;buildSidebar();navigate('approvals');}

// ===== PROJECT FILTER HELPER =====
function buildProjectFilterHtml(selectId, onchangeFn) {
  const myProjects = state.projects || [];
  if (myProjects.length === 0) return '';
  return `<div style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
    <label style="font-size:13px;font-weight:600;color:var(--blue);white-space:nowrap">Filter by Project:</label>
    <select id="${selectId}" onchange="${onchangeFn}" style="max-width:300px">
      <option value="">All Projects</option>
      ${myProjects.map(p => `<option value="${p.id}" ${state.selectedProjectId === p.id ? 'selected' : ''}>${p.name}${p.code ? ' (' + p.code + ')' : ''}</option>`).join('')}
    </select>
  </div>`;
}

function getFilteredEntries() {
  if (!state.selectedProjectId) return state.entries;
  return state.entries.filter(e => e.projectId === state.selectedProjectId);
}

// ===== MONTHLY =====
function renderMonthly(el){
  const entries = getFilteredEntries();
  const map={};entries.forEach(e=>{if(!map[e.monthKey])map[e.monthKey]={l:e.monthLabel,n:0,b:0,a:0,a4:0,t:0};const m=map[e.monthKey];m.n++;m.b+=e.a13B;m.a+=e.a13A;m.a4+=e.a4;m.t+=e.a14;});
  const arr=Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
  let gB=0,gA=0,gA4=0,gT=0;
  el.innerHTML=`${buildProjectFilterHtml('monthlyProjFilter','state.selectedProjectId=this.value;renderMonthly(document.getElementById(\"pageBody\"))')}<div class="card"><div class="card-title">Monthly Summary${state.selectedProjectId ? ' — ' + ((state.projects||[]).find(p=>p.id===state.selectedProjectId)||{}).name : ''}</div><div class="tbl-wrap"><table><thead><tr><th>Month</th><th class="r">Entries</th><th class="r">A1-A3 Baseline</th><th class="r">A1-A3 Actual</th><th class="r">A4</th><th class="r">A1-A4 Total</th><th class="r">Reduction</th></tr></thead><tbody>${arr.length?arr.map(([k,m])=>{gB+=m.b;gA+=m.a;gA4+=m.a4;gT+=m.t;const p=m.b>0?((m.b-m.a)/m.b)*100:0;return`<tr><td>${m.l}</td><td class="r">${m.n}</td><td class="r mono">${fmt(m.b)}</td><td class="r mono">${fmt(m.a)}</td><td class="r mono">${fmt(m.a4)}</td><td class="r mono" style="font-weight:700">${fmt(m.t)}</td><td class="r mono" style="color:${p>20?'var(--green)':'var(--orange)'};font-weight:700">${fmt(p)}%</td></tr>`;}).join('')+(arr.length>1?`<tr class="total-row"><td>Total</td><td class="r">${entries.length}</td><td class="r">${fmt(gB)}</td><td class="r">${fmt(gA)}</td><td class="r">${fmt(gA4)}</td><td class="r">${fmt(gT)}</td><td class="r" style="color:var(--green)">${fmt(gB>0?((gB-gA)/gB)*100:0)}%</td></tr>`:''):'<tr><td colspan="7" class="empty">No data</td></tr>'}</tbody></table></div></div>`;
}

// ===== CUMULATIVE =====
function renderCumulative(el){
  const entries = getFilteredEntries();
  const map={};entries.forEach(e=>{if(!map[e.monthKey])map[e.monthKey]={l:e.monthLabel,b:0,a:0,a4:0};map[e.monthKey].b+=e.a13B;map[e.monthKey].a+=e.a13A;map[e.monthKey].a4+=e.a4;});
  const arr=Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
  let cB=0,cA=0,cA4=0;
  const cum=arr.map(([k,v])=>{cB+=v.b;cA+=v.a;cA4+=v.a4;return{l:v.l,mb:v.b,ma:v.a,cB,cA,cA4,cT:cA+cA4,cP:cB>0?((cB-cA)/cB)*100:0};});
  const mx=Math.max(...cum.map(c=>Math.max(c.cB,c.cA)),1);
  el.innerHTML=`${buildProjectFilterHtml('cumProjFilter','state.selectedProjectId=this.value;renderCumulative(document.getElementById(\"pageBody\"))')}<div class="card"><div class="card-title">Cumulative Tracking${state.selectedProjectId ? ' — ' + ((state.projects||[]).find(p=>p.id===state.selectedProjectId)||{}).name : ''}</div>${cum.length?`<div class="chart-legend"><span><span class="chart-legend-dot" style="background:rgba(148,163,184,0.4)"></span> Baseline</span><span><span class="chart-legend-dot" style="background:rgba(96,165,250,0.5)"></span> Actual</span></div><div class="bar-chart" style="height:180px">${cum.map(c=>`<div class="bar-group"><div class="bar-pair"><div class="bar baseline" style="height:${(c.cB/mx)*160}px"></div><div class="bar actual" style="height:${(c.cA/mx)*160}px"></div></div><div class="bar-label">${c.l}</div></div>`).join('')}</div>`:''}
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
      <strong style="color:var(--blue)">How it works:</strong> The client hires consultant firms (e.g., Acme Consulting, XYZ Engineering).
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
        <input id="orgName" placeholder="e.g. Acme Consulting, XYZ Contractors" />
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
      Define which consultant firm oversees which contractor company. Optionally scope to a specific project.
    </div>
    <div class="form-row c4">
      <div class="fg">
        <label>Consultant Firm</label>
        <select id="linkConsultantOrg"><option value="">Select...</option></select>
      </div>
      <div class="fg">
        <label>Contractor Company</label>
        <select id="linkContractorOrg"><option value="">Select...</option></select>
      </div>
      <div class="fg">
        <label>Project (optional)</label>
        <select id="linkProject"><option value="">All projects</option></select>
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
      Assign a specific consultant to review a specific contractor's submissions. Optionally scope to a specific project.
    </div>
    <div class="form-row c4">
      <div class="fg">
        <label>Consultant</label>
        <select id="assignConsultant"><option value="">Select consultant...</option></select>
      </div>
      <div class="fg">
        <label>Contractor</label>
        <select id="assignContractor"><option value="">Select contractor...</option></select>
      </div>
      <div class="fg">
        <label>Project (optional)</label>
        <select id="assignProject"><option value="">All projects</option></select>
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
      Assign team members to their organization (firm or company). Optionally specify the project.
    </div>
    <div class="form-row c4">
      <div class="fg">
        <label>User</label>
        <select id="userToAssign"><option value="">Select user...</option></select>
      </div>
      <div class="fg">
        <label>Organization</label>
        <select id="orgToAssignTo"><option value="">Select organization...</option></select>
      </div>
      <div class="fg">
        <label>Project (optional)</label>
        <select id="userOrgProject"><option value="">All projects</option></select>
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
    <thead><tr><th>Consultant Firm</th><th></th><th>Contractor Company</th><th>Project</th><th>Actions</th></tr></thead>
    <tbody>${links.map(l => `<tr>
      <td style="font-weight:600;color:var(--green)">${l.consultantOrgName}</td>
      <td style="color:var(--slate5);text-align:center">→</td>
      <td style="font-weight:600;color:var(--blue)">${l.contractorOrgName}</td>
      <td style="font-size:12px;color:var(--purple)">${l.projectName || 'All projects'}</td>
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
    <thead><tr><th>Consultant</th><th>Org</th><th></th><th>Contractor</th><th>Org</th><th>Project</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>${assignments.map(a => `<tr>
      <td style="font-weight:600;color:var(--green)">${a.consultantName}</td>
      <td style="font-size:11px;color:var(--slate5)">${a.consultantOrgName || '—'}</td>
      <td style="color:var(--slate5);text-align:center">→</td>
      <td style="font-weight:600;color:var(--blue)">${a.contractorName}</td>
      <td style="font-size:11px;color:var(--slate5)">${a.contractorOrgName || '—'}</td>
      <td style="font-size:12px;color:var(--purple)">${a.projectName || 'All projects'}</td>
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
  const projects = state.projects || [];
  const projectOptions = projects.map(p => `<option value="${p.id}">${p.name}${p.code ? ' (' + p.code + ')' : ''}</option>`).join('');

  // Link dropdowns
  const lcEl = $('linkConsultantOrg');
  const lrEl = $('linkContractorOrg');
  if (lcEl) lcEl.innerHTML = '<option value="">Select consultant firm...</option>' + firms.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  if (lrEl) lrEl.innerHTML = '<option value="">Select contractor company...</option>' + companies.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  const lpEl = $('linkProject');
  if (lpEl) lpEl.innerHTML = '<option value="">All projects</option>' + projectOptions;

  // Assignment dropdowns
  const acEl = $('assignConsultant');
  const arEl = $('assignContractor');
  if (acEl) acEl.innerHTML = '<option value="">Select consultant...</option>' + consultants.map(u => `<option value="${u.uid}">${u.name} (${u.email})${u.organizationName ? ' — ' + u.organizationName : ''}</option>`).join('');
  if (arEl) arEl.innerHTML = '<option value="">Select contractor...</option>' + contractors.map(u => `<option value="${u.uid}">${u.name} (${u.email})${u.organizationName ? ' — ' + u.organizationName : ''}</option>`).join('');
  const apEl = $('assignProject');
  if (apEl) apEl.innerHTML = '<option value="">All projects</option>' + projectOptions;

  // User-to-org dropdowns
  const uEl = $('userToAssign');
  const oEl = $('orgToAssignTo');
  if (uEl) uEl.innerHTML = '<option value="">Select user...</option>' + users.filter(u => u.role !== 'client').map(u => `<option value="${u.uid}">${u.name} (${u.role})${u.organizationName ? ' — ' + u.organizationName : ''}</option>`).join('');
  if (oEl) oEl.innerHTML = '<option value="">Select organization...</option>' + orgs.map(o => `<option value="${o.id}">${o.name} (${o.type.replace('_', ' ')})</option>`).join('');
  const uopEl = $('userOrgProject');
  if (uopEl) uopEl.innerHTML = '<option value="">All projects</option>' + projectOptions;
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
  const projectId = $('linkProject') ? $('linkProject').value : '';

  if (!consultantOrgId || !contractorOrgId) { showError('linkError', 'Select both a consultant firm and a contractor company.'); return; }

  try {
    await DB.linkOrgs(consultantOrgId, contractorOrgId, projectId);
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
  const projectId = $('assignProject') ? $('assignProject').value : '';

  if (!consultantUid || !contractorUid) { showError('assignError', 'Select both a consultant and a contractor.'); return; }

  try {
    await DB.createAssignment(consultantUid, contractorUid, projectId);
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
  const projectId = $('userOrgProject') ? $('userOrgProject').value : '';

  if (!userId || !orgId) { showError('userOrgError', 'Select both a user and an organization.'); return; }

  try {
    await DB.assignUserToOrg(userId, orgId, projectId);
    showSuccess('userOrgError', 'User assigned to organization.');
    await loadOrgData();
  } catch (e) {
    showError('userOrgError', e.message || 'Failed to assign user.');
  }
}

// ===== PROJECTS MANAGEMENT =====
async function renderProjects(el) {
  const r = state.role;
  const canManage = r === 'client';

  el.innerHTML = `
  <!-- Project Overview -->
  <div class="card">
    <div class="card-title">Project Portfolio</div>
    <div style="padding:12px 16px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:10px;font-size:13px;color:var(--slate4);line-height:1.7">
      <strong style="color:var(--blue)">How it works:</strong> Each project represents a distinct construction/infrastructure initiative.
      Consultant firms and contractor companies are assigned per project. Users (consultants, contractors) are also assigned
      to specific projects they work on. One consultant or contractor can be linked to many projects.<br>
      <span style="color:var(--slate5)">Client (all projects) | Consultant (assigned projects) | Contractor (assigned projects)</span>
    </div>
  </div>

  ${canManage ? `
  <!-- Package Templates Management -->
  <div class="card">
    <div class="card-title">Package Templates</div>
    <div style="padding:10px 14px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--purple)">
      Define reusable package templates for your tenant. Projects select from these templates.
    </div>
    <div id="pkgTplList" style="margin-bottom:12px"><div style="font-size:12px;color:var(--slate5);text-align:center;padding:8px">Loading templates...</div></div>
    <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px">
      <div class="fg">
        <label>Template Name</label>
        <input id="pkgTplName" placeholder="e.g. Airfield, Terminal, Utilities" />
      </div>
      <div class="fg">
        <label>Code (optional)</label>
        <input id="pkgTplCode" placeholder="e.g. AF, TRM, UTL" />
      </div>
      <div class="fg" style="display:flex;align-items:flex-end">
        <button class="btn btn-primary" onclick="createPackageTemplate()">+ Add Template</button>
      </div>
    </div>
    <div class="login-error" id="pkgTplError" style="margin-top:12px"></div>
    <div class="login-error" id="pkgTplSuccess" style="margin-top:12px"></div>
    <div id="pkgMigrationBar" style="display:none;margin-top:12px;padding:10px 14px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:10px;font-size:12px;color:var(--yellow)">
      Legacy package data detected. <button class="btn btn-sm" onclick="runPackageMigration()" style="margin-left:8px">Migrate Now</button>
    </div>
  </div>

  <!-- Create Project -->
  <div class="card">
    <div class="card-title">Create New Project</div>
    <div class="form-row c3">
      <div class="fg">
        <label>Project Name</label>
        <input id="projName" placeholder="e.g. PA Apron Phase 1, Terminal 2 Expansion" />
      </div>
      <div class="fg">
        <label>Project Code (optional)</label>
        <input id="projCode" placeholder="e.g. PA-PH1, T2-EXP" />
      </div>
      <div class="fg">
        <label>Description (optional)</label>
        <input id="projDesc" placeholder="Brief description of the project" />
      </div>
    </div>
    <div style="margin-top:8px">
      <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block">Packages (select from templates)</label>
      <div id="projPkgSelect" style="display:flex;flex-wrap:wrap;gap:8px;padding:10px 14px;background:var(--bg3);border-radius:10px;min-height:40px">
        <span style="font-size:12px;color:var(--slate5)">Loading templates...</span>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <input id="projPkgInlineName" placeholder="New package name..." style="flex:1;max-width:250px;font-size:12px" />
        <button class="btn btn-sm" onclick="inlineCreatePackageTemplate()" style="font-size:11px;white-space:nowrap">+ Add &amp; Select</button>
      </div>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn btn-primary" id="projCreateBtn" onclick="createProject()">+ Create Project</button>
    </div>
    <div class="login-error" id="projError" style="margin-top:12px"></div>
    <div class="login-error" id="projSuccess" style="margin-top:12px"></div>
  </div>` : ''}

  <!-- Data loading warning banner (shown if API calls fail) -->
  <div id="projDataWarning" style="display:none;padding:12px 16px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:10px;font-size:12px;color:var(--red);margin-bottom:12px;line-height:1.6"></div>

  <!-- Projects List -->
  <div class="card">
    <div class="card-title">Projects</div>
    <div id="projList"><div class="empty"><div class="empty-icon">...</div>Loading projects...</div></div>
  </div>

  ${canManage || state.role === 'consultant' || state.role === 'contractor' ? `

  <!-- Link Consultant / PMC / Delivery Partner / Engineer to Project -->
  ${canManage ? `<div class="card">
    <div class="card-title">Link Consultant / PMC / Delivery Partner / Engineer</div>
    <div style="padding:10px 14px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--green)">
      Assign a consultant firm to a project in a specific capacity. The consultant in-charge will have authority to manage their team and link contractors.
    </div>
    <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:12px">
      <div class="fg">
        <label>Project</label>
        <select id="projConsProject"><option value="">Select project...</option></select>
      </div>
      <div class="fg">
        <label>Consultant Firm</label>
        <select id="projConsOrg"><option value="">Select consultant firm...</option></select>
      </div>
      <div class="fg">
        <label>Role</label>
        <select id="projConsRole">
          <option value="Consultant">Consultant</option>
          <option value="PMC">PMC</option>
          <option value="Delivery Partner">Delivery Partner</option>
          <option value="Engineer">Engineer</option>
        </select>
      </div>
      <div class="fg" style="display:flex;align-items:flex-end">
        <button class="btn btn-primary" onclick="linkConsultantToProject()">Link</button>
      </div>
    </div>
    <div class="login-error" id="projConsError" style="margin-top:12px"></div>
    <div id="projConsOrgList" style="margin-top:12px"></div>
  </div>` : ''}

  <!-- Link Contractor to Project -->
  ${canManage ? `<div class="card">
    <div class="card-title">Link Contractor to Project</div>
    <div style="padding:10px 14px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--blue)">
      Link a contractor company directly to a project, or let the assigned consultant in-charge handle this (after granting permission above).
    </div>
    <div class="form-row c3">
      <div class="fg">
        <label>Project</label>
        <select id="projContProject"><option value="">Select project...</option></select>
      </div>
      <div class="fg">
        <label>Contractor Company</label>
        <select id="projContOrg"><option value="">Select contractor company...</option></select>
      </div>
      <div class="fg" style="display:flex;align-items:flex-end">
        <button class="btn btn-primary" onclick="linkContractorToProject()">Link</button>
      </div>
    </div>
    <div class="login-error" id="projContError" style="margin-top:12px"></div>
    <div id="projContOrgList" style="margin-top:12px"></div>
  </div>` : ''}
  ${state.role === 'consultant' ? `<div class="card" id="consultantContractorCard">
    <div class="card-title">Link Contractor to Project</div>
    <div style="padding:10px 14px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--blue)">
      Link contractor companies to projects where you have been granted linking permission by the client. Only allowed contractors will appear.
    </div>
    <div class="form-row c3">
      <div class="fg">
        <label>Project</label>
        <select id="projContProject" onchange="filterContractorsByPermission()"><option value="">Select project...</option></select>
      </div>
      <div class="fg">
        <label>Contractor Company</label>
        <select id="projContOrg"><option value="">Select project first...</option></select>
      </div>
      <div class="fg" style="display:flex;align-items:flex-end">
        <button class="btn btn-primary" onclick="linkContractorToProject()">Link</button>
      </div>
    </div>
    <div class="login-error" id="projContError" style="margin-top:12px"></div>
    <div id="projContOrgList" style="margin-top:12px"></div>
  </div>` : ''}

  <!-- Assign User to Project -->
  <div class="card">
    <div class="card-title">Assign User to Project</div>
    <div style="padding:10px 14px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--yellow)">
      ${canManage ? 'Assign an in-charge or team member to a project. The in-charge can then manage their own team assignments.' :
        state.role === 'consultant' ? 'As consultant in-charge, assign your team members or contractor representatives to projects you manage.' :
        'As contractor in-charge, assign your team members to projects you manage.'}
    </div>
    <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px">
      <div class="fg">
        <label>Project</label>
        <select id="projUserProject"><option value="">Select project...</option></select>
      </div>
      <div class="fg">
        <label>User</label>
        <select id="projUserUser"><option value="">Select user...</option></select>
      </div>
      <div class="fg">
        <label>Designation</label>
        <select id="projUserDesignation">
          <option value="in_charge">In-Charge</option>
          <option value="team_member">Team Member</option>
        </select>
      </div>
      <div class="fg" style="display:flex;align-items:flex-end">
        <button class="btn btn-primary" onclick="assignUserToProject()">Assign</button>
      </div>
    </div>
    <div class="login-error" id="projUserError" style="margin-top:12px"></div>
    <div id="projUserList" style="margin-top:12px"></div>
  </div>` : ''}`;

  await loadProjectData();
}

async function loadProjectData() {
  // Fetch each independently so one slow call can't block the others
  // Track errors so we can show a warning banner if something goes wrong
  const errors = [];

  const [projects, users, orgs, projAssignments, projOrgLinks, pkgTemplates, consultantPerms] = await Promise.all([
    DB.getProjects().catch(e => { errors.push('Projects: ' + (e.message || 'failed')); return state.projects || []; }),
    DB.getUsers().catch(e => { errors.push('Users: ' + (e.message || 'failed')); return state.users || []; }),
    DB.getOrganizations().catch(e => { errors.push('Organizations: ' + (e.message || 'failed')); return state.organizations || []; }),
    DB.getProjectAssignments().catch(e => { errors.push('Assignments: ' + (e.message || 'failed')); return state.projectAssignments || []; }),
    DB.getProjectOrgLinks().catch(e => { errors.push('Org links: ' + (e.message || 'failed')); return state.projectOrgLinks || []; }),
    DB.getPackageTemplates(state.role === 'client').catch(e => { errors.push('Pkg templates: ' + (e.message || 'failed')); return state.packageTemplates || []; }),
    DB.getConsultantPermissions().catch(e => { errors.push('Consultant perms: ' + (e.message || 'failed')); return state.consultantPermissions || {}; })
  ]);

  state.projects = projects;
  state.users = users;
  state.organizations = orgs;
  state.projectAssignments = projAssignments;
  state.projectOrgLinks = projOrgLinks;
  state.packageTemplates = pkgTemplates;
  state.consultantPermissions = consultantPerms;

  renderProjectList(projects);
  renderProjectOrgLinks(projOrgLinks);
  renderProjectUserAssignments(projAssignments);
  renderPackageTemplatesList(pkgTemplates);
  renderPackageCheckboxes(pkgTemplates);
  populateProjectDropdowns(projects, users, orgs);

  // Detect legacy package data for migration banner
  const hasLegacy = projects.some(p => p.package && typeof p.package === 'string' && !p.packageIds);
  const migBar = $('pkgMigrationBar');
  if (migBar) migBar.style.display = hasLegacy ? 'block' : 'none';

  // Show warning banner if any API calls failed
  const bannerEl = $('projDataWarning');
  if (errors.length > 0) {
    console.error('[PROJECTS] Data loading errors:', errors);
    if (bannerEl) {
      bannerEl.style.display = 'block';
      bannerEl.innerHTML = '<strong>Warning:</strong> Some data could not be loaded. ' + errors.join('; ') +
        '<br><button class="btn btn-sm" onclick="this.parentElement.style.display=\'none\';loadProjectData();" style="margin-top:6px">Retry</button>';
    }
  } else if (bannerEl) {
    bannerEl.style.display = 'none';
  }
}

function renderProjectList(projects) {
  const el = $('projList');
  if (!el) return;

  if (!projects.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div>No projects yet. Create one above.</div>';
    return;
  }

  const canManage = state.role === 'client';

  // Build project cards with summary info
  const projAssignments = state.projectAssignments || [];
  const projOrgLinks = state.projectOrgLinks || [];

  el.innerHTML = `${canManage ? `<div id="projBulkBar" style="display:none;padding:10px 14px;margin-bottom:10px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:10px;display:none;align-items:center;gap:10px">
    <span id="projSelCount" style="font-size:13px;color:var(--red);font-weight:600"></span>
    <button class="btn btn-danger btn-sm" onclick="bulkDeleteProjects()">Delete Selected</button>
    <button class="btn btn-sm" onclick="toggleAllProjects(false)" style="font-size:12px">Clear Selection</button>
  </div>` : ''}
  <div class="tbl-wrap"><table>
    <thead><tr>${canManage ? '<th style="width:36px"><input type="checkbox" id="projSelectAll" onchange="toggleAllProjects(this.checked)" title="Select all" /></th>' : ''}<th>Project</th><th>Code</th><th>Package</th><th>Description</th><th>Consultant Firms</th><th>Contractor Companies</th><th>In-Charge</th><th>Team</th><th>Status</th><th>Created</th>${canManage ? '<th>Actions</th>' : ''}</tr></thead>
    <tbody>${projects.map(p => {
      const pAssign = projAssignments.filter(a => a.projectId === p.id);
      const pOrgs = projOrgLinks.filter(l => l.projectId === p.id);
      const consOrgs = pOrgs.filter(l => l.orgType === 'consultant_firm');
      const contOrgs = pOrgs.filter(l => l.orgType === 'contractor_company');
      const inChargeCount = pAssign.filter(a => a.designation === 'in_charge').length;
      const teamCount = pAssign.filter(a => a.designation !== 'in_charge').length;
      const statusClass = p.status === 'active' ? 'approved' : p.status === 'completed' ? 'review' : 'pending';
      const consOrgNames = consOrgs.map(l => '<span class="badge approved" style="font-size:10px;margin:1px">' + l.orgName + ' (' + (l.role || 'Consultant') + ')</span>').join(' ') || '<span style="color:var(--slate5);font-size:11px">--</span>';
      const contOrgNames = contOrgs.map(l => '<span class="badge review" style="font-size:10px;margin:1px">' + l.orgName + '</span>').join(' ') || '<span style="color:var(--slate5);font-size:11px">--</span>';
      // Resolve packageIds to names using templates
      const tplMap = {};
      (state.packageTemplates || []).forEach(t => { tplMap[t.id] = t; });
      let pkgBadges = '--';
      if (p.packageIds && typeof p.packageIds === 'object') {
        const ids = Object.keys(p.packageIds);
        if (ids.length > 0) {
          pkgBadges = ids.map(id => {
            const tpl = tplMap[id];
            const name = tpl ? tpl.name : id;
            return '<span class="badge" style="background:rgba(139,92,246,0.1);color:var(--purple);font-size:10px;margin:1px">' + name + '</span>';
          }).join(' ');
        }
      } else if (p.package) {
        // Legacy single string (pre-migration)
        pkgBadges = '<span class="badge" style="background:rgba(139,92,246,0.1);color:var(--purple);font-size:10px">' + p.package + '</span>';
      }
      return `<tr>
        ${canManage ? `<td><input type="checkbox" class="proj-sel" value="${p.id}" onchange="updateProjSelection()" /></td>` : ''}
        <td style="font-weight:600">${p.name || ''}</td>
        <td style="color:var(--blue);font-family:monospace;font-size:12px">${p.code || '--'}</td>
        <td style="font-size:11px">${pkgBadges}</td>
        <td style="color:var(--slate5);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${p.description || '--'}</td>
        <td style="font-size:11px">${consOrgNames}</td>
        <td style="font-size:11px">${contOrgNames}</td>
        <td class="r"><span style="color:var(--yellow);font-weight:700" title="In-Charge personnel">${inChargeCount}</span></td>
        <td class="r"><span style="color:var(--green);font-weight:700" title="Team members">${teamCount}</span></td>
        <td><span class="badge ${statusClass}" style="text-transform:capitalize">${p.status || 'active'}</span></td>
        <td style="color:var(--slate5);font-size:11px">${new Date(p.createdAt).toLocaleDateString()}</td>
        ${canManage ? `<td><button class="btn btn-danger btn-sm" onclick="deleteProject('${p.id}')">Delete</button></td>` : ''}
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function renderProjectOrgLinks(links) {
  const consultantLinks = links.filter(l => l.orgType === 'consultant_firm');
  const contractorLinks = links.filter(l => l.orgType === 'contractor_company');

  const isClient = state.role === 'client';
  const canUnlink = isClient; // Only client can unlink any org

  // Render consultant org links (with permissions management for client)
  const consEl = $('projConsOrgList');
  if (consEl) {
    if (!consultantLinks.length) {
      consEl.innerHTML = '<div style="font-size:12px;color:var(--slate5);text-align:center;padding:8px">No consultant firms linked yet.</div>';
    } else {
      const perms = state.consultantPermissions || {};
      consEl.innerHTML = `<div class="tbl-wrap"><table>
        <thead><tr><th>Project</th><th>Consultant Firm</th><th>Role</th><th>Linked By</th>${isClient ? '<th>Can Link Contractors</th><th>Allowed Contractors</th><th>Actions</th>' : ''}</tr></thead>
        <tbody>${consultantLinks.map(l => {
          const projPerms = (perms[l.projectId] || {})[l.orgId] || {};
          const canLink = !!projPerms.canLinkContractors;
          const allowedIds = projPerms.allowedContractorOrgIds || {};
          const allowedNames = Object.keys(allowedIds).map(id => {
            const org = (state.organizations || []).find(o => o.id === id);
            return org ? org.name : id;
          });
          return `<tr>
          <td style="font-weight:600;color:var(--blue)">${l.projectName}</td>
          <td style="font-weight:600">${l.orgName}</td>
          <td><span class="badge approved">${l.role || 'Consultant'}</span></td>
          <td style="color:var(--slate5);font-size:12px">${l.createdByName || '--'}</td>
          ${isClient ? `
          <td>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">
              <input type="checkbox" ${canLink ? 'checked' : ''} onchange="toggleConsultantLinkPerm('${l.projectId}','${l.orgId}',this.checked)" />
              <span style="color:${canLink ? 'var(--green)' : 'var(--slate5)'}">${canLink ? 'Yes' : 'No'}</span>
            </label>
          </td>
          <td>
            ${allowedNames.length > 0 ? allowedNames.map(n => '<span class="badge review" style="font-size:10px;margin:1px">' + n + '</span>').join(' ') : '<span style="color:var(--slate5);font-size:11px">All (no restriction)</span>'}
            <button class="btn btn-sm" style="font-size:10px;margin-left:4px;padding:2px 8px" onclick="editAllowedContractors('${l.projectId}','${l.orgId}')">Edit</button>
          </td>
          <td><button class="btn btn-danger btn-sm" onclick="unlinkOrgFromProject('${l.id}')">Unlink</button></td>
          ` : ''}
        </tr>`; }).join('')}</tbody>
      </table></div>`;
    }
  }

  // Render contractor org links
  const contEl = $('projContOrgList');
  if (contEl) {
    if (!contractorLinks.length) {
      contEl.innerHTML = '<div style="font-size:12px;color:var(--slate5);text-align:center;padding:8px">No contractor companies linked yet.</div>';
    } else {
      contEl.innerHTML = `<div class="tbl-wrap"><table>
        <thead><tr><th>Project</th><th>Contractor Company</th><th>Linked By</th>${canUnlink ? '<th>Actions</th>' : ''}</tr></thead>
        <tbody>${contractorLinks.map(l => `<tr>
          <td style="font-weight:600;color:var(--blue)">${l.projectName}</td>
          <td style="font-weight:600">${l.orgName}</td>
          <td style="color:var(--slate5);font-size:12px">${l.createdByName || '--'} <span class="badge ${l.createdByRole === 'client' ? 'approved' : 'review'}" style="font-size:10px">${l.createdByRole || ''}</span></td>
          ${canUnlink ? `<td><button class="btn btn-danger btn-sm" onclick="unlinkOrgFromProject('${l.id}')">Unlink</button></td>` : ''}
        </tr>`).join('')}</tbody>
      </table></div>`;
    }
  }
}

function renderProjectUserAssignments(assignments) {
  const el = $('projUserList');
  if (!el) return;

  if (!assignments.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--slate5);text-align:center;padding:8px">No users assigned to projects yet.</div>';
    return;
  }

  // Determine which projects current user is in-charge of
  const myInChargeProjects = new Set();
  if (state.role === 'consultant' || state.role === 'contractor') {
    assignments.forEach(a => {
      if (a.userId === state.uid && a.designation === 'in_charge') myInChargeProjects.add(a.projectId);
    });
  }

  // Group by project for clarity
  const byProject = {};
  assignments.forEach(a => {
    if (!byProject[a.projectId]) byProject[a.projectId] = { name: a.projectName, id: a.projectId, items: [] };
    byProject[a.projectId].items.push(a);
  });

  let html = '';
  Object.values(byProject).forEach(group => {
    // Sort: in-charge first, then team members
    group.items.sort((a, b) => {
      if (a.designation === 'in_charge' && b.designation !== 'in_charge') return -1;
      if (b.designation === 'in_charge' && a.designation !== 'in_charge') return 1;
      return (a.userName || '').localeCompare(b.userName || '');
    });
    const showActions = state.role === 'client' || myInChargeProjects.has(group.id);
    html += `<div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:1px;padding:6px 0">${group.name}</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>User</th><th>Designation</th><th>Role</th><th>Organization</th><th>Assigned By</th>${showActions ? '<th>Actions</th>' : ''}</tr></thead>
        <tbody>${group.items.map(a => {
          const desigBadge = a.designation === 'in_charge'
            ? '<span class="badge" style="background:rgba(251,191,36,0.15);color:var(--yellow);font-weight:700">In-Charge</span>'
            : '<span class="badge" style="background:rgba(148,163,184,0.12);color:var(--slate5)">Team Member</span>';
          // Consultant can only remove own org members + contractor team; contractor can only remove own org
          let canRemoveThis = false;
          if (state.role === 'client') {
            canRemoveThis = true;
          } else if (state.role === 'consultant' && myInChargeProjects.has(group.id)) {
            canRemoveThis = a.userRole !== 'client' && a.userId !== state.uid;
          } else if (state.role === 'contractor' && myInChargeProjects.has(group.id)) {
            canRemoveThis = a.userOrgId === state.organizationId && a.userId !== state.uid;
          }
          return `<tr>
          <td style="font-weight:600">${a.userName}</td>
          <td>${desigBadge}</td>
          <td><span class="badge ${a.userRole === 'consultant' ? 'approved' : a.userRole === 'contractor' ? 'review' : 'pending'}" style="text-transform:capitalize">${a.userRole}</span></td>
          <td style="color:var(--slate5);font-size:12px">${a.userOrgName || '--'}</td>
          <td style="color:var(--slate5);font-size:12px">${a.createdByName || '--'} <span class="badge" style="font-size:10px;background:rgba(148,163,184,0.08);color:var(--slate5)">${a.createdByRole || ''}</span></td>
          ${showActions ? `<td>${canRemoveThis ? `<button class="btn btn-danger btn-sm" onclick="removeUserFromProject('${a.id}')">Remove</button>` : ''}</td>` : ''}
        </tr>`; }).join('')}</tbody>
      </table></div>
    </div>`;
  });

  el.innerHTML = html;
}

function populateProjectDropdowns(projects, users, orgs) {
  const projOpts = '<option value="">Select project...</option>' + projects.map(p => `<option value="${p.id}">${p.name}${p.code ? ' (' + p.code + ')' : ''}</option>`).join('');

  const consultantOrgs = orgs.filter(o => o.type === 'consultant_firm');
  const contractorOrgs = orgs.filter(o => o.type === 'contractor_company');

  // Consultant linking dropdowns (client only)
  const cpEl = $('projConsProject');
  const coEl = $('projConsOrg');
  if (cpEl) cpEl.innerHTML = projOpts;
  if (coEl) coEl.innerHTML = '<option value="">Select consultant firm...</option>' + consultantOrgs.map(o => `<option value="${o.id}">${o.name}</option>`).join('');

  // Contractor linking dropdowns
  const ctpEl = $('projContProject');
  const ctoEl = $('projContOrg');
  if (ctpEl) {
    if (state.role === 'consultant') {
      // For consultants: show only projects where they have canLinkContractors permission
      const perms = state.consultantPermissions || {};
      const allowedProjects = projects.filter(p => {
        const projPerms = perms[p.id] || {};
        const myOrgPerms = projPerms[state.organizationId] || {};
        return !!myOrgPerms.canLinkContractors;
      });
      ctpEl.innerHTML = '<option value="">Select project...</option>' + allowedProjects.map(p => `<option value="${p.id}">${p.name}${p.code ? ' (' + p.code + ')' : ''}</option>`).join('');
      // Default contractor dropdown to "select project first"
      if (ctoEl) ctoEl.innerHTML = '<option value="">Select project first...</option>';
    } else {
      ctpEl.innerHTML = projOpts;
      if (ctoEl) ctoEl.innerHTML = '<option value="">Select contractor company...</option>' + contractorOrgs.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    }
  }

  // Hide consultant contractor card if no projects with permission
  if (state.role === 'consultant') {
    const card = $('consultantContractorCard');
    if (card) {
      const perms = state.consultantPermissions || {};
      const hasAnyPerm = projects.some(p => {
        const projPerms = perms[p.id] || {};
        const myOrgPerms = projPerms[state.organizationId] || {};
        return !!myOrgPerms.canLinkContractors;
      });
      card.style.display = hasAnyPerm ? '' : 'none';
    }
  }

  // User assignment dropdowns
  const upEl = $('projUserProject');
  const uuEl = $('projUserUser');
  if (upEl) upEl.innerHTML = projOpts;

  // Filter users based on current user's role
  let availableUsers = users.filter(u => u.role !== 'client');
  if (state.role === 'contractor') {
    // Contractor in-charge can only assign own org members
    availableUsers = availableUsers.filter(u => u.organizationId === state.organizationId);
  } else if (state.role === 'consultant') {
    // Consultant in-charge can assign own org members + contractor users
    availableUsers = availableUsers.filter(u => u.role === 'consultant' || u.role === 'contractor');
  }
  if (uuEl) uuEl.innerHTML = '<option value="">Select user...</option>' + availableUsers.map(u => `<option value="${u.uid}">${u.name} (${u.role})${u.organizationName ? ' - ' + u.organizationName : ''}</option>`).join('');
}

// === CONSULTANT CONTRACTOR PERMISSION FILTERING ===
function filterContractorsByPermission() {
  const projectId = $('projContProject') && $('projContProject').value;
  const ctoEl = $('projContOrg');
  if (!ctoEl) return;

  if (!projectId) {
    ctoEl.innerHTML = '<option value="">Select project first...</option>';
    return;
  }

  const perms = state.consultantPermissions || {};
  const projPerms = perms[projectId] || {};
  const myOrgPerms = projPerms[state.organizationId] || {};
  const allowedIds = myOrgPerms.allowedContractorOrgIds || {};
  const hasRestrictions = Object.keys(allowedIds).length > 0;

  const contractorOrgs = (state.organizations || []).filter(o => o.type === 'contractor_company');
  const filtered = hasRestrictions ? contractorOrgs.filter(o => allowedIds[o.id]) : contractorOrgs;

  ctoEl.innerHTML = '<option value="">Select contractor company...</option>' + filtered.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
}

// === CONSULTANT PERMISSIONS MANAGEMENT (CLIENT ONLY) ===
async function toggleConsultantLinkPerm(projectId, consultantOrgId, canLink) {
  try {
    // Preserve existing allowedContractorOrgIds
    const perms = state.consultantPermissions || {};
    const existing = (perms[projectId] || {})[consultantOrgId] || {};
    await DB.setConsultantPermissions(projectId, consultantOrgId, {
      canLinkContractors: canLink,
      allowedContractorOrgIds: existing.allowedContractorOrgIds || {}
    });
    await loadProjectData();
  } catch (e) {
    console.error('[PROJECT] Toggle consultant perm failed:', e);
    alert(e.message || 'Failed to update consultant permissions.');
  }
}

async function editAllowedContractors(projectId, consultantOrgId) {
  const perms = state.consultantPermissions || {};
  const existing = (perms[projectId] || {})[consultantOrgId] || {};
  const currentAllowed = existing.allowedContractorOrgIds || {};

  const contractorOrgs = (state.organizations || []).filter(o => o.type === 'contractor_company');
  if (!contractorOrgs.length) { alert('No contractor companies found. Create one first.'); return; }

  // Build a simple checklist prompt
  const lines = contractorOrgs.map(o => {
    const checked = currentAllowed[o.id] ? '[x]' : '[ ]';
    return checked + ' ' + o.name;
  });
  const input = prompt(
    'Select allowed contractors for this consultant on this project.\n' +
    'Enter comma-separated numbers (1-based) of contractors to allow.\n' +
    'Leave empty for "all contractors allowed" (no restriction).\n\n' +
    contractorOrgs.map((o, i) => (i + 1) + '. ' + o.name + (currentAllowed[o.id] ? ' (currently allowed)' : '')).join('\n')
  );

  if (input === null) return; // cancelled

  const newAllowed = {};
  if (input.trim()) {
    const nums = input.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= contractorOrgs.length);
    nums.forEach(n => { newAllowed[contractorOrgs[n - 1].id] = true; });
  }

  try {
    await DB.setConsultantPermissions(projectId, consultantOrgId, {
      canLinkContractors: !!existing.canLinkContractors,
      allowedContractorOrgIds: newAllowed
    });
    await loadProjectData();
  } catch (e) {
    console.error('[PROJECT] Edit allowed contractors failed:', e);
    alert(e.message || 'Failed to update allowed contractors.');
  }
}

async function createProject() {
  const errEl = $('projError');
  const sucEl = $('projSuccess');
  const btn = $('projCreateBtn');
  if (errEl) errEl.style.display = 'none';
  if (sucEl) sucEl.style.display = 'none';

  const name = ($('projName') && $('projName').value || '').trim();
  const code = ($('projCode') && $('projCode').value || '').trim();
  const desc = ($('projDesc') && $('projDesc').value || '').trim();

  // Collect selected package template IDs from checkboxes
  const packageIds = {};
  document.querySelectorAll('.proj-pkg-cb:checked').forEach(cb => {
    packageIds[cb.value] = true;
  });

  if (!name) { showError('projError', 'Please enter a project name.'); return; }

  // Disable button and show loading state
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }
  console.log('[PROJECT] Creating project:', name, code, packageIds, desc);

  try {
    const result = await DB.createProject(name, desc, code, packageIds);
    console.log('[PROJECT] Create result:', result);
    showSuccess('projSuccess', 'Project "' + name + '" created successfully.');
    if ($('projName')) $('projName').value = '';
    if ($('projCode')) $('projCode').value = '';
    if ($('projDesc')) $('projDesc').value = '';
    document.querySelectorAll('.proj-pkg-cb').forEach(cb => { cb.checked = false; });

    // Immediately add to state for instant UI feedback
    if (result && result.project) {
      state.projects = [...(state.projects || []), result.project];
      renderProjectList(state.projects);
      populateProjectDropdowns(state.projects, state.users || [], state.organizations || []);
    }

    // Full sync to confirm server state — awaited so the list is always accurate
    await loadProjectData();
  } catch (e) {
    console.error('[PROJECT] Create failed:', e);
    showError('projError', e.message || 'Failed to create project. Check the browser console for details.');
  } finally {
    // Always re-enable the button
    if (btn) { btn.disabled = false; btn.textContent = '+ Create Project'; }
  }
}

// === PACKAGE TEMPLATE FUNCTIONS ===

function renderPackageTemplatesList(templates) {
  const el = $('pkgTplList');
  if (!el) return;

  if (!templates.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--slate5);text-align:center;padding:8px">No package templates yet. Create one below.</div>';
    return;
  }

  el.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>Name</th><th>Code</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>${templates.map(t => `<tr>
      <td style="font-weight:600">${t.name}</td>
      <td style="color:var(--blue);font-family:monospace;font-size:12px">${t.code || '--'}</td>
      <td><span class="badge ${t.isActive !== false ? 'approved' : 'pending'}">${t.isActive !== false ? 'Active' : 'Inactive'}</span></td>
      <td style="color:var(--slate5);font-size:11px">${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '--'}</td>
      <td>${t.isActive !== false
        ? '<button class="btn btn-danger btn-sm" onclick="deactivatePackageTemplate(\'' + t.id + '\')">Deactivate</button>'
        : '<button class="btn btn-sm" onclick="reactivatePackageTemplate(\'' + t.id + '\')">Reactivate</button>'
      }</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderPackageCheckboxes(templates) {
  const el = $('projPkgSelect');
  if (!el) return;

  const active = templates.filter(t => t.isActive !== false);
  if (!active.length) {
    el.innerHTML = '<span style="font-size:12px;color:var(--slate5)">No active templates. Create one in Package Templates above.</span>';
    return;
  }

  el.innerHTML = active.map(t =>
    `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;padding:4px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:12px;user-select:none">
      <input type="checkbox" class="proj-pkg-cb" value="${t.id}" style="margin:0" />
      <span>${t.name}</span>${t.code ? '<span style="color:var(--blue);font-size:10px;margin-left:2px">(' + t.code + ')</span>' : ''}
    </label>`
  ).join('');
}

async function createPackageTemplate() {
  const errEl = $('pkgTplError');
  const sucEl = $('pkgTplSuccess');
  if (errEl) errEl.style.display = 'none';
  if (sucEl) sucEl.style.display = 'none';

  const name = ($('pkgTplName') && $('pkgTplName').value || '').trim();
  const code = ($('pkgTplCode') && $('pkgTplCode').value || '').trim();

  if (!name) { showError('pkgTplError', 'Template name is required.'); return; }

  try {
    await DB.createPackageTemplate(name, code);
    showSuccess('pkgTplSuccess', 'Package template "' + name + '" created.');
    if ($('pkgTplName')) $('pkgTplName').value = '';
    if ($('pkgTplCode')) $('pkgTplCode').value = '';
    await loadProjectData();
  } catch (e) {
    console.error('[PKG_TPL] Create failed:', e);
    showError('pkgTplError', e.message || 'Failed to create package template.');
  }
}

async function inlineCreatePackageTemplate() {
  const nameEl = $('projPkgInlineName');
  const name = (nameEl && nameEl.value || '').trim();
  if (!name) return;

  try {
    const result = await DB.createPackageTemplate(name, '');
    if (nameEl) nameEl.value = '';
    // Reload templates and re-render checkboxes
    const templates = await DB.getPackageTemplates(false);
    state.packageTemplates = templates;
    renderPackageTemplatesList(templates);
    renderPackageCheckboxes(templates);
    // Auto-select the newly created template
    if (result && result.template) {
      setTimeout(() => {
        const cb = document.querySelector('.proj-pkg-cb[value="' + result.template.id + '"]');
        if (cb) cb.checked = true;
      }, 50);
    }
  } catch (e) {
    console.error('[PKG_TPL] Inline create failed:', e);
    showError('projError', e.message || 'Failed to create package template.');
  }
}

async function deactivatePackageTemplate(templateId) {
  if (!confirm('Deactivate this package template? It will no longer appear for new projects.')) return;
  try {
    await DB.updatePackageTemplate(templateId, { isActive: false });
    await loadProjectData();
  } catch (e) {
    console.error('[PKG_TPL] Deactivate failed:', e);
    alert(e.message || 'Failed to deactivate package template.');
  }
}

async function reactivatePackageTemplate(templateId) {
  try {
    await DB.updatePackageTemplate(templateId, { isActive: true });
    await loadProjectData();
  } catch (e) {
    console.error('[PKG_TPL] Reactivate failed:', e);
    alert(e.message || 'Failed to reactivate package template.');
  }
}

async function runPackageMigration() {
  if (!confirm('Migrate legacy package data to templates? This will create templates from existing package names and link them to projects.')) return;
  try {
    const result = await DB.migratePackages();
    alert('Migration complete: ' + (result.migrated || 0) + ' projects migrated, ' + (result.templatesCreated || 0) + ' templates created.');
    await loadProjectData();
  } catch (e) {
    console.error('[PKG_TPL] Migration failed:', e);
    alert(e.message || 'Failed to run migration.');
  }
}

async function deleteProject(projectId) {
  if (!confirm('Delete this project? All assignments and org links for this project will also be removed.')) return;
  try {
    await DB.deleteProject(projectId);
    await loadProjectData();
  } catch (e) {
    console.error('[PROJECT] Delete failed:', e);
    alert(e.message || 'Failed to delete project.');
  }
}

function toggleAllProjects(checked) {
  document.querySelectorAll('.proj-sel').forEach(cb => { cb.checked = checked; });
  const selectAll = $('projSelectAll');
  if (selectAll) selectAll.checked = checked;
  updateProjSelection();
}

function updateProjSelection() {
  const checked = document.querySelectorAll('.proj-sel:checked');
  const bar = $('projBulkBar');
  const countEl = $('projSelCount');
  const selectAll = $('projSelectAll');
  const total = document.querySelectorAll('.proj-sel');
  if (bar) bar.style.display = checked.length > 0 ? 'flex' : 'none';
  if (countEl) countEl.textContent = checked.length + ' project' + (checked.length === 1 ? '' : 's') + ' selected';
  if (selectAll) selectAll.checked = total.length > 0 && checked.length === total.length;
}

async function bulkDeleteProjects() {
  const ids = Array.from(document.querySelectorAll('.proj-sel:checked')).map(cb => cb.value);
  if (!ids.length) return;
  if (!confirm('Delete ' + ids.length + ' project' + (ids.length === 1 ? '' : 's') + '? All assignments and org links for these projects will also be removed.')) return;
  try {
    await DB.bulkDeleteProjects(ids);
    await loadProjectData();
  } catch (e) {
    console.error('[PROJECT] Bulk delete failed:', e);
    alert(e.message || 'Failed to delete projects.');
  }
}

async function linkConsultantToProject() {
  const errEl = $('projConsError');
  if (errEl) errEl.style.display = 'none';

  const projectId = $('projConsProject') && $('projConsProject').value;
  const orgId = $('projConsOrg') && $('projConsOrg').value;
  const role = $('projConsRole') && $('projConsRole').value;

  if (!projectId || !orgId) { showError('projConsError', 'Select both a project and a consultant firm.'); return; }

  try {
    await DB.linkOrgToProject(orgId, projectId, role || 'Consultant');
    await loadProjectData();
  } catch (e) {
    console.error('[PROJECT] Link consultant failed:', e);
    showError('projConsError', e.message || 'Failed to link consultant firm to project.');
  }
}

async function linkContractorToProject() {
  const errEl = $('projContError');
  if (errEl) errEl.style.display = 'none';

  const projectId = $('projContProject') && $('projContProject').value;
  const orgId = $('projContOrg') && $('projContOrg').value;

  if (!projectId || !orgId) { showError('projContError', 'Select both a project and a contractor company.'); return; }

  try {
    await DB.linkOrgToProject(orgId, projectId, 'Contractor');
    await loadProjectData();
  } catch (e) {
    console.error('[PROJECT] Link contractor failed:', e);
    showError('projContError', e.message || 'Failed to link contractor company to project.');
  }
}

async function unlinkOrgFromProject(linkId) {
  if (!confirm('Remove this organization from the project?')) return;
  try {
    await DB.unlinkOrgFromProject(linkId);
    await loadProjectData();
  } catch (e) {
    console.error('[PROJECT] Unlink org failed:', e);
    alert(e.message || 'Failed to unlink organization from project.');
  }
}

async function assignUserToProject() {
  const errEl = $('projUserError');
  if (errEl) errEl.style.display = 'none';

  const projectId = $('projUserProject') && $('projUserProject').value;
  const userId = $('projUserUser') && $('projUserUser').value;
  const designation = $('projUserDesignation') && $('projUserDesignation').value;

  if (!projectId || !userId) { showError('projUserError', 'Select both a project and a user.'); return; }

  try {
    await DB.assignUserToProject(userId, projectId, designation || 'team_member');
    showSuccess('projUserError', 'User assigned to project.');
    await loadProjectData();
  } catch (e) {
    console.error('[PROJECT] Assign user failed:', e);
    showError('projUserError', e.message || 'Failed to assign user to project.');
  }
}

async function removeUserFromProject(assignmentId) {
  if (!confirm('Remove this user from the project?')) return;
  try {
    await DB.removeUserFromProject(assignmentId);
    await loadProjectData();
  } catch (e) {
    console.error('[PROJECT] Remove user failed:', e);
    alert(e.message || 'Failed to remove user from project.');
  }
}

// ===== INTEGRATIONS =====
function renderIntegrations(el){
  const apis=[{i:"\ud83d\udd17",n:"EPD Hub API",d:"Auto-fetch emission factors"},{i:"\ud83d\udcca",n:"EC3 / Building Transparency",d:"Material carbon benchmarks"},{i:"\ud83c\udf10",n:"One Click LCA",d:"Whole-building LCA sync"},{i:"\ud83d\udce1",n:"IEA Data API",d:"Grid emission factors by region"},{i:"\ud83d\udcc1",n:"Power BI Export",d:"Advanced analytics export"},{i:"\ud83d\udd10",n:"Project Portal",d:"Project management sync"},{i:"\u2601\ufe0f",n:"Firebase Cloud DB",d:"Real-time cloud database",on:dbConnected},{i:"\ud83d\udce7",n:"Email Notifications",d:"Stakeholder alerts"}];
  el.innerHTML=`<div class="card"><div class="card-title">Integration Hub</div>${apis.map(a=>`<div class="api-item"><div class="api-left"><span class="api-icon">${a.i}</span><div><div class="api-name">${a.n}</div><div class="api-desc">${a.d}</div></div></div><div class="toggle${a.on?' on':''}" onclick="this.classList.toggle('on')"></div></div>`).join('')}</div>
  <div class="card"><div class="card-title">Database Status</div><div style="padding:16px;background:var(--bg3);border-radius:10px;font-size:13px"><strong style="color:${dbConnected?'var(--green)':'var(--red)'}">●</strong> ${dbConnected?'Connected to Firebase Cloud Database \u2014 data syncs in real-time across all users':'Running in offline mode \u2014 data saved locally. Connect Firebase for cloud sync.'}<br><br><span style="color:var(--slate5);font-size:11px">Database: Firebase Realtime DB | Cloud Sync Enabled</span></div></div>`;
}
