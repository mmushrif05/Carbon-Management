// ===== Open-Source Configuration =====
// All project-specific and branding values are driven by environment variables.
// Set these in your Netlify dashboard (or .env for local development).
// See .env.example for the full list.

const PROJECT_ID = process.env.PROJECT_ID || 'default';
const PROJECT_NAME = process.env.PROJECT_NAME || 'My Project';
const APP_BRAND = process.env.APP_BRAND || 'CarbonTrack Pro';
const APP_TAGLINE = process.env.APP_TAGLINE || 'Construction Embodied Carbon Platform';

function dbPath(subPath) {
  return `projects/${PROJECT_ID}/${subPath}`;
}

module.exports = {
  PROJECT_ID,
  PROJECT_NAME,
  APP_BRAND,
  APP_TAGLINE,
  dbPath,
};
