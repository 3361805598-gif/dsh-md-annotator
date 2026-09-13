// Optional real React/browser regression. Supply DSH_NODE_MODULES and
// CHROMIUM_EXECUTABLE when the host runtime/browser is outside this project.
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const modules = process.env.DSH_NODE_MODULES
const react = modules ? resolve(modules, 'react') : dirname(require.resolve('react/package.json'))
const dom = modules ? resolve(modules, 'react-dom') : dirname(require.resolve('react-dom/package.json'))
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.setContent(`<style>:root{--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#aaa;--dsw-alias-bg-base:#202020;--dsw-alias-bg-layer-1:#252525;--dsw-alias-bg-layer-2:#303030;--dsw-alias-border-l1:#383838;--dsw-alias-border-l2:#555;--dsw-alias-brand-primary:#89aaff;--dsw-alias-state-warn-primary:#d3b75d}body{background:#202020;margin:0}#app{height:780px;width:1100px}</style><div id="app"></div>`)
  await page.addScriptTag({ path: resolve(react, 'umd/react.development.js') })
  await page.addScriptTag({ path: resolve(dom, 'umd/react-dom.development.js') })
  await page.evaluate(() => { window.__ModuleLoader__ = { load: module => { window.plugin = module.factory(name => name === 'react' ? React : ReactDOM) } } })
  await page.addScriptTag({ path: fileURLToPath(new URL('../lib/client.js', import.meta.url)) })
  await page.evaluate(async () => {
    const t = window.plugin._test
    const text = '# 文档审阅示例\n\n这是用于验证批注布局的虚构文本。选中文字可以添加意见，卡片排列在正文右侧。\n\n| 层次 | 内容 |\n| --- | --- |\n| 示例 | 表格内容用于检查右侧批注 |\n\n- 第一项：测试列表批注。\n- 第二项：检查同段多条意见。\n\n' + Array.from({ length: 15 }, (_, i) => `第 ${i + 1} 段：用于检查滚动定位和布局的虚构内容。`).join('\n\n')
    const documents = t.createDocumentStore(async () => ({ content: text, version: 'v1' }), async () => ({}))
    const doc = documents.get('test', '/fixture.md', {})
    await doc.load(false)
    const blocks = t.parseBlocks(text), index = t.buildRefIndex(blocks)
    const note = (id, bi, value) => ({ v: 1, id, ref: t.encodeRef(bi, undefined, index.blockSigs[bi]), source: blocks[bi].source, start: blocks[bi].start, end: blocks[bi].end, kind: 'suggest', note: value })
    doc.annotations.set(null, null, [note('second', 2, '表格批注'), note('first', 1, '第一条批注'), note('long', 1, '同一段的较长批注。'.repeat(30))])
    const settings = t.createSettings(null); settings.set({ clearAfterSend: false })
    window.doc = doc; window.reports = []; window.fileVersion = 'v1'
    window.root = ReactDOM.createRoot(document.getElementById('app'))
    window.root.render(React.createElement(React.StrictMode, null, React.createElement(t.BetterMarkdownViewer, { customData: { doc, version: 'v1' }, scope: { sessionId: 'test' }, path: '/fixture.md', remote: { workspaceFiles: { stat: async () => ({ ok: true, value: { version: window.fileVersion, absolutePath: '/fixture.md' } }) } }, runtime: { documents, settings, append: (_s, report) => window.reports.push(report) } })))
  })
  await page.locator('.mdan-card').first().waitFor()
  for (const width of [1100, 650, 420, 1100]) {
    await page.evaluate(width => { document.getElementById('app').style.width = width + 'px' }, width)
    await page.waitForTimeout(150)
    const geometry = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.mdan-card')).map(el => ({ id: el.dataset.noteId, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, left: el.getBoundingClientRect().left }))
      const paths = Array.from(document.querySelectorAll('.mdan-connector')).map(el => el.getAttribute('d'))
      return { cards, paths, articleRight: document.querySelector('.mdan-article').getBoundingClientRect().right, inlineNotes: document.querySelectorAll('.mdan-article .mdan-note,.mdan-article .mdan-editor').length }
    })
    assert.deepEqual(geometry.cards.map(c => c.id), ['first', 'long', 'second'])
    assert.equal(geometry.inlineNotes, 0)
    assert.equal(geometry.paths.length, geometry.cards.length)
    geometry.paths.forEach(path => assert.match(path, /^M [\d.]+ [\d.]+ H [\d.]+ V [\d.]+ H [\d.]+$/))
    geometry.cards.forEach((c, i) => { assert(c.left >= geometry.articleRight); if (i) assert(c.top >= geometry.cards[i - 1].bottom + 10) })
  }
  await page.locator('[data-note-id="first"]').getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('.mdan-editor-input').fill('修改后的批注')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  assert.equal(await page.locator('[data-note-id="first"] .mdan-card-text').textContent(), '修改后的批注')
  await page.locator('[data-note-id="first"]').hover()
  assert.equal(await page.locator('.mdan-connector-active').count(), 2)
  // Capture a real DOM selection and create a selection annotation.
  await page.evaluate(() => {
    const unit = document.querySelectorAll('[data-mdan-ref]')[1]
    const node = unit.querySelector('p').firstChild
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 8)
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
    unit.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await page.locator('.mdan-selpick').click()
  await page.locator('.mdan-editor-input').fill('选区批注')
  await page.getByRole('button', { name: '保存批注', exact: true }).click()
  assert.equal(await page.locator('.mdan-card').count(), 4)
  assert(await page.evaluate(() => Array.from(CSS.highlights.values()).some(h => h.size > 0)))
  await page.locator('[data-note-id="first"]').getByRole('button', { name: '写入草稿', exact: true }).click()
  assert.equal(await page.evaluate(() => window.reports.length), 1)
  await page.locator('[data-note-id="long"]').getByRole('button', { name: '删除', exact: true }).click()
  assert.equal(await page.locator('.mdan-card').count(), 3)
  await page.getByRole('button', { name: '源码', exact: true }).click()
  assert.equal(await page.locator('.mdan-rail').count(), 0)
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.locator('.mdan-card').first().waitFor()
  await page.screenshot({ path: process.env.RAIL_SCREENSHOT || '/tmp/mdan-rail.png' })
  await page.evaluate(() => { window.doc.edit('unsaved draft'); window.fileVersion = 'v2' })
  await page.waitForFunction(() => window.doc.getSnapshot().conflict === true)
  assert.equal(await page.evaluate(() => window.doc.getSnapshot().draft), 'unsaved draft')
  await page.evaluate(() => window.root.unmount())
  assert.equal(await page.evaluate(() => window.doc.users.size), 0)
  assert.equal(await page.evaluate(() => CSS.highlights.size), 0)
  assert.deepEqual(errors, [])
  console.log('browser rail OK: ordering, collision avoidance, resize, selection, edit, delete, draft, mode switch, highlight cleanup')
} finally { await browser.close() }
