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

  async createInvitation(email, role, message, organizationId, organizationName) {
    if (!dbConnected) throw new Error('Server connection required to send invitations.');
    const payload = { action: 'create', email, role, message };
    if (organizationId) {
      payload.organizationId = organizationId;
      payload.organizationName = organizationName || '';
    }
    const res = await apiCall('/invitations', {
      method: 'POST',
      body: JSON.stringify(payload)
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

  // === DRAFT (LOCAL BATCH) ENTRIES ===
  // Draft entries are stored only in localStorage until the contractor explicitly submits the batch.
  getDraftEntries() {
    return JSON.parse(localStorage.getItem('ct_draft_entries') || '[]');
  },

  addDraftEntry(entry) {
    const drafts = this.getDraftEntries();
    drafts.push(entry);
    localStorage.setItem('ct_draft_entries', JSON.stringify(drafts));
  },

  removeDraftEntry(id) {
    let drafts = this.getDraftEntries();
    drafts = drafts.filter(e => e.id !== id);
    localStorage.setItem('ct_draft_entries', JSON.stringify(drafts));
  },

  clearDraftEntries() {
    localStorage.removeItem('ct_draft_entries');
  },

  // Submit all draft entries to the server at once
  async submitBatch(entries) {
    if (!dbConnected) throw new Error('Server connection required to submit batch.');
    const res = await apiCall('/entries', {
      method: 'POST',
      body: JSON.stringify({ action: 'batch-save', entries })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit batch.');
    return data;
  },

  // Notify consultants that a batch has been submitted
  async notifyBatchSubmitted(contractorName, entryCount) {
    if (!dbConnected) return;
    try {
      await apiCall('/send-email', {
        method: 'POST',
        body: JSON.stringify({ action: 'notify-batch', contractorName, entryCount })
      });
    } catch (e) {
      console.warn('Batch notification email failed:', e);
    }
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
  },

  // === ORGANIZATIONS ===
  async getOrganizations() {
    if (!dbConnected) return [];
    try {
      const res = await apiCall('/organizations', {
        method: 'POST',
        body: JSON.stringify({ action: 'list-orgs' })
      });
      if (res.ok) {
        const data = await res.json();
        return data.organizations || [];
      }
    } catch (e) { console.warn('API error (getOrganizations):', e); }
    return [];
  },

  async createOrganization(name, type) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify({ action: 'create-org', name, type })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create organization.');
    return data;
  },

  async updateOrganization(orgId, name) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify({ action: 'update-org', orgId, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update organization.');
    return data;
  },

  async deleteOrganization(orgId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete-org', orgId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete organization.');
    return data;
  },

  async assignUserToOrg(userId, orgId, projectId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const payload = { action: 'assign-user-to-org', userId, orgId };
    if (projectId) payload.projectId = projectId;
    const res = await apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to assign user.');
    return data;
  },

  // Org links (consultant firm ↔ contractor company)
  async getOrgLinks() {
    if (!dbConnected) return [];
    try {
      const res = await apiCall('/organizations', {
        method: 'POST',
        body: JSON.stringify({ action: 'list-links' })
      });
      if (res.ok) {
        const data = await res.json();
        return data.links || [];
      }
    } catch (e) { console.warn('API error (getOrgLinks):', e); }
    return [];
  },

  async linkOrgs(consultantOrgId, contractorOrgId, projectId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const payload = { action: 'link-orgs', consultantOrgId, contractorOrgId };
    if (projectId) payload.projectId = projectId;
    const res = await apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to link organizations.');
    return data;
  },

  async unlinkOrgs(linkId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify({ action: 'unlink-orgs', linkId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to unlink organizations.');
    return data;
  },

  // Assignments (consultant ↔ contractor user-level)
  async getAssignments() {
    if (!dbConnected) return [];
    try {
      const res = await apiCall('/organizations', {
        method: 'POST',
        body: JSON.stringify({ action: 'list-assignments' })
      });
      if (res.ok) {
        const data = await res.json();
        return data.assignments || [];
      }
    } catch (e) { console.warn('API error (getAssignments):', e); }
    return [];
  },

  async createAssignment(consultantUid, contractorUid, projectId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const payload = { action: 'create-assignment', consultantUid, contractorUid };
    if (projectId) payload.projectId = projectId;
    const res = await apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create assignment.');
    return data;
  },

  async deleteAssignment(assignmentId) {
    if (!dbConnected) throw new Error('Server connection required.');
    const res = await apiCall('/organizations', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete-assignment', assignmentId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete assignment.');
    return data;
  },

  // Users list (for assignment UI)
  async getUsers() {
    if (!dbConnected) return [];
    try {
      const res = await apiCall('/organizations', {
        method: 'POST',
        body: JSON.stringify({ action: 'list-users' })
      });
      if (res.ok) {
        const data = await res.json();
        return data.users || [];
      }
    } catch (e) { console.warn('API error (getUsers):', e); }
    return [];
  },

  // === PROJECTS ===
  async getProjects() {
    if (!dbConnected) { console.warn('[DB] getProjects skipped — not connected'); return []; }
    try {
      const res = await apiCall('/projects', {
        method: 'POST',
        body: JSON.stringify({ action: 'list' })
      });
      if (res.ok) {
        const data = await safeJsonParse(res);
        return data.projects || [];
      }
      // Log non-OK responses so we can diagnose issues
      const errData = await safeJsonParse(res).catch(() => ({}));
      console.error('[DB] getProjects failed (HTTP ' + res.status + '):', errData.error || 'Unknown error');
    } catch (e) { console.error('[DB] getProjects error:', e.message || e); }
    return [];
  },

  async createProject(name, description, code) {
    await ensureDbConnected();
    console.log('[DB] Creating project:', name);
    const res = await apiCall('/projects', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', name, description, code })
    });
    const data = await safeJsonParse(res);
    if (!res.ok) {
      console.error('[DB] createProject failed (HTTP ' + res.status + '):', data.error);
      throw new Error(data.error || 'Failed to create project (HTTP ' + res.status + ').');
    }
    console.log('[DB] Project created successfully:', data.project && data.project.id);
    return data;
  },

  async updateProject(projectId, updates) {
    await ensureDbConnected();
    const res = await apiCall('/projects', {
      method: 'POST',
      body: JSON.stringify({ action: 'update', projectId, ...updates })
    });
    const data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error || 'Failed to update project.');
    return data;
  },

  async deleteProject(projectId) {
    await ensureDbConnected();
    const res = await apiCall('/projects', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', projectId })
    });
    const data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error || 'Failed to delete project.');
    return data;
  },

  async assignUserToProject(userId, projectId) {
    await ensureDbConnected();
    const res = await apiCall('/projects', {
      method: 'POST',
      body: JSON.stringify({ action: 'assign-user', userId, projectId })
    });
    const data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error || 'Failed to assign user to project.');
    return data;
  },

  async removeUserFromProject(assignmentId) {
    await ensureDbConnected();
    const res = await apiCall('/projects', {
      method: 'POST',
      body: JSON.stringify({ action: 'remove-user', assignmentId })
    });
    const data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error || 'Failed to remove user from project.');
    return data;
  },

  async getProjectAssignments(projectId) {
    if (!dbConnected) return [];
    try {
      const payload = { action: 'list-assignments' };
      if (projectId) payload.projectId = projectId;
      const res = await apiCall('/projects', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await safeJsonParse(res);
        return data.assignments || [];
      }
      const errData = await safeJsonParse(res).catch(() => ({}));
      console.error('[DB] getProjectAssignments failed (HTTP ' + res.status + '):', errData.error || 'Unknown');
    } catch (e) { console.error('[DB] getProjectAssignments error:', e.message || e); }
    return [];
  },

  async linkOrgToProject(orgId, projectId) {
    await ensureDbConnected();
    const res = await apiCall('/projects', {
      method: 'POST',
      body: JSON.stringify({ action: 'link-org', orgId, projectId })
    });
    const data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error || 'Failed to link organization to project.');
    return data;
  },

  async unlinkOrgFromProject(linkId) {
    await ensureDbConnected();
    const res = await apiCall('/projects', {
      method: 'POST',
      body: JSON.stringify({ action: 'unlink-org', linkId })
    });
    const data = await safeJsonParse(res);
    if (!res.ok) throw new Error(data.error || 'Failed to unlink organization from project.');
    return data;
  },

  async getProjectOrgLinks(projectId) {
    if (!dbConnected) return [];
    try {
      const payload = { action: 'list-org-links' };
      if (projectId) payload.projectId = projectId;
      const res = await apiCall('/projects', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await safeJsonParse(res);
        return data.links || [];
      }
      const errData = await safeJsonParse(res).catch(() => ({}));
      console.error('[DB] getProjectOrgLinks failed (HTTP ' + res.status + '):', errData.error || 'Unknown');
    } catch (e) { console.error('[DB] getProjectOrgLinks error:', e.message || e); }
    return [];
  },

  async getProjectSummary(projectId) {
    if (!dbConnected) return null;
    try {
      const res = await apiCall('/projects', {
        method: 'POST',
        body: JSON.stringify({ action: 'summary', projectId })
      });
      if (res.ok) {
        return await safeJsonParse(res);
      }
    } catch (e) { console.warn('API error (getProjectSummary):', e); }
    return null;
  }
};
