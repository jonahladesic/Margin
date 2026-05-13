// ==== Time Palette — Drag-to-Create Focus Blocks ====
//
// Lets users drag a project/phase card from the Margin panel onto the
// Google Calendar time grid to create a pre-named "FOCUS: Project - Phase"
// event at the drop position.
//
// Flow:
//   1. sidebar-widget.js sets drag data via ns.dragToCreate.setDragData()
//   2. User drags over the calendar grid — we show a time indicator
//   3. On drop, we detect the target date + time from the grid position
//   4. We navigate to GCal's event creation URL with pre-filled title & time

(function (ns) {
  let dragData = null;       // { title, projectColor }
  let indicatorEl = null;    // visual feedback element during drag

  ns.dragToCreate = {
    init: function () {
      document.addEventListener('dragover', handleDragOver, true);
      document.addEventListener('drop', handleDrop, true);
      document.addEventListener('dragleave', handleDragLeave);
      document.addEventListener('dragend', handleDragEnd);
    },

    setDragData: function (data) {
      dragData = data;
    },

    clearDragData: function () {
      dragData = null;
      removeIndicator();
    },
  };

  /* ── Drag handlers ── */

  function handleDragOver(e) {
    if (!dragData) return;

    const gridInfo = getGridInfo(e);
    if (!gridInfo) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    showIndicator(e, gridInfo);
  }

  function handleDrop(e) {
    if (!dragData) return;

    const gridInfo = getGridInfo(e);
    if (!gridInfo) {
      cleanup();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const timeInfo = calcTimeFromPosition(e, gridInfo);
    if (!timeInfo) {
      cleanup();
      return;
    }

    // Build GCal event creation URL
    const url = buildEventUrl(dragData.title, timeInfo.date, timeInfo.startHour, timeInfo.startMin);
    cleanup();

    // Navigate to event creation
    window.location.href = url;
  }

  function handleDragLeave(e) {
    if (!dragData) return;
    // Only remove indicator if leaving the grid entirely
    if (!e.relatedTarget || !findGridContainer(e.relatedTarget)) {
      removeIndicator();
    }
  }

  function handleDragEnd() {
    cleanup();
  }

  function cleanup() {
    dragData = null;
    removeIndicator();
  }

  /* ── Grid detection ── */

  // Returns { container, rect, dayColumns } or null if not over the time grid
  function getGridInfo(e) {
    const container = findGridContainer(e.target);
    if (!container) return null;

    return {
      container,
      rect: container.getBoundingClientRect(),
    };
  }

  // Find the scrollable time-grid container in GCal's week/day view.
  // This is the area below the all-day row where timed events live.
  function findGridContainer(el) {
    if (!el || el === document) return null;

    // The time grid in GCal is typically inside [role="main"] and is a
    // scrollable div containing the hour rows. We look for the container
    // that has a large scrollHeight (the 24-hour grid).
    const main = document.querySelector('[role="main"]');
    if (!main) return null;

    // Strategy: find the scrollable container with the time grid
    // GCal uses a div with overflow-y that holds the full day grid.
    // We identify it by: large scrollHeight (>1000), has hour grid children.
    let current = el;
    while (current && current !== document.body) {
      if (main.contains(current)) {
        // Check if this is the scroll container or a child of it
        const scrollParent = findScrollParent(current, main);
        if (scrollParent && scrollParent.scrollHeight > 800) {
          return scrollParent;
        }
      }
      current = current.parentElement;
    }

    // Fallback: search main for the primary scrollable grid container
    const candidates = main.querySelectorAll('div');
    for (const div of candidates) {
      const style = window.getComputedStyle(div);
      if (
        (style.overflowY === 'scroll' || style.overflowY === 'auto') &&
        div.scrollHeight > 800 &&
        div.clientHeight > 200
      ) {
        return div;
      }
    }

    return null;
  }

  function findScrollParent(el, boundary) {
    let current = el;
    while (current && current !== boundary) {
      const style = window.getComputedStyle(current);
      if (
        (style.overflowY === 'scroll' || style.overflowY === 'auto') &&
        current.scrollHeight > current.clientHeight + 50
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  /* ── Time calculation ── */

  function calcTimeFromPosition(e, gridInfo) {
    const { container, rect } = gridInfo;

    // Y position relative to the grid content (accounting for scroll)
    const relativeY = e.clientY - rect.top + container.scrollTop;
    const totalHeight = container.scrollHeight;

    // The grid represents 24 hours (midnight to midnight)
    const rawHours = (relativeY / totalHeight) * 24;

    // Snap to 15-minute intervals
    const totalMinutes = Math.round(rawHours * 4) * 15;
    const startHour = Math.floor(totalMinutes / 60);
    const startMin = totalMinutes % 60;

    // Clamp to valid range
    const clampedHour = Math.max(0, Math.min(23, startHour));
    const clampedMin = Math.max(0, Math.min(45, startMin));

    // Detect the date from the column position
    const date = detectDateFromX(e.clientX, container);

    return {
      date: date,
      startHour: clampedHour,
      startMin: clampedMin,
    };
  }

  // Determine which date column the X position falls into.
  // GCal day view = single day, week view = 7 columns.
  function detectDateFromX(clientX, gridContainer) {
    const viewRange = ns.viewDetector.getCurrentViewRange();
    if (!viewRange) return new Date();

    const viewType = viewRange.viewType;

    if (viewType === 'day') {
      // Single day view — always the current viewed date
      return new Date(viewRange.startDate);
    }

    // Week / custom view — find column headers to determine dates.
    // GCal's column headers contain date info in aria-labels or data attributes.
    const main = document.querySelector('[role="main"]');
    if (!main) return new Date(viewRange.startDate);

    // Strategy 1: Find column header elements with date info
    // GCal uses elements with data-datekey="YYYYMMDD" or aria-label containing the date
    const headers = main.querySelectorAll('[data-datekey]');
    if (headers.length > 0) {
      return matchColumnByHeaders(clientX, headers, gridContainer);
    }

    // Strategy 2: Find columnheader role elements
    const colHeaders = main.querySelectorAll('[role="columnheader"]');
    if (colHeaders.length > 1) {
      return matchColumnByRole(clientX, colHeaders, viewRange);
    }

    // Strategy 3: Calculate from X position proportionally
    return calcDateFromXProportion(clientX, gridContainer, viewRange);
  }

  function matchColumnByHeaders(clientX, headers, gridContainer) {
    // Sort headers by their X position
    const sorted = Array.from(headers)
      .map((h) => ({
        el: h,
        dateKey: h.getAttribute('data-datekey'),
        rect: h.getBoundingClientRect(),
      }))
      .filter((h) => h.dateKey && h.rect.width > 0)
      .sort((a, b) => a.rect.left - b.rect.left);

    if (sorted.length === 0) return new Date();

    // Find the column whose X range contains the clientX
    for (let i = 0; i < sorted.length; i++) {
      const col = sorted[i];
      const nextCol = sorted[i + 1];
      const rightEdge = nextCol ? nextCol.rect.left : col.rect.right + col.rect.width;

      if (clientX >= col.rect.left && clientX < rightEdge) {
        return parseDateKey(col.dateKey);
      }
    }

    // Fallback to nearest
    let nearest = sorted[0];
    let minDist = Infinity;
    for (const col of sorted) {
      const center = col.rect.left + col.rect.width / 2;
      const dist = Math.abs(clientX - center);
      if (dist < minDist) {
        minDist = dist;
        nearest = col;
      }
    }
    return parseDateKey(nearest.dateKey);
  }

  function matchColumnByRole(clientX, colHeaders, viewRange) {
    const sorted = Array.from(colHeaders)
      .map((h, i) => ({ el: h, index: i, rect: h.getBoundingClientRect() }))
      .filter((h) => h.rect.width > 0)
      .sort((a, b) => a.rect.left - b.rect.left);

    if (sorted.length === 0) return new Date(viewRange.startDate);

    // Find which column the X falls into
    let colIndex = 0;
    for (let i = 0; i < sorted.length; i++) {
      const col = sorted[i];
      const nextCol = sorted[i + 1];
      const rightEdge = nextCol ? nextCol.rect.left : Infinity;
      if (clientX >= col.rect.left && clientX < rightEdge) {
        colIndex = i;
        break;
      }
    }

    // Calculate date: startDate + colIndex days
    const start = new Date(viewRange.startDate);
    const date = new Date(start);
    date.setDate(start.getDate() + colIndex);
    return date;
  }

  function calcDateFromXProportion(clientX, gridContainer, viewRange) {
    const gridRect = gridContainer.getBoundingClientRect();
    // Time labels on the left take up ~60px; the rest is day columns
    const gridLeft = gridRect.left + 60;
    const gridWidth = gridRect.width - 60;

    if (gridWidth <= 0) return new Date(viewRange.startDate);

    const start = new Date(viewRange.startDate);
    const end = new Date(viewRange.endDate);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);

    const relativeX = clientX - gridLeft;
    const dayIndex = Math.max(0, Math.min(totalDays - 1, Math.floor((relativeX / gridWidth) * totalDays)));

    const date = new Date(start);
    date.setDate(start.getDate() + dayIndex);
    return date;
  }

  function parseDateKey(key) {
    // data-datekey format: "YYYYMMDD" or "YYYY/MM/DD" or similar
    if (!key) return new Date();
    const clean = key.replace(/[^0-9]/g, '');
    if (clean.length >= 8) {
      const y = parseInt(clean.substring(0, 4));
      const m = parseInt(clean.substring(4, 6)) - 1;
      const d = parseInt(clean.substring(6, 8));
      return new Date(y, m, d);
    }
    return new Date();
  }

  /* ── GCal event creation URL ── */

  function buildEventUrl(title, date, startHour, startMin) {
    // End time = start + 30 min
    let endHour = startHour;
    let endMin = startMin + 30;
    if (endMin >= 60) {
      endHour += 1;
      endMin -= 60;
    }

    // Format: YYYYMMDDTHHmmss
    const d = date instanceof Date ? date : new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    const startStr = `${year}${month}${day}T${String(startHour).padStart(2, '0')}${String(startMin).padStart(2, '0')}00`;
    const endStr = `${year}${month}${day}T${String(endHour).padStart(2, '0')}${String(endMin).padStart(2, '0')}00`;

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${startStr}/${endStr}`,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  /* ── Visual indicator ── */

  function showIndicator(e, gridInfo) {
    if (!indicatorEl) {
      indicatorEl = document.createElement('div');
      indicatorEl.className = 'tp-drag-indicator';
      document.body.appendChild(indicatorEl);
    }

    const timeInfo = calcTimeFromPosition(e, gridInfo);
    if (!timeInfo) {
      indicatorEl.style.display = 'none';
      return;
    }

    const h = timeInfo.startHour;
    const m = timeInfo.startMin;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const displayM = String(m).padStart(2, '0');
    const timeStr = `${displayH}:${displayM} ${period}`;

    indicatorEl.textContent = timeStr;
    indicatorEl.style.display = 'flex';
    indicatorEl.style.left = (e.clientX + 16) + 'px';
    indicatorEl.style.top = (e.clientY - 14) + 'px';
  }

  function removeIndicator() {
    if (indicatorEl) {
      indicatorEl.remove();
      indicatorEl = null;
    }
  }
})(window.__gcalPT);
