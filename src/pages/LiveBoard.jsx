import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { NW_LOGO_PATHS, NW_LOGO_VIEWBOX } from '../utils/nwLogoPaths'
import { isRestStation } from '../utils/stations'

import { todayStr } from '../utils/dates'
import SelectField from '../components/shared/SelectField'

const hhmmFromTs = v => v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
const s5 = v => v ? String(v).slice(0, 5) : ''
const toMin = hm => { const [h, m] = (hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }

function Clock({ accent, muted, isAr }) {
  const [c, setC] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setC(new Date()), 1000); return () => clearInterval(t) }, [])
  const hm = c.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const sec = String(c.getSeconds()).padStart(2, '0')
  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace" }} dir="ltr">
      <div style={{ fontSize: 46, fontWeight: 700, color: accent, lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: isAr ? 'flex-start' : 'flex-end' }}>
        <span>{hm}</span><span style={{ fontSize: 22, opacity: 0.55 }}>:{sec}</span>
      </div>
      <div style={{ fontSize: 13, color: muted, marginTop: 6, fontFamily: "'IBM Plex Sans Arabic', sans-serif", textAlign: isAr ? 'left' : 'right' }} dir={isAr ? 'rtl' : 'ltr'}>
        {c.toLocaleDateString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  )
}

// قوالب الشاشة: لون الخلفية + تدرجات ناعمة بدل اللون الواحد
const GRID = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 22px)'
const THEMES = {
  nwb:   { name: 'هوية النظام',   bg: '#0C161F', fx: `${GRID}, radial-gradient(1100px 520px at 85% -10%, rgba(222,149,38,0.16), transparent 62%), radial-gradient(900px 480px at 0% 105%, rgba(111,177,216,0.12), transparent 58%), linear-gradient(180deg,#101C27,#091119)`, accent: '#E3A02E', arr: '#4BC98F', dep: '#6FB1D8', text: '#F2EFE8', muted: '#8493A0' },
  navy:  { name: 'كحلي/ذهبي',    bg: '#0B1B34', fx: `${GRID}, radial-gradient(1000px 520px at 90% -10%, rgba(217,178,95,0.16), transparent 60%), radial-gradient(900px 500px at 0% 110%, rgba(90,166,255,0.14), transparent 58%), linear-gradient(180deg,#0E2142,#081528)`, accent: '#D9B25F', arr: '#3DDC97', dep: '#5AA6FF', text: '#E8EEF7', muted: '#8EA3C4' },
  black: { name: 'أسود/كهرماني',  bg: '#0A0A0C', fx: `${GRID}, radial-gradient(1000px 520px at 85% -10%, rgba(240,169,43,0.14), transparent 60%), linear-gradient(180deg,#121216,#070709)`, accent: '#F0A92B', arr: '#37D67A', dep: '#5AA6FF', text: '#F2F2F4', muted: '#9A9AA2' },
  teal:  { name: 'بترولي',        bg: '#07211F', fx: `${GRID}, radial-gradient(1000px 520px at 85% -10%, rgba(230,198,107,0.15), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(79,195,217,0.14), transparent 58%), linear-gradient(180deg,#0A2B28,#051917)`, accent: '#E6C66B', arr: '#56E0B0', dep: '#4FC3D9', text: '#EAFAF6', muted: '#8FB8B2' },
}

const nmOf = (s, isAr) => (isAr ? s?.name_ar : s?.name_en) || '—'

// إزالة التكرار: نفس الرحلة بنفس الاتجاه والوقت (تُسجّل في كل محطة تمر بها)
const dedupeEvents = list => {
  const seen = new Set()
  return list.filter(e => {
    const k = `${e.type}|${e.trip?.trip_number || ''}|${e.time}|${e.trip?.from_station?.name_en || ''}|${e.trip?.to_station?.name_en || ''}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

// صف الحركة — مكوّن مستقل ومُحفّظ (memo) حتى لا يُعاد إنشاؤه عند كل رسم (يمنع الاهتزاز)
const Row = memo(function Row({ e, accent, th, isAr, nowMin }) {
  const upcoming = e.status === 'upcoming'
  const arr = e.type === 'arrival'
  const mins = upcoming && nowMin != null ? toMin(e.time) - nowMin : null
  const soon = mins != null && mins >= 0 && mins <= 20
  return (
    <div className="lb-row" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, height: 88, boxSizing: 'border-box', padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: soon ? `linear-gradient(90deg, ${accent}14, transparent)` : 'transparent', opacity: upcoming && !soon ? 0.82 : 1 }}>
      <span style={{ position: 'absolute', insetInlineStart: 0, top: 14, bottom: 14, width: 4, borderRadius: 3, background: upcoming ? `${accent}66` : accent }} />
      <div dir="ltr" style={{ minWidth: 104, textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 34, fontWeight: 800, color: th.text, letterSpacing: 1, lineHeight: 1 }}>{e.time}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div dir="ltr" style={{ fontSize: 18, fontWeight: 800, color: th.text, lineHeight: 1.22, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textAlign: isAr ? 'right' : 'left' }}>
          {nmOf(e.trip?.from_station, isAr)} <span style={{ color: accent, fontWeight: 800, margin: '0 6px' }}>→</span> {nmOf(e.trip?.to_station, isAr)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }} dir="ltr">
          <span style={{ fontSize: 13, fontWeight: 700, color: th.text, background: 'rgba(255,255,255,0.08)', borderRadius: 5, padding: '2px 9px', fontFamily: "'IBM Plex Mono', monospace" }}>{e.trip?.trip_number || '—'}</span>
          {e.bus && <span style={{ fontSize: 13, fontWeight: 700, color: th.muted, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 5, padding: '1px 8px', fontFamily: "'IBM Plex Mono', monospace" }}>{e.bus}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'center', minWidth: 118 }}>
        {upcoming
          ? (soon
            ? <span className="lb-ar" style={{ fontSize: 14, fontWeight: 800, color: '#101010', background: accent, borderRadius: 7, padding: '6px 14px', whiteSpace: 'nowrap' }}>{mins <= 0 ? (isAr ? 'الآن' : 'Now') : (isAr ? `بعد ${mins} د` : `in ${mins} min`)}</span>
            : <span style={{ fontSize: 13, fontWeight: 700, color: th.muted, border: `1px solid ${th.muted}55`, borderRadius: 7, padding: '5px 13px', whiteSpace: 'nowrap' }}>{mins != null && mins > 0 ? (isAr ? `بعد ${mins >= 60 ? `${Math.floor(mins / 60)}س ${mins % 60}د` : `${mins} د`}` : `in ${mins}m`) : (isAr ? 'مجدولة' : 'Scheduled')}</span>)
          : <span style={{ fontSize: 14, fontWeight: 800, color: accent, background: `${accent}22`, border: `1px solid ${accent}55`, borderRadius: 7, padding: '5px 13px', whiteSpace: 'nowrap' }}>{arr ? (isAr ? '✓ تم الوصول' : '✓ Arrived') : (isAr ? '✓ تمت المغادرة' : '✓ Departed')}</span>}
      </div>
    </div>
  )
})

export default function LiveBoard() {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const { isGeneralAdmin, profile } = useAuth()
  const isAr = i18n.language === 'ar'
  const nm = s => (isAr ? s?.name_ar : s?.name_en) || '—'

  // المحطة المعروضة: الأدمن يختار أو "الكل"؛ غيره محصور بمحطته
  const [stations, setStations] = useState([])
  const [boardStation, setBoardStation] = useState(() =>
    localStorage.getItem('nwbus_board_station') || 'all')
  useEffect(() => {
    if (!isGeneralAdmin && profile?.station_id) setBoardStation(profile.station_id)
  }, [isGeneralAdmin, profile?.station_id])
  useEffect(() => {
    if (!isGeneralAdmin) return
    supabase.from('stations').select('id,name_ar,name_en').eq('is_active', true).order('name_ar')
      .then(({ data }) => setStations((data || []).filter(s => !isRestStation(s))))
  }, [isGeneralAdmin])


  const [mode, setMode] = useState(() => localStorage.getItem('nwbus_board_mode') || 'actual')
  const [theme, setTheme] = useState(() => localStorage.getItem('nwbus_board_theme') || 'nwb')
  const [layout, setLayout] = useState(() => localStorage.getItem('nwbus_board_layout') || 'columns')
  const [bg, setBg] = useState(() => localStorage.getItem('nwbus_board_bg') || '')
  const [events, setEvents] = useState([])
  const [showHint, setShowHint] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rotateSec, setRotateSec] = useState(() => Number(localStorage.getItem('nwbus_board_rotate')) || 15)
  const [tick, setTick] = useState(0)   // عدّاد لقطات الوضع التلقائي
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes())
  useEffect(() => { const id = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()) }, 15000); return () => clearInterval(id) }, [])

  // في الوضع التلقائي فقط: العناوين ثابتة، والرحلات تتبدّل كلقطة كل (rotateSec) ثانية
  useEffect(() => {
    if (layout !== 'auto') return
    const id = setInterval(() => setTick(t => t + 1), Math.max(5, rotateSec) * 1000)
    return () => clearInterval(id)
  }, [layout, rotateSec])
  const isAuto = layout === 'auto'
  const view = layout === 'feed' ? 'feed' : 'columns'   // التلقائي يستخدم بنية العمودين
  const COL_PER = 6   // عدد الرحلات في كل لقطة (للوضع التلقائي)

  const th = THEMES[theme] || THEMES.nwb
  const sigRef = useRef('')
  const setEventsIfChanged = list => {
    const sig = list.map(e => e.id + e.time + e.status).join('|')
    if (sig === sigRef.current) return   // لا تحديث إن لم تتغيّر البيانات (يمنع الوميض)
    sigRef.current = sig
    setEvents(list)
  }
  const save = (setter, key) => v => { setter(v); localStorage.setItem(key, v) }
  const setModePref = save(setMode, 'nwbus_board_mode')
  const setThemePref = save(setTheme, 'nwbus_board_theme')
  const setLayoutPref = save(setLayout, 'nwbus_board_layout')
  const setBgPref = save(setBg, 'nwbus_board_bg')
  const setRotatePref = save(setRotateSec, 'nwbus_board_rotate')
  const setStationPref = save(setBoardStation, 'nwbus_board_station')
  const scoped = boardStation && boardStation !== 'all'

  const loadActual = useCallback(async () => {
    let q = supabase.from('trip_records')
      .select(`id, updated_at, actual_departure, actual_arrival, bus_number,
        station:station_id(name_ar,name_en),
        trip:trip_schedule_id(trip_number, from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en))`)
      .eq('record_date', todayStr())
    if (scoped) q = q.eq('station_id', boardStation)
    const { data } = await q.order('updated_at', { ascending: false }).limit(60)
    const list = []
    ;(data ?? []).forEach(r => {
      // في شاشة المحطة: الوصول "... → المحطة" والمغادرة "المحطة → ..." (مثل صفحة الترحيل)
      const arrTrip = scoped ? { ...r.trip, to_station: r.station } : r.trip
      const depTrip = scoped ? { ...r.trip, from_station: r.station } : r.trip
      if (r.actual_arrival) list.push({ id: r.id + '-a', type: 'arrival', time: hhmmFromTs(r.actual_arrival), sort: r.actual_arrival, station: r.station, trip: arrTrip, bus: r.bus_number, status: 'done' })
      if (r.actual_departure) list.push({ id: r.id + '-d', type: 'departure', time: hhmmFromTs(r.actual_departure), sort: r.actual_departure, station: r.station, trip: depTrip, bus: r.bus_number, status: 'done' })
    })
    list.sort((a, b) => (b.sort ?? '').localeCompare(a.sort ?? ''))
    setEventsIfChanged(dedupeEvents(list).slice(0, 40))
  }, [scoped, boardStation])

  const loadScheduled = useCallback(async () => {
    const today = todayStr()
    const now = new Date().getHours() * 60 + new Date().getMinutes()
    const legs = []

    if (scoped) {
      // محطة محدّدة: رحلاتها المضافة فقط، ووقت المحطة نفسها
      const [{ data: rows }, { data: stops }] = await Promise.all([
        supabase.from('station_trips')
          .select(`departure_time, arrival_time, dep_enabled, arr_enabled,
            station:station_id(name_ar,name_en),
            trip:trip_schedule_id(id, trip_number, scheduled_departure, scheduled_arrival, is_active, is_rf, rf_date, from_station_id, to_station_id, from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en))`)
          .eq('station_id', boardStation),
        supabase.from('trip_schedule_stops').select('trip_schedule_id, station_id, arrival_time, departure_time').eq('station_id', boardStation),
      ])
      const stopMap = {}
      ;(stops ?? []).forEach(s => { stopMap[s.trip_schedule_id] = s })
      ;(rows ?? []).forEach(r => {
        const t = r.trip; if (!t || t.is_active === false) return
        if (t.is_rf && t.rf_date !== today) return
        const stop = stopMap[t.id]
        const isDest = t.to_station_id === boardStation, isOrigin = t.from_station_id === boardStation
        const arrTm = s5(r.arrival_time || stop?.arrival_time || (isDest ? t.scheduled_arrival : null))
        const depTm = s5(r.departure_time || stop?.departure_time || (isOrigin ? t.scheduled_departure : null))
        // الوصول "... → المحطة" والمغادرة "المحطة → ..." لتوضّح حركة كل محطة
        if (r.arr_enabled !== false && arrTm) legs.push({ id: t.trip_number + '-a', type: 'arrival', time: arrTm, trip: { ...t, to_station: r.station } })
        if (r.dep_enabled !== false && depTm) legs.push({ id: t.trip_number + '-d', type: 'departure', time: depTm, trip: { ...t, from_station: r.station } })
      })
    } else {
      // الكل: مغادرة من المنشأ (scheduled_departure) + وصول للوجهة (scheduled_arrival)
      // حد الخادم 1000 صف: نجلب كل الصفحات بترتيب ثابت
      const data = []
      for (let f = 0; f < 20000; f += 1000) {
        const { data: part, error } = await supabase.from('trip_schedule')
          .select(`id, trip_number, scheduled_departure, scheduled_arrival, is_active, is_rf, rf_date,
            from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en)`)
          .eq('is_active', true).order('id').range(f, f + 999)
        if (error) break
        data.push(...(part ?? []))
        if ((part ?? []).length < 1000) break
      }
      data.forEach(t => {
        if (t.is_rf && t.rf_date !== today) return
        const dep = s5(t.scheduled_departure), arr = s5(t.scheduled_arrival)
        if (dep) legs.push({ id: t.trip_number + '-d', type: 'departure', time: dep, trip: t })
        if (arr) legs.push({ id: t.trip_number + '-a', type: 'arrival', time: arr, trip: t })
      })
    }

    const win = legs.filter(l => { const m = toMin(l.time); return m >= now - 60 && m <= now + 720 })   // حتى 12 ساعة قادمة
      .map(l => ({ ...l, status: toMin(l.time) <= now ? 'done' : 'upcoming' }))
      .sort((a, b) => toMin(a.time) - toMin(b.time))
    setEventsIfChanged(dedupeEvents(win).slice(0, 40))
  }, [scoped, boardStation])

  useEffect(() => {
    const run = () => (mode === 'scheduled' ? loadScheduled() : loadActual())
    run()
    const t = setInterval(run, 10000)   // مؤقّت احتياطي
    // تحديث مباشر (Realtime): أي إدخال/تعديل يظهر فوراً على الشاشة
    const ch = supabase.channel('board-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_records' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_trips' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_schedule' }, run)
      .subscribe()
    return () => { clearInterval(t); supabase.removeChannel(ch) }
  }, [mode, loadActual, loadScheduled])

  const hintTimer = useRef(null)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') navigate('/') }
    const onMove = () => { setShowHint(true); clearTimeout(hintTimer.current); hintTimer.current = setTimeout(() => setShowHint(false), 4000) }
    window.addEventListener('keydown', onKey); window.addEventListener('mousemove', onMove); onMove()
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousemove', onMove); clearTimeout(hintTimer.current) }
  }, [navigate])

  const containerBg = bg
    ? { backgroundImage: `linear-gradient(rgba(8,16,34,0.66), rgba(8,16,34,0.74)), url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: th.fx || th.bg }
  // المتتالي مرتّب بالوقت (وصول/مغادرة مع بعض)
  const feedSorted = [...events].sort((a, b) => toMin(a.time) - toMin(b.time))
  const stationLabel = scoped
    ? (nm(stations.find(s => s.id === boardStation)) !== '—' ? nm(stations.find(s => s.id === boardStation)) : nm(profile?.station))
    : (isAr ? 'كل المحطات' : 'All Stations')
  const depCount = events.filter(e => e.type === 'departure').length
  const arrCount = events.filter(e => e.type === 'arrival').length
  const nextEv = mode === 'scheduled' ? [...events].filter(e => e.status === 'upcoming').sort((a, b) => toMin(a.time) - toMin(b.time))[0] : null
  const nextMins = nextEv ? toMin(nextEv.time) - nowMin : null
  const HEADER_H = 150   // ارتفاع الرأس + الشريط (لحساب ارتفاع المحتوى)

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, color: th.text, fontFamily: 'IBM Plex Sans Arabic, sans-serif', overflow: 'hidden', ...containerBg }}>
      <style>{`
        @keyframes slidein { from { opacity:0; transform: translateY(-10px) } to { opacity:1; transform:none } }
        @keyframes glow { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes livedot { 0%{box-shadow:0 0 0 0 rgba(75,201,143,.6)} 100%{box-shadow:0 0 0 9px rgba(75,201,143,0)} }
        @keyframes scrollup { from { transform: translateY(0) } to { transform: translateY(-50%) } }
        .lb-row { animation: slidein .45s ease both }
        .lb-ar { animation: glow 1.6s ease-in-out infinite }
        .lb-live { animation: livedot 1.6s ease-out infinite }
      `}</style>

      {/* ── الرأس ── */}
      <header style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 24, padding: '20px 44px 18px', background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: th.text }}>
          <svg viewBox={NW_LOGO_VIEWBOX} width={Math.round(52 * 398 / 115)} height={52} fill="currentColor" aria-label="North West Bus">
            {NW_LOGO_PATHS.map((d, i) => <path key={i} d={d} />)}
          </svg>
          <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.18)' }} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.3 }}>{isAr ? 'نورث وست باص' : 'North West Bus'}</div>
            <div style={{ fontSize: 11, color: th.muted, letterSpacing: 4, marginTop: 3 }}>NORTH WEST BUS</div>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 0.5 }}>{isAr ? 'حركة الرحلات المباشرة' : 'Live Trip Movements'}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: th.accent, background: `${th.accent}1c`, border: `1px solid ${th.accent}55`, borderRadius: 999, padding: '3px 18px' }}>{stationLabel}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, color: '#4BC98F', letterSpacing: 1 }}>
              <i className="lb-live" style={{ width: 9, height: 9, borderRadius: '50%', background: '#4BC98F', display: 'inline-block' }} />{mode === 'scheduled' ? (isAr ? 'جدول اليوم' : 'TODAY\'S SCHEDULE') : (isAr ? 'مباشر' : 'LIVE')}
            </span>
          </div>
        </div>
        <div style={{ justifySelf: isAr ? 'start' : 'end' }}>
          <Clock accent={th.accent} muted={th.muted} isAr={isAr} />
        </div>
        <span style={{ position: 'absolute', insetInline: 0, bottom: 0, height: 3, background: `linear-gradient(90deg, transparent, ${th.accent}, transparent)` }} />
      </header>

      {/* ── شريط الملخص ── */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '14px 44px 0' }}>
        {[
          { l: isAr ? 'مغادرة' : 'Departures', v: depCount, c: th.dep },
          { l: isAr ? 'وصول' : 'Arrivals', v: arrCount, c: th.arr },
        ].map(k => (
          <div key={k.l} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderInlineStart: `4px solid ${k.c}` }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: k.c, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{k.v}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: th.muted }}>{k.l}</span>
          </div>
        ))}
        {nextEv && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: '8px 20px', borderRadius: 12, background: `${th.accent}14`, border: `1px solid ${th.accent}44`, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: th.accent, letterSpacing: 1, whiteSpace: 'nowrap' }}>{isAr ? 'التالية' : 'NEXT'}</span>
            <span dir="ltr" style={{ fontSize: 24, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: th.text }}>{nextEv.time}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: th.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><bdi dir="ltr">{nmOf(nextEv.trip?.from_station, isAr)} → {nmOf(nextEv.trip?.to_station, isAr)}</bdi></span>
            <span style={{ marginInlineStart: 'auto', fontSize: 14, fontWeight: 800, color: th.accent, whiteSpace: 'nowrap' }}>{nextMins != null && nextMins > 0 ? (isAr ? `بعد ${nextMins} د` : `in ${nextMins} min`) : (isAr ? 'الآن' : 'Now')}</span>
          </div>
        )}
      </div>

      {/* ── أزرار المشرف (تظهر عند تحريك الفأرة) ── */}
      {isGeneralAdmin && (
        <div style={{ position: 'absolute', bottom: 14, insetInlineEnd: 44, display: 'flex', gap: 8, opacity: showHint ? 1 : 0, transition: 'opacity .4s', zIndex: 6, pointerEvents: showHint ? 'auto' : 'none' }}>
          {[['actual', isAr ? 'فعلي' : 'Actual'], ['scheduled', isAr ? 'مجدول' : 'Scheduled']].map(([v, l]) => (
            <button key={v} onClick={() => setModePref(v)} style={{ padding: '7px 18px', borderRadius: 8, border: `1px solid ${th.accent}77`, fontSize: 13, fontWeight: 800, cursor: 'pointer', background: mode === v ? th.accent : 'rgba(0,0,0,0.35)', color: mode === v ? '#101010' : th.text, fontFamily: 'inherit' }}>{l}</button>
          ))}
          <button onClick={() => setSettingsOpen(true)} style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${th.accent}77`, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'rgba(0,0,0,0.35)', color: th.text, fontFamily: 'inherit' }}>{isAr ? 'إعدادات' : 'Settings'}</button>
        </div>
      )}

      {/* ── المحتوى ── */}
      {view === 'columns' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, padding: '16px 44px 56px', height: `calc(100% - ${HEADER_H + 56}px)`, boxSizing: 'border-box' }}>
          {[{ type: 'departure', label: isAr ? 'المغادرة' : 'Departures', accent: th.dep, icon: '↑' }, { type: 'arrival', label: isAr ? 'الوصول' : 'Arrivals', accent: th.arr, icon: '↓' }].map(col => {
            const items = events.filter(e => e.type === col.type)
            // التلقائي: لقطة ثابتة تتبدّل؛ العمودين: تمرير مستمر
            const pages = Math.max(1, Math.ceil(items.length / COL_PER))
            const p = ((tick % pages) + pages) % pages
            const shown = isAuto ? items.slice(p * COL_PER, p * COL_PER + COL_PER) : items
            const flow = !isAuto && items.length > 6
            return (
              <section key={col.type} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(8,14,20,0.45)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden', backdropFilter: 'blur(6px)', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', background: `linear-gradient(90deg, ${col.accent}26, transparent)`, borderBottom: `2px solid ${col.accent}` }}>
                  <span style={{ width: 38, height: 38, borderRadius: 12, background: `${col.accent}22`, border: `1px solid ${col.accent}66`, color: col.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>{col.icon}</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: col.accent }}>{col.label}</span>
                  <span style={{ marginInlineStart: 'auto', fontSize: 15, fontWeight: 800, color: th.text, background: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: '3px 14px', fontFamily: "'IBM Plex Mono', monospace" }}>{items.length}{isAuto && pages > 1 ? ` · ${p + 1}/${pages}` : ''}</span>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={flow ? { animation: `scrollup ${items.length * 3.5}s linear infinite` } : {}}>
                    {[...shown, ...(flow ? items : [])].map((e, i) => <Row key={e.id + '_' + i} e={e} accent={col.accent} th={th} isAr={isAr} nowMin={nowMin} />)}
                  </div>
                  {items.length === 0 && <div style={{ textAlign: 'center', color: th.muted, fontSize: 18, padding: '60px 0', fontWeight: 700 }}>{isAr ? 'لا توجد حركة' : 'No movements'}</div>}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div style={{ padding: '16px 44px 56px', height: `calc(100% - ${HEADER_H + 56}px)`, overflow: 'hidden', boxSizing: 'border-box' }}>
          <div style={{ background: 'rgba(8,14,20,0.45)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden', height: '100%', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
            <div style={feedSorted.length > 8 ? { animation: `scrollup ${feedSorted.length * 3.5}s linear infinite` } : {}}>
              {[...feedSorted, ...(feedSorted.length > 8 ? feedSorted : [])].map((e, i) => <Row key={e.id + '_' + i} e={e} accent={e.type === 'arrival' ? th.arr : th.dep} th={th} isAr={isAr} nowMin={nowMin} />)}
              {feedSorted.length === 0 && <div style={{ textAlign: 'center', color: th.muted, fontSize: 20, padding: '90px 0', fontWeight: 700 }}>{isAr ? 'لا حركة حالياً' : 'No movements'}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#16232E', border: `1px solid ${th.accent}55`, borderRadius: 8, padding: 24, width: 420, maxWidth: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{isAr ? 'إعدادات الشاشة' : 'Board Settings'}</span>
              <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', color: th.muted, fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            {isGeneralAdmin && (
              <>
                <div style={{ fontSize: 13, color: th.muted, marginBottom: 6 }}>{isAr ? 'المحطة المعروضة' : 'Displayed station'}</div>
                <SelectField value={boardStation} onChange={e => setStationPref(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: th.text, fontSize: 13, marginBottom: 18 }}>
                  <option value="all" style={{ color: '#000' }}>{isAr ? 'كل المحطات (شامل)' : 'All stations'}</option>
                  {stations.map(s => <option key={s.id} value={s.id} style={{ color: '#000' }}>{nm(s)}</option>)}
                </SelectField>
              </>
            )}

            <div style={{ fontSize: 13, color: th.muted, marginBottom: 6 }}>{isAr ? 'القالب واللون' : 'Theme'}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {Object.entries(THEMES).map(([k, v]) => (
                <button key={k} onClick={() => setThemePref(k)} style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', border: theme === k ? `2px solid ${v.accent}` : '1px solid rgba(255,255,255,0.2)', background: v.bg.includes('gradient') ? v.bg : v.bg, color: v.text, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: v.accent }}>●</span> {v.name}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 13, color: th.muted, marginBottom: 6 }}>{isAr ? 'طريقة العرض' : 'Layout'}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {[['columns', isAr ? 'عمودان منفصلان' : 'Two columns'], ['feed', isAr ? 'متتالي (قائمة واحدة)' : 'Continuous feed'], ['auto', isAr ? 'تنقّل تلقائي (كل 15ث)' : 'Auto (every 15s)']].map(([v, l]) => (
                <button key={v} onClick={() => setLayoutPref(v)} style={{ flex: '1 1 45%', padding: '10px', borderRadius: 6, cursor: 'pointer', border: layout === v ? `2px solid ${th.accent}` : '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: th.text, fontSize: 13, fontWeight: 700 }}>{l}</button>
              ))}
            </div>

            {layout === 'auto' && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, color: th.muted, marginBottom: 6 }}>{isAr ? 'مدة كل لقطة (ثانية)' : 'Seconds per view'}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {[10, 15, 20, 30, 60].map(s => (
                    <button key={s} onClick={() => setRotatePref(s)} style={{ padding: '8px 14px', borderRadius: 6, cursor: 'pointer', border: rotateSec === s ? `2px solid ${th.accent}` : '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: th.text, fontSize: 13, fontWeight: 700 }}>{s}{isAr ? 'ث' : 's'}</button>
                  ))}
                  <input type="number" min="3" value={rotateSec}
                    onChange={e => setRotatePref(Math.max(3, Number(e.target.value) || 3))}
                    style={{ width: 70, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: th.text, fontSize: 13, textAlign: 'center' }} />
                </div>
              </div>
            )}


            <div style={{ fontSize: 13, color: th.muted, marginBottom: 6 }}>{isAr ? 'صورة خلفية' : 'Background image'}</div>
            <input type="file" accept="image/*" onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              const rd = new FileReader()
              rd.onload = () => { try { setBgPref(rd.result) } catch { alert(isAr ? 'الصورة كبيرة، اختر أصغر' : 'Image too large') } }
              rd.readAsDataURL(f)
            }} style={{ fontSize: 12, color: th.text, marginBottom: 8 }} />
            <input value={bg.startsWith('data:') ? '' : bg} onChange={e => setBgPref(e.target.value)} placeholder={isAr ? 'أو ألصق رابط صورة https://...' : 'or paste URL https://...'}
              dir="ltr" style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: th.text, fontSize: 13, boxSizing: 'border-box' }} />
            {bg && <button onClick={() => setBgPref('')} style={{ marginTop: 8, fontSize: 12, color: '#ff8a8a', background: 'none', border: 'none', cursor: 'pointer' }}>{isAr ? 'إزالة الخلفية' : 'Remove background'}</button>}
          </div>
        </div>
      )}

      {/* خروج */}
      <div style={{ position: 'absolute', bottom: 14, insetInlineStart: 44, opacity: showHint ? 1 : 0, transition: 'opacity .5s', pointerEvents: showHint ? 'auto' : 'none' }}>
        <button onClick={() => navigate('/')} style={{ background: 'rgba(0,0,0,0.35)', color: th.muted, border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '7px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {isAr ? '✕ خروج (Esc)' : '✕ Exit (Esc)'}
        </button>
      </div>
    </div>
  )
}
