// ── markdown block parser + inline renderer ──────────────────────────────
// Splits markdown source into annotatable blocks. Every block carries the
// verbatim `source` text plus 1-based `start`/`end` line numbers, used to
// quote and re-locate it after edits.
//
// This is a deliberate CommonMark SUBSET. Not supported (documented in README):
// setext headings, nested lists (indented children are flattened), inline HTML,
// list-item code fences/blockquotes, escaped pipes inside table cells.

const LIST_RE = /^\s*([-*+]|\d+[.)])\s+(.*)$/
const SEP_RE = /^\s*\|?[\s:|-]+\|?\s*$/

function parseBlocks(text) {
  const lines = String(text === undefined || text === null ? "" : text).replace(/\r\n?/g, "\n").split("\n")
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const startLine = i + 1
    const line = lines[i]
    if (/^\s*$/.test(line)) { i++; continue }
    const fence = /^\s{0,3}(`{3,}|~{3,})\s*([\w.+-]*)\s*$/.exec(line)
    if (fence !== null) {
      const marker = fence[1][0]
      const len = fence[1].length
      const lang = fence[2] === undefined ? "" : fence[2]
      const buf = []
      i++
      while (i < lines.length) {
        if (new RegExp("^\\s{0,3}" + marker + "{" + len + ",}\\s*$").test(lines[i])) { i++; break }
        buf.push(lines[i]); i++
      }
      blocks.push({ type: "code", lang: lang, source: buf.join("\n"), start: startLine, end: i })
      continue
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      i++
      blocks.push({ type: "heading", level: heading[1].length, source: heading[2].trim(), start: startLine, end: i })
      continue
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      i++
      blocks.push({ type: "hr", source: "", start: startLine, end: i })
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const quoteBuf = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteBuf.push(lines[i].replace(/^\s*>\s?/, ""))
        i++
      }
      blocks.push({ type: "quote", source: quoteBuf.join("\n"), start: startLine, end: i })
      continue
    }
    if (line.indexOf("|") !== -1 && i + 1 < lines.length && lines[i + 1].indexOf("|") !== -1 && SEP_RE.test(lines[i + 1]) && lines[i + 1].indexOf("-") !== -1) {
      const tableBuf = [line]
      i++
      while (i < lines.length && lines[i].indexOf("|") !== -1 && !/^\s*$/.test(lines[i])) {
        tableBuf.push(lines[i]); i++
      }
      blocks.push({ type: "table", source: tableBuf.join("\n"), start: startLine, end: i })
      continue
    }
    const listMatch = LIST_RE.exec(line)
    if (listMatch !== null) {
      const ordered = /^\d/.test(listMatch[1])
      const items = []
      const rawLines = []
      while (i < lines.length) {
        const itemMatch = LIST_RE.exec(lines[i])
        if (itemMatch === null) {
          if (/^\s*$/.test(lines[i])) break
          if (items.length > 0) {
            // continuation line: keep verbatim (preserves code indentation)
            items[items.length - 1].source += "\n" + lines[i]
            items[items.length - 1].end = i + 1
            rawLines.push(lines[i])
          } else break
          i++
          continue
        }
        items.push({ source: itemMatch[2].trim(), start: i + 1, end: i + 1 })
        rawLines.push(lines[i])
        i++
      }
      blocks.push({ type: "list", ordered: ordered, items: items, source: rawLines.join("\n"), start: startLine, end: i })
      continue
    }
    const paraBuf = [line.trim()]
    i++
    while (i < lines.length) {
      const next = lines[i]
      if (/^\s*$/.test(next)) break
      if (/^\s{0,3}#{1,6}\s/.test(next)) break
      if (/^\s{0,3}(`{3,}|~{3,})/.test(next)) break
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(next)) break
      if (/^\s*>\s?/.test(next)) break
      if (LIST_RE.test(next)) break
      if (next.indexOf("|") !== -1 && i + 1 < lines.length && lines[i + 1].indexOf("|") !== -1 && SEP_RE.test(lines[i + 1]) && lines[i + 1].indexOf("-") !== -1) break
      paraBuf.push(next.trim())
      i++
    }
    blocks.push({ type: "paragraph", source: paraBuf.join("\n"), start: startLine, end: i })
  }
  return blocks
}

// ── inline renderer ─────────────────────────────────────────────────────
// React-created nodes only (no dangerouslySetInnerHTML): strings are
// escaped by React itself. Supported: `code`, **bold**, *italic*, ~~del~~,
// [text](url). Links never navigate (title shows the URL).
const INLINE_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|\[[^\]\n]*\]\([^)\n]*\))/g

function renderInline(text) {
  if (typeof text !== "string" || text === "") return null
  const parts = String(text).split(INLINE_RE)
  const nodes = []
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k]
    if (part === "") continue
    if (k % 2 === 1) {
      if (part.charAt(0) === "`") {
        nodes.push(React.createElement("code", { key: k, className: "mdan-inline-code" }, part.slice(1, -1)))
      } else if (part.indexOf("**") === 0) {
        nodes.push(React.createElement("strong", { key: k }, renderInline(part.slice(2, -2))))
      } else if (part.charAt(0) === "*") {
        nodes.push(React.createElement("em", { key: k }, renderInline(part.slice(1, -1))))
      } else if (part.indexOf("~~") === 0) {
        nodes.push(React.createElement("del", { key: k }, renderInline(part.slice(2, -2))))
      } else if (part.charAt(0) === "[") {
        const linkMatch = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(part)
        const label = linkMatch === null ? part : linkMatch[1]
        const url = linkMatch === null ? "" : linkMatch[2]
        nodes.push(React.createElement("a", {
          key: k,
          className: "mdan-link",
          href: url === "" ? "#" : url,
          title: url === "" ? undefined : url,
          onClick: function (event) { event.preventDefault() }
        }, label))
      }
    } else {
      nodes.push(part)
    }
  }
  return nodes
}

function parseTable(source) {
  const rows = source.split("\n").filter((l) => l.trim() !== "")
  function splitRow(l) {
    return l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
  }
  const bodyRows = rows.slice(1).filter((l) => !SEP_RE.test(l))
  return { header: rows.length > 0 ? splitRow(rows[0]) : [], body: bodyRows.map(splitRow) }
}

function blockContent(block) {
  switch (block.type) {
    case "heading":
      return React.createElement("h" + Math.min(block.level, 6), { className: "mdan-h" + Math.min(block.level, 6) }, renderInline(block.source))
    case "paragraph":
      return React.createElement("p", { className: "mdan-p" }, renderInline(block.source))
    case "code":
      return React.createElement("pre", { className: "mdan-code" },
        block.lang !== "" ? React.createElement("div", { className: "mdan-code-lang" }, block.lang) : null,
        React.createElement("code", null, block.source))
    case "quote":
      return React.createElement("blockquote", { className: "mdan-quote" }, renderInline(block.source))
    case "hr":
      return React.createElement("hr", { className: "mdan-hr" })
    case "table": {
      const table = parseTable(block.source)
      return React.createElement("table", { className: "mdan-table" },
        React.createElement("thead", null,
          React.createElement("tr", null, table.header.map((cell, j) => React.createElement("th", { key: j }, renderInline(cell))))),
        React.createElement("tbody", null, table.body.map((row, j) =>
          React.createElement("tr", { key: j }, row.map((cell, k) => React.createElement("td", { key: k }, renderInline(cell)))))))
    }
    case "list":
      return React.createElement(block.ordered ? "ol" : "ul", { className: "mdan-list" },
        block.items.map((item, j) => React.createElement("li", { key: j }, renderInline(item.source))))
    default:
      return null
  }
}
