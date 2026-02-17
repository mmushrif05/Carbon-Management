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

  // === INVITATIONS ===
  async getInvitations() {
    if (dbConnected) {
      try {
        const res = await apiCall('/invitations', {
          method: 'POST',
          body: JSON.stringify({ action: 'list' })
        });
        if (res.ok) {
          const data = await res.json();
          return data.invitations || [];
        }
      } catch (e) { console.warn('API error (getInvitations):', e); }
    }
    return [];
  },

  async createInvitation(email, role, message) {
    if (!dbConnected) throw new Error('Server connection required to send invitations.');
    const res = await apiCall('/invitations', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', email, role, message })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create invitation.');
    return data;
  },

  async revokeInvitation(inviteId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/invitations', {
      method: 'POST',
      body: JSON.stringify({ action: 'revoke', inviteId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to revoke invitation.');
    return data;
  },

  async resendInvitation(inviteId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/invitations', {
      method: 'POST',
      body: JSON.stringify({ action: 'resend', inviteId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to resend invitation.');
    return data;
  },

  async sendInvitationEmail(inviteId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/send-email', {
      method: 'POST',
      body: JSON.stringify({ action: 'send-invite', inviteId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send email.');
    return data;
  },

  async validateInviteToken(token) {
    const res = await fetch(API + '/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate', token })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid invitation.');
    return data;
  },

  // === SUBMISSIONS ===
  async getSubmissions() {
    if (dbConnected) {
      try {
        const res = await apiCall('/submissions', {
          method: 'POST',
          body: JSON.stringify({ action: 'list' })
        });
        if (res.ok) {
          const data = await res.json();
          return data.submissions || [];
        }
      } catch (e) { console.warn('API error (getSubmissions):', e); }
    }
    return [];
  },

  async submitPackage(month) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/submissions', {
      method: 'POST',
      body: JSON.stringify({ action: 'submit', month })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit package.');
    return data;
  },

  async reviewSubmission(submissionId, reviewAction, lineItemReviews) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/submissions', {
      method: 'POST',
      body: JSON.stringify({ action: 'review', submissionId, reviewAction, lineItemReviews })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to review submission.');
    return data;
  },

  async resubmitPackage(submissionId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/submissions', {
      method: 'POST',
      body: JSON.stringify({ action: 'resubmit', submissionId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to resubmit package.');
    return data;
  },

  async getSubmission(submissionId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/submissions', {
      method: 'POST',
      body: JSON.stringify({ action: 'get', submissionId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load submission.');
    return data;
  },

  async editEntry(entry) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/entries', {
      method: 'POST',
      body: JSON.stringify({ action: 'edit', entry })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to edit entry.');
    return data;
  },

  async sendSubmissionNotification(submissionId, type) {
    if (!dbConnected) return;
    try {
      await apiCall('/send-email', {
        method: 'POST',
        body: JSON.stringify({ action: 'submission-notify', submissionId, type })
      });
    } catch (e) { console.warn('Email notification failed:', e); }
  },

  onSubmissionsChange(callback) {
    if (dbConnected) {
      setInterval(async () => {
        try {
          const res = await apiCall('/submissions', {
            method: 'POST',
            body: JSON.stringify({ action: 'list' })
          });
          if (res.ok) {
            const data = await res.json();
            callback(data.submissions || []);
          }
        } catch (e) {}
      }, 30000);
    }
  },

  // === TENDER SCENARIOS ===
  async getTenderScenarios() {
    if (dbConnected) {
      try {
        const res = await apiCall('/tender');
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('ct_tender', JSON.stringify(data.scenarios || []));
          return data.scenarios || [];
        }
      } catch (e) { console.warn('API error (getTenderScenarios):', e); }
    }
    return JSON.parse(localStorage.getItem('ct_tender') || '[]');
  },

  async saveTenderScenario(scenario) {
    if (dbConnected) {
      try {
        await apiCall('/tender', {
          method: 'POST',
          body: JSON.stringify({ action: 'save', scenario })
        });
      } catch (e) { console.warn('API error (saveTenderScenario):', e); }
    }
    const scenarios = JSON.parse(localStorage.getItem('ct_tender') || '[]');
    const idx = scenarios.findIndex(s => s.id === scenario.id);
    if (idx !== -1) scenarios[idx] = scenario; else scenarios.push(scenario);
    localStorage.setItem('ct_tender', JSON.stringify(scenarios));
  },

  async updateTenderScenario(id, updates) {
    if (dbConnected) {
      try {
        await apiCall('/tender', {
          method: 'POST',
          body: JSON.stringify({ action: 'update', id, updates })
        });
      } catch (e) { console.warn('API error (updateTenderScenario):', e); }
    }
    const scenarios = JSON.parse(localStorage.getItem('ct_tender') || '[]');
    const idx = scenarios.findIndex(s => s.id === id);
    if (idx !== -1) { Object.assign(scenarios[idx], updates); localStorage.setItem('ct_tender', JSON.stringify(scenarios)); }
  },

  async deleteTenderScenario(id) {
    if (dbConnected) {
      try {
        await apiCall('/tender', {
          method: 'POST',
          body: JSON.stringify({ action: 'delete', id })
        });
      } catch (e) { console.warn('API error (deleteTenderScenario):', e); }
    }
    let scenarios = JSON.parse(localStorage.getItem('ct_tender') || '[]');
    scenarios = scenarios.filter(s => s.id !== id);
    localStorage.setItem('ct_tender', JSON.stringify(scenarios));
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
  },

  onTenderChange(callback) {
    if (dbConnected) {
      setInterval(async () => {
        try {
          const res = await apiCall('/tender');
          if (res.ok) {
            const data = await res.json();
            callback(data.scenarios || []);
          }
        } catch (e) {}
      }, 30000);
    }
  }
};
