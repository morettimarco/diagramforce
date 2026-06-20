// Characterization tests for js/history.js — the undo/redo command pattern and
// its drag-aware merge (DRAG_IDLE_MS = 80ms idle window).
//
// history.js is a SINGLETON coupled to a JointJS graph. We drive it with a
// minimal mock graph + mock cell, and use node:test's native mock timers
// (NO Jest) to control the debounce. history.clear() fully resets the singleton
// (stacks + pending merge + timer) between tests.
import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as history from '../js/history.js';

// MUST mirror the constant in js/history.js. It's module-private there, so this
// duplicate is itself a tripwire: the boundary tests below (tick 79 vs 80) fail
// if js/history.js changes the window without updating this.
const DRAG_IDLE_MS = 80;

// ── Minimal mocks ──────────────────────────────────────────────────────────
function makeMockGraph() {
  const handlers = new Map();
  const cells = new Map();
  return {
    on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, []); handlers.get(ev).push(fn); },
    emit(ev, ...args) { (handlers.get(ev) || []).forEach((fn) => fn(...args)); },
    getCell(id) { return cells.get(id) || null; },
    addCell(c) { cells.set(c.id, c); return c; }, // silent — does NOT emit 'add'
  };
}

function makeCell(id, pos) {
  let cur = { ...pos };
  let prev = null;
  return {
    id,
    get(p) { return p === 'position' ? { ...cur } : undefined; },
    previous(p) { return p === 'position' ? (prev && { ...prev }) : undefined; },
    // Setter used BOTH by the drag simulation and by undo/redo closures.
    // Intentionally does NOT emit, so undo/redo can't re-enter the listeners.
    position(x, y) { prev = cur; cur = { x, y }; },
    toJSON() { return { id, type: 'mock', position: { ...cur } }; },
  };
}

// Simulate one interactive drag step = move the cell, then fire change:position.
function dragStep(graph, cell, x, y) { cell.position(x, y); graph.emit('change:position', cell); }

test('drag-merge: rapid moves collapse into ONE undo entry, committed at exactly DRAG_IDLE_MS', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  history.clear();
  const graph = makeMockGraph();
  history.init(graph);
  const cell = makeCell('c1', { x: 0, y: 0 });
  graph.addCell(cell);

  for (const x of [5, 10, 30]) dragStep(graph, cell, x, 0); // a 3-event drag
  assert.equal(history.canUndo(), false, 'nothing committed during the drag');

  t.mock.timers.tick(DRAG_IDLE_MS - 1); // 79ms
  assert.equal(history.canUndo(), false, 'still pending at 79ms (< idle window)');
  t.mock.timers.tick(1); // 80ms
  assert.equal(history.canUndo(), true, 'commits at exactly 80ms');

  // One merged entry, pinned to the FIRST oldPos — a single undo restores start.
  history.undo();
  assert.deepEqual(cell.get('position'), { x: 0, y: 0 }, 'one undo reverts the whole 3-step drag');
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), true);
  history.redo();
  assert.deepEqual(cell.get('position'), { x: 30, y: 0 }, 'redo restores the drag end');
});

test('drag-merge: the idle timer RESETS on each change (continuous drag never commits mid-motion)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  history.clear();
  const graph = makeMockGraph();
  history.init(graph);
  const cell = makeCell('c2', { x: 0, y: 0 });
  graph.addCell(cell);

  dragStep(graph, cell, 10, 0);
  t.mock.timers.tick(60); // 60 < 80
  assert.equal(history.canUndo(), false);
  dragStep(graph, cell, 20, 0); // resets the idle timer
  t.mock.timers.tick(60); // 60ms since the LAST change → still < 80
  assert.equal(history.canUndo(), false, 'timer reset by the 2nd change');
  t.mock.timers.tick(20); // now 80ms since the last change
  assert.equal(history.canUndo(), true, 'commits 80ms after the LAST change');
});

test('undo() flushes a pending drag first — a fast Cmd+Z right after a drop still undoes it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  history.clear();
  const graph = makeMockGraph();
  history.init(graph);
  const cell = makeCell('c3', { x: 5, y: 5 });
  graph.addCell(cell);

  dragStep(graph, cell, 25, 5); // pending, NOT yet committed (no tick)
  assert.equal(history.canUndo(), false);
  history.undo(); // undo() must commit-then-undo the in-flight drag
  assert.deepEqual(cell.get('position'), { x: 5, y: 5 }, 'pending drag was flushed and reverted');
});

test('flushPendingDragCommit() lands a pending drag immediately (no idle wait)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  history.clear();
  const graph = makeMockGraph();
  history.init(graph);
  const cell = makeCell('c4', { x: 0, y: 0 });
  graph.addCell(cell);

  dragStep(graph, cell, 15, 0);
  assert.equal(history.canUndo(), false);
  history.flushPendingDragCommit();
  assert.equal(history.canUndo(), true, 'flush commits without ticking the timer');
});

test('a net-zero drag (ends where it started) records no command', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  history.clear();
  const graph = makeMockGraph();
  history.init(graph);
  const cell = makeCell('c5', { x: 0, y: 0 });
  graph.addCell(cell);

  dragStep(graph, cell, 40, 0);
  dragStep(graph, cell, 0, 0); // back to origin → first oldPos === last newPos
  t.mock.timers.tick(DRAG_IDLE_MS);
  assert.equal(history.canUndo(), false, 'net-zero move commits nothing');
});
