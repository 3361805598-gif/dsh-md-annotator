import assert from 'node:assert/strict'
import { materialize } from './materialize.mjs'
const mod = await materialize()
const T = mod._test
const normalize = value => JSON.parse(JSON.stringify(value))
let checks = 0
async function test(name, run) { await run(); checks++; console.log('ok:', name) }
function remoteOf(content, size = 11) {
  const bytes = Buffer.from(content)
  return { workspaceFiles: {
    readBytes: async (_session, _path, options) => {
      // DSH 0.2.x contract: options.range = { offset, length }; data is native bytes.
      const range = options && options.range
      const offset = range && Number.isInteger(range.offset) ? range.offset : 0
      const window = range && Number.isInteger(range.length) ? range.length : size
      const chunk = bytes.subarray(offset, offset + window)
      return { ok: true, value: { absolutePath: '/w/a.md', version: 'v1', bytes: bytes.length, offset, data: new Uint8Array(chunk), eof: offset + chunk.length >= bytes.length } }
    },
    stat: async () => ({ ok: true, value: { version: 'v1', absolutePath: '/w/a.md' } })
  } }
}
await test('Better Sidebar registration, declared-service access, real read and disposal', async () => {
  const effects = [], registered = [], slots = []
  const ctx = {
    effect: fn => effects.push(fn()),
    betterSidebar: { registerFileViewer: def => { registered.push(def); return () => registered.pop() } },
    slots: { inject: (_name, fn) => fn(), register: (def, component) => { slots.push({ def, component }); return () => slots.pop() } },
    remote: remoteOf(''), conversation: {}, sessions: {}
  }
  const guarded = new Proxy(ctx, {
    get(target, key) {
      if (key !== 'effect' && key in target && !mod.inject.includes(key)) {
        throw new Error(`cannot get property "${String(key)}" without inject`)
      }
      return target[key]
    }
  })
  mod.apply(guarded)
  const d = registered[0]
  assert.equal(d.id, 'dsh-md-annotator:markdown')
  assert.equal(d.priority, 20)
  assert.deepEqual(normalize(d.exts), ['md', 'markdown'])
  assert.equal(d.fetchStrategy, 'custom')
  assert.equal(slots.length, 0)
  const data = await d.load('a.md', { sessionId: 's' }, new AbortController().signal)
  const element = d.component({ customData: data, scope: { sessionId: 's' }, path: 'a.md' })
  assert.equal(element.type, T.BetterMarkdownViewer)
  const doc = data.doc
  assert.equal(doc.path, '/w/a.md')
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(d.load('a.md', { sessionId: 's' }, cancelled.signal), e => e.name === 'AbortError')
  await doc.load(false)
  assert.equal(doc.getSnapshot().error, null)
  assert.equal(doc.getSnapshot().content, '')
  effects.reverse().forEach(dispose => dispose())
  assert.equal(slots.length, 0); assert.equal(registered.length, 0)
})
await test('file addresses, escaping, scopes and Windows paths', () => {
  assert.deepEqual(normalize(T.fileOf('dsh-resource://file/session/source/%E4%B8%AD%20%23%25.md', 'owner')), { sessionId: 'source', path: '中 #%.md' })
  assert.deepEqual(normalize(T.fileOf('dsh-resource://file/absolute/C:/a.md', 'owner')), { sessionId: 'owner', path: 'C:/a.md' })
  assert.equal(T.fileOf('dsh-resource://file/absolute//host/share/a.md', 'o').path, '//host/share/a.md')
})
await test('byte reads preserve BOM, CRLF, trailing newline and UTF-8 boundaries', async () => {
  for (const content of ['', '\ufeff# 中文\r\n段落 😀\r\n', '\n', 'last-no-newline']) {
    const got = await T.readDocument(remoteOf(content, 1), { sessionId: 's', path: 'a.md' }, new AbortController().signal)
    assert.equal(got.content, content)
  }
})
await test('reject binary, invalid UTF-8, oversize and aborted reads', async () => {
  for (const content of ['a\0b', Buffer.from([0xff])]) await assert.rejects(T.readDocument(remoteOf(content), {}, new AbortController().signal), /UTF-8|NUL/)
  await assert.rejects(T.readDocument(remoteOf('x'.repeat(2 * 1024 * 1024 + 1)), {}, new AbortController().signal), /2 MiB/)
  const abort = new AbortController(); abort.abort()
  await assert.rejects(T.readDocument(remoteOf('hello'), {}, abort.signal), e => e.name === 'AbortError')
})
await test('version mismatch retries once, never combines versions', async () => {
  // The reader asks for 64 KiB windows, so the body must exceed one window before a
  // mid-read version change is observable at all.
  const body = 'x'.repeat(65536 * 2 + 5)
  let windows = 0
  const remote = remoteOf(body, 65536)
  const original = remote.workspaceFiles.readBytes
  remote.workspaceFiles.readBytes = async (...args) => {
    windows++
    const got = await original(...args)
    const offset = args[2] && args[2].range ? args[2].range.offset : 0
    // Second window of the first attempt reports a newer version: the reader must discard
    // that whole attempt and start over instead of mixing two versions.
    if (windows === 2 && offset > 0) got.value.version = 'v2'
    return got
  }
  assert.equal((await T.readDocument(remote, {}, new AbortController().signal)).content, body)
  assert.ok(windows > 3, 'expected a retry after the version change, windows=' + String(windows))
  remote.workspaceFiles.stat = async () => ({ ok: true, value: { version: 'always-new' } })
  await assert.rejects(T.readDocument(remote, {}, new AbortController().signal), /变化/)
})
await test('independent settings tolerate blocked or corrupt storage', () => {
  const settings = T.createSettings({ getItem: () => '{', setItem: () => { throw Error('blocked') } })
  assert.equal(settings.getSnapshot().clearAfterSend, true)
  settings.set({ clearAfterSend: false, reportPrefix: 'prefix' })
  assert.equal(settings.getSnapshot().clearAfterSend, false)
  assert.equal(T.createSettings(undefined).getSnapshot().enabled, true)
})
await test('shared document, isolated sessions, subscription and retained dirty draft', async () => {
  const store = T.createDocumentStore(async () => ({ content: 'base', version: 'v1' }), async () => ({ version: 'v2' }), 1)
  const a = store.get('s', '/w/a.md', { sessionId: 's', path: 'a.md' })
  await a.load(false)
  assert.equal(a, store.get('s', '/w/a.md', {}))
  assert.notEqual(a, store.get('other', '/w/a.md', {}))
  let notified = 0; const unsub = a.subscribe(() => notified++)
  a.edit('draft'); a.annotations.set('s', '', [{ id: '1', note: '意见' }])
  assert.equal(notified, 2); unsub()
  const signal = new AbortController(); store.attach(a, signal.signal); signal.abort()
  assert.equal(store.get('s', '/w/a.md', {}), a)
  assert.equal(a.getSnapshot().draft, 'draft')
  assert.equal(store.hasDirty(), true)
  store.dispose()
})
await test('save snapshot preserves edits typed while saving', async () => {
  let finish
  const store = T.createDocumentStore(async () => ({ content: 'base', version: 'v1' }), () => new Promise(resolve => { finish = resolve }))
  const doc = store.get('owner', '/w/a.md', { sessionId: 'source', path: 'a.md' })
  await doc.load(false); doc.edit('submitted')
  const saving = doc.save(); doc.edit('newer'); finish({ version: 'v2' }); await saving
  assert.equal(doc.getSnapshot().content, 'submitted'); assert.equal(doc.getSnapshot().draft, 'newer')
  assert.equal(doc.getSnapshot().dirty, true); assert.equal(doc.getSnapshot().version, 'v2')
  store.dispose()
})
await test('external update preserves dirty content; save conflict cannot blind retry', async () => {
  let writes = 0
  const store = T.createDocumentStore(async () => ({ content: 'base', version: 'v1' }), async () => { writes++; throw Object.assign(Error('conflict'), { code: 'conflict' }) })
  const doc = store.get('s', '/a.md', {}); await doc.load(false); doc.edit('draft')
  await doc.save(); await doc.save()
  assert.equal(writes, 1); assert.equal(doc.getSnapshot().conflict, true); assert.equal(doc.getSnapshot().draft, 'draft')
  await doc.load(true); doc.edit('new draft'); doc.observe('v2')
  assert.equal(doc.getSnapshot().draft, 'new draft'); assert.equal(doc.getSnapshot().conflict, true)
  store.dispose()
})
await test('uncertain save reconciles committed content without resending', async () => {
  let content = 'base', writes = 0
  const store = T.createDocumentStore(async () => ({ content, version: 'v1' }), async payload => { writes++; content = payload.content; throw Object.assign(Error('network'), { code: 'uncertain' }) })
  const doc = store.get('s', '/a.md', {}); await doc.load(false); doc.edit('new'); await doc.save()
  assert.equal(writes, 1); assert.equal(doc.getSnapshot().dirty, false); assert.equal(doc.getSnapshot().saveState, 'saved')
  store.dispose()
})
await test('append only to owning session, without submit/send', () => {
  const drafts = { owner: 'existing', active: 'untouched' }
  T.appendReport({ input: { for: scope => ({ state: { getSnapshot: () => ({ draft: drafts[scope.id] }) }, setDraft: text => { drafts[scope.id] = text } }) } }, { scope: id => ({ id }) }, 'owner', 'report')
  assert.equal(drafts.owner, 'existing\n\nreport'); assert.equal(drafts.active, 'untouched')
})
console.log(`integration OK: ${checks} scenarios`)
