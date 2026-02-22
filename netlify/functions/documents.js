// ===== Document Intelligence — Upload, Chunk, Tag & Store Pipeline =====
// Ingests CIA, CEAP, Technical Reports, Material Submittals, BOQ Specs
// Chunks at ~2000 chars with metadata for RAG retrieval
const { getDb, verifyToken, headers, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { encrypt, decrypt, isEncryptionEnabled, encryptFields, decryptFields } = require('./lib/encryption');
const { sanitizeFileName, sanitizeHtml, validatePayloadSize } = require('./lib/sanitize');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

// ===== DOCUMENT TYPES =====
const DOC_TYPES = {
  cia: { label: 'Carbon Impact Assessment', keywords: ['carbon impact', 'cia', 'embodied carbon', 'lifecycle assessment', 'lca', 'whole life carbon'] },
  ceap: { label: 'Carbon & Energy Action Plan', keywords: ['ceap', 'action plan', 'reduction strategy', 'decarbonization', 'carbon management plan'] },
  technical_report: { label: 'Technical Report', keywords: ['technical report', 'engineering report', 'structural report', 'assessment report'] },
  material_submittal: { label: 'Material Submittal', keywords: ['submittal', 'material data', 'product data', 'epd', 'environmental product declaration', 'mix design'] },
  boq_spec: { label: 'BOQ / Specification', keywords: ['bill of quantities', 'boq', 'specification', 'spec', 'schedule of quantities'] },
  sustainability_report: { label: 'Sustainability Report', keywords: ['sustainability', 'esg', 'green building', 'leed', 'breeam', 'mostadam', 'envision'] },
  other: { label: 'Other Document', keywords: [] }
};

// ===== MATERIAL KEYWORDS for chunk tagging =====
const MATERIAL_KEYWORDS = {
  concrete: ['concrete', 'c20', 'c25', 'c30', 'c35', 'c40', 'c45', 'c50', 'c60', 'cement', 'ggbs', 'pfa', 'fly ash', 'admixture', 'rmc', 'ready mix', 'precast', 'post-tension'],
  steel: ['steel', 'rebar', 'reinforcement', 'structural steel', 'i-section', 'h-section', 'hollow section', 'galvanized', 'stainless', 'mesh', 'fabric'],
  aluminum: ['aluminum', 'aluminium', 'curtain wall', 'cladding panel', 'extrusion'],
  glass: ['glass', 'glazing', 'igu', 'double glazed', 'triple glazed', 'low-e', 'laminated glass', 'tempered'],
  timber: ['timber', 'wood', 'plywood', 'glulam', 'clt', 'softwood', 'hardwood', 'formwork'],
  asphalt: ['asphalt', 'bitumen', 'binder content', 'wearing course', 'base course', 'warm mix'],
  insulation: ['insulation', 'eps', 'xps', 'pir', 'mineral wool', 'rock wool', 'glass wool', 'phenolic'],
  waterproofing: ['waterproofing', 'membrane', 'epdm', 'tpo', 'bituminous', 'damp proof'],
  masonry: ['brick', 'block', 'masonry', 'mortar', 'stone', 'granite', 'marble', 'limestone'],
  pipes: ['pipe', 'piping', 'hdpe', 'pvc', 'upvc', 'ductile iron', 'grp', 'drainage'],
  mep: ['hvac', 'mechanical', 'electrical', 'plumbing', 'fire protection', 'ductwork', 'cable', 'conduit', 'sprinkler']
};

// ===== TOPIC KEYWORDS for semantic tagging =====
const TOPIC_KEYWORDS = {
  emissions: ['emission', 'co2', 'co₂', 'carbon dioxide', 'greenhouse gas', 'ghg', 'tco2', 'tco₂', 'kgco2', 'carbon footprint'],
  targets: ['target', 'reduction target', 'benchmark', 'baseline', 'bau', 'business as usual', 'kpi', 'goal', 'objective'],
  compliance: ['compliance', 'regulation', 'standard', 'requirement', 'mandatory', 'code', 'legislation', 'policy', 'iso 14064', 'en 15978'],
  certification: ['leed', 'breeam', 'mostadam', 'envision', 'well', 'estidama', 'green star', 'certification', 'credit'],
  transport: ['transport', 'a4', 'logistics', 'hauling', 'shipping', 'delivery', 'distance', 'supply chain'],
  construction: ['construction', 'a5', 'site', 'installation', 'erection', 'demolition', 'waste', 'site emissions'],
  procurement: ['procurement', 'supplier', 'manufacturer', 'source', 'supply', 'epd', 'product declaration'],
  cost: ['cost', 'budget', 'price', 'savings', 'economic', 'financial', 'value engineering'],
  schedule: ['schedule', 'timeline', 'phase', 'milestone', 'programme', 'program', 'duration'],
  risk: ['risk', 'mitigation', 'contingency', 'uncertainty', 'sensitivity', 'scenario']
};

// ===== CHUNKING ENGINE =====
const CHUNK_SIZE = 2000;       // ~2000 chars per chunk for precise citations
const CHUNK_OVERLAP = 200;     // overlap for context continuity

function chunkText(text, fileName) {
  const lines = text.split('\n');
  const chunks = [];
  let currentChunk = '';
  let currentPage = 1;
  let currentSection = '';
  let chunkStartLine = 1;
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;

    // Detect page breaks (PDF.js inserts these)
    const pageMatch = line.match(/^[-—=\s]*(?:page|p\.?)\s*(\d+)/i);
    if (pageMatch) currentPage = parseInt(pageMatch[1]);
    // Also detect form feed characters
    if (line.includes('\f')) currentPage++;

    // Detect section headers (lines that look like headings)
    const sectionMatch = line.match(/^(?:\d+\.?\d*\.?\d*\s+)?([A-Z][A-Za-z\s&,/()-]{3,80})$/);
    if (sectionMatch && line.trim().length < 100 && line.trim().length > 3) {
      currentSection = sectionMatch[1].trim();
    }

    // Check if adding this line exceeds chunk size
    if (currentChunk.length + line.length + 1 > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        page: currentPage,
        section: currentSection || 'General',
        lineStart: chunkStartLine,
        lineEnd: lineNum - 1
      });
      // Keep overlap for context
      const overlapLines = currentChunk.split('\n').slice(-3).join('\n');
      currentChunk = overlapLines + '\n' + line;
      chunkStartLine = Math.max(1, lineNum - 3);
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }

  // Final chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      page: currentPage,
      section: currentSection || 'General',
      lineStart: chunkStartLine,
      lineEnd: lineNum
    });
  }

  return chunks;
}

// ===== KEYWORD EXTRACTION & TAGGING =====
function extractChunkMetadata(chunkText) {
  const lower = chunkText.toLowerCase();
  const materials = [];
  const topics = [];

  // Match material categories
  for (const [cat, keywords] of Object.entries(MATERIAL_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        if (!materials.includes(cat)) materials.push(cat);
        break;
      }
    }
  }

  // Match topic categories
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        if (!topics.includes(topic)) topics.push(topic);
        break;
      }
    }
  }

  // Extract numeric values (quantities, percentages, emission factors)
  const hasQuantities = /\d+(?:,\d{3})*(?:\.\d+)?\s*(?:m[²³]|m2|m3|kg|tonnes?|tons?|kw?h|nr|nos?|litres?|liters?)\b/i.test(chunkText);
  const hasPercentages = /\d+(?:\.\d+)?%/.test(chunkText);
  const hasEmissionFactors = /\d+(?:\.\d+)?\s*(?:kgco[₂2]|tco[₂2])/i.test(chunkText);

  return { materials, topics, hasQuantities, hasPercentages, hasEmissionFactors };
}

// Auto-detect document type from content
function detectDocType(text, fileName) {
  const lower = (text.substring(0, 5000) + ' ' + fileName).toLowerCase();
  let bestType = 'other';
  let bestScore = 0;

  for (const [type, config] of Object.entries(DOC_TYPES)) {
    if (type === 'other') continue;
    let score = 0;
    for (const kw of config.keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  return bestType;
}

// ===== HANDLER =====
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const user = await verifyToken(event);
  if (!user) return respond(401, { error: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return respond(400, { error: 'Invalid request body' });
  }

  const { action } = body;
  const db = getDb();

  // Rate limiting for uploads
  if (action === 'upload') {
    const clientId = getClientId(event, user);
    const rateCheck = await checkRateLimit(db, clientId, 'upload');
    if (!rateCheck.allowed) {
      return respond(429, { error: 'Too many uploads. Please wait ' + rateCheck.retryAfter + ' seconds.' });
    }
  }

  try {
    // ===== UPLOAD & CHUNK =====
    if (action === 'upload') {
      const { text, fileName, projectId, docType, description } = body;
      if (!text || !fileName || !projectId) {
        return respond(400, { error: 'Missing required fields: text, fileName, projectId' });
      }

      // Validate payload size (max 10MB for document text)
      const sizeCheck = validatePayloadSize({ text }, 10 * 1024 * 1024);
      if (!sizeCheck.valid) {
        return respond(413, { error: sizeCheck.error });
      }

      if (text.trim().length < 50) {
        return respond(400, { error: 'Document text too short (min 50 chars)' });
      }

      // Sanitize file name to prevent path traversal
      const safeFileName = sanitizeFileName(fileName);

      const detectedType = docType || detectDocType(text, safeFileName);
      const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

      // Chunk the document
      const rawChunks = chunkText(text, fileName);

      // Tag each chunk with metadata
      const chunks = rawChunks.map((chunk, idx) => {
        const meta = extractChunkMetadata(chunk.text);
        return {
          id: docId + '_c' + idx,
          docId: docId,
          index: idx,
          text: chunk.text,
          page: chunk.page,
          section: chunk.section,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          materials: meta.materials,
          topics: meta.topics,
          hasQuantities: meta.hasQuantities,
          hasPercentages: meta.hasPercentages,
          hasEmissionFactors: meta.hasEmissionFactors
        };
      });

      // Store document metadata
      const docRecord = {
        id: docId,
        projectId: projectId,
        fileName: safeFileName,
        docType: detectedType,
        docTypeLabel: DOC_TYPES[detectedType] ? DOC_TYPES[detectedType].label : 'Other Document',
        description: sanitizeHtml(description || ''),
        totalChunks: chunks.length,
        totalChars: text.length,
        uploadedBy: user.uid,
        uploadedByName: user.name || user.email || 'Unknown',
        uploadedAt: new Date().toISOString(),
        encrypted: isEncryptionEnabled(),
        // Aggregate metadata across all chunks
        allMaterials: [...new Set(chunks.flatMap(c => c.materials))],
        allTopics: [...new Set(chunks.flatMap(c => c.topics))]
      };

      // Write to Firebase: document metadata + encrypted chunks
      const updates = {};
      updates[`documents/${projectId}/${docId}/meta`] = docRecord;
      for (const chunk of chunks) {
        // Encrypt chunk text at rest if encryption is configured
        const storedChunk = isEncryptionEnabled()
          ? { ...chunk, text: encrypt(chunk.text), encrypted: true }
          : chunk;
        updates[`documents/${projectId}/${docId}/chunks/${chunk.id}`] = storedChunk;
      }

      await db.ref().update(updates);

      return respond(200, {
        success: true,
        document: docRecord,
        chunksCreated: chunks.length,
        detectedType: detectedType,
        encrypted: isEncryptionEnabled()
      });
    }

    // ===== LIST DOCUMENTS =====
    if (action === 'list') {
      const { projectId } = body;
      if (!projectId) return respond(400, { error: 'Missing projectId' });

      const snap = await db.ref(`documents/${projectId}`).once('value');
      const data = snap.val() || {};

      const documents = [];
      for (const docId of Object.keys(data)) {
        if (data[docId].meta) {
          documents.push(data[docId].meta);
        }
      }

      // Sort by upload date, newest first
      documents.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));

      return respond(200, { success: true, documents });
    }

    // ===== GET DOCUMENT WITH CHUNKS =====
    if (action === 'get') {
      const { projectId, docId } = body;
      if (!projectId || !docId) return respond(400, { error: 'Missing projectId or docId' });

      const snap = await db.ref(`documents/${projectId}/${docId}`).once('value');
      const data = snap.val();
      if (!data) return respond(404, { error: 'Document not found' });

      // Decrypt chunk text if encrypted
      const chunks = data.chunks ? Object.values(data.chunks).map(chunk => {
        if (chunk.encrypted && isEncryptionEnabled()) {
          return { ...chunk, text: decrypt(chunk.text), encrypted: false };
        }
        return chunk;
      }) : [];

      return respond(200, {
        success: true,
        document: data.meta,
        chunks
      });
    }

    // ===== GET CHUNKS BY IDs (for RAG retrieval) =====
    if (action === 'get-chunks') {
      const { projectId, chunkIds } = body;
      if (!projectId || !chunkIds || !Array.isArray(chunkIds)) {
        return respond(400, { error: 'Missing projectId or chunkIds array' });
      }

      // Load all docs for project and find matching chunks
      const snap = await db.ref(`documents/${projectId}`).once('value');
      const data = snap.val() || {};

      const chunks = [];
      const docMeta = {};
      for (const docId of Object.keys(data)) {
        const doc = data[docId];
        if (doc.chunks) {
          for (const chunkId of Object.keys(doc.chunks)) {
            if (chunkIds.includes(chunkId)) {
              // Decrypt chunk text if encrypted
              const chunk = doc.chunks[chunkId];
              if (chunk.encrypted && isEncryptionEnabled()) {
                chunks.push({ ...chunk, text: decrypt(chunk.text), encrypted: false });
              } else {
                chunks.push(chunk);
              }
              if (!docMeta[docId] && doc.meta) {
                docMeta[docId] = doc.meta;
              }
            }
          }
        }
      }

      return respond(200, { success: true, chunks, docMeta });
    }

    // ===== DELETE DOCUMENT =====
    if (action === 'delete') {
      const { projectId, docId } = body;
      if (!projectId || !docId) return respond(400, { error: 'Missing projectId or docId' });

      await db.ref(`documents/${projectId}/${docId}`).remove();

      return respond(200, { success: true });
    }

    // ===== RETRIEVE — RAG keyword-based chunk retrieval =====
    if (action === 'retrieve') {
      const { projectId, scope, docTypes, materialFilter, topicFilter, limit } = body;
      if (!projectId) return respond(400, { error: 'Missing projectId' });

      const maxResults = Math.min(limit || 30, 50);

      // Load all documents and chunks for the project
      const snap = await db.ref(`documents/${projectId}`).once('value');
      const data = snap.val() || {};

      const allChunks = [];
      const allDocMeta = {};

      for (const docId of Object.keys(data)) {
        const doc = data[docId];
        if (!doc.meta || !doc.chunks) continue;

        // Filter by document type if specified
        if (docTypes && docTypes.length > 0 && !docTypes.includes(doc.meta.docType)) continue;

        allDocMeta[docId] = doc.meta;
        for (const chunkId of Object.keys(doc.chunks)) {
          const chunk = doc.chunks[chunkId];
          // Decrypt for scoring/retrieval
          if (chunk.encrypted && isEncryptionEnabled()) {
            allChunks.push({ ...chunk, text: decrypt(chunk.text), encrypted: false });
          } else {
            allChunks.push(chunk);
          }
        }
      }

      // Score each chunk for relevance
      const scopeWords = scope ? scope.toLowerCase().split(/\s+/).filter(w => w.length > 2) : [];

      const scored = allChunks.map(chunk => {
        let score = 0;

        // Keyword matching from scope/query
        if (scopeWords.length > 0) {
          const lower = chunk.text.toLowerCase();
          for (const word of scopeWords) {
            if (lower.includes(word)) score += 5;
          }
        }

        // Material filter boost
        if (materialFilter && materialFilter.length > 0) {
          for (const mat of materialFilter) {
            if (chunk.materials && chunk.materials.includes(mat)) score += 10;
          }
        }

        // Topic filter boost
        if (topicFilter && topicFilter.length > 0) {
          for (const topic of topicFilter) {
            if (chunk.topics && chunk.topics.includes(topic)) score += 8;
          }
        }

        // Boost chunks with quantitative data
        if (chunk.hasEmissionFactors) score += 6;
        if (chunk.hasQuantities) score += 3;
        if (chunk.hasPercentages) score += 2;

        // Boost if chunk has richer metadata (more tags = more relevant)
        score += (chunk.materials ? chunk.materials.length : 0) * 1;
        score += (chunk.topics ? chunk.topics.length : 0) * 1;

        return { ...chunk, score };
      });

      // Sort by score descending, take top-K
      scored.sort((a, b) => b.score - a.score);
      const topChunks = scored.slice(0, maxResults);

      return respond(200, {
        success: true,
        chunks: topChunks,
        docMeta: allDocMeta,
        totalChunksScanned: allChunks.length,
        totalDocuments: Object.keys(allDocMeta).length
      });
    }

    return respond(400, { error: 'Invalid action.' });

  } catch (err) {
    console.error('Documents error:', err);
    return respond(500, { error: 'Internal server error.' });
  }
};
