// ==== Time Palette — DOM Observer & Event Parser ====
(function (ns) {
  let refreshCallback = null;
  let observer = null;

  ns.domObserver = {
    init: function (onRefresh) {
      refreshCallback = onRefresh;
      startObserving();
    },

    parseAllVisibleEvents: function () {
      const chips = findEventChips();
      const events = [];

      chips.forEach((chip) => {
        const parsed = parseChip(chip);
        if (parsed) events.push(parsed);
      });

      return events;
    },

    findEventChips: findEventChips,
    findChipFromTarget: findChipFromTarget,
    parseChip: parseChip,
  };

  // Patterns used to identify event-like aria-labels
  const TIME_RANGE_PATTERN = /\d{1,2}:\d{2}\s*(AM|PM)?\s*(to|–|-)\s*\d{1,2}:\d{2}/i;
  const DATE_PATTERN = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan\b|Feb\b|Mar\b|Apr\b|Jun\b|Jul\b|Aug\b|Sep\b|Oct\b|Nov\b|Dec\b)\s+\d{1,2}/i;

  function findEventChips() {
    const main = document.querySelector('[role="main"]') || document.body;
    if (!main) return [];

    // Merge strategies: run them all, then dedupe. This catches invited
    // events, all-day events, tentative/declined events, etc.
    const chipSet = new Set();

    // Strategy 1: data-eventid (GCal's internal event identifier)
    main.querySelectorAll('[data-eventid]').forEach((el) => chipSet.add(el));

    // Strategy 2: role=button with event-shaped aria-label
    main.querySelectorAll('[role="button"][aria-label]').forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      if (label.length > 400) return;
      if (TIME_RANGE_PATTERN.test(label) || (DATE_PATTERN.test(label) && label.includes(','))) {
        chipSet.add(el);
      }
    });

    // Strategy 3: Any element with event-shaped aria-label (fallback)
    main.querySelectorAll('[aria-label]').forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      if (label.length > 400 || label.length < 4) return;
      if (TIME_RANGE_PATTERN.test(label)) {
        chipSet.add(el);
      }
    });

    return dedupeChips(Array.from(chipSet));
  }

  function dedupeChips(chips) {
    // Remove nested chips — keep only the outermost if one chip contains another
    return chips.filter((chip) =>
      !chips.some((other) => other !== chip && other.contains(chip))
    );
  }

  function findChipFromTarget(el) {
    if (!el) return null;

    // Pass 1: find the nearest ancestor with data-eventid. This is the
    // canonical event element in Google Calendar — stable across moves,
    // and guaranteed to match what findEventChips() returns.
    let current = el;
    while (current && current !== document.body) {
      if (current.hasAttribute && current.hasAttribute('data-eventid')) {
        return current;
      }
      current = current.parentElement;
    }

    // Pass 2: fall back to aria-label heuristics for events that don't
    // have a data-eventid (rare, but possible for certain chip types).
    current = el;
    while (current && current !== document.body) {
      if (current.getAttribute) {
        const label = current.getAttribute('aria-label') || '';
        if (label && label.length < 400) {
          if (TIME_RANGE_PATTERN.test(label)) return current;
          if (DATE_PATTERN.test(label) && label.includes(',')) return current;
          if (current.getAttribute('role') === 'button' && label.length > 3 && label.includes(',')) {
            return current;
          }
        }
      }
      current = current.parentElement;
    }

    return null;
  }

  function startObserving() {
    const target = document.querySelector('[role="main"]') || document.body;

    // Primary: debounced refresh on DOM changes. 200ms debounce catches
    // typical re-render bursts without being too twitchy.
    const fireRefresh = () => { if (refreshCallback) refreshCallback(); };
    const debouncedRefresh = ns.debounce(fireRefresh, 200);

    // Secondary: after any mutation burst, schedule a late refresh ~600ms
    // later to catch GCal's post-drag / post-resize final styling pass. This
    // fixes the "event goes clear after move" and "hours show 0 after move"
    // issues where the initial refresh races with GCal's async render.
    let lateTimer = null;
    const scheduleLateRefresh = () => {
      if (lateTimer) clearTimeout(lateTimer);
      lateTimer = setTimeout(fireRefresh, 600);
    };

    const handleMutation = () => {
      debouncedRefresh();
      scheduleLateRefresh();
    };

    observer = new MutationObserver(handleMutation);
    observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'aria-label'] });

    // Also refresh on mouseup — catches drag-end even if the DOM changes
    // happen with a slight delay that our mutation burst debounce misses.
    document.addEventListener('mouseup', () => {
      setTimeout(fireRefresh, 250);
      setTimeout(fireRefresh, 800);
    });
  }

  function parseChip(chip) {
    const ariaLabel = findAriaLabel(chip);
    const eventId = findDataEventId(chip);

    // If we don't have an aria-label AND we don't have an eventid, we can't
    // do anything useful with this element.
    if (!ariaLabel && !eventId) return null;

    // Try to parse the aria-label; if it fails, still construct a minimal
    // event object when we have a data-eventid (this is the case for Zoom
    // meetings, shared events, etc. that have non-standard aria-labels).
    let result = ariaLabel ? parseAriaLabel(ariaLabel) : null;
    if (!result) {
      result = {
        title: ariaLabel || (chip.innerText || '').trim() || 'Event',
        date: null,
        startTime: null,
        endTime: null,
        durationHours: 0,
        isAllDay: false,
      };
    }

    // Fill in time range from visible text if aria-label didn't have one
    // (common in day view). Skip for multi-day events — any time-range-looking
    // text in a multi-day chip (descriptions, locations, descendant labels) is
    // not a same-day duration and would give nonsense hours.
    if (!result.multiDay && (!result.startTime || !result.endTime)) {
      const fromText = extractTimeRangeFromTextContent(chip);
      if (fromText) {
        result.startTime = fromText.startTime;
        result.endTime = fromText.endTime;
        result.isAllDay = false;
        result.durationHours = ns.calculateDuration(fromText.startTime, fromText.endTime);
      }
    }

    // Safety net: multi-day events never contribute hours, regardless of what
    // any sub-parser above computed.
    if (result.multiDay) {
      result.durationHours = 0;
    }

    result.element = chip;
    result.eventKey = buildEventKey(result);
    return result;
  }

  // Scan the chip's innerText and descendant aria-labels for a time range like:
  //   "10:00 – 11:00am"   "10:00am – 11:00am"   "10 AM - 11 AM"
  //   "10:00 AM to 11:00 AM"
  function extractTimeRangeFromTextContent(chip) {
    const texts = [];
    if (chip.innerText) texts.push(chip.innerText);
    // Also grab aria-labels of descendants
    chip.querySelectorAll('[aria-label]').forEach((el) => {
      const l = el.getAttribute('aria-label') || '';
      if (l.length < 400) texts.push(l);
    });
    // And title attrs
    chip.querySelectorAll('[title]').forEach((el) => {
      const t = el.getAttribute('title') || '';
      if (t.length < 400) texts.push(t);
    });

    // Match formats like: "10:00", "10:00am", "10 AM", etc., with separator – or - or to
    // Allow hours without minutes ("10am – 11am") too.
    const rangeRegex = /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*(?:–|—|-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/;

    for (const text of texts) {
      const m = text.match(rangeRegex);
      if (!m) continue;
      const startRaw = m[1].trim();
      const endRaw = m[2].trim();
      // Normalize to "H:MM AM/PM" format that parseTime expects
      const start = normalizeTimeString(startRaw, endRaw);
      const end = normalizeTimeString(endRaw, endRaw);
      if (start && end) {
        return { startTime: start, endTime: end };
      }
    }
    return null;
  }

  // Normalize a bare time like "10", "10am", "10:00", "10:00 am" into "10:00 AM".
  // Uses the "reference" time (usually the end time) to infer AM/PM when missing.
  function normalizeTimeString(raw, reference) {
    if (!raw) return null;
    let s = raw.trim().toUpperCase();
    // Pull out period if present
    let period = null;
    const pMatch = s.match(/(AM|PM)$/);
    if (pMatch) {
      period = pMatch[1];
      s = s.replace(/(AM|PM)$/, '').trim();
    }
    // If no minutes provided, add :00
    if (!/:/.test(s)) s = s + ':00';
    // Ensure HH:MM format
    const parts = s.split(':');
    if (parts.length !== 2) return null;
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;

    // If period missing, infer from reference or from hour (<= 7 likely PM in work calendar, >= 8 likely AM)
    if (!period && reference) {
      const refP = (reference.toUpperCase().match(/(AM|PM)/) || [])[1];
      if (refP) period = refP;
    }
    if (!period) {
      // Heuristic: 12 = PM (noon), 1-6 = PM (afternoon), 7-11 = AM, 0 = AM
      if (hours === 0) period = 'AM';
      else if (hours === 12) period = 'PM';
      else if (hours >= 1 && hours <= 6) period = 'PM';
      else period = 'AM';
    }

    const hh = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
    const mm = String(mins).padStart(2, '0');
    return `${hh}:${mm} ${period}`;
  }

  // Find the aria-label by checking the chip element itself, its descendants,
  // and its ancestors. Google Calendar often puts the aria-label on a child.
  function findAriaLabel(chip) {
    if (!chip || !chip.getAttribute) return null;

    // 1. The chip itself
    let label = chip.getAttribute('aria-label');
    if (label && label.length > 3) return label;

    // 2. Descendants — find one with an event-like aria-label
    const descendants = chip.querySelectorAll('[aria-label]');
    for (const el of descendants) {
      const l = el.getAttribute('aria-label') || '';
      if (l.length > 3 && l.length < 400) {
        if (TIME_RANGE_PATTERN.test(l) || (DATE_PATTERN.test(l) && l.includes(','))) {
          return l;
        }
      }
    }
    // If descendants have any aria-label, use the first non-trivial one
    for (const el of descendants) {
      const l = el.getAttribute('aria-label') || '';
      if (l.length > 3 && l.length < 400) return l;
    }

    // 3. Check inner text as last-resort title (for coloring only, won't have date/time)
    const innerText = (chip.innerText || '').trim();
    if (innerText && innerText.length > 0 && innerText.length < 200) {
      return innerText;
    }

    return null;
  }

  function parseAriaLabel(label) {
    // Google Calendar aria-labels follow patterns like:
    // "Title, April 15, 2026, 10:00 AM to 11:00 AM"
    // "Title, April 15, 2026"  (all-day)
    // "Title, April 15 – April 17, 2026" (multi-day)
    // Sometimes with calendar name appended: "..., Work Calendar"

    if (!label || label.length < 1) return null;

    // Strategy: split by comma and try to identify date/time parts
    const parts = label.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

    if (parts.length === 0) return null;

    // Try to find a time range pattern: "HH:MM AM to HH:MM PM"
    let title = '';
    let dateStr = '';
    let startTime = null;
    let endTime = null;
    let durationHours = 0;
    let isAllDay = false;

    // Look for time range in any part
    let timePartIdx = -1;
    for (let i = 0; i < parts.length; i++) {
      const timeMatch = parts[i].match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*(?:to|–|-)\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
      if (timeMatch) {
        startTime = timeMatch[1].trim();
        endTime = timeMatch[2].trim();
        timePartIdx = i;
        break;
      }
    }

    // Look for a date part — contains month name + day number
    const months = 'January|February|March|April|May|June|July|August|September|October|November|December';
    const monthsShort = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
    const dateRegex = new RegExp(`((?:${months}|${monthsShort})\\s+\\d{1,2})`, 'i');

    let dateParts = [];
    let datePartIndices = [];
    for (let i = 0; i < parts.length; i++) {
      if (dateRegex.test(parts[i])) {
        dateParts.push(parts[i]);
        datePartIndices.push(i);
      }
    }

    // Detect multi-day events. GCal formats these a few ways:
    //   "Title, April 15 – April 17, 2026"     (one part, embedded en-dash/hyphen between two month-day refs)
    //   "Title, April 15, April 17, 2026"      (two separate date parts)
    //   "Title, April 15, 2026, 10:00 AM to April 17, 2026, 5:00 PM"  (timed multi-day)
    const monthRegexGlobal = new RegExp(`(?:${months}|${monthsShort})\\s+\\d{1,2}`, 'gi');
    let monthDayMatches = 0;
    for (const p of parts) {
      const m = p.match(monthRegexGlobal);
      if (m) monthDayMatches += m.length;
    }
    const isMultiDay = monthDayMatches >= 2;

    // Find year — could be in the same part as date or a separate part
    let year = new Date().getFullYear();
    const yearRegex = /\b(20\d{2})\b/;
    for (const part of parts) {
      const ym = part.match(yearRegex);
      if (ym) {
        year = parseInt(ym[1]);
        break;
      }
    }

    // Build the date string — fall back to today's date if we can't parse one
    if (dateParts.length > 0) {
      // Use the first date part
      const cleanDate = dateParts[0].replace(yearRegex, '').trim();
      dateStr = cleanDate + ', ' + year;
    } else {
      // Can't parse a date from aria-label — use the title as-is, no date
      dateStr = null;
    }

    // Title = everything before the first date/time part
    const firstSpecialIdx = Math.min(
      datePartIndices.length > 0 ? datePartIndices[0] : Infinity,
      timePartIdx >= 0 ? timePartIdx : Infinity
    );
    title = parts.slice(0, firstSpecialIdx).join(', ').trim();

    // If no title parsed (date was first), use the whole label minus date/time
    if (!title) {
      title = parts[0];
    }

    // Calculate duration
    if (startTime && endTime) {
      durationHours = ns.calculateDuration(startTime, endTime);
    } else {
      isAllDay = true;
      durationHours = 0; // All-day events don't count timed hours
    }

    // Multi-day events never contribute hours to the sidebar total — any
    // time-range we parsed out of the aria-label is a start-end wall-clock
    // pair on different days, not a same-day duration.
    if (isMultiDay) {
      durationHours = 0;
      isAllDay = true;
    }

    const parsedDate = ns.parseDateString(dateStr);

    return {
      title: title,
      date: parsedDate,
      startTime: startTime,
      endTime: endTime,
      durationHours: durationHours,
      isAllDay: isAllDay,
      multiDay: isMultiDay,
    };
  }

  function buildEventKey(parsed) {
    // Prefer GCal's stable event ID — it doesn't change when you move,
    // resize, or edit the event. This makes assignments persist across moves.
    if (parsed.element) {
      const eventId = findDataEventId(parsed.element);
      if (eventId) {
        // Strip any tail that identifies a specific instance — use the base ID
        // so recurring events share one assignment.
        return 'eid:::' + eventId;
      }
    }

    // Fallback key — title + date + minutes. Used only when data-eventid
    // isn't available (rare).
    const title = (parsed.title || '').trim().toLowerCase();
    let key = 'tdm:::' + title + ':::' + (parsed.date || 'unknown');
    if (parsed.startTime) {
      const decimalHours = ns.parseTime(parsed.startTime);
      if (decimalHours !== null) {
        const mins = Math.round(decimalHours * 60);
        key += ':::' + mins;
      } else {
        key += ':::' + parsed.startTime.replace(/\s+/g, '').toLowerCase();
      }
    }
    return key;
  }

  // Find a data-eventid on the element or any ancestor/descendant.
  function findDataEventId(el) {
    if (!el) return null;
    // Check self
    if (el.hasAttribute && el.hasAttribute('data-eventid')) {
      return el.getAttribute('data-eventid');
    }
    // Check ancestors
    let cur = el.parentElement;
    while (cur && cur !== document.body) {
      if (cur.hasAttribute && cur.hasAttribute('data-eventid')) {
        return cur.getAttribute('data-eventid');
      }
      cur = cur.parentElement;
    }
    // Check descendants
    const desc = el.querySelector ? el.querySelector('[data-eventid]') : null;
    if (desc) return desc.getAttribute('data-eventid');
    return null;
  }
})(window.__gcalPT);
