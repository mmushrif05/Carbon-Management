# CarbonTrack Pro — Enterprise Data Privacy & Security

## OWASP ASVS Level 2 Compliance Status: ACHIEVED

CarbonTrack Pro meets **OWASP Application Security Verification Standard (ASVS) Level 2** requirements — the recommended security level for applications that handle sensitive business data.

## Overview

CarbonTrack Pro implements enterprise-grade data protection designed for organizations operating under strict data privacy regulations and international standards (e.g., GDPR, regional data protection laws).

This document describes the security architecture, data handling practices, and compliance controls available to enterprise customers.

---

## 1. Data Protection Architecture

### 1.1 Encryption at Rest (AES-256-GCM)
- All uploaded documents are **encrypted using AES-256-GCM** before storage in Firebase
- Each record uses a unique random 96-bit IV (Initialization Vector)
- 128-bit authentication tags ensure data integrity (tamper detection)
- Encryption key is stored in server environment variables — never in code or client-side
- **Even if the database is compromised, document content is unreadable without the key**

### 1.2 Encryption in Transit
- All API calls use **TLS 1.2+** (HTTPS enforced)
- HSTS headers ensure browsers never downgrade to HTTP
- Firebase connections use Google's transport security

### 1.3 No Developer Access to Data
- Document content is encrypted before storage — developers cannot read it from the database
- Encryption keys are managed through environment variables with restricted access
- Audit logs track all data access without storing actual content

---

## 2. AI Data Privacy

### 2.1 How AI Integration Works
CarbonTrack Pro uses the **Anthropic Claude API** for carbon analysis. Here's how data is protected:

| Protection | Description |
|---|---|
| **No AI Training** | Anthropic does **NOT** use API data to train models (by default per Anthropic's data policy) |
| **PII Redaction** | Emails, phone numbers, ID numbers, currency values are automatically stripped before AI calls |
| **Name Anonymization** | In "maximum" privacy mode, project names, contractor names, and company names are replaced with anonymous tokens |
| **Prompt Injection Prevention** | All user inputs are scanned for manipulation attempts before being included in AI prompts |
| **Audit Trail** | Every AI call is logged with metadata (timestamp, user, data profile hash) — but NOT the actual content |
| **De-anonymization** | AI responses are translated back to real names on the server, so anonymized data never leaves the server |

### 2.2 Privacy Levels (Configurable)

| Level | PII Redaction | Name Anonymization | Recommended For |
|---|---|---|---|
| `standard` | No | No | Internal/non-sensitive projects |
| `enhanced` | Yes | No | Most enterprise deployments |
| `maximum` | Yes | Yes | Government, defense, highly sensitive projects |

Set via environment variable: `DATA_PRIVACY_LEVEL=enhanced`

### 2.3 Data Flow Diagram
```
User uploads document
       │
       ▼
[Input Sanitization] → Block malicious content
       │
       ▼
[Chunk & Tag] → Split into searchable segments
       │
       ▼
[AES-256 Encrypt] → Encrypt each chunk
       │
       ▼
[Firebase Storage] → Stored encrypted at rest
       │
       ▼
When AI analysis requested:
       │
       ▼
[Decrypt on Server] → Decrypted in memory only
       │
       ▼
[PII Redaction] → Strip personal data
       │
       ▼
[Anonymization] → Replace names with tokens
       │
       ▼
[Claude API Call] → Send sanitized data
       │
       ▼
[De-anonymize Response] → Restore real names
       │
       ▼
[Return to User] → Clean analysis with real names
```

---

## 3. Access Control

### 3.1 Authentication
- **Invitation-only registration** — no self-signup
- **Firebase Authentication** with server-side token verification
- **Strong password policy**: 12+ characters, uppercase, lowercase, numbers, special characters
- **Rate limiting**: 10 auth attempts per minute per IP (brute force protection)
- **Account lockout**: 5 failed attempts → 15-minute lockout (prevents brute force)
- **Session timeout**: 30 minutes idle → auto-logout, 8 hours absolute max session
- **Session warning**: Users are warned 5 minutes before idle timeout

### 3.2 Role-Based Access Control (13 Levels)
| Level | Role | Access |
|---|---|---|
| 13 | Tenant Super Admin | Full system access |
| 12 | Portfolio Admin | All projects, users, settings |
| 11 | Org Director | Organization management, approvals |
| 10 | Org Admin | Organization users |
| 9 | Org Manager | Organization read + review |
| 8 | Project Admin | Project settings, users, packages |
| 7 | Project Manager | Project data, approvals, assignments |
| 6 | Reviewer | Read + review emissions |
| 5 | Package Lead | Package management + approvals |
| 4 | Package Reviewer | Package review only |
| 3 | Package Contributor | Submit emissions data |
| 2 | Data Entry | Enter emission data |
| 0-1 | Viewer | Read-only access |

### 3.3 Scope-Based Isolation
- Users can only access projects they are explicitly assigned to
- Organization-level boundaries prevent cross-org data leakage
- Role bindings are scoped to: Tenant → Project → Package

---

## 4. API Security

### 4.1 Security Headers
All responses (static pages AND API) include:
- `X-Content-Type-Options: nosniff` — Prevent MIME sniffing
- `X-Frame-Options: DENY` — Prevent clickjacking
- `X-XSS-Protection: 1; mode=block` — XSS filter
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` — Force HTTPS with preload
- `Referrer-Policy: strict-origin-when-cross-origin` — Limit referrer leakage
- `Content-Security-Policy` — Strict CSP with domain allowlisting for CDN scripts
- `Permissions-Policy` — Disable camera, mic, geolocation, payment
- `Cross-Origin-Opener-Policy: same-origin` — Prevent cross-origin window access
- `Cross-Origin-Resource-Policy: same-origin` — Block cross-origin resource loading
- `Cache-Control: no-store, no-cache, must-revalidate` — Prevent sensitive data caching
- `X-DNS-Prefetch-Control: off` — Prevent DNS prefetching
- `X-Request-ID` — Correlation ID on every API response for audit traceability

### 4.2 CORS Restriction
- In production, set `ALLOWED_ORIGINS` to restrict which domains can call the API
- Example: `ALLOWED_ORIGINS=https://your-app.netlify.app,https://your-domain.com`

### 4.3 CSRF Protection
- All state-changing API requests require `X-Requested-With: CarbonTrackPro` header
- CORS preflight prevents cross-origin requests from setting custom headers
- Server validates the header and rejects requests without it

### 4.4 Rate Limiting (All Endpoints)
| Endpoint | Limit |
|---|---|
| Authentication (login/register) | 10 requests/minute |
| AI analysis | 5 requests/minute |
| Document upload | 10 requests/minute |
| All other API endpoints | 60 requests/minute |

### 4.5 Input Validation
- File name sanitization (path traversal prevention)
- Payload size limits (10MB documents, 5MB AI requests)
- HTML entity encoding for stored text
- Prompt injection pattern detection
- Error message sanitization (prevents internal detail leakage)

### 4.6 Request Correlation
- Every API response includes a unique `X-Request-ID` header
- Request IDs are traceable through audit logs for incident response

### 4.7 Client-Side Security
- **Clickjacking protection**: JS frame-busting (backup to X-Frame-Options header)
- **Open redirect prevention**: Query parameters pointing to external URLs are blocked
- **CDN script isolation**: External scripts loaded with `crossorigin="anonymous"`
- **Fetch interception**: All API calls automatically include CSRF protection header

---

## 5. Audit & Compliance

### 5.1 Security Event Monitoring
Suspicious activities are automatically logged with severity levels:
| Event Type | Severity | Description |
|---|---|---|
| `login_failed` | MEDIUM | Failed authentication attempt |
| `lockout_triggered` | HIGH | Account locked after repeated failures |
| `login_attempt_while_locked` | HIGH | Login attempt on a locked account |
| `csrf_blocked` | HIGH | Request blocked by CSRF protection |
| `rate_limited` | MEDIUM | Request blocked by rate limiter |

Security events are stored in `_security/events/` with automatic 7-day cleanup.

### 5.2 Comprehensive Audit Trail
Every significant action is logged:
- User authentication events (success and failure)
- Role assignments and changes
- Data access and modifications
- AI API calls (metadata only — content NOT logged)
- Break-glass emergency overrides (HIGH severity)
- Data deletion requests
- Account lockout events

### 5.2 AI Audit Logs
Each AI call records:
- Timestamp, user ID, endpoint
- Privacy level applied
- Number of document chunks analyzed
- SHA-256 hash of prompt (for traceability without content storage)
- Whether PII was redacted

### 5.3 Data Subject Rights
- **Right to Access**: Users can export their data metadata via the `data-privacy` endpoint
- **Right to Deletion**: Users can request data deletion, creating a tracked request
- **Right to Know**: Privacy status endpoint shows exactly what protections are active

---

## 6. Environment Variables for Security

| Variable | Required | Description |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | Yes (production) | 64-char hex key for AES-256 encryption. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DATA_PRIVACY_LEVEL` | No | `standard`, `enhanced` (default), or `maximum` |
| `ALLOWED_ORIGINS` | Yes (production) | Comma-separated allowed CORS origins |
| `ANTHROPIC_API_KEY` | Yes | Claude API key (stored server-side only) |
| `FIREBASE_SERVICE_ACCOUNT` | Yes | Base64-encoded Firebase credentials |
| `FIREBASE_DATABASE_URL` | Yes | Firebase Realtime Database URL |
| `FIREBASE_API_KEY` | Yes | Firebase client API key |

---

## 7. Deployment Checklist for Enterprise

Before deploying for an enterprise client:

- [ ] Generate and set `DATA_ENCRYPTION_KEY` in Netlify env vars
- [ ] Set `DATA_PRIVACY_LEVEL=enhanced` (or `maximum` for government/defense projects)
- [ ] Set `ALLOWED_ORIGINS` to production domain(s) only
- [ ] Verify Firebase Security Rules restrict direct database access
- [ ] Enable Firebase App Check for additional API protection
- [ ] Review and test rate limiting thresholds
- [ ] Confirm HTTPS is enforced on the hosting platform
- [ ] Run a security audit of all environment variables
- [ ] Test the `data-privacy` status endpoint to verify all protections are active

---

## 8. Anthropic (Claude) Data Policy

Per Anthropic's commercial API terms:
- **API inputs and outputs are NOT used for model training**
- Data is processed for the duration of the API call and not retained beyond that
- Anthropic maintains SOC 2 Type II compliance
- Full policy: https://www.anthropic.com/policies

For enterprises requiring data to never leave a specific jurisdiction, consider deploying a self-hosted LLM model as an alternative to the Claude API.

---

## 9. OWASP ASVS Level 2 Compliance Matrix

| ASVS Category | Requirement | Status |
|---|---|---|
| **V2: Authentication** | Strong password policy (12+ chars, complexity) | Implemented |
| **V2: Authentication** | Account lockout after failed attempts | Implemented |
| **V2: Authentication** | Rate limiting on authentication endpoints | Implemented |
| **V3: Session Management** | Session timeout on inactivity (30 min) | Implemented |
| **V3: Session Management** | Absolute session timeout (8 hours) | Implemented |
| **V3: Session Management** | Session warning before expiry | Implemented |
| **V4: Access Control** | Role-based access control (RBAC) | Implemented |
| **V4: Access Control** | Invitation-only registration | Implemented |
| **V4: Access Control** | Scope-based data isolation | Implemented |
| **V5: Input Validation** | Input sanitization (XSS, path traversal) | Implemented |
| **V5: Input Validation** | Payload size validation | Implemented |
| **V5: Input Validation** | Prompt injection detection | Implemented |
| **V7: Error Handling** | Error message sanitization | Implemented |
| **V7: Error Handling** | No stack traces in responses | Implemented |
| **V8: Data Protection** | Encryption at rest (AES-256-GCM) | Implemented |
| **V8: Data Protection** | Encryption in transit (TLS 1.2+) | Implemented |
| **V8: Data Protection** | PII redaction for AI processing | Implemented |
| **V8: Data Protection** | No-cache headers on API responses | Implemented |
| **V9: Security Headers** | Content-Security-Policy (static + API) | Implemented |
| **V9: Security Headers** | HSTS with preload | Implemented |
| **V9: Security Headers** | X-Frame-Options: DENY | Implemented |
| **V9: Security Headers** | X-Content-Type-Options: nosniff | Implemented |
| **V9: Security Headers** | Cross-Origin-Opener-Policy | Implemented |
| **V9: Security Headers** | Permissions-Policy | Implemented |
| **V11: Business Logic** | CSRF protection via custom headers | Implemented |
| **V11: Business Logic** | Rate limiting on all API endpoints | Implemented |
| **V11: Business Logic** | Audit logging with correlation IDs | Implemented |
| **V13: API Security** | CORS origin restriction | Implemented |
| **V13: API Security** | Request correlation IDs | Implemented |
| **V13: API Security** | Security event monitoring & logging | Implemented |

---

## Contact

For security inquiries or to request a penetration test report, contact the CarbonTrack Pro security team.
