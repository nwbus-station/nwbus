// رسوم بيانية تُرسم بالمتصفح (canvas) وتُدرج كصور داخل ملف Excel — exceljs ما يدعم الرسوم الأصلية
const NAVY = '#264673', ORANGE = '#EE712D', GRID = '#e5e9f0', INK = '#1d1d1c', GREY = '#6b7280'
const FONT = 'Tahoma, Arial, sans-serif'

function canvas(w, h) {
  const c = document.createElement('canvas')
  const k = 2
  c.width = w * k; c.height = h * k
  const ctx = c.getContext('2d')
  ctx.scale(k, k)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#d9dee7'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
  return { c, ctx }
}
function title(ctx, w, text, isAr) {
  ctx.fillStyle = NAVY; ctx.font = `bold 14px ${FONT}`
  ctx.textAlign = isAr ? 'right' : 'left'; ctx.direction = isAr ? 'rtl' : 'ltr'
  ctx.fillText(text, isAr ? w - 16 : 16, 24)
}
const nice = max => { if (max <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(max))); const n = max / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p }
const fmt = v => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(Math.round(v)))
const done = c => c.toDataURL('image/png')

function axes(ctx, w, h, max, pad) {
  const top = 40, bottom = h - pad.b, left = pad.l, right = w - pad.r
  const top2 = nice(max)
  ctx.font = `10px ${FONT}`; ctx.fillStyle = GREY; ctx.textAlign = 'right'; ctx.direction = 'ltr'
  for (let i = 0; i <= 4; i++) {
    const y = bottom - ((bottom - top) * i) / 4
    ctx.strokeStyle = GRID; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke()
    ctx.fillText(fmt((top2 * i) / 4), left - 6, y + 3)
  }
  return { top, bottom, left, right, top2 }
}

export function lineChart({ title: t, labels, values, color = NAVY, w = 540, h = 270, isAr = true }) {
  const { c, ctx } = canvas(w, h)
  title(ctx, w, t, isAr)
  const A = axes(ctx, w, h, Math.max(...values, 1), { l: 44, r: 16, b: 34 })
  const n = values.length
  const x = i => A.left + ((A.right - A.left) * (n === 1 ? 0.5 : i / (n - 1)))
  const y = v => A.bottom - ((A.bottom - A.top) * v) / A.top2
  // مساحة تحت الخط
  ctx.beginPath(); ctx.moveTo(x(0), A.bottom)
  values.forEach((v, i) => ctx.lineTo(x(i), y(v)))
  ctx.lineTo(x(n - 1), A.bottom); ctx.closePath()
  ctx.fillStyle = color + '22'; ctx.fill()
  ctx.beginPath(); values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))))
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke()
  if (n <= 45) { ctx.fillStyle = color; values.forEach((v, i) => { ctx.beginPath(); ctx.arc(x(i), y(v), 3, 0, Math.PI * 2); ctx.fill() }) }
  ctx.fillStyle = GREY; ctx.font = `10px ${FONT}`; ctx.textAlign = 'center'; ctx.direction = 'ltr'
  const step = Math.max(1, Math.ceil(n / 8))
  labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) ctx.fillText(l, x(i), h - 14) })
  return done(c)
}

export function barChart({ title: t, labels, values, color = ORANGE, w = 540, h = 270, isAr = true }) {
  const { c, ctx } = canvas(w, h)
  title(ctx, w, t, isAr)
  const A = axes(ctx, w, h, Math.max(...values, 1), { l: 44, r: 16, b: 52 })
  const n = values.length, slot = (A.right - A.left) / Math.max(n, 1), bw = Math.min(36, slot * 0.6)
  values.forEach((v, i) => {
    const cx = A.left + slot * (i + 0.5), top = A.bottom - ((A.bottom - A.top) * v) / A.top2
    ctx.fillStyle = color; ctx.fillRect(cx - bw / 2, top, bw, A.bottom - top)
    ctx.fillStyle = INK; ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.direction = 'ltr'
    ctx.fillText(fmt(v), cx, top - 5)
    ctx.save(); ctx.translate(cx, A.bottom + 10); ctx.rotate(n > 5 ? -0.5 : 0)
    ctx.fillStyle = GREY; ctx.font = `10px ${FONT}`; ctx.textAlign = n > 5 ? 'right' : 'center'; ctx.direction = isAr ? 'rtl' : 'ltr'
    const lab = labels[i].length > 16 ? labels[i].slice(0, 15) + '…' : labels[i]
    ctx.fillText(lab, 0, 4); ctx.restore()
  })
  return done(c)
}

export function donutChart({ title: t, labels, values, colors, w = 540, h = 270, isAr = true }) {
  const { c, ctx } = canvas(w, h)
  title(ctx, w, t, isAr)
  const total = values.reduce((a, b) => a + b, 0)
  const cx = isAr ? w - 150 : 150, cy = 152, R = 90, r = 52
  if (!total) { ctx.fillStyle = GREY; ctx.font = `12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('—', w / 2, h / 2); return done(c) }
  let a0 = -Math.PI / 2
  values.forEach((v, i) => {
    const a1 = a0 + (v / total) * Math.PI * 2
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.arc(cx, cy, r, a1, a0, true); ctx.closePath()
    ctx.fillStyle = colors[i]; ctx.fill(); a0 = a1
  })
  ctx.fillStyle = NAVY; ctx.font = `bold 20px ${FONT}`; ctx.textAlign = 'center'; ctx.direction = 'ltr'
  ctx.fillText(fmt(total), cx, cy + 7)
  labels.forEach((l, i) => {
    const y = 80 + i * 40, x = isAr ? w - 300 : 300
    ctx.fillStyle = colors[i]; ctx.fillRect(isAr ? x - 12 : x, y - 10, 12, 12)
    ctx.fillStyle = INK; ctx.font = `12px ${FONT}`; ctx.textAlign = isAr ? 'right' : 'left'; ctx.direction = isAr ? 'rtl' : 'ltr'
    ctx.fillText(l, isAr ? x - 20 : x + 20, y + 1)
    ctx.fillStyle = GREY; ctx.font = `11px ${FONT}`
    ctx.fillText(`${values[i]} · ${Math.round((values[i] / total) * 100)}%`, isAr ? x - 20 : x + 20, y + 17)
  })
  return done(c)
}
