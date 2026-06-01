// Characterization test for the FROZEN v1 share-URL codec (js/share-codec.js).
//
// The codec's MIN key-map and DICT_V1 dictionary are a frozen wire contract:
// every share URL ever generated must keep decoding. These tests lock that
// contract — a round-trip property test plus a byte-exact golden vector that
// fails the moment MIN/DICT_V1/pako changes. (When you intentionally ship a v2
// codec, you add NEW golden vectors; you never edit the v1 ones.)
import './setup.js'; // MUST be first — populates global.pako before the codec runs
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShareV1, decodeShareV1 } from '../js/share-codec.js';

// A representative share-data object: schema version + a small graph with two
// nodes and a link, using real JointJS / sf.* key names so the MIN map and the
// DICT_V1 dictionary are genuinely exercised (not just pass-through keys).
export const FIXTURE = {
  v: 1,
  graph: {
    cells: [
      {
        type: 'sf.SimpleNode', id: 'n1', angle: 0,
        position: { x: 0, y: 0 }, size: { width: 120, height: 60 },
        attrs: {
          label: { text: 'Hello', fontSize: 13, fontWeight: 600 },
          body: { fill: 'transparent', stroke: 'none', strokeWidth: 1 },
        },
      },
      {
        type: 'sf.SimpleNode', id: 'n2',
        position: { x: 240, y: 0 }, size: { width: 120, height: 60 },
        attrs: { label: { text: 'World' } },
      },
      {
        type: 'standard.Link', id: 'l1',
        source: { id: 'n1' }, target: { id: 'n2' },
        vertices: [], labels: [],
        router: { name: 'normal' }, connector: { name: 'normal' },
      },
    ],
  },
};

test('round-trips losslessly (decode(encode(x)) deep-equals x)', () => {
  const decoded = decodeShareV1(encodeShareV1(FIXTURE));
  assert.deepStrictEqual(decoded, FIXTURE);
});

test('output carries the v1. version prefix', () => {
  assert.ok(encodeShareV1(FIXTURE).startsWith('v1.'));
});

test('decodeShareV1 rejects a non-v1 payload', () => {
  assert.throws(() => decodeShareV1('v2.whatever'), /Not a v1 share payload/);
});

// Golden vector — the byte-exact `v1.` encoding of FIXTURE under the FROZEN
// MIN map + DICT_V1 dictionary + pako 2.1.0. This is the regression tripwire:
// any change to MIN, DICT_V1, the encode pipeline, or the pako build alters
// this string and fails the test. That is intentional — every v1 share URL in
// the wild must keep decoding. When you ship a parallel v2 codec, add a NEW
// golden for it; NEVER regenerate this one to make a v1 edit pass.
const GOLDEN_V1 =
  'v1.q1YqA5qko-QOEnQGG4WZS3XAyvMMgYxYcFYlMteCPZsDIkKA-j1Sc3LygUa4AVUZ60ALPKAqJ5AC9NJMB1GcQTwL9IYOHrcZKSFcZWRCkrvC84tyUpSQzC9JzEtJLErR88nMy4aanwPyOzwUgSGBHI5Ay4FccE2qA6lWdZQwamAdzCoYFDcA';

test('FROZEN v1 contract — encodeShareV1 matches the golden vector', () => {
  assert.strictEqual(encodeShareV1(FIXTURE), GOLDEN_V1);
});

test('FROZEN v1 contract — golden vector still decodes to the fixture (back-compat)', () => {
  assert.deepStrictEqual(decodeShareV1(GOLDEN_V1), FIXTURE);
});
