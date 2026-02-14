// ===== DATABASE ABSTRACTION LAYER =====
// Works with Firebase when connected, falls back to localStorage
const DB = {
  async getEntries() {
    if (dbConnected) {
      const snap = await db.ref('projects/ksia/entries').once('value');
      const data = snap.val();
      return data ? Object.values(data) : [];
    }
    return JSON.parse(localStorage.getItem('ct_entries') || '[]');
  },

  async saveEntry(entry) {
    if (dbConnected) {
      await db.ref('projects/ksia/entries/' + entry.id).set(entry);
    }
    // Always save locally too as backup
    const entries = JSON.parse(localStorage.getItem('ct_entries') || '[]');
    entries.push(entry);
    localStorage.setItem('ct_entries', JSON.stringify(entries));
  },

  async updateEntry(id, updates) {
    if (dbConnected) {
      await db.ref('projects/ksia/entries/' + id).update(updates);
    }
    const entries = JSON.parse(localStorage.getItem('ct_entries') || '[]');
    const idx = entries.findIndex(e => e.id === id);
    if (idx !== -1) { Object.assign(entries[idx], updates); localStorage.setItem('ct_entries', JSON.stringify(entries)); }
  },

  async deleteEntry(id) {
    if (dbConnected) {
      await db.ref('projects/ksia/entries/' + id).remove();
    }
    let entries = JSON.parse(localStorage.getItem('ct_entries') || '[]');
    entries = entries.filter(e => e.id !== id);
    localStorage.setItem('ct_entries', JSON.stringify(entries));
  },

  async getA5Entries() {
    if (dbConnected) {
      const snap = await db.ref('projects/ksia/a5entries').once('value');
      const data = snap.val();
      return data ? Object.values(data) : [];
    }
    return JSON.parse(localStorage.getItem('ct_a5entries') || '[]');
  },

  async saveA5Entry(entry) {
    if (dbConnected) {
      await db.ref('projects/ksia/a5entries/' + entry.id).set(entry);
    }
    const entries = JSON.parse(localStorage.getItem('ct_a5entries') || '[]');
    entries.push(entry);
    localStorage.setItem('ct_a5entries', JSON.stringify(entries));
  },

  async deleteA5Entry(id) {
    if (dbConnected) {
      await db.ref('projects/ksia/a5entries/' + id).remove();
    }
    let entries = JSON.parse(localStorage.getItem('ct_a5entries') || '[]');
    entries = entries.filter(e => e.id !== id);
    localStorage.setItem('ct_a5entries', JSON.stringify(entries));
  },

  // Real-time listener for live updates across users
  onEntriesChange(callback) {
    if (dbConnected) {
      db.ref('projects/ksia/entries').on('value', snap => {
        const data = snap.val();
        callback(data ? Object.values(data) : []);
      });
    }
  },

  onA5Change(callback) {
    if (dbConnected) {
      db.ref('projects/ksia/a5entries').on('value', snap => {
        const data = snap.val();
        callback(data ? Object.values(data) : []);
      });
    }
  }
};
