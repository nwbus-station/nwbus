// نوافذ الإرساليات (على نمط Sheet الموحّد): استلام (سليمة/بملاحظة)، رفض، تصعيد يدوي، وفتح إرسالية برقم التذكرة
import { useState } from 'react'
import Sheet, { Ic } from './Sheet'
import { fieldStyle, MONO } from '../lostFound/ui'
import { btn } from './DispatchCards'
import { parseDispatchCode } from '../../utils/dispatch'

const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 6 }
const hint = { fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.85 }
const Route = ({ d, leg, names, isAr }) => (
  <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 16 }}>
    <div dir="ltr" style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1rem', color: 'var(--text-1)', letterSpacing: '.03em' }}>{d.ticket_no}</div>
    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-1)', marginTop: 6 }}>{names[leg.from_station_id] || '—'} <span style={{ color: 'var(--text-3)' }}>{isAr ? '←' : '→'}</span> {names[leg.to_station_id] || '—'}</div>
    {leg.bus_number && <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginTop: 4 }}>{isAr ? 'الحافلة' : 'Bus'}: <b dir="ltr" style={{ fontFamily: MONO, color: 'var(--text-2)' }}>{leg.bus_number}</b></div>}
  </div>
)

/* ── استلام: سليمة أو بملاحظة (الملاحظة تُصعَّد للإدارة تلقائياً) ── */
export function ReceiveDialog({ d, leg, names, isAr = true, busy, onConfirm, onClose }) {
  const t = (a, e) => (isAr ? a : e)
  const [cond, setCond] = useState('ok')
  const [note, setNote] = useState('')
  const bad = cond === 'issue'
  const blocked = busy || (bad && !note.trim())
  const opt = (id, c, title, sub, icon) => (
    <button type="button" aria-pressed={cond === id} onClick={() => setCond(id)}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 10px', borderRadius: 14, border: `2px solid ${cond === id ? c : 'var(--border)'}`, background: cond === id ? `${c}14` : 'var(--card)', color: cond === id ? c : 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s' }}>
      {icon}<span style={{ fontWeight: 900, fontSize: '0.92rem' }}>{title}</span><span style={{ fontSize: '0.66rem', fontWeight: 600, opacity: 0.85 }}>{sub}</span>
    </button>
  )
  return (
    <Sheet isAr={isAr} title={t('استلام الإرسالية', 'Receive dispatch')} icon={Ic.check} accent="#16a34a" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="button" disabled={blocked} onClick={() => onConfirm(cond, note.trim())} style={{ ...btn(bad ? 'danger' : 'ok', bad ? { background: '#dc2626', color: '#fff', border: 'none' } : {}), padding: '11px 28px', fontSize: '0.88rem', opacity: blocked ? 0.55 : 1 }}>
          {busy ? t('جارٍ التأكيد…', 'Confirming…') : bad ? t('استلام وتصعيد', 'Receive & escalate') : t('تأكيد الاستلام', 'Confirm receipt')}
        </button>
      </>}>
      <Route d={d} leg={leg} names={names} isAr={isAr} />
      <div style={lbl}>{t('كيف وصلت الإرسالية؟', 'How did it arrive?')}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {opt('ok', '#16a34a', t('سليمة وكاملة', 'Complete & intact'), t('كل شيء كما هو', 'All as expected'), Ic.check)}
        {opt('issue', '#dc2626', t('بها ملاحظة', 'With an issue'), t('نقص أو تلف أو غير ذلك', 'Missing / damaged'), Ic.alert)}
      </div>
      {bad && (
        <div style={{ marginTop: 16 }}>
          <label style={lbl}>{t('اكتب الملاحظة *', 'Describe the issue *')}</label>
          <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500} placeholder={t('مثال: ناقص غرضين / الصندوق مكسور', 'e.g. two items missing / box damaged')} style={{ ...fieldStyle, resize: 'vertical' }} />
          <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 8, fontWeight: 700, lineHeight: 1.7 }}>{t('سيُصعَّد تلقائياً للإدارة ومشرفي المحطة المرسِلة.', 'This will be escalated automatically to management and the sending station supervisors.')}</div>
        </div>
      )}
      <div style={{ ...hint, color: 'var(--text-3)', marginTop: 14 }}>{t('يُسجَّل اسمك ووقت الاستلام تلقائياً.', 'Your name and the receipt time are recorded automatically.')}</div>
    </Sheet>
  )
}

/* ── رفض الإرسالية (للمشرفين والأدمن) ── */
export function RejectDialog({ d, leg, names, isAr = true, busy, onConfirm, onClose }) {
  const t = (a, e) => (isAr ? a : e)
  const [reason, setReason] = useState('')
  const blocked = busy || !reason.trim()
  return (
    <Sheet isAr={isAr} title={t('رفض الإرسالية', 'Reject dispatch')} icon={Ic.x} accent="#dc2626" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="button" disabled={blocked} onClick={() => onConfirm(reason.trim())} style={{ ...btn('danger'), background: '#dc2626', color: '#fff', border: 'none', padding: '11px 28px', fontSize: '0.88rem', opacity: blocked ? 0.55 : 1 }}>{busy ? '…' : t('تأكيد الرفض', 'Confirm rejection')}</button>
      </>}>
      <Route d={d} leg={leg} names={names} isAr={isAr} />
      <div style={{ ...hint, marginBottom: 14 }}>{t('تُغلق الإرسالية كمرفوضة ولا يمكن استلامها بعد ذلك. يُشعَر موظفو المحطة المرسِلة ومنشئ الإرسالية والإدارة بالسبب.', 'The dispatch is closed as rejected and can no longer be received. The sending station, its creator and management are notified.')}</div>
      <label style={lbl}>{t('سبب الرفض *', 'Reason *')}</label>
      <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} placeholder={t('مثال: الإرسالية موجّهة لمحطة أخرى', 'e.g. addressed to another station')} style={{ ...fieldStyle, resize: 'vertical' }} />
    </Sheet>
  )
}

/* ── تصعيد يدوي ── */
export function EscalateDialog({ d, isAr = true, busy, onConfirm, onClose }) {
  const t = (a, e) => (isAr ? a : e)
  const [reason, setReason] = useState('')
  const blocked = busy || !reason.trim()
  return (
    <Sheet isAr={isAr} title={t('تصعيد الإرسالية', 'Escalate dispatch')} icon={Ic.alert} accent="#d97706" onClose={onClose}
      sub={<b dir="ltr" style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{d.ticket_no}</b>}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="button" disabled={blocked} onClick={() => onConfirm(reason.trim())} style={{ ...btn('danger'), background: '#dc2626', color: '#fff', border: 'none', padding: '11px 28px', fontSize: '0.88rem', opacity: blocked ? 0.55 : 1 }}>{busy ? '…' : t('تصعيد الآن', 'Escalate now')}</button>
      </>}>
      <div style={{ ...hint, marginBottom: 14 }}>{t('يصل إشعار فوري للإدارة ولمشرفي المحطات المعنية، ويظهر على الإرسالية أنها مُصعّدة.', 'Management and the supervisors of the involved stations are notified immediately.')}</div>
      <label style={lbl}>{t('سبب التصعيد *', 'Reason *')}</label>
      <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} placeholder={t('مثال: الحافلة تأخرت ولم تصل المحطة', 'e.g. the bus is late and has not arrived')} style={{ ...fieldStyle, resize: 'vertical' }} />
    </Sheet>
  )
}

/* ── فتح إرسالية برقم التذكرة (بدون كاميرا): كتابة يدوية أو قارئ باركود/QR متصل بالكمبيوتر (يكتب الرقم كلوحة مفاتيح) ── */
export function TicketLookupDialog({ isAr = true, onCode, onClose }) {
  const t = (a, e) => (isAr ? a : e)
  const [val, setVal] = useState('')
  const [bad, setBad] = useState('')
  function submit(e) {
    e?.preventDefault()
    const p = parseDispatchCode(val)
    if (!p || !p.ticket) { setBad(t('اكتب رقم التذكرة مثل NWD-000123', 'Enter a ticket number like NWD-000123')); return }
    onCode(p)
  }
  return (
    <Sheet isAr={isAr} title={t('استلام برقم التذكرة', 'Receive by ticket number')} icon={Ic.ticket} onClose={onClose}
      sub={t('اكتب الرقم المطبوع على الإرسالية، أو امسحه بجهاز قارئ باركود/QR متصل بالجهاز. لا تُستخدم الكاميرا.', 'Type the number printed on the dispatch, or scan it with a connected barcode reader. No camera is used.')}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="submit" form="dsp-lookup" style={{ ...btn('primary'), padding: '11px 28px', fontSize: '0.88rem' }}>{t('فتح الإرسالية', 'Open')}</button>
      </>}>
      <form id="dsp-lookup" onSubmit={submit}>
        <input autoFocus value={val} onChange={e => { setVal(e.target.value); setBad('') }} dir="ltr" placeholder="NWD-000123" aria-label={t('رقم التذكرة', 'Ticket number')}
          style={{ ...fieldStyle, fontFamily: MONO, fontWeight: 900, fontSize: '1.25rem', letterSpacing: '.06em', textAlign: 'center', padding: '16px 12px' }} />
        {bad && <div role="alert" style={{ fontSize: '0.78rem', fontWeight: 800, color: '#d97706', marginTop: 10 }}>{bad}</div>}
      </form>
    </Sheet>
  )
}
