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
let _tenderBOQProcessing = false; // Guard: true while a file is being parsed/mapped
let _tenderBOQLastResult = null;  // Stores last upload result summary for display

// Detect mobile device
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
}

// Open file picker for BOQ upload
function openTenderFileInput() {
  var input = document.getElementById('tenderBOQFileInput');
  if (!input) return;
  // Reset value so the same file can be re-selected
  input.value = '';
  input.click();
}

// Validate selected file type after user picks a file
function validateAndHandleTenderFile(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var ext = file.name.split('.').pop().toLowerCase();
  var allowed = ['pdf', 'xlsx', 'xls', 'csv'];
  if (allowed.indexOf(ext) === -1) {
    alert('Unsupported file type: .' + ext + '\n\nPlease select a PDF, Excel (.xlsx/.xls), or CSV file.\n\nOn mobile: tap "Browse" or "Choose Files" to find your document.');
    input.value = '';
    return;
  }
  handleTenderBOQFile(file);
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
      <span>\ud83d\udcc2 Upload BOQ File</span>
      <button class="btn btn-secondary btn-sm" onclick="toggleTenderBOQUpload()" id="tenderBOQToggleBtn">${_tenderBOQMode ? 'Collapse' : 'Expand'}</button>
    </div>
    <div id="tenderBOQBody" style="${_tenderBOQMode ? '' : 'display:none'}">
      <div style="padding:10px 14px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;margin-bottom:14px;font-size:12px;color:var(--slate4);line-height:1.8">
        <strong style="color:var(--green)">Upload your BOQ</strong> \u2014 the system will automatically:<br>
        \u2705 Read & parse your file (PDF, Excel, CSV)<br>
        \u2705 Identify materials and quantities<br>
        \u2705 Match to <strong>A1-A3 baseline factors</strong> (priority) then <strong>ICE Database</strong> (fallback)<br>
        \u2705 Calculate embodied carbon & identify materials contributing to <strong>80% of total emissions</strong>
      </div>
      <label for="tenderBOQFileInput" id="tenderBOQDropZone" style="display:block;border:2px dashed rgba(52,211,153,0.3);border-radius:14px;padding:32px 20px;text-align:center;cursor:pointer;transition:all 0.2s;background:rgba(52,211,153,0.02)"
        ondragover="event.preventDefault();this.style.borderColor='var(--green)';this.style.background='rgba(52,211,153,0.06)'"
        ondragleave="this.style.borderColor='rgba(52,211,153,0.3)';this.style.background='rgba(52,211,153,0.02)'"
        ondrop="event.preventDefault();this.style.borderColor='rgba(52,211,153,0.3)';this.style.background='rgba(52,211,153,0.02)';handleTenderBOQDrop(event)">
        <div style="font-size:28px;opacity:0.4;margin-bottom:4px">\ud83d\udcc2</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px">Tap to select your BOQ file</div>
        <div style="font-size:11px;color:var(--slate5)">Supports .pdf, .xlsx, .xls, .csv</div>
      </label>
      <input type="file" id="tenderBOQFileInput" accept=".pdf,.xlsx,.xls,.csv" style="position:absolute;left:-9999px;opacity:0" onchange="validateAndHandleTenderFile(this)">
      <div style="margin-top:10px;text-align:center">
        <label for="tenderBOQFileInput" class="btn btn-primary" style="display:inline-block;cursor:pointer;margin:0">Choose File</label>
      </div>
      <div id="tenderBOQStatus" style="display:none;margin-top:12px"></div>
      <div id="tenderBOQParseMsg" style="margin-top:10px"></div>
      ${_tenderBOQLastResult ? renderBOQResultSummary(_tenderBOQLastResult) : ''}
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

// ===== BOQ UPLOAD RESULT SUMMARY =====
function renderBOQResultSummary(r) {
  return '<div style="margin-top:14px;padding:14px 16px;background:rgba(52,211,153,0.08);border:2px solid rgba(52,211,153,0.3);border-radius:12px">' +
    '<div style="font-size:14px;font-weight:700;color:var(--green);margin-bottom:10px">\u2705 BOQ processed successfully: ' + esc(r.fileName) + '</div>' +
    '<div class="stats-row" style="margin-bottom:8px">' +
    '<div class="stat-card green"><div class="sc-label">A1-A3 Matched</div><div class="sc-value">' + r.a13Count + '</div></div>' +
    '<div class="stat-card blue"><div class="sc-label">ICE Matched</div><div class="sc-value">' + r.iceCount + '</div></div>' +
    '<div class="stat-card orange"><div class="sc-label">Unmatched</div><div class="sc-value">' + r.unmatchedCount + '</div></div>' +
    '<div class="stat-card cyan"><div class="sc-label">Total Baseline</div><div class="sc-value">' + fmt(r.totalBL) + '</div><div class="sc-sub">tCO\u2082eq</div></div>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--slate4)">' + r.totalItems + ' line items added. See the <strong>BOQ Line Items</strong> table and <strong>80% Material Identification</strong> bar below.</div>' +
    '<div class="btn-row" style="margin-top:10px"><button class="btn btn-secondary btn-sm" onclick="clearBOQResult()">Dismiss</button>' +
    '<button class="btn btn-primary btn-sm" onclick="clearBOQResult();openTenderFileInput()">Upload Another File</button></div>' +
    '</div>';
}

function clearBOQResult() {
  _tenderBOQLastResult = null;
  _tenderBOQMode = false;
  navigate('tender_entry');
}

// ===== TENDER BOQ UPLOAD HANDLERS =====

function toggleTenderBOQUpload() {
  var body = $('tenderBOQBody');
  var btn = $('tenderBOQToggleBtn');
  if (!body) return;
  if (body.style.display === 'none') {
    body.style.display = '';
    _tenderBOQMode = true;
    if (btn) btn.textContent = 'Collapse';
  } else {
    body.style.display = 'none';
    _tenderBOQMode = false;
    _tenderBOQProcessing = false;
    if (btn) btn.textContent = 'Expand';
  }
}

function handleTenderBOQDrop(event) {
  var file = event.dataTransfer.files[0];
  if (file) handleTenderBOQFile(file);
}

// Show processing status in the BOQ upload section
function showBOQStatus(msg, type) {
  var el = $('tenderBOQStatus');
  if (!el) return;
  el.style.display = '';
  var colors = { info: 'rgba(96,165,250', green: 'rgba(52,211,153', red: 'rgba(239,68,68', yellow: 'rgba(251,191,36' };
  var colorVars = { info: 'var(--blue)', green: 'var(--green)', red: 'var(--red)', yellow: 'var(--yellow)' };
  var c = colors[type] || colors.info;
  var cv = colorVars[type] || colorVars.info;
  el.innerHTML = '<div style="padding:10px 14px;background:' + c + ',0.06);border:1px solid ' + c + ',0.15);border-radius:10px;font-size:12px;color:' + cv + '">' + msg + '</div>';
}

// ===== FULLY AUTOMATIC BOQ FILE PROCESSING =====
// Upload file → parse → detect columns → match GWP → add to tender → show results
// No manual steps required from the contractor

function handleTenderBOQFile(file) {
  if (!file) return;
  _tenderBOQProcessing = true;
  _tenderBOQFileName = file.name;
  var ext = file.name.split('.').pop().toLowerCase();

  // Auto-populate scenario name from file name if empty
  var nameInput = $('tsName');
  if (nameInput && !nameInput.value.trim()) {
    var baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
    nameInput.value = baseName;
    if (_tenderEdit) _tenderEdit.name = baseName;
  }

  showBOQStatus('<strong>Step 1/4:</strong> Reading ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)...', 'info');

  if (ext === 'pdf') {
    handleTenderPDFFile(file);
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var rows;
      if (ext === 'csv') {
        rows = parseCSV(e.target.result);
      } else {
        if (typeof XLSX === 'undefined') {
          _tenderBOQProcessing = false;
          showBOQStatus('<strong>Error:</strong> SheetJS library not loaded. Please refresh the page.', 'red');
          return;
        }
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array' });
        // Auto-select first sheet, auto-detect header row
        var sheet = wb.Sheets[wb.SheetNames[0]];
        var jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        // Auto-detect header row (first row with 2+ text columns)
        var headerRowIdx = autoDetectHeaderRow(jsonData);
        rows = jsonData.slice(headerRowIdx);
      }

      if (!rows || rows.length < 2) {
        _tenderBOQProcessing = false;
        showBOQStatus('<strong>Error:</strong> File has no usable data rows. Please check the file and try again.', 'red');
        return;
      }

      showBOQStatus('<strong>Step 2/4:</strong> Found ' + (rows.length - 1) + ' data rows. Identifying columns...', 'info');

      // Auto-detect columns and immediately match + add
      autoMatchAndAddBOQ(rows, file.name);

    } catch (err) {
      _tenderBOQProcessing = false;
      showBOQStatus('<strong>Error:</strong> Failed to parse file: ' + err.message, 'red');
    }
  };
  if (ext === 'csv') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

// Auto-detect header row index in Excel/CSV data
function autoDetectHeaderRow(jsonData) {
  for (var i = 0; i < Math.min(jsonData.length, 10); i++) {
    var row = jsonData[i];
    if (!row || row.length < 2) continue;
    var textCols = 0;
    for (var j = 0; j < row.length; j++) {
      var cell = String(row[j] || '').toLowerCase().trim();
      if (cell && /[a-z]{2,}/.test(cell)) textCols++;
    }
    if (textCols >= 2) return i;
  }
  return 0;
}

// Fully automatic: detect columns → match GWP → add items to tender → re-render
function autoMatchAndAddBOQ(rows, fileName) {
  var headers = rows[0].map(function(h) { return String(h).toLowerCase().trim(); });

  var descCol = findColumn(headers, ['description', 'desc', 'item description', 'material description', 'boq item', 'item', 'material', 'name', 'element', 'component', 'spec', 'specification']);
  var qtyCol = findColumn(headers, ['quantity', 'qty', 'amount', 'vol', 'volume', 'weight', 'mass', 'total qty', 'boq qty', 'total quantity']);
  var unitCol = findColumn(headers, ['unit', 'uom', 'unit of measure', 'units', 'measure']);
  var catCol = findColumn(headers, ['category', 'cat', 'material category', 'group', 'material group', 'type', 'material type', 'class']);
  var efCol = findColumn(headers, ['ef', 'emission factor', 'carbon factor', 'gwp', 'co2', 'kgco2', 'embodied carbon', 'a1-a3', 'a1a3', 'epd']);
  var notesCol = findColumn(headers, ['notes', 'remarks', 'comment', 'comments', 'reference', 'ref', 'epd ref', 'source']);

  if (descCol < 0 || qtyCol < 0) {
    _tenderBOQProcessing = false;
    showBOQStatus('<strong>Error:</strong> Could not auto-detect Description and Quantity columns in your file. Headers found: ' + headers.filter(function(h) { return h; }).join(', '), 'red');
    return;
  }

  showBOQStatus('<strong>Step 3/4:</strong> Matching materials to A1-A3 factors & ICE database...', 'info');

  // Match all rows to GWP database
  var dataRows = rows.slice(1);
  var matchedItems = [];
  var a13Count = 0, iceCount = 0, unmatchedCount = 0;

  for (var r = 0; r < dataRows.length; r++) {
    var row = dataRows[r];
    var desc = String(row[descCol] || '').trim();
    var rawQty = String(row[qtyCol] || '').replace(/,/g, '');
    var qty = parseFloat(rawQty);
    var unit = unitCol >= 0 ? String(row[unitCol] || '').trim() : '';
    var catHint = catCol >= 0 ? String(row[catCol] || '').trim() : '';
    var efValue = efCol >= 0 ? parseFloat(row[efCol]) : NaN;
    var notes = notesCol >= 0 ? String(row[notesCol] || '').trim() : '';

    if (!desc || isNaN(qty) || qty <= 0) continue;

    var match = lookupTenderGWP(desc, catHint, unit);

    if (match.gwpSource === 'A1-A3') a13Count++;
    else if (match.gwpSource === 'ICE') iceCount++;
    else unmatchedCount++;

    var m = match.mat || MATERIALS[match.category] || ICE_MATERIALS[match.category];
    var bl = (match.belowThreshold ? 0 : match.baseline) || 0;
    var blEm = (qty * bl) / 1000;

    _tenderItems.push({
      id: Date.now() + r,
      category: match.category || 'Unmatched',
      type: match.typeName || desc,
      qty: qty,
      unit: unit || (m ? m.unit : ''),
      efUnit: m ? m.efUnit : '',
      massFactor: m ? m.massFactor : 1,
      baselineEF: bl,
      targetEF: bl,
      baselineEmission: blEm,
      targetEmission: blEm,
      isCustom: !match.matched,
      gwpSource: match.gwpSource || (match.matched ? 'ICE' : 'Manual'),
      notes: desc + (notes ? ' | ' + notes : '') + (match.belowThreshold ? ' [MEP <80% Coverage]' : '') + (match.gwpSource ? ' [' + match.gwpSource + ']' : '')
    });
  }

  // Calculate 80% material identification
  recalcTender80Pct();

  // Auto-fill description
  var descInput = $('tsDesc');
  if (descInput && !descInput.value.trim()) {
    descInput.value = 'Imported from BOQ: ' + fileName;
  }

  // Store result summary for display after re-render
  var totalItems = _tenderItems.length;
  var totalBL = 0;
  _tenderItems.forEach(function(it) { totalBL += it.baselineEmission || 0; });

  // Clear processing state but keep BOQ section visible to show results
  _tenderBOQMode = true; // Keep visible to show success
  _tenderBOQMatched = [];
  _tenderBOQParsed = [];
  _tenderBOQWorkbook = null;
  _tenderBOQProcessing = false;
  _tenderBOQLastResult = {
    fileName: fileName,
    totalItems: totalItems,
    a13Count: a13Count,
    iceCount: iceCount,
    unmatchedCount: unmatchedCount,
    totalBL: totalBL
  };

  // Re-render the form with results, then scroll to show them
  navigate('tender_entry');

  // Scroll to the result summary after DOM update
  setTimeout(function() {
    var boqCard = $('tenderBOQCard');
    if (boqCard) boqCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ===== PDF TENDER DOCUMENT PARSING =====
async function handleTenderPDFFile(file) {
  if (typeof pdfjsLib === 'undefined') {
    _tenderBOQProcessing = false;
    showBOQStatus('<strong>Error:</strong> PDF.js library not loaded. Please refresh the page.', 'red');
    return;
  }

  try {
    showBOQStatus('<strong>Step 1/4:</strong> Reading PDF... Extracting text from pages...', 'info');

    var arrayBuffer = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var totalPages = pdf.numPages;

    var allText = '';
    var allLines = [];
    for (var p = 1; p <= totalPages; p++) {
      showBOQStatus('<strong>Step 1/4:</strong> Reading PDF page ' + p + ' of ' + totalPages + '...', 'info');
      var page = await pdf.getPage(p);
      var textContent = await page.getTextContent();
      var pageLines = extractLinesFromTextContent(textContent);
      allLines = allLines.concat(pageLines);
      allText += pageLines.join('\n') + '\n';
    }

    showBOQStatus('<strong>Step 2/4:</strong> Extracted ' + allLines.length + ' lines from ' + totalPages + ' pages. Parsing BOQ structure...', 'info');

    var parsedRows = parsePDFTextToBOQ(allLines, allText);

    if (parsedRows.length < 2) {
      _tenderBOQProcessing = false;
      showBOQStatus('<strong>Error:</strong> Could not extract a BOQ table from this PDF. The document may not contain a structured Bill of Quantities. Try uploading an Excel/CSV version instead.', 'red');
      return;
    }

    // Auto-match and add to tender
    autoMatchAndAddBOQ(parsedRows, file.name);

  } catch (err) {
    _tenderBOQProcessing = false;
    showBOQStatus('<strong>Error:</strong> Failed to parse PDF: ' + err.message, 'red');
  }
}

// Extract lines from PDF.js text content, reconstructing rows by Y-position
function extractLinesFromTextContent(textContent) {
  if (!textContent || !textContent.items || !textContent.items.length) return [];

  var lineMap = {};
  textContent.items.forEach(function(item) {
    if (!item.str || !item.str.trim()) return;
    var y = Math.round(item.transform[5]);
    var x = item.transform[4];
    if (!lineMap[y]) lineMap[y] = [];
    lineMap[y].push({ x: x, text: item.str });
  });

  var yKeys = Object.keys(lineMap).map(Number).sort(function(a, b) { return b - a; });
  var lines = [];
  yKeys.forEach(function(y) {
    var items = lineMap[y].sort(function(a, b) { return a.x - b.x; });
    lines.push(items.map(function(it) { return it.text.trim(); }).join('\t'));
  });
  return lines;
}

// Parse extracted PDF text lines into structured BOQ rows (header + data)
function parsePDFTextToBOQ(lines, fullText) {
  var tabularRows = [];
  for (var i = 0; i < lines.length; i++) {
    var parts = lines[i].split('\t').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
    if (parts.length >= 2) tabularRows.push(parts);
  }

  var headerIdx = -1;
  var headerKeywords = ['description', 'item', 'material', 'qty', 'quantity', 'unit', 'amount', 'rate', 'total'];
  for (var h = 0; h < Math.min(tabularRows.length, 20); h++) {
    var rowLower = tabularRows[h].map(function(c) { return c.toLowerCase(); });
    var keywordHits = 0;
    headerKeywords.forEach(function(kw) {
      rowLower.forEach(function(cell) { if (cell.indexOf(kw) !== -1) keywordHits++; });
    });
    if (keywordHits >= 2) { headerIdx = h; break; }
  }

  if (headerIdx >= 0 && tabularRows.length > headerIdx + 1) {
    var header = tabularRows[headerIdx];
    var dataRows = tabularRows.slice(headerIdx + 1);
    var colCount = header.length;
    var normalizedRows = [header];

    dataRows.forEach(function(row) {
      var joined = row.join(' ').toLowerCase();
      if (joined.indexOf('subtotal') !== -1 || joined.indexOf('sub-total') !== -1 ||
          joined.indexOf('total') === 0 || joined.indexOf('grand total') !== -1 ||
          joined.indexOf('page ') !== -1) return;
      while (row.length < colCount) row.push('');
      if (row.length > colCount) row = row.slice(0, colCount);
      var hasNumber = row.some(function(c) { return /\d/.test(c); });
      var hasText = row.some(function(c) { return /[a-zA-Z]{2,}/.test(c); });
      if (hasNumber && hasText) normalizedRows.push(row);
    });

    if (normalizedRows.length >= 2) return normalizedRows;
  }

  // Strategy 2: Pattern matching
  var patternRows = [];
  var descQtyPattern = /^(.+?)\s+(\d[\d,]*\.?\d*)\s+(m[²³]?|m2|m3|kg|tons?|nr|no|nos?|ls|set|lot|pcs?|each|lm|rm|sqm|cum)\b/i;

  for (var j = 0; j < lines.length; j++) {
    var line = lines[j].replace(/\t/g, '  ').trim();
    if (!line || line.length < 5) continue;

    var m1 = line.match(descQtyPattern);
    if (m1) {
      var desc = m1[1].trim();
      var qty = m1[2].replace(/,/g, '');
      var unit = m1[3].trim();
      if (desc.length < 3 || /^(page|date|ref|no\.|item no|sl)/i.test(desc)) continue;
      patternRows.push([desc, qty, unit, '', '']);
      continue;
    }

    var tabParts = line.split(/\t+/).map(function(s) { return s.trim(); }).filter(function(s) { return s; });
    if (tabParts.length >= 3) {
      var hasDesc = /[a-zA-Z]{3,}/.test(tabParts[0]);
      var hasQty = false;
      var qtyVal = '', unitVal = '';
      for (var k = 1; k < tabParts.length; k++) {
        var numMatch = tabParts[k].match(/^(\d[\d,]*\.?\d*)$/);
        if (numMatch && !hasQty) { hasQty = true; qtyVal = numMatch[1].replace(/,/g, ''); }
        if (/^(m[²³]?|m2|m3|kg|tons?|nr|no|nos?|ls|set|lot|pcs?|each|lm|rm|sqm|cum)$/i.test(tabParts[k])) unitVal = tabParts[k];
      }
      if (hasDesc && hasQty) patternRows.push([tabParts[0], qtyVal, unitVal, '', '']);
    }
  }

  if (patternRows.length >= 1) {
    patternRows.unshift(['Description', 'Quantity', 'Unit', 'Category', 'Notes']);
    return patternRows;
  }
  return [];
}

function showTenderBOQError(msg) {
  var el = $('tenderBOQParseMsg');
  if (el) el.innerHTML = '<div style="padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;color:var(--red);font-size:12px">' + msg + '</div>';
}
