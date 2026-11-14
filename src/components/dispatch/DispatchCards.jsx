// بطاقات الإرساليات وطلبات الإرسال (مشتركة بين الواردة والصادرة والكل)
import { useState } from 'react'
import { card, fieldStyle, MONO } from '../lostFound/ui'
import { DISPATCH_KINDS, DISPATCH_STATUS, LEG_STATUS, REQUEST_STATUS, ESCALATION, fmtDate, fmtTime, fmtStamp, sortLegs, ageLabel, toLatinDigits, isActiveDispatch } from '../../utils/dispatch'

export const btn = (kind = 'ghost', extra = {}) => ({
  padding: '8px 16px', borderRadius: 9, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap',
  border: kind === 'ghost' ? '1px solid var(--border)' : kind === 'danger' ? '1px solid rgba(220,38,38,0.4)' : kind === 'warn' ? '1px solid rgba(217,119,6,0.5)' : 'none',
  background: kind === 'primary' ? '#2563eb' : kind === 'ok' ? '#16a34a' : kind === 'warn' ? 'rgba(217,119,6,0.12)' : 'var(--surface)',
  color: kind === 'primary' || kind === 'ok' ? '#fff' : kind === 'danger' ? '#dc2626' : kind === 'warn' ? '#d97706' : 'var(--text-1)', ...extra,
})

export function Badge({ m, children, isAr = true, solid = false }) {
  return <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: solid ? m.color : (m.bg || 'var(--surface)'), color: solid ? '#fff' : m.color, whiteSpace: 'nowrap' }}>{children ?? (isAr ? m.ar : m.en)}</span>
}
export const Meta = ({ label, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{children}</div>
  </div>
)
const mono = { fontFamily: MONO }

/* ═════════════ بطاقة إرسالية ═════════════ */
export function DispatchCard({ d, names, isAr, open, flashing, setRef, onToggle, stationSet, myIds, isAdmin, canDelete, canReject, busy, onReceive, onReject, onSend, onNote, onPrint, onDelete, onEscalate }) {
  const t = (a, e) => (isAr ? a : e)
  const legs = sortLegs(d)
  const k = DISPATCH_KINDS[d.kind] || DISPATCH_KINDS.found
  const st = DISPATCH_STATUS[d.status] || DISPATCH_STATUS.in_transit
  const esc = isActiveDispatch(d) ? ESCALATION[d.escalation_level] : (d.status === 'received' && d.escalation_reason ? ESCALATION[d.escalation_level] : null)
  const [bus2, setBus2] = useState('')
  const [note, setNote] = useState('')
  const canAct = id => isAdmin || myIds.has(id)

  const incomingLeg = legs.find(l => stationSet.has(l.to_station_id))
  const outgoingLeg = legs.find(l => stationSet.has(l.from_station_id))
  const dirTxt = incomingLeg && outgoingLeg ? t('عبور', 'Transit') : incomingLeg ? t('واردة', 'Incoming') : outgoingLeg ? t('صادرة', 'Outgoing') : null
  const dirColor = incomingLeg && outgoingLeg ? '#7c3aed' : incomingLeg ? '#0d9488' : '#2563eb'
  const chain = [legs[0]?.from_station_id, ...legs.map(l => l.to_station_id)].filter(Boolean)
  const sentLeg = legs.find(l => l.status === 'sent')
  const needsRecv = legs.some(l => l.status === 'sent' && myIds.has(l.to_station_id))
  const needsSend = legs.some(l => l.status === 'pending' && legs.find(x => x.leg_no === l.leg_no - 1)?.status === 'received' && myIds.has(l.from_station_id))
  const last = [...legs].reverse().find(l => l.status !== 'pending')
  const lastWhen = last ? (last.status === 'received' ? last.received_at : last.sent_at) : d.created_at
  const lastWho = last ? (last.status === 'received' ? last.received_by_name : last.sent_by_name) : d.created_by_name

  return (
    <article ref={setRef} style={{ ...card, overflow: 'hidden', borderInlineStart: `4px solid ${esc?.color || st.color}`, boxShadow: flashing ? '0 0 0 3px rgba(37,99,235,0.45)' : undefined, transition: 'box-shadow .4s' }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ width: '100%', textAlign: 'start', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '14px 16px', display: 'block', color: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span dir="ltr" style={{ ...mono, fontWeight: 900, fontSize: '1.02rem', color: 'var(--text-1)', letterSpacing: '.03em' }}>{d.ticket_no}</span>
          {dirTxt && <Badge m={{ color: dirColor }} solid>{dirTxt}</Badge>}
          <Badge m={k} isAr={isAr} />
          <Badge m={st} isAr={isAr} />
          {d.priority === 'urgent' && <Badge m={{ color: '#dc2626' }} solid>{t('عاجل', 'Urgent')}</Badge>}
          {esc && <Badge m={esc} isAr={isAr} />}
          {needsRecv && <span style={{ fontSize: '0.68rem', fontWeight: 900, padding: '3px 10px', borderRadius: 99, background: '#d97706', color: '#fff' }}>{t('بانتظار استلامك', 'Awaiting your receipt')}</span>}
          {needsSend && <span style={{ fontSize: '0.68rem', fontWeight: 900, padding: '3px 10px', borderRadius: 99, background: '#d97706', color: '#fff' }}>{t('بانتظار إرسالك', 'Awaiting your forwarding')}</span>}
          <span style={{ marginInlineStart: 'auto', fontSize: '0.72rem', color: 'var(--text-3)', ...mono }} dir="ltr">{fmtDate(d.created_at)} · {fmtTime(d.created_at)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10, fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)' }}>
          {chain.map((id, i) => (
            <span key={id + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span aria-hidden="true" style={{ color: 'var(--text-3)', opacity: legs[i - 1]?.status === 'pending' ? 0.4 : 1 }}>{isAr ? '←' : '→'}</span>}
              <span style={{ textDecoration: stationSet.has(id) ? 'underline' : 'none', textDecorationColor: dirColor, textUnderlineOffset: 4 }}>{names[id] || '—'}</span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: '0.74rem', color: 'var(--text-3)' }}>
          <span>{t('أرسلها', 'Sent by')}: <b style={{ color: 'var(--text-2)' }}>{d.created_by_name || '—'}</b></span>
          {legs[0]?.bus_number && <span>{t('الحافلة', 'Bus')}: <b dir="ltr" style={{ color: 'var(--text-2)', ...mono }}>{legs[0].bus_number}</b></span>}
          <span>{t('الأغراض', 'Items')}: <b style={{ color: 'var(--text-2)' }}>{(d.items || []).reduce((a, i) => a + (i.qty || 1), 0)}</b></span>
          {d.recipient_name && <span>{t('المستلِم', 'Recipient')}: <b style={{ color: 'var(--text-2)' }}>{d.recipient_name}</b></span>}
          {sentLeg && <span style={{ color: esc?.color || 'var(--text-3)', fontWeight: 800 }}>{t('في الطريق منذ', 'In transit for')} <span style={mono}>{ageLabel(sentLeg.sent_at, isAr)}</span></span>}
          {!sentLeg && last && <span>{t('آخر حركة', 'Last')}: <b style={{ color: 'var(--text-2)' }}>{lastWho || '—'}</b> <span dir="ltr" style={mono}>{fmtTime(lastWhen)}</span></span>}
          {(d.notes || []).length > 0 && <span style={{ color: '#d97706', fontWeight: 800 }}>{t(`${d.notes.length} ملاحظة`, `${d.notes.length} note(s)`)}</span>}
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {d.escalation_reason && d.escalation_level > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: ESCALATION[d.escalation_level].bg, color: ESCALATION[d.escalation_level].color, fontSize: '0.8rem', fontWeight: 800 }}>
              {t('سبب التصعيد', 'Escalation reason')}: {d.escalation_reason} <span dir="ltr" style={{ ...mono, fontWeight: 600, opacity: 0.8 }}> · {fmtStamp(d.escalated_at)}</span>
            </div>
          )}

          {(d.recipient_name || d.sender_name) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' }}>
              {d.sender_name && <Meta label={t('المرسِل (العميل)', 'Sender')}>{d.sender_name}{d.sender_phone && <> · <span dir="ltr" style={mono}>{d.sender_phone}</span></>}</Meta>}
              {d.recipient_name && <Meta label={t('المستلِم النهائي', 'Recipient')}>{d.recipient_name}{d.recipient_phone && <> · <span dir="ltr" style={mono}>{d.recipient_phone}</span></>}</Meta>}
            </div>
          )}

          {/* الخطوط */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {legs.map(l => {
              const lm = LEG_STATUS[l.status]
              const prev = legs.find(x => x.leg_no === l.leg_no - 1)
              const canSendThis = l.status === 'pending' && prev?.status === 'received' && canAct(l.from_station_id)
              const canRecvThis = l.status === 'sent' && canAct(l.to_station_id)
              return (
                <div key={l.id} style={{ border: `1.5px ${l.status === 'pending' ? 'dashed' : 'solid'} ${lm.color}55`, borderRadius: 12, background: 'var(--card)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-3)' }}>{l.leg_no === 1 ? t('الخط الأول', 'First leg') : t('الخط الثاني', 'Second leg')}</span>
                    <span style={{ fontWeight: 900, fontSize: '0.92rem', color: 'var(--text-1)' }}>{names[l.from_station_id] || '—'} <span style={{ color: 'var(--text-3)' }}>{isAr ? '←' : '→'}</span> {names[l.to_station_id] || '—'}</span>
                    <span style={{ marginInlineStart: 'auto', fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: `${lm.color}22`, color: lm.color }}>{isAr ? lm.ar : lm.en}</span>
                  </div>
                  {l.status !== 'pending' && l.sent_at && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 10 }}>
                      <Meta label={t('من أرسل', 'Sent by')}>{l.sent_by_name || '—'}</Meta>
                      <Meta label={t('رقم الحافلة', 'Bus')}><span dir="ltr" style={mono}>{l.bus_number || '—'}</span></Meta>
                      <Meta label={t('تاريخ الإرسال', 'Date')}><span dir="ltr" style={mono}>{fmtDate(l.sent_at)}</span></Meta>
                      <Meta label={t('وقت الإرسال (24س)', 'Time (24h)')}><span dir="ltr" style={mono}>{fmtTime(l.sent_at)}</span></Meta>
                      {l.status === 'received' && <>
                        <Meta label={t('من استلم', 'Received by')}>{l.received_by_name || '—'}</Meta>
                        <Meta label={t('تاريخ الاستلام', 'Received on')}><span dir="ltr" style={mono}>{fmtDate(l.received_at)}</span></Meta>
                        <Meta label={t('وقت الاستلام (24س)', 'Received at')}><span dir="ltr" style={mono}>{fmtTime(l.received_at)}</span></Meta>
                        <Meta label={t('حالة الاستلام', 'Condition')}>{l.receive_condition === 'issue' ? <span style={{ color: '#dc2626' }}>{t('بملاحظة', 'With issue')}: {l.receive_note}</span> : <span style={{ color: '#16a34a' }}>{t('سليمة', 'OK')}</span>}</Meta>
                      </>}
                    </div>
                  )}
                  {l.status === 'pending' && !canSendThis && <div style={{ marginTop: 8, fontSize: '0.74rem', color: 'var(--text-3)' }}>{prev?.status === 'received' ? t('بانتظار إرسالها من محطة التحويل', 'Waiting to be forwarded by the transfer station') : t('تبدأ بعد استلام الخط الأول', 'Starts after the first leg is received')}</div>}
                  {canRecvThis && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      <button type="button" disabled={busy === 'r' + l.id} onClick={() => onReceive(l)} style={{ ...btn('ok'), padding: '10px 22px', fontSize: '0.84rem' }}>{t('استلام الإرسالية', 'Receive')}</button>
                      {canReject && <button type="button" onClick={() => onReject(l)} style={{ ...btn('danger'), padding: '10px 22px', fontSize: '0.84rem' }}>{t('رفض', 'Reject')}</button>}
                    </div>
                  )}
                  {l.status === 'rejected' && (
                    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.7 }}>
                      {l.rejected_by_name ? <>{t('رفضها', 'Rejected by')}: <b>{l.rejected_by_name}</b> · <span dir="ltr" style={mono}>{fmtStamp(l.rejected_at)}</span><br /></> : null}
                      {t('السبب', 'Reason')}: {l.reject_reason || '—'}
                    </div>
                  )}
                  {canSendThis && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
                      <div style={{ width: 150 }}>
                        <label style={{ display: 'block', fontSize: '0.66rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 4 }}>{t('رقم الحافلة *', 'Bus number *')}</label>
                        <input value={bus2} onChange={e => setBus2(toLatinDigits(e.target.value))} dir="ltr" placeholder="4521" style={{ ...fieldStyle, ...mono, fontWeight: 800 }} />
                      </div>
                      <button type="button" disabled={!bus2.trim() || busy === 's' + l.id} onClick={() => onSend(l, bus2.trim())} style={{ ...btn('primary'), padding: '10px 22px', fontSize: '0.84rem', opacity: bus2.trim() ? 1 : 0.5 }}>
                        {busy === 's' + l.id ? t('جارٍ الإرسال…', 'Sending…') : t('إرسال الخط الثاني', 'Send second leg')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* الأغراض */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-3)', marginBottom: 6 }}>{d.kind === 'shipment' ? t('محتويات الشحنة', 'Shipment contents') : t('الأغراض', 'Items')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(d.items || []).map(i => (
                <span key={i.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, background: 'var(--card)', border: '1px solid var(--border)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)' }}>
                  {i.description}{i.qty > 1 && <b dir="ltr" style={{ ...mono, color: '#2563eb' }}>×{i.qty}</b>}
                  {i.ref_type !== 'free' && <span style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>{i.ref_type === 'found' ? t('من الموجودات', 'logged') : t('من البلاغات', 'report')}</span>}
                </span>
              ))}
            </div>
            {d.note && <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-2)', padding: '9px 12px', borderRadius: 9, background: 'var(--card)', border: '1px solid var(--border)' }}><b>{t('ملاحظة المُرسِل: ', 'Sender note: ')}</b>{d.note}</div>}
          </div>

          {/* ملاحظات الإدارة */}
          {((d.notes || []).length > 0 || isAdmin) && (
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-3)', marginBottom: 6 }}>{t('ملاحظات الإدارة', 'Admin notes')}</div>
              {[...(d.notes || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(n => (
                <div key={n.id} style={{ padding: '9px 12px', borderRadius: 9, background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', marginBottom: 6 }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-1)', fontWeight: 600, whiteSpace: 'pre-line' }}>{n.body}</div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', marginTop: 4 }}>{n.author_name} · <span dir="ltr" style={mono}>{fmtStamp(n.created_at)}</span></div>
                </div>
              ))}
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000} placeholder={t('اكتب ملاحظتك على هذه الإرسالية…', 'Write your note on this dispatch…')} style={{ ...fieldStyle, resize: 'vertical', flex: 1 }} />
                  <button type="button" disabled={!note.trim() || busy === 'n' + d.id} onClick={async () => { await onNote(d, note.trim()); setNote('') }} style={{ ...btn('primary'), opacity: note.trim() ? 1 : 0.5 }}>{t('إضافة', 'Add')}</button>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <button type="button" onClick={onPrint} style={btn('ghost')}>{t('طباعة التذكرة', 'Print ticket')}</button>
            {isActiveDispatch(d) && legs.some(l => canAct(l.from_station_id) || canAct(l.to_station_id)) && (
              <button type="button" onClick={() => onEscalate(d)} style={btn('warn')}>{t('تصعيد', 'Escalate')}</button>
            )}
            {canDelete && <button type="button" onClick={onDelete} disabled={busy === 'd' + d.id} style={{ ...btn('danger'), marginInlineStart: 'auto' }}>{t('حذف', 'Delete')}</button>}
          </div>
        </div>
      )}
    </article>
  )
}

/* ═════════════ بطاقة طلب إرسال ═════════════ */
export function RequestCard({ r, names, isAr, flashing, setRef, canHandle, canFulfil, busy, onFulfil, onDismiss, onOpenDispatch }) {
  const t = (a, e) => (isAr ? a : e)
  const [closing, setClosing] = useState(false)
  const [reason, setReason] = useState('')
  const sm = REQUEST_STATUS[r.status] || REQUEST_STATUS.open
  return (
    <article ref={setRef} style={{ ...card, padding: '14px 16px', borderInlineStart: `4px solid ${sm.color}`, boxShadow: flashing ? '0 0 0 3px rgba(37,99,235,0.45)' : undefined, transition: 'box-shadow .4s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 900, fontSize: '0.95rem', color: 'var(--text-1)' }}>{r.item_desc}</span>
        <Badge m={{ color: r.ref_type === 'report' ? '#d97706' : '#16a34a', bg: r.ref_type === 'report' ? 'rgba(217,119,6,0.15)' : 'rgba(22,163,74,0.14)' }}>{r.ref_type === 'report' ? t('بلاغ مفقود', 'Lost report') : t('موجود', 'Found item')}</Badge>
        <Badge m={sm} isAr={isAr} />
        <span style={{ marginInlineStart: 'auto', fontSize: '0.72rem', color: 'var(--text-3)', ...mono }} dir="ltr">{fmtDate(r.created_at)} · {fmtTime(r.created_at)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
        <Meta label={t('الغرض موجود في', 'Held at')}>{names[r.holder_station_id] || '—'}</Meta>
        <Meta label={t('المطلوب إرساله إلى', 'Send to')}>{names[r.to_station_id] || '—'}</Meta>
        <Meta label={t('طلبه', 'Requested by')}>{r.requester_name || '—'}{r.requester_station_id ? ` · ${names[r.requester_station_id] || ''}` : ''}</Meta>
        {r.handled_at && <Meta label={t('عولج بواسطة', 'Handled by')}>{r.handled_by_name || '—'} · <span dir="ltr" style={mono}>{fmtStamp(r.handled_at)}</span></Meta>}
      </div>
      {r.note && <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-2)' }}><b>{t('ملاحظة: ', 'Note: ')}</b>{r.note}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {r.status === 'open' && canFulfil && <button type="button" onClick={onFulfil} style={btn('primary')}>{t('إنشاء إرسالية لهذا الطلب', 'Create dispatch for this request')}</button>}
        {r.status === 'open' && canHandle && !closing && <button type="button" onClick={() => setClosing(true)} style={btn('ghost')}>{t('إغلاق الطلب', 'Close request')}</button>}
        {r.status === 'fulfilled' && r.dispatch_id && <button type="button" onClick={onOpenDispatch} style={btn('ghost')}>{t('عرض الإرسالية', 'View dispatch')}</button>}
      </div>
      {closing && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder={t('سبب الإغلاق (اختياري)', 'Reason (optional)')} style={{ ...fieldStyle, flex: '1 1 220px' }} />
          <button type="button" disabled={busy} onClick={() => onDismiss(reason.trim())} style={btn('danger')}>{busy ? '…' : t('تأكيد الإغلاق', 'Confirm close')}</button>
          <button type="button" onClick={() => { setClosing(false); setReason('') }} style={btn('ghost')}>{t('تراجع', 'Back')}</button>
        </div>
      )}
    </article>
  )
}
