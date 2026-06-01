// Embedding — parent-child container mechanics. Extracted from canvas.js
// (Phase 4, Slice 12 — the final interactive domain).
//
// Hybrid split, because JointJS needs the embedding constraints as paper
// *constructor* options:
//  • canEmbed + findEmbeddingParent are imported by canvas.js straight into the
//    paper's embeddingMode config at instantiation time (they're called later,
//    at drag time, when cctx.graph is live).
//  • The auto-fit engine (fitParentToChildren) + its 4 graph triggers mount
//    post-hydration via registerEmbedding(cctx).
//  • The auto-sizing toggle is localStorage-backed.
// canvas.js re-exports canEmbed / isAutoSizingEnabled / setAutoSizingEnabled /
// refitAllParents for stencil.js (canEmbed) + properties.js (canEmbed) +
// toolbar.js (the toggle + refit). Reads graph/paper via cctx; export-stable.
import { cctx } from './context.js?v=1.14.0';

// ── Auto-sizing toggle (v1.11.6) ────────────────────────────────────
// Controls whether fitParentToChildren may grow/shrink a parent to its embedded
// children. Default ON, persisted in localStorage so the choice survives reloads.
const AUTO_SIZE_LS_KEY = 'sfdiag::autoSizing';
export function isAutoSizingEnabled() {
  try {
    const v = localStorage.getItem(AUTO_SIZE_LS_KEY);
    return v === null ? true : v === 'true';
  } catch { return true; }
}
export function setAutoSizingEnabled(v) {
  try { localStorage.setItem(AUTO_SIZE_LS_KEY, String(!!v)); } catch {}
}

// ── Embedding rules — single source of truth ────────────────────────
// The paper's validateEmbedding delegates here, and shape-conversion code in
// properties.js uses this to decide whether the converted cell can stay embedded
// in its previous parent (e.g. converting a Node to a Container should preserve
// embedding when the old parent is a Zone, but not another Container).
export function canEmbed(parentType, childType) {
  if (parentType === 'sf.Container') {
    return childType !== 'sf.Container' && childType !== 'sf.Zone';
  }
  if (parentType === 'sf.Zone') {
    return childType !== 'sf.Zone';
  }
  if (parentType === 'sf.BpmnPool') {
    return childType !== 'sf.BpmnPool';
  }
  if (parentType === 'sf.BpmnSubprocess') {
    return childType !== 'sf.BpmnPool' && childType !== 'sf.BpmnSubprocess';
  }
  if (parentType === 'sf.BpmnLoop') {
    return childType !== 'sf.BpmnPool' && childType !== 'sf.BpmnSubprocess' && childType !== 'sf.BpmnLoop';
  }
  if (parentType === 'sf.GanttTimeline') {
    return childType === 'sf.GanttTask' || childType === 'sf.GanttMilestone' || childType === 'sf.GanttMarker' || childType === 'sf.GanttGroup';
  }
  if (parentType === 'sf.SequenceParticipant' || parentType === 'sf.SequenceActor') {
    return childType === 'sf.SequenceActivation';
  }
  if (parentType === 'sf.Task') {
    return childType === 'sf.OrgPerson' || childType === 'sf.Container';
  }
  return false;
}

// ── Parent candidate lookup (paper findParentBy) ────────────────────
// Called by JointJS during an embedding-mode drag (cctx.graph is live by then).
// Gantt milestones/markers resolve up from a hit GanttTask to its Timeline.
export function findEmbeddingParent(elementView) {
  const { graph } = cctx;
  const childType = elementView.model.get('type');
  const bbox = elementView.model.getBBox();
  const candidates = graph.findModelsInArea(bbox).filter(
    (el) => el.id !== elementView.model.id
  );
  // For milestones/markers: if a GanttTask is found, replace it with its GanttTimeline ancestor
  if (childType === 'sf.GanttMilestone' || childType === 'sf.GanttMarker') {
    const resolved = [];
    const seen = new Set();
    for (const el of candidates) {
      let target = el;
      if (el.get('type') === 'sf.GanttTask') {
        const parentId = el.get('parent');
        if (parentId) {
          const parentEl = graph.getCell(parentId);
          if (parentEl && parentEl.get('type') === 'sf.GanttTimeline') {
            target = parentEl;
          }
        }
      }
      if (!seen.has(target.id)) {
        seen.add(target.id);
        resolved.push(target);
      }
    }
    return resolved;
  }
  return candidates;
}

// ── Auto-fit engine ─────────────────────────────────────────────────
// Don't shrink a parent below this height — a Container header bar is ~32 px, so
// 48 keeps a small body strip visible even for a single tiny child near the top.
const PARENT_FIT_MIN_HEIGHT = 48;

function fitParentToChildren(parent) {
  const { graph, paper } = cctx;
  if (!isAutoSizingEnabled()) return;
  if (!parent || !parent.isElement || !parent.isElement()) return;
  // Filter by `parent` attribute directly — `parent.getEmbeddedCells()` reads
  // the parent's own `embeds` array, which JointJS may not have updated yet
  // during a synchronous remove/un-embed event.
  const children = graph.getElements().filter(c => c.get('parent') === parent.id);
  if (children.length === 0) return; // empty parent: leave it alone
  let maxBottom = -Infinity;
  for (const c of children) {
    const p = c.position();
    const s = c.size();
    const bottom = p.y + s.height;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  const parentPos = parent.position();
  const parentSize = parent.size();
  // Padding = visible grid dot spacing (gridSize × drawGrid.scaleFactor).
  const PARENT_FIT_PADDING = (paper.options.gridSize || 4) * (paper.options.drawGrid?.args?.scaleFactor || 4);
  const requiredHeight = (maxBottom + PARENT_FIT_PADDING) - parentPos.y;
  const targetHeight = Math.max(PARENT_FIT_MIN_HEIGHT, requiredHeight);
  if (Math.abs(parentSize.height - targetHeight) < 1) return; // already at right size
  parent.resize(parentSize.width, targetHeight);
}

// Walk every embedding parent and refit each one. Used by the toolbar to tighten
// everything up immediately after the user re-enables auto sizing.
export function refitAllParents() {
  const { graph } = cctx;
  if (!graph) return;
  const seen = new Set();
  graph.getElements().forEach(el => {
    const pid = el.get('parent');
    if (!pid || seen.has(pid)) return;
    seen.add(pid);
    const parent = graph.getCell(pid);
    if (parent) fitParentToChildren(parent);
  });
}

// ── Registration: the 4 auto-fit graph triggers ─────────────────────
// Mounted post-hydration. Skips JSON-restore via the synced cctx.isLoadingJSON
// guard (Slice 9). Also exposes cctx.fitParentToChildren (declared slot).
export function registerEmbedding(cctx) {
  const { graph } = cctx;
  cctx.fitParentToChildren = fitParentToChildren;

  // Trigger 1: a cell becomes embedded (or un-embedded). Fit both parents:
  // the new one (may grow) and the previous one (may shrink).
  graph.on('change:parent', (cell, newParentId) => {
    if (cctx.isLoadingJSON) return;
    if (!cell.isElement || !cell.isElement()) return;
    const prevParentId = cell.previous('parent');
    if (newParentId) {
      const np = graph.getCell(newParentId);
      if (np) fitParentToChildren(np);
    }
    if (prevParentId && prevParentId !== newParentId) {
      const pp = graph.getCell(prevParentId);
      if (pp) fitParentToChildren(pp);
    }
  });

  // Trigger 2: an embedded child resizes (e.g. DataObject after key-fields-only
  // toggle, or any cell after manual resize). Fit the parent.
  graph.on('change:size', (cell) => {
    if (cctx.isLoadingJSON) return;
    const parentId = cell.get('parent');
    if (!parentId) return;
    const parent = graph.getCell(parentId);
    if (parent) fitParentToChildren(parent);
  });

  // Trigger 3: an embedded child moves. Cascaded moves (parent dragging its
  // children along) don't change relative geometry, so fit is a no-op there —
  // but a user dragging the child within the parent should tighten/expand it.
  graph.on('change:position', (cell) => {
    if (cctx.isLoadingJSON) return;
    const parentId = cell.get('parent');
    if (!parentId) return;
    const parent = graph.getCell(parentId);
    if (parent) fitParentToChildren(parent);
  });

  // Trigger 4: an embedded child is removed (deleted, cut, etc.). Fit the
  // surviving parent on the next tick — JointJS may still be cleaning up its
  // embeds-array when this fires.
  graph.on('remove', (cell) => {
    if (cctx.isLoadingJSON) return;
    const parentId = cell.get('parent') || cell.previous('parent');
    if (!parentId) return;
    const parent = graph.getCell(parentId);
    if (!parent) return;
    setTimeout(() => fitParentToChildren(parent), 0);
  });
}
