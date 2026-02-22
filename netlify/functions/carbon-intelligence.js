// ===== Carbon Intelligence — RAG Retrieval + Citation-Aware AI Analysis =====
// Multi-step analysis pipeline: Retrieve relevant chunks → Focused AI call → Cited findings
// Each call stays under 22s to avoid Netlify timeouts
const { getDb, verifyToken, headers, respond, optionsResponse, csrfCheck } = require('./utils/firebase');
const { resetAnonymization, sanitizeProjectData, sanitizeChunks, deAnonymizeResponse, createAIAuditEntry } = require('./lib/ai-privacy');
const { checkPromptInjection, validatePayloadSize } = require('./lib/sanitize');
const { getClientId, checkRateLimit } = require('./lib/rate-limit');

// ===== ANALYSIS DIMENSIONS =====
// Each dimension is a focused prompt that analyzes one aspect
const ANALYSIS_DIMENSIONS = {
  material_compliance: {
    label: 'Material Compliance',
    prompt: `You are an expert Embodied Carbon Auditor. Analyze the provided document excerpts and project data to identify MATERIAL COMPLIANCE issues.

Focus on:
- Materials that EXCEED baseline emission factors
- Specification gaps (missing EPDs, unclear grades, no carbon data)
- Materials where actual EF differs from design intent
- Non-compliant substitutions
- Missing or outdated Environmental Product Declarations

For EVERY finding, you MUST provide a citation from the source documents.`
  },

  reduction_opportunities: {
    label: 'Reduction Opportunities',
    prompt: `You are an expert Embodied Carbon Consultant. Analyze the provided document excerpts and project data to identify CARBON REDUCTION OPPORTUNITIES.

Focus on:
- High-impact material substitutions (concrete GGBS%, recycled steel, low-carbon alternatives)
- Specification changes that reduce carbon without affecting performance
- Supply chain optimizations (local sourcing, transport mode)
- Design efficiencies (material optimization, waste reduction)
- Quantify potential reduction for each opportunity (in tCO₂e or %)

For EVERY finding, you MUST provide a citation from the source documents.`
  },

  cross_document_consistency: {
    label: 'Cross-Document Consistency',
    prompt: `You are an expert Carbon Data Integrity Auditor. Compare the provided document excerpts to identify INCONSISTENCIES across different documents.

Focus on:
- Emission factors quoted differently across documents
- Quantity discrepancies (BOQ vs CIA vs submittals)
- Conflicting material specifications
- Baseline assumptions that differ between documents
- Target values that don't align across reports

For EVERY finding, you MUST cite BOTH conflicting documents.`
  },

  regulatory_gaps: {
    label: 'Regulatory & Certification Gaps',
    prompt: `You are an expert Sustainability Compliance Consultant. Analyze the provided document excerpts to identify REGULATORY AND CERTIFICATION GAPS.

Focus on:
- Missing documentation required by standards (EN 15978, ISO 14064, PAS 2080)
- Certification credit shortfalls (LEED, BREEAM, Mostadam, Envision)
- Incomplete lifecycle stage coverage (A1-A3, A4, A5, B, C, D)
- Missing benchmarking against sector targets
- Data quality issues that would fail audit

For EVERY finding, you MUST provide a citation from the source documents.`
  },

  recommendations: {
    label: 'Actionable Recommendations',
    prompt: `You are a Senior Carbon Strategy Advisor. Based on the provided document excerpts and project data, generate PRIORITIZED ACTIONABLE RECOMMENDATIONS.

Focus on:
- Quick wins (changes achievable in <2 weeks, low cost)
- Medium-term actions (1-3 months, moderate investment)
- Strategic initiatives (3-12 months, significant impact)
- For each recommendation: expected carbon reduction (tCO₂e), cost implication, implementation complexity
- Role-specific actions (what should the contractor do vs consultant vs client)

For EVERY recommendation, you MUST reference the source evidence.`
  }
};

// ===== BUILD ANALYSIS PROMPT =====
function buildAnalysisPrompt(dimension, chunks, docMeta, projectContext) {
  const dimConfig = ANALYSIS_DIMENSIONS[dimension];
  if (!dimConfig) throw new Error('Unknown analysis dimension: ' + dimension);

  // Build document context from retrieved chunks
  const chunkContext = chunks.map((chunk, idx) => {
    const doc = docMeta[chunk.docId] || {};
    return `--- [Source ${idx + 1}: "${doc.fileName || 'Unknown'}", Page ${chunk.page || '?'}, Section: "${chunk.section || 'General'}"] ---
${chunk.text}
--- End Source ${idx + 1} ---`;
  }).join('\n\n');

  // Build project data context if available
  let projectDataContext = '';
  if (projectContext) {
    const { project, totals, materials, target } = projectContext;
    if (project) {
      projectDataContext = `
PROJECT DATA (from live CarbonTrack system):
- Project: ${project.name || 'Unknown'}${project.code ? ' (' + project.code + ')' : ''}
- Reduction Target: ${target || 20}%`;
      if (totals) {
        projectDataContext += `
- Baseline (BAU): ${(totals.baseline || 0).toFixed(2)} tCO₂eq
- Actual: ${(totals.actual || 0).toFixed(2)} tCO₂eq
- Current Reduction: ${(totals.reduction || 0).toFixed(1)}%
- A5 Site Emissions: ${(totals.a5 || 0).toFixed(2)} tCO₂eq`;
      }
      if (materials && materials.length > 0) {
        projectDataContext += '\n- Material Breakdown:';
        for (const m of materials) {
          projectDataContext += `\n  * ${m.name}: Baseline ${(m.baseline || 0).toFixed(1)} → Actual ${(m.actual || 0).toFixed(1)} tCO₂ (${m.reduction || 0}% reduction)`;
        }
      }
    }
  }

  return `${dimConfig.prompt}
${projectDataContext}

===== DOCUMENT EXCERPTS (${chunks.length} relevant sections retrieved by RAG) =====

${chunkContext}

===== OUTPUT FORMAT =====
Return ONLY valid JSON. No markdown wrapping. Structure:
{
  "dimension": "${dimension}",
  "dimensionLabel": "${dimConfig.label}",
  "findings": [
    {
      "finding": "Clear, specific finding statement",
      "severity": "high" | "medium" | "low",
      "citations": [
        {
          "sourceIndex": 1,
          "docName": "exact file name from Source header",
          "page": 14,
          "section": "section name from Source header",
          "quote": "exact 10-30 word quote from the source that supports this finding"
        }
      ],
      "recommendation": "specific actionable recommendation",
      "impact": "estimated carbon impact if applicable (e.g., '~50 tCO₂e reduction')"
    }
  ],
  "summary": "one-sentence summary of this analysis dimension"
}

CRITICAL RULES:
1. Every finding MUST have at least one citation with a direct quote from the sources
2. The "quote" field must contain actual text from the source, not paraphrased
3. The "sourceIndex" must match the Source number in the excerpts above
4. Do NOT fabricate citations — if you cannot cite a specific source, do not include the finding
5. Limit to the 5-8 most important findings for this dimension
6. Be specific with numbers: "23% above baseline" not "significantly above"`;
}

// ===== CALL CLAUDE API =====
async function callClaude(apiKey, prompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 22000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error('API error ' + response.status + ': ' + errText);
    }

    const result = await response.json();
    const content = result.content && result.content[0] && result.content[0].text;
    if (!content) throw new Error('Empty response from AI');
    return content;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('AI response timeout (>22s). Reduce scope or document count.');
    throw err;
  }
}

// ===== PARSE AI RESPONSE =====
function parseAnalysisResponse(content) {
  let jsonStr = content.trim();
  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  const result = JSON.parse(jsonStr);

  // Validate structure
  if (!result.findings || !Array.isArray(result.findings)) {
    throw new Error('Invalid response: missing findings array');
  }

  // Clean and validate citations
  result.findings = result.findings.map(f => ({
    finding: String(f.finding || ''),
    severity: ['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium',
    citations: (f.citations || []).map(c => ({
      sourceIndex: Number(c.sourceIndex) || 0,
      docName: String(c.docName || 'Unknown'),
      page: c.page || null,
      section: String(c.section || ''),
      quote: String(c.quote || '')
    })).filter(c => c.quote.length > 5), // Remove empty citations
    recommendation: String(f.recommendation || ''),
    impact: String(f.impact || '')
  })).filter(f => f.finding.length > 10 && f.citations.length > 0); // Only findings WITH citations

  return result;
}

// ===== HANDLER =====
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const csrf = csrfCheck(event);
  if (csrf) return csrf;

  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const user = await verifyToken(event);
  if (!user) return respond(401, { error: 'Unauthorized' });

  const db = getDb();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return respond(500, { error: 'AI not configured. Set ANTHROPIC_API_KEY in Netlify environment variables.' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return respond(400, { error: 'Invalid request body' });
  }

  const { action } = body;

  try {
    // ===== ANALYZE — Single focused dimension =====
    if (action === 'analyze') {
      // Rate limiting for AI calls
      const clientId = getClientId(event, user);
      const rateCheck = await checkRateLimit(db, clientId, 'ai');
      if (!rateCheck.allowed) {
        return respond(429, { error: 'Too many AI requests. Please wait ' + rateCheck.retryAfter + ' seconds.' });
      }

      const { dimension, chunks, docMeta, projectContext } = body;

      // Validate payload size
      const sizeCheck = validatePayloadSize(body, 5 * 1024 * 1024); // 5MB max
      if (!sizeCheck.valid) {
        return respond(413, { error: sizeCheck.error });
      }

      if (!dimension || !ANALYSIS_DIMENSIONS[dimension]) {
        return respond(400, { error: 'Invalid dimension. Valid: ' + Object.keys(ANALYSIS_DIMENSIONS).join(', ') });
      }
      if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
        return respond(400, { error: 'No chunks provided for analysis' });
      }

      // Check for prompt injection in user-supplied scope
      if (body.scope) {
        const injectionCheck = checkPromptInjection(body.scope);
        if (!injectionCheck.safe) {
          return respond(400, { error: 'Invalid input detected.' });
        }
      }

      // Limit chunks to keep context manageable (under 20K chars)
      const maxChars = 18000;
      let totalChars = 0;
      const limitedChunks = [];
      for (const chunk of chunks) {
        if (totalChars + (chunk.text || '').length > maxChars) break;
        limitedChunks.push(chunk);
        totalChars += (chunk.text || '').length;
      }

      // Apply AI data privacy — anonymize/redact before sending to Claude
      resetAnonymization();
      const sanitizedContext = projectContext ? sanitizeProjectData(projectContext) : null;
      const { chunks: sanitizedChunks, docMeta: sanitizedDocMeta } = sanitizeChunks(limitedChunks, docMeta || {});

      const prompt = buildAnalysisPrompt(dimension, sanitizedChunks, sanitizedDocMeta, sanitizedContext);
      let content = await callClaude(apiKey, prompt);

      // De-anonymize before parsing
      content = deAnonymizeResponse(content);

      const analysis = parseAnalysisResponse(content);

      // Audit log the AI call
      const auditEntry = createAIAuditEntry(user.uid, 'carbon-intelligence', {
        projectId: (projectContext && projectContext.project && projectContext.project.name) || null,
        dimension,
        chunksCount: sanitizedChunks.length,
        totalChars: totalChars,
        piiRedacted: true,
        promptPreview: prompt.substring(0, 100),
      });
      await db.ref('aiAuditLogs/' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)).set(auditEntry);

      // Enrich citations with actual doc metadata
      for (const finding of analysis.findings) {
        for (const citation of finding.citations) {
          const srcChunk = limitedChunks[citation.sourceIndex - 1];
          if (srcChunk) {
            const doc = (docMeta || {})[srcChunk.docId];
            if (doc) {
              citation.docId = srcChunk.docId;
              citation.docName = doc.fileName || citation.docName;
              citation.docType = doc.docType;
            }
            citation.page = citation.page || srcChunk.page;
            citation.section = citation.section || srcChunk.section;
            citation.chunkId = srcChunk.id;
          }
        }
      }

      return respond(200, {
        success: true,
        analysis,
        chunksAnalyzed: limitedChunks.length,
        model: 'claude-sonnet-4-20250514',
        privacyApplied: true,
      });
    }

    // ===== LIST DIMENSIONS =====
    if (action === 'list-dimensions') {
      const dimensions = Object.entries(ANALYSIS_DIMENSIONS).map(([key, val]) => ({
        id: key,
        label: val.label
      }));
      return respond(200, { success: true, dimensions });
    }

    // ===== SAVE ANALYSIS RESULT =====
    if (action === 'save-result') {
      const { projectId, analysisId, dimension, analysis, timestamp } = body;
      if (!projectId || !analysisId || !dimension) {
        return respond(400, { error: 'Missing projectId, analysisId, or dimension' });
      }

      const db = getDb();
      await db.ref(`analysis/${projectId}/${analysisId}`).set({
        id: analysisId,
        projectId,
        dimension,
        analysis,
        timestamp: timestamp || new Date().toISOString(),
        createdBy: user.uid,
        createdByName: user.name || user.email || 'Unknown'
      });

      return respond(200, { success: true });
    }

    // ===== GET SAVED ANALYSES =====
    if (action === 'list-results') {
      const { projectId } = body;
      if (!projectId) return respond(400, { error: 'Missing projectId' });

      const db = getDb();
      const snap = await db.ref(`analysis/${projectId}`).once('value');
      const data = snap.val() || {};
      const results = Object.values(data).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

      return respond(200, { success: true, results });
    }

    return respond(400, { error: 'Invalid action.' });

  } catch (err) {
    console.error('Carbon intelligence error:', err);
    return respond(500, { error: 'Analysis failed. Please try again.' });
  }
};
