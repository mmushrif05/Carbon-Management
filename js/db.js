// ===== DATABASE ABSTRACTION LAYER =====
// All operations go through secure server API.
// Falls back to localStorage when server is unavailable.
const DB = {
  async getEntries() {
    if (dbConnected) {
      try {
        const res = await apiCall('/entries');
        if (res.ok) {
          const data = await res.json();
          // Cache locally as backup
          localStorage.setItem('ct_entries', JSON.stringify(data.entries || []));
          return data.entries || [];
        }
      } catch (e) { console.warn('API error (getEntries):', e); }
    }
    return JSON.parse(localStorage.getItem('ct_entries') || '[]');
  },

  async saveEntry(entry) {
    if (dbConnected) {
      try {
        await apiCall('/entries', {
          method: 'POST',
          body: JSON.stringify({ action: 'save', entry })
        });
      } catch (e) { console.warn('API error (saveEntry):', e); }
    }
    // Always save locally too as backup
    const entries = JSON.parse(localStorage.getItem('ct_entries') || '[]');
    entries.push(entry);
    localStorage.setItem('ct_entries', JSON.stringify(entries));
  },

  async updateEntry(id, updates) {
    if (dbConnected) {
      try {
        await apiCall('/entries', {
          method: 'POST',
          body: JSON.stringify({ action: 'update', id, updates })
        });
      } catch (e) { console.warn('API error (updateEntry):', e); }
    }
    const entries = JSON.parse(localStorage.getItem('ct_entries') || '[]');
    const idx = entries.findIndex(e => e.id === id);
    if (idx !== -1) { Object.assign(entries[idx], updates); localStorage.setItem('ct_entries', JSON.stringify(entries)); }
  },

  async deleteEntry(id) {
    if (dbConnected) {
      try {
        await apiCall('/entries', {
          method: 'POST',
          body: JSON.stringify({ action: 'delete', id })
        });
      } catch (e) { console.warn('API error (deleteEntry):', e); }
    }
    let entries = JSON.parse(localStorage.getItem('ct_entries') || '[]');
    entries = entries.filter(e => e.id !== id);
    localStorage.setItem('ct_entries', JSON.stringify(entries));
  },

  async getA5Entries() {
    if (dbConnected) {
      try {
        const res = await apiCall('/a5');
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('ct_a5entries', JSON.stringify(data.entries || []));
          return data.entries || [];
        }
      } catch (e) { console.warn('API error (getA5Entries):', e); }
    }
    return JSON.parse(localStorage.getItem('ct_a5entries') || '[]');
  },

  async saveA5Entry(entry) {
    if (dbConnected) {
      try {
        await apiCall('/a5', {
          method: 'POST',
          body: JSON.stringify({ action: 'save', entry })
        });
      } catch (e) { console.warn('API error (saveA5Entry):', e); }
    }
    const entries = JSON.parse(localStorage.getItem('ct_a5entries') || '[]');
    entries.push(entry);
    localStorage.setItem('ct_a5entries', JSON.stringify(entries));
  },

  async deleteA5Entry(id) {
    if (dbConnected) {
      try {
        await apiCall('/a5', {
          method: 'POST',
          body: JSON.stringify({ action: 'delete', id })
        });
      } catch (e) { console.warn('API error (deleteA5Entry):', e); }
    }
    let entries = JSON.parse(localStorage.getItem('ct_a5entries') || '[]');
    entries = entries.filter(e => e.id !== id);
    localStorage.setItem('ct_a5entries', JSON.stringify(entries));
  },

  // Poll for updates from other users (replaces Firebase real-time listeners)
  onEntriesChange(callback) {
    if (dbConnected) {
      setInterval(async () => {
        try {
          const res = await apiCall('/entries');
          if (res.ok) {
            const data = await res.json();
            callback(data.entries || []);
          }
        } catch (e) {}
      }, 30000);
    }
  },

  onA5Change(callback) {
    if (dbConnected) {
      setInterval(async () => {
        try {
          const res = await apiCall('/a5');
          if (res.ok) {
            const data = await res.json();
            callback(data.entries || []);
          }
        } catch (e) {}
      }, 30000);
    }
  }
};
