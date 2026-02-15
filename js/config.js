// ===== SERVER API CONFIGURATION =====
// All Firebase credentials are stored securely on the server.
// No secrets are exposed to the browser.
const API = '/api';
let dbConnected = false;

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

  let res = await fetch(API + endpoint, config);

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
          const refreshData = await refreshRes.json();
          localStorage.setItem('ct_auth_token', refreshData.token);
          localStorage.setItem('ct_refresh_token', refreshData.refreshToken);
          // Retry original request with new token
          config.headers['Authorization'] = 'Bearer ' + refreshData.token;
          res = await fetch(API + endpoint, config);
        }
      } catch (e) {
        // Refresh failed — will return the 401
      }
    }
  }

  return res;
}

// Check server connection
async function checkDbConnection() {
  try {
    const res = await fetch(API + '/db-status');
    if (res.ok) {
      const data = await res.json();
      dbConnected = data.connected;
    } else {
      dbConnected = false;
    }
  } catch (e) {
    dbConnected = false;
  }
  updateDbStatus();
}

function updateDbStatus() {
  const el = document.getElementById('dbStatus');
  const txt = document.getElementById('dbStatusText');
  if (dbConnected) { el.className='db-status online'; txt.textContent='Database Connected'; }
  else { el.className='db-status offline'; txt.textContent='Offline (Local)'; }
}
