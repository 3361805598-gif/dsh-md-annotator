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
    disabled: props.disabled,
    ref: props.editorRef,
    onScroll: props.onScroll,
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
    setDraft(props.draftCache.has(editorKey) ? props.draftCache.get(editorKey) : editing !== null && typeof editing.initialText === "string" ? editing.initialText : "")
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
      onChange: function (event) { setDraft(event.target.value); props.draftCache.set(editorKey, event.target.value) },
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

const MdBlock = React.memo(function MdBlock(props) {
  const block = props.block
  const index = props.index
  const refIndex = props.refIndex

  if (block.type === "list") {
    return React.createElement("div", { className: "mdan-block mdan-block-list" },
      React.createElement(block.ordered ? "ol" : "ul", { className: "mdan-list" },
        block.items.map(function (item, j) {
          const itemRef = encodeRef(index, j, refIndex.itemSigs[index][j])
          const itemNotes = props.notesByRef.get(itemRef) || []
          return React.createElement("li", {
            key: j,
            className: "mdan-li" + (itemNotes.length > 0 ? " mdan-li-annotated" : "")
          },
            React.createElement("span", { className: "mdan-content", "data-mdan-ref": itemRef }, renderInline(item.source)),
            React.createElement("button", { type: "button", className: "mdan-add mdan-add-small", title: "批注此项", "aria-label": "批注此项", onClick: function () { props.onOpenBlock(itemRef, item.source, item.start, item.end) } }, "＋"),
            itemNotes.length > 0 ? React.createElement("span", { className: "mdan-count mdan-count-small" }, String(itemNotes.length)) : null,
            null)
        })))
  }

  const ref = encodeRef(index, undefined, refIndex.blockSigs[index])
  const notes = props.notes
  return React.createElement("div", {
    className: "mdan-block" + (notes.length > 0 ? " mdan-block-annotated" : "")
  },
    React.createElement("div", { className: "mdan-content", "data-mdan-ref": ref }, blockContent(block)),
    React.createElement("button", { type: "button", className: "mdan-add", title: "批注此块", "aria-label": "批注此块", onClick: function () { props.onOpenBlock(ref, block.source, block.start, block.end) } }, "＋ 批注"),
    notes.length > 0 ? React.createElement("span", { className: "mdan-count" }, String(notes.length)) : null,
    null)
})

// Cards share the document's scroll surface. Measure after layout so wrapping,
// resizing and long comments cannot make neighbouring cards overlap.
function AnnotationRail(props) {
  const railRef = React.useRef(null)
  const connectorState = React.useState({ width: 0, height: 0, left: 0, top: 0, lines: [] })
  const connectors = connectorState[0]
  const setConnectors = connectorState[1]
  const activeState = React.useState(null)
  const activeId = activeState[0]
  const setActiveId = activeState[1]
  React.useLayoutEffect(function () {
    const rail = railRef.current
    if (!rail) return
    const surface = rail.parentElement
    const article = surface.querySelector('.mdan-article')
    let frame = null
    function layout() {
      frame = null
      const railRect = rail.getBoundingClientRect()
      const pageRect = surface.getBoundingClientRect()
      const origin = railRect.top
      const targets = new Map()
      article.querySelectorAll('[data-mdan-ref]').forEach(el => targets.set(el.dataset.mdanRef, el))
      let bottom = 0
      const lines = []
      Array.from(rail.children).forEach(card => {
        if (!card.classList.contains('mdan-card')) return
        const target = card.dataset.stale === 'true' ? null : targets.get(card.dataset.anchor)
        let desired = target ? target.getBoundingClientRect().top - origin : article.offsetHeight
        const note = props.notes.find(n => n.id === card.dataset.noteId)
        let sourceRect = target ? target.getBoundingClientRect() : null
        if (target && note && note.selText !== undefined) {
          let start = note.selStart
          if (target.textContent.slice(start, note.selEnd) !== note.selText) start = target.textContent.indexOf(note.selText)
          if (start >= 0) {
            const range = rangeFromOffsets(target, start, start + note.selText.length)
            if (range) {
              const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0)
              sourceRect = rects[0] || range.getBoundingClientRect()
              desired = sourceRect.top - origin
            }
          }
        } else if (target) {
          const range = document.createRange()
          range.selectNodeContents(target)
          const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0)
          sourceRect = rects[0] || sourceRect
          if (sourceRect) desired = sourceRect.top - origin
        }
        const top = Math.max(8, desired, bottom)
        card.style.top = top + 'px'
        bottom = top + card.offsetHeight + 12
        if (target && sourceRect) {
          const quote = card.querySelector('.mdan-card-quote')
          const cardRect = card.getBoundingClientRect()
          const endRect = quote ? quote.getBoundingClientRect() : cardRect
          const sx = Math.min(sourceRect.right - pageRect.left + 5, article.getBoundingClientRect().right - pageRect.left + 5)
          const sy = sourceRect.top - pageRect.top + sourceRect.height / 2
          const ex = cardRect.left - pageRect.left - 7
          const ey = endRect.top - pageRect.top + Math.min(endRect.height / 2, 14)
          const bend = Math.max(sx + 10, ex - 22)
          lines.push({ id: card.dataset.noteId || 'draft', d: 'M ' + sx + ' ' + sy + ' H ' + bend + ' V ' + ey + ' H ' + ex, sx, sy, ex, ey })
          }
      })
      rail.style.height = bottom + 'px'
      const next = {
        width: Math.max(pageRect.width, 1), height: Math.max(bottom, article.offsetHeight, 1),
        left: pageRect.left - railRect.left, top: pageRect.top - railRect.top, lines
      }
      setConnectors(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next)
    }
    function schedule() { if (frame === null) frame = requestAnimationFrame(layout) }
    const observer = new ResizeObserver(schedule)
    observer.observe(article)
    Array.from(rail.children).forEach(card => observer.observe(card))
    window.addEventListener('resize', schedule)
    layout()
    return () => { observer.disconnect(); window.removeEventListener('resize', schedule); if (frame !== null) cancelAnimationFrame(frame) }
  }, [props.notes, props.editing, props.content])
  React.useLayoutEffect(function () {
    const input = railRef.current && railRef.current.querySelector('.mdan-editor-input')
    if (input) input.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [props.editing && (props.editing.noteId || props.editing.ref)])
  const editor = () => React.createElement(AnnotationEditor, {
    editing: props.editing, onSave: props.onSave, onCancel: props.onCancel,
    onPickKind: props.onPickKind, draftCache: props.draftCache
  })
  const entries = props.notes.map(note => ({ note, ref: note.ref, start: note.start, offset: note.selStart || 0, stale: note.stale }))
  if (props.editing && !props.notes.some(n => n.id === props.editing.noteId)) {
    entries.push({ ref: props.editing.ref, start: props.editing.start, offset: props.editing.selStart || 0, draft: true })
  }
  entries.sort((a, b) => Number(!!a.stale) - Number(!!b.stale) || a.start - b.start || a.offset - b.offset)
  return React.createElement('aside', { className: 'mdan-rail', ref: railRef, 'aria-label': '右侧批注' },
    React.createElement('svg', {
      className: 'mdan-connectors', width: connectors.width, height: connectors.height,
      viewBox: '0 0 ' + connectors.width + ' ' + connectors.height,
      style: { left: connectors.left + 'px', top: connectors.top + 'px' }, 'aria-hidden': 'true'
    }, connectors.lines.map(line => React.createElement(React.Fragment, { key: line.id },
      React.createElement('path', { className: 'mdan-connector' + (activeId === line.id ? ' mdan-connector-active' : ''), d: line.d }),
      React.createElement('circle', { className: 'mdan-connector-dot' + (activeId === line.id ? ' mdan-connector-active' : ''), cx: line.sx, cy: line.sy, r: activeId === line.id ? 3.5 : 2.5 })
    ))),
    entries.map(entry => {
      const n = entry.note
      if (entry.draft) return React.createElement('div', { key: 'draft', className: 'mdan-card', 'data-anchor': entry.ref }, editor())
      return React.createElement('section', {
        key: n.id, className: 'mdan-card', 'data-anchor': n.ref, 'data-note-id': n.id, 'data-stale': String(!!n.stale),
        onMouseEnter: () => setActiveId(n.id), onMouseLeave: () => setActiveId(null),
        onFocus: () => setActiveId(n.id), onBlur: event => { if (!event.currentTarget.contains(event.relatedTarget)) setActiveId(null) }
      },
        React.createElement('div', { className: 'mdan-card-head' }, kindTag(n.kind),
          React.createElement('div', { className: 'mdan-card-actions' },
            React.createElement('button', { type: 'button', className: 'mdan-note-btn', title: '复制批注', onClick: () => props.onCopy(n) }, '复制'),
            React.createElement('button', { type: 'button', className: 'mdan-note-btn', title: '写入会话草稿', onClick: () => props.onSend(n) }, '写入草稿'),
            React.createElement('button', { type: 'button', className: 'mdan-note-btn', onClick: () => props.onEdit(n) }, '编辑'),
            React.createElement('button', { type: 'button', className: 'mdan-note-btn', onClick: () => props.onRemove(n.id) }, '删除'))),
        React.createElement('button', { type: 'button', className: 'mdan-card-quote', title: '定位到原文', disabled: !!n.stale, onClick: () => props.onLocate(n.ref) }, truncate(n.selText !== undefined ? n.selText : n.source, 180)),
        n.stale ? React.createElement('div', { className: 'mdan-card-stale' }, '原文已变化，无法定位') : null,
        props.editing && props.editing.noteId === n.id ? editor() : React.createElement('div', { className: 'mdan-card-text' }, n.note))
    }))
}
