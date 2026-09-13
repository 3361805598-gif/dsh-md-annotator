import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
export async function materialize(extra = {}) {
  let handoff
  const react = { createElement: (type, props, ...children) => ({ type, props, children }), Component: class {}, memo: fn => fn }
  const window = { __ModuleLoader__: { load: value => { handoff = value } }, addEventListener() {}, removeEventListener() {}, ...extra.window }
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { window, console, URL, TextDecoder, TextEncoder, Uint8Array, AbortController, DOMException, atob, setTimeout, ...extra })
  const mod = handoff.factory(name => name === 'react' ? react : name === 'react-dom' ? { createPortal: x => x } : (() => { throw new Error('unexpected module: ' + name) })())
  return mod
}
