// ===== FIREBASE CONFIGURATION =====
// Replace with your own Firebase project credentials
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "000000000000",
  appId: "YOUR_APP_ID"
};

// ===== INIT FIREBASE =====
let db = null;
let dbConnected = false;

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();

  // Monitor connection
  db.ref('.info/connected').on('value', snap => {
    dbConnected = snap.val() === true;
    updateDbStatus();
  });
} catch(e) {
  console.warn('Firebase init failed, using localStorage fallback:', e);
}

function updateDbStatus() {
  const el = document.getElementById('dbStatus');
  const txt = document.getElementById('dbStatusText');
  if (dbConnected) { el.className='db-status online'; txt.textContent='Database Connected'; }
  else { el.className='db-status offline'; txt.textContent='Offline (Local)'; }
}
