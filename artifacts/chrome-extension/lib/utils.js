// ==== Time Palette — Utilities ====
window.__gcalPT = window.__gcalPT || {};

(function (ns) {
  // Generate a short unique ID
  ns.generateId = function () {
    return 'proj_' + crypto.randomUUID().slice(0, 8);
  };

  // Validate a hex color before we interpolate it into a `style="..."`
  // attribute. Only accepts `#RGB` / `#RRGGBB`. Anything else falls back
  // to a neutral gray. Defense-in-depth against a malformed value in
  // storage ever sneaking CSS into inline styles.
  ns.safeColor = function (hex) {
    if (typeof hex !== 'string') return '#9ca3af';
    const s = hex.trim();
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(s)) return s;
    return '#9ca3af';
  };

  // Determine whether to use white or black text on a given background color.
  // Uses the WCAG 2.1 relative luminance formula (gamma-correct sRGB) so
  // bright-but-saturated colors like greens, yellows, and cyans — which the
  // naive 0.299/0.587/0.114 luma formula misjudges — get readable dark text.
  ns.getContrastTextColor = function (hexColor) {
    const hex = (hexColor || '').replace('#', '');
    if (hex.length < 6) return '#1a1a1a';
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // WCAG contrast ratios. Pick whichever text color gives a higher ratio.
    const contrastWhite = 1.05 / (L + 0.05);
    const contrastBlack = (L + 0.05) / 0.05;
    return contrastBlack >= contrastWhite ? '#1a1a1a' : '#ffffff';
  };

  // Format hours nicely: 1.5 -> "1.5h", 0.25 -> "15m", 2.0 -> "2h"
  ns.formatHours = function (hours) {
    if (hours === 0) return '0h';
    if (hours < 1) {
      const mins = Math.round(hours * 60);
      return mins + 'm';
    }
    // Show one decimal if needed
    const rounded = Math.round(hours * 10) / 10;
    if (rounded === Math.floor(rounded)) {
      return rounded + 'h';
    }
    return rounded + 'h';
  };

  // Parse a date string like "April 15, 2026" into a YYYY-MM-DD string
  ns.parseDateString = function (dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Parse time string like "10:00 AM" or "2:30 PM" into decimal hours (0-24)
  ns.parseTime = function (timeStr) {
    if (!timeStr) return null;
    const cleaned = timeStr.trim().toUpperCase();
    const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3];
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours + minutes / 60;
  };

  // Calculate duration in hours between two time strings
  ns.calculateDuration = function (startTime, endTime) {
    const start = ns.parseTime(startTime);
    const end = ns.parseTime(endTime);
    if (start === null || end === null) return 0;
    let duration = end - start;
    if (duration < 0) duration += 24; // Crosses midnight
    return duration;
  };

  // Debounce helper
  ns.debounce = function (fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  // Preset colors matching Google Calendar palette
  ns.PRESET_COLORS = [
    '#4285F4', // Blue
    '#EA4335', // Red
    '#FBBC04', // Yellow
    '#34A853', // Green
    '#FF6D01', // Orange
    '#46BDC6', // Teal
    '#7986CB', // Lavender
    '#E67C73', // Flamingo
    '#F4511E', // Tomato
    '#0B8043', // Sage
    '#8E24AA', // Grape
    '#616161', // Graphite
    '#D50000', // Crimson
    '#F09300', // Banana
    '#039BE5', // Peacock
    '#3F51B5', // Blueberry
  ];
})(window.__gcalPT);
