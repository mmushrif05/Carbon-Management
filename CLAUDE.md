# CLAUDE.md — CarbonTrack Pro

## Project Overview

CarbonTrack Pro v2.0 is a construction embodied carbon and sustainability tracking platform following EN 15978 lifecycle assessment standards (stages A1-A5). It tracks material emissions (A1-A3), transport emissions (A4), and site emissions (A5) for construction projects.

**Access model:** Invitation-only with role-based permissions (contractor, consultant, client).

## Tech Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (no framework, no build step)
- **Backend:** Netlify Functions (Node.js serverless)
- **Database:** Firebase Realtime Database
- **Auth:** Firebase Authentication (server-side only, no client SDK)
- **Email:** Nodemailer via SMTP
- **Hosting:** Netlify (static site + serverless functions)
- **Bundler:** esbuild (functions only, via Netlify)

## Repository Structure

```
.
├── index.html                    # Single HTML entry point (SPA)
├── css/
│   └── styles.css                # All styles (dark theme, responsive)
├── js/                           # Client-side modules
│   ├── app.js                    # Sidebar, navigation, init lifecycle
│   ├── auth.js                   # Login/register/invitation UI flows
│   ├── config.js                 # API base URL, apiCall() with token refresh
│   ├── data.js                   # Material definitions, emission factors, constants
│   ├── db.js                     # DB abstraction layer (server API + localStorage fallback)
│   ├── pages.js                  # All page render functions (dashboard, entries, reports, etc.)
│   └── state.js                  # Global state object, utility functions ($, fmt, fmtI)
├── netlify/
│   ├── netlify.toml              # Netlify build/function/redirect config
│   └── functions/                # Serverless API endpoints
│       ├── auth.js               # Login, register, token refresh, verify
│       ├── entries.js            # CRUD for A1-A3/A4 material entries
│       ├── a5.js                 # CRUD for A5 site emission entries
│       ├── invitations.js        # Invitation create/validate/revoke/resend
│       ├── send-email.js         # Email dispatch via nodemailer
│       ├── db-status.js          # Database connectivity health check
│       └── utils/
│           └── firebase.js       # Firebase Admin init, token verify, response helpers
├── package.json                  # Dependencies (firebase-admin, nodemailer)
├── _redirects                    # SPA fallback: /* -> /index.html
└── .gitignore                    # node_modules, .env, .netlify
```

## Development Setup

### Prerequisites
- Node.js (for serverless function dependencies)
- A `.env` file with the required environment variables (see below)

### Install & Run
```bash
npm install                       # Install firebase-admin and nodemailer
npx http-server .                 # Serve static files locally
# Or use Netlify CLI for full local dev with functions:
npx netlify dev
```

There are **no npm scripts** defined in package.json. Netlify handles the build.

### Environment Variables

| Variable | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Base64-encoded Firebase service account JSON |
| `FIREBASE_DATABASE_URL` | Firebase Realtime Database URL |
| `FIREBASE_API_KEY` | Firebase REST API key (used in auth function) |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (587 default, auto-SSL on 465) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `APP_URL` / `URL` | Application URL (for invitation links in emails) |

## Architecture

### Frontend

- **No framework.** All UI is rendered via `render*()` functions in `js/pages.js` using template literals and direct DOM manipulation.
- **SPA routing** via a `navigate(page)` function in `js/app.js` that maps page IDs to render functions.
- **Global state** lives in a `state` object (`js/state.js`): `{ role, name, page, entries, a5entries, invitations }`.
- **DOM access** uses a `$(id)` shorthand for `document.getElementById(id)`.
- **Formatting helpers:** `fmt()` for 2-decimal numbers, `fmtI()` for rounded integers.
- **Data persistence:** localStorage keys prefixed with `ct_` (e.g., `ct_auth_token`, `ct_entries`, `ct_a5entries`).

### Backend (Netlify Functions)

- All API routes go through `/api/*` which Netlify redirects to `/.netlify/functions/:splat`.
- Each function is a standalone handler exporting `handler(event, context)`.
- Shared Firebase initialization in `netlify/functions/utils/firebase.js` provides: `getDb()`, `getAuth()`, `verifyToken(event)`, `respond(status, body)`, `optionsResponse()`.
- All functions handle CORS preflight via `OPTIONS` check at the top.
- Token-based auth: client sends `Authorization: Bearer <token>`, server verifies via Firebase Admin SDK.

### Database (Firebase Realtime DB)

```
/projects/ksia/
├── entries/{entryId}          # A1-A3/A4 material entries
├── a5entries/{id}             # A5 site emission entries
└── invitations/{inviteId}     # Invitation records
/users/{uid}                   # User profiles (name, email, role, project)
```

### Auth Flow

1. Invitation link with token -> validate -> registration form
2. Firebase Auth creates user -> server stores profile in DB
3. Client receives JWT tokens -> stored in localStorage
4. `apiCall()` in `config.js` auto-refreshes expired tokens on 401
5. Offline: cached server-verified profile allows temporary read-only access

## Key Conventions

### Code Style
- Compact, functional style with short variable names in tight scopes (`e`, `m`, `r`, `t`)
- Section headers use `// ===== SECTION NAME =====` comment blocks
- Template literals for inline HTML rendering (no JSX, no template engine)
- No TypeScript, no ESLint, no Prettier configured
- CommonJS (`require`) in server functions; browser globals on the frontend

### API Pattern
All API calls use a single `apiCall(endpoint, options)` function from `config.js` that:
- Attaches the auth token from localStorage
- Auto-retries with token refresh on 401 responses
- Returns the raw `fetch` Response object

### DB Abstraction
The `DB` object in `db.js` wraps all data operations:
- Calls server API when `dbConnected === true`
- Falls back to localStorage when offline
- Caches server responses in localStorage as backup
- Provides polling-based change listeners (`onEntriesChange`, `onA5Change`) at 30-second intervals

### Roles & Permissions
- **contractor**: Data entry (A1-A3, A5), submit for review
- **consultant**: Review contractor submissions, manage baselines, enter data
- **client**: Final approval authority, view all reports

### Carbon Calculations
- **A1-A3 Baseline:** `qty * baseline_emission_factor`
- **A1-A3 Actual:** `qty * actual_emission_factor` (from EPD)
- **A4 Transport:** `mass_kg * distance_km * transport_emission_factor`
- **A5 Site:** `qty * source_emission_factor`
- **Reduction %:** `(baseline - actual) / baseline * 100`
- Transport emission factors (kgCO2e/ton-km): road=0.0000121, sea=0.0000026, train=0.0000052

## Deployment

Push to the connected Git branch triggers automatic Netlify deployment:
- Static files served from root directory
- Serverless functions bundled with esbuild from `netlify/functions/`
- Environment variables configured in Netlify dashboard

## No Tests or Linting

This project currently has:
- No test framework or test files
- No ESLint/Prettier configuration
- No CI/CD pipeline config (relies on Netlify's built-in CI)
- No npm scripts

Verify changes by running the app locally with `npx netlify dev` and testing in the browser.

## Common Modification Patterns

- **Add a new page:** Create a `render*()` function in `js/pages.js`, add route mapping in `navigate()` in `js/app.js`, add sidebar entry in `buildSidebar()`.
- **Add an API endpoint:** Create a new file in `netlify/functions/`, use shared utils from `utils/firebase.js`, handle CORS OPTIONS, verify token with `verifyToken(event)`.
- **Add a material type:** Update the `MATERIALS` object in `js/data.js`.
- **Add an emission source:** Update the `A5_EFS` object in `js/data.js`.
- **Modify styles:** Edit `css/styles.css` (single file, dark theme with CSS variables).
