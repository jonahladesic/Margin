// ==== Time Palette — API Client ====
// Thin wrapper around fetch() for communicating with the Margin backend.
(function (ns) {
  const STORAGE_KEYS = {
    SESSION: 'tp_session',      // { sid, user }
    API_BASE: 'tp_api_base',    // e.g. "http://localhost:4001"
  };

  const DEFAULT_API_BASE = 'https://rsm-design-os.onrender.com';

  // Read a value from chrome.storage.local (returns a promise)
  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (result) => {
          resolve(result || {});
        });
      } catch (_) {
        resolve({});
      }
    });
  }

  async function getApiBase() {
    const result = await storageGet(STORAGE_KEYS.API_BASE);
    return result[STORAGE_KEYS.API_BASE] || DEFAULT_API_BASE;
  }

  async function getSessionId() {
    const result = await storageGet(STORAGE_KEYS.SESSION);
    const session = result[STORAGE_KEYS.SESSION];
    return session ? session.sid : null;
  }

  async function apiFetch(path, options = {}) {
    const base = await getApiBase();
    const sid = await getSessionId();

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (sid) {
      headers['Authorization'] = 'Bearer ' + sid;
    }

    const url = base + '/api' + path;
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      // Session expired — clear stored token
      console.warn('[TimePalette] API returned 401 — session expired');
      chrome.storage.local.remove(STORAGE_KEYS.SESSION);
      throw new Error('AUTH_EXPIRED');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text}`);
    }

    // 204 No Content
    if (res.status === 204) return null;

    return res.json();
  }

  ns.apiClient = {
    STORAGE_KEYS: STORAGE_KEYS,

    // Check if we have a stored session
    hasSession: async function () {
      const sid = await getSessionId();
      return !!sid;
    },

    // Fetch current user info
    fetchCurrentUser: function () {
      return apiFetch('/auth/user');
    },

    // Fetch all projects
    fetchProjects: function () {
      return apiFetch('/projects');
    },

    // Fetch phases for a project
    fetchPhases: function (projectId) {
      return apiFetch('/projects/' + encodeURIComponent(projectId) + '/phases');
    },

    // Fetch all GCal assignments for the current user
    fetchAssignments: function () {
      return apiFetch('/gcal/assignments');
    },

    // Upsert a single assignment (with optional event metadata)
    putAssignment: function (eventKey, projectId, phaseId, eventData) {
      const body = { eventKey, projectId, phaseId: phaseId || null };
      if (eventData) {
        if (eventData.durationHours != null) body.durationHours = eventData.durationHours;
        if (eventData.eventTitle) body.eventTitle = eventData.eventTitle;
        if (eventData.eventDate) body.eventDate = eventData.eventDate;
      }
      return apiFetch('/gcal/assignments', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    },

    // Delete a single assignment
    deleteAssignment: function (eventKey) {
      return apiFetch('/gcal/assignments/' + encodeURIComponent(eventKey), {
        method: 'DELETE',
      });
    },

    // Bulk upsert assignments (for auto-match)
    // Accepts either legacy object { [eventKey]: { projectId, phaseId? } }
    // or array format [{ eventKey, projectId, phaseId?, durationHours?, eventTitle?, eventDate? }]
    bulkPutAssignments: function (assignments) {
      return apiFetch('/gcal/assignments/bulk', {
        method: 'PUT',
        body: JSON.stringify({ assignments }),
      });
    },

    // Fetch allocations for the current user in a date range
    fetchMyAllocations: function (startDate, endDate) {
      const params = new URLSearchParams({
        weekStart: startDate instanceof Date ? startDate.toISOString().slice(0, 10) : startDate,
        weekEnd: endDate instanceof Date ? endDate.toISOString().slice(0, 10) : endDate,
      });
      return apiFetch('/allocations?' + params.toString());
    },

    // Fetch team utilization for a week
    fetchUtilization: function (weekStart, weekEnd) {
      const params = new URLSearchParams({
        weekStart: weekStart instanceof Date ? weekStart.toISOString() : weekStart,
        weekEnd: weekEnd instanceof Date ? weekEnd.toISOString() : weekEnd,
      });
      return apiFetch('/utilization?' + params.toString());
    },
  };
})(window.__gcalPT);
