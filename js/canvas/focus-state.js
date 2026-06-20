// Transient field-level focus state for Data Mapping flow tracing.
//
// Field-row dimming is applied as a CSS class on the per-field `.do-field-row` groups,
// but DataObjectView._renderFieldRows() rebuilds those groups on every re-render (field
// edit, label toggle, link add → port sync, resize …), which would wipe the classes.
// So selection.js records the currently-dimmed field keys here and the view re-asserts
// them on each render. This is pure UI state — never persisted, never in history.
//
// `dimmed`: a Set of "objectId::fid" keys that should render faded, or null when no flow
// focus is active.
export const fieldFocus = { dimmed: null };
