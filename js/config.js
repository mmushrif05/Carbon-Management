// ===== SERVER API CONFIGURATION =====
// All Firebase credentials are stored securely on the server.
// No secrets are exposed to the browser.
const API = '/api';
let dbConnected = false;

// Safe JSON parse for API responses — handles HTML error pages from Netlify
async function safeJsonParse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('[API] Non-JSON response (status ' + res.status + '):', text.substring(0, 200));
    throw new Error('Server error (HTTP ' + res.status + '). The server may be starting up — please try again in a moment.');
  }
}

// Helper: make authenticated API calls with auto token refresh
async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('ct_auth_token');
  const defaults = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? 'Bearer ' + token : ''
    }
  };
  const config = { ...defaults, ...options, headers: { ...defaults.headers, ...(options.headers || {}) } };

  let res;
  try {
    res = await fetch(API + endpoint, config);
  } catch (e) {
    console.error('[API] Network error calling ' + endpoint + ':', e.message);
    throw new Error('Cannot reach the server. Please check your internet connection.');
  }

  // If unauthorized, try refreshing the token
  if (res.status === 401) {
    const refreshToken = localStorage.getItem('ct_refresh_token');
    if (refreshToken) {
      try {
        const refreshRes = await fetch(API + '/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refresh', refreshToken })
        });
        if (refreshRes.ok) {
          const refreshData = await safeJsonParse(refreshRes);
          localStorage.setItem('ct_auth_token', refreshData.token);
          localStorage.setItem('ct_refresh_token', refreshData.refreshToken);
          // Retry original request with new token
          config.headers['Authorization'] = 'Bearer ' + refreshData.token;
          res = await fetch(API + endpoint, config);
        }
      } catch (e) {
        console.warn('[API] Token refresh failed:', e.message);
        // Refresh failed — will return the 401
      }
    }
  }

  return res;
}

// Check server connection — can be called anytime to re-check
async function checkDbConnection() {
  try {
    const res = await fetch(API + '/db-status');
    if (res.ok) {
      const data = await res.json();
      dbConnected = data.connected;
    } else {
      console.warn('[DB] Status check returned HTTP', res.status);
      dbConnected = false;
    }
  } catch (e) {
    console.warn('[DB] Connection check failed:', e.message);
    dbConnected = false;
  }
  updateDbStatus();
}

// Re-check connection before write operations (called by DB methods)
async function ensureDbConnected() {
  if (!dbConnected) {
    console.log('[DB] Not connected — retrying connection check...');
    await checkDbConnection();
  }
  if (!dbConnected) {
    throw new Error('Server is not reachable. Please check your internet connection and refresh the page. If the problem persists, verify that your Netlify environment variables (FIREBASE_SERVICE_ACCOUNT, FIREBASE_DATABASE_URL, FIREBASE_API_KEY) are configured correctly.');
  }
}

function updateDbStatus() {
  const el = document.getElementById('dbStatus');
  const txt = document.getElementById('dbStatusText');
  if (dbConnected) { el.className='db-status online'; txt.textContent='Database Connected'; }
  else { el.className='db-status offline'; txt.textContent='Offline (Local)'; }
}
