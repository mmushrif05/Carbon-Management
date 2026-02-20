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
          <td><span class="badge ${s.status === 'submitted' ? 'review' : s.status === 'under_review' ? 'review' : s.status === 'approved' ? 'approved' : s.status === 'rejected' ? 'rejected' : 'pending'}" style="${s.status === 'rejected' ? 'background:rgba(239,68,68,0.1);color:var(--red);border:1px solid rgba(239,68,68,0.2)' : ''}">${s.status || 'draft'}</span></td>
          <td style="font-size:11px;color:var(--slate5)">${esc(s.createdBy || '')}${s.submittedAt ? '<br><span style="font-size:9px;color:var(--slate5)">Submitted: ' + new Date(s.submittedAt).toLocaleDateString() + '</span>' : ''}</td>
          <td style="white-space:nowrap">
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
        <option value="under_review" ${s.status === 'under_review' ? 'selected' : ''}>Under Review</option>
        <option value="approved" ${s.status === 'approved' ? 'selected' : ''}>Approved</option>
        <option value="rejected" ${s.status === 'rejected' ? 'selected' : ''}>Rejected</option>
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
    <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
      <span>BOQ Line Items (${_tenderItems.length})</span>
      ${_tenderItems.length ? '<div><button class="btn btn-secondary btn-sm" onclick="exportTenderExcel()" style="margin-right:6px">\ud83d\udcc4 Excel</button><button class="btn btn-secondary btn-sm" onclick="exportTenderPDF()">\ud83d\udcc4 PDF</button></div>' : ''}
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th style="min-width:50px">BOQ #</th><th>BOQ Description</th><th>Category</th><th>Type</th><th class="r">Qty</th><th>Unit</th><th class="r">EF</th><th class="r">tCO\u2082</th><th>Source</th><th>80%</th><th>Remarks</th><th></th></tr></thead>
      <tbody id="tenderItemsTbl">${_tenderItems.length ? _tenderItems.map((it, idx) => {
        const in80 = it._in80Pct;
        const srcBadge = it.gwpSource === 'A1-A3'
          ? '<span style="display:inline-block;background:rgba(52,211,153,0.1);color:var(--green);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">A1-A3</span>'
          : it.gwpSource === 'ICE'
          ? '<span style="display:inline-block;background:rgba(96,165,250,0.1);color:var(--blue);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">ICE</span>'
          : '<span style="display:inline-block;background:rgba(251,191,36,0.1);color:var(--yellow);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">Manual</span>';
        // Build category dropdown — A1-A3 categories first, then ICE
        const catDropdownId = 'tiCatDd_' + idx;
        let catDropdown = '<select id="' + catDropdownId + '" onchange="changeTenderItemCategory(' + idx + ',this.value)" style="font-size:10px;padding:2px 4px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:4px;max-width:130px">';
        catDropdown += '<optgroup label="\u2500\u2500 A1-A3 (Consultant) \u2500\u2500">';
        Object.keys(MATERIALS).forEach(function(cat) {
          catDropdown += '<option value="A1-A3:' + cat + '"' + (it.gwpSource === 'A1-A3' && it.category === cat ? ' selected' : '') + '>' + cat + '</option>';
        });
        catDropdown += '</optgroup><optgroup label="\u2500\u2500 ICE Database \u2500\u2500">';
        Object.keys(ICE_MATERIALS).forEach(function(cat) {
          catDropdown += '<option value="ICE:' + cat + '"' + (it.gwpSource === 'ICE' && it.category === cat ? ' selected' : '') + '>' + cat + '</option>';
        });
        catDropdown += '</optgroup>';
        if (it.gwpSource === 'Manual' || it.isCustom) {
          catDropdown += '<optgroup label="\u2500\u2500 Other \u2500\u2500"><option value="Manual:Unmatched" selected>Unmatched (Manual)</option></optgroup>';
        }
        catDropdown += '</select>';
        // Build type dropdown from current alternatives
        let typeDropdown = '';
        if (it.alternatives && it.alternatives.length > 0) {
          typeDropdown = '<select onchange="changeTenderItemType(' + idx + ',this.value)" style="font-size:10px;padding:2px 4px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:4px;max-width:160px">';
          typeDropdown += it.alternatives.map(function(alt) {
            return '<option value="' + alt.idx + '"' + (alt.name === it.type ? ' selected' : '') + '>' + alt.name + ' (' + alt.baseline + ')</option>';
          }).join('');
          typeDropdown += '</select>';
        } else {
          typeDropdown = '<span style="font-size:10px;color:var(--yellow)">' + esc(it.type) + '</span>';
        }
        // Build remarks with assumption and ICE reference
        let remarks = it.assumption || '';
        if (it.iceRefUrl && it.gwpSource === 'ICE') {
          remarks += (remarks ? ' ' : '') + '<a href="' + it.iceRefUrl + '" target="_blank" rel="noopener" style="color:var(--blue);font-size:9px;text-decoration:underline">\ud83d\udd17 ICE DB Ref</a>';
        }
        if (it.notes) {
          remarks += (remarks ? '<br>' : '') + '<span style="color:var(--slate5)">' + esc(it.notes) + '</span>';
        }
        return `<tr${in80 ? ' style="background:rgba(52,211,153,0.04)"' : ''}>
          <td style="font-weight:600;color:var(--slate4);font-size:11px;white-space:nowrap">${esc(it.boqItemNo || '')}</td>
          <td style="font-size:11px;color:var(--text)">${esc(it.originalDesc || it.type)}</td>
          <td style="font-size:10px">${catDropdown}</td>
          <td style="font-size:10px">${typeDropdown}</td>
          <td class="r mono">${fmtI(it.qty)}</td>
          <td>${it.unit}</td>
          <td class="r mono">${fmt(it.baselineEF)}</td>
          <td class="r mono">${fmt(it.baselineEmission)}</td>
          <td>${srcBadge}</td>
          <td>${in80 ? '<span style="color:var(--green);font-weight:700;font-size:11px">\u2713</span>' : ''}</td>
          <td style="font-size:9px;max-width:220px;line-height:1.4">${remarks}</td>
          <td><button class="btn btn-danger btn-sm" onclick="removeTenderItem(${idx})">✕</button></td>
        </tr>`;
      }).join('') : '<tr><td colspan="12" class="empty">No line items yet. Use the form above to add materials.</td></tr>'}
      ${_tenderItems.length > 1 ? `<tr class="total-row">
        <td colspan="7">Total</td>
        <td class="r mono">${fmt(totals.baseline)}</td>
        <td colspan="4"></td>
      </tr>` : ''}
      </tbody>
    </table></div>
  </div>

  <!-- Material Breakdown Chart -->
  ${_tenderItems.length ? renderTenderBreakdownChart() : ''}

  <!-- Submission Tracking -->
  ${s.submittedAt ? `<div class="card" style="padding:14px 18px">
    <div class="card-title">Submission Tracking</div>
    <div class="flow-steps" style="margin-bottom:12px">
      <div class="flow-step"><div class="flow-dot done">\ud83d\udcc4</div><div class="flow-label">Draft</div></div>
      <div class="flow-line ${s.status !== 'draft' ? 'done' : ''}"></div>
      <div class="flow-step"><div class="flow-dot ${s.status === 'submitted' ? 'current' : s.status === 'under_review' || s.status === 'approved' || s.status === 'rejected' ? 'done' : ''}">\ud83d\ude80</div><div class="flow-label">Submitted</div></div>
      <div class="flow-line ${s.status === 'under_review' || s.status === 'approved' || s.status === 'rejected' ? 'done' : ''}"></div>
      <div class="flow-step"><div class="flow-dot ${s.status === 'under_review' ? 'current' : s.status === 'approved' || s.status === 'rejected' ? 'done' : ''}">\ud83d\udccb</div><div class="flow-label">Review</div></div>
      <div class="flow-line ${s.status === 'approved' || s.status === 'rejected' ? 'done' : ''}"></div>
      <div class="flow-step"><div class="flow-dot ${s.status === 'approved' ? 'current' : s.status === 'rejected' ? '' : ''}" style="${s.status === 'rejected' ? 'border-color:var(--red)' : ''}">${s.status === 'rejected' ? '\u274c' : '\u2705'}</div><div class="flow-label">${s.status === 'rejected' ? 'Rejected' : 'Approved'}</div></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Action</th><th>By</th><th>Date</th></tr></thead>
      <tbody>
        ${s.submittedAt ? '<tr><td><span class="badge review">Submitted</span></td><td>' + esc(s.submittedBy || s.createdBy || '') + '</td><td style="font-size:11px;color:var(--slate5)">' + new Date(s.submittedAt).toLocaleString() + '</td></tr>' : ''}
        ${s.reviewedAt ? '<tr><td><span class="badge pending">Reviewed</span></td><td>' + esc(s.reviewedBy || '') + '</td><td style="font-size:11px;color:var(--slate5)">' + new Date(s.reviewedAt).toLocaleString() + '</td></tr>' : ''}
        ${s.approvedAt ? '<tr><td><span class="badge approved">Approved</span></td><td>' + esc(s.approvedBy || '') + '</td><td style="font-size:11px;color:var(--slate5)">' + new Date(s.approvedAt).toLocaleString() + '</td></tr>' : ''}
        ${s.rejectedAt ? '<tr><td><span class="badge rejected" style="background:rgba(239,68,68,0.1);color:var(--red);border:1px solid rgba(239,68,68,0.2)">Rejected</span></td><td>' + esc(s.rejectedBy || '') + '</td><td style="font-size:11px;color:var(--slate5)">' + new Date(s.rejectedAt).toLocaleString() + '</td></tr>' : ''}
      </tbody>
    </table></div>
    ${s.rejectionReason ? '<div style="margin-top:8px;padding:8px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:8px;font-size:12px;color:var(--red)"><strong>Rejection Reason:</strong> ' + esc(s.rejectionReason) + '</div>' : ''}
  </div>` : ''}

  <!-- Action Buttons -->
  <div class="card">
    <div class="btn-row" style="flex-wrap:wrap;gap:8px">
      <button class="btn btn-primary" onclick="saveTenderScenario()">\ud83d\udcbe Save Scenario</button>
      ${s.status === 'draft' && _tenderItems.length > 0 ? '<button class="btn btn-approve" onclick="submitTenderToConsultant()" style="background:rgba(52,211,153,0.1);color:var(--green);border:1px solid rgba(52,211,153,0.3)">\ud83d\ude80 Submit to Consultant</button>' : ''}
      ${(state.role === 'consultant' || state.role === 'client') && s.status === 'submitted' ? '<button class="btn btn-approve" onclick="reviewTenderAction(\'approved\')" style="background:rgba(52,211,153,0.1);color:var(--green);border:1px solid rgba(52,211,153,0.3)">\u2705 Approve</button><button class="btn btn-danger" onclick="reviewTenderAction(\'rejected\')">\u274c Reject</button>' : ''}
      ${(state.role === 'consultant' || state.role === 'client') && s.status === 'under_review' ? '<button class="btn btn-approve" onclick="reviewTenderAction(\'approved\')" style="background:rgba(52,211,153,0.1);color:var(--green);border:1px solid rgba(52,211,153,0.3)">\u2705 Approve</button><button class="btn btn-danger" onclick="reviewTenderAction(\'rejected\')">\u274c Reject</button>' : ''}
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

  // Build alternatives for manual entries
  var manualAlternatives = [];
  if (!isCustom) {
    var a13MatSource = MATERIALS[cat];
    var iceMatSource = ICE_MATERIALS[cat];
    var matSource = a13MatSource || iceMatSource;
    if (matSource) {
      matSource.types.forEach(function(t, idx) {
        manualAlternatives.push({ name: t.name, baseline: t.baseline, target: t.target, idx: idx });
      });
    }
  }

  _tenderItems.push({
    id: Date.now(),
    boqItemNo: String(_tenderItems.length + 1),
    originalDesc: isCustom ? category : type,
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
    assumption: isCustom ? 'Manually entered custom material' : ('Manually selected ' + (_tenderCurrentGWPSource || 'Manual') + ': "' + category + '" \u2192 "' + type + '"'),
    alternatives: manualAlternatives,
    iceRefUrl: (!isCustom && !MATERIALS[cat] && ICE_MATERIALS[cat]) ? 'https://circularecology.com/embodied-carbon-footprint-database.html' : '',
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
          <td><span class="badge ${s.status === 'submitted' || s.status === 'under_review' ? 'review' : s.status === 'approved' ? 'approved' : s.status === 'rejected' ? 'rejected' : 'pending'}" style="${s.status === 'rejected' ? 'background:rgba(239,68,68,0.1);color:var(--red);border:1px solid rgba(239,68,68,0.2)' : ''}">${s.status || 'draft'}</span></td>
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
      <thead><tr><th>BOQ #</th><th>BOQ Description</th><th>Category</th><th>Type</th><th class="r">Qty</th><th>Unit</th><th class="r">EF</th><th class="r">tCO\u2082</th><th>Source</th><th>Remarks</th></tr></thead>
      <tbody>${items.map(it => {
        const srcBadge = it.gwpSource === 'A1-A3'
          ? '<span style="display:inline-block;background:rgba(52,211,153,0.1);color:var(--green);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">A1-A3</span>'
          : it.gwpSource === 'ICE'
          ? '<span style="display:inline-block;background:rgba(96,165,250,0.1);color:var(--blue);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">ICE</span>'
          : '<span style="display:inline-block;background:rgba(251,191,36,0.1);color:var(--yellow);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">Manual</span>';
        let remarkText = it.assumption || '';
        if (it.gwpSource === 'ICE' && it.iceRefUrl) {
          remarkText += (remarkText ? ' ' : '') + '<a href="' + it.iceRefUrl + '" target="_blank" rel="noopener" style="color:var(--blue);font-size:9px;text-decoration:underline">\ud83d\udd17 ICE Ref</a>';
        }
        return `<tr>
          <td style="font-size:11px;color:var(--slate4)">${esc(it.boqItemNo || '')}</td>
          <td style="font-size:11px;color:var(--text)">${esc(it.originalDesc || it.type)}</td>
          <td style="font-size:10px;color:var(--slate4)">${esc(it.category)}${it.isCustom ? ' <span style="color:var(--orange);font-size:9px">CUSTOM</span>' : ''}</td>
          <td style="font-size:10px">${esc(it.type)}</td>
          <td class="r mono">${fmtI(it.qty)}</td>
          <td>${it.unit}</td>
          <td class="r mono">${fmt(it.baselineEF)}</td>
          <td class="r mono">${fmt(it.baselineEmission)}</td>
          <td>${srcBadge}</td>
          <td style="font-size:9px;line-height:1.3">${remarkText}</td>
        </tr>`;
      }).join('')}
      ${items.length > 1 ? `<tr class="total-row">
        <td colspan="7">Total</td>
        <td class="r mono">${fmt(s.totalBaseline || 0)}</td>
        <td colspan="2"></td>
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
    (r.aiParsed ? '<div style="font-size:11px;color:var(--green);margin-bottom:4px;font-weight:600">\ud83e\udde0 Parsed by AI (Claude) \u2014 intelligent document understanding</div>' : '') +
    '<div style="font-size:12px;color:var(--slate4)">' + r.totalItems + ' line items added. See the <strong>BOQ Line Items</strong> table and <strong>80% Material Identification</strong> bar below.' + (r.aiParsed ? ' Use the <strong>Category</strong> and <strong>Type</strong> dropdowns to correct any mismatches.' : '') + '</div>' +
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
  var itemNoCol = findColumn(headers, ['item no', 'item number', 'sl no', 'sl.no', 'boq ref', 'bill no', 'bill item', 'clause', 'ref no', 'item ref', 'sn']);

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

    var boqItemNo = itemNoCol >= 0 ? String(row[itemNoCol] || '').trim() : String(r + 1);

    _tenderItems.push({
      id: Date.now() + r,
      boqItemNo: boqItemNo,
      originalDesc: desc,
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
      assumption: match.assumption || (!match.matched ? 'No match found in A1-A3 or ICE database. Manual EF entry required.' : ''),
      alternatives: match.alternatives || [],
      iceRefUrl: match.iceRefUrl || '',
      notes: notes || ''
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

// ===== PDF TENDER DOCUMENT PARSING (AI-POWERED) =====
async function handleTenderPDFFile(file) {
  if (typeof pdfjsLib === 'undefined') {
    _tenderBOQProcessing = false;
    showBOQStatus('<strong>Error:</strong> PDF.js library not loaded. Please refresh the page.', 'red');
    return;
  }

  try {
    showBOQStatus('<strong>Step 1/3:</strong> Reading PDF... Extracting text from pages...', 'info');

    var arrayBuffer = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var totalPages = pdf.numPages;

    var allText = '';
    var allLines = [];
    for (var p = 1; p <= totalPages; p++) {
      showBOQStatus('<strong>Step 1/3:</strong> Reading PDF page ' + p + ' of ' + totalPages + '...', 'info');
      var page = await pdf.getPage(p);
      var textContent = await page.getTextContent();
      var pageLines = extractLinesFromTextContent(textContent);
      allLines = allLines.concat(pageLines);
      allText += pageLines.join('\n') + '\n';
    }

    if (allText.trim().length < 20) {
      _tenderBOQProcessing = false;
      showBOQStatus('<strong>Error:</strong> Could not extract text from this PDF. It may be scanned/image-based. Try uploading an Excel/CSV version.', 'red');
      return;
    }

    // Try AI parsing first — falls back to regex if AI is unavailable
    showBOQStatus('<strong>Step 2/3:</strong> AI is analyzing the BOQ document (' + allLines.length + ' lines from ' + totalPages + ' pages)...', 'info');

    var aiSuccess = false;
    try {
      var res = await apiCall('/parse-boq', {
        method: 'POST',
        body: JSON.stringify({ text: allText, fileName: file.name })
      });
      var data = await res.json();

      if (res.ok && data.success && data.items && data.items.length > 0) {
        showBOQStatus('<strong>Step 3/3:</strong> AI identified ' + data.items.length + ' BOQ items. Building carbon analysis...', 'info');
        aiAddBOQItems(data.items, file.name);
        aiSuccess = true;
      } else if (data.fallback) {
        // AI unavailable or returned error — fall back to regex
        showBOQStatus('<strong>Step 2/3:</strong> AI unavailable (' + (data.error || 'unknown') + '). Using pattern matching...', 'info');
      } else if (data.error) {
        showBOQStatus('<strong>Step 2/3:</strong> AI: ' + data.error + '. Using pattern matching fallback...', 'info');
      }
    } catch (aiErr) {
      showBOQStatus('<strong>Step 2/3:</strong> AI service unreachable. Using pattern matching fallback...', 'info');
    }

    // Fallback to regex-based parsing if AI didn't work
    if (!aiSuccess) {
      showBOQStatus('<strong>Step 2/3:</strong> Parsing with pattern matching...', 'info');
      var parsedRows = parsePDFTextToBOQ(allLines, allText);

      if (parsedRows.length < 2) {
        _tenderBOQProcessing = false;
        showBOQStatus('<strong>Error:</strong> Could not extract BOQ items from this PDF. Try uploading an Excel/CSV version, or configure AI parsing (ANTHROPIC_API_KEY) for better results.', 'red');
        return;
      }

      autoMatchAndAddBOQ(parsedRows, file.name);
    }

  } catch (err) {
    _tenderBOQProcessing = false;
    showBOQStatus('<strong>Error:</strong> Failed to parse PDF: ' + err.message, 'red');
  }
}

// ===== AI-PARSED BOQ ITEMS → TENDER TABLE =====
function aiAddBOQItems(aiItems, fileName) {
  var a13Count = 0, iceCount = 0, unmatchedCount = 0;

  aiItems.forEach(function(item) {
    if (item.qty <= 0 && item.gwpSource !== 'none') return; // Skip zero-qty unless unmatched

    var bl = item.baselineEF || 0;
    var blEm = (item.qty * bl) / 1000;
    var gwpSource = item.gwpSource || 'none';

    // Build alternatives from the matched category
    var alternatives = [];
    var iceRefUrl = '';
    if (gwpSource === 'A1-A3' && MATERIALS[item.category]) {
      MATERIALS[item.category].types.forEach(function(t, idx) {
        alternatives.push({ name: t.name, baseline: t.baseline, target: t.target, idx: idx });
      });
    } else if (gwpSource === 'ICE' && ICE_MATERIALS[item.category]) {
      var iceMat = ICE_MATERIALS[item.category];
      iceMat.types.forEach(function(t, idx) {
        var altBelow = iceMat.isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD;
        alternatives.push({ name: t.name, baseline: altBelow ? 0 : t.baseline, target: altBelow ? 0 : t.target, idx: idx });
      });
      iceRefUrl = 'https://circularecology.com/embodied-carbon-footprint-database.html';
    } else if (gwpSource === 'none') {
      // Try to find category in both databases for alternatives
      if (MATERIALS[item.category]) {
        MATERIALS[item.category].types.forEach(function(t, idx) {
          alternatives.push({ name: t.name, baseline: t.baseline, target: t.target, idx: idx });
        });
      } else if (ICE_MATERIALS[item.category]) {
        var iceM = ICE_MATERIALS[item.category];
        iceM.types.forEach(function(t, idx) {
          alternatives.push({ name: t.name, baseline: t.baseline, target: t.target, idx: idx });
        });
      }
    }

    // Get unit and EF unit from the database if available
    var matDB = MATERIALS[item.category] || ICE_MATERIALS[item.category];
    var unit = item.materialUnit || (matDB ? matDB.unit : item.unit);
    var efUnit = item.efUnit || (matDB ? matDB.efUnit : '');
    var massFactor = matDB ? matDB.massFactor : 1;

    if (gwpSource === 'A1-A3') a13Count++;
    else if (gwpSource === 'ICE') iceCount++;
    else unmatchedCount++;

    _tenderItems.push({
      id: Date.now() + Math.random(),
      boqItemNo: item.itemNo || '',
      originalDesc: item.description || '',
      category: item.category || 'Unmatched',
      type: item.type || item.description || '',
      qty: item.qty,
      unit: unit,
      efUnit: efUnit,
      massFactor: massFactor,
      baselineEF: bl,
      targetEF: bl,
      baselineEmission: blEm,
      targetEmission: blEm,
      isCustom: gwpSource === 'none',
      gwpSource: gwpSource === 'none' ? 'Manual' : gwpSource,
      assumption: item.assumption || '',
      alternatives: alternatives,
      iceRefUrl: iceRefUrl,
      notes: ''
    });
  });

  // Recalculate 80% material identification
  recalcTender80Pct();

  // Auto-fill description
  var descInput = $('tsDesc');
  if (descInput && !descInput.value.trim()) {
    descInput.value = 'AI-parsed from BOQ: ' + fileName;
  }

  // Store result summary
  var totalItems = _tenderItems.length;
  var totalBL = 0;
  _tenderItems.forEach(function(it) { totalBL += it.baselineEmission || 0; });

  _tenderBOQMode = true;
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
    totalBL: totalBL,
    aiParsed: true
  };

  navigate('tender_entry');

  setTimeout(function() {
    var boqCard = $('tenderBOQCard');
    if (boqCard) boqCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
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

// ===== CHANGE CATEGORY — switch to a completely different material category =====
function changeTenderItemCategory(idx, val) {
  var item = _tenderItems[idx];
  if (!item) return;

  // Parse "A1-A3:Concrete" or "ICE:Steel" or "Manual:Unmatched"
  var parts = val.split(':');
  var source = parts[0];
  var catName = parts.slice(1).join(':');

  if (source === 'Manual') {
    item.category = 'Unmatched';
    item.type = item.originalDesc || 'Custom';
    item.gwpSource = 'Manual';
    item.baselineEF = 0;
    item.targetEF = 0;
    item.baselineEmission = 0;
    item.targetEmission = 0;
    item.isCustom = true;
    item.alternatives = [];
    item.iceRefUrl = '';
    item.assumption = 'User set as Unmatched \u2014 manual EF entry required';
    recalcTender80Pct();
    navigate('tender_entry');
    return;
  }

  // Look up the new category from the correct database
  var matDB = source === 'A1-A3' ? MATERIALS : ICE_MATERIALS;
  var mat = matDB[catName];
  if (!mat) return;

  // Build new alternatives list
  var alternatives = [];
  mat.types.forEach(function(t, i) {
    var bl = t.baseline;
    if (source === 'ICE' && mat.isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD) bl = 0;
    alternatives.push({ name: t.name, baseline: bl, target: bl, idx: i });
  });

  // Default to first type in the new category
  var firstType = mat.types[0];
  var firstBL = alternatives[0].baseline;

  item.category = catName;
  item.type = firstType.name;
  item.gwpSource = source;
  item.unit = mat.unit;
  item.efUnit = mat.efUnit;
  item.massFactor = mat.massFactor;
  item.baselineEF = firstBL;
  item.targetEF = firstBL;
  item.baselineEmission = (item.qty * firstBL) / 1000;
  item.targetEmission = item.baselineEmission;
  item.isCustom = false;
  item.alternatives = alternatives;
  item.iceRefUrl = source === 'ICE' ? 'https://circularecology.com/embodied-carbon-footprint-database.html' : '';
  item.assumption = 'User corrected to ' + source + ': "' + catName + '" \u2192 "' + firstType.name + '"';

  recalcTender80Pct();
  navigate('tender_entry');
}

// ===== CHANGE TYPE within the current category =====
function changeTenderItemType(idx, newTypeIdx) {
  var item = _tenderItems[idx];
  if (!item || !item.alternatives || !item.alternatives.length) return;
  var alt = item.alternatives[parseInt(newTypeIdx)];
  if (!alt) return;

  item.type = alt.name;
  item.baselineEF = alt.baseline;
  item.targetEF = alt.baseline;
  item.baselineEmission = (item.qty * alt.baseline) / 1000;
  item.targetEmission = item.baselineEmission;
  item.assumption = 'User selected ' + item.gwpSource + ': "' + item.category + '" \u2192 "' + alt.name + '"';

  recalcTender80Pct();
  navigate('tender_entry');
}

// ===== EXPORT TENDER AS PDF =====
function exportTenderPDF() {
  if (!_tenderEdit || !_tenderItems.length) return;
  var s = _tenderEdit;
  var totals = calcTenderTotals();

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tender BOQ - ' + esc(s.name) + '</title>';
  html += '<style>';
  html += 'body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#222;margin:20px;line-height:1.4}';
  html += 'h1{font-size:18px;margin:0 0 4px;color:#1a1a2e}h2{font-size:14px;margin:16px 0 8px;color:#333;border-bottom:1px solid #ddd;padding-bottom:4px}';
  html += 'table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:4px 6px;border:1px solid #ccc;text-align:left;font-size:10px}';
  html += 'th{background:#f0f0f0;font-weight:700;font-size:9px;text-transform:uppercase;color:#555}';
  html += '.r{text-align:right}.mono{font-family:monospace}';
  html += '.kpi{display:inline-block;background:#f8f8f8;border:1px solid #ddd;border-radius:6px;padding:8px 14px;margin:4px 8px 4px 0;text-align:center}';
  html += '.kpi-label{font-size:9px;color:#777;text-transform:uppercase}.kpi-value{font-size:16px;font-weight:700;color:#333}';
  html += '.badge-a13{background:#e6f7ef;color:#059669;padding:1px 5px;border-radius:3px;font-size:8px;font-weight:600}';
  html += '.badge-ice{background:#e8f0fe;color:#2563eb;padding:1px 5px;border-radius:3px;font-size:8px;font-weight:600}';
  html += '.badge-manual{background:#fef3c7;color:#d97706;padding:1px 5px;border-radius:3px;font-size:8px;font-weight:600}';
  html += '.total-row td{font-weight:700;background:#f5f5f5;border-top:2px solid #999}';
  html += '.remark{font-size:8px;color:#666;line-height:1.3}';
  html += '@media print{body{margin:10px}@page{size:landscape;margin:10mm}}';
  html += '</style></head><body>';

  html += '<h1>Tender BOQ Analysis \u2014 ' + esc(s.name) + '</h1>';
  html += '<div style="font-size:10px;color:#666;margin-bottom:12px">';
  html += 'Generated: ' + new Date().toLocaleString() + ' | Status: ' + (s.status || 'draft').toUpperCase();
  if (s.description) html += ' | ' + esc(s.description);
  html += '</div>';

  // KPIs
  html += '<div style="margin-bottom:12px">';
  html += '<div class="kpi"><div class="kpi-label">Total Baseline</div><div class="kpi-value">' + fmt(totals.baseline) + ' tCO\u2082eq</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Line Items</div><div class="kpi-value">' + _tenderItems.length + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">A1-A3 Items</div><div class="kpi-value">' + totals.a13Count + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">ICE Items</div><div class="kpi-value">' + totals.iceCount + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">80% Identification</div><div class="kpi-value">' + totals.in80Count + ' of ' + _tenderItems.length + ' items</div></div>';
  html += '</div>';

  // BOQ Items Table
  html += '<h2>Bill of Quantities \u2014 Embodied Carbon Analysis</h2>';
  html += '<table><thead><tr><th>BOQ #</th><th>BOQ Description</th><th>Matched As</th><th class="r">Qty</th><th>Unit</th><th class="r">Baseline EF</th><th class="r">tCO\u2082eq</th><th>GWP Source</th><th>80%</th><th>Remarks</th></tr></thead><tbody>';

  _tenderItems.forEach(function(it) {
    var srcClass = it.gwpSource === 'A1-A3' ? 'badge-a13' : it.gwpSource === 'ICE' ? 'badge-ice' : 'badge-manual';
    var remarkText = it.assumption || '';
    if (it.gwpSource === 'ICE' && it.iceRefUrl) {
      remarkText += (remarkText ? ' | ' : '') + 'Ref: ICE Database v3.0 (circularecology.com)';
    }
    if (it.notes) remarkText += (remarkText ? ' | ' : '') + it.notes;

    html += '<tr>';
    html += '<td>' + esc(it.boqItemNo || '') + '</td>';
    html += '<td>' + esc(it.originalDesc || it.type) + '</td>';
    html += '<td>' + esc(it.type) + '</td>';
    html += '<td class="r mono">' + fmtI(it.qty) + '</td>';
    html += '<td>' + (it.unit || '') + '</td>';
    html += '<td class="r mono">' + fmt(it.baselineEF) + '</td>';
    html += '<td class="r mono">' + fmt(it.baselineEmission) + '</td>';
    html += '<td><span class="' + srcClass + '">' + (it.gwpSource || 'Manual') + '</span></td>';
    html += '<td>' + (it._in80Pct ? '\u2713' : '') + '</td>';
    html += '<td class="remark">' + esc(remarkText) + '</td>';
    html += '</tr>';
  });

  if (_tenderItems.length > 1) {
    html += '<tr class="total-row"><td colspan="6">Total</td><td class="r mono">' + fmt(totals.baseline) + '</td><td colspan="3"></td></tr>';
  }

  html += '</tbody></table>';

  // GWP Source Legend
  html += '<h2>GWP Source Reference</h2>';
  html += '<table><thead><tr><th>Source</th><th>Description</th><th>Reference</th></tr></thead><tbody>';
  html += '<tr><td><span class="badge-a13">A1-A3</span></td><td>Consultant-defined baseline emission factors</td><td>Project-specific A1-A3 material baseline factors</td></tr>';
  html += '<tr><td><span class="badge-ice">ICE</span></td><td>ICE Database v3.0 (Inventory of Carbon & Energy)</td><td><a href="https://circularecology.com/embodied-carbon-footprint-database.html">circularecology.com/embodied-carbon-footprint-database</a></td></tr>';
  html += '<tr><td><span class="badge-manual">Manual</span></td><td>User-entered emission factor</td><td>As specified in remarks</td></tr>';
  html += '</tbody></table>';

  html += '<div style="margin-top:16px;padding-top:8px;border-top:1px solid #ddd;font-size:9px;color:#999">';
  html += 'CarbonTrack Pro \u2014 Embodied Carbon Management | Generated ' + new Date().toISOString();
  html += '</div></body></html>';

  var w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(function() { w.print(); }, 500);
  }
}

// ===== EXPORT TENDER AS EXCEL =====
function exportTenderExcel() {
  if (!_tenderEdit || !_tenderItems.length) return;
  if (typeof XLSX === 'undefined') { alert('SheetJS library not loaded. Please refresh the page.'); return; }

  var s = _tenderEdit;
  var totals = calcTenderTotals();

  // Build data array for the worksheet
  var data = [];

  // Header info rows
  data.push(['Tender BOQ Analysis - ' + (s.name || 'Untitled')]);
  data.push(['Generated: ' + new Date().toLocaleString(), '', 'Status: ' + (s.status || 'draft').toUpperCase()]);
  data.push(['Total Baseline: ' + fmt(totals.baseline) + ' tCO\u2082eq', '', 'A1-A3 Items: ' + totals.a13Count, '', 'ICE Items: ' + totals.iceCount]);
  data.push([]);

  // Column headers
  data.push(['BOQ #', 'BOQ Description', 'Category', 'Matched Type', 'Qty', 'Unit', 'EF Unit', 'Baseline EF', 'Baseline tCO\u2082eq', 'GWP Source', 'In 80%', 'Assumption / Remarks', 'Reference']);

  // Data rows
  _tenderItems.forEach(function(it) {
    var remarkText = it.assumption || '';
    if (it.notes) remarkText += (remarkText ? ' | ' : '') + it.notes;
    var refLink = '';
    if (it.gwpSource === 'ICE' && it.iceRefUrl) {
      refLink = it.iceRefUrl;
    }

    data.push([
      it.boqItemNo || '',
      it.originalDesc || it.type,
      it.category,
      it.type,
      it.qty,
      it.unit || '',
      it.efUnit || '',
      it.baselineEF,
      it.baselineEmission,
      it.gwpSource || 'Manual',
      it._in80Pct ? 'Yes' : 'No',
      remarkText,
      refLink
    ]);
  });

  // Totals row
  data.push([]);
  data.push(['', '', '', 'TOTAL', '', '', '', '', totals.baseline, '', '', '', '']);

  // Create workbook and worksheet
  var ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 8 },   // BOQ #
    { wch: 35 },  // Description
    { wch: 14 },  // Category
    { wch: 25 },  // Matched Type
    { wch: 12 },  // Qty
    { wch: 8 },   // Unit
    { wch: 14 },  // EF Unit
    { wch: 12 },  // Baseline EF
    { wch: 14 },  // tCO2
    { wch: 10 },  // Source
    { wch: 8 },   // 80%
    { wch: 45 },  // Remarks
    { wch: 50 }   // Reference
  ];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOQ Analysis');

  // Download
  var fileName = (s.name || 'Tender_BOQ').replace(/[^a-zA-Z0-9_\-]/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  XLSX.writeFile(wb, fileName);
}

// ===== SUBMIT TENDER TO CONSULTANT =====
async function submitTenderToConsultant() {
  if (!_tenderEdit || !_tenderItems.length) return;
  if (!confirm('Submit this tender scenario to the consultant for review?\n\nThe scenario will be saved and marked as "Submitted".')) return;

  // Save first
  var name = $('tsName') ? $('tsName').value.trim() : _tenderEdit.name;
  if (!name) { alert('Enter a scenario name before submitting'); return; }

  var totals = calcTenderTotals();
  _tenderEdit.name = name;
  _tenderEdit.description = $('tsDesc') ? $('tsDesc').value.trim() : _tenderEdit.description;
  _tenderEdit.status = 'submitted';
  _tenderEdit.items = _tenderItems;
  _tenderEdit.totalBaseline = totals.baseline;
  _tenderEdit.totalTarget = totals.target;
  _tenderEdit.reductionPct = totals.rPct;
  _tenderEdit.submittedBy = state.name;
  _tenderEdit.submittedByUid = state.uid;
  _tenderEdit.submittedAt = new Date().toISOString();
  _tenderEdit.updatedAt = new Date().toISOString();

  try {
    await DB.saveTenderScenario(_tenderEdit);

    var idx = state.tenderScenarios.findIndex(function(sc) { return sc.id === _tenderEdit.id; });
    if (idx !== -1) state.tenderScenarios[idx] = JSON.parse(JSON.stringify(_tenderEdit));
    else state.tenderScenarios.push(JSON.parse(JSON.stringify(_tenderEdit)));

    var msg = $('tsSaveMsg');
    if (msg) msg.innerHTML = '<div style="padding:12px;background:rgba(52,211,153,0.1);border-radius:10px;color:var(--green);text-align:center;font-weight:600">\ud83d\ude80 Tender scenario submitted to consultant for review!</div>';

    navigate('tender_entry');
  } catch (err) {
    var msg2 = $('tsSaveMsg');
    if (msg2) msg2.innerHTML = '<div style="padding:12px;background:rgba(239,68,68,0.1);border-radius:10px;color:var(--red);text-align:center;font-weight:600">\u274c Submission failed: ' + err.message + '</div>';
  }
}

// ===== REVIEW TENDER ACTION (Consultant/Client) =====
async function reviewTenderAction(action) {
  if (!_tenderEdit) return;

  if (action === 'rejected') {
    var reason = prompt('Enter rejection reason (optional):');
    _tenderEdit.rejectionReason = reason || '';
    _tenderEdit.rejectedBy = state.name;
    _tenderEdit.rejectedByUid = state.uid;
    _tenderEdit.rejectedAt = new Date().toISOString();
  }

  if (action === 'approved') {
    if (!confirm('Approve this tender scenario?')) return;
    _tenderEdit.approvedBy = state.name;
    _tenderEdit.approvedByUid = state.uid;
    _tenderEdit.approvedAt = new Date().toISOString();
  }

  _tenderEdit.status = action;
  _tenderEdit.reviewedBy = state.name;
  _tenderEdit.reviewedByUid = state.uid;
  _tenderEdit.reviewedAt = new Date().toISOString();
  _tenderEdit.updatedAt = new Date().toISOString();

  try {
    await DB.saveTenderScenario(_tenderEdit);

    var idx = state.tenderScenarios.findIndex(function(sc) { return sc.id === _tenderEdit.id; });
    if (idx !== -1) state.tenderScenarios[idx] = JSON.parse(JSON.stringify(_tenderEdit));
    else state.tenderScenarios.push(JSON.parse(JSON.stringify(_tenderEdit)));

    var msg = $('tsSaveMsg');
    if (msg) msg.innerHTML = '<div style="padding:12px;background:' + (action === 'approved' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)') + ';border-radius:10px;color:' + (action === 'approved' ? 'var(--green)' : 'var(--red)') + ';text-align:center;font-weight:600">' + (action === 'approved' ? '\u2705 Tender scenario approved!' : '\u274c Tender scenario rejected.') + '</div>';

    navigate('tender_entry');
  } catch (err) {
    var msg2 = $('tsSaveMsg');
    if (msg2) msg2.innerHTML = '<div style="padding:12px;background:rgba(239,68,68,0.1);border-radius:10px;color:var(--red);text-align:center;font-weight:600">\u274c Action failed: ' + err.message + '</div>';
  }
}

function showTenderBOQError(msg) {
  var el = $('tenderBOQParseMsg');
  if (el) el.innerHTML = '<div style="padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;color:var(--red);font-size:12px">' + msg + '</div>';
}
