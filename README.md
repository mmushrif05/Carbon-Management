# CarbonTrack Pro

**Open-source construction embodied carbon tracking and sustainability platform.**

Track, manage, and reduce carbon emissions across construction projects — from first tender to final day on site.

## Features

- **Material Emissions Tracking** — A1-A3 embodied carbon from 200+ materials (ICE Database v3.0)
- **Site Emissions Tracking** — A5 site-based emissions (fuel, water, electricity)
- **AI-Powered BOQ Parsing** — Upload Excel/CSV bill of quantities, get automatic carbon classification
- **Document Intelligence** — Upload technical reports and get AI analysis with page-level citations
- **Carbon Advisor** — AI-powered reduction recommendations per project
- **Approval Workflows** — Multi-level review: Contractor submits, Consultant reviews, Client approves
- **Sustainability Certifications** — Track credits for LEED, BREEAM, Mostadam, Envision, and WELL
- **13-Level RBAC** — Granular role-based access from Viewer to Tenant Super Admin
- **Enterprise Security** — AES-256-GCM encryption, OWASP ASVS Level 2 compliance
- **Multi-Tenant** — Organization hierarchy with contractor-consultant-client relationships

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (no framework) |
| Backend | Node.js serverless functions |
| Database | Firebase Realtime Database |
| AI | Anthropic Claude API |
| Hosting | Netlify |
| Email | Nodemailer (SMTP) |

## Quick Start

### Prerequisites

- Node.js 18+
- A [Firebase](https://console.firebase.google.com) project (Realtime Database + Authentication)
- A [Netlify](https://www.netlify.com) account
- An [Anthropic](https://console.anthropic.com) API key (for AI features)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/Carbon-Management.git
cd Carbon-Management

# Install dependencies
npm install

# Copy environment template and fill in your values
cp .env.example .env

# Start local development
npx netlify dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|---|---|---|
| `PROJECT_ID` | Yes | Your project identifier (used in database paths) |
| `PROJECT_NAME` | Yes | Display name for your project |
| `FIREBASE_API_KEY` | Yes | Firebase client API key |
| `FIREBASE_DATABASE_URL` | Yes | Firebase Realtime Database URL |
| `FIREBASE_SERVICE_ACCOUNT` | Yes | Base64-encoded Firebase service account JSON |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI features |
| `DATA_ENCRYPTION_KEY` | Yes | 64-char hex key for AES-256 encryption |
| `BOOTSTRAP_KEY` | Yes | One-time key for initial admin setup |

See `.env.example` for the full list with descriptions.

### First-Time Setup

1. Deploy to Netlify (or run locally with `netlify dev`)
2. Set the `BOOTSTRAP_KEY` environment variable
3. Navigate to the app and use the bootstrap flow to create your first admin user
4. The admin can then invite other users (consultants, contractors) via the invitation system

## Project Structure

```
/                              Static frontend
/js/                           Frontend JavaScript modules
  app.js                       Navigation and initialization
  auth.js                      Login, register, password reset
  data.js                      Material database (ICE DB)
  db.js                        Database abstraction layer
  pages.js                     All page renderers
  tender.js                    BOQ parsing and unit conversion
/css/                          Stylesheets
/netlify/functions/            Serverless backend
  auth.js                      Authentication handlers
  entries.js                   Material entry CRUD
  parse-boq.js                 AI-powered BOQ classification
  carbon-advisor.js            AI carbon analysis
  carbon-intelligence.js       Document RAG retrieval
  send-email.js                Email notifications
  organizations.js             Organization management
  /lib/                        Security utilities
    encryption.js              AES-256-GCM encryption
    ai-privacy.js              PII redaction for AI calls
    rate-limit.js              API rate limiting
    permissions.js             RBAC role evaluator
  /utils/
    firebase.js                Firebase initialization
    config.js                  Project configuration
```

## How It Works

1. **Client** creates a project and invites consultant firms
2. **Consultants** set up contractor assignments and review submissions
3. **Contractors** enter material data (manually or via AI-parsed BOQ uploads)
4. Data flows through an approval workflow: Draft -> Pending -> Approved
5. Reports and dashboards show cumulative emissions, trends, and certification progress

## Security

CarbonTrack Pro meets **OWASP ASVS Level 2** standards. See [SECURITY.md](SECURITY.md) for full details:

- AES-256-GCM encryption at rest
- TLS 1.2+ in transit
- 13-level role-based access control
- AI privacy layer with PII redaction
- Rate limiting and account lockout
- CSRF protection and security headers
- Comprehensive audit logging

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

[Apache License 2.0](LICENSE)
