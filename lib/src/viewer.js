function MdAnnotateView(props) {
  const path = props.path
  const sessionId = props.sessionId
  const content = props.content
  const annotationStore = props.annotationStore
  const panelPrefsStore = props.panelPrefsStore

  const editingState = useViewState(props.view, "editing", null)
  const editing = editingState[0]
  const setEditing = editingState[1]
  const panelState = useViewState(props.view, "panel", { open: false, barCollapsed: false })
  const panel = panelState[0]
  const setPanel = panelState[1]
  const feedbackState = React.useState(null)
  const feedback = feedbackState[0]
  const setFeedback = feedbackState[1]
  const anchorState = React.useState(null)
  const anchor = anchorState[0]
  const setAnchor = anchorState[1]
  const selState = React.useState(null)
  const sel = selState[0]
  const setSel = selState[1]
  const selectedState = useViewState(props.view, "selected", [])
  const selectedIds = selectedState[0]
  const setSelectedIds = selectedState[1]
  const modeState = useViewState(props.view, "mode", "preview")
  const mode = props.settings.enabled ? modeState[0] : "edit"
  const setMode = modeState[1]
  const sourceDraft = props.state.draft
  const dirty = props.state.dirty
  const saveState = props.state.saveState
  const saveSource = props.save
  const panelRef = React.useRef(null)
  if (!props.view.editorDrafts) props.view.editorDrafts = new Map()
  const draftCache = props.view.editorDrafts

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

  const blocks = React.useMemo(function () {
    return parseBlocks(sourceDraft)
  }, [sourceDraft])
  const refIndex = React.useMemo(function () {
    return buildRefIndex(blocks)
  }, [blocks])
  const annotations = React.useMemo(function () {
    return reanchorNotes(blocks, annotationStore.get(sessionId, path), refIndex)
  }, [props.state.notes, sessionId, path, blocks, refIndex, annotationStore])
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

  function persistOrClear(list) {
    if (list.length === 0) annotationStore.clear(sessionId, path)
    else annotationStore.set(sessionId, path, list)
  }

  function pluginSetting(key, fallback) {
    return props.settings[key] === undefined ? fallback : props.settings[key]
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
    draftCache.clear()
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
    draftCache.clear()
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
    if (unit === null || !rootRef.current || !rootRef.current.contains(unit)) return null
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

  function displayPath() { return path }
  function excerptLines(n) {
    const source = n.selText !== undefined ? n.selText : n.source
    const s = truncate(source, 240)
    if (s.trim() === "") return ["（空内容）"]
    return s.split("\n")
  }
  function clearAll() {
    annotationStore.clear(sessionId, path)
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
    try {
      const prefix = String(pluginSetting("reportPrefix", "")).trim()
      const report = formatReport({
        notes: notes,
        prefix: prefix,
        pathLabel: displayPath(),
        excerptOf: excerptLines,
        isStale: function (n) { return n.stale === true }
      })
      props.appendReport(report)
      const sentIds = notes.map(function (n) { return n.id })
      if (pluginSetting("clearAfterSend", true) === true) {
        persistOrClear(annotationStore.get(sessionId, path).filter(function (n) { return sentIds.indexOf(n.id) === -1 }))
        setSelectedIds(function (ids) { return ids.filter(function (id) { return sentIds.indexOf(id) === -1 }) })
        setFeedback({ kind: "ok", text: "已写入草稿 " + notes.length + " 条", detail: "已写入对话框草稿并清空已发送批注，回车即可发送" })
      } else {
        setFeedback({ kind: "ok", text: "已写入草稿 " + notes.length + " 条", detail: "已写入对话框草稿，批注保留，回车即可发送" })
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
      if (!rootRef.current || (!rootRef.current.contains(t) && !(panelRef.current && panelRef.current.contains(t)))) return
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
    if (rootRef.current === null || mode !== "preview" || props.visible === false) return undefined
    const highlightName = props.highlightId
    const rule = document.createElement("style")
    rule.textContent = "::highlight(" + highlightName + "){background:rgba(245,158,11,.28)}"
    document.head.appendChild(rule)
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
    if (ranges.length === 0) CSS.highlights.delete(highlightName)
    else CSS.highlights.set(highlightName, new Highlight(...ranges))
    return function () { CSS.highlights.delete(highlightName); rule.remove() }
  }, [annotations, blocks, mode, props.visible, props.highlightId])

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

  React.useEffect(() => () => {
    if (dragRef.current && dragRef.current.frame !== null) cancelAnimationFrame(dragRef.current.frame)
  }, [])
  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const focus = event => {
      if (event.target.closest("input,textarea,button,a,[contenteditable]")) return
      root.focus({ preventScroll: true })
    }
    root.addEventListener("mousedown", focus)
    return () => root.removeEventListener("mousedown", focus)
  }, [])
  React.useEffect(() => {
    const scroll = scrollRef.current
    if (scroll) scroll.scrollTop = props.view.getSnapshot().scrollTop || 0
  }, [mode])
  React.useEffect(() => {
    if (content === undefined || !props.visible) return
    const navigation = props.navigation || {}
    const line = navigation.params && navigation.params.line
    if (!Number.isSafeInteger(line) || line < 1 || props.view.getSnapshot().navigationRevision === navigation.revision) return
    if (mode !== "preview" && props.settings.enabled) { setMode("preview"); return }
    if (mode !== "preview") return
    let index = blocks.findIndex(block => block.start <= line && block.end >= line)
    if (index < 0) index = blocks.findIndex(block => block.start >= line)
    if (index < 0) index = blocks.length - 1
    if (index >= 0) {
      const block = blocks[index]
      const item = block.type === "list" ? Math.max(0, block.items.findIndex(it => it.start <= line && it.end >= line)) : undefined
      setAnchor(encodeRef(index, item, item === undefined ? refIndex.blockSigs[index] : refIndex.itemSigs[index][item]))
    }
    props.view.update({ navigationRevision: navigation.revision })
  }, [props.navigation && props.navigation.revision, content, mode, props.visible])

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
    return React.createElement("div", { ref: panelRef, className: "mdan-panel", style: style, role: "dialog", "aria-label": "批注清单" },
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
        }, "全部写入草稿"),
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
      onCancel: cancelCb,
      draftCache: draftCache
    })
  })

  const rootClass = "mdan-root"
    + (sel !== null ? " mdan-selecting" : "")
    + (editing !== null ? " mdan-editing" : "")
    + (mode === "edit" ? " mdan-source-mode" : "")
  const toolbar = React.createElement(MdToolbar, {
    state: props.state, settings: props.settings, view: props.view, mode: mode, setMode: setMode,
    save: saveSource, reload: props.reload, setSettings: props.setSettings,
    download: () => downloadText(sourceDraft, path.split(/[\\/]/).pop() || "draft.md")
  })
  const metaBanner = props.metaError ? React.createElement("div", { className: "mdan-banner", role: "alert" }, props.metaError) : null
  if (mode === "edit") {
    return React.createElement("div", { className: rootClass, ref: rootRef, tabIndex: -1 },
      toolbar, metaBanner,
      content === undefined
        ? React.createElement("div", { className: "mdan-loading" }, "加载中…")
        : React.createElement(MarkdownSourceEditor, {
          value: sourceDraft,
          disabled: props.state.loading,
          editorRef: el => { if (el && props.view.sourceElement !== el) { props.view.sourceElement = el; el.scrollTop = props.view.getSnapshot().sourceScroll || 0 } },
          onScroll: e => { props.view.update({ sourceScroll: e.currentTarget.scrollTop }) },
          onChange: function (value) { props.doc.edit(content && content.includes("\r\n") ? value.replace(/\r?\n/g, "\r\n") : value) },
          onSave: saveSource
        }),
      React.createElement("div", { className: "mdan-source-status" },
        dirty ? "有未保存修改" : saveState === "saved" ? "已保存" : "源码编辑模式"))
  }
  return React.createElement("div", { className: rootClass, ref: rootRef, tabIndex: -1, onMouseUp: function () { handleSelection() } },
    toolbar, metaBanner,
    React.createElement("div", { className: "mdan-scroll", ref: scrollRef, onScroll: e => { props.view.update({ scrollTop: e.currentTarget.scrollTop }) } },
      props.truncated === true ? React.createElement("div", { className: "mdan-banner" }, "文件过大，仅预览截断内容") : null,
      content === undefined ? React.createElement("div", { className: "mdan-loading" }, "加载中…") : null,
      content !== undefined && blocks.length === 0 ? React.createElement("div", { className: "mdan-empty" }, "（空文档）") : null,
      React.createElement('div', { className: 'mdan-page' + (annotations.length || editing ? ' mdan-page-with-rail' : '') },
        React.createElement('article', { className: 'mdan-article' }, body),
        annotations.length || editing ? React.createElement(AnnotationRail, {
          notes: annotations, editing: editing, content: sourceDraft, draftCache: draftCache,
          onSave: saveEditingCb, onCancel: cancelCb, onPickKind: pickKindCb,
          onEdit: openEditorForCb, onRemove: removeNoteCb, onLocate: setAnchor,
          onSend: n => sendNotes([n]),
          onCopy: async n => {
            try { await navigator.clipboard.writeText(n.note); setFeedback({ kind: 'ok', text: '已复制批注' }) }
            catch (_) { setFeedback({ kind: 'err', text: '复制失败，请检查剪贴板权限' }) }
          }
        }) : null),
      sel !== null ? React.createElement("button", {
        type: "button",
        className: "mdan-selpick",
        style: { left: sel.x + "px", top: sel.y + "px" },
        title: "针对选中的文字添加批注",
        "aria-label": "针对选中的文字添加批注",
        onMouseDown: function (event) { event.preventDefault(); event.stopPropagation() },
        onClick: function () { openSelEditor() }
      }, "＋ 批注选区（" + sel.text.length + " 字）") : null),
    panel.open && props.visible !== false ? ReactDOM.createPortal(renderListPanel(), document.body) : null,
    renderBar())
}
