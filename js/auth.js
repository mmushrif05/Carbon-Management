// ===== AUTHENTICATION =====
// All auth operations go through the secure server API.
// No Firebase SDK or credentials on the client.
let selectedRegRole = null;

// Show/hide login vs register forms
function showRegister() {
  $('loginForm').style.display = 'none';
  $('registerForm').style.display = 'block';
  clearErrors();
}
function showLogin() {
  $('registerForm').style.display = 'none';
  $('loginForm').style.display = 'block';
  clearErrors();
}
function clearErrors() {
  $('loginError').style.display = 'none';
  $('regError').style.display = 'none';
}

// Role selection during registration
function selectRole(role, el) {
  selectedRegRole = role;
  document.querySelectorAll('#regRoleGrid .role-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
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

// ===== OFFLINE AUTH (localStorage fallback when server is unavailable) =====
function offlineGetUsers() {
  return JSON.parse(localStorage.getItem('ct_auth_users') || '{}');
}
function offlineSaveUsers(users) {
  localStorage.setItem('ct_auth_users', JSON.stringify(users));
}
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return 'h_' + Math.abs(h).toString(36);
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

  // Server auth (signInWithEmailAndPassword)
  if (dbConnected) {
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
      // Server unreachable — fall through to offline
      console.error('[AUTH] Server unreachable:', e.message || e);
    }
  }

  // Offline auth fallback
  const users = offlineGetUsers();
  const user = users[email];
  if (!user) {
    showError('loginError', 'No account found with this email. Please register first.');
    $('loginBtn').disabled = false;
    $('loginBtn').textContent = 'Sign In';
    return;
  }
  if (user.passHash !== simpleHash(password)) {
    showError('loginError', 'Incorrect password.');
    $('loginBtn').disabled = false;
    $('loginBtn').textContent = 'Sign In';
    return;
  }
  // Success — save session and enter app
  localStorage.setItem('ct_auth_session', JSON.stringify({ email: email, uid: user.uid }));
  enterApp(user.name, user.role);
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
  const confirmPassword = $('regConfirmPassword').value;
  if (password !== confirmPassword) { showError('regError', 'Passwords do not match.'); return; }
  if (!selectedRegRole) { showError('regError', 'Please select a role.'); return; }

  $('regBtn').disabled = true;
  $('regBtn').textContent = 'Creating account...';

  // Server auth (createUserWithEmailAndPassword)
  if (dbConnected) {
    try {
      const project = $('regProject') ? $('regProject').value : 'ksia';
      const res = await fetch(API + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', name, email, password, role: selectedRegRole, project })
      });
      const data = await res.json();

      if (res.ok) {
        console.log('[AUTH] Account created successfully:', data.user.email, data.user.role);
        localStorage.setItem('ct_auth_token', data.token);
        localStorage.setItem('ct_refresh_token', data.refreshToken);
        localStorage.setItem('ct_user_profile', JSON.stringify(data.user));
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
    }
  }

  // Offline auth fallback
  const users = offlineGetUsers();
  if (users[email]) {
    showError('regError', 'An account with this email already exists.');
    $('regBtn').disabled = false;
    $('regBtn').textContent = 'Create Account';
    return;
  }
  const uid = 'offline_' + Date.now();
  users[email] = { uid, name, email, role: selectedRegRole, passHash: simpleHash(password), createdAt: new Date().toISOString() };
  offlineSaveUsers(users);
  localStorage.setItem('ct_user_profile', JSON.stringify({ uid, name, email, role: selectedRegRole }));
  localStorage.setItem('ct_auth_session', JSON.stringify({ email, uid }));
  enterApp(name, selectedRegRole);
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

// Logout
function logout() {
  localStorage.removeItem('ct_auth_token');
  localStorage.removeItem('ct_refresh_token');
  localStorage.removeItem('ct_auth_session');
  state.role = null;
  state.name = '';
  $('appShell').style.display = 'none';
  $('loginScreen').style.display = 'flex';
  // Reset form fields
  $('loginEmail').value = '';
  $('loginPassword').value = '';
  $('loginBtn').disabled = false;
  $('loginBtn').textContent = 'Sign In';
  showLogin();
  clearErrors();
}
