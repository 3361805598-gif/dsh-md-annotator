// ── floating panel geometry ─────────────────────────────────────────────
// Single source of truth for the panel's default/min size and viewport
// clamping, replacing five scattered copies of the same magic numbers.

const PANEL_DEFAULTS = { w: 360, h: 300 }
const PANEL_MIN = { w: 240, h: 160 }
const PANEL_MARGIN = { x: 8, y: 8, keepX: 160, keepY: 48 }

/** Clamp a panel's x/y/w/h back into the viewport, mutating a fresh copy. */
function clampPanel(prefs, vw, vh) {
  const x = clamp(typeof prefs.x === "number" ? prefs.x : PANEL_MARGIN.x, PANEL_MARGIN.x, Math.max(PANEL_MARGIN.x, vw - PANEL_MARGIN.keepX))
  const y = clamp(typeof prefs.y === "number" ? prefs.y : PANEL_MARGIN.y, PANEL_MARGIN.y, Math.max(PANEL_MARGIN.y, vh - PANEL_MARGIN.keepY))
  const w = clamp(typeof prefs.w === "number" ? prefs.w : PANEL_DEFAULTS.w, PANEL_MIN.w, Math.max(PANEL_MIN.w, vw - x - PANEL_MARGIN.x))
  const h = clamp(typeof prefs.h === "number" ? prefs.h : PANEL_DEFAULTS.h, PANEL_MIN.h, Math.max(PANEL_MIN.h, vh - y - PANEL_MARGIN.y))
  return Object.assign({}, prefs, { x, y, w, h })
}
