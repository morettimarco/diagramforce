// Pure 2D geometry primitives — stateless, zero-dependency box/scalar math.
// Harvested from router.js / spacing-guides.js / viewport.js (Phase 5, Slice 5.1).
//
// Scope is deliberately narrow: only the box accessors + the scalar clamp that
// were genuinely duplicated across multiple modules live here. Domain algorithms
// (segHitsBox, orthoRoute, findSequentialSpacing, the zoom-anchor transform) and
// every tuning constant (SNAP_THRESHOLD, PAD, ZOOM_MIN, …) stay in their own
// modules — they are not shared math and merging them would be false coupling.

/** Right edge of an axis-aligned box: `x + width`. */
export const right = (box) => box.x + box.width;

/** Bottom edge of an axis-aligned box: `y + height`. */
export const bottom = (box) => box.y + box.height;

/** Horizontal centre of a box: `x + width / 2`. */
export const centerX = (box) => box.x + box.width / 2;

/** Vertical centre of a box: `y + height / 2`. */
export const centerY = (box) => box.y + box.height / 2;

/** Clamp `v` into the inclusive range `[lo, hi]`. */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
