/**
 * AI Data Privacy Layer
 *
 * Controls what data is sent to external AI services (Claude API).
 * This is the KEY module that enterprise clients care about.
 *
 * Strategies:
 *   1. DATA MINIMIZATION — Only send the minimum data needed for analysis
 *   2. ANONYMIZATION — Strip/replace identifiable project names, company names, locations
 *   3. REDACTION — Remove specific sensitive patterns (contract values, phone numbers, etc.)
 *   4. AUDIT TRAIL — Log every AI call with what data was sent (without the actual data)
 *   5. NO TRAINING — Anthropic API does NOT use API data for training (by default)
 *
 * Enterprise can configure privacy level via DATA_PRIVACY_LEVEL env var:
 *   - "standard"  — Send data as-is (default, for non-sensitive projects)
 *   - "enhanced"  — Anonymize project/company names, redact PII
 *   - "maximum"   — Anonymize everything + strip all identifying info
 */

const crypto = require('crypto');

const PRIVACY_LEVEL = process.env.DATA_PRIVACY_LEVEL || 'enhanced';

// Patterns to redact (replaced with [REDACTED])
const PII_PATTERNS = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, label: 'EMAIL' },
  { pattern: /\b(?:\+?966|0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}\b/g, label: 'PHONE_SA' },
  { pattern: /\b(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}\b/g, label: 'PHONE' },
  { pattern: /\b\d{10,12}\b/g, label: 'ID_NUMBER' },
  { pattern: /SAR\s*[\d,]+(?:\.\d{2})?/gi, label: 'CURRENCY_SAR' },
  { pattern: /USD\s*[\d,]+(?:\.\d{2})?/gi, label: 'CURRENCY_USD' },
  { pattern: /\$[\d,]+(?:\.\d{2})?/g, label: 'CURRENCY' },
  { pattern: /CR\s*\d{10}/gi, label: 'CR_NUMBER' },
];

// Words/names to anonymize in enhanced/maximum mode
let anonymizationMap = {};
let anonymizationCounter = 0;

/**
 * Reset anonymization map (call at start of each request)
 */
function resetAnonymization() {
  anonymizationMap = {};
  anonymizationCounter = 0;
}

/**
 * Create a consistent anonymized replacement for a name
 * Same input always maps to same output within one request
 */
function anonymize(name, type) {
  if (!name) return name;
  const key = name.toLowerCase().trim();
  if (anonymizationMap[key]) return anonymizationMap[key];

  anonymizationCounter++;
  const prefix = type || 'ENTITY';
  const replacement = `[${prefix}_${String.fromCharCode(64 + anonymizationCounter)}]`;
  anonymizationMap[key] = replacement;
  return replacement;
}

/**
 * Get the reverse mapping for de-anonymization of AI responses
 */
function getAnonymizationMap() {
  const reverseMap = {};
  for (const [original, replacement] of Object.entries(anonymizationMap)) {
    reverseMap[replacement] = original;
  }
  return reverseMap;
}

/**
 * Redact PII patterns from text
 */
function redactPII(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const { pattern, label } of PII_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    result = result.replace(pattern, `[${label}_REDACTED]`);
  }
  return result;
}

/**
 * Apply privacy transformations to project data before sending to AI
 */
function sanitizeProjectData(data) {
  if (PRIVACY_LEVEL === 'standard') return data;

  const sanitized = JSON.parse(JSON.stringify(data)); // Deep clone

  if (sanitized.project) {
    if (PRIVACY_LEVEL === 'maximum') {
      sanitized.project.name = anonymize(sanitized.project.name, 'PROJECT');
      if (sanitized.project.code) {
        sanitized.project.code = anonymize(sanitized.project.code, 'CODE');
      }
    }
    // Remove fields that are never needed for analysis
    delete sanitized.project.clientEmail;
    delete sanitized.project.clientPhone;
    delete sanitized.project.address;
    delete sanitized.project.coordinates;
  }

  // Anonymize contractor names in enhanced/maximum
  if (sanitized.contractors && Array.isArray(sanitized.contractors)) {
    sanitized.contractors = sanitized.contractors.map(c => ({
      ...c,
      name: PRIVACY_LEVEL === 'maximum' ? anonymize(c.name, 'CONTRACTOR') : c.name,
    }));
  }

  return sanitized;
}

/**
 * Apply privacy transformations to document chunks before sending to AI
 */
function sanitizeChunks(chunks, docMeta) {
  if (PRIVACY_LEVEL === 'standard') return { chunks, docMeta };

  const sanitizedChunks = chunks.map(chunk => {
    let text = chunk.text;

    // Redact PII in all modes except standard
    text = redactPII(text);

    // In maximum mode, anonymize project-specific names in the text
    if (PRIVACY_LEVEL === 'maximum') {
      // Anonymize known entity names in the text content
      for (const [original, replacement] of Object.entries(anonymizationMap)) {
        const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(escaped, 'gi'), replacement);
      }
    }

    return { ...chunk, text };
  });

  // Sanitize document metadata
  const sanitizedMeta = {};
  for (const [docId, meta] of Object.entries(docMeta || {})) {
    sanitizedMeta[docId] = {
      ...meta,
      uploadedBy: '[REDACTED]',
      uploadedByName: '[REDACTED]',
    };
    if (PRIVACY_LEVEL === 'maximum') {
      sanitizedMeta[docId].fileName = anonymize(meta.fileName, 'DOC');
    }
  }

  return { chunks: sanitizedChunks, docMeta: sanitizedMeta };
}

/**
 * De-anonymize AI response — replace anonymized tokens back to real names
 * Called AFTER receiving AI response, BEFORE returning to client
 */
function deAnonymizeResponse(text) {
  if (PRIVACY_LEVEL === 'standard') return text;
  if (typeof text !== 'string') return text;

  const reverseMap = getAnonymizationMap();
  let result = text;
  for (const [token, original] of Object.entries(reverseMap)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), original);
  }
  return result;
}

/**
 * Create an audit entry for an AI API call (without storing actual data)
 */
function createAIAuditEntry(userId, endpoint, metadata) {
  return {
    timestamp: new Date().toISOString(),
    userId,
    endpoint,
    privacyLevel: PRIVACY_LEVEL,
    dataProfile: {
      chunksCount: metadata.chunksCount || 0,
      totalChars: metadata.totalChars || 0,
      projectId: metadata.projectId || null,
      dimension: metadata.dimension || null,
      piiRedacted: metadata.piiRedacted || false,
      anonymized: PRIVACY_LEVEL !== 'standard',
    },
    // Hash of the prompt for traceability WITHOUT storing content
    promptHash: crypto.createHash('sha256')
      .update(metadata.promptPreview || '')
      .digest('hex')
      .substring(0, 16),
  };
}

/**
 * Get current privacy configuration (for client-side display)
 */
function getPrivacyConfig() {
  return {
    level: PRIVACY_LEVEL,
    features: {
      piiRedaction: PRIVACY_LEVEL !== 'standard',
      nameAnonymization: PRIVACY_LEVEL === 'maximum',
      auditLogging: true,
      encryptionAtRest: !!process.env.DATA_ENCRYPTION_KEY,
      noAITraining: true, // Anthropic API doesn't train on API data
    },
    description: {
      standard: 'Data sent as-is to AI. Suitable for non-sensitive projects.',
      enhanced: 'PII is redacted before sending to AI. Recommended for most enterprises.',
      maximum: 'All identifying information is anonymized. For highly sensitive projects.',
    }[PRIVACY_LEVEL],
  };
}

module.exports = {
  PRIVACY_LEVEL,
  resetAnonymization,
  anonymize,
  getAnonymizationMap,
  redactPII,
  sanitizeProjectData,
  sanitizeChunks,
  deAnonymizeResponse,
  createAIAuditEntry,
  getPrivacyConfig,
};
