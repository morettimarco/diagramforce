// Characterization tests for the sfManhattan router's PURE geometry helpers
// (js/canvas/router.js), extracted in Phase 4 Slice 2. These lock the current
// math so the router can be refactored further without silent regressions.
// The helpers depend only on their arguments (+ the internal PAD=16 obstacle
// clearance), so they need no DOM / JointJS / paper — pure Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCalc, segHitsBox, pathClear, tryRoute, orthoRoute }
  from '../js/canvas/router.js';

// ── resolveCalc: the calc() evaluator for port anchor offsets ──
test('resolveCalc — number / non-string passthrough + fallbacks', () => {
  assert.equal(resolveCalc(42, 100, 50), 42);     // number → itself
  assert.equal(resolveCalc(null, 100, 50), 0);    // non-string/number → 0
  assert.equal(resolveCalc(undefined, 100, 50), 0);
  assert.equal(resolveCalc('20', 100, 50), 20);   // plain numeric string
  assert.equal(resolveCalc('garbage', 100, 50), 0); // unparseable → 0
});

test('resolveCalc — calc(w) / calc(h)', () => {
  assert.equal(resolveCalc('calc(w)', 100, 50), 100);
  assert.equal(resolveCalc('calc(h)', 100, 50), 50);
  assert.equal(resolveCalc('calc( W )', 100, 50), 100); // case-insensitive + spaces
});

test('resolveCalc — calc(ratio * dim [± offset]) incl. the "+ -8" sign quirk', () => {
  assert.equal(resolveCalc('calc(0.5 * w)', 100, 50), 50);
  assert.equal(resolveCalc('calc(0.25 * h)', 100, 50), 12.5);
  assert.equal(resolveCalc('calc(0.5 * w + 8)', 100, 50), 58);
  assert.equal(resolveCalc('calc(0.5 * w - 8)', 100, 50), 42);
  // documented quirk: `+ -8` and `- 8` both resolve to a −8 offset
  assert.equal(resolveCalc('calc(0.5 * w + -8)', 100, 50), 42);
});

// ── segHitsBox: does an axis-aligned segment intersect the PAD(16)-padded box? ──
// box {0,0,100,100} → padded bounds (-16,-16) .. (116,116)
const BOX = { x: 0, y: 0, width: 100, height: 100 };
test('segHitsBox — vertical segment', () => {
  assert.equal(segHitsBox(50, -50, 50, 200, BOX), true);   // through the box
  assert.equal(segHitsBox(200, -50, 200, 200, BOX), false); // x outside padded box
  assert.equal(segHitsBox(50, 200, 50, 300, BOX), false);   // y range below the box
});
test('segHitsBox — horizontal segment', () => {
  assert.equal(segHitsBox(-50, 50, 200, 50, BOX), true);    // through the box
  assert.equal(segHitsBox(-50, 200, 200, 200, BOX), false); // y outside padded box
});
test('segHitsBox — diagonal segments never count (router is orthogonal-only)', () => {
  assert.equal(segHitsBox(0, 0, 100, 100, BOX), false);
});

// ── pathClear: every segment of a polyline misses every obstacle ──
test('pathClear — clear vs blocked polylines', () => {
  assert.equal(pathClear([{ x: -50, y: 200 }, { x: 200, y: 200 }], [BOX]), true);  // passes below
  assert.equal(pathClear([{ x: -50, y: 50 }, { x: 200, y: 50 }], [BOX]), false);   // crosses the box
  assert.equal(pathClear([{ x: 0, y: 0 }, { x: 100, y: 100 }], []), true);         // no obstacles
});

// ── tryRoute: returns the mid-waypoints if the full a→mid→b polyline is clear ──
test('tryRoute — clear route returns its waypoints; blocked returns null', () => {
  assert.deepEqual(tryRoute({ x: 0, y: 0 }, [{ x: 50, y: 0 }], { x: 50, y: 50 }, []), [{ x: 50, y: 0 }]);
  assert.equal(tryRoute({ x: -50, y: 50 }, [{ x: 50, y: 50 }], { x: 200, y: 50 }, [BOX]), null);
});

// ── orthoRoute: the L/Z/U-shape orthogonal solver ──
test('orthoRoute — simple L when unobstructed (horizontal-first)', () => {
  // a→b diagonal with no obstacles: first L candidate {x:b.x, y:a.y} is clear
  assert.deepEqual(orthoRoute({ x: 0, y: 0 }, { x: 100, y: 100 }, []), [{ x: 100, y: 100 - 100 }]);
});
test('orthoRoute — always returns a non-empty waypoint list (last-resort L)', () => {
  const r = orthoRoute({ x: 0, y: 0 }, { x: 100, y: 100 }, [{ x: -200, y: -200, width: 600, height: 600 }]);
  assert.ok(Array.isArray(r) && r.length >= 1);
});
