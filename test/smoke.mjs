// Smoke test: materialize the client factory under Node with a stub
// require("react") and exercise the markdown block parser + plugin exports.
// Run from the package root: `node test/smoke.mjs`
import { strict as assert } from "node:assert"

// The bundle registers through window.__ModuleLoader__.load at load time.
globalThis.window = {
  __ModuleLoader__: { load(handoff) { globalThis.__handoff = handoff } }
}
await import(new URL("../lib/client.js", import.meta.url).href)

const handoff = globalThis.__handoff
assert.ok(handoff, "factory handoff registered")
assert.equal(handoff.id, "dsh-md-annotator")

const stubRequire = (spec) => {
  if (spec === "react") return { createElement: (type, props, ...children) => ({ type, props, children }) }
  throw new Error("unexpected require: " + spec)
}

const mod = handoff.factory(stubRequire)
assert.equal(typeof mod.apply, "function", "apply exported")
assert.ok(Array.isArray(mod.inject) && mod.inject.includes("betterSidebar"), "inject declares betterSidebar")

const { parseBlocks } = mod._test
const sample = [
  "# 一级标题",
  "",
  "一段 **加粗** 文字，还有 `code` 与 [链接](https://example.com)。",
  "",
  "- 第一项",
  "- 第二项",
  "",
  "```js",
  "const a = 1",
  "```",
  "",
  "> 引用内容",
  "",
  "| A | B |",
  "|---|---|",
  "| 1 | 2 |"
].join("\n")

const blocks = parseBlocks(sample)
const kinds = blocks.map((b) => b.type)
assert.deepEqual(kinds, ["heading", "paragraph", "list", "code", "quote", "table"],
  "block kinds: " + JSON.stringify(kinds))
assert.equal(blocks[0].level, 1)
assert.equal(blocks[0].source, "一级标题")
assert.equal(blocks[0].start, 1)
assert.equal(blocks[0].end, 1)
assert.equal(blocks[1].start, 3)
assert.equal(blocks[1].end, 3)
assert.equal(blocks[2].items.length, 2)
assert.equal(blocks[2].items[0].source, "第一项")
assert.equal(blocks[2].start, 5)
assert.equal(blocks[2].end, 6)
assert.equal(blocks[2].items[0].start, 5)
assert.equal(blocks[2].items[1].start, 6)
assert.equal(blocks[3].lang, "js")
assert.equal(blocks[3].source, "const a = 1")
assert.equal(blocks[3].start, 8)
assert.equal(blocks[3].end, 10)
assert.equal(blocks[5].type, "table")
assert.equal(blocks[5].start, 14)
assert.equal(blocks[5].end, 16)

const empty = parseBlocks("")
assert.equal(empty.length, 0, "empty document yields no blocks")

const hard = parseBlocks("- a\n  续行\n- b")
assert.equal(hard[0].type, "list")
assert.equal(hard[0].items.length, 2)
assert.equal(hard[0].items[0].source, "a\n续行")
assert.equal(hard[0].items[0].start, 1)
assert.equal(hard[0].items[0].end, 2)
assert.equal(hard[0].items[1].start, 3)

console.log("smoke OK: " + blocks.length + " blocks parsed, apply/inject exported")
