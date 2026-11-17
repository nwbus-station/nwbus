// أدوات صور مضمونة (بدون ذكاء اصطناعي ولا أخطاء): قص بنسبة الشاشة، سطوع/تباين/تشبع، تحسين تلقائي، وخلفية ضبابية لملء الفراغ.
// كل المعالجة داخل المتصفح على canvas، والمخرجات بمقاس القالب تماماً.

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// تحسين تلقائي: يقيس متوسط الإضاءة والتباين من نسخة صغيرة ويقترح قيماً معتدلة
export async function autoEnhance(src) {
  const img = await loadImage(src)
  const s = 64, c = document.createElement('canvas'); c.width = s; c.height = s
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, s, s)
  const d = g.getImageData(0, 0, s, s).data
  let sum = 0, sum2 = 0, sat = 0
  const n = d.length / 4
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2]
    const L = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255
    sum += L; sum2 += L * L
    sat += (Math.max(r, gg, b) - Math.min(r, gg, b)) / 255
  }
  const mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean)), meanSat = sat / n
  return {
    brightness: +clamp(0.46 / Math.max(0.12, mean), 0.8, 1.45).toFixed(2),
    contrast: +clamp(0.24 / Math.max(0.08, std), 1, 1.35).toFixed(2),
    saturate: +clamp(0.32 / Math.max(0.1, meanSat), 1, 1.3).toFixed(2),
  }
}

const supportsFilter = (() => { try { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(1px)'; return c.filter === 'blur(1px)' } catch { return false } })()

// يرسم الصورة بمقاس (w×h): fit = cover (تملأ وتُقص حول نقطة التركيز) أو contain (كاملة مع خلفية ضبابية)
export async function processBackground(src, { w, h, brightness = 1, contrast = 1, saturate = 1, fit = 'cover', fx = 0.5, fy = 0.5 }) {
  const img = await loadImage(src)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h)
  const iw = img.naturalWidth, ih = img.naturalHeight
  const cover = () => {
    const sc = Math.max(w / iw, h / ih), dw = iw * sc, dh = ih * sc
    g.drawImage(img, -(dw - w) * clamp(fx, 0, 1), -(dh - h) * clamp(fy, 0, 1), dw, dh)
  }
  if (fit === 'contain') {
    if (supportsFilter) { g.filter = 'blur(40px) brightness(0.6)'; cover(); g.filter = 'none' } else { g.globalAlpha = 0.35; cover(); g.globalAlpha = 1 }
    const sc = Math.min(w / iw, h / ih), dw = iw * sc, dh = ih * sc
    g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
  } else cover()
  if (brightness !== 1 || contrast !== 1 || saturate !== 1) {
    const im = g.getImageData(0, 0, w, h), d = im.data
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * brightness, gg = d[i + 1] * brightness, b = d[i + 2] * brightness
      r = (r - 128) * contrast + 128; gg = (gg - 128) * contrast + 128; b = (b - 128) * contrast + 128
      const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b
      r = L + (r - L) * saturate; gg = L + (gg - L) * saturate; b = L + (b - L) * saturate
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
    }
    g.putImageData(im, 0, 0)
  }
  return c.toDataURL('image/jpeg', 0.92)
}
