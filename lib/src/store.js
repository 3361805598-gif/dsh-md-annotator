// ── annotation store + shared pure helpers ──────────────────────────────
// Storage is per-activation (created in apply(), passed to the viewer via
// props) — no module-level singleton. Keys are `sessionId \0 path`; both the
// annotation list and the per-file panel prefs are bounded (LRU + per-key cap)
// so memory cannot grow without bound over a long multi-file session.

/**
 * @typedef {Object} Note
 * @property {number} v            schema version (1)
 * @property {string} id           unique note id
 * @property {string} ref          versioned reference (v1:...)
 * @property {string} source       verbatim source text the note quotes
 * @property {number} start        1-based start line
 * @property {number} end          1-based end line (exclusive)
 * @property {string} kind         must | suggest | question
 * @property {string} note         the annotation text
 * @property {number} [selStart]   selection char offset within the content subtree
 * @property {number} [selEnd]     selection char offset (exclusive)
 * @property {string} [selText]    selected text
 * @property {boolean} [stale]     derived: ref no longer matches current source
 */

/**
 * @typedef {Object} Block
 * @property {string} type         heading|paragraph|code|quote|hr|table|list
 * @property {string} source       verbatim source text (list: joined raw lines)
 * @property {number} start        1-based start line
 * @property {number} end          1-based end line (exclusive)
 */

const KIND_LABELS = { must: "必须改", suggest: "建议改", question: "疑问" }
const KIND_ORDER = ["must", "suggest", "question"]
const DEFAULT_KIND = "suggest"

function kindLabel(kind) {
  return KIND_LABELS[kind] === undefined ? KIND_LABELS[DEFAULT_KIND] : KIND_LABELS[kind]
}

function storeKey(sessionId, path) {
  return String(sessionId === undefined || sessionId === null ? "" : sessionId) + "\u0000" + String(path === undefined || path === null ? "" : path)
}

function truncate(text, max) {
  const s = String(text)
  return s.length <= max ? s : s.slice(0, max) + "…"
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function newNoteId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return "n" + crypto.randomUUID()
  return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ── ref codec ────────────────────────────────────────────────────────────
// A note reference is a versioned, content-signed address:
//   block:  "v1:b:<blockIndex>:<sig8>"
//   item:   "v1:i:<blockIndex>:<itemIndex>:<sig8>"
// <sig8> is an 8-hex-char hash of the *context signature* (prev + self + next
// source), which lets us tell "the same block moved" from "a different block
// with identical text" after a file regeneration. Legacy refs ("i" or "i:j")
// are still decoded (version 0) and upgraded on write.

/** FNV-1a 32-bit over a UTF-16 string → 8 hex chars. */
function hashSource(str) {
  const s = String(str === undefined || str === null ? "" : str)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let hex = (h >>> 0).toString(16)
  while (hex.length < 8) hex = "0" + hex
  return hex.slice(0, 8)
}

function encodeRef(blockIndex, itemIndex, sig) {
  return itemIndex === undefined
    ? "v1:b:" + blockIndex + ":" + sig
    : "v1:i:" + blockIndex + ":" + itemIndex + ":" + sig
}

/** @returns {{version:number,kind:'b'|'i',index:number,item:number|undefined,sig:string|undefined}|null} */
function decodeRef(ref) {
  const s = String(ref === undefined || ref === null ? "" : ref)
  const parts = s.split(":")
  if (parts[0] === "v1") {
    if (parts[1] === "b" && parts.length === 4) {
      return { version: 1, kind: "b", index: Number(parts[2]), item: undefined, sig: parts[3] }
    }
    if (parts[1] === "i" && parts.length === 5) {
      return { version: 1, kind: "i", index: Number(parts[2]), item: Number(parts[3]), sig: parts[4] }
    }
    return null
  }
  if (parts.length === 1) return { version: 0, kind: "b", index: Number(parts[0]), item: undefined, sig: undefined }
  if (parts.length === 2) return { version: 0, kind: "i", index: Number(parts[0]), item: Number(parts[1]), sig: undefined }
  return null
}

function resolveSource(blocks, ref) {
  const d = decodeRef(ref)
  if (d === null) return undefined
  const block = blocks[d.index]
  if (block === undefined) return undefined
  if (d.kind === "i" && block.type === "list" && d.item !== undefined) {
    const item = block.items[d.item]
    return item === undefined ? undefined : item.source
  }
  return block.source
}

// ── context signatures + re-anchoring ────────────────────────────────────

function blockSigOf(blocks, i) {
  if (i < 0 || i >= blocks.length) return ""
  const b = blocks[i]
  if (b.type === "list") return b.source !== undefined ? b.source : b.items.map((it) => it.source).join("\n")
  return b.source === undefined ? "" : b.source
}

function contextSignature(blocks, index, itemIndex) {
  if (itemIndex !== undefined) {
    const blk = blocks[index]
    if (blk !== undefined && blk.type === "list") {
      const items = blk.items
      const prev = itemIndex > 0 ? items[itemIndex - 1].source : ""
      const cur = items[itemIndex] === undefined ? "" : items[itemIndex].source
      const next = itemIndex < items.length - 1 ? items[itemIndex + 1].source : ""
      return hashSource(prev + "\u0000" + cur + "\u0000" + next)
    }
    return ""
  }
  return hashSource(blockSigOf(blocks, index - 1) + "\u0000" + blockSigOf(blocks, index) + "\u0000" + blockSigOf(blocks, index + 1))
}

/** Precompute every block/item context signature once per blocks change. */
function buildRefIndex(blocks) {
  const blockSigs = new Array(blocks.length)
  const itemSigs = []
  for (let i = 0; i < blocks.length; i++) {
    blockSigs[i] = contextSignature(blocks, i)
    const b = blocks[i]
    if (b.type === "list") {
      const sigs = new Array(b.items.length)
      for (let j = 0; j < b.items.length; j++) sigs[j] = contextSignature(blocks, i, j)
      itemSigs[i] = sigs
    }
  }
  return { blockSigs, itemSigs }
}

/** Find the single block/item whose source and (when known) context signature
 *  match. Returns {ref,start,end} or null when zero or several candidates — a
 *  conservative choice that never silently mis-anchors to a duplicate. */
function locateBlockItem(blocks, source, sig, refIndex) {
  const candidates = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.type === "list") {
      for (let j = 0; j < b.items.length; j++) {
        if (b.items[j].source === source && (sig === undefined || refIndex.itemSigs[i][j] === sig)) {
          candidates.push({ ref: encodeRef(i, j, refIndex.itemSigs[i][j]), start: b.items[j].start, end: b.items[j].end })
        }
      }
    } else if (b.source === source && (sig === undefined || refIndex.blockSigs[i] === sig)) {
      candidates.push({ ref: encodeRef(i, undefined, refIndex.blockSigs[i]), start: b.start, end: b.end })
    }
  }
  return candidates.length === 1 ? candidates[0] : null
}

/** Context signature at the position addressed by a decoded ref. */
function sigAtRef(refIndex, d) {
  if (d.kind === "i" && refIndex.itemSigs[d.index] !== undefined) return refIndex.itemSigs[d.index][d.item]
  return refIndex.blockSigs[d.index]
}

/**
 * Re-anchor notes against freshly parsed blocks: the addressed index is
 * accepted only when BOTH the source matches AND (for versioned refs) the
 * context signature matches — so a duplicate that slid into the same index is
 * not silently accepted. On mismatch, relocate by (source + signature); fall
 * back to marking stale. Pure and idempotent.
 */
function reanchorNotes(blocks, notes, refIndex) {
  const index = refIndex === undefined ? buildRefIndex(blocks) : refIndex
  return notes.map((n) => {
    const d = decodeRef(n.ref)
    if (d === null) return Object.assign({}, n, { stale: true })
    if (resolveSource(blocks, n.ref) === n.source) {
      if (d.sig === undefined || sigAtRef(index, d) === d.sig) return Object.assign({}, n, { stale: false })
      // signature mismatch → a different (duplicate) block now sits here; fall through
    }
    const located = locateBlockItem(blocks, n.source, d.sig, index)
    if (located !== null) return Object.assign({}, n, { ref: located.ref, start: located.start, end: located.end, stale: false })
    return Object.assign({}, n, { stale: true })
  })
}

// ── bounded stores (factory pattern, one instance per activation) ────────

function createAnnotationStore(opts) {
  opts = opts || {}
  const maxKeys = opts.maxKeys || 100
  const maxPerKey = opts.maxPerKey || 500
  const maxNoteLen = opts.maxNoteLen || 2000
  const map = new Map() // key -> { notes, lastAccess }
  let tick = 0

  function get(sessionId, path) {
    const key = storeKey(sessionId, path)
    const rec = map.get(key)
    if (rec === undefined) return []
    rec.lastAccess = ++tick
    return rec.notes
  }
  function set(sessionId, path, notes) {
    const key = storeKey(sessionId, path)
    let bounded = notes
    if (notes.length > maxPerKey) {
      console.warn("[dsh-md-annotator] annotation limit reached (" + maxPerKey + "), truncating")
      bounded = notes.slice(0, maxPerKey)
    }
    bounded = bounded.map((n) => {
      const note = Object.assign({ v: 1 }, n)
      if (typeof note.note === "string" && note.note.length > maxNoteLen) note.note = note.note.slice(0, maxNoteLen)
      return note
    })
    map.set(key, { notes: bounded, lastAccess: ++tick })
    evict()
  }
  function clear(sessionId, path) {
    map.delete(storeKey(sessionId, path))
  }
  function evict() {
    while (map.size > maxKeys) {
      let oldestKey = null
      let oldest = Infinity
      map.forEach((rec, k) => { if (rec.lastAccess < oldest) { oldest = rec.lastAccess; oldestKey = k } })
      if (oldestKey === null) break
      map.delete(oldestKey)
    }
  }
  function clearAll() { map.clear() }
  function size() { return map.size }
  return { get, set, clear, clearAll, size }
}

function createPanelPrefsStore(opts) {
  opts = opts || {}
  const maxKeys = opts.maxKeys || 100
  const map = new Map()
  let tick = 0

  function get(sessionId, path) {
    const key = storeKey(sessionId, path)
    const rec = map.get(key)
    if (rec === undefined) return { open: false, barCollapsed: false }
    rec.lastAccess = ++tick
    return rec.prefs
  }
  function set(sessionId, path, prefs) {
    const key = storeKey(sessionId, path)
    map.set(key, { prefs, lastAccess: ++tick })
    while (map.size > maxKeys) {
      let oldestKey = null
      let oldest = Infinity
      map.forEach((rec, k) => { if (rec.lastAccess < oldest) { oldest = rec.lastAccess; oldestKey = k } })
      if (oldestKey === null) break
      map.delete(oldestKey)
    }
  }
  function clear(sessionId, path) { map.delete(storeKey(sessionId, path)) }
  function clearAll() { map.clear() }
  return { get, set, clear, clearAll }
}

// ── report formatting (pure, unit-testable) ──────────────────────────────

/**
 * @param {Object} opts
 * @param {Note[]} opts.notes
 * @param {string} [opts.prefix]
 * @param {string} opts.pathLabel     e.g. relative path
 * @param {(note:Note)=>string[]} opts.excerptOf  → excerpt lines
 * @param {(note:Note)=>boolean} opts.isStale
 */
function formatReport(opts) {
  const notes = opts.notes || []
  const prefix = opts.prefix
  const pathLabel = opts.pathLabel || ""
  const excerptOf = opts.excerptOf
  const isStale = opts.isStale
  const out = []
  if (typeof prefix === "string" && prefix.trim() !== "") {
    out.push(prefix.trim())
    out.push("")
  }
  let firstGroup = true
  KIND_ORDER.forEach((kindId) => {
    const group = notes.filter((n) => (typeof n.kind === "string" ? n.kind : DEFAULT_KIND) === kindId)
    if (group.length === 0) return
    if (!firstGroup) out.push("")
    out.push("【" + kindLabel(kindId) + "】")
    out.push("")
    group.forEach((n) => {
      out.push("File: " + pathLabel)
      out.push("Source: markdown")
      out.push("")
      const linesLabel = typeof n.start === "number" && typeof n.end === "number" && n.end > n.start
        ? "Lines " + n.start + "-" + n.end
        : "Line " + (typeof n.start === "number" ? n.start : "?")
      out.push(linesLabel)
      out.push("Excerpt:")
      excerptOf(n).forEach((l) => out.push("> " + l))
      out.push('User comment: "' + n.note + '"')
      if (isStale(n)) out.push("(注：该处内容可能已变化，请按原文定位)")
      out.push("")
    })
    firstGroup = false
  })
  while (out.length > 0 && out[out.length - 1] === "") out.pop()
  return out.join("\n")
}
