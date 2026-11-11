// الإرساليات: نقل الموجودات/المفقودات بين المحطات — قائمة بالحالات، تتبّع الخطوط، استلام/إرسال، ملاحظات الأدمن، وطلبات الإرسال.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import SelectField from '../shared/SelectField'
import ConfirmDialog from '../shared/ConfirmDialog'
import StatStrip from '../shared/StatStrip'
import DispatchForm from './DispatchForm'
import { Banner, card, fieldStyle, MONO } from './ui'
import { DISPATCH_KINDS, DISPATCH_STATUS, LEG_STATUS, REQUEST_STATUS, fmtDate, fmtTime, fmtStamp, dispatchError, sortLegs } from '../../utils/dispatch'
import { printDispatchSlip } from '../../utils/dispatchSlip'

const SELECT_D = '*, legs:dispatch_legs(*), items:dispatch_items(*), notes:dispatch_notes(*)'
const btn = (kind = 'ghost', extra = {}) => ({
  padding: '8px 16px', borderRadius: 9, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap',
  border: kind === 'ghost' ? '1px solid var(--border)' : kind === 'danger' ? '1px solid rgba(220,38,38,0.4)' : 'none',
  background: kind === 'primary' ? '#2563eb' : kind === 'ok' ? '#16a34a' : kind === 'danger' ? 'var(--surface)' : 'var(--surface)',
  color: kind === 'primary' || kind === 'ok' ? '#fff' : kind === 'danger' ? '#dc2626' : 'var(--text-1)', ...extra,
})

function Badge({ m, children, isAr }) {
  return <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: m.bg || 'var(--surface)', color: m.color, whiteSpace: 'nowrap' }}>{children ?? (isAr ? m.ar : m.en)}</span>
}
const Meta = ({ label, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{children}</div>
  </div>
)

export default function DispatchTab({ isAr = true, focusId = null, onFocusDone, prefill = null, onPrefillDone }) {
  const t = (a, e) => (isAr ? a : e)
  const { profile, isGeneralAdmin, workStations } = useAuth()
  const isAdmin = !!isGeneralAdmin
  const isGeneral = profile?.role === 'general_admin'
  const [stations, setStations] = useState([])
  const [rows, setRows] = useState([])
  const [reqs, setReqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [setup, setSetup] = useState(false)
  const [sub, setSub] = useState('list')           // list | requests
  const [view, setView] = useState('list')          // list | form
  const [formInit, setFormInit] = useState(null)
  const [scope, setScope] = useState(isAdmin ? 'all' : 'mine')
  const [fStatus, setFStatus] = useState('')
  const [fKind, setFKind] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [flashId, setFlashId] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)              // { kind, text }
  const [confirm, setConfirm] = useState(null)
  const [limit, setLimit] = useState(40)
  const refs = useRef({})

  const names = useMemo(() => Object.fromEntries(stations.map(s => [s.id, s.name_ar || s.name_en])), [stations])
  const myIds = useMemo(() => new Set([profile?.station_id, ...(workStations || []).map(s => s.id)].filter(Boolean)), [profile?.station_id, workStations])
  const myStations = useMemo(() => stations.filter(s => myIds.has(s.id)), [stations, myIds])
  const canAct = id => isAdmin || myIds.has(id)
  const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 5000) }

  const load = useCallback(async () => {
    const [d, r, s] = await Promise.all([
      supabase.from('dispatches').select(SELECT_D).order('created_at', { ascending: false }).limit(400),
      supabase.from('dispatch_requests').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('stations').select('id, name_ar, name_en').order('name_ar'),
    ])
    if (d.error) { setSetup(dispatchError(d.error) === 'SETUP'); setLoading(false); return }
    setSetup(false)
    setRows(d.data ?? []); setReqs(r.data ?? []); setStations(s.data ?? []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('dispatch_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_legs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_notes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_requests' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // فتح إرسالية/طلب من إشعار
  useEffect(() => {
    if (!focusId || loading) return
    if (rows.some(d => d.id === focusId)) { setSub('list'); setView('list'); setScope('all'); setOpenId(focusId); setFlashId(focusId) }
    else if (reqs.some(r => r.id === focusId)) { setSub('requests'); setView('list'); setFlashId(focusId) }
    else return
    onFocusDone?.()
    setTimeout(() => { refs.current[focusId]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => setFlashId(null), 2500) }, 250)
  }, [focusId, loading, rows, reqs]) // eslint-disable-line react-hooks/exhaustive-deps

  // فتح النموذج بمعطيات جاهزة من قسم الموجودات (طلب إرسال)
  useEffect(() => { if (prefill) { setFormInit(prefill); setView('form'); onPrefillDone?.() } }, [prefill]) // eslint-disable-line react-hooks/exhaustive-deps

  const touchesMe = d => (d.legs || []).some(l => myIds.has(l.from_station_id) || myIds.has(l.to_station_id))
  // هل ينتظر إجراءً مني؟ (استلام خط واصل لمحطتي، أو إرسال خط ثانٍ من محطتي)
  const needsMe = d => (d.legs || []).some(l => {
    if (l.status === 'sent' && myIds.has(l.to_station_id)) return true
    if (l.status === 'pending') { const prev = (d.legs || []).find(x => x.leg_no === l.leg_no - 1); return prev?.status === 'received' && myIds.has(l.from_station_id) }
    return false
  })

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter(d => {
      if (scope === 'mine' && !isAdmin && !touchesMe(d)) return false
      if (scope === 'action' && !needsMe(d)) return false
      if (fStatus && d.status !== fStatus) return false
      if (fKind && d.kind !== fKind) return false
      if (s) {
        const hay = [d.ticket_no, d.created_by_name, d.note, ...(d.legs || []).flatMap(l => [names[l.from_station_id], names[l.to_station_id], l.bus_number, l.sent_by_name]), ...(d.items || []).map(i => i.description)].join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [rows, scope, fStatus, fKind, q, names, myIds, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const scoped = rows.filter(d => isAdmin || touchesMe(d))
    const todayKey = fmtDate(new Date().toISOString())
    return [
      { label: t('بانتظار إجراء منك', 'Needs your action'), val: scoped.filter(needsMe).length, tone: scoped.some(needsMe) ? 'text-amber-600' : undefined },
      { label: t('في الطريق', 'In transit'), val: scoped.filter(d => d.status !== 'received').length },
      { label: t('استُلمت اليوم', 'Received today'), val: scoped.filter(d => d.status === 'received' && fmtDate(d.closed_at) === todayKey).length, tone: 'text-green-600' },
      { label: t('طلبات إرسال مفتوحة', 'Open requests'), val: reqs.filter(r => r.status === 'open' && (isAdmin || myIds.has(r.holder_station_id))).length },
    ]
  }, [rows, reqs, isAdmin, myIds]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── الإجراءات ── */
  async function run(key, fn, okText) {
    setBusy(key)
    const { error } = await fn()
    setBusy('')
    if (error) { const m = dispatchError(error); flash('err', m === 'SETUP' ? t('شغّل ملف SQL «024_dispatches» في Supabase أولاً', 'Run the 024_dispatches SQL first') : m); return false }
    if (okText) flash('ok', okText)
    load()
    return true
  }
  const receive = leg => run('r' + leg.id, () => supabase.rpc('dispatch_leg_receive', { p_leg: leg.id }), t('تم تأكيد الاستلام وإشعار محطة الإرسال', 'Receipt confirmed; the sending station was notified'))
  const sendLeg = (leg, bus) => run('s' + leg.id, () => supabase.rpc('dispatch_leg_send', { p_leg: leg.id, p_bus: bus }), t('تم إرسال الخط الثاني وإشعار المحطة المستقبِلة', 'Second leg sent; the receiving station was notified'))
  const addNote = (d, body) => run('n' + d.id, () => supabase.rpc('dispatch_add_note', { p_dispatch: d.id, p_body: body }), t('تمت إضافة الملاحظة', 'Note added'))
  const dismissReq = (r, reason) => run('q' + r.id, () => supabase.rpc('dispatch_request_dismiss', { p_id: r.id, p_reason: reason || null }), t('تم إغلاق الطلب', 'Request closed'))
  async function removeDispatch(d) {
    setConfirm(null)
    await run('d' + d.id, () => supabase.from('dispatches').delete().eq('id', d.id), t('تم حذف الإرسالية', 'Dispatch deleted'))
  }
  async function printOne(idOrD) {
    let d = typeof idOrD === 'string' ? rows.find(x => x.id === idOrD) : idOrD
    if (!d) { const { data } = await supabase.from('dispatches').select(SELECT_D).eq('id', idOrD).maybeSingle(); d = data }
    if (!d) return
    if (!(await printDispatchSlip(d, names))) flash('err', t('المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة', 'Pop-ups are blocked — allow them to print'))
  }
  function fulfil(r) {
    setFormInit({
      kind: r.ref_type === 'report' ? 'lost' : 'found', fromId: r.holder_station_id, toId: r.to_station_id, requestId: r.id,
      items: [{ ref_type: r.ref_type === 'report' ? 'report' : 'found', ref_id: r.ref_id, description: r.item_desc || (r.ref_type === 'report' ? 'بلاغ مفقود' : 'غرض'), qty: 1 }],
    })
    setView('form')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontWeight: 700 }}>{t('جارٍ التحميل…', 'Loading…')}</div>
  if (setup) {
    return (
      <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 14px' }}>
        <Banner kind="err">
          <b>{t('قسم الإرساليات لم يُجهَّز بعد.', 'Dispatches are not set up yet.')}</b>{' '}
          {t('شغّل ملف SQL «024_dispatches» في Supabase (كتلة بكتلة بالترتيب) ثم حدّث الصفحة.', 'Run the “024_dispatches” SQL in Supabase (block by block, in order) and refresh.')}
        </Banner>
      </div>
    )
  }

  if (view === 'form') {
    return <DispatchForm profile={profile} isAr={isAr} isAdmin={isAdmin} stations={stations} myStations={myStations} initial={formInit}
      onCancel={() => { setView('list'); setFormInit(null) }} onCreated={() => load()} onPrint={printOne} />
  }

  const visible = shown.slice(0, limit)
  const openReqs = reqs.filter(r => r.status === 'open')
  const reqList = reqs.filter(r => isAdmin || myIds.has(r.holder_station_id) || myIds.has(r.to_station_id) || r.requester_id === profile?.id)

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '16px 14px 48px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      <StatStrip items={stats} />

      {/* الأدوات */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div role="tablist" style={{ display: 'inline-flex', background: 'var(--surface)', borderRadius: 10, padding: 3, gap: 2, border: '1px solid var(--border)' }}>
          {[['list', t('الإرساليات', 'Dispatches'), rows.length], ['requests', t('طلبات الإرسال', 'Send requests'), openReqs.length]].map(([id, label, n]) => (
            <button key={id} type="button" role="tab" aria-selected={sub === id} onClick={() => setSub(id)}
              style={{ border: 'none', borderRadius: 8, minHeight: 36, padding: '0 16px', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', background: sub === id ? 'var(--text-1)' : 'transparent', color: sub === id ? 'var(--card)' : 'var(--text-2)' }}>
              {label} <span style={{ fontFamily: MONO, opacity: 0.75 }}>{n}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { setFormInit(null); setView('form') }} style={{ ...btn('primary'), marginInlineStart: 'auto', padding: '10px 20px', fontSize: '0.84rem' }}>
          + {t('إرسالية جديدة', 'New dispatch')}
        </button>
      </div>

      {sub === 'list' && (
        <>
          <div style={{ ...card, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <input value={q} onChange={e => { setQ(e.target.value); setLimit(40) }} placeholder={t('بحث: رقم التذكرة، محطة، حافلة، غرض…', 'Search ticket, station, bus, item…')} style={{ ...fieldStyle, gridColumn: 'span 2' }} aria-label={t('بحث', 'Search')} />
            <SelectField value={scope} onChange={e => setScope(e.target.value)} style={fieldStyle}>
              {!isAdmin && <option value="mine">{t('إرساليات محطتي', 'My station')}</option>}
              <option value="all">{t('كل الإرساليات', 'All dispatches')}</option>
              <option value="action">{t('بانتظار إجراء مني', 'Needs my action')}</option>
            </SelectField>
            <SelectField value={fStatus} onChange={e => setFStatus(e.target.value)} style={fieldStyle}>
              <option value="">{t('كل الحالات', 'All statuses')}</option>
              {Object.entries(DISPATCH_STATUS).map(([k, m]) => <option key={k} value={k}>{isAr ? m.ar : m.en}</option>)}
            </SelectField>
            <SelectField value={fKind} onChange={e => setFKind(e.target.value)} style={fieldStyle}>
              <option value="">{t('موجودات ومفقودات', 'All types')}</option>
              {Object.entries(DISPATCH_KINDS).map(([k, m]) => <option key={k} value={k}>{isAr ? m.ar : m.en}</option>)}
            </SelectField>
          </div>

          {visible.length === 0 ? (
            <div style={{ ...card, padding: '44px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: 6 }}>{rows.length === 0 ? t('لا توجد إرساليات بعد', 'No dispatches yet') : t('لا نتائج مطابقة', 'No matching results')}</div>
              <div style={{ fontSize: '0.78rem' }}>{rows.length === 0 ? t('اضغط «إرسالية جديدة» لإصدار أول تذكرة', 'Press “New dispatch” to issue the first ticket') : t('غيّر الفلاتر أو البحث', 'Change the filters or search')}</div>
            </div>
          ) : visible.map(d => (
            <DispatchCard key={d.id} d={d} names={names} isAr={isAr} open={openId === d.id} flashing={flashId === d.id} setRef={el => { refs.current[d.id] = el }}
              onToggle={() => setOpenId(o => (o === d.id ? null : d.id))} canAct={canAct} isAdmin={isAdmin} canDelete={isGeneral} needsMe={needsMe(d)} busy={busy}
              onReceive={receive} onSend={sendLeg} onNote={addNote} onPrint={() => printOne(d)} onDelete={() => setConfirm({ d })} />
          ))}
          {shown.length > visible.length && <button type="button" onClick={() => setLimit(l => l + 40)} style={{ ...btn('ghost'), alignSelf: 'center', padding: '10px 28px' }}>{t(`عرض المزيد (${shown.length - visible.length})`, `Show more (${shown.length - visible.length})`)}</button>}
        </>
      )}

      {sub === 'requests' && (
        reqList.length === 0 ? (
          <div style={{ ...card, padding: '44px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: 6 }}>{t('لا توجد طلبات إرسال', 'No send requests')}</div>
            <div style={{ fontSize: '0.78rem' }}>{t('من «السجل والأرشيف» اضغط «طلب إرسال» على أي موجود أو بلاغ', 'From “Archive & Log”, press “Request send” on any item or report')}</div>
          </div>
        ) : reqList.map(r => (
          <RequestCard key={r.id} r={r} names={names} isAr={isAr} flashing={flashId === r.id} setRef={el => { refs.current[r.id] = el }}
            canHandle={canAct(r.holder_station_id) || r.requester_id === profile?.id} canFulfil={canAct(r.holder_station_id)} busy={busy === 'q' + r.id}
            onFulfil={() => fulfil(r)} onDismiss={reason => dismissReq(r, reason)} onOpenDispatch={() => { setSub('list'); setScope('all'); setOpenId(r.dispatch_id) }} />
        ))
      )}

      {confirm && (
        <ConfirmDialog
          message={t(`حذف الإرسالية ${confirm.d.ticket_no} نهائياً مع خطوطها وأغراضها وملاحظاتها؟ لا يمكن التراجع عن هذا الإجراء.`, `Permanently delete dispatch ${confirm.d.ticket_no} with its legs, items and notes? This cannot be undone.`)}
          confirmLabel={t('حذف نهائي', 'Delete')} cancelLabel={t('إلغاء', 'Cancel')} onConfirm={() => removeDispatch(confirm.d)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}

/* ═════════════ بطاقة إرسالية ═════════════ */
function DispatchCard({ d, names, isAr, open, flashing, setRef, onToggle, canAct, isAdmin, canDelete, needsMe, busy, onReceive, onSend, onNote, onPrint, onDelete }) {
  const t = (a, e) => (isAr ? a : e)
  const legs = sortLegs(d)
  const k = DISPATCH_KINDS[d.kind] || DISPATCH_KINDS.found
  const st = DISPATCH_STATUS[d.status] || DISPATCH_STATUS.in_transit
  const [bus2, setBus2] = useState('')
  const [note, setNote] = useState('')
  const chain = [legs[0]?.from_station_id, ...legs.map(l => l.to_station_id)].filter(Boolean)
  const last = [...legs].reverse().find(l => l.status !== 'pending')
  const lastWhen = last ? (last.status === 'received' ? last.received_at : last.sent_at) : d.created_at
  const lastWho = last ? (last.status === 'received' ? last.received_by_name : last.sent_by_name) : d.created_by_name

  return (
    <article ref={setRef} style={{ ...card, overflow: 'hidden', borderInlineStart: `4px solid ${st.color}`, boxShadow: flashing ? '0 0 0 3px rgba(37,99,235,0.45)' : undefined, transition: 'box-shadow .4s' }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ width: '100%', textAlign: 'start', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '14px 16px', display: 'block', color: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span dir="ltr" style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.02rem', color: 'var(--text-1)', letterSpacing: '.03em' }}>{d.ticket_no}</span>
          <Badge m={{ ...k, bg: k.bg }} isAr={isAr}>{isAr ? k.ar : k.en}</Badge>
          <Badge m={st} isAr={isAr} />
          {needsMe && <span style={{ fontSize: '0.68rem', fontWeight: 900, padding: '3px 10px', borderRadius: 99, background: '#d97706', color: '#fff' }}>{t('بانتظار إجراء منك', 'Needs your action')}</span>}
          <span style={{ marginInlineStart: 'auto', fontSize: '0.72rem', color: 'var(--text-3)', fontFamily: MONO }} dir="ltr">{fmtDate(d.created_at)} · {fmtTime(d.created_at)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10, fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)' }}>
          {chain.map((id, i) => (
            <span key={id + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span aria-hidden="true" style={{ color: 'var(--text-3)', opacity: legs[i - 1]?.status === 'pending' ? 0.4 : 1 }}>{isAr ? '←' : '→'}</span>}
              <span>{names[id] || '—'}</span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: '0.74rem', color: 'var(--text-3)' }}>
          <span>{t('أرسلها', 'Sent by')}: <b style={{ color: 'var(--text-2)' }}>{d.created_by_name || '—'}</b></span>
          {legs[0]?.bus_number && <span>{t('الحافلة', 'Bus')}: <b dir="ltr" style={{ color: 'var(--text-2)', fontFamily: MONO }}>{legs[0].bus_number}</b></span>}
          <span>{t('الأغراض', 'Items')}: <b style={{ color: 'var(--text-2)' }}>{(d.items || []).reduce((a, i) => a + (i.qty || 1), 0)}</b></span>
          {last && <span>{t('آخر حركة', 'Last')}: <b style={{ color: 'var(--text-2)' }}>{lastWho || '—'}</b> <span dir="ltr" style={{ fontFamily: MONO }}>{fmtTime(lastWhen)}</span></span>}
          {(d.notes || []).length > 0 && <span style={{ color: '#d97706', fontWeight: 800 }}>{t(`${d.notes.length} ملاحظة`, `${d.notes.length} note(s)`)}</span>}
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  {l.status !== 'pending' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 10 }}>
                      <Meta label={t('من أرسل', 'Sent by')}>{l.sent_by_name || '—'}</Meta>
                      <Meta label={t('رقم الحافلة', 'Bus')}><span dir="ltr" style={{ fontFamily: MONO }}>{l.bus_number || '—'}</span></Meta>
                      <Meta label={t('تاريخ الإرسال', 'Date')}><span dir="ltr" style={{ fontFamily: MONO }}>{fmtDate(l.sent_at)}</span></Meta>
                      <Meta label={t('وقت الإرسال (24س)', 'Time (24h)')}><span dir="ltr" style={{ fontFamily: MONO }}>{fmtTime(l.sent_at)}</span></Meta>
                      {l.status === 'received' && <>
                        <Meta label={t('من استلم', 'Received by')}>{l.received_by_name || '—'}</Meta>
                        <Meta label={t('تاريخ الاستلام', 'Received on')}><span dir="ltr" style={{ fontFamily: MONO }}>{fmtDate(l.received_at)}</span></Meta>
                        <Meta label={t('وقت الاستلام (24س)', 'Received at')}><span dir="ltr" style={{ fontFamily: MONO }}>{fmtTime(l.received_at)}</span></Meta>
                      </>}
                    </div>
                  )}
                  {l.status === 'pending' && !canSendThis && <div style={{ marginTop: 8, fontSize: '0.74rem', color: 'var(--text-3)' }}>{prev?.status === 'received' ? t('بانتظار إرسالها من محطة التحويل', 'Waiting to be forwarded by the transfer station') : t('تبدأ بعد استلام الخط الأول', 'Starts after the first leg is received')}</div>}
                  {canRecvThis && (
                    <button type="button" disabled={busy === 'r' + l.id} onClick={() => onReceive(l)} style={{ ...btn('ok'), marginTop: 12, padding: '10px 22px', fontSize: '0.84rem' }}>
                      {busy === 'r' + l.id ? t('جارٍ التأكيد…', 'Confirming…') : t('تأكيد الاستلام', 'Confirm receipt')}
                    </button>
                  )}
                  {canSendThis && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
                      <div style={{ width: 150 }}>
                        <label style={{ display: 'block', fontSize: '0.66rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 4 }}>{t('رقم الحافلة *', 'Bus number *')}</label>
                        <input value={bus2} onChange={e => setBus2(e.target.value)} dir="ltr" placeholder="4521" style={{ ...fieldStyle, fontFamily: MONO, fontWeight: 800 }} />
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
            <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-3)', marginBottom: 6 }}>{t('الأغراض', 'Items')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(d.items || []).map(i => (
                <span key={i.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, background: 'var(--card)', border: '1px solid var(--border)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)' }}>
                  {i.description}{i.qty > 1 && <b dir="ltr" style={{ fontFamily: MONO, color: '#2563eb' }}>×{i.qty}</b>}
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
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', marginTop: 4 }}>{n.author_name} · <span dir="ltr" style={{ fontFamily: MONO }}>{fmtStamp(n.created_at)}</span></div>
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
            {canDelete && <button type="button" onClick={onDelete} disabled={busy === 'd' + d.id} style={{ ...btn('danger'), marginInlineStart: 'auto' }}>{t('حذف', 'Delete')}</button>}
          </div>
        </div>
      )}
    </article>
  )
}

/* ═════════════ بطاقة طلب إرسال ═════════════ */
function RequestCard({ r, names, isAr, flashing, setRef, canHandle, canFulfil, busy, onFulfil, onDismiss, onOpenDispatch }) {
  const t = (a, e) => (isAr ? a : e)
  const [closing, setClosing] = useState(false)
  const [reason, setReason] = useState('')
  const sm = REQUEST_STATUS[r.status] || REQUEST_STATUS.open
  return (
    <article ref={setRef} style={{ ...card, padding: '14px 16px', borderInlineStart: `4px solid ${sm.color}`, boxShadow: flashing ? '0 0 0 3px rgba(37,99,235,0.45)' : undefined, transition: 'box-shadow .4s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 900, fontSize: '0.95rem', color: 'var(--text-1)' }}>{r.item_desc}</span>
        <Badge m={{ color: r.ref_type === 'report' ? '#d97706' : '#16a34a', bg: r.ref_type === 'report' ? 'rgba(217,119,6,0.15)' : 'rgba(22,163,74,0.14)' }} isAr={isAr}>{r.ref_type === 'report' ? t('بلاغ مفقود', 'Lost report') : t('موجود', 'Found item')}</Badge>
        <Badge m={sm} isAr={isAr} />
        <span style={{ marginInlineStart: 'auto', fontSize: '0.72rem', color: 'var(--text-3)', fontFamily: MONO }} dir="ltr">{fmtDate(r.created_at)} · {fmtTime(r.created_at)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
        <Meta label={t('الغرض موجود في', 'Held at')}>{names[r.holder_station_id] || '—'}</Meta>
        <Meta label={t('المطلوب إرساله إلى', 'Send to')}>{names[r.to_station_id] || '—'}</Meta>
        <Meta label={t('طلبه', 'Requested by')}>{r.requester_name || '—'}{r.requester_station_id ? ` · ${names[r.requester_station_id] || ''}` : ''}</Meta>
        {r.handled_at && <Meta label={t('عولج بواسطة', 'Handled by')}>{r.handled_by_name || '—'} · <span dir="ltr" style={{ fontFamily: MONO }}>{fmtStamp(r.handled_at)}</span></Meta>}
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
