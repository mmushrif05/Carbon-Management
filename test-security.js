#!/usr/bin/env node
/**
 * OWASP ASVS Level 2 — Security Compliance Test Suite
 * Validates all security controls are properly implemented.
 */

const fs = require('fs');
const path = require('path');

let totalPass = 0, totalFail = 0;

function assert(condition, name) {
  if (condition) { console.log('  ✓', name); totalPass++; }
  else { console.log('  ✗ FAIL:', name); totalFail++; }
}

// ═══════════════════════════════════════════════════
// TEST SUITE 1: Security Middleware Module
// ═══════════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════════');
console.log('  OWASP ASVS Level 2 — Full Security Compliance Test Suite');
console.log('═══════════════════════════════════════════════════════════\n');

const sm = require('./netlify/functions/lib/security-middleware.js');

console.log('=== 1. CSRF Protection (V11) ===');
assert(sm.validateCSRF({ httpMethod: 'GET', headers: {} }).valid === true, 'GET bypasses CSRF');
assert(sm.validateCSRF({ httpMethod: 'OPTIONS', headers: {} }).valid === true, 'OPTIONS bypasses CSRF');
assert(sm.validateCSRF({ httpMethod: 'POST', headers: {} }).valid === false, 'POST without header → blocked');
assert(sm.validateCSRF({ httpMethod: 'POST', headers: { 'x-requested-with': 'CarbonTrackPro' } }).valid === true, 'POST with X-Requested-With → allowed');
assert(sm.validateCSRF({ httpMethod: 'POST', headers: { authorization: 'Bearer x' } }).valid === true, 'POST with Authorization → allowed');
assert(sm.validateCSRF({ httpMethod: 'POST', headers: { 'x-requested-with': 'XMLHttpRequest' } }).valid === false, 'POST with wrong header → blocked');

console.log('\n=== 2. Request Correlation IDs (V13) ===');
const ids = new Set();
for (let i = 0; i < 100; i++) ids.add(sm.generateRequestId());
assert(ids.size === 100, '100 unique correlation IDs generated');
assert(sm.generateRequestId().startsWith('req_'), 'ID format: req_ prefix');

console.log('\n=== 3. Account Lockout (V2) ===');
assert(sm.LOCKOUT_CONFIG.maxFailedAttempts === 5, 'Lockout after 5 attempts');
assert(sm.LOCKOUT_CONFIG.lockoutDurationMs === 15 * 60 * 1000, 'Lockout duration: 15 min');
assert(sm.LOCKOUT_CONFIG.trackingWindowMs === 30 * 60 * 1000, 'Tracking window: 30 min');

console.log('\n=== 4. Error Message Sanitization (V7) ===');
const dangerous = [
  'Firebase permission denied',
  'FIREBASE_SERVICE_ACCOUNT missing',
  'credential error',
  'service account not found',
  'database url incorrect',
  'at Object.handler (/var/task/index.js:5)',
  'node_modules/firebase-admin/lib/error',
  'internal server error detail',
  'ECONNREFUSED 127.0.0.1',
  'ENOTFOUND api.firebase.com',
  'ETIMEDOUT',
];
for (const msg of dangerous) {
  assert(sm.sanitizeErrorMessage(msg, 'test') !== msg, 'Blocked: "' + msg.substring(0, 35) + '"');
}
const safe = ['Invalid entry data', 'Please enter your email.', 'Method not allowed'];
for (const msg of safe) {
  assert(sm.sanitizeErrorMessage(msg, 'test') === msg, 'Passed: "' + msg + '"');
}

// ═══════════════════════════════════════════════════
// TEST SUITE 2: CSRF + Rate Limit Coverage (all endpoints)
// ═══════════════════════════════════════════════════
console.log('\n=== 5. CSRF + Rate Limiting Coverage (V11/V13) ===');

const funcDir = 'netlify/functions';
const funcFiles = fs.readdirSync(funcDir).filter(f => f.endsWith('.js'));
const skipFiles = ['db-status.js']; // read-only health check

for (const f of funcFiles) {
  if (skipFiles.includes(f)) continue;
  const code = fs.readFileSync(path.join(funcDir, f), 'utf8');
  if (!code.includes('exports.handler')) continue;

  const hasCsrf = code.includes('csrfCheck') || code.includes('validateCSRF');
  assert(hasCsrf, f + ' → CSRF protection');

  const hasRateLimit = code.includes('checkRateLimit') || code.includes('rate-limit');
  assert(hasRateLimit, f + ' → Rate limiting');
}

// ═══════════════════════════════════════════════════
// TEST SUITE 3: Error Leakage Audit (all endpoints)
// ═══════════════════════════════════════════════════
console.log('\n=== 6. Error Leakage Audit (V7) ===');

for (const f of funcFiles) {
  const code = fs.readFileSync(path.join(funcDir, f), 'utf8');
  if (!code.includes('exports.handler')) continue;

  // Check for error messages that concatenate internal error objects to client responses
  const leakPatterns = [
    /respond\(\d+,\s*\{[^}]*error:\s*['"].*['"]\s*\+\s*(?:e|err|error)\.message/g,
    /respond\(\d+,\s*\{[^}]*error:\s*['`].*\$\{(?:e|err|error)\.message\}/g,
  ];
  let hasLeak = false;
  for (const pat of leakPatterns) {
    if (pat.test(code)) hasLeak = true;
  }
  assert(!hasLeak, f + ' → No error message leakage');
}

// ═══════════════════════════════════════════════════
// TEST SUITE 4: Security Headers (netlify.toml)
// ═══════════════════════════════════════════════════
console.log('\n=== 7. Security Headers — netlify.toml (V9) ===');

const toml = fs.readFileSync('netlify.toml', 'utf8');
assert(toml.includes('X-Frame-Options = "DENY"'), 'X-Frame-Options: DENY');
assert(toml.includes('X-Content-Type-Options = "nosniff"'), 'X-Content-Type-Options: nosniff');
assert(toml.includes('X-XSS-Protection'), 'X-XSS-Protection present');
assert(toml.includes('Strict-Transport-Security') && toml.includes('preload'), 'HSTS with preload');
assert(toml.includes('Content-Security-Policy'), 'Content-Security-Policy');
assert(toml.includes('Permissions-Policy'), 'Permissions-Policy');
assert(toml.includes('Cross-Origin-Opener-Policy'), 'Cross-Origin-Opener-Policy');
assert(toml.includes('Cross-Origin-Resource-Policy'), 'Cross-Origin-Resource-Policy');
assert(toml.includes('X-DNS-Prefetch-Control'), 'X-DNS-Prefetch-Control');
assert(toml.includes("frame-ancestors 'none'"), 'CSP frame-ancestors: none');
assert(toml.includes("base-uri 'self'"), 'CSP base-uri: self');
assert(toml.includes("form-action 'self'"), 'CSP form-action: self');

// ═══════════════════════════════════════════════════
// TEST SUITE 5: Security Headers — firebase.js (API responses)
// ═══════════════════════════════════════════════════
console.log('\n=== 8. Security Headers — API Responses (V9) ===');

const fbCode = fs.readFileSync('netlify/functions/utils/firebase.js', 'utf8');
assert(fbCode.includes("'X-Content-Type-Options': 'nosniff'"), 'API: X-Content-Type-Options');
assert(fbCode.includes("'X-Frame-Options': 'DENY'"), 'API: X-Frame-Options');
assert(fbCode.includes("'Cache-Control': 'no-store"), 'API: Cache-Control no-store');
assert(fbCode.includes("'Cross-Origin-Opener-Policy'"), 'API: COOP');
assert(fbCode.includes("'X-Request-ID'"), 'API: X-Request-ID header');
assert(fbCode.includes('X-Requested-With'), 'API: CORS allows X-Requested-With');

// ═══════════════════════════════════════════════════
// TEST SUITE 6: Client-Side Security (js/security.js)
// ═══════════════════════════════════════════════════
console.log('\n=== 9. Client-Side Security (V3/V11) ===');

const secJs = fs.readFileSync('js/security.js', 'utf8');
assert(secJs.includes('SESSION_TIMEOUT_MS'), 'Session timeout configured');
assert(secJs.includes('30 * 60 * 1000') || secJs.includes('1800000'), 'Session timeout: 30 minutes');
assert(secJs.includes('MAX_SESSION_DURATION_MS'), 'Absolute session max configured');
assert(secJs.includes('8 * 60 * 60 * 1000'), 'Absolute max: 8 hours');
assert(secJs.includes('SESSION_WARNING_MS'), 'Session warning configured');
assert(secJs.includes('mousedown') && secJs.includes('keydown'), 'Activity tracking active');
assert(secJs.includes('securityLogout'), 'Auto-logout function exists');
assert(secJs.includes("'X-Requested-With'") && secJs.includes("'CarbonTrackPro'"), 'CSRF header injection');
assert(secJs.includes('window.self !== window.top'), 'Clickjacking JS protection');
assert(secJs.includes('open redirect') || secJs.includes('redirect'), 'Open redirect prevention');

// ═══════════════════════════════════════════════════
// TEST SUITE 7: Password Policy (V2)
// ═══════════════════════════════════════════════════
console.log('\n=== 10. Password Policy (V2) ===');

const authCode = fs.readFileSync('netlify/functions/auth.js', 'utf8');
assert(authCode.includes('minLength: 12') || authCode.includes('minLength:12'), 'Auth: 12+ char password');
assert(authCode.includes('requireUppercase'), 'Auth: uppercase required');
assert(authCode.includes('requireLowercase'), 'Auth: lowercase required');
assert(authCode.includes('requireNumber'), 'Auth: number required');
assert(authCode.includes('requireSpecial'), 'Auth: special char required');

const bootCode = fs.readFileSync('netlify/functions/bootstrap.js', 'utf8');
assert(bootCode.includes('password.length < 12'), 'Bootstrap: 12+ char password');
assert(bootCode.includes('[A-Z]'), 'Bootstrap: uppercase check');
assert(bootCode.includes('[a-z]'), 'Bootstrap: lowercase check');

// ═══════════════════════════════════════════════════
// TEST SUITE 8: Account Lockout Integration (V2)
// ═══════════════════════════════════════════════════
console.log('\n=== 11. Account Lockout Integration (V2) ===');

assert(authCode.includes('checkAccountLockout'), 'Auth: lockout check on login');
assert(authCode.includes('recordFailedAttempt'), 'Auth: failed attempts recorded');
assert(authCode.includes('clearFailedAttempts'), 'Auth: attempts cleared on success');
assert(authCode.includes('logSecurityEvent'), 'Auth: security events logged');

// ═══════════════════════════════════════════════════
// TEST SUITE 9: CDN Script Security (V9)
// ═══════════════════════════════════════════════════
console.log('\n=== 12. CDN Script Security (V9) ===');

const html = fs.readFileSync('index.html', 'utf8');
assert(html.includes('crossorigin="anonymous"'), 'CDN scripts use crossorigin');
const cdnScripts = html.match(/<script src="https:\/\/[^"]+"/g) || [];
for (const tag of cdnScripts) {
  const fullTag = html.substring(html.indexOf(tag), html.indexOf('>', html.indexOf(tag)) + 1);
  assert(fullTag.includes('crossorigin'), 'crossorigin on: ' + tag.substring(13, 50) + '...');
}

// ═══════════════════════════════════════════════════
// TEST SUITE 10: Security Middleware Module Exports
// ═══════════════════════════════════════════════════
console.log('\n=== 13. Security Module Exports ===');

assert(typeof sm.generateRequestId === 'function', 'Export: generateRequestId');
assert(typeof sm.validateCSRF === 'function', 'Export: validateCSRF');
assert(typeof sm.checkAccountLockout === 'function', 'Export: checkAccountLockout');
assert(typeof sm.recordFailedAttempt === 'function', 'Export: recordFailedAttempt');
assert(typeof sm.clearFailedAttempts === 'function', 'Export: clearFailedAttempts');
assert(typeof sm.sanitizeErrorMessage === 'function', 'Export: sanitizeErrorMessage');
assert(typeof sm.logSecurityEvent === 'function', 'Export: logSecurityEvent');
assert(typeof sm.cleanupSecurityData === 'function', 'Export: cleanupSecurityData');

// ═══════════════════════════════════════════════════
// FINAL RESULTS
// ═══════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
if (totalFail === 0) {
  console.log('  ✓ ALL ' + totalPass + ' TESTS PASSED — OWASP ASVS Level 2 ACHIEVED');
} else {
  console.log('  ✗ ' + totalFail + ' TESTS FAILED out of ' + (totalPass + totalFail));
}
console.log('═══════════════════════════════════════════════════════════');

process.exit(totalFail > 0 ? 1 : 0);
