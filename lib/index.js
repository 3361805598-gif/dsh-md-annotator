// 独立 Web 保存入口。读取与变更订阅继续使用官方 workspaceFiles Remote。
export const name = "md-annotator"
export const inject = ["webServer", "connection", "sessions", "sandboxPolicy", "fs"]
export const MAX_BYTES = 2 * 1024 * 1024
// JSON escaping can expand each content byte to six bytes.
const MAX_REQUEST_BYTES = MAX_BYTES * 6 + 16 * 1024

class SaveError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export async function saveDocument(ctx, payload, signal) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new SaveError("bad-request", "请求必须为 JSON 对象")
  const { sessionId, path, content, baseVersion } = payload
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 1024 ||
      typeof path !== "string" || !path || path.length > 8192 || path.includes("\0") ||
      typeof content !== "string" || typeof baseVersion !== "string" || !baseVersion || baseVersion.length > 2048) {
    throw new SaveError("bad-request", "sessionId、path、content 和 baseVersion 无效")
  }
  if (!/\.(md|markdown)$/i.test(path)) throw new SaveError("invalid-extension", "只支持 Markdown 文件")
  if (content.includes("\0") || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(content)) throw new SaveError("not-text", "内容不是有效 UTF-8 文本")
  if (Buffer.byteLength(content, "utf8") > MAX_BYTES) throw new SaveError("too-large", "文件超过 2 MiB", 413)
  const session = ctx.sessions.get(sessionId)
  if (!session) throw new SaveError("session-not-found", "会话不存在", 404)
  const policy = ctx.sandboxPolicy.resolve({ session })
  const cwd = policy.workspaceRoot
  if (typeof cwd !== "string" || !cwd) throw new SaveError("unknown-workspace", "会话没有工作区", 403)
  const root = await ctx.fs.resolve(cwd, { signal })
  const entry = await ctx.fs.lstat(path, { cwd }, signal)
  if (!entry) throw new SaveError("not-found", "文件已不存在", 404)
  if (entry.type !== "file") throw new SaveError("not-regular-file", "只允许保存已有普通文件，不能保存符号链接", 403)
  const target = await ctx.fs.resolve(path, { cwd, signal })
  if (!ctx.fs.contains(root, target)) throw new SaveError("outside-workspace", "文件不在会话工作区内", 403)
  const info = await ctx.fs.stat(target, signal)
  if (!info || info.type !== "file") throw new SaveError("not-found", "文件已不存在或类型已变化", 404)
  const result = await ctx.fs.writeText(target, content, { kind: "replaceIfVersion", version: baseVersion }, signal, policy)
  return { absolutePath: ctx.fs.processPath(target), version: result.version }
}

function failure(error) {
  if (error instanceof SaveError) return error
  const codes = {
    FS_STALE_VERSION: [409, "conflict", "文件已变化，请下载草稿或重新加载后再编辑"],
    FS_NOT_FOUND: [404, "not-found", "文件已不存在"],
    FS_PERMISSION_DENIED: [403, "permission-denied", "没有文件写入权限"],
    FS_OUTSIDE_SANDBOX: [403, "outside-workspace", "文件不在允许写入的工作区内"],
    FS_NOT_TEXT: [400, "not-text", "文件不是 UTF-8 文本"]
  }
  const item = codes[error?.code]
  return item ? new SaveError(item[1], item[2], item[0]) : new SaveError("save-failed", "保存失败：" + String(error?.message || error), 500)
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" })
  res.end(JSON.stringify(body))
}

export function createSaveHandler(ctx) {
  return async (req, res) => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    req.once("aborted", abort)
    try {
      // Official authority/origin AND authenticated browser-session checks.
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) throw new SaveError(rejection === 401 ? "unauthorized" : "forbidden", "请求未通过身份或来源验证", rejection)
      if (req.method !== "POST") throw new SaveError("method-not-allowed", "只支持 POST", 405)
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) throw new SaveError("content-type", "需要 application/json", 415)
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk)
        size += bytes.length
        if (size > MAX_REQUEST_BYTES) throw new SaveError("too-large", "请求体过大", 413)
        chunks.push(bytes)
      }
      let payload
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) }
      catch { throw new SaveError("bad-json", "JSON 请求无效") }
      json(res, 200, { ok: true, value: await saveDocument(ctx, payload, controller.signal) })
    } catch (error) {
      if (res.destroyed) return
      const e = failure(error)
      json(res, e.status, { ok: false, error: { code: e.code, message: e.message } })
    } finally { req.removeListener("aborted", abort) }
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: "exact", path: "/dsh-md-annotator/api/save", handler: createSaveHandler(ctx) }), "md-annotator: save")
}
