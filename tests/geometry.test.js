import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { right, bottom, centerX, centerY, clamp } from '../js/util/geometry.js';

describe('bbox accessors', () => {
  const box = { x: 10, y: 20, width: 80, height: 40 };
  it('right = x + width',    () => assert.equal(right(box), 90));
  it('bottom = y + height',  () => assert.equal(bottom(box), 60));
  it('centerX = x + w/2',    () => assert.equal(centerX(box), 50));
  it('centerY = y + h/2',    () => assert.equal(centerY(box), 40));
  it('handles zero-size',    () => assert.equal(centerX({ x: 5, width: 0 }), 5));
  it('handles negative origin', () => assert.equal(right({ x: -30, width: 10 }), -20));
});

describe('clamp', () => {
  it('passes through in-range',  () => assert.equal(clamp(5, 0, 10), 5));
  it('clamps below min',         () => assert.equal(clamp(-3, 0, 10), 0));
  it('clamps above max',         () => assert.equal(clamp(99, 0, 10), 10));
  it('respects fractional zoom', () => assert.equal(clamp(4.5, 0.1, 4), 4));
  it('min===max collapses',      () => assert.equal(clamp(7, 2, 2), 2));
});
