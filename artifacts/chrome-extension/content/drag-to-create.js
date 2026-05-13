// ==== Time Palette — Drag-to-Create Focus Blocks ====
//
// Lets users drag a project/phase card from the Margin panel onto the
// Google Calendar time grid to create a pre-named "FOCUS: Project - Phase"
// event inline — no page navigation. The drop simulates a click on the
// grid, waits for GCal's quick-create popup, and fills in the title.

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

    const title = dragData.title;
    const dropX = e.clientX;
    const dropY = e.clientY;

    cleanup();

    // Simulate a click on the calendar grid to trigger GCal's quick-create popup
    simulateClickAndFill(dropX, dropY, title);
  }

  function handleDragLeave(e) {
    if (!dragData) return;
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

  /* ── Simulate click + fill title ── */

  function simulateClickAndFill(x, y, title) {
    // Hide the panel momentarily so elementFromPoint hits the grid
    const panel = document.getElementById('tp-panel');
    const indicator = document.querySelector('.tp-drag-indicator');
    if (panel) panel.style.pointerEvents = 'none';
    if (indicator) indicator.style.display = 'none';

    const target = document.elementFromPoint(x, y);

    if (panel) panel.style.pointerEvents = '';

    if (!target) return;

    // Dispatch mousedown + mouseup on the grid element to trigger GCal's
    // event creation flow. GCal listens for these to create a new event block.
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: 1,
    };

    target.dispatchEvent(new MouseEvent('mousedown', opts));

    // Brief delay then mouseup — GCal interprets a short mousedown→mouseup as a click
    setTimeout(() => {
      target.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
      target.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));

      // Now watch for GCal's quick-create popup to appear and fill the title
      watchForPopupAndFill(title);
    }, 50);
  }

  // Watch the DOM for GCal's quick-create popup, then fill the title input.
  function watchForPopupAndFill(title) {
    let attempts = 0;
    const maxAttempts = 40; // ~2 seconds
    const interval = 50;

    const check = () => {
      attempts++;

      // GCal's quick-create popup typically has an input or contenteditable
      // for the title. Try multiple selectors.
      const filled = tryFillTitle(title);

      if (filled) {
        return; // Success
      }

      if (attempts < maxAttempts) {
        setTimeout(check, interval);
      } else {
        // Fallback: if the simulated click didn't trigger the popup,
        // fall back to URL-based event creation
        console.log('[TimePalette] Quick-create popup not detected, falling back to URL');
        fallbackToUrl(title);
      }
    };

    // Start checking after a brief initial delay
    setTimeout(check, 100);
  }

  function tryFillTitle(title) {
    // Strategy 1: Find the quick-create popup's title input
    // GCal uses a text input with id or data attribute, or a contenteditable div
    // Look for the popup that just appeared

    // The quick-create dialog in GCal has a text input for the title
    // It's typically inside a dialog/popup that appears after clicking the grid
    const inputs = document.querySelectorAll(
      'input[type="text"][aria-label], ' +
      'input[type="text"][placeholder], ' +
      'input:not([type]):not([hidden]), ' +
      '[contenteditable="true"][aria-label]'
    );

    for (const input of inputs) {
      const label = (input.getAttribute('aria-label') || '').toLowerCase();
      const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();

      // Look for title-related inputs in the quick-create popup
      if (
        label.includes('title') ||
        label.includes('add title') ||
        placeholder.includes('title') ||
        placeholder.includes('add title')
      ) {
        // Check this input is visible and in a popup/dialog
        const rect = input.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          fillInput(input, title);
          return true;
        }
      }
    }

    // Strategy 2: Look for any newly visible input inside a dialog-like container
    const dialogs = document.querySelectorAll(
      '[role="dialog"], [data-eventid=""], [class*="popup"], [class*="bubble"]'
    );
    for (const dialog of dialogs) {
      const rect = dialog.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const titleInput = dialog.querySelector(
        'input[type="text"], input:not([type]), [contenteditable="true"]'
      );
      if (titleInput) {
        const inputRect = titleInput.getBoundingClientRect();
        if (inputRect.width > 0 && inputRect.height > 0) {
          fillInput(titleInput, title);
          return true;
        }
      }
    }

    return false;
  }

  function fillInput(input, title) {
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      // Standard input — use native setter to bypass React's controlled component
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;

      if (nativeSetter) {
        nativeSetter.call(input, title);
      } else {
        input.value = title;
      }

      // Trigger React/Angular change detection
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // contenteditable
      input.textContent = title;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Focus the input so the user sees the cursor there
    input.focus();

    console.log('[TimePalette] Filled quick-create title:', title);
  }

  function fallbackToUrl(title) {
    // If the simulated click didn't work, fall back to URL-based creation
    const viewRange = ns.viewDetector.getCurrentViewRange();
    const now = new Date();
    let date = now;
    if (viewRange && viewRange.startDate) {
      date = new Date(viewRange.startDate);
      // Use today if it's within the view range
      if (now >= viewRange.startDate && now <= viewRange.endDate) {
        date = now;
      }
    }

    // Default to next hour
    const startHour = now.getHours() + 1;
    const startMin = 0;

    const url = buildEventUrl(title, date, startHour, startMin);
    window.location.href = url;
  }

  function buildEventUrl(title, date, startHour, startMin) {
    let endHour = startHour;
    let endMin = startMin + 30;
    if (endMin >= 60) {
      endHour += 1;
      endMin -= 60;
    }

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

  /* ── Grid detection ── */

  function getGridInfo(e) {
    const container = findGridContainer(e.target);
    if (!container) return null;
    return { container, rect: container.getBoundingClientRect() };
  }

  function findGridContainer(el) {
    if (!el || el === document) return null;

    const main = document.querySelector('[role="main"]');
    if (!main) return null;

    // Walk up from the target to find the scrollable time-grid container
    let current = el;
    while (current && current !== document.body) {
      if (main.contains(current)) {
        const scrollParent = findScrollParent(current, main);
        if (scrollParent && scrollParent.scrollHeight > 800) {
          return scrollParent;
        }
      }
      current = current.parentElement;
    }

    // Fallback: search main for the primary scrollable grid
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

  function calcTimeFromPosition(e, gridInfo) {
    const { container, rect } = gridInfo;
    const relativeY = e.clientY - rect.top + container.scrollTop;
    const totalHeight = container.scrollHeight;
    const rawHours = (relativeY / totalHeight) * 24;
    const totalMinutes = Math.round(rawHours * 4) * 15;
    const startHour = Math.max(0, Math.min(23, Math.floor(totalMinutes / 60)));
    const startMin = Math.max(0, Math.min(45, totalMinutes % 60));

    const date = detectDateFromX(e.clientX, container);
    return { date, startHour, startMin };
  }

  function detectDateFromX(clientX, gridContainer) {
    const viewRange = ns.viewDetector.getCurrentViewRange();
    if (!viewRange) return new Date();

    if (viewRange.viewType === 'day') {
      return new Date(viewRange.startDate);
    }

    const main = document.querySelector('[role="main"]');
    if (!main) return new Date(viewRange.startDate);

    const headers = main.querySelectorAll('[data-datekey]');
    if (headers.length > 0) {
      return matchColumnByHeaders(clientX, headers);
    }

    const colHeaders = main.querySelectorAll('[role="columnheader"]');
    if (colHeaders.length > 1) {
      return matchColumnByRole(clientX, colHeaders, viewRange);
    }

    return calcDateFromXProportion(clientX, gridContainer, viewRange);
  }

  function matchColumnByHeaders(clientX, headers) {
    const sorted = Array.from(headers)
      .map((h) => ({
        dateKey: h.getAttribute('data-datekey'),
        rect: h.getBoundingClientRect(),
      }))
      .filter((h) => h.dateKey && h.rect.width > 0)
      .sort((a, b) => a.rect.left - b.rect.left);

    if (sorted.length === 0) return new Date();

    for (let i = 0; i < sorted.length; i++) {
      const col = sorted[i];
      const rightEdge = sorted[i + 1] ? sorted[i + 1].rect.left : Infinity;
      if (clientX >= col.rect.left && clientX < rightEdge) {
        return parseDateKey(col.dateKey);
      }
    }

    // Nearest fallback
    let nearest = sorted[0];
    let minDist = Infinity;
    for (const col of sorted) {
      const dist = Math.abs(clientX - (col.rect.left + col.rect.width / 2));
      if (dist < minDist) { minDist = dist; nearest = col; }
    }
    return parseDateKey(nearest.dateKey);
  }

  function matchColumnByRole(clientX, colHeaders, viewRange) {
    const sorted = Array.from(colHeaders)
      .map((h) => ({ el: h, rect: h.getBoundingClientRect() }))
      .filter((h) => h.rect.width > 0)
      .sort((a, b) => a.rect.left - b.rect.left);

    if (sorted.length === 0) return new Date(viewRange.startDate);

    let colIndex = 0;
    for (let i = 0; i < sorted.length; i++) {
      const rightEdge = sorted[i + 1] ? sorted[i + 1].rect.left : Infinity;
      if (clientX >= sorted[i].rect.left && clientX < rightEdge) {
        colIndex = i;
        break;
      }
    }

    const start = new Date(viewRange.startDate);
    const date = new Date(start);
    date.setDate(start.getDate() + colIndex);
    return date;
  }

  function calcDateFromXProportion(clientX, gridContainer, viewRange) {
    const gridRect = gridContainer.getBoundingClientRect();
    const gridLeft = gridRect.left + 60;
    const gridWidth = gridRect.width - 60;
    if (gridWidth <= 0) return new Date(viewRange.startDate);

    const start = new Date(viewRange.startDate);
    const end = new Date(viewRange.endDate);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const dayIndex = Math.max(0, Math.min(totalDays - 1,
      Math.floor(((clientX - gridLeft) / gridWidth) * totalDays)));

    const date = new Date(start);
    date.setDate(start.getDate() + dayIndex);
    return date;
  }

  function parseDateKey(key) {
    if (!key) return new Date();
    const clean = key.replace(/[^0-9]/g, '');
    if (clean.length >= 8) {
      return new Date(
        parseInt(clean.substring(0, 4)),
        parseInt(clean.substring(4, 6)) - 1,
        parseInt(clean.substring(6, 8))
      );
    }
    return new Date();
  }
})(window.__gcalPT);
