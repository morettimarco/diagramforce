# Diagramforce

Free browser-based visual diagramming tool for Salesforce architects and consultants. Create architecture diagrams, data models, process flows, org charts, Gantt charts, and UML sequence diagrams — all in your browser, with no account, no backend, and no data leaving your machine.

**[diagramforce.mateuszdabrowski.pl](https://diagramforce.mateuszdabrowski.pl)**

## Features

### Diagram types

- **Architecture Diagrams** — Map system landscape, integrations, and Salesforce clouds with 1700+ SLDS icons
- **Data Model Diagrams** — Define objects, fields, and relationships with ER notation (crow's foot, one, zero-or-one, etc.)
- **Process Diagrams** — Design business processes with BPMN and flowchart shapes
- **Organisation Charts** — Document team hierarchy with person cards, departments, and teams
- **Gantt Charts** — Plan project timelines with tasks, milestones, phases, and dependencies
- **Sequence Diagrams** — UML sequence diagrams with participants, actors, activation boxes, and alt/loop fragments; reply-style messages default to dashed

### Editing & layout

- **Smart Node Layout** — Content auto-centers based on what's set: text-only, icon + text, or description layout
- **Auto-Sizing parents** — Containers, Zones, BPMN Pools and other parent shapes auto-grow *and* auto-shrink to keep one grid dot of padding below the lowest embedded child. Toggle off in Display menu if you want manual control
- **Smart shape conversions** — Convert between Node / Container / Icon and the new shape stays embedded in its previous parent whenever the embedding rules allow it
- **Multi-select** — Cmd/Ctrl+click *or* Shift+click; Shift+drag on blank canvas for rubber-band selection
- **Resize Guides** — Tracking lines extend from resized edges for easy alignment
- **Multi-tab** — Work on multiple diagrams simultaneously with independent undo/redo per tab
- **Single-step undo for drags** — A continuous drag is one undo command, not one per pixel
- **Dark / Light Theme** — Full theme support with Salesforce-aligned brand colours

### Persistence & sharing

- **No Backend** — Everything runs client-side; your diagrams never leave your browser
- **Offline-capable** — Service worker caches the app shell + every runtime library; after first load, refresh in airplane mode and the app boots from cache
- **Export** — Save to browser (90-day local storage), export as JSON / PNG / WEBP / animated GIF, share via copyable URL
- **Mermaid Import (beta)** — Paste mermaid.js source (`graph` / `flowchart` / `stateDiagram` → Process, `erDiagram` → Data Model, `sequenceDiagram` → Sequence) and convert into a native diagramforce diagram with auto-layout
- **Fit to Content** — Automatically fits viewport when loading shared or saved diagrams

## Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| Undo | Cmd/Ctrl + Z |
| Redo | Cmd/Ctrl + Shift + Z |
| Copy | Cmd/Ctrl + C |
| Paste | Cmd/Ctrl + V |
| Duplicate | Cmd/Ctrl + D |
| Select all | Cmd/Ctrl + A |
| Delete | Delete / Backspace |
| Multi-select | Cmd/Ctrl + Click *or* Shift + Click |
| Rubber-band select | Shift + Drag (on blank canvas) |
| Zoom in / out | Cmd/Ctrl + +/- or scroll |
| Fit to screen | Ctrl + 0 |

## Tech stack

| Layer | Technology |
|-------|-----------|
| Diagramming | [JointJS v4](https://www.jointjs.com/) (vendored, same-origin) |
| UI design system | [Salesforce Lightning Design System v2.29](https://www.lightningdesignsystem.com/) — sprites self-hosted |
| Compression | pako (vendored) for share-URL deflate |
| Animated export | gifenc (vendored) for GIF export |
| Code | Vanilla JavaScript with ES modules — no framework, no bundler, no build step |
| Styling | CSS custom properties with theme switching |
| Offline | Service worker with `APP_VERSION`-keyed cache |

All third-party libraries are vendored under `assets/vendor/` and served same-origin — no CDN runtime dependency.

## Project structure

```
index.html              Single-page entry point
sw.js                   Service worker (offline cache, APP_VERSION-keyed)
css/                    Modular stylesheets (variables, theme, layout, components, modals)
js/
  app.js                Entry point — initialises all modules, registers SW
  canvas.js             JointJS paper, pan/zoom, grid, auto-layout, sfManhattan router,
                        SimpleNode layout, line-style overlays, parent auto-fit
  shapes.js             Custom JointJS shape definitions (sf.* namespace)
  templates.js          Pre-built Salesforce component templates, stencil categories
  stencil.js            Stencil panel with drag-to-canvas drop
  properties.js         Property inspector, ER marker picker, type-conversion helpers
  selection.js          Multi-select, rubber-band, resize tracking lines, alignment
  tabs.js               Multi-diagram tab management with per-tab history + viewport
  toolbar.js            Toolbar event wiring, Save/Load/Display modals
  persistence.js        Save/load, JSON/PNG/WEBP/GIF export, URL sharing, versioning
  history.js            Undo/redo with drag-aware merge (continuous events → one command)
  clipboard.js          Copy/paste/duplicate with link-aware cloning
  keyboard.js           Keyboard shortcut manager
  theme.js              Theme toggle (persisted in localStorage)
  icons.js              SLDS icon registry, data URI generation
  image-component.js    sf.Image upload UX and detection
  share-codec.js        Versioned share-URL codec (compression + key dictionary)
  mermaid-import.js     Mermaid → diagramforce converter, hierarchical layout
assets/
  icons/                SLDS SVG sprite files (self-hosted)
  vendor/               JointJS, pako, gifenc (vendored same-origin)
DIAGRAM_JSON_SPEC.md    LLM-facing JSON specification
```

## LLM diagram generation

[`DIAGRAM_JSON_SPEC.md`](DIAGRAM_JSON_SPEC.md) documents the complete JSON structure for all diagram types. Feed it to any LLM (e.g. Claude) and ask it to generate a diagram JSON for a specific architecture, data model, process flow, etc. The output can be imported directly via *Load → Paste JSON* (or *Load → Load from JSON* for a file).

## Browser support

Tested in Chrome, Vivaldi, and Safari. Service worker requires a Service-Worker-capable browser (all modern desktop browsers).

## License

This work is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

## Author

[Mateusz Dąbrowski](https://www.linkedin.com/in/mateusz-dabrowski-pl/)
[mateuszdabrowski.pl](https://mateuszdabrowski.pl)
