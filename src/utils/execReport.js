// «بوصلة الأداء» — التقرير التنفيذي للعمليات (للإدارة العليا)
// يجلب بياناته بنفسه لفترة ومحطات يحددها المستخدم، ويبني مستند طباعة A4 أفقي بأقسام يختارها:
// الملخص التنفيذي · أداء المحطات (المحطات والوكلاء منفصلين) · المبيعات ونسب النمو · المتغيبون · الحالة التشغيلية
// (مع علامة تكرار على رقم الحافلة) · الموجودات والمفقودات · كشوف المحطات (المغادرة والوصول متقابلين في نفس الصفحة).
// القواعد نفسها المعتمدة في صفحة التقارير: الوصول والمغادرة منفصلان دائماً ولا يُجمعان، والانضباط = مبكر أو ≤5 دقائق.
import { shiftsOfStation } from './stationShifts'
import { shiftIdx } from './shifts'
import { brandLogo } from './printDoc'

export const REPORT_NAME = { ar: 'بوصلة الأداء', en: 'Performance Compass' }
export const REPORT_SUB = { ar: 'تقرير تنفيذي', en: 'Executive Report' }

export const EXEC_SECTIONS = [
  { id: 'summary', ar: 'نظرة عامة', en: 'Overview', hint_ar: 'الأرقام الرئيسية، الركاب يومياً، وأبرز الملاحظات', hint_en: 'Headline figures, daily passengers and highlights' },
  { id: 'stations', ar: 'أداء المحطات', en: 'Station performance', hint_ar: 'المحطات والوكلاء: الرحلات والركاب والإدخال', hint_en: 'Stations & agents: trips, passengers, data entry', cap: 'movements' },
  { id: 'sales', ar: 'المبيعات', en: 'Sales', hint_ar: 'الإيرادات وحصة كل محطة، والنمو عند تفعيله', hint_en: 'Revenue and share per station, growth when enabled', cap: 'sales' },
  { id: 'missed', ar: 'المتغيبون عن الرحلات', en: 'Missed passengers', hint_ar: 'نسبة الغياب، الساعات والرحلات والمحطات الأعلى', hint_en: 'Missed rate, peak hours, trips and stations', cap: 'missed' },
  { id: 'ops', ar: 'الحالة التشغيلية', en: 'Operational status', hint_ar: 'أعطال الحافلات وحالات التشغيل مع علامة التكرار', hint_en: 'Bus faults & incidents with repeat marks', cap: 'facilities' },
  { id: 'lost', ar: 'الموجودات والمفقودات', en: 'Lost & found', hint_ar: 'نسبة التسليم والمتبقي والمحطات الأعلى', hint_en: 'Delivery rate, remaining, top stations', cap: 'lost' },
  { id: 'sheets', ar: 'كشوف المحطات', en: 'Station sheets', hint_ar: 'المغادرة والوصول متقابلين لكل محطة', hint_en: 'Departures & arrivals side by side per station', cap: 'movements' },
]

// ── أدوات ─────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const nf = n => Math.round(Number(n) || 0).toLocaleString('en-US')
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const span = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000) + 1
const eachDay = (a, b) => { const o = []; for (let d = a; d <= b; d = addDays(d, 1)) o.push(d); return o }
const dowOf = iso => new Date(iso + 'T00:00:00Z').getUTCDay()
const fmtT = v => (v ? new Date(v).toISOString().slice(11, 16) : '')
const hm = v => (v ? String(v).slice(0, 5) : '')
// قيمة موقّعة (+6.2% / −57) داخل نص عربي: نعزلها LTR حتى لا تنقلب الإشارة لآخر الرقم
const sgn = (v, suf = '') => `<bdi dir="ltr">${v > 0 ? '+' : ''}${v}${suf}</bdi>`
const dmy = iso => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`
const pct = (a, b) => (b > 0 ? Math.round(a / b * 100) : null)
const growth = (cur, prev) => (prev > 0 ? Math.round((cur - prev) / prev * 1000) / 10 : null)
const delayOf = (sch, act) => {
  if (!sch || !act) return null
  const [sh, sm] = sch.split(':').map(Number), [ah, am] = act.split(':').map(Number)
  if ([sh, sm, ah, am].some(Number.isNaN)) return null
  let d = (ah * 60 + am) - (sh * 60 + sm)
  if (d < -120) d += 1440
  return d
}
const classify = d => (d == null ? null : d < 0 ? 'early' : d <= 5 ? 'ontime' : d <= 15 ? 'noton' : 'delayed')
const dm = iso => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`
const WD_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const OPS_AR = {
  'Accident between other vehicles': 'حادث بين مركبات أخرى', 'Health (Driver/Passengers)': 'حالة صحية (سائق/ركاب)', 'Passenger Misbehavior': 'سوء سلوك راكب',
  'Police Control': 'نقطة تفتيش', 'Traffic Jam': 'ازدحام مروري', 'Weather': 'أحوال جوية', 'Accident with NWB bus': 'حادث لحافلة NWB',
  'Malfunction inside the station': 'عطل داخل المحطة', 'Out-of-station malfunction': 'عطل خارج المحطة',
}
const FAC = [['screen_works', 'الشاشة', 'Screen'], ['wheelchair_works', 'كرسي ذوي الإعاقة', 'Wheelchair'], ['toilet_works', 'دورة المياه', 'Toilet']]

// جلب كل الصفحات (حد PostgREST 1000 صف) — 4 صفحات بالتوازي في كل دفعة بدل صفحة صفحة
async function pageAll(make) {
  const out = []
  for (let f = 0; f < 200000; f += 4000) {
    const res = await Promise.all([0, 1, 2, 3].map(k => make().range(f + k * 1000, f + k * 1000 + 999)))
    let short = false
    for (const { data, error } of res) {
      if (error) throw new Error(error.message)
      out.push(...(data ?? []))
      if ((data ?? []).length < 1000) { short = true; break }
    }
    if (short) break
  }
  return out
}
const soft = async p => { try { return await p } catch { return null } }

// ── جلب البيانات وبناء النموذج ─────────────────────────
/**
 * opts: { supabase, isAr, from, to, stations: [{id,name_ar,name_en,is_agent}], sections: Set, activeOnly, onProgress }
 */
// ذاكرة مؤقتة 5 دقائق: المعاينة ثم حفظ PDF بنفس الاختيارات لا يعيد جلب البيانات
const CACHE = new Map()
export async function buildExecModel(opts) {
  const key = JSON.stringify([opts.isAr, opts.from, opts.to, opts.stations.map(s => s.id).sort(), [...opts.sections].sort(), opts.activeOnly, !!opts.growth, new Date().toISOString().slice(0, 15)])
  const hit = CACHE.get(key)
  if (hit && Date.now() - hit.t < 5 * 60000) return hit.model
  const model = await buildExecModelRaw(opts)
  CACHE.clear(); CACHE.set(key, { t: Date.now(), model })
  return model
}

async function buildExecModelRaw({ supabase, isAr, from, to, stations, sections, activeOnly = true, growth: withGrowth = false, onProgress }) {
  const T = (a, e) => (isAr ? a : e)
  const ids = stations.map(s => s.id)
  const NONE = ['00000000-0000-0000-0000-000000000000']
  const inIds = q => q.in('station_id', ids.length ? ids : NONE)
  const n = span(from, to)
  const pFrom = addDays(from, -n), pTo = addDays(from, -1)
  // نفس التواريخ من العام الماضي
  const ly = { from: `${Number(from.slice(0, 4)) - 1}${from.slice(4)}`, to: `${Number(to.slice(0, 4)) - 1}${to.slice(4)}` }
  const want = id => sections.has(id)
  const nowDay = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })
  const nowHM = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false })
  const wantSales = want('sales') || want('summary') || want('stations')
  const wantOps = want('ops') || want('summary')
  const wantLost = want('lost') || want('summary')
  const FAULTS = 'screen_works.eq.false,wheelchair_works.eq.false,toilet_works.eq.false,operational_status.neq.Normal'
  const OPS_COLS = 'id, record_date, station_id, bus_number, screen_works, wheelchair_works, toilet_works, operational_status, actual_departure, actual_arrival, trip:trip_schedule_id(trip_number)'
  const qSales = (a, b) => soft(pageAll(() => inIds(supabase.from('sales_records').select('id, station_id, sale_date, shift, total_actual, total_expected, surplus_deficit, is_confirmed').gte('sale_date', a).lte('sale_date', b)).order('id')))
  const none = Promise.resolve([])

  // كل الاستعلامات تنطلق معاً (بدل واحد بعد الثاني) — أكبر توفير في وقت المعاينة
  onProgress?.(T('جلب البيانات…', 'Loading data…'))
  const [stInfo, recs, prevRecs, stTrips, stops, curS, prevS, lastS, opsPeriod, lostItems, lostBacklog, lostReports] = await Promise.all([
    supabase.from('stations').select('id, shift_ends, inactive_shifts').in('id', ids.length ? ids : NONE),
    pageAll(() => inIds(supabase.from('trip_records').select(`id, trip_schedule_id, record_date, station_id, passenger_count, missed_count, missed_tickets,
      bus_number, actual_departure, actual_arrival, is_arrival,
      trip:trip_schedule_id(trip_number, from_station_id, to_station_id, scheduled_departure, scheduled_arrival, from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en))`)
      .gte('record_date', from).lte('record_date', to)).order('id')),
    withGrowth ? pageAll(() => inIds(supabase.from('trip_records').select('id, station_id, passenger_count, missed_count, is_arrival, actual_departure, actual_arrival, trip:trip_schedule_id(from_station_id, to_station_id)')
      .gte('record_date', pFrom).lte('record_date', pTo)).order('id')) : none,
    pageAll(() => inIds(supabase.from('station_trips').select(`trip_schedule_id, station_id, departure_time, arrival_time, dep_enabled, arr_enabled,
      trip:trip_schedule_id(trip_number, from_station_id, to_station_id, scheduled_departure, scheduled_arrival, is_active, is_rf, rf_date, days_of_week, start_date, end_date,
        from_station:from_station_id(id, name_ar, name_en, city_group), to_station:to_station_id(id, name_ar, name_en, city_group))`)).order('trip_schedule_id').order('station_id')),
    pageAll(() => inIds(supabase.from('trip_schedule_stops').select('trip_schedule_id, station_id, arrival_time, departure_time')).order('trip_schedule_id').order('station_id')),
    wantSales ? qSales(from, to) : null,
    wantSales && withGrowth ? qSales(pFrom, pTo) : none,
    wantSales && withGrowth ? qSales(ly.from, ly.to) : none,
    wantOps ? soft(pageAll(() => inIds(supabase.from('trip_records').select(OPS_COLS)).gte('record_date', from).lte('record_date', to).or(FAULTS).order('id'))) : none,
    wantLost ? soft(pageAll(() => inIds(supabase.from('lost_found_items').select('id, station_id, status, found_date')).gte('found_date', from).lte('found_date', to).order('id'))) : null,
    wantLost ? soft(pageAll(() => inIds(supabase.from('lost_found_items').select('id, station_id, found_date')).eq('status', 'unclaimed').order('id'))) : none,
    wantLost ? soft(pageAll(() => inIds(supabase.from('lost_reports').select('id, station_id, created_at')).gte('created_at', `${from}T00:00:00+03:00`).lte('created_at', `${to}T23:59:59.999+03:00`).order('id'))) : none,
  ])
  const shiftSt = Object.fromEntries((stInfo.data ?? []).map(x => [x.id, x]))
  const offAt = (sid, hhmm) => {
    if (!activeOnly || !hhmm) return false
    const st = shiftSt[sid]
    if (!st || !(st.inactive_shifts || []).length) return false
    const sh = shiftsOfStation(st)
    const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number)
    return !!sh[shiftIdx((h || 0) * 60 + (m || 0), sh)]?.off
  }
  let sales = null
  if (curS) {
    const keep = r => !(activeOnly && (shiftSt[r.station_id]?.inactive_shifts || []).includes(r.shift))
    sales = { cur: curS.filter(keep), prev: (prevS ?? []).filter(keep), last: (lastS ?? []).filter(keep) }
  }
  // التكرار: تاريخ نفس الحافلات فقط خلال 30 يوماً (على مستوى الشبكة) بدل جلب كل أعطال الشبكة
  let opsRecs = opsPeriod ?? []
  const buses = [...new Set(opsRecs.map(r => String(r.bus_number || '').trim()).filter(Boolean))]
  if (buses.length) {
    onProgress?.(T('فحص تكرار الحالات…', 'Checking repeats…'))
    const hist = []
    for (let i = 0; i < buses.length; i += 150) {
      const part = await soft(pageAll(() => supabase.from('trip_records').select(OPS_COLS).in('bus_number', buses.slice(i, i + 150)).gte('record_date', addDays(from, -30)).lte('record_date', to).or(FAULTS).order('id')))
      if (part) hist.push(...part)
    }
    const seen = new Set(opsRecs.map(r => r.id))
    opsRecs = [...opsRecs, ...hist.filter(r => !seen.has(r.id))]
  }

  onProgress?.(T('تحليل البيانات…', 'Analysing…'))
  const nameOf = s => (isAr ? (s?.name_ar || s?.name_en) : (s?.name_en || s?.name_ar)) || '—'
  const stById = Object.fromEntries(stations.map(s => [s.id, s]))
  const stopMap = {}, stMap = {}
  stops.forEach(s => { stopMap[`${s.trip_schedule_id}|${s.station_id}`] = s })
  stTrips.forEach(s => { stMap[`${s.trip_schedule_id}|${s.station_id}`] = s })
  const isArrRec = r => {
    const tf = r.trip?.from_station_id, tt = r.trip?.to_station_id
    if (tt === r.station_id) return true
    if (tf === r.station_id) return false
    return r.is_arrival != null ? r.is_arrival === true : (r.actual_arrival != null && r.actual_departure == null)
  }

  // ── الحركات (المُدخلة) ──
  const moves = []
  recs.forEach(r => {
    const isArr = isArrRec(r)
    const se = stMap[`${r.trip_schedule_id}|${r.station_id}`], sp = stopMap[`${r.trip_schedule_id}|${r.station_id}`]
    const sched = hm(isArr ? (se?.arrival_time || sp?.arrival_time || r.trip?.scheduled_arrival) : (se?.departure_time || sp?.departure_time || r.trip?.scheduled_departure))
    const act = fmtT(isArr ? (r.actual_arrival ?? r.actual_departure) : (r.actual_departure ?? r.actual_arrival))
    if (offAt(r.station_id, sched || act)) return
    const d = delayOf(sched, act)
    moves.push({
      date: r.record_date, sid: r.station_id, dir: isArr ? 'a' : 'd', trip: r.trip?.trip_number || '—', bus: r.bus_number || '',
      other: nameOf(isArr ? r.trip?.from_station : r.trip?.to_station), sched, act, delay: d, cls: classify(d),
      pax: r.passenger_count || 0, missed: isArr ? 0 : (r.missed_count || 0), tickets: isArr ? [] : (r.missed_tickets || []),
    })
  })

  // ── الرحلات المجدولة غير المُدخلة ──
  const entered = new Set(recs.map(r => `${r.trip_schedule_id}|${r.record_date}|${r.station_id}|${isArrRec(r) ? 'a' : 'd'}`))
  const groupOf = x => (x ? (x.city_group || (x.name_en || '').split(/[\s-]+/)[0].toLowerCase() || null) : null)
  const days = eachDay(from, to)
  stTrips.forEach(st => {
    const trip = st.trip
    if (!trip?.is_active || !stById[st.station_id]) return
    const isDest = trip.to_station?.id === st.station_id || trip.to_station_id === st.station_id
    const isOrig = trip.from_station?.id === st.station_id || trip.from_station_id === st.station_id
    const stop = stopMap[`${st.trip_schedule_id}|${st.station_id}`]
    const arrOn = st.arr_enabled !== false, depOn = st.dep_enabled !== false
    const curG = groupOf(stById[st.station_id]), sameFrom = !!(curG && curG === groupOf(trip.from_station)), sameTo = !!(curG && curG === groupOf(trip.to_station))
    days.forEach(date => {
      if (trip.is_rf && trip.rf_date !== date) return
      if (trip.start_date && date < trip.start_date) return
      if (trip.end_date && date > trip.end_date) return
      if (trip.days_of_week?.length && !trip.days_of_week.includes(dowOf(date))) return
      const add = (isArr, time) => {
        if (!time || entered.has(`${st.trip_schedule_id}|${date}|${st.station_id}|${isArr ? 'a' : 'd'}`) || offAt(st.station_id, hm(time))) return
        // رحلة لم يحن موعدها بعد (اليوم لاحقاً أو يوم قادم) لا تُحسب «غير مدخلة»
        if (date > nowDay || (date === nowDay && hm(time) > nowHM)) return
        moves.push({ date, sid: st.station_id, dir: isArr ? 'a' : 'd', trip: trip.trip_number || '—', bus: '', other: nameOf(isArr ? trip.from_station : trip.to_station), sched: hm(time), act: '', delay: null, cls: null, pax: 0, missed: 0, tickets: [], un: true })
      }
      if (isDest) { if (arrOn) add(true, st.arrival_time || trip.scheduled_arrival) }
      else if (isOrig) { if (depOn) add(false, st.departure_time || trip.scheduled_departure) }
      else {
        if (arrOn && !sameFrom) add(true, st.arrival_time || stop?.arrival_time)
        if (depOn && !sameTo) add(false, st.departure_time || stop?.departure_time)
      }
    })
  })
  moves.sort((x, y) => x.date.localeCompare(y.date) || (x.sched || x.act || '').localeCompare(y.sched || y.act || ''))

  // ── تجميع لكل محطة ──
  const dirStat = () => ({ trips: 0, un: 0, pax: 0, missed: 0, rated: 0, good: 0, early: 0, ontime: 0, noton: 0, delayed: 0 })
  const per = {}
  stations.forEach(s => { per[s.id] = { id: s.id, name: nameOf(s), agent: !!s.is_agent, d: dirStat(), a: dirStat(), prevD: 0, prevA: 0, prevMissed: 0, sales: null, lost: null, faults: 0 } })
  moves.forEach(m => {
    const P = per[m.sid]; if (!P) return
    const S = m.dir === 'a' ? P.a : P.d
    if (m.un) { S.un++; return }
    S.trips++; S.pax += m.pax; S.missed += m.missed
    if (m.cls) { S.rated++; S[m.cls]++; if (m.cls === 'early' || m.cls === 'ontime') S.good++ }
  })
  prevRecs.forEach(r => {
    const P = per[r.station_id]; if (!P) return
    if (isArrRec(r)) P.prevA += r.passenger_count || 0
    else { P.prevD += r.passenger_count || 0; P.prevMissed += r.missed_count || 0 }
  })
  const sumSales = list => list.reduce((o, r) => { o.rev += Number(r.total_actual || 0); o.exp += Number(r.total_expected || 0); o.diff += Number(r.surplus_deficit || 0); o.n++; if (r.is_confirmed) o.conf++; return o }, { rev: 0, exp: 0, diff: 0, n: 0, conf: 0 })
  if (sales) {
    const by = (list, sid) => list.filter(r => r.station_id === sid)
    Object.values(per).forEach(P => {
      const c = sumSales(by(sales.cur, P.id))
      P.sales = { ...c, prev: sumSales(by(sales.prev, P.id)).rev, last: sumSales(by(sales.last, P.id)).rev }
    })
  }
  if (lostItems) {
    Object.values(per).forEach(P => {
      const L = lostItems.filter(x => x.station_id === P.id)
      P.lost = {
        found: L.length, claimed: L.filter(x => x.status === 'claimed').length, unclaimed: L.filter(x => x.status === 'unclaimed').length,
        donated: L.filter(x => x.status === 'donated' || x.status === 'disposed').length,
        backlog: (lostBacklog ?? []).filter(x => x.station_id === P.id).length,
        reports: (lostReports ?? []).filter(x => x.station_id === P.id).length,
      }
    })
  }

    Object.values(per).forEach(P => {
    P.dRate = pct(P.d.good, P.d.rated); P.aRate = pct(P.a.good, P.a.rated)
    const exp = P.d.trips + P.d.un + P.a.trips + P.a.un
    P.entry = pct(P.d.trips + P.a.trips, exp)
    P.missRate = (P.d.pax + P.d.missed) > 0 ? Math.round(P.d.missed / (P.d.pax + P.d.missed) * 1000) / 10 : 0
    P.idle = exp === 0
  })

  // ── الإجماليات ──
  const all = Object.values(per)
  const tot = all.reduce((t, P) => {
    ;['trips', 'un', 'pax', 'missed', 'rated', 'good'].forEach(k => { t.d[k] += P.d[k]; t.a[k] += P.a[k] })
    t.prevD += P.prevD; t.prevA += P.prevA; t.prevMissed += P.prevMissed
    return t
  }, { d: dirStat(), a: dirStat(), prevD: 0, prevA: 0, prevMissed: 0 })
  tot.dRate = pct(tot.d.good, tot.d.rated); tot.aRate = pct(tot.a.good, tot.a.rated)
  tot.entry = pct(tot.d.trips + tot.a.trips, tot.d.trips + tot.d.un + tot.a.trips + tot.a.un)
  tot.missRate = (tot.d.pax + tot.d.missed) > 0 ? Math.round(tot.d.missed / (tot.d.pax + tot.d.missed) * 1000) / 10 : 0
  tot.gD = growth(tot.d.pax, tot.prevD); tot.gA = growth(tot.a.pax, tot.prevA)

  // ساعات الذروة: ركاب المغادرة والوصول لكل ساعة (منفصلين) حسب الوقت الفعلي، وإلا المجدول
  const hours = { d: Array(24).fill(0), a: Array(24).fill(0), dT: Array(24).fill(0), aT: Array(24).fill(0) }
  moves.forEach(m => { if (m.un) return; const h = Number((m.act || m.sched || '').slice(0, 2)); if (Number.isNaN(h) || h > 23) return; hours[m.dir][h] += m.pax; hours[m.dir + 'T'][h]++ })
  // يومي (الاتجاه)
  const daily = days.map(date => {
    const L = moves.filter(m => m.date === date && !m.un)
    return { date, dPax: L.filter(m => m.dir === 'd').reduce((s, m) => s + m.pax, 0), aPax: L.filter(m => m.dir === 'a').reduce((s, m) => s + m.pax, 0), missed: L.reduce((s, m) => s + m.missed, 0),
      rev: sales ? sales.cur.filter(r => r.sale_date === date).reduce((s, r) => s + Number(r.total_actual || 0), 0) : 0 }
  })

  // ── المبيعات: إجماليات ونمو ──
  let salesM = null
  if (sales) {
    const c = sumSales(sales.cur), p = sumSales(sales.prev), l = sumSales(sales.last)
    salesM = { ...c, prev: p.rev, last: l.rev, gPrev: growth(c.rev, p.rev), gLast: growth(c.rev, l.rev), pFrom, pTo, lyFrom: ly.from, lyTo: ly.to, hasLast: sales.last.length > 0 }
  }

  // ── المتغيبون ──
  const depMoves = moves.filter(m => m.dir === 'd' && !m.un)
  const missedRows = depMoves.filter(m => m.missed > 0)
  const byHour = Array.from({ length: 24 }, () => 0)
  const byWd = Array.from({ length: 7 }, () => 0)
  const byTrip = {}
  missedRows.forEach(m => {
    const h = Number((m.sched || m.act || '').slice(0, 2)); if (!Number.isNaN(h)) byHour[h] += m.missed
    byWd[dowOf(m.date)] += m.missed
    const k = `${m.trip}|${m.sid}`
    const o = (byTrip[k] ??= { trip: m.trip, station: per[m.sid]?.name || '—', to: m.other, sched: m.sched, missed: 0, pax: 0, times: 0 })
    o.missed += m.missed; o.times++
  })
  depMoves.forEach(m => { const o = byTrip[`${m.trip}|${m.sid}`]; if (o) o.pax += m.pax })
  const tickets = []
  missedRows.forEach(m => (m.tickets || []).forEach(t => tickets.push({ date: m.date, station: per[m.sid]?.name || '—', trip: m.trip, ticket: t?.ticket ?? t })))
  const missedM = {
    total: tot.d.missed, rate: tot.missRate, prev: tot.prevMissed, g: growth(tot.d.missed, tot.prevMissed),
    trips: missedRows.length, depTrips: depMoves.length, avg: missedRows.length ? Math.round(tot.d.missed / missedRows.length * 10) / 10 : 0,
    byHour, byWd, topTrips: Object.values(byTrip).sort((a, b) => b.missed - a.missed).slice(0, 10), tickets,
  }

  // ── الحالة التشغيلية مع علامة التكرار ──
  const faults = []   // { date, sid, bus, kind:'f'|'o', what, trip, time }
  opsRecs.forEach(r => {
    const bus = String(r.bus_number || '').trim()
    const base = { date: r.record_date, sid: r.station_id, bus, trip: r.trip?.trip_number || '—', time: fmtT(r.actual_departure ?? r.actual_arrival) }
    FAC.forEach(([k, ar, en]) => { if (r[k] === false) faults.push({ ...base, kind: 'f', what: isAr ? ar : en }) })
    if (r.operational_status && r.operational_status !== 'Normal') faults.push({ ...base, kind: 'o', what: isAr ? (OPS_AR[r.operational_status] || r.operational_status) : r.operational_status })
  })
  const inPeriod = f => f.date >= from && f.date <= to && !!per[f.sid]
  const groups = {}
  faults.filter(inPeriod).forEach(f => {
    const key = `${f.kind}|${f.bus || '—'}|${f.what}`
    const g = (groups[key] ??= { kind: f.kind, bus: f.bus || '—', what: f.what, n: 0, dates: new Set(), stations: new Set(), trips: new Set(), perDay: {} })
    g.n++; g.dates.add(f.date); g.stations.add(per[f.sid]?.name || '—'); g.trips.add(f.trip); g.perDay[f.date] = (g.perDay[f.date] || 0) + 1
    if (per[f.sid]) per[f.sid].faults++
  })
  const opsRows = Object.values(groups).map(g => {
    // التكرار: نفس الحافلة ونفس الحالة على مستوى الشبكة خلال 30 يوماً قبل الفترة وحتى نهايتها
    const hist = g.bus === '—' ? [] : faults.filter(f => f.bus === g.bus && f.what === g.what && f.kind === g.kind)
    const histDays = [...new Set(hist.map(f => f.date))].sort()
    const maxDay = Math.max(0, ...Object.values(g.perDay))
    return { ...g, dates: [...g.dates].sort(), stations: [...g.stations], trips: [...g.trips], sameDay: maxDay, since: histDays[0] || null, histDays: histDays.length, repeat: maxDay > 1 || histDays.length > 1 }
  }).sort((a, b) => (b.repeat - a.repeat) || (b.histDays - a.histDays) || (b.n - a.n))
  const busRepeat = new Set(opsRows.filter(r => r.repeat && r.bus !== '—').map(r => r.bus)).size
  const opsM = {
    fac: opsRows.filter(r => r.kind === 'f'), inc: opsRows.filter(r => r.kind === 'o'),
    facN: opsRows.filter(r => r.kind === 'f').reduce((s, r) => s + r.n, 0), incN: opsRows.filter(r => r.kind === 'o').reduce((s, r) => s + r.n, 0),
    buses: new Set(opsRows.map(r => r.bus).filter(b => b !== '—')).size, busRepeat,
  }

  // ── الموجودات ──
  let lostM = null
  if (lostItems) {
    const L = all.map(P => P.lost).filter(Boolean)
    const s = k => L.reduce((t, x) => t + x[k], 0)
    lostM = { found: s('found'), claimed: s('claimed'), unclaimed: s('unclaimed'), donated: s('donated'), backlog: s('backlog'), reports: s('reports') }
    lostM.rate = pct(lostM.claimed, lostM.found)
    lostM.oldBacklog = (lostBacklog ?? []).filter(x => x.found_date && x.found_date < addDays(to, -30)).length
  }

  return {
    isAr, from, to, days: n, pFrom, pTo, stations: all, nwb: all.filter(P => !P.agent), agents: all.filter(P => P.agent),
    moves, tot, daily, hours, sales: salesM, missed: missedM, ops: opsM, lost: lostM, activeOnly, growth: withGrowth,
  }
}

// ── المستند ────────────────────────────────────────────
const C = { ink: '#14213D', ink2: '#33415C', mute: '#6B7A90', line: '#E3E8EF', soft: '#F5F7FA', brand: '#EE712D', navy: '#264673', dep: '#1F4E8C', arr: '#0F7A6C', good: '#15803D', warn: '#B45309', bad: '#B91C1C', early: '#1D4ED8' }
const tone = r => (r == null ? C.mute : r >= 80 ? C.good : r >= 60 ? C.warn : C.bad)

export const EXEC_CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600;700&display=swap');
@page{size:A4 landscape;margin:9mm 10mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
html,body{margin:0;padding:0}
body{background:#DCE1E8;font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif;color:${C.ink};font-size:11px;line-height:1.45}
.doc{max-width:1120px;margin:18px auto 40px}
.pg{background:#fff;padding:22px 26px 18px;margin-bottom:18px;border-radius:6px;box-shadow:0 10px 30px rgba(20,33,61,.12);position:relative}
@media print{body{background:#fff}.doc{max-width:none;margin:0}.pg{box-shadow:none;border-radius:0;padding:0;margin:0}.pg+.pg{break-before:page}.no-print{display:none!important}}
.mono{font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-feature-settings:"tnum"}
.top{display:flex;align-items:center;gap:16px;padding-bottom:10px;border-bottom:1px solid ${C.line};margin-bottom:14px}
.top .lg{flex:none}
.top .ttl{flex:1;min-width:0}
.top .ttl small{display:block;font-size:9.5px;font-weight:700;letter-spacing:.14em;color:${C.brand};text-transform:uppercase}
.top .ttl b{display:block;font-size:19px;font-weight:700;color:${C.ink};line-height:1.25}
.top .meta{flex:none;text-align:end;font-size:9.5px;color:${C.mute};line-height:1.7}
.top .meta b{color:${C.ink};font-weight:700}
.sn{display:flex;align-items:baseline;gap:10px;margin:2px 0 12px}
.sn i{font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;color:#fff;background:${C.ink};border-radius:4px;padding:2px 7px}
.sn h2{margin:0;font-size:17px;font-weight:700}
.sn span{font-size:10px;color:${C.mute}}
.cover{display:grid;grid-template-columns:1.35fr 1fr;gap:0;border-radius:10px;overflow:hidden;background:${C.ink};color:#fff;margin-bottom:14px}
.cover .l{padding:16px 20px}
.cover .l small{display:block;font-size:9.5px;letter-spacing:.18em;font-weight:700;color:${C.brand}}
.cover .l h1{margin:2px 0 2px;font-size:27px;font-weight:700;line-height:1.15}
.cover .l p{margin:0;font-size:11.5px;color:#C9D3E3}
.cover .l .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.cover .l .chips span{font-size:9.5px;font-weight:600;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:3px 10px;color:#E6ECF5}
.cover .r{display:grid;grid-template-columns:1fr 1fr;background:rgba(255,255,255,.04)}
.cover .r div{padding:11px 16px;border-inline-start:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)}
.cover .r small{display:block;font-size:9.5px;color:#AFBBCE;font-weight:600}
.cover .r b{display:block;font-size:24px;font-weight:700;font-family:'IBM Plex Mono',monospace;margin-top:2px}
.cover .r em{font-style:normal;font-size:9.5px;font-weight:700}
.kpis{display:grid;grid-template-columns:repeat(var(--n,6),1fr);gap:0;border:1px solid ${C.line};border-radius:8px;overflow:hidden;margin-bottom:12px}
.kpi{padding:10px 12px;border-inline-start:1px solid ${C.line};background:#fff;position:relative}
.kpi:first-child{border-inline-start:0}
.kpi::before{content:'';position:absolute;top:0;inset-inline:0;height:3px;background:var(--c,${C.ink})}
.kpi small{display:block;font-size:9.5px;font-weight:600;color:${C.mute}}
.kpi b{display:block;font-size:21px;font-weight:700;font-family:'IBM Plex Mono',monospace;line-height:1.2;margin-top:3px;color:${C.ink}}
.kpi em{display:block;font-style:normal;font-size:9.5px;font-weight:600;color:${C.mute};margin-top:1px}
.up{color:${C.good}!important}.down{color:${C.bad}!important}.flat{color:${C.mute}!important}
.row{display:grid;gap:12px;margin-bottom:12px}
.box{border:1px solid ${C.line};border-radius:8px;padding:11px 13px;background:#fff;break-inside:avoid}
.box h3{margin:0 0 8px;font-size:11.5px;font-weight:700;color:${C.ink2};display:flex;align-items:center;justify-content:space-between;gap:8px}
.box h3 span{font-size:9.5px;font-weight:600;color:${C.mute}}
.ins{list-style:none;margin:0;padding:0}
.ins li{display:flex;gap:9px;align-items:flex-start;padding:6px 0;border-bottom:1px dashed ${C.line};font-size:11px}
.ins li:last-child{border-bottom:0}
.ins li i{flex:none;width:7px;height:7px;border-radius:2px;margin-top:5px;background:var(--c,${C.ink})}
.ins li b{font-weight:700}
table.t{width:100%;border-collapse:collapse;font-size:10.5px}
table.t thead{display:table-header-group}
table.t th{background:${C.soft};color:${C.ink2};font-weight:700;font-size:9.5px;padding:6px 7px;border-bottom:1.5px solid #CBD3DE;text-align:center;white-space:nowrap}
table.t th.s,table.t td.s{text-align:start}
table.t td{padding:5px 7px;border-bottom:1px solid #EEF1F5;text-align:center;vertical-align:middle}
table.t tr{break-inside:avoid}
table.t tbody tr:nth-child(even) td{background:#FAFBFC}
table.t tr.tot td{background:${C.ink}!important;color:#fff;font-weight:700;border-bottom:0}
table.t tr.idle td{color:#A0AABA}
.bar{display:flex;align-items:center;gap:6px;min-width:80px}
.bar>span{flex:1;height:6px;border-radius:3px;background:#E8ECF2;overflow:hidden}
.bar>span>i{display:block;height:100%;border-radius:3px}
.bar b{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;min-width:30px;text-align:end}
.grade{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:5px;color:#fff;font-weight:700;font-size:11px;font-family:'IBM Plex Mono',monospace}
.tag{display:inline-block;font-size:8.5px;font-weight:700;border-radius:3px;padding:1px 5px;margin-inline-start:5px;vertical-align:1px}
.tag.ag{background:#EEF0FF;color:#4338CA}
.rep{display:inline-flex;align-items:center;gap:3px;font-size:8.5px;font-weight:700;border-radius:3px;padding:1px 5px;margin-inline-start:5px;background:#FDECEC;color:${C.bad};white-space:nowrap}
.rep.day{background:#FFF4E5;color:${C.warn}}
.vs{display:inline-block;min-width:38px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:700;border-radius:4px;padding:1px 6px;text-align:center}
.vs.b{background:#FDECEC;color:${C.bad}}.vs.g{background:#E8F6EC;color:${C.good}}.vs.n{background:#F1F3F6;color:${C.mute}}
.th2{display:block;font-size:8px;font-weight:600;color:${C.mute}}
.bus{font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:11px}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:9.5px;color:${C.mute};margin-top:6px}
.legend span{display:inline-flex;align-items:center;gap:5px}
.legend i{width:9px;height:9px;border-radius:2px;display:inline-block}
.note{font-size:9.5px;color:${C.mute};line-height:1.7;margin-top:8px}
.foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:7px;border-top:1px solid ${C.line};font-size:8.5px;color:${C.mute}}
.foot b{color:${C.ink};letter-spacing:.12em;font-weight:700}
.empty{padding:16px;text-align:center;color:${C.mute};border:1px dashed #CBD3DE;border-radius:8px;font-size:11px}
/* كشف المحطة: المغادرة والوصول متقابلان */
.stn{break-inside:auto;margin-bottom:18px}
.stn.small{break-inside:avoid}
.stn.own+.stn.own{break-before:page}
.sh{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:8px;background:${C.ink};color:#fff;margin-bottom:8px}
.sh b{font-size:15px;font-weight:700}
.sh .tag{margin:0}
.sh .sp{flex:1}
.sh .m{display:flex;gap:14px;font-size:9.5px;color:#C9D3E3}
.sh .m span b{font-size:12px;color:#fff;font-family:'IBM Plex Mono',monospace;margin-inline-start:4px}
table.pair{width:100%;border-collapse:collapse;font-size:9.8px;table-layout:fixed}
table.pair thead{display:table-header-group}
table.pair th{font-size:8.8px;font-weight:700;padding:4px 3px;color:${C.ink2};background:${C.soft};border-bottom:1.5px solid #CBD3DE;white-space:nowrap;overflow:hidden}
table.pair th.hd{color:#fff;font-size:10.5px;padding:5px 8px;text-align:start}
table.pair th.hd.d{background:${C.dep}}table.pair th.hd.a{background:${C.arr}}
table.pair td{padding:2.5px 3px;line-height:1.3;border-bottom:1px solid #EEF1F5;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
table.pair td.gap,table.pair th.gap{width:10px;background:#fff!important;border:0}
table.pair td.trip{font-family:'IBM Plex Mono',monospace;font-weight:700;border-inline-start:3px solid var(--k,#CBD3DE);text-align:start;padding-inline-start:5px}
table.pair td.trip small{font-weight:500;color:${C.mute};margin-inline-end:4px}
table.pair td.pl{text-align:start}
table.pair td.n{font-family:'IBM Plex Mono',monospace;font-weight:600}
table.pair tr{break-inside:avoid}
table.pair td.u{background:#FFF8EB!important;color:#9A6A1F}
.unl{margin-top:6px;font-size:9.5px;color:${C.warn};line-height:1.8}
.unl b{color:${C.ink}}
.unl span{display:inline-block;unicode-bidi:isolate;direction:ltr;font-family:'IBM Plex Mono',monospace;font-weight:600;background:#FFF4E5;border-radius:3px;padding:0 5px;margin:1px 2px;white-space:nowrap}
.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.card{border:1px solid ${C.line};border-radius:8px;padding:10px 12px;break-inside:avoid}
.card .h{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.card .h b{font-size:12.5px;flex:1}
.card .g{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center}
.card .g small{display:block;font-size:8.5px;color:${C.mute};font-weight:600}
.card .g b{font-family:'IBM Plex Mono',monospace;font-size:13px}
body.bw .doc{filter:grayscale(1) contrast(1.15)}
.tb{position:sticky;top:0;z-index:9;display:flex;align-items:center;gap:10px;padding:10px 16px;background:${C.ink};color:#fff;font-size:12px;font-weight:600}
.tb .sp{flex:1}
.tb button{font-family:inherit;font-size:12px;font-weight:700;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;padding:7px 14px;cursor:pointer}
.tb button.on,.tb button.pr{background:#fff;color:${C.ink};border-color:#fff}
.tb button.pr{background:${C.brand};color:#fff;border-color:${C.brand}}
`

export function buildExecDocument(model, { sections, sheetIds, opts = {}, preparedBy = '', scopeLabel = '' }) {
  const { isAr } = model
  const T = (a, e) => (isAr ? a : e)
  const dir = isAr ? 'rtl' : 'ltr'
  const period = model.from === model.to ? dmy(model.from) : T(`من ${dmy(model.from)} إلى ${dmy(model.to)}`, `${dmy(model.from)} – ${dmy(model.to)}`)
  const want = id => sections.includes(id)
  const G = !!model.growth   // النمو والمقارنة اختيارية (تُخفى بالكامل إن لم تُفعَّل)
  const stamp = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  let secNo = 0
  const daysWord = d => T(`${d} ${d === 1 ? 'يوم' : d === 2 ? 'يومان' : d <= 10 ? 'أيام' : 'يوماً'}`, `${d} day${d === 1 ? '' : 's'}`)

  const top = (title) => `<div class="top"><div class="lg">${brandLogo(104)}</div>
    <div class="ttl"><small>${esc(T(REPORT_NAME.ar, REPORT_NAME.en))} · ${esc(T(REPORT_SUB.ar, REPORT_SUB.en))}</small><b>${esc(title)}</b></div>
    <div class="meta">${T('الفترة', 'Period')}: <b>${esc(period)}</b> · ${daysWord(model.days)}<br>${T('النطاق', 'Scope')}: <b>${esc(scopeLabel)}</b></div></div>`
  const foot = () => `<div class="foot"><span>${T('أعدّه', 'Prepared by')}: ${esc(preparedBy || '—')} · ${esc(stamp)}</span><span>${T('سري — للاستخدام الداخلي', 'Confidential — internal use')}</span><b>NORTH WEST BUS</b></div>`
  const head = (title, sub) => { secNo++; return `<div class="sn"><i>${String(secNo).padStart(2, '0')}</i><h2>${esc(title)}</h2>${sub ? `<span>${sub}</span>` : ''}</div>` }
  const page = (title, body) => `<section class="pg">${top(title)}${body}${foot()}</section>`
  const gTxt = g => (g == null ? `<em class="flat">${T('لا مقارنة', 'no baseline')}</em>` : `<em class="${g > 0 ? 'up' : g < 0 ? 'down' : 'flat'}">${g > 0 ? '▲' : g < 0 ? '▼' : '■'} ${Math.abs(g)}%</em>`)
  // للمتغيبين: الارتفاع سيئ (أحمر) والانخفاض جيد
  const gTxtInv = g => (g == null ? '' : `<em class="${g > 0 ? 'down' : g < 0 ? 'up' : 'flat'}">${g > 0 ? '▲' : g < 0 ? '▼' : '■'} ${Math.abs(g)}% ${isAr ? 'عن الفترة السابقة' : 'vs previous'}</em>`)
  const gCell = g => (g == null ? '<span style="color:#A0AABA">—</span>' : `<b class="mono ${g > 0 ? 'up' : g < 0 ? 'down' : 'flat'}">${sgn(g, '%')}</b>`)
  // مقارنة المحطة بمتوسط المحطات المختارة (×1 = مثل المتوسط). bad=true: الأعلى أسوأ
  const NET = model.stations.reduce((t, P) => ({ dT: t.dT + P.d.trips, aT: t.aT + P.a.trips, dP: t.dP + P.d.pax, aP: t.aP + P.a.pax }), { dT: 0, aT: 0, dP: 0, aP: 0 })
  const per = (v, base, k) => (base > 0 ? Math.round(v / base * k * 10) / 10 : null)
  const vs = (v, avg, bad = true) => {
    if (v == null || !(avg > 0)) return '<span class="vs n">—</span>'
    const r = Math.round(v / avg * 10) / 10
    const cls = r >= 1.25 ? (bad ? 'b' : 'g') : r <= 0.8 ? (bad ? 'g' : 'b') : 'n'
    return `<span class="vs ${cls}"><bdi dir="ltr">×${r}</bdi></span>`
  }
  const small = P => P.d.trips + P.a.trips < 3   // عيّنة صغيرة: تُرتَّب آخراً
  const byNorm = f => (a, b) => (small(a) - small(b)) || ((f(b) ?? -1) - (f(a) ?? -1))
  const vsNote = T('«×» = المحطة مقارنةً بمتوسط المحطات المختارة نسبةً لعدد رحلاتها وركابها (×1 مثل المتوسط، ×2 ضعفه). <span class="vs b">أحمر</span> أسوأ من المتوسط بوضوح، <span class="vs g">أخضر</span> أفضل. المحطات بأقل من 3 رحلات تُرتَّب آخراً.', '“×” = station vs the average of selected stations, relative to its trips and passengers (×1 = average, ×2 = double). <span class="vs b">Red</span> clearly worse, <span class="vs g">green</span> better. Stations under 3 trips sort last.')
  const rateBar = r => (r == null ? '<span style="color:#A0AABA">—</span>' : `<div class="bar"><span><i style="width:${Math.min(100, r)}%;background:${tone(r)}"></i></span><b style="color:${tone(r)}" dir="ltr">${r}%</b></div>`)
  const kpis = items => `<div class="kpis" style="--n:${items.length}">${items.map(k => `<div class="kpi" style="--c:${k.c || C.ink}"><small>${k.l}</small><b${/[\u0600-\u06FFA-Za-z]{3}/.test(String(k.v).replace(/<[^>]+>/g, '')) ? ' style="font-family:inherit;font-size:14px;line-height:1.5"' : ''}>${k.v}</b>${k.s != null ? (String(k.s).startsWith('<') ? k.s : `<em>${k.s}</em>`) : ''}</div>`).join('')}</div>`
  const rp = r => (r == null ? '—' : `<bdi dir="ltr">${r}%</bdi>`)

  // مخطط أعمدة مزدوج بسيط (SVG) — سلسلتان منفصلتان دائماً
  const dualBars = (rows, k1, k2, c1, c2, label) => {
    if (rows.length < 2) return ''
    const W = 520, H = 120, P = 16, max = Math.max(1, ...rows.map(r => Math.max(r[k1], k2 ? r[k2] : 0)))
    const bw = (W - P * 2) / rows.length, w = Math.max(2, Math.min(14, bw / (k2 ? 2.6 : 1.6)))
    const bars = rows.map((r, i) => {
      const x = P + i * bw + bw / 2
      const h1 = (r[k1] / max) * (H - 24), h2 = k2 ? (r[k2] / max) * (H - 24) : 0
      const lbl = rows.length <= 16 || i % Math.ceil(rows.length / 12) === 0 ? `<text x="${x}" y="${H - 2}" font-size="8" text-anchor="middle" fill="${C.mute}" font-family="IBM Plex Mono">${label(r)}</text>` : ''
      return `${k2 ? `<rect x="${x - w - 0.5}" y="${H - 12 - h1}" width="${w}" height="${h1}" rx="1.5" fill="${c1}"/><rect x="${x + 0.5}" y="${H - 12 - h2}" width="${w}" height="${h2}" rx="1.5" fill="${c2}"/>` : `<rect x="${x - w / 2}" y="${H - 12 - h1}" width="${w}" height="${h1}" rx="1.5" fill="${c1}"/>`}${lbl}`
    }).join('')
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;direction:ltr"><line x1="${P}" x2="${W - P}" y1="${H - 12}" y2="${H - 12}" stroke="${C.line}"/>${bars}</svg>`
  }
  // ترتيب الأيام زمنياً من اليسار لليمين دائماً (اتجاه الزمن في المخطط)
  const T0 = model.tot

  const out = []

  // ═══ 1. نظرة عامة ═══
  if (want('summary')) {
    const busiest = [...model.stations].sort((a, b) => b.d.pax - a.d.pax)[0]
    const lowEntry = model.stations.filter(P => P.entry != null && P.entry < 80).sort((a, b) => a.entry - b.entry).slice(0, 3)
    const topMiss = [...model.stations].filter(P => P.d.missed > 0).sort(byNorm(P => P.missRate))[0]
    const ins = []
    ins.push({ c: C.dep, t: T(`ركاب المغادرة <b>${nf(T0.d.pax)}</b> على <b>${nf(T0.d.trips)}</b> رحلة${G && T0.gD != null ? ` — ${T0.gD >= 0 ? 'ارتفاع' : 'انخفاض'} <b>${Math.abs(T0.gD)}%</b> عن الفترة السابقة` : ''}.`, `Departing passengers <b>${nf(T0.d.pax)}</b> on <b>${nf(T0.d.trips)}</b> trips${G && T0.gD != null ? ` — ${T0.gD >= 0 ? 'up' : 'down'} <b>${Math.abs(T0.gD)}%</b> vs previous period` : ''}.`) })
    ins.push({ c: C.arr, t: T(`ركاب الوصول <b>${nf(T0.a.pax)}</b> على <b>${nf(T0.a.trips)}</b> رحلة${G && T0.gA != null ? ` — ${T0.gA >= 0 ? 'ارتفاع' : 'انخفاض'} <b>${Math.abs(T0.gA)}%</b>` : ''}.`, `Arriving passengers <b>${nf(T0.a.pax)}</b> on <b>${nf(T0.a.trips)}</b> trips${G && T0.gA != null ? ` — ${T0.gA >= 0 ? 'up' : 'down'} <b>${Math.abs(T0.gA)}%</b>` : ''}.`) })
    if (busiest?.d.pax && model.stations.length > 1) ins.push({ c: C.navy, t: T(`الأعلى ركاب مغادرة: <b>${esc(busiest.name)}</b> (${nf(busiest.d.pax)} راكب).`, `Most departing passengers: <b>${esc(busiest.name)}</b> (${nf(busiest.d.pax)}).`) })
    if (lowEntry.length) ins.push({ c: C.warn, t: T(`اكتمال الإدخال أقل من 80% في: ${lowEntry.map(P => `<b>${esc(P.name)}</b> (<bdi dir="ltr">${P.entry}%</bdi>)`).join('، ')}.`, `Data entry below 80%: ${lowEntry.map(P => `<b>${esc(P.name)}</b> (${P.entry}%)`).join(', ')}.`) })
    if (T0.d.missed > 0) ins.push({ c: C.bad, t: T(`المتغيبون <b>${nf(T0.d.missed)}</b> راكباً (<bdi dir="ltr">${T0.missRate}%</bdi> من ركاب المغادرة)${topMiss ? ` — أعلى نسبة غياب في <b>${esc(topMiss.name)}</b> (<bdi dir="ltr">${topMiss.missRate}%</bdi>، ${vs(topMiss.missRate, T0.missRate)} من المتوسط)` : ''}.`, `Absentees <b>${nf(T0.d.missed)}</b> (${T0.missRate}% of departing)${topMiss ? ` — highest rate at <b>${esc(topMiss.name)}</b> (${topMiss.missRate}%, ${vs(topMiss.missRate, T0.missRate)} the average)` : ''}.`) })
    if (model.sales) {
      const S = model.sales, sg = g => sgn(g, '%')
      const cmp = !G ? [] : [S.gPrev != null && T(`${sg(S.gPrev)} عن الفترة السابقة`, `${sg(S.gPrev)} vs previous`), S.gLast != null && T(`${sg(S.gLast)} عن العام الماضي`, `${sg(S.gLast)} vs last year`)].filter(Boolean)
      ins.push({ c: C.navy, t: T(`الإيرادات <b>${nf(S.rev)}</b> ر.س`, `Revenue <b>${nf(S.rev)}</b> SAR`) + (cmp.length ? ` (${cmp.join(isAr ? '، ' : ', ')})` : '') + '.' })
    }
    if (model.ops.busRepeat) ins.push({ c: C.bad, t: T(`<b>${model.ops.busRepeat}</b> حافلة تكررت عليها نفس الحالة التشغيلية — تحتاج متابعة الصيانة.`, `<b>${model.ops.busRepeat}</b> buses had a repeated operational issue.`) })
    if (model.lost) ins.push({ c: '#7C3AED', t: T(`الموجودات: <b>${nf(model.lost.found)}</b> سُلّم منها <b>${rp(model.lost.rate)}</b>، والمتبقي لدى المحطات <b>${nf(model.lost.backlog)}</b>.`, `Found items <b>${nf(model.lost.found)}</b>, delivered <b>${rp(model.lost.rate)}</b>, still held <b>${nf(model.lost.backlog)}</b>.`) })

    const cover = `<div class="cover"><div class="l"><small>${esc(T(REPORT_SUB.ar, REPORT_SUB.en)).toUpperCase()}</small><h1>${esc(T(REPORT_NAME.ar, REPORT_NAME.en))}</h1>
      <p>${esc(scopeLabel)} · <span>${esc(period)}</span></p>
      <div class="chips"><span>${model.nwb.length} ${T('محطة', 'stations')}</span>${model.agents.length ? `<span>${model.agents.length} ${T('وكيل', 'agents')}</span>` : ''}<span>${daysWord(model.days)}</span>${model.activeOnly ? `<span>${T('الورديات الفعلية فقط', 'Operating shifts only')}</span>` : ''}</div></div>
      <div class="r">
        <div><small>${T('ركاب المغادرة', 'Departing pax')}</small><b>${nf(T0.d.pax)}</b>${G ? gTxt(T0.gD) : ''}</div>
        <div><small>${T('ركاب الوصول', 'Arriving pax')}</small><b>${nf(T0.a.pax)}</b>${G ? gTxt(T0.gA) : ''}</div>
        <div><small>${T('رحلات المغادرة', 'Departure trips')}</small><b>${nf(T0.d.trips)}</b><em style="color:#AFBBCE">${T0.d.un ? T(`${nf(T0.d.un)} غير مدخلة`, `${nf(T0.d.un)} not entered`) : T('مكتملة', 'complete')}</em></div>
        <div><small>${T('رحلات الوصول', 'Arrival trips')}</small><b>${nf(T0.a.trips)}</b><em style="color:#AFBBCE">${T0.a.un ? T(`${nf(T0.a.un)} غير مدخلة`, `${nf(T0.a.un)} not entered`) : T('مكتملة', 'complete')}</em></div>
      </div></div>`
    const strip = kpis([
      { l: T('اكتمال الإدخال', 'Data entry'), v: rp(T0.entry), c: tone(T0.entry) },
      { l: T('المتغيبون', 'Missed'), v: nf(T0.d.missed), c: C.bad, s: `${T0.missRate}% ${T('من ركاب المغادرة', 'of departing')}` },
      ...(model.sales ? [{ l: T('الإيرادات (ر.س)', 'Revenue (SAR)'), v: nf(model.sales.rev), c: C.navy, s: G ? gTxt(model.sales.gPrev) : T(`${model.sales.conf}/${model.sales.n} إقفال مؤكد`, `${model.sales.conf}/${model.sales.n} confirmed`) }] : []),
      ...(model.lost ? [{ l: T('نسبة تسليم الموجودات', 'Lost-item delivery'), v: rp(model.lost.rate), c: '#7C3AED', s: T(`${nf(model.lost.backlog)} متبقٍ`, `${nf(model.lost.backlog)} held`) }] : []),
      { l: T('حالات تشغيلية', 'Operational cases'), v: nf(model.ops.facN + model.ops.incN), c: C.warn, s: model.ops.busRepeat ? `<em class="down">${model.ops.busRepeat} ${T('حافلة متكررة', 'repeat buses')}</em>` : T('بلا تكرار', 'no repeats') },
    ])
    const trend = model.daily.length > 1 ? `<div class="box"><h3>${T('الاتجاه اليومي للركاب', 'Daily passengers')}<span>${T('المغادرة والوصول منفصلان', 'departures & arrivals separate')}</span></h3>${dualBars(model.daily, 'dPax', 'aPax', C.dep, C.arr, r => dm(r.date))}
      <div class="legend"><span><i style="background:${C.dep}"></i>${T('ركاب المغادرة', 'Departing')}</span><span><i style="background:${C.arr}"></i>${T('ركاب الوصول', 'Arriving')}</span></div></div>` : ''
    // ساعات الذروة: ركاب المغادرة والوصول لكل ساعة (صفّان منفصلان)
    const H = model.hours
    const peakOf = arr => { const v = Math.max(...arr); return v > 0 ? arr.indexOf(v) : null }
    const hh = h => `${String(h).padStart(2, '0')}:00`
    const hStrip = (arr, rgb, label) => { const mx = Math.max(1, ...arr), pk = peakOf(arr); return `<div style="display:grid;grid-template-columns:78px 1fr;gap:8px;align-items:center;margin:5px 0"><span style="font-size:9.5px;font-weight:700">${label}</span>
      <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:2px;direction:ltr">${arr.map((v, h) => `<div style="height:22px;border-radius:3px;background:${v ? `rgba(${rgb},${0.1 + 0.9 * v / mx})` : '#F1F3F6'};${h === pk ? `outline:2px solid rgb(${rgb});outline-offset:1px;` : ''}"></div>`).join('')}</div></div>` }
    const top3 = arr => arr.map((v, h) => [h, v]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, v]) => `<b class="mono">${hh(h)}</b> <span style="color:${C.mute}">(${nf(v)})</span>`).join(' · ')
    const hrs = `<div style="display:grid;grid-template-columns:78px 1fr;gap:8px"><span></span><div style="display:grid;grid-template-columns:repeat(24,1fr);gap:2px;direction:ltr">${H.d.map((_, h) => `<span style="text-align:center;font-size:7.5px;color:${C.mute};font-family:'IBM Plex Mono'">${String(h).padStart(2, '0')}</span>`).join('')}</div></div>`
    const pkD = peakOf(H.d), pkA = peakOf(H.a)
    const topBox = `<div class="box"><h3>${T('ساعات الذروة', 'Peak hours')}<span>${pkD != null ? T(`ذروة المغادرة ${hh(pkD)}`, `dep peak ${hh(pkD)}`) : ''}${pkA != null ? T(` · ذروة الوصول ${hh(pkA)}`, ` · arr peak ${hh(pkA)}`) : ''}</span></h3>
      ${hStrip(H.d, '31,78,140', T('ركاب المغادرة', 'Departing'))}${hStrip(H.a, '15,122,108', T('ركاب الوصول', 'Arriving'))}${hrs}
      <div style="margin-top:8px;font-size:10px;line-height:1.9"><div><span style="color:${C.dep};font-weight:700">${T('أعلى ساعات المغادرة', 'Top departure hours')}:</span> ${top3(H.d) || '—'}</div><div><span style="color:${C.arr};font-weight:700">${T('أعلى ساعات الوصول', 'Top arrival hours')}:</span> ${top3(H.a) || '—'}</div></div></div>`
    out.push(page(T('نظرة عامة', 'Overview'), `${head(T('نظرة عامة', 'Overview'))}${cover}${strip}
      <div class="row" style="grid-template-columns:1.15fr 1fr"><div class="box"><h3>${T('أبرز الملاحظات', 'Key highlights')}</h3><ul class="ins">${ins.map(x => `<li style="--c:${x.c}"><i></i><span>${x.t}</span></li>`).join('')}</ul></div>
      <div style="display:grid;gap:12px">${trend}${topBox}</div></div>`))
  }

  // ═══ 2. أداء المحطات ═══
  if (want('stations')) {
    const tbl = (list, title) => {
      if (!list.length) return ''
      const load = (P, k) => per(P[k].pax, P[k].trips, 1)
      const rows = [...list].sort(byNorm(P => load(P, 'd')))
      const avgD = per(NET.dP, NET.dT, 1), avgA = per(NET.aP, NET.aT, 1)
      const sum = rows.reduce((t, P) => ({ dT: t.dT + P.d.trips, aT: t.aT + P.a.trips, dP: t.dP + P.d.pax, aP: t.aP + P.a.pax, m: t.m + P.d.missed, dg: t.dg + P.d.good, dr: t.dr + P.d.rated, ag: t.ag + P.a.good, ar: t.ar + P.a.rated, e: t.e + P.d.trips + P.a.trips, x: t.x + P.d.trips + P.d.un + P.a.trips + P.a.un, rev: t.rev + (P.sales?.rev || 0) }), { dT: 0, aT: 0, dP: 0, aP: 0, m: 0, dg: 0, dr: 0, ag: 0, ar: 0, e: 0, x: 0, rev: 0 })
      const hasSales = !!model.sales
      return `<div class="box" style="padding:0;overflow:hidden;margin-bottom:12px"><div style="padding:9px 12px;font-weight:700;font-size:12px;display:flex;justify-content:space-between"><span>${title}</span><span style="color:${C.mute};font-size:10px">${rows.length}</span></div>
      <table class="t"><thead><tr><th>#</th><th class="s">${T('المحطة', 'Station')}</th><th>${T('رحلات المغادرة', 'Dep. trips')}</th><th>${T('رحلات الوصول', 'Arr. trips')}</th><th>${T('ركاب المغادرة', 'Dep. pax')}</th><th>${T('ركاب الوصول', 'Arr. pax')}</th><th>${T('ركاب/رحلة مغادرة', 'Pax/dep. trip')}<span class="th2">${T('مقارنة بالمتوسط', 'vs average')}</span></th><th>${T('ركاب/رحلة وصول', 'Pax/arr. trip')}<span class="th2">${T('مقارنة بالمتوسط', 'vs average')}</span></th><th>${T('اكتمال الإدخال', 'Data entry')}</th><th>${T('المتغيبون', 'Missed')}<span class="th2">${T('% من ركاب المغادرة', '% of dep. pax')}</span></th>${hasSales ? `<th>${T('الإيرادات', 'Revenue')}</th>${G ? `<th>${T('النمو', 'Growth')}</th>` : ''}` : ''}</tr></thead>
      <tbody>${rows.map((P, i) => `<tr class="${P.idle ? 'idle' : ''}"><td class="mono" style="color:${C.mute}">${i + 1}</td><td class="s" style="font-weight:600">${esc(P.name)}</td>
        <td class="mono">${nf(P.d.trips)}${P.d.un ? `<small style="color:${C.warn}"> <bdi dir="ltr">+${P.d.un}</bdi></small>` : ''}</td><td class="mono">${nf(P.a.trips)}${P.a.un ? `<small style="color:${C.warn}"> <bdi dir="ltr">+${P.a.un}</bdi></small>` : ''}</td>
        <td class="mono" style="font-weight:700;color:${C.dep}">${nf(P.d.pax)}</td><td class="mono" style="font-weight:700;color:${C.arr}">${nf(P.a.pax)}</td>
        <td class="mono">${load(P, 'd') ?? '—'} ${vs(load(P, 'd'), avgD, false)}</td><td class="mono">${load(P, 'a') ?? '—'} ${vs(load(P, 'a'), avgA, false)}</td>
        <td>${rateBar(P.entry)}</td>
        <td class="mono" style="color:${P.d.missed ? C.bad : '#A0AABA'};font-weight:700">${P.d.missed ? `${P.d.missed} <small style="color:${C.mute};font-weight:600">(${P.missRate}%)</small>` : '—'}</td>
        ${hasSales ? `<td class="mono">${P.sales?.n ? nf(P.sales.rev) : '—'}</td>${G ? `<td>${gCell(P.sales ? growth(P.sales.rev, P.sales.prev) : null)}</td>` : ''}` : ''}</tr>`).join('')}
        <tr class="tot"><td></td><td class="s">${T('الإجمالي', 'Total')}</td><td class="mono">${nf(sum.dT)}</td><td class="mono">${nf(sum.aT)}</td><td class="mono">${nf(sum.dP)}</td><td class="mono">${nf(sum.aP)}</td><td class="mono">${per(sum.dP, sum.dT, 1) ?? '—'}</td><td class="mono">${per(sum.aP, sum.aT, 1) ?? '—'}</td><td class="mono">${rp(pct(sum.e, sum.x))}</td><td class="mono">${nf(sum.m)}</td>${hasSales ? `<td class="mono">${nf(sum.rev)}</td>${G ? '<td></td>' : ''}` : ''}</tr>
      </tbody></table></div>`
    }
    out.push(page(T('أداء المحطات', 'Station performance'), `${head(T('أداء المحطات', 'Station performance'), T('مرتبة حسب متوسط ركاب رحلة المغادرة', 'ranked by passengers per departure'))}
      ${tbl(model.nwb, T('محطات نورث وست', 'North West stations'))}${tbl(model.agents, T('محطات الوكلاء', 'Agent stations'))}
      <div class="note">${vsNote}<br>${T(`الرقم الأصفر «+n» بجانب الرحلات = رحلات مجدولة لم تُدخل. اكتمال الإدخال = الرحلات المُدخلة من المجدولة.${G ? ' النمو = الإيرادات مقارنة بالفترة السابقة بنفس عدد الأيام.' : ''}`, `Amber “+n” = scheduled trips not entered. Data entry = entered out of scheduled.${G ? ' Growth = revenue vs the previous period of equal length.' : ''}`)}</div>`))
  }

  // ═══ 3. المبيعات ═══
  if (want('sales') && model.sales) {
    const S = model.sales
    const rpp = P => per(P.sales.rev, P.d.pax, 1)
    const avgRpp = per(S.rev, NET.dP, 1)
    const rows = model.stations.filter(P => P.sales && (P.sales.n || (G && (P.sales.prev || P.sales.last)))).sort(byNorm(rpp))
    const maxR = Math.max(1, ...rows.map(P => P.sales.rev))
    const rises = G ? rows.map(P => ({ P, g: growth(P.sales.rev, P.sales.prev) })).filter(x => x.g != null) : []
    const up = [...rises].sort((a, b) => b.g - a.g)[0], down = [...rises].sort((a, b) => a.g - b.g)[0]
    out.push(page(T('المبيعات', 'Sales'), `${head(T('المبيعات', 'Sales'), !G ? '' : T(`مقارنة بالفترة السابقة (${dmy(S.pFrom)} – ${dmy(S.pTo)}) ونفس الفترة من العام الماضي (${dmy(S.lyFrom)} – ${dmy(S.lyTo)})`, `vs previous period (${dmy(S.pFrom)} – ${dmy(S.pTo)}) and same period last year (${dmy(S.lyFrom)} – ${dmy(S.lyTo)})`))}
      ${kpis([
        { l: T('الإيرادات الفعلية (ر.س)', 'Actual revenue (SAR)'), v: nf(S.rev), c: C.navy },
        ...(!G ? [] : [{ l: T('مقابل الفترة السابقة', 'vs previous period'), v: S.gPrev == null ? '—' : sgn(S.gPrev, '%'), c: S.gPrev == null ? C.mute : S.gPrev >= 0 ? C.good : C.bad, s: T(`كانت ${nf(S.prev)}`, `was ${nf(S.prev)}`) },
        { l: T('مقابل العام الماضي', 'vs last year'), v: S.gLast == null ? '—' : sgn(S.gLast, '%'), c: S.gLast == null ? C.mute : S.gLast >= 0 ? C.good : C.bad, s: S.hasLast ? T(`كانت ${nf(S.last)}`, `was ${nf(S.last)}`) : T('لا بيانات للعام الماضي', 'no data last year') }]),
        { l: T('المتوقع (ر.س)', 'Expected (SAR)'), v: nf(S.exp), c: C.ink2 },
        { l: T('الفرق (عجز/زيادة)', 'Surplus / deficit'), v: `<bdi dir="ltr">${S.diff >= 0 ? '+' : ''}${nf(S.diff)}</bdi>`, c: S.diff >= 0 ? C.good : C.bad },
        { l: T('الإقفالات المؤكدة', 'Confirmed closings'), v: `${S.conf}/${S.n}`, c: C.warn, s: rp(pct(S.conf, S.n)) },
      ])}
      <div class="row" style="grid-template-columns:1fr 1fr">
        ${model.daily.length > 1 ? `<div class="box"><h3>${T('الإيرادات اليومية', 'Daily revenue')}<span>${T('ر.س', 'SAR')}</span></h3>${dualBars(model.daily, 'rev', null, C.navy, null, r => dm(r.date))}</div>` : ''}
        <div class="box"><h3>${T('قراءة سريعة', 'Quick read')}</h3><ul class="ins">
          ${(() => { const t = [...rows].sort((a, b) => b.sales.rev - a.sales.rev)[0]; return t ? `<li style="--c:${C.navy}"><i></i><span>${T('الأعلى إيراداً', 'Top revenue')}: <b>${esc(t.name)}</b> — ${nf(t.sales.rev)} ${T('ر.س', 'SAR')} (${pct(t.sales.rev, S.rev)}% ${T('من الإجمالي', 'of total')})</span></li>` : '' })()}
          ${rows[0] && rpp(rows[0]) != null ? `<li style="--c:${C.good}"><i></i><span>${T('الأعلى إيراداً لكل راكب', 'Highest revenue per passenger')}: <b>${esc(rows[0].name)}</b> — ${rpp(rows[0])} ${T('ر.س', 'SAR')} ${vs(rpp(rows[0]), avgRpp, false)}</span></li>` : ''}
          ${up && up.g > 0 ? `<li style="--c:${C.good}"><i></i><span>${T('أعلى ارتفاع', 'Biggest rise')}: <b>${esc(up.P.name)}</b> ${sgn(up.g, '%')}</span></li>` : ''}
          ${down && down.g < 0 ? `<li style="--c:${C.bad}"><i></i><span>${T('أكبر انخفاض', 'Biggest drop')}: <b>${esc(down.P.name)}</b> ${sgn(down.g, '%')}</span></li>` : ''}
          ${S.n - S.conf > 0 ? `<li style="--c:${C.warn}"><i></i><span>${T(`${S.n - S.conf} إقفال بانتظار التأكيد`, `${S.n - S.conf} closings awaiting confirmation`)}</span></li>` : ''}
        </ul></div></div>
      ${rows.length ? `<table class="t"><thead><tr><th>#</th><th class="s">${T('المحطة', 'Station')}</th><th>${T('الإيرادات', 'Revenue')}</th><th>${T('الحصة', 'Share')}</th><th>${T('الإيراد لكل راكب مغادر', 'Revenue / dep. pax')}<span class="th2">${T('ر.س · مقارنة بالمتوسط', 'SAR · vs average')}</span></th>${G ? `<th>${T('الفترة السابقة', 'Previous')}</th><th>${T('التغير', 'Change')}</th><th>${T('العام الماضي', 'Last year')}</th><th>${T('التغير', 'Change')}</th>` : ''}<th>${T('الفرق', 'Diff')}</th><th>${T('مؤكدة', 'Confirmed')}</th></tr></thead><tbody>
        ${rows.map((P, i) => `<tr><td class="mono" style="color:${C.mute}">${i + 1}</td><td class="s" style="font-weight:600">${esc(P.name)}${P.agent ? `<span class="tag ag">${T('وكيل', 'Agent')}</span>` : ''}</td>
          <td><div class="bar"><span><i style="width:${P.sales.rev / maxR * 100}%;background:${C.navy}"></i></span><b>${nf(P.sales.rev)}</b></div></td><td class="mono">${pct(P.sales.rev, S.rev) ?? 0}%</td><td class="mono">${rpp(P) ?? '—'} ${vs(rpp(P), avgRpp, false)}</td>
          ${G ? `<td class="mono" style="color:${C.mute}">${nf(P.sales.prev)}</td><td>${gCell(growth(P.sales.rev, P.sales.prev))}</td>
          <td class="mono" style="color:${C.mute}">${P.sales.last ? nf(P.sales.last) : '—'}</td><td>${gCell(growth(P.sales.rev, P.sales.last))}</td>` : ''}
          <td class="mono" style="color:${P.sales.diff >= 0 ? C.good : C.bad}"><bdi dir="ltr">${P.sales.diff >= 0 ? '+' : ''}${nf(P.sales.diff)}</bdi></td><td class="mono">${P.sales.conf}/${P.sales.n}</td></tr>`).join('')}
        <tr class="tot"><td></td><td class="s">${T('الإجمالي', 'Total')}</td><td class="mono">${nf(S.rev)}</td><td>100%</td><td class="mono">${avgRpp ?? '—'}</td>${G ? `<td class="mono">${nf(S.prev)}</td><td class="mono">${S.gPrev == null ? '—' : sgn(S.gPrev, '%')}</td><td class="mono">${S.hasLast ? nf(S.last) : '—'}</td><td class="mono">${S.gLast == null ? '—' : sgn(S.gLast, '%')}</td>` : ''}<td class="mono"><bdi dir="ltr">${S.diff >= 0 ? '+' : ''}${nf(S.diff)}</bdi></td><td class="mono">${S.conf}/${S.n}</td></tr>
      </tbody></table>` : `<div class="empty">${T('لا توجد مبيعات مسجلة في هذه الفترة', 'No sales recorded in this period')}</div>`}
      <div class="note">${vsNote}<br>${G ? T('نسبة الارتفاع = (إيرادات الفترة − إيرادات المقارنة) ÷ إيرادات المقارنة. الفترة السابقة بنفس عدد الأيام مباشرة قبل الفترة المحددة.', 'Growth = (period − baseline) ÷ baseline. Previous period has the same number of days immediately before.') : T('الحصة = إيرادات المحطة ÷ إجمالي الإيرادات.', 'Share = station revenue ÷ total revenue.')}${model.activeOnly ? T(' إقفالات الورديات المتوقفة غير محسوبة.', ' Stopped-shift closings excluded.') : ''}</div>`))
  }

  // ═══ 4. المتغيبون ═══
  if (want('missed')) {
    const M = model.missed
    const peakH = M.byHour.indexOf(Math.max(...M.byHour))
    const maxH = Math.max(1, ...M.byHour)
    const heat = `<div style="display:grid;grid-template-columns:repeat(24,1fr);gap:2px;direction:ltr">${M.byHour.map((v, h) => `<div style="text-align:center"><div style="height:34px;border-radius:3px;background:${v ? `rgba(185,28,28,${0.12 + 0.88 * v / maxH})` : '#F1F3F6'};display:grid;place-items:center;color:${v / maxH > 0.5 ? '#fff' : C.ink};font-family:'IBM Plex Mono';font-size:9px;font-weight:700">${v || ''}</div><div style="font-size:8px;color:${C.mute};margin-top:2px;font-family:'IBM Plex Mono'">${String(h).padStart(2, '0')}</div></div>`).join('')}</div>`
    const WD = isAr ? WD_AR : WD_EN, maxW = Math.max(1, ...M.byWd)
    const wdBars = [6, 0, 1, 2, 3, 4, 5].map(i => `<div style="display:grid;grid-template-columns:62px 1fr;gap:8px;align-items:center;margin:4px 0;font-size:10px"><span style="font-weight:600">${WD[i]}</span><div class="bar"><span><i style="width:${M.byWd[i] / maxW * 100}%;background:${C.bad}"></i></span><b>${M.byWd[i]}</b></div></div>`).join('')
    const stRows = model.stations.filter(P => P.d.missed > 0).sort(byNorm(P => P.missRate))
    const per100 = P => per(P.d.missed, P.d.trips, 100)
    const avg100 = per(M.total, NET.dT, 100)
    const body = M.total === 0 ? `<div class="empty" style="padding:30px;border-color:#86EFAC;color:${C.good}">${T('لا يوجد متغيبون في هذه الفترة — التزام كامل بالرحلات', 'No missed passengers in this period')}</div>` : `
      ${kpis([
        { l: T('إجمالي المتغيبين', 'Total missed'), v: nf(M.total), c: C.bad, s: G ? gTxtInv(M.g) : '' },
        { l: T('نسبة الغياب', 'Missed rate'), v: `${M.rate}%`, c: M.rate > 3 ? C.bad : M.rate > 1 ? C.warn : C.good, s: T('من ركاب المغادرة', 'of departing pax') },
        { l: T('رحلات فيها غياب', 'Trips with missed'), v: nf(M.trips), c: C.warn, s: T(`من ${nf(M.depTrips)} رحلة مغادرة`, `of ${nf(M.depTrips)} departures`) },
        { l: T('متوسط لكل رحلة متأثرة', 'Avg per affected trip'), v: M.avg, c: C.ink2 },
        { l: T('ساعة الذروة', 'Peak hour'), v: M.byHour[peakH] ? `${String(peakH).padStart(2, '0')}:00` : '—', c: C.bad, s: M.byHour[peakH] ? T(`${M.byHour[peakH]} متغيب`, `${M.byHour[peakH]} missed`) : '' },
        { l: T('التذاكر المسجلة', 'Tickets logged'), v: nf(M.tickets.length), c: C.navy, s: T('مرتبطة برقم الرحلة', 'linked to trip') },
      ])}
      <div class="box" style="margin-bottom:12px"><h3>${T('ساعات ذروة الغياب', 'Peak hours of missed passengers')}<span>${T('حسب موعد المغادرة — كلما غمق اللون زاد العدد', 'by scheduled departure — darker = more')}</span></h3>${heat}</div>
      <div class="box" style="padding:0;overflow:hidden;margin-bottom:12px"><div style="padding:9px 12px;font-weight:700;font-size:12px">${T('حسب المحطة', 'By station')} <span style="color:${C.mute};font-weight:600;font-size:10px">${T('— مرتبة بنسبة الغياب لا بالعدد', '— ranked by rate, not count')}</span></div>
        <table class="t"><thead><tr><th>#</th><th class="s">${T('المحطة', 'Station')}</th><th>${T('المتغيبون', 'Missed')}</th><th>${T('رحلات المغادرة', 'Dep. trips')}</th><th>${T('ركاب المغادرة', 'Dep. pax')}</th><th>${T('النسبة من الركاب', '% of pax')}<span class="th2">${T('مقارنة بالمتوسط', 'vs average')}</span></th><th>${T('لكل 100 رحلة', 'Per 100 trips')}<span class="th2">${T('مقارنة بالمتوسط', 'vs average')}</span></th></tr></thead><tbody>
        ${stRows.map((P, i) => `<tr><td class="mono" style="color:${C.mute}">${i + 1}</td><td class="s" style="font-weight:600">${esc(P.name)}${P.agent ? `<span class="tag ag">${T('وكيل', 'Agent')}</span>` : ''}</td><td class="mono" style="color:${C.bad};font-weight:700">${P.d.missed}</td><td class="mono">${nf(P.d.trips)}</td><td class="mono">${nf(P.d.pax)}</td><td class="mono">${P.missRate}% ${vs(P.missRate, M.rate)}</td><td class="mono">${per100(P) ?? '—'} ${vs(per100(P), avg100)}</td></tr>`).join('')}
        <tr class="tot"><td></td><td class="s">${T('الإجمالي', 'Total')}</td><td class="mono">${nf(M.total)}</td><td class="mono">${nf(NET.dT)}</td><td class="mono">${nf(NET.dP)}</td><td class="mono">${M.rate}%</td><td class="mono">${avg100 ?? '—'}</td></tr></tbody></table></div>
      <div class="row" style="grid-template-columns:1fr 1.4fr">
        <div class="box"><h3>${T('حسب يوم الأسبوع', 'By weekday')}</h3>${wdBars}</div>
        <div class="box"><h3>${T('الرحلات الأكثر غياباً', 'Trips with most missed')}</h3><table class="t"><thead><tr><th class="s">${T('الرحلة', 'Trip')}</th><th class="s">${T('المحطة → الوجهة', 'Station → to')}</th><th>${T('الموعد', 'Time')}</th><th>${T('مرات', 'Times')}</th><th>${T('النسبة', 'Rate')}</th><th>${T('متغيبون', 'Missed')}</th></tr></thead><tbody>
          ${M.topTrips.slice(0, 8).map(r => `<tr><td class="s mono" style="font-weight:700">${esc(r.trip)}</td><td class="s" style="font-size:9.5px">${esc(r.station)} ← ${esc(r.to)}</td><td class="mono">${esc(r.sched || '—')}</td><td class="mono">${r.times}</td><td class=\"mono\" style=\"color:${C.mute}\">${(r.pax + r.missed) ? Math.round(r.missed / (r.pax + r.missed) * 1000) / 10 : 0}%</td><td class="mono" style="color:${C.bad};font-weight:700">${r.missed}</td></tr>`).join('')}</tbody></table></div>
      </div>
      ${opts.tickets && M.tickets.length ? `<div class="box"><h3>${T('سجل التذاكر', 'Ticket log')}<span>${M.tickets.length}</span></h3><div style="columns:4;column-gap:14px;font-size:9.5px">${M.tickets.map(t => `<div style="break-inside:avoid;padding:2px 0;border-bottom:1px dotted ${C.line}"><b class="mono">${esc(t.ticket)}</b> <span style="color:${C.mute}">· ${esc(t.trip)} · ${dm(t.date)} · ${esc(t.station)}</span></div>`).join('')}</div></div>` : ''}`
    out.push(page(T('المتغيبون عن الرحلات', 'Missed passengers'), `${head(T('المتغيبون عن الرحلات', 'Missed passengers'), G && M.prev ? T(`الفترة السابقة: ${nf(M.prev)}`, `previous period: ${nf(M.prev)}`) : '')}${body}${M.total ? `<div class="note">${vsNote}</div>` : ''}`))
  }

  // ═══ 5. الحالة التشغيلية ═══
  if (want('ops')) {
    const O = model.ops
    const mark = r => `${r.sameDay > 1 ? `<span class="rep day">↻ ×${r.sameDay} ${T('بنفس اليوم', 'same day')}</span>` : ''}${r.histDays > 1 ? `<span class="rep">↻ ${T(`متكرر منذ ${dm(r.since)} · ${r.histDays} أيام`, `since ${dm(r.since)} · ${r.histDays} days`)}</span>` : ''}`
    const tbl = (list, title, color) => (list.length ? `<div class="box" style="padding:0;overflow:hidden;margin-bottom:12px"><div style="padding:9px 12px;font-weight:700;font-size:12px;border-inline-start:4px solid ${color}">${title} <span style="color:${C.mute};font-weight:600">(${list.reduce((s, r) => s + r.n, 0)})</span></div>
      <table class="t"><thead><tr><th class="s">${T('رقم الحافلة', 'Bus')}</th><th class="s">${T('الحالة', 'Issue')}</th><th>${T('مرات بالفترة', 'Times')}</th><th class="s">${T('التواريخ', 'Dates')}</th><th class="s">${T('المحطات', 'Stations')}</th><th class="s">${T('الرحلات', 'Trips')}</th></tr></thead><tbody>
      ${list.map(r => `<tr><td class="s"><span class="bus">${esc(r.bus)}</span>${mark(r)}</td><td class="s" style="font-weight:600">${esc(r.what)}</td><td class="mono" style="font-weight:700">${r.n}</td>
        <td class="s mono" style="font-size:9.5px">${r.dates.map(dm).join('، ')}</td><td class="s" style="font-size:9.5px">${r.stations.map(esc).join('، ')}</td><td class="s mono" style="font-size:9.5px">${r.trips.slice(0, 6).map(esc).join(' · ')}${r.trips.length > 6 ? ' …' : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '')
    out.push(page(T('الحالة التشغيلية', 'Operational status'), `${head(T('الحالة التشغيلية', 'Operational status'), T('أعطال تجهيزات الحافلات وحالات التشغيل', 'Bus equipment faults and operating incidents'))}
      ${kpis([
        { l: T('أعطال التجهيزات', 'Equipment faults'), v: nf(O.facN), c: C.warn },
        { l: T('حالات تشغيلية', 'Operating incidents'), v: nf(O.incN), c: C.bad },
        { l: T('حافلات متأثرة', 'Buses affected'), v: nf(O.buses), c: C.ink2 },
        { l: T('حافلات متكررة', 'Repeat buses'), v: nf(O.busRepeat), c: C.bad, s: T('نفس الحالة أكثر من مرة', 'same issue more than once') },
      ])}
      ${!O.fac.length && !O.inc.length ? `<div class="empty" style="padding:30px;border-color:#86EFAC;color:${C.good}">${T('لا توجد أعطال أو حالات تشغيلية مسجلة — جميع التجهيزات تعمل', 'No faults or incidents recorded')}</div>` : ''}
      ${(() => {
        const rows = model.stations.filter(P => P.faults > 0).sort(byNorm(P => per(P.faults, P.d.trips + P.a.trips, 100)))
        if (!rows.length) return ''
        const allF = rows.reduce((t, P) => t + P.faults, 0), avg = per(allF, NET.dT + NET.aT, 100)
        return `<div class="box" style="padding:0;overflow:hidden;margin-bottom:12px"><div style="padding:9px 12px;font-weight:700;font-size:12px">${T('حسب المحطة', 'By station')} <span style="color:${C.mute};font-weight:600;font-size:10px">${T('— مرتبة بعدد الحالات لكل 100 رحلة', '— ranked by cases per 100 trips')}</span></div>
        <table class="t"><thead><tr><th>#</th><th class="s">${T('المحطة', 'Station')}</th><th>${T('الحالات', 'Cases')}</th><th>${T('الرحلات', 'Trips')}</th><th>${T('لكل 100 رحلة', 'Per 100 trips')}<span class="th2">${T('مقارنة بالمتوسط', 'vs average')}</span></th></tr></thead><tbody>
        ${rows.map((P, i) => { const v = per(P.faults, P.d.trips + P.a.trips, 100); return `<tr><td class="mono" style="color:${C.mute}">${i + 1}</td><td class="s" style="font-weight:600">${esc(P.name)}${P.agent ? `<span class="tag ag">${T('وكيل', 'Agent')}</span>` : ''}</td><td class="mono" style="font-weight:700">${P.faults}</td><td class="mono">${nf(P.d.trips + P.a.trips)}</td><td class="mono">${v ?? '—'} ${vs(v, avg)}</td></tr>` }).join('')}
        <tr class="tot"><td></td><td class="s">${T('الإجمالي', 'Total')}</td><td class="mono">${nf(allF)}</td><td class="mono">${nf(NET.dT + NET.aT)}</td><td class="mono">${avg ?? '—'}</td></tr></tbody></table></div>`
      })()}
      ${tbl(O.fac, T('أعطال تجهيزات الحافلات', 'Bus equipment faults'), C.warn)}${tbl(O.inc, T('حالات التشغيل غير الطبيعية', 'Non-normal operating status'), C.bad)}
      <div class="legend"><span><span class="rep day" style="margin:0">↻ ×2 ${T('بنفس اليوم', 'same day')}</span> ${T('تكررت على الحافلة أكثر من مرة في اليوم نفسه', 'repeated on the same day')}</span><span><span class="rep" style="margin:0">↻ ${T('متكرر منذ', 'since')}</span> ${T('ظهرت على الحافلة في أكثر من يوم خلال آخر 30 يوماً (على مستوى الشبكة)', 'seen on more than one day within the last 30 days (network-wide)')}</span></div>`))
  }

  // ═══ 6. الموجودات ═══
  if (want('lost') && model.lost) {
    const L = model.lost
    const k1 = P => per(P.lost.found, P.d.pax + P.a.pax, 1000)
    const avgK = per(L.found, NET.dP + NET.aP, 1000)
    const rows = model.stations.filter(P => P.lost && (P.lost.found || P.lost.backlog || P.lost.reports)).sort(byNorm(k1))
    const topF = rows.filter(P => P.lost.found)[0], topB = [...rows].sort((a, b) => b.lost.backlog - a.lost.backlog)[0]
    const ring = (v, c) => `<div style="width:92px;height:92px;border-radius:50%;background:conic-gradient(${c} ${v ?? 0}%,#E8ECF2 0);display:grid;place-items:center;margin:auto"><div style="width:70px;height:70px;border-radius:50%;background:#fff;display:grid;place-items:center;font-family:'IBM Plex Mono';font-weight:700;font-size:18px">${rp(v)}</div></div>`
    out.push(page(T('الموجودات والمفقودات', 'Lost & found'), `${head(T('الموجودات والمفقودات', 'Lost & found'))}
      <div class="row" style="grid-template-columns:200px 1fr">
        <div class="box" style="text-align:center"><h3 style="justify-content:center">${T('نسبة التسليم', 'Delivery rate')}</h3>${ring(L.rate, tone(L.rate))}<div style="font-size:10px;color:${C.mute};margin-top:8px">${T(`${nf(L.claimed)} من ${nf(L.found)} سُلّمت لأصحابها`, `${nf(L.claimed)} of ${nf(L.found)} returned`)}</div></div>
        <div>${kpis([
          { l: T('موجودات مسجلة', 'Items found'), v: nf(L.found), c: C.navy },
          { l: T('سُلّمت للعملاء', 'Returned'), v: nf(L.claimed), c: C.good },
          { l: T('لم تُستلم (من الفترة)', 'Unclaimed (period)'), v: nf(L.unclaimed), c: C.warn },
          { l: T('تبرع / إتلاف', 'Donated / disposed'), v: nf(L.donated), c: C.ink2 },
        ])}${kpis([
          { l: T('المتبقي لدى المحطات (كل الفترات)', 'Still held at stations (all time)'), v: nf(L.backlog), c: '#7C3AED', s: L.oldBacklog ? T(`${nf(L.oldBacklog)} منها أقدم من 30 يوماً`, `${nf(L.oldBacklog)} older than 30 days`) : '' },
          { l: T('بلاغات مفقودات من العملاء', 'Customer lost reports'), v: nf(L.reports), c: C.bad },
          { l: T('الأعلى موجودات نسبةً للركاب', 'Most items per passenger'), v: topF?.lost.found ? esc(topF.name) : '—', c: C.navy, s: topF?.lost.found ? T(`${topF.lost.found} غرض · ${k1(topF)} لكل 1000 راكب`, `${topF.lost.found} items · ${k1(topF)} per 1,000 pax`) : '' },
          { l: T('الأعلى متبقياً', 'Most held'), v: topB?.lost.backlog ? esc(topB.name) : '—', c: '#7C3AED', s: topB?.lost.backlog ? T(`${topB.lost.backlog} غرض`, `${topB.lost.backlog} items`) : '' },
        ])}</div></div>
      ${rows.length ? `<table class="t"><thead><tr><th>#</th><th class="s">${T('المحطة', 'Station')}</th><th>${T('موجودات', 'Found')}</th><th>${T('لكل 1000 راكب', 'Per 1,000 pax')}<span class="th2">${T('مقارنة بالمتوسط', 'vs average')}</span></th><th>${T('سُلّمت', 'Returned')}</th><th>${T('نسبة التسليم', 'Delivery rate')}</th><th>${T('لم تُستلم', 'Unclaimed')}</th><th>${T('تبرع/إتلاف', 'Donated')}</th><th>${T('المتبقي حالياً', 'Held now')}</th><th>${T('بلاغات المفقودات', 'Lost reports')}</th></tr></thead><tbody>
        ${rows.map((P, i) => `<tr><td class="mono" style="color:${C.mute}">${i + 1}</td><td class="s" style="font-weight:600">${esc(P.name)}${P.agent ? `<span class="tag ag">${T('وكيل', 'Agent')}</span>` : ''}</td><td class="mono" style="font-weight:700">${P.lost.found}</td><td class=\"mono\">${k1(P) ?? '—'} ${vs(k1(P), avgK)}</td><td class="mono" style="color:${C.good}">${P.lost.claimed}</td><td>${rateBar(pct(P.lost.claimed, P.lost.found))}</td><td class="mono" style="color:${C.warn}">${P.lost.unclaimed}</td><td class="mono">${P.lost.donated}</td><td class="mono" style="font-weight:700;color:#7C3AED">${P.lost.backlog}</td><td class="mono">${P.lost.reports}</td></tr>`).join('')}
        <tr class="tot"><td></td><td class="s">${T('الإجمالي', 'Total')}</td><td class="mono">${nf(L.found)}</td><td class="mono">${avgK ?? '—'}</td><td class="mono">${nf(L.claimed)}</td><td class="mono">${rp(L.rate)}</td><td class="mono">${nf(L.unclaimed)}</td><td class="mono">${nf(L.donated)}</td><td class="mono">${nf(L.backlog)}</td><td class="mono">${nf(L.reports)}</td></tr></tbody></table>`
        : `<div class="empty">${T('لا توجد موجودات أو مفقودات في هذه الفترة', 'No lost & found activity in this period')}</div>`}
      <div class="note">${vsNote}<br>${T('نسبة التسليم = ما سُلّم لأصحابه ÷ ما سُجّل خلال الفترة. «المتبقي حالياً» = كل الأغراض غير المستلمة الموجودة في المحطة الآن بغض النظر عن تاريخها.', 'Delivery rate = returned ÷ found in the period. “Held now” = every unclaimed item currently at the station regardless of date.')}</div>`))
  }

  // ═══ 7. كشوف المحطات ═══
  const sheetPages = []
  if (want('sheets')) {
    const multiDay = model.from !== model.to
    const list = (sheetIds?.length ? sheetIds : model.stations.map(P => P.id)).map(id => model.stations.find(P => P.id === id)).filter(Boolean)
    const kColor = m => (m.un ? '#F59E0B' : m.dir === 'd' ? C.dep : C.arr)
    const cell = (m, isDep) => {
      if (!m) return '<td></td>'.repeat(isDep ? 7 : 6)
      const u = m.un ? ' u' : ''
      return `<td class="trip${u}" style="--k:${kColor(m)}">${multiDay ? `<small>${dm(m.date)}</small>` : ''}${esc(m.trip)}</td><td class="n${u}">${esc(m.bus || '')}</td><td class="pl${u}">${esc(m.other)}</td><td class="n${u}" style="color:${C.mute}">${esc(m.sched || '—')}</td>`
        + `<td class="n${u}" style="font-weight:700">${m.un ? T('غير مدخلة', 'not entered') : esc(m.act || '—')}</td><td class="n${u}" style="font-weight:700">${m.un ? '' : m.pax}</td>${isDep ? `<td class="n${u}" style="color:${C.bad};font-weight:700">${m.missed || ''}</td>` : ''}`
    }
    const colsA = `<col style="width:10.5%"><col style="width:6%"><col style="width:14%"><col style="width:5.5%"><col style="width:6%"><col style="width:5%">`
    const colsD = colsA + '<col style="width:4%">'
    list.forEach(P => {
      const mv = model.moves.filter(m => m.sid === P.id)
      const keep = m => !m.un || opts.withUnentered
      const deps = mv.filter(m => m.dir === 'd' && keep(m)), arrs = mv.filter(m => m.dir === 'a' && keep(m))
      const unD = mv.filter(m => m.dir === 'd' && m.un), unA = mv.filter(m => m.dir === 'a' && m.un)
      const n = Math.max(deps.length, arrs.length)
      const hdr = `<div class="sh"><b>${esc(P.name)}</b>${P.agent ? `<span class="tag ag">${T('وكيل', 'Agent')}</span>` : ''}<span class="sp"></span>
        <div class="m"><span>${T('مغادرة', 'Dep')}<b>${P.d.trips}</b></span><span>${T('ركاب', 'Pax')}<b>${nf(P.d.pax)}</b></span><span style="opacity:.35">|</span>
        <span>${T('وصول', 'Arr')}<b>${P.a.trips}</b></span><span>${T('ركاب', 'Pax')}<b>${nf(P.a.pax)}</b></span><span style="opacity:.35">|</span>
        <span>${T('متغيبون', 'Missed')}<b>${P.d.missed}</b></span><span>${T('الإدخال', 'Entry')}<b>${rp(P.entry)}</b></span></div></div>`
      let body
      if (!opts.details) {
        body = ''
      } else if (!n) {
        body = `<div class="empty">${T('لا توجد رحلات منفذة لهذه المحطة في الفترة', 'No executed trips for this station in the period')}</div>`
      } else {
        const rows = Array.from({ length: n }, (_, i) => `<tr>${cell(deps[i], true)}<td class="gap"></td>${cell(arrs[i], false)}</tr>`).join('')
        body = `<table class="pair"><colgroup>${colsD}<col style="width:1.5%">${colsA}</colgroup><thead>
          <tr><th class="hd d" colspan="7">↗ ${T('المغادرة', 'Departures')} · ${deps.length}</th><th class="gap"></th><th class="hd a" colspan="6">↙ ${T('الوصول', 'Arrivals')} · ${arrs.length}</th></tr>
          <tr><th>${T('الرحلة', 'Trip')}</th><th>${T('الحافلة', 'Bus')}</th><th>${T('إلى', 'To')}</th><th>${T('المجدول', 'Sched')}</th><th>${T('الفعلي', 'Actual')}</th><th>${T('ركاب', 'Pax')}</th><th>${T('متغيب', 'Miss')}</th><th class="gap"></th>
          <th>${T('الرحلة', 'Trip')}</th><th>${T('الحافلة', 'Bus')}</th><th>${T('من', 'From')}</th><th>${T('المجدول', 'Sched')}</th><th>${T('الفعلي', 'Actual')}</th><th>${T('ركاب', 'Pax')}</th></tr></thead><tbody>${rows}</tbody></table>`
      }
      const unList = !opts.withUnentered && opts.details && (unD.length || unA.length)
        ? `<div class="unl">${unD.length ? `<b>${T('مغادرة غير مدخلة', 'Departures not entered')} (${unD.length}):</b> ${unD.slice(0, 40).map(m => `<span>${esc(m.trip)} · ${esc(m.sched)}${multiDay ? ' · ' + dm(m.date) : ''}</span>`).join('')}${unD.length > 40 ? ' …' : ''}<br>` : ''}${unA.length ? `<b>${T('وصول غير مدخل', 'Arrivals not entered')} (${unA.length}):</b> ${unA.slice(0, 40).map(m => `<span>${esc(m.trip)} · ${esc(m.sched)}${multiDay ? ' · ' + dm(m.date) : ''}</span>`).join('')}${unA.length > 40 ? ' …' : ''}` : ''}</div>` : ''
      const legend = opts.details && n && opts.withUnentered ? `<div class="legend"><span><i style="background:#F59E0B"></i>${T('غير مدخلة', 'Not entered')}</span></div>` : ''
      sheetPages.push({ P, idle: !mv.length, html: `<div class="stn${n <= 22 ? ' small' : ''}${opts.pagePer ? ' own' : ''}">${hdr}${body}${unList}${legend}</div>` })
    })
    if (sheetPages.length) {
      const idle = sheetPages.filter(x => x.idle)
      const idleNote = idle.length ? `<div class="note" style="margin-top:0">${T('محطات بلا رحلات مجدولة أو منفذة في الفترة', 'Stations with no scheduled or executed trips')} (${idle.length}): ${idle.map(x => `<b>${esc(x.P.name)}</b>`).join(T('، ', ', '))}</div>` : ''
      const live = sheetPages.filter(x => !x.idle)
      // المحطات تتتابع في نفس الصفحة (القصيرة لا تنقسم) لتقليل عدد الأوراق، أو صفحة مستقلة لكل محطة عند الطلب
      if (opts.details) out.push(page(T('كشوف المحطات', 'Station sheets'), `${head(T('كشوف المحطات', 'Station sheets'), T('المغادرة والوصول متقابلان', 'departures & arrivals side by side'))}${idleNote}${live.map(x => x.html).join('')}`))
      else {
        // بدون تفاصيل: بطاقات مختصرة، عدة محطات في الصفحة
        const cards = sheetPages.map(({ P }) => `<div class="card"><div class="h"><b>${esc(P.name)}</b>${P.agent ? `<span class="tag ag">${T('وكيل', 'Agent')}</span>` : ''}</div>
          <div class="g"><div><small>${T('رحلات مغادرة', 'Dep trips')}</small><b style="color:${C.dep}">${P.d.trips}</b></div><div><small>${T('ركاب مغادرة', 'Dep pax')}</small><b style="color:${C.dep}">${nf(P.d.pax)}</b></div><div><small>${T('رحلات وصول', 'Arr trips')}</small><b style="color:${C.arr}">${P.a.trips}</b></div><div><small>${T('ركاب وصول', 'Arr pax')}</small><b style="color:${C.arr}">${nf(P.a.pax)}</b></div></div>
          <div style="margin-top:8px;font-size:9px;color:${C.mute}">${T('اكتمال الإدخال', 'Data entry')}${rateBar(P.entry)}</div>
          ${P.d.missed ? `<div style="margin-top:6px;font-size:9.5px;color:${C.bad};font-weight:600">${T('المتغيبون', 'Missed')}: ${P.d.missed}</div>` : ''}</div>`)
        for (let i = 0; i < cards.length; i += 8) out.push(page(T('كشوف المحطات', 'Station sheets'), `${i === 0 ? head(T('كشوف المحطات', 'Station sheets'), T('ملخص لكل محطة بدون تفاصيل الرحلات', 'per-station summary without trip detail')) : ''}<div class="cards">${cards.slice(i, i + 8).join('')}</div>`))
      }
    }
  }
  return { pages: out, sheetPages, page, top, foot }
}

// نافذة المعاينة: شريط علوي (طباعة، ألوان/أبيض وأسود) ثم الصفحات
export function openExecPreview(pagesHtml, title, isAr = true, win = null) {
  const w = win || window.open('', '_blank')
  if (!w) return false
  const T = (a, e) => (isAr ? a : e)
  w.document.open()
  w.document.write(`<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${EXEC_CSS}</style></head><body>
    <div class="tb no-print"><span>${esc(T(REPORT_NAME.ar, REPORT_NAME.en))} — ${T('معاينة قبل الطباعة', 'Print preview')}</span><span class="sp"></span>
      <button id="bc" class="on" onclick="document.body.classList.remove('bw');this.classList.add('on');document.getElementById('bb').classList.remove('on')">${T('ألوان', 'Colour')}</button>
      <button id="bb" onclick="document.body.classList.add('bw');this.classList.add('on');document.getElementById('bc').classList.remove('on')">${T('أبيض وأسود', 'B&W')}</button>
      <button class="pr" onclick="window.print()">${T('طباعة / حفظ PDF', 'Print / Save PDF')}</button></div>
    <div class="doc">${pagesHtml}</div></body></html>`)
  w.document.close()
  return true
}
