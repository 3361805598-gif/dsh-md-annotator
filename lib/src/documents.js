// Observable snapshots are shared by all panes of a document. The viewer owns
// only interaction state; hiding a React subtree never discards document data.
function createAtom(initial) {
  let state = initial
  const listeners = new Set()
  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    update: (patch) => { state = Object.assign({}, state, typeof patch === "function" ? patch(state) : patch); listeners.forEach(fn => fn()) }
  }
}
function useAtom(atom) { return React.useSyncExternalStore(atom.subscribe, atom.getSnapshot, atom.getSnapshot) }
function useViewState(view, key, initial) {
  const state = useAtom(view)
  const value = state[key] === undefined ? initial : state[key]
  return [value, React.useCallback(next => view.update(s => ({ [key]: typeof next === "function" ? next(s[key] === undefined ? initial : s[key]) : next })), [view, key])]
}
function createSettings(storage) {
  const defaults = { enabled: true, clearAfterSend: true, reportPrefix: "" }
  let restored
  try { restored = JSON.parse(storage.getItem("dsh-md-annotator.settings.v1") || "null") } catch (_) {}
  function valid(value) {
    return { enabled: typeof value?.enabled === "boolean" ? value.enabled : true,
      clearAfterSend: typeof value?.clearAfterSend === "boolean" ? value.clearAfterSend : true,
      reportPrefix: typeof value?.reportPrefix === "string" ? value.reportPrefix.slice(0, 4000) : "" }
  }
  const atom = createAtom(Object.assign({}, defaults, valid(restored)))
  atom.set = patch => {
    atom.update(valid(Object.assign({}, atom.getSnapshot(), patch)))
    try { storage.setItem("dsh-md-annotator.settings.v1", JSON.stringify(atom.getSnapshot())) } catch (_) { /* privacy mode: keep in memory */ }
  }
  return atom
}
function createDocumentStore(read, write, maxKeys) {
  const records = new Map()
  const views = new Map()
  const lifecycle = new AbortController()
  let serial = 0
  maxKeys = maxKeys || 100
  function evict() {
    if (records.size <= maxKeys) return
    const candidates = Array.from(records.entries()).filter(([, d]) => d.users.size === 0 && !d.getSnapshot().dirty && d.getSnapshot().saveState !== "saving").sort((a, b) => a[1].access - b[1].access)
    for (const [key, d] of candidates) {
      if (records.size <= maxKeys) break
      if (d.readController) d.readController.abort()
      records.delete(key)
    }
  }
  function get(ownerSessionId, absolutePath, file) {
    const key = storeKey(ownerSessionId, absolutePath)
    let doc = records.get(key)
    if (!doc) {
      doc = createAtom({ content: undefined, draft: "", version: undefined, dirty: false, loading: false, error: null, conflict: false, saveState: "idle", notes: [] })
      doc.key = key; doc.file = file; doc.path = absolutePath; doc.users = new Set(); doc.generation = 0
      doc.edit = text => doc.update(s => ({ draft: text, dirty: text !== s.content, saveState: s.saveState === "saving" ? "saving" : "idle" }))
      doc.annotations = {
        get: () => doc.getSnapshot().notes,
        set: (_session, _path, notes) => doc.update({ notes: notes.slice(0, 500).map(n => Object.assign({}, n, { note: n.note.slice(0, 2000) })) }),
        clear: () => doc.update({ notes: [] })
      }
      doc.load = async (discard) => {
        if (lifecycle.signal.aborted || doc.getSnapshot().saveState === "saving") return
        if (doc.getSnapshot().dirty && !discard) { doc.update({ conflict: true }); return }
        if (doc.readController) doc.readController.abort()
        const controller = new AbortController()
        doc.readController = controller
        const generation = ++doc.generation
        doc.update({ loading: true, error: null })
        try {
          const value = await read(doc.file, controller.signal)
          if (controller.signal.aborted || lifecycle.signal.aborted || generation !== doc.generation) return
          // The user may have typed while reload was awaiting I/O.
          if (doc.getSnapshot().dirty && !discard) { doc.update({ conflict: true, loading: false }); return }
          doc.update({ content: value.content, draft: value.content, version: value.version, dirty: false, conflict: false, loading: false, error: null, saveState: "idle" })
        } catch (error) {
          if (!controller.signal.aborted && !lifecycle.signal.aborted && generation === doc.generation) doc.update({ loading: false, error: failureText(error) })
        } finally { if (doc.readController === controller) doc.readController = null }
      }
      doc.observe = version => {
        const s = doc.getSnapshot()
        if (!version || version === s.version || s.saveState === "saving") return
        if (s.dirty) doc.update({ conflict: true })
        else if (!s.loading) void doc.load(false)
      }
      doc.save = async () => {
        const s = doc.getSnapshot()
        if (!s.dirty || !s.version || s.loading || s.saveState === "saving" || s.conflict || lifecycle.signal.aborted) return
        const submitted = s.draft
        if (new TextEncoder().encode(submitted).length > MAX_DOCUMENT_BYTES) { doc.update({ error: "草稿超过 2 MiB，不能保存", saveState: "failed" }); return }
        doc.update({ saveState: "saving", error: null })
        function saved(value, content) {
          if (lifecycle.signal.aborted) return
          doc.update(current => ({ content: content, version: value.version, dirty: current.draft !== content, saveState: "saved", conflict: false, error: null }))
        }
        try {
          const value = await write({ sessionId: doc.file.sessionId, path: doc.file.path, content: submitted, baseVersion: s.version }, lifecycle.signal)
          saved(value, submitted)
        } catch (error) {
          if (lifecycle.signal.aborted) return
          if (error.code === "uncertain") {
            try {
              const actual = await read(doc.file, lifecycle.signal)
              if (actual.content === submitted) { saved(actual, actual.content); return }
              doc.update({ conflict: true, saveState: "failed", error: "保存结果与草稿不同；草稿已保留，请下载或重新加载核对" })
              return
            } catch (_) { /* Keep the uncertain result and prevent blind retry. */ }
          }
          doc.update({ saveState: "failed", conflict: error.code === "conflict" || error.code === "uncertain", error: failureText(error) })
        }
      }
      records.set(key, doc)
    }
    doc.access = ++serial
    return doc
  }
  function viewFor(signal) {
    let entry = views.get(signal)
    if (!entry) {
      entry = { atom: createAtom({}), docs: new Set(), highlightId: "mdan-sel-" + (++serial) }
      views.set(signal, entry)
      signal.addEventListener("abort", () => {
        entry.docs.forEach(doc => {
          doc.users.delete(signal)
          if (doc.users.size === 0 && doc.readController) {
            doc.readController.abort(); doc.readController = null; doc.update({ loading: false })
          }
        })
        views.delete(signal); evict()
      }, { once: true })
    }
    return entry
  }
  function attach(doc, signal) {
    if (signal.aborted || lifecycle.signal.aborted) return
    const entry = viewFor(signal)
    doc.users.add(signal); entry.docs.add(doc); evict()
  }
  function dispose() {
    lifecycle.abort()
    records.forEach(doc => { if (doc.readController) doc.readController.abort() })
    views.clear(); records.clear()
  }
  return { get: get, attach: attach, viewFor: viewFor, dispose: dispose, size: () => records.size,
    hasDirty: () => Array.from(records.values()).some(doc => doc.getSnapshot().dirty) }
}
