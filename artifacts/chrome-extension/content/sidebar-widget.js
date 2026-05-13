// ==== Time Palette — Sidebar Widget (with Phases + Allocations + Team Summary) ====
(function (ns) {
  let widgetEl = null;
  let injected = false;
  let showTeam = false; // persisted toggle

  // Allocation cache
  let cachedAllocations = null;
  let allocCacheTs = 0;
  const ALLOC_TTL = 60000; // 60 seconds

  // Load team toggle preference
  try {
    chrome.storage.local.get('tp_show_team', (result) => {
      showTeam = !!result.tp_show_team;
    });
  } catch (_) {}

  ns.sidebarWidget = {
    init: function () {
      injectWidget();
    },

    update: async function (parsedEvents, viewRange) {
      injectWidget();
      if (!widgetEl) {
        console.log('[TimePalette] Widget not injected yet, skipping update');
        return;
      }

      const assignments = await ns.storage.getAssignments();
      const projects = await ns.storage.getProjects();
      const projectMap = {};
      projects.forEach((p) => (projectMap[p.id] = p));

      // Try to get phase-level assignments
      let phaseAssignments = {};
      try {
        phaseAssignments = await ns.storage.getAssignmentsWithPhases();
      } catch (_) {}

      // Aggregate hours per project and per phase
      const projectHours = {};
      const projectEventCounts = {};
      const phaseHours = {};       // { projectId: { phaseId: hours } }
      const phaseNames = {};       // { phaseId: name } — we'll fill lazily
      let totalHours = 0;
      let assignedCount = 0;

      for (const event of parsedEvents) {
        const projectId = assignments[event.eventKey];
        if (!projectId || !projectMap[projectId]) continue;

        assignedCount++;
        if (!projectHours[projectId]) {
          projectHours[projectId] = 0;
          projectEventCounts[projectId] = 0;
          phaseHours[projectId] = {};
        }

        projectHours[projectId] += event.durationHours || 0;
        projectEventCounts[projectId]++;
        totalHours += event.durationHours || 0;

        // Phase-level tracking
        const fullAssignment = phaseAssignments[event.eventKey];
        if (fullAssignment && fullAssignment.phaseId) {
          const pid = fullAssignment.phaseId;
          if (!phaseHours[projectId][pid]) phaseHours[projectId][pid] = 0;
          phaseHours[projectId][pid] += event.durationHours || 0;
        } else {
          // "No phase" bucket
          if (!phaseHours[projectId]['__none__']) phaseHours[projectId]['__none__'] = 0;
          phaseHours[projectId]['__none__'] += event.durationHours || 0;
        }
      }

      // Load phase names for projects that have phase-level data
      for (const projectId of Object.keys(phaseHours)) {
        const phaseBuckets = Object.keys(phaseHours[projectId]).filter((k) => k !== '__none__');
        if (phaseBuckets.length === 0) continue;
        try {
          const phases = await ns.storage.getPhases(projectId);
          for (const ph of phases) {
            phaseNames[ph.id] = ph.name;
          }
        } catch (_) {}
      }

      // Fetch allocations for the current user in the visible date range
      let allocByProject = {}; // { projectId: totalAllocatedHours }
      if (viewRange && viewRange.startDate && viewRange.endDate) {
        try {
          const allocs = await fetchAllocations(viewRange.startDate, viewRange.endDate);
          if (allocs && Array.isArray(allocs)) {
            for (const a of allocs) {
              if (!allocByProject[a.projectId]) allocByProject[a.projectId] = 0;
              allocByProject[a.projectId] += parseFloat(a.allocatedHours) || 0;
            }
          }
        } catch (err) {
          console.warn('[TimePalette] Failed to fetch allocations:', err.message);
        }
      }

      // Fetch team utilization if in week view and toggle is on
      let teamData = null;
      if (showTeam && viewRange && viewRange.viewType === 'week') {
        try {
          teamData = await ns.apiClient.fetchUtilization(
            viewRange.startDate,
            viewRange.endDate
          );
        } catch (err) {
          console.warn('[TimePalette] Failed to fetch team utilization:', err.message);
        }
      }

      renderWidget(projects, projectHours, projectEventCounts, phaseHours, phaseNames, totalHours, viewRange, teamData, allocByProject);
    },
  };

  async function fetchAllocations(startDate, endDate) {
    // Check cache
    if (cachedAllocations && (Date.now() - allocCacheTs) < ALLOC_TTL) {
      return cachedAllocations;
    }

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

  function injectWidget() {
    if (injected && widgetEl && document.body.contains(widgetEl)) return;

    injected = false;
    widgetEl = null;

    const sidebar = findSidebar();
    if (!sidebar) {
      console.log('[TimePalette] Sidebar not found yet, retrying in 1s…');
      setTimeout(() => injectWidget(), 1000);
      return;
    }

    widgetEl = document.createElement('div');
    widgetEl.id = 'tp-sidebar-widget';
    widgetEl.className = 'tp-sidebar-widget';

    const miniCal = sidebar.querySelector('[role="grid"], [data-view="month"], [aria-label*="Mini calendar"]');
    if (miniCal) {
      const miniCalBlock = miniCal.closest('div');
      if (miniCalBlock && miniCalBlock.parentElement === sidebar) {
        miniCalBlock.after(widgetEl);
      } else {
        sidebar.appendChild(widgetEl);
      }
    } else {
      sidebar.insertBefore(widgetEl, sidebar.firstChild);
    }
    injected = true;

    applyNativeMargins(widgetEl, sidebar);
    requestAnimationFrame(() => applyNativeMargins(widgetEl, sidebar));
    setTimeout(() => applyNativeMargins(widgetEl, sidebar), 600);

    const observer = new MutationObserver(() => {
      if (!document.body.contains(widgetEl)) {
        injected = false;
        injectWidget();
      }
    });
    observer.observe(sidebar, { childList: true });
  }

  function applyNativeMargins(el, sidebar) {
    if (!el || !document.body.contains(el)) return;
    const inset = measureNativeInset(sidebar, el);
    el.style.setProperty('margin-top', '8px', 'important');
    el.style.setProperty('margin-bottom', '12px', 'important');
    el.style.setProperty('margin-left', inset.left + 'px', 'important');
    el.style.setProperty('margin-right', inset.right + 'px', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('box-sizing', 'border-box', 'important');
  }

  function measureNativeInset(sidebar, widgetEl) {
    const DEFAULT = { left: 16, right: 16, source: 'default' };
    try {
      const sidebarRect = sidebar.getBoundingClientRect();
      if (!sidebarRect.width) return DEFAULT;

      const targets = [];
      if (widgetEl) {
        let n = widgetEl.nextElementSibling;
        while (n) { targets.push({ el: n, src: 'next-sibling' }); n = n.nextElementSibling; }
        let p = widgetEl.previousElementSibling;
        while (p) { targets.push({ el: p, src: 'prev-sibling' }); p = p.previousElementSibling; }
      }
      for (const child of sidebar.children) {
        if (child === widgetEl) continue;
        if (!targets.find((t) => t.el === child)) targets.push({ el: child, src: 'sidebar-child' });
      }

      let best = null;
      for (const { el, src } of targets) {
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
          if (!best || left < best.left) {
            best = { left, right, source: src };
          }
        }
      }

      return best || DEFAULT;
    } catch (e) {
      return DEFAULT;
    }
  }

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

  function renderWidget(projects, projectHours, projectEventCounts, phaseHours, phaseNames, totalHours, viewRange, teamData, allocByProject) {
    if (!widgetEl) return;

    const isMonthView = viewRange && viewRange.viewType === 'month';
    const isWeekView = viewRange && viewRange.viewType === 'week';
    const hasAllocations = Object.keys(allocByProject).length > 0;

    // Show projects that either have events OR have allocations
    const activeProjectIds = new Set([
      ...projects.filter((p) => (projectEventCounts[p.id] || 0) > 0).map((p) => p.id),
      ...Object.keys(allocByProject),
    ]);
    const activeProjects = projects.filter((p) => activeProjectIds.has(p.id));

    if (activeProjects.length === 0 && !teamData) {
      const msg = projects.length === 0
        ? 'No projects yet'
        : 'No assigned events in this view';
      widgetEl.innerHTML = `<div class="tp-widget-empty">${escapeHtml(msg)}</div>`;
      return;
    }

    let html = '';

    // ── Project hours section ──
    if (activeProjects.length > 0) {
      let rowsHtml = '';
      // Sort by logged hours descending, then by allocated hours
      activeProjects.sort((a, b) => {
        const hoursA = (projectHours[a.id] || 0) + (allocByProject[a.id] || 0);
        const hoursB = (projectHours[b.id] || 0) + (allocByProject[b.id] || 0);
        return hoursB - hoursA;
      });

      // Calculate max hours for bar scaling
      let totalAllocated = 0;
      for (const pid of Object.keys(allocByProject)) {
        totalAllocated += allocByProject[pid] || 0;
      }

      activeProjects.forEach((project) => {
        const logged = projectHours[project.id] || 0;
        const allocated = allocByProject[project.id] || 0;
        const count = projectEventCounts[project.id] || 0;
        const safeCol = ns.safeColor(project.color);

        // Display string
        let display;
        if (isMonthView && logged === 0 && count > 0) {
          display = count + ' event' + (count !== 1 ? 's' : '');
        } else if (allocated > 0) {
          display = ns.formatHours(logged) + ' / ' + ns.formatHours(allocated);
        } else {
          display = ns.formatHours(logged);
        }

        // Bar: show progress toward allocation if available, otherwise proportion of total
        let barPercent;
        let barColor = safeCol;
        if (allocated > 0) {
          barPercent = Math.max(4, Math.min((logged / allocated) * 100, 120));
          // Color coding: over budget = red, on track = project color, under 50% = amber
          if (logged > allocated) {
            barColor = '#ef4444'; // red — over budget
          } else if (logged < allocated * 0.5 && logged > 0) {
            barColor = safeCol; // keep project color but lighter
          }
        } else {
          barPercent = totalHours > 0 ? Math.max(4, (logged / totalHours) * 100) : 0;
        }

        rowsHtml += `
          <div class="tp-project-row">
            <div class="tp-project-info">
              <span class="tp-dot" style="background:${safeCol}"></span>
              <span class="tp-project-label">${escapeHtml(project.name)}</span>
              <span class="tp-project-hours">${display}</span>
            </div>
            <div class="tp-bar-track">
              <div class="tp-bar-fill" style="width:${Math.min(barPercent, 100)}%; background:${barColor}"></div>
              ${barPercent > 100 ? `<div class="tp-bar-overflow" style="width:${barPercent - 100}%; background:#ef4444"></div>` : ''}
            </div>
          </div>
        `;

        // Phase breakdown under this project
        const projPhases = phaseHours[project.id] || {};
        const phaseKeys = Object.keys(projPhases).filter((k) => k !== '__none__');
        if (phaseKeys.length > 0) {
          phaseKeys.forEach((phaseId) => {
            const phHours = projPhases[phaseId] || 0;
            const phName = phaseNames[phaseId] || 'Unknown Phase';
            const phDisplay = isMonthView && phHours === 0 ? '' : ns.formatHours(phHours);

            rowsHtml += `
              <div class="tp-phase-row">
                <span class="tp-phase-border" style="border-color:${safeCol}"></span>
                <span class="tp-phase-label">${escapeHtml(phName)}</span>
                <span class="tp-phase-hours">${phDisplay}</span>
              </div>
            `;
          });
        }
      });

      // Total row
      let totalDisplay;
      if (totalAllocated > 0) {
        totalDisplay = ns.formatHours(totalHours) + ' / ' + ns.formatHours(totalAllocated);
      } else {
        totalDisplay = ns.formatHours(totalHours);
      }

      html += `
        <div class="tp-project-list">
          ${rowsHtml}
        </div>
        <div class="tp-total-row">
          <span class="tp-total-label">Total</span>
          <span class="tp-total-hours">${totalDisplay}</span>
        </div>
      `;
    }

    // ── Team section (week view only) ──
    if (isWeekView) {
      const teamToggleLabel = showTeam ? 'Hide Team' : 'Show Team';
      html += `
        <div class="tp-team-toggle" id="tp-team-toggle">
          <span class="tp-team-toggle-label">${teamToggleLabel}</span>
        </div>
      `;

      if (showTeam && teamData && teamData.length > 0) {
        let teamHtml = '';
        for (const member of teamData) {
          const pct = member.targetHours > 0
            ? Math.round((member.allocatedHours / member.targetHours) * 100)
            : 0;
          const barPct = Math.min(pct, 100);
          const barColor = pct > 100 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#10b981';

          // Abbreviate name: "Jonah Lad" → "Jonah L."
          const parts = (member.userName || '').split(' ');
          const shortName = parts.length > 1
            ? parts[0] + ' ' + parts[parts.length - 1][0] + '.'
            : parts[0];

          teamHtml += `
            <div class="tp-team-row">
              <span class="tp-team-name">${escapeHtml(shortName)}</span>
              <div class="tp-team-bar-wrap">
                <div class="tp-team-bar" style="width:${barPct}%; background:${barColor}"></div>
              </div>
              <span class="tp-team-hours">${member.allocatedHours}/${member.targetHours}h</span>
            </div>
          `;
        }
        html += `<div class="tp-team-section">${teamHtml}</div>`;
      }
    }

    widgetEl.innerHTML = html;

    // Bind team toggle click
    const toggleBtn = widgetEl.querySelector('#tp-team-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        showTeam = !showTeam;
        try {
          chrome.storage.local.set({ tp_show_team: showTeam });
        } catch (_) {}
        // Re-render by triggering a refresh
        if (ns.storage && ns.storage.extensionAlive && ns.storage.extensionAlive()) {
          // Force a re-render via the storage change listener hack
          chrome.storage.local.set({ _tp_refresh: Date.now() });
        }
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})(window.__gcalPT);
