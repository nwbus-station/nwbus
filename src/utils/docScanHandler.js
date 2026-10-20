// معالج رسائل الماسح: يُستخدم داخل الـWorker (الأسرع) أو على الخيط الرئيسي كاحتياط
import { getRawCV } from './cvLoader'
import { detectQuad, warp, quality, sharpness } from './docScanCore'

const mkCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }))
const toBlob = (c, q) => (c.convertToBlob ? c.convertToBlob({ type: 'image/jpeg', quality: q }) : new Promise(res => c.toBlob(res, 'image/jpeg', q)))

// كائن cv «thenable»: لا يُمرَّر عبر await/resolve مباشرة (حلقة لا نهائية) بل داخل {cv}
let cvReady = null
export function initCV() {
  if (!cvReady) {
    cvReady = new Promise(resolve => {
      const { raw } = getRawCV()
      const done = inst => { try { delete inst.then } catch { /* لا شي */ } resolve({ cv: inst }) }
      if (raw.Mat) done(raw)
      else if (typeof raw.then === 'function') raw.then(inst => done(inst ?? raw))
      else raw.onRuntimeInitialized = () => done(raw)
    })
  }
  return cvReady
}

function toImageData(bitmap) {
  const c = mkCanvas(bitmap.width, bitmap.height)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  const d = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close?.()
  return d
}

async function render(cv, state, mode, crop, rot = 0) {
  const out = warp(cv, state.img, crop ? state.quad : null, mode, rot)
  const c = mkCanvas(out.width, out.height)
  c.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0)
  return { blob: await toBlob(c, 0.88), width: out.width, height: out.height, hasQuad: !!state.quad }
}

const state = { img: null, quad: null }

export async function handle(data) {
  const { cv } = await initCV()
  if (data.type === 'ping') return { ready: true }
  if (data.type === 'detect') {
    const img = toImageData(data.bitmap)
    const quad = detectQuad(cv, img, 320)
    return { quad, metrics: quad ? quality(cv, img, quad) : null }
  }
  if (data.type === 'capture') {
    // نختار أوضح لقطة من عدة لقطات متتالية
    let best = null, bestS = -1
    for (const b of data.bitmaps) {
      const img = toImageData(b)
      const s = sharpness(cv, img)
      if (s > bestS) { bestS = s; best = img }
    }
    state.img = best
    state.quad = detectQuad(cv, best, 900) ?? data.hint ?? null  // إعادة كشف بدقة أعلى على الإطار الكامل
    // معاينة الإطار الكامل لشاشة ضبط الحواف
    const k = Math.min(1, 1280 / best.width)
    const pc = mkCanvas(Math.round(best.width * k), Math.round(best.height * k))
    const full = mkCanvas(best.width, best.height)
    full.getContext('2d').putImageData(best, 0, 0)
    pc.getContext('2d').drawImage(full, 0, 0, pc.width, pc.height)
    return { preview: await toBlob(pc, 0.82), width: best.width, height: best.height, quad: state.quad }
  }
  if (data.type === 'render') {
    if (!state.img) return null
    if (data.quad) state.quad = data.quad
    return render(cv, state, data.mode, !!data.crop && !!state.quad, data.rot || 0)
  }
  return null
}
