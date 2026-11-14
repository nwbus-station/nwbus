// نوافذ الإرساليات: استلام (سليمة/بملاحظة)، تصعيد يدوي، ومسح QR بالكاميرا
import { useState, useEffect, useRef } from 'react'
import jsQR from 'jsqr'
import { fieldStyle, MONO } from '../lostFound/ui'
import { btn } from './DispatchCards'
import { parseDispatchCode } from '../../utils/dispatch'

function Shell({ title, sub, onClose, children, wide = false }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ background: 'var(--card)', borderRadius: 14, boxShadow: '0 10px 40px rgba(0,0,0,0.3)', width: '100%', maxWidth: wide ? 520 : 440, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '14px 14px 0 0' }}>
          <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text-1)' }}>{title}</div>
          {sub && <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginTop: 4, lineHeight: 1.6 }}>{sub}</div>}
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

/* ── استلام: سليمة أو بملاحظة (الملاحظة تُصعَّد للإدارة تلقائياً) ── */
export function ReceiveDialog({ d, leg, names, isAr = true, busy, onConfirm, onClose }) {
  const t = (a, e) => (isAr ? a : e)
  const [cond, setCond] = useState('ok')
  const [note, setNote] = useState('')
  const pill = (on, c) => ({ flex: 1, padding: '14px 10px', borderRadius: 12, border: `2px solid ${on ? c : 'var(--border)'}`, background: on ? `${c}1a` : 'var(--card)', color: on ? c : 'var(--text-2)', fontWeight: 900, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' })
  return (
    <Shell title={t('استلام الإرسالية', 'Receive dispatch')} onClose={onClose}
      sub={<><b dir="ltr" style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{d.ticket_no}</b> · {names[leg.from_station_id]} {isAr ? '←' : '→'} {names[leg.to_station_id]} · {t('الحافلة', 'Bus')} <b dir="ltr" style={{ fontFamily: MONO }}>{leg.bus_number}</b></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)' }}>{t('كيف وصلت الإرسالية؟', 'How did it arrive?')}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" aria-pressed={cond === 'ok'} onClick={() => setCond('ok')} style={pill(cond === 'ok', '#16a34a')}>{t('سليمة وكاملة', 'Complete & intact')}</button>
          <button type="button" aria-pressed={cond === 'issue'} onClick={() => setCond('issue')} style={pill(cond === 'issue', '#dc2626')}>{t('بها ملاحظة', 'With an issue')}</button>
        </div>
        {cond === 'issue' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 5 }}>{t('اكتب الملاحظة *', 'Describe the issue *')}</label>
            <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500} placeholder={t('مثال: ناقص غرضين / الصندوق مكسور', 'e.g. two items missing / box damaged')} style={{ ...fieldStyle, resize: 'vertical' }} />
            <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: 6, fontWeight: 700 }}>{t('سيُصعَّد تلقائياً للإدارة ومشرفي المحطة المرسِلة.', 'This will be escalated automatically to management and the sending station supervisors.')}</div>
          </div>
        )}
        <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{t('يُسجَّل اسمك ووقت الاستلام تلقائياً.', 'Your name and the receipt time are recorded automatically.')}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
          <button type="button" disabled={busy || (cond === 'issue' && !note.trim())} onClick={() => onConfirm(cond, note.trim())} style={{ ...btn(cond === 'issue' ? 'danger' : 'ok', cond === 'issue' ? { background: '#dc2626', color: '#fff', border: 'none' } : {}), padding: '10px 26px', fontSize: '0.86rem', opacity: busy || (cond === 'issue' && !note.trim()) ? 0.55 : 1 }}>
            {busy ? t('جارٍ التأكيد…', 'Confirming…') : cond === 'issue' ? t('استلام وتصعيد', 'Receive & escalate') : t('تأكيد الاستلام', 'Confirm receipt')}
          </button>
        </div>
      </div>
    </Shell>
  )
}

/* ── تصعيد يدوي ── */
export function EscalateDialog({ d, isAr = true, busy, onConfirm, onClose }) {
  const t = (a, e) => (isAr ? a : e)
  const [reason, setReason] = useState('')
  return (
    <Shell title={t('تصعيد الإرسالية', 'Escalate dispatch')} onClose={onClose} sub={<b dir="ltr" style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{d.ticket_no}</b>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.8 }}>{t('يصل إشعار فوري للإدارة ولمشرفي المحطات المعنية، ويظهر على الإرسالية أنها مُصعّدة.', 'Management and the supervisors of the involved stations are notified immediately.')}</div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 5 }}>{t('سبب التصعيد *', 'Reason *')}</label>
          <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} placeholder={t('مثال: الحافلة تأخرت ولم تصل المحطة', 'e.g. the bus is late and has not arrived')} style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
          <button type="button" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())} style={{ ...btn('danger'), background: '#dc2626', color: '#fff', border: 'none', padding: '10px 26px', opacity: busy || !reason.trim() ? 0.55 : 1 }}>{busy ? '…' : t('تصعيد الآن', 'Escalate now')}</button>
        </div>
      </div>
    </Shell>
  )
}

/* ── ماسح QR: كاميرا + إدخال رقم التذكرة يدوياً ── */
export function QrScanDialog({ isAr = true, onCode, onClose }) {
  const t = (a, e) => (isAr ? a : e)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const doneRef = useRef(false)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState('')
  const [bad, setBad] = useState('')

  useEffect(() => {
    let stream, timer, off = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
        if (off) { stream.getTracks().forEach(x => x.stop()); return }
        const v = videoRef.current
        v.srcObject = stream
        await v.play()
        const c = canvasRef.current, ctx = c.getContext('2d', { willReadFrequently: true })
        timer = setInterval(() => {
          if (doneRef.current || v.videoWidth === 0) return
          const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w)
          c.width = w; c.height = h
          ctx.drawImage(v, 0, 0, w, h)
          const img = ctx.getImageData(0, 0, w, h)
          const q = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
          if (q?.data) {
            const p = parseDispatchCode(q.data)
            if (p) { doneRef.current = true; try { navigator.vibrate?.(60) } catch { /* بدون اهتزاز */ } onCode(p) }
            else setBad(t('هذا الرمز ليس تذكرة إرسالية', 'This is not a dispatch ticket'))
          }
        }, 160)
      } catch (e) {
        setErr(e?.name === 'NotAllowedError' ? t('لم يُسمح باستخدام الكاميرا. اسمح بها من إعدادات المتصفح أو أدخل رقم التذكرة يدوياً.', 'Camera permission denied. Allow it in the browser or enter the ticket manually.') : t('تعذّر تشغيل الكاميرا على هذا الجهاز. أدخل رقم التذكرة يدوياً.', 'Could not start the camera. Enter the ticket manually.'))
      }
    })()
    return () => { off = true; clearInterval(timer); stream?.getTracks().forEach(x => x.stop()) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function submitManual(e) {
    e.preventDefault()
    const p = parseDispatchCode(manual)
    if (!p) { setBad(t('اكتب رقم التذكرة مثل NWD-000123', 'Enter a ticket number like NWD-000123')); return }
    doneRef.current = true
    onCode(p)
  }

  return (
    <Shell title={t('استلام بمسح QR', 'Receive by scanning QR')} sub={t('وجّه الكاميرا نحو رمز التذكرة المطبوعة على الإرسالية', 'Point the camera at the QR on the dispatch ticket')} onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!err ? (
          <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div aria-hidden="true" style={{ position: 'absolute', inset: '14%', border: '3px solid rgba(255,255,255,0.9)', borderRadius: 18, boxShadow: '0 0 0 999px rgba(0,0,0,0.35)' }} />
          </div>
        ) : <div role="alert" style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.7 }}>{err}</div>}
        {bad && <div role="alert" style={{ fontSize: '0.78rem', fontWeight: 800, color: '#d97706' }}>{bad}</div>}
        <form onSubmit={submitManual} style={{ display: 'flex', gap: 8 }}>
          <input value={manual} onChange={e => { setManual(e.target.value); setBad('') }} dir="ltr" placeholder="NWD-000123" aria-label={t('رقم التذكرة', 'Ticket number')} style={{ ...fieldStyle, fontFamily: MONO, fontWeight: 800, flex: 1 }} />
          <button type="submit" style={btn('primary')}>{t('فتح', 'Open')}</button>
        </form>
        <button type="button" onClick={onClose} style={{ ...btn('ghost'), alignSelf: 'flex-end' }}>{t('إغلاق', 'Close')}</button>
      </div>
    </Shell>
  )
}
