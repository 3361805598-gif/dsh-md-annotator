import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { saveDocument, createSaveHandler, apply, MAX_BYTES } from '../lib/index.js'
const calls = []
function context(overrides = {}) {
  return {
    sessions: { get: id => id === 's' ? { id, header: { cwd: '/untrusted-header' } } : undefined },
    sandboxPolicy: { resolve: () => ({ workspaceRoot: '/w', mode: 'workspace-write' }) },
    connection: { requestRejection: () => undefined },
    fs: {
      resolve: async (path, options) => { calls.push(['resolve', path, options]); return { uri: path === '/w' ? '/w' : path.startsWith('/') ? path : '/w/' + path } },
      lstat: async () => ({ type: 'file' }),
      contains: (root, file) => file.uri.startsWith(root.uri + '/'),
      stat: async () => ({ type: 'file', version: 'v1' }),
      processPath: target => target.uri,
      writeText: async (...args) => { calls.push(['write', ...args]); if (args[2].version !== 'v1') throw Object.assign(Error('stale'), { code: 'FS_STALE_VERSION' }); return { version: 'v2' } },
      ...overrides
    }
  }
}
const payload = { sessionId: 's', path: 'a.md', content: '改稿', baseVersion: 'v1' }
const ctx = context()
assert.deepEqual(await saveDocument(ctx, payload), { absolutePath: '/w/a.md', version: 'v2' })
const write = calls.find(call => call[0] === 'write')
assert.deepEqual(write[3], { kind: 'replaceIfVersion', version: 'v1' })
assert.equal(write[5].workspaceRoot, '/w')
for (const patch of [{ baseVersion: '' }, { path: 'a.txt' }, { content: null }, { content: '\0' }, { content: '\ud800' }, { sessionId: 'missing' }, { path: '/outside/a.md' }, { content: 'x'.repeat(MAX_BYTES + 1) }]) {
  await assert.rejects(saveDocument(ctx, { ...payload, ...patch }))
}
for (const type of ['symlink', 'directory', 'other']) await assert.rejects(saveDocument(context({ lstat: async () => ({ type }) }), payload), /普通文件/)
await assert.rejects(saveDocument(context({ lstat: async () => undefined }), payload), /不存在/)
await assert.rejects(saveDocument(context({ stat: async () => undefined }), payload), /不存在/)

async function request(ctx, { method = 'POST', headers = { 'content-type': 'application/json' }, body = JSON.stringify(payload) } = {}) {
  const req = Readable.from([Buffer.from(body)])
  Object.assign(req, { method, headers })
  const res = { destroyed: false, writeHead(status, headers) { this.status = status; this.headers = headers }, end(value) { this.body = JSON.parse(value) } }
  await createSaveHandler(ctx)(req, res)
  return res
}
assert.equal((await request(ctx)).status, 200)
assert.equal((await request(ctx, { method: 'GET' })).status, 405)
assert.equal((await request(ctx, { headers: { 'content-type': 'text/plain' } })).status, 415)
assert.equal((await request(ctx, { body: '{' })).status, 400)
assert.equal((await request(ctx, { body: JSON.stringify({ ...payload, baseVersion: 'old' }) })).status, 409)
for (const status of [401, 403]) {
  const denied = context(); denied.connection.requestRejection = () => status
  const response = await request(denied)
  assert.equal(response.status, status)
}
assert.equal((await request(context({ writeText: async () => { throw Object.assign(Error('denied'), { code: 'FS_PERMISSION_DENIED' }) } }))).status, 403)
assert.equal((await request(context({ writeText: async () => { throw Error('I/O') } }))).status, 500)
let registered, dispose
apply({ effect: fn => { dispose = fn() }, webServer: { register: route => { registered = route; return () => { registered = undefined } } } })
assert.equal(registered.path, '/dsh-md-annotator/api/save'); dispose(); assert.equal(registered, undefined)
console.log('host OK: validation, scope, version guard, authorization, failures and disposal')
