// The final Phase-0 safety net: real example diagrams must survive the share
// codec losslessly, and the sanitization boundary must stay intact. These are
// the regression catch for the persistence/codec layer before any refactor.
//
// examples/ is gitignored (local-only), so the corpus tests skip gracefully on
// a fresh clone; the sanitization-boundary tests below are self-contained and
// always run.
import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { encodeShareV1, decodeShareV1 } from '../js/share-codec.js';
import { sanitizeGraphJSON } from '../js/persistence.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
let files = [];
try { files = readdirSync(EXAMPLES).filter((f) => f.endsWith('.json')); } catch { /* dir absent */ }

test('golden corpus — every example diagram round-trips through the share codec', (t) => {
  if (files.length === 0) return t.skip('no example diagrams present (examples/ is gitignored)');
  for (const f of files) {
    const original = JSON.parse(readFileSync(new URL(f, EXAMPLES), 'utf8'));
    const decoded = decodeShareV1(encodeShareV1(original));
    assert.deepStrictEqual(decoded, original, `share round-trip altered ${f}`);
  }
});

test('golden corpus — sanitizeGraphJSON leaves clean example graphs intact', (t) => {
  if (files.length === 0) return t.skip('no example diagrams present');
  for (const f of files) {
    const original = JSON.parse(readFileSync(new URL(f, EXAMPLES), 'utf8'));
    const cellsBefore = original.graph?.cells?.length ?? 0;
    // sanitize mutates in place — clone so we don't disturb anything.
    const out = sanitizeGraphJSON(JSON.parse(JSON.stringify(original.graph)));
    assert.equal(out.cells.length, cellsBefore, `${f}: a clean cell was unexpectedly dropped`);
  }
});

// ── Sanitization boundary contract (self-contained, always runs) ─────────────
test('sanitizeGraphJSON enforces the 2000-cell cap', () => {
  const tooMany = { cells: Array.from({ length: 2001 }, (_, i) => ({ type: 'sf.Note', id: `n${i}` })) };
  assert.throws(() => sanitizeGraphJSON(tooMany), /maximum element count/);
});

test('sanitizeGraphJSON strips proto-pollution keys + on* handlers, neutralises script URIs, keeps data:image', () => {
  // Build via a raw JSON string so `__proto__` is a real OWN property (JSON.parse
  // does NOT set the prototype), not something the object literal would swallow.
  const g = JSON.parse(
    '{"cells":[{"__proto__":{"polluted":true},"type":"sf.Note","id":"a",' +
    '"onclick":"steal()","attrs":{"link":"javascript:alert(1)","vb":"vbscript:msgbox(1)",' +
    '"html":"data:text/html,<x>","img":"data:image/png;base64,AAAA"}}]}',
  );

  sanitizeGraphJSON(g);
  const cell = g.cells[0];
  assert.equal(Object.prototype.hasOwnProperty.call(cell, '__proto__'), false, '__proto__ own-key dropped');
  assert.equal('onclick' in cell, false, 'on* handler dropped');
  assert.equal(cell.attrs.link, '', 'javascript: URI neutralised');
  assert.equal(cell.attrs.vb, '', 'vbscript: URI neutralised');
  assert.equal(cell.attrs.html, '', 'data:text/html URI neutralised');
  assert.equal(cell.attrs.img, 'data:image/png;base64,AAAA', 'data:image kept intact');
});

test('sanitizeGraphJSON drops cells whose type is not in the allowlist', () => {
  const g = { cells: [{ type: 'sf.Note', id: 'ok' }, { type: 'sf.Evil', id: 'bad' }, { type: 'standard.Link', id: 'link' }] };
  sanitizeGraphJSON(g);
  assert.deepEqual(g.cells.map((c) => c.id), ['ok', 'link'], 'unknown cell type filtered out');
});
