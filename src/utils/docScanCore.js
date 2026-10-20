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

// عتبة Otsu من الهستوغرام ابتداءً من مستوى lo
function otsuHist(hist, lo) {
  let total = 0, sum = 0
  for (let i = lo; i < 256; i++) { total += hist[i]; sum += i * hist[i] }
  if (total < 50) return lo
  let wB = 0, sB = 0, best = lo, bestV = -1
  for (let t = lo; t < 256; t++) {
    wB += hist[t]; if (!wB) continue
    const wF = total - wB; if (!wF) break
    sB += t * hist[t]
    const mB = sB / wB, mF = (sum - sB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > bestV) { bestV = v; best = t }
  }
  return best
}

// مستطيلات مرشّحة من قناع ثنائي (الورقة = أبيض). الثقوب (النص) تُهمَل بـ RETR_EXTERNAL
function quadsFromMask(cv, mask, w, h, out, gray, grad) {
  const contours = new cv.MatVector(), hier = new cv.Mat()
  try {
    cv.findContours(mask, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      const area = cv.contourArea(cnt)
      if (area > w * h * 0.1 && area < w * h * 0.985) {
        const hull = new cv.Mat()
        cv.convexHull(cnt, hull, false, true)
        const hullArea = cv.contourArea(hull)
        const solidity = area / (hullArea || 1)
        let q = null
        const peri = cv.arcLength(hull, true)
        for (const eps of [0.02, 0.03, 0.045, 0.07]) {
          const approx = new cv.Mat()
          cv.approxPolyDP(hull, approx, eps * peri, true)
          if (approx.rows === 4) {
            const d = approx.data32S
            q = orderQuad([0, 1, 2, 3].map(k => ({ x: d[k * 2], y: d[k * 2 + 1] })))
            approx.delete(); break
          }
          approx.delete()
        }
        if (!q || !angleOk(q)) {          // احتياط: أصغر مستطيل دوّار يحيط بالورقة
          const r = cv.minAreaRect(cnt)
          const rectArea = r.size.width * r.size.height
          if (rectArea > 0 && area / rectArea >= 0.8) {
            q = orderQuad(cv.RotatedRect.points(r).map(p => ({ x: p.x, y: p.y })))
          } else q = null
        }
        if (q && angleOk(q)) {
          // قوة الحواف على محيط المرشّح: حدود الورقة الحقيقية فيها تدرّج لوني قوي على أضلاعها الأربعة، أما المنطقة الخاطئة فأضلاعها على فراغ/حافة الإطار
          const tmp = cv.Mat.zeros(h, w, cv.CV_8U)
          for (let k = 0; k < 4; k++) cv.line(tmp, new cv.Point(q[k].x, q[k].y), new cv.Point(q[(k + 1) % 4].x, q[(k + 1) % 4].y), new cv.Scalar(255), 5)
          const edge = cv.mean(grad, tmp)[0]
          cv.fillConvexPoly(tmp, hull, new cv.Scalar(255))
          tmp.setTo(new cv.Scalar(0)); cv.fillConvexPoly(tmp, hull, new cv.Scalar(255))
          const mb = cv.mean(gray, tmp)[0]
          tmp.delete()
          const score = Math.pow(edge + 2, 1.6) * Math.sqrt(hullArea) * solidity * solidity * (0.5 + mb / 510)
          out.push({ q, area: score, dbg: { a: Math.round(hullArea), sol: +solidity.toFixed(2), mb: Math.round(mb), edge: +edge.toFixed(1), t: out.tag } })
        }
      }
      cnt.delete()
    }
  } finally { contours.delete(); hier.delete() }
}

// زوايا الورقة بإحداثيات الصورة الأصلية أو null. عدة أقنعة: عتبة Otsu للسطوع، أبيض منخفض التشبّع (HSV)، ثم حواف Canny كاحتياط
export function detectQuad(cv, img, maxW = 320) {
  const full = cv.matFromImageData(img)
  const scale = Math.min(1, maxW / img.width)
  const src = new cv.Mat()
  if (scale < 1) cv.resize(full, src, new cv.Size(Math.round(img.width * scale), Math.round(img.height * scale)), 0, 0, cv.INTER_AREA)
  else full.copyTo(src)
  full.delete()
  const gray = new cv.Mat(), blur = new cv.Mat(), maskA = new cv.Mat(), maskB = new cv.Mat(), rgb = new cv.Mat(), hsv = new cv.Mat(), grad = new cv.Mat()
  const k5 = cv.Mat.ones(5, 5, cv.CV_8U), k9 = cv.Mat.ones(9, 9, cv.CV_8U)
  const found = []
  const clean = m => { cv.morphologyEx(m, m, cv.MORPH_OPEN, k5); cv.morphologyEx(m, m, cv.MORPH_CLOSE, k9) }
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0)
    { // خريطة التدرّج (حدّة الحواف) من نسخة خفيفة التنعيم
      const g3 = new cv.Mat(), dx = new cv.Mat(), dy = new cv.Mat(), ax = new cv.Mat(), ay = new cv.Mat()
      cv.GaussianBlur(gray, g3, new cv.Size(3, 3), 0)
      cv.Sobel(g3, dx, cv.CV_16S, 1, 0, 3); cv.Sobel(g3, dy, cv.CV_16S, 0, 1, 3)
      cv.convertScaleAbs(dx, ax); cv.convertScaleAbs(dy, ay)
      cv.addWeighted(ax, 0.5, ay, 0.5, 0, grad)
      g3.delete(); dx.delete(); dy.delete(); ax.delete(); ay.delete()
    }
    // أ) عتبة Otsu: الورقة الفاتحة على خلفية أغمق
    cv.threshold(blur, maskA, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
    clean(maskA)
    found.tag = 'otsu'; quadsFromMask(cv, maskA, src.cols, src.rows, found, gray, grad)
    // أ2) مستوى ثانٍ: أفتح منطقة داخل الأفتح (الورقة فوق سطح فاتح/رمادي)
    const hist = new Array(256).fill(0); const bd = blur.data; for (let i = 0; i < bd.length; i++) hist[bd[i]]++
    const t0 = otsuHist(hist, 0), t1 = otsuHist(hist, t0 + 1)
    if (t1 > t0 + 8) { found.tag = 't1=' + t1; const m2 = new cv.Mat(); cv.threshold(blur, m2, t1, 255, cv.THRESH_BINARY); clean(m2); quadsFromMask(cv, m2, src.cols, src.rows, found, gray, grad); m2.delete() }
    // ب) أبيض منخفض التشبّع: يفصل الورقة عن سجاد/خشب ملوّن حتى لو كان فاتحاً
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV)
    const ch = new cv.MatVector(); cv.split(hsv, ch)
    const sat = ch.get(1), val = ch.get(2), vBlur = new cv.Mat(), vThr = new cv.Mat(), sLow = new cv.Mat()
    cv.GaussianBlur(val, vBlur, new cv.Size(7, 7), 0)
    cv.threshold(vBlur, vThr, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
    cv.threshold(sat, sLow, 70, 255, cv.THRESH_BINARY_INV)
    cv.bitwise_and(vThr, sLow, maskB)
    clean(maskB)
    found.tag = 'hsv'; quadsFromMask(cv, maskB, src.cols, src.rows, found, gray, grad)
    ch.delete(); sat.delete(); val.delete(); vBlur.delete(); vThr.delete(); sLow.delete()
    // ج) حواف Canny (احتياط عند فشل ما سبق)
    if (!found.length) {
      const edges = new cv.Mat(), k3 = cv.Mat.ones(3, 3, cv.CV_8U)
      const m = cv.mean(blur)[0]
      cv.Canny(blur, edges, Math.max(20, 0.66 * m), Math.min(255, Math.max(70, 1.33 * m)))
      cv.dilate(edges, edges, k3); cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, k9)
      quadsFromMask(cv, edges, src.cols, src.rows, found, gray, grad)
      edges.delete(); k3.delete()
    }
  } finally { src.delete(); gray.delete(); blur.delete(); maskA.delete(); maskB.delete(); rgb.delete(); hsv.delete(); grad.delete(); k5.delete(); k9.delete() }
  if (!found.length) return null
  found.sort((a, b) => b.area - a.area)
  detectQuad.last = found.map(f => f.dbg)
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
export function warp(cv, img, quad, mode = 'color', rot = 0) {
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
    for (let i = 0; i < (rot % 4 + 4) % 4; i++) { const t = new cv.Mat(); cv.rotate(dst, t, cv.ROTATE_90_CLOCKWISE); t.copyTo(dst); t.delete() }
    return { width: dst.cols, height: dst.rows, data: new Uint8ClampedArray(dst.data) }
  } finally { src.delete(); dst.delete() }
}

// جودة الإطار داخل حدود الورقة: حدّة (تباين لابلاس)، سطوع، انعكاس، اكتمال الورقة داخل الإطار
export function quality(cv, img, quad) {
  const src = cv.matFromImageData(img), gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
  const xs = quad.map(p => p.x), ys = quad.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const bw = maxX - minX, bh = maxY - minY
  const clampRect = (x0, y0, x1, y1) => {
    const x = Math.max(0, Math.round(x0)), y = Math.max(0, Math.round(y0))
    return new cv.Rect(x, y, Math.max(8, Math.min(img.width - x, Math.round(x1 - x0))), Math.max(8, Math.min(img.height - y, Math.round(y1 - y0))))
  }
  // الحدّة: على نطاق يشمل حواف الورقة (يعمل حتى لو الورقة بيضاء بلا نص) — السطوع والانعكاس: داخل الورقة
  const edgeRoi = gray.roi(clampRect(minX - bw * 0.06, minY - bh * 0.06, maxX + bw * 0.06, maxY + bh * 0.06))
  const inRoi = gray.roi(clampRect(minX + bw * 0.12, minY + bh * 0.12, maxX - bw * 0.12, maxY - bh * 0.12))
  const lap = new cv.Mat(), mean = new cv.Mat(), std = new cv.Mat(), hi = new cv.Mat()
  let sharp = 0, bright = 0, glare = 0
  try {
    cv.Laplacian(edgeRoi, lap, cv.CV_64F)
    cv.meanStdDev(lap, mean, std)
    sharp = std.data64F[0] * std.data64F[0]
    bright = cv.mean(inRoi)[0]
    cv.threshold(inRoi, hi, 250, 255, cv.THRESH_BINARY)
    glare = cv.countNonZero(hi) / (inRoi.rows * inRoi.cols)
  } finally { src.delete(); gray.delete(); edgeRoi.delete(); inRoi.delete(); lap.delete(); mean.delete(); std.delete(); hi.delete() }
  const m = 0.012
  const full = minX > img.width * m && minY > img.height * m && maxX < img.width * (1 - m) && maxY < img.height * (1 - m)
  let area = 0
  for (let i = 0; i < 4; i++) { const a = quad[i], b = quad[(i + 1) % 4]; area += a.x * b.y - b.x * a.y }
  return { sharp, bright, glare, full, areaFrac: Math.abs(area / 2) / (img.width * img.height) }
}

// حدّة إطار كامل (لاختيار الأوضح بين عدة لقطات)
export function sharpness(cv, img) {
  const full = cv.matFromImageData(img), small = new cv.Mat(), gray = new cv.Mat(), lap = new cv.Mat(), mean = new cv.Mat(), std = new cv.Mat()
  try {
    const k = Math.min(1, 640 / img.width)
    cv.resize(full, small, new cv.Size(Math.round(img.width * k), Math.round(img.height * k)), 0, 0, cv.INTER_AREA)
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY)
    cv.Laplacian(gray, lap, cv.CV_64F)
    cv.meanStdDev(lap, mean, std)
    return std.data64F[0] * std.data64F[0]
  } finally { full.delete(); small.delete(); gray.delete(); lap.delete(); mean.delete(); std.delete() }
}
