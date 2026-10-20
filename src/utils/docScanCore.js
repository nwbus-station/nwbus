// نواة المسح (OpenCV): كشف الورقة وتسويتها — تعمل على ImageData فقط فتصلح داخل Worker وخارجه
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

function orderQuad(pts) {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x))
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]] // أعلى-يسار، أعلى-يمين، أسفل-يمين، أسفل-يسار
}

function angleOk(q) {
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y }
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1)
    const deg = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI
    if (deg < 55 || deg > 125) return false
  }
  return true
}

// كل المستطيلات المرشّحة في قناع ثنائي/حواف
function quadsFromMask(cv, mask, w, h, out) {
  const contours = new cv.MatVector(), hier = new cv.Mat()
  try {
    cv.findContours(mask, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      const area = cv.contourArea(cnt)
      if (area > w * h * 0.15 && area < w * h * 0.985) {
        const peri = cv.arcLength(cnt, true)
        for (const eps of [0.02, 0.035, 0.05]) {
          const approx = new cv.Mat()
          cv.approxPolyDP(cnt, approx, eps * peri, true)
          if (approx.rows === 4 && cv.isContourConvex(approx)) {
            const d = approx.data32S
            const q = orderQuad([0, 1, 2, 3].map(k => ({ x: d[k * 2], y: d[k * 2 + 1] })))
            if (angleOk(q)) out.push({ q, area })
            approx.delete()
            break
          }
          approx.delete()
        }
      }
      cnt.delete()
    }
  } finally { contours.delete(); hier.delete() }
}

// زوايا الورقة بإحداثيات الصورة الأصلية أو null. تمريرتان: حواف Canny ثم عتبة Otsu (للورقة الفاتحة على خلفية داكنة)
export function detectQuad(cv, img, maxW = 320) {
  const full = cv.matFromImageData(img)
  const scale = Math.min(1, maxW / img.width)
  const src = new cv.Mat()
  if (scale < 1) cv.resize(full, src, new cv.Size(Math.round(img.width * scale), Math.round(img.height * scale)), 0, 0, cv.INTER_AREA)
  else full.copyTo(src)
  full.delete()
  const gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat(), mask = new cv.Mat()
  const k5 = cv.Mat.ones(5, 5, cv.CV_8U), k3 = cv.Mat.ones(3, 3, cv.CV_8U)
  const found = []
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)
    const m = cv.mean(blur)[0]
    cv.Canny(blur, edges, Math.max(20, 0.66 * m), Math.min(255, Math.max(70, 1.33 * m)))
    cv.dilate(edges, edges, k3)
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, k5)
    quadsFromMask(cv, edges, src.cols, src.rows, found)
    if (!found.length) {
      cv.threshold(blur, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
      cv.morphologyEx(mask, mask, cv.MORPH_OPEN, k5)
      quadsFromMask(cv, mask, src.cols, src.rows, found)
    }
  } finally { src.delete(); gray.delete(); blur.delete(); edges.delete(); mask.delete(); k5.delete(); k3.delete() }
  if (!found.length) return null
  found.sort((a, b) => b.area - a.area)
  return found[0].q.map(p => ({ x: p.x / scale, y: p.y / scale }))
}

// خلفية الإضاءة بسرعة: نصغّر الصورة (÷8)، نطمس، ثم نكبّرها (أسرع بكثير من طمس كبير على الدقة الكاملة)
function illumination(cv, m, sigmaFrac) {
  const f = 8, sw = Math.max(8, Math.round(m.cols / f)), sh = Math.max(8, Math.round(m.rows / f))
  const small = new cv.Mat(), bg = new cv.Mat()
  cv.resize(m, small, new cv.Size(sw, sh), 0, 0, cv.INTER_AREA)
  cv.GaussianBlur(small, small, new cv.Size(0, 0), Math.max(2, Math.min(sw, sh) * sigmaFrac))
  cv.resize(small, bg, new cv.Size(m.cols, m.rows), 0, 0, cv.INTER_LINEAR)
  small.delete()
  return bg
}

// تسوية الورقة + تحسين: mode = 'color' (تباين) أو 'bw' (تسوية الإضاءة ثم أبيض وأسود كالماسح)
export function warp(cv, img, quad, mode = 'color') {
  const src = cv.matFromImageData(img)
  const dst = new cv.Mat()
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
    } else src.copyTo(dst)

    if (mode === 'bw') {
      const g = new cv.Mat(), norm = new cv.Mat()
      cv.cvtColor(dst, g, cv.COLOR_RGBA2GRAY)
      const bg = illumination(cv, g, 0.12)
      cv.divide(g, bg, norm, 255)                          // تسوية الإضاءة والظلال
      cv.adaptiveThreshold(norm, norm, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 12)
      cv.cvtColor(norm, dst, cv.COLOR_GRAY2RGBA)
      g.delete(); bg.delete(); norm.delete()
    } else {
      // ألوان محسّنة: تسوية الإضاءة بالقسمة على الخلفية ثم تباين خفيف
      const rgb = new cv.Mat(), out = new cv.Mat()
      cv.cvtColor(dst, rgb, cv.COLOR_RGBA2RGB)
      const bg = illumination(cv, rgb, 0.25)
      cv.divide(rgb, bg, out, 235)
      out.convertTo(out, -1, 1.12, 4)
      cv.cvtColor(out, dst, cv.COLOR_RGB2RGBA)
      rgb.delete(); bg.delete(); out.delete()
    }
    return { width: dst.cols, height: dst.rows, data: new Uint8ClampedArray(dst.data) }
  } finally { src.delete(); dst.delete() }
}
