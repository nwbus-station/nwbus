// حفظ اليومية (مع ورقة الموازنة) كملف PDF حقيقي — يعمل من الجوال والكمبيوتر بدون نافذة طباعة.
// الرسم مباشر على Canvas (نص عربي بمحرك المتصفح نفسه) بدل تحويل HTML، لأن تحويل HTML لا يوثق به على سفاري/آيفون.
import { NWB_LOGO_SVG } from './logo'

const W = 794, H = 1123, S = 2, M = 32          // A4 بالبكسل (96dpi) ومقياس الدقة والهامش
const FF = '"IBM Plex Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif'
const NAVY = '#264673', DARK = '#1B3A6B', ORANGE = '#EE712D', INK = '#1a1a2e', MUTE = '#6b7280', LINE = '#d1d5db'

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
let logoCache = null
const logo = async () => logoCache ??= await loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(NWB_LOGO_SVG)}`).catch(() => null)

function newPage(rtl) {
  const c = document.createElement('canvas')
  c.width = W * S; c.height = H * S
  const x = c.getContext('2d')
  x.scale(S, S)
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H)
  x.direction = rtl ? 'rtl' : 'ltr'
  x.textBaseline = 'middle'
  return { c, x }
}

function rr(x, px, py, w, h, r) {
  x.beginPath()
  x.moveTo(px + r, py); x.lineTo(px + w - r, py); x.quadraticCurveTo(px + w, py, px + w, py + r)
  x.lineTo(px + w, py + h - r); x.quadraticCurveTo(px + w, py + h, px + w - r, py + h)
  x.lineTo(px + r, py + h); x.quadraticCurveTo(px, py + h, px, py + h - r)
  x.lineTo(px, py + r); x.quadraticCurveTo(px, py, px + r, py); x.closePath()
}

// نص بحجم يتقلّص تلقائياً ليناسب العرض المتاح
function text(x, str, px, py, { size = 13, weight = 400, color = INK, align = 'start', maxW, mono = false } = {}) {
  let s = size
  const font = z => `${weight} ${z}px ${mono ? 'ui-monospace,Menlo,Consolas,monospace' : FF}`
  x.font = font(s)
  while (maxW && x.measureText(str).width > maxW && s > 8) { s -= 0.5; x.font = font(s) }
  x.fillStyle = color; x.textAlign = align
  x.fillText(String(str), px, py)
}

// سطور ملفوفة (للملاحظات الطويلة)
function wrap(x, str, maxW) {
  const words = String(str).split(/\s+/), lines = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  return lines
}

async function drawDaily(d, rtl, hasAppendix) {
  const { c, x } = newPage(rtl)
  const L = M, R = W - M, start = rtl ? R : L, end = rtl ? L : R, dirSign = rtl ? -1 : 1
  let y = 30

  // الترويسة: معلومات (بداية) · عنوان (وسط) · شعار (نهاية) · خط برتقالي
  const lg = await logo()
  if (lg) { const lw = 130, lh = lw * (lg.naturalHeight / lg.naturalWidth || 0.5); x.drawImage(lg, end === L ? L : R - lw, y + 2, lw, lh) }
  text(x, d.title, W / 2, y + 14, { size: 20, weight: 700, color: NAVY, align: 'center', maxW: 330 })
  text(x, d.stationName, W / 2, y + 40, { size: 13, weight: 600, color: '#64748b', align: 'center', maxW: 330 })
  text(x, `${d.l.recordDate}: ${d.dateStr}`, start, y + 6, { size: 11, color: '#475569', align: 'start' })
  let ly = y + 28
  const chip = (label, col) => {
    x.font = `700 11px ${FF}`
    const w = x.measureText(label).width + 20, px = rtl ? start - w : start
    x.strokeStyle = col; x.lineWidth = 1.5; rr(x, px, ly - 10, w, 20, 5); x.stroke()
    text(x, label, px + w / 2, ly, { size: 11, weight: 700, color: col, align: 'center' })
    ly += 26
  }
  if (d.confirmed) chip(`✓ ${d.l.confirmed}`, '#16a34a')
  if (hasAppendix) chip(d.l.attached, NAVY)
  y += 66
  x.fillStyle = ORANGE; x.fillRect(L, y, R - L, 3)
  y += 18

  // شريط البيانات
  const cells = [[d.l.shift, d.shiftLabel], [d.l.employee, d.employeeName], [d.l.jobNo, d.jobNumber, true], [d.l.cashier, d.cashierNo, true], [d.l.balanceRef, d.balanceRef]]
  const cw = (R - L) / cells.length, ch = 54
  x.fillStyle = '#f8fafc'; rr(x, L, y, R - L, ch, 6); x.fill()
  x.strokeStyle = LINE; x.lineWidth = 1; rr(x, L + .5, y + .5, R - L - 1, ch - 1, 6); x.stroke()
  cells.forEach(([lab, val, mono], i) => {
    const cx0 = rtl ? R - cw * (i + 1) : L + cw * i
    if (i) { x.strokeStyle = LINE; x.beginPath(); const lx = rtl ? cx0 + cw : cx0; x.moveTo(lx, y); x.lineTo(lx, y + ch); x.stroke() }
    const ax = rtl ? cx0 + cw - 12 : cx0 + 12
    text(x, lab, ax, y + 16, { size: 10, color: '#888', align: 'start', maxW: cw - 24 })
    text(x, val || '—', ax, y + 37, { size: mono ? 14 : 13, weight: 700, color: mono ? DARK : INK, align: 'start', maxW: cw - 24, mono })
  })
  y += ch + 16

  // الجدول
  const rowH = 34, tw = R - L
  x.fillStyle = DARK; x.fillRect(L, y, tw, rowH)
  text(x, d.l.item, start + dirSign * 14, y + rowH / 2, { size: 12, weight: 700, color: '#fff', align: 'start' })
  text(x, d.l.amount, end - dirSign * 14, y + rowH / 2, { size: 12, weight: 700, color: '#fff', align: 'end' })
  y += rowH
  d.rows.forEach(([lab, val], i) => {
    if (i % 2) { x.fillStyle = '#f8fafc'; x.fillRect(L, y, tw, rowH) }
    x.strokeStyle = '#e5e7eb'; x.beginPath(); x.moveTo(L, y + rowH); x.lineTo(R, y + rowH); x.stroke()
    text(x, lab, start + dirSign * 14, y + rowH / 2, { size: 13, weight: 600, color: '#374151', align: 'start', maxW: tw * 0.6 })
    text(x, val, end - dirSign * 14, y + rowH / 2, { size: 14, weight: 700, color: DARK, align: 'end' })
    y += rowH
  })
  if (d.note) {
    x.font = `400 12px ${FF}`
    const lines = wrap(x, d.note, tw - 28)
    const nh = 14 + lines.length * 18
    x.fillStyle = '#fffbeb'; x.fillRect(L, y, tw, nh)
    x.strokeStyle = '#e5e7eb'; x.beginPath(); x.moveTo(L, y + nh); x.lineTo(R, y + nh); x.stroke()
    text(x, d.l.notes, start + dirSign * 14, y + 14, { size: 10, color: '#92400e', weight: 700, align: 'start' })
    lines.forEach((ln, i) => text(x, ln, start + dirSign * 14, y + 32 + i * 18, { size: 12, color: '#374151', align: 'start' }))
    y += nh + 4
  }
  y += 18

  // الإجماليات
  const diff = d.diff, tone = diff >= 0
  const trs = [
    [d.l.totalSales, `${d.totalSales} ${d.l.sar}`, '#fff', INK, 700, 44],
    [d.l.actual, `${d.actual} ${d.l.sar}`, DARK, '#fff', 700, 48],
    [`${tone ? '▲' : '▼'} ${tone ? d.l.surplus : d.l.deficit}`, `${d.diffAbs} ${d.l.sar}`, tone ? '#f0fdf4' : '#fef2f2', tone ? '#15803d' : '#dc2626', 700, 44],
  ]
  const th = trs.reduce((a, r) => a + r[5], 0), ty = y
  x.save(); rr(x, L, ty, tw, th, 6); x.clip()
  let yy = ty
  trs.forEach(([lab, val, bg, col, wt, h]) => {
    x.fillStyle = bg; x.fillRect(L, yy, tw, h)
    text(x, lab, start + dirSign * 16, yy + h / 2, { size: bg === DARK ? 15 : 14, weight: wt, color: col, align: 'start' })
    text(x, val, end - dirSign * 16, yy + h / 2, { size: bg === DARK ? 16 : 14, weight: wt, color: col, align: 'end' })
    yy += h
  })
  x.restore()
  x.strokeStyle = LINE; x.lineWidth = 1; rr(x, L + .5, ty + .5, tw - 1, th - 1, 6); x.stroke()
  y = ty + th + 18

  // إقرار العجز
  if (d.deficit) {
    const bh = 46 + d.deficit.lines.length * 19 + 44
    x.fillStyle = '#fff5f5'; rr(x, L, y, tw, bh, 8); x.fill()
    x.strokeStyle = '#dc2626'; x.lineWidth = 2; rr(x, L + 1, y + 1, tw - 2, bh - 2, 8); x.stroke()
    text(x, `⚠ ${d.l.defTitle}`, start + dirSign * 14, y + 20, { size: 13, weight: 700, color: '#dc2626', align: 'start' })
    d.deficit.lines.forEach((ln, i) => text(x, ln, start + dirSign * 14, y + 44 + i * 19, { size: 12, color: '#374151', align: 'start', maxW: tw - 28 }))
    const okc = d.deficit.ack ? '#15803d' : '#dc2626'
    x.fillStyle = d.deficit.ack ? '#dcfce7' : '#fef2f2'; rr(x, L + 12, y + bh - 34, tw - 24, 26, 4); x.fill()
    text(x, d.deficit.status, start + dirSign * 22, y + bh - 21, { size: 12, weight: 700, color: okc, align: 'start', maxW: tw - 44 })
    y += bh + 16
  }

  // التوقيعات
  y = Math.max(y + 14, 880)
  x.strokeStyle = '#e5e7eb'; x.lineWidth = 2; x.beginPath(); x.moveTo(L, y); x.lineTo(R, y); x.stroke()
  const sig = (px, lab, name, sub) => {
    text(x, lab, px, y + 20, { size: 10, color: '#9ca3af', align: 'center' })
    x.strokeStyle = '#9ca3af'; x.lineWidth = 1; x.beginPath(); x.moveTo(px - 90, y + 62); x.lineTo(px + 90, y + 62); x.stroke()
    text(x, name, px, y + 78, { size: 12, color: '#374151', align: 'center', maxW: 190 })
    if (sub) text(x, sub, px, y + 96, { size: 10, color: '#888', align: 'center' })
  }
  sig(rtl ? R - 110 : L + 110, d.l.empSig, d.employeeName, d.jobNumber !== '—' ? `${d.l.jobNo}: ${d.jobNumber}` : '')
  sig(rtl ? L + 110 : R - 110, d.l.accSig, d.accountantName, '')

  // تذييل الطباعة
  const fy = H - 40
  x.strokeStyle = LINE; x.beginPath(); x.moveTo(L, fy - 14); x.lineTo(R, fy - 14); x.stroke()
  text(x, `${d.l.printedBy}: ${d.printerName}   ·   ${d.l.date}: ${d.printDate}   ·   ${d.l.time}: ${d.printTime}`, start, fy, { size: 10, color: MUTE, align: 'start', maxW: tw * 0.75 })
  text(x, 'Station System', end, fy, { size: 10, color: '#9ca3af', align: 'end' })
  return c
}

async function drawAppendix(src, i, n, meta, rtl, l) {
  const { c, x } = newPage(rtl)
  const L = M, R = W - M, start = rtl ? R : L, end = rtl ? L : R
  let y = 34
  x.font = `700 12px ${FF}`
  const bw = x.measureText(l.attach).width + 20, bx = rtl ? start - bw : start
  x.fillStyle = NAVY; rr(x, bx, y - 11, bw, 22, 6); x.fill()
  text(x, l.attach, bx + bw / 2, y, { size: 12, weight: 700, color: '#fff', align: 'center' })
  const tx = rtl ? bx - 10 : bx + bw + 10
  text(x, l.balanceSheet, tx, y, { size: 17, weight: 700, color: NAVY, align: 'start' })
  if (n > 1) text(x, `${i + 1} / ${n}`, W / 2, y, { size: 11, color: '#64748b', align: 'center' })
  text(x, meta, end, y, { size: 11, color: '#475569', align: 'end', maxW: 300 })
  y += 20
  x.fillStyle = ORANGE; x.fillRect(L, y, R - L, 3)
  y += 18
  const img = await loadImg(src)
  const aw = R - L, ah = H - y - M
  const k = Math.min(aw / img.naturalWidth, ah / img.naturalHeight)
  const iw = img.naturalWidth * k, ih = img.naturalHeight * k, ix = L + (aw - iw) / 2
  x.drawImage(img, ix, y, iw, ih)
  x.strokeStyle = '#dbe2ea'; x.lineWidth = 1; x.strokeRect(ix - .5, y - .5, iw + 1, ih + 1)
  return c
}

const isMobile = () => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))

// نافذة "الملف جاهز": على الجوال يحتاج المشاركة/الحفظ ضغطة جديدة من المستخدم (المتصفح يمنعها بعد انتظار طويل)
function showReady(file, isAr) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const box = document.createElement('div')
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true')
    box.style.cssText = `position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.5);font-family:${FF};direction:${isAr ? 'rtl' : 'ltr'}`
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }))
    box.innerHTML = `<div style="background:#fff;border-radius:16px;padding:22px 20px;width:min(380px,100%);text-align:center;box-shadow:0 16px 48px rgba(0,0,0,.3)">
      <div style="width:46px;height:46px;border-radius:50%;background:#dcfce7;color:#15803d;display:grid;place-items:center;margin:0 auto 10px;font-size:24px;font-weight:900">&#10003;</div>
      <b style="display:block;font-size:16px;color:#264673">${isAr ? 'ملف PDF جاهز' : 'PDF is ready'}</b>
      <span style="display:block;font-size:12px;color:#64748b;margin:6px 0 16px;word-break:break-all">${file.name.replace(/[<>&"]/g, '')}</span>
      <div style="display:grid;gap:10px">
        ${canShare ? `<button data-a="share" style="min-height:48px;border:0;border-radius:12px;background:#EE712D;color:#fff;font:800 15px ${FF};cursor:pointer">${isAr ? 'حفظ / مشاركة' : 'Save / Share'}</button>` : ''}
        <a data-a="dl" href="${url}" download="${file.name.replace(/"/g, '')}" style="display:grid;place-items:center;min-height:48px;border-radius:12px;background:${canShare ? '#fff' : '#EE712D'};color:${canShare ? '#264673' : '#fff'};border:${canShare ? '1.5px solid #cbd5e1' : '0'};font:800 15px ${FF};text-decoration:none">${isAr ? 'تنزيل الملف' : 'Download'}</a>
        <button data-a="open" style="min-height:44px;border:0;background:transparent;color:#475569;font:700 13px ${FF};cursor:pointer">${isAr ? 'فتح للمعاينة' : 'Open preview'}</button>
        <button data-a="close" style="min-height:44px;border:0;background:transparent;color:#94a3b8;font:700 13px ${FF};cursor:pointer">${isAr ? 'إغلاق' : 'Close'}</button>
      </div></div>`
    const done = () => { box.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000); resolve() }
    box.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.getAttribute('data-a')
      if (a === 'share') navigator.share({ files: [file], title: file.name }).then(done).catch(() => { /* ألغى المستخدم: تبقى النافذة */ })
      else if (a === 'open') window.open(url, '_blank')
      else if (a === 'close' || e.target === box) done()
      else if (a === 'dl') setTimeout(done, 400)
    })
    document.body.appendChild(box)
    box.querySelector('[data-a="share"], [data-a="dl"]')?.focus()
  })
}

/**
 * data: بيانات اليومية الجاهزة للرسم (انظر salePdfData في SalesPage)
 * pages: صور صفحات ورقة الموازنة (data URL) — اختياري
 * على الكمبيوتر يُنزَّل الملف مباشرة، وعلى الجوال تظهر نافذة "حفظ / مشاركة".
 */
export async function saveSalePdf({ data, pages = [], fileName, isAr = true }) {
  try { await Promise.race([document.fonts?.load(`700 14px "IBM Plex Sans Arabic"`), new Promise(r => setTimeout(r, 1200))]) } catch { /* خط النظام */ }
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const add = (canvas, first) => {
    if (!first) pdf.addPage('a4', 'portrait')
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
    canvas.width = canvas.height = 0
  }
  add(await drawDaily(data, isAr, pages.length > 0), true)
  for (let i = 0; i < pages.length; i++) add(await drawAppendix(pages[i], i, pages.length, data.meta, isAr, data.l), false)
  const file = new File([pdf.output('blob')], `${fileName}.pdf`, { type: 'application/pdf' })
  if (isMobile()) { await showReady(file, isAr); return }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file); a.download = file.name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60000)
}
