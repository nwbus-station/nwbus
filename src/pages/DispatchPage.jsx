// الإرساليات والشحن: قسم مستقل — الواردة للمحطة، الصادرة منها، استلام (من البطاقة أو برقم التذكرة)، تصعيد، وطلبات الإرسال من الموجودات.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SelectField from '../components/shared/SelectField'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import DispatchForm from '../components/dispatch/DispatchForm'
import { DispatchCard, RequestCard, btn } from '../components/dispatch/DispatchCards'
import { ReceiveDialog, EscalateDialog, TicketLookupDialog } from '../components/dispatch/DispatchDialogs'
import { Banner, card, fieldStyle, MONO } from '../components/lostFound/ui'
import { DISPATCH_KINDS, dispatchError } from '../utils/dispatch'
import { printDispatchSlip } from '../utils/dispatchSlip'

const SELECT_D = '*, legs:dispatch_legs(*), items:dispatch_items(*), notes:dispatch_notes(*)'
const TicketIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9a2 2 0 002-2V5h12v2a2 2 0 002 2v6a2 2 0 00-2 2v2H6v-2a2 2 0 00-2-2z" /><path d="M9 10h6M9 14h4" /></svg>

export default function DispatchPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const t = (a, e) => (isAr ? a : e)
  const { profile, isGeneralAdmin, workStations } = useAuth()
  const isAdmin = !!isGeneralAdmin
  const isGeneral = profile?.role === 'general_admin'
  const [params, setParams] = useSearchParams()

  const [stations, setStations] = useState([])
  const [rows, setRows] = useState([])
  const [reqs, setReqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [setup, setSetup] = useState(false)
  const [tab, setTab] = useState(() => (params.get('tab') === 'requests' ? 'requests' : (isAdmin ? 'all' : 'in')))   // in | out | all | requests
  const [view, setView] = useState('list')          // list | form
  const [formInit, setFormInit] = useState(null)
  const [stationSel, setStationSel] = useState('')  // '' = كل محطاتي (أو كل المحطات للأدمن)
  const [chip, setChip] = useState('')              // '' | recv | send | late | urgent | done
  const [fKind, setFKind] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [flashId, setFlashId] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [limit, setLimit] = useState(40)
  const [confirm, setConfirm] = useState(null)
  const [recvDlg, setRecvDlg] = useState(null)      // { d, leg }
  const [escDlg, setEscDlg] = useState(null)        // d
  const [lookupOpen, setLookupOpen] = useState(false)
  const refs = useRef({})
  const pending = useRef(null)                      // رابط/رمز بانتظار تحميل البيانات

  const names = useMemo(() => Object.fromEntries(stations.map(s => [s.id, s.name_ar || s.name_en])), [stations])
  const myIds = useMemo(() => new Set([profile?.station_id, ...(workStations || []).map(s => s.id)].filter(Boolean)), [profile?.station_id, workStations])
  const myStations = useMemo(() => stations.filter(s => myIds.has(s.id)), [stations, myIds])
  const canAct = id => isAdmin || myIds.has(id)
  const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 6000) }

  // نطاق المحطات المعروضة: المختارة، وإلا محطاتي، وللأدمن كل المحطات
  const scopeSet = useMemo(() => {
    if (stationSel) return new Set([stationSel])
    if (isAdmin) return new Set(stations.map(s => s.id))
    return myIds
  }, [stationSel, isAdmin, stations, myIds])

  const load = useCallback(async () => {
    const [d, r, s] = await Promise.all([
      supabase.from('dispatches').select(SELECT_D).order('created_at', { ascending: false }).limit(500),
      supabase.from('dispatch_requests').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('stations').select('id, name_ar, name_en').order('name_ar'),
    ])
    if (d.error) { setSetup(dispatchError(d.error) === 'SETUP'); setLoading(false); return }
    setSetup(false)
    setRows(d.data ?? []); setReqs(r.data ?? []); setStations(s.data ?? []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('dispatch_page_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_legs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_notes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_requests' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])
  // تصعيد المتأخر تلقائياً (آمن ومتكرر: لا يكرر الإشعارات)
  useEffect(() => {
    const run = () => supabase.rpc('dispatch_escalate_overdue', { p_l1: 8, p_l2: 24 }).then(() => {}, () => {})
    run()
    const id = setInterval(run, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const legsOf = d => d.legs || []
  const needsRecv = d => legsOf(d).some(l => l.status === 'sent' && scopeSet.has(l.to_station_id) && (isAdmin || myIds.has(l.to_station_id)))
  const needsSend = d => legsOf(d).some(l => l.status === 'pending' && legsOf(d).find(x => x.leg_no === l.leg_no - 1)?.status === 'received' && scopeSet.has(l.from_station_id) && (isAdmin || myIds.has(l.from_station_id)))
  const inScope = d => legsOf(d).some(l => scopeSet.has(l.to_station_id))
  const outScope = d => legsOf(d).some(l => scopeSet.has(l.from_station_id))
  const touchScope = d => inScope(d) || outScope(d)
  const isLate = d => d.status !== 'received' && d.escalation_level > 0

  /* ── فتح إرسالية من رابط/QR/تذكرة ── */
  const focusDispatch = useCallback(async (code, auto) => {
    let d = rows.find(x => (code.id && x.id === code.id) || (code.ticket && x.ticket_no === code.ticket))
    if (!d) {
      const qy = supabase.from('dispatches').select(SELECT_D)
      const { data } = code.id ? await qy.eq('id', code.id).maybeSingle() : await qy.eq('ticket_no', code.ticket).maybeSingle()
      d = data
    }
    if (!d) { flash('err', t('لم أجد إرسالية بهذا الرمز', 'No dispatch found for this code')); return }
    const toMe = legsOf(d).some(l => myIds.has(l.to_station_id))
    setView('list'); setStationSel(''); setChip(''); setFKind(''); setQ('')
    setTab(isAdmin ? 'all' : toMe ? 'in' : 'out')
    setOpenId(d.id); setFlashId(d.id)
    setTimeout(() => { refs.current[d.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => setFlashId(null), 2500) }, 250)
    const leg = legsOf(d).find(l => l.status === 'sent' && canAct(l.to_station_id))
    if (auto && leg) setRecvDlg({ d, leg })
    else if (auto && d.status === 'received') flash('ok', t('هذه الإرسالية مستلمة مسبقاً', 'This dispatch was already received'))
    else if (auto && !leg) flash('err', t('هذه الإرسالية ليست موجّهة لمحطتك للاستلام', 'This dispatch is not addressed to your station'))
  }, [rows, myIds, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = params.get('d')
    if (id && !pending.current) pending.current = { code: { id }, auto: params.get('r') === '1' }
    if (!loading && pending.current) {
      const { code, auto } = pending.current
      pending.current = null
      focusDispatch(code, auto)
      setParams({}, { replace: true })
    }
  }, [params, loading, focusDispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── الإجراءات ── */
  async function run(key, fn, okText) {
    setBusy(key)
    const { error } = await fn()
    setBusy('')
    if (error) { const m = dispatchError(error); flash('err', m === 'SETUP' ? t('شغّل ملفات SQL «024» ثم «025_dispatches_v2» في Supabase أولاً', 'Run the 024 and 025 SQL files first') : m); return false }
    if (okText) flash('ok', okText)
    load()
    return true
  }
  async function doReceive(cond, note) {
    const { leg } = recvDlg
    const ok = await run('r' + leg.id, () => supabase.rpc('dispatch_leg_receive', { p_leg: leg.id, p_condition: cond, p_note: note || null }),
      cond === 'issue' ? t('تم الاستلام وتصعيد الملاحظة للإدارة', 'Received; the issue was escalated') : t('تم تأكيد الاستلام وإشعار محطة الإرسال', 'Receipt confirmed; the sending station was notified'))
    if (ok) setRecvDlg(null)
  }
  const sendLeg = (leg, bus) => run('s' + leg.id, () => supabase.rpc('dispatch_leg_send', { p_leg: leg.id, p_bus: bus }), t('تم إرسال الخط الثاني وإشعار المحطة المستقبِلة', 'Second leg sent'))
  const addNote = (d, body) => run('n' + d.id, () => supabase.rpc('dispatch_add_note', { p_dispatch: d.id, p_body: body }), t('تمت إضافة الملاحظة', 'Note added'))
  const dismissReq = (r, reason) => run('q' + r.id, () => supabase.rpc('dispatch_request_dismiss', { p_id: r.id, p_reason: reason || null }), t('تم إغلاق الطلب', 'Request closed'))
  async function doEscalate(reason) {
    const ok = await run('e' + escDlg.id, () => supabase.rpc('dispatch_escalate_manual', { p_dispatch: escDlg.id, p_reason: reason }), t('تم التصعيد وإشعار الإدارة والمشرفين', 'Escalated; management was notified'))
    if (ok) setEscDlg(null)
  }
  async function removeDispatch(d) {
    setConfirm(null)
    await run('d' + d.id, () => supabase.from('dispatches').delete().eq('id', d.id), t('تم حذف الإرسالية', 'Dispatch deleted'))
  }
  async function printOne(idOrD) {
    let d = typeof idOrD === 'string' ? rows.find(x => x.id === idOrD) : idOrD
    if (!d) { const { data } = await supabase.from('dispatches').select(SELECT_D).eq('id', idOrD).maybeSingle(); d = data }
    if (!d) return
    if (!(await printDispatchSlip(d, names))) flash('err', t('المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة', 'Pop-ups are blocked'))
  }
  function fulfil(r) {
    setFormInit({
      kind: r.ref_type === 'report' ? 'lost' : 'found', fromId: r.holder_station_id, toId: r.to_station_id, requestId: r.id,
      items: [{ ref_type: r.ref_type === 'report' ? 'report' : 'found', ref_id: r.ref_id, description: r.item_desc || (r.ref_type === 'report' ? 'بلاغ مفقود' : 'غرض'), qty: 1 }],
    })
    setView('form')
  }

  /* ── القوائم والمؤشرات ── */
  const baseList = useMemo(() => {
    if (tab === 'in') return rows.filter(inScope)
    if (tab === 'out') return rows.filter(outScope)
    return rows.filter(d => isAdmin ? (stationSel ? touchScope(d) : true) : touchScope(d))
  }, [rows, tab, scopeSet, stationSel, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = baseList.filter(d => {
      if (chip === 'recv' && !needsRecv(d)) return false
      if (chip === 'send' && !needsSend(d)) return false
      if (chip === 'late' && !isLate(d)) return false
      if (chip === 'urgent' && !(d.priority === 'urgent' && d.status !== 'received')) return false
      if (chip === 'done' && d.status !== 'received') return false
      if (fKind && d.kind !== fKind) return false
      if (s) {
        const hay = [d.ticket_no, d.created_by_name, d.note, d.recipient_name, d.sender_name, ...(d.legs || []).flatMap(l => [names[l.from_station_id], names[l.to_station_id], l.bus_number, l.sent_by_name]), ...(d.items || []).map(i => i.description)].join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
    // الأهم أولاً: بانتظار الاستلام/الإرسال، ثم المتأخرة، ثم الأحدث
    const w = d => (needsRecv(d) ? 0 : needsSend(d) ? 1 : isLate(d) ? 2 : d.status !== 'received' ? 3 : 4)
    return out.sort((a, b) => w(a) - w(b) || new Date(b.created_at) - new Date(a.created_at))
  }, [baseList, chip, fKind, q, names, scopeSet]) // eslint-disable-line react-hooks/exhaustive-deps

  const kpi = useMemo(() => {
    const sc = rows.filter(touchScope)
    return {
      recv: sc.filter(needsRecv).length,
      out: sc.filter(d => outScope(d) && d.status !== 'received').length,
      send: sc.filter(needsSend).length,
      late: sc.filter(isLate).length,
      req: reqs.filter(r => r.status === 'open' && (isAdmin ? (!stationSel || r.holder_station_id === stationSel) : myIds.has(r.holder_station_id))).length,
    }
  }, [rows, reqs, scopeSet, isAdmin, stationSel, myIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const reqList = reqs.filter(r => isAdmin || myIds.has(r.holder_station_id) || myIds.has(r.to_station_id) || r.requester_id === profile?.id)

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)', fontWeight: 700 }}>{t('جارٍ التحميل…', 'Loading…')}</div>
  if (setup) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 14px' }}>
        <Banner kind="err"><b>{t('قسم الإرساليات لم يُجهَّز بعد.', 'Dispatches are not set up yet.')}</b> {t('شغّل ملفي SQL «024_dispatches» ثم «025_dispatches_v2» في Supabase (كتلة بكتلة بالترتيب) ثم حدّث الصفحة.', 'Run the 024 and 025 SQL files in Supabase and refresh.')}</Banner>
      </div>
    )
  }
  if (view === 'form') {
    return <DispatchForm profile={profile} isAr={isAr} isAdmin={isAdmin} stations={stations} myStations={myStations} history={rows} initial={formInit}
      onCancel={() => { setView('list'); setFormInit(null) }} onCreated={() => load()} onPrint={printOne} />
  }

  const visible = shown.slice(0, limit)
  const tabs = [['in', t('الواردة', 'Incoming'), rows.filter(inScope).length], ['out', t('الصادرة', 'Outgoing'), rows.filter(outScope).length], ...(isAdmin ? [['all', t('الكل', 'All'), rows.length]] : []), ['requests', t('طلبات الإرسال', 'Requests'), kpi.req]]
  const kpis = [
    { key: 'recv', label: t('بانتظار استلامك', 'To receive'), val: kpi.recv, tone: '#d97706', go: () => { setTab('in'); setChip('recv') } },
    { key: 'send', label: t('بانتظار إرسالك', 'To forward'), val: kpi.send, tone: '#d97706', go: () => { setTab('out'); setChip('send') } },
    { key: 'out', label: t('صادرة في الطريق', 'Outgoing in transit'), val: kpi.out, tone: '#2563eb', go: () => { setTab('out'); setChip('') } },
    { key: 'late', label: t('متأخرة / مُصعّدة', 'Overdue / escalated'), val: kpi.late, tone: '#dc2626', go: () => { setTab(isAdmin ? 'all' : 'in'); setChip('late') } },
    { key: 'req', label: t('طلبات إرسال مفتوحة', 'Open requests'), val: kpi.req, tone: '#7c3aed', go: () => setTab('requests') },
  ]
  const chips = [['', t('الكل', 'All')], ['recv', t('بانتظار الاستلام', 'To receive')], ['send', t('بانتظار الإرسال', 'To forward')], ['late', t('متأخرة', 'Overdue')], ['urgent', t('عاجلة', 'Urgent')], ['done', t('مستلمة', 'Received')]]
  const stationOptions = isAdmin ? stations : myStations

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '18px 14px 56px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* الرأس */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-1)' }}>{t('الإرساليات والشحن', 'Dispatches & Shipping')}</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--text-3)' }}>{t('نقل الموجودات والمفقودات والشحنات بين المحطات — تتبّع واستلام وتصعيد', 'Move items and shipments between stations — track, receive, escalate')}</p>
        </div>
        {stationOptions.length > 1 && (
          <div style={{ width: 210 }}>
            <SelectField value={stationSel} onChange={e => setStationSel(e.target.value)} style={fieldStyle}>
              <option value="">{isAdmin ? t('كل المحطات', 'All stations') : t('كل محطاتي', 'All my stations')}</option>
              {stationOptions.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en}</option>)}
            </SelectField>
          </div>
        )}
        <button type="button" onClick={() => setLookupOpen(true)} style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: '0.84rem' }}><TicketIcon />{t('استلام برقم التذكرة', 'Receive by ticket')}</button>
        <button type="button" onClick={() => { setFormInit(null); setView('form') }} style={{ ...btn('primary'), padding: '10px 20px', fontSize: '0.86rem' }}>+ {t('إرسالية / شحنة جديدة', 'New dispatch / shipment')}</button>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* المؤشرات */}
      <div style={{ display: 'flex', flexWrap: 'wrap', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {kpis.map((k, i) => (
          <button key={k.key} type="button" onClick={k.go} style={{ flex: '1 1 140px', padding: '12px 14px', border: 'none', borderInlineStart: i ? '1px solid var(--border)' : 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
            <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.35rem', color: k.val ? k.tone : 'var(--text-3)', lineHeight: 1.2 }}>{k.val}</div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginTop: 3 }}>{k.label}</div>
          </button>
        ))}
      </div>

      {/* التبويبات */}
      <div role="tablist" style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 12, padding: 4, border: '1px solid var(--border)', overflowX: 'auto' }}>
        {tabs.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setLimit(40) }}
            style={{ flex: '1 0 auto', border: 'none', borderRadius: 9, minHeight: 42, padding: '0 18px', fontFamily: 'inherit', fontWeight: 900, fontSize: '0.88rem', cursor: 'pointer', whiteSpace: 'nowrap', background: tab === id ? 'var(--text-1)' : 'transparent', color: tab === id ? 'var(--card)' : 'var(--text-2)' }}>
            {label} <span style={{ fontFamily: MONO, opacity: 0.7, fontSize: '0.76rem' }}>{n}</span>
          </button>
        ))}
      </div>

      {tab !== 'requests' && (
        <>
          <div style={{ ...card, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
              <input value={q} onChange={e => { setQ(e.target.value); setLimit(40) }} placeholder={t('بحث: رقم التذكرة، محطة، حافلة، غرض، مستلِم…', 'Search ticket, station, bus, item, recipient…')} style={{ ...fieldStyle, gridColumn: 'span 2' }} aria-label={t('بحث', 'Search')} />
              <SelectField value={fKind} onChange={e => setFKind(e.target.value)} style={fieldStyle}>
                <option value="">{t('كل الأنواع', 'All types')}</option>
                {Object.entries(DISPATCH_KINDS).map(([k, m]) => <option key={k} value={k}>{isAr ? m.ar : m.en}</option>)}
              </SelectField>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {chips.map(([id, label]) => (
                <button key={id} type="button" aria-pressed={chip === id} onClick={() => { setChip(id); setLimit(40) }}
                  style={{ padding: '6px 14px', borderRadius: 99, border: `1px solid ${chip === id ? 'var(--text-1)' : 'var(--border)'}`, background: chip === id ? 'var(--text-1)' : 'var(--card)', color: chip === id ? 'var(--card)' : 'var(--text-2)', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div style={{ ...card, padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
              <div style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-2)', marginBottom: 6 }}>
                {rows.length === 0 ? t('لا توجد إرساليات بعد', 'No dispatches yet') : tab === 'in' ? t('لا توجد إرساليات واردة', 'No incoming dispatches') : tab === 'out' ? t('لا توجد إرساليات صادرة', 'No outgoing dispatches') : t('لا نتائج مطابقة', 'No matching results')}
              </div>
              <div style={{ fontSize: '0.78rem' }}>{rows.length === 0 ? t('اضغط «إرسالية / شحنة جديدة» لإصدار أول تذكرة', 'Create the first ticket') : t('غيّر الفلاتر أو المحطة المختارة', 'Change the filters or station')}</div>
            </div>
          ) : visible.map(d => (
            <DispatchCard key={d.id} d={d} names={names} isAr={isAr} open={openId === d.id} flashing={flashId === d.id} setRef={el => { refs.current[d.id] = el }}
              onToggle={() => setOpenId(o => (o === d.id ? null : d.id))} stationSet={scopeSet} myIds={myIds} isAdmin={isAdmin} canDelete={isGeneral} busy={busy}
              onReceive={leg => setRecvDlg({ d, leg })} onSend={sendLeg} onNote={addNote} onPrint={() => printOne(d)} onDelete={() => setConfirm({ d })} onEscalate={setEscDlg} />
          ))}
          {shown.length > visible.length && <button type="button" onClick={() => setLimit(l => l + 40)} style={{ ...btn('ghost'), alignSelf: 'center', padding: '10px 28px' }}>{t(`عرض المزيد (${shown.length - visible.length})`, `Show more (${shown.length - visible.length})`)}</button>}
        </>
      )}

      {tab === 'requests' && (
        reqList.length === 0 ? (
          <div style={{ ...card, padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-2)', marginBottom: 6 }}>{t('لا توجد طلبات إرسال', 'No send requests')}</div>
            <div style={{ fontSize: '0.78rem' }}>{t('من قسم الموجودات (السجل والأرشيف) اضغط «طلب إرسال» على أي موجود أو بلاغ', 'From Lost & Found (Archive) press “Request send” on any item or report')}</div>
          </div>
        ) : reqList.map(r => (
          <RequestCard key={r.id} r={r} names={names} isAr={isAr} flashing={flashId === r.id} setRef={el => { refs.current[r.id] = el }}
            canHandle={canAct(r.holder_station_id) || r.requester_id === profile?.id} canFulfil={canAct(r.holder_station_id)} busy={busy === 'q' + r.id}
            onFulfil={() => fulfil(r)} onDismiss={reason => dismissReq(r, reason)} onOpenDispatch={() => { setTab(isAdmin ? 'all' : 'out'); setOpenId(r.dispatch_id) }} />
        ))
      )}

      {recvDlg && <ReceiveDialog d={recvDlg.d} leg={recvDlg.leg} names={names} isAr={isAr} busy={busy === 'r' + recvDlg.leg.id} onConfirm={doReceive} onClose={() => setRecvDlg(null)} />}
      {escDlg && <EscalateDialog d={escDlg} isAr={isAr} busy={busy === 'e' + escDlg.id} onConfirm={doEscalate} onClose={() => setEscDlg(null)} />}
      {lookupOpen && <TicketLookupDialog isAr={isAr} onClose={() => setLookupOpen(false)} onCode={code => { setLookupOpen(false); focusDispatch(code, true) }} />}
      {confirm && (
        <ConfirmDialog
          message={t(`حذف الإرسالية ${confirm.d.ticket_no} نهائياً مع خطوطها وأغراضها وملاحظاتها؟ لا يمكن التراجع عن هذا الإجراء.`, `Permanently delete dispatch ${confirm.d.ticket_no}? This cannot be undone.`)}
          confirmLabel={t('حذف نهائي', 'Delete')} cancelLabel={t('إلغاء', 'Cancel')} onConfirm={() => removeDispatch(confirm.d)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
