import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../shared/ConfirmDialog'

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
export default function BalanceDocScan({ path, onChange, isAr, disabled }) {
  const inputRef = useRef(null)
  const sessionPaths = useRef(new Set())   // ما رُفع في هذه الجلسة ولم يُحفظ بعد (يُحذف فوراً عند الاستبدال/الإزالة)
  const [preview, setPreview] = useState('') // رابط عرض الصورة الحالية
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [localUrl, setLocalUrl] = useState('')

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

  async function onPick(file) {
    if (!file) return
    setBusy(true); setError('')
    try {
      if (!file.type.startsWith('image/')) throw new Error(isAr ? 'اختر صورة (JPG أو PNG).' : 'Choose an image (JPG or PNG).')
      const blob = await compress(file)
      const np = `docs/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(np, blob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) throw upErr
      await drop(path)
      sessionPaths.current.add(np)
      setLocalUrl(URL.createObjectURL(blob))
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
          <span className="ms-1.5 text-gray-400 font-normal">({isAr ? 'اختياري' : 'optional'})</span>
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {path && preview && (
          <a href={preview} target="_blank" rel="noreferrer" title={isAr ? 'عرض الصورة' : 'View image'}>
            <img src={preview} alt={isAr ? 'ورقة الموازنة' : 'Balance document'} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
          </a>
        )}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || disabled}
          className="flex items-center gap-2 border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          {busy ? (isAr ? 'جارٍ الرفع...' : 'Uploading...') : path ? (isAr ? 'استبدال الصورة' : 'Replace scan') : 'Scan document'}
        </button>
        {path && !busy && (
          <button type="button" onClick={() => setConfirmDel(true)} className="text-xs text-red-500 hover:text-red-700 font-semibold">{isAr ? 'إزالة' : 'Remove'}</button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onPick(f) }} />
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
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
