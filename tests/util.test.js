// Direct tests for the consolidated pure helpers in js/util.js. These lock the
// extracted behavior (Phase 1) — including the two that were previously
// module-private and untestable (compareSemver, normalizeDateSuffix).
import test from 'node:test';
import assert from 'node:assert/strict';
import { escHtml, formatRelativeTime, compareSemver, normalizeDateSuffix, parseSolidColor, nodeContrastText } from '../js/util.js';

test('escHtml escapes the five HTML-significant chars, & first (not double-escaped)', () => {
  assert.equal(escHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escHtml('&<'), '&amp;&lt;');
  assert.equal(escHtml('<script>'), '&lt;script&gt;');
  assert.equal(escHtml('plain text'), 'plain text');
  assert.equal(escHtml(42), '42'); // coerces non-strings
});

test('formatRelativeTime buckets by age and returns null for a falsy timestamp', () => {
  const now = Date.now();
  assert.equal(formatRelativeTime(null), null);
  assert.equal(formatRelativeTime(0), null);
  assert.equal(formatRelativeTime(now), 'just now');
  assert.equal(formatRelativeTime(now - 90 * 1000), '1m ago');
  assert.equal(formatRelativeTime(now - 3 * 3600 * 1000), '3h ago');
  assert.equal(formatRelativeTime(now - 5 * 86400 * 1000), '5d ago');
});

test('compareSemver orders by major.minor.patch (-1 / 0 / 1)', () => {
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
  assert.equal(compareSemver('1.2.3', '1.2.4'), -1);
  assert.equal(compareSemver('1.3.0', '1.2.9'), 1);
  assert.equal(compareSemver('2.0.0', '1.9.9'), 1);
  assert.equal(compareSemver('1.0', '1.0.0'), 0); // missing patch == 0
  assert.equal(compareSemver(null, '1.0.0'), -1); // falsy a sorts first
  assert.equal(compareSemver('1.0.0', null), 1);  // falsy b sorts last
});

test('normalizeDateSuffix heals a trailing YYYYMMDD → YYYY-MM-DD (only real dates)', () => {
  assert.equal(normalizeDateSuffix('Draft 20260530'), 'Draft 2026-05-30');
  assert.equal(normalizeDateSuffix('Process Draft 20260530'), 'Process Draft 2026-05-30');
  assert.equal(normalizeDateSuffix('Draft 2026-05-30'), 'Draft 2026-05-30'); // already hyphenated → no-op
  assert.equal(normalizeDateSuffix('Order 12345678'), 'Order 12345678');     // month 56 invalid → no-op
  assert.equal(normalizeDateSuffix('Draft 20261332'), 'Draft 20261332');     // month 13 invalid → no-op
  assert.equal(normalizeDateSuffix('My Diagram'), 'My Diagram');
  assert.equal(normalizeDateSuffix(''), '');
});

test('parseSolidColor parses opaque hex / rgb(a) and rejects theme vars + translucent fills', () => {
  assert.deepEqual(parseSolidColor('#FFFFFF'), [255, 255, 255]);
  assert.deepEqual(parseSolidColor('#fff'), [255, 255, 255]);       // shorthand expands
  assert.deepEqual(parseSolidColor('#1E293B'), [30, 41, 59]);
  assert.deepEqual(parseSolidColor('rgb(13, 157, 218)'), [13, 157, 218]);
  assert.deepEqual(parseSolidColor('rgba(255, 0, 0, 0.9)'), [255, 0, 0]); // alpha ≥ 0.6 ⇒ solid
  // Not a usable solid colour ⇒ null (caller keeps the theme default):
  assert.equal(parseSolidColor('var(--node-bg)'), null);            // theme-adaptive
  assert.equal(parseSolidColor('rgba(148, 163, 184, 0.03)'), null); // translucent (Zone tint)
  assert.equal(parseSolidColor('transparent'), null);
  assert.equal(parseSolidColor('none'), null);
  assert.equal(parseSolidColor('white'), null);                     // named colour (not handled)
  assert.equal(parseSolidColor(''), null);
  assert.equal(parseSolidColor(undefined), null);
});

test('nodeContrastText picks dark text on light bodies and light text on dark bodies', () => {
  // Light bodies (the LLM "white card" case) ⇒ dark text, matching the light --node-text token.
  assert.equal(nodeContrastText('#FFFFFF').label, '#1C1E21');
  assert.equal(nodeContrastText('#FFF7ED').label, '#1C1E21');       // MC cream card
  assert.match(nodeContrastText('#FFFFFF').subtitle, /^rgba\(0, 0, 0/);
  // Dark bodies ⇒ light text, matching the dark --node-text token.
  assert.equal(nodeContrastText('#242526').label, '#F5F6F7');
  assert.equal(nodeContrastText('#1E293B').label, '#F5F6F7');
  assert.match(nodeContrastText('#242526').subtitle, /^rgba\(255, 255, 255/);
  // Theme-adaptive / translucent bodies ⇒ null (leave the text on the theme default).
  assert.equal(nodeContrastText('var(--node-bg)'), null);
  assert.equal(nodeContrastText('rgba(0,0,0,0.04)'), null);
});
