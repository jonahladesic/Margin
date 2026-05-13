// ==== Time Palette — Sidebar Strip + Slide-Out Panel ====
//
// Two components:
//   1. A slim "toggle strip" injected into the GCal sidebar (after mini calendar).
//      Shows "Margin" label, total logged hours, and an open button.
//   2. A 380px slide-out panel (fixed overlay on the right edge of the viewport).
//      Shows project cards with phase breakdowns, allocated vs logged hours,
//      team utilization (admin/PM, week view). Dismissible via close button,
//      Escape key, or clicking the backdrop.
//
// Public API (unchanged from old widget):
//   ns.sidebarWidget.init()
//   ns.sidebarWidget.update(parsedEvents, viewRange)

(function (ns) {
  /* ── State ── */
  let stripEl = null;
  let panelEl = null;
  let injected = false;
  let panelOpen = false;
  let showTeam = false;

  // Last-known data for re-rendering without re-fetching
  let lastRenderData = null;

  // Allocation cache
  let cachedAllocations = null;
  let allocCacheTs = 0;
  const ALLOC_TTL = 60000; // 60 s

  // Load persisted state
  try {
    ns.storage.getPanelOpen().then((v) => { panelOpen = v; });
    ns.storage.getTeamToggle().then((v) => { showTeam = v; });
  } catch (_) {}

  /* ────────────────────────────────────────────────────────
   * PUBLIC API
   * ──────────────────────────────────────────────────────── */
  ns.sidebarWidget = {
    init: function () {
      injectStrip();
      ensurePanel();
    },

    update: async function (parsedEvents, viewRange) {
      injectStrip();
      ensurePanel();

      const assignments = await ns.storage.getAssignments();
      const projects = await ns.storage.getProjects();
      const projectMap = {};
      projects.forEach((p) => (projectMap[p.id] = p));

      // Phase-level assignments
      let phaseAssignments = {};
      try { phaseAssignments = await ns.storage.getAssignmentsWithPhases(); } catch (_) {}

      // Aggregate hours per project / phase
      const projectHours = {};
      const projectEventCounts = {};
      const phaseHours = {};       // { projectId: { phaseId: hours } }
      const phaseNames = {};       // { phaseId: name }
      let totalHours = 0;

      for (const event of parsedEvents) {
        const projectId = assignments[event.eventKey];
        if (!projectId || !projectMap[projectId]) continue;

        if (!projectHours[projectId]) {
          projectHours[projectId] = 0;
          projectEventCounts[projectId] = 0;
          phaseHours[projectId] = {};
        }

        projectHours[projectId] += event.durationHours || 0;
        projectEventCounts[projectId]++;
        totalHours += event.durationHours || 0;

        const fullAssignment = phaseAssignments[event.eventKey];
        if (fullAssignment && fullAssignment.phaseId) {
          const pid = fullAssignment.phaseId;
          if (!phaseHours[projectId][pid]) phaseHours[projectId][pid] = 0;
          phaseHours[projectId][pid] += event.durationHours || 0;
        } else {
          if (!phaseHours[projectId]['__none__']) phaseHours[projectId]['__none__'] = 0;
          phaseHours[projectId]['__none__'] += event.durationHours || 0;
        }
      }

      // Load phase names
      for (const projectId of Object.keys(phaseHours)) {
        const phaseBuckets = Object.keys(phaseHours[projectId]).filter((k) => k !== '__none__');
        if (phaseBuckets.length === 0) continue;
        try {
          const phases = await ns.storage.getPhases(projectId);
          for (const ph of phases) phaseNames[ph.id] = ph.name;
        } catch (_) {}
      }

      // Fetch allocations — store both project-level and phase-level totals
      let allocByProject = {};
      let allocByPhase = {};   // { projectId: { phaseId: hours, __none__: hours } }
      let allocPhaseNames = {}; // { phaseId: name } from allocation records
      if (viewRange && viewRange.startDate && viewRange.endDate) {
        try {
          const allocs = await fetchAllocations(viewRange.startDate, viewRange.endDate);
          if (allocs && Array.isArray(allocs)) {
            for (const a of allocs) {
              const hours = parseFloat(a.allocatedHours) || 0;
              if (!allocByProject[a.projectId]) allocByProject[a.projectId] = 0;
              allocByProject[a.projectId] += hours;

              // Phase-level allocation tracking
              if (!allocByPhase[a.projectId]) allocByPhase[a.projectId] = {};
              const phKey = a.phaseId || '__none__';
              if (!allocByPhase[a.projectId][phKey]) allocByPhase[a.projectId][phKey] = 0;
              allocByPhase[a.projectId][phKey] += hours;

              // Capture phase name from allocation if available
              if (a.phaseId && a.phaseName) {
                allocPhaseNames[a.phaseId] = a.phaseName;
                phaseNames[a.phaseId] = phaseNames[a.phaseId] || a.phaseName;
              }
            }
          }
        } catch (err) {
          console.warn('[TimePalette] Failed to fetch allocations:', err.message);
        }
      }

      // Team utilization (week view, when toggled on)
      let teamData = null;
      if (showTeam && viewRange && viewRange.viewType === 'week') {
        try {
          teamData = await ns.apiClient.fetchUtilization(viewRange.startDate, viewRange.endDate);
        } catch (err) {
          console.warn('[TimePalette] Failed to fetch team utilization:', err.message);
        }
      }

      // Stash for re-render
      lastRenderData = {
        projects, projectMap, projectHours, projectEventCounts,
        phaseHours, phaseNames, totalHours, viewRange, teamData,
        allocByProject, allocByPhase,
      };

      renderStrip(totalHours);
      renderPanel(lastRenderData);
    },
  };

  /* ────────────────────────────────────────────────────────
   * ALLOCATIONS FETCH (cached)
   * ──────────────────────────────────────────────────────── */
  async function fetchAllocations(startDate, endDate) {
    if (cachedAllocations && (Date.now() - allocCacheTs) < ALLOC_TTL) return cachedAllocations;
    try {
      const hasSession = await ns.apiClient.hasSession();
      if (!hasSession) return [];
      const start = startDate instanceof Date ? startDate.toISOString().slice(0, 10) : startDate;
      const end = endDate instanceof Date ? endDate.toISOString().slice(0, 10) : endDate;
      const allocs = await ns.apiClient.fetchMyAllocations(start, end);
      cachedAllocations = allocs;
      allocCacheTs = Date.now();
      return allocs;
    } catch (err) {
      console.warn('[TimePalette] fetchAllocations error:', err.message);
      return cachedAllocations || [];
    }
  }

  /* ────────────────────────────────────────────────────────
   * STRIP — slim element inside GCal sidebar
   * ──────────────────────────────────────────────────────── */
  function injectStrip() {
    if (injected && stripEl && document.body.contains(stripEl)) return;
    injected = false;
    stripEl = null;

    const sidebar = findSidebar();
    if (!sidebar) {
      setTimeout(() => injectStrip(), 1000);
      return;
    }

    stripEl = document.createElement('div');
    stripEl.id = 'tp-sidebar-strip';
    stripEl.className = 'tp-sidebar-strip';

    // Place after mini calendar
    const miniCal = sidebar.querySelector('[role="grid"], [data-view="month"], [aria-label*="Mini calendar"]');
    if (miniCal) {
      const miniCalBlock = miniCal.closest('div');
      if (miniCalBlock && miniCalBlock.parentElement === sidebar) {
        miniCalBlock.after(stripEl);
      } else {
        sidebar.appendChild(stripEl);
      }
    } else {
      sidebar.insertBefore(stripEl, sidebar.firstChild);
    }
    injected = true;

    applyNativeMargins(stripEl, sidebar);
    requestAnimationFrame(() => applyNativeMargins(stripEl, sidebar));
    setTimeout(() => applyNativeMargins(stripEl, sidebar), 600);

    // Watch for removal
    const observer = new MutationObserver(() => {
      if (!document.body.contains(stripEl)) {
        injected = false;
        injectStrip();
      }
    });
    observer.observe(sidebar, { childList: true });

    // Initial strip content
    renderStrip(0);
  }

  function renderStrip(totalHours) {
    if (!stripEl) return;

    const display = ns.formatHours(totalHours);
    stripEl.innerHTML = `
      <div class="tp-strip-inner">
        <div class="tp-strip-left">
          <svg class="tp-strip-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <path d="M1 7h14" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 3V1M11 3V1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span class="tp-strip-label">Margin</span>
        </div>
        <div class="tp-strip-right">
          <span class="tp-strip-hours">${display}</span>
          <button class="tp-strip-btn" title="Open Margin panel" aria-label="Open Margin panel">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    const btn = stripEl.querySelector('.tp-strip-btn');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(true);
      });
    }
    // Also allow clicking the whole strip to open
    stripEl.addEventListener('click', () => togglePanel(true));
  }

  /* ────────────────────────────────────────────────────────
   * PANEL — 380px slide-out overlay
   * ──────────────────────────────────────────────────────── */
  function ensurePanel() {
    if (panelEl && document.body.contains(panelEl)) return;

    // Panel — no blocking backdrop so GCal stays interactive
    panelEl = document.createElement('div');
    panelEl.id = 'tp-panel';
    panelEl.className = 'tp-panel';
    document.body.appendChild(panelEl);

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelOpen) togglePanel(false);
    });

    // Restore persisted state
    if (panelOpen) {
      panelEl.classList.add('tp-panel-open');
    }
  }

  function togglePanel(open) {
    panelOpen = typeof open === 'boolean' ? open : !panelOpen;

    if (panelEl) {
      panelEl.classList.toggle('tp-panel-open', panelOpen);
    }

    // Persist
    try { ns.storage.setPanelOpen(panelOpen); } catch (_) {}

    // Re-render panel content if opening and we have cached data
    if (panelOpen && lastRenderData) {
      renderPanel(lastRenderData);
    }
  }

  /* ────────────────────────────────────────────────────────
   * PANEL RENDERING
   * ──────────────────────────────────────────────────────── */
  function renderPanel(data) {
    if (!panelEl) return;

    const {
      projects, projectMap, projectHours, projectEventCounts,
      phaseHours, phaseNames, totalHours, viewRange, teamData,
      allocByProject, allocByPhase,
    } = data;

    const isMonthView = viewRange && viewRange.viewType === 'month';
    const isWeekView = viewRange && viewRange.viewType === 'week';
    const hasAllocations = Object.keys(allocByProject).length > 0;

    // Active projects: have events OR have allocations
    const activeProjectIds = new Set([
      ...projects.filter((p) => (projectEventCounts[p.id] || 0) > 0).map((p) => p.id),
      ...Object.keys(allocByProject),
    ]);
    const activeProjects = projects.filter((p) => activeProjectIds.has(p.id));

    // Sort by combined hours descending
    activeProjects.sort((a, b) => {
      const hoursA = (projectHours[a.id] || 0) + (allocByProject[a.id] || 0);
      const hoursB = (projectHours[b.id] || 0) + (allocByProject[b.id] || 0);
      return hoursB - hoursA;
    });

    // Total allocated
    let totalAllocated = 0;
    for (const pid of Object.keys(allocByProject)) totalAllocated += allocByProject[pid] || 0;

    // ── Header ──
    const viewLabel = viewRange && viewRange.label ? viewRange.label : 'This Week';
    let html = `
      <div class="tp-panel-header">
        <div class="tp-panel-header-left">
          <span class="tp-panel-title">Margin</span>
          <span class="tp-panel-view-label">${esc(viewLabel)}</span>
        </div>
        <button class="tp-panel-close" title="Close" aria-label="Close panel">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `;

    // ── Summary bar ──
    const summaryLogged = ns.formatHours(totalHours);
    const summaryAllocated = totalAllocated > 0 ? ns.formatHours(totalAllocated) : null;
    const summaryPct = totalAllocated > 0 ? Math.round((totalHours / totalAllocated) * 100) : null;
    const summaryBarPct = totalAllocated > 0 ? Math.min((totalHours / totalAllocated) * 100, 100) : 0;
    const summaryBarColor = summaryPct !== null && summaryPct > 100 ? '#ef4444' : '#6366f1';

    html += `
      <div class="tp-panel-summary">
        <div class="tp-panel-summary-numbers">
          <div class="tp-panel-summary-primary">
            <span class="tp-panel-summary-value">${summaryLogged}</span>
            <span class="tp-panel-summary-unit">logged</span>
          </div>
          ${summaryAllocated ? `
            <div class="tp-panel-summary-secondary">
              <span class="tp-panel-summary-sep">/</span>
              <span class="tp-panel-summary-value">${summaryAllocated}</span>
              <span class="tp-panel-summary-unit">allocated</span>
            </div>
          ` : ''}
        </div>
        ${totalAllocated > 0 ? `
          <div class="tp-panel-summary-bar">
            <div class="tp-panel-summary-bar-fill" style="width:${summaryBarPct}%; background:${summaryBarColor}"></div>
          </div>
          <div class="tp-panel-summary-pct">${summaryPct}%</div>
        ` : ''}
      </div>
    `;

    // ── Project cards ──
    if (activeProjects.length === 0) {
      html += `<div class="tp-panel-empty">No assigned events in this view. Right-click a GCal event to assign it to a project.</div>`;
    } else {
      html += `<div class="tp-panel-section-label">Projects</div>`;
      html += `<div class="tp-panel-cards">`;

      for (const project of activeProjects) {
        const logged = projectHours[project.id] || 0;
        const allocated = allocByProject[project.id] || 0;
        const count = projectEventCounts[project.id] || 0;
        const safeCol = ns.safeColor(project.color);

        // Progress bar
        let barPct = 0;
        let barColor = safeCol;
        if (allocated > 0) {
          barPct = Math.min((logged / allocated) * 100, 100);
          if (logged > allocated) barColor = '#ef4444';
        } else if (totalHours > 0) {
          barPct = Math.max(4, (logged / totalHours) * 100);
        }

        // Status text
        let statusText = '';
        let statusClass = '';
        if (allocated > 0) {
          const pct = Math.round((logged / allocated) * 100);
          if (logged > allocated) {
            statusText = `${pct}% — over budget`;
            statusClass = 'tp-status-over';
          } else if (pct >= 80) {
            statusText = `${pct}%`;
            statusClass = 'tp-status-good';
          } else {
            statusText = `${pct}%`;
            statusClass = 'tp-status-under';
          }
        }

        // Hours display
        let hoursDisplay;
        if (isMonthView && logged === 0 && count > 0) {
          hoursDisplay = count + ' event' + (count !== 1 ? 's' : '');
        } else if (allocated > 0) {
          hoursDisplay = ns.formatHours(logged) + ' / ' + ns.formatHours(allocated);
        } else {
          hoursDisplay = ns.formatHours(logged);
        }

        // Drag title for this project (used for FOCUS block creation)
        const dragTitle = 'FOCUS: ' + project.name;

        html += `
          <div class="tp-panel-card tp-draggable" draggable="true"
               data-drag-title="${esc(dragTitle)}" data-drag-color="${safeCol}">
            <div class="tp-panel-card-header">
              <span class="tp-panel-card-dot" style="background:${safeCol}"></span>
              <span class="tp-panel-card-name">${esc(project.name)}</span>
              <span class="tp-panel-card-hours">${hoursDisplay}</span>
            </div>
            <div class="tp-panel-card-bar-track">
              <div class="tp-panel-card-bar-fill" style="width:${barPct}%; background:${barColor}"></div>
            </div>
            ${statusText ? `<div class="tp-panel-card-status ${statusClass}">${statusText}</div>` : ''}
        `;

        // Phase breakdown — merge logged phases + allocated phases
        const projPhases = phaseHours[project.id] || {};
        const projAllocPhases = (allocByPhase && allocByPhase[project.id]) || {};
        // Collect all phase IDs that have either logged or allocated hours
        const allPhaseIds = new Set([
          ...Object.keys(projPhases).filter((k) => k !== '__none__'),
          ...Object.keys(projAllocPhases).filter((k) => k !== '__none__'),
        ]);
        if (allPhaseIds.size > 0) {
          html += `<div class="tp-panel-phases">`;
          for (const phaseId of allPhaseIds) {
            const phLogged = projPhases[phaseId] || 0;
            const phAllocated = projAllocPhases[phaseId] || 0;
            const phName = phaseNames[phaseId] || 'Unknown Phase';

            // Display: "Xh / Yh" if allocated, else just "Xh"
            let phDisplay;
            if (isMonthView && phLogged === 0 && phAllocated === 0) {
              phDisplay = '';
            } else if (phAllocated > 0) {
              phDisplay = ns.formatHours(phLogged) + ' / ' + ns.formatHours(phAllocated);
            } else {
              phDisplay = ns.formatHours(phLogged);
            }

            const phaseDragTitle = 'FOCUS: ' + project.name + ' - ' + phName;
            html += `
              <div class="tp-panel-phase-row tp-draggable" draggable="true"
                   data-drag-title="${esc(phaseDragTitle)}" data-drag-color="${safeCol}">
                <span class="tp-panel-phase-border" style="border-color:${safeCol}"></span>
                <span class="tp-panel-phase-label">${esc(phName)}</span>
                <span class="tp-panel-phase-hours">${phDisplay}</span>
              </div>
            `;
          }
          html += `</div>`;
        }

        html += `</div>`; // .tp-panel-card
      }
      html += `</div>`; // .tp-panel-cards
    }

    // ── Team section (week view only) ──
    if (isWeekView) {
      const teamToggleLabel = showTeam ? 'Hide Team' : 'Show Team';
      html += `
        <div class="tp-panel-team-toggle" id="tp-team-toggle">
          <span class="tp-panel-team-toggle-label">${teamToggleLabel}</span>
        </div>
      `;

      if (showTeam && teamData && teamData.length > 0) {
        html += `<div class="tp-panel-team-section">`;
        for (const member of teamData) {
          const pct = member.targetHours > 0
            ? Math.round((member.allocatedHours / member.targetHours) * 100)
            : 0;
          const barPct = Math.min(pct, 100);
          const barColor = pct > 100 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#10b981';

          // Abbreviate: "Jonah Ladesic" -> "Jonah L."
          const parts = (member.userName || '').split(' ');
          const shortName = parts.length > 1
            ? parts[0] + ' ' + parts[parts.length - 1][0] + '.'
            : parts[0];

          html += `
            <div class="tp-panel-team-row">
              <span class="tp-panel-team-name">${esc(shortName)}</span>
              <div class="tp-panel-team-bar-wrap">
                <div class="tp-panel-team-bar" style="width:${barPct}%; background:${barColor}"></div>
              </div>
              <span class="tp-panel-team-hours">${member.allocatedHours}/${member.targetHours}h</span>
            </div>
          `;
        }
        html += `</div>`;
      }
    }

    panelEl.innerHTML = html;

    // ── Bind events ──
    const closeBtn = panelEl.querySelector('.tp-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(false);
      });
    }

    const teamToggle = panelEl.querySelector('#tp-team-toggle');
    if (teamToggle) {
      teamToggle.addEventListener('click', () => {
        showTeam = !showTeam;
        try { ns.storage.setTeamToggle(showTeam); } catch (_) {}
        // Trigger a global refresh so team data is fetched
        if (ns.storage && ns.storage.extensionAlive && ns.storage.extensionAlive()) {
          try { chrome.storage.local.set({ _tp_refresh: Date.now() }); } catch (_) {}
        }
      });
    }

    // ── Bind drag-to-create on project cards and phase rows ──
    if (ns.dragToCreate) {
      panelEl.querySelectorAll('.tp-draggable').forEach((el) => {
        el.addEventListener('dragstart', (e) => {
          // Stop propagation so phase rows don't bubble to parent card
          e.stopPropagation();

          const title = el.dataset.dragTitle || 'FOCUS:';
          const color = el.dataset.dragColor || '#6366f1';
          e.dataTransfer.setData('text/plain', title);
          e.dataTransfer.effectAllowed = 'copy';

          // Create a custom drag image
          const ghost = document.createElement('div');
          ghost.className = 'tp-drag-ghost';
          ghost.textContent = title;
          ghost.style.background = color;
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, 0, 0);
          setTimeout(() => ghost.remove(), 0);

          ns.dragToCreate.setDragData({ title, projectColor: color });
        });

        el.addEventListener('dragend', (e) => {
          e.stopPropagation();
          if (ns.dragToCreate) ns.dragToCreate.clearDragData();
        });
      });
    }
  }

  /* ────────────────────────────────────────────────────────
   * HELPERS
   * ──────────────────────────────────────────────────────── */
  function findSidebar() {
    const complementary = document.querySelector('[role="complementary"]');
    if (complementary) return complementary;
    const miniCal = document.querySelector('[data-view="month"]');
    if (miniCal) {
      const sidebar = miniCal.closest('[role="navigation"]') || miniCal.parentElement;
      if (sidebar) return sidebar;
    }
    const nav = document.querySelector('nav') || document.querySelector('[role="navigation"]');
    if (nav) return nav;
    return null;
  }

  function applyNativeMargins(el, sidebar) {
    if (!el || !document.body.contains(el)) return;
    const inset = measureNativeInset(sidebar, el);
    el.style.setProperty('margin-top', '8px', 'important');
    el.style.setProperty('margin-bottom', '4px', 'important');
    el.style.setProperty('margin-left', inset.left + 'px', 'important');
    el.style.setProperty('margin-right', inset.right + 'px', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('box-sizing', 'border-box', 'important');
  }

  function measureNativeInset(sidebar, widgetEl) {
    const DEFAULT = { left: 16, right: 16 };
    try {
      const sidebarRect = sidebar.getBoundingClientRect();
      if (!sidebarRect.width) return DEFAULT;

      const targets = [];
      if (widgetEl) {
        let n = widgetEl.nextElementSibling;
        while (n) { targets.push(n); n = n.nextElementSibling; }
        let p = widgetEl.previousElementSibling;
        while (p) { targets.push(p); p = p.previousElementSibling; }
      }
      for (const child of sidebar.children) {
        if (child === widgetEl) continue;
        if (!targets.includes(child)) targets.push(child);
      }

      let best = null;
      for (const el of targets) {
        const probes = [el];
        el.querySelectorAll(':scope > *').forEach((c) => probes.push(c));
        el.querySelectorAll(':scope > * > *').forEach((c) => probes.push(c));

        for (const probe of probes) {
          const r = probe.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.width >= sidebarRect.width - 1) continue;
          const left = Math.round(r.left - sidebarRect.left);
          const right = Math.round(sidebarRect.right - r.right);
          if (left < 4 || right < 0 || left > 80 || right > 80) continue;
          if (!best || left < best.left) best = { left, right };
        }
      }
      return best || DEFAULT;
    } catch (_) {
      return DEFAULT;
    }
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})(window.__gcalPT);
