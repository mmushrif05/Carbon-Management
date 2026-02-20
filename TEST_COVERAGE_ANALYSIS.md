# Test Coverage Analysis — CarbonTrack Pro

## Executive Summary

**Current test coverage: 0%** — The codebase has no automated tests, no test framework, and no test configuration. There are 19 source files totaling ~7,400 lines of code with zero test coverage.

This document identifies the highest-value areas for introducing tests, prioritized by risk and complexity.

---

## Codebase Overview

| Layer | Files | Lines (approx.) | Test Coverage |
|-------|-------|-----------------|---------------|
| Frontend JS (`/js/`) | 8 | 4,177 | 0% |
| Backend Functions (`/netlify/functions/`) | 10 | 3,206 | 0% |
| Backend Utilities | 1 | 55 | 0% |
| **Total** | **19** | **~7,400** | **0%** |

---

## Priority 1 — Critical Business Logic (Pure Functions)

These modules contain pure, testable logic with no external dependencies. They should be tested first because they are deterministic, easy to unit test, and carry the highest risk of silent regressions.

### 1.1 Material Matching Engine (`js/data.js`)

**Functions to test:**
- `lookupTenderGWP(desc, catHint, unitHint)` — The main GWP lookup dispatcher
- `matchToA13Materials(desc, catHint)` — Matches BOQ descriptions to A1-A3 materials
- `matchToICE(desc, catHint, unitHint)` — Matches to ICE database materials
- `findColumn(headers, keywords, excludeCols)` — Scoring-based column detection for Excel/CSV parsing
- `parseCSV(text)` — CSV parser with quoted-field support
- `isICEMEPBelowThreshold(category, typeName)` — MEP coverage threshold check

**Why this is highest priority:**
- These functions compute carbon emission factors — errors here silently produce **incorrect environmental data** in reports
- The fuzzy matching algorithms (concrete grade matching, pipe size matching, keyword scoring) have complex branching logic prone to edge-case bugs
- `matchToA13Materials` alone has 8+ regex patterns and category-specific scoring rules
- No user would notice a wrong material match without validating against source data

**Example test cases needed:**
```
lookupTenderGWP("C30-40 Concrete for Foundations", "Concrete", "m³")
  → should match A1-A3 Concrete, type "C30-40", baseline 431

lookupTenderGWP("Supply 200mm dia HDPE pipe", null, "m")
  → should match ICE Pipes, "HDPE Pipe 250mm" or similar

lookupTenderGWP("Galvanized Steel Ductwork", "MEP - HVAC", "kg")
  → should match ICE MEP-HVAC, coveragePct >= 80, non-zero baseline

matchToA13Materials("lean mix blinding concrete", null)
  → should match Concrete C15-20

matchToA13Materials("rebar B500B reinforcement", null)
  → should match Steel Rebar

parseCSV('"desc with, comma",100,m²\n')
  → should handle quoted commas correctly

findColumn(["Item No.", "Description", "Qty", "Unit"], ["qty", "quantity"], [])
  → should return index 2
```

### 1.2 Unit Conversion Engine (`js/tender.js:1-180`)

**Functions to test:**
- `extractThickness(description)` — Parses thickness/depth from BOQ text
- `normalizeUnitStr(u)` — Normalizes messy unit strings
- `convertBOQQuantity(boqQty, boqUnit, materialUnit, thickness, massFactor)` — Unit conversion logic
- `extractUnitFromDescription(desc)` — Fallback unit extraction
- `isRecognizedUnit(normalizedUnit)` — Unit validation

**Why this is high priority:**
- Unit conversion errors directly multiply carbon calculations (e.g., m² → m³ requires thickness — getting this wrong scales the result by orders of magnitude)
- `extractThickness` must distinguish pipe diameters from slab thicknesses — a subtle but critical distinction
- `normalizeUnitStr` handles real-world garbage input like `"(Provisional Sum) m²"` and must normalize correctly

**Example test cases needed:**
```
extractThickness("Portland cement concrete, depth 450mm")
  → { value: 0.45, source: 'desc' }

extractThickness("200mm dia HDPE pipe")
  → null (pipe diameter, not thickness)

extractThickness("200mm dia pipe with 150mm thick concrete surround")
  → { value: 0.15, source: 'desc' } (thickness keyword takes priority)

normalizeUnitStr("Provisional m²") → "m2"
normalizeUnitStr("sq. m") → "m2"
normalizeUnitStr("tonnes") → "tons"
normalizeUnitStr("28,894") → "" (garbage input)

convertBOQQuantity(100, "m²", "m³", 0.45, 2400)
  → { convertedQty: 45, conversionType: 'area_to_volume' }

convertBOQQuantity(5000, "kg", "tons", null, 1)
  → { convertedQty: 5, conversionType: 'kg_to_tons' }
```

---

## Priority 2 — Backend API Security & Validation

These serverless functions handle authentication, authorization, and data integrity. Bugs here can lead to data leaks, privilege escalation, or data corruption.

### 2.1 Entries API (`netlify/functions/entries.js`)

**What to test:**
- **Role-based filtering in `handleList`**: Contractor sees only own entries, consultant sees assigned contractors' entries, client sees all
- **Input validation in `handleSave`**: Rejects missing category/type, zero/negative quantities
- **Field whitelisting in `handleUpdate`**: Only `allowedFields` can be updated (prevents mass-assignment attacks)
- **Assignment-based access in `handleUpdate`**: Consultant can only approve entries from assigned contractors
- **Batch validation in `handleBatchSave`**: All entries must be valid; partial batches are rejected

**Example test cases needed:**
```
handleList as contractor
  → returns only entries where submittedByUid === decoded.uid

handleList as consultant with assignments
  → returns only own + assigned contractors' entries

handleSave with missing category
  → returns 400

handleUpdate with non-whitelisted field (e.g., "submittedByUid")
  → field is ignored, not written to DB

handleBatchSave with one invalid entry
  → entire batch rejected (400)
```

### 2.2 Auth API (`netlify/functions/auth.js`)

**What to test:**
- **Invitation enforcement in `handleRegister`**: Cannot register without valid, pending, non-expired invitation token
- **Email matching**: Registration email must match invitation email
- **Role assignment**: User gets role from invitation, not from request body
- **Password reset security**: `handleForgotPassword` never reveals whether an email exists
- **Token refresh flow**: `handleRefresh` with expired/invalid token

**Example test cases needed:**
```
handleRegister without inviteToken → 403
handleRegister with expired token → 400
handleRegister with email mismatch → 400
handleRegister with already-accepted invitation → 400
handleForgotPassword with non-existent email → 200 (no leak)
handleLogin with correct credentials but missing profile → 403
```

### 2.3 Organizations API (`netlify/functions/organizations.js`)

**What to test:**
- **Role gating**: Only clients/consultants can create orgs, only clients can delete
- **Type validation**: Consultants → consultant_firm, contractors → contractor_company
- **Cascading deletes**: Deleting an org removes associated org_links
- **Cannot delete org with assigned users**
- **Duplicate link prevention**

### 2.4 Invitations API (`netlify/functions/invitations.js`)

**What to test:**
- **Invitation permissions**: Consultant cannot invite beyond their permission level
- **Duplicate prevention**: Cannot create invitation if user already registered or has pending invite
- **Token validation**: Expired, revoked, and already-accepted tokens are rejected
- **Token sanitization**: List endpoint strips tokens before returning to client

---

## Priority 3 — Server-Side Parsing & AI Integration

### 3.1 BOQ Parser (`netlify/functions/parse-boq.js`)

**Functions to test:**
- `buildPrompt(text, fileName, chunkInfo)` — Prompt construction
- `parseAIResponse(content)` — JSON extraction from AI responses (handles markdown code blocks)
- `cleanItems(items)` — Validates and normalizes parsed items
- `splitIntoChunks(text, maxCharsPerChunk)` — Text chunking at line boundaries

**Why this matters:**
- `parseAIResponse` handles real-world AI output that may have markdown wrapping, which needs reliable stripping
- `cleanItems` must catch and fix AI mistakes (e.g., using item numbers as descriptions)
- `splitIntoChunks` must never split in the middle of a line item

**Example test cases needed:**
```
parseAIResponse('```json\n[{"description":"test","qty":1}]\n```')
  → [{ description: "test", qty: 1 }]

cleanItems([{ description: "C2.97", itemNo: "C2.97", qty: 100, category: "Concrete" }])
  → description should be corrected (not equal to itemNo)

splitIntoChunks("line1\nline2\nline3", 10)
  → chunks split at newline boundaries
```

---

## Priority 4 — Database Abstraction Layer

### 4.1 DB Module (`js/db.js`)

**What to test:**
- **Offline fallback**: When `dbConnected = false`, all methods return from localStorage
- **Cache consistency**: `saveEntry` saves to both server and localStorage
- **Draft entry lifecycle**: `addDraftEntry` → `getDraftEntries` → `removeDraftEntry` → `clearDraftEntries`
- **Error resilience**: API failures are caught and fall back to cache gracefully
- **`submitBatch` requires connection**: Throws when `dbConnected = false`

---

## Priority 5 — Emission Factor Data Integrity

### 5.1 Material Data Constants (`js/data.js` — MATERIALS, ICE_MATERIALS, A5_EFS)

**What to test:**
- Every material category has `unit`, `massFactor`, `efUnit`, and non-empty `types` array
- Every type has `name`, `baseline`, and `target` fields with numeric values
- Every ICE MEP type has `coveragePct` defined
- Types with `coveragePct < 80` have `baseline = 0` (verified at lookup time)
- No duplicate type names within a category
- Cross-reference: A1-A3 MATERIALS categories match entries in ICE_MATERIALS where applicable

**Example test cases needed:**
```
All MATERIALS entries have valid structure
All ICE_MATERIALS.types.baseline >= 0
No duplicate type names in any category
A5_EFS.energy and water arrays have ef > 0 (except Renewable)
TEF transport factors are positive numbers
```

---

## Recommended Test Infrastructure Setup

### Test Framework: Jest (recommended)

```json
// Additions to package.json
{
  "devDependencies": {
    "jest": "^29.7.0"
  },
  "scripts": {
    "test": "jest",
    "test:coverage": "jest --coverage"
  }
}
```

### Suggested File Structure

```
tests/
  unit/
    data.test.js           # Material matching, CSV parser, column detection
    tender-units.test.js   # Unit conversion, thickness extraction, normalization
    parse-boq.test.js      # AI response parsing, item cleaning, text chunking
    data-integrity.test.js # Structural validation of MATERIALS / ICE data
  integration/
    entries.test.js        # Entries API handler tests (mocked Firebase)
    auth.test.js           # Auth API handler tests (mocked Firebase)
    organizations.test.js  # Organizations API tests (mocked Firebase)
    invitations.test.js    # Invitations API tests (mocked Firebase)
    db.test.js             # DB abstraction with mocked fetch/localStorage
```

### Testing Strategy Notes

1. **Frontend pure functions** (Priority 1) can be tested immediately with zero mocking by extracting them from browser globals
2. **Backend functions** (Priority 2-3) require mocking `firebase-admin` and the Firebase Realtime Database — a mock factory for `getDb()` returning a stub DB reference is the key enabler
3. **The DB module** (Priority 4) requires mocking both `fetch` (for API calls) and `localStorage`
4. **Data integrity tests** (Priority 5) are pure assertions against the data constants — fast and easy to write

---

## Summary of Recommendations

| Priority | Area | Risk Level | Effort | Impact |
|----------|------|-----------|--------|--------|
| **P1** | Material matching + unit conversion | **Critical** | Low | Prevents incorrect carbon calculations |
| **P2** | Backend API auth/access control | **High** | Medium | Prevents security vulnerabilities |
| **P3** | BOQ parsing / AI response handling | **Medium** | Low | Prevents data import failures |
| **P4** | DB abstraction / offline fallback | **Medium** | Medium | Ensures data reliability |
| **P5** | Data constant integrity | **Low** | Very Low | Catches data entry errors |

Starting with **P1 (material matching + unit conversion)** provides the highest ROI: these are pure functions, easy to test, and directly impact the accuracy of the platform's core carbon accounting output.
