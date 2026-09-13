function appendReport(conversation, sessions, ownerSessionId, report) {
  const scope = sessions.scope(ownerSessionId)
  if (!scope) throw new Error("会话不可用")
  const input = conversation.input.for(scope)
  const current = input.state.getSnapshot().draft
  input.setDraft(current.trim() === "" ? report : current + "\n\n" + report)
}
// FileViewerProps has no native tab hooks or AbortSignal. Each mounted viewer
// owns a lifetime; create it in the effect so StrictMode can safely replay it.
function BetterMarkdownViewer(props) {
  const doc = props.customData.doc
  return React.createElement(MdErrorBoundary, { key: doc.key },
    React.createElement(BetterMarkdownDocument, Object.assign({}, props, { doc: doc })))
}
function BetterMarkdownDocument(props) {
  const doc = props.doc
  const lifetime = React.useState(null)
  const metadata = React.useState({ value: { version: props.customData.version }, failure: null })
  const reloadRef = React.useRef(() => {})
  React.useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const reload = async () => {
      if (pending || controller.signal.aborted) return
      pending = true
      const version = doc.getSnapshot().version
      try {
        const result = await props.remote.workspaceFiles.stat(props.scope.sessionId, props.path, controller.signal)
        if (controller.signal.aborted) return
        if (!result.ok) throw fileError(result.error.code, failureText(result.error))
        metadata[1]({ value: result.value, failure: null })
        // Ignore a stat that raced with a save/read committing a new version.
        const state = doc.getSnapshot()
        if (state.content !== undefined && state.version === version && state.saveState !== "saving") doc.observe(result.value.version)
      } catch (error) {
        if (!controller.signal.aborted) metadata[1](previous => ({ value: previous.value, failure: error }))
      } finally { pending = false }
    }
    reloadRef.current = reload
    lifetime[1](controller)
    void reload()
    const timer = setInterval(reload, 3000)
    return () => { clearInterval(timer); controller.abort() }
  }, [doc, props.remote, props.scope.sessionId, props.path])
  if (!lifetime[0] || lifetime[0].signal.aborted) return null
  return React.createElement(MarkdownDocument, {
    doc: doc, runtime: props.runtime, sessionId: props.scope.sessionId,
    tab: { signal: lifetime[0].signal, visible: true, navigation: {} },
    meta: Object.assign({}, metadata[0], { reload: () => reloadRef.current() })
  })
}
function MarkdownDocument(props) {
  const doc = props.doc
  const runtime = props.runtime
  const tab = props.tab
  const state = useAtom(doc)
  const settings = useAtom(runtime.settings)
  const entry = runtime.documents.viewFor(tab.signal)
  React.useEffect(() => {
    runtime.documents.attach(doc, tab.signal)
    if (doc.getSnapshot().content === undefined && !doc.getSnapshot().loading && !doc.getSnapshot().error) void doc.load(false)
  }, [doc, tab.signal])
  const reload = () => {
    if (doc.getSnapshot().dirty && !window.confirm("放弃未保存修改并重新加载？可先下载草稿。")) return
    props.meta.reload()
    void doc.load(true)
  }
  const save = async () => { await doc.save(); props.meta.reload() }
  return React.createElement(MdAnnotateView, {
    key: entry.highlightId, path: doc.path, sessionId: props.sessionId, content: state.content,
    state: state, doc: doc, view: entry.atom, annotationStore: doc.annotations,
    panelPrefsStore: { get: () => entry.atom.getSnapshot().panel || { open: false, barCollapsed: false }, set: (_s, _p, value) => entry.atom.update({ panel: value }) },
    settings: settings, setSettings: runtime.settings.set,
    appendReport: report => runtime.append(props.sessionId, report),
    save: save, reload: reload, navigation: tab.navigation, visible: tab.visible,
    metaError: props.meta.failure ? failureText(props.meta.failure) : null,
    highlightId: entry.highlightId
  })
}
