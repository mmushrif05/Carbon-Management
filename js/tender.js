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
      <button class="btn btn-secondary" onclick="startTenderBOQUpload()">📂 Upload BOQ (Excel/CSV/PDF)</button>
    </div>
    <div style="padding:10px 14px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:10px;margin-bottom:16px;font-size:12px;color:var(--slate4);line-height:1.7">
      <strong style="color:var(--blue)">💡 Quick Start:</strong> Upload a <strong>PDF tender document</strong>, Excel, or CSV Bill of Quantities to auto-create a tender scenario. GWP factors are sourced from <strong>A1-A3 baseline factors</strong> first, with ICE Database v3.0 fallback. Only baseline values are used (no targets). The system identifies materials contributing to <strong>80% of total embodied carbon</strong>.
    </div>
    ${scenarios.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Scenario</th><th>Description</th><th class="r">Items</th><th class="r">Baseline (tCO\u2082)</th><th>Status</th><th>Created By</th><th></th></tr></thead>
      <tbody>${scenarios.map(s => {
        const nItems = (s.items || []).length;
        const tB = s.totalBaseline || 0;
        return `<tr>
          <td style="font-weight:700;color:var(--text)">${esc(s.name)}</td>
          <td style="color:var(--slate4);font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.description || '')}</td>
          <td class="r mono">${nItems}</td>
          <td class="r mono">${fmt(tB)}</td>
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

// ===== START TENDER BOQ UPLOAD (from list view) =====
function startTenderBOQUpload() {
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
  _tenderBOQMode = true;
  navigate('tender_entry');
}

let _tenderBOQMode = false;
let _tenderBOQWorkbook = null;
let _tenderBOQParsed = [];
let _tenderBOQMatched = [];
let _tenderBOQFileName = '';

// Open file picker for BOQ upload — ensures document picker on mobile (not camera)
function openTenderFileInput() {
  var input = document.getElementById('tenderBOQFileInput');
  if (!input) return;
  // Reset value so the same file can be re-selected
  input.value = '';
  input.click();
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
    <div class="stat-card slate"><div class="sc-label">Total Baseline Emissions</div><div class="sc-value">${fmt(totals.baseline)}</div><div class="sc-sub">ton CO\u2082eq (A1-A3 baseline)</div></div>
    <div class="stat-card cyan"><div class="sc-label">Line Items</div><div class="sc-value">${_tenderItems.length}</div><div class="sc-sub">materials in BOQ</div></div>
    <div class="stat-card ${totals.a13Count > 0 ? 'green' : 'slate'}"><div class="sc-label">A1-A3 Sourced</div><div class="sc-value">${totals.a13Count || 0}</div><div class="sc-sub">items from consultant factors</div></div>
    <div class="stat-card ${totals.iceCount > 0 ? 'blue' : 'slate'}"><div class="sc-label">ICE Sourced</div><div class="sc-value">${totals.iceCount || 0}</div><div class="sc-sub">items from ICE database</div></div>
  </div>
  ${_tenderItems.length > 0 ? renderTender80PctBar(totals) : ''}

  <!-- ===== BULK BOQ UPLOAD SECTION ===== -->
  <div class="card" id="tenderBOQCard">
    <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
      <span>\ud83d\udcc2 Bulk Import from BOQ File</span>
      <button class="btn btn-secondary btn-sm" onclick="toggleTenderBOQUpload()" id="tenderBOQToggleBtn">${_tenderBOQMode ? 'Collapse' : 'Expand'}</button>
    </div>
    <div id="tenderBOQBody" style="${_tenderBOQMode ? '' : 'display:none'}">
      <div style="padding:10px 14px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;margin-bottom:14px;font-size:12px;color:var(--slate4);line-height:1.8">
        <strong style="color:var(--green)">Upload your Tender Document / BOQ</strong> to auto-populate line items.<br>
        Supports <strong>.pdf</strong> (tender documents), <strong>.xlsx, .xls, .csv</strong> files.<br>
        GWP factors: <strong>A1-A3 baseline factors</strong> used first \u2192 <strong>ICE Database</strong> fallback for remaining items.<br>
        Only <strong>baseline values</strong> are used. System identifies materials contributing to <strong>80% of total embodied carbon</strong>.
      </div>
      <div id="tenderBOQDropZone" style="border:2px dashed rgba(52,211,153,0.3);border-radius:14px;padding:32px 20px;text-align:center;cursor:pointer;transition:all 0.2s;background:rgba(52,211,153,0.02)"
        onclick="openTenderFileInput()"
        ondragover="event.preventDefault();this.style.borderColor='var(--green)';this.style.background='rgba(52,211,153,0.06)'"
        ondragleave="this.style.borderColor='rgba(52,211,153,0.3)';this.style.background='rgba(52,211,153,0.02)'"
        ondrop="event.preventDefault();this.style.borderColor='rgba(52,211,153,0.3)';this.style.background='rgba(52,211,153,0.02)';handleTenderBOQDrop(event)">
        <div style="font-size:28px;opacity:0.4;margin-bottom:4px">\ud83d\udcc2</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px">Drop Tender PDF, Excel, or CSV BOQ file here</div>
        <div style="font-size:11px;color:var(--slate5)">or click to browse &bull; .pdf, .xlsx, .xls, .csv</div>
        <div id="tenderBOQFileInfo" style="margin-top:8px;font-size:12px;color:var(--green);font-weight:600;display:none"></div>
      </div>
      <input type="file" id="tenderBOQFileInput" accept="application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,.pdf,.xlsx,.xls,.csv" style="display:none" onchange="handleTenderBOQFile(this.files[0])">
      <div id="tenderPDFStatus" style="display:none;margin-top:10px"></div>
      <div id="tenderBOQSheetSel" style="display:none;margin-top:10px">
        <div class="form-row c3">
          <div class="fg"><label>Sheet</label><select id="tenderBOQSheet"></select></div>
          <div class="fg"><label>Header Row</label><select id="tenderBOQHeaderRow"><option value="0">Row 1</option><option value="1">Row 2</option><option value="2">Row 3</option><option value="3">Row 4</option></select></div>
          <div class="fg" style="display:flex;align-items:flex-end"><button class="btn btn-primary btn-sm" onclick="processTenderBOQSheet()">Process Sheet</button></div>
        </div>
      </div>
      <div id="tenderBOQParseMsg" style="margin-top:10px"></div>
      <div id="tenderBOQColMap" style="display:none;margin-top:12px"></div>
      <div id="tenderBOQPreview" style="display:none;margin-top:12px"></div>
      <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="font-size:11px;color:var(--slate5);margin-bottom:6px">Need a template?</div>
        <div class="btn-row"><button class="btn btn-secondary btn-sm" onclick="downloadBOQTemplate()">CSV Template</button><button class="btn btn-secondary btn-sm" onclick="downloadBOQTemplateFull()">Full ICE Database CSV</button></div>
      </div>
    </div>
  </div>

  <!-- Add Line Item Form -->
  <div class="card">
    <div class="card-title">Add Material Line Item</div>
    <div class="form-row c4">
      <div class="fg"><label>Category</label><select id="tiCat" onchange="onTenderCat()">
        <option value="">Select...</option>
        <optgroup label="A1-A3 Baseline Factors (Priority)">${Object.keys(MATERIALS).map(c => `<option>${c}</option>`).join('')}</optgroup>
        ${Object.entries(getICEGroups()).map(([grp, cats]) => `<optgroup label="ICE: ${grp}">${cats.map(c => `<option>${c}</option>`).join('')}</optgroup>`).join('')}
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
      <div class="fg"><label>Baseline EF (A1-A3)</label><input type="number" id="tiBL" step="0.01" oninput="tenderItemPreview()"><div class="fg-help" id="tiBLHelp">Auto-filled from A1-A3 factors or ICE database</div></div>
      <div class="fg"><label>GWP Source</label><input id="tiGWPSource" class="fg-readonly" readonly value=""><div class="fg-help" id="tiSourceHelp">Shows whether factor is from A1-A3 or ICE</div></div>
      <div class="fg"><label>Notes</label><input id="tiNotes" placeholder="EPD ref, source of EF..."></div>
    </div>
    <input type="hidden" id="tiTG" value="0">

    <div id="tiPreview"></div>
    <div class="btn-row"><button class="btn btn-primary" onclick="addTenderItem()">+ Add Line Item</button></div>
  </div>

  <!-- Line Items Table -->
  <div class="card">
    <div class="card-title">BOQ Line Items (${_tenderItems.length})</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Category</th><th>Type</th><th class="r">Qty</th><th>Unit</th><th class="r">Baseline EF</th><th class="r">Baseline (tCO\u2082)</th><th>GWP Source</th><th>80%</th><th>Notes</th><th></th></tr></thead>
      <tbody id="tenderItemsTbl">${_tenderItems.length ? _tenderItems.map((it, idx) => {
        const in80 = it._in80Pct;
        const srcBadge = it.gwpSource === 'A1-A3'
          ? '<span style="display:inline-block;background:rgba(52,211,153,0.1);color:var(--green);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">A1-A3</span>'
          : it.gwpSource === 'ICE'
          ? '<span style="display:inline-block;background:rgba(96,165,250,0.1);color:var(--blue);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">ICE</span>'
          : '<span style="display:inline-block;background:rgba(251,191,36,0.1);color:var(--yellow);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">Manual</span>';
        return `<tr${in80 ? ' style="background:rgba(52,211,153,0.04)"' : ''}>
          <td>${esc(it.category)}${it.isCustom ? ' <span style="color:var(--orange);font-size:9px">CUSTOM</span>' : ''}</td>
          <td>${esc(it.type)}</td>
          <td class="r mono">${fmtI(it.qty)}</td>
          <td>${it.unit}</td>
          <td class="r mono">${fmt(it.baselineEF)}</td>
          <td class="r mono">${fmt(it.baselineEmission)}</td>
          <td>${srcBadge}</td>
          <td>${in80 ? '<span style="color:var(--green);font-weight:700;font-size:11px">\u2713</span>' : ''}</td>
          <td style="font-size:10px;color:var(--slate5);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.notes || '')}</td>
          <td><button class="btn btn-danger btn-sm" onclick="removeTenderItem(${idx})">✕</button></td>
        </tr>`;
      }).join('') : '<tr><td colspan="10" class="empty">No line items yet. Use the form above to add materials.</td></tr>'}
      ${_tenderItems.length > 1 ? `<tr class="total-row">
        <td colspan="5">Total</td>
        <td class="r mono">${fmt(totals.baseline)}</td>
        <td colspan="4"></td>
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
// Track which source the GWP comes from for the current selection
let _tenderCurrentGWPSource = '';

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
    $('tiTG').value = '0';
    $('tiBL').removeAttribute('readonly');
    $('tiBL').classList.remove('fg-readonly');
    $('tiBLHelp').textContent = 'Enter baseline EF manually';
    _tenderCurrentGWPSource = 'Manual';
    if ($('tiGWPSource')) $('tiGWPSource').value = 'Manual';
    if ($('tiSourceHelp')) $('tiSourceHelp').textContent = 'Custom material — enter EF manually';
    tenderItemPreview();
    return;
  }

  customFields.style.display = 'none';
  typeWrap.style.display = '';
  _tenderCurrentGWPSource = '';

  // Check if category exists in A1-A3 MATERIALS first
  const a13Mat = MATERIALS[c];
  const iceMat = ICE_MATERIALS[c];
  const mat = a13Mat || iceMat;

  if (!c || !mat) {
    $('tiType').innerHTML = '<option>Select category first</option>';
    $('tiUnit').textContent = '\u2014';
    $('tiUnitCustom').value = '';
    $('tiBL').value = '';
    $('tiTG').value = '0';
    if ($('tiGWPSource')) $('tiGWPSource').value = '';
    if ($('tiSourceHelp')) $('tiSourceHelp').textContent = '';
    return;
  }

  // Determine source and build type options
  const isA13 = !!a13Mat;
  const srcLabel = isA13 ? 'A1-A3' : 'ICE';
  const typesSource = isA13 ? a13Mat : iceMat;

  $('tiType').innerHTML = '<option value="">Select...</option>' + typesSource.types.map((t, i) => {
    const covTag = (!isA13 && iceMat && iceMat.isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD) ? ' [A1-A3=0]' : '';
    return `<option value="${i}" data-src="${srcLabel}">${t.name}${covTag}</option>`;
  }).join('');
  $('tiUnit').textContent = 'Unit: ' + mat.unit;
  $('tiUnitCustom').value = mat.unit;
  $('tiBL').value = '';
  $('tiTG').value = '0';
  $('tiBL').removeAttribute('readonly');
  $('tiBL').classList.remove('fg-readonly');
  $('tiBLHelp').textContent = 'Auto-filled from ' + srcLabel + ' factors or enter manually';
  _tenderCurrentGWPSource = srcLabel;
  if ($('tiGWPSource')) $('tiGWPSource').value = srcLabel;
  if ($('tiSourceHelp')) $('tiSourceHelp').textContent = 'Factor from ' + srcLabel + (isA13 ? ' (consultant-defined)' : ' (ICE Database v3.0)');
  tenderItemPreview();
}

function onTenderType() {
  const c = $('tiCat').value;
  const i = $('tiType').value;
  if (!c || i === '') return;
  // Check A1-A3 first, then ICE
  const a13Mat = MATERIALS[c];
  const iceMat = ICE_MATERIALS[c];
  const mat = a13Mat || iceMat;
  if (!mat) return;
  const t = mat.types[i];
  if (!t) return;
  const isA13 = !!a13Mat;
  const belowThreshold = !isA13 && iceMat && iceMat.isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD;
  const bl = belowThreshold ? 0 : t.baseline;
  $('tiBL').value = bl;
  $('tiTG').value = bl; // Tender = baseline only
  _tenderCurrentGWPSource = isA13 ? 'A1-A3' : 'ICE';
  $('tiBLHelp').textContent = bl + ' ' + mat.efUnit + (belowThreshold ? ' (MEP <80% coverage \u2192 A1-A3=0)' : ' (from ' + _tenderCurrentGWPSource + ')');
  if ($('tiGWPSource')) $('tiGWPSource').value = _tenderCurrentGWPSource;
  if ($('tiSourceHelp')) $('tiSourceHelp').textContent = 'Baseline factor from ' + _tenderCurrentGWPSource + (isA13 ? ' (consultant-defined)' : ' (ICE Database)');
  tenderItemPreview();
}

function tenderItemPreview() {
  const q = parseFloat($('tiQty').value);
  const bl = parseFloat($('tiBL').value);
  const prev = $('tiPreview');
  if (!prev) return;
  if (isNaN(q) || q <= 0 || isNaN(bl) || bl <= 0) { prev.innerHTML = ''; return; }

  const bEm = (q * bl) / 1000;

  prev.innerHTML = `<div class="stats-row" style="margin:12px 0 8px">
    <div class="stat-card slate"><div class="sc-label">Baseline Emission</div><div class="sc-value">${fmt(bEm)}</div><div class="sc-sub">ton CO\u2082eq (A1-A3)</div></div>
    <div class="stat-card ${_tenderCurrentGWPSource === 'A1-A3' ? 'green' : _tenderCurrentGWPSource === 'ICE' ? 'blue' : 'orange'}"><div class="sc-label">GWP Source</div><div class="sc-value" style="font-size:14px">${_tenderCurrentGWPSource || 'Manual'}</div><div class="sc-sub">${_tenderCurrentGWPSource === 'A1-A3' ? 'Consultant-defined factor' : _tenderCurrentGWPSource === 'ICE' ? 'ICE Database fallback' : 'User-entered'}</div></div>
  </div>`;
}

function addTenderItem() {
  const cat = $('tiCat').value;
  const isCustom = cat === '__custom__';
  let category, type, unit, efUnit, massFactor, baselineEF;

  if (isCustom) {
    category = $('tiCustomName').value.trim();
    type = category;
    unit = $('tiCustomUnit').value.trim() || 'unit';
    massFactor = parseFloat($('tiCustomMass').value) || 1;
    efUnit = $('tiCustomEFUnit').value.trim() || 'kgCO\u2082e/' + unit;
    if (!category) { alert('Enter a material name for custom material'); return; }
  } else {
    // Check A1-A3 first, then ICE
    const a13Mat = MATERIALS[cat];
    const iceMat = ICE_MATERIALS[cat];
    const mat = a13Mat || iceMat;
    if (!cat || !mat) { alert('Select a category'); return; }
    const i = $('tiType').value;
    if (i === '') { alert('Select a material type'); return; }
    const t = mat.types[i];
    category = cat;
    type = t ? t.name : cat;
    unit = mat.unit;
    efUnit = mat.efUnit;
    massFactor = mat.massFactor;
  }

  const qty = parseFloat($('tiQty').value);
  baselineEF = parseFloat($('tiBL').value);

  if (isNaN(qty) || qty <= 0) { alert('Enter a valid quantity'); return; }
  if (isNaN(baselineEF) || baselineEF <= 0) { alert('Enter a valid baseline emission factor'); return; }

  const baselineEmission = (qty * baselineEF) / 1000;

  _tenderItems.push({
    id: Date.now(),
    category,
    type,
    qty,
    unit,
    efUnit,
    massFactor,
    baselineEF,
    targetEF: baselineEF, // Tender = baseline only
    baselineEmission,
    targetEmission: baselineEmission, // Tender = baseline only
    isCustom,
    gwpSource: _tenderCurrentGWPSource || 'Manual',
    notes: $('tiNotes').value.trim()
  });

  // Recalculate 80% flags
  recalcTender80Pct();

  // Reset form
  $('tiCat').value = '';
  $('tiType').innerHTML = '<option>Select category first</option>';
  $('tiQty').value = '';
  $('tiBL').value = '';
  $('tiTG').value = '0';
  $('tiNotes').value = '';
  $('tiUnit').textContent = '\u2014';
  $('tiUnitCustom').value = '';
  $('tiPreview').innerHTML = '';
  $('tiCustomFields').style.display = 'none';
  $('tiTypeWrap').style.display = '';
  _tenderCurrentGWPSource = '';
  if ($('tiGWPSource')) $('tiGWPSource').value = '';
  if ($('tiSourceHelp')) $('tiSourceHelp').textContent = '';

  navigate('tender_entry');
}

function removeTenderItem(idx) {
  _tenderItems.splice(idx, 1);
  recalcTender80Pct();
  navigate('tender_entry');
}

function calcTenderTotals() {
  let baseline = 0, target = 0, a13Count = 0, iceCount = 0;
  _tenderItems.forEach(it => {
    baseline += it.baselineEmission || 0;
    target += it.targetEmission || 0;
    if (it.gwpSource === 'A1-A3') a13Count++;
    else if (it.gwpSource === 'ICE') iceCount++;
  });
  const rPct = baseline > 0 ? ((baseline - target) / baseline) * 100 : 0;
  // Count items in the 80% band
  const in80Count = _tenderItems.filter(it => it._in80Pct).length;
  return { baseline, target, rPct, a13Count, iceCount, in80Count };
}

// ===== 80% MATERIAL IDENTIFICATION =====
// Identifies items that cumulatively contribute to 80% of total baseline emissions
function recalcTender80Pct() {
  const totalBL = _tenderItems.reduce((s, it) => s + (it.baselineEmission || 0), 0);
  if (totalBL <= 0) { _tenderItems.forEach(it => { it._in80Pct = false; }); return; }
  // Sort by emission descending
  const sorted = _tenderItems.slice().sort((a, b) => (b.baselineEmission || 0) - (a.baselineEmission || 0));
  let cumulative = 0;
  const threshold = totalBL * 0.80;
  const in80Set = new Set();
  for (var i = 0; i < sorted.length; i++) {
    if (cumulative >= threshold) break;
    cumulative += sorted[i].baselineEmission || 0;
    in80Set.add(sorted[i].id);
  }
  _tenderItems.forEach(it => { it._in80Pct = in80Set.has(it.id); });
}

// Render 80% bar indicator
function renderTender80PctBar(totals) {
  const in80Count = totals.in80Count || 0;
  const totalCount = _tenderItems.length;
  const pct80Items = totalCount > 0 ? ((in80Count / totalCount) * 100).toFixed(0) : 0;
  const totalBL = totals.baseline;
  const in80BL = _tenderItems.filter(it => it._in80Pct).reduce((s, it) => s + (it.baselineEmission || 0), 0);
  const actualPct = totalBL > 0 ? ((in80BL / totalBL) * 100).toFixed(1) : 0;

  return `<div class="card" style="padding:14px 18px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700;color:var(--text)">80% Material Identification</div>
      <div style="font-size:12px;color:var(--slate4)"><strong style="color:var(--green)">${in80Count}</strong> of ${totalCount} items = <strong style="color:var(--green)">${actualPct}%</strong> of total emissions</div>
    </div>
    <div style="height:10px;background:var(--bg2);border-radius:6px;overflow:hidden;position:relative">
      <div style="height:100%;width:${actualPct}%;background:linear-gradient(90deg,rgba(52,211,153,0.7),rgba(52,211,153,0.4));border-radius:6px;transition:width 0.3s"></div>
      <div style="position:absolute;left:80%;top:0;bottom:0;width:2px;background:var(--red);opacity:0.6"></div>
    </div>
    <div style="font-size:10px;color:var(--slate5);margin-top:4px">Items marked with \u2713 in the table contribute to 80% of total baseline emissions. These are the key materials to focus on for carbon reduction.</div>
  </div>`;
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
  if (msg) msg.innerHTML = '<div style="padding:12px;background:rgba(52,211,153,0.1);border-radius:10px;color:var(--green);text-align:center;font-weight:600">\u2705 Tender scenario saved' + (dbConnected ? ' & synced to cloud' : '') + ' (baseline only, A1-A3 priority)</div>';
}

// ===== BREAKDOWN CHART =====
function renderTenderBreakdownChart() {
  const byCategory = {};
  _tenderItems.forEach(it => {
    if (!byCategory[it.category]) byCategory[it.category] = { baseline: 0, a13: 0, ice: 0 };
    byCategory[it.category].baseline += it.baselineEmission;
    if (it.gwpSource === 'A1-A3') byCategory[it.category].a13 += it.baselineEmission;
    else byCategory[it.category].ice += it.baselineEmission;
  });

  const cats = Object.entries(byCategory).sort((a, b) => b[1].baseline - a[1].baseline);
  const mx = Math.max(...cats.map(([, v]) => v.baseline), 1);

  return `<div class="card"><div class="card-title">Material Breakdown (Baseline Emissions)</div>
    <div class="chart-legend" style="margin-bottom:12px"><span><span class="chart-legend-dot" style="background:rgba(52,211,153,0.5)"></span> A1-A3 Sourced</span><span><span class="chart-legend-dot" style="background:rgba(96,165,250,0.5)"></span> ICE Sourced</span></div>
    <div class="bar-chart" style="height:180px">${cats.map(([c, v]) => `<div class="bar-group">
      <div class="bar-pair"><div class="bar" style="height:${(v.a13 / mx) * 160}px;background:rgba(52,211,153,0.5);width:20px;border-radius:4px 4px 0 0;min-height:${v.a13 > 0 ? 2 : 0}px"></div><div class="bar" style="height:${(v.ice / mx) * 160}px;background:rgba(96,165,250,0.5);width:20px;border-radius:4px 4px 0 0;min-height:${v.ice > 0 ? 2 : 0}px"></div></div>
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
    <div class="stat-card slate"><div class="sc-label">Spread</div><div class="sc-value">${fmt((highest.totalBaseline || 0) - (lowest.totalBaseline || 0))}</div><div class="sc-sub">tCO\u2082 difference</div></div>
  </div>

  <!-- Scenario Comparison Chart -->
  <div class="card">
    <div class="card-title">Scenario Comparison \u2014 Baseline Emissions</div>
    <div class="chart-legend" style="margin-bottom:12px"><span><span class="chart-legend-dot" style="background:rgba(148,163,184,0.4)"></span> Baseline (A1-A3)</span></div>
    ${renderComparisonBarChart(scenarios)}
  </div>

  <!-- Detailed Comparison Table -->
  <div class="card">
    <div class="card-title">Side-by-Side Comparison (Baseline Only)</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Scenario</th><th>Status</th><th class="r">Items</th><th class="r">Baseline (tCO\u2082)</th><th class="r">A1-A3 Items</th><th class="r">ICE Items</th><th>Created By</th></tr></thead>
      <tbody>${scenarios.map(s => {
        const items = s.items || [];
        const a13c = items.filter(it => it.gwpSource === 'A1-A3').length;
        const icec = items.filter(it => it.gwpSource === 'ICE').length;
        const isLowest = s.id === lowest.id;
        return `<tr${isLowest ? ' style="background:rgba(52,211,153,0.04)"' : ''}>
          <td style="font-weight:700;color:var(--text)">${esc(s.name)}${isLowest ? ' <span style="color:var(--green);font-size:9px;font-weight:700">\u2605 LOWEST</span>' : ''}</td>
          <td><span class="badge ${s.status === 'submitted' ? 'review' : s.status === 'approved' ? 'approved' : 'pending'}">${s.status || 'draft'}</span></td>
          <td class="r mono">${items.length}</td>
          <td class="r mono">${fmt(s.totalBaseline || 0)}</td>
          <td class="r mono" style="color:var(--green)">${a13c}</td>
          <td class="r mono" style="color:var(--blue)">${icec}</td>
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
  const mx = Math.max(...scenarios.map(s => s.totalBaseline || 0), 1);
  return `<div class="bar-chart" style="height:200px">${scenarios.map(s => `<div class="bar-group">
    <div class="bar-pair">
      <div class="bar baseline" style="height:${((s.totalBaseline || 0) / mx) * 180}px"></div>
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

  return `<div class="card"><div class="card-title">Material Category Comparison (Baseline)</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Category</th>${scenarios.map(s => `<th class="r" style="border-left:2px solid var(--border)">${esc(s.name)}</th>`).join('')}</tr></thead>
      <tbody>${cats.map(cat => {
        return `<tr><td style="font-weight:600">${esc(cat)}</td>${scenarios.map(s => {
          const items = (s.items || []).filter(it => it.category === cat);
          const bl = items.reduce((sum, it) => sum + (it.baselineEmission || 0), 0);
          return `<td class="r mono" style="border-left:2px solid var(--border)">${items.length ? fmt(bl) : '\u2014'}</td>`;
        }).join('')}</tr>`;
      }).join('')}
      <tr class="total-row"><td>Total</td>${scenarios.map(s => {
        return `<td class="r mono" style="border-left:2px solid var(--border)">${fmt(s.totalBaseline || 0)}</td>`;
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
      <thead><tr><th>Category</th><th>Type</th><th class="r">Qty</th><th>Unit</th><th class="r">Baseline EF</th><th class="r">Baseline (tCO\u2082)</th><th>GWP Source</th></tr></thead>
      <tbody>${items.map(it => {
        const srcBadge = it.gwpSource === 'A1-A3'
          ? '<span style="display:inline-block;background:rgba(52,211,153,0.1);color:var(--green);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">A1-A3</span>'
          : it.gwpSource === 'ICE'
          ? '<span style="display:inline-block;background:rgba(96,165,250,0.1);color:var(--blue);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">ICE</span>'
          : '<span style="display:inline-block;background:rgba(251,191,36,0.1);color:var(--yellow);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">Manual</span>';
        return `<tr>
          <td>${esc(it.category)}${it.isCustom ? ' <span style="color:var(--orange);font-size:9px">CUSTOM</span>' : ''}</td>
          <td>${esc(it.type)}</td>
          <td class="r mono">${fmtI(it.qty)}</td>
          <td>${it.unit}</td>
          <td class="r mono">${fmt(it.baselineEF)}</td>
          <td class="r mono">${fmt(it.baselineEmission)}</td>
          <td>${srcBadge}</td>
        </tr>`;
      }).join('')}
      ${items.length > 1 ? `<tr class="total-row">
        <td colspan="5">Total</td>
        <td class="r mono">${fmt(s.totalBaseline || 0)}</td>
        <td></td>
      </tr>` : ''}
      </tbody>
    </table></div>
  </div>`;
}

// ===== TENDER BOQ UPLOAD HANDLERS =====

function toggleTenderBOQUpload() {
  var body = $('tenderBOQBody');
  var btn = $('tenderBOQToggleBtn');
  if (!body) return;
  if (body.style.display === 'none') {
    body.style.display = '';
    if (btn) btn.textContent = 'Collapse';
  } else {
    body.style.display = 'none';
    if (btn) btn.textContent = 'Expand';
  }
}

function handleTenderBOQDrop(event) {
  var file = event.dataTransfer.files[0];
  if (file) handleTenderBOQFile(file);
}

function handleTenderBOQFile(file) {
  if (!file) return;
  _tenderBOQFileName = file.name;
  var ext = file.name.split('.').pop().toLowerCase();
  var info = $('tenderBOQFileInfo');
  if (info) { info.style.display = ''; info.textContent = 'Loading: ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)'; }

  // Auto-populate scenario name from file name if empty
  var nameInput = $('tsName');
  if (nameInput && !nameInput.value.trim()) {
    var baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
    nameInput.value = baseName;
    if (_tenderEdit) _tenderEdit.name = baseName;
  }

  // Handle PDF tender documents
  if (ext === 'pdf') {
    handleTenderPDFFile(file);
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      if (ext === 'csv') {
        var text = e.target.result;
        var rows = parseCSV(text);
        _tenderBOQParsed = rows;
        _tenderBOQWorkbook = null;
        $('tenderBOQSheetSel').style.display = 'none';
        if (info) info.textContent = file.name + ' \u2014 ' + (rows.length - 1) + ' data rows loaded';
        tenderBOQAutoMapColumns(rows);
      } else {
        if (typeof XLSX === 'undefined') {
          showTenderBOQError('SheetJS library not loaded. Please check your internet connection and refresh.');
          return;
        }
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array' });
        _tenderBOQWorkbook = wb;
        var sheetSel = $('tenderBOQSheet');
        sheetSel.innerHTML = wb.SheetNames.map(function(name, i) {
          return '<option value="' + i + '">' + name + '</option>';
        }).join('');
        $('tenderBOQSheetSel').style.display = '';
        processTenderBOQSheet();
        if (info) info.textContent = file.name + ' \u2014 ' + wb.SheetNames.length + ' sheet(s) found';
      }
    } catch (err) {
      showTenderBOQError('Failed to parse file: ' + err.message);
    }
  };
  if (ext === 'csv') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

// ===== PDF TENDER DOCUMENT PARSING =====
async function handleTenderPDFFile(file) {
  var info = $('tenderBOQFileInfo');
  var statusEl = $('tenderPDFStatus');

  if (typeof pdfjsLib === 'undefined') {
    showTenderBOQError('PDF.js library not loaded. Please check your internet connection and refresh.');
    return;
  }

  try {
    if (statusEl) {
      statusEl.style.display = '';
      statusEl.innerHTML = '<div style="padding:10px 14px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:10px;font-size:12px;color:var(--blue)"><strong>Reading PDF...</strong> Extracting text from tender document pages...</div>';
    }

    var arrayBuffer = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var totalPages = pdf.numPages;

    if (info) info.textContent = file.name + ' \u2014 ' + totalPages + ' page(s) \u2014 Extracting text...';

    // Extract text from all pages
    var allText = '';
    var allLines = [];
    for (var p = 1; p <= totalPages; p++) {
      var page = await pdf.getPage(p);
      var textContent = await page.getTextContent();
      var pageLines = extractLinesFromTextContent(textContent);
      allLines = allLines.concat(pageLines);
      allText += pageLines.join('\n') + '\n';
    }

    if (statusEl) {
      statusEl.innerHTML = '<div style="padding:10px 14px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;font-size:12px;color:var(--green)"><strong>PDF text extracted.</strong> ' + allLines.length + ' lines from ' + totalPages + ' pages. Parsing BOQ table structure...</div>';
    }

    // Parse the extracted text into structured BOQ rows
    var parsedRows = parsePDFTextToBOQ(allLines, allText);

    if (parsedRows.length < 2) {
      showTenderBOQError('Could not extract a BOQ table from this PDF. The document may not contain a structured Bill of Quantities, or the format is not recognized. Try uploading an Excel/CSV version instead.');
      if (statusEl) statusEl.style.display = 'none';
      return;
    }

    _tenderBOQParsed = parsedRows;
    _tenderBOQWorkbook = null;
    $('tenderBOQSheetSel').style.display = 'none';

    if (info) info.textContent = file.name + ' \u2014 PDF \u2014 ' + (parsedRows.length - 1) + ' BOQ rows extracted';

    if (statusEl) {
      statusEl.innerHTML = '<div style="padding:10px 14px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;font-size:12px;color:var(--green)"><strong>\u2705 PDF parsed successfully.</strong> Found ' + (parsedRows.length - 1) + ' potential BOQ line items. Map columns below and match to database.</div>';
    }

    tenderBOQAutoMapColumns(parsedRows);

  } catch (err) {
    showTenderBOQError('Failed to parse PDF: ' + err.message);
    if (statusEl) statusEl.style.display = 'none';
  }
}

// Extract lines from PDF.js text content, reconstructing rows by Y-position
function extractLinesFromTextContent(textContent) {
  if (!textContent || !textContent.items || !textContent.items.length) return [];

  // Group text items by their Y-position (rounded to group items on same line)
  var lineMap = {};
  textContent.items.forEach(function(item) {
    if (!item.str || !item.str.trim()) return;
    var y = Math.round(item.transform[5]); // Y-coordinate
    var x = item.transform[4]; // X-coordinate
    if (!lineMap[y]) lineMap[y] = [];
    lineMap[y].push({ x: x, text: item.str });
  });

  // Sort lines by Y descending (PDF coordinates are bottom-up)
  var yKeys = Object.keys(lineMap).map(Number).sort(function(a, b) { return b - a; });
  var lines = [];

  yKeys.forEach(function(y) {
    var items = lineMap[y].sort(function(a, b) { return a.x - b.x; });
    // Check if items are spread across columns (table-like)
    var lineText = items.map(function(it) { return it.text.trim(); }).join('\t');
    lines.push(lineText);
  });

  return lines;
}

// Parse extracted PDF text lines into structured BOQ rows (header + data)
function parsePDFTextToBOQ(lines, fullText) {
  // Strategy 1: Try to find tabular data with tab separators
  var tabularRows = [];
  for (var i = 0; i < lines.length; i++) {
    var parts = lines[i].split('\t').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
    if (parts.length >= 2) {
      tabularRows.push(parts);
    }
  }

  // Find the header row — look for rows containing keywords like "description", "quantity", "unit"
  var headerIdx = -1;
  var headerKeywords = ['description', 'item', 'material', 'qty', 'quantity', 'unit', 'amount', 'rate', 'total'];
  for (var h = 0; h < Math.min(tabularRows.length, 20); h++) {
    var rowLower = tabularRows[h].map(function(c) { return c.toLowerCase(); });
    var keywordHits = 0;
    headerKeywords.forEach(function(kw) {
      rowLower.forEach(function(cell) {
        if (cell.indexOf(kw) !== -1) keywordHits++;
      });
    });
    if (keywordHits >= 2) {
      headerIdx = h;
      break;
    }
  }

  // If found a header, extract structured data
  if (headerIdx >= 0 && tabularRows.length > headerIdx + 1) {
    var header = tabularRows[headerIdx];
    var dataRows = tabularRows.slice(headerIdx + 1);

    // Normalize column count to match header
    var colCount = header.length;
    var normalizedRows = [header];

    dataRows.forEach(function(row) {
      // Skip rows that look like subtotals or section headers
      var joined = row.join(' ').toLowerCase();
      if (joined.indexOf('subtotal') !== -1 || joined.indexOf('sub-total') !== -1 ||
          joined.indexOf('total') === 0 || joined.indexOf('grand total') !== -1 ||
          joined.indexOf('page ') !== -1) return;

      // Pad or trim to match header column count
      while (row.length < colCount) row.push('');
      if (row.length > colCount) row = row.slice(0, colCount);

      // Must have at least one non-empty cell with potential quantity data
      var hasNumber = row.some(function(c) { return /\d/.test(c); });
      var hasText = row.some(function(c) { return /[a-zA-Z]{2,}/.test(c); });
      if (hasNumber && hasText) normalizedRows.push(row);
    });

    if (normalizedRows.length >= 2) return normalizedRows;
  }

  // Strategy 2: Try to extract BOQ items using pattern matching on individual lines
  // Look for lines that have: description text followed by numbers (qty, rate, amount)
  var patternRows = [];
  var descQtyPattern = /^(.+?)\s+(\d[\d,]*\.?\d*)\s+(m[²³]?|m2|m3|kg|tons?|nr|no|nos?|ls|set|lot|pcs?|each|lm|rm|sqm|cum)\b/i;
  var numAtEndPattern = /^(.{10,}?)\s+(\d[\d,]*\.?\d*)\s*$/;

  for (var j = 0; j < lines.length; j++) {
    var line = lines[j].replace(/\t/g, '  ').trim();
    if (!line || line.length < 5) continue;

    var m1 = line.match(descQtyPattern);
    if (m1) {
      var desc = m1[1].trim();
      var qty = m1[2].replace(/,/g, '');
      var unit = m1[3].trim();
      // Skip lines that are clearly not BOQ items
      if (desc.length < 3 || /^(page|date|ref|no\.|item no|sl)/i.test(desc)) continue;
      patternRows.push([desc, qty, unit, '', '']);
      continue;
    }

    // Try to extract from tab-separated columns
    var tabParts = line.split(/\t+/).map(function(s) { return s.trim(); }).filter(function(s) { return s; });
    if (tabParts.length >= 3) {
      var hasDesc = /[a-zA-Z]{3,}/.test(tabParts[0]);
      var hasQty = false;
      var qtyVal = '', unitVal = '';
      for (var k = 1; k < tabParts.length; k++) {
        var numMatch = tabParts[k].match(/^(\d[\d,]*\.?\d*)$/);
        if (numMatch && !hasQty) { hasQty = true; qtyVal = numMatch[1].replace(/,/g, ''); }
        if (/^(m[²³]?|m2|m3|kg|tons?|nr|no|nos?|ls|set|lot|pcs?|each|lm|rm|sqm|cum)$/i.test(tabParts[k])) {
          unitVal = tabParts[k];
        }
      }
      if (hasDesc && hasQty) {
        patternRows.push([tabParts[0], qtyVal, unitVal, '', '']);
      }
    }
  }

  if (patternRows.length >= 1) {
    patternRows.unshift(['Description', 'Quantity', 'Unit', 'Category', 'Notes']);
    return patternRows;
  }

  // Strategy 3: Return empty if nothing found
  return [];
}

function processTenderBOQSheet() {
  if (!_tenderBOQWorkbook) return;
  var sheetIdx = parseInt($('tenderBOQSheet').value) || 0;
  var headerRowIdx = parseInt($('tenderBOQHeaderRow').value) || 0;
  var sheet = _tenderBOQWorkbook.Sheets[_tenderBOQWorkbook.SheetNames[sheetIdx]];
  var jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (jsonData.length <= headerRowIdx) {
    showTenderBOQError('Sheet is empty or header row is beyond data.');
    return;
  }
  var rows = jsonData.slice(headerRowIdx);
  _tenderBOQParsed = rows;
  var info = $('tenderBOQFileInfo');
  if (info) info.textContent = _tenderBOQFileName + ' \u2014 Sheet: ' + _tenderBOQWorkbook.SheetNames[sheetIdx] + ' \u2014 ' + (rows.length - 1) + ' data rows';
  tenderBOQAutoMapColumns(rows);
}

function tenderBOQAutoMapColumns(rows) {
  if (rows.length < 2) { showTenderBOQError('File has no data rows (need at least header + 1 row).'); return; }
  var headers = rows[0].map(function(h) { return String(h).toLowerCase().trim(); });

  var descCol = findColumn(headers, ['description', 'desc', 'item description', 'material description', 'boq item', 'item', 'material', 'name', 'element', 'component', 'spec', 'specification']);
  var qtyCol = findColumn(headers, ['quantity', 'qty', 'amount', 'vol', 'volume', 'weight', 'mass', 'total qty', 'boq qty', 'total quantity']);
  var unitCol = findColumn(headers, ['unit', 'uom', 'unit of measure', 'units', 'measure']);
  var catCol = findColumn(headers, ['category', 'cat', 'material category', 'group', 'material group', 'type', 'material type', 'class']);
  var efCol = findColumn(headers, ['ef', 'emission factor', 'carbon factor', 'gwp', 'co2', 'kgco2', 'embodied carbon', 'a1-a3', 'a1a3', 'epd']);
  var notesCol = findColumn(headers, ['notes', 'remarks', 'comment', 'comments', 'reference', 'ref', 'epd ref', 'source']);

  var mapEl = $('tenderBOQColMap');
  mapEl.style.display = '';
  mapEl.innerHTML =
    '<div style="padding:8px 12px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;margin-bottom:12px;font-size:11px;color:var(--green)">Auto-detected columns from your file. Adjust if needed.</div>' +
    '<div class="form-row c3">' +
    buildColSelect('tBOQMapDesc', 'Description / Material *', headers, descCol) +
    buildColSelect('tBOQMapQty', 'Quantity *', headers, qtyCol) +
    buildColSelect('tBOQMapUnit', 'Unit', headers, unitCol) +
    '</div><div class="form-row c3">' +
    buildColSelect('tBOQMapCat', 'Category (optional)', headers, catCol) +
    buildColSelect('tBOQMapEF', 'Emission Factor (optional)', headers, efCol) +
    buildColSelect('tBOQMapNotes', 'Notes (optional)', headers, notesCol) +
    '</div>' +
    '<div class="btn-row"><button class="btn btn-primary" onclick="matchTenderBOQRows()">\ud83d\udd17 Match to A1-A3 / ICE Database</button></div>';
}

function matchTenderBOQRows() {
  var descIdx = parseInt($('tBOQMapDesc').value);
  var qtyIdx = parseInt($('tBOQMapQty').value);
  var unitIdx = parseInt($('tBOQMapUnit').value);
  var catIdx = parseInt($('tBOQMapCat').value);
  var efIdx = parseInt($('tBOQMapEF').value);
  var notesIdx = parseInt($('tBOQMapNotes').value);

  if (descIdx < 0 || qtyIdx < 0) {
    showTenderBOQError('Please map at least Description and Quantity columns.');
    return;
  }

  var dataRows = _tenderBOQParsed.slice(1);
  _tenderBOQMatched = [];

  for (var r = 0; r < dataRows.length; r++) {
    var row = dataRows[r];
    var desc = String(row[descIdx] || '').trim();
    var rawQty = String(row[qtyIdx] || '').replace(/,/g, '');
    var qty = parseFloat(rawQty);
    var unit = unitIdx >= 0 ? String(row[unitIdx] || '').trim() : '';
    var catHint = catIdx >= 0 ? String(row[catIdx] || '').trim() : '';
    var efValue = efIdx >= 0 ? parseFloat(row[efIdx]) : NaN;
    var notes = notesIdx >= 0 ? String(row[notesIdx] || '').trim() : '';

    if (!desc || isNaN(qty) || qty <= 0) continue;

    // Use lookupTenderGWP: A1-A3 MATERIALS first, then ICE fallback
    var match = lookupTenderGWP(desc, catHint, unit);

    _tenderBOQMatched.push({
      rowNum: r + 2,
      description: desc,
      qty: qty,
      unit: unit || (match.mat ? match.mat.unit : ''),
      category: match.category || '',
      typeName: match.typeName || '',
      typeIdx: match.typeIdx,
      matched: match.matched,
      matchScore: match.score,
      baseline: match.baseline || 0,
      target: match.baseline || 0, // Tender = baseline only
      efOverride: !isNaN(efValue) ? efValue : 0,
      isMEP: match.isMEP || false,
      belowThreshold: match.belowThreshold || false,
      coveragePct: match.coveragePct || 100,
      notes: notes,
      mat: match.mat,
      gwpSource: match.gwpSource || 'none'
    });
  }

  renderTenderBOQPreview();
}

function renderTenderBOQPreview() {
  var matchedCount = _tenderBOQMatched.filter(function(r) { return r.matched; }).length;
  var unmatchedCount = _tenderBOQMatched.length - matchedCount;
  var a13Count = _tenderBOQMatched.filter(function(r) { return r.gwpSource === 'A1-A3'; }).length;
  var iceCount = _tenderBOQMatched.filter(function(r) { return r.gwpSource === 'ICE'; }).length;

  var totalBL = 0;
  _tenderBOQMatched.filter(function(r) { return r.matched; }).forEach(function(r) {
    totalBL += (r.qty * r.baseline) / 1000;
  });

  var prevEl = $('tenderBOQPreview');
  prevEl.style.display = '';

  var html = '<div class="stats-row" style="margin-bottom:12px">' +
    '<div class="stat-card green"><div class="sc-label">A1-A3 Matched</div><div class="sc-value">' + a13Count + '</div><div class="sc-sub">consultant baseline factors</div></div>' +
    '<div class="stat-card blue"><div class="sc-label">ICE Matched</div><div class="sc-value">' + iceCount + '</div><div class="sc-sub">ICE database fallback</div></div>' +
    '<div class="stat-card orange"><div class="sc-label">Unmatched</div><div class="sc-value">' + unmatchedCount + '</div><div class="sc-sub">need manual edit</div></div>' +
    '<div class="stat-card cyan"><div class="sc-label">Total Baseline</div><div class="sc-value">' + fmt(totalBL) + '</div><div class="sc-sub">tCO\u2082eq (baseline only)</div></div>' +
    '</div>';

  html += '<div class="tbl-wrap" style="max-height:400px;overflow-y:auto"><table><thead><tr><th>Row</th><th>BOQ Description</th><th class="r">Qty</th><th>Unit</th><th>Category</th><th>Type</th><th class="r">Baseline EF</th><th>GWP Source</th><th>Status</th><th></th></tr></thead><tbody>';

  for (var i = 0; i < _tenderBOQMatched.length; i++) {
    var r = _tenderBOQMatched[i];
    var srcBadge = r.gwpSource === 'A1-A3'
      ? '<span style="display:inline-block;background:rgba(52,211,153,0.1);color:var(--green);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">A1-A3</span>'
      : r.gwpSource === 'ICE'
      ? '<span style="display:inline-block;background:rgba(96,165,250,0.1);color:var(--blue);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">ICE</span>'
      : '';
    var statusBadge = r.matched
      ? (r.belowThreshold
        ? '<span style="display:inline-block;background:rgba(239,68,68,0.1);color:var(--red);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">MEP A1-A3=0</span>'
        : '<span style="display:inline-block;background:rgba(52,211,153,0.1);color:var(--green);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">Matched (' + r.matchScore + ')</span>')
      : '<span style="display:inline-block;background:rgba(251,191,36,0.1);color:var(--yellow);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">Unmatched</span>';

    html += '<tr' + (!r.matched ? ' style="background:rgba(251,191,36,0.03)"' : r.belowThreshold ? ' style="background:rgba(239,68,68,0.03)"' : '') + '>' +
      '<td style="color:var(--slate5);font-size:11px">' + r.rowNum + '</td>' +
      '<td style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escAttrT(r.description) + '">' + esc(r.description) + '</td>' +
      '<td class="r mono" style="font-size:11px">' + fmtI(r.qty) + '</td>' +
      '<td style="font-size:11px">' + esc(r.unit) + '</td>' +
      '<td style="font-weight:600;font-size:11px;color:' + (r.matched ? 'var(--text)' : 'var(--yellow)') + '">' + (r.category || '\u2014') + '</td>' +
      '<td style="font-size:10px">' + (r.typeName || '\u2014') + '</td>' +
      '<td class="r mono" style="font-size:11px">' + (r.baseline || '\u2014') + '</td>' +
      '<td>' + srcBadge + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td><button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 6px" onclick="editTenderBOQRow(' + i + ')">Edit</button>' +
      ' <button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 6px" onclick="removeTenderBOQRow(' + i + ')">\u2715</button></td>' +
      '</tr>';
  }
  html += '</tbody></table></div>';

  html += '<div class="btn-row" style="margin-top:14px">' +
    '<button class="btn btn-primary" onclick="addTenderBOQToItems()">\u2705 Add ' + matchedCount + ' Matched Items to Tender</button>' +
    '<button class="btn btn-secondary" onclick="addTenderBOQAllToItems()">Add All ' + _tenderBOQMatched.length + ' Items (incl. unmatched)</button>' +
    '</div>' +
    '<div id="tenderBOQAddMsg" style="margin-top:8px"></div>';

  prevEl.innerHTML = html;
}

function escAttrT(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function editTenderBOQRow(idx) {
  var r = _tenderBOQMatched[idx];

  // Build category options: A1-A3 MATERIALS first, then ICE
  var catOptions = '<option value="">Select category...</option>';
  // A1-A3 categories first
  var a13Cats = Object.keys(MATERIALS);
  if (a13Cats.length > 0) {
    catOptions += '<optgroup label="A1-A3 Baseline Factors">';
    a13Cats.forEach(function(c) { catOptions += '<option value="' + c + '"' + (c === r.category ? ' selected' : '') + '>' + c + ' (A1-A3)</option>'; });
    catOptions += '</optgroup>';
  }
  // ICE categories
  var groups = getICEGroups();
  Object.entries(groups).forEach(function(entry) {
    var grp = entry[0];
    var cats = entry[1];
    catOptions += '<optgroup label="ICE: ' + grp + '">';
    cats.forEach(function(c) { catOptions += '<option value="' + c + '"' + (c === r.category && r.gwpSource !== 'A1-A3' ? ' selected' : '') + '>' + c + '</option>'; });
    catOptions += '</optgroup>';
  });

  var typeOptions = '<option value="">Select type...</option>';
  var editMat = MATERIALS[r.category] || ICE_MATERIALS[r.category];
  if (r.category && editMat) {
    var isA13Edit = !!MATERIALS[r.category];
    editMat.types.forEach(function(t, i) {
      var covTag = (!isA13Edit && ICE_MATERIALS[r.category] && ICE_MATERIALS[r.category].isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD) ? ' [A1-A3=0]' : '';
      typeOptions += '<option value="' + i + '"' + (t.name === r.typeName ? ' selected' : '') + '>' + t.name + covTag + '</option>';
    });
  }

  var overlay = document.createElement('div');
  overlay.id = 'tBOQEditOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div style="max-width:560px;width:100%"><div class="card">' +
    '<div class="card-title">Edit BOQ Row ' + r.rowNum + ': ' + esc(r.description.substring(0, 50)) + '</div>' +
    '<div class="form-row c2">' +
    '<div class="fg"><label>ICE Category</label><select id="tBOQEditCat" onchange="onTBOQEditCat()">' + catOptions + '</select></div>' +
    '<div class="fg"><label>ICE Type</label><select id="tBOQEditType">' + typeOptions + '</select></div>' +
    '</div>' +
    '<div class="form-row c2">' +
    '<div class="fg"><label>Quantity</label><input type="number" id="tBOQEditQty" value="' + r.qty + '"></div>' +
    '<div class="fg"><label>Unit</label><input id="tBOQEditUnit" value="' + esc(r.unit) + '"></div>' +
    '</div>' +
    '<div class="form-row c2">' +
    '<div class="fg"><label>Notes</label><input id="tBOQEditNotes" value="' + escAttrT(r.notes) + '"></div>' +
    '<div class="fg"></div>' +
    '</div>' +
    '<div class="btn-row"><button class="btn btn-primary" onclick="saveTenderBOQEdit(' + idx + ')">Save</button>' +
    '<button class="btn btn-secondary" onclick="document.getElementById(\'tBOQEditOverlay\').remove()">Cancel</button></div>' +
    '</div></div>';
  document.body.appendChild(overlay);
}

function onTBOQEditCat() {
  var cat = $('tBOQEditCat').value;
  var typeSel = $('tBOQEditType');
  typeSel.innerHTML = '<option value="">Select type...</option>';
  // Check A1-A3 first, then ICE
  var a13m = MATERIALS[cat];
  var icem = ICE_MATERIALS[cat];
  var m = a13m || icem;
  if (cat && m) {
    m.types.forEach(function(t, i) {
      var covTag = (!a13m && icem && icem.isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD) ? ' [A1-A3=0]' : '';
      typeSel.innerHTML += '<option value="' + i + '">' + t.name + covTag + '</option>';
    });
  }
}

function saveTenderBOQEdit(idx) {
  var cat = $('tBOQEditCat').value;
  var typeIdx = parseInt($('tBOQEditType').value);
  var qty = parseFloat($('tBOQEditQty').value);
  var unit = $('tBOQEditUnit').value.trim();
  var notes = $('tBOQEditNotes').value.trim();

  var r = _tenderBOQMatched[idx];
  r.qty = isNaN(qty) ? r.qty : qty;
  r.unit = unit || r.unit;
  r.notes = notes;

  if (cat && !isNaN(typeIdx) && typeIdx >= 0) {
    // Check A1-A3 MATERIALS first, then ICE
    var a13m = MATERIALS[cat];
    var icem = ICE_MATERIALS[cat];
    var m = a13m || icem;
    if (m) {
      var t = m.types[typeIdx];
      var isA13 = !!a13m;
      var belowThreshold = !isA13 && icem && icem.isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD;
      r.category = cat;
      r.typeName = t.name;
      r.typeIdx = typeIdx;
      r.matched = true;
      r.matchScore = 100;
      r.baseline = belowThreshold ? 0 : t.baseline;
      r.target = r.baseline; // Tender = baseline only
      r.isMEP = !isA13 && !!icem && !!icem.isMEP;
      r.belowThreshold = belowThreshold;
      r.coveragePct = t.coveragePct || 100;
      r.mat = m;
      r.gwpSource = isA13 ? 'A1-A3' : 'ICE';
    }
  }

  var overlay = $('tBOQEditOverlay');
  if (overlay) overlay.remove();
  renderTenderBOQPreview();
}

function removeTenderBOQRow(idx) {
  _tenderBOQMatched.splice(idx, 1);
  renderTenderBOQPreview();
}

function addTenderBOQToItems() {
  var matched = _tenderBOQMatched.filter(function(r) { return r.matched; });
  if (matched.length === 0) {
    showTenderBOQMsg('tenderBOQAddMsg', 'No matched rows to add. Edit unmatched rows first.', 'red');
    return;
  }
  _addBOQItemsToTender(matched);
}

function addTenderBOQAllToItems() {
  if (_tenderBOQMatched.length === 0) {
    showTenderBOQMsg('tenderBOQAddMsg', 'No rows to add.', 'red');
    return;
  }
  _addBOQItemsToTender(_tenderBOQMatched);
}

function _addBOQItemsToTender(rows) {
  var count = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var m = r.mat || MATERIALS[r.category] || ICE_MATERIALS[r.category];
    var bl = r.belowThreshold ? 0 : r.baseline;
    var blEm = (r.qty * bl) / 1000;

    _tenderItems.push({
      id: Date.now() + i,
      category: r.category || 'Unmatched',
      type: r.typeName || r.description,
      qty: r.qty,
      unit: r.unit || (m ? m.unit : ''),
      efUnit: m ? m.efUnit : '',
      massFactor: m ? m.massFactor : 1,
      baselineEF: bl,
      targetEF: bl, // Tender = baseline only
      baselineEmission: blEm,
      targetEmission: blEm, // Tender = baseline only
      isCustom: !r.matched,
      gwpSource: r.gwpSource || (r.matched ? 'ICE' : 'Manual'),
      notes: r.description + (r.notes ? ' | ' + r.notes : '') + (r.belowThreshold ? ' [MEP <80% Coverage]' : '') + (r.gwpSource ? ' [' + r.gwpSource + ']' : '')
    });
    count++;
  }

  // Recalculate 80% flags after adding all items
  recalcTender80Pct();

  var nameInput = $('tsName');
  if (nameInput && !nameInput.value.trim()) {
    nameInput.value = _tenderBOQFileName ? _tenderBOQFileName.replace(/\.[^.]+$/, '') : 'BOQ Upload';
  }
  var descInput = $('tsDesc');
  if (descInput && !descInput.value.trim()) {
    descInput.value = 'Imported from BOQ: ' + _tenderBOQFileName;
  }

  _tenderBOQMode = false;
  _tenderBOQMatched = [];
  _tenderBOQParsed = [];
  _tenderBOQWorkbook = null;

  navigate('tender_entry');
}

function showTenderBOQError(msg) {
  var el = $('tenderBOQParseMsg');
  if (el) el.innerHTML = '<div style="padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;color:var(--red);font-size:12px">' + msg + '</div>';
}

function showTenderBOQMsg(elId, msg, color) {
  var el = $(elId);
  if (el) el.innerHTML = '<div style="padding:8px 12px;background:rgba(' + (color === 'green' ? '52,211,153' : color === 'red' ? '239,68,68' : '251,191,36') + ',0.1);border-radius:10px;color:var(--' + color + ');font-size:12px;font-weight:600">' + msg + '</div>';
}
