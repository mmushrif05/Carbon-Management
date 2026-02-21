// ===== DOCUMENT INTELLIGENCE MODULE =====
// Upload, RAG retrieval, progressive AI analysis with citations

// ===== STATE =====
var _intelTab = 'documents'; // 'documents' | 'analyze' | 'history'
var _intelUploading = false;
var _intelAnalyzing = false;
var _analysisResults = {};    // { dimension: result }
var _analysisDimensions = [
  { id: 'material_compliance', label: 'Material Compliance', icon: '\u{1F9F1}', desc: 'Check materials against baselines and specs' },
  { id: 'reduction_opportunities', label: 'Reduction Opportunities', icon: '\u{1F4C9}', desc: 'Find high-impact carbon reduction switches' },
  { id: 'cross_document_consistency', label: 'Cross-Document Consistency', icon: '\u{1F50D}', desc: 'Detect conflicts across documents' },
  { id: 'regulatory_gaps', label: 'Regulatory & Certification', icon: '\u{1F4DC}', desc: 'Identify compliance and certification gaps' },
  { id: 'recommendations', label: 'Actionable Recommendations', icon: '\u{2705}', desc: 'Prioritized next steps by role' }
];

// ===== RENDER INTELLIGENCE PAGE =====
function renderIntelligence(el) {
  var pid = state.selectedProjectId;
  var projects = state.projects || [];

  el.innerHTML =
    '<div class="intel-header">' +
      '<div class="intel-tabs">' +
        '<button class="intel-tab' + (_intelTab === 'documents' ? ' active' : '') + '" onclick="_intelTab=\'documents\';renderIntelligence($(\'pageBody\'))">Documents</button>' +
        '<button class="intel-tab' + (_intelTab === 'analyze' ? ' active' : '') + '" onclick="_intelTab=\'analyze\';renderIntelligence($(\'pageBody\'))">AI Analysis</button>' +
        '<button class="intel-tab' + (_intelTab === 'history' ? ' active' : '') + '" onclick="_intelTab=\'history\';renderIntelligence($(\'pageBody\'))">History</button>' +
      '</div>' +
      '<div class="intel-project-select">' +
        '<select id="intelProjectSelect" onchange="intelSelectProject(this.value)">' +
          '<option value="">-- Select Project --</option>' +
          projects.map(function(p) {
            return '<option value="' + p.id + '"' + (pid === p.id ? ' selected' : '') + '>' + (p.name || 'Unnamed') + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div id="intelContent"></div>';

  if (!pid) {
    $('intelContent').innerHTML = '<div class="empty"><div class="empty-icon">\u{1F4C2}</div>Select a project to manage documents and run AI analysis</div>';
    return;
  }

  if (_intelTab === 'documents') renderDocumentsTab();
  else if (_intelTab === 'analyze') renderAnalyzeTab();
  else if (_intelTab === 'history') renderHistoryTab();
}

function intelSelectProject(val) {
  state.selectedProjectId = val || null;
  _analysisResults = {};
  renderIntelligence($('pageBody'));
}

// ===== DOCUMENTS TAB =====
function renderDocumentsTab() {
  var container = $('intelContent');
  container.innerHTML =
    '<div class="card">' +
      '<div class="card-title">Upload Document</div>' +
      '<div class="intel-upload-area" id="intelUploadArea" ondragover="event.preventDefault();this.classList.add(\'dragover\')" ondragleave="this.classList.remove(\'dragover\')" ondrop="handleIntelDrop(event)">' +
        '<div class="intel-upload-icon">\u{1F4C4}</div>' +
        '<div class="intel-upload-text">Drag & drop PDF, Excel, or CSV files here</div>' +
        '<div class="intel-upload-sub">Or click to browse. Supports CIA, CEAP, Technical Reports, Material Submittals, BOQ Specs</div>' +
        '<input type="file" id="intelFileInput" accept=".pdf,.xlsx,.xls,.csv" onchange="handleIntelFileSelect(this)" style="display:none">' +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button class="btn btn-secondary btn-sm" onclick="$(\'intelFileInput\').click()">Browse Files</button>' +
          '<button class="btn btn-secondary btn-sm" onclick="downloadBOQTemplate()" style="border-color:rgba(96,165,250,0.3);color:var(--blue)">Download BOQ Template</button>' +
        '</div>' +
      '</div>' +
      '<div id="intelUploadStatus" style="display:none"></div>' +
      '<div class="intel-template-hint" style="margin-top:12px;padding:12px 14px;background:var(--bg3);border-radius:8px;border:1px solid var(--border2)">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">Contractor BOQ Format (minimum required)</div>' +
        '<div style="font-size:10px;color:var(--slate4);line-height:1.6">' +
          '<span style="color:var(--green);font-weight:700">4 columns only:</span> Item No, Description, Quantity, Unit<br>' +
          'The AI handles material classification, emission factor lookup (A1-A3 + ICE), unit conversion, and carbon calculation automatically.<br>' +
          '<span style="color:var(--slate5)">Tip: More detail in the description = better classification. Include material grade, thickness, and specs when possible.</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Document Library</div>' +
      '<div id="intelDocList"><div class="empty" style="padding:20px"><div style="font-size:11px;color:var(--slate5)">Loading documents...</div></div></div>' +
    '</div>';

  loadDocumentList();
}

async function loadDocumentList() {
  var pid = state.selectedProjectId;
  if (!pid) return;

  try {
    var res = await apiCall('/documents', {
      method: 'POST',
      body: JSON.stringify({ action: 'list', projectId: pid })
    });
    var data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error || 'Failed to load documents');

    state.documents = data.documents || [];
    renderDocList(state.documents);
  } catch (e) {
    $('intelDocList').innerHTML = '<div class="empty" style="padding:20px;color:var(--red)">' + e.message + '</div>';
  }
}

function renderDocList(docs) {
  var el = $('intelDocList');
  if (!docs || docs.length === 0) {
    el.innerHTML = '<div class="empty" style="padding:24px"><div class="empty-icon">\u{1F4C1}</div>No documents uploaded yet. Upload a document above to get started.</div>';
    return;
  }

  var docTypeIcons = {
    cia: '\u{1F30D}', ceap: '\u{1F4CB}', technical_report: '\u{1F4D0}',
    material_submittal: '\u{1F9F1}', boq_spec: '\u{1F4CA}',
    sustainability_report: '\u{1F33F}', other: '\u{1F4C4}'
  };

  el.innerHTML = '<div class="intel-doc-grid">' +
    docs.map(function(doc) {
      var icon = docTypeIcons[doc.docType] || '\u{1F4C4}';
      var date = doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '';
      var materialTags = (doc.allMaterials || []).slice(0, 4).map(function(m) {
        return '<span class="intel-tag intel-tag-material">' + m + '</span>';
      }).join('');
      var topicTags = (doc.allTopics || []).slice(0, 3).map(function(t) {
        return '<span class="intel-tag intel-tag-topic">' + t + '</span>';
      }).join('');
      var sizeStr = doc.totalChars ? (doc.totalChars > 10000 ? Math.round(doc.totalChars / 1000) + 'K chars' : doc.totalChars + ' chars') : '';

      return '<div class="intel-doc-card">' +
        '<div class="intel-doc-header">' +
          '<span class="intel-doc-icon">' + icon + '</span>' +
          '<div class="intel-doc-info">' +
            '<div class="intel-doc-name" title="' + (doc.fileName || '') + '">' + (doc.fileName || 'Unnamed') + '</div>' +
            '<div class="intel-doc-meta">' + (doc.docTypeLabel || doc.docType) + ' &middot; ' + doc.totalChunks + ' chunks &middot; ' + sizeStr + ' &middot; ' + date + '</div>' +
          '</div>' +
          '<button class="btn btn-danger btn-sm" onclick="deleteIntelDoc(\'' + doc.id + '\')" title="Delete">\u{2715}</button>' +
        '</div>' +
        '<div class="intel-doc-tags">' + materialTags + topicTags + '</div>' +
        (doc.description ? '<div class="intel-doc-desc">' + doc.description + '</div>' : '') +
      '</div>';
    }).join('') +
  '</div>';
}

// ===== FILE UPLOAD HANDLERS =====
function handleIntelDrop(event) {
  event.preventDefault();
  $('intelUploadArea').classList.remove('dragover');
  var files = event.dataTransfer.files;
  if (files.length > 0) processIntelFile(files[0]);
}

function handleIntelFileSelect(input) {
  if (input.files.length > 0) processIntelFile(input.files[0]);
}

async function processIntelFile(file) {
  if (_intelUploading) return;
  _intelUploading = true;

  var statusEl = $('intelUploadStatus');
  statusEl.style.display = 'block';

  function showStatus(msg, type) {
    statusEl.className = 'intel-status intel-status-' + type;
    statusEl.innerHTML = msg;
  }

  try {
    var ext = file.name.split('.').pop().toLowerCase();
    var text = '';

    // Extract text based on file type
    if (ext === 'pdf') {
      showStatus('Extracting text from PDF...', 'info');
      text = await extractPDFText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      showStatus('Parsing Excel file...', 'info');
      text = await extractExcelText(file);
    } else if (ext === 'csv') {
      showStatus('Reading CSV file...', 'info');
      text = await readFileAsText(file);
    } else {
      throw new Error('Unsupported file type: ' + ext);
    }

    if (!text || text.trim().length < 50) {
      throw new Error('Could not extract enough text from the document. Minimum 50 characters required.');
    }

    showStatus('Uploading and chunking document (' + Math.round(text.length / 1000) + 'K chars)...', 'info');

    var res = await apiCall('/documents', {
      method: 'POST',
      body: JSON.stringify({
        action: 'upload',
        text: text,
        fileName: file.name,
        projectId: state.selectedProjectId
      })
    });

    var data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    showStatus('Document uploaded successfully. Created ' + data.chunksCreated + ' chunks. Detected type: ' + (data.document.docTypeLabel || data.detectedType), 'success');

    // Refresh document list
    loadDocumentList();

  } catch (e) {
    showStatus('Upload failed: ' + e.message, 'error');
  } finally {
    _intelUploading = false;
  }
}

// ===== TEXT EXTRACTION =====
async function extractPDFText(file) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');
  var arrayBuffer = await file.arrayBuffer();
  var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  var pages = [];
  for (var i = 1; i <= pdf.numPages; i++) {
    var page = await pdf.getPage(i);
    var content = await page.getTextContent();
    var pageText = content.items.map(function(item) { return item.str; }).join(' ');
    pages.push('Page ' + i + '\n' + pageText);
  }
  return pages.join('\n\n');
}

async function extractExcelText(file) {
  if (typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');
  var arrayBuffer = await file.arrayBuffer();
  var wb = XLSX.read(arrayBuffer, { type: 'array' });
  var allText = [];
  wb.SheetNames.forEach(function(name) {
    var ws = wb.Sheets[name];
    var csv = XLSX.utils.sheet_to_csv(ws);
    allText.push('Sheet: ' + name + '\n' + csv);
  });
  return allText.join('\n\n');
}

function readFileAsText(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = function() { reject(new Error('Failed to read file')); };
    reader.readAsText(file);
  });
}

// ===== DELETE DOCUMENT =====
async function deleteIntelDoc(docId) {
  if (!confirm('Delete this document and all its chunks? This cannot be undone.')) return;
  try {
    await apiCall('/documents', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', projectId: state.selectedProjectId, docId: docId })
    });
    loadDocumentList();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

// ===== ANALYZE TAB =====
function renderAnalyzeTab() {
  var container = $('intelContent');
  var docs = state.documents || [];

  if (docs.length === 0) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">\u{1F4C4}</div>Upload documents first, then run AI analysis</div>';
    return;
  }

  // Stats bar
  var totalChunks = docs.reduce(function(s, d) { return s + (d.totalChunks || 0); }, 0);
  var totalChars = docs.reduce(function(s, d) { return s + (d.totalChars || 0); }, 0);
  var allMaterials = [];
  docs.forEach(function(d) { (d.allMaterials || []).forEach(function(m) { if (allMaterials.indexOf(m) === -1) allMaterials.push(m); }); });

  container.innerHTML =
    '<div class="stats-row" style="margin-bottom:16px">' +
      '<div class="stat-card blue"><div class="sc-label">Documents</div><div class="sc-value">' + docs.length + '</div></div>' +
      '<div class="stat-card green"><div class="sc-label">Chunks (RAG)</div><div class="sc-value">' + totalChunks + '</div></div>' +
      '<div class="stat-card purple"><div class="sc-label">Material Categories</div><div class="sc-value">' + allMaterials.length + '</div></div>' +
      '<div class="stat-card slate"><div class="sc-label">Total Content</div><div class="sc-value">' + Math.round(totalChars / 1000) + 'K</div><div class="sc-sub">characters indexed</div></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-title">Analysis Dimensions</div>' +
      '<div class="intel-dims">' +
        _analysisDimensions.map(function(dim) {
          var result = _analysisResults[dim.id];
          var status = result ? 'done' : (_intelAnalyzing === dim.id ? 'running' : 'ready');
          var statusBadge = status === 'done' ? '<span class="badge approved">Done</span>'
            : status === 'running' ? '<span class="badge review">Analyzing...</span>'
            : '<span class="badge pending">Ready</span>';
          var findingCount = result && result.findings ? result.findings.length : 0;

          return '<div class="intel-dim-card' + (status === 'done' ? ' intel-dim-done' : '') + '">' +
            '<div class="intel-dim-left">' +
              '<span class="intel-dim-icon">' + dim.icon + '</span>' +
              '<div>' +
                '<div class="intel-dim-name">' + dim.label + '</div>' +
                '<div class="intel-dim-desc">' + dim.desc + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="intel-dim-right">' +
              statusBadge +
              (findingCount > 0 ? '<span style="font-size:10px;color:var(--slate4);margin-left:6px">' + findingCount + ' findings</span>' : '') +
              (status === 'ready' ? '<button class="btn btn-primary btn-sm" onclick="runDimensionAnalysis(\'' + dim.id + '\')" style="margin-left:8px">Analyze</button>' : '') +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="btn-row" style="margin-top:12px">' +
        '<button class="btn btn-primary" onclick="runAllAnalyses()" ' + (_intelAnalyzing ? 'disabled' : '') + '>Run All Analyses</button>' +
        (Object.keys(_analysisResults).length > 0 ? '<button class="btn btn-secondary" onclick="_analysisResults={};renderIntelligence($(\'pageBody\'))">Clear Results</button>' : '') +
      '</div>' +
    '</div>' +
    '<div id="intelResults"></div>';

  // Render existing results
  renderAnalysisResults();
}

// ===== RUN SINGLE DIMENSION =====
async function runDimensionAnalysis(dimensionId) {
  if (_intelAnalyzing) return;
  _intelAnalyzing = dimensionId;
  renderAnalyzeTab();

  try {
    // Step 1: Retrieve relevant chunks via RAG
    var retrieveRes = await apiCall('/documents', {
      method: 'POST',
      body: JSON.stringify({
        action: 'retrieve',
        projectId: state.selectedProjectId,
        scope: dimensionId.replace(/_/g, ' '),
        limit: 25
      })
    });
    var retrieveData = await safeJsonParse(retrieveRes);
    if (!retrieveRes.ok) throw new Error(retrieveData.error || 'Retrieval failed');

    if (!retrieveData.chunks || retrieveData.chunks.length === 0) {
      throw new Error('No relevant content found in uploaded documents');
    }

    // Step 2: Build project context from live data
    var projectContext = buildProjectContext();

    // Step 3: Send to AI for analysis
    var analyzeRes = await apiCall('/carbon-intelligence', {
      method: 'POST',
      body: JSON.stringify({
        action: 'analyze',
        dimension: dimensionId,
        chunks: retrieveData.chunks,
        docMeta: retrieveData.docMeta,
        projectContext: projectContext
      })
    });
    var analyzeData = await safeJsonParse(analyzeRes);
    if (!analyzeRes.ok) throw new Error(analyzeData.error || 'Analysis failed');

    _analysisResults[dimensionId] = analyzeData.analysis;

  } catch (e) {
    _analysisResults[dimensionId] = {
      dimension: dimensionId,
      error: e.message,
      findings: [],
      summary: 'Analysis failed: ' + e.message
    };
  } finally {
    _intelAnalyzing = false;
    renderAnalyzeTab();
  }
}

// ===== RUN ALL =====
async function runAllAnalyses() {
  for (var i = 0; i < _analysisDimensions.length; i++) {
    var dim = _analysisDimensions[i];
    if (!_analysisResults[dim.id]) {
      await runDimensionAnalysis(dim.id);
    }
  }
}

// ===== BUILD PROJECT CONTEXT =====
function buildProjectContext() {
  var pid = state.selectedProjectId;
  var project = (state.projects || []).find(function(p) { return p.id === pid; });
  if (!project) return null;

  var entries = (state.entries || []).filter(function(e) { return e.projectId === pid; });
  var a5entries = (state.a5entries || []).filter(function(e) { return e.projectId === pid; });

  var baseline = 0, actual = 0, a5Total = 0;
  var matMap = {};
  entries.forEach(function(e) {
    baseline += (e.a13B || 0);
    actual += (e.a13A || 0);
    var cat = e.category || 'Other';
    if (!matMap[cat]) matMap[cat] = { name: cat, baseline: 0, actual: 0, entries: 0 };
    matMap[cat].baseline += (e.a13B || 0);
    matMap[cat].actual += (e.a13A || 0);
    matMap[cat].entries++;
  });
  a5entries.forEach(function(e) { a5Total += (e.emission || 0); });

  var materials = Object.values(matMap).map(function(m) {
    m.reduction = m.baseline > 0 ? ((m.baseline - m.actual) / m.baseline * 100).toFixed(1) : 0;
    return m;
  });

  return {
    project: project,
    target: state.reductionTarget || 20,
    totals: {
      baseline: baseline / 1000,
      actual: actual / 1000,
      a5: a5Total / 1000,
      reduction: baseline > 0 ? ((baseline - actual) / baseline * 100) : 0
    },
    materials: materials.map(function(m) {
      return { name: m.name, baseline: m.baseline / 1000, actual: m.actual / 1000, reduction: m.reduction, entries: m.entries };
    })
  };
}

// ===== RENDER ANALYSIS RESULTS WITH CITATIONS =====
function renderAnalysisResults() {
  var el = $('intelResults');
  if (!el) return;

  var dimensions = Object.keys(_analysisResults);
  if (dimensions.length === 0) {
    el.innerHTML = '';
    return;
  }

  var html = '';
  for (var i = 0; i < dimensions.length; i++) {
    var dimId = dimensions[i];
    var result = _analysisResults[dimId];
    var dimInfo = _analysisDimensions.find(function(d) { return d.id === dimId; });
    var label = dimInfo ? dimInfo.label : dimId;
    var icon = dimInfo ? dimInfo.icon : '\u{1F50D}';

    if (result.error) {
      html += '<div class="card"><div class="card-title">' + icon + ' ' + label + '</div>' +
        '<div class="intel-error">' + result.error + '</div></div>';
      continue;
    }

    html += '<div class="card">' +
      '<div class="card-title">' + icon + ' ' + label + '</div>';

    if (result.summary) {
      html += '<div class="intel-summary">' + result.summary + '</div>';
    }

    if (result.findings && result.findings.length > 0) {
      html += '<div class="intel-findings">';
      for (var f = 0; f < result.findings.length; f++) {
        var finding = result.findings[f];
        var severityClass = finding.severity === 'high' ? 'intel-sev-high' : finding.severity === 'low' ? 'intel-sev-low' : 'intel-sev-med';

        html += '<div class="intel-finding ' + severityClass + '">' +
          '<div class="intel-finding-header">' +
            '<span class="intel-sev-badge intel-sev-badge-' + finding.severity + '">' + finding.severity.toUpperCase() + '</span>' +
            '<span class="intel-finding-text">' + escapeHtml(finding.finding) + '</span>' +
          '</div>';

        // Citations
        if (finding.citations && finding.citations.length > 0) {
          html += '<div class="intel-citations">';
          for (var c = 0; c < finding.citations.length; c++) {
            var cite = finding.citations[c];
            html += '<div class="intel-citation">' +
              '<span class="intel-cite-badge">' +
                '<span class="intel-cite-icon">\u{1F4C4}</span>' +
                escapeHtml(cite.docName || 'Unknown') +
                (cite.page ? ', p.' + cite.page : '') +
                (cite.section ? ' \u00B7 ' + escapeHtml(cite.section) : '') +
              '</span>' +
              '<div class="intel-cite-quote">\u201C' + escapeHtml(cite.quote) + '\u201D</div>' +
            '</div>';
          }
          html += '</div>';
        }

        // Recommendation
        if (finding.recommendation) {
          html += '<div class="intel-recommendation">' +
            '<span class="intel-rec-label">Recommendation:</span> ' + escapeHtml(finding.recommendation) +
            (finding.impact ? ' <span class="intel-impact">' + escapeHtml(finding.impact) + '</span>' : '') +
          '</div>';
        }

        html += '</div>'; // .intel-finding
      }
      html += '</div>'; // .intel-findings
    } else {
      html += '<div class="empty" style="padding:16px">No findings for this dimension</div>';
    }

    // Save button
    html += '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn btn-secondary btn-sm" onclick="saveAnalysisResult(\'' + dimId + '\')">Save to History</button>' +
    '</div>';

    html += '</div>'; // .card
  }

  el.innerHTML = html;
}

// ===== SAVE ANALYSIS =====
async function saveAnalysisResult(dimensionId) {
  var result = _analysisResults[dimensionId];
  if (!result) return;

  try {
    var analysisId = 'anal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    await apiCall('/carbon-intelligence', {
      method: 'POST',
      body: JSON.stringify({
        action: 'save-result',
        projectId: state.selectedProjectId,
        analysisId: analysisId,
        dimension: dimensionId,
        analysis: result,
        timestamp: new Date().toISOString()
      })
    });
    alert('Analysis saved to history.');
  } catch (e) {
    alert('Save failed: ' + e.message);
  }
}

// ===== HISTORY TAB =====
async function renderHistoryTab() {
  var container = $('intelContent');
  container.innerHTML = '<div class="card"><div class="card-title">Analysis History</div><div id="intelHistory"><div class="empty" style="padding:20px"><div style="font-size:11px;color:var(--slate5)">Loading...</div></div></div></div>';

  try {
    var res = await apiCall('/carbon-intelligence', {
      method: 'POST',
      body: JSON.stringify({ action: 'list-results', projectId: state.selectedProjectId })
    });
    var data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error || 'Failed to load history');

    var results = data.results || [];
    if (results.length === 0) {
      $('intelHistory').innerHTML = '<div class="empty" style="padding:24px"><div class="empty-icon">\u{1F4CA}</div>No saved analyses yet. Run an analysis and save it to see it here.</div>';
      return;
    }

    $('intelHistory').innerHTML = results.map(function(r) {
      var dimInfo = _analysisDimensions.find(function(d) { return d.id === r.dimension; });
      var label = dimInfo ? dimInfo.label : r.dimension;
      var icon = dimInfo ? dimInfo.icon : '\u{1F50D}';
      var date = r.timestamp ? new Date(r.timestamp).toLocaleString() : '';
      var findingCount = r.analysis && r.analysis.findings ? r.analysis.findings.length : 0;
      var highCount = r.analysis && r.analysis.findings ? r.analysis.findings.filter(function(f) { return f.severity === 'high'; }).length : 0;

      return '<div class="intel-history-card" onclick="viewHistoryResult(\'' + r.id + '\')">' +
        '<div class="intel-history-left">' +
          '<span style="font-size:18px">' + icon + '</span>' +
          '<div>' +
            '<div style="font-weight:700;font-size:13px">' + label + '</div>' +
            '<div style="font-size:10px;color:var(--slate5)">' + date + ' &middot; by ' + (r.createdByName || 'Unknown') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="intel-history-right">' +
          '<span style="font-size:11px;color:var(--slate4)">' + findingCount + ' findings</span>' +
          (highCount > 0 ? '<span class="badge rejected" style="margin-left:6px">' + highCount + ' high</span>' : '') +
        '</div>' +
      '</div>';
    }).join('');

  } catch (e) {
    $('intelHistory').innerHTML = '<div class="empty" style="padding:20px;color:var(--red)">' + e.message + '</div>';
  }
}

async function viewHistoryResult(resultId) {
  try {
    var res = await apiCall('/carbon-intelligence', {
      method: 'POST',
      body: JSON.stringify({ action: 'list-results', projectId: state.selectedProjectId })
    });
    var data = await safeJsonParse(res);
    var result = (data.results || []).find(function(r) { return r.id === resultId; });
    if (result && result.analysis) {
      _analysisResults[result.dimension] = result.analysis;
      _intelTab = 'analyze';
      renderIntelligence($('pageBody'));
    }
  } catch (e) {
    alert('Failed to load result: ' + e.message);
  }
}

// ===== BOQ TEMPLATE DOWNLOAD =====
function downloadBOQTemplate() {
  var csv = 'Item No,Description,Quantity,Unit,Notes (optional)\n' +
    '1.01,"Supply and place C40 concrete for foundation, 300mm thick",2500,m\u00B2,Grade C40\n' +
    '1.02,"Supply and fix high yield steel reinforcement bar B500B, 16mm dia",450000,kg,\n' +
    '2.01,"Supply and erect structural steel I-sections to roof frame",125000,kg,S355 grade\n' +
    '3.01,"Asphalt wearing course 50mm thick, 5% binder content PMB",12000,m\u00B2,\n' +
    '4.01,"Double glazed IGU units 6/12/6mm to curtain wall",3200,m\u00B2,Low-E\n' +
    '5.01,"Aluminum curtain wall profiles with thermal break",28000,kg,\n' +
    '6.01,"600mm dia ductile iron pipe to main drainage",2800,m,\n' +
    '7.01,"50mm thick extruded polystyrene insulation to roof",6000,m\u00B2,XPS\n' +
    '8.01,"200mm thick hollow concrete blockwork",3600,m\u00B2,\n' +
    '9.01,"Remove existing floor tiles and screed",2000,m\u00B2,Demolition\n' +
    '9.02,"Provisional sum for testing and commissioning",1,sum,\n' +
    '9.03,"LED light fitting complete with driver and all accessories",523,nr,MEP assembly\n';

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'BOQ_Template_CarbonTrack.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ===== UTILITY =====
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
