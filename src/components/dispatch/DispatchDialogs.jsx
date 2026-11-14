// نوافذ الإرساليات: استلام (سليمة/بملاحظة)، تصعيد يدوي، وفتح إرسالية برقم التذكرة
import { useState, useEffect } from 'react'
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

/* ── رفض الإرسالية (للمشرفين والأدمن) ── */
export function RejectDialog({ d, leg, names, isAr = true, busy, onConfirm, onClose }) {
  const t = (a, e) => (isAr ? a : e)
  const [reason, setReason] = useState('')
  return (
    <Shell title={t('رفض الإرسالية', 'Reject dispatch')} onClose={onClose}
      sub={<><b dir="ltr" style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{d.ticket_no}</b> · {names[leg.from_station_id]} {isAr ? '←' : '→'} {names[leg.to_station_id]}</>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.8 }}>{t('تُغلق الإرسالية كمرفوضة ولا يمكن استلامها بعد ذلك. يُشعَر موظفو المحطة المرسِلة ومنشئ الإرسالية والإدارة بالسبب.', 'The dispatch is closed as rejected and can no longer be received. The sending station, its creator and management are notified.')}</div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 5 }}>{t('سبب الرفض *', 'Reason *')}</label>
          <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} placeholder={t('مثال: الإرسالية موجّهة لمحطة أخرى', 'e.g. addressed to another station')} style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
          <button type="button" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())} style={{ ...btn('danger'), background: '#dc2626', color: '#fff', border: 'none', padding: '10px 26px', opacity: busy || !reason.trim() ? 0.55 : 1 }}>{busy ? '…' : t('تأكيد الرفض', 'Confirm rejection')}</button>
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

/* ── فتح إرسالية برقم التذكرة (بدون كاميرا): للكتابة اليدوية أو جهاز قارئ باركود/QR متصل بالكمبيوتر (يكتب الرقم كلوحة مفاتيح) ── */
export function TicketLookupDialog({ isAr = true, onCode, onClose }) {
  const t = (a, e) => (isAr ? a : e)
  const [val, setVal] = useState('')
  const [bad, setBad] = useState('')
  function submit(e) {
    e.preventDefault()
    const p = parseDispatchCode(val)
    if (!p || !p.ticket) { setBad(t('اكتب رقم التذكرة مثل NWD-000123', 'Enter a ticket number like NWD-000123')); return }
    onCode(p)
  }
  return (
    <Shell title={t('استلام برقم التذكرة', 'Receive by ticket number')} onClose={onClose}
      sub={t('اكتب رقم التذكرة المطبوع على الإرسالية، أو امسحه بجهاز قارئ باركود/QR متصل بالجهاز. لا تُستخدم الكاميرا ولا يُعرض أي شيء قبل التحقق من صلاحيتك.', 'Type the ticket number printed on the dispatch, or scan it with a connected barcode reader. No camera is used.')}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input autoFocus value={val} onChange={e => { setVal(e.target.value); setBad('') }} dir="ltr" placeholder="NWD-000123" aria-label={t('رقم التذكرة', 'Ticket number')}
          style={{ ...fieldStyle, fontFamily: MONO, fontWeight: 900, fontSize: '1.15rem', letterSpacing: '.05em', textAlign: 'center', padding: '14px 12px' }} />
        {bad && <div role="alert" style={{ fontSize: '0.78rem', fontWeight: 800, color: '#d97706' }}>{bad}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
          <button type="submit" style={{ ...btn('primary'), padding: '10px 26px' }}>{t('فتح الإرسالية', 'Open')}</button>
        </div>
      </form>
    </Shell>
  )
}
