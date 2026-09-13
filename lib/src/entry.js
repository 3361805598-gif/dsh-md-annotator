// Better Sidebar owns file routing; this plugin owns the document and annotations.
// The namespace dependency does not authorize access to its parent service.
const inject = ["betterSidebar", "remote", "remote.workspaceFiles", "conversation", "sessions"]
function apply(context) {
  const documents = createDocumentStore((file, signal) => readDocument(context.remote, file, signal), postDocument)
  let storage
  try { storage = window.localStorage } catch (_) {}
  const runtime = {
    documents: documents, settings: createSettings(storage),
    append: (sessionId, report) => appendReport(context.conversation, context.sessions, sessionId, report)
  }
  context.effect(() => context.betterSidebar.registerFileViewer({
    id: "dsh-md-annotator:markdown", title: "Markdown 批注",
    exts: ["md", "markdown"], priority: 20, fetchStrategy: "custom",
    load: async (path, scope, signal) => {
      const file = { sessionId: scope.sessionId, path: path }
      const result = await context.remote.workspaceFiles.stat(file.sessionId, path, signal)
      checkAborted(signal)
      if (!result.ok) throw fileError(result.error.code, failureText(result.error))
      return { doc: documents.get(scope.sessionId, result.value.absolutePath, file), version: result.value.version }
    },
    component: props => React.createElement(BetterMarkdownViewer, Object.assign({}, props, { runtime: runtime, remote: context.remote }))
  }))
  context.effect(() => {
    const beforeUnload = event => { if (documents.hasDirty()) { event.preventDefault(); event.returnValue = "" } }
    window.addEventListener("beforeunload", beforeUnload)
    return () => { window.removeEventListener("beforeunload", beforeUnload); documents.dispose() }
  })
}
exports.apply = apply
exports.inject = inject
exports._test = {
  parseFileAddress, fileOf, fileTitle, readDocument, postDocument, createDocumentStore, createSettings, appendReport,
  BetterMarkdownViewer, MarkdownDocument, MdAnnotateView,
  parseBlocks: parseBlocks,
  renderInline: renderInline,
  parseTable: parseTable,
  resolveSource: resolveSource,
  encodeRef: encodeRef,
  decodeRef: decodeRef,
  hashSource: hashSource,
  buildRefIndex: buildRefIndex,
  reanchorNotes: reanchorNotes,
  formatReport: formatReport,
  createAnnotationStore: createAnnotationStore,
  createPanelPrefsStore: createPanelPrefsStore,
  storeKey: storeKey,
  clamp: clamp,
  truncate: truncate
}
