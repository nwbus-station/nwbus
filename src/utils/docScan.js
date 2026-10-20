// مسح المستندات: كشف حواف الورقة وتسويتها (perspective) وتحسينها — OpenCV.js يُحمَّل عند أول استخدام فقط
// ملاحظة: كائن cv نفسه «thenable»، لذا لا نمرّره أبداً عبر Promise/await مباشرة (يسبب حلقة لا نهائية) بل داخل {cv}
let cvPromise = null
export function loadCV() {
  if (!cvPromise) {
    cvPromise = import('./cvLoader').then(m => new Promise(resolve => {
      const { raw } = m.getRawCV()
      const done = inst => { try { delete inst.then } catch { /* لا شي */ } resolve({ cv: inst }) }
      if (raw.Mat) done(raw)
      else if (typeof raw.then === 'function') raw.then(inst => done(inst ?? raw))
      else raw.onRuntimeInitialized = () => done(raw)
    }))
  }
  return cvPromise
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// ترتيب الزوايا: أعلى-يسار، أعلى-يمين، أسفل-يمين، أسفل-يسار
function orderQuad(pts) {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x))
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]]
}

// يرجع زوايا الورقة بإحداثيات الـcanvas أو null لو ما لقى مستطيل واضح
export function detectQuad(cv, canvas) {
  const scale = Math.min(1, 480 / canvas.width)
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(canvas.width * scale)); small.height = Math.max(1, Math.round(canvas.height * scale))
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height)
  const src = cv.imread(small), gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat()
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U), contours = new cv.MatVector(), hier = new cv.Mat()
  let best = null
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)
    cv.Canny(blur, edges, 60, 160)
    cv.dilate(edges, edges, kernel)
    cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
    const minArea = small.width * small.height * 0.16
    let bestArea = 0
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      const area = cv.contourArea(cnt)
      if (area >= minArea && area > bestArea) {
        const approx = new cv.Mat()
        cv.approxPolyDP(cnt, approx, 0.02 * cv.arcLength(cnt, true), true)
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const d = approx.data32S
          best = [0, 1, 2, 3].map(k => ({ x: d[k * 2], y: d[k * 2 + 1] }))
          bestArea = area
        }
        approx.delete()
      }
      cnt.delete()
    }
  } finally { src.delete(); gray.delete(); blur.delete(); edges.delete(); kernel.delete(); contours.delete(); hier.delete() }
  return best ? orderQuad(best).map(p => ({ x: p.x / scale, y: p.y / scale })) : null
}

// تسوية الورقة داخل الزوايا إلى مستطيل مستقيم + تحسين: mode = 'color' (تباين محسّن) أو 'bw' (أبيض وأسود كالماسح)
export function warpAndEnhance(cv, canvas, quad, mode = 'color') {
  const out = document.createElement('canvas')
  const src = cv.imread(canvas)
  let dst = new cv.Mat()
  try {
    if (quad) {
      const [tl, tr, br, bl] = quad
      let W = Math.round(Math.max(dist(br, bl), dist(tr, tl))), H = Math.round(Math.max(dist(tr, br), dist(tl, bl)))
      const k = Math.min(1, 2000 / Math.max(W, H)); W = Math.max(50, Math.round(W * k)); H = Math.max(50, Math.round(H * k))
      const from = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y])
      const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H])
      const M = cv.getPerspectiveTransform(from, to)
      cv.warpPerspective(src, dst, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
      from.delete(); to.delete(); M.delete()
    } else {
      src.copyTo(dst)
    }
    if (mode === 'bw') {
      const g = new cv.Mat()
      cv.cvtColor(dst, g, cv.COLOR_RGBA2GRAY)
      cv.adaptiveThreshold(g, g, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 14)
      cv.cvtColor(g, dst, cv.COLOR_GRAY2RGBA)
      g.delete()
    } else {
      dst.convertTo(dst, -1, 1.18, 8)
    }
    cv.imshow(out, dst)
  } finally { src.delete(); dst.delete() }
  return out
}

// لصورة جاهزة (مرفوعة من الجهاز): تحميلها بحجم معقول كـcanvas
export async function fileToCanvas(file, maxSide = 2200) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return c
}

export const canvasToBlob = (canvas, q = 0.85) => new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('compress'))), 'image/jpeg', q))
