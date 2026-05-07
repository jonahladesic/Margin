// ==== Time Palette — Event Coloring ====
(function (ns) {
  ns.eventColoring = {
    apply: async function (parsedEvents) {
      const assignments = await ns.storage.getAssignments();
      const projectMap = await ns.storage.getProjectMap();

      for (const event of parsedEvents) {
        const projectId = assignments[event.eventKey];
        const el = event.element;

        if (projectId && projectMap[projectId]) {
          const project = projectMap[projectId];
          const color = project.color;
          const textColor = ns.getContrastTextColor(color);

          // Capture the chip's native border-radius BEFORE we mark it —
          // the CSS override rule will kick in immediately once we set
          // data-tp-project. Descendants then use this value instead
          // of inheriting 0 from intermediate parents.
          const nativeRadius = readChipBorderRadius(el);

          // The set of elements that should receive the color: the chip itself
          // plus any close-fitting outer wrapper. On certain chip types (seen
          // in week view with long titles), [data-eventid] is an inner box
          // shorter than the visible row, so painting only `el` leaves white
          // slivers above/below that clip the ascenders of the title text.
          const targets = [el, ...findChipWrappers(el)];

          for (const t of targets) {
            t.style.setProperty('--tp-color', color);
            t.style.setProperty('--tp-text', textColor);
            if (nativeRadius) t.style.setProperty('--tp-radius', nativeRadius);
            t.setAttribute('data-tp-project', projectId);
            applyColorToChip(t, color, textColor);
          }

          // Tag inner descendants that already carry a non-transparent
          // background — these are GCal's color layers (invited chips, Zoom
          // chips, all-day top-bars have color painted on deep children).
          // We DON'T tag transparent overlay descendants because painting
          // them opaque covers the text that sits under them.
          tagPaintableDescendants(el, projectId);

          // Fix the occasional "title text ascenders chop off at top" look
          // on short-height chips (a 30-min chip with default line-height is
          // sometimes a couple of px taller than the chip). Tight line-height
          // on descendant text elements lets the text fit cleanly.
          tightenTextLineHeight(el);
        } else {
          // Remove coloring from chip + any wrapper we previously marked
          const targets = [el, ...collectMarkedWrappers(el)];
          for (const t of targets) {
            if (t.hasAttribute('data-tp-project')) {
              t.removeAttribute('data-tp-project');
              t.style.removeProperty('--tp-color');
              t.style.removeProperty('--tp-text');
              t.style.removeProperty('--tp-radius');
              removeColorFromChip(t);
            }
          }
          // Untag any paint-layer children we previously tagged
          el.querySelectorAll('[data-tp-paint]').forEach((d) => {
            d.removeAttribute('data-tp-paint');
            d.style.removeProperty('--tp-color');
            d.style.removeProperty('--tp-text');
            d.style.removeProperty('--tp-radius');
            d.style.removeProperty('line-height');
          });
        }
      }
    },
  };

  // Visual color overriding is handled by CSS (see styles/content.css —
  // rule [data-tp-project], [data-tp-project] *). We only set the
  // custom-property values here so CSS has something to read. No need to
  // poke inline styles on descendants — the CSS rule covers them.
  function applyColorToChip(el, bgColor, textColor) {
    // Set custom properties as a fallback/compat path (CSS variables).
    el.style.setProperty('--tp-color', bgColor);
    el.style.setProperty('--tp-text', textColor);
  }

  function removeColorFromChip(el) {
    el.style.removeProperty('--tp-color');
    el.style.removeProperty('--tp-text');
  }

  // Tag descendants that carry a native non-transparent background — these
  // are the color layers we need to repaint. Overlay elements (positioned
  // above text with transparent backgrounds) are left alone so text stays
  // visible under them.
  function tagPaintableDescendants(root, projectId) {
    const descendants = root.querySelectorAll('*');
    for (let i = 0; i < descendants.length; i++) {
      const d = descendants[i];
      const cs = getComputedStyle(d);
      const bg = cs.backgroundColor;
      if (!bg) continue;
      // Non-transparent → paint layer. `rgba(...)` with a0 or `transparent`.
      const isTransparent =
        bg === 'transparent' ||
        bg === 'rgba(0, 0, 0, 0)' ||
        /rgba\([^,]+,[^,]+,[^,]+,\s*0\s*\)/.test(bg);
      if (isTransparent) continue;
      d.setAttribute('data-tp-paint', projectId);
    }
  }

  // Apply a tight line-height to the text-bearing descendants so the title
  // doesn't visually exceed the chip's clipping box on short chips. Only
  // touches leaf-ish elements (no painted children of their own) — avoids
  // poking container heights and causing layout shift elsewhere.
  function tightenTextLineHeight(root) {
    const leafText = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      // Only elements with direct text content (no element children or only
      // brief inline spans) — the actual title / time wrappers.
      const hasDirectText = Array.from(node.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
      );
      if (hasDirectText) leafText.push(node);
      node = walker.nextNode();
    }
    for (const t of leafText) {
      t.style.setProperty('line-height', '1.1', 'important');
    }
  }

  // Walk upward from the chip, collecting ancestors whose bounding box is
  // "effectively the same" as the chip — i.e. they're the outer visible row
  // that wraps around [data-eventid]. We paint them too so a shorter inner
  // chip doesn't leave white slivers clipping the title text.
  //
  // An ancestor is a wrapper if:
  //   - it contains the chip's rect (no bigger than 6px on any side)
  //   - it doesn't extend so far that it'd cover a neighboring event
  // We stop at the first ancestor that fails the check, and cap at 3 levels.
  function findChipWrappers(el) {
    const wrappers = [];
    const chipRect = el.getBoundingClientRect();
    if (!chipRect.width || !chipRect.height) return wrappers;

    let cur = el.parentElement;
    let depth = 0;
    while (cur && depth < 3) {
      if (cur.tagName === 'BODY' || cur.tagName === 'HTML') break;
      const r = cur.getBoundingClientRect();
      if (!r.width || !r.height) break;

      // Same visible area? (within 6px slop on each side)
      const fits =
        Math.abs(r.left   - chipRect.left)   <= 6 &&
        Math.abs(r.right  - chipRect.right)  <= 6 &&
        Math.abs(r.top    - chipRect.top)    <= 6 &&
        Math.abs(r.bottom - chipRect.bottom) <= 6 &&
        r.height <= chipRect.height + 12 &&
        r.width  <= chipRect.width  + 12;

      if (!fits) break;

      // Safety: never mark an ancestor that already contains another
      // [data-eventid] — that would mean we'd recolor a different event too.
      if (cur.querySelectorAll('[data-eventid]').length > 1) break;

      wrappers.push(cur);
      cur = cur.parentElement;
      depth++;
    }
    return wrappers;
  }

  // When clearing, find any ancestors we previously marked. They might
  // not fit the "wrapper" heuristic anymore (e.g. chip got resized), but
  // they carry data-tp-project so we can still find and clean them up.
  function collectMarkedWrappers(el) {
    const out = [];
    let cur = el.parentElement;
    let depth = 0;
    while (cur && depth < 3) {
      if (cur.tagName === 'BODY' || cur.tagName === 'HTML') break;
      if (cur.hasAttribute('data-tp-project')) out.push(cur);
      cur = cur.parentElement;
      depth++;
    }
    return out;
  }

  // Find the effective border-radius for the chip. We want to match the
  // element that visually forms the chip's rounded outline — usually the
  // root, but sometimes a deeper wrapper in all-day top-bars.
  //
  // Strategy:
  //   1. If the chip itself has a non-zero radius, use it.
  //   2. Otherwise, search descendants for the largest radius on an element
  //      whose size roughly matches the chip (so we don't grab a pill-shaped
  //      inner button by mistake).
  //   3. Cap at 10px so we never end up more rounded than GCal's native look.
  //   4. Default to 4px if nothing is found.
  function readChipBorderRadius(el) {
    const maxPx = 10;
    const clamp = (px) => Math.min(px, maxPx) + 'px';

    const cs = getComputedStyle(el);
    const rootPx = parseFloat(cs.borderTopLeftRadius);
    if (!isNaN(rootPx) && rootPx > 0) {
      return clamp(rootPx);
    }

    const chipRect = el.getBoundingClientRect();
    const chipArea = chipRect.width * chipRect.height;
    if (!chipArea) return '4px';

    let bestPx = 0;
    const descendants = el.querySelectorAll('*');
    for (let i = 0; i < Math.min(descendants.length, 20); i++) {
      const d = descendants[i];
      const dcs = getComputedStyle(d);
      const dr = parseFloat(dcs.borderTopLeftRadius);
      if (isNaN(dr) || dr <= 0) continue;
      const rect = d.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (!area) continue;
      // Only accept a descendant that's roughly the same size as the chip
      // (>= 60% of the chip's area). This avoids picking up pill-shaped
      // inner elements.
      if (area / chipArea < 0.6) continue;
      if (dr > bestPx) bestPx = dr;
    }

    if (bestPx > 0) return clamp(bestPx);
    return '4px';
  }
})(window.__gcalPT);
