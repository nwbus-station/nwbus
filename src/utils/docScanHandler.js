// معالج رسائل الماسح: يُستخدم داخل الـWorker (الأسرع) أو على الخيط الرئيسي كاحتياط
import { getRawCV } from './cvLoader'
import { detectQuad, warp } from './docScanCore'

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

async function render(cv, state, mode, crop) {
  const out = warp(cv, state.img, crop ? state.quad : null, mode)
  const c = mkCanvas(out.width, out.height)
  c.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0)
  return { blob: await toBlob(c, 0.88), width: out.width, height: out.height, hasQuad: !!state.quad }
}

const state = { img: null, quad: null }

export async function handle(data) {
  const { cv } = await initCV()
  if (data.type === 'ping') return { ready: true }
  if (data.type === 'detect') return { quad: detectQuad(cv, toImageData(data.bitmap), 320) }
  if (data.type === 'capture') {
    state.img = toImageData(data.bitmap)
    state.quad = detectQuad(cv, state.img, 900) ?? data.hint ?? null  // إعادة كشف بدقة أعلى على الإطار الكامل
    return render(cv, state, data.mode, !!state.quad)
  }
  if (data.type === 'render') return state.img ? render(cv, state, data.mode, data.crop) : null
  return null
}
