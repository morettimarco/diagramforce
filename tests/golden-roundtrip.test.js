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
import { sanitizeGraphJSON, compactGraphForSave } from '../js/persistence.js';

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

test('sanitizeGraphJSON drops links pointing at a missing cell (the LLM dangling-ref crash) but keeps valid + point links', () => {
  // Reproduces the Gemini failure mode: a link names a target object the
  // diagram never defines, which would make graph.fromJSON throw
  // "LinkView: invalid target cell" and sink the whole load.
  const g = {
    cells: [
      { type: 'sf.DataObject', id: 'objA' },
      { type: 'sf.DataObject', id: 'objB' },
      { type: 'standard.Link', id: 'good', source: { id: 'objA', port: 'field-right-x' }, target: { id: 'objB', port: 'field-left-y' } },
      { type: 'standard.Link', id: 'dangling-tgt', source: { id: 'objA' }, target: { id: 'obj-ghost' } },
      { type: 'standard.Link', id: 'dangling-src', source: { id: 'obj-missing' }, target: { id: 'objB' } },
      { type: 'standard.Link', id: 'point', source: { x: 10, y: 10 }, target: { x: 99, y: 99 } },
    ],
  };
  sanitizeGraphJSON(g);
  assert.deepEqual(
    g.cells.map((c) => c.id),
    ['objA', 'objB', 'good', 'point'],
    'links to a non-existent cell dropped; valid id-links + point-only links kept',
  );
});

test('compactGraphForSave strips DataObject ports (reconstructed on load), shrinking the save', () => {
  // A field port as it's actually serialised — its own markup + full attrs. These dominate a
  // datamapping save (two per field), and _syncFieldPorts rebuilds them on every load.
  const fieldPort = (id, group) => ({ id, group, args: { x: 0, y: 48 }, markup: [{ tagName: 'rect', selector: 'rect' }], attrs: { rect: { width: 8, height: 8, x: -4, y: -4, rx: 2, ry: 2, magnet: true, fill: '#9AA0A6', stroke: '#FFFFFF', strokeWidth: 1.5 } } });
  const heavyPorts = {
    groups: {
      top: { position: { name: 'top' }, attrs: { circle: { r: 5, magnet: true, fill: 'var(--port-color, #1D73C9)', stroke: '#FFFFFF', strokeWidth: 1.5 } }, markup: [{ tagName: 'circle', selector: 'circle' }] },
      bottom: { position: { name: 'bottom' }, attrs: { circle: { r: 5, magnet: true, fill: 'var(--port-color, #1D73C9)', stroke: '#FFFFFF', strokeWidth: 1.5 } }, markup: [{ tagName: 'circle', selector: 'circle' }] },
      fieldLeft: { position: { name: 'absolute' }, attrs: { rect: { width: 8, height: 8 } }, markup: [{ tagName: 'rect', selector: 'rect' }] },
      fieldRight: { position: { name: 'absolute' }, attrs: { rect: { width: 8, height: 8 } }, markup: [{ tagName: 'rect', selector: 'rect' }] },
    },
    items: [
      { id: 'port-top', group: 'top' }, { id: 'port-bottom', group: 'bottom' },
      fieldPort('field-left-a', 'fieldLeft'), fieldPort('field-right-a', 'fieldRight'),
      fieldPort('field-left-b', 'fieldLeft'), fieldPort('field-right-b', 'fieldRight'),
    ],
  };
  const obj = { id: 'o1', type: 'sf.DataObject', position: { x: 0, y: 0 }, size: { width: 260, height: 120 }, objectName: 'X', fields: [{ label: 'A', fid: 'a' }, { label: 'B', fid: 'b' }], ports: heavyPorts };
  const note = { id: 'n1', type: 'sf.Note', ports: { items: [{ id: 'p', group: 'top' }] } };  // non-DataObject ports must survive
  const g = { cells: [obj, note] };
  const before = JSON.stringify(g).length;

  const out = compactGraphForSave(g);

  const outObj = out.cells.find((c) => c.id === 'o1');
  assert.equal(outObj.ports, undefined, 'DataObject ports stripped');
  assert.equal(outObj.objectName, 'X', 'other DataObject props kept');
  assert.deepEqual(outObj.fields, [{ label: 'A', fid: 'a' }, { label: 'B', fid: 'b' }], 'fields kept');
  assert.ok(out.cells.find((c) => c.id === 'n1').ports, 'non-DataObject ports left intact');

  assert.ok(g.cells[0].ports, 'input not mutated — original DataObject still has ports');

  const after = JSON.stringify(out).length;
  assert.ok(after < before * 0.6, `expected the DataObject save to shrink >40%, got ${before} → ${after} bytes`);
});

test('compactGraphForSave preserves content losslessly for a graph with nothing to strip', () => {
  const g = { cells: [{ id: 'n', type: 'sf.Note' }] };
  assert.deepEqual(compactGraphForSave(g), g, 'content preserved (a fresh clone via slimForShare)');
});
