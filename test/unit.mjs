// Unit tests for the pure logic of dsh-md-annotator (no DOM required).
// Run from the package root: `node test/unit.mjs`
import { strict as assert } from "node:assert"

globalThis.window = {
  __ModuleLoader__: { load(handoff) { globalThis.__handoff = handoff } }
}
await import(new URL("../lib/client.js", import.meta.url).href)

const stubRequire = (spec) => {
  if (spec === "react") {
    return {
      createElement: (type, props, ...children) => ({ type, props, children }),
      Fragment: "Fragment",
      Component: class {},
      memo: (c) => c,
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      useState: (init) => [typeof init === "function" ? init() : init, () => {}],
      useRef: (init) => ({ current: init }),
      useEffect: () => {}
    }
  }
  throw new Error("unexpected require: " + spec)
}

const T = globalThis.__handoff.factory(stubRequire)._test

// ── parseBlocks ──────────────────────────────────────────────────────────
{
  const b = T.parseBlocks("a|b\n---")
  assert.deepEqual(b.map((x) => x.type), ["paragraph", "hr"], "a|b\\n--- must not parse as table")
  assert.equal(b[0].source, "a|b")
}

{
  const b = T.parseBlocks("| A | B |\n|---|---|\n| 1 | 2 |")
  assert.equal(b[0].type, "table")
  assert.equal(b[0].source, "| A | B |\n|---|---|\n| 1 | 2 |")
}

{
  const b = T.parseBlocks("- a\n      code\n- b")
  assert.equal(b[0].type, "list")
  assert.equal(b[0].items[0].source, "a\n      code", "continuation indentation preserved")
  assert.equal(b[0].items[0].end, 2)
}

{
  const b = T.parseBlocks("```js\nconst a = 1\n```\nnext")
  assert.equal(b[0].type, "code")
  assert.equal(b[0].lang, "js")
  assert.equal(b[0].source, "const a = 1")
  assert.equal(b[1].type, "paragraph")
}

// ── renderInline ────────────────────────────────────────────────────────
{
  assert.equal(T.renderInline(""), null)
  assert.equal(T.renderInline(null), null)
  const plain = T.renderInline("hello")
  assert.deepEqual(plain, ["hello"])
  const mixed = T.renderInline("a `code` b")
  assert.equal(mixed[0], "a ")
  assert.equal(mixed[1].type, "code")
  assert.equal(mixed[1].children[0], "code")
  assert.equal(mixed[2], " b")
  assert.equal(T.renderInline("**bold**")[0].type, "strong")
  assert.equal(T.renderInline("*em*")[0].type, "em")
  assert.equal(T.renderInline("~~del~~")[0].type, "del")
  const link = T.renderInline("[label](http://x)")[0]
  assert.equal(link.type, "a")
  assert.equal(link.props.href, "http://x")
  const bold = T.renderInline("x **bold** y")
  assert.equal(bold[0], "x ")
  assert.equal(bold[1].type, "strong")
  assert.equal(bold[2], " y")
}

// ── parseTable ──────────────────────────────────────────────────────────
{
  const t = T.parseTable("| A | B |\n|---|---|\n| 1 | 2 |")
  assert.deepEqual(t.header, ["A", "B"])
  assert.deepEqual(t.body, [["1", "2"]])
  const empty = T.parseTable("A | B\n---|---")
  assert.deepEqual(empty.header, ["A", "B"])
  assert.deepEqual(empty.body, [])
}

// ── ref codec + resolveSource ───────────────────────────────────────────
{
  assert.equal(T.encodeRef(3, undefined, "abcd1234"), "v1:b:3:abcd1234")
  assert.equal(T.encodeRef(3, 2, "abcd1234"), "v1:i:3:2:abcd1234")
  assert.deepEqual(T.decodeRef("v1:b:3:abcd1234"), { version: 1, kind: "b", index: 3, item: undefined, sig: "abcd1234" })
  assert.deepEqual(T.decodeRef("v1:i:3:2:abcd1234"), { version: 1, kind: "i", index: 3, item: 2, sig: "abcd1234" })
  assert.deepEqual(T.decodeRef("5"), { version: 0, kind: "b", index: 5, item: undefined, sig: undefined })
  assert.deepEqual(T.decodeRef("3:1"), { version: 0, kind: "i", index: 3, item: 1, sig: undefined })
  assert.equal(T.decodeRef("x:y:z:w:q"), null)

  const blocks = [
    { type: "paragraph", source: "p", start: 1, end: 1 },
    { type: "list", ordered: false, source: "raw", items: [{ source: "i0", start: 2, end: 2 }, { source: "i1", start: 3, end: 3 }], start: 2, end: 3 }
  ]
  assert.equal(T.resolveSource(blocks, "v1:b:0:xx"), "p")
  assert.equal(T.resolveSource(blocks, "v1:i:1:1:xx"), "i1")
  assert.equal(T.resolveSource(blocks, "1:0"), "i0")
  assert.equal(T.resolveSource(blocks, "0"), "p")
  assert.equal(T.resolveSource(blocks, "99"), undefined)
}

// ── hashSource ──────────────────────────────────────────────────────────
{
  const h = T.hashSource("hello")
  assert.match(h, /^[0-9a-f]{8}$/)
  assert.equal(h, T.hashSource("hello"))
  assert.notEqual(h, T.hashSource("hello!"))
}

// ── reanchorNotes ───────────────────────────────────────────────────────
{
  const mkBlock = (source, i) => ({ type: "paragraph", source, start: i, end: i })
  const mkNote = (index, sig, source, line) => ({ v: 1, id: "n", ref: T.encodeRef(index, undefined, sig), source, start: line, end: line, kind: "suggest", note: "x" })

  // unchanged: source matches at index → not stale, ref unchanged
  const blocks = [mkBlock("a", 1), mkBlock("b", 2)]
  const idx = T.buildRefIndex(blocks)
  const note = mkNote(0, idx.blockSigs[0], "a", 1)
  const out = T.reanchorNotes(blocks, [note], idx)
  assert.equal(out[0].stale, false)
  assert.equal(out[0].ref, note.ref)

  // moved unique source: insert a block before it, re-anchor by source+sig
  const moved = [mkBlock("x", 1), mkBlock("a", 2), mkBlock("b", 3)]
  const noteB = mkNote(1, idx.blockSigs[1], "b", 2)
  const outB = T.reanchorNotes(moved, [noteB], T.buildRefIndex(moved))
  assert.equal(outB[0].stale, false)
  assert.equal(T.decodeRef(outB[0].ref).index, 2)
  assert.equal(outB[0].start, 3)

  // duplicate text: a shifted duplicate must NOT be silently accepted
  const orig = [mkBlock("dup", 1), mkBlock("dup", 2), mkBlock("tail", 3)]
  const origIdx = T.buildRefIndex(orig)
  const noteDup = mkNote(1, origIdx.blockSigs[1], "dup", 2)
  const shifted = [mkBlock("head", 1), mkBlock("dup", 2), mkBlock("dup", 3), mkBlock("tail", 4)]
  const outDup = T.reanchorNotes(shifted, [noteDup], T.buildRefIndex(shifted))
  assert.equal(outDup[0].stale, false)
  assert.equal(T.decodeRef(outDup[0].ref).index, 2, "re-anchored to the correct duplicate")
  assert.equal(outDup[0].start, 3)

  // source gone entirely → conservative stale
  const gone = [mkBlock("something", 1)]
  const noteGone = { v: 1, id: "n", ref: T.encodeRef(0, undefined, "deadbeef"), source: "gone", start: 1, end: 1, kind: "suggest", note: "x" }
  assert.equal(T.reanchorNotes(gone, [noteGone])[0].stale, true)

  // legacy ref (no sig): source match at index is accepted as-is
  const legacy = { v: 1, id: "n", ref: "1", source: "b", start: 2, end: 2, kind: "suggest", note: "x" }
  assert.equal(T.reanchorNotes(blocks, [legacy], idx)[0].stale, false)
}

// ── formatReport ────────────────────────────────────────────────────────
{
  const notes = [
    { id: "1", kind: "must", source: "原文一", start: 1, end: 2, note: "改这里", stale: false },
    { id: "2", kind: "suggest", source: "原文二", start: 3, end: 3, note: "建议", stale: true }
  ]
  const report = T.formatReport({
    notes,
    prefix: "请逐项修改",
    pathLabel: "docs/a.md",
    excerptOf: (n) => n.source.split("\n"),
    isStale: (n) => n.stale === true
  })
  assert.ok(report.indexOf("请逐项修改") === 0, "prefix first")
  assert.ok(report.includes("【必须改】"))
  assert.ok(report.includes("【建议改】"))
  assert.ok(report.includes("File: docs/a.md"))
  assert.ok(report.includes("Lines 1-2"))
  assert.ok(report.includes('User comment: "改这里"'))
  assert.ok(report.includes("(注：该处内容可能已变化，请按原文定位)"), "stale note flagged")
}

// ── bounded stores ──────────────────────────────────────────────────────
{
  const st = T.createAnnotationStore({ maxPerKey: 3, maxKeys: 2 })
  const mk = (id) => ({ v: 1, id, ref: "r", source: "s", start: 1, end: 1, kind: "suggest", note: "n" })
  st.set("s", "a", [mk("1"), mk("2"), mk("3"), mk("4")])
  assert.equal(st.get("s", "a").length, 3, "per-key cap truncates")
  st.set("s", "b", [mk("5")])
  st.get("s", "a") // bump a's last access
  st.set("s", "c", [mk("6")])
  assert.equal(st.get("s", "a").length, 3)
  assert.equal(st.get("s", "b").length, 0, "LRU evicted the least-recently-used key")
  assert.equal(st.get("s", "c").length, 1)
  st.clear("s", "a")
  assert.equal(st.get("s", "a").length, 0, "clear deletes the key")

  const st2 = T.createAnnotationStore({ maxNoteLen: 5 })
  st2.set("s", "p", [{ v: 1, id: "1", ref: "r", source: "s", start: 1, end: 1, kind: "suggest", note: "123456789" }])
  assert.equal(st2.get("s", "p")[0].note, "12345", "note length truncated")
}

// ── misc utils ──────────────────────────────────────────────────────────
{
  assert.equal(T.storeKey("s", "p"), "s\u0000p")
  assert.equal(T.storeKey(undefined, undefined), "\u0000")
  assert.equal(T.clamp(5, 0, 10), 5)
  assert.equal(T.clamp(-5, 0, 10), 0)
  assert.equal(T.clamp(99, 0, 10), 10)
  assert.equal(T.truncate("hello", 3), "hel…")
  assert.equal(T.truncate("hi", 5), "hi")
}

console.log("unit OK")
