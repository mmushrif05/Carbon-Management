# CLAUDE.md

## Project Overview

**CarbonTrack Pro** is a construction embodied carbon and sustainability tracking platform built for the King Salman International Airport (KSIA) project. It tracks material emissions (A1-A3), transport emissions (A4), and site emissions (A5) across a multi-role approval workflow.

## Architecture

This is a **zero-dependency monolithic single-page application (SPA)**. The entire application lives in a single `index.html` file (~660 lines) containing embedded CSS, HTML, and JavaScript. There is no framework, no build step, and no package manager.

### File Structure

```
Carbon-Management/
├── index.html      # Complete SPA (HTML + CSS + JS)
├── _redirects      # Netlify SPA routing config
└── CLAUDE.md       # This file
```

### Technology Stack

| Layer         | Technology                                  |
|---------------|---------------------------------------------|
| Frontend      | Vanilla HTML5 / CSS3 / ES6+ JavaScript      |
| Database      | Firebase Realtime Database v10.12.2 (compat) |
| Offline       | localStorage fallback                        |
| CDN deps      | Firebase SDK loaded via gstatic.com CDN      |
| Deployment    | Netlify (static hosting, `_redirects` file)  |
| Styling       | CSS custom properties (dark green theme)     |
| Charts        | Custom DOM-based bar charts + SVG donuts     |

### No Build Tools

- No `package.json`, no npm/yarn
- No bundler (Webpack, Vite, etc.)
- No transpiler (Babel, TypeScript)
- No test framework
- No linter/formatter configuration
- Dependencies loaded via `<script>` tags from CDN

## Key Concepts

### Data Flow

```
Firebase Realtime DB / localStorage
  → DB abstraction layer (DB object)
    → Global state object
      → render*() functions
        → DOM (innerHTML injection)
```

### Database Abstraction (`DB` object)

The `DB` object provides a dual-persistence layer:
- **Primary:** Firebase Realtime Database (when connected)
- **Fallback:** localStorage (when offline)
- **Dual-write:** Always writes to both stores

**Firebase paths:**
- `/projects/ksia/entries` — A1-A3/A4 material entries
- `/projects/ksia/a5entries` — A5 site emission entries

**Key methods:**
- `DB.getEntries()` / `DB.saveEntry()` / `DB.updateEntry()` / `DB.deleteEntry()`
- `DB.getA5Entries()` / `DB.saveA5Entry()` / `DB.deleteA5Entry()`
- `DB.onEntriesChange(callback)` / `DB.onA5Change(callback)` — real-time listeners

### Firebase Configuration

Firebase config is hardcoded in `index.html` with placeholder values (`YOUR_API_KEY`, etc.). To connect to a real Firebase project, replace these values directly in the HTML.

### Global State

```javascript
let state = {
  role: null,         // 'contractor' | 'consultant' | 'client'
  name: '',           // User display name
  page: 'dashboard',  // Current view
  entries: [],        // A1-A3/A4 material entries
  a5entries: []       // A5 site emission entries
};
```

State is mutated directly. Real-time Firebase listeners update `state.entries` / `state.a5entries` and trigger re-renders via `navigate(state.page)`.

### Page Routing

Client-side routing via `navigate(page)` which calls the corresponding render function:

| Page Key       | Render Function      | Description                        |
|----------------|----------------------|------------------------------------|
| `dashboard`    | `renderDashboard()`  | Analytics overview, charts         |
| `entry_a13`    | `renderEntry()`      | A1-A3/A4 material entry form       |
| `entry_a5`     | `renderA5()`         | A5 site energy/water entry         |
| `approvals`    | `renderApprovals()`  | Workflow approval management       |
| `monthly`      | `renderMonthly()`    | Monthly aggregation report         |
| `cumulative`   | `renderCumulative()` | Cumulative totals with charts      |
| `baselines`    | `renderBaselines()`  | Baseline emission factor tables    |
| `certifications` | `renderCerts()`    | Certification progress tracker     |
| `integrations` | `renderIntegrations()` | API hub and DB status            |

### User Roles and Permissions

Three roles with a linear approval chain:

1. **Contractor** — Enters material data and EPDs; submits for review
2. **Consultant** — Reviews entries; approves or rejects; sets baselines
3. **Client** — Final approval; dashboard and reporting access

Authentication is role-selection only (no passwords, no OAuth). This is a prototype/demo.

**Sidebar items are conditionally rendered by role.**

### Approval Workflow

```
Contractor submits → status: 'pending'
Consultant reviews → status: 'review' or 'rejected'
Client approves   → status: 'approved' or 'rejected'
```

## Data Models

### A1-A3/A4 Entry (Material)

```javascript
{
  id, category, type, qty, unit, actual, baseline, target,
  road, sea, train,           // Transport distances (km)
  a13B, a13A, a4, a14, pct,  // Calculated emissions & reduction %
  year, month, monthKey, monthLabel,
  district, contract, notes,
  status,                     // 'pending' | 'review' | 'approved' | 'rejected'
  submittedBy, role, submittedAt
}
```

### A5 Entry (Site Emissions)

```javascript
{
  id, source, qty, unit, ef, emission,
  year, month, monthKey, monthLabel
}
```

### Key Constants

- **`MATERIALS`** — 7 material categories (Concrete, Steel, Asphalt, Aluminum, Glass, Pipes, Earthwork) with types, baseline/target EFs
- **`A5_EFS`** — Energy sources (Diesel, Gasoline, Grid Electricity, Renewable) and water sources (Potable, Construction, TSE Recycled)
- **`TEF`** — Transport emission factors: `{ road: 0.0000121, sea: 0.0000026, train: 0.0000052 }`
- **`CERTS`** — 5 certifications: Envision, Mostadam, LEED, BREEAM, WELL

## Coding Conventions

### Naming

- `render*()` — Page rendering functions (generate HTML via template literals)
- `on*()` — Event handlers (e.g., `onCat()`, `onType()`)
- `$('id')` — Shorthand for `document.getElementById(id)`
- `fmt(v)` — Format number to 2 decimal places
- `fmtI(v)` — Format number as integer with locale separators

### Patterns

- **Rendering:** All UI is built as HTML strings via template literals, injected via `innerHTML`
- **Events:** Inline HTML event attributes (`onclick`, `onchange`, `oninput`)
- **IDs:** Generated with `Date.now()`
- **Calculations:** Inline in render functions and preview handlers
- **No modules:** Everything is in the global scope within a single `<script>` block

### CSS

- Dark theme only (no light mode)
- CSS custom properties defined on `:root`
- Primary accent: `--green: #34d399`
- Grid classes: `.form-row.c2`, `.c3`, `.c4` for column layouts
- Responsive breakpoints at 768px and 480px
- Font: `'Segoe UI', system-ui, sans-serif`

## Development Workflow

### Running Locally

No build step required. Open `index.html` directly in a browser, or serve with any static file server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js (npx)
npx serve .
```

Firebase features require replacing placeholder config values in the `firebaseConfig` object.

### Deploying

The app is configured for **Netlify** via the `_redirects` file:
```
/*    /index.html   200
```

Deploy by pushing to a connected Netlify site or drag-and-drop the project folder in the Netlify dashboard.

### Making Changes

Since the entire application is in `index.html`:

1. All CSS is in the `<style>` block at the top
2. All HTML structure is inline (login screen, app shell, loading overlay) and generated by render functions
3. All JavaScript is in a single `<script>` block at the bottom
4. Material data and emission factors are defined as constants early in the script

When modifying:
- **Adding a new page:** Create a `render*()` function, add it to the `R` routing object, and add a sidebar entry in `buildSidebar()`
- **Adding a material:** Add an entry to the `MATERIALS` constant with `unit`, `massFactor`, `efUnit`, and `types` array
- **Adding an A5 source:** Add to the appropriate array (`energy` or `water`) in `A5_EFS`
- **Modifying styles:** Edit the `<style>` block; use existing CSS variables for consistency

### Testing

No automated tests exist. Changes should be tested manually by:

1. Opening the app in a browser
2. Logging in with each role (Contractor, Consultant, Client)
3. Verifying the affected page renders correctly
4. Testing form submissions and calculations
5. Checking responsive layout at mobile breakpoints

## Common Pitfalls

- **Firebase config is placeholder:** The app will fall back to localStorage silently if Firebase is not configured
- **Single-file architecture:** All code is in `index.html` — be careful with large diffs and merge conflicts
- **No input sanitization:** `innerHTML` is used throughout; be mindful of XSS if user-supplied data is rendered
- **ID collisions:** `Date.now()` IDs can collide under rapid submission
- **Full re-renders:** `navigate()` re-renders the entire page content; there is no diffing or partial updates
