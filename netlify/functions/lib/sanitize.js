/**
 * Input Sanitization & Prompt Injection Prevention
 *
 * Protects against:
 * 1. Prompt injection attacks (manipulating AI behavior via user input)
 * 2. XSS (cross-site scripting) in stored content
 * 3. Path traversal in file names
 * 4. Oversized payloads
 */

// Characters and patterns that could be used for prompt injection
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /you\s+are\s+now\s+(?:a|an)\s+/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<<SYS>>/i,
  /<<\/SYS>>/i,
  /\bBEGIN\s+INJECTION\b/i,
  /\bEND\s+INJECTION\b/i,
  /\bACT\s+AS\b.*\bAI\b/i,
];

/**
 * Strip HTML tags and encode special characters to prevent XSS
 */
function sanitizeHtml(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize file names — prevent path traversal and malicious names
 */
function sanitizeFileName(name) {
  if (typeof name !== 'string') return 'unnamed';
  return name
    .replace(/\.\./g, '')          // No parent directory traversal
    .replace(/[/\\]/g, '_')        // No path separators
    .replace(/[<>:"|?*]/g, '_')    // No shell-special characters
    .replace(/[\x00-\x1f]/g, '')   // No control characters
    .trim()
    .substring(0, 255);            // Limit length
}

/**
 * Check text for prompt injection attempts
 * Returns { safe: boolean, reason?: string }
 */
function checkPromptInjection(text) {
  if (typeof text !== 'string') return { safe: true };

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        safe: false,
        reason: 'Input contains patterns that could manipulate AI behavior'
      };
    }
  }
  return { safe: true };
}

/**
 * Sanitize text before including in AI prompts
 * Wraps user content in clear delimiters so the AI treats it as data, not instructions
 */
function sanitizeForPrompt(text, label) {
  if (typeof text !== 'string') return '';

  // Remove null bytes and control characters (except newlines/tabs)
  let cleaned = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  // Escape any delimiter-like patterns that could confuse prompt boundaries
  cleaned = cleaned
    .replace(/={5,}/g, '---')
    .replace(/-{5,}/g, '---');

  // Wrap in clear data boundaries
  return `[BEGIN ${label || 'USER_DATA'}]\n${cleaned}\n[END ${label || 'USER_DATA'}]`;
}

/**
 * Validate and constrain request body size
 */
function validatePayloadSize(body, maxSizeBytes) {
  const size = Buffer.byteLength(JSON.stringify(body), 'utf8');
  const limit = maxSizeBytes || 5 * 1024 * 1024; // Default 5MB
  if (size > limit) {
    return {
      valid: false,
      error: `Payload too large (${(size / 1024 / 1024).toFixed(1)}MB). Maximum allowed: ${(limit / 1024 / 1024).toFixed(1)}MB`
    };
  }
  return { valid: true, size };
}

/**
 * Sanitize all string fields in an object recursively
 */
function sanitizeObject(obj, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 10) return obj; // Prevent infinite recursion
  if (typeof obj === 'string') return sanitizeHtml(obj);
  if (Array.isArray(obj)) return obj.map(function(item) { return sanitizeObject(item, depth + 1); });
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[sanitizeHtml(key)] = sanitizeObject(obj[key], depth + 1);
    }
    return result;
  }
  return obj;
}

module.exports = {
  sanitizeHtml,
  sanitizeFileName,
  checkPromptInjection,
  sanitizeForPrompt,
  validatePayloadSize,
  sanitizeObject,
};
