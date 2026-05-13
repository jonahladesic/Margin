// ==== Time Palette — Storage Layer (API-backed with local cache) ====
(function (ns) {
  const CACHE_KEYS = {
    PROJECTS: 'tp_cache_projects',
    PROJECTS_TS: 'tp_cache_projects_ts',
    ASSIGNMENTS: 'tp_cache_assignments',
    ASSIGNMENTS_TS: 'tp_cache_assignments_ts',
    PHASES: 'tp_cache_phases',       // { [projectId]: phases[] }
    PHASES_TS: 'tp_cache_phases_ts', // { [projectId]: timestamp }
  };

  const TTL = {
    PROJECTS: 30000,     // 30 seconds
    ASSIGNMENTS: 10000,  // 10 seconds
    PHASES: 60000,       // 60 seconds
  };

  // True while the extension context is still alive.
  function extensionAlive() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function safeGet(keys) {
    return new Promise((resolve) => {
      if (!extensionAlive()) { resolve({}); return; }
      try {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) { resolve({}); return; }
          resolve(result || {});
        });
      } catch (_) { resolve({}); }
    });
  }

  function safeSet(obj) {
    return new Promise((resolve) => {
      if (!extensionAlive()) { resolve(); return; }
      try {
        chrome.storage.local.set(obj, () => resolve());
      } catch (_) { resolve(); }
    });
  }

  function isCacheValid(timestamp, ttl) {
    if (!timestamp) return false;
    return (Date.now() - timestamp) < ttl;
  }

  // ────────────────────────────────────────────────────────
  // PUBLIC STORAGE API — same interface as before
  // ────────────────────────────────────────────────────────
  ns.storage = {
    extensionAlive: extensionAlive,

    // ── Projects (read-only from backend) ──
    getProjects: async function () {
      // Check cache first
      const cached = await safeGet([CACHE_KEYS.PROJECTS, CACHE_KEYS.PROJECTS_TS]);
      const ts = cached[CACHE_KEYS.PROJECTS_TS];

      if (isCacheValid(ts, TTL.PROJECTS) && cached[CACHE_KEYS.PROJECTS]) {
        return cached[CACHE_KEYS.PROJECTS];
      }

      // Fetch from API
      try {
        const hasSession = await ns.apiClient.hasSession();
        if (!hasSession) {
          // Not logged in — return cache or empty
          return cached[CACHE_KEYS.PROJECTS] || [];
        }

        const projects = await ns.apiClient.fetchProjects();
        // Normalize to the shape content scripts expect: { id, name, color }
        const normalized = (projects || []).map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color || '#6366f1',
          createdAt: p.createdAt,
        }));

        // Update cache
        await safeSet({
          [CACHE_KEYS.PROJECTS]: normalized,
          [CACHE_KEYS.PROJECTS_TS]: Date.now(),
        });

        return normalized;
      } catch (err) {
        console.warn('[TimePalette] Failed to fetch projects from API, using cache:', err.message);
        return cached[CACHE_KEYS.PROJECTS] || [];
      }
    },

    // ── Assignments ──
    getAssignments: async function () {
      const cached = await safeGet([CACHE_KEYS.ASSIGNMENTS, CACHE_KEYS.ASSIGNMENTS_TS]);
      const ts = cached[CACHE_KEYS.ASSIGNMENTS_TS];

      if (isCacheValid(ts, TTL.ASSIGNMENTS) && cached[CACHE_KEYS.ASSIGNMENTS]) {
        return cached[CACHE_KEYS.ASSIGNMENTS];
      }

      try {
        const hasSession = await ns.apiClient.hasSession();
        if (!hasSession) {
          return cached[CACHE_KEYS.ASSIGNMENTS] || {};
        }

        const raw = await ns.apiClient.fetchAssignments();
        // Backend returns { eventKey: { projectId, phaseId } }
        // Content scripts expect { eventKey: projectId } for backward compat
        // But we'll store the full shape and provide the simple map via a getter
        const simpleMap = {};
        for (const [key, val] of Object.entries(raw || {})) {
          simpleMap[key] = val.projectId;
        }

        await safeSet({
          [CACHE_KEYS.ASSIGNMENTS]: simpleMap,
          [CACHE_KEYS.ASSIGNMENTS_TS]: Date.now(),
        });

        return simpleMap;
      } catch (err) {
        console.warn('[TimePalette] Failed to fetch assignments from API, using cache:', err.message);
        return cached[CACHE_KEYS.ASSIGNMENTS] || {};
      }
    },

    // Get assignments with phase info (for sidebar grouping)
    getAssignmentsWithPhases: async function () {
      try {
        const hasSession = await ns.apiClient.hasSession();
        if (!hasSession) return {};
        return await ns.apiClient.fetchAssignments();
      } catch (err) {
        console.warn('[TimePalette] Failed to fetch assignments with phases:', err.message);
        return {};
      }
    },

    assignEvent: async function (eventKey, projectId, phaseId, eventData) {
      // Write-through: API first, then cache
      try {
        const hasSession = await ns.apiClient.hasSession();
        if (hasSession) {
          await ns.apiClient.putAssignment(eventKey, projectId, phaseId || null, eventData || null);
        }
      } catch (err) {
        console.warn('[TimePalette] Failed to sync assignment to API:', err.message);
      }

      // Update local cache immediately for instant UI response
      const cached = await safeGet([CACHE_KEYS.ASSIGNMENTS]);
      const assignments = cached[CACHE_KEYS.ASSIGNMENTS] || {};
      assignments[eventKey] = projectId;
      await safeSet({
        [CACHE_KEYS.ASSIGNMENTS]: assignments,
        [CACHE_KEYS.ASSIGNMENTS_TS]: Date.now(),
      });
    },

    unassignEvent: async function (eventKey) {
      try {
        const hasSession = await ns.apiClient.hasSession();
        if (hasSession) {
          await ns.apiClient.deleteAssignment(eventKey);
        }
      } catch (err) {
        console.warn('[TimePalette] Failed to sync unassignment to API:', err.message);
      }

      // Update local cache
      const cached = await safeGet([CACHE_KEYS.ASSIGNMENTS]);
      const assignments = cached[CACHE_KEYS.ASSIGNMENTS] || {};
      delete assignments[eventKey];
      await safeSet({
        [CACHE_KEYS.ASSIGNMENTS]: assignments,
        [CACHE_KEYS.ASSIGNMENTS_TS]: Date.now(),
      });
    },

    // Bulk save assignments (used by auto-match)
    // enrichedEntries: optional array of { eventKey, projectId, durationHours, eventTitle, eventDate }
    saveAssignments: async function (assignments, enrichedEntries) {
      // Sync to API in bulk
      try {
        const hasSession = await ns.apiClient.hasSession();
        if (hasSession) {
          if (enrichedEntries && enrichedEntries.length > 0) {
            // Use array format with event data
            await ns.apiClient.bulkPutAssignments(enrichedEntries);
          } else {
            // Legacy: convert simple map { eventKey: projectId } to API shape
            const apiShape = {};
            for (const [key, projectId] of Object.entries(assignments)) {
              apiShape[key] = { projectId };
            }
            await ns.apiClient.bulkPutAssignments(apiShape);
          }
        }
      } catch (err) {
        console.warn('[TimePalette] Failed to bulk-sync assignments to API:', err.message);
      }

      // Update local cache
      await safeSet({
        [CACHE_KEYS.ASSIGNMENTS]: assignments,
        [CACHE_KEYS.ASSIGNMENTS_TS]: Date.now(),
      });
    },

    getProjectForEvent: async function (eventKey) {
      const [projects, assignments] = await Promise.all([
        ns.storage.getProjects(),
        ns.storage.getAssignments(),
      ]);
      const projId = assignments[eventKey];
      if (!projId) return null;
      return projects.find((p) => p.id === projId) || null;
    },

    getProjectMap: async function () {
      const projects = await ns.storage.getProjects();
      const map = {};
      projects.forEach((p) => (map[p.id] = p));
      return map;
    },

    // ── Phases ──
    getPhases: async function (projectId) {
      if (!projectId) return [];

      const cached = await safeGet([CACHE_KEYS.PHASES, CACHE_KEYS.PHASES_TS]);
      const allPhases = cached[CACHE_KEYS.PHASES] || {};
      const allTs = cached[CACHE_KEYS.PHASES_TS] || {};

      if (isCacheValid(allTs[projectId], TTL.PHASES) && allPhases[projectId]) {
        return allPhases[projectId];
      }

      try {
        const hasSession = await ns.apiClient.hasSession();
        if (!hasSession) return allPhases[projectId] || [];

        const phases = await ns.apiClient.fetchPhases(projectId);
        const normalized = (phases || []).map((ph) => ({
          id: ph.id,
          name: ph.name,
          status: ph.status,
          sortOrder: ph.sortOrder,
        }));

        // Update cache for this project
        allPhases[projectId] = normalized;
        allTs[projectId] = Date.now();
        await safeSet({
          [CACHE_KEYS.PHASES]: allPhases,
          [CACHE_KEYS.PHASES_TS]: allTs,
        });

        return normalized;
      } catch (err) {
        console.warn('[TimePalette] Failed to fetch phases:', err.message);
        return allPhases[projectId] || [];
      }
    },

    // Force-refresh all caches (e.g. after login)
    invalidateAll: async function () {
      await safeSet({
        [CACHE_KEYS.PROJECTS_TS]: 0,
        [CACHE_KEYS.ASSIGNMENTS_TS]: 0,
        [CACHE_KEYS.PHASES_TS]: {},
      });
    },
  };
})(window.__gcalPT);
