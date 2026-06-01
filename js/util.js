// Shared pure utilities — zero dependencies, zero DOM, zero JointJS.
//
// Everything here is a pure function (output depends only on input, no side
// effects beyond reading Date.now()). Consolidated from copies that had drifted
// across persistence.js / toolbar.js / tabs.js / markdown.js so there is exactly
// ONE implementation of each, directly unit-tested in tests/util.test.js.
//
// Keep this module dependency-free: it is imported by low-level modules (incl.
// the markdown security boundary), so importing app modules from here would risk
// import cycles.

/**
 * HTML-escape a string for safe interpolation into innerHTML / a <foreignObject>.
 * SECURITY PRIMITIVE: `&` is escaped FIRST so the entities introduced by the
 * later passes are not double-escaped. The relative order of " ' < > does not
 * affect the output (no entity contains another of those characters).
 */
export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Relative-time label for a timestamp: "just now" / "Nm ago" / "Nh ago" /
 * "Nd ago". Returns null for a falsy timestamp (so callers can omit the line).
 */
export function formatRelativeTime(ts) {
  if (!ts) return null;
  const ageSec = Math.floor((Date.now() - ts) / 1000);
  if (ageSec < 60) return 'just now';
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
  return `${Math.floor(ageSec / 86400)}d ago`;
}

/** Compare two semver strings. Returns -1 if a<b, 0 if equal, 1 if a>b. A falsy
 *  `a` sorts first, a falsy `b` sorts last. */
export function compareSemver(a, b) {
  if (!a) return -1;
  if (!b) return 1;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

/**
 * Heal a legacy trailing " YYYYMMDD" name suffix to " YYYY-MM-DD" (only when the
 * 8 digits parse as a plausible date). Lets pre-hyphen backups re-import with a
 * consistent, readable date suffix. No-op for names without such a suffix or with
 * non-date digits (e.g. "Order 12345678").
 */
export function normalizeDateSuffix(name) {
  return String(name || '').replace(/ (\d{4})(\d{2})(\d{2})$/, (full, y, mo, d) => {
    const mm = +mo, dd = +d;
    return (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) ? ` ${y}-${mo}-${d}` : full;
  });
}
