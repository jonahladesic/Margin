// ==== Time Palette — Custom Context Menu (with Phase support) ====
(function (ns) {
  let menuEl = null;
  let currentEventData = null;
  let onAssignCallback = null;

  ns.contextMenu = {
    init: function (onAssign) {
      onAssignCallback = onAssign;
      // Use capture phase so we run BEFORE Google Calendar's own handlers
      document.addEventListener('contextmenu', handleContextMenu, true);
      document.addEventListener('click', closeMenu);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
      });
      console.log('[TimePalette] Context menu initialized (capture phase)');
    },
  };

  function handleContextMenu(e) {
    const chip = ns.domObserver.findChipFromTarget(e.target);
    if (!chip) return;

    const parsed = ns.domObserver.parseChip(chip);
    if (!parsed) return;

    console.log('[TimePalette] Event chip parsed:', parsed.title, 'key:', parsed.eventKey);

    e.preventDefault();
    e.stopPropagation();

    currentEventData = parsed;
    showMenu(e.clientX, e.clientY);
  }

  // Allocation cache for context menu sorting
  let cachedMenuAllocs = null;
  let menuAllocsCacheTs = 0;
  const MENU_ALLOC_TTL = 60000; // 60 s

  // Returns { projectIds: Set, byProject: { [pid]: { totalHours, phases: { [phaseId]: { name, hours } } } } }
  async function getMyAllocations() {
    const EMPTY = { projectIds: new Set(), byProject: {} };
    try {
      const viewRange = ns.viewDetector.getCurrentViewRange();
      if (!viewRange || !viewRange.startDate || !viewRange.endDate) return EMPTY;

      if (cachedMenuAllocs && (Date.now() - menuAllocsCacheTs) < MENU_ALLOC_TTL) {
        return cachedMenuAllocs;
      }

      const hasSession = await ns.apiClient.hasSession();
      if (!hasSession) return EMPTY;

      const start = viewRange.startDate instanceof Date
        ? viewRange.startDate.toISOString().slice(0, 10) : viewRange.startDate;
      const end = viewRange.endDate instanceof Date
        ? viewRange.endDate.toISOString().slice(0, 10) : viewRange.endDate;

      const allocs = await ns.apiClient.fetchMyAllocations(start, end);
      const result = { projectIds: new Set(), byProject: {} };

      if (Array.isArray(allocs)) {
        for (const a of allocs) {
          if (!a.projectId) continue;
          result.projectIds.add(a.projectId);

          if (!result.byProject[a.projectId]) {
            result.byProject[a.projectId] = { totalHours: 0, phases: {} };
          }
          const hours = parseFloat(a.allocatedHours) || 0;
          result.byProject[a.projectId].totalHours += hours;

          if (a.phaseId) {
            result.byProject[a.projectId].phases[a.phaseId] = {
              name: a.phaseName || 'Unknown Phase',
              hours: hours,
            };
          }
        }
      }

      cachedMenuAllocs = result;
      menuAllocsCacheTs = Date.now();
      return result;
    } catch (_) {
      return cachedMenuAllocs || EMPTY;
    }
  }

  async function showMenu(x, y) {
    removeMenuDOM();

    const projects = await ns.storage.getProjects();
    const assignments = await ns.storage.getAssignments();
    const currentAssignment = assignments[currentEventData.eventKey] || null;

    // Also get phase-level assignments if available
    let currentPhaseId = null;
    try {
      const fullAssignments = await ns.storage.getAssignmentsWithPhases();
      const full = fullAssignments[currentEventData.eventKey];
      if (full && full.phaseId) currentPhaseId = full.phaseId;
    } catch (_) {}

    // Fetch allocation data (projects + phases) for the current user
    const myAllocs = await getMyAllocations();

    // Split into allocated (top) and other (bottom)
    const allocatedProjects = [];
    const otherProjects = [];
    for (const p of projects) {
      if (myAllocs.projectIds.has(p.id)) {
        allocatedProjects.push(p);
      } else {
        otherProjects.push(p);
      }
    }

    menuEl = document.createElement('div');
    menuEl.className = 'tp-context-menu';

    // Header
    const header = document.createElement('div');
    header.className = 'tp-menu-header';
    header.textContent = 'Assign to Project';
    menuEl.appendChild(header);

    // Event title preview
    const preview = document.createElement('div');
    preview.className = 'tp-menu-event';
    preview.textContent = currentEventData.title;
    menuEl.appendChild(preview);

    const divider = document.createElement('div');
    divider.className = 'tp-menu-divider';
    menuEl.appendChild(divider);

    if (projects.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tp-menu-empty';
      empty.textContent = 'No projects. Create one in the Margin app.';
      menuEl.appendChild(empty);
    } else {
      // ── Allocated projects first ──
      if (allocatedProjects.length > 0) {
        const allocLabel = document.createElement('div');
        allocLabel.className = 'tp-menu-section-label';
        allocLabel.textContent = 'My Allocations';
        menuEl.appendChild(allocLabel);

        for (const project of allocatedProjects) {
          const projAlloc = myAllocs.byProject[project.id] || null;
          menuEl.appendChild(buildProjectItem(project, currentAssignment, currentPhaseId, projAlloc));
        }
      }

      // ── Other projects ──
      if (otherProjects.length > 0) {
        if (allocatedProjects.length > 0) {
          const sep = document.createElement('div');
          sep.className = 'tp-menu-section-label';
          sep.textContent = 'Other Projects';
          menuEl.appendChild(sep);
        }

        for (const project of otherProjects) {
          menuEl.appendChild(buildProjectItem(project, currentAssignment, currentPhaseId, null));
        }
      }

      // Unassign option
      if (currentAssignment) {
        const divider2 = document.createElement('div');
        divider2.className = 'tp-menu-divider';
        menuEl.appendChild(divider2);

        const unassign = document.createElement('div');
        unassign.className = 'tp-menu-item tp-menu-item-unassign';
        unassign.innerHTML = `<span class="tp-menu-label">Remove from project</span>`;
        unassign.addEventListener('click', () => {
          unassignEvent();
        });
        menuEl.appendChild(unassign);
      }
    }

    document.body.appendChild(menuEl);

    // Position — keep within viewport
    const rect = menuEl.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    menuEl.style.left = Math.min(x, maxX) + 'px';
    menuEl.style.top = Math.min(y, maxY) + 'px';
  }

  function buildProjectItem(project, currentAssignment, currentPhaseId, projAlloc) {
    const item = document.createElement('div');
    item.className = 'tp-menu-item tp-menu-item-project';
    if (currentAssignment === project.id) {
      item.classList.add('tp-menu-item-active');
    }

    item.innerHTML = `
      <span class="tp-menu-dot" style="background:${ns.safeColor(project.color)}"></span>
      <span class="tp-menu-label">${escapeHtml(project.name)}</span>
      ${currentAssignment === project.id ? '<span class="tp-menu-check">✓</span>' : ''}
      <span class="tp-menu-arrow">›</span>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.tp-menu-arrow')) return;
      assignToProject(project.id, null);
    });

    item.addEventListener('mouseenter', () => {
      showPhaseSubmenu(item, project, currentPhaseId, projAlloc);
    });
    item.addEventListener('mouseleave', (e) => {
      const related = e.relatedTarget;
      const sub = item.querySelector('.tp-phase-submenu');
      if (sub && (sub === related || sub.contains(related))) return;
      hidePhaseSubmenu(item);
    });

    return item;
  }

  // Phase submenu — appears on hover over a project row
  // projAlloc: { totalHours, phases: { [phaseId]: { name, hours } } } | null
  async function showPhaseSubmenu(projectItem, project, currentPhaseId, projAlloc) {
    // Remove any existing submenu on this item
    hidePhaseSubmenu(projectItem);

    const phases = await ns.storage.getPhases(project.id);
    if (!phases || phases.length === 0) return; // No phases → no submenu

    // Build a set of allocated phase IDs for this project
    const allocatedPhases = (projAlloc && projAlloc.phases) || {};
    const allocatedPhaseIds = new Set(Object.keys(allocatedPhases));

    // Split phases into allocated (top) and other (bottom)
    const myPhases = phases.filter((ph) => allocatedPhaseIds.has(ph.id));
    const otherPhases = phases.filter((ph) => !allocatedPhaseIds.has(ph.id));

    const sub = document.createElement('div');
    sub.className = 'tp-phase-submenu';

    // "No phase" option
    const noPhase = document.createElement('div');
    noPhase.className = 'tp-menu-item tp-menu-item-phase';
    if (!currentPhaseId) noPhase.classList.add('tp-menu-item-active');
    noPhase.innerHTML = `<span class="tp-menu-label">No specific phase</span>`;
    noPhase.addEventListener('click', () => assignToProject(project.id, null));
    sub.appendChild(noPhase);

    const phaseDivider = document.createElement('div');
    phaseDivider.className = 'tp-menu-divider';
    sub.appendChild(phaseDivider);

    // ── Allocated phases first ──
    if (myPhases.length > 0) {
      const allocLabel = document.createElement('div');
      allocLabel.className = 'tp-menu-section-label';
      allocLabel.textContent = 'Assigned to You';
      sub.appendChild(allocLabel);

      for (const phase of myPhases) {
        const allocInfo = allocatedPhases[phase.id];
        const hoursLabel = allocInfo ? allocInfo.hours + 'h' : '';
        const phaseItem = document.createElement('div');
        phaseItem.className = 'tp-menu-item tp-menu-item-phase';
        if (currentPhaseId === phase.id) phaseItem.classList.add('tp-menu-item-active');
        phaseItem.innerHTML = `
          <span class="tp-menu-label">${escapeHtml(phase.name)}</span>
          ${hoursLabel ? '<span class="tp-menu-alloc-badge">' + hoursLabel + '</span>' : ''}
          ${currentPhaseId === phase.id ? '<span class="tp-menu-check">✓</span>' : ''}
        `;
        phaseItem.addEventListener('click', () => assignToProject(project.id, phase.id));
        sub.appendChild(phaseItem);
      }
    }

    // ── Other phases ──
    if (otherPhases.length > 0) {
      if (myPhases.length > 0) {
        const otherLabel = document.createElement('div');
        otherLabel.className = 'tp-menu-section-label';
        otherLabel.textContent = 'Other Phases';
        sub.appendChild(otherLabel);
      }

      for (const phase of otherPhases) {
        const phaseItem = document.createElement('div');
        phaseItem.className = 'tp-menu-item tp-menu-item-phase';
        if (currentPhaseId === phase.id) phaseItem.classList.add('tp-menu-item-active');
        phaseItem.innerHTML = `
          <span class="tp-menu-label">${escapeHtml(phase.name)}</span>
          ${currentPhaseId === phase.id ? '<span class="tp-menu-check">✓</span>' : ''}
        `;
        phaseItem.addEventListener('click', () => assignToProject(project.id, phase.id));
        sub.appendChild(phaseItem);
      }
    }

    // Handle mouseleave on the submenu itself
    sub.addEventListener('mouseleave', (e) => {
      const related = e.relatedTarget;
      if (projectItem === related || projectItem.contains(related)) return;
      hidePhaseSubmenu(projectItem);
    });

    projectItem.appendChild(sub);

    // Position submenu to the right (or left if off-screen)
    const menuRect = menuEl.getBoundingClientRect();
    const subRect = sub.getBoundingClientRect();
    if (menuRect.right + subRect.width > window.innerWidth - 8) {
      sub.style.left = 'auto';
      sub.style.right = '100%';
    }
  }

  function hidePhaseSubmenu(projectItem) {
    const sub = projectItem.querySelector('.tp-phase-submenu');
    if (sub) sub.remove();
  }

  async function assignToProject(projectId, phaseId) {
    if (!currentEventData) return;
    await ns.storage.assignEvent(currentEventData.eventKey, projectId, phaseId, {
      durationHours: currentEventData.durationHours || 0,
      eventTitle: currentEventData.title || '',
      eventDate: currentEventData.date || '',
    });
    closeMenu();
    if (onAssignCallback) onAssignCallback();
  }

  async function unassignEvent() {
    if (!currentEventData) return;
    await ns.storage.unassignEvent(currentEventData.eventKey);
    closeMenu();
    if (onAssignCallback) onAssignCallback();
  }

  function removeMenuDOM() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
  }

  function closeMenu() {
    removeMenuDOM();
    currentEventData = null;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})(window.__gcalPT);
