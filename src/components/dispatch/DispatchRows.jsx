// صفوف القائمة المدمجة (يسار/يمين لوحة التفاصيل) للإرساليات وطلبات الإرسال
import { MONO } from '../lostFound/ui'
import { DISPATCH_KINDS, DISPATCH_STATUS, ESCALATION, REQUEST_STATUS, fmtDate, fmtTime, ageLabel, isActiveDispatch } from '../../utils/dispatch'

const chip = (color, bg, txt, solid = false) => <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: solid ? color : bg, color: solid ? '#fff' : color, whiteSpace: 'nowrap' }}>{txt}</span>

export function DispatchRow({ d, names, isAr, selected, stationSet, myIds, isAdmin, onSelect, setRef }) {
  const t = (a, e) => (isAr ? a : e)
  const legs = [...(d.legs || [])].sort((a, b) => a.leg_no - b.leg_no)
  const k = DISPATCH_KINDS[d.kind] || DISPATCH_KINDS.found
  const st = DISPATCH_STATUS[d.status] || DISPATCH_STATUS.in_transit
  const active = isActiveDispatch(d)
  const esc = active ? ESCALATION[d.escalation_level] : null
  const needsRecv = legs.some(l => l.status === 'sent' && myIds.has(l.to_station_id))
  const needsSend = legs.some(l => l.status === 'pending' && legs.find(x => x.leg_no === l.leg_no - 1)?.status === 'received' && myIds.has(l.from_station_id))
  const inc = legs.some(l => stationSet.has(l.to_station_id)), out = legs.some(l => stationSet.has(l.from_station_id))
  const dirColor = inc && out ? '#7c3aed' : inc ? '#0d9488' : '#2563eb'
  const chain = [legs[0]?.from_station_id, ...legs.map(l => l.to_station_id)].filter(Boolean)
  const sentLeg = legs.find(l => l.status === 'sent')
  const attention = needsRecv || needsSend
  const items = (d.items || []).reduce((a, i) => a + (i.qty || 1), 0)
  return (
    <button type="button" ref={setRef} onClick={onSelect} aria-current={selected ? 'true' : undefined}
      style={{ width: '100%', textAlign: 'start', display: 'block', border: 'none', borderBottom: '1px solid var(--border)', borderInlineStart: `4px solid ${selected ? 'var(--accent)' : (esc?.color || st.color)}`, background: selected ? 'var(--gold-dim)' : 'var(--card)', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 14px', color: 'inherit', transition: 'background .12s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {attention && <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706', flexShrink: 0 }} />}
        <span dir="ltr" style={{ fontFamily: MONO, fontWeight: attention ? 900 : 800, fontSize: '0.88rem', color: 'var(--text-1)', letterSpacing: '.02em' }}>{d.ticket_no}</span>
        {d.priority === 'urgent' && chip('#dc2626', '', t('عاجل', 'Urgent'), true)}
        {chip(k.color, k.bg, isAr ? k.ar : k.en)}
        <span style={{ marginInlineStart: 'auto', fontSize: '0.68rem', color: esc ? esc.color : 'var(--text-3)', fontWeight: esc ? 800 : 600, fontFamily: MONO }} dir={sentLeg ? undefined : 'ltr'}>
          {sentLeg ? ageLabel(sentLeg.sent_at, isAr) : `${fmtDate(d.created_at).slice(0, 5)} ${fmtTime(d.created_at)}`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 7, fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-1)' }}>
        {chain.map((id, i) => (
          <span key={id + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {i > 0 && <span aria-hidden="true" style={{ color: 'var(--text-3)', fontWeight: 600 }}>{isAr ? '←' : '→'}</span>}
            <span style={{ borderBottom: stationSet.has(id) ? `2px solid ${dirColor}` : 'none' }}>{names[id] || '—'}</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
        {chip(st.color, st.bg, isAr ? st.ar : st.en)}
        {esc && chip(esc.color, esc.bg, isAr ? esc.ar : esc.en)}
        {needsRecv && chip('#d97706', '', t('بانتظار استلامك', 'Awaiting your receipt'), true)}
        {needsSend && chip('#d97706', '', t('بانتظار إرسالك', 'Awaiting your forwarding'), true)}
        <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 600 }}>{items} {t('غرض', 'item(s)')}{d.recipient_name ? ` · ${d.recipient_name}` : ''}</span>
      </div>
    </button>
  )
}

export function RequestRow({ r, names, isAr, selected, onSelect, setRef }) {
  const t = (a, e) => (isAr ? a : e)
  const sm = REQUEST_STATUS[r.status] || REQUEST_STATUS.open
  return (
    <button type="button" ref={setRef} onClick={onSelect} aria-current={selected ? 'true' : undefined}
      style={{ width: '100%', textAlign: 'start', display: 'block', border: 'none', borderBottom: '1px solid var(--border)', borderInlineStart: `4px solid ${selected ? 'var(--accent)' : sm.color}`, background: selected ? 'var(--gold-dim)' : 'var(--card)', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 14px', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-1)' }}>{r.item_desc}</span>
        <span style={{ marginInlineStart: 'auto', fontSize: '0.68rem', color: 'var(--text-3)', fontFamily: MONO }} dir="ltr">{fmtDate(r.created_at).slice(0, 5)} {fmtTime(r.created_at)}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)' }}>{names[r.holder_station_id] || '—'} <span style={{ color: 'var(--text-3)' }}>{isAr ? '←' : '→'}</span> {names[r.to_station_id] || '—'}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        {chip(sm.color, sm.bg, isAr ? sm.ar : sm.en)}
        {chip(r.ref_type === 'report' ? '#d97706' : '#16a34a', r.ref_type === 'report' ? 'rgba(217,119,6,0.15)' : 'rgba(22,163,74,0.14)', r.ref_type === 'report' ? t('بلاغ مفقود', 'Lost report') : t('موجود', 'Found item'))}
        <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 600 }}>{t('طلبه', 'By')} {r.requester_name || '—'}</span>
      </div>
    </button>
  )
}
