// الإرساليات والشحن: واجهة برنامج بملء الشاشة — قائمة جانبية، قائمة إرساليات، لوحة تفاصيل، ودوك سفلي للجوال.
import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SelectField from '../components/shared/SelectField'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import DispatchForm from '../components/dispatch/DispatchForm'
import { DispatchDetail, RequestCard, btn } from '../components/dispatch/DispatchCards'
import { DispatchRow, RequestRow } from '../components/dispatch/DispatchRows'
import { ReceiveDialog, RejectDialog, EscalateDialog, TicketLookupDialog } from '../components/dispatch/DispatchDialogs'
import { Banner, fieldStyle, MONO } from '../components/lostFound/ui'
import { DISPATCH_KINDS, dispatchError, isActiveDispatch } from '../utils/dispatch'
import { printDispatchSlip } from '../utils/dispatchSlip'

const SELECT_D = '*, legs:dispatch_legs(*), items:dispatch_items(*), notes:dispatch_notes(*)'
const ICON = {
  in: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z'],
  out: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  all: ['M8 6h13M8 12h13M8 18h13', 'M3 6h.01M3 12h.01M3 18h.01'],
  action: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
  late: ['M12 2a10 10 0 100 20 10 10 0 000-20z', 'M12 6v6l4 2'],
  urgent: ['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4M12 17h.01'],
  done: ['M22 11.08V12a10 10 0 11-5.93-9.14', 'M22 4L12 14.01l-3-3'],
  rejected: ['M12 2a10 10 0 100 20 10 10 0 000-20z', 'M15 9l-6 6M9 9l6 6'],
  requests: ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6M16 13H8M16 17H8'],
  plus: ['M12 5v14M5 12h14'],
  ticket: ['M4 9a2 2 0 002-2V5h12v2a2 2 0 002 2v6a2 2 0 00-2 2v2H6v-2a2 2 0 00-2-2z', 'M9 10h6M9 14h4'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  back: ['M9 18l6-6-6-6'],
  box: ['M21 8l-9-5-9 5v8l9 5 9-5V8z', 'M3 8l9 5 9-5M12 13v8'],
}
const Ico = ({ n, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    {ICON[n].map((d, i) => <path key={i} d={d} />)}
  </svg>
)
function useMedia(q) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q), h = e => setM(e.matches)
    mq.addEventListener('change', h); setM(mq.matches)
    return () => mq.removeEventListener('change', h)
  }, [q])
  return m
}

export default function DispatchPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const t = (a, e) => (isAr ? a : e)
  const { profile, isGeneralAdmin, workStations } = useAuth()
  const isAdmin = !!isGeneralAdmin
  const isGeneral = profile?.role === 'general_admin'
  // الرفض للمشرفين (محطة/وردية/منطقة) والأدمن فقط — الموظف العادي يستلم ولا يرفض (والخادم يتحقق أيضاً)
  const canReject = isAdmin || ['station_admin', 'shift_supervisor', 'area_supervisor'].includes(profile?.role) || profile?.display_role === 'area_supervisor'
  const [params, setParams] = useSearchParams()

  const isThree = useMedia('(min-width: 1100px)')
  const hasSide = useMedia('(min-width: 760px)')
  const layout = isThree ? 'three' : hasSide ? 'two' : 'one'

  const [stations, setStations] = useState([])
  const [rows, setRows] = useState([])
  const [reqs, setReqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [setup, setSetup] = useState(false)
  const [section, setSection] = useState(() => (params.get('tab') === 'requests' ? 'requests' : (isAdmin ? 'all' : 'in')))
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState('list')            // list | form
  const [formInit, setFormInit] = useState(null)
  const [stationSel, setStationSel] = useState('')
  const [fKind, setFKind] = useState('')
  const [q, setQ] = useState('')
  const [flashId, setFlashId] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [limit, setLimit] = useState(60)
  const [confirm, setConfirm] = useState(null)
  const [recvDlg, setRecvDlg] = useState(null)
  const [rejDlg, setRejDlg] = useState(null)
  const [escDlg, setEscDlg] = useState(null)
  const [lookupOpen, setLookupOpen] = useState(false)
  const [sheet, setSheet] = useState(false)
  const refs = useRef({})
  const pending = useRef(null)
  const rootRef = useRef(null)
  const [top, setTop] = useState(0)

  // ملء الشاشة: ارتفاع الواجهة = الشاشة − ما فوقها (شريط التطبيق)
  useLayoutEffect(() => {
    const m = () => { const el = rootRef.current; if (el) setTop(Math.round(el.getBoundingClientRect().top + window.scrollY)) }
    m(); window.addEventListener('resize', m)
    return () => window.removeEventListener('resize', m)
  })

  const names = useMemo(() => Object.fromEntries(stations.map(s => [s.id, s.name_ar || s.name_en])), [stations])
  const myIds = useMemo(() => new Set([profile?.station_id, ...(workStations || []).map(s => s.id)].filter(Boolean)), [profile?.station_id, workStations])
  const myStations = useMemo(() => stations.filter(s => myIds.has(s.id)), [stations, myIds])
  const canAct = id => isAdmin || myIds.has(id)
  const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 6000) }

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
  const isLate = d => isActiveDispatch(d) && d.escalation_level > 0

  /* ── فتح إرسالية من رابط/إشعار/رقم تذكرة ── */
  const focusDispatch = useCallback(async (code, auto) => {
    let d = rows.find(x => (code.id && x.id === code.id) || (code.ticket && x.ticket_no === code.ticket))
    if (!d) {
      const qy = supabase.from('dispatches').select(SELECT_D)
      const { data } = code.id ? await qy.eq('id', code.id).maybeSingle() : await qy.eq('ticket_no', code.ticket).maybeSingle()
      d = data
    }
    if (!d) { flash('err', t('لم أجد إرسالية بهذا الرمز', 'No dispatch found for this code')); return }
    const toMe = legsOf(d).some(l => myIds.has(l.to_station_id))
    setView('list'); setStationSel(''); setFKind(''); setQ('')
    setSection(isAdmin ? 'all' : toMe ? 'in' : 'out')
    setSelectedId(d.id); setFlashId(d.id)
    setTimeout(() => { refs.current[d.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => setFlashId(null), 2500) }, 300)
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
    if (error) { const m = dispatchError(error); flash('err', m === 'SETUP' ? t('شغّل ملفات SQL «024» ثم «025» ثم «026» في Supabase أولاً', 'Run the 024/025/026 SQL files first') : m); return false }
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
  async function doReject(reason) {
    const { leg } = rejDlg
    const ok = await run('j' + leg.id, () => supabase.rpc('dispatch_leg_reject', { p_leg: leg.id, p_reason: reason }), t('تم رفض الإرسالية وإشعار المحطة المرسِلة والإدارة', 'Rejected; the sending station and management were notified'))
    if (ok) setRejDlg(null)
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
    const ok = await run('d' + d.id, () => supabase.from('dispatches').delete().eq('id', d.id), t('تم حذف الإرسالية', 'Dispatch deleted'))
    if (ok) setSelectedId(null)
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
  const newDispatch = () => { setFormInit(null); setView('form'); setSheet(false) }

  /* ── الأقسام والقوائم ── */
  const baseFor = useCallback(sec => {
    const touch = rows.filter(touchScope)
    switch (sec) {
      case 'in': return rows.filter(inScope)
      case 'out': return rows.filter(outScope)
      case 'all': return stationSel ? touch : rows
      case 'action': return touch.filter(d => needsRecv(d) || needsSend(d))
      case 'late': return touch.filter(isLate)
      case 'urgent': return touch.filter(d => d.priority === 'urgent' && isActiveDispatch(d))
      case 'done': return touch.filter(d => d.status === 'received')
      case 'rejected': return touch.filter(d => d.status === 'rejected')
      default: return []
    }
  }, [rows, scopeSet, stationSel, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const reqList = useMemo(() => reqs.filter(r => isAdmin || myIds.has(r.holder_station_id) || myIds.has(r.to_station_id) || r.requester_id === profile?.id), [reqs, isAdmin, myIds, profile?.id])
  const openReqs = reqList.filter(r => r.status === 'open' && (!stationSel || r.holder_station_id === stationSel)).length

  const counts = useMemo(() => {
    const o = {}
    ;['in', 'out', 'all', 'action', 'late', 'urgent', 'done', 'rejected'].forEach(s => { o[s] = baseFor(s).length })
    o.recv = rows.filter(touchScope).filter(needsRecv).length
    o.send = rows.filter(touchScope).filter(needsSend).length
    o.requests = openReqs
    return o
  }, [baseFor, rows, openReqs]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    if (section === 'requests') return []
    const s = q.trim().toLowerCase()
    const out = baseFor(section).filter(d => {
      if (fKind && d.kind !== fKind) return false
      if (s) {
        const hay = [d.ticket_no, d.created_by_name, d.note, d.recipient_name, d.sender_name, ...(d.legs || []).flatMap(l => [names[l.from_station_id], names[l.to_station_id], l.bus_number, l.sent_by_name]), ...(d.items || []).map(i => i.description)].join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
    const w = d => (needsRecv(d) ? 0 : needsSend(d) ? 1 : isLate(d) ? 2 : isActiveDispatch(d) ? 3 : 4)
    return out.sort((a, b) => w(a) - w(b) || new Date(b.created_at) - new Date(a.created_at))
  }, [section, baseFor, fKind, q, names]) // eslint-disable-line react-hooks/exhaustive-deps

  const reqRows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return reqList.filter(r => (!stationSel || r.holder_station_id === stationSel || r.to_station_id === stationSel) && (!s || [r.item_desc, r.requester_name, names[r.holder_station_id], names[r.to_station_id]].join(' ').toLowerCase().includes(s)))
  }, [reqList, q, stationSel, names])

  const selDispatch = section !== 'requests' ? rows.find(d => d.id === selectedId) : null
  const selReq = section === 'requests' ? reqs.find(r => r.id === selectedId) : null
  const hasSel = !!(selDispatch || selReq)

  const NAV = [
    { id: 'in', ico: 'in', label: t('الواردة', 'Incoming'), n: counts.in, hot: counts.recv, hotColor: '#d97706' },
    { id: 'out', ico: 'out', label: t('الصادرة', 'Outgoing'), n: counts.out },
    ...(isAdmin ? [{ id: 'all', ico: 'all', label: t('كل الإرساليات', 'All'), n: counts.all }] : []),
    { sep: t('تصفية', 'Filters') },
    { id: 'action', ico: 'action', label: t('بانتظار إجراء', 'Needs action'), n: counts.action, hot: counts.action, hotColor: '#d97706' },
    { id: 'late', ico: 'late', label: t('متأخرة / مُصعّدة', 'Overdue / escalated'), n: counts.late, hot: counts.late, hotColor: '#dc2626' },
    { id: 'urgent', ico: 'urgent', label: t('عاجلة', 'Urgent'), n: counts.urgent },
    { id: 'done', ico: 'done', label: t('مستلمة', 'Received'), n: counts.done },
    { id: 'rejected', ico: 'rejected', label: t('مرفوضة', 'Rejected'), n: counts.rejected },
    { sep: t('الطلبات', 'Requests') },
    { id: 'requests', ico: 'requests', label: t('طلبات الإرسال', 'Send requests'), n: counts.requests, hot: counts.requests, hotColor: '#7c3aed' },
  ]
  const goSection = id => { setSection(id); setSelectedId(null); setLimit(60); setSheet(false) }
  const sectionTitle = NAV.find(n => n.id === section)?.label || ''
  const stationOptions = isAdmin ? stations : myStations

  const stationPick = () => stationOptions.length > 1 ? (
    <SelectField value={stationSel} onChange={e => { setStationSel(e.target.value); setSelectedId(null) }} style={fieldStyle}>
      <option value="">{isAdmin ? t('كل المحطات', 'All stations') : t('كل محطاتي', 'All my stations')}</option>
      {stationOptions.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en}</option>)}
    </SelectField>
  ) : null

  if (loading) return <div ref={rootRef} style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)', fontWeight: 700 }}>{t('جارٍ التحميل…', 'Loading…')}</div>
  if (setup) {
    return (
      <div ref={rootRef} style={{ maxWidth: 640, margin: '60px auto', padding: '0 14px' }}>
        <Banner kind="err"><b>{t('قسم الإرساليات لم يُجهَّز بعد.', 'Dispatches are not set up yet.')}</b> {t('شغّل ملفات SQL «024» ثم «025_dispatches_v2» ثم «026» في Supabase (كتلة بكتلة بالترتيب) ثم حدّث الصفحة.', 'Run the 024, 025 and 026 SQL files and refresh.')}</Banner>
      </div>
    )
  }

  const H = `calc(100dvh - ${top}px)`
  const css = `
    html body nav.bottom-nav{display:none !important}
    html body main{padding-bottom:0 !important}
    .dsp-scroll{scrollbar-width:thin;scrollbar-color:var(--border-2) transparent}
    .dsp-scroll::-webkit-scrollbar{width:9px}.dsp-scroll::-webkit-scrollbar-thumb{background:var(--border-2);border-radius:99px;border:2px solid transparent;background-clip:padding-box}
    .dsp-nav:hover{background:var(--surface-2)}
    .dsp-dock button:active{transform:scale(.96)}
  `

  if (view === 'form') {
    return (
      <div ref={rootRef} className="dsp-scroll" style={{ height: H, overflowY: 'auto', background: 'var(--surface)' }}>
        <style>{css}</style>
        <DispatchForm profile={profile} isAr={isAr} isAdmin={isAdmin} stations={stations} myStations={myStations} history={rows} initial={formInit}
          onCancel={() => { setView('list'); setFormInit(null) }} onCreated={() => load()} onPrint={printOne} />
      </div>
    )
  }

  /* ── الأجزاء ── */
  const sidebar = (
    <aside aria-label={t('أقسام الإرساليات', 'Dispatch sections')} style={{ width: 236, flexShrink: 0, background: 'var(--card)', borderInlineEnd: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '16px 14px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(37,99,235,0.14)', color: '#2563eb' }}><Ico n="box" /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '0.98rem', color: 'var(--text-1)' }}>{t('الإرساليات والشحن', 'Dispatches')}</div>
            <div style={{ fontSize: '0.64rem', color: 'var(--text-3)' }}>{t('تتبّع · استلام · تصعيد', 'Track · Receive · Escalate')}</div>
          </div>
        </div>
        {stationPick()}
        <button type="button" onClick={newDispatch} style={{ ...btn('primary'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 14px', fontSize: '0.86rem' }}><Ico n="plus" s={17} />{t('إرسالية / شحنة جديدة', 'New dispatch')}</button>
      </div>
      <nav className="dsp-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 8px 8px' }}>
        {NAV.map((it, i) => it.sep ? (
          <div key={'s' + i} style={{ margin: '14px 10px 4px', fontSize: '0.64rem', fontWeight: 900, color: 'var(--text-3)', letterSpacing: '.05em' }}>{it.sep}</div>
        ) : (
          <button key={it.id} type="button" className="dsp-nav" onClick={() => goSection(it.id)} aria-current={section === it.id ? 'page' : undefined}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 42, padding: '0 10px', margin: '1px 0', border: 'none', borderRadius: 9, background: section === it.id ? 'var(--gold-dim)' : 'transparent', color: section === it.id ? 'var(--text-1)' : 'var(--text-2)', fontFamily: 'inherit', fontWeight: section === it.id ? 900 : 700, fontSize: '0.86rem', cursor: 'pointer', textAlign: 'start', borderInlineStart: `3px solid ${section === it.id ? 'var(--accent)' : 'transparent'}` }}>
            <Ico n={it.ico} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            {it.hot > 0 && <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 99, background: it.hotColor, color: '#fff', fontSize: '0.68rem', fontWeight: 900, display: 'grid', placeItems: 'center', fontFamily: MONO }}>{it.hot}</span>}
            {!(it.hot > 0) && it.n > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontFamily: MONO, fontWeight: 700 }}>{it.n}</span>}
          </button>
        ))}
      </nav>
      <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
        <button type="button" onClick={() => setLookupOpen(true)} style={{ ...btn('ghost'), width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px' }}><Ico n="ticket" s={16} />{t('استلام برقم التذكرة', 'Receive by ticket no.')}</button>
      </div>
    </aside>
  )

  const listPane = (
    <section aria-label={t('القائمة', 'List')} style={{ width: layout === 'three' ? 392 : '100%', flexShrink: 0, flex: layout === 'three' ? '0 0 392px' : '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--card)', borderInlineEnd: layout === 'three' ? '1px solid var(--border)' : 'none', minHeight: 0 }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 900, color: 'var(--text-1)' }}>{sectionTitle}</h1>
          <span style={{ fontFamily: MONO, fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 700 }}>{section === 'requests' ? reqRows.length : list.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={e => { setQ(e.target.value); setLimit(60) }} placeholder={t('بحث…', 'Search…')} aria-label={t('بحث', 'Search')} style={{ ...fieldStyle, flex: 1, minWidth: 0 }} />
          {section !== 'requests' && (
            <div style={{ width: 118, flexShrink: 0 }}>
              <SelectField value={fKind} onChange={e => setFKind(e.target.value)} style={fieldStyle}>
                <option value="">{t('كل الأنواع', 'All')}</option>
                {Object.entries(DISPATCH_KINDS).map(([k, m]) => <option key={k} value={k}>{isAr ? m.ar : m.en}</option>)}
              </SelectField>
            </div>
          )}
        </div>
      </div>
      <div className="dsp-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {section === 'requests' ? (
          reqRows.length === 0 ? <Empty t={t} title={t('لا توجد طلبات إرسال', 'No send requests')} sub={t('من الموجودات (السجل والأرشيف) اضغط «طلب إرسال» على أي موجود أو بلاغ', 'Use “Request send” in Lost & Found')} />
            : reqRows.map(r => <RequestRow key={r.id} r={r} names={names} isAr={isAr} selected={selectedId === r.id} onSelect={() => setSelectedId(r.id)} setRef={el => { refs.current[r.id] = el }} />)
        ) : list.length === 0 ? (
          <Empty t={t} title={rows.length === 0 ? t('لا توجد إرساليات بعد', 'No dispatches yet') : t('لا توجد إرساليات هنا', 'Nothing here')} sub={rows.length === 0 ? t('اضغط «إرسالية / شحنة جديدة» لإصدار أول تذكرة', 'Create the first ticket') : t('غيّر القسم أو الفلاتر أو المحطة', 'Change the section, filters or station')} />
        ) : (
          <>
            {list.slice(0, limit).map(d => <DispatchRow key={d.id} d={d} names={names} isAr={isAr} selected={selectedId === d.id} stationSet={scopeSet} myIds={myIds} isAdmin={isAdmin} onSelect={() => setSelectedId(d.id)} setRef={el => { refs.current[d.id] = el }} />)}
            {list.length > limit && <button type="button" onClick={() => setLimit(l => l + 60)} style={{ ...btn('ghost'), margin: 12, width: 'calc(100% - 24px)', padding: '10px' }}>{t(`عرض المزيد (${list.length - limit})`, `Show more (${list.length - limit})`)}</button>}
          </>
        )}
      </div>
    </section>
  )

  const detailPane = (
    <section aria-label={t('التفاصيل', 'Details')} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', minHeight: 0 }}>
      {layout !== 'three' && hasSel && (
        <div style={{ padding: '8px 10px', background: 'var(--card)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button type="button" onClick={() => setSelectedId(null)} style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', background: 'transparent' }}>
            <span style={{ display: 'inline-flex', transform: isAr ? 'none' : 'scaleX(-1)' }}><Ico n="back" s={18} /></span>{t('رجوع إلى القائمة', 'Back to list')}
          </button>
        </div>
      )}
      <div className="dsp-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {selDispatch ? (
          <DispatchDetail key={selDispatch.id} d={selDispatch} names={names} isAr={isAr} flashing={flashId === selDispatch.id} setRef={el => { refs.current['detail'] = el }}
            stationSet={scopeSet} myIds={myIds} isAdmin={isAdmin} canDelete={isGeneral} canReject={canReject} busy={busy}
            onReceive={leg => setRecvDlg({ d: selDispatch, leg })} onReject={leg => setRejDlg({ d: selDispatch, leg })} onSend={sendLeg} onNote={addNote}
            onPrint={() => printOne(selDispatch)} onDelete={() => setConfirm({ d: selDispatch })} onEscalate={setEscDlg} />
        ) : selReq ? (
          <div style={{ padding: 16 }}>
            <RequestCard r={selReq} names={names} isAr={isAr} flashing={flashId === selReq.id} setRef={() => {}}
              canHandle={canAct(selReq.holder_station_id) || selReq.requester_id === profile?.id} canFulfil={canAct(selReq.holder_station_id)} busy={busy === 'q' + selReq.id}
              onFulfil={() => fulfil(selReq)} onDismiss={reason => dismissReq(selReq, reason)} onOpenDispatch={() => { setSection(isAdmin ? 'all' : 'out'); setSelectedId(selReq.dispatch_id) }} />
          </div>
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>
            <div>
              <div style={{ width: 64, height: 64, borderRadius: 18, display: 'grid', placeItems: 'center', margin: '0 auto 14px', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-3)' }}><Ico n="box" s={30} /></div>
              <div style={{ fontWeight: 800, color: 'var(--text-2)', fontSize: '0.98rem' }}>{t('اختر إرسالية لعرض تفاصيلها', 'Select a dispatch to view details')}</div>
              <div style={{ fontSize: '0.76rem', marginTop: 6 }}>{t('الاستلام والرفض والتصعيد والطباعة من هنا', 'Receive, reject, escalate and print from here')}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  )

  // الدوك السفلي للجوال
  const dockItems = [
    { id: 'in', ico: 'in', label: t('الواردة', 'Incoming'), badge: counts.recv, badgeColor: '#d97706' },
    { id: 'out', ico: 'out', label: t('الصادرة', 'Outgoing') },
    { id: 'new', ico: 'plus', label: t('جديدة', 'New'), fab: true },
    { id: 'requests', ico: 'requests', label: t('الطلبات', 'Requests'), badge: counts.requests, badgeColor: '#7c3aed' },
    { id: 'more', ico: 'more', label: t('المزيد', 'More'), badge: counts.late, badgeColor: '#dc2626' },
  ]
  const dock = layout === 'one' && !(hasSel) ? (
    <nav className="dsp-dock" aria-label={t('التنقل السريع', 'Quick navigation')} style={{ flexShrink: 0, display: 'flex', alignItems: 'stretch', justifyContent: 'space-around', background: 'var(--card)', borderTop: '1px solid var(--border)', boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', padding: '6px 4px calc(6px + env(safe-area-inset-bottom))' }}>
      {dockItems.map(it => it.fab ? (
        <button key={it.id} type="button" onClick={newDispatch} aria-label={it.label} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ width: 50, height: 50, marginTop: -22, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 6px 18px rgba(37,99,235,0.45)', border: '4px solid var(--card)' }}><Ico n="plus" s={24} /></span>
          <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#2563eb' }}>{it.label}</span>
        </button>
      ) : (
        <button key={it.id} type="button" onClick={() => (it.id === 'more' ? setSheet(true) : goSection(it.id))} aria-label={it.label} aria-current={section === it.id ? 'page' : undefined}
          style={{ position: 'relative', flex: 1, minHeight: 52, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: section === it.id ? 'var(--accent)' : 'var(--text-3)' }}>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Ico n={it.ico} s={22} />
            {it.badge > 0 && <span style={{ position: 'absolute', top: -6, insetInlineEnd: -10, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 99, background: it.badgeColor, color: '#fff', fontSize: '0.62rem', fontWeight: 900, display: 'grid', placeItems: 'center', fontFamily: MONO }}>{it.badge}</span>}
          </span>
          <span style={{ fontSize: '0.64rem', fontWeight: section === it.id ? 900 : 700 }}>{it.label}</span>
        </button>
      ))}
    </nav>
  ) : null

  return (
    <div ref={rootRef} style={{ height: H, display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflow: 'hidden' }} dir={isAr ? 'rtl' : 'ltr'}>
      <style>{css}</style>
      {msg && <div style={{ padding: '8px 12px', flexShrink: 0 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {layout !== 'one' && sidebar}
        {layout === 'three' ? <>{listPane}{detailPane}</> : (hasSel ? detailPane : listPane)}
      </div>
      {dock}

      {sheet && (
        <div onClick={e => { if (e.target === e.currentTarget) setSheet(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9990, display: 'flex', alignItems: 'flex-end' }}>
          <div role="dialog" aria-modal="true" style={{ width: '100%', background: 'var(--card)', borderRadius: '18px 18px 0 0', padding: '14px 14px calc(18px + env(safe-area-inset-bottom))', maxHeight: '82vh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--border-2)', margin: '0 auto 12px' }} />
            <div style={{ marginBottom: 10 }}>{stationPick()}</div>
            {NAV.filter(n => !n.sep && !['in', 'out', 'requests'].includes(n.id)).map(it => (
              <button key={it.id} type="button" onClick={() => goSection(it.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 50, padding: '0 12px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text-1)', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', textAlign: 'start' }}>
                <Ico n={it.ico} /><span style={{ flex: 1 }}>{it.label}</span>
                {it.n > 0 && <span style={{ fontFamily: MONO, fontSize: '0.78rem', color: it.hot > 0 ? '#fff' : 'var(--text-3)', background: it.hot > 0 ? it.hotColor : 'transparent', borderRadius: 99, padding: it.hot > 0 ? '1px 8px' : 0, fontWeight: 800 }}>{it.n}</span>}
              </button>
            ))}
            <button type="button" onClick={() => { setSheet(false); setLookupOpen(true) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 50, padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--text-1)', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', textAlign: 'start' }}><Ico n="ticket" /><span style={{ flex: 1 }}>{t('استلام برقم التذكرة', 'Receive by ticket no.')}</span></button>
          </div>
        </div>
      )}

      {recvDlg && <ReceiveDialog d={recvDlg.d} leg={recvDlg.leg} names={names} isAr={isAr} busy={busy === 'r' + recvDlg.leg.id} onConfirm={doReceive} onClose={() => setRecvDlg(null)} />}
      {rejDlg && <RejectDialog d={rejDlg.d} leg={rejDlg.leg} names={names} isAr={isAr} busy={busy === 'j' + rejDlg.leg.id} onConfirm={doReject} onClose={() => setRejDlg(null)} />}
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

function Empty({ t, title, sub }) {
  return (
    <div style={{ padding: '56px 22px', textAlign: 'center', color: 'var(--text-3)' }}>
      <div style={{ fontWeight: 800, fontSize: '0.96rem', color: 'var(--text-2)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: '0.78rem', lineHeight: 1.7 }}>{sub}</div>
    </div>
  )
}
