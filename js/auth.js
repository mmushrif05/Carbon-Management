// ===== AUTHENTICATION =====
// All auth operations go through the secure server API.
// No Firebase SDK or credentials on the client.
// Registration is invitation-only — no self-registration allowed.
let currentInviteToken = null;
let currentInvitation = null;

// Show/hide login vs register forms
function showRegister() {
  // Only show register form if user has a valid invitation token
  if (!currentInviteToken) {
    showError('loginError', 'Registration requires an invitation. Please contact a client or consultant to get an invitation link.');
    return;
  }
  $('loginForm').style.display = 'none';
  $('registerForm').style.display = 'block';
  clearErrors();
}
function showLogin() {
  $('registerForm').style.display = 'none';
  $('loginForm').style.display = 'block';
  if ($('forgotForm')) $('forgotForm').style.display = 'none';
  if ($('setupForm')) $('setupForm').style.display = 'none';
  clearErrors();
  // Reset invitation state when going back to login
  currentInviteToken = null;
  currentInvitation = null;
  if ($('inviteInfo')) $('inviteInfo').style.display = 'none';
}
function clearErrors() {
  $('loginError').style.display = 'none';
  $('regError').style.display = 'none';
}

// Show an error on a given error element
function showError(elId, msg) {
  const el = $(elId);
  el.style.display = 'block';
  el.style.background = 'rgba(248,113,113,0.1)';
  el.style.borderColor = 'rgba(248,113,113,0.2)';
  el.style.color = 'var(--red)';
  el.textContent = msg;
}

// Show a success message on a given element
function showSuccess(elId, msg) {
  const el = $(elId);
  el.style.display = 'block';
  el.style.background = 'rgba(52,211,153,0.1)';
  el.style.borderColor = 'rgba(52,211,153,0.2)';
  el.style.color = 'var(--green)';
  el.textContent = msg;
}

// ===== INVITATION HANDLING =====
// Check URL for invitation token on page load
function checkInviteToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  if (token) {
    currentInviteToken = token;
    validateAndShowInvite(token);
    // Clean URL without reload
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function validateAndShowInvite(token) {
  try {
    const data = await DB.validateInviteToken(token);
    if (data.valid) {
      currentInvitation = data.invitation;
      // Show the register form (invitation link bypasses the block)
      $('loginForm').style.display = 'none';
      $('registerForm').style.display = 'block';
      clearErrors();
      // Pre-fill email and lock it
      $('regEmail').value = data.invitation.email;
      $('regEmail').readOnly = true;
      $('regEmail').style.opacity = '0.7';
      // Show invitation info banner
      showInviteInfo(data.invitation);
      // Show the "Create Account" toggle link
      if ($('regToggle')) $('regToggle').style.display = 'block';
    }
  } catch (e) {
    // Show login with error
    currentInviteToken = null;
    showLogin();
    showError('loginError', e.message || 'Invalid invitation link.');
  }
}

function showInviteInfo(invitation) {
  const roleLabels = { contractor: 'Contractor', consultant: 'Consultant', client: 'Client' };
  const el = $('inviteInfo');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = `<div class="invite-banner">
      <div class="invite-banner-icon">\u2709\ufe0f</div>
      <div class="invite-banner-text">
        <strong>${invitation.invitedByName}</strong> invited you as a <strong style="color:var(--green)">${roleLabels[invitation.role] || invitation.role}</strong>
      </div>
    </div>`;
  }
}

// ===== FORGOT PASSWORD =====
function showForgotPassword() {
  $('loginForm').style.display = 'none';
  $('registerForm').style.display = 'none';
  if ($('setupForm')) $('setupForm').style.display = 'none';
  $('forgotForm').style.display = 'block';
  clearErrors();
  if ($('forgotError')) $('forgotError').style.display = 'none';
}

async function handleForgotPassword() {
  const errEl = $('forgotError');
  errEl.style.display = 'none';

  const email = $('forgotEmail').value.trim();
  if (!email) { showError('forgotError', 'Please enter your email address.'); return; }

  $('forgotBtn').disabled = true;
  $('forgotBtn').textContent = 'Sending...';

  if (!dbConnected) {
    showError('forgotError', 'Server connection required. Please check your internet connection.');
    $('forgotBtn').disabled = false;
    $('forgotBtn').textContent = 'Send Reset Link';
    return;
  }

  try {
    const res = await fetch(API + '/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'forgot-password', email })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showSuccess('forgotError', data.message || 'Password reset link sent! Check your email.');
      $('forgotBtn').textContent = 'Sent!';
      // Auto-return to login after 3 seconds
      setTimeout(() => {
        showLogin();
        $('forgotBtn').disabled = false;
        $('forgotBtn').textContent = 'Send Reset Link';
      }, 3000);
    } else {
      showError('forgotError', data.error || 'Failed to send reset link.');
      $('forgotBtn').disabled = false;
      $('forgotBtn').textContent = 'Send Reset Link';
    }
  } catch (e) {
    showError('forgotError', 'Unable to reach server. Please try again.');
    $('forgotBtn').disabled = false;
    $('forgotBtn').textContent = 'Send Reset Link';
  }
}

// Handle login form submission
async function handleLogin() {
  clearErrors();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;

  if (!email) { showError('loginError', 'Please enter your email.'); return; }
  if (!password) { showError('loginError', 'Please enter your password.'); return; }

  $('loginBtn').disabled = true;
  $('loginBtn').textContent = 'Signing in...';

  // Server auth ONLY — no offline fallback for login
  if (!dbConnected) {
    showError('loginError', 'Server connection required. Please check your internet connection and try again.');
    $('loginBtn').disabled = false;
    $('loginBtn').textContent = 'Sign In';
    return;
  }

  try {
    const res = await fetch(API + '/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password })
    });
    const data = await res.json();

    if (res.ok) {
      console.log('[AUTH] Login successful:', data.user.email);
      localStorage.setItem('ct_auth_token', data.token);
      localStorage.setItem('ct_refresh_token', data.refreshToken);
      localStorage.setItem('ct_user_profile', JSON.stringify(data.user));
      // Mark this session as server-verified
      localStorage.setItem('ct_server_verified', 'true');
      enterApp(data.user.name, data.user.role);
      return;
    } else {
      console.error('[AUTH] Login failed:', data.code || '', data.error);
      showError('loginError', data.error || 'Login failed.');
      $('loginBtn').disabled = false;
      $('loginBtn').textContent = 'Sign In';
      return;
    }
  } catch (e) {
    console.error('[AUTH] Server unreachable:', e.message || e);
    showError('loginError', 'Unable to reach server. Please check your connection.');
    $('loginBtn').disabled = false;
    $('loginBtn').textContent = 'Sign In';
  }
}

// Handle registration form submission
async function handleRegister() {
  clearErrors();
  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim();
  const password = $('regPassword').value;

  if (!name) { showError('regError', 'Please enter your name.'); return; }
  if (!email) { showError('regError', 'Please enter your email.'); return; }
  if (!password) { showError('regError', 'Please enter a password.'); return; }
  if (password.length < 6) { showError('regError', 'Password must be at least 6 characters.'); return; }

  // Registration is strictly invitation-only
  if (!currentInviteToken) {
    showError('regError', 'Registration requires an invitation. Please contact a client or consultant to get an invitation link.');
    return;
  }

  if (!dbConnected) {
    showError('regError', 'Server connection required for registration. Please check your internet connection.');
    return;
  }

  $('regBtn').disabled = true;
  $('regBtn').textContent = 'Creating account...';

  try {
    const res = await fetch(API + '/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        name,
        email,
        password,
        inviteToken: currentInviteToken
      })
    });
    const data = await res.json();

    if (res.ok) {
      console.log('[AUTH] Account created successfully:', data.user.email, data.user.role);
      localStorage.setItem('ct_auth_token', data.token);
      localStorage.setItem('ct_refresh_token', data.refreshToken);
      localStorage.setItem('ct_user_profile', JSON.stringify(data.user));
      localStorage.setItem('ct_server_verified', 'true');
      showSuccess('regError', 'Account created successfully! Redirecting...');
      setTimeout(() => enterApp(data.user.name, data.user.role), 1000);
      return;
    } else {
      console.error('[AUTH] Registration failed:', data.code || '', data.error);
      showError('regError', data.error || 'Registration failed.');
      $('regBtn').disabled = false;
      $('regBtn').textContent = 'Create Account';
      return;
    }
  } catch (e) {
    console.error('[AUTH] Server unreachable:', e.message || e);
    showError('regError', 'Server unreachable. Registration requires server connection.');
    $('regBtn').disabled = false;
    $('regBtn').textContent = 'Create Account';
  }
}

// Enter the app after authentication
function enterApp(name, role) {
  state.role = role;
  state.name = name;
  $('loginScreen').style.display = 'none';
  $('appShell').style.display = 'block';
  $('userName').textContent = name;
  $('userRole').textContent = role;
  $('userAvatar').className = 'sb-avatar ' + role;
  $('userAvatar').textContent = name[0].toUpperCase();
  buildSidebar();
  navigate('dashboard');
}

// Logout — clears all session data
function logout() {
  localStorage.removeItem('ct_auth_token');
  localStorage.removeItem('ct_refresh_token');
  localStorage.removeItem('ct_auth_session');
  localStorage.removeItem('ct_server_verified');
  // Keep ct_user_profile cleared so offline re-entry is blocked
  localStorage.removeItem('ct_user_profile');
  state.role = null;
  state.name = '';
  state.invitations = [];
  $('appShell').style.display = 'none';
  $('loginScreen').style.display = 'flex';
  // Reset form fields
  $('loginEmail').value = '';
  $('loginPassword').value = '';
  $('loginBtn').disabled = false;
  $('loginBtn').textContent = 'Sign In';
  // Reset invitation state
  currentInviteToken = null;
  currentInvitation = null;
  if ($('regEmail')) { $('regEmail').readOnly = false; $('regEmail').style.opacity = '1'; }
  if ($('inviteInfo')) $('inviteInfo').style.display = 'none';
  showLogin();
  clearErrors();
}

// ===== FIRST-TIME SETUP (Bootstrap) =====
function showSetup() {
  $('loginForm').style.display = 'none';
  $('registerForm').style.display = 'none';
  $('setupForm').style.display = 'block';
  clearErrors();
  if ($('setupError')) $('setupError').style.display = 'none';
}

async function handleBootstrap() {
  const errEl = $('setupError');
  errEl.style.display = 'none';

  const name = $('setupName').value.trim();
  const email = $('setupEmail').value.trim();
  const password = $('setupPassword').value;
  const setupKey = $('setupKey').value.trim();

  if (!name) { showError('setupError', 'Please enter your name.'); return; }
  if (!email) { showError('setupError', 'Please enter your email.'); return; }
  if (!password) { showError('setupError', 'Please enter a password.'); return; }
  if (password.length < 6) { showError('setupError', 'Password must be at least 6 characters.'); return; }
  if (!setupKey) { showError('setupError', 'Please enter the setup key from your Netlify environment variables.'); return; }

  if (!dbConnected) {
    showError('setupError', 'Server connection required. Please check that your Netlify environment variables (FIREBASE_API_KEY, FIREBASE_SERVICE_ACCOUNT, FIREBASE_DATABASE_URL) are configured correctly.');
    return;
  }

  $('setupBtn').disabled = true;
  $('setupBtn').textContent = 'Creating admin account...';

  try {
    const res = await fetch(API + '/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, setupKey })
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('ct_auth_token', data.token);
      localStorage.setItem('ct_refresh_token', data.refreshToken);
      localStorage.setItem('ct_user_profile', JSON.stringify(data.user));
      localStorage.setItem('ct_server_verified', 'true');
      showSuccess('setupError', 'Admin account created! Redirecting...');
      setTimeout(() => enterApp(data.user.name, data.user.role), 1000);
    } else {
      showError('setupError', data.error || 'Setup failed.');
      $('setupBtn').disabled = false;
      $('setupBtn').textContent = 'Create Admin Account';
    }
  } catch (e) {
    showError('setupError', 'Server unreachable: ' + (e.message || 'Unknown error'));
    $('setupBtn').disabled = false;
    $('setupBtn').textContent = 'Create Admin Account';
  }
}
