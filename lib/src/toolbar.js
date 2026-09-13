function MdToolbar(props) {
  const s = props.state
  const settings = props.settings
  const open = useViewState(props.view, "settingsOpen", false)
  const h = React.createElement
  return h(React.Fragment, null,
    h("div", { className: "mdan-toolbar", role: "toolbar", "aria-label": "Markdown 工具栏" },
      h("button", { type: "button", className: "mdan-btn", disabled: !settings.enabled, "aria-pressed": props.mode === "preview", onClick: () => props.setMode("preview") }, "预览"),
      h("button", { type: "button", className: "mdan-btn", "aria-pressed": props.mode === "edit", onClick: () => props.setMode("edit") }, "源码"),
      h("button", { type: "button", className: "mdan-btn mdan-btn-primary", disabled: !s.dirty || s.loading || s.saveState === "saving" || s.conflict, onClick: props.save }, s.saveState === "saving" ? "保存中…" : "保存"),
      h("button", { type: "button", className: "mdan-btn", disabled: s.loading || s.saveState === "saving", onClick: props.reload }, "重新加载"),
      h("button", { type: "button", className: "mdan-btn", "aria-expanded": open[0], onClick: () => open[1](!open[0]) }, "设置"),
      h("button", { type: "button", className: "mdan-btn", disabled: s.content === undefined, onClick: props.download }, "下载草稿"),
      h("span", { className: "mdan-source-status", role: "status" }, s.dirty ? "有未保存修改" : s.saveState === "saved" ? "已保存" : "")),
    open[0] ? h("div", { className: "mdan-settings" },
      h("label", null, h("input", { type: "checkbox", checked: settings.enabled, onChange: e => props.setSettings({ enabled: e.target.checked }) }), "增强预览"),
      h("label", null, h("input", { type: "checkbox", checked: settings.clearAfterSend, onChange: e => props.setSettings({ clearAfterSend: e.target.checked }) }), "写入草稿后清空批注"),
      h("label", null, "报告前缀", h("input", { type: "text", value: settings.reportPrefix, maxLength: 4000, onChange: e => props.setSettings({ reportPrefix: e.target.value }) }))) : null,
    s.error || s.conflict ? h("div", { className: "mdan-banner", role: "alert" }, s.error || "文件已变化；未保存草稿已保留，请下载草稿或重新加载") : null)
}
