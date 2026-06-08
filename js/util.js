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

// Characters illegal in a filename on Windows + control chars + zero-width chars.
// Built via new RegExp from an all-ASCII escape string so no literal control chars
// ever live in the source.
const FILENAME_BAD = new RegExp('[<>:"/\\\\|?*\\u0000-\\u001F\\u200B-\\u200D\\uFEFF]', 'g');

/**
 * Normalise an arbitrary string (a tab name, object name, …) into a single,
 * cross-platform-safe download-filename PART (no extension). Strips characters
 * illegal on Windows (`< > : " / \ | ? *`) + control + zero-width chars, trims
 * leading/trailing dots & spaces (also Windows-illegal), collapses whitespace to
 * single dashes, and caps length. Returns `fallback` when nothing usable remains
 * so a file always gets a name. Safe on Windows, macOS, and Linux.
 */
export function sanitizeFilenamePart(s, fallback = 'untitled') {
  let v = String(s ?? '')
    .replace(FILENAME_BAD, '')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')   // no leading / trailing dots or spaces (Windows)
    .replace(/[\s_]+/g, '-')           // spaces + underscores → single dash (a `_` is reserved
                                       // as the inter-section separator in CSV filenames)
    .replace(/-+/g, '-');              // collapse runs of dashes
  if (!v) v = fallback;
  return v.slice(0, 80);
}

/**
 * Parse a CSS colour string to `[r, g, b]` ONLY when it is an explicit, ~opaque solid —
 * a `#rgb` / `#rrggbb` hex, or `rgb()/rgba()` with alpha ≥ 0.6. Returns null for `var(...)`
 * references, `none`/`transparent`, translucent fills (alpha < 0.6, which mostly show the
 * canvas behind them), and named colours. Used to decide whether a hardcoded node fill is a
 * real, theme-independent colour we can compute text contrast against.
 */
export function parseSolidColor(c) {
  if (typeof c !== 'string') return null;
  const s = c.trim();
  if (!s || s.startsWith('var(') || s === 'none' || s === 'transparent') return null;
  let m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean);
    if (p.length >= 3) {
      const a = p[3] === undefined ? 1 : parseFloat(p[3]);
      if (!(a >= 0.6)) return null;            // translucent ⇒ shows the canvas ⇒ treat as theme
      return [parseInt(p[0], 10), parseInt(p[1], 10), parseInt(p[2], 10)];
    }
  }
  return null;
}

/**
 * Given an explicit `body.fill`, the label + subtitle colours that contrast it (dark text on a
 * light body, light text on a dark body) — or null when the body is theme-adaptive/translucent
 * (caller keeps the theme defaults). Threshold uses Rec. 709 perceptual luminance. The returned
 * hexes match the light/dark `--node-text` tokens so a recoloured node matches its native peers.
 */
export function nodeContrastText(bodyFill) {
  const rgb = parseSolidColor(bodyFill);
  if (!rgb) return null;
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum > 0.6
    ? { label: '#1C1E21', subtitle: 'rgba(0, 0, 0, 0.55)' }       // light body ⇒ dark text
    : { label: '#F5F6F7', subtitle: 'rgba(255, 255, 255, 0.6)' }; // dark body ⇒ light text
}
