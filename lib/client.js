// dsh-md-annotator client half
//
// A `dsh.client` module in the __ModuleLoader__ factory form (no build step:
// this file is served verbatim at /plugins/dsh-md-annotator/client.js). It
// registers a Markdown file viewer through the `betterSidebar` service
// (provided by dsh-better-sidebar) with priority 10 — above the built-in
// markdown viewer (0) — so every .md preview in the sidebar becomes a
// block-level annotation surface. Annotations are collected and sent to the
// current session's composer draft as structured file-comment requests.
window.__ModuleLoader__.load({
  id: "dsh-md-annotator",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })
    var React = require("react")

    // ── package styles ──────────────────────────────────────────────────────
    // Injected at materialization time so the client module system's
    // claimStyles() tags this <style> with data-plugin and removes it with
    // the plugin on teardown/HMR.
    if (typeof document !== "undefined" && document.getElementById("dsh-md-annotator-style") === null) {
      var styleEl = document.createElement("style")
      styleEl.id = "dsh-md-annotator-style"
      styleEl.textContent = [
        ".mdan-root{position:relative;flex:1;min-height:0;overflow-y:auto;padding:10px 12px 64px;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary)}",
        ".mdan-loading,.mdan-empty{padding:20px 8px;color:var(--dsw-alias-label-secondary);text-align:center}",
        ".mdan-banner{padding:6px 10px;margin-bottom:8px;border-radius:6px;border:1px solid var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);font-size:12px}",
        ".mdan-block{position:relative;margin:4px 0;padding:4px 36px 4px 10px;border-left:2px solid transparent;border-radius:6px}",
        ".mdan-block:hover{background:var(--dsw-alias-bg-layer-1)}",
        ".mdan-block-annotated{border-left-color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-1)}",
        ".mdan-add{display:none;position:absolute;right:6px;top:2px;padding:1px 8px;font-size:11px;line-height:18px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}",
        ".mdan-add:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}",
        ".mdan-block:hover>.mdan-add,.mdan-li:hover>.mdan-add{display:inline-block}",
        ".mdan-add-small{padding:0 6px}",
        ".mdan-count{position:absolute;right:6px;top:28px;min-width:16px;padding:0 4px;font-size:10px;line-height:16px;text-align:center;border-radius:8px;background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-bg-base)}",
        ".mdan-count-small{right:2px;top:0}",
        ".mdan-notes{margin-top:6px;display:flex;flex-direction:column;gap:4px}",
        ".mdan-note{display:flex;align-items:flex-start;gap:6px;padding:4px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);font-size:12px}",
        ".mdan-note-text{flex:1;min-width:0;white-space:pre-wrap;word-break:break-word}",
        ".mdan-note-btn{flex:none;padding:0 6px;font-size:11px;line-height:18px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}",
        ".mdan-note-btn:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}",
        ".mdan-editor{margin-top:6px;padding:8px;border:1px solid var(--dsw-alias-brand-primary);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}",
        ".mdan-editor-input{width:100%;min-height:56px;box-sizing:border-box;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;resize:vertical;outline:none}",
        ".mdan-editor-input:focus{border-color:var(--dsw-alias-brand-primary)}",
        ".mdan-editor-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:6px}",
        ".mdan-btn{padding:2px 10px;font-size:12px;line-height:20px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}",
        ".mdan-btn:disabled{opacity:.45;cursor:not-allowed}",
        ".mdan-btn-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}",
        ".mdan-btn-primary:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}",
        ".mdan-p{margin:4px 0}",
        ".mdan-h1,.mdan-h2,.mdan-h3,.mdan-h4,.mdan-h5,.mdan-h6{margin:10px 0 4px;font-weight:600;line-height:1.4}",
        ".mdan-h1{font-size:19px}.mdan-h2{font-size:17px}.mdan-h3{font-size:15px}.mdan-h4{font-size:14px}.mdan-h5{font-size:13px}.mdan-h6{font-size:12px;color:var(--dsw-alias-label-secondary)}",
        ".mdan-inline-code{padding:1px 4px;background:var(--dsw-alias-bg-layer-2);border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}",
        ".mdan-code{margin:6px 0;padding:8px 10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5}",
        ".mdan-code-lang{font-size:10px;color:var(--dsw-alias-label-secondary);margin-bottom:4px}",
        ".mdan-quote{margin:6px 0;padding:4px 10px;border-left:3px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}",
        ".mdan-list{margin:4px 0;padding-left:22px}",
        ".mdan-li{position:relative;padding:2px 26px 2px 2px;border-radius:4px}",
        ".mdan-li:hover{background:var(--dsw-alias-bg-layer-2)}",
        ".mdan-li-annotated{border-left:2px solid var(--dsw-alias-state-warn-primary);padding-left:6px}",
        ".mdan-link{color:var(--dsw-alias-brand-primary);text-decoration:none;cursor:pointer}",
        ".mdan-hr{border:none;border-top:1px solid var(--dsw-alias-border-l1);margin:10px 0}",
        ".mdan-table{border-collapse:collapse;margin:6px 0;width:100%}",
        ".mdan-table th,.mdan-table td{border:1px solid var(--dsw-alias-border-l1);padding:3px 8px;text-align:left;vertical-align:top}",
        ".mdan-table th{background:var(--dsw-alias-bg-layer-2)}",
        ".mdan-panel{position:fixed;z-index:30;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);overflow:hidden}",
        ".mdan-panel-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:move;user-select:none;touch-action:none;background:var(--dsw-alias-bg-layer-2)}",
        ".mdan-panel-title{flex:1;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:move}",
        ".mdan-panel-body{flex:1;min-height:0;overflow-y:auto;padding:6px}",
        ".mdan-panel-resize{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none}",
        ".mdan-panel-resize::after{content:'';position:absolute;right:4px;bottom:4px;width:8px;height:8px;border-right:2px solid var(--dsw-alias-border-l2);border-bottom:2px solid var(--dsw-alias-border-l2)}",
        ".mdan-row{display:flex;gap:6px;padding:6px 4px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
        ".mdan-row:last-child{border-bottom:none}",
        ".mdan-row-jump{flex:none;min-width:22px;padding:0 4px;font-size:12px;line-height:20px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer}",
        ".mdan-row-body{flex:1;min-width:0}",
        ".mdan-row-note{font-size:12px;white-space:pre-wrap;word-break:break-word}",
        ".mdan-row-quote{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px;word-break:break-word}",
        ".mdan-bar{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;margin:10px -12px -64px;padding:8px 12px;background:var(--dsw-alias-bg-base);border-top:1px solid var(--dsw-alias-border-l1)}",
        ".mdan-bar-count{font-size:12px;color:var(--dsw-alias-label-secondary)}",
        ".mdan-feedback{font-size:12px;color:var(--dsw-alias-state-success-primary)}",
        ".mdan-feedback-err{color:var(--dsw-alias-state-error-primary)}",
        ".mdan-kindtag{flex:none;display:inline-block;font-size:10px;line-height:16px;padding:0 6px;border-radius:8px;border:1px solid;white-space:nowrap;margin-bottom:2px}",
        ".mdan-kindtag-must{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}",
        ".mdan-kindtag-suggest{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}",
        ".mdan-kindtag-question{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}",
        ".mdan-kindpick{display:flex;gap:6px;margin-bottom:6px}",
        ".mdan-kindbtn{flex:none;padding:0 8px;font-size:11px;line-height:18px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}",
        ".mdan-kindbtn-must.mdan-kindbtn-on{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-1)}",
        ".mdan-kindbtn-suggest.mdan-kindbtn-on{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-1)}",
        ".mdan-kindbtn-question.mdan-kindbtn-on{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1)}"
      ].join("\n")
      document.head.appendChild(styleEl)
    }

    // ── markdown block parser ───────────────────────────────────────────────
    // Splits markdown source into annotatable blocks. Every block carries the
    // verbatim `source` text plus 1-based `start`/`end` line numbers, used to
    // quote and re-locate it after edits.
    var LIST_RE = /^\s*([-*+]|\d+[.)])\s+(.*)$/
    var SEP_RE = /^\s*\|?[\s:|-]+\|?\s*$/

    function parseBlocks(text) {
      var lines = String(text === undefined || text === null ? "" : text).replace(/\r\n?/g, "\n").split("\n")
      var blocks = []
      var i = 0
      while (i < lines.length) {
        var startLine = i + 1
        var line = lines[i]
        if (/^\s*$/.test(line)) { i++; continue }
        var fence = /^\s{0,3}(`{3,}|~{3,})\s*([\w.+-]*)\s*$/.exec(line)
        if (fence !== null) {
          var marker = fence[1][0]
          var len = fence[1].length
          var lang = fence[2] === undefined ? "" : fence[2]
          var buf = []
          i++
          while (i < lines.length) {
            if (new RegExp("^\\s{0,3}" + marker + "{" + len + ",}\\s*$").test(lines[i])) { i++; break }
            buf.push(lines[i]); i++
          }
          blocks.push({ type: "code", lang: lang, source: buf.join("\n"), start: startLine, end: i })
          continue
        }
        var heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
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
          var quoteBuf = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            quoteBuf.push(lines[i].replace(/^\s*>\s?/, ""))
            i++
          }
          blocks.push({ type: "quote", source: quoteBuf.join("\n"), start: startLine, end: i })
          continue
        }
        if (line.indexOf("|") !== -1 && i + 1 < lines.length && SEP_RE.test(lines[i + 1]) && lines[i + 1].indexOf("-") !== -1) {
          var tableBuf = [line]
          i++
          while (i < lines.length && lines[i].indexOf("|") !== -1 && !/^\s*$/.test(lines[i])) {
            tableBuf.push(lines[i]); i++
          }
          blocks.push({ type: "table", source: tableBuf.join("\n"), start: startLine, end: i })
          continue
        }
        var listMatch = LIST_RE.exec(line)
        if (listMatch !== null) {
          var ordered = /^\d/.test(listMatch[1])
          var items = []
          while (i < lines.length) {
            var itemMatch = LIST_RE.exec(lines[i])
            if (itemMatch === null) {
              if (/^\s*$/.test(lines[i])) break
              if (items.length > 0) {
                items[items.length - 1].source += "\n" + lines[i].trim()
                items[items.length - 1].end = i + 1
              } else break
              i++
              continue
            }
            items.push({ source: itemMatch[2].trim(), start: i + 1, end: i + 1 })
            i++
          }
          blocks.push({ type: "list", ordered: ordered, items: items, start: startLine, end: i })
          continue
        }
        var paraBuf = [line.trim()]
        i++
        while (i < lines.length) {
          var next = lines[i]
          if (/^\s*$/.test(next)) break
          if (/^\s{0,3}#{1,6}\s/.test(next)) break
          if (/^\s{0,3}(`{3,}|~{3,})/.test(next)) break
          if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(next)) break
          if (/^\s*>\s?/.test(next)) break
          if (LIST_RE.test(next)) break
          if (next.indexOf("|") !== -1 && i + 1 < lines.length && SEP_RE.test(lines[i + 1]) && lines[i + 1].indexOf("-") !== -1) break
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
    var INLINE_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|\[[^\]\n]*\]\([^)\n]*\))/g

    function renderInline(text) {
      if (typeof text !== "string" || text === "") return null
      var parts = String(text).split(INLINE_RE)
      var nodes = []
      for (var k = 0; k < parts.length; k++) {
        var part = parts[k]
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
            var linkMatch = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(part)
            var label = linkMatch === null ? part : linkMatch[1]
            var url = linkMatch === null ? "" : linkMatch[2]
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
      var rows = source.split("\n").filter(function (l) { return l.trim() !== "" })
      function splitRow(l) {
        return l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim() })
      }
      var bodyRows = rows.slice(1).filter(function (l) { return !SEP_RE.test(l) })
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
          var table = parseTable(block.source)
          return React.createElement("table", { className: "mdan-table" },
            React.createElement("thead", null,
              React.createElement("tr", null, table.header.map(function (cell, j) {
                return React.createElement("th", { key: j }, renderInline(cell))
              }))),
            React.createElement("tbody", null, table.body.map(function (row, j) {
              return React.createElement("tr", { key: j }, row.map(function (cell, k) {
                return React.createElement("td", { key: k }, renderInline(cell))
              }))
            })))
        }
        case "list":
          return React.createElement(block.ordered ? "ol" : "ul", { className: "mdan-list" },
            block.items.map(function (item, j) {
              return React.createElement("li", { key: j }, renderInline(item.source))
            }))
        default:
          return null
      }
    }

    // ── annotation store ────────────────────────────────────────────────────
    // Module-level Map keyed by `sessionId \0 path`: survives tab switches and
    // session hopping for the lifetime of this plugin activation.
    var annotationStore = new Map()

    function storeKey(sessionId, path) {
      return String(sessionId === undefined || sessionId === null ? "" : sessionId) + "\u0000" + String(path === undefined || path === null ? "" : path)
    }
    function loadAnnotations(sessionId, path) {
      var list = annotationStore.get(storeKey(sessionId, path))
      return list === undefined ? [] : list
    }
    function saveAnnotations(sessionId, path, list) {
      annotationStore.set(storeKey(sessionId, path), list)
    }
    function resolveSource(blocks, ref) {
      var parts = ref.split(":")
      var blockIndex = Number(parts[0])
      var block = blocks[blockIndex]
      if (block === undefined) return undefined
      if (block.type === "list" && parts.length > 1) {
        var item = block.items[Number(parts[1])]
        return item === undefined ? undefined : item.source
      }
      return block.source
    }
    function truncate(text, max) {
      var s = String(text)
      return s.length <= max ? s : s.slice(0, max) + "…"
    }
    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max)
    }
    // Per-file panel geometry (position/size/open) — floats across tab
    // switches like the annotations themselves.
    var panelPrefsStore = new Map()
    function loadPanelPrefs(sessionId, path) {
      var prefs = panelPrefsStore.get(storeKey(sessionId, path))
      return prefs === undefined ? { open: false } : prefs
    }
    function savePanelPrefs(sessionId, path, prefs) {
      panelPrefsStore.set(storeKey(sessionId, path), prefs)
    }
    // Annotation kind vocabulary: the label tags a note, the report groups
    // by kind in this order.
    var KIND_LABELS = { must: "必须改", suggest: "建议改", question: "疑问" }
    var KIND_ORDER = ["must", "suggest", "question"]
    function kindLabel(kind) {
      return KIND_LABELS[kind] === undefined ? "建议改" : KIND_LABELS[kind]
    }

    // ── viewer component ────────────────────────────────────────────────────
    function MdAnnotateView(props) {
      var path = props.path
      var sessionId = props.scope === undefined ? undefined : props.scope.sessionId
      var content = props.content

      var tickState = React.useState(0)
      var tick = tickState[0]
      var setTick = tickState[1]
      var editingState = React.useState(null) // { ref, source, start, end, noteId? } | null
      var editing = editingState[0]
      var setEditing = editingState[1]
      var draftState = React.useState("")
      var draftText = draftState[0]
      var setDraftText = draftState[1]
      var panelState = React.useState(function () { return loadPanelPrefs(sessionId, path) })
      var panel = panelState[0]
      var setPanel = panelState[1]
      var lastKindState = React.useState("suggest")
      var lastKind = lastKindState[0]
      var setLastKind = lastKindState[1]
      var prefsTickState = React.useState(0)
      var prefsTick = prefsTickState[0]
      var setPrefsTick = prefsTickState[1]

      // Re-render when the sidebar's prefs document changes (settings page
      // writes pluginSettings live).
      React.useEffect(function () {
        var store = props.store
        if (store === undefined || typeof store.subscribe !== "function") return undefined
        return store.subscribe(function () { setPrefsTick(function (t) { return t + 1 }) })
      }, [props.store])

      // Read one plugin-owned setting (declared through settings.pluginToggles
      // and persisted by the sidebar under pluginSettings['md-annotator']).
      function pluginSetting(key, fallback) {
        var store = props.store
        try {
          if (store === undefined || typeof store.getPrefs !== "function") return fallback
          var blob = store.getPrefs().pluginSettings
          var mine = blob === undefined || blob === null ? undefined : blob["md-annotator"]
          if (mine !== undefined && mine !== null && mine[key] !== undefined) return mine[key]
        } catch (error) { /* fall through */ }
        return fallback
      }
      var feedbackState = React.useState(null) // { kind: 'ok'|'err', text } | null
      var feedback = feedbackState[0]
      var setFeedback = feedbackState[1]
      var anchorState = React.useState(null)
      var anchor = anchorState[0]
      var setAnchor = anchorState[1]
      var rootRef = React.useRef(null)
      var dragRef = React.useRef(null) // { kind, pointerId, startX/Y, baseX/Y, baseW/H, rect } | null

      var blocks = React.useMemo(function () {
        return parseBlocks(content === undefined ? "" : content)
      }, [content])
      var annotations = React.useMemo(function () {
        return loadAnnotations(sessionId, path)
      }, [tick, sessionId, path])

      function persist(list) {
        saveAnnotations(sessionId, path, list)
        setTick(function (t) { return t + 1 })
      }
      function isStale(note) {
        return resolveSource(blocks, note.ref) !== note.source
      }
      function openEditor(ref, source, start, end) {
        setEditing({ ref: ref, source: source, start: start, end: end, kind: lastKind })
        setDraftText("")
        setFeedback(null)
      }
      function openEditorFor(note) {
        setEditing({ ref: note.ref, source: note.source, start: note.start, end: note.end, noteId: note.id, kind: typeof note.kind === "string" ? note.kind : lastKind })
        setDraftText(note.note)
        setFeedback(null)
      }
      function saveEditing() {
        if (editing === null) return
        var text = draftText.trim()
        if (text === "") { setEditing(null); return }
        var kind = typeof editing.kind === "string" ? editing.kind : "suggest"
        setLastKind(kind)
        var list = loadAnnotations(sessionId, path)
        if (editing.noteId === undefined) {
          var note = {
            id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            ref: editing.ref,
            source: editing.source,
            start: editing.start,
            end: editing.end,
            kind: kind,
            note: text
          }
          persist(list.concat([note]))
        } else {
          persist(list.map(function (n) {
            return n.id === editing.noteId ? Object.assign({}, n, { note: text, kind: kind }) : n
          }))
        }
        setEditing(null)
        setDraftText("")
      }
      function removeNote(noteId) {
        persist(loadAnnotations(sessionId, path).filter(function (n) { return n.id !== noteId }))
        if (editing !== null && editing.noteId === noteId) {
          setEditing(null)
          setDraftText("")
        }
      }
      function displayPath() {
        var cwd = props.scope === undefined ? undefined : props.scope.cwd
        if (typeof cwd === "string" && typeof path === "string" && path.indexOf(cwd) === 0) {
          var rel = path.slice(cwd.length).replace(/^[/\\]+/, "")
          return rel === "" ? path : rel
        }
        return path
      }
      function excerptLines(source) {
        var s = truncate(source, 240)
        if (s.trim() === "") return ["（空内容）"]
        return s.split("\n")
      }
      function clearAll() {
        persist([])
        setFeedback({ kind: "ok", text: "已清空全部批注" })
      }
      function togglePanel(next) {
        setPanel(function (prev) {
          var open = typeof next === "boolean" ? next : !prev.open
          if (!open) {
            var closed = Object.assign({}, prev, { open: false })
            savePanelPrefs(sessionId, path, closed)
            return closed
          }
          var root = rootRef.current
          var rect = root === null ? null : root.getBoundingClientRect()
          var nextPrefs = Object.assign({}, prev, { open: true })
          if (typeof nextPrefs.x !== "number" || typeof nextPrefs.y !== "number") {
            nextPrefs.x = rect === null ? 24 : rect.left + 16
            nextPrefs.y = rect === null ? 24 : rect.top + 16
          }
          if (rect !== null) {
            nextPrefs.x = clamp(nextPrefs.x, rect.left, Math.max(rect.left, rect.right - 160))
            nextPrefs.y = clamp(nextPrefs.y, rect.top, Math.max(rect.top, rect.bottom - 48))
            nextPrefs.w = clamp(typeof nextPrefs.w === "number" ? nextPrefs.w : 360, 240, Math.max(240, rect.width))
            nextPrefs.h = clamp(typeof nextPrefs.h === "number" ? nextPrefs.h : 300, 160, Math.max(160, rect.height))
          }
          savePanelPrefs(sessionId, path, nextPrefs)
          return nextPrefs
        })
      }
      function beginDrag(event, kind) {
        if (dragRef.current !== null) return
        var root = rootRef.current
        var rect = root === null ? null : root.getBoundingClientRect()
        var target = event.currentTarget
        if (target !== null && typeof target.setPointerCapture === "function") {
          try { target.setPointerCapture(event.pointerId) } catch (error) { /* keep going without capture */ }
        }
        dragRef.current = {
          kind: kind,
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          baseX: typeof panel.x === "number" ? panel.x : (rect === null ? 24 : rect.left + 16),
          baseY: typeof panel.y === "number" ? panel.y : (rect === null ? 24 : rect.top + 16),
          baseW: typeof panel.w === "number" ? panel.w : 360,
          baseH: typeof panel.h === "number" ? panel.h : 300,
          rect: rect
        }
      }
      function moveDrag(event) {
        var d = dragRef.current
        if (d === null || d.pointerId !== event.pointerId) return
        event.preventDefault()
        var dx = event.clientX - d.startClientX
        var dy = event.clientY - d.startClientY
        if (d.kind === "move") {
          var x = d.rect === null
            ? d.baseX + dx
            : clamp(d.baseX + dx, d.rect.left, Math.max(d.rect.left, d.rect.right - 160))
          var y = d.rect === null
            ? d.baseY + dy
            : clamp(d.baseY + dy, d.rect.top, Math.max(d.rect.top, d.rect.bottom - 48))
          setPanel(function (p) { return Object.assign({}, p, { x: x, y: y }) })
        } else {
          var w = clamp(d.baseW + dx, 240, d.rect === null ? 1600 : Math.max(240, d.rect.width))
          var h = clamp(d.baseH + dy, 160, d.rect === null ? 1600 : Math.max(160, d.rect.height))
          setPanel(function (p) { return Object.assign({}, p, { w: w, h: h }) })
        }
      }
      function endDrag(event) {
        var d = dragRef.current
        if (d === null || d.pointerId !== event.pointerId) return
        dragRef.current = null
        setPanel(function (p) { savePanelPrefs(sessionId, path, p); return p })
      }
      function buildReport() {
        var out = []
        var prefix = String(pluginSetting("reportPrefix", "") === null || pluginSetting("reportPrefix", "") === undefined ? "" : pluginSetting("reportPrefix", "")).trim()
        if (prefix !== "") {
          out.push(prefix)
          out.push("")
        }
        var firstGroup = true
        KIND_ORDER.forEach(function (kindId) {
          var group = annotations.filter(function (n) { return (typeof n.kind === "string" ? n.kind : "suggest") === kindId })
          if (group.length === 0) return
          if (!firstGroup) out.push("")
          out.push("【" + kindLabel(kindId) + "】")
          out.push("")
          group.forEach(function (n) {
            out.push("File: " + displayPath())
            out.push("Source: markdown")
            out.push("")
            var linesLabel = typeof n.start === "number" && typeof n.end === "number" && n.end > n.start
              ? "Lines " + n.start + "-" + n.end
              : "Line " + (typeof n.start === "number" ? n.start : "?")
            out.push(linesLabel)
            out.push("Excerpt:")
            excerptLines(n.source).forEach(function (l) { out.push("> " + l) })
            out.push('User comment: "' + n.note + '"')
            if (isStale(n)) out.push("(注：该处内容可能已变化，请按原文定位)")
            out.push("")
          })
          firstGroup = false
        })
        while (out.length > 0 && out[out.length - 1] === "") out.pop()
        return out.join("\n")
      }
      function sendToDraft() {
        if (annotations.length === 0) return
        var sessions = ctx.get("sessions")
        var conversation = ctx.get("conversation")
        if (sessions === undefined || conversation === undefined) {
          setFeedback({ kind: "err", text: "未找到会话输入服务，无法写入对话框" })
          return
        }
        var actx = undefined
        try { actx = sessions.scope(sessionId) } catch (error) { actx = undefined }
        if (actx === undefined) {
          setFeedback({ kind: "err", text: "当前会话不可用，无法写入对话框" })
          return
        }
        try {
          var input = conversation.input.for(actx)
          var current = input.state.getSnapshot().draft
          var report = buildReport()
          input.setDraft(current.trim() === "" ? report : current + "\n\n" + report)
          if (pluginSetting("clearAfterSend", false) === true) {
            persist([])
            setFeedback({ kind: "ok", text: "已写入对话框草稿，批注已按设置清空" })
          } else {
            setFeedback({ kind: "ok", text: "已写入对话框草稿，回车即可发送" })
          }
        } catch (error) {
          console.error("[dsh-md-annotator] draft insert failed:", error)
          setFeedback({ kind: "err", text: "写入对话框失败：" + (error === null || error === undefined ? "未知错误" : String(error && error.message ? error.message : error)) })
        }
      }

      React.useEffect(function () {
        if (anchor === null || rootRef.current === null) return
        var el = rootRef.current.querySelector('[data-mdan-ref="' + anchor + '"]')
        if (el !== null) el.scrollIntoView({ block: "center", behavior: "smooth" })
        setAnchor(null)
      }, [anchor])

      function kindTag(kind) {
        var id = typeof kind === "string" ? kind : "suggest"
        return React.createElement("span", { className: "mdan-kindtag mdan-kindtag-" + id }, kindLabel(id))
      }
      function noteChips(notes) {
        return React.createElement("div", { className: "mdan-notes" },
          notes.map(function (n) {
            return React.createElement("div", { key: n.id, className: "mdan-note" },
              kindTag(n.kind),
              React.createElement("span", { className: "mdan-note-text" }, n.note),
              React.createElement("button", { type: "button", className: "mdan-note-btn", onClick: function () { openEditorFor(n) } }, "编辑"),
              React.createElement("button", { type: "button", className: "mdan-note-btn", onClick: function () { removeNote(n.id) } }, "删除"))
          }))
      }
      function editorPanel() {
        return React.createElement("div", { className: "mdan-editor" },
          React.createElement("div", { className: "mdan-kindpick" },
            KIND_ORDER.map(function (kindId) {
              var active = editing !== null && (typeof editing.kind === "string" ? editing.kind : "suggest") === kindId
              return React.createElement("button", {
                key: kindId,
                type: "button",
                className: "mdan-kindbtn mdan-kindbtn-" + kindId + (active ? " mdan-kindbtn-on" : ""),
                onClick: function () {
                  setEditing(function (e) { return e === null ? null : Object.assign({}, e, { kind: kindId }) })
                }
              }, kindLabel(kindId))
            })),
          React.createElement("textarea", {
            className: "mdan-editor-input",
            value: draftText,
            placeholder: "写下对这一处内容的修改意见…",
            autoFocus: true,
            onChange: function (event) { setDraftText(event.target.value) },
            onKeyDown: function (event) {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault()
                saveEditing()
              }
            }
          }),
          React.createElement("div", { className: "mdan-editor-actions" },
            React.createElement("button", { type: "button", className: "mdan-btn mdan-btn-primary", onClick: saveEditing }, editing !== null && editing.noteId !== undefined ? "保存修改" : "保存批注"),
            React.createElement("button", { type: "button", className: "mdan-btn", onClick: function () { setEditing(null); setDraftText("") } }, "取消")))
      }

      function renderListBlock(block, index) {
        var items = block.items.map(function (item, j) {
          var ref = index + ":" + j
          var itemNotes = annotations.filter(function (n) { return n.ref === ref })
          return React.createElement("li", {
            key: j,
            className: "mdan-li" + (itemNotes.length > 0 ? " mdan-li-annotated" : ""),
            "data-mdan-ref": ref
          },
            renderInline(item.source),
            React.createElement("button", { type: "button", className: "mdan-add mdan-add-small", title: "批注此项", onClick: function () { openEditor(ref, item.source, item.start, item.end) } }, "＋"),
            itemNotes.length > 0 ? React.createElement("span", { className: "mdan-count mdan-count-small" }, String(itemNotes.length)) : null,
            itemNotes.length > 0 ? noteChips(itemNotes) : null,
            editing !== null && editing.ref === ref ? editorPanel() : null)
        })
        return React.createElement(block.ordered ? "ol" : "ul", { className: "mdan-list" }, items)
      }

      var body = blocks.map(function (block, index) {
        var ref = String(index)
        var blockNotes = annotations.filter(function (n) { return n.ref === ref })
        return React.createElement("div", {
          key: "b" + index,
          className: "mdan-block" + (blockNotes.length > 0 ? " mdan-block-annotated" : ""),
          "data-mdan-ref": ref
        },
          block.type === "list"
            ? renderListBlock(block, index)
            : React.createElement(React.Fragment, null,
                blockContent(block),
                blockNotes.length > 0 ? noteChips(blockNotes) : null),
          React.createElement("button", { type: "button", className: "mdan-add", onClick: function () { openEditor(ref, block.source, block.start, block.end) } }, "＋ 批注"),
          blockNotes.length > 0 ? React.createElement("span", { className: "mdan-count" }, String(blockNotes.length)) : null,
          editing !== null && editing.ref === ref ? editorPanel() : null)
      })

      function renderListPanel() {
        var rows = annotations.map(function (n, k) {
          return React.createElement("div", { key: n.id, className: "mdan-row" },
            React.createElement("button", {
              type: "button",
              className: "mdan-row-jump",
              title: "定位到原文",
              onClick: function () { setAnchor(n.ref) }
            }, String(k + 1) + "."),
            React.createElement("div", { className: "mdan-row-body" },
              kindTag(n.kind),
              React.createElement("div", { className: "mdan-row-note" }, n.note),
              React.createElement("div", { className: "mdan-row-quote" }, "原文：" + truncate(n.source, 120) + (isStale(n) ? "（原文已变化）" : ""))),
            React.createElement("button", {
              type: "button",
              className: "mdan-note-btn",
              title: "移除这条批注",
              onClick: function () { removeNote(n.id) }
            }, "移除"))
        })
        var style = {
          left: (typeof panel.x === "number" ? panel.x : 16) + "px",
          top: (typeof panel.y === "number" ? panel.y : 16) + "px",
          width: (typeof panel.w === "number" ? panel.w : 360) + "px",
          height: (typeof panel.h === "number" ? panel.h : 300) + "px"
        }
        return React.createElement("div", { className: "mdan-panel", style: style },
          React.createElement("div", {
            className: "mdan-panel-head",
            onPointerDown: function (event) { beginDrag(event, "move") },
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onLostPointerCapture: endDrag
          },
            React.createElement("span", { className: "mdan-panel-title" }, "批注清单（拖动标题栏可移动）"),
            React.createElement("button", {
              type: "button",
              className: "mdan-note-btn",
              disabled: annotations.length === 0,
              onPointerDown: function (event) { event.stopPropagation() },
              onMouseDown: function (event) { event.stopPropagation() },
              onClick: clearAll
            }, "清空全部"),
            React.createElement("button", {
              type: "button",
              className: "mdan-note-btn",
              onPointerDown: function (event) { event.stopPropagation() },
              onMouseDown: function (event) { event.stopPropagation() },
              onClick: function () { togglePanel(false) }
            }, "关闭")),
          React.createElement("div", { className: "mdan-panel-body" },
            rows.length === 0
              ? React.createElement("div", { className: "mdan-empty" }, "还没有批注。把鼠标悬停到任意段落或列表项上，点「＋批注」开始。")
              : rows),
          React.createElement("div", {
            className: "mdan-panel-resize",
            title: "拖动调整大小",
            onPointerDown: function (event) { event.stopPropagation(); beginDrag(event, "resize") },
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onLostPointerCapture: endDrag
          }))
      }

      function renderBar() {
        return React.createElement("div", { className: "mdan-bar" },
          React.createElement("span", { className: "mdan-bar-count" }, "共 " + annotations.length + " 条批注"),
          React.createElement("button", {
            type: "button",
            className: "mdan-btn",
            onClick: function () { togglePanel() }
          }, panel.open ? "收起清单" : "批注清单"),
          React.createElement("button", {
            type: "button",
            className: "mdan-btn",
            disabled: annotations.length === 0,
            onClick: clearAll
          }, "清空"),
          React.createElement("button", {
            type: "button",
            className: "mdan-btn mdan-btn-primary",
            disabled: annotations.length === 0,
            onClick: sendToDraft
          }, "发送全部批注到对话框"),
          feedback !== null ? React.createElement("span", { className: "mdan-feedback" + (feedback.kind === "err" ? " mdan-feedback-err" : "") }, feedback.text) : null)
      }

      return React.createElement("div", { className: "mdan-root", ref: rootRef },
        props.truncated === true ? React.createElement("div", { className: "mdan-banner" }, "文件过大，仅预览截断内容") : null,
        content === undefined ? React.createElement("div", { className: "mdan-loading" }, "加载中…") : null,
        content !== undefined && blocks.length === 0 ? React.createElement("div", { className: "mdan-empty" }, "（空文档）") : null,
        body,
        panel.open ? renderListPanel() : null,
        renderBar())
    }

    // ── plugin ──────────────────────────────────────────────────────────────
    var inject = ["betterSidebar"]
    var ctx = undefined

    function apply(context) {
      ctx = context
      var sidebar = ctx.betterSidebar
      ctx.effect(function () {
        var supportsPluginSettings = Array.isArray(sidebar.features) && sidebar.features.indexOf("pluginSettings") !== -1
        return sidebar.registerFileViewer({
          id: "md-annotator",
          title: "MD 批注预览",
          icon: function (size) {
            return React.createElement("span", { style: { fontSize: Math.max(12, Number(size) || 12) + "px", lineHeight: 1 } }, "✍")
          },
          exts: ["md", "markdown"],
          priority: 10,
          fetchStrategy: "fsRead",
          settings: supportsPluginSettings ? {
            pluginToggles: [
              { key: "clearAfterSend", title: "发送后自动清空批注", desc: "把批注写入对话框后，自动清空本文件的全部批注", type: "switch" },
              { key: "reportPrefix", title: "发送内容前缀", desc: "附加在批注内容开头的说明文字", type: "text", placeholder: "（可选）例如：请逐项修改并保持原有语气" }
            ]
          } : undefined,
          component: MdAnnotateView
        })
      })
    }

    exports.apply = apply
    exports.inject = inject
    // Test hook (smoke tests materialize the factory under Node with a stub
    // require("react"); the browser never reads this export).
    exports._test = { parseBlocks: parseBlocks, renderInline: renderInline }
    return module.exports
  }
})
