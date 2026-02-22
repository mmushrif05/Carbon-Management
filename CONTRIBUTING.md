# Contributing to CarbonTrack Pro

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Copy** `.env.example` to `.env` and fill in your credentials
4. **Install** dependencies: `npm install`
5. **Deploy** to Netlify (or use `netlify dev` for local development)

## Development Setup

### Prerequisites

- Node.js 18+
- A [Firebase](https://console.firebase.google.com) project with Realtime Database and Authentication enabled
- A [Netlify](https://www.netlify.com) account (free tier works)
- An [Anthropic](https://console.anthropic.com) API key (for AI features)

### Local Development

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Start local dev server (serves frontend + serverless functions)
netlify dev
```

## How to Contribute

### Reporting Bugs

- Open an issue with a clear title and description
- Include steps to reproduce the bug
- Include browser/OS information if relevant

### Suggesting Features

- Open an issue tagged as a feature request
- Describe the use case and expected behavior
- Explain why this would benefit other users

### Submitting Changes

1. Create a feature branch from `main`: `git checkout -b feature/your-feature`
2. Make your changes
3. Test your changes locally
4. Commit with a descriptive message
5. Push to your fork and open a Pull Request

### Commit Message Format

```
type: short description

Longer explanation if needed.
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Code Guidelines

- **No frameworks** — the frontend is vanilla JS by design (lightweight, zero dependencies)
- **Security first** — follow OWASP ASVS Level 2 patterns established in the codebase
- **Environment variables** — never hardcode secrets, API keys, or project-specific values
- **Server-side AI** — all Anthropic API calls must go through Netlify Functions, never from the client

## Project Structure

```
/                          Static frontend (HTML, CSS, JS)
/js/                       Frontend JavaScript modules
/css/                      Stylesheets
/netlify/functions/        Serverless backend (Node.js)
/netlify/functions/lib/    Shared utilities (encryption, rate-limiting, etc.)
/netlify/functions/utils/  Firebase and config helpers
/public/                   Static assets (templates, etc.)
```

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
