import { handle } from './docScanHandler'
self.onmessage = async e => {
  const { id } = e.data
  try { self.postMessage({ id, result: await handle(e.data) }) }
  catch (err) { self.postMessage({ id, error: String(err?.message || err) }) }
}
