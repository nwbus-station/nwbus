// التقرير التشغيلي التحليلي (Excel) — المغادرة والوصول لفترة يحددها المستخدم.
// يُبنى بالمتصفح وينزل مباشرة (بدون إيميل). الأرقام تتبع نفس قواعد صفحة التقارير:
// الانضباط من مقارنة الموعد المجدول بالفعلي، و«غير المُدخلة» من الرحلات المفعّلة للمحطة التي لا يوجد لها سجل.
import { createBook, XL } from './excelExport'
import { lineChart, barChart, donutChart } from './chartImages'

// ── أدوات عامة ─────────────────────────────────────────────
const n0 = n => Math.round(n || 0).toLocaleString('en-US')
const pc = x => (x == null ? '—' : Math.round(x * 100) + '%')
const pctChange = (cur, prev) => (prev > 0 ? (cur - prev) / prev : null)
const WD_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const STATUS_AR = {
  'Accident between other vehicles': 'حادث بين مركبات أخرى', 'Health (Driver/Passengers)': 'حالة صحية (سائق/ركاب)', 'Passenger Misbehavior': 'سوء سلوك راكب',
  'Police Control': 'نقطة تفتيش', 'Traffic Jam': 'ازدحام مروري', 'Weather': 'أحوال جوية', 'Accident with NWB bus': 'حادث لحافلة NWB',
  'Malfunction inside the station': 'عطل داخل المحطة', 'Out-of-station malfunction': 'عطل خارج المحطة', 'Normal': 'طبيعية',
}
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000)
const eachDay = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out }
const dowOf = iso => new Date(iso + 'T00:00:00Z').getUTCDay()
const times = n => (n >= 3 && n <= 10 ? 'مرات' : 'مرة')
const hhmm = v => (v ? String(v).slice(0, 5) : '')
const fmtT = v => { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(11, 16) }

// الفرق بالدقائق بين الموعد والفعلي (مع تجاوز منتصف الليل) وتصنيفه — نفس منطق صفحة التقارير
function delayOf(sch, act) {
  if (!sch || !act) return null
  const [sh, sm] = sch.split(':').map(Number), [ah, am] = act.split(':').map(Number)
  if ([sh, sm, ah, am].some(Number.isNaN)) return null
  let d = (ah * 60 + am) - (sh * 60 + sm)
  if (d < -120) d += 1440
  return d
}
const classify = d => (d == null ? null : d < 0 ? 'early' : d <= 5 ? 'ontime' : d <= 15 ? 'noton' : 'delayed')

const newStat = () => ({ trips: 0, pax: 0, missed: 0, rated: 0, good: 0, early: 0, ontime: 0, noton: 0, delayed: 0 })
function addStat(s, rec) {
  s.trips++; s.pax += rec.pax; s.missed += rec.missed
  if (rec.cls) { s.rated++; s[rec.cls]++; if (rec.cls === 'early' || rec.cls === 'ontime') s.good++ }
}
const punct = s => (s.rated > 0 ? s.good / s.rated : null)
const missedRate = s => ((s.pax + s.missed) > 0 ? s.missed / (s.pax + s.missed) : 0)

async function fetchAll(supabase, build, onProgress) {
  let all = [], page = 0
  for (;;) {
    const { data, error } = await build().range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(error.message)
    all = all.concat(data ?? [])
    onProgress?.(all.length)
    if (!data || data.length < 1000) break
    if (++page > 300) break
  }
  return all
}

const UNENTERED_CAP = 30000

export async function buildOperationsReport({ supabase, isAr, from, to, kind = 'all', onProgress }) {
  const T = (a, e) => (isAr ? a : e)
  const span = daysBetween(from, to) + 1
  if (span < 1) throw new Error(T('الفترة غير صحيحة', 'Invalid period'))
  if (span > 400) throw new Error(T('الحد الأقصى للفترة 400 يوماً', 'Maximum period is 400 days'))
  const pFrom = addDays(from, -span), pTo = addDays(from, -1)
  const days = eachDay(from, to)
  const WD = isAr ? WD_AR : WD_EN

  // ── المحطات ────────────────────────────────────────────
  onProgress?.(T('جلب المحطات…', 'Loading stations…'))
  let stRaw = null, agentCol = false
  for (const cols of ['id, name_ar, name_en, is_active, merged_into, is_agent, city_group', 'id, name_ar, name_en, is_active, merged_into, is_agent', 'id, name_ar, name_en, is_active, merged_into']) {
    const { data, error } = await supabase.from('stations').select(cols)
    if (!error) { stRaw = data; agentCol = cols.includes('is_agent'); break }
  }
  if (!stRaw) throw new Error(T('تعذّر جلب المحطات', 'Could not load stations'))
  const agentTag = T('وكيل', 'Agent')
  const nameOf = s => `${(isAr ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar)) || '—'}${s.is_agent ? ` (${agentTag})` : ''}`
  const plainName = s => (isAr ? (s?.name_ar || s?.name_en) : (s?.name_en || s?.name_ar)) || '—'
  const stations = stRaw.filter(s => s.is_active !== false && !s.merged_into)
    .filter(s => kind === 'agent' ? !!s.is_agent : kind === 'nwb' ? !s.is_agent : true)
  const allowed = new Set(stations.map(s => s.id))
  const stById = Object.fromEntries(stRaw.map(s => [s.id, s]))
  const stName = {}; stations.forEach(s => { stName[s.id] = nameOf(s) })

  // ── سجلات الترحيل (الفترة + السابقة) ─────────────────────
  onProgress?.(T('جلب سجلات الترحيل…', 'Loading trip records…'))
  const records = await fetchAll(supabase, () => supabase.from('trip_records')
    .select(`id, record_date, station_id, trip_schedule_id, bus_number, passenger_count, missed_count, actual_departure, actual_arrival, is_arrival,
      operational_status, is_extra_trip, notes, created_by_name,
      trip:trip_schedule_id(trip_number, from_station_id, to_station_id, scheduled_departure, scheduled_arrival,
        from_station:from_station_id(name_ar, name_en), to_station:to_station_id(name_ar, name_en))`)
    .gte('record_date', pFrom).lte('record_date', to).order('record_date', { ascending: false }).order('id'),
  n => onProgress?.(T(`جلب سجلات الترحيل… ${n0(n)}`, `Loading trip records… ${n0(n)}`)))

  // ── الرحلات المفعّلة للمحطات + أوقات التوقف (لحساب «غير المُدخلة» وأوقات الموعد) ──
  onProgress?.(T('جلب جدول الرحلات…', 'Loading the trip schedule…'))
  const stationTrips = await fetchAll(supabase, () => supabase.from('station_trips')
    .select(`trip_schedule_id, station_id, departure_time, arrival_time, dep_enabled, arr_enabled,
      trip:trip_schedule_id(trip_number, from_station_id, to_station_id, scheduled_departure, scheduled_arrival, is_active, is_rf, rf_date, days_of_week, start_date, end_date,
        from_station:from_station_id(id, name_ar, name_en, city_group), to_station:to_station_id(id, name_ar, name_en, city_group))`)
    .order('trip_schedule_id').order('station_id'))
  const stops = await fetchAll(supabase, () => supabase.from('trip_schedule_stops')
    .select('trip_schedule_id, station_id, arrival_time, departure_time').order('trip_schedule_id').order('station_id').order('stop_order'))
  const stMap = {}, stopMap = {}
  stationTrips.forEach(x => { stMap[`${x.trip_schedule_id}|${x.station_id}`] = x })
  stops.forEach(x => { stopMap[`${x.trip_schedule_id}|${x.station_id}`] = x })

  // ── استبيانات رضا العملاء (للأدمن فقط — إن لم تتوفر الصلاحية/الجدول نكمل بدونها) ──
  onProgress?.(T('جلب تقييمات العملاء…', 'Loading customer ratings…'))
  let surveys = [], surveysOk = true
  try {
    surveys = await fetchAll(supabase, () => supabase.from('customer_surveys')
      .select('id, kind, station_id, from_station_id, to_station_id, ratings, nps, comment, created_at')
      .gte('created_at', `${from}T00:00:00+03:00`).lte('created_at', `${to}T23:59:59+03:00`).order('created_at', { ascending: false }).order('id'))
  } catch { surveysOk = false; surveys = [] }

  // ── تصنيف السجلات: مغادرة أم وصول ─────────────────────────
  // محطة المنشأ = مغادرة، محطة الوجهة = وصول، محطة العبور حسب is_arrival — نفس منطق صفحة التقارير
  const isDeparture = r => {
    const tr = r.trip
    if (tr?.from_station_id && tr.from_station_id === r.station_id) return true
    if (tr?.to_station_id && tr.to_station_id === r.station_id) return false
    if (r.is_arrival != null) return r.is_arrival === false
    return !(r.actual_arrival != null && r.actual_departure == null)
  }
  onProgress?.(T('تحليل البيانات…', 'Analyzing…'))
  const recs = []
  for (const r of records) {
    if (kind !== 'all' && !allowed.has(r.station_id)) continue
    const date = String(r.record_date || '').slice(0, 10)
    const dir = isDeparture(r) ? 'dep' : 'arr'
    const tk = `${r.trip_schedule_id}|${r.station_id}`, se = stMap[tk], sp = stopMap[tk], tr = r.trip
    const sched = dir === 'dep'
      ? hhmm(se?.departure_time || sp?.departure_time || tr?.scheduled_departure)
      : hhmm(se?.arrival_time || sp?.arrival_time || tr?.scheduled_arrival)
    const act = fmtT(dir === 'dep' ? r.actual_departure : (r.actual_arrival ?? r.actual_departure))
    const delay = delayOf(sched, act)
    recs.push({
      id: r.id, date, sid: r.station_id, tid: r.trip_schedule_id, dir, sched, act, delay, cls: classify(delay),
      pax: Number(r.passenger_count) || 0, missed: Number(r.missed_count) || 0, bus: r.bus_number ?? '', trip: tr?.trip_number ?? '',
      status: r.operational_status && r.operational_status !== 'Normal' ? r.operational_status : '', extra: !!r.is_extra_trip, notes: r.notes ?? '', by: r.created_by_name ?? '',
    })
  }
  const cur = recs.filter(r => r.date >= from && r.date <= to)
  const prev = recs.filter(r => r.date >= pFrom && r.date <= pTo)

  // ── الحركات المتوقعة وغير المُدخلة ───────────────────────────
  const groupOf = x => { if (!x) return null; if (x.city_group) return x.city_group; const w = (x.name_en || '').split(/[\s-]+/)[0].toLowerCase(); return w || null }
  const enteredKeys = new Set(cur.map(r => `${r.tid}|${r.date}|${r.sid}|${r.dir}`))
  const expected = []   // { date, sid, tid, dir, time, trip, from, to }
  for (const st of stationTrips) {
    const trip = st.trip
    if (!trip?.is_active || !allowed.has(st.station_id)) continue
    if (kind === 'all' && !stById[st.station_id]) continue
    const isDest = trip.to_station?.id === st.station_id || trip.to_station_id === st.station_id
    const isOrigin = trip.from_station?.id === st.station_id || trip.from_station_id === st.station_id
    const stop = stopMap[`${st.trip_schedule_id}|${st.station_id}`]
    const arrOn = st.arr_enabled !== false, depOn = st.dep_enabled !== false
    const curG = groupOf(stById[st.station_id]), fromG = groupOf(trip.from_station), toG = groupOf(trip.to_station)
    const sameFrom = !!(curG && fromG && curG === fromG), sameTo = !!(curG && toG && curG === toG)
    const legs = []   // [dir, time]
    if (isDest) { if (arrOn) legs.push(['arr', st.arrival_time || trip.scheduled_arrival]) }
    else if (isOrigin) { if (depOn) legs.push(['dep', st.departure_time || trip.scheduled_departure]) }
    else if (stop) {
      if (arrOn && !sameFrom) legs.push(['arr', st.arrival_time || stop.arrival_time])
      if (depOn && !sameTo) legs.push(['dep', st.departure_time || stop.departure_time])
    } else {
      if (arrOn && !sameFrom) legs.push(['arr', st.arrival_time])
      if (depOn && !sameTo) legs.push(['dep', st.departure_time])
    }
    const live = legs.filter(l => l[1])
    if (!live.length) continue
    for (const date of days) {
      if (trip.is_rf && trip.rf_date !== date) continue
      if (trip.start_date && date < trip.start_date) continue
      if (trip.end_date && date > trip.end_date) continue
      if (trip.days_of_week?.length && !trip.days_of_week.includes(dowOf(date))) continue
      for (const [dir, time] of live) {
        expected.push({ date, sid: st.station_id, tid: st.trip_schedule_id, dir, time: hhmm(time), trip: trip.trip_number || '—', from: plainName(trip.from_station), to: plainName(trip.to_station),
          missing: !enteredKeys.has(`${st.trip_schedule_id}|${date}|${st.station_id}|${dir}`) })
      }
    }
  }
  const unentered = expected.filter(e => e.missing)

  // ── تقييمات العملاء لكل محطة ───────────────────────────────
  const ASPECT = {
    punctuality: T('الالتزام بالمواعيد', 'Punctuality'), driver: T('السائق', 'Driver'), bus_clean: T('نظافة الحافلة', 'Bus cleanliness'), comfort: T('الراحة', 'Comfort'),
    ticketing: T('التذاكر', 'Ticketing'), call_center: T('مركز الاتصال', 'Call center'), st_overall: T('المحطة (عام)', 'Station (overall)'), st_clean: T('نظافة المحطة', 'Station cleanliness'),
    st_staff: T('موظفو المحطة', 'Station staff'), st_facilities: T('مرافق المحطة', 'Facilities'), st_info: T('معلومات المحطة', 'Information'),
  }
  const surveyRows = surveys.map(x => {
    const vals = Object.values(x.ratings || {}).map(Number).filter(v => !Number.isNaN(v))
    return { id: x.id, kind: x.kind, sid: x.kind === 'station' ? x.station_id : x.from_station_id, to: x.to_station_id, ratings: x.ratings || {}, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      min: vals.length ? Math.min(...vals) : null, nps: x.nps == null ? null : Number(x.nps), comment: x.comment || '', at: x.created_at }
  })
  const survOf = ids => {
    const rs = surveyRows.filter(r => ids.has(r.sid)), avgs = rs.filter(r => r.avg != null)
    const npsRows = rs.filter(r => r.nps != null)
    return { n: rs.length, avg: avgs.length ? avgs.reduce((a, b) => a + b.avg, 0) / avgs.length : null,
      nps: npsRows.length ? Math.round(100 * (npsRows.filter(r => r.nps >= 9).length - npsRows.filter(r => r.nps <= 6).length) / npsRows.length) : null,
      low: rs.length ? rs.filter(r => r.min != null && r.min <= 2).length / rs.length : null }
  }

  // ── التجميع لكل مجموعة (نورث وست / الوكلاء كلٌّ على حدة) ─────────────
  function aggregate(ids) {
    const tot = { dep: newStat(), arr: newStat() }, totPrev = { dep: newStat(), arr: newStat() }
    const byStation = {}, byDay = {}, hours = Array(24).fill(0), statusCnt = {}
    const ensure = sid => (byStation[sid] ??= { dep: newStat(), arr: newStat(), pDep: newStat(), pArr: newStat(), expDep: 0, expArr: 0, unDep: 0, unArr: 0 })
    days.forEach(d => { byDay[d] = { dep: newStat(), arr: newStat(), expDep: 0, expArr: 0, unDep: 0, unArr: 0 } })
    stations.filter(st => ids.has(st.id)).forEach(st => ensure(st.id))
    const gCur = cur.filter(r => ids.has(r.sid)), gPrev = prev.filter(r => ids.has(r.sid))
    for (const r of gCur) {
      addStat(tot[r.dir], r); addStat(byDay[r.date][r.dir], r); addStat(ensure(r.sid)[r.dir], r)
      if (r.status) statusCnt[r.status] = (statusCnt[r.status] || 0) + 1
      if (r.dir === 'dep' && r.act) { const h = Number(r.act.slice(0, 2)); if (h >= 0 && h < 24) hours[h]++ }
    }
    for (const r of gPrev) { addStat(totPrev[r.dir], r); addStat(ensure(r.sid)[r.dir === 'dep' ? 'pDep' : 'pArr'], r) }
    const exp = expected.filter(e => ids.has(e.sid))
    for (const e of exp) {
      const k = e.dir === 'dep' ? 'Dep' : 'Arr', s = ensure(e.sid), d = byDay[e.date]
      s['exp' + k]++; d['exp' + k]++
      if (e.missing) { s['un' + k]++; d['un' + k]++ }
    }
    const un = exp.filter(e => e.missing)
    const expDepN = exp.filter(e => e.dir === 'dep').length, expArrN = exp.length - expDepN
    const unDepN = un.filter(e => e.dir === 'dep').length, unArrN = un.length - unDepN
    const rows = stations.filter(st => ids.has(st.id)).map(st => {
      const s = byStation[st.id], visitors = s.dep.pax + s.arr.pax, prevVis = s.pDep.pax + s.pArr.pax, sv = survOf(new Set([st.id]))
      return { id: st.id, name: nameOf(st), agent: !!st.is_agent, s, visitors, prevVis, change: pctChange(visitors, prevVis), un: s.unDep + s.unArr, exp: s.expDep + s.expArr, sv }
    }).sort((a, b) => b.visitors - a.visitors || a.name.localeCompare(b.name))
    return { ids, tot, totPrev, byDay, byStation, hours, statusCnt, rows, active: rows.filter(r => r.s.dep.trips + r.s.arr.trips > 0),
      expDepN, expArrN, unDepN, unArrN, expAll: exp.length, unAll: un.length, visitors: tot.dep.pax + tot.arr.pax, prevVisitors: totPrev.dep.pax + totPrev.arr.pax,
      daysWithData: new Set(gCur.map(r => r.date)), sv: survOf(ids), curN: gCur.length }
  }
  const complete = (exp, un) => (exp > 0 ? (exp - un) / exp : null)
  const nwbIds = new Set(stations.filter(st => !st.is_agent).map(st => st.id)), agIds = new Set(stations.filter(st => st.is_agent).map(st => st.id))
  const G_nwb = nwbIds.size ? aggregate(nwbIds) : null, G_ag = agIds.size ? aggregate(agIds) : null
  const main = kind === 'agent' ? G_ag : (G_nwb ?? G_ag)
  const side = kind === 'all' && G_nwb && G_ag ? G_ag : null
  const mainLabel = kind === 'agent' ? T('محطات الوكلاء', 'Agent stations') : T('محطات نورث وست', 'North West stations')
  const EMPTY = aggregate(new Set())

  // ── التحليل النصي لمجموعة ──────────────────────────────────
  function analysisOf(G) {
    const { tot, totPrev, rows, active, visitors, prevVisitors, expAll, unAll, unDepN, unArrN, statusCnt, hours } = G
    const insights = [], recs2 = []
    if (!G.curN && !expAll) { insights.push(T('لا توجد سجلات ترحيل ولا رحلات مجدولة ضمن الفترة المحددة.', 'No trip records or scheduled trips within the selected period.')); return { insights, recs2 } }
    insights.push(T(
      `خلال ${span} يوماً بلغ عدد زوار المحطات ${n0(visitors)} (${n0(tot.dep.pax)} راكب مغادرة في ${n0(tot.dep.trips)} رحلة، و${n0(tot.arr.pax)} راكب وصول في ${n0(tot.arr.trips)} رحلة).`,
      `Over ${span} days stations had ${n0(visitors)} visitors (${n0(tot.dep.pax)} departing on ${n0(tot.dep.trips)} trips, ${n0(tot.arr.pax)} arriving on ${n0(tot.arr.trips)} trips).`))
    const chV = pctChange(visitors, prevVisitors)
    if (chV != null) {
      const f = (label, ch) => (ch == null ? '' : T(`${label} ${ch >= 0 ? 'أعلى' : 'أقل'} بنسبة ${Math.abs(Math.round(ch * 100))}%`, `${label} ${Math.abs(Math.round(ch * 100))}% ${ch >= 0 ? 'higher' : 'lower'}`))
      insights.push(T(`مقارنة بالفترة السابقة المماثلة: ${[f('عدد الزوار', chV), f('ركاب المغادرة', pctChange(tot.dep.pax, totPrev.dep.pax)), f('ركاب الوصول', pctChange(tot.arr.pax, totPrev.arr.pax))].filter(Boolean).join('، ')}.`,
        `Versus the previous equal period: ${[f('visitors', chV), f('departing', pctChange(tot.dep.pax, totPrev.dep.pax)), f('arriving', pctChange(tot.arr.pax, totPrev.arr.pax))].filter(Boolean).join('; ')}.`))
    }
    if (expAll > 0) {
      const worstUn = rows.filter(r => r.un > 0).sort((a, b) => b.un - a.un).slice(0, 3)
      insights.push(unAll === 0
        ? T(`اكتمال الإدخال 100%: كل الحركات المجدولة (${n0(expAll)}) لها سجل.`, `Entry completeness is 100%: all ${n0(expAll)} scheduled movements have a record.`)
        : T(`اكتمال الإدخال ${pc(complete(expAll, unAll))}: لم تُدخل ${n0(unDepN)} حركة مغادرة و${n0(unArrN)} حركة وصول من أصل ${n0(expAll)} حركة مجدولة.${worstUn.length ? ` أكثر المحطات نقصاً: ${worstUn.map(r => `${r.name} (${n0(r.un)})`).join('، ')}.` : ''}`,
          `Entry completeness is ${pc(complete(expAll, unAll))}: ${n0(unDepN)} departures and ${n0(unArrN)} arrivals missing out of ${n0(expAll)} scheduled.${worstUn.length ? ` Most missing at: ${worstUn.map(r => `${r.name} (${n0(r.un)})`).join(', ')}.` : ''}`))
    }
    for (const [dir, label, labelEn] of [['dep', 'المغادرة', 'Departure'], ['arr', 'الوصول', 'Arrival']]) {
      const st = tot[dir], pu = punct(st)
      if (pu == null) continue
      const ranked = rows.filter(r => r.s[dir].rated >= 5).sort((a, b) => punct(b.s[dir]) - punct(a.s[dir]))
      let line = T(`الانضباط في ${label} ${pc(pu)} (${pu >= 0.85 ? 'مستوى ممتاز' : pu >= 0.7 ? 'مستوى جيد ويحتاج متابعة' : 'مستوى منخفض يحتاج تدخلاً'}) من ${n0(st.rated)} رحلة مقيَّمة.`,
        `${labelEn} punctuality is ${pc(pu)} (${pu >= 0.85 ? 'excellent' : pu >= 0.7 ? 'good, needs follow-up' : 'low, needs action'}) across ${n0(st.rated)} rated trips.`)
      if (ranked.length >= 2 && punct(ranked[0].s[dir]) - punct(ranked[ranked.length - 1].s[dir]) >= 0.01) {
        const b = ranked[0], w = ranked[ranked.length - 1]
        line += T(` الأفضل: ${b.name} (${pc(punct(b.s[dir]))})، والأدنى: ${w.name} (${pc(punct(w.s[dir]))}).`, ` Best: ${b.name} (${pc(punct(b.s[dir]))}); lowest: ${w.name} (${pc(punct(w.s[dir]))}).`)
      }
      insights.push(line)
    }
    if (active.length && visitors > 0) insights.push(T(`أكثر المحطات زواراً: ${active[0].name} بـ ${n0(active[0].visitors)} زائر (${Math.round((active[0].visitors / visitors) * 100)}% من الإجمالي).`,
      `Most visited station: ${active[0].name} with ${n0(active[0].visitors)} visitors (${Math.round((active[0].visitors / visitors) * 100)}% of total).`))
    const dow = Array.from({ length: 7 }, () => ({ pax: 0, days: new Set() }))
    cur.filter(r => G.ids.has(r.sid)).forEach(r => { const w = dowOf(r.date); dow[w].pax += r.pax; dow[w].days.add(r.date) })
    const dw = dow.map((d, i) => ({ i, avg: d.days.size ? d.pax / d.days.size : 0 })).filter(d => d.avg > 0).sort((a, b) => b.avg - a.avg)
    if (dw.length >= 3) insights.push(T(`أعلى أيام الأسبوع زواراً: ${WD_AR[dw[0].i]} بمتوسط ${n0(dw[0].avg)} يومياً، وأهدؤها ${WD_AR[dw[dw.length - 1].i]} (${n0(dw[dw.length - 1].avg)}).`,
      `Busiest weekday: ${WD_EN[dw[0].i]} (avg ${n0(dw[0].avg)} per day); quietest: ${WD_EN[dw[dw.length - 1].i]} (${n0(dw[dw.length - 1].avg)}).`))
    const hs = hours.map((v, h) => [h, v]).sort((a, b) => b[1] - a[1])
    if (hs[0][1] > 0) insights.push(T(`ذروة المغادرة عند الساعة ${String(hs[0][0]).padStart(2, '0')}:00 بـ ${n0(hs[0][1])} رحلة.`, `Departure peak at ${String(hs[0][0]).padStart(2, '0')}:00 with ${n0(hs[0][1])} trips.`))
    const mr = rows.filter(r => r.s.dep.pax + r.s.dep.missed >= 50).sort((a, b) => missedRate(b.s.dep) - missedRate(a.s.dep))
    if (tot.dep.missed > 0 && mr.length) insights.push(T(`المتخلفون عن المغادرة: ${n0(tot.dep.missed)} راكباً (${(missedRate(tot.dep) * 100).toFixed(1)}%)، وأعلى نسبة في ${mr[0].name} (${(missedRate(mr[0].s.dep) * 100).toFixed(1)}%).`,
      `Passengers who missed departures: ${n0(tot.dep.missed)} (${(missedRate(tot.dep) * 100).toFixed(1)}%); highest rate at ${mr[0].name} (${(missedRate(mr[0].s.dep) * 100).toFixed(1)}%).`))
    if (G.sv.n > 0 && G.sv.avg != null) {
      const sr = rows.filter(r => r.sv.n >= 3 && r.sv.avg != null).sort((a, b) => b.sv.avg - a.sv.avg)
      let l = T(`رضا العملاء ${G.sv.avg.toFixed(2)} من 5 من ${n0(G.sv.n)} استبياناً${G.sv.nps != null ? `، ومؤشر التوصية NPS ${G.sv.nps}` : ''}.`, `Customer satisfaction ${G.sv.avg.toFixed(2)} / 5 from ${n0(G.sv.n)} surveys${G.sv.nps != null ? `; NPS ${G.sv.nps}` : ''}.`)
      if (sr.length >= 2) l += T(` الأعلى: ${sr[0].name} (${sr[0].sv.avg.toFixed(2)})، والأدنى: ${sr[sr.length - 1].name} (${sr[sr.length - 1].sv.avg.toFixed(2)}).`, ` Highest: ${sr[0].name} (${sr[0].sv.avg.toFixed(2)}); lowest: ${sr[sr.length - 1].name} (${sr[sr.length - 1].sv.avg.toFixed(2)}).`)
      insights.push(l)
    }
    const sk = Object.keys(statusCnt).sort((a, b) => statusCnt[b] - statusCnt[a])
    if (sk.length) insights.push(T(`أكثر حالة تشغيلية غير طبيعية: ${STATUS_AR[sk[0]] || sk[0]} (${statusCnt[sk[0]]} ${times(statusCnt[sk[0]])})، وإجمالي الحالات ${sk.reduce((s, k) => s + statusCnt[k], 0)}.`,
      `Most common abnormal status: ${sk[0]} (${statusCnt[sk[0]]}×); ${sk.reduce((s, k) => s + statusCnt[k], 0)} cases in total.`))

    const noEntry = rows.filter(r => r.un > 0).sort((a, b) => b.un - a.un).slice(0, 6)
    if (noEntry.length) recs2.push(T(`استكمال إدخال الحركات الناقصة في: ${noEntry.map(r => r.name).join('، ')} (التفاصيل في ورقة «غير المُدخلة»).`, `Complete the missing entries at: ${noEntry.map(r => r.name).join(', ')} (see the “Not entered” sheet).`))
    for (const [dir, label, labelEn] of [['dep', 'المغادرة', 'departure'], ['arr', 'الوصول', 'arrival']]) {
      const low = rows.filter(r => r.s[dir].rated >= 5 && punct(r.s[dir]) < 0.7).map(r => r.name)
      if (low.length) recs2.push(T(`مراجعة الانضباط في ${label} بـ: ${low.slice(0, 6).join('، ')} (أقل من 70%).`, `Review ${labelEn} punctuality at: ${low.slice(0, 6).join(', ')} (below 70%).`))
    }
    const mr2 = rows.filter(r => r.s.dep.pax + r.s.dep.missed >= 50 && missedRate(r.s.dep) > 0.02).map(r => r.name)
    if (mr2.length) recs2.push(T(`تتبّع أسباب تخلف الركاب عن المغادرة في: ${mr2.slice(0, 6).join('، ')} (النسبة أعلى من 2%).`, `Investigate no-shows at departure in: ${mr2.slice(0, 6).join(', ')} (rate above 2%).`))
    const lowSv = rows.filter(r => r.sv.n >= 3 && r.sv.avg != null && r.sv.avg < 3.5).map(r => `${r.name} (${r.sv.avg.toFixed(1)})`)
    if (lowSv.length) recs2.push(T(`مراجعة ملاحظات العملاء في: ${lowSv.slice(0, 6).join('، ')} — التقييم أقل من 3.5 (التفاصيل في ورقة «رضا العملاء»).`, `Review customer feedback at: ${lowSv.slice(0, 6).join(', ')} — rating below 3.5 (see the “Customer ratings” sheet).`))
    const dec = rows.filter(r => r.prevVis >= 100 && r.change != null && r.change < -0.1).map(r => `${r.name} (${Math.round(r.change * 100)}%)`)
    if (dec.length) recs2.push(T(`فحص أسباب تراجع عدد الزوار في: ${dec.slice(0, 6).join('، ')}.`, `Look into the visitor decline at: ${dec.slice(0, 6).join(', ')}.`))
    const topSt = sk[0]
    if (topSt && statusCnt[topSt] >= 3) recs2.push(T(`وضع خطة تعامل مع «${STATUS_AR[topSt] || topSt}» — الأكثر تكراراً (${statusCnt[topSt]} ${times(statusCnt[topSt])}).`, `Prepare a response plan for “${topSt}” — the most frequent (${statusCnt[topSt]}×).`))
    const missingDays = days.filter(d => !G.daysWithData.has(d)).length
    if (missingDays > 0) recs2.push(T(`${missingDays} يوم من الفترة بلا أي سجل — تحقّق من اكتمال الإدخال.`, `${missingDays} day(s) have no records — verify data entry.`))
    if (!recs2.length) recs2.push(T('الأداء مستقر ولا توجد ملاحظات حرجة — حافظ على الممارسات الحالية.', 'Performance is stable with no critical findings — keep current practices.'))
    return { insights, recs2 }
  }

  // ═════════ بناء الملف ═════════
  onProgress?.(T('إنشاء الملف…', 'Building the file…'))
  const book = await createBook({ isAr })
  const stamp = new Date().toLocaleString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
  const subtitleFor = lbl => `${lbl}   ·   ${T('الفترة', 'Period')}: ${from} → ${to} (${span} ${T('يوماً', 'days')})   ·   ${T('المقارنة بـ', 'Compared with')} ${pFrom} → ${pTo}   ·   ${T('تاريخ الإصدار', 'Generated')}: ${stamp}`
  const subtitleAll = subtitleFor(kind === 'all' ? T('كل المحطات', 'All stations') : mainLabel)
  const puColor = v => (typeof v !== 'number' ? null : v >= 0.85 ? XL.green : v >= 0.7 ? XL.amber : XL.red)
  const compColor = v => (typeof v !== 'number' ? null : v >= 0.98 ? XL.green : v >= 0.9 ? XL.amber : XL.red)
  const svColor = v => (typeof v !== 'number' ? null : v >= 4 ? XL.green : v >= 3 ? XL.amber : XL.red)
  const npsColor = v => (typeof v !== 'number' ? null : v >= 50 ? XL.green : v >= 0 ? XL.amber : XL.red)
  const dTxt = (c, p) => {
    const ch = pctChange(c, p)
    if (ch == null) return T('لا توجد فترة سابقة للمقارنة', 'No previous period')
    if (Math.round(ch * 100) === 0) return T('بلا تغيّر عن الفترة السابقة', 'No change vs previous')
    return `${ch >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(ch * 100))}% ${T('عن الفترة السابقة', 'vs previous')}`
  }
  const DIR = { dep: T('مغادرة', 'Departure'), arr: T('وصول', 'Arrival') }
  const CLS = { early: T('مبكرة', 'Early'), ontime: T('في الموعد', 'On time'), noton: T('غير منتظمة', 'Irregular'), delayed: T('متأخرة', 'Delayed') }
  const NOT_ENTERED = T('غير مُدخلة', 'Not entered')
  const TYPE = a => (a ? T('وكيل', 'Agent') : T('نورث وست', 'North West'))
  const clsColor = v => (v === CLS.delayed ? XL.red : v === CLS.noton || v === NOT_ENTERED ? XL.amber : v === CLS.early || v === CLS.ontime ? XL.green : null)
  const DEP_C = 'FF264673', ARR_C = 'FF0F766E', AG_C = 'FF7C3AED'
  const groupHeader = (sh, groups) => {
    const ws = sh.ws, r = sh.r; ws.getRow(r).height = 22
    for (const [label, c1, c2, argb] of groups) {
      if (c2 > c1) ws.mergeCells(r, c1, r, c2)
      const c = ws.getCell(r, c1); c.value = label; c.font = { bold: true, size: 11, color: { argb: XL.white } }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      for (let i = c1; i <= c2; i++) ws.getCell(r, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
    }
    sh.r++
  }
  const q = n => `#'${String(n).replace(/'/g, "''")}'!A1`
  const linkCell = (ws, r, c, text, sheetName, bold = true) => {
    const cell = ws.getCell(r, c); cell.value = { text, hyperlink: q(sheetName) }
    cell.font = { size: 10, bold, underline: true, color: { argb: 'FF1D4ED8' } }
  }

  // أسماء الأوراق (فريدة) — ورقة لكل محطة
  const SHEET = { SUM: T('الملخص', 'Summary'), ST: T('المحطات', 'Stations'), DAY: T('الاتجاه اليومي', 'Daily trend'), AG: T('الوكلاء', 'Agents'), CX: T('رضا العملاء', 'Customer ratings'), UN: T('غير المُدخلة', 'Not entered'), REC: T('السجلات', 'Records') }
  const used = new Set(Object.values(SHEET))
  const stSheet = {}
  ;[...(G_nwb?.rows ?? []), ...(G_ag?.rows ?? [])].filter(r => r.s.dep.trips + r.s.arr.trips > 0 || r.un > 0).forEach(r => {
    let nm = String(r.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Station'
    while (used.has(nm)) nm = nm.slice(0, 26) + '_' + Math.floor(Math.random() * 90 + 10)
    used.add(nm); stSheet[r.id] = nm
  })

  // جدول المحطات (نورث وست أو الوكلاء) — صفحة المحطات
  const STW = [5, 28, 10, 10, 11, 10, 10, 11, 13, 12, 11, 11, 10]
  function stationsTable(sh, G, color) {
    groupHeader(sh, [['', 1, 2, color], [T('المغادرة', 'Departures'), 3, 5, DEP_C], [T('الوصول', 'Arrivals'), 6, 8, ARR_C], [T('عدد الزوار', 'Visitors'), 9, 9, color], [T('الإدخال', 'Entry'), 10, 10, color], [T('رضا العملاء', 'Customers'), 11, 13, 'FFEE712D']])
    const t = sh.table({
      columns: [{ header: '#', fmt: '0' }, { header: T('المحطة', 'Station'), bold: true, color: () => XL.navy },
        { header: T('الرحلات', 'Trips'), fmt: '#,##0' }, { header: T('الركاب', 'Pax'), fmt: '#,##0' }, { header: T('الانضباط', 'Punctuality'), fmt: '0%', color: puColor },
        { header: T('الرحلات', 'Trips'), fmt: '#,##0' }, { header: T('الركاب', 'Pax'), fmt: '#,##0' }, { header: T('الانضباط', 'Punctuality'), fmt: '0%', color: puColor },
        { header: T('مغادرة + وصول', 'Dep + Arr'), fmt: '#,##0', bold: true }, { header: T('الاكتمال', 'Completeness'), fmt: '0%', color: compColor },
        { header: T('استبيانات', 'Surveys'), fmt: '#,##0' }, { header: T('التقييم /5', 'Rating /5'), fmt: '0.00', color: svColor }, { header: 'NPS', fmt: '0', color: npsColor }],
      rows: G.rows.map((r, i) => [i + 1, r.name, r.s.dep.trips, r.s.dep.pax, punct(r.s.dep) ?? '—', r.s.arr.trips, r.s.arr.pax, punct(r.s.arr) ?? '—', r.visitors, complete(r.exp, r.un) ?? '—', r.sv.n || '—', r.sv.avg ?? '—', r.sv.nps ?? '—']),
      totals: ['', T('الإجمالي', 'Total'), G.tot.dep.trips, G.tot.dep.pax, punct(G.tot.dep) ?? '—', G.tot.arr.trips, G.tot.arr.pax, punct(G.tot.arr) ?? '—', G.visitors, complete(G.expAll, G.unAll) ?? '—', G.sv.n || '—', G.sv.avg ?? '—', G.sv.nps ?? '—'],
    })
    G.rows.forEach((r, i) => { if (stSheet[r.id]) linkCell(sh.ws, t.first + i, 2, r.name, stSheet[r.id]) })
    sh.bars(`I${t.first}:I${t.last}`, 'FFA9C4EB')
    sh.scale(`J${t.first}:J${t.last}`, { min: 0.7, mid: 0.9, max: 1 })
    sh.scale(`L${t.first}:L${t.last}`, { min: 2.5, mid: 3.8, max: 5 })
    return t
  }
  function dailyTable(sh, G, color) {
    groupHeader(sh, [['', 1, 2, color], [T('المغادرة', 'Departures'), 3, 5, DEP_C], [T('الوصول', 'Arrivals'), 6, 8, ARR_C], ['', 9, 10, color]])
    const t = sh.table({
      columns: [{ header: T('التاريخ', 'Date'), bold: true }, { header: T('اليوم', 'Day') },
        { header: T('الرحلات', 'Trips'), fmt: '#,##0' }, { header: T('الركاب', 'Pax'), fmt: '#,##0', bold: true }, { header: T('غير مُدخلة', 'Missing'), fmt: '#,##0', color: v => (v > 0 ? XL.red : null) },
        { header: T('الرحلات', 'Trips'), fmt: '#,##0' }, { header: T('الركاب', 'Pax'), fmt: '#,##0', bold: true }, { header: T('غير مُدخلة', 'Missing'), fmt: '#,##0', color: v => (v > 0 ? XL.red : null) },
        { header: T('عدد الزوار', 'Visitors'), fmt: '#,##0', bold: true }, { header: T('اكتمال الإدخال', 'Completeness'), fmt: '0%', color: compColor }],
      rows: days.map(d => { const x = G.byDay[d], c = complete(x.expDep + x.expArr, x.unDep + x.unArr); return [d, WD[dowOf(d)], x.dep.trips, x.dep.pax, x.unDep, x.arr.trips, x.arr.pax, x.unArr, x.dep.pax + x.arr.pax, c ?? '—'] }),
      freeze: false, printTitle: true,
    })
    const trw = t.last + 1
    ;[['C', G.tot.dep.trips], ['D', G.tot.dep.pax], ['E', G.unDepN], ['F', G.tot.arr.trips], ['G', G.tot.arr.pax], ['H', G.unArrN], ['I', G.visitors]].forEach(([c, val]) => {
      const cell = sh.ws.getCell(`${c}${trw}`)
      cell.value = { formula: `SUM(${c}${t.first}:${c}${t.last})`, result: val }; cell.numFmt = '#,##0'; cell.font = { bold: true, color: { argb: XL.navy } }; cell.alignment = { horizontal: 'center' }
    })
    sh.ws.getCell(`A${trw}`).value = T('الإجمالي', 'Total'); sh.ws.getCell(`A${trw}`).font = { bold: true, color: { argb: XL.navy } }
    sh.r = trw + 2
    const mx = Math.max(...days.map(d => G.byDay[d].dep.pax + G.byDay[d].arr.pax), 1)
    sh.scale(`I${t.first}:I${t.last}`, { min: 0, mid: mx / 2, max: mx, colors: ['FFFFFFFF', 'FFCFE0F7', 'FF4F81D6'] })
    sh.scale(`J${t.first}:J${t.last}`, { min: 0.7, mid: 0.9, max: 1 })
    return t
  }
  const kpiRowsFor = (G, color) => [
    [
      { label: T('عدد زوار المحطات', 'Station visitors'), value: G.visitors, fmt: '#,##0', color, foot: dTxt(G.visitors, G.prevVisitors) },
      { label: T('ركاب المغادرة', 'Departing passengers'), value: G.tot.dep.pax, fmt: '#,##0', color: DEP_C, foot: dTxt(G.tot.dep.pax, G.totPrev.dep.pax) },
      { label: T('ركاب الوصول', 'Arriving passengers'), value: G.tot.arr.pax, fmt: '#,##0', color: ARR_C, foot: dTxt(G.tot.arr.pax, G.totPrev.arr.pax) },
      { label: T('اكتمال الإدخال', 'Entry completeness'), value: complete(G.expAll, G.unAll) ?? '—', fmt: '0%', color: compColor(complete(G.expAll, G.unAll)) ?? XL.grey, foot: `${n0(G.unAll)} ${T('حركة غير مُدخلة', 'not entered')}` },
    ],
    [
      { label: T('رحلات المغادرة', 'Departures'), value: G.tot.dep.trips, fmt: '#,##0', color: DEP_C, foot: dTxt(G.tot.dep.trips, G.totPrev.dep.trips) },
      { label: T('انضباط المغادرة', 'Departure punctuality'), value: punct(G.tot.dep) ?? '—', fmt: '0%', color: puColor(punct(G.tot.dep)) ?? XL.grey, foot: G.tot.dep.rated ? `${n0(G.tot.dep.good)} ${T('من', 'of')} ${n0(G.tot.dep.rated)} ${T('في الموعد أو أبكر', 'on time or earlier')}` : T('لا رحلات مقيَّمة', 'No rated trips') },
      { label: T('رحلات الوصول', 'Arrivals'), value: G.tot.arr.trips, fmt: '#,##0', color: ARR_C, foot: dTxt(G.tot.arr.trips, G.totPrev.arr.trips) },
      { label: T('انضباط الوصول', 'Arrival punctuality'), value: punct(G.tot.arr) ?? '—', fmt: '0%', color: puColor(punct(G.tot.arr)) ?? XL.grey, foot: G.tot.arr.rated ? `${n0(G.tot.arr.good)} ${T('من', 'of')} ${n0(G.tot.arr.rated)} ${T('في الموعد أو أبكر', 'on time or earlier')}` : T('لا رحلات مقيَّمة', 'No rated trips') },
    ],
    [
      { label: T('مغادرة غير مُدخلة', 'Departures missing'), value: G.unDepN, fmt: '#,##0', color: G.unDepN > 0 ? XL.red : XL.green, foot: G.expDepN ? `${pc(complete(G.expDepN, G.unDepN))} ${T('اكتمال', 'complete')}` : '' },
      { label: T('وصول غير مُدخل', 'Arrivals missing'), value: G.unArrN, fmt: '#,##0', color: G.unArrN > 0 ? XL.red : XL.green, foot: G.expArrN ? `${pc(complete(G.expArrN, G.unArrN))} ${T('اكتمال', 'complete')}` : '' },
      { label: T('رضا العملاء (من 5)', 'Customer rating (/5)'), value: G.sv.avg ?? '—', fmt: '0.00', color: svColor(G.sv.avg) ?? XL.grey, foot: G.sv.n ? `${n0(G.sv.n)} ${T('استبياناً', 'surveys')}` : (surveysOk ? T('لا استبيانات في الفترة', 'No surveys in period') : T('غير متاح', 'Unavailable')) },
      { label: T('مؤشر التوصية NPS', 'NPS'), value: G.sv.nps ?? '—', fmt: '0', color: npsColor(G.sv.nps) ?? XL.grey, foot: '' },
    ],
  ]

  // ═════════ الملخص ═════════
  const S = book.sheet(SHEET.SUM, Array(12).fill(13), { tab: XL.orange })
  S.header({ title: T('التقرير التشغيلي — المغادرة والوصول', 'Operations Report — Departures & Arrivals'), subtitle: subtitleFor(mainLabel) })
  S.section(T('محتويات الملف', 'Contents'), undefined, XL.navy)
  const toc = [[SHEET.ST, T('جدول المحطات: المغادرة والوصول وعدد الزوار واكتمال الإدخال ورضا العملاء — اضغط اسم المحطة لفتح صفحتها', 'Stations table — click a station name to open its page')],
    [SHEET.DAY, T('كل يوم: المغادرة والوصول وعدد الزوار والحركات غير المُدخلة', 'Per day: departures, arrivals, visitors, missing entries')],
    ...(side ? [[SHEET.AG, T('محطات الوكلاء منفصلة بالكامل: أرقامها وجدولها وتحليلها', 'Agent stations on their own: figures, table, analysis')]] : []),
    [SHEET.CX, T('تقييمات واستبيانات العملاء لكل محطة وأبرز الملاحظات', 'Customer ratings & surveys per station and key comments')],
    [SHEET.UN, T('كل حركة مجدولة لم تُسجَّل — بفلاتر حسب المحطة والاتجاه', 'Every scheduled movement with no record — filterable')],
    [SHEET.REC, T('كل سجلات الترحيل الخام للتصفية والتحليل', 'All raw trip records for filtering')]]
  const tToc = S.table({ columns: [{ header: T('الورقة', 'Sheet'), span: 3, bold: true }, { header: T('ماذا تجد فيها', 'What it contains'), span: 9 }], rows: toc, zebra: true })
  toc.forEach((t0, i) => linkCell(S.ws, tToc.first + i, 1, t0[0], t0[0]))

  const m = main ?? EMPTY, mk = kpiRowsFor(m, kind === 'agent' ? AG_C : XL.navy)
  S.section(T('الأرقام الرئيسية', 'Key figures'), T('عدد الزوار = ركاب المغادرة + ركاب الوصول', 'Visitors = departing + arriving passengers'), kind === 'agent' ? AG_C : XL.navy)
  S.spacer(0); S.kpis(mk[0], 3)
  S.section(T('الانضباط والرحلات', 'Trips & punctuality'), undefined, DEP_C)
  S.spacer(0); S.kpis(mk[1], 3)
  S.section(T('اكتمال الإدخال ورضا العملاء', 'Entry completeness & customer rating'), undefined, 'FFEE712D')
  S.spacer(0); S.kpis(mk[2], 3)

  const A0 = analysisOf(m)
  if (A0.insights.length) { S.section(T('التحليل', 'Analysis')); S.spacer(0); S.bullets(A0.insights) }
  if (A0.recs2.length) {
    S.section(T('الإجراءات المقترحة', 'Suggested actions'), T('مستخرجة تلقائياً من أرقام الفترة — للاسترشاد وليست بديلاً عن تقدير الإدارة', 'Derived automatically from the period figures — a guide, not a substitute for management judgment'))
    S.bullets(A0.recs2.map((x, i) => `${i + 1}. ${x}`))
  }

  // مقارنة نورث وست والوكلاء (كلٌّ على حدة)
  if (side) {
    S.section(T('نورث وست والوكلاء — كلٌّ على حدة', 'North West and Agents — separately'), T('الوكلاء لهم ورقة مستقلة بتفاصيلهم؛ هنا مقارنة سريعة فقط', 'Agents have their own sheet; this is a quick comparison only'))
    const gRow = (name, G, ag) => [name, G.rows.length, G.active.length, G.tot.dep.pax, G.tot.arr.pax, G.visitors, complete(G.expAll, G.unAll) ?? '—', G.sv.avg ?? '—']
    S.table({
      columns: [{ header: T('الفئة', 'Group'), span: 3, bold: true }, { header: T('المحطات', 'Stations'), fmt: '0' }, { header: T('سجّلت بيانات', 'Reporting'), fmt: '0' }, { header: T('ركاب المغادرة', 'Departing'), fmt: '#,##0' }, { header: T('ركاب الوصول', 'Arriving'), fmt: '#,##0' },
        { header: T('عدد الزوار', 'Visitors'), fmt: '#,##0', bold: true }, { header: T('اكتمال الإدخال', 'Completeness'), span: 2, fmt: '0%', color: compColor }, { header: T('رضا العملاء', 'Rating'), fmt: '0.00', color: svColor }],
      rows: [gRow(T('محطات نورث وست', 'North West stations'), G_nwb), gRow(T('محطات الوكلاء', 'Agent stations'), G_ag)], zebra: false,
    })
  }

  // الرسوم
  const charts = []
  charts.push(lineChart({ title: T('ركاب المغادرة يومياً', 'Departing passengers per day'), labels: days.map(d => d.slice(5)), values: days.map(d => m.byDay[d].dep.pax), color: '#264673', isAr, w: 560 }))
  charts.push(lineChart({ title: T('ركاب الوصول يومياً', 'Arriving passengers per day'), labels: days.map(d => d.slice(5)), values: days.map(d => m.byDay[d].arr.pax), color: '#0F766E', isAr, w: 560 }))
  if (m.active.length) {
    const top = m.active.slice(0, 10)
    charts.push(barChart({ title: T('عدد الزوار حسب المحطة (الأعلى 10)', 'Visitors by station (top 10)'), labels: top.map(r => r.name), values: top.map(r => r.visitors), color: '#264673', isAr, w: 560 }))
  }
  const accKeys = ['early', 'ontime', 'noton', 'delayed'], accColors = ['#0ea5e9', '#15803d', '#f59e0b', '#b91c1c']
  charts.push(donutChart({ title: T('انضباط المغادرة', 'Departure punctuality'), labels: accKeys.map(k => CLS[k]), values: accKeys.map(k => m.tot.dep[k]), colors: accColors, isAr, w: 560 }))
  charts.push(donutChart({ title: T('انضباط الوصول', 'Arrival punctuality'), labels: accKeys.map(k => CLS[k]), values: accKeys.map(k => m.tot.arr[k]), colors: accColors, isAr, w: 560 }))
  if (m.hours.some(v => v > 0)) {
    const hs = m.hours.map((v, i) => [i, v]).filter(([, v]) => v > 0), lo = Math.max(0, hs[0][0] - 1), hi = Math.min(23, hs[hs.length - 1][0] + 1)
    const hrs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    charts.push(barChart({ title: T('عدد رحلات المغادرة حسب الساعة', 'Departures by hour'), labels: hrs.map(h => String(h).padStart(2, '0') + ':00'), values: hrs.map(h => m.hours[h]), color: '#EE712D', isAr, w: 560 }))
  }
  S.section(T('الرسوم البيانية', 'Charts'))
  const rowAnchor = S.r - 1
  charts.forEach((png, i) => {
    const id = book.wb.addImage({ base64: png, extension: 'png' })
    S.ws.addImage(id, { tl: { col: (i % 2 === 0 ? 0 : 6) + 0.1, row: rowAnchor + Math.floor(i / 2) * 15 + 0.3 }, ext: { width: 560, height: 270 } })
  })
  S.r += Math.ceil(charts.length / 2) * 15 + 1

  const sk = Object.keys(m.statusCnt).sort((a, b) => m.statusCnt[b] - m.statusCnt[a])
  S.section(T('الحالات التشغيلية غير الطبيعية', 'Abnormal operational statuses'))
  if (!sk.length) S.note(T('✅ لا توجد حالات تشغيلية غير طبيعية ضمن الفترة', '✅ No abnormal operational statuses in the period'), { bold: true, color: XL.green })
  else {
    const all = sk.reduce((s, k) => s + m.statusCnt[k], 0)
    const tI = S.table({
      columns: [{ header: T('الحالة', 'Status'), span: 4, bold: true }, { header: T('عدد المرات', 'Count'), span: 4, fmt: '#,##0', color: () => XL.red }, { header: T('النسبة', 'Share'), span: 4, fmt: '0%' }],
      rows: sk.map(k => [isAr ? (STATUS_AR[k] || k) : k, m.statusCnt[k], m.statusCnt[k] / all]), zebra: false,
    })
    S.bars(`E${tI.first}:E${tI.last}`, 'FFF4A6A1')
  }
  S.section(T('ملاحظات على الأرقام', 'Notes on the figures'))
  S.bullets(isAr ? [
    'المغادرة: رحلة خرجت من المحطة. الوصول: رحلة وصلت إليها. عدد الزوار = ركاب المغادرة + ركاب الوصول. محطات العبور تُحسب فيها الحركتان كل واحدة بسجلها.',
    'الانضباط = الرحلات المبكرة أو في الموعد (تأخر حتى 5 دقائق) ÷ الرحلات التي لها موعد وتوقيت فعلي. غير منتظمة: تأخر 6–15 دقيقة، متأخرة: أكثر من 15 دقيقة.',
    'الحركة غير المُدخلة: رحلة مفعّلة للمحطة في يوم تعمل فيه ولا يوجد لها سجل. تُستثنى الرحلات الإضافية في غير يومها والرحلات خارج فترة صلاحية الجدول.',
    'رضا العملاء = متوسط تقييمات الاستبيانات (من 5) للمحطة أو للرحلات المنطلقة منها، و NPS = (المروّجون − المعارضون) ÷ المجيبين.',
    `تصنيف المحطة (نورث وست / وكيل) يُقرأ من إعدادات المحطة لحظة إنشاء التقرير، فأي تغيير في نوع محطة ينعكس مباشرة في المجموعة التي تظهر فيها.${agentCol ? '' : ' (تنبيه: عمود تصنيف الوكلاء غير مُفعَّل في القاعدة، فكل المحطات تُعدّ نورث وست.)'}`,
  ] : [
    'Departure: a trip that left the station. Arrival: a trip that reached it. Visitors = departing + arriving passengers. At transit stations both movements are counted, each with its own record.',
    'Punctuality = early or on-time trips (up to 5 min late) ÷ trips with a schedule and an actual time. Irregular: 6–15 min late, Delayed: over 15 min.',
    'A movement not entered: a trip enabled for the station on a day it runs, with no record. Extra trips outside their date and trips outside the schedule validity are excluded.',
    'Customer rating = average survey rating (/5) for the station or trips departing from it; NPS = (promoters − detractors) ÷ respondents.',
    `A station’s type (North West / Agent) is read from the station settings at generation time, so a type change is reflected immediately.${agentCol ? '' : ' (Note: the agent column is not enabled in the database, so all stations are treated as North West.)'}`,
  ])
  S.finish({ landscape: false })

  // ═════════ المحطات ═════════
  if (main) {
    const SS = book.sheet(SHEET.ST, STW, { tab: kind === 'agent' ? AG_C : XL.navy })
    SS.header({ title: T(`${mainLabel} — المغادرة والوصول وعدد الزوار`, `${mainLabel} — Departures, Arrivals & Visitors`), subtitle: subtitleFor(mainLabel) })
    SS.note(T('اضغط اسم أي محطة لفتح صفحتها التفصيلية. عدد الزوار = ركاب المغادرة + ركاب الوصول.', 'Click a station name to open its detail page. Visitors = departing + arriving passengers.'), { color: XL.grey })
    SS.spacer(0)
    stationsTable(SS, main, kind === 'agent' ? AG_C : XL.navy)
    SS.finish({ landscape: true })

    // ═════════ الاتجاه اليومي ═════════
    const D = book.sheet(SHEET.DAY, [13, 12, 11, 11, 12, 11, 11, 12, 13, 12], { tab: kind === 'agent' ? AG_C : XL.navy })
    D.header({ title: T(`الاتجاه اليومي — ${mainLabel}`, `Daily trend — ${mainLabel}`), subtitle: subtitleFor(mainLabel) })
    dailyTable(D, main, kind === 'agent' ? AG_C : XL.navy)
    D.finish({ landscape: false })
  }

  // ═════════ الوكلاء (منفصلون) ═════════
  if (side) {
    const AGS = book.sheet(SHEET.AG, STW, { tab: AG_C })
    AGS.header({ title: T('محطات الوكلاء', 'Agent stations'), subtitle: subtitleFor(T('الوكلاء', 'Agents')) })
    const ak = kpiRowsFor(side, AG_C)
    AGS.section(T('الأرقام الرئيسية', 'Key figures'), T('عدد الزوار = ركاب المغادرة + ركاب الوصول', 'Visitors = departing + arriving passengers'), AG_C)
    AGS.spacer(0); AGS.kpis(ak[0], 3)
    AGS.section(T('الانضباط والرحلات', 'Trips & punctuality'), undefined, DEP_C)
    AGS.spacer(0); AGS.kpis(ak[1], 3)
    AGS.section(T('اكتمال الإدخال ورضا العملاء', 'Entry completeness & customer rating'), undefined, 'FFEE712D')
    AGS.spacer(0); AGS.kpis(ak[2], 3)
    const A1 = analysisOf(side)
    if (A1.insights.length) { AGS.section(T('التحليل', 'Analysis'), undefined, AG_C); AGS.spacer(0); AGS.bullets(A1.insights) }
    if (A1.recs2.length) { AGS.section(T('الإجراءات المقترحة', 'Suggested actions'), undefined, AG_C); AGS.bullets(A1.recs2.map((x, i) => `${i + 1}. ${x}`)) }
    AGS.section(T('جدول محطات الوكلاء', 'Agent stations table'), T('اضغط اسم المحطة لفتح صفحتها', 'Click a station name to open its page'), AG_C)
    AGS.spacer(0)
    stationsTable(AGS, side, AG_C)
    AGS.section(T('الاتجاه اليومي للوكلاء', 'Agents daily trend'), undefined, AG_C)
    AGS.spacer(0)
    dailyTable(AGS, side, AG_C)
    AGS.finish({ landscape: true })
  }

  // ═════════ رضا العملاء ═════════
  {
    const C = book.sheet(SHEET.CX, [5, 28, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11], { tab: 'FF8B5CF6' })
    C.header({ title: T('رضا العملاء — التقييمات والاستبيانات', 'Customer ratings & surveys'), subtitle: subtitleAll })
    const allIds = new Set(stations.map(st => st.id)), svAll = survOf(allIds)
    if (!surveysOk) C.note(T('تعذّر جلب الاستبيانات (قد لا تملك صلاحية الاطلاع عليها).', 'Could not load surveys (you may not have permission).'), { bold: true, color: XL.amber })
    else if (!surveyRows.filter(r => allIds.has(r.sid)).length) C.note(T('لا توجد استبيانات ضمن الفترة والمحطات المحددة.', 'No surveys in the selected period and stations.'), { bold: true, color: XL.grey })
    else {
      C.kpis([
        { label: T('عدد الاستبيانات', 'Surveys'), value: svAll.n, fmt: '#,##0', color: XL.navy, foot: '' },
        { label: T('متوسط التقييم (من 5)', 'Average rating (/5)'), value: svAll.avg ?? '—', fmt: '0.00', color: svColor(svAll.avg) ?? XL.grey, foot: '' },
        { label: T('مؤشر التوصية NPS', 'NPS'), value: svAll.nps ?? '—', fmt: '0', color: npsColor(svAll.nps) ?? XL.grey, foot: '' },
        { label: T('تقييمات منخفضة', 'Low ratings'), value: svAll.low ?? '—', fmt: '0%', color: svAll.low > 0.15 ? XL.red : XL.green, foot: T('فيها تقييم 2 أو أقل', 'with a rating of 2 or less') },
      ], 3)
      // حسب المحطة
      C.section(T('حسب المحطة', 'By station'), T('لكل محطة: استبياناتها (للمحطة أو للرحلات المنطلقة منها)', 'Per station: surveys for the station or trips departing from it'))
      const srows = [...(G_nwb?.rows ?? []), ...(G_ag?.rows ?? [])].filter(r => r.sv.n > 0).sort((a, b) => (b.sv.avg ?? 0) - (a.sv.avg ?? 0))
      const tC = C.table({
        columns: [{ header: '#', fmt: '0' }, { header: T('المحطة', 'Station'), bold: true, color: () => XL.navy }, { header: T('النوع', 'Type') }, { header: T('استبيانات', 'Surveys'), fmt: '#,##0' }, { header: T('التقييم /5', 'Rating /5'), fmt: '0.00', color: svColor }, { header: 'NPS', fmt: '0', color: npsColor }, { header: T('منخفضة', 'Low'), fmt: '0%', color: v => (typeof v === 'number' && v > 0.15 ? XL.red : null) }],
        rows: srows.map((r, i) => [i + 1, r.name, TYPE(r.agent), r.sv.n, r.sv.avg ?? '—', r.sv.nps ?? '—', r.sv.low ?? '—']),
      })
      srows.forEach((r, i) => { if (stSheet[r.id]) linkCell(C.ws, tC.first + i, 2, r.name, stSheet[r.id]) })
      C.scale(`E${tC.first}:E${tC.last}`, { min: 2.5, mid: 3.8, max: 5 })
      // حسب الجانب
      const aspMap = {}
      surveyRows.filter(r => allIds.has(r.sid)).forEach(r => Object.entries(r.ratings).forEach(([k, v]) => { const n = Number(v); if (!Number.isNaN(n)) (aspMap[k] ??= []).push(n) }))
      const aspRows = Object.entries(aspMap).map(([k, v]) => [ASPECT[k] || k, v.length, v.reduce((a, b) => a + b, 0) / v.length, v.filter(x => x >= 4).length / v.length]).sort((a, b) => a[2] - b[2])
      if (aspRows.length) {
        C.section(T('حسب جانب التقييم', 'By aspect'), T('مرتّبة من الأضعف إلى الأقوى', 'Sorted weakest to strongest'))
        const tA = C.table({ columns: [{ header: T('الجانب', 'Aspect'), span: 2, bold: true }, { header: T('ردود', 'Answers'), fmt: '#,##0' }, { header: T('المتوسط /5', 'Average /5'), fmt: '0.00', color: svColor }, { header: T('نسبة الرضا (4–5)', 'Satisfied (4–5)'), span: 2, fmt: '0%' }], rows: aspRows })
        C.scale(`D${tA.first}:D${tA.last}`, { min: 2.5, mid: 3.8, max: 5 })
      }
      // ملاحظات العملاء
      const comments = surveyRows.filter(r => allIds.has(r.sid) && r.comment).slice(0, 60)
      if (comments.length) {
        C.section(T('ملاحظات العملاء', 'Customer comments'), T('أحدث 60 ملاحظة — الأدنى تقييماً يظهر بالأحمر', 'Latest 60 comments — lowest ratings in red'))
        C.table({
          columns: [{ header: T('التاريخ', 'Date'), span: 2 }, { header: T('المحطة', 'Station'), span: 3, bold: true, color: () => XL.navy }, { header: T('التقييم', 'Rating'), fmt: '0.0', color: svColor }, { header: T('الملاحظة', 'Comment'), span: 7, wrap: true }],
          rows: comments.map(r => [String(r.at || '').slice(0, 10), stName[r.sid] ?? '—', r.avg ?? '—', r.comment]), rowHeight: 34,
        })
      }
    }
    C.finish({ landscape: true })
  }

  // ═════════ غير المُدخلة ═════════
  const U = book.sheet(SHEET.UN, [13, 12, 28, 11, 11, 14, 40, 12], { tab: XL.red })
  U.header({ title: T('الحركات غير المُدخلة', 'Movements not entered'), subtitle: subtitleAll })
  const unDepAll = unentered.filter(e => e.dir === 'dep').length, unArrAll = unentered.length - unDepAll
  const expDepAll = expected.filter(e => e.dir === 'dep').length, expArrAll = expected.length - expDepAll
  U.kpis([
    { label: T('مغادرة غير مُدخلة', 'Departures missing'), value: unDepAll, fmt: '#,##0', color: unDepAll > 0 ? XL.red : XL.green, foot: expDepAll ? `${pc(complete(expDepAll, unDepAll))} ${T('اكتمال', 'complete')}` : '' },
    { label: T('وصول غير مُدخل', 'Arrivals missing'), value: unArrAll, fmt: '#,##0', color: unArrAll > 0 ? XL.red : XL.green, foot: expArrAll ? `${pc(complete(expArrAll, unArrAll))} ${T('اكتمال', 'complete')}` : '' },
  ], 3)
  const uSorted = [...unentered].sort((a, b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time) || (stName[a.sid] || '').localeCompare(stName[b.sid] || ''))
  const uShown = uSorted.slice(0, UNENTERED_CAP)
  if (uSorted.length > uShown.length) U.note(T(`عُرض أحدث ${n0(UNENTERED_CAP)} من أصل ${n0(uSorted.length)} حركة — ضيّق الفترة لعرض الباقي.`, `Showing the latest ${n0(UNENTERED_CAP)} of ${n0(uSorted.length)} — narrow the period to see the rest.`), { color: XL.amber, bold: true })
  if (!uShown.length) U.note(T('✅ كل الحركات المجدولة ضمن الفترة لها سجل ترحيل', '✅ Every scheduled movement in the period has a record'), { bold: true, color: XL.green })
  else {
    U.table({
      columns: [{ header: T('التاريخ', 'Date'), bold: true }, { header: T('اليوم', 'Day') }, { header: T('المحطة', 'Station'), bold: true, color: () => XL.navy }, { header: T('النوع', 'Type'), color: v => (v === T('وكيل', 'Agent') ? AG_C : null) },
        { header: T('الحركة', 'Movement'), color: v => (v === DIR.dep ? DEP_C : ARR_C) }, { header: T('رقم الرحلة', 'Trip') }, { header: T('المسار', 'Route') }, { header: T('الموعد المجدول', 'Scheduled'), fmt: '@' }],
      rows: uShown.map(e => [e.date, WD[dowOf(e.date)], stName[e.sid] ?? '—', TYPE(stById[e.sid]?.is_agent), DIR[e.dir], e.trip, `${e.from} ← ${e.to}`, e.time]),
      filter: true, freeze: true, printTitle: true,
    })
  }
  U.finish({ landscape: true })

  // ═════════ السجلات ═════════
  const inPeriod = [...cur].sort((a, b) => b.date.localeCompare(a.date) || (b.sched || '').localeCompare(a.sched || ''))
  const R = book.sheet(SHEET.REC, [12, 26, 10, 11, 14, 10, 11, 11, 10, 14, 9, 11, 22, 22, 32])
  R.header({ title: T('سجلات الترحيل — المغادرة والوصول', 'Trip records — Departures & Arrivals'), subtitle: subtitleAll })
  const recCols = withStation => [
    { header: T('التاريخ', 'Date') }, ...(withStation ? [{ header: T('المحطة', 'Station'), bold: true, color: () => XL.navy }, { header: T('النوع', 'Type'), color: v => (v === T('وكيل', 'Agent') ? AG_C : null) }] : []),
    { header: T('الحركة', 'Movement'), color: v => (v === DIR.dep ? DEP_C : ARR_C) }, { header: T('رقم الرحلة', 'Trip') }, { header: T('الحافلة', 'Bus') },
    { header: T('الموعد', 'Scheduled') }, { header: T('الفعلي', 'Actual') }, { header: T('الفرق (د)', 'Diff (min)'), fmt: '+0;-0;0', color: v => (typeof v === 'number' && v > 15 ? XL.red : typeof v === 'number' && v > 5 ? XL.amber : null) },
    { header: T('التوقيت', 'Timing'), color: clsColor }, { header: T('الركاب', 'Pax'), fmt: '0', bold: true }, { header: T('المتخلفون', 'Missed'), fmt: '0', color: v => (typeof v === 'number' && v > 0 ? XL.red : null) },
    { header: T('الحالة التشغيلية', 'Operational status'), wrap: true }, { header: T('أدخلها', 'Entered by'), wrap: true }, { header: T('ملاحظات', 'Notes'), wrap: true },
  ]
  const recRow = (r, withStation) => [r.date, ...(withStation ? [stName[r.sid] ?? '—', TYPE(stById[r.sid]?.is_agent)] : []), DIR[r.dir], r.trip, r.bus, r.sched, r.act, r.delay ?? '', r.cls ? CLS[r.cls] : '',
    r.pax, r.missed, r.status ? (isAr ? (STATUS_AR[r.status] || r.status) : r.status) : '', r.by, r.notes]
  R.table({ columns: recCols(true), rows: inPeriod.map(r => recRow(r, true)), filter: true, freeze: 2, printTitle: true })
  R.finish({ landscape: true })

  // ═════════ ورقة لكل محطة ═════════
  const recBy = {}; inPeriod.forEach(r => { (recBy[r.sid] ??= []).push(r) })
  const unBy = {}; uSorted.forEach(e => { (unBy[e.sid] ??= []).push(e) })
  for (const r of [...(G_nwb?.rows ?? []), ...(G_ag?.rows ?? [])].filter(x => stSheet[x.id])) {
    const sh = book.sheet(stSheet[r.id], [12, 11, 14, 10, 11, 11, 10, 14, 9, 11, 22, 22, 32], { tab: r.agent ? AG_C : 'FF8B9DB8' })
    sh.header({ title: r.name, subtitle: `${TYPE(r.agent)}   ·   ${subtitleFor('').replace(/^\s*·\s*/, '')}` })
    const back = sh.ws.getCell(4, 1); sh.ws.mergeCells(4, 1, 4, 4)
    back.value = { text: T('← العودة إلى قائمة المحطات', '← Back to the stations list'), hyperlink: q(r.agent && side ? SHEET.AG : SHEET.ST) }
    back.font = { size: 10, bold: true, underline: true, color: { argb: 'FF1D4ED8' } }
    const s = r.s
    sh.kpis([
      { label: T('عدد زوار المحطة', 'Station visitors'), value: r.visitors, fmt: '#,##0', color: XL.navy, foot: dTxt(r.visitors, r.prevVis) },
      { label: T('ركاب المغادرة', 'Departing pax'), value: s.dep.pax, fmt: '#,##0', color: DEP_C, foot: dTxt(s.dep.pax, s.pDep.pax) },
      { label: T('ركاب الوصول', 'Arriving pax'), value: s.arr.pax, fmt: '#,##0', color: ARR_C, foot: dTxt(s.arr.pax, s.pArr.pax) },
      { label: T('اكتمال الإدخال', 'Entry completeness'), value: complete(r.exp, r.un) ?? '—', fmt: '0%', color: compColor(complete(r.exp, r.un)) ?? XL.grey, foot: `${n0(r.un)} ${T('غير مُدخلة', 'missing')}` },
    ], 3)
    sh.kpis([
      { label: T('رحلات المغادرة', 'Departures'), value: s.dep.trips, fmt: '#,##0', color: DEP_C, foot: dTxt(s.dep.trips, s.pDep.trips) },
      { label: T('انضباط المغادرة', 'Departure punctuality'), value: punct(s.dep) ?? '—', fmt: '0%', color: puColor(punct(s.dep)) ?? XL.grey, foot: s.unDep ? `${s.unDep} ${T('غير مُدخلة', 'missing')}` : '' },
      { label: T('رحلات الوصول', 'Arrivals'), value: s.arr.trips, fmt: '#,##0', color: ARR_C, foot: dTxt(s.arr.trips, s.pArr.trips) },
      { label: T('انضباط الوصول', 'Arrival punctuality'), value: punct(s.arr) ?? '—', fmt: '0%', color: puColor(punct(s.arr)) ?? XL.grey, foot: s.unArr ? `${s.unArr} ${T('غير مُدخل', 'missing')}` : '' },
    ], 3)
    sh.kpis([
      { label: T('رضا العملاء (من 5)', 'Customer rating (/5)'), value: r.sv.avg ?? '—', fmt: '0.00', color: svColor(r.sv.avg) ?? XL.grey, foot: r.sv.n ? `${n0(r.sv.n)} ${T('استبياناً', 'surveys')}` : T('لا استبيانات', 'No surveys') },
      { label: 'NPS', value: r.sv.nps ?? '—', fmt: '0', color: npsColor(r.sv.nps) ?? XL.grey, foot: '' },
      { label: T('المتخلفون عن المغادرة', 'Missed at departure'), value: s.dep.missed, fmt: '#,##0', color: s.dep.missed > 0 ? XL.red : XL.green, foot: `${(missedRate(s.dep) * 100).toFixed(1)}%` },
    ], 3)
    const list = [
      ...(recBy[r.id] ?? []).map(x => ({ d: x.date, t: x.sched || '', row: recRow(x, false) })),
      ...(unBy[r.id] ?? []).map(e => ({ d: e.date, t: e.time || '', row: [e.date, DIR[e.dir], e.trip, '', e.time, '', '', NOT_ENTERED, '', '', '', '', `${e.from} ← ${e.to}`] })),
    ].sort((a, b) => b.d.localeCompare(a.d) || b.t.localeCompare(a.t))
    sh.section(T('السجلات والحركات غير المُدخلة', 'Records and missing entries'))
    sh.table({ columns: recCols(false), rows: list.map(x => x.row), filter: true, freeze: false, printTitle: true })
    sh.finish({ landscape: true })
  }

  onProgress?.(T('تجهيز التنزيل…', 'Preparing download…'))
  await book.save(isAr ? `التقرير-التشغيلي_${from}_${to}` : `operations-report_${from}_${to}`)
  const sumG = main ?? EMPTY
  return { records: cur.length, stations: sumG.active.length + (side ? side.active.length : 0), trips: cur.length }
}
