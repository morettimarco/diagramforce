// Undo/Redo manager — custom command pattern implementation
// Listens to JointJS graph events and records reversible commands

let graph;
const undoStack = [];
const redoStack = [];
const MAX_STACK = 100;
let isUndoRedoing = false;
let isBatching = false;
let currentBatch = null;
const onChangeCallbacks = [];

// ── Drag-aware merge for continuous position/size/vertex changes ──
// JointJS fires `change:position` (and `change:size`, `change:vertices`) on
// every pointer-move during an interactive drag — a 30-pixel drag can produce
// dozens of events. Without merging, the user has to tap undo for each step
// to walk a dragged element back to where it started.
//
// Strategy: when a continuous-change event fires, we record only the FIRST
// oldValue per cell-and-property pair, keep updating the latest newValue, and
// commit a single merged command after a short idle window (DRAG_IDLE_MS).
// `flushPendingDragCommit()` is also invoked at the start of undo()/redo()
// so a fast Cmd+Z immediately after a drop still finds the drag on the stack.
const DRAG_IDLE_MS = 80;
const pendingChanges = new Map();   // cellId → { position?, size?, vertices? }
let pendingCommitTimer = null;

function schedulePendingDragCommit() {
  if (pendingCommitTimer) clearTimeout(pendingCommitTimer);
  pendingCommitTimer = setTimeout(() => {
    pendingCommitTimer = null;
    commitPendingDrag();
  }, DRAG_IDLE_MS);
}

function commitPendingDrag() {
  if (pendingCommitTimer) { clearTimeout(pendingCommitTimer); pendingCommitTimer = null; }
  if (pendingChanges.size === 0) return;

  const undos = [];
  const redos = [];
  for (const [id, entry] of pendingChanges) {
    if (entry.position) {
      const { oldPos, newPos } = entry.position;
      if (oldPos.x !== newPos.x || oldPos.y !== newPos.y) {
        const ox = oldPos.x, oy = oldPos.y, nx = newPos.x, ny = newPos.y;
        undos.push(() => { const c = graph.getCell(id); if (c) c.position(ox, oy); });
        redos.push(() => { const c = graph.getCell(id); if (c) c.position(nx, ny); });
      }
    }
    if (entry.size) {
      const { oldSize, newSize } = entry.size;
      if (oldSize.width !== newSize.width || oldSize.height !== newSize.height) {
        const ow = oldSize.width, oh = oldSize.height, nw = newSize.width, nh = newSize.height;
        undos.push(() => { const c = graph.getCell(id); if (c) c.resize(ow, oh); });
        redos.push(() => { const c = graph.getCell(id); if (c) c.resize(nw, nh); });
      }
    }
    if (entry.vertices) {
      const { oldV, newV } = entry.vertices;
      const oldStr = JSON.stringify(oldV), newStr = JSON.stringify(newV);
      if (oldStr !== newStr) {
        const oc = JSON.parse(oldStr), nc = JSON.parse(newStr);
        undos.push(() => { const c = graph.getCell(id); if (c) c.vertices(oc); });
        redos.push(() => { const c = graph.getCell(id); if (c) c.vertices(nc); });
      }
    }
  }
  pendingChanges.clear();

  if (undos.length === 0) return;
  if (undos.length === 1) {
    pushCommand({ undo: undos[0], redo: redos[0] });
  } else {
    // Multi-cell or multi-property drag (e.g. group move, resize-with-peers):
    // wrap as one composite command so a single undo restores the whole motion.
    pushCommand({
      undo: () => { for (let i = undos.length - 1; i >= 0; i--) undos[i](); },
      redo: () => { redos.forEach(fn => fn()); },
    });
  }
}

/** Public hook so callers (e.g. undo/redo) can force any pending drag merge to land first. */
export function flushPendingDragCommit() { commitPendingDrag(); }

export function init(_graph) {
  graph = _graph;

  graph.on('add', (cell) => {
    if (isUndoRedoing) return;
    const id = cell.id;
    // Capture the initial JSON as a fallback. For links created via port-drag,
    // the `add` event fires BEFORE the arrowhead is dropped on a target port,
    // so this snapshot has target set to a point, not to `{ id, port }`.
    // The undo handler re-captures the live JSON just before removing the
    // cell — that captures the fully-connected link state (as well as any
    // attribute edits made after creation), so redo restores the cell in its
    // final form rather than its moment-of-creation form.
    let capturedJson = cell.toJSON();
    pushCommand({
      undo: () => {
        const c = graph.getCell(id);
        if (c) {
          capturedJson = c.toJSON();
          c.remove();
        }
      },
      redo: () => graph.addCell(capturedJson),
    });
  });

  graph.on('remove', (cell) => {
    if (isUndoRedoing) return;
    const json = cell.toJSON();
    pushCommand({
      undo: () => graph.addCell(json),
      redo: () => {
        const c = graph.getCell(json.id);
        if (c) c.remove();
      },
    });
  });

  graph.on('change:position', (cell) => {
    if (isUndoRedoing) return;
    const oldPos = cell.previous('position');
    if (!oldPos) return;
    const newPos = { ...cell.get('position') };
    const id = cell.id;
    let entry = pendingChanges.get(id);
    if (!entry) { entry = {}; pendingChanges.set(id, entry); }
    if (!entry.position) {
      // First position-change for this cell in this drag — pin the original oldPos.
      entry.position = { oldPos: { ...oldPos }, newPos };
    } else {
      // Subsequent move during the same drag — keep the original oldPos, refresh newPos.
      entry.position.newPos = newPos;
    }
    schedulePendingDragCommit();
  });

  graph.on('change:size', (cell) => {
    if (isUndoRedoing) return;
    const oldSize = cell.previous('size');
    if (!oldSize) return;
    const newSize = { ...cell.get('size') };
    const id = cell.id;
    let entry = pendingChanges.get(id);
    if (!entry) { entry = {}; pendingChanges.set(id, entry); }
    if (!entry.size) {
      entry.size = { oldSize: { ...oldSize }, newSize };
    } else {
      entry.size.newSize = newSize;
    }
    schedulePendingDragCommit();
  });

  graph.on('change:attrs', (cell) => {
    if (isUndoRedoing) return;
    const oldAttrs = cell.previous('attrs');
    if (!oldAttrs) return;
    const newAttrs = JSON.parse(JSON.stringify(cell.get('attrs')));
    const oldAttrsCopy = JSON.parse(JSON.stringify(oldAttrs));
    const id = cell.id;
    pushCommand({
      undo: () => { const c = graph.getCell(id); if (c) c.set('attrs', oldAttrsCopy); },
      redo: () => { const c = graph.getCell(id); if (c) c.set('attrs', newAttrs); },
    });
  });

  // Link labels — `cell.labels()`, `cell.label()`, and `cell.appendLabel()` all
  // mutate the `labels` property, NOT `attrs`, so `change:attrs` never fires.
  // Without this handler, editing or removing a connector label is invisible to
  // undo/redo.
  graph.on('change:labels', (cell) => {
    if (isUndoRedoing) return;
    const oldLabels = cell.previous('labels');
    const newLabels = cell.get('labels');
    const oldStr = JSON.stringify(oldLabels ?? []);
    const newStr = JSON.stringify(newLabels ?? []);
    if (oldStr === newStr) return;
    const oldCopy = JSON.parse(oldStr);
    const newCopy = JSON.parse(newStr);
    const id = cell.id;
    pushCommand({
      undo: () => { const c = graph.getCell(id); if (c) c.labels(oldCopy); },
      redo: () => { const c = graph.getCell(id); if (c) c.labels(newCopy); },
    });
  });

  // Link vertices — added/dragged/cleared via `cell.vertices(...)`. Stored on
  // the link model directly, so neither `change:attrs` nor `change:labels`
  // captures changes. Without this handler the "Simplify path" action and any
  // user drag that creates or removes vertices is invisible to undo/redo.
  // Routed through the same pending-drag merge so a vertex drag collapses to
  // one undo command instead of one per pointer-move.
  graph.on('change:vertices', (cell) => {
    if (isUndoRedoing) return;
    const oldV = cell.previous('vertices') ?? [];
    const newV = cell.get('vertices') ?? [];
    if (JSON.stringify(oldV) === JSON.stringify(newV)) return;
    const id = cell.id;
    let entry = pendingChanges.get(id);
    if (!entry) { entry = {}; pendingChanges.set(id, entry); }
    if (!entry.vertices) {
      entry.vertices = { oldV: JSON.parse(JSON.stringify(oldV)), newV: JSON.parse(JSON.stringify(newV)) };
    } else {
      entry.vertices.newV = JSON.parse(JSON.stringify(newV));
    }
    schedulePendingDragCommit();
  });

  // Link connector — `cell.connector(name, args)` swaps how the line is drawn
  // (e.g. straight vs rounded). Same blind-spot as vertices above.
  graph.on('change:connector', (cell) => {
    if (isUndoRedoing) return;
    const oldC = cell.previous('connector') ?? null;
    const newC = cell.get('connector') ?? null;
    const oldStr = JSON.stringify(oldC);
    const newStr = JSON.stringify(newC);
    if (oldStr === newStr) return;
    const oldCopy = oldC ? JSON.parse(oldStr) : null;
    const newCopy = newC ? JSON.parse(newStr) : null;
    const id = cell.id;
    pushCommand({
      undo: () => { const c = graph.getCell(id); if (c) c.prop('connector', oldCopy); },
      redo: () => { const c = graph.getCell(id); if (c) c.prop('connector', newCopy); },
    });
  });

  // Custom `lineStyle` prop (Safari-safe dashed/dotted connectors).
  // Stored separately from `line/strokeDasharray` so the real line never
  // carries a dasharray; see canvas.js → startLineStyleOverlays().
  graph.on('change:lineStyle', (cell) => {
    if (isUndoRedoing) return;
    const oldStyle = cell.previous('lineStyle') ?? null;
    const newStyle = cell.get('lineStyle') ?? null;
    if (oldStyle === newStyle) return;
    const id = cell.id;
    pushCommand({
      undo: () => { const c = graph.getCell(id); if (c) c.prop('lineStyle', oldStyle); },
      redo: () => { const c = graph.getCell(id); if (c) c.prop('lineStyle', newStyle); },
    });
  });
}

function pushCommand(cmd) {
  if (isBatching && currentBatch !== null) {
    currentBatch.push(cmd);
    return;
  }
  undoStack.push(cmd);
  if (undoStack.length > MAX_STACK) undoStack.shift();
  redoStack.length = 0;
  notifyChange();
}

export function undo() {
  // Land any in-flight drag merge first so a fast Cmd+Z right after a drop
  // doesn't undo the wrong action (or no action at all).
  commitPendingDrag();
  if (undoStack.length === 0) return;
  isUndoRedoing = true;
  const cmd = undoStack.pop();
  try {
    if (Array.isArray(cmd)) {
      for (let i = cmd.length - 1; i >= 0; i--) cmd[i].undo();
    } else {
      cmd.undo();
    }
    redoStack.push(cmd);
  } finally {
    isUndoRedoing = false;
  }
  notifyChange();
}

export function redo() {
  commitPendingDrag();
  if (redoStack.length === 0) return;
  isUndoRedoing = true;
  const cmd = redoStack.pop();
  try {
    if (Array.isArray(cmd)) {
      cmd.forEach(c => c.redo());
    } else {
      cmd.redo();
    }
    undoStack.push(cmd);
  } finally {
    isUndoRedoing = false;
  }
  notifyChange();
}

export function startBatch() {
  // Land any in-flight drag merge before opening an explicit batch — otherwise
  // the deferred commit could land inside the batch and disappear on undo.
  commitPendingDrag();
  isBatching = true;
  currentBatch = [];
}

export function endBatch() {
  isBatching = false;
  if (currentBatch && currentBatch.length > 0) {
    undoStack.push(currentBatch);
    if (undoStack.length > MAX_STACK) undoStack.shift();
    redoStack.length = 0;
    notifyChange();
  }
  currentBatch = null;
}

export function clear() {
  // Drop any in-flight drag merge along with the rest of the history.
  if (pendingCommitTimer) { clearTimeout(pendingCommitTimer); pendingCommitTimer = null; }
  pendingChanges.clear();
  undoStack.length = 0;
  redoStack.length = 0;
  notifyChange();
}

/** Snapshot current stacks (for per-tab persistence). */
export function save() {
  return { undo: [...undoStack], redo: [...redoStack] };
}

/** Restore previously saved stacks (for per-tab persistence). */
export function restore(state) {
  undoStack.length = 0;
  redoStack.length = 0;
  if (state) {
    undoStack.push(...state.undo);
    redoStack.push(...state.redo);
  }
  notifyChange();
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function onChange(cb) { onChangeCallbacks.push(cb); }
function notifyChange() { onChangeCallbacks.forEach(cb => cb()); }
