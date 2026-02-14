// ===== FIREBASE AUTH =====
let auth = null;
let selectedRegRole = null;

// Only enable Firebase Auth if real credentials are configured
if (firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_')) {
  try {
    auth = firebase.auth();
  } catch(e) {
    console.warn('Firebase Auth init failed:', e);
  }
} else {
  console.info('Firebase not configured — using offline auth.');
}

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
  el.textContent = msg;
}

// Map Firebase auth error codes to user-friendly messages
function authErrorMessage(code) {
  const map = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.'
  };
  return map[code] || 'Authentication failed. Please try again.';
}

// Save user profile to Firebase DB
async function saveUserProfile(uid, name, email, role) {
  if (dbConnected) {
    await db.ref('users/' + uid).set({
      name: name,
      email: email,
      role: role,
      createdAt: new Date().toISOString()
    });
  }
  // Also keep in localStorage as fallback
  localStorage.setItem('ct_user_profile', JSON.stringify({ uid, name, email, role }));
}

// Load user profile from Firebase DB
async function loadUserProfile(uid) {
  if (dbConnected) {
    const snap = await db.ref('users/' + uid).once('value');
    const profile = snap.val();
    if (profile) {
      localStorage.setItem('ct_user_profile', JSON.stringify({ uid, ...profile }));
      return profile;
    }
  }
  // Fallback to localStorage
  const cached = JSON.parse(localStorage.getItem('ct_user_profile') || 'null');
  if (cached && cached.uid === uid) return cached;
  return null;
}

// ===== OFFLINE AUTH (localStorage fallback when Firebase is not configured) =====
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

  // Firebase auth
  if (auth) {
    try {
      await auth.signInWithEmailAndPassword(email, password);
      // onAuthStateChanged will handle the rest
      return;
    } catch(e) {
      showError('loginError', authErrorMessage(e.code));
      $('loginBtn').disabled = false;
      $('loginBtn').textContent = 'Sign In';
      return;
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
  if (!selectedRegRole) { showError('regError', 'Please select a role.'); return; }

  $('regBtn').disabled = true;
  $('regBtn').textContent = 'Creating account...';

  // Firebase auth
  if (auth) {
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await saveUserProfile(cred.user.uid, name, email, selectedRegRole);
      // onAuthStateChanged will handle the rest
      return;
    } catch(e) {
      showError('regError', authErrorMessage(e.code));
      $('regBtn').disabled = false;
      $('regBtn').textContent = 'Create Account';
      return;
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
  if (auth) {
    auth.signOut();
  }
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
