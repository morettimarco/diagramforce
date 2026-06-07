// Contextual walkthrough — a first-party, zero-dependency guided tour + a first-visit
// welcome splash. The active diagram type (tabs.getActiveTabType()) is the SINGLE source
// of truth for which step set runs. Steps render as a spotlight-cutout popover locked with
// trapFocus (from feedback.js); the splash reuses buildModal. No external tour library, no
// graph mutations — purely an overlay layer on top of the app.
import { buildModal, trapFocus } from './feedback.js?v=1.15.0';
import { escHtml } from './util.js?v=1.15.0';

let modules = null;
let activeTour = null;   // { steps, index, els, release } while a tour runs

const FIRST_VISIT_KEY = 'df_first_visit_help_shown';

// The "?"-in-circle Help glyph — same filled ring as the About (i) toolbar icon, so the
// two read as a matched pair. Used in the navbar button (index.html) AND inline in copy
// via the {{help}} token below. `currentColor` so it inherits the surrounding text colour.
const HELP_ICON_SVG = '<svg class="sf-help-glyph" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/><text x="8" y="11.7" text-anchor="middle" font-size="10" font-weight="700" font-family="system-ui, -apple-system, sans-serif">?</text></svg>';

// Platform modifier glyph for shortcut copy — ⌘ on macOS, Ctrl elsewhere.
const IS_MAC = (navigator.platform || '').toUpperCase().includes('MAC') || /Mac/i.test(navigator.userAgent || '');
const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

// ── Body renderer ───────────────────────────────────────────────────────────
// Safe: escape FIRST per line, then re-introduce a small, fixed markdown subset —
// [label](url) links (http/https only, new tab), **bold**, the {{help}} glyph + {{mod}}
// modifier tokens, "- " bullet lists, and newlines (→ <br>). Escape-first mirrors
// parseMarkdown; the glyph is a trusted constant injected AFTER escaping (never user input).
function renderBody(text) {
  const inline = (s) => {
    let h = escHtml(s);
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) =>
      `<a href="${/^https?:\/\//i.test(url) ? url : '#'}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\{\{help\}\}/g, HELP_ICON_SVG);
    h = h.replace(/\{\{mod\}\}/g, MOD_KEY);
    return h;
  };
  let html = '';
  let inList = false;
  for (const line of String(text ?? '').split('\n')) {
    const li = /^\s*-\s+(.*)$/.exec(line);
    if (li) {
      if (!inList) { html += '<ul class="sf-tour__list">'; inList = true; }
      html += `<li>${inline(li[1])}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += inline(line) + '<br>';
    }
  }
  if (inList) html += '</ul>';
  return html.replace(/(?:<br>)+$/, '');   // drop trailing line breaks
}

// ── Step configs, gated by diagram type ──────────────────────────────────────
// placement: where the card sits relative to the target —
//   'center' | 'below' | 'below-start' | 'above' | 'left' | 'right' | 'inside-top'.
// A target that's missing or not visible degrades gracefully to a centred card (no spotlight).
const DATAMAPPING_TOUR = [
  {
    target: '#canvas-container', placement: 'center',
    title: 'Welcome to Data Mapping',
    body: 'Here you can map end-to-end data flow from Source systems through Data Cloud pipelines to Activations.\n\nLet’s do a quick 60-second tour of the key tools.\n\nIn a rush? Hit skip. You can always jump right back into this walkthrough by clicking the {{help}} Help icon in the top toolbar.',
  },
  {
    targets: ['#btn-save', '#btn-load'], placement: 'below-start',
    title: 'Save & Load Models',
    body: 'Keep your schemas safe. Export your configuration as a compact native JSON file for version control, share diagram copy with team members via URL hashes, or generate a clean PNG snapshot for your technical documentation.\n\nYou can also use [LLM Spec](https://github.com/MateuszDabrowski/diagramforce/blob/main/DIAGRAM_JSON_SPEC.md) to generate draft mappings and load them.',
  },
  {
    target: '#btn-display', placement: 'below-start',
    title: 'Context-Aware Display',
    body: 'The Display menu dynamically changes based on your active diagram type. Use it to filter out unmapped fields, control amount of visible data, or activate focus dimming to trace complex pipelines.',
  },
  {
    target: '#stencil-panel', placement: 'left',
    title: 'Dedicated Mapping Stencil',
    body: 'Your canvas toolbox. This side panel automatically loads shapes specific to your diagram type. For mapping, it serves up clean data object cards and pipeline containers to cleanly structure your Source, DLO, and DMO tiers.\n\nMissing something? Copy-paste it from another diagram type.',
  },
  {
    target: '#properties-panel', placement: 'right',
    title: 'Manage Properties',
    body: 'Click an object or connector to manage data types, toggle key markers (PK, FK, FQK), and configure specific processing rules like Formula syntax, Streaming Transforms, or Batch logic.',
    // Open an example object's properties panel on enter so the step has something to point
    // at; clear the selection on leave so it closes again. Selection is UI state — no graph
    // mutation, no history entry.
    onEnter: (m) => { const el = m.graph?.getElements?.().find(e => e.get('type') === 'sf.DataObject') || m.graph?.getElements?.()[0]; if (el) m.selection?.selectOnly?.(el); },
    onLeave: (m) => m.selection?.clearSelection?.(),
  },
  {
    target: '#view-switch-group', placement: 'below',
    title: 'Diagram vs. Table Views',
    body: 'One diagram, two views. Flip instantly between the visual Canvas and a tabular Spreadsheet view to audit the mapping and metadata, or download production-ready CSV specs for developers.',
  },
  {
    target: '#canvas-container', placement: 'center',
    title: 'Time to Build!',
    body: 'Pro-tip for fast workflows:\n- {{mod}} + A to select all elements or hold Shift and drag mouse to select part of them\n- {{mod}} + C / V to copy and paste\n- {{mod}} + Z reverts not-so-great decisions\nFind more [here](https://github.com/MateuszDabrowski/diagramforce/tree/main#keyboard-shortcuts).\n\nTime to build!',
  },
];

const DATAMODEL_TOUR = [
  {
    target: '#canvas-container', placement: 'center',
    title: 'Welcome to Data Modeling',
    body: 'Here you can design clean relational database schemas, map entity-relationship diagrams (ERD), and structure your table architectures.\n\nLet’s do a quick 60-second tour of the key tools.\n\nIn a rush? Hit skip. You can always jump right back into this walkthrough by clicking the {{help}} Help icon in the top toolbar.',
  },
  {
    targets: ['#btn-save', '#btn-load'], placement: 'below-start',
    title: 'Save & Load Models',
    body: 'Keep your schemas safe. Export your configuration as a compact native JSON file for version control, share diagram copy with team members via URL hashes, or generate a clean PNG snapshot for your technical documentation.\n\nYou can also use [LLM Spec](https://github.com/MateuszDabrowski/diagramforce/blob/main/DIAGRAM_JSON_SPEC.md) to generate draft tables and load them.',
  },
  {
    target: '#btn-display', placement: 'below-start',
    title: 'Context-Aware Display',
    body: 'The Display menu dynamically changes based on your active diagram type. Use it to toggle field lengths, show or hide field labels, or strip down the view to ‘Key Fields Only’ to instantly make a massive schema scannable.',
  },
  {
    target: '#stencil-panel', placement: 'left',
    title: 'Dedicated Modeling Stencil',
    body: 'Your canvas toolbox. This side panel automatically loads shapes specific to your diagram type. For database modeling, it serves up clean data object tables and documentation blocks.\n\nMissing something? Copy-paste it from another diagram type.',
  },
  {
    target: '#properties-panel', placement: 'right',
    title: 'Manage Properties',
    body: 'Click an object or connector to manage data types, toggle keys (PK, FK), adjust nullability flags, mark unneeded fields as Deprecated, or declare cardinality with visual flags on connector ends.',
    // Open an example object's properties panel on enter; clear it on leave. UI state only.
    onEnter: (m) => { const el = m.graph?.getElements?.().find(e => e.get('type') === 'sf.DataObject') || m.graph?.getElements?.()[0]; if (el) m.selection?.selectOnly?.(el); },
    onLeave: (m) => m.selection?.clearSelection?.(),
  },
  {
    // The Map bridge button (#btn-map-bridge) is Data-Model-only — visible here, so the
    // spotlight lands on it. (The spec said #btn-map; the real id is #btn-map-bridge.)
    target: '#btn-map-bridge', placement: 'below',
    title: 'The ‘Map’ Transition Bridge',
    body: 'Ready to move from database schema layout to data integration? Clicking this replicates your entire structural model straight into a new Data Mapping tab, automatically wrapping your tables inside a default Source layer container so you can immediately wire up pipelines.',
  },
  {
    target: '#canvas-container', placement: 'center',
    title: 'Time to Build!',
    body: 'Pro-tip for fast workflows:\n- {{mod}} + A to select all elements or hold Shift and drag mouse to select part of them\n- {{mod}} + C / V to copy and paste\n- {{mod}} + Z reverts not-so-great decisions\nFind more [here](https://github.com/MateuszDabrowski/diagramforce/tree/main#keyboard-shortcuts).\n\nTime to build!',
  },
];

const ARCHITECTURE_TOUR = [
  {
    target: '#canvas-container', placement: 'center',
    title: 'Welcome to Architecture',
    body: 'Here you can design macro-level infrastructure, document cloud ecosystems, and map system integration flows.\n\nLet’s do a quick 60-second tour of the key tools.\n\nIn a rush? Hit skip. You can always jump right back into this walkthrough by clicking the {{help}} Help icon in the top toolbar.',
  },
  {
    targets: ['#btn-save', '#btn-load'], placement: 'below-start',
    title: 'Save & Load Models',
    body: 'Keep your schemas safe. Export your configuration as a compact native JSON file for version control, share diagram copy with team members via URL hashes, or generate a clean PNG snapshot for your technical documentation.\n\nYou can also use [LLM Spec](https://github.com/MateuszDabrowski/diagramforce/blob/main/DIAGRAM_JSON_SPEC.md) to generate draft architectures and load them.',
  },
  {
    target: '#btn-display', placement: 'below-start',
    title: 'Context-Aware Display',
    body: 'The Display menu dynamically changes based on your active diagram type. Use it to auto layout your diagram, or activate focus dimming to cleanly trace data pathways through complex systems.',
  },
  {
    target: '#stencil-panel', placement: 'left',
    title: 'Dedicated Architecture Stencil',
    body: 'Your canvas toolbox. This side panel automatically loads shapes specific to your diagram type. For architecture, it serves up Salesforce & friends products, cloud architecture blocks, and SLDS icons for custom components.\n\nMissing something? Copy-paste it from another diagram type.',
  },
  {
    target: '#properties-panel', placement: 'right',
    title: 'Manage Properties',
    body: 'Click an infrastructure node or integration link to manage technical metadata. Convert to simplified icons for high level design or to containers to showcase internals of key infrastructure blocks.',
    // Open an example node's properties panel on enter; clear it on leave. UI state only.
    // Prefer a real node (SimpleNode/Container) over a background Zone/label if one exists.
    onEnter: (m) => { const els = m.graph?.getElements?.() || []; const el = els.find(e => e.get('type') === 'sf.SimpleNode' || e.get('type') === 'sf.Container') || els[0]; if (el) m.selection?.selectOnly?.(el); },
    onLeave: (m) => m.selection?.clearSelection?.(),
  },
  {
    target: '#canvas-container', placement: 'center',
    title: 'Time to Build!',
    body: 'Pro-tip for fast workflows:\n- {{mod}} + A to select all elements or hold Shift and drag mouse to select part of them\n- {{mod}} + C / V to copy and paste\n- {{mod}} + Z reverts not-so-great decisions\nFind more [here](https://github.com/MateuszDabrowski/diagramforce/tree/main#keyboard-shortcuts).\n\nTime to build!',
  },
];

const PROCESS_TOUR = [
  {
    target: '#canvas-container', placement: 'center',
    title: 'Welcome to Process Mapping',
    body: 'Here you can design sequential workflows, map business processes, and blueprint user journeys.\n\nLet’s do a quick 60-second tour of the key tools.\n\nIn a rush? Hit skip. You can always jump right back into this walkthrough by clicking the {{help}} Help icon in the top toolbar.',
  },
  {
    targets: ['#btn-save', '#btn-load'], placement: 'below-start',
    title: 'Save & Load Models',
    body: 'Keep your schemas safe. Export your configuration as a compact native JSON file for version control, share diagram copy with team members via URL hashes, or generate a clean PNG snapshot for your technical documentation.\n\nYou can also use [LLM Spec](https://github.com/MateuszDabrowski/diagramforce/blob/main/DIAGRAM_JSON_SPEC.md) to generate draft processes and load them.',
  },
  {
    target: '#btn-display', placement: 'below-start',
    title: 'Context-Aware Display',
    body: 'The Display menu dynamically changes based on your active diagram type. Use it to toggle auto-fit of swim lanes, or activate focus dimming to cleanly trace happy paths through complex conditional logic.',
  },
  {
    target: '#stencil-panel', placement: 'left',
    title: 'Dedicated Process Stencil',
    body: 'Your canvas toolbox. This side panel automatically loads shapes specific to your diagram type. For process mapping, it serves up clean action steps, decision gateways, event triggers, and organizational swimlanes.\n\nMissing something? Copy-paste it from another diagram type.',
  },
  {
    target: '#properties-panel', placement: 'right',
    title: 'Manage Properties',
    body: 'Click a workflow block or connector to manage process metadata. Define labels, colors or switch between step types.',
    // Open an example step's properties panel on enter; clear it on leave. UI state only.
    // Prefer an actual step (Task/Event/Gateway/Flow) over the surrounding Pool/group.
    onEnter: (m) => { const els = m.graph?.getElements?.() || []; const GROUPS = new Set(['sf.BpmnPool', 'sf.Zone', 'sf.Container']); const el = els.find(e => !GROUPS.has(e.get('type'))) || els[0]; if (el) m.selection?.selectOnly?.(el); },
    onLeave: (m) => m.selection?.clearSelection?.(),
  },
  {
    target: '#canvas-container', placement: 'center',
    title: 'Time to Build!',
    body: 'Pro-tip for fast workflows:\n- {{mod}} + A to select all elements or hold Shift and drag mouse to select part of them\n- {{mod}} + C / V to copy and paste\n- {{mod}} + Z reverts not-so-great decisions\nFind more [here](https://github.com/MateuszDabrowski/diagramforce/tree/main#keyboard-shortcuts).\n\nTime to build!',
  },
];

const SEQUENCE_TOUR = [
  {
    target: '#canvas-container', placement: 'center',
    title: 'Welcome to Sequence Diagrams',
    body: 'Here you can design step-by-step execution flows, trace system interactions, and map out chronological runtime message sequences.\n\nLet’s do a quick 60-second tour of the key tools.\n\nIn a rush? Hit skip. You can always jump right back into this walkthrough by clicking the {{help}} Help icon in the top toolbar.',
  },
  {
    targets: ['#btn-save', '#btn-load'], placement: 'below-start',
    title: 'Save & Load Models',
    body: 'Keep your schemas safe. Export your configuration as a compact native JSON file for version control, share diagram copy with team members via URL hashes, or generate a clean PNG snapshot for your technical documentation.\n\nYou can also use [LLM Spec](https://github.com/MateuszDabrowski/diagramforce/blob/main/DIAGRAM_JSON_SPEC.md) to generate draft sequences and load them.',
  },
  {
    target: '#btn-display', placement: 'below-start',
    title: 'Context-Aware Display',
    body: 'The Display menu dynamically changes based on your active diagram type. Use it to toggle bottom participant labels, auto layout the sequence, or activate focus dimming to cleanly isolate specific execution paths.',
  },
  {
    target: '#stencil-panel', placement: 'left',
    title: 'Dedicated Sequence Stencil',
    body: 'Your canvas toolbox. This side panel automatically loads shapes specific to your diagram type. For sequence maps, it serves up system actors, vertical lifelines, activation blocks, and logical loop fragments.\n\nMissing something? Copy-paste it from another diagram type.',
  },
  {
    target: '#properties-panel', placement: 'right',
    title: 'Manage Properties',
    body: 'Click a lifeline or message link to edit text configurations. Use this panel to name your system actors or toggle message connector styles between synchronous requests and reply links.',
    // Open an example lifeline's properties panel on enter; clear it on leave. UI state only.
    // Prefer a Participant/Actor (a lifeline) over an activation/fragment overlay.
    onEnter: (m) => { const els = m.graph?.getElements?.() || []; const el = els.find(e => e.get('type') === 'sf.SequenceParticipant' || e.get('type') === 'sf.SequenceActor') || els[0]; if (el) m.selection?.selectOnly?.(el); },
    onLeave: (m) => m.selection?.clearSelection?.(),
  },
  {
    target: '#canvas-container', placement: 'center',
    title: 'Time to Build!',
    body: 'Pro-tip for fast workflows:\n- {{mod}} + A to select all elements or hold Shift and drag mouse to select part of them\n- {{mod}} + C / V to copy and paste\n- {{mod}} + Z reverts not-so-great decisions\nFind more shortcuts [here](https://github.com/MateuszDabrowski/diagramforce/tree/main#keyboard-shortcuts).\n\nTime to build!',
  },
];

const GANTT_TOUR = [
  {
    target: '#canvas-container', placement: 'center',
    title: 'Welcome to Gantt Charts',
    body: 'Here you can build project timelines, track delivery phases, and map milestones across a clean chronological schedule.\n\nLet’s do a quick 60-second tour of the key tools.\n\nIn a rush? Hit skip. You can always jump right back into this walkthrough by clicking the {{help}} Help icon in the top toolbar.',
  },
  {
    targets: ['#btn-save', '#btn-load'], placement: 'below-start',
    title: 'Save & Load Models',
    body: 'Keep your schemas safe. Export your configuration as a compact native JSON file for version control, share diagram copy with team members via URL hashes, or generate a clean PNG snapshot for your technical documentation.\n\nYou can also use [LLM Spec](https://github.com/MateuszDabrowski/diagramforce/blob/main/DIAGRAM_JSON_SPEC.md) to generate draft timelines and load them.',
  },
  {
    target: '#btn-display', placement: 'below-start',
    title: 'Context-Aware Display',
    body: 'The Display menu dynamically changes based on your active diagram type. Use it to manage visibility of Task Assignees and Task Progress indicators and control the timelines.',
  },
  {
    target: '#stencil-panel', placement: 'left',
    title: 'Dedicated Gantt Stencil',
    body: 'Your canvas toolbox. This side panel automatically loads shapes specific to your diagram type. For project tracking, it serves up timelines, clean task blocks, milestones, and phase grouping rows.\n\nMissing something? Copy-paste it from another diagram type.',
  },
  {
    target: '#properties-panel', placement: 'right',
    title: 'Manage Properties',
    body: 'Click a task block or milestone to manage timeline metadata. Use this panel to adjust start/end dates, track completion percentages, color-code tracks, and assign task owners.',
    // Open an example task's properties panel on enter; clear it on leave. UI state only.
    // Prefer a task/milestone over the timeline frame itself.
    onEnter: (m) => { const els = m.graph?.getElements?.() || []; const el = els.find(e => e.get('type') === 'sf.GanttTask') || els.find(e => e.get('type') === 'sf.GanttMilestone') || els.find(e => e.get('type') !== 'sf.GanttTimeline') || els[0]; if (el) m.selection?.selectOnly?.(el); },
    onLeave: (m) => m.selection?.clearSelection?.(),
  },
  {
    target: '#canvas-container', placement: 'center',
    title: 'Time to Build!',
    body: 'Pro-tip for fast workflows:\n- {{mod}} + A to select all elements or hold Shift and drag mouse to select part of them\n- {{mod}} + C / V to copy and paste\n- {{mod}} + Z reverts not-so-great decisions\nFind more shortcuts [here](https://github.com/MateuszDabrowski/diagramforce/tree/main#keyboard-shortcuts).\n\nTime to build!',
  },
];

const ORG_TOUR = [
  {
    target: '#canvas-container', placement: 'center',
    title: 'Welcome to Org Charts',
    body: 'Here you can design reporting hierarchies, structure team rollups, and RACI matrices for tasks.\n\nLet’s do a quick 60-second tour of the key tools.\n\nIn a rush? Hit skip. You can always jump right back into this walkthrough by clicking the {{help}} Help icon in the top toolbar.',
  },
  {
    targets: ['#btn-save', '#btn-load'], placement: 'below-start',
    title: 'Save & Load Models',
    body: 'Keep your schemas safe. Export your configuration as a compact native JSON file for version control, share diagram copy with team members via URL hashes, or generate a clean PNG snapshot for your technical documentation.\n\nYou can also use [LLM Spec](https://github.com/MateuszDabrowski/diagramforce/blob/main/DIAGRAM_JSON_SPEC.md) to generate draft org charts and load them.',
  },
  {
    target: '#btn-display', placement: 'below-start',
    title: 'Context-Aware Display',
    body: 'The Display menu dynamically changes based on your active diagram type. Use it to auto-layout your org chart, or activate focus dimming to cleanly trace specific reporting trees.',
  },
  {
    target: '#stencil-panel', placement: 'left',
    title: 'Dedicated Org Chart Stencil',
    body: 'Your canvas toolbox. This side panel automatically loads shapes specific to your diagram type. For organizational mapping, it serves up person cards, department and team groups and task lanes for RACI tracking.\n\nMissing something? Copy-paste it from another diagram type.',
  },
  {
    target: '#properties-panel', placement: 'right',
    title: 'Manage Properties',
    body: 'Click a role card or connection link to manage positional metadata. Use this panel to change names, assign job titles, control level of personal details, or manage RACI roles.',
    // Open an example role card's properties panel on enter; clear it on leave. UI state only.
    // Prefer an OrgPerson (role card) over a surrounding Department/Team group.
    onEnter: (m) => { const els = m.graph?.getElements?.() || []; const el = els.find(e => e.get('type') === 'sf.OrgPerson') || els.find(e => e.get('type') !== 'sf.Zone' && e.get('type') !== 'sf.Container') || els[0]; if (el) m.selection?.selectOnly?.(el); },
    onLeave: (m) => m.selection?.clearSelection?.(),
  },
  {
    target: '#canvas-container', placement: 'center',
    title: 'Time to Build!',
    body: 'Pro-tip for fast workflows:\n- {{mod}} + A to select all elements or hold Shift and drag mouse to select part of them\n- {{mod}} + C / V to copy and paste\n- {{mod}} + Z reverts not-so-great decisions\nFind more shortcuts [here](https://github.com/MateuszDabrowski/diagramforce/tree/main#keyboard-shortcuts).\n\nTime to build!',
  },
];

// Minimal fallback for diagram types without a bespoke tour yet.
const GENERIC_TOUR = [
  {
    target: '#canvas-container', placement: 'center',
    title: 'Quick Tour',
    body: 'Drag shapes from the stencil on the right onto the canvas, connect them, and tune anything in the properties panel on the left. A dedicated walkthrough for this diagram type is on the way — for now, the {{help}} **Help** icon brings you back here anytime.',
  },
];

const TOURS = { architecture: ARCHITECTURE_TOUR, process: PROCESS_TOUR, sequence: SEQUENCE_TOUR, gantt: GANTT_TOUR, org: ORG_TOUR, datamapping: DATAMAPPING_TOUR, datamodel: DATAMODEL_TOUR };

// ── Init / public API ─────────────────────────────────────────────────────────
export function init(_modules) {
  modules = _modules;
  document.getElementById('btn-help')?.addEventListener('click', () => start());
}

export function isActive() { return !!activeTour; }

/** Start the tour for the ACTIVE diagram type (the single source of truth). */
export function start() {
  if (activeTour) return;                                   // already running
  const type = modules?.tabs?.getActiveTabType?.() || '';
  runTour(TOURS[type] || GENERIC_TOUR);
}

// ── First-visit welcome splash ────────────────────────────────────────────────
export function maybeShowWelcomeSplash() {
  let shown = 'true';
  try { shown = localStorage.getItem(FIRST_VISIT_KEY); } catch { /* private mode → behave as already-shown */ return; }
  if (shown) return;
  // Defer slightly so the canvas + tabs finish their first paint behind the splash.
  setTimeout(showWelcomeSplash, 350);
}

function showWelcomeSplash() {
  const body = renderBody('Ready to design clean models? Each diagram type (Architecture, Data Model, Data Mapping, Process, Sequence, Gantt Chart, Org Chart) includes its own dedicated interactive walkthrough.\n\nYou can trigger a quick 60-second tour anytime by clicking the {{help}} **Help** icon in the top toolbar.');
  const { close } = buildModal({
    title: 'Welcome to Diagramforce',
    className: 'sf-welcome-modal',
    dialogClass: 'sf-welcome-modal__dialog',
    bodyHtml: `<p class="sf-welcome__text">${body}</p>`,
    footerHtml: '<button type="button" class="sf-modal__btn sf-modal__btn--primary sf-welcome__ok">Got it!</button>',
    // Any dismissal (button / ✕ / backdrop / Escape) commits the flag, so it never reappears.
    onClose: () => { try { localStorage.setItem(FIRST_VISIT_KEY, 'true'); } catch { /* ignore */ } },
  });
  document.querySelector('.sf-welcome__ok')?.addEventListener('click', () => close());
}

// ── Tour runtime ────────────────────────────────────────────────────────────
function runTour(steps) {
  const overlay = document.createElement('div');
  overlay.className = 'sf-tour';
  overlay.innerHTML = `
    <div class="sf-tour__catcher"></div>
    <div class="sf-tour__spotlight" hidden></div>
    <div class="sf-tour__card" role="dialog" aria-modal="true" aria-labelledby="sf-tour-title" tabindex="-1">
      <button type="button" class="sf-tour__close" aria-label="Close walkthrough">✕</button>
      <h2 id="sf-tour-title" class="sf-tour__title"></h2>
      <div class="sf-tour__body"></div>
      <div class="sf-tour__footer">
        <button type="button" class="sf-modal__btn sf-tour__skip">Skip</button>
        <span class="sf-tour__count" aria-live="polite"></span>
        <span class="sf-tour__nav">
          <button type="button" class="sf-modal__btn sf-tour__back">Back</button>
          <button type="button" class="sf-modal__btn sf-modal__btn--primary sf-tour__next">Next</button>
        </span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const els = {
    catcher: overlay.querySelector('.sf-tour__catcher'),
    spot: overlay.querySelector('.sf-tour__spotlight'),
    card: overlay.querySelector('.sf-tour__card'),
    title: overlay.querySelector('.sf-tour__title'),
    body: overlay.querySelector('.sf-tour__body'),
    count: overlay.querySelector('.sf-tour__count'),
    back: overlay.querySelector('.sf-tour__back'),
    next: overlay.querySelector('.sf-tour__next'),
    skip: overlay.querySelector('.sf-tour__skip'),
    closeBtn: overlay.querySelector('.sf-tour__close'),
  };

  const release = trapFocus(els.card, { onEscape: end });
  // `entered` tracks which step's onEnter has fired (so onLeave pairs correctly, incl. on end()).
  activeTour = { steps, index: 0, entered: -1, overlay, els, release };

  els.next.addEventListener('click', () => go(1));
  els.back.addEventListener('click', () => go(-1));
  els.skip.addEventListener('click', end);
  els.closeBtn.addEventListener('click', end);
  els.card.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });
  window.addEventListener('resize', reflow);

  render();

  function go(delta) {
    const ni = activeTour.index + delta;
    if (ni < 0) return;
    if (ni >= steps.length) { end(); return; }
    activeTour.index = ni;
    render();
  }

  function render() {
    const i = activeTour.index, step = steps[i], last = i === steps.length - 1;
    // Fire onLeave for the previously-entered step, then onEnter for this one — BEFORE reflow
    // so a step that reveals its target (e.g. opening the properties panel) is measured live.
    if (activeTour.entered !== i) {
      try { steps[activeTour.entered]?.onLeave?.(modules); } catch { /* hooks are best-effort */ }
      activeTour.entered = i;
      try { step.onEnter?.(modules); } catch { /* hooks are best-effort */ }
    }
    els.title.textContent = step.title;
    els.body.innerHTML = renderBody(step.body);
    els.count.textContent = `${i + 1} / ${steps.length}`;
    els.back.style.display = i === 0 ? 'none' : '';   // no Back on the first step
    els.skip.style.display = last ? 'none' : '';       // no Skip on the last step
    els.next.textContent = last ? 'Finish' : 'Next';
    reflow();
    // Re-measure after layout settles (panel reveal/animation), then focus the primary action
    // so keyboard users land inside the trapped card.
    requestAnimationFrame(() => { reflow(); els.next.focus({ preventScroll: true }); });
    // A step whose onEnter reveals an animated panel (e.g. the properties panel slides in
    // over ~400ms) needs reflow again once the transition settles — sync/rAF reflow measured
    // it mid-slide. Re-measure at a few points, guarded to the still-active step.
    if (step.onEnter) [120, 300, 460].forEach((ms) => setTimeout(() => {
      if (activeTour && activeTour.index === i) reflow();
    }, ms));
  }

  // Position the spotlight + card for the current step (called on render + resize).
  function reflow() {
    const step = steps[activeTour.index];
    const rect = resolveTargetRect(step);
    if (rect) {
      // Spotlight cutout (its box-shadow dims the rest); catcher stays transparent.
      const pad = 6;
      Object.assign(els.spot.style, {
        left: `${rect.left - pad}px`, top: `${rect.top - pad}px`,
        width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px`,
      });
      els.spot.hidden = false;
      els.catcher.classList.remove('sf-tour__catcher--dim');
      positionCard(els.card, rect, step.placement);
    } else {
      // No (visible) target → centre the card and dim via the catcher instead.
      els.spot.hidden = true;
      els.catcher.classList.add('sf-tour__catcher--dim');
      positionCard(els.card, null, 'center');
    }
  }

  // Resolve the highlighted region: a single `target` selector, or the union of several
  // `targets` (e.g. Save + Load share one spotlight). Returns null for centred steps or
  // when nothing visible is found, so the card falls back to centre + catcher dim.
  function resolveTargetRect(step) {
    if (step.placement === 'center') return null;
    const sels = step.targets || (step.target ? [step.target] : []);
    let u = null;
    for (const sel of sels) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      const vis = r && r.width > 0 && r.height > 0
        && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      if (!vis) continue;
      u = u
        ? { left: Math.min(u.left, r.left), top: Math.min(u.top, r.top),
            right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom) }
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    if (!u) return null;
    return { left: u.left, top: u.top, width: u.right - u.left, height: u.bottom - u.top,
             right: u.right, bottom: u.bottom };
  }

  function end() {
    if (!activeTour) return;
    // Fire the current step's onLeave (e.g. clear the example selection) before tearing down.
    try { steps[activeTour.entered]?.onLeave?.(modules); } catch { /* hooks are best-effort */ }
    window.removeEventListener('resize', reflow);
    release();
    overlay.remove();
    activeTour = null;
  }
}

// Place the card relative to the target rect (or viewport-centre when none), clamped to
// the viewport with a margin so it never spills off-screen (no layout shift on the page).
function positionCard(card, rect, placement) {
  const M = 16, GAP = 14;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  const vw = innerWidth, vh = innerHeight;
  let left, top;
  if (!rect || placement === 'center') {
    left = (vw - cw) / 2; top = (vh - ch) / 2;
  } else if (placement === 'below' || placement === 'below-start') {
    top = rect.bottom + GAP;
    left = placement === 'below-start' ? rect.left : rect.left + rect.width / 2 - cw / 2;
  } else if (placement === 'above') {
    top = rect.top - ch - GAP;
    left = rect.left + rect.width / 2 - cw / 2;
  } else if (placement === 'left') {
    left = rect.left - cw - GAP;
    top = rect.top + rect.height / 2 - ch / 2;
  } else if (placement === 'right') {
    left = rect.right + GAP;
    top = rect.top + rect.height / 2 - ch / 2;
  } else if (placement === 'inside-top') {
    left = rect.left + rect.width / 2 - cw / 2;
    top = rect.top + GAP * 2;
  } else {
    left = (vw - cw) / 2; top = (vh - ch) / 2;
  }
  card.style.left = `${Math.round(Math.max(M, Math.min(left, vw - cw - M)))}px`;
  card.style.top = `${Math.round(Math.max(M, Math.min(top, vh - ch - M)))}px`;
}
