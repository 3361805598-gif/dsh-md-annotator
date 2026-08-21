// ── viewer component ────────────────────────────────────────────────────
// MdAnnotateView renders the parsed blocks as an annotation surface. Render
// performance is preserved by: (1) isolating the annotation editor into its
// own component with local draft state, so keystrokes never rebuild the block
// tree; (2) precomputing a ref→notes Map (O(1) lookups instead of O(B×A)
// scans); (3) memoizing block/note-list components behind stable callbacks;
// (4) RAF-throttling panel drag/resize with a single persist on pointerup.

function kindTag(kind) {
  const id = typeof kind === "string" ? kind : DEFAULT_KIND
  return React.createElement("span", { className: "mdan-kindtag mdan-kindtag-" + id }, kindLabel(id))
}

/** Error boundary: a render-time exception degrades to a recoverable message
 *  instead of tearing down the whole sidebar preview. */
class MdErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.reset = () => this.setState({ error: null })
  }
  static getDerivedStateFromError(error) {
    return { error: error }
  }
  componentDidCatch(error, info) {
    console.error("[dsh-md-annotator] viewer render failed:", error, info && info.componentStack)
  }
  render() {
    if (this.state.error !== null) {
      return React.createElement("div", { className: "mdan-empty" },
        React.createElement("div", null, "该文件预览出错"),
        React.createElement("button", { type: "button", className: "mdan-btn", onClick: this.reset }, "恢复"))
    }
    return this.props.children
  }
}

function MarkdownSourceEditor(props) {
  return React.createElement("textarea", {
    className: "mdan-source-editor",
    value: props.value,
    spellCheck: false,
    "aria-label": "Markdown 源码编辑器",
    placeholder: "Markdown 源码",
    onChange: function (event) { props.onChange(event.target.value) },
    onKeyDown: function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault()
        props.onSave()
      }
    }
  })
}

/** Isolated annotation editor: draft text lives here, so typing only
 *  re-renders this subtree. Reports save/cancel/kind back up via callbacks. */
function AnnotationEditor(props) {
  const editing = props.editing
  const draftState = React.useState(editing !== null && typeof editing.initialText === "string" ? editing.initialText : "")
  const draft = draftState[0]
  const setDraft = draftState[1]
  const editorKey = editing === null ? null : (editing.noteId !== undefined ? "edit:" + editing.noteId : "new:" + editing.ref)
  React.useEffect(function () {
    setDraft(editing !== null && typeof editing.initialText === "string" ? editing.initialText : "")
  }, [editorKey])
  if (editing === null) return null
  const kind = typeof editing.kind === "string" ? editing.kind : DEFAULT_KIND
  return React.createElement("div", { className: "mdan-editor" },
    editing.selText !== undefined ? React.createElement("div", { className: "mdan-editor-sel" }, "选中：" + truncate(editing.selText, 120)) : null,
    React.createElement("div", { className: "mdan-kindpick" },
      KIND_ORDER.map(function (kindId) {
        return React.createElement("button", {
          key: kindId,
          type: "button",
          className: "mdan-kindbtn mdan-kindbtn-" + kindId + (kind === kindId ? " mdan-kindbtn-on" : ""),
          onClick: function () { props.onPickKind(kindId) }
        }, kindLabel(kindId))
      })),
    React.createElement("textarea", {
      className: "mdan-editor-input",
      value: draft,
      placeholder: "写下对这一处内容的修改意见…",
      autoFocus: true,
      onChange: function (event) { setDraft(event.target.value) },
      onKeyDown: function (event) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault()
          props.onSave(draft, kind)
        }
      }
    }),
    React.createElement("div", { className: "mdan-editor-actions" },
      React.createElement("button", { type: "button", className: "mdan-btn mdan-btn-primary", onClick: function () { props.onSave(draft, kind) } }, editing.noteId !== undefined ? "保存修改" : "保存批注"),
      React.createElement("button", { type: "button", className: "mdan-btn", onClick: props.onCancel }, "取消")))
}

const NoteList = React.memo(function NoteList(props) {
  const notes = props.notes
  return React.createElement("div", { className: "mdan-notes" },
    notes.map(function (n) {
      return React.createElement("div", { key: n.id, className: "mdan-note" + (n.selText !== undefined ? " mdan-note-sel" : "") },
        kindTag(n.kind),
        React.createElement("span", { className: "mdan-note-text" },
          n.selText !== undefined ? React.createElement("div", { className: "mdan-note-quote" }, "「" + truncate(n.selText, 80) + "」") : null,
          n.note),
        React.createElement("button", { type: "button", className: "mdan-note-btn", onClick: function () { props.onEdit(n) } }, "编辑"),
        React.createElement("button", { type: "button", className: "mdan-note-btn", onClick: function () { props.onRemove(n.id) } }, "删除"))
    }))
})

const MdBlock = React.memo(function MdBlock(props) {
  const block = props.block
  const index = props.index
  const refIndex = props.refIndex
  const editing = props.editing

  if (block.type === "list") {
    return React.createElement("div", { className: "mdan-block" },
      React.createElement(block.ordered ? "ol" : "ul", { className: "mdan-list" },
        block.items.map(function (item, j) {
          const itemRef = encodeRef(index, j, refIndex.itemSigs[index][j])
          const itemNotes = props.notesByRef.get(itemRef) || []
          const itemEditing = editing !== null && editing.ref === itemRef
          return React.createElement("li", {
            key: j,
            className: "mdan-li" + (itemNotes.length > 0 ? " mdan-li-annotated" : "")
          },
            React.createElement("span", { className: "mdan-content", "data-mdan-ref": itemRef }, renderInline(item.source)),
            React.createElement("button", { type: "button", className: "mdan-add mdan-add-small", title: "批注此项", "aria-label": "批注此项", onClick: function () { props.onOpenBlock(itemRef, item.source, item.start, item.end) } }, "＋"),
            itemNotes.length > 0 ? React.createElement("span", { className: "mdan-count mdan-count-small" }, String(itemNotes.length)) : null,
            itemNotes.length > 0 ? React.createElement(NoteList, { notes: itemNotes, onEdit: props.onEdit, onRemove: props.onRemove }) : null,
            itemEditing ? React.createElement(AnnotationEditor, { editing: editing, onSave: props.onSave, onCancel: props.onCancel, onPickKind: props.onPickKind }) : null)
        })))
  }

  const ref = encodeRef(index, undefined, refIndex.blockSigs[index])
  const notes = props.notes
  const isEditing = editing !== null && editing.ref === ref
  return React.createElement("div", {
    className: "mdan-block" + (notes.length > 0 ? " mdan-block-annotated" : "")
  },
    React.createElement("div", { className: "mdan-content", "data-mdan-ref": ref }, blockContent(block)),
    notes.length > 0 ? React.createElement(NoteList, { notes: notes, onEdit: props.onEdit, onRemove: props.onRemove }) : null,
    React.createElement("button", { type: "button", className: "mdan-add", title: "批注此块", "aria-label": "批注此块", onClick: function () { props.onOpenBlock(ref, block.source, block.start, block.end) } }, "＋ 批注"),
    notes.length > 0 ? React.createElement("span", { className: "mdan-count" }, String(notes.length)) : null,
    isEditing ? React.createElement(AnnotationEditor, { editing: editing, onSave: props.onSave, onCancel: props.onCancel, onPickKind: props.onPickKind }) : null)
})

function MdAnnotateView(props) {
  const path = props.path
  const sessionId = props.scope === undefined ? undefined : props.scope.sessionId
  const content = props.content
  const annotationStore = props.annotationStore
  const panelPrefsStore = props.panelPrefsStore

  const tickState = React.useState(0)
  const tick = tickState[0]
  const setTick = tickState[1]
  const editingState = React.useState(null) // { ref, source, start, end, noteId?, kind, selStart?, selEnd?, selText?, initialText }
  const editing = editingState[0]
  const setEditing = editingState[1]
  const panelState = React.useState(function () { return panelPrefsStore.get(sessionId, path) })
  const panel = panelState[0]
  const setPanel = panelState[1]
  const feedbackState = React.useState(null) // { kind: 'ok'|'err', text, detail? }
  const feedback = feedbackState[0]
  const setFeedback = feedbackState[1]
  const anchorState = React.useState(null)
  const anchor = anchorState[0]
  const setAnchor = anchorState[1]
  const selState = React.useState(null) // { ref, start, end, text, x, y } | null
  const sel = selState[0]
  const setSel = selState[1]
  const selectedState = React.useState([])
  const selectedIds = selectedState[0]
  const setSelectedIds = selectedState[1]
  const modeState = React.useState("preview")
  const mode = modeState[0]
  const setMode = modeState[1]
  const sourceState = React.useState(function () { return content === undefined ? "" : content })
  const sourceDraft = sourceState[0]
  const setSourceDraft = sourceState[1]
  const dirtyState = React.useState(false)
  const dirty = dirtyState[0]
  const setDirty = dirtyState[1]
  const saveStateState = React.useState("idle")
  const saveState = saveStateState[0]
  const setSaveState = saveStateState[1]
  const sourceRef = React.useRef(sourceDraft)
  sourceRef.current = sourceDraft
  const saveRef = React.useRef(null)

  const rootRef = React.useRef(null)
  const scrollRef = React.useRef(null)
  const dragRef = React.useRef(null) // { kind, pointerId, startClientX/Y, baseX/Y/W/H, lastClientX/Y, frame }
  const editingRef = React.useRef(null)
  const selRef = React.useRef(null)
  const panelOpenRef = React.useRef(false)
  const togglePanelRef = React.useRef(null)
  const lastKindRef = React.useRef(DEFAULT_KIND)
  editingRef.current = editing
  selRef.current = sel
  panelOpenRef.current = panel.open === true

  React.useEffect(function () {
    setMode("preview")
    setSourceDraft(content === undefined ? "" : content)
    setDirty(false)
    setSaveState("idle")
  }, [content, path])
  const blocks = React.useMemo(function () {
    return parseBlocks(sourceDraft)
  }, [sourceDraft])
  const refIndex = React.useMemo(function () {
    return buildRefIndex(blocks)
  }, [blocks])
  const annotations = React.useMemo(function () {
    return reanchorNotes(blocks, annotationStore.get(sessionId, path), refIndex)
  }, [tick, sessionId, path, blocks, refIndex, annotationStore])
  const notesByRef = React.useMemo(function () {
    const m = new Map()
    annotations.forEach(function (n) {
      const arr = m.get(n.ref)
      if (arr === undefined) m.set(n.ref, [n])
      else arr.push(n)
    })
    return m
  }, [annotations])
  const selectedSet = React.useMemo(function () {
    return new Set(selectedIds)
  }, [selectedIds])

  React.useEffect(function () {
    setSelectedIds([])
  }, [sessionId, path])

  function persistOrClear(list) {
    if (list.length === 0) annotationStore.clear(sessionId, path)
    else annotationStore.set(sessionId, path, list)
    setTick(function (t) { return t + 1 })
  }

  // Read one plugin-owned setting (declared through settings.pluginToggles and
  // persisted by the sidebar under pluginSettings['md-annotator']).
  function pluginSetting(key, fallback) {
    const store = props.store
    try {
      if (store === undefined || typeof store.getPrefs !== "function") return fallback
      const blob = store.getPrefs().pluginSettings
      const mine = blob === undefined || blob === null ? undefined : blob["md-annotator"]
      if (mine !== undefined && mine !== null && mine[key] !== undefined) return mine[key]
    } catch (error) {
      console.debug("[dsh-md-annotator] pluginSetting read failed:", error)
    }
    return fallback
  }

  const openEditorCb = React.useCallback(function (ref, source, start, end) {
    setEditing({ ref: ref, source: source, start: start, end: end, kind: lastKindRef.current, initialText: "" })
    setFeedback(null)
  }, [])
  const openEditorForCb = React.useCallback(function (note) {
    setEditing({
      ref: note.ref, source: note.source, start: note.start, end: note.end,
      noteId: note.id, kind: typeof note.kind === "string" ? note.kind : lastKindRef.current,
      selStart: note.selStart, selEnd: note.selEnd, selText: note.selText, initialText: note.note
    })
    setFeedback(null)
  }, [])
  const pickKindCb = React.useCallback(function (kindId) {
    setEditing(function (e) { return e === null ? null : Object.assign({}, e, { kind: kindId }) })
  }, [])
  const cancelCb = React.useCallback(function () {
    setEditing(null)
  }, [])
  const saveEditingCb = React.useCallback(function (text, kind) {
    const e = editingRef.current
    if (e === null) return
    const t = String(text).trim()
    if (t === "") {
      setFeedback({ kind: "err", text: "批注内容为空" })
      return
    }
    const k = typeof kind === "string" ? kind : DEFAULT_KIND
    lastKindRef.current = k
    const list = annotationStore.get(sessionId, path)
    if (e.noteId === undefined) {
      const note = {
        v: 1,
        id: newNoteId(),
        ref: e.ref,
        source: e.source,
        start: e.start,
        end: e.end,
        kind: k,
        note: t,
        selStart: e.selStart, selEnd: e.selEnd, selText: e.selText
      }
      persistOrClear(list.concat([note]))
    } else {
      persistOrClear(list.map(function (n) {
        return n.id === e.noteId ? Object.assign({}, n, { note: t, kind: k, selStart: e.selStart, selEnd: e.selEnd, selText: e.selText }) : n
      }))
    }
    setEditing(null)
  }, [sessionId, path, annotationStore])
  const removeNoteCb = React.useCallback(function (noteId) {
    persistOrClear(annotationStore.get(sessionId, path).filter(function (n) { return n.id !== noteId }))
    setSelectedIds(function (ids) { return ids.filter(function (id) { return id !== noteId }) })
    setEditing(function (e) { return e !== null && e.noteId === noteId ? null : e })
  }, [sessionId, path, annotationStore])

  // ── free-text selection annotation ────────────────────────────────────
  function captureSelection() {
    const s = window.getSelection()
    if (s === null || s.isCollapsed || s.rangeCount === 0) return null
    const range = s.getRangeAt(0)
    function unitOf(node) {
      if (node === null) return null
      const el = node.nodeType === 3 ? node.parentElement : node
      return el === null ? null : el.closest("[data-mdan-ref]")
    }
    const unit = unitOf(range.commonAncestorContainer)
    if (unit === null) return null
    if (unitOf(s.anchorNode) !== unit || unitOf(s.focusNode) !== unit) return null
    if (unit.closest(".mdan-editor") !== null || unit.closest(".mdan-panel") !== null) return null
    let start = boundaryOffset(unit, range.startContainer, range.startOffset)
    let end = boundaryOffset(unit, range.endContainer, range.endOffset)
    if (start === null || end === null) return null
    if (start > end) { const tmp = start; start = end; end = tmp }
    const text = unit.textContent.slice(start, end)
    if (text.trim() === "") return null
    return { ref: unit.getAttribute("data-mdan-ref"), start: start, end: end, text: text, rect: range.getBoundingClientRect() }
  }
  function handleSelection() {
    const pick = captureSelection()
    if (pick === null) { setSel(null); return }
    const scrollEl = scrollRef.current
    if (scrollEl === null) { setSel(null); return }
    const sr = scrollEl.getBoundingClientRect()
    pick.x = clamp(pick.rect.left - sr.left + scrollEl.scrollLeft, 4, Math.max(4, scrollEl.clientWidth - 96))
    pick.y = clamp(pick.rect.bottom - sr.top + scrollEl.scrollTop + 6, 4, Math.max(4, scrollEl.scrollHeight - 24))
    setSel(pick)
  }
  function openSelEditor() {
    if (sel === null) return
    const d = decodeRef(sel.ref)
    const block = d === null ? undefined : blocks[d.index]
    if (block === undefined) { setSel(null); return }
    const item = d !== null && d.kind === "i" && block.type === "list" && d.item !== undefined ? block.items[d.item] : undefined
    setEditing({
      ref: sel.ref,
      source: item !== undefined ? item.source : block.source,
      start: item !== undefined ? item.start : block.start,
      end: item !== undefined ? item.end : block.end,
      kind: lastKindRef.current,
      selStart: sel.start, selEnd: sel.end, selText: sel.text,
      initialText: ""
    })
    setFeedback(null)
    setSel(null)
  }

  function displayPath() {
    const cwd = props.scope === undefined ? undefined : props.scope.cwd
    if (typeof cwd === "string" && typeof path === "string" && path.indexOf(cwd) === 0) {
      const rel = path.slice(cwd.length).replace(/^[/\\]+/, "")
      return rel === "" ? path : rel
    }
    return path
  }
  function excerptLines(n) {
    const source = n.selText !== undefined ? n.selText : n.source
    const s = truncate(source, 240)
    if (s.trim() === "") return ["（空内容）"]
    return s.split("\n")
  }
  function clearAll() {
    annotationStore.clear(sessionId, path)
    setTick(function (t) { return t + 1 })
    setSelectedIds([])
    setFeedback({ kind: "ok", text: "已清空" })
  }
  function togglePanel(next) {
    setPanel(function (prev) {
      const open = typeof next === "boolean" ? next : !prev.open
      if (!open) {
        const closed = Object.assign({}, prev, { open: false })
        panelPrefsStore.set(sessionId, path, closed)
        return closed
      }
      const root = rootRef.current
      const rect = root === null ? null : root.getBoundingClientRect()
      let nextPrefs = Object.assign({}, prev, { open: true })
      if (typeof nextPrefs.x !== "number" || typeof nextPrefs.y !== "number") {
        nextPrefs.x = rect === null ? 24 : rect.left + 16
        nextPrefs.y = rect === null ? 24 : rect.top + 16
      }
      nextPrefs = clampPanel(nextPrefs, window.innerWidth, window.innerHeight)
      panelPrefsStore.set(sessionId, path, nextPrefs)
      return nextPrefs
    })
  }
  function toggleBar() {
    setPanel(function (prev) {
      const nextPrefs = Object.assign({}, prev, { barCollapsed: prev.barCollapsed !== true })
      panelPrefsStore.set(sessionId, path, nextPrefs)
      return nextPrefs
    })
  }
  togglePanelRef.current = togglePanel

  function beginDrag(event, kind) {
    if (dragRef.current !== null) return
    const root = rootRef.current
    const rect = root === null ? null : root.getBoundingClientRect()
    const target = event.currentTarget
    if (target !== null && typeof target.setPointerCapture === "function") {
      try { target.setPointerCapture(event.pointerId) } catch (error) { console.debug("[dsh-md-annotator] setPointerCapture failed:", error) }
    }
    dragRef.current = {
      kind: kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseX: typeof panel.x === "number" ? panel.x : (rect === null ? 24 : rect.left + 16),
      baseY: typeof panel.y === "number" ? panel.y : (rect === null ? 24 : rect.top + 16),
      baseW: typeof panel.w === "number" ? panel.w : PANEL_DEFAULTS.w,
      baseH: typeof panel.h === "number" ? panel.h : PANEL_DEFAULTS.h,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      frame: null
    }
  }
  function dragGeom(d) {
    const dx = d.lastClientX - d.startClientX
    const dy = d.lastClientY - d.startClientY
    if (d.kind === "move") {
      return {
        x: clamp(d.baseX + dx, PANEL_MARGIN.x, Math.max(PANEL_MARGIN.x, window.innerWidth - PANEL_MARGIN.keepX)),
        y: clamp(d.baseY + dy, PANEL_MARGIN.y, Math.max(PANEL_MARGIN.y, window.innerHeight - PANEL_MARGIN.keepY))
      }
    }
    return {
      w: clamp(d.baseW + dx, PANEL_MIN.w, Math.max(PANEL_MIN.w, window.innerWidth - d.baseX - PANEL_MARGIN.x)),
      h: clamp(d.baseH + dy, PANEL_MIN.h, Math.max(PANEL_MIN.h, window.innerHeight - d.baseY - PANEL_MARGIN.y))
    }
  }
  function moveDrag(event) {
    const d = dragRef.current
    if (d === null || d.pointerId !== event.pointerId) return
    event.preventDefault()
    d.lastClientX = event.clientX
    d.lastClientY = event.clientY
    if (d.frame === null) {
      d.frame = requestAnimationFrame(function () {
        d.frame = null
        if (dragRef.current !== d) return
        const geom = dragGeom(d)
        setPanel(function (p) { return Object.assign({}, p, geom) })
      })
    }
  }
  function endDrag(event) {
    const d = dragRef.current
    if (d === null || d.pointerId !== event.pointerId) return
    dragRef.current = null
    if (d.frame !== null) { cancelAnimationFrame(d.frame); d.frame = null }
    const geom = dragGeom(d)
    setPanel(function (p) {
      const next = Object.assign({}, p, geom)
      panelPrefsStore.set(sessionId, path, next)
      return next
    })
  }

  function sendNotes(notes) {
    if (!notes || notes.length === 0) return
    const rootCtx = props.ctx
    const sessions = rootCtx !== undefined && typeof rootCtx.get === "function" ? rootCtx.get("sessions") : undefined
    const conversation = rootCtx !== undefined && typeof rootCtx.get === "function" ? rootCtx.get("conversation") : undefined
    if (sessions === undefined || conversation === undefined) {
      setFeedback({ kind: "err", text: "无法写入对话框", detail: "未找到会话输入服务" })
      return
    }
    let actx = undefined
    try { actx = sessions.scope(sessionId) } catch (error) { console.debug("[dsh-md-annotator] sessions.scope failed:", error) }
    if (actx === undefined) {
      setFeedback({ kind: "err", text: "无法写入对话框", detail: "当前会话不可用" })
      return
    }
    try {
      const input = conversation.input.for(actx)
      const current = input.state.getSnapshot().draft
      const prefix = String(pluginSetting("reportPrefix", "")).trim()
      const report = formatReport({
        notes: notes,
        prefix: prefix,
        pathLabel: displayPath(),
        excerptOf: excerptLines,
        isStale: function (n) { return n.stale === true }
      })
      input.setDraft(current.trim() === "" ? report : current + "\n\n" + report)
      const sentIds = notes.map(function (n) { return n.id })
      if (pluginSetting("clearAfterSend", true) === true) {
        persistOrClear(annotationStore.get(sessionId, path).filter(function (n) { return sentIds.indexOf(n.id) === -1 }))
        setSelectedIds(function (ids) { return ids.filter(function (id) { return sentIds.indexOf(id) === -1 }) })
        setFeedback({ kind: "ok", text: "已发送 " + notes.length + " 条", detail: "已写入对话框草稿并清空已发送批注，回车即可发送" })
      } else {
        setFeedback({ kind: "ok", text: "已发送 " + notes.length + " 条", detail: "已写入对话框草稿，批注保留，回车即可发送" })
      }
    } catch (error) {
      console.error("[dsh-md-annotator] draft insert failed:", error)
      setFeedback({ kind: "err", text: "写入失败", detail: String(error && error.message ? error.message : error) })
    }
  }
  function sendToDraft() { sendNotes(annotations) }
  function sendSelected() { sendNotes(annotations.filter(function (n) { return selectedSet.has(n.id) })) }
  function toggleSelected(noteId) {
    setSelectedIds(function (ids) {
      return ids.indexOf(noteId) === -1 ? ids.concat([noteId]) : ids.filter(function (id) { return id !== noteId })
    })
  }
  function toggleSelectAll() {
    if (annotations.length === 0) return
    const allOn = annotations.every(function (n) { return selectedSet.has(n.id) })
    setSelectedIds(allOn ? [] : annotations.map(function (n) { return n.id }))
  }
  function exportJson() {
    if (annotations.length === 0) { setFeedback({ kind: "err", text: "没有可导出的批注" }); return }
    const data = {
      plugin: "dsh-md-annotator",
      version: 1,
      exportedAt: new Date().toISOString(),
      path: path,
      sessionId: sessionId === undefined ? null : sessionId,
      notes: annotations.map(function (n) {
        return { v: n.v, id: n.id, ref: n.ref, source: n.source, start: n.start, end: n.end, kind: n.kind, note: n.note, selStart: n.selStart, selEnd: n.selEnd, selText: n.selText }
      })
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "md-annotations.json"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  React.useEffect(function () {
    if (anchor === null || rootRef.current === null) return
    const el = rootRef.current.querySelector('[data-mdan-ref="' + anchor + '"]')
    if (el !== null) el.scrollIntoView({ block: "center", behavior: "smooth" })
    setAnchor(null)
  }, [anchor])

  // Register the Escape handler once (latest state read via refs); ignore
  // Escape while the host's own input fields are focused.
  React.useEffect(function () {
    function onKey(event) {
      if (event.key !== "Escape") return
      const t = event.target
      if (t !== null && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable === true)) return
      if (editingRef.current !== null) {
        setEditing(null)
        event.preventDefault()
        return
      }
      if (selRef.current !== null) {
        setSel(null)
        event.preventDefault()
        return
      }
      if (panelOpenRef.current === true) {
        togglePanelRef.current(false)
        event.preventDefault()
      }
    }
    window.addEventListener("keydown", onKey)
    return function () { window.removeEventListener("keydown", onKey) }
  }, [])

  // Paint text-selection ranges through CSS Custom Highlight. Degrades to
  // chips-only without CSS.highlights. One DOM pass builds the ref→element map.
  React.useEffect(function () {
    const canHighlight = typeof CSS !== "undefined" && CSS.highlights !== undefined && typeof Highlight === "function"
    if (!canHighlight) return undefined
    if (rootRef.current === null) return undefined
    const elByRef = new Map()
    rootRef.current.querySelectorAll("[data-mdan-ref]").forEach(function (el) {
      elByRef.set(el.getAttribute("data-mdan-ref"), el)
    })
    const ranges = []
    annotations.forEach(function (n) {
      if (n.selStart === undefined || n.selEnd === undefined) return
      const el = elByRef.get(n.ref)
      if (el === undefined) return
      let s = n.selStart
      let e = n.selEnd
      if (el.textContent.slice(s, e) !== n.selText) {
        const idx = el.textContent.indexOf(n.selText)
        if (idx === -1) return
        s = idx
        e = idx + n.selText.length
      }
      const r = rangeFromOffsets(el, s, e)
      if (r !== null) ranges.push(r)
    })
    if (ranges.length === 0) CSS.highlights.delete("mdan-sel")
    else CSS.highlights.set("mdan-sel", new Highlight(...ranges))
    return function () { CSS.highlights.delete("mdan-sel") }
  }, [annotations, blocks])

  // Pull a floating panel back into the viewport on window resize (RAF-throttled).
  React.useEffect(function () {
    let frame = null
    function onResize() {
      if (panelOpenRef.current !== true) return
      if (frame !== null) return
      frame = requestAnimationFrame(function () {
        frame = null
        setPanel(function (p) {
          if (p.open !== true || typeof p.x !== "number" || typeof p.y !== "number") return p
          const next = clampPanel(p, window.innerWidth, window.innerHeight)
          if (next.x === p.x && next.y === p.y && next.w === p.w && next.h === p.h) return p
          panelPrefsStore.set(sessionId, path, next)
          return next
        })
      })
    }
    window.addEventListener("resize", onResize)
    return function () {
      window.removeEventListener("resize", onResize)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [sessionId, path, panelPrefsStore])

  function saveSource() {
    if (!dirty || saveState === "saving") return
    setSaveState("saving")
    const scope = props.scope || {}
    const payload = { sessionId: scope.sessionId, path: path, content: sourceRef.current }
    if (scope.cwd !== undefined && scope.cwd !== "") payload.cwd = scope.cwd
    fetch("/sidebar/api/fs.write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status)
      return response.json()
    }).then(function (body) {
      if (!body || body.ok !== true) throw new Error(body && body.error && body.error.message ? body.error.message : "保存失败")
      setDirty(false)
      setSaveState("saved")
    }).catch(function (error) {
      setSaveState("failed")
      setFeedback({ kind: "err", text: "保存失败", detail: String(error && error.message ? error.message : error) })
    })
  }
  saveRef.current = saveSource

  React.useEffect(function () {
    if (props.toolbar !== "host") return undefined
    const state = { modes: true, mode: mode, dirty: dirty, editable: content !== undefined, saveState: saveState }
    if (typeof props.onToolbarState === "function") props.onToolbarState(state)
    if (typeof props.onToolbarControls === "function") {
      props.onToolbarControls({ setMode: setMode, save: function () { if (saveRef.current !== null) saveRef.current() } })
      return function () { props.onToolbarControls(null) }
    }
    return undefined
  }, [props.toolbar, mode, dirty, saveState, content])

  function renderListPanel() {
    const allOn = annotations.length > 0 && annotations.every(function (n) { return selectedSet.has(n.id) })
    let selectedCount = 0
    annotations.forEach(function (n) { if (selectedSet.has(n.id)) selectedCount++ })
    const rows = annotations.map(function (n, k) {
      const checked = selectedSet.has(n.id)
      return React.createElement("div", { key: n.id, className: "mdan-row" },
        React.createElement("input", {
          type: "checkbox",
          className: "mdan-row-check",
          checked: checked,
          title: checked ? "取消勾选" : "勾选这条",
          "aria-label": checked ? "取消勾选" : "勾选这条",
          onChange: function () { toggleSelected(n.id) }
        }),
        React.createElement("button", {
          type: "button",
          className: "mdan-row-jump",
          title: "定位到原文",
          "aria-label": "定位到原文",
          onClick: function () { setAnchor(n.ref) }
        }, String(k + 1) + "."),
        React.createElement("div", { className: "mdan-row-body" },
          kindTag(n.kind),
          React.createElement("div", { className: "mdan-row-note" }, n.note),
          React.createElement("div", { className: "mdan-row-quote" }, (n.selText !== undefined ? "选中：" + truncate(n.selText, 120) : "原文：" + truncate(n.source, 120)) + (n.stale === true ? "（原文已变化）" : ""))),
        React.createElement("button", {
          type: "button",
          className: "mdan-icon-btn",
          title: "发送这条到对话框",
          "aria-label": "发送这条到对话框",
          onClick: function () { sendNotes([n]) }
        }, "➤"),
        React.createElement("button", {
          type: "button",
          className: "mdan-note-btn",
          title: "移除这条批注",
          "aria-label": "移除这条批注",
          onClick: function () { removeNoteCb(n.id) }
        }, "移除"))
    })
    const style = {
      left: (typeof panel.x === "number" ? panel.x : 16) + "px",
      top: (typeof panel.y === "number" ? panel.y : 16) + "px",
      width: (typeof panel.w === "number" ? panel.w : PANEL_DEFAULTS.w) + "px",
      height: (typeof panel.h === "number" ? panel.h : PANEL_DEFAULTS.h) + "px"
    }
    return React.createElement("div", { className: "mdan-panel", style: style, role: "dialog", "aria-label": "批注清单" },
      React.createElement("div", {
        className: "mdan-panel-head",
        onPointerDown: function (event) { beginDrag(event, "move") },
        onPointerMove: moveDrag,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onLostPointerCapture: endDrag
      },
        React.createElement("span", { className: "mdan-panel-title", title: "拖动标题栏可移动" }, "批注清单"),
        React.createElement("button", {
          type: "button",
          className: "mdan-icon-btn",
          title: allOn ? "取消全选" : "全选",
          "aria-label": allOn ? "取消全选" : "全选",
          disabled: annotations.length === 0,
          onPointerDown: function (event) { event.stopPropagation() },
          onMouseDown: function (event) { event.stopPropagation() },
          onClick: toggleSelectAll
        }, allOn ? "☐" : "☑"),
        React.createElement("button", {
          type: "button",
          className: "mdan-icon-btn",
          title: selectedCount > 0 ? "发送所选项到对话框（" + selectedCount + "）" : "发送所选项到对话框",
          "aria-label": "发送所选项到对话框",
          disabled: selectedCount === 0,
          onPointerDown: function (event) { event.stopPropagation() },
          onMouseDown: function (event) { event.stopPropagation() },
          onClick: sendSelected
        }, "➤"),
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
          title: "导出为 JSON",
          "aria-label": "导出为 JSON",
          disabled: annotations.length === 0,
          onPointerDown: function (event) { event.stopPropagation() },
          onMouseDown: function (event) { event.stopPropagation() },
          onClick: exportJson
        }, "导出"),
        React.createElement("button", {
          type: "button",
          className: "mdan-note-btn",
          "aria-label": "关闭清单",
          onPointerDown: function (event) { event.stopPropagation() },
          onMouseDown: function (event) { event.stopPropagation() },
          onClick: function () { togglePanel(false) }
        }, "关闭")),
      React.createElement("div", { className: "mdan-panel-body" },
        rows.length === 0
          ? React.createElement("div", { className: "mdan-empty" }, "还没有批注。悬停段落点「＋批注」，或拖选文字点「＋批注选区」。")
          : rows),
      React.createElement("div", {
        className: "mdan-panel-resize",
        title: "拖动调整大小",
        "aria-label": "拖动调整大小",
        onPointerDown: function (event) { event.stopPropagation(); beginDrag(event, "resize") },
        onPointerMove: moveDrag,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onLostPointerCapture: endDrag
      }))
  }

  function renderBar() {
    const collapsed = panel.barCollapsed === true
    return React.createElement("div", { className: "mdan-bar" + (collapsed ? " mdan-bar-collapsed" : "") },
      React.createElement("button", {
        type: "button",
        className: "mdan-bar-handle",
        title: collapsed ? "展开批注栏" : "收起批注栏",
        "aria-label": collapsed ? "展开批注栏" : "收起批注栏",
        onClick: toggleBar
      }, collapsed ? "︿" : "﹀"),
      React.createElement("div", { className: "mdan-bar-body" },
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
          className: "mdan-btn",
          disabled: annotations.length === 0,
          onClick: exportJson
        }, "导出"),
        React.createElement("button", {
          type: "button",
          className: "mdan-btn mdan-btn-primary",
          disabled: annotations.length === 0,
          onClick: sendToDraft
        }, "全部发送"),
        feedback !== null ? React.createElement("span", {
          className: "mdan-feedback" + (feedback.kind === "err" ? " mdan-feedback-err" : ""),
          title: feedback.detail !== undefined ? feedback.detail : feedback.text
        }, feedback.text) : null))
  }

  const body = blocks.map(function (block, index) {
    const ref = encodeRef(index, undefined, refIndex.blockSigs[index])
    const blockNotes = notesByRef.get(ref) || []
    return React.createElement(MdBlock, {
      key: "b" + index,
      block: block,
      index: index,
      refIndex: refIndex,
      notesByRef: notesByRef,
      notes: blockNotes,
      editing: editing,
      onOpenBlock: openEditorCb,
      onEdit: openEditorForCb,
      onRemove: removeNoteCb,
      onPickKind: pickKindCb,
      onSave: saveEditingCb,
      onCancel: cancelCb
    })
  })

  const rootClass = "mdan-root"
    + (sel !== null ? " mdan-selecting" : "")
    + (editing !== null ? " mdan-editing" : "")
    + (mode === "edit" ? " mdan-source-mode" : "")
  if (mode === "edit") {
    return React.createElement("div", { className: rootClass, ref: rootRef },
      content === undefined
        ? React.createElement("div", { className: "mdan-loading" }, "加载中…")
        : React.createElement(MarkdownSourceEditor, {
          value: sourceDraft,
          onChange: function (value) { setSourceDraft(value); setDirty(true); setSaveState("idle") },
          onSave: saveSource
        }),
      React.createElement("div", { className: "mdan-source-status" },
        dirty ? "有未保存修改" : saveState === "saved" ? "已保存" : "源码编辑模式"))
  }
  return React.createElement("div", { className: rootClass, ref: rootRef, onMouseUp: function () { handleSelection() } },
    React.createElement("div", { className: "mdan-scroll", ref: scrollRef },
      props.truncated === true ? React.createElement("div", { className: "mdan-banner" }, "文件过大，仅预览截断内容") : null,
      content === undefined ? React.createElement("div", { className: "mdan-loading" }, "加载中…") : null,
      content !== undefined && blocks.length === 0 ? React.createElement("div", { className: "mdan-empty" }, "（空文档）") : null,
      body,
      sel !== null ? React.createElement("button", {
        type: "button",
        className: "mdan-selpick",
        style: { left: sel.x + "px", top: sel.y + "px" },
        title: "针对选中的文字添加批注",
        "aria-label": "针对选中的文字添加批注",
        onMouseDown: function (event) { event.preventDefault(); event.stopPropagation() },
        onClick: function () { openSelEditor() }
      }, "＋ 批注选区（" + sel.text.length + " 字）") : null),
    panel.open ? renderListPanel() : null,
    renderBar())
}
