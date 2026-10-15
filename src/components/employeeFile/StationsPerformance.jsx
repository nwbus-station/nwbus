// أداء المحطات (للأدمن): أي المحطات مقصّرة بالعمل؟ — بالإدخالات فقط (رحلات، إيرادات كتغطية ورديات، تقييم العملاء، الموجودات)
// بدون مبالغ ولا أعداد ركاب. يعرض المدير المعيّن، وصيغة حكم لكل محطة، وفترات اليوم (الورديات)،
// والمحطات التي ليس فيها موظفون نشطون تُعرض «للعلم فقط» بلا تقييم.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import DatePicker from '../shared/DatePicker'
import { todayStr } from '../../utils/dates'
import { isRestStation } from '../../utils/stations'
import { shiftIdx, SHIFT_AR } from '../../utils/shifts'
import { shiftsOfStation } from '../../utils/stationShifts'
import { esc, docHeader, docShell, openDocWindow } from '../../utils/printDoc'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const NON_STAFF = ['general_admin', 'stations_executive_director', 'assistant_stations_executive_director']
const MANAGER_ROLES = ['station_admin', 'area_supervisor']
const W_TRIPS = 55, W_SALES = 35, W_RATING = 10

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dateList = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out }
const toMin = t => { const [h, m] = String(t || '0:0').slice(0, 5).split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null)

async function pageAll(make) {
  const out = []
  for (let f = 0; f < 80000; f += 1000) {
    const { data, error } = await make().range(f, f + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

// حكم الأداء (صيغة مميزة) حسب الدرجة
const VERDICTS = [
  { key: 'stopped', ar: 'متوقفة', c: '#7f1d1d', bg: '#fee2e2', line: 'لا إدخال إطلاقاً رغم وجود موظفين' },
  { key: 'bad', ar: 'مقصّرة', c: '#b91c1c', bg: '#fee2e2', line: 'إدخالاتها ناقصة وتحتاج تدخلاً مباشراً' },
  { key: 'watch', ar: 'تحتاج متابعة', c: '#b45309', bg: '#fef3c7', line: 'أداؤها متذبذب وفيه فجوات' },
  { key: 'ok', ar: 'منتظمة', c: '#1d4ed8', bg: '#dbeafe', line: 'تسير على النسق المطلوب' },
  { key: 'top', ar: 'متميّزة', c: '#15803d', bg: '#dcfce7', line: 'إدخالات كاملة وفي وقتها' },
]
const verdictOf = (score, stopped) => stopped ? VERDICTS[0] : score < 50 ? VERDICTS[1] : score < 75 ? VERDICTS[2] : score < 90 ? VERDICTS[3] : VERDICTS[4]
const heat = p => (p == null ? ['#e5e7eb', '#6b7280'] : p >= 90 ? ['#16a34a', '#fff'] : p >= 75 ? ['#65a30d', '#fff'] : p >= 50 ? ['#f59e0b', '#1f1300'] : p >= 25 ? ['#f97316', '#fff'] : ['#dc2626', '#fff'])

export default function StationsPerformance({ isAr = true }) {
  const today = todayStr()
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [raw, setRaw] = useState(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [showInfoOnly, setShowInfoOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const end = to > today ? today : to
      const fT = `${from}T00:00:00+03:00`, tT = `${end}T23:59:59.999+03:00`
      const [stations, users, userStations, stationTrips, stops, records, sales, ratings, lost] = await Promise.all([
        pageAll(() => supabase.from('stations').select('id, name_ar, name_en, is_agent, shift_ends, city_group').eq('is_active', true).order('id')),
        pageAll(() => supabase.from('users').select('id, full_name_ar, role, station_id, supervisor_id, is_active, can_rate_customers').eq('is_active', true).order('id')),
        pageAll(() => supabase.from('user_stations').select('user_id, station_id').order('user_id').order('station_id')),
        pageAll(() => supabase.from('station_trips').select(`trip_schedule_id, station_id, departure_time, arrival_time, dep_enabled, arr_enabled,
          trip:trip_schedule_id(trip_number, from_station_id, to_station_id, scheduled_departure, scheduled_arrival, is_active, is_rf, rf_date, days_of_week, start_date, end_date,
            from_station:from_station_id(id, name_en, city_group), to_station:to_station_id(id, name_en, city_group))`).order('trip_schedule_id').order('station_id')),
        pageAll(() => supabase.from('trip_schedule_stops').select('trip_schedule_id, station_id, arrival_time, departure_time').order('trip_schedule_id').order('station_id')),
        pageAll(() => supabase.from('trip_records').select('id, trip_schedule_id, record_date, station_id, is_arrival, actual_arrival, actual_departure').gte('record_date', from).lte('record_date', end).order('id')),
        pageAll(() => supabase.from('sales_records').select('id, sale_date, shift, station_id').gte('sale_date', from).lte('sale_date', end).order('id')),
        pageAll(() => supabase.from('customer_ratings').select('id, station_id').gte('created_at', fT).lte('created_at', tT).order('id')),
        pageAll(() => supabase.from('lost_found_items').select('id, station_id').gte('found_date', from).lte('found_date', end).order('id')),
      ])
      setRaw({ stations, users, userStations, stationTrips, stops, records, sales, ratings, lost, end })
    } catch (e) { setErr(e?.message || String(e)); setRaw(null) }
    setLoading(false)
  }, [from, to, today])
  useEffect(() => { load() }, [load])

  // ── الحساب ──
  const result = useMemo(() => {
    if (!raw) return null
    const { stations: allSt, users, userStations, stationTrips, stops, records, sales, ratings, lost, end } = raw
    const stations = allSt.filter(s => !isRestStation(s))
    const stById = Object.fromEntries(stations.map(s => [s.id, s]))
    const days = dateList(from, end)
    const stopMap = {}
    stops.forEach(s => { stopMap[`${s.trip_schedule_id}|${s.station_id}`] = s })
    const tripInfo = {}
    stationTrips.forEach(st => { if (st.trip) tripInfo[st.trip_schedule_id] = st.trip })

    // الرحلات المتوقعة (نفس منطق صفحة الترحيل والتقارير): أطراف (رحلة|تاريخ|محطة|اتجاه) لكل محطة
    const exp = {}   // station_id → [{ key, shift }]
    const groupOf = x => { if (!x) return null; if (x.city_group) return x.city_group; const w = (x.name_en || '').split(/[\s-]+/)[0].toLowerCase(); return w || null }
    stationTrips.forEach(st => {
      const t = st.trip, stn = stById[st.station_id]
      if (!t || !t.is_active || !stn) return
      const isDest = t.to_station_id === st.station_id, isOrigin = t.from_station_id === st.station_id
      const stop = stopMap[`${st.trip_schedule_id}|${st.station_id}`]
      const arrOn = st.arr_enabled !== false, depOn = st.dep_enabled !== false
      const curG = groupOf(stn), fromG = groupOf(t.from_station), toG = groupOf(t.to_station)
      const sameFrom = !!(curG && fromG && curG === fromG), sameTo = !!(curG && toG && curG === toG)
      const shifts = shiftsOfStation(stn)
      const legs = []   // [isArr, time]
      if (isDest) { if (arrOn) legs.push([true, st.arrival_time || t.scheduled_arrival]) }
      else if (isOrigin) { if (depOn) legs.push([false, st.departure_time || t.scheduled_departure]) }
      else if (stop) { if (arrOn && !sameFrom) legs.push([true, st.arrival_time || stop.arrival_time]); if (depOn && !sameTo) legs.push([false, st.departure_time || stop.departure_time]) }
      else { if (arrOn && !sameFrom) legs.push([true, st.arrival_time]); if (depOn && !sameTo) legs.push([false, st.departure_time]) }
      days.forEach(date => {
        if (t.is_rf && t.rf_date !== date) return
        if (t.start_date && date < t.start_date) return
        if (t.end_date && date > t.end_date) return
        if (t.days_of_week?.length && !t.days_of_week.includes(new Date(date + 'T00:00:00').getDay())) return
        legs.forEach(([isArr, time]) => {
          if (!time) return
          const k = shifts[shiftIdx(toMin(time), shifts)].k
          ;(exp[st.station_id] ??= []).push({ key: `${st.trip_schedule_id}|${date}|${st.station_id}|${isArr ? 'a' : 'd'}`, shift: k })
        })
      })
    })
    // المُدخل فعلاً
    const entered = new Set()
    records.forEach(r => {
      const t = tripInfo[r.trip_schedule_id]
      let isArr
      if (t && (t.to_station_id === r.station_id || t.from_station_id === r.station_id)) isArr = t.to_station_id === r.station_id
      else isArr = r.is_arrival != null ? r.is_arrival === true : (r.actual_arrival != null && r.actual_departure == null)
      entered.add(`${r.trip_schedule_id}|${r.record_date}|${r.station_id}|${isArr ? 'a' : 'd'}`)
    })
    // الإيرادات: تغطية الورديات (يوم × وردية فيها سجل)
    const salesSet = {}   // station → Set(date|shift)
    sales.forEach(s => { (salesSet[s.station_id] ??= new Set()).add(`${s.sale_date}|${s.shift}`) })
    const ratingCnt = {}, lostCnt = {}
    ratings.forEach(r => { if (r.station_id) ratingCnt[r.station_id] = (ratingCnt[r.station_id] || 0) + 1 })
    lost.forEach(r => { if (r.station_id) lostCnt[r.station_id] = (lostCnt[r.station_id] || 0) + 1 })
    // الموظفون والمديرون
    const staffBy = {}, rateEnabled = {}
    users.forEach(u => {
      if (!u.station_id || NON_STAFF.includes(u.role) || MANAGER_ROLES.includes(u.role)) return
      ;(staffBy[u.station_id] ??= []).push(u)
      if (u.can_rate_customers) rateEnabled[u.station_id] = true
    })
    const userById = Object.fromEntries(users.map(u => [u.id, u]))
    const mgrBy = {}
    users.forEach(u => { if (MANAGER_ROLES.includes(u.role) && u.station_id) (mgrBy[u.station_id] ??= new Set()).add(u.id) })
    userStations.forEach(us => { const u = userById[us.user_id]; if (u && MANAGER_ROLES.includes(u.role)) (mgrBy[us.station_id] ??= new Set()).add(u.id) })

    const rows = [], infoOnly = []
    stations.forEach(stn => {
      const staff = staffBy[stn.id] ?? []
      const expected = exp[stn.id] ?? []
      if (staff.length === 0) { infoOnly.push({ id: stn.id, name: isAr ? stn.name_ar : (stn.name_en || stn.name_ar), expected: expected.length, agent: !!stn.is_agent }); return }
      const shifts = shiftsOfStation(stn)
      const hit = expected.filter(e => entered.has(e.key))
      const tripsPct = pct(hit.length, expected.length)
      const nShifts = shifts.length
      const sset = salesSet[stn.id]
      const salesApplicable = !!sset && sset.size > 0
      let salesCovered = 0
      if (salesApplicable) days.forEach(d => shifts.forEach(sh => { if (sset.has(`${d}|${sh.k}`)) salesCovered++ }))
      const salesExpected = days.length * nShifts
      const salesPct = salesApplicable ? Math.min(100, pct(salesCovered, salesExpected)) : null
      const rate = ratingCnt[stn.id] || 0
      const ratingScore = rate > 0 ? 100 : 0
      // الدرجة العامة: أوزان تُعاد توزيعها لو مقياس غير متاح
      const parts = []
      if (tripsPct != null) parts.push([tripsPct, W_TRIPS])
      if (salesPct != null) parts.push([salesPct, W_SALES])
      parts.push([ratingScore, W_RATING])
      const wsum = parts.reduce((a, [, w]) => a + w, 0)
      const score = Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / wsum)
      const stopped = expected.length > 0 && hit.length === 0 && !salesApplicable
      // فترات اليوم: لكل وردية، متوسط (إدخال الرحلات + تغطية الإيرادات)
      const byShift = shifts.map(sh => {
        const e = expected.filter(x => x.shift === sh.k), h = e.filter(x => entered.has(x.key))
        const tp = pct(h.length, e.length)
        const sp = salesApplicable ? pct(days.filter(d => sset.has(`${d}|${sh.k}`)).length, days.length) : null
        const vals = [tp, sp].filter(v => v != null)
        return { k: sh.k, ar: sh.ar, range: sh.range, trips: tp, sales: sp, n: e.length, score: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null }
      })
      const measured = byShift.filter(x => x.score != null)
      const weakest = measured.length ? measured.reduce((a, b) => (b.score < a.score ? b : a)) : null
      const mgrs = [...(mgrBy[stn.id] ?? [])].map(id => userById[id]?.full_name_ar).filter(Boolean)
      if (!mgrs.length) {
        const cnt = {}
        staff.forEach(u => { if (u.supervisor_id && userById[u.supervisor_id]) cnt[u.supervisor_id] = (cnt[u.supervisor_id] || 0) + 1 })
        const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]
        if (top) mgrs.push(userById[top[0]].full_name_ar)
      }
      const v = verdictOf(score, stopped)
      // جملة الحكم
      const bits = []
      if (expected.length) bits.push(`أُدخل ${tripsPct}% من رحلاتها (${hit.length} من ${expected.length})`)
      else bits.push('لا رحلات مجدولة في الفترة')
      bits.push(salesApplicable ? `وغُطّيت ${salesCovered} من ${salesExpected} وردية بالإيرادات` : 'ولا إيرادات مُدخلة')
      if (weakest && weakest.score < 75) bits.push(`وأضعف فترة ${weakest.ar} (${weakest.score}%)`)
      if (rate === 0) bits.push('ولم تُقيَّم من العملاء')
      rows.push({
        id: stn.id, name: isAr ? stn.name_ar : (stn.name_en || stn.name_ar), nameEn: stn.name_en, agent: !!stn.is_agent,
        staff: staff.length, managers: mgrs, expected: expected.length, entered: hit.length, tripsPct, salesApplicable, salesCovered, salesExpected, salesPct,
        rate, rateEnabled: !!rateEnabled[stn.id], lost: lostCnt[stn.id] || 0, score, verdict: v, sentence: bits.join('، '), byShift, weakest,
      })
    })
    rows.sort((a, b) => a.score - b.score || b.expected - a.expected)
    infoOnly.sort((a, b) => b.expected - a.expected || a.name.localeCompare(b.name, 'ar'))
    // فترات اليوم على مستوى الشبكة
    const net = {}
    rows.forEach(r => r.byShift.forEach(s => { const n = (net[s.k] ??= { k: s.k, vals: [], trips: [], sales: [] }); if (s.score != null) n.vals.push(s.score); if (s.trips != null) n.trips.push(s.trips); if (s.sales != null) n.sales.push(s.sales) }))
    const avg = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null)
    const netShifts = ['A', 'B', 'C', 'D'].filter(k => net[k]).map(k => ({ k, ar: SHIFT_AR[k], score: avg(net[k].vals), trips: avg(net[k].trips), sales: avg(net[k].sales), stations: net[k].vals.length }))
    const counts = { all: rows.length }
    VERDICTS.forEach(v => { counts[v.key] = rows.filter(r => r.verdict.key === v.key).length })
    const avgScore = rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : null
    const notRated = rows.filter(r => r.rate === 0)
    return { rows, infoOnly, netShifts, counts, avgScore, notRated, days: days.length }
  }, [raw, from, isAr])

  const visible = useMemo(() => {
    if (!result) return []
    const t = q.trim().toLowerCase()
    return result.rows.filter(r => (filter === 'all' || r.verdict.key === filter) && (!t || r.name.toLowerCase().includes(t) || (r.nameEn || '').toLowerCase().includes(t) || r.managers.some(m => m.toLowerCase().includes(t))))
  }, [result, q, filter])

  // ── الطباعة ──
  function printReport() {
    if (!result) return
    const period = from === to ? from : `${from} → ${to}`
    const kpi = (v, l, c) => `<div class="kpi" style="--c:${c}"><small>${esc(l)}</small><b>${esc(v)}</b></div>`
    const cell = p => { const [bg, fg] = heat(p); return `<td style="background:${bg};color:${fg};font-weight:800">${p == null ? '—' : p + '%'}</td>` }
    const shiftKeys = ['A', 'B', 'C', 'D'].filter(k => result.netShifts.some(s => s.k === k))
    const body = `
      ${docHeader({ title: 'تقرير أداء المحطات', infoLines: [`الفترة: <b>${esc(period)}</b>`, `المحطات المقيَّمة: <b>${result.rows.length}</b>`, `أعدّه: ${esc('الإدارة')}`] })}
      <div class="body">
        <div class="sec"><h3>الملخص</h3><div class="grid g5">
          ${kpi(result.avgScore ?? '—', 'متوسط الأداء العام', '#1C2B4A')}${kpi(result.counts.bad + result.counts.stopped, 'مقصّرة / متوقفة', '#b91c1c')}${kpi(result.counts.watch, 'تحتاج متابعة', '#b45309')}${kpi(result.counts.top + result.counts.ok, 'منتظمة أو متميّزة', '#15803d')}${kpi(result.infoOnly.length, 'بلا موظفين (للعلم)', '#64748b')}
        </div></div>
        <div class="sec"><h3>جودة الإدخال حسب فترات اليوم (كل المحطات)</h3><table class="t"><thead><tr>${result.netShifts.map(s => `<th>${esc(s.ar)}</th>`).join('')}</tr></thead><tbody><tr>${result.netShifts.map(s => cell(s.score)).join('')}</tr></tbody></table></div>
        <div class="sec"><h3>ترتيب المحطات (الأضعف أولاً)</h3><table class="t"><thead><tr><th>#</th><th>المحطة</th><th>المدير المعيّن</th><th>الموظفون</th><th>الدرجة</th><th>الحكم</th><th>الرحلات</th><th>الإيرادات</th>${shiftKeys.map(k => `<th>${esc(SHIFT_AR[k])}</th>`).join('')}<th>تقييم العملاء</th></tr></thead><tbody>
          ${result.rows.map((r, i) => `<tr><td>${i + 1}</td><td class="l"><b>${esc(r.name)}</b></td><td class="l">${esc(r.managers.join('، ') || '—')}</td><td>${r.staff}</td>${cell(r.score)}<td><span class="chip" style="background:${r.verdict.bg};color:${r.verdict.c}">${esc(r.verdict.ar)}</span></td>${cell(r.tripsPct)}${cell(r.salesPct)}${shiftKeys.map(k => cell(r.byShift.find(s => s.k === k)?.score ?? null)).join('')}<td>${r.rate || 'لم تُقيَّم'}</td></tr>`).join('')}
        </tbody></table></div>
        ${result.infoOnly.length ? `<div class="sec"><h3>للعلم فقط — محطات بلا موظفين نشطين (${result.infoOnly.length})</h3><p class="muted">لا تُحتسب في التقييم لعدم وجود موظفين نشطين عليها.</p><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${result.infoOnly.map(s => `<span class="chip" style="background:#f1f5f9;color:#334155">${esc(s.name)}${s.expected ? ` · ${s.expected} حركة مجدولة` : ''}</span>`).join('')}</div></div>` : ''}
        <ul class="notes"><li>الدرجة العامة: إدخال الرحلات ${W_TRIPS}% + تغطية الإيرادات للورديات ${W_SALES}% + تقييم العملاء ${W_RATING}%. التقييم بالإدخالات فقط، بدون مبالغ ولا أعداد ركاب.</li><li>الحكم: متميّزة (90+) · منتظمة (75–89) · تحتاج متابعة (50–74) · مقصّرة (أقل من 50) · متوقفة (لا إدخال إطلاقاً).</li></ul>
      </div>`
    openDocWindow(docShell({ title: `تقرير أداء المحطات — ${period}`, body, footerLeft: esc(period), footerRight: 'NORTH WEST BUS' }))
  }

  // ── الواجهة ──
  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }
  const pill = on => ({ padding: '7px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: `1.5px solid ${on ? '#1C2B4A' : 'var(--border)'}`, background: on ? '#1C2B4A' : 'var(--card)', color: on ? '#fff' : 'var(--text-2)' })
  const PRESETS = [[isAr ? 'اليوم' : 'Today', 0, 0], [isAr ? 'أمس' : 'Yesterday', -1, -1], [isAr ? '7 أيام' : '7 days', -6, 0], [isAr ? '14 يوماً' : '14 days', -13, 0], [isAr ? '30 يوماً' : '30 days', -29, 0]]
  const Ring = ({ v, c }) => (
    <div style={{ width: 74, height: 74, borderRadius: '50%', background: `conic-gradient(${c} ${v * 3.6}deg, var(--surface-2) 0)`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontFamily: MONO, fontWeight: 900, fontSize: '1.15rem', color: 'var(--text-1)' }}>{v}</div>
    </div>
  )
  const Meter = ({ label, p, sub }) => {
    const [bg] = heat(p)
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}><span>{label}</span><span style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{p == null ? '—' : p + '%'}</span></div>
        <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-2)', marginTop: 4, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${p ?? 0}%`, background: bg, borderRadius: 99 }} /></div>
        {sub && <div style={{ fontSize: '0.64rem', color: 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* الفترة */}
      <div style={{ ...card, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'من' : 'From'}</label>
            <DatePicker value={from} onChange={v => { setFrom(v); if (v > to) setTo(v) }} isAr={isAr} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-40" /></div>
          <div><label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'إلى' : 'To'}</label>
            <DatePicker value={to} onChange={v => { setTo(v); if (v < from) setFrom(v) }} max={today} isAr={isAr} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-40" /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'بحث بالمحطة أو المدير' : 'Search station or manager'}</label>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={isAr ? 'اسم محطة أو مدير…' : 'Station or manager…'} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-full" />
          </div>
          <button type="button" onClick={printReport} disabled={!result || loading}
            style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#1C2B4A', color: '#fff', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'inherit', cursor: result && !loading ? 'pointer' : 'not-allowed', opacity: result && !loading ? 1 : 0.5 }}>
            {isAr ? 'طباعة التقرير / PDF' : 'Print / PDF'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(([l, a, b]) => { const f = addDays(today, a), t = addDays(today, b); return <button key={l} type="button" onClick={() => { setFrom(f); setTo(t) }} style={pill(from === f && to === t)}>{l}</button> })}
        </div>
        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
          {isAr ? 'التقييم بالإدخالات فقط (رحلات مدخلة، وتغطية الورديات بالإيرادات، وتقييم العملاء) بدون مبالغ ولا أعداد ركاب. الفترات الطويلة تحتاج وقتاً أطول للتحميل.' : 'Scored on entries only (trips entered, sales shift coverage, customer ratings) — no amounts or passenger counts.'}
        </p>
      </div>

      {err && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.82rem' }}>{err}</div>}
      {loading && !result && <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>{isAr ? 'جارٍ تحليل المحطات…' : 'Analysing stations…'}</div>}

      {result && (
        <>
          {/* الملخص */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, opacity: loading ? 0.6 : 1 }}>
            {[
              [result.avgScore ?? '—', isAr ? 'متوسط الأداء العام' : 'Overall score', '#1C2B4A'],
              [result.counts.bad + result.counts.stopped, isAr ? 'مقصّرة / متوقفة' : 'Underperforming', '#b91c1c'],
              [result.counts.watch, isAr ? 'تحتاج متابعة' : 'Needs follow-up', '#b45309'],
              [result.counts.ok + result.counts.top, isAr ? 'منتظمة أو متميّزة' : 'Good', '#15803d'],
              [result.notRated.length, isAr ? 'لم تُقيَّم من العملاء' : 'No customer ratings', '#7c3aed'],
              [result.infoOnly.length, isAr ? 'بلا موظفين (للعلم)' : 'No staff (info)', '#64748b'],
            ].map(([v, l, c]) => (
              <div key={l} style={{ ...card, borderTop: `4px solid ${c}`, padding: '12px 14px' }}>
                <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.7rem', color: 'var(--text-1)', lineHeight: 1.1 }}>{v}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* فترات اليوم */}
          <div style={{ ...card, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-1)' }}>{isAr ? 'جودة الإدخال حسب فترات اليوم' : 'Entry quality by period of day'}</h3>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>{isAr ? 'متوسط إدخال الرحلات وتغطية الإيرادات لكل وردية، على كل المحطات' : 'Average of trip entry and sales coverage per shift'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, result.netShifts.length)}, minmax(0, 1fr))`, gap: 10, marginTop: 12 }}>
              {result.netShifts.map(s => {
                const [bg, fg] = heat(s.score)
                return (
                  <div key={s.k} style={{ borderRadius: 12, padding: '12px 10px', background: bg, color: fg, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, opacity: 0.9 }}>{s.ar}</div>
                    <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.7rem', lineHeight: 1.15 }}>{s.score == null ? '—' : s.score + '%'}</div>
                    <div style={{ fontSize: '0.64rem', opacity: 0.85, marginTop: 2 }}>{isAr ? `رحلات ${s.trips ?? '—'}% · إيرادات ${s.sales ?? '—'}%` : `trips ${s.trips ?? '—'}% · sales ${s.sales ?? '—'}%`}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* التصفية */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setFilter('all')} style={pill(filter === 'all')}>{isAr ? 'الكل' : 'All'} <span style={{ fontFamily: MONO, opacity: 0.8 }}>{result.counts.all}</span></button>
            {[...VERDICTS].map(v => result.counts[v.key] > 0 && (
              <button key={v.key} type="button" onClick={() => setFilter(filter === v.key ? 'all' : v.key)} style={pill(filter === v.key)}>{v.ar} <span style={{ fontFamily: MONO, opacity: 0.8 }}>{result.counts[v.key]}</span></button>
            ))}
          </div>

          {/* المحطات */}
          {visible.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.88rem' }}>{isAr ? 'لا توجد محطات مطابقة' : 'No matching stations'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: loading ? 0.6 : 1 }}>
              {visible.map((r, i) => (
                <div key={r.id} style={{ ...card, padding: '16px 18px', borderInlineStart: `5px solid ${r.verdict.c}` }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Ring v={r.score} c={heat(r.score)[0]} />
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: 'var(--text-3)' }}>#{i + 1}</span>
                        <span style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-1)' }}>{r.name}</span>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, padding: '3px 12px', borderRadius: 99, background: r.verdict.bg, color: r.verdict.c }}>{r.verdict.ar}</span>
                        {r.agent && <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: '#ede9fe', color: '#6d28d9' }}>{isAr ? 'وكيل' : 'Agent'}</span>}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-2)', marginTop: 4, fontWeight: 600 }}>
                        {isAr ? 'المدير: ' : 'Manager: '}<b style={{ color: 'var(--text-1)' }}>{r.managers.length ? r.managers.slice(0, 2).join('، ') + (r.managers.length > 2 ? ` +${r.managers.length - 2}` : '') : (isAr ? 'غير معيّن' : 'Not assigned')}</b>
                        <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>{isAr ? `${r.staff} موظف نشط` : `${r.staff} active staff`}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: 6, lineHeight: 1.7 }}>
                        <b style={{ color: r.verdict.c }}>{r.verdict.line}.</b> {r.sentence}.
                      </div>
                    </div>
                    <div style={{ flex: '1 1 300px', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 18px' }}>
                      <Meter label={isAr ? 'إدخال الرحلات' : 'Trips entered'} p={r.tripsPct} sub={r.expected ? `${r.entered} / ${r.expected}` : (isAr ? 'لا رحلات' : 'none scheduled')} />
                      <Meter label={isAr ? 'تغطية الإيرادات' : 'Sales coverage'} p={r.salesPct} sub={r.salesApplicable ? `${r.salesCovered} / ${r.salesExpected} ${isAr ? 'وردية' : 'shifts'}` : (isAr ? 'لا إيرادات مُدخلة' : 'no sales entered')} />
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? 'تقييم العملاء' : 'Customer ratings'}
                        <div style={{ marginTop: 3, fontFamily: MONO, fontWeight: 900, fontSize: '0.95rem', color: r.rate ? 'var(--text-1)' : '#7c3aed' }}>{r.rate || (isAr ? 'لم تُقيَّم' : 'none')}</div></div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? 'الموجودات المسجلة' : 'Lost & found logged'}
                        <div style={{ marginTop: 3, fontFamily: MONO, fontWeight: 900, fontSize: '0.95rem', color: 'var(--text-1)' }}>{r.lost}</div></div>
                    </div>
                  </div>
                  {/* فترات اليوم للمحطة */}
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${r.byShift.length}, minmax(0, 1fr))`, gap: 8, marginTop: 12 }}>
                    {r.byShift.map(s => {
                      const [bg, fg] = heat(s.score)
                      return (
                        <div key={s.k} title={`${s.ar} · ${s.range}\n${isAr ? 'رحلات' : 'trips'}: ${s.trips ?? '—'}%\n${isAr ? 'إيرادات' : 'sales'}: ${s.sales ?? '—'}%`}
                          style={{ borderRadius: 9, padding: '7px 6px', background: bg, color: fg, textAlign: 'center' }}>
                          <div style={{ fontSize: '0.64rem', fontWeight: 800, opacity: 0.92 }}>{s.ar}</div>
                          <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '0.95rem' }}>{s.score == null ? '—' : s.score + '%'}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* للعلم فقط */}
          {result.infoOnly.length > 0 && (
            <div style={{ ...card, padding: '14px 18px', background: 'var(--surface)' }}>
              <button type="button" onClick={() => setShowInfoOnly(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start', padding: 0 }}>
                <span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-1)' }}>{isAr ? 'للعلم فقط — محطات بلا موظفين نشطين' : 'For information — stations without active staff'}</span>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{isAr ? `${result.infoOnly.length} محطة لا تُحتسب في التقييم لأنه لا يوجد عليها موظفون` : `${result.infoOnly.length} stations are not scored`}</span>
                </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-2)' }}>{showInfoOnly ? '▲' : '▼'}</span>
              </button>
              {showInfoOnly && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {result.infoOnly.map(s => (
                    <span key={s.id} style={{ fontSize: '0.74rem', fontWeight: 700, padding: '5px 12px', borderRadius: 99, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      {s.name}{s.agent ? (isAr ? ' · وكيل' : ' · agent') : ''}{s.expected ? <span style={{ color: 'var(--text-3)' }}>{isAr ? ` · ${s.expected} حركة مجدولة` : ` · ${s.expected} scheduled`}</span> : null}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
