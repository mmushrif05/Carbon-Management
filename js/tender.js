// ===== TENDER EMISSIONS MODULE =====
// Projected emissions from tender/BOQ quantities with scenario comparison

// ---- State for active editing ----
let _tenderEdit = null;   // scenario being edited (null = list view)
let _tenderItems = [];    // line items for current scenario

// ===== TENDER ENTRY PAGE =====
function renderTenderEntry(el) {
  if (_tenderEdit) { renderTenderForm(el); return; }
  // List view — show all scenarios with summary
  const scenarios = state.tenderScenarios;
  el.innerHTML = `
  <div class="card">
    <div class="card-title">Tender Scenarios</div>
    <div class="btn-row" style="margin-bottom:16px">
      <button class="btn btn-primary" onclick="newTenderScenario()">+ New Scenario</button>
    </div>
    ${scenarios.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Scenario</th><th>Description</th><th class="r">Items</th><th class="r">Baseline (tCO\u2082)</th><th class="r">Target (tCO\u2082)</th><th class="r">Reduction</th><th>Status</th><th>Created By</th><th></th></tr></thead>
      <tbody>${scenarios.map(s => {
        const nItems = (s.items || []).length;
        const tB = s.totalBaseline || 0;
        const tT = s.totalTarget || 0;
        const rP = s.reductionPct || 0;
        return `<tr>
          <td style="font-weight:700;color:var(--text)">${esc(s.name)}</td>
          <td style="color:var(--slate4);font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.description || '')}</td>
          <td class="r mono">${nItems}</td>
          <td class="r mono">${fmt(tB)}</td>
          <td class="r mono" style="color:var(--green)">${fmt(tT)}</td>
          <td class="r mono" style="color:${rP > 20 ? 'var(--green)' : rP >= 10 ? 'var(--orange)' : 'var(--purple)'};font-weight:700">${fmt(rP)}%</td>
          <td><span class="badge ${s.status === 'submitted' ? 'review' : s.status === 'approved' ? 'approved' : 'pending'}">${s.status || 'draft'}</span></td>
          <td style="font-size:11px;color:var(--slate5)">${esc(s.createdBy || '')}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="editTenderScenario('${s.id}')">Edit</button>
            <button class="btn btn-secondary btn-sm" onclick="dupTenderScenario('${s.id}')" title="Duplicate">Clone</button>
            <button class="btn btn-danger btn-sm" onclick="delTenderScenario('${s.id}')">Del</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : '<div class="empty"><div class="empty-icon">\ud83d\udccb</div>No tender scenarios yet. Create one to project emissions from BOQ quantities.</div>'}
  </div>`;
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function newTenderScenario() {
  _tenderEdit = {
    id: Date.now(),
    name: '',
    description: '',
    status: 'draft',
    items: [],
    totalBaseline: 0,
    totalTarget: 0,
    reductionPct: 0,
    createdBy: state.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  _tenderItems = [];
  navigate('tender_entry');
}

function editTenderScenario(id) {
  const s = state.tenderScenarios.find(x => String(x.id) === String(id));
  if (!s) return;
  _tenderEdit = JSON.parse(JSON.stringify(s));
  _tenderItems = _tenderEdit.items || [];
  navigate('tender_entry');
}

function dupTenderScenario(id) {
  const s = state.tenderScenarios.find(x => String(x.id) === String(id));
  if (!s) return;
  _tenderEdit = JSON.parse(JSON.stringify(s));
  _tenderEdit.id = Date.now();
  _tenderEdit.name = s.name + ' (Copy)';
  _tenderEdit.status = 'draft';
  _tenderEdit.createdBy = state.name;
  _tenderEdit.createdAt = new Date().toISOString();
  _tenderItems = _tenderEdit.items || [];
  navigate('tender_entry');
}

async function delTenderScenario(id) {
  if (!confirm('Delete this tender scenario? This cannot be undone.')) return;
  await DB.deleteTenderScenario(Number(id));
  state.tenderScenarios = state.tenderScenarios.filter(s => String(s.id) !== String(id));
  navigate('tender_entry');
}

function cancelTenderEdit() {
  _tenderEdit = null;
  _tenderItems = [];
  navigate('tender_entry');
}

// ===== TENDER FORM (create/edit scenario) =====
function renderTenderForm(el) {
  const s = _tenderEdit;
  const totals = calcTenderTotals();

  el.innerHTML = `
  <div class="card">
    <div class="card-title">${s.createdAt === s.updatedAt && !state.tenderScenarios.find(x => x.id === s.id) ? 'New' : 'Edit'} Tender Scenario</div>
    <div class="form-row c3">
      <div class="fg"><label>Scenario Name</label><input id="tsName" value="${esc(s.name)}" placeholder="e.g. Base Design - Option A"></div>
      <div class="fg"><label>Description</label><input id="tsDesc" value="${esc(s.description || '')}" placeholder="Brief description of this tender option"></div>
      <div class="fg"><label>Status</label><select id="tsStatus">
        <option value="draft" ${s.status === 'draft' ? 'selected' : ''}>Draft</option>
        <option value="submitted" ${s.status === 'submitted' ? 'selected' : ''}>Submitted</option>
        <option value="approved" ${s.status === 'approved' ? 'selected' : ''}>Approved</option>
      </select></div>
    </div>
  </div>

  <!-- Emission Totals KPIs -->
  <div class="stats-row">
    <div class="stat-card slate"><div class="sc-label">Total Baseline</div><div class="sc-value">${fmt(totals.baseline)}</div><div class="sc-sub">ton CO\u2082eq projected</div></div>
    <div class="stat-card blue"><div class="sc-label">Total Target</div><div class="sc-value">${fmt(totals.target)}</div><div class="sc-sub">ton CO\u2082eq target</div></div>
    <div class="stat-card ${totals.rPct > 20 ? 'green' : totals.rPct >= 10 ? 'orange' : 'purple'}"><div class="sc-label">Projected Reduction</div><div class="sc-value">${fmt(totals.rPct)}%</div><div class="sc-sub">${fmt(totals.baseline - totals.target)} ton saved</div></div>
    <div class="stat-card cyan"><div class="sc-label">Line Items</div><div class="sc-value">${_tenderItems.length}</div><div class="sc-sub">materials in BOQ</div></div>
  </div>

  <!-- Add Line Item Form -->
  <div class="card">
    <div class="card-title">Add Material Line Item</div>
    <div class="form-row c4">
      <div class="fg"><label>Category</label><select id="tiCat" onchange="onTenderCat()">
        <option value="">Select...</option>
        ${(function(){const g=getMaterialGroups();return Object.entries(g).map(([grp,cats])=>'<optgroup label="'+grp+'">'+cats.map(c=>'<option value="'+c+'">'+c+'</option>').join('')+'</optgroup>').join('');})()}
        <option value="__custom__">Custom Material</option>
      </select></div>
      <div class="fg" id="tiTypeWrap"><label>Type</label><select id="tiType" onchange="onTenderType()"><option>Select category first</option></select></div>
      <div class="fg"><label>Quantity</label><input type="number" id="tiQty" placeholder="BOQ quantity" oninput="tenderItemPreview()"><div class="fg-help" id="tiUnit">\u2014</div></div>
      <div class="fg"><label>Unit</label><input id="tiUnitCustom" class="fg-readonly" readonly></div>
    </div>

    <!-- Custom material fields (hidden by default) -->
    <div id="tiCustomFields" style="display:none">
      <div class="form-row c4">
        <div class="fg"><label>Material Name</label><input id="tiCustomName" placeholder="e.g. Timber CLT"></div>
        <div class="fg"><label>Unit</label><input id="tiCustomUnit" placeholder="e.g. m\u00b3, kg, tons"></div>
        <div class="fg"><label>Mass Factor (kg/unit)</label><input type="number" id="tiCustomMass" value="1" placeholder="kg per unit"></div>
        <div class="fg"><label>EF Unit</label><input id="tiCustomEFUnit" placeholder="e.g. kgCO\u2082e/m\u00b3"></div>
      </div>
    </div>

    <div class="form-row c3">
      <div class="fg"><label>Baseline EF</label><input type="number" id="tiBL" step="0.01" oninput="tenderItemPreview()"><div class="fg-help" id="tiBLHelp">Auto-filled from database or enter manually</div></div>
      <div class="fg"><label>Target EF</label><input type="number" id="tiTG" step="0.01" oninput="tenderItemPreview()"><div class="fg-help" id="tiTGHelp">Auto-filled from database or enter manually</div></div>
      <div class="fg"><label>Notes</label><input id="tiNotes" placeholder="EPD ref, source of EF..."></div>
    </div>

    <div id="tiPreview"></div>
    <div class="btn-row"><button class="btn btn-primary" onclick="addTenderItem()">+ Add Line Item</button></div>
  </div>

  <!-- Line Items Table -->
  <div class="card">
    <div class="card-title">BOQ Line Items (${_tenderItems.length})</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Category</th><th>Type</th><th class="r">Qty</th><th>Unit</th><th class="r">Baseline EF</th><th class="r">Target EF</th><th class="r">Baseline (tCO\u2082)</th><th class="r">Target (tCO\u2082)</th><th class="r">Reduction</th><th>Notes</th><th></th></tr></thead>
      <tbody id="tenderItemsTbl">${_tenderItems.length ? _tenderItems.map((it, idx) => {
        const rP = it.baselineEmission > 0 ? ((it.baselineEmission - it.targetEmission) / it.baselineEmission) * 100 : 0;
        return `<tr>
          <td>${esc(it.category)}${it.isCustom ? ' <span style="color:var(--orange);font-size:9px">CUSTOM</span>' : ''}</td>
          <td>${esc(it.type)}</td>
          <td class="r mono">${fmtI(it.qty)}</td>
          <td>${it.unit}</td>
          <td class="r mono">${fmt(it.baselineEF)}</td>
          <td class="r mono" style="color:var(--green)">${fmt(it.targetEF)}</td>
          <td class="r mono">${fmt(it.baselineEmission)}</td>
          <td class="r mono" style="color:var(--green)">${fmt(it.targetEmission)}</td>
          <td class="r mono" style="color:${rP > 20 ? 'var(--green)' : rP >= 10 ? 'var(--orange)' : 'var(--purple)'};font-weight:700">${fmt(rP)}%</td>
          <td style="font-size:10px;color:var(--slate5);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.notes || '')}</td>
          <td><button class="btn btn-danger btn-sm" onclick="removeTenderItem(${idx})">✕</button></td>
        </tr>`;
      }).join('') : '<tr><td colspan="11" class="empty">No line items yet. Use the form above to add materials.</td></tr>'}
      ${_tenderItems.length > 1 ? `<tr class="total-row">
        <td colspan="6">Total</td>
        <td class="r mono">${fmt(totals.baseline)}</td>
        <td class="r mono" style="color:var(--green)">${fmt(totals.target)}</td>
        <td class="r mono" style="color:${totals.rPct > 20 ? 'var(--green)' : 'var(--orange)'};font-weight:700">${fmt(totals.rPct)}%</td>
        <td colspan="2"></td>
      </tr>` : ''}
      </tbody>
    </table></div>
  </div>

  <!-- Material Breakdown Chart -->
  ${_tenderItems.length ? renderTenderBreakdownChart() : ''}

  <!-- Action Buttons -->
  <div class="card">
    <div class="btn-row">
      <button class="btn btn-primary" onclick="saveTenderScenario()">\ud83d\udcbe Save Scenario</button>
      <button class="btn btn-secondary" onclick="cancelTenderEdit()">Cancel</button>
    </div>
    <div id="tsSaveMsg" style="margin-top:12px"></div>
  </div>`;
}

// ===== CATEGORY / TYPE HANDLERS =====
function onTenderCat() {
  const c = $('tiCat').value;
  const customFields = $('tiCustomFields');
  const typeWrap = $('tiTypeWrap');

  if (c === '__custom__') {
    customFields.style.display = '';
    typeWrap.style.display = 'none';
    $('tiType').innerHTML = '<option>Custom</option>';
    $('tiUnit').textContent = '\u2014';
    $('tiUnitCustom').value = '';
    $('tiBL').value = '';
    $('tiTG').value = '';
    $('tiBL').removeAttribute('readonly');
    $('tiBL').classList.remove('fg-readonly');
    $('tiTG').removeAttribute('readonly');
    $('tiTG').classList.remove('fg-readonly');
    $('tiBLHelp').textContent = 'Enter baseline EF manually';
    $('tiTGHelp').textContent = 'Enter target EF manually';
    tenderItemPreview();
    return;
  }

  customFields.style.display = 'none';
  typeWrap.style.display = '';

  if (!c || !MATERIALS[c]) {
    $('tiType').innerHTML = '<option>Select category first</option>';
    $('tiUnit').textContent = '\u2014';
    $('tiUnitCustom').value = '';
    $('tiBL').value = '';
    $('tiTG').value = '';
    return;
  }

  const m = MATERIALS[c];
  $('tiType').innerHTML = '<option value="">Select...</option>' + m.types.map((t, i) => {
    const cov = t.coveragePct;
    const tag = (m.isMEP && cov !== undefined && cov < MEP_COVERAGE_THRESHOLD) ? ' [A1-A3=0, Cov: ' + cov + '%]' : '';
    return '<option value="' + i + '">' + t.name + tag + '</option>';
  }).join('');
  $('tiUnit').textContent = 'Unit: ' + MATERIALS[c].unit;
  $('tiUnitCustom').value = MATERIALS[c].unit;
  $('tiBL').value = '';
  $('tiTG').value = '';
  // Allow manual override — baseline/target fields are editable
  $('tiBL').removeAttribute('readonly');
  $('tiBL').classList.remove('fg-readonly');
  $('tiTG').removeAttribute('readonly');
  $('tiTG').classList.remove('fg-readonly');
  $('tiBLHelp').textContent = 'Auto-filled from database or enter manually';
  $('tiTGHelp').textContent = 'Auto-filled from database or enter manually';
  tenderItemPreview();
}

function onTenderType() {
  const c = $('tiCat').value;
  const i = $('tiType').value;
  if (!c || i === '' || !MATERIALS[c]) return;
  const m = MATERIALS[c];
  const t = m.types[i];
  if (!t) return;
  const belowThreshold = m.isMEP && t.coveragePct !== undefined && t.coveragePct < MEP_COVERAGE_THRESHOLD;
  if (belowThreshold) {
    $('tiBL').value = 0;
    $('tiTG').value = 0;
    $('tiBLHelp').textContent = 'A1-A3 = 0 — Complex MEP assembly (Coverage: ' + t.coveragePct + '%)';
    $('tiTGHelp').textContent = 'A1-A3 = 0 — Below 80% data coverage threshold';
  } else {
    $('tiBL').value = t.baseline;
    $('tiTG').value = t.target;
    $('tiBLHelp').textContent = t.baseline + ' ' + m.efUnit + ' (from database)' + (t.coveragePct ? ' [' + t.coveragePct + '% coverage]' : '');
    $('tiTGHelp').textContent = t.target + ' ' + m.efUnit + ' (from database)';
  }
  tenderItemPreview();
}

function tenderItemPreview() {
  const q = parseFloat($('tiQty').value);
  const bl = parseFloat($('tiBL').value);
  const tg = parseFloat($('tiTG').value);
  const prev = $('tiPreview');
  if (!prev) return;
  if (isNaN(q) || q <= 0 || isNaN(bl) || bl <= 0) { prev.innerHTML = ''; return; }

  const bEm = (q * bl) / 1000;
  const tEm = (isNaN(tg) || tg <= 0) ? bEm : (q * tg) / 1000;
  const rP = bEm > 0 ? ((bEm - tEm) / bEm) * 100 : 0;

  prev.innerHTML = `<div class="stats-row" style="margin:12px 0 8px">
    <div class="stat-card slate"><div class="sc-label">Baseline</div><div class="sc-value">${fmt(bEm)}</div><div class="sc-sub">ton CO\u2082eq</div></div>
    <div class="stat-card green"><div class="sc-label">Target</div><div class="sc-value">${fmt(tEm)}</div><div class="sc-sub">ton CO\u2082eq</div></div>
    <div class="stat-card ${rP > 20 ? 'green' : rP >= 10 ? 'orange' : 'purple'}"><div class="sc-label">Reduction</div><div class="sc-value">${fmt(rP)}%</div><div class="sc-sub">${fmt(bEm - tEm)} saved</div></div>
  </div>`;
}

function addTenderItem() {
  const cat = $('tiCat').value;
  const isCustom = cat === '__custom__';
  let category, type, unit, efUnit, massFactor, baselineEF, targetEF;

  if (isCustom) {
    category = $('tiCustomName').value.trim();
    type = category;
    unit = $('tiCustomUnit').value.trim() || 'unit';
    massFactor = parseFloat($('tiCustomMass').value) || 1;
    efUnit = $('tiCustomEFUnit').value.trim() || 'kgCO\u2082e/' + unit;
    if (!category) { alert('Enter a material name for custom material'); return; }
  } else {
    if (!cat || !MATERIALS[cat]) { alert('Select a category'); return; }
    const i = $('tiType').value;
    if (i === '') { alert('Select a material type'); return; }
    const t = MATERIALS[cat].types[i];
    category = cat;
    type = t ? t.name : cat;
    unit = MATERIALS[cat].unit;
    efUnit = MATERIALS[cat].efUnit;
    massFactor = MATERIALS[cat].massFactor;
  }

  const qty = parseFloat($('tiQty').value);
  baselineEF = parseFloat($('tiBL').value);
  targetEF = parseFloat($('tiTG').value);

  if (isNaN(qty) || qty <= 0) { alert('Enter a valid quantity'); return; }
  if (isNaN(baselineEF) || baselineEF <= 0) { alert('Enter a valid baseline emission factor'); return; }
  if (isNaN(targetEF) || targetEF <= 0) targetEF = baselineEF;

  const baselineEmission = (qty * baselineEF) / 1000;
  const targetEmission = (qty * targetEF) / 1000;

  _tenderItems.push({
    id: Date.now(),
    category,
    type,
    qty,
    unit,
    efUnit,
    massFactor,
    baselineEF,
    targetEF,
    baselineEmission,
    targetEmission,
    isCustom,
    notes: $('tiNotes').value.trim()
  });

  // Reset form
  $('tiCat').value = '';
  $('tiType').innerHTML = '<option>Select category first</option>';
  $('tiQty').value = '';
  $('tiBL').value = '';
  $('tiTG').value = '';
  $('tiNotes').value = '';
  $('tiUnit').textContent = '\u2014';
  $('tiUnitCustom').value = '';
  $('tiPreview').innerHTML = '';
  $('tiCustomFields').style.display = 'none';
  $('tiTypeWrap').style.display = '';

  navigate('tender_entry');
}

function removeTenderItem(idx) {
  _tenderItems.splice(idx, 1);
  navigate('tender_entry');
}

function calcTenderTotals() {
  let baseline = 0, target = 0;
  _tenderItems.forEach(it => { baseline += it.baselineEmission || 0; target += it.targetEmission || 0; });
  const rPct = baseline > 0 ? ((baseline - target) / baseline) * 100 : 0;
  return { baseline, target, rPct };
}

async function saveTenderScenario() {
  const name = $('tsName').value.trim();
  if (!name) { alert('Enter a scenario name'); return; }

  const totals = calcTenderTotals();
  _tenderEdit.name = name;
  _tenderEdit.description = $('tsDesc').value.trim();
  _tenderEdit.status = $('tsStatus').value;
  _tenderEdit.items = _tenderItems;
  _tenderEdit.totalBaseline = totals.baseline;
  _tenderEdit.totalTarget = totals.target;
  _tenderEdit.reductionPct = totals.rPct;
  _tenderEdit.updatedAt = new Date().toISOString();

  await DB.saveTenderScenario(_tenderEdit);

  // Update in-memory state
  const idx = state.tenderScenarios.findIndex(s => s.id === _tenderEdit.id);
  if (idx !== -1) state.tenderScenarios[idx] = JSON.parse(JSON.stringify(_tenderEdit));
  else state.tenderScenarios.push(JSON.parse(JSON.stringify(_tenderEdit)));

  const msg = $('tsSaveMsg');
  if (msg) msg.innerHTML = '<div style="padding:12px;background:rgba(52,211,153,0.1);border-radius:10px;color:var(--green);text-align:center;font-weight:600">\u2705 Scenario saved' + (dbConnected ? ' & synced to cloud' : '') + '</div>';
}

// ===== BREAKDOWN CHART =====
function renderTenderBreakdownChart() {
  const byCategory = {};
  _tenderItems.forEach(it => {
    if (!byCategory[it.category]) byCategory[it.category] = { baseline: 0, target: 0 };
    byCategory[it.category].baseline += it.baselineEmission;
    byCategory[it.category].target += it.targetEmission;
  });

  const cats = Object.entries(byCategory).sort((a, b) => b[1].baseline - a[1].baseline);
  const mx = Math.max(...cats.map(([, v]) => Math.max(v.baseline, v.target)), 1);

  return `<div class="card"><div class="card-title">Material Breakdown</div>
    <div class="chart-legend" style="margin-bottom:12px"><span><span class="chart-legend-dot" style="background:rgba(148,163,184,0.4)"></span> Baseline</span><span><span class="chart-legend-dot" style="background:rgba(52,211,153,0.5)"></span> Target</span></div>
    <div class="bar-chart" style="height:180px">${cats.map(([c, v]) => `<div class="bar-group">
      <div class="bar-pair"><div class="bar baseline" style="height:${(v.baseline / mx) * 160}px"></div><div class="bar" style="height:${(v.target / mx) * 160}px;background:rgba(52,211,153,0.5);width:20px;border-radius:4px 4px 0 0;min-height:2px"></div></div>
      <div class="bar-label">${c}</div>
    </div>`).join('')}</div>
  </div>`;
}


// ===== TENDER COMPARISON PAGE =====
function renderTenderCompare(el) {
  const scenarios = state.tenderScenarios;

  if (scenarios.length < 1) {
    el.innerHTML = '<div class="card"><div class="card-title">Tender Comparison</div><div class="empty"><div class="empty-icon">\ud83d\udcca</div>Create at least one tender scenario to see comparisons.</div></div>';
    return;
  }

  // Build comparison KPIs
  const sorted = [...scenarios].sort((a, b) => (a.totalBaseline || 0) - (b.totalBaseline || 0));
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const bestRed = [...scenarios].sort((a, b) => (b.reductionPct || 0) - (a.reductionPct || 0))[0];

  el.innerHTML = `
  <!-- Overview KPIs -->
  <div class="stats-row">
    <div class="stat-card cyan"><div class="sc-label">Scenarios</div><div class="sc-value">${scenarios.length}</div><div class="sc-sub">tender options</div></div>
    <div class="stat-card green"><div class="sc-label">Lowest Baseline</div><div class="sc-value">${fmt(lowest.totalBaseline || 0)}</div><div class="sc-sub">tCO\u2082 \u2014 ${esc(lowest.name)}</div></div>
    <div class="stat-card orange"><div class="sc-label">Highest Baseline</div><div class="sc-value">${fmt(highest.totalBaseline || 0)}</div><div class="sc-sub">tCO\u2082 \u2014 ${esc(highest.name)}</div></div>
    <div class="stat-card purple"><div class="sc-label">Best Reduction</div><div class="sc-value">${fmt(bestRed.reductionPct || 0)}%</div><div class="sc-sub">${esc(bestRed.name)}</div></div>
  </div>

  <!-- Scenario Comparison Chart -->
  <div class="card">
    <div class="card-title">Scenario Comparison \u2014 Total Emissions</div>
    <div class="chart-legend" style="margin-bottom:12px"><span><span class="chart-legend-dot" style="background:rgba(148,163,184,0.4)"></span> Baseline</span><span><span class="chart-legend-dot" style="background:rgba(52,211,153,0.5)"></span> Target</span></div>
    ${renderComparisonBarChart(scenarios)}
  </div>

  <!-- Detailed Comparison Table -->
  <div class="card">
    <div class="card-title">Side-by-Side Comparison</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Scenario</th><th>Status</th><th class="r">Items</th><th class="r">Baseline (tCO\u2082)</th><th class="r">Target (tCO\u2082)</th><th class="r">Saving (tCO\u2082)</th><th class="r">Reduction %</th><th>Created By</th></tr></thead>
      <tbody>${scenarios.map(s => {
        const saving = (s.totalBaseline || 0) - (s.totalTarget || 0);
        const rP = s.reductionPct || 0;
        const isBest = s.id === bestRed.id;
        return `<tr${isBest ? ' style="background:rgba(52,211,153,0.04)"' : ''}>
          <td style="font-weight:700;color:var(--text)">${esc(s.name)}${isBest ? ' <span style="color:var(--green);font-size:9px;font-weight:700">\u2605 BEST</span>' : ''}</td>
          <td><span class="badge ${s.status === 'submitted' ? 'review' : s.status === 'approved' ? 'approved' : 'pending'}">${s.status || 'draft'}</span></td>
          <td class="r mono">${(s.items || []).length}</td>
          <td class="r mono">${fmt(s.totalBaseline || 0)}</td>
          <td class="r mono" style="color:var(--green)">${fmt(s.totalTarget || 0)}</td>
          <td class="r mono" style="color:var(--blue);font-weight:700">${fmt(saving)}</td>
          <td class="r mono" style="color:${rP > 20 ? 'var(--green)' : rP >= 10 ? 'var(--orange)' : 'var(--purple)'};font-weight:700">${fmt(rP)}%</td>
          <td style="font-size:11px;color:var(--slate5)">${esc(s.createdBy || '')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>

  <!-- Material Category Comparison -->
  ${renderCategoryComparison(scenarios)}

  <!-- Individual Scenario Details (expandable) -->
  ${scenarios.map(s => renderScenarioDetail(s)).join('')}
  `;
}

function renderComparisonBarChart(scenarios) {
  if (!scenarios.length) return '';
  const mx = Math.max(...scenarios.map(s => Math.max(s.totalBaseline || 0, s.totalTarget || 0)), 1);
  return `<div class="bar-chart" style="height:200px">${scenarios.map(s => `<div class="bar-group">
    <div class="bar-pair">
      <div class="bar baseline" style="height:${((s.totalBaseline || 0) / mx) * 180}px"></div>
      <div class="bar" style="height:${((s.totalTarget || 0) / mx) * 180}px;background:rgba(52,211,153,0.5);width:20px;border-radius:4px 4px 0 0;min-height:2px"></div>
    </div>
    <div class="bar-label" style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</div>
  </div>`).join('')}</div>`;
}

function renderCategoryComparison(scenarios) {
  // Gather all categories across all scenarios
  const allCats = new Set();
  scenarios.forEach(s => (s.items || []).forEach(it => allCats.add(it.category)));
  if (allCats.size === 0) return '';

  const cats = [...allCats].sort();

  return `<div class="card"><div class="card-title">Material Category Comparison</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Category</th>${scenarios.map(s => `<th class="r" colspan="2" style="border-left:2px solid var(--border)">${esc(s.name)}</th>`).join('')}</tr>
      <tr><th></th>${scenarios.map(() => `<th class="r" style="font-size:8px;border-left:2px solid var(--border)">Baseline</th><th class="r" style="font-size:8px">Target</th>`).join('')}</tr></thead>
      <tbody>${cats.map(cat => {
        return `<tr><td style="font-weight:600">${esc(cat)}</td>${scenarios.map(s => {
          const items = (s.items || []).filter(it => it.category === cat);
          const bl = items.reduce((sum, it) => sum + (it.baselineEmission || 0), 0);
          const tg = items.reduce((sum, it) => sum + (it.targetEmission || 0), 0);
          return `<td class="r mono" style="border-left:2px solid var(--border)">${items.length ? fmt(bl) : '\u2014'}</td><td class="r mono" style="color:var(--green)">${items.length ? fmt(tg) : '\u2014'}</td>`;
        }).join('')}</tr>`;
      }).join('')}
      <tr class="total-row"><td>Total</td>${scenarios.map(s => {
        return `<td class="r mono" style="border-left:2px solid var(--border)">${fmt(s.totalBaseline || 0)}</td><td class="r mono" style="color:var(--green)">${fmt(s.totalTarget || 0)}</td>`;
      }).join('')}</tr>
      </tbody>
    </table></div>
  </div>`;
}

function renderScenarioDetail(s) {
  const items = s.items || [];
  if (!items.length) return '';

  return `<div class="card">
    <div class="card-title">${esc(s.name)} \u2014 Line Items (${items.length})</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Category</th><th>Type</th><th class="r">Qty</th><th>Unit</th><th class="r">Baseline EF</th><th class="r">Target EF</th><th class="r">Baseline (tCO\u2082)</th><th class="r">Target (tCO\u2082)</th><th class="r">Reduction</th></tr></thead>
      <tbody>${items.map(it => {
        const rP = it.baselineEmission > 0 ? ((it.baselineEmission - it.targetEmission) / it.baselineEmission) * 100 : 0;
        return `<tr>
          <td>${esc(it.category)}${it.isCustom ? ' <span style="color:var(--orange);font-size:9px">CUSTOM</span>' : ''}</td>
          <td>${esc(it.type)}</td>
          <td class="r mono">${fmtI(it.qty)}</td>
          <td>${it.unit}</td>
          <td class="r mono">${fmt(it.baselineEF)}</td>
          <td class="r mono" style="color:var(--green)">${fmt(it.targetEF)}</td>
          <td class="r mono">${fmt(it.baselineEmission)}</td>
          <td class="r mono" style="color:var(--green)">${fmt(it.targetEmission)}</td>
          <td class="r mono" style="color:${rP > 20 ? 'var(--green)' : rP >= 10 ? 'var(--orange)' : 'var(--purple)'};font-weight:700">${fmt(rP)}%</td>
        </tr>`;
      }).join('')}
      ${items.length > 1 ? `<tr class="total-row">
        <td colspan="6">Total</td>
        <td class="r mono">${fmt(s.totalBaseline || 0)}</td>
        <td class="r mono" style="color:var(--green)">${fmt(s.totalTarget || 0)}</td>
        <td class="r mono" style="color:${(s.reductionPct || 0) > 20 ? 'var(--green)' : 'var(--orange)'};font-weight:700">${fmt(s.reductionPct || 0)}%</td>
      </tr>` : ''}
      </tbody>
    </table></div>
  </div>`;
}
