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
  let stRaw = null
  for (const cols of ['id, name_ar, name_en, is_active, merged_into, is_agent, city_group', 'id, name_ar, name_en, is_active, merged_into, is_agent', 'id, name_ar, name_en, is_active, merged_into']) {
    const { data, error } = await supabase.from('stations').select(cols)
    if (!error) { stRaw = data; break }
  }
  if (!stRaw) throw new Error(T('تعذّر جلب المحطات', 'Could not load stations'))
  const agentTag = T('وكيل', 'Agent')
  const nameOf = s => `${(isAr ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar)) || '—'}${s.is_agent ? ` (${agentTag})` : ''}`
  const plainName = s => (isAr ? (s?.name_ar || s?.name_en) : (s?.name_en || s?.name_ar)) || '—'
  const stations = stRaw.filter(s => s.is_active !== false && !s.merged_into)
    .filter(s => kind === 'agent' ? !!s.is_agent : kind === 'nwb' ? !s.is_agent : true)
  const hasAgents = stRaw.some(s => s.is_agent)
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

  // ── التجميع ──────────────────────────────────────────────
  const tot = { dep: newStat(), arr: newStat() }, totPrev = { dep: newStat(), arr: newStat() }
  const byStation = {}, byDay = {}, hours = Array(24).fill(0)
  const ensureSt = sid => (byStation[sid] ??= { dep: newStat(), arr: newStat(), pDep: newStat(), pArr: newStat(), expDep: 0, expArr: 0, unDep: 0, unArr: 0, last: '' })
  days.forEach(d => { byDay[d] = { dep: newStat(), arr: newStat(), expDep: 0, expArr: 0, unDep: 0, unArr: 0 } })
  const statusCnt = {}
  stations.forEach(s => ensureSt(s.id))
  for (const r of cur) {
    addStat(tot[r.dir], r); addStat(byDay[r.date][r.dir], r)
    const s = ensureSt(r.sid); addStat(s[r.dir], r); if (r.date > s.last) s.last = r.date
    if (r.status) statusCnt[r.status] = (statusCnt[r.status] || 0) + 1
    if (r.dir === 'dep' && r.act) { const h = Number(r.act.slice(0, 2)); if (h >= 0 && h < 24) hours[h]++ }
  }
  for (const r of prev) { addStat(totPrev[r.dir], r); addStat(ensureSt(r.sid)[r.dir === 'dep' ? 'pDep' : 'pArr'], r) }
  for (const e of expected) {
    const s = ensureSt(e.sid), d = byDay[e.date], k = e.dir === 'dep' ? 'Dep' : 'Arr'
    s['exp' + k]++; d['exp' + k]++
    if (e.missing) { s['un' + k]++; d['un' + k]++ }
  }
  const expDepN = expected.filter(e => e.dir === 'dep').length, expArrN = expected.filter(e => e.dir === 'arr').length
  const unDepN = unentered.filter(e => e.dir === 'dep').length, unArrN = unentered.filter(e => e.dir === 'arr').length
  const expAll = expDepN + expArrN, unAll = unDepN + unArrN
  const complete = (exp, un) => (exp > 0 ? (exp - un) / exp : null)

  const rows = stations.map(st => {
    const s = byStation[st.id]
    const pax = s.dep.pax + s.arr.pax, prevPax = s.pDep.pax + s.pArr.pax
    return { id: st.id, name: nameOf(st), agent: !!st.is_agent, s, pax, prevPax, change: pctChange(pax, prevPax), un: s.unDep + s.unArr, exp: s.expDep + s.expArr }
  }).sort((a, b) => b.pax - a.pax || a.name.localeCompare(b.name))
  const activeRows = rows.filter(r => r.s.dep.trips + r.s.arr.trips > 0)
  const totalPax = tot.dep.pax + tot.arr.pax, prevTotalPax = totPrev.dep.pax + totPrev.arr.pax
  const daysWithData = new Set(cur.map(r => r.date))

  // ── التحليل النصي ─────────────────────────────────────────
  const insights = []
  if (!cur.length && !expAll) insights.push(T('لا توجد سجلات ترحيل ولا رحلات مجدولة ضمن الفترة المحددة.', 'No trip records or scheduled trips within the selected period.'))
  else {
    insights.push(T(
      `خلال ${span} يوماً سُجّلت ${n0(tot.dep.trips)} رحلة مغادرة بـ ${n0(tot.dep.pax)} راكباً، و${n0(tot.arr.trips)} رحلة وصول بـ ${n0(tot.arr.pax)} راكباً، بإجمالي ${n0(totalPax)} راكب.`,
      `Over ${span} days: ${n0(tot.dep.trips)} departures (${n0(tot.dep.pax)} passengers) and ${n0(tot.arr.trips)} arrivals (${n0(tot.arr.pax)} passengers) — ${n0(totalPax)} passengers in total.`))
    const chD = pctChange(tot.dep.pax, totPrev.dep.pax), chA = pctChange(tot.arr.pax, totPrev.arr.pax)
    if (chD != null || chA != null) {
      const f = (label, ch) => (ch == null ? '' : T(`${label} ${ch >= 0 ? 'أعلى' : 'أقل'} بنسبة ${Math.abs(Math.round(ch * 100))}%`, `${label} ${Math.abs(Math.round(ch * 100))}% ${ch >= 0 ? 'higher' : 'lower'}`))
      insights.push(T(`مقارنة بالفترة السابقة المماثلة: ${[f('ركاب المغادرة', chD), f('ركاب الوصول', chA)].filter(Boolean).join('، ')}.`,
        `Versus the previous equal period: ${[f('departing passengers', chD), f('arriving passengers', chA)].filter(Boolean).join('; ')}.`))
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
    if (activeRows.length && totalPax > 0) insights.push(T(`أكثر المحطات حركة: ${activeRows[0].name} بـ ${n0(activeRows[0].pax)} راكب (${Math.round((activeRows[0].pax / totalPax) * 100)}% من الإجمالي).`,
      `Busiest station: ${activeRows[0].name} with ${n0(activeRows[0].pax)} passengers (${Math.round((activeRows[0].pax / totalPax) * 100)}% of total).`))
    const dow = Array.from({ length: 7 }, () => ({ pax: 0, days: new Set() }))
    cur.forEach(r => { const w = dowOf(r.date); dow[w].pax += r.pax; dow[w].days.add(r.date) })
    const dw = dow.map((d, i) => ({ i, avg: d.days.size ? d.pax / d.days.size : 0 })).filter(d => d.avg > 0).sort((a, b) => b.avg - a.avg)
    if (dw.length >= 3) insights.push(T(`أعلى أيام الأسبوع حركة: ${WD_AR[dw[0].i]} بمتوسط ${n0(dw[0].avg)} راكب يومياً، وأهدؤها ${WD_AR[dw[dw.length - 1].i]} (${n0(dw[dw.length - 1].avg)}).`,
      `Busiest weekday: ${WD_EN[dw[0].i]} (avg ${n0(dw[0].avg)} per day); quietest: ${WD_EN[dw[dw.length - 1].i]} (${n0(dw[dw.length - 1].avg)}).`))
    const hs = hours.map((v, h) => [h, v]).sort((a, b) => b[1] - a[1])
    if (hs[0][1] > 0) insights.push(T(`ذروة المغادرة عند الساعة ${String(hs[0][0]).padStart(2, '0')}:00 بـ ${n0(hs[0][1])} رحلة.`, `Departure peak at ${String(hs[0][0]).padStart(2, '0')}:00 with ${n0(hs[0][1])} trips.`))
    const mr = rows.filter(r => r.s.dep.pax + r.s.dep.missed >= 50).sort((a, b) => missedRate(b.s.dep) - missedRate(a.s.dep))
    if (tot.dep.missed > 0 && mr.length) insights.push(T(`المتخلفون عن المغادرة: ${n0(tot.dep.missed)} راكباً (${(missedRate(tot.dep) * 100).toFixed(1)}%)، وأعلى نسبة في ${mr[0].name} (${(missedRate(mr[0].s.dep) * 100).toFixed(1)}%).`,
      `Passengers who missed departures: ${n0(tot.dep.missed)} (${(missedRate(tot.dep) * 100).toFixed(1)}%); highest rate at ${mr[0].name} (${(missedRate(mr[0].s.dep) * 100).toFixed(1)}%).`))
    const sk = Object.keys(statusCnt).sort((a, b) => statusCnt[b] - statusCnt[a])
    if (sk.length) insights.push(T(`أكثر حالة تشغيلية غير طبيعية: ${STATUS_AR[sk[0]] || sk[0]} (${statusCnt[sk[0]]} ${times(statusCnt[sk[0]])})، وإجمالي الحالات ${sk.reduce((s, k) => s + statusCnt[k], 0)}.`,
      `Most common abnormal status: ${sk[0]} (${statusCnt[sk[0]]}×); ${sk.reduce((s, k) => s + statusCnt[k], 0)} cases in total.`))
  }

  const recs2 = []
  if (cur.length || expAll) {
    const noEntry = rows.filter(r => r.un > 0).sort((a, b) => b.un - a.un).slice(0, 6)
    if (noEntry.length) recs2.push(T(`استكمال إدخال الحركات الناقصة في: ${noEntry.map(r => r.name).join('، ')} (التفاصيل في ورقة «غير المُدخلة»).`, `Complete the missing entries at: ${noEntry.map(r => r.name).join(', ')} (see the “Not entered” sheet).`))
    for (const [dir, label, labelEn] of [['dep', 'المغادرة', 'departure'], ['arr', 'الوصول', 'arrival']]) {
      const low = rows.filter(r => r.s[dir].rated >= 5 && punct(r.s[dir]) < 0.7).map(r => r.name)
      if (low.length) recs2.push(T(`مراجعة الانضباط في ${label} بـ: ${low.slice(0, 6).join('، ')} (أقل من 70%).`, `Review ${labelEn} punctuality at: ${low.slice(0, 6).join(', ')} (below 70%).`))
    }
    const mr2 = rows.filter(r => r.s.dep.pax + r.s.dep.missed >= 50 && missedRate(r.s.dep) > 0.02).map(r => r.name)
    if (mr2.length) recs2.push(T(`تتبّع أسباب تخلف الركاب عن المغادرة في: ${mr2.slice(0, 6).join('، ')} (النسبة أعلى من 2%).`, `Investigate no-shows at departure in: ${mr2.slice(0, 6).join(', ')} (rate above 2%).`))
    const dec = rows.filter(r => r.prevPax >= 100 && r.change != null && r.change < -0.1).map(r => `${r.name} (${Math.round(r.change * 100)}%)`)
    if (dec.length) recs2.push(T(`فحص أسباب تراجع الركاب في: ${dec.slice(0, 6).join('، ')}.`, `Look into the passenger decline at: ${dec.slice(0, 6).join(', ')}.`))
    const topSt = Object.keys(statusCnt).sort((a, b) => statusCnt[b] - statusCnt[a])[0]
    if (topSt && statusCnt[topSt] >= 3) recs2.push(T(`وضع خطة تعامل مع «${STATUS_AR[topSt] || topSt}» — الأكثر تكراراً (${statusCnt[topSt]} ${times(statusCnt[topSt])}).`, `Prepare a response plan for “${topSt}” — the most frequent (${statusCnt[topSt]}×).`))
    const missingDays = days.filter(d => !daysWithData.has(d)).length
    if (missingDays > 0) recs2.push(T(`${missingDays} يوم من الفترة بلا أي سجل — تحقّق من اكتمال الإدخال.`, `${missingDays} day(s) have no records — verify data entry.`))
    if (!recs2.length) recs2.push(T('الأداء مستقر ولا توجد ملاحظات حرجة — حافظ على الممارسات الحالية.', 'Performance is stable with no critical findings — keep current practices.'))
  }

  // ── بناء الملف ────────────────────────────────────────────
  onProgress?.(T('إنشاء الملف…', 'Building the file…'))
  const book = await createBook({ isAr })
  const stamp = new Date().toLocaleString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
  const subtitle = `${T('الفترة', 'Period')}: ${from} → ${to} (${span} ${T('يوماً', 'days')})   ·   ${T('المقارنة بـ', 'Compared with')} ${pFrom} → ${pTo}   ·   ${T('تاريخ الإصدار', 'Generated')}: ${stamp}`
  const puColor = v => (typeof v !== 'number' ? null : v >= 0.85 ? XL.green : v >= 0.7 ? XL.amber : XL.red)
  const compColor = v => (typeof v !== 'number' ? null : v >= 0.98 ? XL.green : v >= 0.9 ? XL.amber : XL.red)
  const dTxt = (c, p) => {
    const ch = pctChange(c, p)
    if (ch == null) return T('لا توجد فترة سابقة للمقارنة', 'No previous period')
    if (Math.round(ch * 100) === 0) return T('بلا تغيّر عن الفترة السابقة', 'No change vs previous')
    return `${ch >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(ch * 100))}% ${T('عن الفترة السابقة', 'vs previous')}`
  }
  const DIR = { dep: T('مغادرة', 'Departure'), arr: T('وصول', 'Arrival') }
  const CLS = { early: T('مبكرة', 'Early'), ontime: T('في الموعد', 'On time'), noton: T('غير منتظمة', 'Irregular'), delayed: T('متأخرة', 'Delayed') }
  const NOT_ENTERED = T('غير مُدخلة', 'Not entered')
  const clsColor = v => (v === CLS.delayed ? XL.red : v === CLS.noton || v === NOT_ENTERED ? XL.amber : v === CLS.early || v === CLS.ontime ? XL.green : null)
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
  const DEP_C = 'FF264673', ARR_C = 'FF0F766E'

  // ═════════ لوحة القيادة ═════════
  const S = book.sheet(T('لوحة القيادة', 'Dashboard'), Array(12).fill(13), { tab: XL.orange })
  S.header({ title: T('التقرير التشغيلي — المغادرة والوصول', 'Operations Report — Departures & Arrivals'), subtitle })

  S.section(T('نظرة عامة', 'Overview'))
  S.spacer(0)
  S.kpis([
    { label: T('إجمالي الركاب (مغادرة + وصول)', 'Total passengers (dep + arr)'), value: totalPax, fmt: '#,##0', foot: dTxt(totalPax, prevTotalPax) },
    { label: T('الحركات المُدخلة', 'Movements entered'), value: tot.dep.trips + tot.arr.trips, fmt: '#,##0', foot: `${n0(tot.dep.trips)} ${T('مغادرة', 'dep')} · ${n0(tot.arr.trips)} ${T('وصول', 'arr')}` },
    { label: T('حركات غير مُدخلة', 'Movements not entered'), value: unAll, fmt: '#,##0', color: unAll > 0 ? XL.red : XL.green, foot: `${n0(unDepN)} ${T('مغادرة', 'dep')} · ${n0(unArrN)} ${T('وصول', 'arr')}` },
    { label: T('اكتمال الإدخال', 'Entry completeness'), value: complete(expAll, unAll) ?? '—', fmt: '0%', color: compColor(complete(expAll, unAll)) ?? XL.grey, foot: `${n0(expAll - unAll)} ${T('من', 'of')} ${n0(expAll)} ${T('حركة مجدولة', 'scheduled')}` },
  ], 3)

  for (const [dir, ar, en, col] of [['dep', 'المغادرة', 'Departures', DEP_C], ['arr', 'الوصول', 'Arrivals', ARR_C]]) {
    const st = tot[dir], pv = totPrev[dir], pu = punct(st), un = dir === 'dep' ? unDepN : unArrN, ex = dir === 'dep' ? expDepN : expArrN
    S.section(T(ar, en), T(dir === 'dep' ? 'رحلات خرجت من محطاتك: عددها وركابها وانضباطها مقارنة بموعدها' : 'رحلات وصلت إلى محطاتك: عددها وركابها وانضباطها مقارنة بموعدها',
      dir === 'dep' ? 'Trips leaving your stations: count, passengers and punctuality vs schedule' : 'Trips arriving at your stations: count, passengers and punctuality vs schedule'))
    S.spacer(0)
    S.kpis([
      { label: T(`رحلات ${ar}`, `${en}`), value: st.trips, fmt: '#,##0', color: col, foot: dTxt(st.trips, pv.trips) },
      { label: T(`ركاب ${ar}`, `${en} passengers`), value: st.pax, fmt: '#,##0', color: col, foot: dTxt(st.pax, pv.pax) },
      { label: T('الانضباط', 'Punctuality'), value: pu ?? '—', fmt: '0%', color: puColor(pu) ?? XL.grey, foot: pu == null ? T('لا توجد رحلات مقيَّمة', 'No rated trips') : `${n0(st.good)} ${T('من', 'of')} ${n0(st.rated)} ${T('في الموعد أو أبكر', 'on time or earlier')}` },
      { label: T('غير مُدخلة', 'Not entered'), value: un, fmt: '#,##0', color: un > 0 ? XL.red : XL.green, foot: ex ? `${pc(complete(ex, un))} ${T('اكتمال', 'complete')}` : T('لا حركات مجدولة', 'None scheduled') },
    ], 3)
  }

  if (insights.length) { S.section(T('التحليل', 'Analysis')); S.spacer(0); S.bullets(insights) }
  if (recs2.length) {
    S.section(T('الإجراءات المقترحة', 'Suggested actions'), T('مستخرجة تلقائياً من أرقام الفترة — للاسترشاد وليست بديلاً عن تقدير الإدارة', 'Derived automatically from the period figures — a guide, not a substitute for management judgment'))
    S.bullets(recs2.map((x, i) => `${i + 1}. ${x}`))
  }

  // اكتمال الإدخال حسب المحطة
  const stRowsExp = rows.filter(r => r.exp > 0)
  if (stRowsExp.length) {
    S.section(T('اكتمال الإدخال حسب المحطة', 'Entry completeness by station'), T('المتوقع = رحلات مفعّلة للمحطة ضمن الفترة · غير المُدخل = متوقع بلا سجل ترحيل', 'Expected = trips enabled for the station within the period · Not entered = expected with no trip record'))
    groupHeader(S, [['', 1, 3, XL.navy], [T('المغادرة', 'Departures'), 4, 6, DEP_C], [T('الوصول', 'Arrivals'), 7, 9, ARR_C], ['', 10, 12, XL.navy]])
    const tC = S.table({
      columns: [{ header: T('المحطة', 'Station'), span: 3, bold: true, color: () => XL.navy },
        { header: T('متوقعة', 'Expected'), fmt: '#,##0' }, { header: T('مُدخلة', 'Entered'), fmt: '#,##0' }, { header: T('غير مُدخلة', 'Missing'), fmt: '#,##0', color: v => (v > 0 ? XL.red : null) },
        { header: T('متوقعة', 'Expected'), fmt: '#,##0' }, { header: T('مُدخلة', 'Entered'), fmt: '#,##0' }, { header: T('غير مُدخلة', 'Missing'), fmt: '#,##0', color: v => (v > 0 ? XL.red : null) },
        { header: T('الاكتمال', 'Completeness'), fmt: '0%', color: compColor }, { header: T('الحالة', 'Status'), span: 2, color: v => (v === T('مكتمل', 'Complete') ? XL.green : v === T('يحتاج متابعة', 'Follow up') ? XL.amber : XL.red) }],
      rows: stRowsExp.sort((a, b) => b.un - a.un || a.name.localeCompare(b.name)).map(r => {
        const c = complete(r.exp, r.un)
        return [r.name, r.s.expDep, r.s.expDep - r.s.unDep, r.s.unDep, r.s.expArr, r.s.expArr - r.s.unArr, r.s.unArr, c, c === 1 ? T('مكتمل', 'Complete') : c >= 0.9 ? T('يحتاج متابعة', 'Follow up') : T('إدخال ناقص', 'Incomplete')]
      }),
      totals: [T('الإجمالي', 'Total'), expDepN, expDepN - unDepN, unDepN, expArrN, expArrN - unArrN, unArrN, complete(expAll, unAll) ?? '—', ''],
    })
    S.scale(`J${tC.first}:J${tC.last}`, { min: 0.7, mid: 0.9, max: 1 })
  }

  // أداء المحطات
  if (activeRows.length) {
    S.section(T('أداء المحطات', 'Station performance'), T('مرتّبة حسب إجمالي الركاب — الانضباط = الرحلات المبكرة أو في الموعد (حتى 5 دقائق) ÷ المقيَّمة', 'Sorted by total passengers — punctuality = early or on-time (up to 5 min) ÷ rated trips'))
    groupHeader(S, [['', 1, 4, XL.navy], [T('المغادرة', 'Departures'), 5, 7, DEP_C], [T('الوصول', 'Arrivals'), 8, 10, ARR_C], ['', 11, 12, XL.navy]])
    const tS = S.table({
      columns: [{ header: '#', fmt: '0' }, { header: T('المحطة', 'Station'), span: 3, bold: true, color: () => XL.navy },
        { header: T('الرحلات', 'Trips'), fmt: '#,##0' }, { header: T('الركاب', 'Passengers'), fmt: '#,##0' }, { header: T('الانضباط', 'Punctuality'), fmt: '0%', color: puColor },
        { header: T('الرحلات', 'Trips'), fmt: '#,##0' }, { header: T('الركاب', 'Passengers'), fmt: '#,##0' }, { header: T('الانضباط', 'Punctuality'), fmt: '0%', color: puColor },
        { header: T('إجمالي الركاب', 'Total passengers'), fmt: '#,##0', bold: true }, { header: T('تغيّر الركاب', 'Change'), fmt: '+0%;-0%;0%', color: v => (typeof v !== 'number' ? null : v > 0 ? XL.green : v < 0 ? XL.red : null) }],
      rows: activeRows.map((r, i) => [i + 1, r.name, r.s.dep.trips, r.s.dep.pax, punct(r.s.dep) ?? '—', r.s.arr.trips, r.s.arr.pax, punct(r.s.arr) ?? '—', r.pax, r.change == null ? '—' : r.change]),
      totals: ['', T('الإجمالي', 'Total'), tot.dep.trips, tot.dep.pax, punct(tot.dep) ?? '—', tot.arr.trips, tot.arr.pax, punct(tot.arr) ?? '—', totalPax, pctChange(totalPax, prevTotalPax) ?? '—'],
    })
    S.bars(`K${tS.first}:K${tS.last}`, 'FFA9C4EB')
    S.scale(`G${tS.first}:G${tS.last}`, { min: 0.5, mid: 0.8, max: 1 })
    S.scale(`J${tS.first}:J${tS.last}`, { min: 0.5, mid: 0.8, max: 1 })
  }

  // نورث وست مقابل الوكلاء
  if (hasAgents && kind === 'all') {
    const grp = a => {
      const rs = rows.filter(r => r.agent === a), g = { dep: 0, arr: 0, exp: 0, un: 0, active: 0 }
      rs.forEach(r => { g.dep += r.s.dep.pax; g.arr += r.s.arr.pax; g.exp += r.exp; g.un += r.un; if (r.s.dep.trips + r.s.arr.trips > 0) g.active++ })
      return { rs, g }
    }
    const nw = grp(false), ag = grp(true)
    S.section(T('نورث وست مقابل الوكلاء', 'North West vs Agents'))
    const gRow = (name, o) => [name, o.rs.length, o.g.active, o.g.dep, o.g.arr, o.g.dep + o.g.arr, totalPax ? (o.g.dep + o.g.arr) / totalPax : 0, complete(o.g.exp, o.g.un) ?? '—']
    S.table({
      columns: [{ header: T('الفئة', 'Group'), span: 3, bold: true }, { header: T('المحطات', 'Stations'), fmt: '0' }, { header: T('سجّلت بيانات', 'Reporting'), fmt: '0' }, { header: T('ركاب المغادرة', 'Departing pax'), fmt: '#,##0' }, { header: T('ركاب الوصول', 'Arriving pax'), fmt: '#,##0' },
        { header: T('الإجمالي', 'Total'), fmt: '#,##0', bold: true }, { header: T('حصة الركاب', 'Share'), span: 2, fmt: '0%' }, { header: T('اكتمال الإدخال', 'Completeness'), span: 2, fmt: '0%', color: compColor }],
      rows: [gRow(T('محطات نورث وست', 'North West stations'), nw), gRow(T('محطات الوكلاء', 'Agent stations'), ag)], zebra: false,
    })
  }

  // الرسوم
  const charts = []
  charts.push(lineChart({ title: T('ركاب المغادرة يومياً', 'Departing passengers per day'), labels: days.map(d => d.slice(5)), values: days.map(d => byDay[d].dep.pax), color: '#264673', isAr, w: 560 }))
  charts.push(lineChart({ title: T('ركاب الوصول يومياً', 'Arriving passengers per day'), labels: days.map(d => d.slice(5)), values: days.map(d => byDay[d].arr.pax), color: '#0F766E', isAr, w: 560 }))
  if (activeRows.length) {
    const top = activeRows.slice(0, 10)
    charts.push(barChart({ title: T('إجمالي الركاب حسب المحطة (الأعلى 10)', 'Total passengers by station (top 10)'), labels: top.map(r => r.name), values: top.map(r => r.pax), color: '#264673', isAr, w: 560 }))
  }
  const accKeys = ['early', 'ontime', 'noton', 'delayed'], accColors = ['#0ea5e9', '#15803d', '#f59e0b', '#b91c1c']
  charts.push(donutChart({ title: T('انضباط المغادرة', 'Departure punctuality'), labels: accKeys.map(k => CLS[k]), values: accKeys.map(k => tot.dep[k]), colors: accColors, isAr, w: 560 }))
  charts.push(donutChart({ title: T('انضباط الوصول', 'Arrival punctuality'), labels: accKeys.map(k => CLS[k]), values: accKeys.map(k => tot.arr[k]), colors: accColors, isAr, w: 560 }))
  if (hours.some(v => v > 0)) {
    const hs = hours.map((v, i) => [i, v]).filter(([, v]) => v > 0), lo = Math.max(0, hs[0][0] - 1), hi = Math.min(23, hs[hs.length - 1][0] + 1)
    const hrs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    charts.push(barChart({ title: T('عدد رحلات المغادرة حسب الساعة', 'Departures by hour'), labels: hrs.map(h => String(h).padStart(2, '0') + ':00'), values: hrs.map(h => hours[h]), color: '#EE712D', isAr, w: 560 }))
  }
  S.section(T('الرسوم البيانية', 'Charts'))
  const rowAnchor = S.r - 1
  charts.forEach((png, i) => {
    const id = book.wb.addImage({ base64: png, extension: 'png' })
    S.ws.addImage(id, { tl: { col: (i % 2 === 0 ? 0 : 6) + 0.1, row: rowAnchor + Math.floor(i / 2) * 15 + 0.3 }, ext: { width: 560, height: 270 } })
  })
  S.r += Math.ceil(charts.length / 2) * 15 + 1

  // الحالات التشغيلية غير الطبيعية
  const sk = Object.keys(statusCnt).sort((a, b) => statusCnt[b] - statusCnt[a])
  S.section(T('الحالات التشغيلية غير الطبيعية', 'Abnormal operational statuses'))
  if (!sk.length) S.note(T('✅ لا توجد حالات تشغيلية غير طبيعية ضمن الفترة', '✅ No abnormal operational statuses in the period'), { bold: true, color: XL.green })
  else {
    const all = sk.reduce((s, k) => s + statusCnt[k], 0)
    const tI = S.table({
      columns: [{ header: T('الحالة', 'Status'), span: 4, bold: true }, { header: T('عدد المرات', 'Count'), span: 4, fmt: '#,##0', color: () => XL.red }, { header: T('النسبة', 'Share'), span: 4, fmt: '0%' }],
      rows: sk.map(k => [isAr ? (STATUS_AR[k] || k) : k, statusCnt[k], statusCnt[k] / all]), zebra: false,
    })
    S.bars(`E${tI.first}:E${tI.last}`, 'FFF4A6A1')
  }

  S.section(T('ملاحظات على الأرقام', 'Notes on the figures'))
  S.bullets(isAr ? [
    `المغادرة: رحلة خرجت من المحطة. الوصول: رحلة وصلت إليها. محطات العبور تُحسب فيها الحركتان كل واحدة بسجلها.`,
    'الانضباط = الرحلات المبكرة أو في الموعد (تأخر حتى 5 دقائق) ÷ الرحلات التي لها موعد وتوقيت فعلي. غير منتظمة: تأخر 6–15 دقيقة، متأخرة: أكثر من 15 دقيقة.',
    'الحركة غير المُدخلة: رحلة مفعّلة للمحطة في يوم تعمل فيه ولا يوجد لها سجل. تُستثنى الرحلات الإضافية في غير يومها والرحلات خارج فترة صلاحية الجدول.',
    'المقارنة بفترة سابقة مماثلة في الطول تنتهي قبل بداية الفترة المحددة مباشرة. ورقة «السجلات» بكل البيانات الخام، و«غير المُدخلة» بقائمة الحركات الناقصة، وورقة لكل محطة.',
  ] : [
    'Departure: a trip that left the station. Arrival: a trip that reached it. At transit stations both movements are counted, each with its own record.',
    'Punctuality = early or on-time trips (up to 5 min late) ÷ trips with a schedule and an actual time. Irregular: 6–15 min late, Delayed: over 15 min.',
    'A movement not entered: a trip enabled for the station on a day it runs, with no record. Extra trips outside their date and trips outside the schedule validity are excluded.',
    'Comparison uses an equal-length period ending right before the selected one. “Records” holds all raw data, “Not entered” lists the missing movements, plus a sheet per station.',
  ])
  S.finish({ landscape: false })

  // ═════════ الاتجاه اليومي ═════════
  const D = book.sheet(T('الاتجاه اليومي', 'Daily trend'), [13, 12, 11, 11, 12, 11, 11, 12, 13, 12])
  D.header({ title: T('الاتجاه اليومي — المغادرة والوصول', 'Daily trend — Departures & Arrivals'), subtitle })
  groupHeader(D, [['', 1, 2, XL.navy], [T('المغادرة', 'Departures'), 3, 5, DEP_C], [T('الوصول', 'Arrivals'), 6, 8, ARR_C], ['', 9, 10, XL.navy]])
  const dRows = days.map(d => {
    const x = byDay[d], c = complete(x.expDep + x.expArr, x.unDep + x.unArr)
    return [d, WD[dowOf(d)], x.dep.trips, x.dep.pax, x.unDep, x.arr.trips, x.arr.pax, x.unArr, x.dep.pax + x.arr.pax, c ?? '—']
  })
  const tD = D.table({
    columns: [{ header: T('التاريخ', 'Date'), bold: true }, { header: T('اليوم', 'Day') },
      { header: T('الرحلات', 'Trips'), fmt: '#,##0' }, { header: T('الركاب', 'Passengers'), fmt: '#,##0', bold: true }, { header: T('غير مُدخلة', 'Missing'), fmt: '#,##0', color: v => (v > 0 ? XL.red : null) },
      { header: T('الرحلات', 'Trips'), fmt: '#,##0' }, { header: T('الركاب', 'Passengers'), fmt: '#,##0', bold: true }, { header: T('غير مُدخلة', 'Missing'), fmt: '#,##0', color: v => (v > 0 ? XL.red : null) },
      { header: T('إجمالي الركاب', 'Total passengers'), fmt: '#,##0', bold: true }, { header: T('اكتمال الإدخال', 'Completeness'), fmt: '0%', color: compColor }],
    rows: dRows, freeze: true, printTitle: true,
  })
  const trw = tD.last + 1
  ;[['C', 'trips', tot.dep.trips], ['D', 'pax', tot.dep.pax], ['E', 'un', unDepN], ['F', 'trips', tot.arr.trips], ['G', 'pax', tot.arr.pax], ['H', 'un', unArrN], ['I', 'pax', totalPax]].forEach(([c, , val]) => {
    const cell = D.ws.getCell(`${c}${trw}`)
    cell.value = { formula: `SUM(${c}${tD.first}:${c}${tD.last})`, result: val }; cell.numFmt = '#,##0'; cell.font = { bold: true, color: { argb: XL.navy } }; cell.alignment = { horizontal: 'center' }
  })
  D.ws.getCell(`A${trw}`).value = T('الإجمالي', 'Total'); D.ws.getCell(`A${trw}`).font = { bold: true, color: { argb: XL.navy } }
  const maxDay = Math.max(...days.map(d => byDay[d].dep.pax + byDay[d].arr.pax), 1)
  D.scale(`I${tD.first}:I${tD.last}`, { min: 0, mid: maxDay / 2, max: maxDay, colors: ['FFFFFFFF', 'FFCFE0F7', 'FF4F81D6'] })
  D.scale(`J${tD.first}:J${tD.last}`, { min: 0.7, mid: 0.9, max: 1 })
  D.finish({ landscape: false })

  // ═════════ غير المُدخلة ═════════
  const U = book.sheet(T('غير المُدخلة', 'Not entered'), [13, 12, 28, 11, 14, 40, 12], { tab: XL.red })
  U.header({ title: T('الحركات غير المُدخلة', 'Movements not entered'), subtitle })
  U.kpis([
    { label: T('مغادرة غير مُدخلة', 'Departures missing'), value: unDepN, fmt: '#,##0', color: unDepN > 0 ? XL.red : XL.green, foot: expDepN ? `${pc(complete(expDepN, unDepN))} ${T('اكتمال', 'complete')}` : '' },
    { label: T('وصول غير مُدخل', 'Arrivals missing'), value: unArrN, fmt: '#,##0', color: unArrN > 0 ? XL.red : XL.green, foot: expArrN ? `${pc(complete(expArrN, unArrN))} ${T('اكتمال', 'complete')}` : '' },
  ], 3)
  const uSorted = [...unentered].sort((a, b) => (b.date.localeCompare(a.date)) || a.time.localeCompare(b.time) || (stName[a.sid] || '').localeCompare(stName[b.sid] || ''))
  const uShown = uSorted.slice(0, UNENTERED_CAP)
  if (uSorted.length > uShown.length) U.note(T(`عُرض أحدث ${n0(UNENTERED_CAP)} من أصل ${n0(uSorted.length)} حركة — ضيّق الفترة لعرض الباقي.`, `Showing the latest ${n0(UNENTERED_CAP)} of ${n0(uSorted.length)} — narrow the period to see the rest.`), { color: XL.amber, bold: true })
  if (!uShown.length) U.note(T('✅ كل الحركات المجدولة ضمن الفترة لها سجل ترحيل', '✅ Every scheduled movement in the period has a record'), { bold: true, color: XL.green })
  else {
    U.table({
      columns: [{ header: T('التاريخ', 'Date'), bold: true }, { header: T('اليوم', 'Day') }, { header: T('المحطة', 'Station'), bold: true, color: () => XL.navy },
        { header: T('الحركة', 'Movement'), color: v => (v === DIR.dep ? DEP_C : ARR_C) }, { header: T('رقم الرحلة', 'Trip') }, { header: T('المسار', 'Route') }, { header: T('الموعد المجدول', 'Scheduled'), fmt: '@' }],
      rows: uShown.map(e => [e.date, WD[dowOf(e.date)], stName[e.sid] ?? '—', DIR[e.dir], e.trip, `${e.from} ← ${e.to}`, e.time]),
      filter: true, freeze: true, printTitle: true,
    })
  }
  U.finish({ landscape: true })

  // ═════════ السجلات ═════════
  const inPeriod = [...cur].sort((a, b) => b.date.localeCompare(a.date) || (b.sched || '').localeCompare(a.sched || ''))
  const R = book.sheet(T('السجلات', 'Records'), [12, 26, 11, 14, 10, 11, 11, 10, 14, 9, 11, 22, 22, 32])
  R.header({ title: T('سجلات الترحيل — المغادرة والوصول', 'Trip records — Departures & Arrivals'), subtitle })
  const recCols = withStation => [
    { header: T('التاريخ', 'Date') }, ...(withStation ? [{ header: T('المحطة', 'Station'), bold: true, color: () => XL.navy }] : []),
    { header: T('الحركة', 'Movement'), color: v => (v === DIR.dep ? DEP_C : ARR_C) }, { header: T('رقم الرحلة', 'Trip') }, { header: T('الحافلة', 'Bus') },
    { header: T('الموعد', 'Scheduled') }, { header: T('الفعلي', 'Actual') }, { header: T('الفرق (د)', 'Diff (min)'), fmt: '+0;-0;0', color: v => (typeof v === 'number' && v > 15 ? XL.red : typeof v === 'number' && v > 5 ? XL.amber : null) },
    { header: T('التوقيت', 'Timing'), color: clsColor }, { header: T('الركاب', 'Pax'), fmt: '0', bold: true }, { header: T('المتخلفون', 'Missed'), fmt: '0', color: v => (typeof v === 'number' && v > 0 ? XL.red : null) },
    { header: T('الحالة التشغيلية', 'Operational status'), wrap: true }, { header: T('أدخلها', 'Entered by'), wrap: true }, { header: T('ملاحظات', 'Notes'), wrap: true },
  ]
  const recRow = (r, withStation) => [r.date, ...(withStation ? [stName[r.sid] ?? '—'] : []), DIR[r.dir], r.trip, r.bus, r.sched, r.act, r.delay ?? '', r.cls ? CLS[r.cls] : '',
    r.pax, r.missed, r.status ? (isAr ? (STATUS_AR[r.status] || r.status) : r.status) : '', r.by, r.notes]
  R.table({ columns: recCols(true), rows: inPeriod.map(r => recRow(r, true)), filter: true, freeze: 2, printTitle: true })
  R.finish({ landscape: true })

  // ═════════ ورقة لكل محطة ═════════
  const used = new Set([T('لوحة القيادة', 'Dashboard'), T('الاتجاه اليومي', 'Daily trend'), T('غير المُدخلة', 'Not entered'), T('السجلات', 'Records')])
  const recBy = {}; inPeriod.forEach(r => { (recBy[r.sid] ??= []).push(r) })
  const unBy = {}; uSorted.forEach(e => { (unBy[e.sid] ??= []).push(e) })
  for (const r of rows.filter(x => x.s.dep.trips + x.s.arr.trips > 0 || x.un > 0)) {
    let nm = String(r.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Station'
    while (used.has(nm)) nm = nm.slice(0, 26) + '_' + Math.floor(Math.random() * 90 + 10)
    used.add(nm)
    const sh = book.sheet(nm, [12, 11, 14, 10, 11, 11, 10, 14, 9, 11, 22, 22, 32], { tab: 'FF8B9DB8' })
    sh.header({ title: r.name, subtitle })
    const s = r.s
    sh.kpis([
      { label: T('رحلات المغادرة', 'Departures'), value: s.dep.trips, fmt: '#,##0', color: DEP_C, foot: dTxt(s.dep.trips, s.pDep.trips) },
      { label: T('ركاب المغادرة', 'Departing pax'), value: s.dep.pax, fmt: '#,##0', color: DEP_C, foot: dTxt(s.dep.pax, s.pDep.pax) },
      { label: T('انضباط المغادرة', 'Departure punctuality'), value: punct(s.dep) ?? '—', fmt: '0%', color: puColor(punct(s.dep)) ?? XL.grey, foot: '' },
      { label: T('مغادرة غير مُدخلة', 'Departures missing'), value: s.unDep, fmt: '#,##0', color: s.unDep > 0 ? XL.red : XL.green, foot: s.expDep ? `${pc(complete(s.expDep, s.unDep))} ${T('اكتمال', 'complete')}` : '' },
    ], 3)
    sh.kpis([
      { label: T('رحلات الوصول', 'Arrivals'), value: s.arr.trips, fmt: '#,##0', color: ARR_C, foot: dTxt(s.arr.trips, s.pArr.trips) },
      { label: T('ركاب الوصول', 'Arriving pax'), value: s.arr.pax, fmt: '#,##0', color: ARR_C, foot: dTxt(s.arr.pax, s.pArr.pax) },
      { label: T('انضباط الوصول', 'Arrival punctuality'), value: punct(s.arr) ?? '—', fmt: '0%', color: puColor(punct(s.arr)) ?? XL.grey, foot: '' },
      { label: T('وصول غير مُدخل', 'Arrivals missing'), value: s.unArr, fmt: '#,##0', color: s.unArr > 0 ? XL.red : XL.green, foot: s.expArr ? `${pc(complete(s.expArr, s.unArr))} ${T('اكتمال', 'complete')}` : '' },
    ], 3)
    const list = [
      ...(recBy[r.id] ?? []).map(x => ({ d: x.date, t: x.sched || '', row: recRow(x, false) })),
      ...(unBy[r.id] ?? []).map(e => ({ d: e.date, t: e.time || '', row: [e.date, DIR[e.dir], e.trip, '', e.time, '', '', NOT_ENTERED, '', '', '', '', `${e.from} ← ${e.to}`] })),
    ].sort((a, b) => b.d.localeCompare(a.d) || b.t.localeCompare(a.t))
    sh.table({ columns: recCols(false), rows: list.map(x => x.row), filter: true, freeze: true, printTitle: true })
    sh.finish({ landscape: true })
  }

  onProgress?.(T('تجهيز التنزيل…', 'Preparing download…'))
  await book.save(isAr ? `التقرير-التشغيلي_${from}_${to}` : `operations-report_${from}_${to}`)
  return { records: cur.length, stations: activeRows.length, trips: tot.dep.trips + tot.arr.trips }
}
