// ==== Time Palette — Content Script Orchestrator ====
(function (ns) {
  const DEBUG = true;

  async function refresh() {
    // Bail out if the extension context was invalidated (e.g. user reloaded
    // the extension while this tab was still open). Any chrome.* call would
    // otherwise throw "Extension context invalidated" and spam the error log.
    if (ns.storage && !ns.storage.extensionAlive()) return;

    const events = ns.domObserver.parseAllVisibleEvents();
    const viewRange = ns.viewDetector.getCurrentViewRange();
    if (DEBUG) {
      console.log('[TimePalette] Refresh — events found:', events.length, 'view:', viewRange && viewRange.label);
    }
    await ns.eventColoring.apply(events);
    await ns.sidebarWidget.update(events, viewRange);
  }

  // ---- Auto-match visible events to projects by title ----
  // Strategy:
  //   1. Normalize both strings: lowercase, strip punctuation, collapse
  //      whitespace, NFKD + remove diacritics.
  //   2. Tokenize project name. Match if ALL project-name tokens appear
  //      (as whole words) inside the event title.
  //   3. Longest project name wins on ties.
  //   4. Never overwrites existing assignments.
  //
  // Token-based matching handles things like "FOCUS: Legacy East" matching
  // "Legacy East" even with colons, non-breaking spaces, guest suffixes,
  // or other punctuation the strict substring match would trip on.
  async function autoMatchVisibleEvents() {
    const events = ns.domObserver.parseAllVisibleEvents();
    const projects = await ns.storage.getProjects();
    const assignments = await ns.storage.getAssignments();

    if (DEBUG) {
      console.log('[TimePalette] Auto-match starting — events:', events.length, 'projects:', projects.length);
    }

    if (projects.length === 0 || events.length === 0) return 0;

    const normProjects = projects
      .map((p) => {
        const norm = normalizeForMatch(p.name || '');
        const tokens = norm.split(/\s+/).filter(Boolean);
        return { id: p.id, name: p.name, norm, tokens };
      })
      .filter((p) => p.tokens.length > 0);

    if (normProjects.length === 0) return 0;

    const seen = new Set();
    let assignedCount = 0;
    const updated = { ...assignments };
    const unmatched = [];

    for (const ev of events) {
      if (!ev || !ev.eventKey) continue;
      if (seen.has(ev.eventKey)) continue;
      seen.add(ev.eventKey);

      if (updated[ev.eventKey]) continue;

      // Skip multi-day (top-bar) events — user request. These span multiple days
      // and their "hours" are zeroed from totals; auto-coloring them tends to feel
      // noisy because one event paints across every day it touches. Manual
      // right-click assignment still works for them.
      if (ev.multiDay) continue;

      const rawTitle = (ev.title || '').trim();
      if (!rawTitle) continue;

      const normTitle = normalizeForMatch(rawTitle);
      if (!normTitle) continue;

      let best = null;
      for (const p of normProjects) {
        if (tokensAllPresent(p.tokens, normTitle)) {
          if (!best || p.norm.length > best.norm.length) best = p;
        }
      }

      if (best) {
        updated[ev.eventKey] = best.id;
        assignedCount++;
        if (DEBUG) console.log('[TimePalette] Auto-match ✓', rawTitle, '→', best.name);
      } else if (DEBUG) {
        unmatched.push(rawTitle);
      }
    }

    if (assignedCount > 0) {
      await ns.storage.saveAssignments(updated);
      refresh();
    }

    if (DEBUG) {
      console.log('[TimePalette] Auto-match — scanned:', seen.size, 'assigned:', assignedCount);
      if (unmatched.length) {
        console.log('[TimePalette] Auto-match — unmatched event titles (first 10):', unmatched.slice(0, 10));
      }
      console.log('[TimePalette] Auto-match — project tokens:',
        normProjects.map((p) => ({ name: p.name, tokens: p.tokens })));
    }

    return assignedCount;
  }

  // Normalize a string for matching: lowercase, strip diacritics, replace
  // any non-alphanumeric run with a single space, collapse whitespace.
  function normalizeForMatch(s) {
    return (s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')        // punctuation → space
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Returns true if every token in `tokens` appears as a whole word inside
  // the already-normalized haystack. Order doesn't matter.
  function tokensAllPresent(tokens, haystack) {
    if (!tokens.length) return false;
    // Wrap haystack with spaces so ^/$ style matching works via simple search
    const h = ' ' + haystack + ' ';
    for (const t of tokens) {
      if (!t) continue;
      if (h.indexOf(' ' + t + ' ') === -1) return false;
    }
    return true;
  }

  function waitForCalendarReady() {
    return new Promise((resolve) => {
      const check = () => {
        const main = document.querySelector('[role="main"]');
        if (main) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  async function init() {
    if (DEBUG) console.log('[TimePalette] Waiting for calendar to be ready...');
    await waitForCalendarReady();
    if (DEBUG) console.log('[TimePalette] Calendar ready, initializing modules');

    // Initialize all modules
    ns.viewDetector.init();
    ns.domObserver.init(refresh);
    ns.sidebarWidget.init();
    ns.contextMenu.init(refresh);

    // React to view changes
    ns.viewDetector.onViewChange(refresh);

    // React to storage changes (from popup or other tabs)
    try {
      chrome.storage.onChanged.addListener((changes) => {
        if (!ns.storage.extensionAlive()) return;
        if (changes.tp_projects || changes.tp_assignments
            || changes.tp_cache_projects || changes.tp_cache_assignments
            || changes._tp_refresh) {
          refresh();
        }
      });
    } catch (_) { /* context gone */ }

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!ns.storage.extensionAlive()) return;
      if (msg.type === 'PROJECTS_UPDATED' || msg.type === 'ASSIGNMENTS_UPDATED') {
        refresh();
      }
      if (msg.type === 'GET_STATS') {
        const events = ns.domObserver.parseAllVisibleEvents();
        const viewRange = ns.viewDetector.getCurrentViewRange();
        sendResponse({ events: events.length, viewRange: viewRange });
      }
      if (msg.type === 'AUTO_MATCH') {
        autoMatchVisibleEvents().then((assigned) => {
          sendResponse({ assigned: assigned });
        }).catch((err) => {
          console.error('[TimePalette] auto-match error:', err);
          sendResponse({ assigned: 0, error: String(err) });
        });
        return true; // async response
      }
    });

    // Initial render
    await refresh();
  }

  init();
})(window.__gcalPT);
