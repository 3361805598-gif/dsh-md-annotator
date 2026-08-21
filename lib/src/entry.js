// ── plugin ──────────────────────────────────────────────────────────────
const inject = ["betterSidebar", "conversation", "sessions"]

function apply(context) {
  const sidebar = context.betterSidebar
  // Per-activation stores (no module-level singleton): the viewer receives
  // them via props, keeping storage lifetime tied to the plugin activation.
  const annotationStore = createAnnotationStore()
  const panelPrefsStore = createPanelPrefsStore()
  context.effect(function () {
    const supportsPluginSettings = Array.isArray(sidebar.features) && sidebar.features.indexOf("pluginSettings") !== -1
    return sidebar.registerFileViewer({
      id: "md-annotator",
      title: "MD 预览/源码编辑（含批注）",
      icon: function (size) {
        return React.createElement("span", { style: { fontSize: Math.max(12, Number(size) || 12) + "px", lineHeight: 1 } }, "✍")
      },
      exts: ["md", "markdown"],
      priority: 10,
      fetchStrategy: "fsRead",
      settings: supportsPluginSettings ? {
        pluginToggles: [
          { key: "clearAfterSend", title: "发送后自动清空批注", desc: "把批注写入对话框后自动清空本文件批注（默认开启；关闭后批注跨轮累积，每次发送都会带上全部历史批注）", type: "switch" },
          { key: "reportPrefix", title: "发送内容前缀", desc: "附加在批注内容开头的说明文字", type: "text", placeholder: "（可选）例如：请逐项修改并保持原有语气" }
        ]
      } : undefined,
      component: function (props) {
        return React.createElement(MdErrorBoundary, null,
          React.createElement(MdAnnotateView, Object.assign({}, props, { annotationStore: annotationStore, panelPrefsStore: panelPrefsStore })))
      }
    })
  })
}

exports.apply = apply
exports.inject = inject
// Test hook (smoke/unit tests materialize the factory under Node with a stub
// require("react"); the browser never reads this export).
exports._test = {
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
