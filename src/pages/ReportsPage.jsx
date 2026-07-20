import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { NWB_LOGO_SVG } from '../utils/logo'
import DatePicker from '../components/shared/DatePicker'
import SearchSelect from '../components/shared/SearchSelect'
import StatStrip from '../components/shared/StatStrip'
import { toLocalDateStr } from '../utils/dates'
import { isRestStation } from '../utils/stations'

const fmt  = n => Number(n ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 })
const fmtN = n => Number(n ?? 0).toLocaleString('ar-SA')

// إحصائيات الالتزام لمجموعة حركات (وصول أو مغادرة)
function complianceStats(list) {
  const measured = list.filter(m => !m.unentered && m.delay !== null)
  const c = k => measured.filter(m => m.acc?.key === k).length
  const onTime = c('ontime') + c('early')
  return {
    total: list.length,
    measured: measured.length,
    early: c('early'), ontime: c('ontime'), noton: c('noton'), delayed: c('delayed'),
    rate: measured.length ? Math.round(onTime / measured.length * 100) : null,
    avgDelay: measured.length ? Math.round(measured.reduce((s, m) => s + m.delay, 0) / measured.length) : null,
    maxDelay: measured.length ? Math.max(...measured.map(m => m.delay)) : null,
  }
}

// قسم قابل للطي بشريط عنوان — نفس نمط جداول المغادرة/الوصول
function CollapseSection({ label, sub, color, storageKey, children }) {
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return saved === null ? true : saved === 'true'
  })
  const toggle = () => setOpen(v => { localStorage.setItem(storageKey, !v); return !v })
  return (
    <div className="mb-4">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between text-xs font-bold text-white px-3 py-2 rounded-t-xl"
        style={{ background: color, borderRadius: open ? undefined : 4 }}
      >
        <span>
          {label}
          {sub && <span className="opacity-70 font-normal ms-2">{sub}</span>}
        </span>
        <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="pt-3">{children}</div>}
    </div>
  )
}

function MoveTableComp({ list, color, label, isAr, storageKey }) {
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return saved === null ? true : saved === 'true'
  })
  const toggle = () => setOpen(v => { localStorage.setItem(storageKey, !v); return !v })
  if (!list || list.length === 0) return null
  return (
    <div className="mb-4">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between text-xs font-bold text-white px-3 py-2 rounded-t-xl"
        style={{ background: color }}
      >
        <span>{label} ({list.length})</span>
        <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="bg-white rounded-b-2xl shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: color }} className="text-white">
              <tr>
                <th className="px-3 py-2 text-right font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                <th className="px-3 py-2 text-right font-semibold">{isAr ? 'الرحلة' : 'Trip'}</th>
                <th className="px-3 py-2 text-right font-semibold">{isAr ? 'رقم الحافلة' : 'Bus'}</th>
                <th className="px-3 py-2 text-right font-semibold">{isAr ? 'من' : 'From'}</th>
                <th className="px-3 py-2 text-right font-semibold">{isAr ? 'إلى' : 'To'}</th>
                <th className="px-3 py-2 text-center font-semibold">{isAr ? 'المجدول' : 'Sched.'}</th>
                <th className="px-3 py-2 text-center font-semibold">{isAr ? 'الفعلي' : 'Actual'}</th>
                <th className="px-3 py-2 text-center font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="px-3 py-2 text-center font-semibold">{isAr ? 'الركاب' : 'Pax'}</th>
                <th className="px-3 py-2 text-center font-semibold">{isAr ? 'المتخلفون' : 'Missed'}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m, i) => (
                <tr key={i} style={m.unentered ? { background: '#fffbeb' } : { background: i % 2 ? '#f8fafc' : '#fff' }}>
                  <td className="px-3 py-2 text-gray-500 text-xs">{m.date}</td>
                  <td className="px-3 py-2 font-mono font-bold" style={{ color: m.unentered ? '#92400e' : color }}>{m.trip}</td>
                  <td className="px-3 py-2 font-mono font-bold text-gray-700">{m.bus}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{m.from}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{m.to}</td>
                  <td className="px-3 py-2 text-center font-mono text-gray-500">{m.sched}</td>
                  <td className="px-3 py-2 text-center font-mono text-gray-800">{m.actual}</td>
                  <td className="px-3 py-2 text-center text-xs font-bold" style={{ color: m.unentered ? '#b45309' : m.acc?.color }}>
                    {m.unentered ? (isAr ? '⚠ غير مدخلة' : '⚠ Not Entered') : m.acc?.label}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-gray-700">{m.pax || ''}</td>
                  <td className="px-3 py-2 text-center font-mono text-red-600">{m.missed || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ReportsPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { isGeneralAdmin, isAccountant, isStationAdmin, profile } = useAuth()

  const [dateFrom, setDateFrom] = useState(toLocalDateStr())
  const [dateTo,   setDateTo]   = useState(toLocalDateStr())
  const [loading,  setLoading]  = useState(false)
  const [data,     setData]     = useState(null)
  const [reportType, setReportType] = useState('all')   // all | transport | missed | facilities | sales | lost
  const [stations, setStations]     = useState([])
  const [station,  setStation]      = useState('all')   // 'all' أو id محطة
  const [printStationIds, _setPrintStationIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rpt_station_ids') ?? '[]') } catch { return [] }
  })
  const setPrintStationIds = v => {
    const next = typeof v === 'function' ? v(printStationIds) : v
    localStorage.setItem('rpt_station_ids', JSON.stringify(next))
    _setPrintStationIds(next)
  }
  const [showStationPicker, setShowStationPicker] = useState(false)

  const [printAgentIds, _setPrintAgentIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rpt_agent_ids') ?? '[]') } catch { return [] }
  })
  const setPrintAgentIds = v => {
    const next = typeof v === 'function' ? v(printAgentIds) : v
    localStorage.setItem('rpt_agent_ids', JSON.stringify(next))
    _setPrintAgentIds(next)
  }
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [showUnenteredWarn, setShowUnenteredWarn] = useState(false)

  // سجل التدقيق — للأدمن العام والمشرفين
  const canSeeAudit = isGeneralAdmin || isStationAdmin
  const PAGE_SIZE = 50
  const [auditRows,    setAuditRows]    = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditFrom,    setAuditFrom]    = useState(toLocalDateStr())
  const [auditTo,      setAuditTo]      = useState(toLocalDateStr())
  const [auditTable,   setAuditTable]   = useState('all')
  const [auditStation, setAuditStation] = useState('mine') // 'all' | 'mine' | uuid
  const [auditPage,    setAuditPage]    = useState(0)
  const [auditTotal,   setAuditTotal]   = useState(0)

  const fetchAudit = useCallback(async (page = 0) => {
    setAuditLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let q = supabase
      .from('audit_log')
      .select('id, actor_name, table_name, record_id, action, created_at, station_id', { count: 'exact' })
      .gte('created_at', auditFrom + 'T00:00:00')
      .lte('created_at', auditTo   + 'T23:59:59')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (auditTable !== 'all') q = q.eq('table_name', auditTable)

    // فلتر المحطة
    if (isGeneralAdmin) {
      if (auditStation !== 'all') {
        const sid = auditStation === 'mine' ? profile?.station?.id : auditStation
        if (sid) q = q.eq('station_id', sid)
      }
    } else {
      // المشرف: محطته فقط دائماً
      const sid = profile?.station?.id
      if (sid) q = q.eq('station_id', sid)
    }

    const { data: rows, error, count } = await q
    if (!error) { setAuditRows(rows ?? []); setAuditTotal(count ?? 0); setAuditPage(page) }
    setAuditLoading(false)
  }, [auditFrom, auditTo, auditTable, auditStation, isGeneralAdmin, profile?.station?.id])

  useEffect(() => { if (canSeeAudit) fetchAudit(0) }, [canSeeAudit, fetchAudit])

  const seesAll = isGeneralAdmin   // الأدمن فقط؛ المحاسب محصور بمحطته

  // جلب المحطات: الكل للأدمن/المحاسب، والمعيّنة للمشرف
  useEffect(() => {
    if (seesAll) {
      supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_ar')
        .then(({ data }) => setStations((data ?? []).filter(s => !isRestStation(s))))
    } else if ((isStationAdmin || isAccountant) && profile?.id) {
      supabase.from('user_stations').select('station:station_id(id, name_ar, name_en)').eq('user_id', profile.id)
        .then(({ data }) => {
          let sts = (data ?? []).map(r => r.station).filter(Boolean).filter(s => !isRestStation(s))
          if (!sts.length && profile?.station) sts = [profile.station]
          setStations(sts)
        })
    } else if (profile?.station) {
      setStations([profile.station])
    }
  }, [seesAll, isStationAdmin, isAccountant, profile?.id])

  const myStationIds = stations.map(s => s.id)

  const runReport = useCallback(async () => {
    setLoading(true)
    // تطبيق نطاق المحطة: محطة محددة، أو كل محطات المشرف، أو الكل للأدمن
    const scope = q => {
      if (station !== 'all') return q.eq('station_id', station)
      if (!seesAll && myStationIds.length) return q.in('station_id', myStationIds)
      return q
    }
    const [tripsRes, salesRes, lostRes, stationTripsRes, stopsRes] = await Promise.all([
      scope(supabase.from('trip_records').select(`
        id, trip_schedule_id, record_date, station_id, departure_accuracy, operational_status,
        passenger_count, missed_count, missed_tickets, is_cancelled, is_extra_trip,
        bus_number, screen_works, wheelchair_works, toilet_works,
        actual_departure, actual_arrival, is_arrival,
        station:station_id(name_ar, name_en),
        trip:trip_schedule_id(trip_number, from_station_id, to_station_id, scheduled_departure, scheduled_arrival, from_station:from_station_id(id,name_ar,name_en), to_station:to_station_id(id,name_ar,name_en))
      `).gte('record_date', dateFrom).lte('record_date', dateTo)),

      scope(supabase.from('sales_records').select(`
        id, sale_date, shift, total_actual, total_expected,
        surplus_deficit, is_confirmed, station:station_id(name_ar, name_en)
      `).gte('sale_date', dateFrom).lte('sale_date', dateTo)),

      scope(supabase.from('lost_found_items').select(`
        id, status, found_date, item_type
      `).gte('found_date', dateFrom).lte('found_date', dateTo)),

      (() => {
        let q = supabase.from('station_trips').select(`
          trip_schedule_id, station_id, departure_time, arrival_time,
          dep_enabled, arr_enabled,
          trip:trip_schedule_id(trip_number, from_station_id, to_station_id,
            scheduled_departure, scheduled_arrival, is_active, is_rf, rf_date,
            from_station:from_station_id(id, name_ar,name_en),
            to_station:to_station_id(id, name_ar,name_en))
        `)
        if (station !== 'all') q = q.eq('station_id', station)
        else if (!seesAll && myStationIds.length) q = q.in('station_id', myStationIds)
        return q
      })(),
      supabase.from('trip_schedule_stops').select('trip_schedule_id, station_id, arrival_time, departure_time'),
    ])

    const trips = tripsRes.data ?? []
    const sales = salesRes.data ?? []
    const lost  = lostRes.data  ?? []

    // خريطة أوقات المحطة المخصصة: trip_schedule_id|station_id → {dep, arr}
    const stationTripMap = {}
    ;(stationTripsRes.data ?? []).forEach(st => {
      stationTripMap[`${st.trip_schedule_id}|${st.station_id}`] = st
    })
    // خريطة أوقات المرور: trip_schedule_id|station_id → {arrival_time, departure_time}
    const stopMap = {}
    ;(stopsRes.data ?? []).forEach(s => {
      stopMap[`${s.trip_schedule_id}|${s.station_id}`] = s
    })

    // قائمة المتخلفين (مسطّحة) من كل الرحلات في النطاق
    const missed = []
    trips.forEach(t => {
      (t.missed_tickets ?? []).forEach(m => {
        missed.push({
          date:    t.record_date,
          station: m.station || t.station?.name_ar || t.station?.name_en || '—',
          trip:    t.trip?.trip_number || '—',
          ticket:  m.ticket ?? m,
        })
      })
    })
    missed.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    // الحالة التشغيلية (لا تعمل فقط) — مع رقم الحافلة
    const facilities = []
    trips.forEach(t => {
      const st = t.station?.name_ar || t.station?.name_en || '—'
      const checks = [
        ['الشاشة', t.screen_works],
        ['♿ ويل تشير', t.wheelchair_works],
        ['دورات المياه', t.toilet_works],
      ]
      checks.forEach(([name, ok]) => {
        if (ok === false) facilities.push({
          date: t.record_date, station: st, bus: t.bus_number || '—',
          facility: name, trip: t.trip?.trip_number || '—',
        })
      })
    })
    facilities.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    // حركة الوصول/المغادرة + الإجماليات
    const movements = []
    let depCount = 0, arrCount = 0, missedTotal = 0, paxTotal = 0, depPax = 0, arrPax = 0, depOnTime = 0, depWithSched = 0, arrOnTime = 0, arrWithSched = 0
    const fmtT = v => v ? new Date(v).toISOString().slice(11, 16) : '—'
    const nm = s => s?.name_ar || s?.name_en || '—'
    const accOf = (sch, act) => {
      if (!sch || !act || act === '—') return { key: 'none', label: '—', color: '#9ca3af' }
      const [sh, sm] = sch.split(':').map(Number), [ah, am] = act.split(':').map(Number)
      let d = (ah * 60 + am) - (sh * 60 + sm)
      if (d < -120) d += 1440 // تجاوز منتصف الليل
      if (d < -2) return { key: 'early', label: isAr ? 'مبكر' : 'Early', color: '#2563eb' }
      if (d <= 5) return { key: 'ontime', label: isAr ? 'في الوقت' : 'On Time', color: '#16a34a' }
      if (d <= 15) return { key: 'noton', label: isAr ? 'غير منتظم' : 'Not On Time', color: '#ca8a04' }
      return { key: 'delayed', label: isAr ? 'متأخر' : 'Delayed', color: '#dc2626' }
    }
    trips.forEach(t => {
      const st = nm(t.station)
      const isDestination = t.trip?.to_station?.id === t.station_id || t.trip?.to_station_id === t.station_id
      const isOrigin      = t.trip?.from_station?.id === t.station_id || t.trip?.from_station_id === t.station_id
      // محطة عبور أو إضافة يدوية = مثل TransportationPage: إدخالان (وصول + مغادرة)
      const isTransit     = !isDestination && !isOrigin
      const stEntry  = stationTripMap[`${t.trip_schedule_id}|${t.station_id}`]
      const stopEntry = stopMap[`${t.trip_schedule_id}|${t.station_id}`]

      const pushMovement = (isArr) => {
        const sched = isArr
          ? (stEntry?.arrival_time || stopEntry?.arrival_time || t.trip?.scheduled_arrival)
          : (stEntry?.departure_time || stopEntry?.departure_time || t.trip?.scheduled_departure)
        const schedHHMM = sched ? String(sched).slice(0, 5) : ''
        const actHHMM = fmtT(isArr
          ? (t.actual_arrival ?? t.actual_departure)
          : (t.actual_departure ?? t.actual_arrival))
        const delayMin = (() => {
          if (!schedHHMM || !actHHMM || actHHMM === '—') return null
          const [sh, sm] = schedHHMM.split(':').map(Number)
          const [ah, am] = actHHMM.split(':').map(Number)
          let d = (ah * 60 + am) - (sh * 60 + sm)
          if (d < -120) d += 1440
          return d
        })()
        if (isArr) {
          arrCount++; arrPax += (t.passenger_count || 0)
          if (schedHHMM && actHHMM && actHHMM !== '—') {
            arrWithSched++
            const acc = accOf(schedHHMM, actHHMM)
            if (acc.key === 'ontime' || acc.key === 'early') arrOnTime++
          }
        } else {
          depCount++; depPax += (t.passenger_count || 0)
          if (schedHHMM && actHHMM && actHHMM !== '—') {
            depWithSched++
            const acc = accOf(schedHHMM, actHHMM)
            if (acc.key === 'ontime' || acc.key === 'early') depOnTime++
          }
        }
        movements.push({
          date: t.record_date, station: st, station_id: t.station_id, trip: t.trip?.trip_number || '—',
          bus: t.bus_number || '—',
          type: isArr ? 'arrival' : 'departure',
          from: isArr ? nm(t.trip?.from_station) : st,
          to:   isArr ? st : nm(t.trip?.to_station),
          sched: schedHHMM || '—',
          actual: actHHMM,
          acc: accOf(schedHHMM, actHHMM),
          delay: delayMin,
          missed: t.missed_count || 0,
          pax: t.passenger_count || 0,
        })
      }

      missedTotal += (t.missed_count || 0)
      paxTotal += (t.passenger_count || 0)

      if (isTransit) {
        // محطة عبور: كل سجل له is_arrival خاص به (وصول أو مغادرة)
        const isArr = t.is_arrival != null
          ? t.is_arrival === true
          : (t.actual_arrival != null && t.actual_departure == null)
        pushMovement(isArr)
      } else {
        // وجهة أو منشأ: دائماً من الجدول بغضّ النظر عن is_arrival المحفوظة
        pushMovement(isDestination)
      }
    })
    // اكتشاف الرحلات المجدولة غير المدخلة
    const enteredKeys = new Set(trips.map(t => `${t.trip_schedule_id}|${t.record_date}|${t.station_id}`))
    const stationNameMap = Object.fromEntries(stations.map(s => [s.id, s]))
    const dates = []
    let cur = new Date(dateFrom + 'T12:00:00Z')
    const endD = new Date(dateTo + 'T12:00:00Z')
    while (cur <= endD) { dates.push(cur.toISOString().slice(0, 10)); cur = new Date(cur.getTime() + 86400000) }

    let unenteredCount = 0
    ;(stationTripsRes.data ?? []).forEach(st => {
      const trip = st.trip
      if (!trip?.is_active) return
      const isRF = !!trip.is_rf  // رحلة إضافية — تظهر في تاريخها فقط
      // نفس منطق TransportationPage: المقارنة بـ id من الـ join
      const isDest   = trip.to_station?.id   === st.station_id || trip.to_station_id   === st.station_id
      const isOrigin = trip.from_station?.id === st.station_id || trip.from_station_id === st.station_id
      const stop     = stopMap[`${st.trip_schedule_id}|${st.station_id}`]
      const isTransitST = !isDest && !isOrigin
      const arrOn = st.arr_enabled !== false
      const depOn = st.dep_enabled !== false
      const stnName = stationNameMap[st.station_id]?.name_ar || stationNameMap[st.station_id]?.name_en || nm(trip.from_station)

      const makeUnentered = (date, isArr) => {
        const sched = isArr
          ? (st.arrival_time  || stop?.arrival_time  || trip.scheduled_arrival)
          : (st.departure_time || stop?.departure_time || trip.scheduled_departure)
        return {
          date, station: stnName, station_id: st.station_id, trip: trip.trip_number || '—',
          bus: '—', type: isArr ? 'arrival' : 'departure',
          from: isArr ? nm(trip.from_station) : stnName,
          to:   isArr ? stnName : nm(trip.to_station),
          sched: sched ? String(sched).slice(0, 5) : '—',
          actual: '—',
          acc: { key: 'none', label: isAr ? 'غير مدخلة' : 'Not Entered', color: '#94a3b8' },
          delay: null, missed: 0, pax: 0, unentered: true,
        }
      }

      dates.forEach(date => {
        if (isRF && trip.rf_date !== date) return  // رحلة إضافية: يوم واحد فقط
        const key = `${st.trip_schedule_id}|${date}|${st.station_id}`
        if (enteredKeys.has(key)) return
        if (isDest && arrOn) {
          unenteredCount++
          movements.push(makeUnentered(date, true))
        } else if (isOrigin && depOn) {
          unenteredCount++
          movements.push(makeUnentered(date, false))
        } else if (isTransitST) {
          if (arrOn) { unenteredCount++; movements.push(makeUnentered(date, true)) }
          if (depOn) { unenteredCount++; movements.push(makeUnentered(date, false)) }
        }
      })
    })

    movements.sort((a, b) => {
      const dc = (a.date ?? '').localeCompare(b.date ?? '')
      if (dc !== 0) return dc
      return (a.sched ?? '').localeCompare(b.sched ?? '')
    })

    setData({
      missed,
      facilities,
      movements,
      moveTotals: { dep: depCount, arr: arrCount, missed: missedTotal, pax: paxTotal, depPax, arrPax, unentered: unenteredCount, depOnTimeRate: depWithSched ? Math.round(depOnTime / depWithSched * 100) : null, arrOnTimeRate: arrWithSched ? Math.round(arrOnTime / arrWithSched * 100) : null },
      trips: {
        total:     trips.length,
        onTime:    trips.filter(t => t.departure_accuracy === 'On Time').length,
        delayed:   trips.filter(t => t.departure_accuracy === 'Delayed').length,
        cancelled: trips.filter(t => t.is_cancelled).length,
        extra:     trips.filter(t => t.is_extra_trip).length,
        totalPax:  trips.reduce((s, t) => s + (t.passenger_count ?? 0), 0),
        totalMissed: trips.reduce((s, t) => s + (t.missed_count ?? 0), 0),
        normal:    trips.filter(t => t.operational_status === 'Normal').length,
      },
      sales: {
        totalRevenue:  sales.reduce((s, r) => s + Number(r.total_actual ?? 0), 0),
        totalExpected: sales.reduce((s, r) => s + Number(r.total_expected ?? 0), 0),
        totalSurplus:  sales.reduce((s, r) => s + Number(r.surplus_deficit ?? 0), 0),
        confirmed:     sales.filter(r => r.is_confirmed).length,
        total:         sales.length,
      },
      lost: {
        total:     lost.length,
        unclaimed: lost.filter(l => l.status === 'unclaimed').length,
        claimed:   lost.filter(l => l.status === 'claimed').length,
        disposed:  lost.filter(l => l.status === 'disposed').length,
      },
    })
    setLoading(false)
  }, [dateFrom, dateTo, station, seesAll, stations])

  // تشغيل تلقائي عند تغيّر التاريخ/المحطة
  useEffect(() => { runReport() }, [runReport])

  const onTimeRate = data ? Math.round((data.trips.onTime / (data.trips.total || 1)) * 100) : 0
  const normalRate = data ? Math.round((data.trips.normal / (data.trips.total || 1)) * 100) : 0
  const show = type => reportType === 'all' || reportType === type

  const stationLabel = station === 'all'
    ? (seesAll ? (isAr ? 'جميع المحطات' : 'All stations') : (isAr ? 'محطاتي' : 'My stations'))
    : (() => { const s = stations.find(x => x.id === station); return s ? (isAr ? s.name_ar : s.name_en) : '—' })()

  const tableHtml = (headers, rows) => `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
      <thead><tr style="background:#1B3A6B;color:#fff">
        ${headers.map(h => `<th style="padding:8px;text-align:right">${h}</th>`).join('')}
      </tr></thead>
      <tbody>${rows.map((r, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
        ${r.map(c => `<td style="padding:7px 8px;border-bottom:1px solid #eee">${c}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table>`

  const kpiStrip = items => `<div style="display:flex;flex-wrap:wrap;gap:10px;margin:10px 0">${items.map(it => `<div style="flex:1;min-width:110px;border:1px solid #eef1f6;border-right:3px solid ${it.color};border-radius:7px;padding:10px 12px"><div style="font-size:20px;font-weight:700;color:${it.color}">${it.val}</div><div style="font-size:10px;color:#5a6a8a;margin-top:2px">${it.label}</div></div>`).join('')}</div>`

  function reportBody(type) {
    if (type === 'movements') {
      const T = data.moveTotals
      const deps = data.movements.filter(m => m.type === 'departure')
      const arrs = data.movements.filter(m => m.type === 'arrival')
      const fmtDelay = d => {
        if (d === null) return '—'
        if (d === 0) return '±0'
        return (d > 0 ? '+' : '') + d + (isAr ? ' د' : ' m')
      }
      const delayColor = d => d === null ? '#9ca3af' : d > 5 ? '#dc2626' : d < -2 ? '#2563eb' : '#16a34a'
      const accBadge = acc => {
        const styles = {
          ontime: 'background:#f0fdf4;color:#16a34a;border:0.5px solid #86efac',
          early:  'background:#eff6ff;color:#2563eb;border:0.5px solid #93c5fd',
          noton:  'background:#fffbeb;color:#d97706;border:0.5px solid #fde68a',
          delayed:'background:#fef2f2;color:#dc2626;border:0.5px solid #fca5a5',
          none:   'background:#f1f5f9;color:#94a3b8;border:0.5px solid #e2e8f0',
        }
        return `<span style="border-radius:3px;padding:1px 5px;font-size:8px;font-weight:700;letter-spacing:.2px;${styles[acc.key] || styles.none}">${acc.label}</span>`
      }
      const moveTable = (list, headColor, accentColor, timeLabel) => `
        <div style="display:flex;align-items:center;justify-content:space-between;background:${headColor};color:#fff;padding:5px 10px;font-size:10px;font-weight:700;border-top:3px solid ${accentColor}">
          <span>${timeLabel === (isAr ? 'المغادرة' : 'Dep') ? (isAr ? 'رحلات المغادرة' : 'Departures') : (isAr ? 'رحلات الوصول' : 'Arrivals')}</span>
          <span style="background:rgba(255,255,255,.15);border-radius:20px;padding:1px 8px;font-size:8px">${list.length} ${isAr ? 'رحلة' : 'trips'}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:8px">
          <thead><tr style="background:#f8fafc">
            <th style="padding:4px 6px;text-align:center;color:#94a3b8;border-bottom:1.5px solid #e2e8f0;font-weight:700">#</th>
            <th style="padding:4px 6px;text-align:right;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'التاريخ' : 'Date'}</th>
            <th style="padding:4px 6px;text-align:right;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'رقم الرحلة' : 'Trip'}</th>
            <th style="padding:4px 6px;text-align:right;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'الحافلة' : 'Bus'}</th>
            <th style="padding:4px 6px;text-align:right;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'من' : 'From'}</th>
            <th style="padding:4px 6px;text-align:right;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'إلى' : 'To'}</th>
            <th style="padding:4px 6px;text-align:center;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'المجدول' : 'Sched.'}</th>
            <th style="padding:4px 6px;text-align:center;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'الفعلي' : 'Actual'}</th>
            <th style="padding:4px 6px;text-align:center;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'التأخير' : 'Delay'}</th>
            <th style="padding:4px 6px;text-align:center;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'الحالة' : 'Status'}</th>
            <th style="padding:4px 6px;text-align:center;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'الركاب' : 'Pax'}</th>
            <th style="padding:4px 6px;text-align:center;color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${isAr ? 'المتخلفون' : 'Missed'}</th>
          </tr></thead>
          <tbody>${list.map((m, i) => `<tr style="background:${m.unentered ? '#fffbeb' : i % 2 ? '#f8fafc' : '#fff'}">
            <td style="padding:4px 6px;text-align:center;border-bottom:0.5px solid #f1f5f9;color:#cbd5e1;font-size:8px">${i + 1}</td>
            <td style="padding:4px 6px;border-bottom:0.5px solid #f1f5f9;font-size:8px">${m.date}</td>
            <td style="padding:4px 6px;border-bottom:0.5px solid #f1f5f9;font-family:monospace;font-weight:700;color:${m.unentered ? '#92400e' : headColor};font-size:9px">${m.trip}</td>
            <td style="padding:4px 6px;border-bottom:0.5px solid #f1f5f9;font-family:monospace;font-weight:600;color:#475569;font-size:9px">${m.bus}</td>
            <td style="padding:4px 6px;border-bottom:0.5px solid #f1f5f9;font-size:8px">${m.from}</td>
            <td style="padding:4px 6px;border-bottom:0.5px solid #f1f5f9;font-size:8px">${m.to}</td>
            <td style="padding:4px 6px;text-align:center;font-family:monospace;border-bottom:0.5px solid #f1f5f9;font-size:9px">${m.sched}</td>
            <td style="padding:4px 6px;text-align:center;font-family:monospace;border-bottom:0.5px solid #f1f5f9;font-size:9px;color:${delayColor(m.delay)}">${m.actual}</td>
            <td style="padding:4px 6px;text-align:center;border-bottom:0.5px solid #f1f5f9;color:${delayColor(m.delay)};font-weight:700;font-size:8px">${fmtDelay(m.delay)}</td>
            <td style="padding:4px 6px;text-align:center;border-bottom:0.5px solid #f1f5f9">${m.unentered ? '<span style="border-radius:3px;padding:1px 5px;font-size:8px;font-weight:700;background:#fef3c7;color:#b45309;border:0.5px solid #fcd34d">⚠ غير مدخلة</span>' : accBadge(m.acc)}</td>
            <td style="padding:4px 6px;text-align:center;font-family:monospace;border-bottom:0.5px solid #f1f5f9;font-weight:600">${m.pax || ''}</td>
            <td style="padding:4px 6px;text-align:center;font-family:monospace;color:#dc2626;font-weight:700;border-bottom:0.5px solid #f1f5f9">${m.missed || ''}</td>
          </tr>`).join('')}</tbody>
        </table>`

      const kpiBar = `
        <div style="display:grid;grid-template-columns:repeat(5,1fr);background:#1C2B36;margin-bottom:0">
          ${[
            { val: T.dep,    lbl: isAr ? 'رحلات المغادرة'  : 'Departures',     accent: '#38bdf8' },
            { val: T.arr,    lbl: isAr ? 'رحلات الوصول'    : 'Arrivals',        accent: '#34d399' },
            { val: T.depPax, lbl: isAr ? 'ركاب المغادرة'   : 'Dep. Passengers', accent: '#818cf8' },
            { val: T.arrPax, lbl: isAr ? 'ركاب الوصول'     : 'Arr. Passengers', accent: '#22d3ee' },
            { val: T.missed, lbl: isAr ? 'المتخلفون'        : 'Missed',          accent: '#f87171' },
          ].map((k, i) => `<div style="padding:9px 8px;text-align:center;border-left:${i < 4 ? '1px solid rgba(255,255,255,.1)' : 'none'};position:relative">
            <div style="font-size:18px;font-weight:700;color:#fff;line-height:1">${k.val}</div>
            <div style="font-size:7.5px;color:rgba(255,255,255,.6);margin-top:3px;letter-spacing:.3px">${k.lbl}</div>
            <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${k.accent}"></div>
          </div>`).join('')}
        </div>`

      const summaryBar = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:2px solid #1C2B36;margin-top:4px">
          ${[
            { val: T.depPax, lbl: isAr ? 'إجمالي ركاب المغادرة' : 'Total Dep. Passengers', bg: '#e8edf8', color: '#1C2B36' },
            { val: T.arrPax, lbl: isAr ? 'إجمالي ركاب الوصول'   : 'Total Arr. Passengers', bg: '#e6f4f1', color: '#23695A' },
            { val: T.missed, lbl: isAr ? 'إجمالي المتخلفين'      : 'Total Missed',           bg: '#fef2f2', color: '#dc2626' },
          ].map((s, i) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-left:${i < 2 ? '0.5px solid #e2e8f0' : 'none'}">
            <div style="width:32px;height:32px;border-radius:7px;background:${s.bg};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${s.color};flex-shrink:0">${s.val}</div>
            <div>
              <div style="font-size:16px;font-weight:700;color:${s.color};line-height:1">${s.val}</div>
              <div style="font-size:8px;color:#64748b;margin-top:2px">${s.lbl}</div>
            </div>
          </div>`).join('')}
        </div>`

      return `
        ${kpiBar}
        ${deps.length ? moveTable(deps, '#1C2B36', '#38bdf8', isAr ? 'المغادرة' : 'Dep') : '<div style="font-size:11px;color:#999;padding:8px">—</div>'}
        ${arrs.length ? moveTable(arrs, '#23695A', '#34d399', isAr ? 'الوصول' : 'Arr') : '<div style="font-size:11px;color:#999;padding:8px">—</div>'}
        ${summaryBar}`
    }
    if (type === 'compliance') {
      const arrivals = data.movements.filter(m => m.type === 'arrival')
      const S = complianceStats(arrivals)
      const rateColor = r => r === null ? '#9ca3af' : r >= 80 ? '#16a34a' : r >= 60 ? '#d97706' : '#dc2626'
      const fmtDelay = d => d === null ? '—' : (d === 0 ? '±0' : (d > 0 ? '+' : '') + d + (isAr ? ' د' : ' m'))
      // ملخص لكل محطة
      const byStation = {}
      arrivals.forEach(m => { (byStation[m.station] = byStation[m.station] || []).push(m) })
      const stationRows = Object.entries(byStation).map(([name, list]) => {
        const s = complianceStats(list)
        return [name, s.total, s.measured, s.ontime + s.early, s.noton, s.delayed,
          s.rate === null ? '—' : `<b style="color:${rateColor(s.rate)}">${s.rate}%</b>`,
          fmtDelay(s.avgDelay), fmtDelay(s.maxDelay)]
      }).sort((a, b) => b[1] - a[1])
      const detail = arrivals.filter(m => !m.unentered && m.delay !== null)
        .sort((a, b) => (b.delay ?? -9999) - (a.delay ?? -9999))
      return `
        ${kpiStrip([
          { val: S.total, label: isAr ? 'رحلات الوصول' : 'Arrivals', color: '#23695A' },
          { val: S.measured, label: isAr ? 'مُقاسة (وقت مجدول + فعلي)' : 'Measured', color: '#1C2B36' },
          { val: S.rate === null ? '—' : S.rate + '%', label: isAr ? 'نسبة الالتزام' : 'On-Time %', color: rateColor(S.rate) },
          { val: fmtDelay(S.avgDelay), label: isAr ? 'متوسط التأخير' : 'Avg Delay', color: '#ca8a04' },
          { val: S.delayed, label: isAr ? 'متأخرة (>15د)' : 'Delayed (>15m)', color: '#dc2626' },
        ])}
        <div style="background:#23695A;color:#fff;padding:5px 10px;font-size:10px;font-weight:700;margin-top:6px">${isAr ? 'الالتزام حسب المحطة' : 'Punctuality by station'}</div>
        ${tableHtml(
          [isAr ? 'المحطة' : 'Station', isAr ? 'الوصول' : 'Arrivals', isAr ? 'مُقاسة' : 'Measured', isAr ? 'في الوقت' : 'On Time', isAr ? 'غير منتظم' : 'Not On Time', isAr ? 'متأخر' : 'Delayed', isAr ? 'النسبة' : 'Rate', isAr ? 'متوسط التأخير' : 'Avg', isAr ? 'أقصى تأخير' : 'Max'],
          stationRows)}
        <div style="background:#1C2B36;color:#fff;padding:5px 10px;font-size:10px;font-weight:700;margin-top:8px">${isAr ? 'تفاصيل الوصول (الأكثر تأخراً أولاً)' : 'Arrival details (most delayed first)'}</div>
        ${tableHtml(
          [isAr ? 'التاريخ' : 'Date', isAr ? 'المحطة' : 'Station', isAr ? 'الرحلة' : 'Trip', isAr ? 'الحافلة' : 'Bus', isAr ? 'من' : 'From', isAr ? 'المجدول' : 'Sched.', isAr ? 'الفعلي' : 'Actual', isAr ? 'التأخير' : 'Delay', isAr ? 'الحالة' : 'Status'],
          detail.map(m => [m.date, m.station, m.trip, m.bus, m.from, m.sched, m.actual,
            `<b style="color:${m.delay > 5 ? '#dc2626' : m.delay < -2 ? '#2563eb' : '#16a34a'}">${fmtDelay(m.delay)}</b>`,
            `<span style="color:${m.acc?.color}">${m.acc?.label ?? '—'}</span>`]))}`
    }
    if (type === 'missed')
      return tableHtml([isAr ? 'التاريخ' : 'Date', isAr ? 'المحطة' : 'Station', isAr ? 'رقم الرحلة' : 'Trip', isAr ? 'رقم التذكرة' : 'Ticket'],
        data.missed.map(m => [m.date, m.station, m.trip, m.ticket]))
    if (type === 'facilities')
      return tableHtml([isAr ? 'التاريخ' : 'Date', isAr ? 'المحطة' : 'Station', isAr ? 'رقم الحافلة' : 'Bus', isAr ? 'التجهيز المعطّل' : 'Faulty', isAr ? 'رقم الرحلة' : 'Trip'],
        data.facilities.map(f => [f.date, f.station, f.bus, f.facility, f.trip]))
    if (type === 'transport') {
      const T = data.moveTotals
      return kpiStrip([
        { val: T.arr,    label: isAr ? 'رحلات الوصول'          : 'Arrival Trips',    color: '#23695A' },
        { val: T.dep,    label: isAr ? 'رحلات المغادرة'         : 'Departure Trips',  color: '#1C2B36' },
        { val: T.arrPax, label: isAr ? 'ركاب الوصول'           : 'Arrival Pax',      color: '#23695A' },
        { val: T.depPax, label: isAr ? 'ركاب المغادرة'         : 'Departure Pax',    color: '#1C2B36' },
        { val: T.arrOnTimeRate != null ? T.arrOnTimeRate + '%' : '—', label: isAr ? 'نسبة الالتزام بالوصول'  : 'Arr. On-Time %', color: '#23695A' },
        { val: T.depOnTimeRate != null ? T.depOnTimeRate + '%' : '—', label: isAr ? 'نسبة الالتزام بالمغادرة' : 'Dep. On-Time %', color: '#16a34a' },
        { val: data.trips.totalMissed, label: isAr ? 'التخلف'  : 'Missed',           color: '#c0392b' },
      ])
    }
    if (type === 'sales')
      return kpiStrip([
        { val: fmt(data.sales.totalRevenue), label: isAr ? 'الإيرادات (ر.س)' : 'Revenue', color: '#16a34a' },
        { val: fmt(data.sales.totalExpected), label: isAr ? 'المتوقع (ر.س)' : 'Expected', color: '#1C2B36' },
        { val: fmt(data.sales.totalSurplus), label: isAr ? 'الفرق (ر.س)' : 'Diff', color: data.sales.totalSurplus >= 0 ? '#16a34a' : '#c0392b' },
        { val: `${data.sales.confirmed}/${data.sales.total}`, label: isAr ? 'مؤكدة' : 'Confirmed', color: '#ca8a04' },
      ])
    if (type === 'lost')
      return kpiStrip([
        { val: data.lost.total, label: isAr ? 'إجمالي الأغراض' : 'Total', color: '#1C2B36' },
        { val: data.lost.unclaimed, label: isAr ? 'غير مستلمة' : 'Unclaimed', color: '#ca8a04' },
        { val: data.lost.claimed, label: isAr ? 'مستلمة' : 'Claimed', color: '#16a34a' },
      ])
    return ''
  }

  const REPORT_LABEL = {
    all: isAr ? 'تقرير شامل' : 'Full Report',
    movements: isAr ? 'تقرير الوصول والمغادرة' : 'Arrivals & Departures',
    compliance: isAr ? 'الالتزام بمواعيد الوصول' : 'Arrival Punctuality',
    transport: isAr ? 'ملخص الترحيل' : 'Transportation',
    missed: isAr ? 'المتخلفون عن الرحلات' : 'Missed Passengers', facilities: isAr ? 'الحالة التشغيلية' : 'Faulty Facilities',
    sales: isAr ? 'ملخص المبيعات' : 'Sales', lost: isAr ? 'الموجودات' : 'Lost & Found',
  }

  function printStationsReport() {
    if (!data) return
    const cleanIds = printStationIds.filter(id => id !== '__none__')
    const targetIds = cleanIds.length ? cleanIds : stations.map(s => s.id)
    const targetStations = stations.filter(s => targetIds.includes(s.id))

    const fmtDelay = d => d === null ? '—' : (d === 0 ? '±0' : (d > 0 ? '+' : '') + d + (isAr ? ' د' : ' m'))
    const delayColor = d => d === null ? '#9ca3af' : d > 5 ? '#dc2626' : d < -2 ? '#2563eb' : '#16a34a'
    const accBadge = acc => {
      const styles = { ontime:'background:#f0fdf4;color:#16a34a;border:0.5px solid #86efac', early:'background:#eff6ff;color:#2563eb;border:0.5px solid #93c5fd', noton:'background:#fffbeb;color:#d97706;border:0.5px solid #fde68a', delayed:'background:#fef2f2;color:#dc2626;border:0.5px solid #fca5a5', none:'background:#f1f5f9;color:#94a3b8;border:0.5px solid #e2e8f0' }
      return `<span style="border-radius:3px;padding:1px 5px;font-size:8px;font-weight:700;${styles[acc?.key]||styles.none}">${acc?.label||'—'}</span>`
    }
    const moveTable = (list, headColor, title) => {
      if (!list.length) return `<div style="font-size:9px;color:#94a3b8;padding:4px 0">${title}: —</div>`
      return `
        <div style="background:${headColor};color:#fff;padding:4px 8px;font-size:9px;font-weight:700;margin-top:6px">${title} (${list.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:8px">
          <thead><tr style="background:#f8fafc">
            ${['#', isAr?'رقم الرحلة':'Trip', isAr?'الحافلة':'Bus', isAr?'من':'From', isAr?'إلى':'To', isAr?'المجدول':'Sched.', isAr?'الفعلي':'Actual', isAr?'التأخير':'Delay', isAr?'الحالة':'Status', isAr?'الركاب':'Pax', isAr?'المتخلفون':'Missed'].map(h=>`<th style="padding:3px 5px;text-align:${h==='#'?'center':'right'};color:#475569;border-bottom:1.5px solid #e2e8f0;font-weight:700">${h}</th>`).join('')}
          </tr></thead>
          <tbody>${list.map((m,i)=>`<tr style="background:${m.unentered?'#fffbeb':i%2?'#f8fafc':'#fff'}">
            <td style="padding:3px 5px;text-align:center;color:#cbd5e1;font-size:7px">${i+1}</td>
            <td style="padding:3px 5px;font-family:monospace;font-weight:700;color:${m.unentered?'#92400e':headColor};font-size:8px">${m.trip}</td>
            <td style="padding:3px 5px;font-family:monospace;font-weight:600;color:#475569">${m.bus}</td>
            <td style="padding:3px 5px;font-size:7px">${m.from}</td>
            <td style="padding:3px 5px;font-size:7px">${m.to}</td>
            <td style="padding:3px 5px;text-align:center;font-family:monospace">${m.sched}</td>
            <td style="padding:3px 5px;text-align:center;font-family:monospace;color:${delayColor(m.delay)}">${m.actual}</td>
            <td style="padding:3px 5px;text-align:center;color:${delayColor(m.delay)};font-weight:700">${fmtDelay(m.delay)}</td>
            <td style="padding:3px 5px;text-align:center">${m.unentered?'<span style="font-size:7px;color:#b45309">⚠ غير مدخلة</span>':accBadge(m.acc)}</td>
            <td style="padding:3px 5px;text-align:center;font-family:monospace">${m.pax||''}</td>
            <td style="padding:3px 5px;text-align:center;font-family:monospace;color:#dc2626;font-weight:700">${m.missed||''}</td>
          </tr>`).join('')}</tbody>
        </table>`
    }

    const calcRate = (list) => {
      const withSched = list.filter(m => m.sched && m.sched !== '—' && m.actual && m.actual !== '—' && !m.unentered)
      if (!withSched.length) return null
      const onTime = withSched.filter(m => m.acc?.key === 'ontime' || m.acc?.key === 'early').length
      return Math.round(onTime / withSched.length * 100)
    }

    const pages = targetStations.map((stn, idx) => {
      const stMoves = data.movements.filter(m => m.station_id === stn.id)
      const deps = stMoves.filter(m => m.type === 'departure')
      const arrs = stMoves.filter(m => m.type === 'arrival')
      const stnName = isAr ? stn.name_ar : stn.name_en
      const depPax = deps.reduce((s,m)=>s+(m.pax||0),0)
      const arrPax = arrs.reduce((s,m)=>s+(m.pax||0),0)
      const missed = stMoves.reduce((s,m)=>s+(m.missed||0),0)
      const depRate = calcRate(deps)
      const arrRate = calcRate(arrs)
      const rateCell = (rate, color) => rate === null ? '—' : `<span style="font-weight:700;color:${rate>=80?'#16a34a':rate>=60?'#d97706':'#dc2626'}">${rate}%</span>`

      const kpiBar = `
        <div style="display:grid;grid-template-columns:repeat(7,1fr);background:#1C2B36;color:#fff;text-align:center">
          ${[
            { val: deps.length, lbl: isAr?'رحلات المغادرة':'Departures', accent:'#38bdf8' },
            { val: arrs.length, lbl: isAr?'رحلات الوصول':'Arrivals', accent:'#34d399' },
            { val: depPax,      lbl: isAr?'ركاب المغادرة':'Dep. Pax', accent:'#818cf8' },
            { val: arrPax,      lbl: isAr?'ركاب الوصول':'Arr. Pax', accent:'#22d3ee' },
            { val: missed,      lbl: isAr?'المتخلفون':'Missed', accent:'#f87171' },
            { val: rateCell(depRate), lbl: isAr?'التزام المغادرة':'Dep. On-Time', accent:'#38bdf8' },
            { val: rateCell(arrRate), lbl: isAr?'التزام الوصول':'Arr. On-Time', accent:'#34d399' },
          ].map((k,i)=>`<div style="padding:7px 4px;border-left:${i>0?'1px solid rgba(255,255,255,.1)':'none'};position:relative">
            <div style="font-size:15px;font-weight:700;color:#fff;line-height:1">${k.val}</div>
            <div style="font-size:7px;color:rgba(255,255,255,.6);margin-top:2px">${k.lbl}</div>
            <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:${k.accent}"></div>
          </div>`).join('')}
        </div>`

      return `
        <div style="page-break-after:${idx < targetStations.length-1 ? 'always' : 'avoid'}">
          <div style="background:#1C2B36;color:#fff;padding:8px 16px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:14px;font-weight:700">${stnName}</div>
              <div style="font-size:8px;opacity:.7;margin-top:2px">${isAr?'تقرير الوصول والمغادرة':'Arrivals & Departures'} · ${dateFrom} → ${dateTo}</div>
            </div>
            <div style="font-size:10px;font-weight:800;letter-spacing:1px;opacity:.7">NORTH WEST BUS</div>
          </div>
          ${kpiBar}
          <div style="padding:0 4px">
            ${moveTable(deps, '#1C2B36', isAr?'رحلات المغادرة':'Departures')}
            ${moveTable(arrs, '#23695A', isAr?'رحلات الوصول':'Arrivals')}
          </div>
          <div style="margin-top:6px;padding:4px 10px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8">
            <span>${profile?.full_name_ar??'—'} · ${new Date().toLocaleString('en-GB')}</span>
            <span>${isAr?'التخلف:':'Missed:'} ${missed} &nbsp;|&nbsp; ${isAr?'ركاب المغادرة:':'Dep. Pax:'} ${depPax} &nbsp;|&nbsp; ${isAr?'ركاب الوصول:':'Arr. Pax:'} ${arrPax}</span>
          </div>
        </div>`
    }).join('')

    const html = `<div style="font-family:IBM Plex Sans Arabic,Arial,sans-serif;direction:rtl;color:#1a2233;background:#fff">${pages}</div>`
    const style = document.createElement('style')
    style.textContent = `@page{size:A4 landscape;margin:5mm}@media print{body>*:not(#__stprint){display:none!important}#__stprint{display:block!important;position:static!important;width:100%!important}#__stprint *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}`
    document.head.appendChild(style)
    const div = document.createElement('div')
    div.id = '__stprint'
    div.style.cssText = 'position:fixed;top:-99999px;left:0;width:100%'
    div.innerHTML = html
    document.body.appendChild(div)
    try { window.print() } finally { document.body.removeChild(div); document.head.removeChild(style) }
  }

  function printReport() {
    const types = reportType === 'all' ? ['movements', 'compliance', 'transport', 'missed', 'facilities', 'sales', 'lost'] : [reportType]

    // header احترافي موحّد لجميع الأقسام
    const printHeader = `
      <div style="background:#1C2B36;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:0">
        <div>
          <div style="font-size:15px;font-weight:700;letter-spacing:.2px">${REPORT_LABEL[reportType]}</div>
          <div style="font-size:9px;opacity:.7;margin-top:3px">الفترة: ${dateFrom} → ${dateTo} &nbsp;·&nbsp; المحطة: ${stationLabel}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:16px;font-weight:800;letter-spacing:1px">NORTH WEST BUS</div>
          <div style="width:36px;height:2px;background:#38bdf8;margin:3px auto"></div>
          <div style="font-size:9px;opacity:.6;letter-spacing:.5px">نورث وست باص</div>
        </div>
        <div style="width:200px"></div>
      </div>`

    const sections = types.map((tp, idx) => {
      const body = reportBody(tp)
      const sectionHeader = types.length > 1
        ? `<div style="background:#f1f5f9;border-right:3px solid #1C2B36;padding:5px 10px;font-size:11px;font-weight:700;color:#1C2B36;margin-top:${idx > 0 ? '10px' : '0'}">${REPORT_LABEL[tp]}</div>`
        : ''
      return sectionHeader + body
    }).join('')

    const html = `
      <div style="font-family:IBM Plex Sans Arabic,Arial,sans-serif;direction:rtl;color:#1a2233;background:#fff">
        ${printHeader}
        <div style="padding:0 4px">${sections}</div>
        <div style="margin-top:8px;padding:6px 12px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:9px;color:#94a3b8">${profile?.full_name_ar ?? '—'} · ${new Date().toLocaleString('en-GB')}</span>
          <span style="background:#1C2B36;color:#fff;font-size:8px;font-weight:700;padding:2px 8px;border-radius:20px;letter-spacing:.5px">NORTH WEST BUS</span>
        </div>
      </div>`

    const style = document.createElement('style')
    style.textContent = `
      @page { size: A4 landscape; margin: 6mm; }
      @media print {
        body > *:not(#__print){display:none!important}
        #__print{display:block!important;position:static!important;top:auto!important;width:100%!important;font-size:9px!important}
        #__print *{box-sizing:border-box; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important}
        #__print table{font-size:8px!important}
        #__print th, #__print td{padding:3px 5px!important}
        #__print svg{max-height:70px!important}
        #__print div[style*="margin-bottom:10px"]{margin-bottom:4px!important}
        #__print div[style*="margin-top:18px"]{margin-top:6px!important}
        #__print div[style*="padding:14px"]{padding:6px!important}
      }`
    document.head.appendChild(style)
    const div = document.createElement('div')
    div.id = '__print'
    div.style.cssText = 'position:fixed;top:-99999px;left:0;width:100%'
    div.innerHTML = html
    document.body.appendChild(div)
    try { window.print() } finally { document.body.removeChild(div); document.head.removeChild(style) }
  }

  function exportCompliance() {
    const arrivals = data.movements.filter(m => m.type === 'arrival' && !m.unentered && m.delay !== null)
      .sort((a, b) => (b.delay ?? -9999) - (a.delay ?? -9999))
    const head = [isAr ? 'التاريخ' : 'Date', isAr ? 'المحطة' : 'Station', isAr ? 'رقم الرحلة' : 'Trip',
      isAr ? 'رقم الحافلة' : 'Bus', isAr ? 'من' : 'From', isAr ? 'المجدول' : 'Scheduled',
      isAr ? 'الفعلي' : 'Actual', isAr ? 'التأخير (دقيقة)' : 'Delay (min)', isAr ? 'الحالة' : 'Status']
    const rows = [head, ...arrivals.map(m => [m.date, m.station, m.trip, m.bus, m.from, m.sched, m.actual, m.delay, m.acc?.label ?? ''])]
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `arrival_compliance_${dateFrom}_${dateTo}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  function exportMissed() {
    const head = [isAr ? 'التاريخ' : 'Date', isAr ? 'المحطة' : 'Station', isAr ? 'رقم الرحلة' : 'Trip', isAr ? 'رقم التذكرة' : 'Ticket']
    const rows = [head, ...data.missed.map(m => [m.date, m.station, m.trip, m.ticket])]
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `missed_${dateFrom}_${dateTo}.csv`; a.click()
    URL.revokeObjectURL(url)
  }


  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-xl font-bold text-nwbus-primary mb-5">
        {isAr ? 'التقارير' : 'Reports'}
      </h1>

      {/* Report type + date range */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{isAr ? 'نوع التقرير' : 'Report Type'}</label>
          <select value={reportType} onChange={e => setReportType(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white">
            <option value="all">{isAr ? 'الكل' : 'All'}</option>
            <option value="movements">{isAr ? 'الوصول والمغادرة' : 'Arrivals & Departures'}</option>
            <option value="compliance">{isAr ? 'الالتزام بمواعيد الوصول' : 'Arrival Punctuality'}</option>
            <option value="transport">{isAr ? 'ملخص الترحيل' : 'Transportation'}</option>
            <option value="missed">{isAr ? 'المتخلفون عن الرحلات' : 'Missed Passengers'}</option>
            <option value="facilities">{isAr ? 'الحالة التشغيلية' : 'Faulty Facilities'}</option>
            <option value="sales">{isAr ? 'ملخص المبيعات' : 'Sales'}</option>
            <option value="lost">{isAr ? 'الموجودات' : 'Lost & Found'}</option>
          </select>
        </div>
        {/* Station selector */}
        {stations.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">{isAr ? 'المحطة' : 'Station'}</label>
            <SearchSelect isAr={isAr} value={station} onChange={setStation}
              className="border rounded-lg px-3 py-2 text-sm bg-white min-w-[170px]"
              options={[
                { value: 'all', label: seesAll ? (isAr ? 'جميع المحطات' : 'All stations') : (isAr ? 'كل محطاتي' : 'My stations') },
                ...stations.map(s => ({ value: s.id, label: isAr ? s.name_ar : s.name_en })),
              ]} />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">{isAr ? 'من' : 'From'}</label>
          <DatePicker value={dateFrom} onChange={setDateFrom} isAr={isAr}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{isAr ? 'إلى' : 'To'}</label>
          <DatePicker value={dateTo} onChange={setDateTo} isAr={isAr}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white" />
        </div>
        {data && (
          <button onClick={printReport}
            className="bg-nwbus-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
            {isAr ? 'طباعة التقرير' : 'Print Report'}
          </button>
        )}
        {data && stations.length > 1 && (
          <div className="flex gap-2 items-start">
          <div className="flex flex-col gap-1 relative">
            <button onClick={() => setShowStationPicker(v => !v)}
              className="bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 flex items-center gap-2">
              {isAr ? 'طباعة تقرير المحطات' : 'Print Stations Report'}
              <span className="text-xs opacity-70">
                {printStationIds[0] === '__none__' ? (isAr ? '(لا شيء)' : '(None)') : printStationIds.length ? `(${printStationIds.length})` : isAr ? '(الكل)' : '(All)'}
              </span>
            </button>
            {showStationPicker && (
              <div className="absolute z-50 mt-10 bg-white rounded-xl shadow-xl border p-3 min-w-[240px] max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between mb-2 border-b pb-2">
                  <span className="text-xs font-bold text-gray-600">{isAr ? 'اختر المحطات للطباعة' : 'Select stations to print'}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => setPrintStationIds([])} title={isAr ? 'تحديد الكل' : 'Select All'} className="w-6 h-6 flex items-center justify-center bg-teal-50 text-teal-700 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors">
                      ✓
                    </button>
                    <button onClick={() => setPrintStationIds(['__none__'])} title={isAr ? 'إلغاء الكل' : 'Deselect All'} className="w-6 h-6 flex items-center justify-center bg-red-50 text-red-500 border border-red-200 rounded-md hover:bg-red-100 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
                {stations.map(s => (
                  <label key={s.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 cursor-pointer text-sm">
                    <input type="checkbox" className="accent-teal-700"
                      checked={printStationIds.length === 0 || printStationIds.includes(s.id)}
                      onChange={() => {
                        if (printStationIds.length === 0) {
                          // كل محطات محددة — اضغط يلغي هذه المحطة
                          setPrintStationIds(stations.map(x => x.id).filter(id => id !== s.id))
                        } else if (printStationIds[0] === '__none__') {
                          // لا شيء محدد — اضغط يحدد هذه فقط
                          setPrintStationIds([s.id])
                        } else {
                          setPrintStationIds(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])
                        }
                      }} />
                    <span>{isAr ? s.name_ar : s.name_en}</span>
                  </label>
                ))}
                <div className="border-t mt-2 pt-2">
                  <button onClick={() => { printStationsReport(); setShowStationPicker(false) }}
                    className="w-full bg-teal-700 text-white py-1.5 rounded-lg text-sm font-semibold hover:opacity-90">
                    {isAr ? 'طباعة الآن' : 'Print Now'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* محطات الوكلاء */}
          <div className="flex flex-col gap-1 relative">
            <button onClick={() => setShowAgentPicker(v => !v)}
              className="bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 flex items-center gap-2">
              {isAr ? 'محطات الوكلاء' : 'Agent Stations'}
              <span className="text-xs opacity-70">
                {printAgentIds[0] === '__none__' ? (isAr ? '(لا شيء)' : '(None)') : printAgentIds.length ? `(${printAgentIds.length})` : isAr ? '(الكل)' : '(All)'}
              </span>
            </button>
            {showAgentPicker && (
              <div className="absolute z-50 mt-10 bg-white rounded-xl shadow-xl border p-3 min-w-[240px] max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between mb-2 border-b pb-2">
                  <span className="text-xs font-bold text-gray-600">{isAr ? 'محطات الوكلاء' : 'Agent Stations'}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => setPrintAgentIds([])} title={isAr ? 'تحديد الكل' : 'Select All'} className="w-6 h-6 flex items-center justify-center bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors">
                      ✓
                    </button>
                    <button onClick={() => setPrintAgentIds(['__none__'])} title={isAr ? 'إلغاء الكل' : 'Deselect All'} className="w-6 h-6 flex items-center justify-center bg-red-50 text-red-500 border border-red-200 rounded-md hover:bg-red-100 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
                {stations.map(s => (
                  <label key={s.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 cursor-pointer text-sm">
                    <input type="checkbox" className="accent-indigo-700"
                      checked={printAgentIds.length === 0 || printAgentIds.includes(s.id)}
                      onChange={() => {
                        if (printAgentIds.length === 0) {
                          setPrintAgentIds(stations.map(x => x.id).filter(id => id !== s.id))
                        } else if (printAgentIds[0] === '__none__') {
                          setPrintAgentIds([s.id])
                        } else {
                          setPrintAgentIds(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])
                        }
                      }} />
                    <span>{isAr ? s.name_ar : s.name_en}</span>
                  </label>
                ))}
                <div className="border-t mt-2 pt-2">
                  <button onClick={() => setShowAgentPicker(false)}
                    className="w-full bg-indigo-700 text-white py-1.5 rounded-lg text-sm font-semibold hover:opacity-90">
                    ✓ {isAr ? 'حفظ الاختيار' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
        )}
        {loading && <span className="text-sm text-gray-400 pb-2">… {isAr ? 'جارٍ التحميل…' : 'Loading…'}</span>}
      </div>

      {data && (
        <div className="space-y-6">

          {/* Transportation summary */}
          {show('transport') && (
          <section>
            <h2 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
              {isAr ? 'ملخص الترحيل' : 'Transportation Summary'}
            </h2>
            <StatStrip items={[
              { label: isAr ? 'رحلات الوصول' : 'Arrival Trips', val: fmtN(data.moveTotals.arr) },
              { label: isAr ? 'رحلات المغادرة' : 'Departure Trips', val: fmtN(data.moveTotals.dep) },
              { label: isAr ? 'ركاب الوصول' : 'Arrival Pax', val: fmtN(data.moveTotals.arrPax) },
              { label: isAr ? 'ركاب المغادرة' : 'Departure Pax', val: fmtN(data.moveTotals.depPax) },
              { label: isAr ? 'الالتزام بالوصول' : 'Arr. On-Time %', val: data.moveTotals.arrOnTimeRate != null ? `${data.moveTotals.arrOnTimeRate}%` : '—', tone: data.moveTotals.arrOnTimeRate != null && data.moveTotals.arrOnTimeRate < 60 ? 'text-red-600' : 'text-green-700' },
              { label: isAr ? 'الالتزام بالمغادرة' : 'Dep. On-Time %', val: data.moveTotals.depOnTimeRate != null ? `${data.moveTotals.depOnTimeRate}%` : '—', tone: data.moveTotals.depOnTimeRate != null && data.moveTotals.depOnTimeRate < 60 ? 'text-red-600' : 'text-green-700' },
              { label: isAr ? 'التخلف' : 'Missed', val: fmtN(data.trips.totalMissed), tone: data.trips.totalMissed > 0 ? 'text-red-600' : '' },
            ]} />
          </section>
          )}

          {/* Arrivals & Departures */}
          {show('movements') && (
          <section>
            <h2 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
              {isAr ? 'تقرير الوصول والمغادرة' : 'Arrivals & Departures'}
            </h2>
            <StatStrip className="mb-3" items={[
              { label: isAr ? 'رحلات المغادرة' : 'Departures', val: data.moveTotals.dep },
              { label: isAr ? 'رحلات الوصول' : 'Arrivals', val: data.moveTotals.arr },
              { label: isAr ? 'ركاب المغادرة' : 'Dep. Pax', val: fmtN(data.moveTotals.depPax) },
              { label: isAr ? 'ركاب الوصول' : 'Arr. Pax', val: fmtN(data.moveTotals.arrPax) },
            ]} />
            {data.moveTotals.unentered > 0 && (
              <div className="mb-3">
                <button
                  onClick={() => setShowUnenteredWarn(v => !v)}
                  className="w-full flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 text-amber-800 text-sm font-semibold text-right"
                >
                  <span>⚠ </span>
                  <span>{data.moveTotals.unentered} {isAr ? 'رحلة غير مدخلة' : 'trips not entered'}</span>
                  <span className="mr-auto text-amber-500 text-xs">{showUnenteredWarn ? (isAr ? '▲ إخفاء' : '▲ hide') : (isAr ? '▼ تفاصيل' : '▼ details')}</span>
                </button>
                {showUnenteredWarn && (
                  <div className="mt-1 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-amber-700 text-xs">
                    {isAr ? 'الرحلات التي لم يُدخل لها سجل ستظهر في الجدول بخلفية صفراء.' : 'Trips without a record appear highlighted in yellow in the table below.'}
                  </div>
                )}
              </div>
            )}
            {(() => {
              const deps = data.movements.filter(m => m.type === 'departure')
              const arrs = data.movements.filter(m => m.type === 'arrival')
              return data.movements.length === 0
                ? <p className="text-center text-gray-400 py-8 text-sm">{isAr ? 'لا توجد حركة في هذه الفترة' : 'No movements in this period'}</p>
                : <><MoveTableComp list={deps} color="#1C2B36" label={isAr ? 'رحلات المغادرة' : 'Departures'} isAr={isAr} storageKey="rpt_deps_open" /><MoveTableComp list={arrs} color="#23695A" label={isAr ? 'رحلات الوصول' : 'Arrivals'} isAr={isAr} storageKey="rpt_arrs_open" /></>
            })()}
          </section>
          )}

          {/* Arrival punctuality */}
          {show('compliance') && (() => {
            const arrivals = data.movements.filter(m => m.type === 'arrival')
            const S = complianceStats(arrivals)
            const fmtDelay = d => d === null ? '—' : (d === 0 ? '±0' : (d > 0 ? '+' : '') + d + (isAr ? ' د' : ' m'))
            const rateTxt = r => r === null ? 'text-gray-400' : r >= 80 ? 'text-green-600' : r >= 60 ? 'text-amber-600' : 'text-red-600'
            const byStation = {}
            arrivals.forEach(m => { (byStation[m.station] = byStation[m.station] || []).push(m) })
            const stationRows = Object.entries(byStation)
              .map(([name, list]) => ({ name, ...complianceStats(list) }))
              .sort((a, b) => b.total - a.total)
            const detail = arrivals.filter(m => !m.unentered && m.delay !== null)
              .sort((a, b) => (b.delay ?? -9999) - (a.delay ?? -9999))
            return (
              <section>
                <CollapseSection
                  label={isAr ? 'الالتزام بمواعيد الوصول' : 'Arrival Punctuality'}
                  sub={`(${S.measured}/${S.total})`}
                  color="#1C2B36"
                  storageKey="rpt_comp_open"
                >
                {detail.length > 0 && (
                  <div className="flex justify-end mb-3">
                    <button onClick={exportCompliance}
                      className="text-xs bg-green-600 text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90">
                      {isAr ? 'تصدير Excel' : 'Export Excel'}
                    </button>
                  </div>
                )}

                {/* KPIs */}
                <StatStrip className="mb-4" items={[
                  { label: isAr ? 'رحلات الوصول' : 'Arrivals', val: fmtN(S.total) },
                  { label: isAr ? 'مُقاسة' : 'Measured', val: fmtN(S.measured) },
                  { label: isAr ? 'نسبة الالتزام' : 'On-Time %', val: S.rate === null ? '—' : `${S.rate}%`, tone: rateTxt(S.rate) },
                  { label: isAr ? 'متوسط التأخير' : 'Avg Delay', val: fmtDelay(S.avgDelay) },
                  { label: isAr ? 'متأخرة (>15د)' : 'Delayed (>15m)', val: fmtN(S.delayed), tone: S.delayed > 0 ? 'text-red-600' : '' },
                ]} />

                {/* توزيع الحالات */}
                {S.measured > 0 && (
                  <div className="flex rounded-xl overflow-hidden mb-4 text-[11px] font-bold text-white text-center" title={isAr ? 'توزيع حالات الوصول' : 'Arrival status distribution'}>
                    {[
                      { n: S.early, c: '#2563eb', l: isAr ? 'مبكر' : 'Early' },
                      { n: S.ontime, c: '#16a34a', l: isAr ? 'في الوقت' : 'On Time' },
                      { n: S.noton, c: '#ca8a04', l: isAr ? 'غير منتظم' : 'Not On Time' },
                      { n: S.delayed, c: '#dc2626', l: isAr ? 'متأخر' : 'Delayed' },
                    ].filter(x => x.n > 0).map(x => (
                      <div key={x.l} style={{ background: x.c, width: `${x.n / S.measured * 100}%`, minWidth: 40 }} className="py-1.5">
                        {x.l} {x.n}
                      </div>
                    ))}
                  </div>
                )}

                {/* الالتزام حسب المحطة */}
                <div className="bg-white rounded-2xl shadow overflow-hidden mb-4">
                  <div className="bg-teal-700 text-white text-xs font-bold px-4 py-2">
                    {isAr ? 'الالتزام حسب المحطة' : 'Punctuality by station'}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600 text-xs">
                        <tr>
                          <th className="px-3 py-2 text-right font-semibold">{isAr ? 'المحطة' : 'Station'}</th>
                          <th className="px-3 py-2 text-center font-semibold">{isAr ? 'الوصول' : 'Arrivals'}</th>
                          <th className="px-3 py-2 text-center font-semibold">{isAr ? 'مُقاسة' : 'Measured'}</th>
                          <th className="px-3 py-2 text-center font-semibold">{isAr ? 'في الوقت' : 'On Time'}</th>
                          <th className="px-3 py-2 text-center font-semibold">{isAr ? 'غير منتظم' : 'Not On Time'}</th>
                          <th className="px-3 py-2 text-center font-semibold">{isAr ? 'متأخر' : 'Delayed'}</th>
                          <th className="px-3 py-2 text-center font-semibold">{isAr ? 'النسبة' : 'Rate'}</th>
                          <th className="px-3 py-2 text-center font-semibold">{isAr ? 'متوسط التأخير' : 'Avg Delay'}</th>
                          <th className="px-3 py-2 text-center font-semibold">{isAr ? 'أقصى تأخير' : 'Max Delay'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stationRows.map((s, i) => (
                          <tr key={s.name} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                            <td className="px-3 py-2 font-semibold text-gray-700">{s.name}</td>
                            <td className="px-3 py-2 text-center font-mono">{s.total}</td>
                            <td className="px-3 py-2 text-center font-mono">{s.measured}</td>
                            <td className="px-3 py-2 text-center font-mono text-green-600">{s.ontime + s.early}</td>
                            <td className="px-3 py-2 text-center font-mono text-amber-600">{s.noton}</td>
                            <td className="px-3 py-2 text-center font-mono text-red-600">{s.delayed}</td>
                            <td className={`px-3 py-2 text-center font-bold ${rateTxt(s.rate)}`}>{s.rate === null ? '—' : `${s.rate}%`}</td>
                            <td className="px-3 py-2 text-center font-mono">{fmtDelay(s.avgDelay)}</td>
                            <td className="px-3 py-2 text-center font-mono">{fmtDelay(s.maxDelay)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* التفاصيل — الأكثر تأخراً أولاً */}
                <div className="bg-white rounded-2xl shadow overflow-hidden">
                  <div className="bg-nwbus-primary text-white text-xs font-bold px-4 py-2">
                    {isAr ? 'تفاصيل الوصول (الأكثر تأخراً أولاً)' : 'Arrival details (most delayed first)'}
                  </div>
                  {detail.length === 0 ? (
                    <p className="text-center text-gray-400 py-8 text-sm">{isAr ? 'لا توجد رحلات وصول مُقاسة في هذه الفترة' : 'No measured arrivals in this period'}</p>
                  ) : (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 text-xs sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-right font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                            <th className="px-3 py-2 text-right font-semibold">{isAr ? 'المحطة' : 'Station'}</th>
                            <th className="px-3 py-2 text-right font-semibold">{isAr ? 'الرحلة' : 'Trip'}</th>
                            <th className="px-3 py-2 text-center font-semibold">{isAr ? 'الحافلة' : 'Bus'}</th>
                            <th className="px-3 py-2 text-right font-semibold">{isAr ? 'من' : 'From'}</th>
                            <th className="px-3 py-2 text-center font-semibold">{isAr ? 'المجدول' : 'Sched.'}</th>
                            <th className="px-3 py-2 text-center font-semibold">{isAr ? 'الفعلي' : 'Actual'}</th>
                            <th className="px-3 py-2 text-center font-semibold">{isAr ? 'التأخير' : 'Delay'}</th>
                            <th className="px-3 py-2 text-center font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.map((m, i) => (
                            <tr key={i} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                              <td className="px-3 py-2 text-gray-500 text-xs">{m.date}</td>
                              <td className="px-3 py-2 text-gray-700">{m.station}</td>
                              <td className="px-3 py-2 font-mono font-bold text-nwbus-primary">{m.trip}</td>
                              <td className="px-3 py-2 text-center font-mono">{m.bus}</td>
                              <td className="px-3 py-2 text-gray-600 text-xs">{m.from}</td>
                              <td className="px-3 py-2 text-center font-mono text-gray-500">{m.sched}</td>
                              <td className="px-3 py-2 text-center font-mono">{m.actual}</td>
                              <td className="px-3 py-2 text-center font-bold font-mono"
                                style={{ color: m.delay > 5 ? '#dc2626' : m.delay < -2 ? '#2563eb' : '#16a34a' }}>
                                {fmtDelay(m.delay)}
                              </td>
                              <td className="px-3 py-2 text-center text-xs font-bold" style={{ color: m.acc?.color }}>{m.acc?.label}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                </CollapseSection>
              </section>
            )
          })()}

          {/* Missed passengers table */}
          {show('missed') && (
          <section>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-bold text-gray-600 flex items-center gap-2">
                {isAr ? 'المتخلفون عن الرحلات' : 'Missed Passengers'}
                <span className="text-xs font-normal text-gray-400">({data.missed.length})</span>
              </h2>
              {data.missed.length > 0 && (
                <button onClick={exportMissed}
                  className="text-xs bg-green-600 text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90">
                  {isAr ? 'تصدير Excel' : 'Export Excel'}
                </button>
              )}
            </div>
            <div className="bg-white rounded-2xl shadow overflow-hidden">
              {data.missed.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">{isAr ? 'لا يوجد متخلفون في هذه الفترة' : 'No missed passengers in this period'}</p>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-nwbus-primary text-white sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 text-right font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="px-4 py-2.5 text-right font-semibold">{isAr ? 'المحطة' : 'Station'}</th>
                        <th className="px-4 py-2.5 text-center font-semibold">{isAr ? 'رقم الرحلة' : 'Trip'}</th>
                        <th className="px-4 py-2.5 text-center font-semibold">{isAr ? 'رقم التذكرة' : 'Ticket #'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.missed.map((m, i) => (
                        <tr key={i} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="px-4 py-2 text-gray-500">{m.date}</td>
                          <td className="px-4 py-2 text-gray-700">{m.station}</td>
                          <td className="px-4 py-2 text-center font-mono text-nwbus-primary">{m.trip}</td>
                          <td className="px-4 py-2 text-center font-mono text-red-600 font-semibold">{m.ticket}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          )}

          {/* Faulty facilities table */}
          {show('facilities') && (
          <section>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-bold text-gray-600 flex items-center gap-2">
                {isAr ? 'الحالة التشغيلية' : 'Faulty Facilities'}
                <span className="text-xs font-normal text-gray-400">({data.facilities.length})</span>
              </h2>
            </div>
            <div className="bg-white rounded-2xl shadow overflow-hidden">
              {data.facilities.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">{isAr ? 'جميع التجهيزات تعمل في هذه الفترة ✓' : 'All facilities working ✓'}</p>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-nwbus-primary text-white sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 text-right font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="px-4 py-2.5 text-right font-semibold">{isAr ? 'المحطة' : 'Station'}</th>
                        <th className="px-4 py-2.5 text-center font-semibold">{isAr ? 'رقم الحافلة' : 'Bus #'}</th>
                        <th className="px-4 py-2.5 text-right font-semibold">{isAr ? 'التجهيز المعطّل' : 'Faulty'}</th>
                        <th className="px-4 py-2.5 text-center font-semibold">{isAr ? 'رقم الرحلة' : 'Trip'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.facilities.map((f, i) => (
                        <tr key={i} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="px-4 py-2 text-gray-500">{f.date}</td>
                          <td className="px-4 py-2 text-gray-700">{f.station}</td>
                          <td className="px-4 py-2 text-center font-mono text-nwbus-primary font-bold">{f.bus}</td>
                          <td className="px-4 py-2 text-red-600 font-medium">{f.facility}</td>
                          <td className="px-4 py-2 text-center font-mono text-gray-500">{f.trip}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
          )}

          {/* Sales summary */}
          {show('sales') && (
          <section>
            <h2 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
              {isAr ? 'ملخص المبيعات' : 'Sales Summary'}
            </h2>
            <StatStrip items={[
              { label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue', val: fmt(data.sales.totalRevenue) + ' ر.س', tone: 'text-green-700' },
              { label: isAr ? 'الإجمالي المتوقع' : 'Expected', val: fmt(data.sales.totalExpected) + ' ر.س' },
              { label: isAr ? 'الفرق الكلي' : 'Total Diff',
                val: (data.sales.totalSurplus >= 0 ? '+' : '') + fmt(data.sales.totalSurplus) + ' ر.س',
                tone: data.sales.totalSurplus >= 0 ? 'text-green-700' : 'text-red-600' },
              { label: isAr ? 'مؤكدة' : 'Confirmed', val: `${data.sales.confirmed}/${data.sales.total}` },
            ]} />
          </section>

          )}

          {/* Lost & Found summary */}
          {show('lost') && (
          <section>
            <h2 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
              {isAr ? 'ملخص الموجودات' : 'Lost & Found Summary'}
            </h2>
            <StatStrip items={[
              { label: isAr ? 'إجمالي الأغراض' : 'Total Items', val: fmtN(data.lost.total) },
              { label: isAr ? 'غير مستلمة' : 'Unclaimed', val: fmtN(data.lost.unclaimed), tone: data.lost.unclaimed > 0 ? 'text-amber-700' : '' },
              { label: isAr ? 'مستلمة' : 'Claimed', val: fmtN(data.lost.claimed), tone: 'text-green-700' },
            ]} />
          </section>
          )}

        </div>
      )}

      {/* ─── سجل التدقيق ─── */}
      {canSeeAudit && (() => {
        const TABLE_LABELS = {
          trip_records:   isAr ? 'سجلات الرحلات'  : 'Trip records',
          sales_records:  isAr ? 'سجلات المبيعات' : 'Sales records',
          lost_found_items: isAr ? 'المفقودات'    : 'Lost & Found',
          users:          isAr ? 'المستخدمون'     : 'Users',
        }
        const totalPages = Math.ceil(auditTotal / PAGE_SIZE)
        return (
          <div style={{ marginTop: 32, background: 'var(--card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>

            {/* رأس */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand-900)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)' }}>{isAr ? 'سجل التدقيق' : 'Audit Log'}</span>
              {auditTotal > 0 && (
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 99, background: 'var(--surface)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                  {isAr ? `${auditTotal.toLocaleString('ar-SA')} سجل` : `${auditTotal.toLocaleString()} records`}
                </span>
              )}
            </div>

            {/* فلاتر */}
            <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <input type="date" value={auditFrom} onChange={e => setAuditFrom(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text-1)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>—</span>
              <input type="date" value={auditTo} onChange={e => setAuditTo(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text-1)' }} />

              <select value={auditTable} onChange={e => setAuditTable(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text-1)' }}>
                <option value="all">{isAr ? 'كل الجداول' : 'All tables'}</option>
                <option value="trip_records">{TABLE_LABELS.trip_records}</option>
                <option value="sales_records">{TABLE_LABELS.sales_records}</option>
                <option value="lost_found_items">{TABLE_LABELS.lost_found_items}</option>
                <option value="users">{TABLE_LABELS.users}</option>
              </select>

              {/* فلتر المحطة — للأدمن فقط */}
              {isGeneralAdmin && (
                <select value={auditStation} onChange={e => setAuditStation(e.target.value)}
                  style={{ fontSize: '0.78rem', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text-1)' }}>
                  <option value="all">{isAr ? 'كل المحطات' : 'All stations'}</option>
                  <option value="mine">{isAr ? 'محطتي' : 'My station'}</option>
                  {stations.map(s => (
                    <option key={s.id} value={s.id}>{isAr ? s.name_ar : s.name_en}</option>
                  ))}
                </select>
              )}

              <button onClick={() => fetchAudit(0)} disabled={auditLoading}
                style={{ fontSize: '0.78rem', padding: '4px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--brand-900)', color: '#fff', border: 'none', cursor: auditLoading ? 'not-allowed' : 'pointer', opacity: auditLoading ? 0.6 : 1 }}>
                {auditLoading ? '…' : (isAr ? 'عرض' : 'Show')}
              </button>
            </div>

            {/* الجدول */}
            <div style={{ overflowX: 'auto' }}>
              {auditRows.length === 0 && !auditLoading ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>
                  {isAr ? 'لا توجد سجلات في هذه الفترة' : 'No records for this period'}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)' }}>
                      {[
                        isAr ? 'التاريخ والوقت' : 'Date & Time',
                        isAr ? 'المستخدم'       : 'User',
                        isAr ? 'الجدول'         : 'Table',
                        isAr ? 'العملية'        : 'Action',
                      ].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: 'start', fontWeight: 600, color: 'var(--text-2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((row, i) => {
                      const ac = row.action === 'INSERT' ? 'var(--success)' : row.action === 'DELETE' ? 'var(--danger)' : 'var(--warning)'
                      const ab = row.action === 'INSERT' ? 'var(--success-bg)' : row.action === 'DELETE' ? 'var(--danger-bg)' : 'var(--warning-bg)'
                      const dt = new Date(row.created_at)
                      return (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--surface)' : 'var(--card)' }}>
                          <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 500, color: 'var(--text-2)', fontSize: '0.78rem' }}>
                              {dt.toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                              {dt.toLocaleTimeString(isAr ? 'ar-SA' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                          </td>
                          <td style={{ padding: '8px 14px', color: 'var(--text-1)', fontWeight: 600, fontSize: '0.82rem' }}>{row.actor_name ?? '—'}</td>
                          <td style={{ padding: '8px 14px', color: 'var(--text-2)', fontSize: '0.78rem' }}>{TABLE_LABELS[row.table_name] ?? row.table_name}</td>
                          <td style={{ padding: '8px 14px' }}>
                            <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700, background: ab, color: ac }}>
                              {row.action}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)' }}>
                <button
                  onClick={() => fetchAudit(auditPage - 1)} disabled={auditPage === 0 || auditLoading}
                  style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-2)', cursor: auditPage === 0 ? 'not-allowed' : 'pointer', opacity: auditPage === 0 ? 0.4 : 1 }}>
                  {isAr ? '→ السابق' : '← Prev'}
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                  {isAr ? `صفحة ${(auditPage + 1).toLocaleString('ar-SA')} من ${totalPages.toLocaleString('ar-SA')}` : `Page ${auditPage + 1} of ${totalPages}`}
                </span>
                <button
                  onClick={() => fetchAudit(auditPage + 1)} disabled={auditPage >= totalPages - 1 || auditLoading}
                  style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-2)', cursor: auditPage >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: auditPage >= totalPages - 1 ? 0.4 : 1 }}>
                  {isAr ? '← التالي' : 'Next →'}
                </button>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
