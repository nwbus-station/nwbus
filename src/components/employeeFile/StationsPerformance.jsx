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
import { usePresence } from '../../lib/presence'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const NON_STAFF = ['general_admin', 'stations_executive_director', 'assistant_stations_executive_director']
const MANAGER_ROLES = ['station_admin', 'area_supervisor']
// لا يُحتسبون في التقارير: عمال النظافة ومشرفو المرحّلين
const EXCLUDED_JOB = /cleaner|dispatcher_supervisor|نظاف|مشرف\s*مرحّ|مشرف\s*مرح/i
const W_TRIPS = 55, W_SALES = 35, W_RATING = 10

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dateList = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out }
const toMin = t => { const [h, m] = String(t || '0:0').slice(0, 5).split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null)
// آخر دخول: اليوم/أمس مع الوقت، أو التاريخ — بتوقيت الرياض
const fmtLogin = iso => {
  if (!iso) return null
  const d = new Date(iso), r = new Date(d.getTime() + 3 * 3600 * 1000)
  const day = r.toISOString().slice(0, 10), t = r.toISOString().slice(11, 16)
  const td = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10)
  const yd = new Date(Date.now() + 3 * 3600 * 1000 - 86400000).toISOString().slice(0, 10)
  return day === td ? `اليوم ${t}` : day === yd ? `أمس ${t}` : `${day.slice(5).replace('-', '/')} ${t}`
}

// عزل الأرقام والتواريخ داخل النص العربي حتى لا تنعكس (2026-10-15 ← 15-10-2026)
const lri = t => `\u2066${t}\u2069`
const loginP = iso => (fmtLogin(iso) ? lri(fmtLogin(iso)) : 'لم يدخل')

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
  { key: 'stopped', ar: 'لا يوجد نشاط مسجَّل', c: '#7f1d1d', bg: '#fee2e2', line: 'لا أثر لأي إدخال رغم وجود موظفين' },
  { key: 'bad', ar: 'ضعيف', c: '#b91c1c', bg: '#fee2e2', line: 'فجوة كبيرة بين المطلوب والمنجَز' },
  { key: 'watch', ar: 'يحتاج إلى تحسين', c: '#b45309', bg: '#fef3c7', line: 'إدخال غير منتظم وفجوات متكررة' },
  { key: 'ok', ar: 'جيد', c: '#1d4ed8', bg: '#dbeafe', line: 'أداء ثابت مع فرص تحسين محدودة' },
  { key: 'top', ar: 'ممتاز', c: '#15803d', bg: '#dcfce7', line: 'التزام كامل بالإدخال في أوقاته' },
]
// سرد الحالة: ما حدث، لماذا، وماذا نفعل (يُبنى من أرقام المحطة)
function narrate(d) {
  const { v, expected, hit, tripsPct, salesApplicable, salesCovered, salesExpected, salesPct, weakest, rate, rateOn, members, loggedIn, mgrName } = d
  const who = mgrName ? `مع ${mgrName}` : 'مع إدارة المحطة'
  if (v.key === 'stopped') {
    return {
      status: `لا أثر لأي إدخال خلال الفترة رغم ${expected} حركة مجدولة و${members} حساب نشط.`,
      diag: [loggedIn === 0 ? 'لم يسجّل أي حساب في المحطة دخولاً خلال الفترة.' : `سجّل ${loggedIn} من ${members} دخولهم دون أن يُترجم ذلك إلى إدخال.`],
      action: loggedIn === 0 ? `التوصية: التواصل ${who} اليوم للتأكد من تسلّم الموظفين لحساباتهم.` : `التوصية: بحث سبب التوقف ${who} وإعادة الإدخال خلال 24 ساعة.`,
    }
  }
  const status = !expected
    ? 'لا حركات مجدولة في الفترة، فالتقييم مبني على الإيرادات وآراء العملاء.'
    : ({
      top: `التزام تام: أُدخلت ${hit} من ${expected} حركة (${tripsPct}%).`,
      ok: `إدخال جيد: ${hit} من ${expected} حركة مُدخلة (${tripsPct}%).`,
      watch: `إدخال غير مكتمل: ${hit} فقط من ${expected} حركة (${tripsPct}%).`,
      bad: `فجوة واضحة: ${hit} حركة مُدخلة من أصل ${expected} (${tripsPct}%).`,
    })[v.key]
  const diag = []
  if (salesApplicable) diag.push(salesPct < 90 ? `الإيرادات مغطّاة في ${salesCovered} من ${salesExpected} وردية فقط (${salesPct}%).` : `تغطية الإيرادات ${salesCovered} من ${salesExpected} وردية.`)
  else diag.push('لا إيرادات مُدخلة في الفترة.')
  if (weakest && weakest.score < 75) diag.push(`أضعف فترات اليوم: ${weakest.ar} (${weakest.score}%).`)
  if (rate === 0) diag.push(rateOn ? 'لم تتلقَّ أي تقييم من العملاء رغم تفعيله.' : 'تقييم العملاء غير مفعّل لأي حساب في المحطة.')
  if (loggedIn < members && v.key !== 'top') diag.push(`${members - loggedIn} من ${members} حسابات لم تدخل خلال الفترة.`)
  const todo = []
  if (tripsPct != null && tripsPct < 75) todo.push('إدخال الرحلات فور تنفيذها لا في نهاية الوردية')
  if (!salesApplicable || salesPct < 75) todo.push('إقفال إيراد كل وردية قبل تسليمها')
  if (rate === 0) todo.push(rateOn ? 'حثّ الموظفين على طلب تقييم العملاء' : 'تفعيل صلاحية تقييم العملاء لحساب المحطة')
  const action = v.key === 'top' ? 'التوصية: المحافظة على المستوى الحالي.'
    : todo.length ? `التوصية: ${todo.join('، و')}${mgrName ? ` — بمتابعة ${mgrName}` : ''}.` : 'التوصية: الاستمرار على النهج الحالي.'
  return { status, diag, action }
}
// نشاط الحساب: أيام فيها إدخال (رحلات أو إيرادات) من أيام الفترة
const ACC_STATUS = [
  { key: 'steady', ar: 'منتظم', c: '#15803d', bg: '#dcfce7' },
  { key: 'fair', ar: 'متقطع', c: '#1d4ed8', bg: '#dbeafe' },
  { key: 'low', ar: 'نشاط محدود', c: '#b45309', bg: '#fef3c7' },
  { key: 'loginOnly', ar: 'دخول بلا إدخال', c: '#b91c1c', bg: '#fee2e2' },
  { key: 'idle', ar: 'غير نشط', c: '#6b7280', bg: '#f3f4f6' },
]
const accStatus = (activeDays, days, inPeriod) => {
  const p = days ? activeDays / days : 0
  return ACC_STATUS.find(x => x.key === (activeDays === 0 ? (inPeriod ? 'loginOnly' : 'idle') : p >= 0.7 ? 'steady' : p >= 0.35 ? 'fair' : 'low'))
}
const CARD_CSS = `
  .cg { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .sc { border: 1px solid #dbe2ea; border-right: 5px solid var(--c, #64748b); border-radius: 10px; background: #fff; padding: 9px 11px; break-inside: avoid; }
  .sc .top { display: flex; gap: 10px; align-items: center; }
  .sc .ring { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; }
  .sc .ring b { width: 41px; height: 41px; border-radius: 50%; background: #fff; display: grid; place-items: center; font: 900 13.5px ui-monospace, Menlo, monospace; direction: ltr; color: #0f172a; }
  .sc .nm { flex: 1; min-width: 0; } .sc .nm b { display: block; font-size: 13.2px; color: #0f172a; line-height: 1.35; } .sc .nm small { display: block; font-size: 10.6px; color: #64748b; margin-top: 1px; line-height: 1.5; }
  .sc .mt { display: grid; grid-template-columns: 58px 1fr 86px; gap: 6px; align-items: center; margin-top: 5px; font-size: 10.6px; color: #475569; font-weight: 700; }
  .sc .mb { height: 7px; border-radius: 99px; background: #e8edf3; overflow: hidden; } .sc .mb i { display: block; height: 100%; border-radius: 99px; }
  .sc .mv { direction: ltr; text-align: left; font: 800 10.4px ui-monospace, Menlo, monospace; color: #0f172a; }
  .sc .shs { display: flex; gap: 4px; margin-top: 7px; } .sc .sh { flex: 1; text-align: center; border-radius: 6px; padding: 3px 1px; } .sc .sh small { display: block; font-size: 9.2px; opacity: .92; font-weight: 700; } .sc .sh b { font: 900 11.5px ui-monospace, Menlo, monospace; }
  .sc p { margin: 6px 0 0; font-size: 11.2px; line-height: 1.8; color: #1e293b; } .sc p.ac { font-weight: 800; color: #264673; margin-top: 3px; }
  .sc .st { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 7px; } .sc .st div { background: #f1f5f9; border-radius: 6px; text-align: center; padding: 3px 2px; font-size: 9.6px; color: #64748b; font-weight: 700; } .sc .st b { display: block; font: 900 13px ui-monospace, Menlo, monospace; color: #0f172a; direction: ltr; }
  .sc .pp { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 7px; } .sc .pp span { font-size: 9.4px; font-weight: 700; padding: 1px 7px; border-radius: 99px; background: #f1f5f9; color: #64748b; } .sc .pp span.on { background: #dcfce7; color: #15803d; } .sc .pp span.old { background: #fef3c7; color: #b45309; }
  .gh { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 14px 0 6px; padding: 5px 10px; border-radius: 8px; background: #eef2f7; border-right: 4px solid var(--c, #264673); break-after: avoid; }
  .gh b { font-size: 13.5px; color: #1C2B36; } .gh span { font-size: 11px; color: #475569; }
  body.bw .sc .ring b, body.bw .sc .st div { background: #fff !important; border: 1px solid #777; }
  @media (max-width: 640px) { .cg { grid-template-columns: 1fr; } }
`
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
  const [tab, setTab] = useState('stations')   // محطات | حسابات
  const [aSt, setASt] = useState('all'), [aRole, setARole] = useState('all'), [aStatus, setAStatus] = useState('all'), [aQ, setAQ] = useState(''), [aSort, setASort] = useState('low'), [aMore, setAMore] = useState(100)
  const [openStaff, setOpenStaff] = useState({})   // محطة → عرض أسماء موظفيها
  const presence = usePresence()

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const end = to > today ? today : to
      const fT = `${from}T00:00:00+03:00`, tT = `${end}T23:59:59.999+03:00`
      const [stations, users, userStations, stationTrips, stops, records, sales, ratings, lost] = await Promise.all([
        pageAll(() => supabase.from('stations').select('id, name_ar, name_en, is_agent, shift_ends, city_group').eq('is_active', true).order('id')),
        pageAll(() => supabase.from('users').select('id, full_name_ar, role, station_id, supervisor_id, is_active, can_rate_customers, last_login, job_title, job_number').eq('is_active', true).order('id')),
        pageAll(() => supabase.from('user_stations').select('user_id, station_id').order('user_id').order('station_id')),
        pageAll(() => supabase.from('station_trips').select(`trip_schedule_id, station_id, departure_time, arrival_time, dep_enabled, arr_enabled,
          trip:trip_schedule_id(trip_number, from_station_id, to_station_id, scheduled_departure, scheduled_arrival, is_active, is_rf, rf_date, days_of_week, start_date, end_date,
            from_station:from_station_id(id, name_en, city_group), to_station:to_station_id(id, name_en, city_group))`).order('trip_schedule_id').order('station_id')),
        pageAll(() => supabase.from('trip_schedule_stops').select('trip_schedule_id, station_id, arrival_time, departure_time').order('trip_schedule_id').order('station_id')),
        pageAll(() => supabase.from('trip_records').select('id, trip_schedule_id, record_date, station_id, is_arrival, actual_arrival, actual_departure, created_by').gte('record_date', from).lte('record_date', end).order('id')),
        pageAll(() => supabase.from('sales_records').select('id, sale_date, shift, station_id, created_by').gte('sale_date', from).lte('sale_date', end).order('id')),
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
    const { stations: allSt, users: allUsers, userStations, stationTrips, stops, records, sales, ratings, lost, end } = raw
    const users = allUsers.filter(u => !EXCLUDED_JOB.test(u.job_title || ''))
    const stations = allSt.filter(s => !isRestStation(s))
    const stById = Object.fromEntries(stations.map(s => [s.id, s]))
    const days = dateList(from, end)
    const rn = new Date(Date.now() + 3 * 3600 * 1000), nowMin = rn.getUTCHours() * 60 + rn.getUTCMinutes()
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
          if (date === today && toMin(time) > nowMin) return   // رحلة اليوم التي لم يحن وقتها بعد لا تُحسب
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
      if (staff.length === 0) { const ea = expected.filter(e => e.key.endsWith('|a')).length; infoOnly.push({ id: stn.id, name: isAr ? stn.name_ar : (stn.name_en || stn.name_ar), expected: expected.length, arr: ea, dep: expected.length - ea, agent: !!stn.is_agent }); return }
      const shifts = shiftsOfStation(stn)
      const hit = expected.filter(e => entered.has(e.key))
      const tripsPct = pct(hit.length, expected.length)
      const nShifts = shifts.length
      const sset = salesSet[stn.id]
      // اليوم الحالي: لا تُحسب إلا الورديات التي انتهت (الإيراد يُدخل بعد نهاية الوردية)
      const due = (d, sh) => d !== today || sh.to <= nowMin
      let salesExpected = 0
      days.forEach(d => shifts.forEach(sh => { if (due(d, sh)) salesExpected++ }))
      const salesApplicable = !!sset && sset.size > 0 && salesExpected > 0
      let salesCovered = 0
      if (salesApplicable) days.forEach(d => shifts.forEach(sh => { if (due(d, sh) && sset.has(`${d}|${sh.k}`)) salesCovered++ }))
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
        const dueDays = days.filter(d => due(d, sh)), sp = salesApplicable && dueDays.length ? pct(dueDays.filter(d => sset.has(`${d}|${sh.k}`)).length, dueDays.length) : null
        const vals = [tp, sp].filter(v => v != null)
        return { k: sh.k, ar: sh.ar, range: sh.range, trips: tp, sales: sp, n: e.length, score: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null }
      })
      const measured = byShift.filter(x => x.score != null)
      const weakest = measured.length ? measured.reduce((a, b) => (b.score < a.score ? b : a)) : null
      const fromTs = new Date(`${from}T00:00:00+03:00`).getTime()
      // الموظفون + المشرفون (مدير المحطة / مشرف المنطقة) — بدون المدير العام والإدارة العليا
      const memberIds = new Set([...staff.map(u => u.id), ...(mgrBy[stn.id] ?? [])])
      const staffRows = [...memberIds].map(id => userById[id]).filter(u => u && u.is_active !== false && !NON_STAFF.includes(u.role))
        .map(u => ({ id: u.id, name: u.full_name_ar, jobNo: u.job_number || '', isMgr: MANAGER_ROLES.includes(u.role), last: u.last_login || null, inPeriod: !!u.last_login && new Date(u.last_login).getTime() >= fromTs }))
        .sort((a, b) => (Number(b.isMgr) - Number(a.isMgr)) || ((b.last ? new Date(b.last).getTime() : 0) - (a.last ? new Date(a.last).getTime() : 0)))
      const loggedIn = staffRows.filter(x => x.inPeriod).length
      const mgrs = [...(mgrBy[stn.id] ?? [])].map(id => userById[id]?.full_name_ar).filter(Boolean)
      if (!mgrs.length) {
        const cnt = {}
        staff.forEach(u => { if (u.supervisor_id && userById[u.supervisor_id]) cnt[u.supervisor_id] = (cnt[u.supervisor_id] || 0) + 1 })
        const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]
        if (top) mgrs.push(userById[top[0]].full_name_ar)
      }
      const v = verdictOf(score, stopped)
      const story = narrate({ v, expected: expected.length, hit: hit.length, tripsPct, salesApplicable, salesCovered, salesExpected, salesPct, weakest, rate, rateOn: !!rateEnabled[stn.id], members: staffRows.length, loggedIn, mgrName: mgrs[0] })
      rows.push({
        id: stn.id, name: isAr ? stn.name_ar : (stn.name_en || stn.name_ar), nameEn: stn.name_en, agent: !!stn.is_agent,
        staff: staff.length, staffRows, loggedIn, managers: mgrs, expected: expected.length, entered: hit.length, tripsPct, salesApplicable, salesCovered, salesExpected, salesPct,
        rate, rateEnabled: !!rateEnabled[stn.id], lost: lostCnt[stn.id] || 0, score, verdict: v, story, byShift, weakest,
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
    // أداء الحسابات: من أدخل ماذا خلال الفترة (created_by)
    const act = {}
    const touch = (uid, kind, day) => { if (!uid) return; const o = (act[uid] ??= { trips: 0, sales: 0, days: new Set(), lastDay: '' }); o[kind]++; o.days.add(day); if (day > o.lastDay) o.lastDay = day }
    records.forEach(r => touch(r.created_by, 'trips', r.record_date))
    sales.forEach(r => touch(r.created_by, 'sales', r.sale_date))
    const fromTs2 = new Date(`${from}T00:00:00+03:00`).getTime()
    const accounts = users.filter(u => u.station_id && stById[u.station_id] && !NON_STAFF.includes(u.role)).map(u => {
      const a = act[u.id], inPeriod = !!u.last_login && new Date(u.last_login).getTime() >= fromTs2
      const activeDays = a ? a.days.size : 0
      return { id: u.id, name: u.full_name_ar, isMgr: MANAGER_ROLES.includes(u.role), stationId: u.station_id, station: isAr ? stById[u.station_id].name_ar : (stById[u.station_id].name_en || stById[u.station_id].name_ar),
        trips: a?.trips || 0, sales: a?.sales || 0, activeDays, lastEntry: a?.lastDay || '', last: u.last_login || null, inPeriod, status: accStatus(activeDays, days.length, inPeriod) }
    })
    return { rows, infoOnly, netShifts, counts, avgScore, notRated, days: days.length, accounts }
  }, [raw, from, isAr])

  const visible = useMemo(() => {
    if (!result) return []
    const t = q.trim().toLowerCase()
    return result.rows.filter(r => (filter === 'all' || r.verdict.key === filter) && (!t || r.name.toLowerCase().includes(t) || (r.nameEn || '').toLowerCase().includes(t) || r.managers.some(m => m.toLowerCase().includes(t))))
  }, [result, q, filter])

  // ── الحسابات ──
  const accStations = useMemo(() => {
    if (!result) return []
    const m = {}
    result.accounts.forEach(a => { (m[a.stationId] ??= { id: a.stationId, name: a.station, n: 0 }).n++ })
    return Object.values(m).sort((x, y) => x.name.localeCompare(y.name, isAr ? 'ar' : 'en'))
  }, [result, isAr])
  const accVisible = useMemo(() => {
    if (!result) return []
    const t = aQ.trim().toLowerCase()
    const base = result.accounts.filter(a => (aSt === 'all' || String(a.stationId) === aSt) && (aRole === 'all' || (aRole === 'mgr') === a.isMgr) && (!t || a.name.toLowerCase().includes(t)))
    return base
  }, [result, aSt, aRole, aQ])
  const accCounts = useMemo(() => { const c = { all: accVisible.length }; ACC_STATUS.forEach(x => { c[x.key] = accVisible.filter(a => a.status.key === x.key).length }); return c }, [accVisible])
  const accList = useMemo(() => {
    const list = accVisible.filter(a => aStatus === 'all' || a.status.key === aStatus)
    const sev = k => ACC_STATUS.findIndex(x => x.key === k)
    const ts = a => (a.last ? new Date(a.last).getTime() : 0)
    return [...list].sort(aSort === 'top' ? (x, y) => (y.trips + y.sales) - (x.trips + x.sales) || y.activeDays - x.activeDays
      : aSort === 'login' ? (x, y) => ts(y) - ts(x)
      : (x, y) => (sev(y.status.key) - sev(x.status.key)) || (x.activeDays - y.activeDays) || x.name.localeCompare(y.name, 'ar'))
  }, [accVisible, aStatus, aSort])

  function printAccounts() {
    if (!result) return
    const R = result
    const period = from === to ? from : `${from} → ${to}`
    const periodH = from === to ? lri(from) : `من ${lri(from)} إلى ${lri(to)}`
    const stName = aSt === 'all' ? 'كل المحطات' : (accStations.find(x => String(x.id) === aSt)?.name || '')
    const roleName = aRole === 'all' ? 'موظفون ومشرفون' : aRole === 'mgr' ? 'المشرفون' : 'الموظفون'
    const flt = aStatus === 'all' ? 'كل التقديرات' : ACC_STATUS.find(x => x.key === aStatus)?.ar
    const chip = v => `<span class="chip" style="background:${v.bg};color:${v.c};white-space:nowrap">${esc(v.ar)}</span>`
    const kpi = (v, l, c) => `<div class="kpi" style="--c:${c}"><small>${esc(l)}</small><b>${esc(v)}</b></div>`
    const list = accList
    const n = list.length
    const stTotal = {}
    R.accounts.forEach(a => { stTotal[a.stationId] = (stTotal[a.stationId] || 0) + a.trips + a.sales })
    const sumT = list.reduce((x, a) => x + a.trips, 0), sumS = list.reduce((x, a) => x + a.sales, 0)
    const mgrN = list.filter(a => a.isMgr).length, stN = new Set(list.map(a => a.stationId)).size
    const cnt = k => list.filter(a => a.status.key === k).length
    const dayWord = R.days === 1 ? 'يوم واحد' : R.days === 2 ? 'يومان' : `${R.days} ${R.days > 10 ? 'يوماً' : 'أيام'}`
    const para = `خلال الفترة <b>${periodH}</b> (${dayWord}) جرى تحليل نشاط <b>${n}</b> حساباً (${n - mgrN} موظفاً و${mgrN} مشرفاً) في <b>${stN}</b> محطة. أدخلت هذه الحسابات مجتمعةً <b>${sumT}</b> رحلة و<b>${sumS}</b> سجل إيراد. `
      + `<b>${cnt('steady')}</b> حساباً منتظماً، و<b>${cnt('fair')}</b> متقطعاً، و<b>${cnt('low')}</b> بنشاط محدود، و<b>${cnt('loginOnly')}</b> سجّلوا دخولاً دون أي إدخال، و<b>${cnt('idle')}</b> غير نشطين.`
    const stack = ACC_STATUS.map(v => cnt(v.key) ? `<i style="width:${(cnt(v.key) / Math.max(1, n)) * 100}%;background:${v.c}"></i>` : '').join('')
    const legend = ACC_STATUS.filter(v => cnt(v.key)).map(v => `<span class="chip" style="background:${v.bg};color:${v.c}">${esc(v.ar)} · ${cnt(v.key)}</span>`).join(' ')
    const top = [...list].filter(a => a.trips + a.sales > 0).sort((x, y) => (y.trips + y.sales) - (x.trips + x.sales)).slice(0, 5)
    const lo = list.filter(a => a.status.key === 'loginOnly')
    const topTbl = top.length ? `<h4 class="sub">الأكثر إدخالاً</h4><table class="t"><thead><tr><th>#</th><th>الحساب</th><th>المحطة</th><th>رحلات</th><th>إيراد</th><th>أيام</th></tr></thead><tbody>${top.map((a, i) => `<tr><td>${i + 1}</td><td class="l"><b>${esc(a.name)}</b></td><td class="l">${esc(a.station)}</td><td>${a.trips}</td><td>${a.sales}</td><td>${a.activeDays}/${R.days}</td></tr>`).join('')}</tbody></table>` : ''
    const sentence = a => {
      if (a.activeDays > 0) return `أدخل ${a.trips} رحلة و${a.sales} سجل إيراد على ${a.activeDays} من ${R.days} أيام، وآخر إدخال ${lri(a.lastEntry.slice(5).replace('-', '/'))}.`
      if (a.inPeriod) return `سجّل دخولاً (${lri(fmtLogin(a.last))}) دون أي إدخال خلال الفترة.`
      return a.last ? `لا دخول ولا إدخال خلال الفترة، وآخر دخول ${lri(fmtLogin(a.last))}.` : 'لم يدخل هذا الحساب إلى النظام من قبل.'
    }
    const card = a => {
      const pc = Math.round((a.activeDays / Math.max(1, R.days)) * 100), tot = stTotal[a.stationId] || 0, mine = a.trips + a.sales
      return `<div class="sc" style="--c:${a.status.c}">
        <div class="top"><div class="ring" style="background:conic-gradient(${a.status.c} ${pc * 3.6}deg,#e8edf3 0)"><b>${pc}%</b></div>
          <div class="nm"><b>${esc(a.name)}${a.isMgr ? ' <span class="muted">(مشرف)</span>' : ''}</b><small>آخر دخول: ${loginP(a.last)}</small></div>${chip(a.status)}</div>
        <div class="st"><div>رحلات<b>${a.trips}</b></div><div>إيراد<b>${a.sales}</b></div><div>إسهامه في المحطة<b>${tot ? Math.round((mine / tot) * 100) + '%' : '—'}</b></div></div>
        <p>${esc(sentence(a))}</p></div>`
    }
    const byStation = {}
    list.forEach(a => { (byStation[a.stationId] ??= { name: a.station, accs: [] }).accs.push(a) })
    const sev = k => ACC_STATUS.findIndex(x => x.key === k)
    const stGroups = Object.values(byStation).map(g => {
      g.accs.sort((x, y) => (sev(y.status.key) - sev(x.status.key)) || (x.activeDays - y.activeDays) || x.name.localeCompare(y.name, 'ar'))
      g.avg = Math.round(g.accs.reduce((t, a) => t + a.activeDays / Math.max(1, R.days), 0) / g.accs.length * 100)
      return g
    }).sort((x, y) => x.avg - y.avg || x.name.localeCompare(y.name, 'ar'))
    const groupsHtml = stGroups.map(g => {
      const [bg] = heat(g.avg)
      return `<div class="gh" style="--c:${bg}"><b>${esc(g.name)} — ${g.accs.length} ${g.accs.length === 1 ? 'حساب' : 'حسابات'}</b><span>متوسط أيام الإدخال <bdi dir="ltr">${g.avg}%</bdi></span></div><div class="cg">${g.accs.map(card).join('')}</div>`
    }).join('')
    const body = `
      ${docHeader({ title: 'تقرير أداء الحسابات', infoLines: [`الفترة: <b>${periodH}</b>`, `المحطة: <b>${esc(stName)}</b>`, `النطاق: ${esc(roleName)} · ${esc(flt)}`] })}
      <style>${CARD_CSS}</style>
      <div class="body">
        <div class="sec"><h3>الخلاصة التنفيذية</h3><div class="ins" style="background:#fff;border-right:4px solid #264673"><p style="margin:0;font-size:13.3px;line-height:2;color:#1e293b">${para}</p></div></div>
        <div class="sec"><div class="grid g5">${ACC_STATUS.map(x => kpi(cnt(x.key), x.ar, x.c)).join('')}</div>
          <div class="stack" style="height:12px;margin-top:10px">${stack}</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${legend}</div></div>
        ${topTbl ? `<div class="sec">${topTbl}</div>` : ''}
        ${lo.length ? `<div class="sec"><h4 class="sub">سجّلوا دخولاً دون إدخال (${lo.length})</h4><p class="muted" style="margin:0">${lo.slice(0, 25).map(a => `${esc(a.name)} (${esc(a.station)})`).join('، ')}${lo.length > 25 ? ` و${lo.length - 25} آخرون` : ''}.</p></div>` : ''}
        <div class="sec" style="break-inside:auto"><h3>بطاقات الحسابات حسب المحطة — الأقل نشاطاً أولاً</h3>${groupsHtml}</div>
        <ul class="notes"><li>نشاط الحساب = عدد الأيام التي أدخل فيها رحلات أو إيرادات من أيام الفترة. منتظم (70% فأكثر) · متقطع (35–69%) · نشاط محدود (أقل من 35%) · دخول بلا إدخال (سجّل دخولاً دون أي إدخال) · غير نشط (لا دخول ولا إدخال).</li><li>«إسهامه في المحطة» = نصيب الحساب من إجمالي إدخالات حسابات محطته (رحلات وإيرادات) خلال الفترة.</li><li>الموظف الذي يعمل بنظام ورديات متناوبة قد لا يعمل كل الأيام؛ فاقرأ النتيجة مع جدول دوامه.</li></ul>
      </div>`
    openDocWindow(docShell({ title: `تقرير أداء الحسابات — ${period}`, body, footerLeft: periodH, footerRight: 'NORTH WEST BUS' }))
  }

  // ── صفحة لكل محطة: نسب الإدخال + أسماء الموظفين وأرقامهم الوظيفية فقط ──
  function printStationPages(input) {
    if (!result || !input.length) return
    const list = [...input].sort((a, b) => a.name.localeCompare(b.name, isAr ? 'ar' : 'en'))
    const period = from === to ? from : `${from} → ${to}`
    const periodH = from === to ? lri(from) : `من ${lri(from)} إلى ${lri(to)}`
    const gauge = (label, p, sub) => { const [c] = heat(p); return `<div class="gz"><div class="gr" style="background:conic-gradient(${c} ${(p ?? 0) * 3.6}deg,#e8edf3 0)"><b>${p == null ? '—' : p + '%'}</b></div><span>${esc(label)}</span><small>${esc(sub)}</small></div>` }
    const page = r => {
      const emps = r.staffRows
      const two = emps.length > 14
      const rowsHtml = list => list.map((x, i) => `<tr><td>${i + 1}</td><td class="l"><b>${esc(x.name)}</b>${x.isMgr ? ' <span class="tg">مشرف</span>' : ''}</td><td class="no">${esc(x.jobNo || '—')}</td></tr>`).join('')
      const th = '<thead><tr><th>#</th><th>الاسم</th><th>الرقم الوظيفي</th></tr></thead>'
      const shown = emps.slice(0, 40)
      const half = Math.ceil(shown.length / 2)
      const tbl = two
        ? `<div class="cg">${[shown.slice(0, half), shown.slice(half)].map(part => `<table class="t">${th}<tbody>${rowsHtml(part)}</tbody></table>`).join('')}</div>`
        : `<table class="t">${th}<tbody>${rowsHtml(shown)}</tbody></table>`
      const mg = r.managers.length ? r.managers.slice(0, 3).join(' · ') : '—'
      return `<section class="pg" style="--c:${r.verdict.c}">
        <div class="pgh"><div><small>المحطة</small><h2>${esc(r.name)}</h2></div><div class="pgm"><small>المشرف</small><b>${esc(mg)}</b></div><div class="pgp"><small>الفترة</small><b>${periodH}</b></div></div>
        <div class="gzs">${gauge('نسبة إدخال الرحلات', r.tripsPct, r.expected ? `${r.entered} من ${r.expected}` : 'لا رحلات')}${gauge('نسبة إدخال الإيرادات', r.salesPct, r.salesApplicable ? `${r.salesCovered} من ${r.salesExpected} وردية` : 'لا إيرادات')}</div>
        <div class="vs">${r.byShift.map(x => `<div class="vc"><b>${esc(x.ar)}</b><div class="vb"><span>رحلات</span><i style="--w:${x.trips ?? 0}%;--k:${heat(x.trips)[0]}"></i><em>${x.trips == null ? '—' : x.trips + '%'}</em></div><div class="vb"><span>إيرادات</span><i style="--w:${x.sales ?? 0}%;--k:${heat(x.sales)[0]}"></i><em>${x.sales == null ? '—' : x.sales + '%'}</em></div></div>`).join('')}</div>
        <div class="pgt"><h3>الموظفون <span>${emps.length}</span></h3>${tbl}${emps.length > shown.length ? `<div class="more">+${emps.length - shown.length}</div>` : ''}</div>
      </section>`
    }
    const css = `
      .pg { padding: 6px 22px 0; min-height: 250mm; break-after: page; page-break-after: always; border-bottom: 1px dashed #cbd5e1; margin-bottom: 14px; }
      .pg:last-of-type { break-after: auto; page-break-after: auto; border-bottom: none; }
      .pgh { display: grid; grid-template-columns: 1fr auto auto; gap: 18px; align-items: end; padding: 12px 0 10px; border-bottom: 3px solid var(--c, #264673); margin-bottom: 14px; }
      .pgh small { display: block; font-size: 10.5px; color: #64748b; font-weight: 700; } .pgh h2 { margin: 0; font-size: 26px; font-weight: 900; color: #1C2B36; line-height: 1.25; } .pgh b { font-size: 14px; color: #0f172a; }
      .pgm, .pgp { text-align: right; padding-right: 14px; border-right: 1px solid #cbd5e1; }
      .gzs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .gz { border: 1px solid #dbe2ea; border-radius: 14px; background: #fff; text-align: center; padding: 16px 10px 12px; }
      .gz .gr { width: 150px; height: 150px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 10px; }
      .gz .gr b { width: 112px; height: 112px; border-radius: 50%; background: #fff; display: grid; place-items: center; font: 900 34px ui-monospace, Menlo, monospace; direction: ltr; color: #0f172a; }
      .gz span { display: block; font-size: 15px; font-weight: 800; color: #1C2B36; } .gz small { display: block; font-size: 12px; color: #64748b; margin-top: 2px; font-weight: 700; }
      .vs { display: grid; grid-template-columns: repeat(var(--n, 3), 1fr); gap: 8px; margin-top: 14px; }
      .vc { border: 1px solid #dbe2ea; border-radius: 10px; background: #fff; padding: 8px 10px; } .vc > b { display: block; font-size: 12.5px; color: #1C2B36; margin-bottom: 4px; }
      .vb { display: grid; grid-template-columns: 44px 1fr 38px; gap: 6px; align-items: center; margin-top: 4px; font-size: 10.5px; color: #475569; font-weight: 700; }
      .vb i { display: block; height: 8px; border-radius: 99px; background: linear-gradient(90deg, var(--k) var(--w), #e8edf3 0); } .vb em { font: 800 10.5px ui-monospace, Menlo, monospace; font-style: normal; direction: ltr; text-align: left; color: #0f172a; }
      .pgt { margin-top: 16px; } .pgt h3 { margin: 0 0 6px; font-size: 14.5px; color: #1C2B36; padding-right: 8px; border-right: 4px solid #EE712D; } .pgt h3 span { font-size: 12px; color: #64748b; font-weight: 700; margin-right: 4px; }
      .pgt table.t td { padding: 3px 7px; font-size: 12.5px; } .pgt td.no { font-family: ui-monospace, Menlo, monospace; direction: ltr; font-weight: 800; }
      .pgt .cg { align-items: start; } .tg { font-size: 9.5px; font-weight: 800; color: #475569; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 5px; } .more { text-align: center; font-size: 11px; color: #64748b; margin-top: 4px; }
      body.bw .gz .gr b { background: #fff !important; }
    `
    const body = `<style>${CARD_CSS}${css}</style>
      ${list.map(r => `<div style="--n:${r.byShift.length}">${page(r)}</div>`).join('')}`
    openDocWindow(docShell({ title: list.length === 1 ? `${list[0].name} — ${period}` : `صفحات المحطات — ${period}`, body, footerLeft: periodH, footerRight: 'NORTH WEST BUS' }))
  }

  // ── الطباعة ──
  function printReport() {
    if (!result) return
    const R = result, n = R.rows.length
    const period = from === to ? from : `${from} → ${to}`
    const periodH = from === to ? lri(from) : `من ${lri(from)} إلى ${lri(to)}`
    const dayWord = R.days === 1 ? 'يوم واحد' : R.days === 2 ? 'يومان' : `${R.days} ${R.days > 10 ? 'يوماً' : 'أيام'}`
    const kpi = (v, l, c, em = '') => `<div class="kpi" style="--c:${c}"><small>${esc(l)}</small><b>${esc(v)}</b>${em ? `<em>${esc(em)}</em>` : ''}</div>`
    const cell = p => { const [bg, fg] = heat(p); return `<td style="background:${bg};color:${fg};font-weight:800">${p == null ? '—' : p + '%'}</td>` }
    const chip = v => `<span class="chip" style="background:${v.bg};color:${v.c};white-space:nowrap">${esc(v.ar)}</span>`
    const shiftKeys = ['A', 'B', 'C', 'D'].filter(k => R.netShifts.some(s => s.k === k))
    const strong = R.counts.top + R.counts.ok, weak = R.counts.bad + R.counts.stopped
    const byScore = R.netShifts.filter(s => s.score != null).sort((a, b) => b.score - a.score)
    const bestS = byScore[0], worstS = byScore[byScore.length - 1]
    const para = `خلال الفترة <b>${periodH}</b> (${dayWord}) حُلِّل أداء <b>${n}</b> محطة لديها موظفون نشطون، وبلغ متوسط الأداء العام <b>${R.avgScore ?? '—'}%</b>. `
      + `<b>${strong}</b> محطة بتقدير «ممتاز» أو «جيد»، و<b>${R.counts.watch}</b> بتقدير «يحتاج إلى تحسين»، و<b>${weak}</b> بتقدير «ضعيف» أو بلا نشاط مسجَّل${R.counts.stopped ? ` (منها ${R.counts.stopped} بلا أي نشاط)` : ''}. `
      + (bestS && worstS && bestS.k !== worstS.k ? `أقوى فترات اليوم <b>${esc(bestS.ar)}</b> (${bestS.score}%) وأضعفها <b>${esc(worstS.ar)}</b> (${worstS.score}%). ` : '')
      + `${R.notRated.length ? `وبقيت <b>${R.notRated.length}</b> محطة دون أي تقييم من العملاء. ` : ''}`
    const order = ['top', 'ok', 'watch', 'bad', 'stopped'].map(k => VERDICTS.find(v => v.key === k))
    const stack = order.map(v => R.counts[v.key] ? `<i style="width:${(R.counts[v.key] / n) * 100}%;background:${v.c}"></i>` : '').join('')
    const legend = order.filter(v => R.counts[v.key]).map(v => `<span class="chip" style="background:${v.bg};color:${v.c}">${esc(v.ar)} · ${R.counts[v.key]}</span>`).join(' ')
    const mini = list => `<table class="t"><thead><tr><th>#</th><th>المحطة</th><th>المدير</th><th>الدرجة</th></tr></thead><tbody>${list.map((r, i) => `<tr><td>${i + 1}</td><td class="l"><b>${esc(r.name)}</b></td><td class="l">${esc(r.managers[0] || '—')}</td>${cell(r.score)}</tr>`).join('')}</tbody></table>`
    const best = [...R.rows].reverse().filter(r => r.score >= 75).slice(0, 5)
    const worst = R.rows.filter(r => r.score < 75).slice(0, 5)
    const meter = (l, p, txt) => { const [bg] = heat(p); return `<div class="mt"><span>${esc(l)}</span><span class="mb"><i style="width:${p ?? 0}%;background:${bg}"></i></span><span class="mv">${esc(txt)}</span></div>` }
    const card = r => `<div class="sc" style="--c:${r.verdict.c}">
        <div class="top"><div class="ring" style="background:conic-gradient(${heat(r.score)[0]} ${r.score * 3.6}deg,#e8edf3 0)"><b>${r.score}</b></div>
          <div class="nm"><b>${esc(r.name)}</b><small>المدير: ${esc(r.managers.slice(0, 2).join('، ') || 'غير معيّن')} · دخل ${r.loggedIn} من ${r.staffRows.length} حسابات</small></div>${chip(r.verdict)}</div>
        ${meter('الرحلات', r.tripsPct, r.expected ? `${r.tripsPct}% · ${r.entered}/${r.expected}` : 'لا رحلات')}
        ${meter('الإيرادات', r.salesPct, r.salesApplicable ? `${r.salesPct}% · ${r.salesCovered}/${r.salesExpected}` : 'لا إيرادات')}
        ${meter('العملاء', r.rate ? 100 : 0, r.rate ? `${r.rate} تقييم` : 'لم تُقيَّم')}
        <div class="shs">${r.byShift.map(x => { const [bg, fg] = heat(x.score); return `<span class="sh" style="background:${bg};color:${fg}"><small>${esc(x.ar)}</small><b>${x.score == null ? '—' : x.score + '%'}</b></span>` }).join('')}</div>
        <div class="mt"><span>الموجودات</span><span></span><span class="mv">${r.lost} مسجّل</span></div>
        <p>${esc(r.story.status)} ${esc(r.story.diag.join(' '))}</p><p class="ac">${esc(r.story.action)}</p>
        <div class="pp">${r.staffRows.slice(0, 10).map(x => `<span class="${x.inPeriod ? 'on' : x.last ? 'old' : 'no'}">${esc(x.name)}${x.isMgr ? ' (مشرف)' : ''} · ${loginP(x.last)}</span>`).join('')}${r.staffRows.length > 10 ? `<span class="no">+${r.staffRows.length - 10}</span>` : ''}</div></div>`
    const groups = VERDICTS.map(v => ({ v, list: R.rows.filter(r => r.verdict.key === v.key) })).filter(g => g.list.length)
    const cardsHtml = groups.map(g => `<div class="gh" style="--c:${g.v.c}"><b>${esc(g.v.ar)} — ${g.list.length} ${g.list.length === 1 ? 'محطة' : 'محطات'}</b><span>${esc(g.v.line)}</span></div><div class="cg">${g.list.map(card).join('')}</div>`).join('')
    const body = `
      ${docHeader({ title: 'تقرير أداء المحطات', infoLines: [`الفترة: <b>${periodH}</b>`, `المحطات المقيَّمة: <b>${n}</b>`, `أعدّه: ${esc('الإدارة')}`] })}
      <style>${CARD_CSS}</style>
      <div class="body">
        <div class="sec"><h3>الخلاصة التنفيذية</h3>
          <div class="ins" style="background:#fff;border-right:4px solid #264673"><p style="margin:0;font-size:13.3px;line-height:2;color:#1e293b">${para}</p></div>
        </div>
        <div class="sec"><div class="grid g5">
          ${kpi((R.avgScore ?? '—') + (R.avgScore != null ? '%' : ''), 'متوسط الأداء العام', '#1C2B4A')}${kpi(weak, 'ضعيف / بلا نشاط', '#b91c1c')}${kpi(R.counts.watch, 'يحتاج إلى تحسين', '#b45309')}${kpi(strong, 'ممتاز أو جيد', '#15803d')}${kpi(R.notRated.length, 'دون تقييم عملاء', '#7c3aed')}
        </div>
        <div class="stack" style="height:12px;margin-top:10px">${stack}</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${legend}</div></div>
        <div class="sec"><h3>إيقاع الإدخال خلال اليوم</h3><table class="t"><thead><tr><th>الفترة</th><th>الأداء العام</th><th>إدخال الرحلات</th><th>تغطية الإيرادات</th><th>محطات مقيَّمة</th></tr></thead><tbody>
          ${R.netShifts.map(x => `<tr><td class="l"><b>${esc(x.ar)}</b></td>${cell(x.score)}${cell(x.trips)}${cell(x.sales)}<td>${x.stations}</td></tr>`).join('')}
        </tbody></table></div>
        ${(best.length || worst.length) ? `<div class="grid g2" style="margin-top:14px;gap:14px;align-items:start">
          ${best.length ? `<div><h4 class="sub">الأفضل أداءً</h4>${mini(best)}</div>` : '<div></div>'}
          ${worst.length ? `<div><h4 class="sub">الأحوج إلى التحسين</h4>${mini(worst)}</div>` : '<div></div>'}
        </div>` : ''}
        <div class="sec" style="break-inside:auto"><h3>بطاقات المحطات — من الأضعف إلى الأقوى</h3>${cardsHtml}</div>
        <ul class="notes"><li>الدرجة العامة = إدخال الرحلات ${W_TRIPS}% + تغطية الإيرادات للورديات ${W_SALES}% + تقييم العملاء ${W_RATING}%؛ ويُعاد توزيع الأوزان إن لم يتوفر أحد المقاييس. التقييم بالإدخالات فقط، بلا مبالغ ولا أعداد ركاب.</li><li>مقياس التقدير: ممتاز (90 فأكثر) · جيد (75–89) · يحتاج إلى تحسين (50–74) · ضعيف (أقل من 50) · لا يوجد نشاط مسجَّل (لا إدخال إطلاقاً رغم وجود حركات وموظفين).</li><li>«دخلوا» = عدد الحسابات (موظفون ومشرفون) التي سجّلت دخولاً خلال الفترة.</li></ul>
      </div>`
    openDocWindow(docShell({ title: `تقرير أداء المحطات — ${period}`, body, footerLeft: periodH, footerRight: 'NORTH WEST BUS' }))
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
          <button type="button" onClick={() => printStationPages(visible)} disabled={!result || loading || !visible.length}
            style={{ padding: '10px 22px', borderRadius: 10, border: '1.5px solid #1C2B4A', background: 'var(--card)', color: '#1C2B4A', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'inherit', cursor: result && !loading && visible.length ? 'pointer' : 'not-allowed', opacity: result && !loading && visible.length ? 1 : 0.5 }}>
            {isAr ? `صفحة لكل محطة (${visible.length})` : `Page per station (${visible.length})`}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(([l, a, b]) => { const f = addDays(today, a), t = addDays(today, b); return <button key={l} type="button" onClick={() => { setFrom(f); setTo(t) }} style={pill(from === f && to === t)}>{l}</button> })}
        </div>
        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
          {isAr ? 'التقييم بالإدخالات فقط (رحلات مدخلة، وتغطية الورديات بالإيرادات، وتقييم العملاء) بدون مبالغ ولا أعداد ركاب. الفترات الطويلة تحتاج وقتاً أطول للتحميل.' : 'Scored on entries only (trips entered, sales shift coverage, customer ratings) — no amounts or passenger counts.'}
        </p>
      </div>

      {result && (
        <div style={{ display: 'inline-flex', alignSelf: 'flex-start', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
          {[['stations', isAr ? 'أداء المحطات' : 'Stations'], ['accounts', isAr ? 'أداء الحسابات' : 'Accounts']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ padding: '9px 20px', border: 'none', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', background: tab === k ? '#1C2B4A' : 'transparent', color: tab === k ? '#fff' : 'var(--text-2)' }}>{l}</button>
          ))}
        </div>
      )}
      {err && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.82rem' }}>{err}</div>}
      {loading && !result && <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>{isAr ? 'جارٍ تحليل المحطات…' : 'Analysing stations…'}</div>}

      {result && tab === 'stations' && (
        <>
          {/* الملخص */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, opacity: loading ? 0.6 : 1 }}>
            {[
              [result.avgScore ?? '—', isAr ? 'متوسط الأداء العام' : 'Overall score', '#1C2B4A'],
              [result.counts.bad + result.counts.stopped, isAr ? 'ضعيف / بلا نشاط' : 'Poor / inactive', '#b91c1c'],
              [result.counts.watch, isAr ? 'يحتاج إلى تحسين' : 'Needs improvement', '#b45309'],
              [result.counts.ok + result.counts.top, isAr ? 'ممتاز أو جيد' : 'Excellent or good', '#15803d'],
              [result.notRated.length, isAr ? 'لم تُقيَّم من العملاء' : 'No customer ratings', '#7c3aed'],
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
                        <button type="button" onClick={() => printStationPages([r])} style={{ marginInlineStart: 'auto', fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>{isAr ? 'صفحة المحطة' : 'Station page'}</button>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-2)', marginTop: 4, fontWeight: 600 }}>
                        {isAr ? 'المدير: ' : 'Manager: '}<b style={{ color: 'var(--text-1)' }}>{r.managers.length ? r.managers.slice(0, 2).join('، ') + (r.managers.length > 2 ? ` +${r.managers.length - 2}` : '') : (isAr ? 'غير معيّن' : 'Not assigned')}</b>
                        <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>{isAr ? `${r.staff} موظف نشط` : `${r.staff} active staff`}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: 6, lineHeight: 1.7 }}>
                        <b style={{ color: r.verdict.c }}>{r.story.status}</b> {r.story.diag.join(' ')}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-1)', marginTop: 4, fontWeight: 800 }}>{r.story.action}</div>
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
                  {/* موظفو المحطة ومتى دخلوا لحساباتهم */}
                  <button type="button" onClick={() => setOpenStaff(o => ({ ...o, [r.id]: !o[r.id] }))}
                    style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-1)' }}>{isAr ? `الموظفون والمشرفون (${r.staffRows.length}) — دخل لحسابه خلال الفترة ${r.loggedIn} من ${r.staffRows.length}` : `Staff & supervisors (${r.staffRows.length}) — logged in during period: ${r.loggedIn}`}</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>{openStaff[r.id] ? '▲' : '▼'}</span>
                  </button>
                  {openStaff[r.id] && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8, marginTop: 8 }}>
                      {r.staffRows.map(x => {
                        const live = presence[x.id]
                        const [bg, fg] = x.inPeriod ? ['#dcfce7', '#15803d'] : x.last ? ['#fef3c7', '#b45309'] : ['#f3f4f6', '#6b7280']
                        return (
                          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', minWidth: 0 }}>
                            <i style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: live ? (live.active ? '#16a34a' : '#f59e0b') : '#d1d5db' }} title={live ? (live.active ? 'متصل الآن' : 'متصل · خامل') : 'غير متصل'} />
                            <span style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</span>
                            {x.isMgr && <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{isAr ? 'مشرف' : 'Sup.'}</span>}
                            <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: bg, color: fg, whiteSpace: 'nowrap', fontFamily: MONO }}>{live ? (isAr ? 'متصل الآن' : 'online') : (fmtLogin(x.last) || (isAr ? 'لم يدخل' : 'never'))}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
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

        </>
      )}

      {result && tab === 'accounts' && (
        <>
          {/* فلاتر الحسابات */}
          <div style={{ ...card, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'المحطة' : 'Station'}</label>
                <select value={aSt} onChange={e => { setASt(e.target.value); setAMore(100) }} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-full">
                  <option value="all">{isAr ? `كل المحطات (${result.accounts.length} حساب)` : `All stations (${result.accounts.length})`}</option>
                  {accStations.map(x => <option key={x.id} value={String(x.id)}>{x.name} ({x.n})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'الصفة' : 'Role'}</label>
                <select value={aRole} onChange={e => { setARole(e.target.value); setAMore(100) }} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="all">{isAr ? 'الكل' : 'All'}</option><option value="emp">{isAr ? 'الموظفون' : 'Employees'}</option><option value="mgr">{isAr ? 'المشرفون' : 'Supervisors'}</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'الترتيب' : 'Sort'}</label>
                <select value={aSort} onChange={e => setASort(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="low">{isAr ? 'الأقل نشاطاً أولاً' : 'Least active first'}</option><option value="top">{isAr ? 'الأكثر إدخالاً' : 'Most entries'}</option><option value="login">{isAr ? 'آخر دخول' : 'Last login'}</option>
                </select>
              </div>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'بحث بالاسم' : 'Search name'}</label>
                <input value={aQ} onChange={e => { setAQ(e.target.value); setAMore(100) }} placeholder={isAr ? 'اسم الحساب…' : 'Name…'} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-full" />
              </div>
              <button type="button" onClick={printAccounts} disabled={loading || accList.length === 0}
                style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#1C2B4A', color: '#fff', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'inherit', cursor: accList.length ? 'pointer' : 'not-allowed', opacity: accList.length ? 1 : 0.5 }}>
                {isAr ? 'طباعة القائمة / PDF' : 'Print / PDF'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setAStatus('all'); setAMore(100) }} style={pill(aStatus === 'all')}>{isAr ? 'الكل' : 'All'} <span style={{ fontFamily: MONO, opacity: 0.8 }}>{accCounts.all}</span></button>
              {ACC_STATUS.map(x => <button key={x.key} type="button" onClick={() => { setAStatus(aStatus === x.key ? 'all' : x.key); setAMore(100) }} style={pill(aStatus === x.key)}>{x.ar} <span style={{ fontFamily: MONO, opacity: 0.8 }}>{accCounts[x.key]}</span></button>)}
            </div>
            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
              {isAr ? 'نشاط الحساب = الأيام التي أدخل فيها رحلات أو إيرادات خلال الفترة. من يعمل بورديات متناوبة قد لا يعمل كل الأيام، فاقرأ الحالة مع جدول دوامه.' : 'Activity = days with trip or sales entries in the period.'}
            </p>
          </div>

          {accList.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.88rem' }}>{isAr ? 'لا توجد حسابات مطابقة' : 'No matching accounts'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: loading ? 0.6 : 1 }}>
              {accList.slice(0, aMore).map(a => {
                const live = presence[a.id], pc = Math.round((a.activeDays / Math.max(1, result.days)) * 100)
                return (
                  <div key={a.id} style={{ ...card, padding: '11px 14px', borderInlineStart: `4px solid ${a.status.c}`, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <i style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: live ? (live.active ? '#16a34a' : '#f59e0b') : '#d1d5db' }} title={live ? 'متصل الآن' : 'غير متصل'} />
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                        {a.isMgr && <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{isAr ? 'مشرف' : 'Sup.'}</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>{a.station} · {live ? (isAr ? 'متصل الآن' : 'online') : (isAr ? 'آخر دخول: ' : 'Last login: ') + (fmtLogin(a.last) || (isAr ? 'لم يدخل' : 'never'))}</div>
                    </div>
                    <div style={{ flex: '1 1 150px', minWidth: 130 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}><span>{isAr ? 'أيام الإدخال' : 'Active days'}</span><span style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{a.activeDays}/{result.days}</span></div>
                      <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-2)', marginTop: 4, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${pc}%`, background: a.status.c, borderRadius: 99 }} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)' }}>
                      <div>{isAr ? 'رحلات' : 'Trips'}<div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '0.95rem', color: 'var(--text-1)' }}>{a.trips}</div></div>
                      <div>{isAr ? 'إيراد' : 'Sales'}<div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '0.95rem', color: 'var(--text-1)' }}>{a.sales}</div></div>
                      <div>{isAr ? 'آخر إدخال' : 'Last entry'}<div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '0.95rem', color: 'var(--text-1)' }}>{a.lastEntry ? a.lastEntry.slice(5).replace('-', '/') : '—'}</div></div>
                    </div>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, padding: '3px 12px', borderRadius: 99, background: a.status.bg, color: a.status.c, whiteSpace: 'nowrap' }}>{a.status.ar}</span>
                  </div>
                )
              })}
              {accList.length > aMore && <button type="button" onClick={() => setAMore(m => m + 100)} style={{ ...pill(false), alignSelf: 'center' }}>{isAr ? `عرض المزيد (${accList.length - aMore})` : 'Show more'}</button>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
