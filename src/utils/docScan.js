// محرّك الماسح على الخيط الرئيسي: يشغّل المعالجة في Worker (واجهة سلسة) مع احتياط للمتصفحات القديمة
let engine = null

class ScanEngine {
  constructor() { this.seq = 0; this.pending = new Map(); this.worker = null; this.inline = null; this.start() }
  start() {
    try {
      this.worker = new Worker(new URL('./docScan.worker.js', import.meta.url), { type: 'module' })
      this.worker.onmessage = e => { const p = this.pending.get(e.data.id); if (p) { this.pending.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data.result) } }
      this.worker.onerror = () => this.fallback()
    } catch { this.fallback() }
  }
  fallback() {
    this.worker?.terminate(); this.worker = null
    this.inline = import('./docScanHandler')
    for (const [, p] of this.pending) p.rej(new Error('worker-failed'))
    this.pending.clear()
  }
  async call(msg, transfer = []) {
    if (this.inline) { const { handle } = await this.inline; return handle(msg) }
    const id = ++this.seq
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.worker.postMessage({ ...msg, id }, transfer) })
  }
  warmup() { return this.call({ type: 'ping' }).catch(() => null) }
  detect(bitmap) { return this.call({ type: 'detect', bitmap }, [bitmap]) }   // { quad, metrics }
  capture(bitmaps, hint, mode) { return this.call({ type: 'capture', bitmaps, hint, mode }, bitmaps) }
  render(mode, crop) { return this.call({ type: 'render', mode, crop }) }
}

export const getEngine = () => (engine ??= new ScanEngine())
