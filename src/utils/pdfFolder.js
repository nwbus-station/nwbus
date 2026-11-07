// حفظ تقارير HTML كملفات PDF (ملف لكل محطة) داخل مجلد على الجهاز، أو كملف مضغوط ZIP حيث لا يدعم المتصفح اختيار المجلد.
// التحويل داخل المتصفح (html2canvas + jsPDF) فيبقى العربي والألوان مطابقين للطباعة. المكتبات تُحمَّل عند الحاجة فقط.

const PAGE_W = 1100                 // عرض الورقة بالبكسل وقت الرسم (A4 أفقي بعد الهوامش)
const MM_W = 281, MM_H = 194        // مساحة المحتوى بالمليمتر (A4 أفقي بهامش 8 مم)
const PAGE_H = Math.floor(PAGE_W * (MM_H / MM_W))
const SCALE = 2

export const canPickFolder = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

// يرسم HTML داخل إطار مخفي ويُرجع PDF بصفحات A4 أفقية، مع قص الصفحات عند حدود الصفوف والعناوين لا في وسط سطر
async function htmlToPdfBlob(bodyHtml, css, { fit = false } = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${PAGE_W}px;height:900px;border:0;visibility:hidden`
  document.body.appendChild(frame)
  try {
    const doc = frame.contentDocument
    doc.open()
    doc.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><style>${css}
      html,body{background:#fff!important;margin:0;padding:0}.sheet{background:#fff!important;box-shadow:none!important;margin:0!important;padding:0!important;border-radius:0!important;max-width:none!important;width:${PAGE_W}px}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${bodyHtml}</body></html>`)
    doc.close()
    try { await doc.fonts?.ready } catch { /* بدون خطوط مخصصة */ }
    await new Promise(r => setTimeout(r, 120))

    const body = doc.body
    const top0 = body.getBoundingClientRect().top
    const totalH = Math.ceil(body.scrollHeight)
    // نقاط القص المسموحة: بداية صف في الجدول (غير الأول) أو بداية عنوان قسم
    const cuts = [...doc.querySelectorAll('tbody tr:nth-child(n+3), .sec-head')]
      .map(el => Math.round(el.getBoundingClientRect().top - top0)).filter(y => y > 0).sort((a, b) => a - b)
    const breaks = [0]
    while (totalH - breaks[breaks.length - 1] > PAGE_H) {
      const start = breaks[breaks.length - 1], limit = start + PAGE_H
      let cut = null
      for (const y of cuts) { if (y > start + PAGE_H * 0.35 && y <= limit) cut = y }
      breaks.push(cut ?? limit)
    }
    breaks.push(totalH)

    // ملف الملخص: إن زاد قليلاً عن صفحة نصغّره ليدخل صفحة واحدة (بدل صفحة ثانية بصفوف مقطوعة)
    const fitScale = fit && totalH > PAGE_H ? PAGE_H / totalH : 1
    const fitOne = fit && fitScale >= 0.3   // الملخص يدخل صفحة واحدة حتى لو احتاج تصغيراً كبيراً (بدقة رسم أعلى ليبقى مقروءاً)
    const SC = fitOne ? 3 : SCALE

    const canvas = await html2canvas(body, { scale: SC, backgroundColor: '#ffffff', useCORS: true, logging: false, foreignObjectRendering: true, width: PAGE_W, windowWidth: PAGE_W, height: totalH, windowHeight: totalH })
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
    if (fitOne) {
      const w = MM_W * fitScale
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 8 + (MM_W - w) / 2, 8, w, MM_H, undefined, 'FAST')
      return pdf.output('blob')
    }
    const pages = breaks.length - 1
    for (let i = 0; i < pages; i++) {
      const y0 = breaks[i], y1 = breaks[i + 1], h = y1 - y0
      if (h <= 0) continue
      const slice = document.createElement('canvas')
      slice.width = canvas.width; slice.height = Math.round(h * SC)
      slice.getContext('2d').drawImage(canvas, 0, Math.round(y0 * SC), canvas.width, slice.height, 0, 0, canvas.width, slice.height)
      if (i > 0) pdf.addPage('a4', 'landscape')
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 8, 8, MM_W, (h / PAGE_W) * MM_W, undefined, 'FAST')
      if (pages > 1) { pdf.setFontSize(8); pdf.setTextColor(140); pdf.text(`${i + 1} / ${pages}`, 148.5, 205, { align: 'center' }) }
    }
    return pdf.output('blob')
  } finally {
    frame.remove()
  }
}

const safe = t => String(t).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90)

/**
 * files: [{ name, html }] — كل عنصر = ملف PDF واحد.
 * opts: { folderName, css, via: 'folder' | 'zip', dirHandle?, onProgress(done, total, name) }
 * via 'folder': dirHandle = نتيجة showDirectoryPicker() (تُطلب من المستخدم قبل التحويل مباشرة لأن المتصفح يشترط ضغطة مستخدم).
 * يُرجع { via, count, folderName }
 */
export async function savePdfFolder(files, { folderName, css, via, dirHandle, onProgress }) {
  const total = files.length
  const folder = safe(folderName)
  const names = new Set()
  const uniq = n => { let x = `${safe(n)}.pdf`, i = 2; while (names.has(x)) x = `${safe(n)} (${i++}).pdf`; names.add(x); return x }

  let zip = null, sub = null
  if (via === 'folder') sub = await dirHandle.getDirectoryHandle(folder, { create: true })
  else { const JSZip = (await import('jszip')).default; zip = new JSZip() }

  for (let i = 0; i < total; i++) {
    const f = files[i]
    onProgress?.(i, total, f.name)
    const blob = await htmlToPdfBlob(f.html, css, { fit: !!f.fit })
    const fileName = uniq(f.name)
    if (sub) {
      const fh = await sub.getFileHandle(fileName, { create: true })
      const w = await fh.createWritable(); await w.write(blob); await w.close()
    } else zip.folder(folder).file(fileName, blob)
  }
  onProgress?.(total, total, '')

  if (zip) {
    const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(out); a.download = `${folder}.zip`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 60000)
  }
  return { via, count: total, folderName: folder }
}
