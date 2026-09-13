// 官方 file 地址语法，保持与 dsh-util-workspace-path 0.1.5-alpha.1 一致。
// Adapted from DeepSeek Harness (MIT); bundled here to keep the client factory self-contained.
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024
function parseFileAddress(address) {
  try {
    const url = new URL(address)
    if (url.protocol !== "dsh-resource:" || url.host !== "file") return undefined
    const parts = url.pathname.split("/")
    const scope = parts[1]
    const rest = parts.slice(2)
    if (scope === "session") {
      if (!rest[0] || rest.length < 2) return undefined
      return { scope: scope, sessionId: decodeURIComponent(rest[0]), path: rest.slice(1).map(decodeURIComponent).join("/") }
    }
    if (scope === "absolute") {
      const unc = rest[0] === "" && rest.length > 1
      const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent)
      if (!segments[0]) return undefined
      return { scope: scope, path: (unc ? "//" : /^[A-Za-z]:$/.test(segments[0]) ? "" : "/") + segments.join("/") }
    }
  } catch (_) { /* malformed URL or encoding */ }
  return undefined
}
function fileOf(address, ownerSessionId) {
  const parsed = parseFileAddress(address)
  if (!parsed || !parsed.path) throw new Error("文件地址无效")
  return { sessionId: parsed.scope === "session" ? parsed.sessionId : ownerSessionId, path: parsed.path }
}
function fileTitle(address) {
  const parsed = parseFileAddress(address)
  return parsed ? parsed.path.split(/[\\/]/).pop() || parsed.path : address
}
function fileError(code, message) { return Object.assign(new Error(message), { code: code }) }
function checkAborted(signal) { if (signal && signal.aborted) throw new DOMException("操作已取消", "AbortError") }
function failureText(error) {
  const code = String(error && error.code || "")
  if (code.endsWith("not-found")) return "文件已不存在"
  if (code.endsWith("outside-workspace")) return "文件不在当前会话工作区内"
  if (code.endsWith("not-regular-file")) return "不能预览目录或符号链接"
  if (code.endsWith("unknown-workspace")) return "会话没有可用工作区"
  if (code.endsWith("too-large")) return "文件超过读取上限（本插件最多 2 MiB）"
  if (code === "conflict") return "文件已变化；草稿已保留，请下载草稿或重新加载"
  return String(error && error.message || error || "加载失败")
}

// Every byte window must belong to one version. Decode only after joining bytes,
// so a multibyte character split between windows is never damaged.
async function readDocument(remote, file, signal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let offset = 0
      let version
      let absolutePath
      const chunks = []
      let windowSize = 64 * 1024
      for (;;) {
        checkAborted(signal)
        const result = await remote.workspaceFiles.readBytes(file.sessionId, file.path, { offset: offset, length: windowSize }, signal)
        checkAborted(signal)
        if (!result.ok) {
          if (result.error.code === "workspace-file/too-large" && windowSize > 1) { windowSize = Math.max(1, Math.floor(windowSize / 2)); continue }
          throw fileError(result.error.code, failureText(result.error))
        }
        const page = result.value
        if (page.bytes > MAX_DOCUMENT_BYTES) throw fileError("too-large", "文件超过 2 MiB")
        if (version !== undefined && (version !== page.version || absolutePath !== page.absolutePath)) throw fileError("changed-during-read", "读取期间文件已变化，请重新加载")
        version = page.version
        absolutePath = page.absolutePath
        if (page.offset !== offset || typeof page.data !== "string") throw fileError("invalid-page", "文件服务返回无效字节窗口")
        const raw = atob(page.data)
        const bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0))
        offset += bytes.length
        if (offset > MAX_DOCUMENT_BYTES) throw fileError("too-large", "文件超过 2 MiB")
        chunks.push(bytes)
        if (page.eof) break
        if (bytes.length === 0) throw fileError("invalid-page", "文件读取未前进")
      }
      // A file can change after the final window's pre-read stat.
      const last = await remote.workspaceFiles.stat(file.sessionId, file.path, signal)
      checkAborted(signal)
      if (!last.ok) throw fileError(last.error.code, failureText(last.error))
      if (last.value.version !== version) throw fileError("changed-during-read", "读取期间文件已变化，请重新加载")
      const bytes = new Uint8Array(offset)
      let position = 0
      chunks.forEach(chunk => { bytes.set(chunk, position); position += chunk.length })
      let content
      try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) }
      catch (_) { throw fileError("not-text", "文件不是有效 UTF-8 文本") }
      if (content.includes("\0")) throw fileError("not-text", "文件包含 NUL，不能作为 Markdown 编辑")
      return { content: content, version: version, absolutePath: absolutePath }
    } catch (error) {
      if (error.code !== "changed-during-read" || attempt === 1) throw error
    }
  }
}
async function postDocument(payload, signal) {
  let response
  try {
    response = await fetch("/dsh-md-annotator/api/save", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload), signal: signal
    })
    const body = await response.json()
    if (!response.ok || body.ok !== true) throw fileError(body.error && body.error.code || "save-failed", failureText(body.error))
    if (!body.value || typeof body.value.version !== "string") throw fileError("uncertain", "保存结果无效，需要核对文件")
    return body.value
  } catch (error) {
    if (error.code) throw error
    throw fileError("uncertain", "保存结果不确定，正在核对文件")
  }
}
function downloadText(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type: type || "text/markdown;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
