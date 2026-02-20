// ===== TENDER EMISSIONS MODULE =====
// Projected emissions from tender/BOQ quantities with scenario comparison

// ---- State for active editing ----
let _tenderEdit = null;   // scenario being edited (null = list view)
let _tenderItems = [];    // line items for current scenario

// ===== UNIT CONVERSION HELPERS =====

// Extract thickness/depth dimension from BOQ description (returns meters, or null)
function extractThickness(description) {
  if (!description) return null;
  var d = description.toLowerCase();

  // First, check if this is a rebar/pipe item (skip diameter patterns)
  if (/\b(dia(?:meter)?|dn|rebar|reinforc|bar|mesh|fabric|pipe|hdpe|pvc|upvc|ductile)\b/i.test(d)) {
    // Still allow explicit thickness keywords even in pipe/rebar descriptions
    // e.g., "200mm dia pipe with 150mm thick concrete surround"
    var explicitThk = d.match(/(?:thick(?:ness)?|thk|depth|dp|layer)[:\s=]*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/i);
    if (explicitThk) {
      var vE = parseFloat(explicitThk[1]);
      var uE = explicitThk[2].toLowerCase();
      if (uE === 'mm') vE = vE / 1000;
      else if (uE === 'cm') vE = vE / 100;
      if (vE > 0.001 && vE < 5) return { value: vE, raw: explicitThk[0].trim(), source: 'desc' };
    }
    return null;
  }

  var patterns = [
    // "depth 450mm", "thickness 150mm", "thk 100mm", "dp 200mm"
    /(?:depth|thick(?:ness)?|thk|dp)[:\s=]*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/i,
    // "450mm thick", "150mm deep", "200mm depth"
    /(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*(?:thick(?:ness)?|thk|deep|depth)/i,
    // "t = 150mm"
    /t\s*=\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/i,
    // "150mm layer", "200mm blinding", "100mm slab" — number + mm + material keyword (NOT before "dia")
    /(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*(?:layer|blinding|slab|base|course|concrete|screed|topping|overlay|wearing|binder|asphalt|sub-?base|fill|compacted)/i,
    // "layer thickness 100mm"
    /layer\s+(?:thick(?:ness)?)\s+(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = d.match(patterns[i]);
    if (match) {
      var val = parseFloat(match[1]);
      var unit = match[2].toLowerCase();
      if (unit === 'mm') val = val / 1000;
      else if (unit === 'cm') val = val / 100;
      // Sanity check: thickness should be 0.001m to 5m
      if (val > 0.001 && val < 5) {
        return { value: val, raw: match[0].trim(), source: 'desc' };
      }
    }
  }
  return null;
}

// Try to extract a unit from a BOQ description string
// Used as fallback when the AI returns garbage in the unit field
function extractUnitFromDescription(desc) {
  if (!desc) return '';
  // Look for unit patterns in the description text
  var m = desc.match(/\b(m[²³]|m2|m3|sqm|sq\.?\s*m|cum|cu\.?\s*m|cbm|kg|tonnes?|tons?|mt|lm|lin\.?\s*m|rm|nr|nos?|each|ea|pcs?|ls|set|lot|tkm)\b/i);
  if (m) return m[1];
  // Also check for unit in parentheses like "(Provisional m²)"
  var p = desc.match(/\(\s*(?:provisional\s*)?(?:sum\s*)?(m[²³]|m2|m3|sqm|sq\.?\s*m|cum|cu\.?\s*m|cbm|kg|tonnes?|tons?|nr|nos?|each|m|lm|lin\.?\s*m)\s*\)/i);
  if (p) return p[1];
  return '';
}

// Check if a normalized unit is a recognized unit (not garbage)
function isRecognizedUnit(normalizedUnit) {
  if (!normalizedUnit) return false;
  var known = ['m2', 'm3', 'kg', 'tons', 'm', 'nr', 'ls', 'set', 'lot', 'tkm'];
  return known.indexOf(normalizedUnit) !== -1;
}

// Normalize a unit string for comparison
// Handles AI returning messy units like "Provisional m²", "(Provisional Sum) m²", "28,894", etc.
function normalizeUnitStr(u) {
  if (!u) return '';
  u = String(u).trim();

  // First, try to extract a known unit pattern from within the string
  // This handles "Provisional m²", "(Provisional Sum) m²", "m² (provisional)", etc.
  var unitMatch = u.match(/(m[²³]|m2|m3|sqm|sq\.?\s*m|cum|cu\.?\s*m|cbm|kg|tonnes?|tons?|mt|lm|lin\.?\s*m|rm|nr|nos?|each|ea|pcs?|ls|set|lot|tkm)\b/i);
  if (unitMatch) {
    u = unitMatch[1];
  } else {
    // Check for bare "m" (meters) but NOT inside longer words like "mm"
    var bareM = u.match(/\bm\b/i);
    if (bareM) u = 'm';
  }

  u = u.toLowerCase().trim()
    .replace(/²/g, '2').replace(/³/g, '3').replace(/\s+/g, '');
  // Common aliases
  if (u === 'sqm' || u === 'sq.m' || u === 'sqm.' || u === 'sqm') return 'm2';
  if (u === 'cum' || u === 'cu.m' || u === 'cbm' || u === 'cum') return 'm3';
  if (u === 'tonne' || u === 'tonnes' || u === 'ton' || u === 'mt' || u === 't') return 'tons';
  if (u === 'lm' || u === 'lin.m' || u === 'rm' || u === 'linm') return 'm';
  if (u === 'nr' || u === 'nos' || u === 'no' || u === 'each' || u === 'ea' || u === 'pcs') return 'nr';
  return u;
}

// Convert BOQ quantity to match the emission factor's expected unit
// Returns { convertedQty, conversionType, conversionNote }
function convertBOQQuantity(boqQty, boqUnit, materialUnit, thickness, massFactor) {
  var bU = normalizeUnitStr(boqUnit);
  var mU = normalizeUnitStr(materialUnit);

  // Same units → no conversion
  if (bU === mU || !bU || !mU) {
    return { convertedQty: boqQty, conversionType: 'none', conversionNote: '' };
  }

  // m² → m³: area to volume (needs thickness)
  if (bU === 'm2' && mU === 'm3') {
    if (!thickness || thickness <= 0) {
      return { convertedQty: boqQty, conversionType: 'area_to_volume_missing',
        conversionNote: '\u26a0 BOQ in m\u00b2 but EF per m\u00b3 \u2014 thickness not found in description' };
    }
    var vol = boqQty * thickness;
    var thkMM = Math.round(thickness * 1000);
    return { convertedQty: vol, conversionType: 'area_to_volume',
      conversionNote: fmtI(boqQty) + ' m\u00b2 \u00d7 ' + thkMM + 'mm = ' + fmt(vol) + ' m\u00b3' };
  }

  // tons → kg
  if (bU === 'tons' && mU === 'kg') {
    var kg = boqQty * 1000;
    return { convertedQty: kg, conversionType: 'tons_to_kg',
      conversionNote: fmtI(boqQty) + ' tons \u00d7 1000 = ' + fmtI(kg) + ' kg' };
  }

  // kg → tons
  if (bU === 'kg' && mU === 'tons') {
    var tons = boqQty / 1000;
    return { convertedQty: tons, conversionType: 'kg_to_tons',
      conversionNote: fmtI(boqQty) + ' kg \u00f7 1000 = ' + fmt(tons) + ' tons' };
  }

  // m² → kg: area to mass (needs thickness + density)
  if (bU === 'm2' && mU === 'kg') {
    if (!thickness || thickness <= 0 || !massFactor || massFactor <= 1) {
      return { convertedQty: boqQty, conversionType: 'area_to_mass_missing',
        conversionNote: '\u26a0 BOQ in m\u00b2 but EF per kg \u2014 thickness or density needed' };
    }
    var mass = boqQty * thickness * massFactor;
    var thkMM2 = Math.round(thickness * 1000);
    return { convertedQty: mass, conversionType: 'area_to_mass',
      conversionNote: fmtI(boqQty) + ' m\u00b2 \u00d7 ' + thkMM2 + 'mm \u00d7 ' + massFactor + ' kg/m\u00b3 = ' + fmtI(Math.round(mass)) + ' kg' };
  }

  // m³ → kg: volume to mass (needs density = massFactor)
  if (bU === 'm3' && mU === 'kg') {
    if (!massFactor || massFactor <= 1) {
      return { convertedQty: boqQty, conversionType: 'volume_to_mass_missing',
        conversionNote: '\u26a0 BOQ in m\u00b3 but EF per kg \u2014 density not available' };
    }
    var massV = boqQty * massFactor;
    return { convertedQty: massV, conversionType: 'volume_to_mass',
      conversionNote: fmtI(boqQty) + ' m\u00b3 \u00d7 ' + massFactor + ' kg/m\u00b3 = ' + fmtI(Math.round(massV)) + ' kg' };
  }

  // m³ → tons
  if (bU === 'm3' && mU === 'tons') {
    if (!massFactor || massFactor <= 1) {
      return { convertedQty: boqQty, conversionType: 'volume_to_tons_missing',
        conversionNote: '\u26a0 BOQ in m\u00b3 but EF per ton \u2014 density not available' };
    }
    var tonsV = (boqQty * massFactor) / 1000;
    return { convertedQty: tonsV, conversionType: 'volume_to_tons',
      conversionNote: fmtI(boqQty) + ' m\u00b3 \u00d7 ' + massFactor + ' kg/m\u00b3 \u00f7 1000 = ' + fmt(tonsV) + ' tons' };
  }

  // No recognized conversion
  return { convertedQty: boqQty, conversionType: 'unknown_mismatch',
    conversionNote: '\u26a0 Unit mismatch: BOQ=' + (boqUnit || '?') + ' vs EF=' + (materialUnit || '?') };
}

// User manually enters thickness for items missing it
function updateItemThickness(idx, thicknessMM) {
  var item = _tenderItems[idx];
  if (!item) return;
  var mm = parseFloat(thicknessMM);
  if (isNaN(mm) || mm <= 0) return;
  var meters = mm / 1000;
  item.thickness = meters;
  item.thicknessSource = 'user';

  var matDB = MATERIALS[item.category] || ICE_MATERIALS[item.category];
  var materialUnit = matDB ? matDB.unit : item.unit;
  var mf = matDB ? matDB.massFactor : (item.massFactor || 1);

  var conversion = convertBOQQuantity(item.boqQty, item.boqUnit, materialUnit, meters, mf);
  item.qty = conversion.convertedQty;
  item.convertedQty = conversion.convertedQty;
  item.conversionNote = conversion.conversionNote;
  item.conversionType = conversion.conversionType;
  item.needsConversion = conversion.conversionType !== 'none';
  item.baselineEmission = (item.qty * item.baselineEF) / 1000;
  item.targetEmission = item.baselineEmission;

  recalcTender80Pct();
  navigate('tender_entry');
}

// User manually edits the calculated quantity directly
function updateCalcQty(idx, newValue) {
  var item = _tenderItems[idx];
  if (!item) return;
  var val = parseFloat(String(newValue).replace(/,/g, ''));
  if (isNaN(val) || val < 0) return;
  item.qty = val;
  item.convertedQty = val;
  item.conversionNote = 'Manually entered: ' + fmt(val) + ' ' + (item.unit || '');
  item.conversionType = 'manual';
  item.needsConversion = true;
  item.baselineEmission = (val * item.baselineEF) / 1000;
  item.targetEmission = item.baselineEmission;

  recalcTender80Pct();
  navigate('tender_entry');
}

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
  _tenderItems = (_tenderEdit.items || []).map(function(it) {
    // Migrate items saved before unit conversion feature
    if (it.boqQty === undefined) {
      it.boqQty = it.qty;
      it.boqUnit = it.unit;
      it.thickness = null;
      it.thicknessSource = null;
      it.convertedQty = it.qty;
      it.conversionNote = '';
      it.conversionType = 'none';
      it.needsConversion = false;
    }
    return it;
  });
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
  _tenderItems = (_tenderEdit.items || []).map(function(it) {
    if (it.boqQty === undefined) {
      it.boqQty = it.qty; it.boqUnit = it.unit;
      it.thickness = null; it.thicknessSource = null;
      it.convertedQty = it.qty; it.conversionNote = '';
      it.conversionType = 'none'; it.needsConversion = false;
    }
    return it;
  });
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
      <thead><tr><th style="min-width:50px">BOQ #</th><th>BOQ Description</th><th>Stage</th><th>Category</th><th>Type</th><th class="r">BOQ Qty</th><th class="r">Calc Qty</th><th class="r">EF</th><th class="r">tCO\u2082</th><th>Source</th><th>80%</th><th>Remarks</th><th></th></tr></thead>
      <tbody id="tenderItemsTbl">${_tenderItems.length ? _tenderItems.map((it, idx) => {
        const in80 = it._in80Pct;
        const srcBadge = it.gwpSource === 'ECCS-Zero'
          ? '<span style="display:inline-block;background:rgba(148,163,184,0.15);color:var(--slate5);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600" title="' + esc(it.assumption || 'ECCS: Carbon factor = 0') + '">EF=0</span>'
          : it.gwpSource === 'A1-A3'
          ? '<span style="display:inline-block;background:rgba(52,211,153,0.1);color:var(--green);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">A1-A3</span>'
          : it.gwpSource === 'ICE'
          ? '<span style="display:inline-block;background:rgba(96,165,250,0.1);color:var(--blue);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">ICE</span>'
          : '<span style="display:inline-block;background:rgba(251,191,36,0.1);color:var(--yellow);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">Manual</span>';
        // For ECCS-Zero items, show category as static label (no dropdown needed)
        let catDropdown, typeDropdown;
        if (it.eccsZero) {
          catDropdown = '<span style="font-size:10px;color:var(--slate5);font-weight:600">' + esc(it.category) + '</span>';
          typeDropdown = '<span style="font-size:9px;color:var(--slate5)">' + esc(it.type || it.category) + '</span>';
        } else {
        // Build category dropdown — A1-A3 categories first, then ICE
        const catDropdownId = 'tiCatDd_' + idx;
        catDropdown = '<select id="' + catDropdownId + '" onchange="changeTenderItemCategory(' + idx + ',this.value)" style="font-size:10px;padding:2px 4px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:4px;max-width:130px">';
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
        } // end else (non-ECCS-Zero items)
        // Build remarks with conversion note, assumption, and ICE reference
        let remarks = '';
        // Determine if units differ (BOQ unit vs EF unit)
        var boqU = normalizeUnitStr(it.boqUnit || '');
        var efU = normalizeUnitStr(it.unit || '');
        var unitsDiffer = boqU && efU && boqU !== efU;
        var isSuccessConversion = it.conversionType && it.conversionType !== 'none' && it.conversionType !== 'manual' && it.conversionType.indexOf('missing') === -1 && it.conversionType.indexOf('unknown') === -1;
        var needsManualInput = unitsDiffer && !isSuccessConversion && it.conversionType !== 'manual';

        // Show conversion note
        if (it.conversionNote) {
          var isWarning = it.conversionType && (it.conversionType.indexOf('missing') !== -1 || it.conversionType.indexOf('unknown') !== -1);
          remarks += '<span style="color:' + (isWarning ? 'var(--red)' : 'var(--cyan)') + ';font-size:9px;font-weight:600">' + esc(it.conversionNote) + '</span>';
        }
        // Show thickness input when area→volume conversion needs thickness
        if (it.conversionType && it.conversionType.indexOf('area_to_volume_missing') !== -1) {
          remarks += '<br><label style="font-size:8px;color:var(--slate5)">Thickness: </label><input type="number" placeholder="mm" style="width:48px;font-size:9px;padding:1px 3px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:3px" onchange="updateItemThickness(' + idx + ',this.value)"><span style="font-size:8px;color:var(--slate5)"> mm</span>';
        }
        if (it.assumption) {
          remarks += (remarks ? '<br>' : '') + '<span style="font-size:9px">' + esc(it.assumption) + '</span>';
        }
        if (it.iceRefUrl && it.gwpSource === 'ICE') {
          remarks += (remarks ? ' ' : '') + '<a href="' + it.iceRefUrl + '" target="_blank" rel="noopener" style="color:var(--blue);font-size:9px;text-decoration:underline">\ud83d\udd17 ICE DB Ref</a>';
        }
        if (it.notes) {
          remarks += (remarks ? '<br>' : '') + '<span style="color:var(--slate5)">' + esc(it.notes) + '</span>';
        }
        // Calc Qty cell:
        // - Successful conversion: show converted value (editable) in blue
        // - Units differ but no auto-conversion: show editable input with warning
        // - Same units: show "—"
        let calcQtyCell;
        if (isSuccessConversion || it.conversionType === 'manual') {
          // Show converted value as editable input
          calcQtyCell = '<input type="text" value="' + fmt(it.qty) + '" style="width:70px;font-size:10px;padding:2px 4px;background:var(--bg3);color:var(--blue);border:1px solid var(--border);border-radius:3px;text-align:right;font-weight:600;font-family:monospace" onchange="updateCalcQty(' + idx + ',this.value)"> <span style="font-size:8px;color:var(--slate5)">' + esc(it.unit || '') + '</span>';
        } else if (needsManualInput) {
          // Units differ but no conversion possible — show editable input with warning style
          calcQtyCell = '<input type="text" value="' + fmt(it.qty) + '" placeholder="Enter qty" style="width:70px;font-size:10px;padding:2px 4px;background:rgba(239,68,68,0.08);color:var(--red);border:1px solid var(--red);border-radius:3px;text-align:right;font-family:monospace" onchange="updateCalcQty(' + idx + ',this.value)"> <span style="font-size:8px;color:var(--slate5)">' + esc(it.unit || '') + '</span>';
        } else if (unitsDiffer) {
          // Already manually set or partial match
          calcQtyCell = '<input type="text" value="' + fmt(it.qty) + '" style="width:70px;font-size:10px;padding:2px 4px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:3px;text-align:right;font-family:monospace" onchange="updateCalcQty(' + idx + ',this.value)"> <span style="font-size:8px;color:var(--slate5)">' + esc(it.unit || '') + '</span>';
        } else {
          // Same units — no conversion needed
          calcQtyCell = '<span style="color:var(--slate5);font-size:9px">\u2014</span>';
        }
        // Lifecycle stage badge
        const stage = it.lifecycleStage || 'A1-A3';
        const stageColors = { 'A1-A3': 'var(--green)', 'A4': 'var(--blue)', 'A5': 'var(--orange)', 'D': 'var(--purple)' };
        const stageColor = stageColors[stage] || 'var(--slate5)';
        const stageBadge = '<span style="display:inline-block;font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;background:' + stageColor + '15;color:' + stageColor + ';border:1px solid ' + stageColor + '30">' + stage + (it.isDemolition ? ' D' : '') + '</span>';
        // Confidence indicator
        const confColors = { high: 'var(--green)', medium: 'var(--yellow)', low: 'var(--red)' };
        const conf = it.confidence || 'medium';
        const confDot = '<span title="Confidence: ' + conf + '" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + (confColors[conf] || 'var(--slate5)') + ';margin-right:3px;vertical-align:middle"></span>';
        const lowConfHighlight = conf === 'low' ? ';background:rgba(239,68,68,0.04)' : '';
        return `<tr${in80 ? ' style="background:rgba(52,211,153,0.04)' + lowConfHighlight + '"' : (lowConfHighlight ? ' style="' + lowConfHighlight.substring(1) + '"' : '')}>
          <td style="font-weight:600;color:var(--slate4);font-size:11px;white-space:nowrap">${confDot}${esc(it.boqItemNo || '')}</td>
          <td style="font-size:11px;color:var(--text)">${esc(it.originalDesc || it.type)}</td>
          <td style="text-align:center">${stageBadge}</td>
          <td style="font-size:10px">${catDropdown}</td>
          <td style="font-size:10px">${typeDropdown}</td>
          <td class="r mono" style="font-size:10px">${fmtI(it.boqQty != null ? it.boqQty : it.qty)} <span style="font-size:8px;color:var(--slate5)">${esc(it.boqUnit || it.unit || '')}</span></td>
          <td class="r mono" style="font-size:10px">${calcQtyCell}</td>
          <td class="r mono" style="font-size:10px">${fmt(it.baselineEF)} <span style="font-size:8px;color:var(--slate5)">${esc(it.efUnit || '')}</span></td>
          <td class="r mono">${fmt(it.baselineEmission)}</td>
          <td>${srcBadge}</td>
          <td>${in80 ? '<span style="color:var(--green);font-weight:700;font-size:11px">\u2713</span>' : ''}</td>
          <td style="font-size:9px;max-width:240px;line-height:1.4">${remarks}</td>
          <td><button class="btn btn-danger btn-sm" onclick="removeTenderItem(${idx})">✕</button></td>
        </tr>`;
      }).join('') : '<tr><td colspan="13" class="empty">No line items yet. Use the form above to add materials.</td></tr>'}
      ${_tenderItems.length > 1 ? `<tr class="total-row">
        <td colspan="8">Total</td>
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
    boqQty: qty,
    boqUnit: unit,
    qty,
    unit,
    efUnit,
    massFactor,
    thickness: null,
    thicknessSource: null,
    convertedQty: qty,
    conversionNote: '',
    conversionType: 'none',
    needsConversion: false,
    baselineEF,
    targetEF: baselineEF, // Tender = baseline only
    baselineEmission,
    targetEmission: baselineEmission, // Tender = baseline only
    isCustom,
    gwpSource: _tenderCurrentGWPSource || 'Manual',
    lifecycleStage: 'A1-A3',
    isDemolition: false,
    confidence: 'high',
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
      <thead><tr><th>BOQ #</th><th>BOQ Description</th><th>Stage</th><th>Category</th><th>Type</th><th class="r">Qty</th><th>Unit</th><th class="r">EF</th><th class="r">tCO\u2082</th><th>Source</th><th>Remarks</th></tr></thead>
      <tbody>${items.map(it => {
        const srcBadge = it.gwpSource === 'ECCS-Zero'
          ? '<span style="display:inline-block;background:rgba(148,163,184,0.15);color:var(--slate5);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">EF=0</span>'
          : it.gwpSource === 'A1-A3'
          ? '<span style="display:inline-block;background:rgba(52,211,153,0.1);color:var(--green);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">A1-A3</span>'
          : it.gwpSource === 'ICE'
          ? '<span style="display:inline-block;background:rgba(96,165,250,0.1);color:var(--blue);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">ICE</span>'
          : '<span style="display:inline-block;background:rgba(251,191,36,0.1);color:var(--yellow);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">Manual</span>';
        const stage = it.lifecycleStage || 'A1-A3';
        const stgC = { 'A1-A3': 'var(--green)', 'A4': 'var(--blue)', 'A5': 'var(--orange)', 'D': 'var(--purple)' };
        const stageBadge = '<span style="font-size:8px;font-weight:700;color:' + (stgC[stage] || 'var(--slate5)') + '">' + stage + '</span>';
        let remarkText = it.assumption || '';
        if (it.gwpSource === 'ICE' && it.iceRefUrl) {
          remarkText += (remarkText ? ' ' : '') + '<a href="' + it.iceRefUrl + '" target="_blank" rel="noopener" style="color:var(--blue);font-size:9px;text-decoration:underline">ICE Ref</a>';
        }
        return `<tr>
          <td style="font-size:11px;color:var(--slate4)">${esc(it.boqItemNo || '')}</td>
          <td style="font-size:11px;color:var(--text)">${esc(it.originalDesc || it.type)}</td>
          <td style="text-align:center">${stageBadge}</td>
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
        <td colspan="8">Total</td>
        <td class="r mono">${fmt(s.totalBaseline || 0)}</td>
        <td colspan="2"></td>
      </tr>` : ''}
      </tbody>
    </table></div>
  </div>`;
}

// ===== BOQ UPLOAD RESULT SUMMARY =====
function renderBOQResultSummary(r) {
  var confHtml = '';
  if (r.aiParsed && (r.highConf || r.medConf || r.lowConf)) {
    confHtml = '<div style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<span style="font-size:10px;font-weight:600;color:var(--slate5)">AI CONFIDENCE:</span>' +
      (r.highConf ? '<span style="display:inline-block;background:rgba(52,211,153,0.12);color:var(--green);font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600">' + r.highConf + ' High</span>' : '') +
      (r.medConf ? '<span style="display:inline-block;background:rgba(251,191,36,0.12);color:var(--yellow);font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600">' + r.medConf + ' Medium</span>' : '') +
      (r.lowConf ? '<span style="display:inline-block;background:rgba(239,68,68,0.12);color:var(--red);font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600">' + r.lowConf + ' Low — needs review</span>' : '') +
      '</div>';
  }
  return '<div style="margin-top:14px;padding:14px 16px;background:rgba(52,211,153,0.08);border:2px solid rgba(52,211,153,0.3);border-radius:12px">' +
    '<div style="font-size:14px;font-weight:700;color:var(--green);margin-bottom:10px">BOQ processed successfully: ' + esc(r.fileName) + '</div>' +
    '<div class="stats-row" style="margin-bottom:8px">' +
    '<div class="stat-card green"><div class="sc-label">A1-A3 Matched</div><div class="sc-value">' + r.a13Count + '</div></div>' +
    '<div class="stat-card blue"><div class="sc-label">ICE Matched</div><div class="sc-value">' + r.iceCount + '</div></div>' +
    '<div class="stat-card orange"><div class="sc-label">Unmatched</div><div class="sc-value">' + r.unmatchedCount + '</div></div>' +
    '<div class="stat-card cyan"><div class="sc-label">Total Baseline</div><div class="sc-value">' + fmt(r.totalBL) + '</div><div class="sc-sub">tCO\u2082eq</div></div>' +
    '</div>' +
    (r.aiParsed ? '<div style="font-size:11px;color:var(--green);margin-bottom:4px;font-weight:600">Parsed by AI (Claude) — intelligent carbon classification engine</div>' : '') +
    confHtml +
    '<div style="font-size:12px;color:var(--slate4)">' + r.totalItems + ' line items added. See the <strong>BOQ Line Items</strong> table and <strong>80% Material Identification</strong> bar below.' + (r.aiParsed ? ' Use the <strong>Category</strong> and <strong>Type</strong> dropdowns to correct any mismatches.' + (r.lowConf ? ' <strong style="color:var(--red)">Items flagged "Low" confidence need human review.</strong>' : '') : '') + '</div>' +
    '<div class="btn-row" style="margin-top:10px"><button class="btn btn-secondary btn-sm" onclick="clearBOQResult()">Dismiss</button>' +
    (r.lowConf ? '<button class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:var(--red);border:1px solid rgba(239,68,68,0.3)" onclick="filterLowConfidence()">Review Low Confidence (' + r.lowConf + ')</button>' : '') +
    '<button class="btn btn-primary btn-sm" onclick="clearBOQResult();openTenderFileInput()">Upload Another File</button></div>' +
    '</div>';
}

function clearBOQResult() {
  _tenderBOQLastResult = null;
  _tenderBOQMode = false;
  navigate('tender_entry');
}

// Scroll to and highlight low-confidence items that need human review
function filterLowConfidence() {
  clearBOQResult();
  setTimeout(function() {
    var tbl = $('tenderItemsTbl');
    if (!tbl) return;
    var rows = tbl.getElementsByTagName('tr');
    var firstLow = null;
    for (var i = 0; i < _tenderItems.length; i++) {
      if (_tenderItems[i].confidence === 'low') {
        if (rows[i]) {
          rows[i].style.outline = '2px solid var(--red)';
          rows[i].style.outlineOffset = '-1px';
          if (!firstLow) firstLow = rows[i];
        }
      }
    }
    if (firstLow) firstLow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 200);
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

        // Smart sheet selection — find the sheet most likely to contain BOQ data
        var sheet = smartSelectSheet(wb);
        var jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        // Smart header detection — handles multi-row headers, merged cells, titles
        var headerInfo = smartDetectHeaders(jsonData);
        rows = headerInfo.rows;
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

// ===== SMART SHEET SELECTION =====
// Auto-select the best sheet in a workbook — looks for BOQ-related sheet names
function smartSelectSheet(wb) {
  if (wb.SheetNames.length === 1) return wb.Sheets[wb.SheetNames[0]];

  // Priority keywords for sheet names (case-insensitive)
  var boqKeywords = ['boq', 'bill of quantit', 'quantities', 'quantity', 'tender', 'pricing', 'schedule of quantities'];
  var secondaryKeywords = ['payment', 'application', 'summary', 'schedule', 'materials', 'items'];

  // Score each sheet
  var bestSheet = null, bestScore = -1;
  for (var i = 0; i < wb.SheetNames.length; i++) {
    var name = wb.SheetNames[i].toLowerCase().trim();
    var score = 0;

    // Check BOQ keywords (high priority)
    for (var b = 0; b < boqKeywords.length; b++) {
      if (name.indexOf(boqKeywords[b]) !== -1) { score += 100; break; }
    }
    // Check secondary keywords
    for (var s = 0; s < secondaryKeywords.length; s++) {
      if (name.indexOf(secondaryKeywords[s]) !== -1) { score += 30; break; }
    }

    // Penalize "chart", "notes", "cover", "index" sheets
    if (/\b(chart|graph|note|cover|index|log|revision|history)\b/i.test(name)) score -= 50;

    // Check if sheet has substantial data (more rows = more likely to be BOQ)
    var sheetData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1 });
    if (sheetData.length > 10) score += 20;
    if (sheetData.length > 50) score += 20;

    // First sheet gets a small bonus (often the main sheet)
    if (i === 0) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestSheet = wb.Sheets[wb.SheetNames[i]];
    }
  }

  return bestSheet || wb.Sheets[wb.SheetNames[0]];
}

// ===== SMART HEADER DETECTION =====
// Handles: multi-row headers, merged cells, title rows, Arabic text, watermarks
// Returns { rows: [[headers], [data1], [data2], ...], headerRowIdx: N }
function smartDetectHeaders(jsonData) {
  if (!jsonData || jsonData.length < 2) return { rows: jsonData || [], headerRowIdx: 0 };

  // BOQ-related header keywords (any language headers should contain some of these)
  var headerKeywords = [
    'description', 'desc', 'item', 'material', 'boq', 'quantity', 'qty',
    'unit', 'uom', 'amount', 'rate', 'price', 'total', 'no', 'nr', 'sl',
    'ref', 'spec', 'category', 'type', 'notes', 'remark', 'work', 'scope',
    'bill', 'element', 'trade', 'section', 'measure', 'weight', 'volume'
  ];

  // Scan up to first 25 rows to find the best header row
  var bestHeaderIdx = -1, bestScore = 0;
  var scanLimit = Math.min(jsonData.length, 25);

  for (var i = 0; i < scanLimit; i++) {
    var row = jsonData[i];
    if (!row || row.length < 2) continue;

    var score = 0;
    var textCols = 0;

    for (var j = 0; j < row.length; j++) {
      var cell = String(row[j] || '').toLowerCase().trim();
      if (!cell) continue;

      // Check if cell contains header keywords
      for (var k = 0; k < headerKeywords.length; k++) {
        if (cell.indexOf(headerKeywords[k]) !== -1) {
          score += 10;
          break;
        }
      }

      // Count text columns (must have 2+ alphabetic characters)
      if (/[a-z]{2,}/i.test(cell)) textCols++;
    }

    // Require at least 2 text columns and 2 keyword matches
    if (textCols >= 2 && score >= 20) {
      // Bonus for more keyword matches
      score += textCols * 2;

      if (score > bestScore) {
        bestScore = score;
        bestHeaderIdx = i;
      }
    }
  }

  if (bestHeaderIdx < 0) {
    // Fallback: find first row with 2+ text columns
    for (var f = 0; f < scanLimit; f++) {
      var fRow = jsonData[f];
      if (!fRow || fRow.length < 2) continue;
      var fTextCols = 0;
      for (var fj = 0; fj < fRow.length; fj++) {
        var fCell = String(fRow[fj] || '').toLowerCase().trim();
        if (fCell && /[a-z]{2,}/i.test(fCell)) fTextCols++;
      }
      if (fTextCols >= 2) { bestHeaderIdx = f; break; }
    }
    if (bestHeaderIdx < 0) bestHeaderIdx = 0;
  }

  // Multi-row header merge: check if the row BELOW the header has additional labels
  // (e.g., "BOQ" on row 5, "Quantity" on row 6 → merge into "BOQ Quantity")
  var headerRow = (jsonData[bestHeaderIdx] || []).slice();
  var nextRowIdx = bestHeaderIdx + 1;

  if (nextRowIdx < jsonData.length) {
    var nextRow = jsonData[nextRowIdx] || [];
    var mergedAny = false;

    for (var m = 0; m < headerRow.length; m++) {
      var hCell = String(headerRow[m] || '').trim();
      var nCell = String(nextRow[m] || '').trim();

      // If header cell is short and next row has a label (not a number), merge
      if (hCell && nCell && !/^\d/.test(nCell) && /[a-z]{2,}/i.test(nCell)) {
        // Check if next row cell adds context (e.g., "BOQ" + "Quantity")
        if (hCell.length < 20 && nCell.length < 20) {
          headerRow[m] = hCell + ' ' + nCell;
          mergedAny = true;
        }
      } else if (!hCell && nCell && /[a-z]{2,}/i.test(nCell)) {
        // Empty header cell with label below — use the label
        headerRow[m] = nCell;
        mergedAny = true;
      }
    }

    // If we merged, skip the sub-header row in data
    if (mergedAny) {
      var result = [headerRow].concat(jsonData.slice(nextRowIdx + 1));
      return { rows: result, headerRowIdx: bestHeaderIdx };
    }
  }

  return { rows: jsonData.slice(bestHeaderIdx), headerRowIdx: bestHeaderIdx };
}

// ===== PARSE QUANTITY from real-world formats =====
// Handles: "800+", "~500", "est. 750", "1,000.50", "1.000,50" (European), negative signs
function parseRobustQuantity(raw) {
  if (raw == null || raw === '') return NaN;
  var s = String(raw).trim();

  // Remove common non-numeric prefixes/suffixes
  s = s.replace(/^[~≈≤≥<>]+/, '');          // ~500, ≈500, <500
  s = s.replace(/\+$/, '');                   // 800+
  s = s.replace(/^\(|\)$/g, '');              // (500) → 500
  s = s.replace(/^(est\.?|approx\.?|about|circa)\s*/i, '');  // est. 500
  s = s.replace(/\s*\(.*?\)\s*$/, '');        // 500 (approx)

  // Detect European number format: "1.000,50" (dots as thousands, comma as decimal)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  }

  // Remove remaining commas (thousands separator)
  s = s.replace(/,/g, '');

  // Extract first valid number
  var match = s.match(/-?\d+(?:\.\d+)?/);
  if (match) return parseFloat(match[0]);
  return NaN;
}

// Fully automatic: detect columns → match GWP → add items to tender → re-render
function autoMatchAndAddBOQ(rows, fileName) {
  var headers = rows[0].map(function(h) { return String(h).toLowerCase().trim(); });

  // Enterprise-grade column detection — uses scoring, excludes already-matched columns
  // Description column (most important — try first with long, specific keywords)
  var descCol = findColumn(headers, [
    'item description', 'material description', 'description of work', 'work description',
    'description', 'desc', 'boq item', 'scope of work', 'material',
    'element', 'component', 'specification', 'spec', 'name', 'item'
  ]);

  // Quantity column — "boq" alone is a valid quantity header, as are many variants
  var usedCols = descCol >= 0 ? [descCol] : [];
  var qtyCol = findColumn(headers, [
    'boq quantity', 'boq qty', 'total quantity', 'total qty',
    'quantity', 'qty', 'original quantity', 'revised quantity',
    'amount', 'volume', 'weight', 'mass', 'count',
    'boq'
  ], usedCols);

  // Unit column — avoid matching "unit price" or "unit rate"
  var usedCols2 = usedCols.concat(qtyCol >= 0 ? [qtyCol] : []);
  var unitCol = findColumn(headers, [
    'unit of measure', 'uom', 'units', 'unit', 'measurement', 'measure'
  ], usedCols2);

  // If unit matched a "unit price" or "unit rate" column, reject it
  if (unitCol >= 0 && /\b(price|rate|cost|value|amount)\b/i.test(headers[unitCol])) {
    // Try again excluding this column
    var usedCols2b = usedCols2.concat([unitCol]);
    var unitCol2 = findColumn(headers, ['uom', 'units', 'unit', 'measurement'], usedCols2b);
    if (unitCol2 >= 0) unitCol = unitCol2;
    else unitCol = -1; // No clean unit column found — will extract from description
  }

  var usedCols3 = usedCols2.concat(unitCol >= 0 ? [unitCol] : []);
  var catCol = findColumn(headers, [
    'material category', 'category', 'material group', 'group', 'material type',
    'type', 'class', 'trade', 'section', 'discipline'
  ], usedCols3);

  var usedCols4 = usedCols3.concat(catCol >= 0 ? [catCol] : []);
  var efCol = findColumn(headers, [
    'emission factor', 'carbon factor', 'embodied carbon', 'gwp',
    'kgco2', 'a1-a3', 'a1a3', 'epd', 'co2', 'ef'
  ], usedCols4);

  var notesCol = findColumn(headers, [
    'notes', 'remarks', 'comment', 'comments', 'reference'
  ], usedCols4);

  var itemNoCol = findColumn(headers, [
    'item no', 'item number', 'item nr', 'sl no', 'sl.no', 'sl nr', 'sl.nr',
    'boq ref', 'bill no', 'bill item', 'clause', 'ref no', 'item ref', 'sn', 'serial'
  ], usedCols4);

  if (descCol < 0 || qtyCol < 0) {
    _tenderBOQProcessing = false;
    showBOQStatus(
      '<strong>Error:</strong> Could not auto-detect columns in your file.' +
      '<br><strong>Headers found:</strong> ' + headers.filter(function(h) { return h; }).join(', ') +
      '<br><strong>Detected:</strong> Description=' + (descCol >= 0 ? '"' + headers[descCol] + '"' : '<span style="color:var(--red)">NOT FOUND</span>') +
      ' | Quantity=' + (qtyCol >= 0 ? '"' + headers[qtyCol] + '"' : '<span style="color:var(--red)">NOT FOUND</span>') +
      '<br><strong>Tip:</strong> Ensure your file has column headers like "Description" and "Quantity" or "Qty".',
      'red'
    );
    return;
  }

  showBOQStatus('<strong>Step 3/4:</strong> Columns detected — Description="' + headers[descCol] + '", Quantity="' + headers[qtyCol] + '"' +
    (unitCol >= 0 ? ', Unit="' + headers[unitCol] + '"' : '') +
    '. Matching materials to A1-A3 & ICE...', 'info');

  // Match all rows to GWP database
  var dataRows = rows.slice(1);
  var a13Count = 0, iceCount = 0, unmatchedCount = 0;
  var skippedRows = 0;

  for (var r = 0; r < dataRows.length; r++) {
    var row = dataRows[r];
    var desc = String(row[descCol] || '').trim();
    var qty = parseRobustQuantity(row[qtyCol]);
    var unit = unitCol >= 0 ? String(row[unitCol] || '').trim() : '';
    var catHint = catCol >= 0 ? String(row[catCol] || '').trim() : '';
    var efValue = efCol >= 0 ? parseFloat(String(row[efCol] || '').replace(/,/g, '')) : NaN;
    var notes = notesCol >= 0 ? String(row[notesCol] || '').trim() : '';

    // Skip rows without description or valid quantity
    if (!desc || desc.length < 3) { skippedRows++; continue; }
    if (isNaN(qty) || qty <= 0) { skippedRows++; continue; }

    // Skip non-material rows (subtotals, totals, headers repeated, VAT, etc.)
    var dLower = desc.toLowerCase();
    if (/^(sub[- ]?total|total|grand total|carried? (to|forward)|brought forward|page \d|amount|sum)/i.test(dLower)) { skippedRows++; continue; }
    if (/\b(add\s+vat|vat\s+of|add\s+\d+%|contingenc|provisional\s+sum|prime\s+cost|day\s*work|prelim(?:inar)|insurance|bond|permit)\b/i.test(dLower)) { skippedRows++; continue; }

    // If no unit column, try to extract unit from the description
    if (!unit) {
      unit = extractUnitFromDescription(desc);
    }

    var boqItemNo = itemNoCol >= 0 ? String(row[itemNoCol] || '').trim() : String(r + 1);

    // ================================================================
    // ECCS 6-STEP CLASSIFICATION — check BEFORE material matching
    // ================================================================
    var exEccsZero = false, exEccsCat = '', exEccsFlag = '', exEccsDemo = false, exEccsMEP = false;

    if (isECCS_Demolition(dLower)) {
      exEccsZero = true; exEccsCat = 'Demolition/Removal'; exEccsDemo = true;
      exEccsFlag = 'ZERO — Demolition/removal activity, no A1-A3 embodied carbon';
    } else if (isECCS_ComplexMEP(desc, unit)) {
      exEccsZero = true; exEccsCat = 'Complex MEP'; exEccsMEP = true;
      exEccsFlag = 'ZERO — Complex MEP assembly, requires manufacturer EPD';
    } else if (isECCS_Provisional(dLower)) {
      skippedRows++; continue; // Skip — non-material
    } else if (isECCS_LabourOnly(dLower)) {
      skippedRows++; continue; // Skip — no material
    } else if (isECCS_Landscaping(dLower)) {
      exEccsZero = true; exEccsCat = 'Landscaping';
      exEccsFlag = 'ZERO — Organic/landscaping item, excluded from A1-A3';
    }

    var match, m, bl, materialUnit, mf, thickness, thicknessSource, convertedQty, conversionNote, conversionType;

    if (exEccsZero) {
      // Steps 1-5: EF = 0, no material matching
      match = { matched: false, gwpSource: 'none', category: exEccsCat, typeName: exEccsCat, alternatives: [], assumption: exEccsFlag };
      m = null; bl = 0; materialUnit = unit || 'nr'; mf = 1;
      thickness = null; thicknessSource = null;
      convertedQty = qty; conversionNote = exEccsFlag; conversionType = 'none';
      unmatchedCount++;
    } else {
      // Step 6: Quantifiable material — do matching
      match = lookupTenderGWP(desc, catHint, unit);
      if (match.gwpSource === 'A1-A3') a13Count++;
      else if (match.gwpSource === 'ICE') iceCount++;
      else unmatchedCount++;

      m = match.mat || MATERIALS[match.category] || ICE_MATERIALS[match.category];
      bl = (match.belowThreshold ? 0 : match.baseline) || 0;
      materialUnit = m ? m.unit : (unit || '');
      mf = m ? m.massFactor : 1;

      var thicknessObj = extractThickness(desc);
      thickness = thicknessObj ? thicknessObj.value : null;
      thicknessSource = thicknessObj ? thicknessObj.source : null;
      var conversion = convertBOQQuantity(qty, unit, materialUnit, thickness, mf);
      convertedQty = conversion.convertedQty;
      conversionNote = conversion.conversionNote;
      conversionType = conversion.conversionType;
    }

    var blEm = (convertedQty * bl) / 1000;

    // Infer lifecycle stage
    var inferredStage = exEccsDemo ? 'A5' : 'A1-A3';
    if (!exEccsZero && /\b(cart\s*away|haul(?:ing|age)?|transport)\b/i.test(desc)) inferredStage = 'A4';
    var inferredConf = exEccsZero ? 'high' : (match.matched ? (match.score >= 30 ? 'high' : 'medium') : 'low');

    _tenderItems.push({
      id: Date.now() + Math.random(),
      boqItemNo: boqItemNo,
      originalDesc: desc,
      category: match.category || 'Unmatched',
      type: match.typeName || desc,
      boqQty: qty,
      boqUnit: unit,
      qty: convertedQty,
      unit: materialUnit,
      efUnit: m ? m.efUnit : '',
      massFactor: mf,
      thickness: thickness,
      thicknessSource: thicknessSource,
      convertedQty: convertedQty,
      conversionNote: conversionNote,
      conversionType: conversionType,
      needsConversion: !exEccsZero && conversionType !== 'none',
      baselineEF: bl,
      targetEF: bl,
      baselineEmission: blEm,
      targetEmission: blEm,
      isCustom: !match.matched,
      gwpSource: exEccsZero ? 'ECCS-Zero' : (match.gwpSource || (match.matched ? 'ICE' : 'Manual')),
      lifecycleStage: inferredStage,
      isDemolition: exEccsDemo,
      isComplexMEP: exEccsMEP,
      eccsZero: exEccsZero,
      confidence: inferredConf,
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
    totalBL: totalBL,
    aiParsed: true
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
    // Split large documents into chunks for complete coverage (parts 1-12+)
    // Keep chunks small enough for Claude to respond within Netlify's 26s timeout
    var CHUNK_SIZE = 25000; // chars per chunk — keeps each API call fast
    var aiSuccess = false;

    try {
      var allAIItems = [];
      var chunks = [];

      if (allText.length <= CHUNK_SIZE) {
        chunks = [allText];
      } else {
        // Split at line boundaries
        var textLines = allText.split('\n');
        var currentChunk = '';
        for (var ci = 0; ci < textLines.length; ci++) {
          if (currentChunk.length + textLines[ci].length + 1 > CHUNK_SIZE && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = textLines[ci];
          } else {
            currentChunk += (currentChunk ? '\n' : '') + textLines[ci];
          }
        }
        if (currentChunk) chunks.push(currentChunk);
      }

      var totalChunks = chunks.length;
      showBOQStatus('<strong>Step 2/3:</strong> AI is analyzing the BOQ document (' + allLines.length + ' lines, ' + totalPages + ' pages' + (totalChunks > 1 ? ', ' + totalChunks + ' chunks' : '') + ')...', 'info');

      for (var chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        if (totalChunks > 1) {
          showBOQStatus('<strong>Step 2/3:</strong> AI analyzing chunk ' + (chunkIdx + 1) + ' of ' + totalChunks + ' (' + allAIItems.length + ' items found so far)...', 'info');
        }

        var res = await apiCall('/parse-boq', {
          method: 'POST',
          body: JSON.stringify({
            text: chunks[chunkIdx],
            fileName: file.name,
            chunkIndex: chunkIdx,
            totalChunks: totalChunks
          })
        });
        var data = await res.json();

        if (res.ok && data.success && data.items && data.items.length > 0) {
          allAIItems = allAIItems.concat(data.items);
        } else if (data.fallback && totalChunks === 1) {
          // AI unavailable — fall back to regex (only for single-chunk docs)
          showBOQStatus('<strong>Step 2/3:</strong> AI unavailable (' + (data.error || 'unknown') + '). Using pattern matching...', 'info');
          break;
        } else if (data.error && totalChunks === 1) {
          showBOQStatus('<strong>Step 2/3:</strong> AI: ' + data.error + '. Using pattern matching fallback...', 'info');
          break;
        }
        // For multi-chunk: continue even if one chunk fails
      }

      if (allAIItems.length > 0) {
        showBOQStatus('<strong>Step 3/3:</strong> AI identified ' + allAIItems.length + ' BOQ items from ' + totalChunks + ' chunk(s). Building carbon analysis...', 'info');
        aiAddBOQItems(allAIItems, file.name);
        aiSuccess = true;
      }
    } catch (aiErr) {
      console.error('AI parsing error:', aiErr);
      showBOQStatus('<strong>Step 2/3:</strong> AI service error: ' + (aiErr.message || 'unreachable') + '. Using pattern matching fallback...', 'yellow');
    }

    // Fallback to regex-based parsing if AI didn't work
    if (!aiSuccess) {
      showBOQStatus('<strong>Step 2/3:</strong> AI parsing did not succeed. Falling back to pattern matching (less accurate)...', 'yellow');
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

// ===== ECCS CLASSIFICATION HIERARCHY — CLIENT-SIDE VALIDATION =====
// Applies the 6-step decision tree to EVERY item BEFORE material matching.
// This is the safety net that catches what the AI might miss.

// Step 1: Is it demolition/removal? → EF = 0
function isECCS_Demolition(desc) {
  return /\b(remove|demolish|strip\s*out|break\s*(up|out)|dismantle|pull\s*down|take\s*down|rip\s*out|clear\s*away|disposal\s+of\s+(?:existing|old))\b/i.test(desc);
}

// Step 2: Is it a Complex MEP assembly? → EF = 0
function isECCS_ComplexMEP(desc, unit) {
  var d = desc.toLowerCase();
  // Key MEP indicator phrases — if these appear, almost always an assembly
  if (/\bcomplete\s+with\b/i.test(d)) return true;
  if (/\b(?:including|incl\.?|and)\s+all\s+accessories\b/i.test(d)) return true;
  if (/\bwith\s+(?:transformer|driver|ballast)\b/i.test(d)) return true;
  if (/\bsecondary\s+connector\b/i.test(d)) return true;
  // Electrical assemblies
  if (/\b(?:light\s*fitting|luminaire|lamp\b(?!.*\bpost\b)|pendant|down[- ]?light|up[- ]?light|spot[- ]?light|flood[- ]?light|strip\s*light|track\s*light|bollard\s*light|exit\s*sign|emergency\s*light)/i.test(d)) return true;
  if (/\b(?:switchgear|distribution\s*board|panel\s*board|mcb|rcd|isolator)\b/i.test(d)) return true;
  if (/\b(?:transformer|ups\s*system|inverter)\b/i.test(d) && /\bnr\b|\bset\b|\bno\.\b/i.test(unit)) return true;
  if (/\b(?:smoke\s*detector|heat\s*detector|fire\s*alarm|sounder|beacon)\b/i.test(d)) return true;
  if (/\b(?:cctv|camera|access\s*control|card\s*reader|intercom)\b/i.test(d)) return true;
  if (/\b(?:speaker|display\s*screen|av\s*equipment)\b/i.test(d)) return true;
  if (/\b(?:bms\s*controller|ddc\s*panel|actuator)\b/i.test(d) && /\bnr\b|\bset\b/i.test(unit)) return true;
  // Mechanical/HVAC assemblies
  if (/\b(?:fan\s*coil|fcu|ahu|air\s*handling\s*unit|package\s*unit|split\s*(?:ac|unit)|cassette\s*unit|vrf|vrv)\b/i.test(d)) return true;
  if (/\b(?:chiller|cooling\s*tower|boiler|heat\s*exchanger)\b/i.test(d)) return true;
  if (/\b(?:vav\s*box|diffuser\s+with\s+damper|grille\s+with)\b/i.test(d)) return true;
  if (/\b(?:pump)\b/i.test(d) && /\bnr\b|\bset\b|\bunit\b/i.test(unit) && !/\bpipe\b/i.test(d)) return true;
  if (/\b(?:expansion\s*vessel|buffer\s*tank|calorifier)\b/i.test(d)) return true;
  // Plumbing/Fire assemblies
  if (/\b(?:wc|w\.c\.|water\s*closet|basin|urinal|sink|shower\s*(?:unit|set|assembly))\b/i.test(d) && /\bnr\b|\bset\b/i.test(unit)) return true;
  if (/\b(?:water\s*heater|instantaneous\s*heater|solar\s*thermal)\b/i.test(d)) return true;
  if (/\b(?:sprinkler\s*head|deluge|foam\s*system|fire\s*hydrant|hose\s*reel|fire\s*extinguisher)\b/i.test(d)) return true;
  if (/\b(?:backflow\s*preventer|pressure\s*reducing\s*valve)\b/i.test(d) && /\bnr\b|\bset\b/i.test(unit)) return true;
  // Lifts & specialist
  if (/\b(?:elevator|lift|escalator|moving\s*walkway|travelator|dumbwaiter)\b/i.test(d)) return true;
  if (/\b(?:automated?\s*door|revolving\s*door|security\s*barrier|boom\s*gate|ev\s*charg)\b/i.test(d)) return true;
  if (/\b(?:baggage\s*handling|conveyor|pv\s*solar\s*panel)\b/i.test(d)) return true;
  return false;
}

// Step 3: Is it provisional/lump sum?
function isECCS_Provisional(desc) {
  return /\b(provisional\s+sum|lump\s+sum|preliminaries|general\s+requirements|daywork|contingenc|insurance|bonds?|testing\s+allowance|prime\s+cost)\b/i.test(desc);
}

// Step 4: Is it labour/service only?
function isECCS_LabourOnly(desc) {
  return /\b(labour\s+only|labor\s+only|workmanship|installation\s+only|commission(?:ing)?|inspection|survey\b|design\s+fee|attendance)\b/i.test(desc);
}

// Step 5: Is it landscaping/organic?
function isECCS_Landscaping(desc) {
  return /\b(topsoil|planting|(?:tree|shrub|grass|turf|mulch|fertiliz|seed)\b(?!.*pipe))/i.test(desc);
}

// ===== AI-PARSED BOQ ITEMS → TENDER TABLE =====
// ECCS Classification Hierarchy:
// Step 1: Demolition → EF=0 | Step 2: Complex MEP → EF=0
// Step 3: Provisional → EF=0 | Step 4: Labour → EF=0
// Step 5: Landscaping → EF=0 | Step 6: Material → classify & assign EF
function aiAddBOQItems(aiItems, fileName) {
  var a13Count = 0, iceCount = 0, unmatchedCount = 0;

  aiItems.forEach(function(item) {
    if (item.qty <= 0) return; // Skip zero-qty items

    var desc = item.description || '';
    var dLower = desc.toLowerCase();
    var unitStr = item.unit || '';

    // ================================================================
    // ECCS 6-STEP CLASSIFICATION HIERARCHY — applied BEFORE any matching
    // ================================================================
    var eccsZero = false;       // true = EF must be 0
    var eccsCategory = '';      // override category
    var eccsFlag = '';          // flag text
    var eccsDemolition = !!item.isDemolition;
    var eccsComplexMEP = !!item.isComplexMEP;

    // Step 1: Demolition/Removal → A1-A3 = 0
    if (item.isDemolition || isECCS_Demolition(dLower)) {
      eccsZero = true;
      eccsCategory = 'Demolition/Removal';
      eccsFlag = 'ZERO — Demolition/removal activity, no A1-A3 embodied carbon';
      eccsDemolition = true;
    }
    // Step 2: Complex MEP Assembly → EF = 0
    else if (item.isComplexMEP || isECCS_ComplexMEP(desc, unitStr)) {
      eccsZero = true;
      eccsCategory = 'Complex MEP';
      eccsFlag = 'ZERO — Complex MEP assembly, requires manufacturer EPD for accurate assessment';
      eccsComplexMEP = true;
    }
    // Step 3: Provisional/Lump Sum → skip entirely
    else if (isECCS_Provisional(dLower)) {
      return; // Skip — non-material item
    }
    // Step 4: Labour/Service only → skip entirely
    else if (isECCS_LabourOnly(dLower)) {
      return; // Skip — no material content
    }
    // Step 5: Landscaping/Organic → EF = 0
    else if (isECCS_Landscaping(dLower)) {
      eccsZero = true;
      eccsCategory = 'Landscaping';
      eccsFlag = 'ZERO — Organic/landscaping item, excluded from A1-A3 assessment';
    }
    // Step 6: Quantifiable material → proceed to matching below

    // ================================================================
    // MATERIAL MATCHING — Only for Step 6 items (eccsZero = false)
    // ================================================================
    var bl, gwpSource, category, typeName, alternatives, iceRefUrl, matDB, efUnit, massFactor, unit, assumption;

    if (eccsZero) {
      // Steps 1-5: Carbon factor = 0, no material matching needed
      bl = 0;
      gwpSource = 'none';
      category = eccsCategory;
      typeName = eccsCategory;
      alternatives = [];
      iceRefUrl = '';
      assumption = eccsFlag;
      matDB = null;
      efUnit = '';
      massFactor = 1;
      unit = item.unit || 'nr';
    } else {
      // Step 6: Quantifiable material — do local re-matching
      var catHint = item.category || '';
      var unitHint = item.unit || '';
      var localMatch = lookupTenderGWP(desc, catHint, unitHint);

      if (localMatch.matched) {
        bl = localMatch.baseline;
        gwpSource = localMatch.gwpSource;
        category = localMatch.category;
        typeName = localMatch.typeName;
        alternatives = localMatch.alternatives || [];
        iceRefUrl = localMatch.iceRefUrl || '';
        assumption = localMatch.assumption || '';
        matDB = localMatch.mat;
        efUnit = matDB ? matDB.efUnit : (item.efUnit || '');
        massFactor = matDB ? matDB.massFactor : 1;
        unit = matDB ? matDB.unit : (item.materialUnit || item.unit);
      } else {
        bl = item.baselineEF || 0;
        gwpSource = item.gwpSource || 'none';
        category = item.category || 'Unmatched';
        typeName = item.type || desc;
        alternatives = [];
        iceRefUrl = '';
        assumption = item.assumption || '';

        if (gwpSource === 'A1-A3' && MATERIALS[category]) {
          MATERIALS[category].types.forEach(function(t, idx) {
            alternatives.push({ name: t.name, baseline: t.baseline, target: t.target, idx: idx });
          });
        } else if (gwpSource === 'ICE' && ICE_MATERIALS[category]) {
          var iceMat = ICE_MATERIALS[category];
          iceMat.types.forEach(function(t, idx) {
            var altBelow = iceMat.isMEP && t.coveragePct !== undefined && t.coveragePct < ICE_COVERAGE_THRESHOLD;
            alternatives.push({ name: t.name, baseline: altBelow ? 0 : t.baseline, target: altBelow ? 0 : t.target, idx: idx });
          });
          iceRefUrl = 'https://circularecology.com/embodied-carbon-footprint-database.html';
        } else if (MATERIALS[category]) {
          MATERIALS[category].types.forEach(function(t, idx) {
            alternatives.push({ name: t.name, baseline: t.baseline, target: t.target, idx: idx });
          });
        } else if (ICE_MATERIALS[category]) {
          var iceM = ICE_MATERIALS[category];
          iceM.types.forEach(function(t, idx) {
            alternatives.push({ name: t.name, baseline: t.baseline, target: t.target, idx: idx });
          });
        }

        matDB = MATERIALS[category] || ICE_MATERIALS[category];
        efUnit = item.efUnit || (matDB ? matDB.efUnit : '');
        massFactor = matDB ? matDB.massFactor : 1;
        unit = item.materialUnit || (matDB ? matDB.unit : item.unit);
      }
    }

    // --- Unit Conversion ---
    var boqQty = item.qty;
    var boqUnit = item.unit || '';
    var materialUnit = unit;

    // For ECCS zero items (MEP, demolition, etc.) — keep qty as-is, no conversion
    if (eccsZero) {
      var convertedQty = boqQty;
      var conversionNote = eccsFlag;
      var conversionType = 'none';
      var thickness = null;
      var thicknessSource = null;
    } else {
      // CRITICAL FIX: If AI returned a garbage unit, try extracting from description
      var normalizedBoqUnit = normalizeUnitStr(boqUnit);
      if (!isRecognizedUnit(normalizedBoqUnit)) {
        var descUnit = extractUnitFromDescription(desc);
        if (descUnit) {
          boqUnit = descUnit;
        }
      }

      // Extract thickness: AI may provide thicknessMM, otherwise extract from description
      var thicknessObj = null;
      if (item.thicknessMM && item.thicknessMM > 0) {
        thicknessObj = { value: item.thicknessMM / 1000, raw: item.thicknessMM + 'mm', source: 'ai' };
      }
      if (!thicknessObj) {
        thicknessObj = extractThickness(desc);
      }
      var thickness = thicknessObj ? thicknessObj.value : null;
      var thicknessSource = thicknessObj ? thicknessObj.source : null;

      var conversion = convertBOQQuantity(boqQty, boqUnit, materialUnit, thickness, massFactor);
      var convertedQty = conversion.convertedQty;
      var conversionNote = conversion.conversionNote;
      var conversionType = conversion.conversionType;
    }

    var blEm = (convertedQty * bl) / 1000;

    if (gwpSource === 'A1-A3') a13Count++;
    else if (gwpSource === 'ICE') iceCount++;
    else unmatchedCount++;

    // Carry through lifecycle stage and confidence
    var lifecycleStage = eccsDemolition ? 'A5' : (item.lifecycleStage || 'A1-A3');
    var isDemolition = eccsDemolition;
    var isComplexMEP = eccsComplexMEP;
    var confidence = item.confidence || 'medium';
    // ECCS zero items get high confidence (we're certain they're zero)
    if (eccsZero) confidence = 'high';

    _tenderItems.push({
      id: Date.now() + Math.random(),
      boqItemNo: item.itemNo || '',
      originalDesc: desc,
      category: category,
      type: typeName,
      boqQty: boqQty,
      boqUnit: boqUnit,
      qty: convertedQty,
      unit: eccsZero ? (item.unit || 'nr') : materialUnit,
      efUnit: efUnit,
      massFactor: massFactor,
      thickness: thickness,
      thicknessSource: thicknessSource,
      convertedQty: convertedQty,
      conversionNote: conversionNote,
      conversionType: conversionType,
      needsConversion: !eccsZero && conversionType !== 'none',
      baselineEF: bl,
      targetEF: bl,
      baselineEmission: blEm,
      targetEmission: blEm,
      isCustom: gwpSource === 'none',
      gwpSource: eccsZero ? 'ECCS-Zero' : (gwpSource === 'none' ? 'Manual' : gwpSource),
      lifecycleStage: lifecycleStage,
      isDemolition: isDemolition,
      isComplexMEP: isComplexMEP,
      eccsZero: eccsZero,
      confidence: confidence,
      assumption: assumption,
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

  // Store result summary with confidence breakdown
  var totalItems = _tenderItems.length;
  var totalBL = 0;
  var highConf = 0, medConf = 0, lowConf = 0;
  _tenderItems.forEach(function(it) {
    totalBL += it.baselineEmission || 0;
    if (it.confidence === 'high') highConf++;
    else if (it.confidence === 'low') lowConf++;
    else medConf++;
  });

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
    aiParsed: true,
    highConf: highConf,
    medConf: medConf,
    lowConf: lowConf
  };

  navigate('tender_entry');

  setTimeout(function() {
    var boqCard = $('tenderBOQCard');
    if (boqCard) boqCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// Extract lines from PDF.js text content, reconstructing rows by Y-position
// Uses Y-tolerance grouping to handle sub-pixel alignment differences in PDF tables
function extractLinesFromTextContent(textContent) {
  if (!textContent || !textContent.items || !textContent.items.length) return [];

  // Collect all text items with coordinates
  var allItems = [];
  textContent.items.forEach(function(item) {
    if (!item.str || !item.str.trim()) return;
    allItems.push({
      x: item.transform[4],
      y: item.transform[5],
      text: item.str,
      width: item.width || (item.str.length * 5) // estimate width if not provided
    });
  });

  if (allItems.length === 0) return [];

  // Sort by Y descending (top of page first), then X ascending (left to right)
  allItems.sort(function(a, b) { return b.y - a.y || a.x - b.x; });

  // Group items into lines using Y-tolerance (items within 4 points = same row)
  var Y_TOLERANCE = 4;
  var lineGroups = [];
  var currentGroup = [allItems[0]];
  var currentY = allItems[0].y;

  for (var i = 1; i < allItems.length; i++) {
    if (Math.abs(allItems[i].y - currentY) <= Y_TOLERANCE) {
      currentGroup.push(allItems[i]);
    } else {
      currentGroup.sort(function(a, b) { return a.x - b.x; });
      lineGroups.push(currentGroup);
      currentGroup = [allItems[i]];
      currentY = allItems[i].y;
    }
  }
  if (currentGroup.length > 0) {
    currentGroup.sort(function(a, b) { return a.x - b.x; });
    lineGroups.push(currentGroup);
  }

  // Build text lines — use tab separators for large X-gaps (column boundaries)
  var lines = [];
  lineGroups.forEach(function(group) {
    var result = '';
    for (var j = 0; j < group.length; j++) {
      if (j > 0) {
        var prevEnd = group[j - 1].x + group[j - 1].width;
        var gap = group[j].x - prevEnd;
        // Large gap = column separator (tab), medium gap = spaces, small = direct join
        if (gap > 40) result += '\t';
        else if (gap > 8) result += '  ';
        else if (gap > 2) result += ' ';
      }
      result += group[j].text;
    }
    lines.push(result);
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

  // Re-convert from original BOQ qty/unit to new material unit
  var conversion = convertBOQQuantity(item.boqQty || item.qty, item.boqUnit || item.unit, mat.unit, item.thickness, mat.massFactor);

  item.category = catName;
  item.type = firstType.name;
  item.gwpSource = source;
  item.qty = conversion.convertedQty;
  item.unit = mat.unit;
  item.efUnit = mat.efUnit;
  item.massFactor = mat.massFactor;
  item.convertedQty = conversion.convertedQty;
  item.conversionNote = conversion.conversionNote;
  item.conversionType = conversion.conversionType;
  item.needsConversion = conversion.conversionType !== 'none';
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
  html += '<table><thead><tr><th>BOQ #</th><th>BOQ Description</th><th>Matched As</th><th class="r">BOQ Qty</th><th class="r">Calc Qty</th><th class="r">Baseline EF</th><th>EF Unit</th><th class="r">tCO\u2082eq</th><th>GWP Source</th><th>80%</th><th>Remarks</th></tr></thead><tbody>';

  _tenderItems.forEach(function(it) {
    var srcClass = it.gwpSource === 'A1-A3' ? 'badge-a13' : it.gwpSource === 'ICE' ? 'badge-ice' : 'badge-manual';
    var remarkText = '';
    if (it.conversionNote) remarkText = it.conversionNote;
    if (it.assumption) remarkText += (remarkText ? ' | ' : '') + it.assumption;
    if (it.gwpSource === 'ICE' && it.iceRefUrl) {
      remarkText += (remarkText ? ' | ' : '') + 'Ref: ICE Database v3.0 (circularecology.com)';
    }
    if (it.notes) remarkText += (remarkText ? ' | ' : '') + it.notes;

    var hasConv = it.needsConversion && it.conversionType && it.conversionType.indexOf('missing') === -1;

    html += '<tr>';
    html += '<td>' + esc(it.boqItemNo || '') + '</td>';
    html += '<td>' + esc(it.originalDesc || it.type) + '</td>';
    html += '<td>' + esc(it.type) + '</td>';
    html += '<td class="r mono">' + fmtI(it.boqQty != null ? it.boqQty : it.qty) + ' ' + esc(it.boqUnit || it.unit || '') + '</td>';
    html += '<td class="r mono">' + (hasConv ? fmt(it.qty) + ' ' + esc(it.unit || '') : '\u2014') + '</td>';
    html += '<td class="r mono">' + fmt(it.baselineEF) + '</td>';
    html += '<td>' + esc(it.efUnit || '') + '</td>';
    html += '<td class="r mono">' + fmt(it.baselineEmission) + '</td>';
    html += '<td><span class="' + srcClass + '">' + (it.gwpSource || 'Manual') + '</span></td>';
    html += '<td>' + (it._in80Pct ? '\u2713' : '') + '</td>';
    html += '<td class="remark">' + esc(remarkText) + '</td>';
    html += '</tr>';
  });

  if (_tenderItems.length > 1) {
    html += '<tr class="total-row"><td colspan="7">Total</td><td class="r mono">' + fmt(totals.baseline) + '</td><td colspan="3"></td></tr>';
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
  data.push(['BOQ #', 'BOQ Description', 'Category', 'Matched Type', 'BOQ Qty', 'BOQ Unit', 'Calc Qty', 'Calc Unit', 'Conversion', 'EF Unit', 'Baseline EF', 'Baseline tCO\u2082eq', 'GWP Source', 'In 80%', 'Assumption / Remarks', 'Reference']);

  // Data rows
  _tenderItems.forEach(function(it) {
    var remarkText = it.assumption || '';
    if (it.notes) remarkText += (remarkText ? ' | ' : '') + it.notes;
    var refLink = '';
    if (it.gwpSource === 'ICE' && it.iceRefUrl) {
      refLink = it.iceRefUrl;
    }
    var hasConv = it.needsConversion && it.conversionType && it.conversionType.indexOf('missing') === -1;

    data.push([
      it.boqItemNo || '',
      it.originalDesc || it.type,
      it.category,
      it.type,
      it.boqQty != null ? it.boqQty : it.qty,
      it.boqUnit || it.unit || '',
      hasConv ? it.qty : '',
      hasConv ? (it.unit || '') : '',
      it.conversionNote || '',
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
  data.push(['', '', '', 'TOTAL', '', '', '', '', '', '', '', totals.baseline, '', '', '', '']);

  // Create workbook and worksheet
  var ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 8 },   // BOQ #
    { wch: 35 },  // Description
    { wch: 14 },  // Category
    { wch: 25 },  // Matched Type
    { wch: 12 },  // BOQ Qty
    { wch: 8 },   // BOQ Unit
    { wch: 12 },  // Calc Qty
    { wch: 8 },   // Calc Unit
    { wch: 35 },  // Conversion
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
