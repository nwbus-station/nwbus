// ورقة الموازنة المرفقة باليومية: تتحول إلى صور صفحات تُدمج داخل مستند الطباعة نفسه،
// فتخرج اليومية والموازنة في ملف واحد (طباعة أو حفظ PDF) بدل رابط "افتح الملف"
import { esc } from './printDoc'
import { supabase } from '../lib/supabase'

const MAX_PAGES = 8          // حد أمان: ورقة موازنة أطول من هذا نادرة
const TARGET_W = 1240        // عرض الصفحة المرسومة بالبكسل (≈150dpi على A4: وضوح كافٍ وأسرع)

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
    const n = Math.min(doc.numPages, MAX_PAGES)
    const pages = await Promise.all(Array.from({ length: n }, async (_, k) => {
      const page = await doc.getPage(k + 1)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: TARGET_W / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      const out = canvas.toDataURL('image/jpeg', 0.85)
      canvas.width = canvas.height = 0
      return out
    }))
    doc.destroy?.()
    return pages
  } catch {
    return []
  }
}

// تجهيز مسبق: يبدأ تحميل الرابط والمكتبة وتحويل الصفحات بمجرد فتح اليومية، فتكون جاهزة عند الضغط على طباعة
const cache = new Map()
export function getBalanceDoc(path) {
  if (!path) return Promise.resolve({ url: null, pages: [] })
  if (!cache.has(path)) {
    const pr = (async () => {
      const { data } = await supabase.storage.from('sales-docs').createSignedUrl(path, 3600)
      const url = data?.signedUrl ?? null
      return { url, pages: url ? await loadBalanceDocPages(url, /\.pdf$/i.test(path)) : [] }
    })().then(r => { if (!r.pages.length) cache.delete(path); return r }, () => { cache.delete(path); return { url: null, pages: [] } })
    cache.set(path, pr)
  }
  return cache.get(path)
}

// صفحة انتظار أنيقة تظهر فوراً داخل نافذة الطباعة
export const loadingPageHtml = msg => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f4f8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#264673}.b{text-align:center}.s{width:38px;height:38px;border:4px solid #dbe2ea;border-top-color:#EE712D;border-radius:50%;margin:0 auto 14px;animation:r .8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}</style><div class="b"><div class="s"></div><b>${esc(msg)}</b></div>`

// يملأ مكان الانتظار داخل نافذة الطباعة بعد جاهزية الصفحات، ويعيد زر الطباعة
export function fillAppendixSlot(win, { pages, docUrl, isAr }) {
  try {
    const slot = win.document.getElementById('appx-slot')
    if (slot) slot.outerHTML = balanceAppendixHtml({ pages, docUrl, isAr, meta: slot.getAttribute('data-meta') || '' })
    const pb = win.document.querySelector('.toolbar button[data-print]')
    if (pb) { pb.disabled = false; pb.textContent = pb.getAttribute('data-label') }
  } catch { /* النافذة أُغلقت */ }
}

// صفحات المرفق: صفحة لكل صورة، بشريط عنوان فيه بيانات اليومية وترقيم "صفحة i من n"
export function balanceAppendixHtml({ pages, docUrl, isAr = true, meta = '', pending = false }) {
  const dir = isAr ? 'rtl' : 'ltr'
  const ff = "font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif"
  const head = (n, total) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:3px solid #EE712D;padding:0 0 8px;margin-bottom:12px">
      <span style="display:flex;align-items:center;gap:8px"><b style="background:#264673;color:#fff;border-radius:6px;padding:3px 10px;font-size:12px">${isAr ? 'مرفق' : 'Attachment'}</b><b style="font-size:16px;color:#264673">${isAr ? 'ورقة الموازنة' : 'Balance sheet'}</b>${total > 1 ? `<span style="font-size:11px;color:#64748b">${isAr ? `صفحة ${n} من ${total}` : `Page ${n} of ${total}`}</span>` : ''}</span>
      <span style="font-size:11px;color:#475569">${esc(meta)}</span></div>`
  const wrap = inner => `<section class="appx" style="page-break-before:always;break-before:page;max-width:760px;margin:24px auto 0;padding:0 14px;direction:${dir};${ff}">${inner}</section>`

  if (pending) return `<section id="appx-slot" class="appx" data-meta="${esc(meta)}" style="max-width:760px;margin:24px auto 0;padding:22px 14px;direction:${dir};${ff};text-align:center;color:#264673;border:1px dashed #94a3b8;border-radius:10px;font-weight:700;font-size:13px">${isAr ? 'جارٍ تحميل ورقة الموازنة... ستظهر هنا خلال لحظات، ولا تطبع قبل ظهورها' : 'Loading the balance sheet... it will appear here shortly — do not print before it does'}</section>`
  if (!pages?.length) {
    // تعذّر تحويل الورقة لصور: نبقي رابط الفتح كحل أخير مع تنبيه واضح
    return docUrl ? wrap(`${head(1, 1)}<p style="font-size:13px;color:#374151;line-height:1.9">${isAr ? 'تعذّر تضمين ورقة الموازنة داخل هذا المستند. ' : 'The balance sheet could not be embedded. '}<a href="${esc(docUrl)}" target="_blank">${isAr ? 'افتح الملف' : 'Open the file'}</a></p>`) : ''
  }
  return pages.map((src, i) => wrap(`${head(i + 1, pages.length)}<img src="${src}" alt="" style="display:block;width:100%;max-height:245mm;object-fit:contain;border:1px solid #dbe2ea;border-radius:6px;background:#fff">`)).join('')
}
