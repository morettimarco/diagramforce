// Characterization tests for the pure helpers EXPORTED by js/persistence.js.
//
// persistence.js imports cleanly in Node (all browser/DOM refs are inside
// functions), so we can test its pure exports without a DOM.
//
// SCOPE NOTE: the plan also named `compareSemver` and `normalizeDateSuffix`, but
// both are currently module-PRIVATE in persistence.js — they can't be imported
// without editing js/ (out of scope for this pass). They are flagged as Phase-1
// "extract pure helpers into a testable util module / export them" candidates;
// once exported, add direct tests here. `classifyVersionDiff` (below) exercises
// the version-component comparison at the public boundary in the meantime.
import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSignature, classifyVersionDiff, APP_VERSION } from '../js/persistence.js';

// ── contentSignature — the import-dedup hash (shared with templates.js) ──────
test('contentSignature is independent of object key ORDER (stable stringify)', () => {
  assert.equal(
    contentSignature([{ type: 'sf.Note', id: 'a', position: { x: 1, y: 2 } }]),
    contentSignature([{ position: { y: 2, x: 1 }, id: 'a', type: 'sf.Note' }]),
  );
});

test('contentSignature changes when content changes', () => {
  assert.notEqual(
    contentSignature([{ id: 'a', v: 1 }]),
    contentSignature([{ id: 'a', v: 2 }]),
  );
});

test('contentSignature treats null / undefined cells as the empty array', () => {
  assert.equal(contentSignature(null), '[]');
  assert.equal(contentSignature(undefined), '[]');
  assert.equal(contentSignature([]), '[]');
});

test('contentSignature golden vector (locks the sorted-key stringify format)', () => {
  assert.equal(
    contentSignature([{ type: 'sf.Note', id: 'n1', size: { width: 120, height: 60 } }]),
    '[{"id":"n1","size":{"height":60,"width":120},"type":"sf.Note"}]',
  );
});

// ── classifyVersionDiff — version-mismatch classification ────────────────────
// Inputs are derived from the LIVE APP_VERSION so the test stays correct across
// version bumps; it locks the classification LOGIC, not a hardcoded version.
test('classifyVersionDiff classifies by the first differing semver component', () => {
  const [maj, min, pat] = APP_VERSION.split('.').map(Number);
  assert.equal(classifyVersionDiff(APP_VERSION), 'none');
  assert.equal(classifyVersionDiff(`${maj}.${min}.${pat + 1}`), 'patch');
  assert.equal(classifyVersionDiff(`${maj}.${min + 1}.0`), 'minor');
  assert.equal(classifyVersionDiff(`${maj + 1}.0.0`), 'major');
});

test('classifyVersionDiff treats a missing version as a MAJOR mismatch', () => {
  assert.equal(classifyVersionDiff(null), 'major');
  assert.equal(classifyVersionDiff(undefined), 'major');
  assert.equal(classifyVersionDiff(''), 'major');
});
