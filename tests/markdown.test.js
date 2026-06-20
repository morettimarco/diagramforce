// Characterization tests for js/markdown.js → parseMarkdown().
//
// This parser is a SECURITY BOUNDARY: its output is written into a
// <foreignObject> via innerHTML and is walked by the PNG/SVG/GIF exporter, so
// the exact HTML and the escape-before-parse order must be locked. Any change
// that lets raw user markup survive, reorders the escape pass, or changes the
// emitted tags should fail here.
import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../js/markdown.js';

test('empty / null / undefined input → empty string', () => {
  assert.equal(parseMarkdown(''), '');
  assert.equal(parseMarkdown(null), '');
  assert.equal(parseMarkdown(undefined), '');
});

test('the four inline tokens map to the four whitelisted tags (+ <br> for newlines)', () => {
  assert.equal(parseMarkdown('**bold**'), '<strong>bold</strong>');
  assert.equal(parseMarkdown('*italic*'), '<em>italic</em>');
  assert.equal(parseMarkdown('~~strike~~'), '<del>strike</del>');
  assert.equal(parseMarkdown('`code`'), '<code>code</code>');
  assert.equal(parseMarkdown('line1\nline2'), 'line1<br>line2');
});

test('underscores are NOT markers — system field/object names render literally', () => {
  assert.equal(parseMarkdown('_italic_'), '_italic_');
  assert.equal(parseMarkdown('My_Field__c'), 'My_Field__c');
  assert.equal(parseMarkdown('Account__r.Name__c'), 'Account__r.Name__c');
  // the asterisk italic path is unaffected
  assert.equal(parseMarkdown('*still*'), '<em>still</em>');
});

test('pass order is bold→italic, so **word** becomes <strong>, never <em>*word*</em>', () => {
  assert.equal(parseMarkdown('**word**'), '<strong>word</strong>');
});

// ── Security boundary ──────────────────────────────────────────────────────
test('escapes HTML BEFORE markdown — raw tags can never be injected', () => {
  assert.equal(
    parseMarkdown('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;',
  );
  // all five escaped entities, in one string
  assert.equal(
    parseMarkdown(`a & b < c > d " e ' f`),
    'a &amp; b &lt; c &gt; d &quot; e &#39; f',
  );
});

test('escape order is &-first, so & is not double-escaped', () => {
  // '&<' must become '&amp;&lt;' (escape & then <), NOT '&amp;&amp;lt;'
  assert.equal(parseMarkdown('&<'), '&amp;&lt;');
});

test('an XSS payload inside a marker stays escaped — only the whitelisted tag is emitted', () => {
  assert.equal(
    parseMarkdown('**<img src=x onerror=alert(1)>**'),
    '<strong>&lt;img src=x onerror=alert(1)&gt;</strong>',
  );
});

test('documented "code-last" quirk: markers inside `code` are still interpreted', () => {
  // The header note in markdown.js calls this out: code runs LAST, so `**x**`
  // gets bolded first and then wrapped in <code>. Locked so a future reorder is
  // a deliberate, visible change.
  assert.equal(parseMarkdown('`**x**`'), '<code><strong>x</strong></code>');
});
