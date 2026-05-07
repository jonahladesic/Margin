// ==== Time Palette — View Detector ====
(function (ns) {
  let currentView = null;
  let currentRange = null;
  const listeners = [];

  ns.viewDetector = {
    init: function () {
      updateView();
      // Google Calendar is a SPA — watch for navigation
      window.addEventListener('popstate', updateView);
      // Also observe URL changes via polling (GCal uses pushState)
      let lastUrl = location.href;
      setInterval(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          updateView();
        }
      }, 500);
    },

    getCurrentViewRange: function () {
      if (!currentRange) updateView();
      return currentRange;
    },

    onViewChange: function (callback) {
      listeners.push(callback);
    },
  };

  function updateView() {
    const path = window.location.pathname;
    const prev = JSON.stringify(currentRange);

    // Parse view type from URL: /r/day, /r/week, /r/month, /r/customday, /r/agenda
    const viewMatch = path.match(/\/r\/(day|week|month|customday|agenda)(?:\/(\d{4})\/(\d{1,2})\/(\d{1,2}))?/);

    if (!viewMatch) {
      // Default/home view — usually week
      currentRange = { viewType: 'week', startDate: getWeekStart(new Date()), endDate: getWeekEnd(new Date()), label: 'This Week' };
      return;
    }

    const viewType = viewMatch[1];
    let baseDate = new Date();

    if (viewMatch[2]) {
      baseDate = new Date(
        parseInt(viewMatch[2]),
        parseInt(viewMatch[3]) - 1,
        parseInt(viewMatch[4])
      );
    }

    switch (viewType) {
      case 'day':
        currentRange = {
          viewType: 'day',
          startDate: startOfDay(baseDate),
          endDate: endOfDay(baseDate),
          label: formatDateLabel(baseDate),
        };
        break;

      case 'week':
        currentRange = {
          viewType: 'week',
          startDate: getWeekStart(baseDate),
          endDate: getWeekEnd(baseDate),
          label: formatWeekLabel(getWeekStart(baseDate), getWeekEnd(baseDate)),
        };
        break;

      case 'month':
        currentRange = {
          viewType: 'month',
          startDate: new Date(baseDate.getFullYear(), baseDate.getMonth(), 1),
          endDate: new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0),
          label: formatMonthLabel(baseDate),
        };
        break;

      case 'customday':
        // Custom N-day view — try to detect range from visible headers
        // Fallback: assume 4-day view
        currentRange = {
          viewType: 'custom',
          startDate: startOfDay(baseDate),
          endDate: endOfDay(new Date(baseDate.getTime() + 3 * 86400000)),
          label: 'Custom View',
        };
        break;

      case 'agenda':
        // Schedule/agenda view — show current month
        currentRange = {
          viewType: 'agenda',
          startDate: new Date(baseDate.getFullYear(), baseDate.getMonth(), 1),
          endDate: new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0),
          label: 'Schedule View',
        };
        break;
    }

    if (JSON.stringify(currentRange) !== prev) {
      listeners.forEach((cb) => cb(currentRange));
    }
  }

  // ---- Date helpers ----
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  }

  function getWeekStart(d) {
    const day = d.getDay(); // 0=Sun
    const diff = d.getDate() - day;
    return new Date(d.getFullYear(), d.getMonth(), diff);
  }

  function getWeekEnd(d) {
    const start = getWeekStart(d);
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
  }

  function formatDateLabel(d) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatWeekLabel(start, end) {
    const opts = { month: 'short', day: 'numeric' };
    return start.toLocaleDateString('en-US', opts) + ' – ' + end.toLocaleDateString('en-US', opts);
  }

  function formatMonthLabel(d) {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
})(window.__gcalPT);
