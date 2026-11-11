// ورقة A4 مكررة لبطاقة QR تقييم العميل: تُقسَّم الورقة لخلايا متساوية بخطوط قص منقّطة، كل خلية بطاقة كاملة
export const SHEET_LAYOUTS = [
  { id: '2x2', cols: 2, rows: 2, label: '4 بطاقات' },
  { id: '2x3', cols: 2, rows: 3, label: '6 بطاقات' },
  { id: '2x4', cols: 2, rows: 4, label: '8 بطاقات' },
  { id: '3x4', cols: 3, rows: 4, label: '12 بطاقة' },
  { id: '4x5', cols: 4, rows: 5, label: '20 بطاقة' },
]

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function buildRatingSheetHtml({ name, station, windowNumber, qr, cols, rows, forPdf = false }) {
  const PAGE_W = 210, PAGE_H = 297, M = 8
  const cw = (PAGE_W - M * 2) / cols, ch = (PAGE_H - M * 2) / rows
  const qrSize = Math.min(cw * 0.74, ch * 0.5)
  const f = k => (cw * k).toFixed(2)
  const cell = `
    <div class="cell">
      <div class="name">${esc(name)}</div>
      ${station ? `<div class="station">${esc(station)}</div>` : ''}
      ${windowNumber ? `<div class="win">شباك ${esc(windowNumber)}</div>` : ''}
      <img src="${qr}" alt="QR" />
      <div class="cta">امسح الرمز لتقييم الخدمة</div>
      <div class="en">Scan to rate our service</div>
    </div>`
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>بطاقات تقييم العميل — A4</title>
<style>
  @page { size: A4 portrait; margin: 0 }
  * { box-sizing: border-box }
  html, body { margin: 0; padding: 0; background: #fff }
  body { font-family: Tajawal, 'Segoe UI', Tahoma, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  .sheet { width: ${PAGE_W}mm; height: ${PAGE_H}mm; padding: ${M}mm; display: grid; grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr); page-break-after: avoid }
  .cell { border: 0.3mm dashed #8a94a3; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: ${f(0.04)}mm; overflow: hidden; color: #1C2B4A }
  .name { font-weight: 800; font-size: ${f(0.15)}pt; line-height: 1.25; max-width: 100% }
  .station { color: #1C2B4A; font-weight: 700; font-size: ${f(0.105)}pt; margin-top: 0.8mm; line-height: 1.25 }
  .win { display: inline-block; margin-top: 1mm; padding: 0.4mm 2.4mm; border: 0.3mm solid #1C2B4A; border-radius: 99px; font-weight: 700; font-size: ${f(0.07)}pt }
  img { width: ${qrSize.toFixed(2)}mm; height: ${qrSize.toFixed(2)}mm; margin: ${f(0.04)}mm 0; image-rendering: pixelated }
  .cta { font-weight: 800; font-size: ${f(0.105)}pt }
  .en { color: #64748b; font-size: ${f(0.07)}pt; margin-top: 0.6mm; direction: ltr }
  ${forPdf ? '' : '@media screen { body { background: #e5e7eb } .sheet { margin: 8mm auto; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.25) } }'}
</style></head><body>
<div class="sheet">${cell.repeat(cols * rows)}</div>
${forPdf ? '' : '<script>window.onload = () => setTimeout(() => window.print(), 400)<\/script>'}
</body></html>`
}

// رسم الورقة كصورة عالية الدقة (A4 بدقة ~288 DPI) — يُستعمل لإنشاء PDF بنفس شكل الطباعة تماماً (العربي والألوان)
export async function renderRatingSheetCanvas(opts) {
  const { default: html2canvas } = await import('html2canvas')
  const W = 794, H = 1123   // A4 بالبكسل عند 96dpi
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;height:${H}px;border:0;visibility:hidden`
  document.body.appendChild(frame)
  try {
    const doc = frame.contentDocument
    doc.open(); doc.write(buildRatingSheetHtml({ ...opts, forPdf: true })); doc.close()
    try { await doc.fonts?.ready } catch { /* بدون خطوط مخصصة */ }
    await Promise.all([...doc.images].map(i => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())))
    await new Promise(r => setTimeout(r, 120))
    return await html2canvas(doc.querySelector('.sheet'), { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false, foreignObjectRendering: true, width: W, height: H, windowWidth: W, windowHeight: H })
  } finally {
    frame.remove()
  }
}

export async function ratingSheetPdfBlob(opts) {
  const [canvas, { jsPDF }] = await Promise.all([renderRatingSheetCanvas(opts), import('jspdf')])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST')
  return pdf.output('blob')
}
