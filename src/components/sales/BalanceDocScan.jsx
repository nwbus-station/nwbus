import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../shared/ConfirmDialog'

// الماسح (مع OpenCV) يُحمَّل عند أول فتح فقط
const DocScannerModal = lazy(() => import('./DocScannerModal'))

const BUCKET = 'sales-docs'

// تصغير صورة الورقة (أطول ضلع 1800px، JPEG) قبل الرفع لتخفيف الحجم من كاميرا الجوال
async function compress(file) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82))
  if (!blob) throw new Error('compress')
  return blob
}

// مسح مستند (ورقة الموازنة): تصوير بالكاميرا أو اختيار صورة، تُحفظ مع اليومية في مخزن خاص
// path: مسار الصورة المحفوظ (أو null) — onChange(pathجديد|null)
export default function BalanceDocScan({ path, onChange, isAr, disabled, required = false, missing = false }) {
  const inputRef = useRef(null)
  const sessionPaths = useRef(new Set())   // ما رُفع في هذه الجلسة ولم يُحفظ بعد (يُحذف فوراً عند الاستبدال/الإزالة)
  const [preview, setPreview] = useState('') // رابط عرض الصورة الحالية
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [localUrl, setLocalUrl] = useState('')
  const [scanning, setScanning] = useState(false)

  // تسخين الماسح بالخلفية (تحميل OpenCV مرة واحدة) ليفتح فورياً عند الضغط
  useEffect(() => {
    if (disabled) return
    const t = setTimeout(() => { import('../../utils/docScan').then(m => m.getEngine().warmup()).catch(() => {}) }, 1200)
    return () => clearTimeout(t)
  }, [disabled])

  useEffect(() => {
    let off = false
    setPreview('')
    if (!path) return
    if (localUrl && sessionPaths.current.has(path)) { setPreview(localUrl); return }
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => { if (!off && data?.signedUrl) setPreview(data.signedUrl) })
    return () => { off = true }
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  async function drop(p) {
    if (p && sessionPaths.current.has(p)) { sessionPaths.current.delete(p); await supabase.storage.from(BUCKET).remove([p]) }
  }

  async function onPick(file, processed = false) {
    if (!file) return
    setBusy(true); setError('')
    try {
      const isPdf = file.type === 'application/pdf'
      if (!isPdf && !file.type.startsWith('image/')) throw new Error(isAr ? 'اختر صورة أو ملف PDF.' : 'Choose an image or a PDF.')
      if (isPdf && file.size > 10 * 1024 * 1024) throw new Error(isAr ? 'ملف PDF كبير (الحد 10 ميجا).' : 'PDF is too large (10 MB max).')
      const blob = isPdf || processed ? file : await compress(file)   // PDF من ماسح الجوال يُرفع كما هو
      const np = `docs/${crypto.randomUUID()}.${isPdf ? 'pdf' : 'jpg'}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(np, blob, { contentType: isPdf ? 'application/pdf' : 'image/jpeg', upsert: false })
      if (upErr) throw upErr
      await drop(path)
      sessionPaths.current.add(np)
      setLocalUrl(isPdf ? '' : URL.createObjectURL(blob))
      onChange(np)
    } catch (e) {
      setError(e.message === 'compress' ? (isAr ? 'تعذّر معالجة الصورة.' : 'Could not process the image.') : (e.message || (isAr ? 'تعذّر رفع الصورة.' : 'Upload failed.')))
    }
    setBusy(false)
  }

  async function remove() {
    setConfirmDel(false)
    await drop(path)
    onChange(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-bold text-gray-500">
          {isAr ? 'ورقة الموازنة' : 'Balance document'}
          {required
            ? <span className="ms-1.5 text-red-600 font-bold">({isAr ? 'إلزامي' : 'required'})</span>
            : <span className="ms-1.5 text-gray-400 font-normal">({isAr ? 'اختياري' : 'optional'})</span>}
        </label>
      </div>
      {required && !path && (
        <p className={`text-[11px] mb-1.5 leading-relaxed ${missing ? 'text-red-600 font-bold' : 'text-amber-700'}`}>{isAr ? 'أدخلت مبلغاً في مدى/فيزا/ماستركارد/أخرى، فإرفاق صورة الموازنة (تصوير أو رفع ملف) إلزامي قبل الحفظ.' : 'You entered a card/other amount, so the balance document (scan or upload) is required before saving.'}</p>
      )}
      <div className={`flex items-center gap-3 flex-wrap ${missing && required && !path ? 'rounded-lg ring-2 ring-red-400 p-2' : ''}`}>
        {path && /\.pdf$/i.test(path) && (
          <button type="button" onClick={() => openBalanceDoc(path)} title={isAr ? 'عرض الملف' : 'View file'}
            className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-[11px] font-bold text-red-600">PDF<span className="text-[9px] font-normal text-gray-500">{isAr ? 'عرض' : 'View'}</span></button>
        )}
        {path && !/\.pdf$/i.test(path) && preview && (
          <a href={preview} target="_blank" rel="noreferrer" title={isAr ? 'عرض الصورة' : 'View image'}>
            <img src={preview} alt={isAr ? 'ورقة الموازنة' : 'Balance document'} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
          </a>
        )}
        <button type="button" onClick={() => setScanning(true)} disabled={busy || disabled}
          className="flex items-center gap-2 border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          {busy ? (isAr ? 'جارٍ الرفع...' : 'Uploading...') : path ? (isAr ? 'استبدال الصورة' : 'Replace scan') : 'Scan document'}
        </button>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || disabled}
          className="border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{isAr ? 'ماسح الجوال / رفع ملف' : 'Phone scanner / upload'}</button>
        {path && !busy && (
          <button type="button" onClick={() => setConfirmDel(true)} className="text-xs text-red-500 hover:text-red-700 font-semibold">{isAr ? 'إزالة' : 'Remove'}</button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onPick(f) }} />
      <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{isAr ? 'ماسح الجوال: على الآيفون اختر «اختيار ملف» ثم ⋯ ← «مسح المستندات» (Scan Documents)، وعلى الأندرويد اختر ماسح المستندات من الكاميرا. يُقبل صورة أو PDF.' : 'Phone scanner: on iPhone choose "Choose File" then ⋯ > Scan Documents. Images or PDF accepted.'}</p>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      {scanning && (
        <Suspense fallback={null}>
          <DocScannerModal isAr={isAr} onClose={() => setScanning(false)} onDone={blob => { setScanning(false); onPick(blob, true) }} />
        </Suspense>
      )}
      {confirmDel && (
        <ConfirmDialog message={isAr ? 'إزالة صورة ورقة الموازنة من هذه اليومية؟ لا يمكن التراجع بعد الحفظ.' : 'Remove the balance document image from this record? This cannot be undone after saving.'}
          confirmLabel={isAr ? 'إزالة' : 'Remove'} cancelLabel={isAr ? 'إلغاء' : 'Cancel'} onConfirm={remove} onCancel={() => setConfirmDel(false)} />
      )}
    </div>
  )
}

// فتح صورة ورقة موازنة محفوظة في تبويب جديد (رابط موقّع مؤقت)
export async function openBalanceDoc(path) {
  const win = window.open('', '_blank')
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600)
  if (data?.signedUrl && win) win.location.href = data.signedUrl
  else win?.close()
}
