// ورقة الموازنة المرفقة باليومية: تتحول إلى صور صفحات تُدمج داخل مستند الطباعة نفسه،
// فتخرج اليومية والموازنة في ملف واحد (طباعة أو حفظ PDF) بدل رابط "افتح الملف"
import { esc } from './printDoc'

const MAX_PAGES = 8          // حد أمان: ورقة موازنة أطول من هذا نادرة
const TARGET_W = 1500        // عرض الصفحة المرسومة بالبكسل (وضوح كافٍ لطباعة A4)

const blobToDataUrl = blob => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(r.result)
  r.onerror = () => rej(r.error)
  r.readAsDataURL(blob)
})

// يرجع مصفوفة صور (data URL) لصفحات الورقة — [] عند أي تعذّر فيرجع المستند لرابط الفتح
export async function loadBalanceDocPages(url, isPdf) {
  if (!url) return []
  try {
    const resp = await fetch(url)
    if (!resp.ok) return []
    if (!isPdf) return [await blobToDataUrl(await resp.blob())]

    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist/build/pdf.min.mjs'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await resp.arrayBuffer()) }).promise
    const pages = []
    for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: TARGET_W / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      pages.push(canvas.toDataURL('image/jpeg', 0.88))
      canvas.width = canvas.height = 0
    }
    doc.destroy?.()
    return pages
  } catch {
    return []
  }
}

// صفحات المرفق: صفحة لكل صورة، بشريط عنوان فيه بيانات اليومية وترقيم "صفحة i من n"
export function balanceAppendixHtml({ pages, docUrl, isAr = true, meta = '' }) {
  const dir = isAr ? 'rtl' : 'ltr'
  const ff = "font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif"
  const head = (n, total) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:3px solid #EE712D;padding:0 0 8px;margin-bottom:12px">
      <span style="display:flex;align-items:center;gap:8px"><b style="background:#264673;color:#fff;border-radius:6px;padding:3px 10px;font-size:12px">${isAr ? 'مرفق' : 'Attachment'}</b><b style="font-size:16px;color:#264673">${isAr ? 'ورقة الموازنة' : 'Balance sheet'}</b>${total > 1 ? `<span style="font-size:11px;color:#64748b">${isAr ? `صفحة ${n} من ${total}` : `Page ${n} of ${total}`}</span>` : ''}</span>
      <span style="font-size:11px;color:#475569">${esc(meta)}</span></div>`
  const wrap = inner => `<section class="appx" style="page-break-before:always;break-before:page;max-width:760px;margin:24px auto 0;padding:0 14px;direction:${dir};${ff}">${inner}</section>`

  if (!pages?.length) {
    // تعذّر تحويل الورقة لصور: نبقي رابط الفتح كحل أخير مع تنبيه واضح
    return docUrl ? wrap(`${head(1, 1)}<p style="font-size:13px;color:#374151;line-height:1.9">${isAr ? 'تعذّر تضمين ورقة الموازنة داخل هذا المستند. ' : 'The balance sheet could not be embedded. '}<a href="${esc(docUrl)}" target="_blank">${isAr ? 'افتح الملف' : 'Open the file'}</a></p>`) : ''
  }
  return pages.map((src, i) => wrap(`${head(i + 1, pages.length)}<img src="${src}" alt="" style="display:block;width:100%;max-height:245mm;object-fit:contain;border:1px solid #dbe2ea;border-radius:6px;background:#fff">`)).join('')
}
