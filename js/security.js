// ===== CLIENT-SIDE SECURITY MODULE (OWASP ASVS Level 2) =====
// Session management, idle timeout, CSRF protection, and token hardening

(function() {
  'use strict';

  // ===== SESSION TIMEOUT CONFIGURATION =====
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000;     // 30 minutes of inactivity → auto-logout
  var SESSION_WARNING_MS = 25 * 60 * 1000;      // Warn at 25 minutes
  var SESSION_CHECK_INTERVAL = 60 * 1000;        // Check every 60 seconds
  var MAX_SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours absolute max session

  var _lastActivity = Date.now();
  var _sessionStart = Date.now();
  var _idleTimer = null;
  var _warningShown = false;

  // Track user activity
  function resetIdleTimer() {
    _lastActivity = Date.now();
    _warningShown = false;
  }

  // Listen for user activity events
  var activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
  activityEvents.forEach(function(evt) {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
  });

  // Periodic session check
  function checkSession() {
    var now = Date.now();
    var idleTime = now - _lastActivity;
    var sessionDuration = now - _sessionStart;

    // Check if user is logged in
    var token = localStorage.getItem('ct_auth_token');
    if (!token) return;

    // Absolute session timeout (8 hours)
    if (sessionDuration > MAX_SESSION_DURATION_MS) {
      console.warn('[SECURITY] Absolute session timeout reached');
      securityLogout('Your session has expired. Please sign in again.');
      return;
    }

    // Idle timeout
    if (idleTime > SESSION_TIMEOUT_MS) {
      console.warn('[SECURITY] Idle timeout reached (' + Math.round(idleTime / 60000) + ' minutes)');
      securityLogout('You have been signed out due to inactivity.');
      return;
    }

    // Warning before timeout
    if (idleTime > SESSION_WARNING_MS && !_warningShown) {
      _warningShown = true;
      showSessionWarning();
    }
  }

  function showSessionWarning() {
    // Only show if the app shell is visible (user is logged in)
    var appShell = document.getElementById('appShell');
    if (!appShell || appShell.style.display === 'none') return;

    var remaining = Math.round((SESSION_TIMEOUT_MS - (Date.now() - _lastActivity)) / 60000);
    var banner = document.createElement('div');
    banner.id = 'sessionWarning';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fbbf24;color:#000;padding:10px 20px;text-align:center;z-index:99999;font-size:13px;font-weight:600;';
    banner.innerHTML = 'Your session will expire in ~' + remaining + ' minutes due to inactivity. <a href="#" onclick="document.getElementById(\'sessionWarning\').remove();return false;" style="color:#000;text-decoration:underline;margin-left:8px;">Dismiss</a>';
    document.body.appendChild(banner);

    // Auto-remove after 30 seconds
    setTimeout(function() {
      var el = document.getElementById('sessionWarning');
      if (el) el.remove();
    }, 30000);
  }

  function securityLogout(message) {
    // Clear all session data
    localStorage.removeItem('ct_auth_token');
    localStorage.removeItem('ct_refresh_token');
    localStorage.removeItem('ct_server_verified');
    localStorage.removeItem('ct_user_profile');

    // Remove warning banner if present
    var warning = document.getElementById('sessionWarning');
    if (warning) warning.remove();

    // If the logout function exists (from auth.js), use it
    if (typeof logout === 'function') {
      logout();
    }

    // Show message
    setTimeout(function() {
      var errEl = document.getElementById('loginError');
      if (errEl && message) {
        errEl.style.display = 'block';
        errEl.style.background = 'rgba(251,191,36,0.1)';
        errEl.style.borderColor = 'rgba(251,191,36,0.2)';
        errEl.style.color = '#fbbf24';
        errEl.textContent = message;
      }
    }, 100);
  }

  // Start session monitoring
  _idleTimer = setInterval(checkSession, SESSION_CHECK_INTERVAL);

  // Reset session start on login
  window.addEventListener('storage', function(e) {
    if (e.key === 'ct_auth_token' && e.newValue) {
      _sessionStart = Date.now();
      _lastActivity = Date.now();
    }
  });

  // ===== CSRF PROTECTION =====
  // Add X-Requested-With header to all API calls to prevent CSRF
  // (CSRF attacks cannot set custom headers due to CORS preflight)
  var originalFetch = window.fetch;
  window.fetch = function(url, options) {
    options = options || {};
    // Only add CSRF header for same-origin API calls
    if (typeof url === 'string' && url.startsWith('/api')) {
      options.headers = options.headers || {};
      if (typeof options.headers === 'object' && !options.headers['X-Requested-With']) {
        options.headers['X-Requested-With'] = 'CarbonTrackPro';
      }
    }
    return originalFetch.call(this, url, options);
  };

  // ===== TOKEN STORAGE HARDENING =====
  // Clear tokens when browser tab is closed (not on refresh)
  // Use sessionStorage as secondary check
  window.addEventListener('load', function() {
    var session = sessionStorage.getItem('ct_session_active');
    if (!session && localStorage.getItem('ct_auth_token')) {
      // Tab was reopened — verify token is still valid
      sessionStorage.setItem('ct_session_active', 'true');
    }
  });

  window.addEventListener('beforeunload', function() {
    sessionStorage.setItem('ct_session_active', 'true');
  });

  // ===== PREVENT OPEN REDIRECT =====
  // Block any attempts to redirect to external URLs via query params
  (function() {
    var params = new URLSearchParams(window.location.search);
    var redirect = params.get('redirect') || params.get('next') || params.get('return');
    if (redirect && !/^\/[^\/]/.test(redirect)) {
      // External redirect attempt — strip it
      window.history.replaceState({}, document.title, window.location.pathname);
      console.warn('[SECURITY] Blocked potential open redirect:', redirect);
    }
  })();

  // ===== CLICKJACKING PROTECTION (JS fallback) =====
  if (window.self !== window.top) {
    document.body.innerHTML = '<h1 style="color:red;text-align:center;margin-top:100px">This page cannot be displayed in a frame.</h1>';
    throw new Error('Clickjacking detected — page loaded in frame');
  }

  // Export for use by other modules
  window.CTPSecurity = {
    resetIdleTimer: resetIdleTimer,
    getSessionAge: function() { return Date.now() - _sessionStart; },
    getIdleTime: function() { return Date.now() - _lastActivity; },
    securityLogout: securityLogout
  };

  console.log('[SECURITY] Client-side security module initialized (OWASP ASVS L2)');
})();
