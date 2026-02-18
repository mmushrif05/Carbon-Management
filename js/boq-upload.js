// ===== BOQ UPLOAD MODULE =====
// Upload Excel (.xlsx/.xls) or CSV Bill of Quantities
// Auto-match rows to ICE database materials, preview, then create entries or tender items

let _boqParsedRows = [];   // raw parsed rows from file
let _boqMatchedRows = [];  // matched/mapped rows ready for submission
let _boqFileName = '';

// ===== RENDER PAGE =====
function renderBOQUpload(el) {
  const isContractor = state.role === 'contractor';
  const yr = new Date().getFullYear();
  const mo = String(new Date().getMonth() + 1).padStart(2, '0');

  el.innerHTML = `
  <div class="card">
    <div class="card-title">Upload Bill of Quantities</div>
    <div style="padding:14px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:10px;margin-bottom:16px;font-size:13px;color:var(--slate4);line-height:1.8">
      <strong style="color:var(--blue)">How it works:</strong><br>
      1. Upload your BOQ as <strong>Excel (.xlsx / .xls)</strong> or <strong>CSV</strong> file<br>
      2. The system reads your file and auto-matches materials to the <strong>ICE Database</strong><br>
      3. Review the matched rows, fix any unmatched items, adjust quantities<br>
      4. Choose to create <strong>A1-A3 entries</strong> (for submission) or a <strong>Tender scenario</strong><br><br>
      <strong style="color:var(--green)">Expected columns:</strong> The system will look for columns like:
      <code style="background:var(--bg3);padding:2px 6px;border-radius:4px">Description</code>,
      <code style="background:var(--bg3);padding:2px 6px;border-radius:4px">Material</code>,
      <code style="background:var(--bg3);padding:2px 6px;border-radius:4px">Quantity</code>,
      <code style="background:var(--bg3);padding:2px 6px;border-radius:4px">Unit</code>,
      <code style="background:var(--bg3);padding:2px 6px;border-radius:4px">BOQ Item</code>,
      <code style="background:var(--bg3);padding:2px 6px;border-radius:4px">Category</code><br>
      Column names are flexible \u2014 the system uses fuzzy matching. Any layout works.
    </div>

    <!-- Upload Area -->
    <div id="boqDropZone" style="border:2px dashed rgba(52,211,153,0.3);border-radius:14px;padding:40px 20px;text-align:center;cursor:pointer;transition:all 0.2s;background:rgba(52,211,153,0.02)"
      onclick="document.getElementById('boqFileInput').click()"
      ondragover="event.preventDefault();this.style.borderColor='var(--green)';this.style.background='rgba(52,211,153,0.06)'"
      ondragleave="this.style.borderColor='rgba(52,211,153,0.3)';this.style.background='rgba(52,211,153,0.02)'"
      ondrop="event.preventDefault();this.style.borderColor='rgba(52,211,153,0.3)';this.style.background='rgba(52,211,153,0.02)';handleBOQDrop(event)">
      <div style="font-size:36px;opacity:0.4;margin-bottom:8px">\ud83d\udcc2</div>
      <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px">Drop Excel or CSV file here</div>
      <div style="font-size:12px;color:var(--slate5)">or click to browse &bull; .xlsx, .xls, .csv supported</div>
      <div id="boqFileInfo" style="margin-top:12px;font-size:12px;color:var(--green);font-weight:600;display:none"></div>
    </div>
    <input type="file" id="boqFileInput" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleBOQFile(this.files[0])">

    <!-- Sheet selector (for multi-sheet workbooks) -->
    <div id="boqSheetSelector" style="display:none;margin-top:12px">
      <div class="form-row c3">
        <div class="fg"><label>Select Sheet</label><select id="boqSheetSelect" onchange="onBOQSheetChange()"></select></div>
        <div class="fg"><label>Header Row</label><select id="boqHeaderRow"><option value="0">Row 1 (default)</option><option value="1">Row 2</option><option value="2">Row 3</option><option value="3">Row 4</option><option value="4">Row 5</option></select></div>
        <div class="fg" style="display:flex;align-items:flex-end"><button class="btn btn-primary" onclick="processBOQSheet()">Process Sheet</button></div>
      </div>
    </div>

    <div id="boqParseMsg" style="margin-top:12px"></div>
  </div>

  <!-- Column Mapping (shown after file parsed) -->
  <div id="boqColumnMap" style="display:none"></div>

  <!-- Preview Table (shown after mapping) -->
  <div id="boqPreview" style="display:none"></div>

  <!-- Import Options (shown after preview) -->
  <div id="boqImportOptions" style="display:none"></div>

  <!-- Download Template -->
  <div class="card">
    <div class="card-title">Download Template</div>
    <div style="font-size:13px;color:var(--slate5);margin-bottom:12px">
      Need a starting point? Download a BOQ template pre-formatted for the ICE database.
    </div>
    <div class="btn-row">
      <button class="btn btn-secondary" onclick="downloadBOQTemplate()">Download CSV Template</button>
      <button class="btn btn-secondary" onclick="downloadBOQTemplateFull()">Download Full ICE Database CSV</button>
    </div>
  </div>`;
}

// ===== FILE HANDLING =====
function handleBOQDrop(event) {
  const file = event.dataTransfer.files[0];
  if (file) handleBOQFile(file);
}

let _boqWorkbook = null; // store workbook for sheet switching

function handleBOQFile(file) {
  if (!file) return;
  _boqFileName = file.name;
  const ext = file.name.split('.').pop().toLowerCase();

  const info = $('boqFileInfo');
  if (info) { info.style.display = ''; info.textContent = 'Loading: ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)'; }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      if (ext === 'csv') {
        // Parse CSV directly
        const text = e.target.result;
        const rows = parseCSV(text);
        _boqParsedRows = rows;
        _boqWorkbook = null;
        $('boqSheetSelector').style.display = 'none';
        if (info) info.textContent = file.name + ' \u2014 ' + (rows.length - 1) + ' data rows loaded';
        autoMapColumns(rows);
      } else {
        // Parse Excel with SheetJS
        if (typeof XLSX === 'undefined') {
          showBOQError('SheetJS library not loaded. Please check your internet connection and refresh.');
          return;
        }
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        _boqWorkbook = wb;

        // Show sheet selector
        const sheetSel = $('boqSheetSelect');
        sheetSel.innerHTML = wb.SheetNames.map(function(name, i) {
          return '<option value="' + i + '">' + name + '</option>';
        }).join('');
        $('boqSheetSelector').style.display = '';

        // Auto-process first sheet
        processBOQSheet();

        if (info) info.textContent = file.name + ' \u2014 ' + wb.SheetNames.length + ' sheet(s) found';
      }
    } catch (err) {
      showBOQError('Failed to parse file: ' + err.message);
    }
  };

  if (ext === 'csv') {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

function onBOQSheetChange() {
  // Just let user pick, then click "Process Sheet"
}

function processBOQSheet() {
  if (!_boqWorkbook) return;
  const sheetIdx = parseInt($('boqSheetSelect').value) || 0;
  const headerRowIdx = parseInt($('boqHeaderRow').value) || 0;
  const sheet = _boqWorkbook.Sheets[_boqWorkbook.SheetNames[sheetIdx]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (jsonData.length <= headerRowIdx) {
    showBOQError('Sheet is empty or header row is beyond data.');
    return;
  }

  // Rebuild as array with header row as first element
  const rows = jsonData.slice(headerRowIdx);
  _boqParsedRows = rows;

  const info = $('boqFileInfo');
  if (info) info.textContent = _boqFileName + ' \u2014 Sheet: ' + _boqWorkbook.SheetNames[sheetIdx] + ' \u2014 ' + (rows.length - 1) + ' data rows';

  autoMapColumns(rows);
}

// ===== CSV PARSER =====
function parseCSV(text) {
  const rows = [];
  let current = [];
  let cell = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { current.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        current.push(cell.trim()); cell = '';
        if (current.some(function(c) { return c !== ''; })) rows.push(current);
        current = [];
        if (ch === '\r') i++;
      } else { cell += ch; }
    }
  }
  current.push(cell.trim());
  if (current.some(function(c) { return c !== ''; })) rows.push(current);
  return rows;
}

// ===== COLUMN AUTO-MAPPING =====
function autoMapColumns(rows) {
  if (rows.length < 2) { showBOQError('File has no data rows (need at least a header + 1 data row).'); return; }

  const headers = rows[0].map(function(h) { return String(h).toLowerCase().trim(); });

  // Fuzzy column detection
  const descCol = findColumn(headers, ['description', 'desc', 'item description', 'material description', 'boq item', 'item', 'material', 'name', 'element', 'component', 'spec', 'specification']);
  const qtyCol = findColumn(headers, ['quantity', 'qty', 'amount', 'vol', 'volume', 'weight', 'mass', 'total qty', 'boq qty', 'total quantity']);
  const unitCol = findColumn(headers, ['unit', 'uom', 'unit of measure', 'units', 'measure']);
  const catCol = findColumn(headers, ['category', 'cat', 'material category', 'group', 'material group', 'type', 'material type', 'class']);
  const efCol = findColumn(headers, ['ef', 'emission factor', 'carbon factor', 'gwp', 'co2', 'kgco2', 'embodied carbon', 'a1-a3', 'a1a3', 'epd']);
  const notesCol = findColumn(headers, ['notes', 'remarks', 'comment', 'comments', 'reference', 'ref', 'epd ref', 'source']);

  // Show column mapping UI
  const mapEl = $('boqColumnMap');
  mapEl.style.display = '';
  mapEl.innerHTML = '<div class="card"><div class="card-title">Column Mapping</div>' +
    '<div style="padding:10px 14px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;margin-bottom:14px;font-size:12px;color:var(--green)">Auto-detected columns from your file. Adjust if needed.</div>' +
    '<div class="form-row c3">' +
    buildColSelect('boqMapDesc', 'Description / Material *', headers, descCol) +
    buildColSelect('boqMapQty', 'Quantity *', headers, qtyCol) +
    buildColSelect('boqMapUnit', 'Unit', headers, unitCol) +
    '</div><div class="form-row c3">' +
    buildColSelect('boqMapCat', 'Category (optional)', headers, catCol) +
    buildColSelect('boqMapEF', 'Emission Factor (optional)', headers, efCol) +
    buildColSelect('boqMapNotes', 'Notes (optional)', headers, notesCol) +
    '</div>' +
    '<div class="btn-row"><button class="btn btn-primary" onclick="matchBOQRows()">Match to ICE Database</button></div>' +
    '<div id="boqMapMsg" style="margin-top:12px"></div>' +
    '</div>';
}

function findColumn(headers, keywords) {
  for (var k = 0; k < keywords.length; k++) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] === keywords[k]) return i;
    }
  }
  // Partial match
  for (var k = 0; k < keywords.length; k++) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].indexOf(keywords[k]) !== -1) return i;
    }
  }
  return -1;
}

function buildColSelect(id, label, headers, autoIdx) {
  var opts = '<option value="-1">\u2014 Not mapped</option>';
  for (var i = 0; i < headers.length; i++) {
    var sel = i === autoIdx ? ' selected' : '';
    opts += '<option value="' + i + '"' + sel + '>' + (headers[i] || 'Column ' + (i + 1)) + '</option>';
  }
  return '<div class="fg"><label>' + label + '</label><select id="' + id + '">' + opts + '</select></div>';
}

// ===== MATERIAL MATCHING =====
function matchBOQRows() {
  var descIdx = parseInt($('boqMapDesc').value);
  var qtyIdx = parseInt($('boqMapQty').value);
  var unitIdx = parseInt($('boqMapUnit').value);
  var catIdx = parseInt($('boqMapCat').value);
  var efIdx = parseInt($('boqMapEF').value);
  var notesIdx = parseInt($('boqMapNotes').value);

  if (descIdx < 0 || qtyIdx < 0) {
    showBOQError('Please map at least Description and Quantity columns.');
    return;
  }

  var dataRows = _boqParsedRows.slice(1); // skip header
  _boqMatchedRows = [];

  for (var r = 0; r < dataRows.length; r++) {
    var row = dataRows[r];
    var desc = String(row[descIdx] || '').trim();
    var qty = parseFloat(row[qtyIdx]);
    var unit = unitIdx >= 0 ? String(row[unitIdx] || '').trim() : '';
    var catHint = catIdx >= 0 ? String(row[catIdx] || '').trim() : '';
    var efValue = efIdx >= 0 ? parseFloat(row[efIdx]) : NaN;
    var notes = notesIdx >= 0 ? String(row[notesIdx] || '').trim() : '';

    if (!desc || isNaN(qty) || qty <= 0) continue; // skip empty/invalid rows

    // Try to match to ICE database
    var match = matchToICE(desc, catHint, unit);

    _boqMatchedRows.push({
      rowNum: r + 2, // 1-indexed + header
      description: desc,
      qty: qty,
      unit: unit || (match.mat ? match.mat.unit : ''),
      category: match.category || '',
      typeName: match.typeName || '',
      typeIdx: match.typeIdx,
      matched: match.matched,
      matchScore: match.score,
      baseline: match.baseline || 0,
      target: match.target || 0,
      actual: !isNaN(efValue) ? efValue : 0,
      isMEP: match.isMEP || false,
      belowThreshold: match.belowThreshold || false,
      coveragePct: match.coveragePct || 100,
      notes: notes
    });
  }

  renderBOQPreview();
}

function matchToICE(description, categoryHint, unitHint) {
  var desc = description.toLowerCase();
  var bestMatch = { matched: false, score: 0, category: '', typeName: '', typeIdx: -1, baseline: 0, target: 0, mat: null, isMEP: false, belowThreshold: false, coveragePct: 100 };

  // Build search index
  var candidates = [];
  Object.entries(MATERIALS).forEach(function(entry) {
    var cat = entry[0];
    var mat = entry[1];
    mat.types.forEach(function(t, idx) {
      candidates.push({ cat: cat, mat: mat, type: t, idx: idx, search: (cat + ' ' + t.name).toLowerCase() });
    });
  });

  // Score each candidate
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var score = 0;

    // Exact match on type name
    if (desc === c.type.name.toLowerCase()) { score = 100; }
    // Category hint exact match
    else if (categoryHint && categoryHint.toLowerCase() === c.cat.toLowerCase()) { score += 30; }

    // Keyword matching
    var keywords = c.search.split(/[\s\-\/\(\),]+/).filter(function(w) { return w.length > 2; });
    for (var k = 0; k < keywords.length; k++) {
      if (desc.indexOf(keywords[k]) !== -1) score += 8;
    }

    // Unit match bonus
    if (unitHint && unitHint.toLowerCase() === c.mat.unit.toLowerCase()) score += 5;

    // Specific pattern matches
    // Concrete grades
    if (/c\d{1,2}[\s\/-]\d{1,2}/.test(desc) && c.cat === 'Concrete') {
      var gradeMatch = desc.match(/c(\d{1,2})[\s\/-](\d{1,2})/);
      if (gradeMatch && c.type.name.toLowerCase().indexOf('c' + gradeMatch[1]) !== -1) score += 40;
    }
    // Steel types
    if (desc.indexOf('rebar') !== -1 && c.type.name.toLowerCase().indexOf('rebar') !== -1) score += 35;
    if (desc.indexOf('i section') !== -1 && c.type.name.toLowerCase().indexOf('i/h section') !== -1) score += 35;
    if (desc.indexOf('structural steel') !== -1 && c.type.name.toLowerCase().indexOf('structural') !== -1 && c.cat === 'Steel') score += 35;
    // Pipes
    if (/\d{3,4}\s*mm/.test(desc) && c.cat === 'Pipes') {
      var pipeSize = desc.match(/(\d{3,4})\s*mm/);
      if (pipeSize && c.type.name.indexOf(pipeSize[1] + 'mm') !== -1) score += 30;
    }
    // Asphalt binder
    if (/\d+\.?\d*\s*%\s*binder/.test(desc) && c.cat === 'Asphalt') score += 20;
    // MEP keywords
    if ((desc.indexOf('ahu') !== -1 || desc.indexOf('air handling') !== -1) && c.type.name.toLowerCase().indexOf('ahu') !== -1) score += 40;
    if (desc.indexOf('chiller') !== -1 && c.type.name.toLowerCase().indexOf('chiller') !== -1) score += 40;
    if (desc.indexOf('cable') !== -1 && c.type.name.toLowerCase().indexOf('cable') !== -1) score += 25;
    if (desc.indexOf('duct') !== -1 && c.type.name.toLowerCase().indexOf('duct') !== -1) score += 25;
    if (desc.indexOf('transformer') !== -1 && c.type.name.toLowerCase().indexOf('transformer') !== -1) score += 40;
    if (desc.indexOf('pump') !== -1 && c.type.name.toLowerCase().indexOf('pump') !== -1) score += 25;

    if (score > bestMatch.score) {
      var belowThreshold = c.mat.isMEP && c.type.coveragePct !== undefined && c.type.coveragePct < MEP_COVERAGE_THRESHOLD;
      bestMatch = {
        matched: score >= 15,
        score: score,
        category: c.cat,
        typeName: c.type.name,
        typeIdx: c.idx,
        baseline: belowThreshold ? 0 : c.type.baseline,
        target: belowThreshold ? 0 : c.type.target,
        mat: c.mat,
        isMEP: !!c.mat.isMEP,
        belowThreshold: belowThreshold,
        coveragePct: c.type.coveragePct || 100
      };
    }
  }

  return bestMatch;
}

// ===== PREVIEW TABLE =====
function renderBOQPreview() {
  var matchedCount = _boqMatchedRows.filter(function(r) { return r.matched; }).length;
  var unmatchedCount = _boqMatchedRows.length - matchedCount;
  var mepZeroCount = _boqMatchedRows.filter(function(r) { return r.belowThreshold; }).length;

  var prevEl = $('boqPreview');
  prevEl.style.display = '';

  var html = '<div class="card"><div class="card-title">Matched Results (' + _boqMatchedRows.length + ' rows)</div>';
  html += '<div class="stats-row" style="margin-bottom:14px">' +
    '<div class="stat-card green"><div class="sc-label">Matched</div><div class="sc-value">' + matchedCount + '</div><div class="sc-sub">auto-matched to ICE</div></div>' +
    '<div class="stat-card orange"><div class="sc-label">Unmatched</div><div class="sc-value">' + unmatchedCount + '</div><div class="sc-sub">need manual selection</div></div>' +
    '<div class="stat-card ' + (mepZeroCount > 0 ? 'orange' : 'green') + '"><div class="sc-label">MEP (A1-A3=0)</div><div class="sc-value">' + mepZeroCount + '</div><div class="sc-sub">complex assemblies</div></div>' +
    '<div class="stat-card cyan"><div class="sc-label">Total Rows</div><div class="sc-value">' + _boqMatchedRows.length + '</div><div class="sc-sub">from BOQ file</div></div>' +
    '</div>';

  html += '<div class="tbl-wrap"><table><thead><tr><th>Row</th><th>BOQ Description</th><th class="r">Qty</th><th>Unit</th><th>Matched Category</th><th>Matched Type</th><th class="r">BL EF</th><th class="r">Target EF</th><th>Status</th><th>Action</th></tr></thead><tbody>';

  for (var i = 0; i < _boqMatchedRows.length; i++) {
    var r = _boqMatchedRows[i];
    var statusBadge = r.matched
      ? (r.belowThreshold
        ? '<span style="display:inline-block;background:rgba(239,68,68,0.1);color:var(--red);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">MEP A1-A3=0</span>'
        : '<span style="display:inline-block;background:rgba(52,211,153,0.1);color:var(--green);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">Matched (' + r.matchScore + ')</span>')
      : '<span style="display:inline-block;background:rgba(251,191,36,0.1);color:var(--yellow);font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600">Unmatched</span>';

    html += '<tr' + (!r.matched ? ' style="background:rgba(251,191,36,0.03)"' : r.belowThreshold ? ' style="background:rgba(239,68,68,0.03)"' : '') + '>' +
      '<td style="color:var(--slate5);font-size:11px">' + r.rowNum + '</td>' +
      '<td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escAttr(r.description) + '">' + esc(r.description) + '</td>' +
      '<td class="r mono">' + fmtI(r.qty) + '</td>' +
      '<td>' + esc(r.unit) + '</td>' +
      '<td style="font-weight:600;color:' + (r.matched ? 'var(--text)' : 'var(--yellow)') + '">' + (r.category || '\u2014') + '</td>' +
      '<td style="font-size:11px">' + (r.typeName || '\u2014') + '</td>' +
      '<td class="r mono">' + (r.baseline || '\u2014') + '</td>' +
      '<td class="r mono" style="color:var(--green)">' + (r.target || '\u2014') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td><button class="btn btn-secondary btn-sm" onclick="editBOQRow(' + i + ')">Edit</button>' +
      ' <button class="btn btn-danger btn-sm" onclick="removeBOQRow(' + i + ')">\u2715</button></td>' +
      '</tr>';
  }
  html += '</tbody></table></div></div>';

  prevEl.innerHTML = html;

  // Show import options
  renderBOQImportOptions();
}

function escAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// ===== EDIT ROW =====
function editBOQRow(idx) {
  var r = _boqMatchedRows[idx];
  var groups = getMaterialGroups();

  // Build category+type selection overlay
  var catOptions = '<option value="">Select category...</option>';
  Object.entries(groups).forEach(function(entry) {
    var grp = entry[0];
    var cats = entry[1];
    catOptions += '<optgroup label="' + grp + '">';
    cats.forEach(function(c) { catOptions += '<option value="' + c + '"' + (c === r.category ? ' selected' : '') + '>' + c + '</option>'; });
    catOptions += '</optgroup>';
  });

  var typeOptions = '<option value="">Select type...</option>';
  if (r.category && MATERIALS[r.category]) {
    MATERIALS[r.category].types.forEach(function(t, i) {
      var covTag = (MATERIALS[r.category].isMEP && t.coveragePct !== undefined && t.coveragePct < MEP_COVERAGE_THRESHOLD) ? ' [A1-A3=0]' : '';
      typeOptions += '<option value="' + i + '"' + (t.name === r.typeName ? ' selected' : '') + '>' + t.name + covTag + '</option>';
    });
  }

  var overlay = document.createElement('div');
  overlay.id = 'boqEditOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div style="max-width:560px;width:100%"><div class="card">' +
    '<div class="card-title">Edit Row ' + r.rowNum + ': ' + esc(r.description.substring(0, 60)) + '</div>' +
    '<div class="form-row c2">' +
    '<div class="fg"><label>Category</label><select id="boqEditCat" onchange="onBOQEditCat()">' + catOptions + '</select></div>' +
    '<div class="fg"><label>Type</label><select id="boqEditType">' + typeOptions + '</select></div>' +
    '</div>' +
    '<div class="form-row c2">' +
    '<div class="fg"><label>Quantity</label><input type="number" id="boqEditQty" value="' + r.qty + '"></div>' +
    '<div class="fg"><label>Unit</label><input id="boqEditUnit" value="' + esc(r.unit) + '"></div>' +
    '</div>' +
    '<div class="form-row c2">' +
    '<div class="fg"><label>Actual EPD (optional)</label><input type="number" id="boqEditActual" value="' + (r.actual || '') + '" step="0.01"></div>' +
    '<div class="fg"><label>Notes</label><input id="boqEditNotes" value="' + escAttr(r.notes) + '"></div>' +
    '</div>' +
    '<div class="btn-row"><button class="btn btn-primary" onclick="saveBOQEdit(' + idx + ')">Save</button>' +
    '<button class="btn btn-secondary" onclick="document.getElementById(\'boqEditOverlay\').remove()">Cancel</button></div>' +
    '</div></div>';

  document.body.appendChild(overlay);
}

// Refresh type dropdown when category changes in edit modal
function onBOQEditCat() {
  var cat = $('boqEditCat').value;
  var typeSel = $('boqEditType');
  typeSel.innerHTML = '<option value="">Select type...</option>';
  if (cat && MATERIALS[cat]) {
    MATERIALS[cat].types.forEach(function(t, i) {
      var m = MATERIALS[cat];
      var covTag = (m.isMEP && t.coveragePct !== undefined && t.coveragePct < MEP_COVERAGE_THRESHOLD) ? ' [A1-A3=0]' : '';
      typeSel.innerHTML += '<option value="' + i + '">' + t.name + covTag + '</option>';
    });
  }
}

function saveBOQEdit(idx) {
  var cat = $('boqEditCat').value;
  var typeIdx = parseInt($('boqEditType').value);
  var qty = parseFloat($('boqEditQty').value);
  var unit = $('boqEditUnit').value.trim();
  var actual = parseFloat($('boqEditActual').value);
  var notes = $('boqEditNotes').value.trim();

  var r = _boqMatchedRows[idx];
  r.qty = isNaN(qty) ? r.qty : qty;
  r.unit = unit || r.unit;
  r.actual = isNaN(actual) ? 0 : actual;
  r.notes = notes;

  if (cat && MATERIALS[cat] && !isNaN(typeIdx) && typeIdx >= 0) {
    var m = MATERIALS[cat];
    var t = m.types[typeIdx];
    var belowThreshold = m.isMEP && t.coveragePct !== undefined && t.coveragePct < MEP_COVERAGE_THRESHOLD;
    r.category = cat;
    r.typeName = t.name;
    r.typeIdx = typeIdx;
    r.matched = true;
    r.matchScore = 100;
    r.baseline = belowThreshold ? 0 : t.baseline;
    r.target = belowThreshold ? 0 : t.target;
    r.isMEP = !!m.isMEP;
    r.belowThreshold = belowThreshold;
    r.coveragePct = t.coveragePct || 100;
  }

  var overlay = $('boqEditOverlay');
  if (overlay) overlay.remove();
  renderBOQPreview();
}

function removeBOQRow(idx) {
  _boqMatchedRows.splice(idx, 1);
  renderBOQPreview();
}

// ===== IMPORT OPTIONS =====
function renderBOQImportOptions() {
  var matchedOnly = _boqMatchedRows.filter(function(r) { return r.matched; });
  var totalBL = 0, totalTG = 0;
  matchedOnly.forEach(function(r) {
    totalBL += (r.qty * r.baseline) / 1000;
    totalTG += (r.qty * r.target) / 1000;
  });
  var rP = totalBL > 0 ? ((totalBL - totalTG) / totalBL) * 100 : 0;

  var yr = new Date().getFullYear();
  var mo = String(new Date().getMonth() + 1).padStart(2, '0');

  var optEl = $('boqImportOptions');
  optEl.style.display = '';
  optEl.innerHTML = '<div class="card">' +
    '<div class="card-title">Import Options</div>' +
    '<div class="stats-row" style="margin-bottom:14px">' +
    '<div class="stat-card slate"><div class="sc-label">Projected Baseline</div><div class="sc-value">' + fmt(totalBL) + '</div><div class="sc-sub">tCO\u2082eq</div></div>' +
    '<div class="stat-card green"><div class="sc-label">Projected Target</div><div class="sc-value">' + fmt(totalTG) + '</div><div class="sc-sub">tCO\u2082eq</div></div>' +
    '<div class="stat-card ' + (rP > 20 ? 'green' : rP >= 10 ? 'orange' : 'purple') + '"><div class="sc-label">Reduction</div><div class="sc-value">' + fmt(rP) + '%</div><div class="sc-sub">' + fmt(totalBL - totalTG) + ' saved</div></div>' +
    '<div class="stat-card blue"><div class="sc-label">Matched Items</div><div class="sc-value">' + matchedOnly.length + '</div><div class="sc-sub">of ' + _boqMatchedRows.length + ' rows</div></div>' +
    '</div>' +

    '<div style="padding:10px 14px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:10px;margin-bottom:14px;font-size:12px;color:var(--yellow)">' +
    'Only <strong>matched</strong> rows (' + matchedOnly.length + ') will be imported. Unmatched rows (' + (_boqMatchedRows.length - matchedOnly.length) + ') are skipped \u2014 edit them above to assign a material.' +
    '</div>' +

    '<div class="form-row c3">' +
    '<div class="fg"><label>Year</label><select id="boqYear">' + [yr - 1, yr, yr + 1].map(function(y) { return '<option' + (y === yr ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label>Month</label><select id="boqMonth">' + MONTHS.map(function(m, i) { var v = String(i + 1).padStart(2, '0'); return '<option value="' + v + '"' + (v === mo ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label>Contract / Zone</label><input id="boqContract" placeholder="e.g. PA Apron Phase 0"></div>' +
    '</div>' +

    '<div class="btn-row">' +
    '<button class="btn btn-primary" onclick="importBOQAsEntries()">Import as A1-A3 Entries (' + matchedOnly.length + ' items)</button>' +
    '<button class="btn btn-secondary" onclick="importBOQAsTender()">Create Tender Scenario</button>' +
    '</div>' +
    '<div id="boqImportMsg" style="margin-top:12px"></div>' +
    '</div>';
}

// ===== IMPORT AS ENTRIES =====
async function importBOQAsEntries() {
  var matched = _boqMatchedRows.filter(function(r) { return r.matched; });
  if (matched.length === 0) { showBOQMsg('boqImportMsg', 'No matched rows to import. Edit unmatched rows first.', 'red'); return; }
  if (!confirm('Import ' + matched.length + ' entries from BOQ? This will add them to your ' + (state.role === 'contractor' ? 'batch queue' : 'entries') + '.')) return;

  var yr = $('boqYear').value;
  var mo = $('boqMonth').value;
  var contract = $('boqContract').value.trim();
  var isContractor = state.role === 'contractor';
  var count = 0;

  for (var i = 0; i < matched.length; i++) {
    var r = matched[i];
    var m = MATERIALS[r.category];
    if (!m) continue;

    var q = r.qty;
    var mass = q * m.massFactor;
    var bl = r.belowThreshold ? 0 : r.baseline;
    var tg = r.belowThreshold ? 0 : r.target;
    var act = r.belowThreshold ? 0 : (r.actual || tg || bl);
    var b = (q * bl) / 1000;
    var ac = (q * act) / 1000;
    var a4 = 0; // no transport data from BOQ

    var entry = {
      id: Date.now() + i,
      category: r.category,
      type: r.typeName,
      qty: q,
      unit: r.unit || m.unit,
      actual: act,
      baseline: bl,
      target: tg,
      road: 0, sea: 0, train: 0,
      a13B: b, a13A: ac, a4: a4, a14: ac + a4,
      pct: b > 0 ? ((b - ac) / b) * 100 : 0,
      year: yr, month: mo,
      monthKey: yr + '-' + mo,
      monthLabel: MONTHS[parseInt(mo) - 1] + ' ' + yr,
      district: 'A',
      contract: contract,
      notes: (r.notes ? r.notes + ' | ' : '') + 'BOQ Upload: ' + r.description + (r.belowThreshold ? ' [MEP Complex Assembly - Coverage: ' + r.coveragePct + '% - A1-A3 = 0]' : ''),
      isMEP: r.isMEP,
      coveragePct: r.coveragePct,
      mepBelowThreshold: r.belowThreshold,
      addedAt: new Date().toISOString()
    };

    if (isContractor) {
      DB.addDraftEntry(entry);
    } else {
      entry.status = 'pending';
      entry.submittedBy = state.name;
      entry.role = state.role;
      entry.submittedAt = new Date().toISOString();
      await DB.saveEntry(entry);
      state.entries.push(entry);
    }
    count++;
  }

  if (isContractor) buildSidebar();

  showBOQMsg('boqImportMsg',
    count + ' entries imported from BOQ' +
    (isContractor ? ' into batch queue. Go to A1-A3 Materials to review and submit.' : ' and submitted.'),
    'green'
  );
}

// ===== IMPORT AS TENDER =====
function importBOQAsTender() {
  var matched = _boqMatchedRows.filter(function(r) { return r.matched; });
  if (matched.length === 0) { showBOQMsg('boqImportMsg', 'No matched rows to import.', 'red'); return; }

  var scenarioName = _boqFileName ? _boqFileName.replace(/\.[^.]+$/, '') : 'BOQ Upload';

  // Build tender items
  var items = [];
  var totalBL = 0, totalTG = 0;
  for (var i = 0; i < matched.length; i++) {
    var r = matched[i];
    var m = MATERIALS[r.category];
    if (!m) continue;

    var bl = r.belowThreshold ? 0 : r.baseline;
    var tg = r.belowThreshold ? 0 : r.target;
    var blEm = (r.qty * bl) / 1000;
    var tgEm = (r.qty * tg) / 1000;
    totalBL += blEm;
    totalTG += tgEm;

    items.push({
      id: Date.now() + i,
      category: r.category,
      type: r.typeName,
      qty: r.qty,
      unit: r.unit || m.unit,
      efUnit: m.efUnit,
      massFactor: m.massFactor,
      baselineEF: bl,
      targetEF: tg,
      baselineEmission: blEm,
      targetEmission: tgEm,
      isCustom: false,
      notes: r.description + (r.notes ? ' | ' + r.notes : '')
    });
  }

  // Create the tender scenario and navigate
  _tenderEdit = {
    id: Date.now(),
    name: scenarioName,
    description: 'Imported from BOQ: ' + _boqFileName,
    status: 'draft',
    items: items,
    totalBaseline: totalBL,
    totalTarget: totalTG,
    reductionPct: totalBL > 0 ? ((totalBL - totalTG) / totalBL) * 100 : 0,
    createdBy: state.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  _tenderItems = items;
  navigate('tender_entry');
}

// ===== TEMPLATE DOWNLOAD =====
function downloadBOQTemplate() {
  var rows = [['Category', 'Type', 'Description', 'Quantity', 'Unit', 'Emission Factor (optional)', 'Notes']];
  rows.push(['Concrete', 'C30-40', 'Foundation concrete C30/40', '500', 'm\u00b3', '', '']);
  rows.push(['Steel', 'Rebar (Reinforcing Bar)', 'Rebar for RC foundations', '25000', 'kg', '', '']);
  rows.push(['Asphalt', '5% Binder', 'Road surface asphalt', '200', 'tons', '', '']);
  rows.push(['MEP - Electrical', 'Copper Cable (PVC Insulated)', 'Power cables LV', '5000', 'kg', '', '']);
  rows.push(['MEP - HVAC', 'AHU (Air Handling Unit)', 'Central AHU plant room', '3000', 'kg', '', 'Complex assembly - A1-A3 will be zero']);
  rows.push(['Timber', 'CLT (Cross Laminated Timber)', 'CLT panels for upper floors', '100', 'm\u00b3', '', '']);

  downloadCSVContent(rows, 'CarbonTrack_BOQ_Template.csv');
}

function downloadBOQTemplateFull() {
  var rows = [['Category', 'Type', 'Baseline EF', 'Target EF', 'Unit', 'EF Unit', 'Group', 'MEP Coverage %']];
  Object.entries(MATERIALS).forEach(function(entry) {
    var cat = entry[0];
    var m = entry[1];
    m.types.forEach(function(t) {
      rows.push([cat, t.name, t.baseline, t.target, m.unit, m.efUnit, m.group || '', t.coveragePct || '']);
    });
  });
  downloadCSVContent(rows, 'CarbonTrack_Full_ICE_Database.csv');
}

function downloadCSVContent(rows, filename) {
  var csv = rows.map(function(row) {
    return row.map(function(cell) {
      var str = String(cell);
      return str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1
        ? '"' + str.replace(/"/g, '""') + '"' : str;
    }).join(',');
  }).join('\n');

  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ===== HELPERS =====
function showBOQError(msg) {
  var el = $('boqParseMsg');
  if (el) el.innerHTML = '<div style="padding:10px 14px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;color:var(--red);font-size:13px">' + msg + '</div>';
}

function showBOQMsg(elId, msg, color) {
  var el = $(elId);
  if (el) el.innerHTML = '<div style="padding:10px 14px;background:rgba(' + (color === 'green' ? '52,211,153' : color === 'red' ? '239,68,68' : '251,191,36') + ',0.1);border-radius:10px;color:var(--' + color + ');font-size:13px;font-weight:600">' + msg + '</div>';
}
