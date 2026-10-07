// التقرير التشغيلي التحليلي (Excel) لفترة يحددها المستخدم — يُبنى بالمتصفح وينزل مباشرة (بدون إيميل)
import { createBook, XL } from './excelExport'
import { lineChart, barChart, donutChart } from './chartImages'

const newStat = () => ({ trips: 0, pax: 0, missed: 0, extra: 0, acc: 0, onTime: 0, late: 0 })
function addStat(s, r) {
  s.trips++
  s.pax += Number(r.passenger_count) || 0
  s.missed += Number(r.missed_count) || 0
  if (r.is_extra_trip) s.extra++
  if (r.departure_accuracy) {
    s.acc++
    if (r.departure_accuracy === 'Early' || r.departure_accuracy === 'On Time') s.onTime++; else s.late++
  }
}
const punct = s => (s.acc > 0 ? s.onTime / s.acc : null)
const missedRate = s => ((s.pax + s.missed) > 0 ? s.missed / (s.pax + s.missed) : 0)
const avgPax = s => (s.trips > 0 ? s.pax / s.trips : 0)
const pctChange = (cur, prev) => (prev > 0 ? (cur - prev) / prev : null)
const n0 = n => Math.round(n).toLocaleString('en-US')
const pc = x => (x == null ? '—' : Math.round(x * 100) + '%')

const ACCURACY = { 'Early': ['مبكرة', 'Early'], 'On Time': ['في الموعد', 'On time'], 'Not On Time': ['غير منضبطة', 'Not on time'], 'Delayed': ['متأخرة', 'Delayed'] }
const STATUS_AR = {
  'Accident between other vehicles': 'حادث بين مركبات أخرى', 'Health (Driver/Passengers)': 'حالة صحية (سائق/ركاب)', 'Passenger Misbehavior': 'سوء سلوك راكب',
  'Police Control': 'نقطة تفتيش', 'Traffic Jam': 'ازدحام مروري', 'Weather': 'أحوال جوية', 'Accident with NWB bus': 'حادث لحافلة NWB',
  'Malfunction inside the station': 'عطل داخل المحطة', 'Out-of-station malfunction': 'عطل خارج المحطة', 'Normal': 'طبيعية',
}
const WD_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000)
const eachDay = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out }
const dowOf = iso => new Date(iso + 'T00:00:00Z').getUTCDay()

async function fetchAll(supabase, build, onProgress) {
  let all = [], page = 0
  for (;;) {
    const { data, error } = await build().range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(error.message)
    all = all.concat(data ?? [])
    onProgress?.(all.length)
    if (!data || data.length < 1000) break
    if (++page > 200) break
  }
  return all
}

/** تحليل الفترة: cur = [from,to] و prev = فترة مماثلة قبلها */
export function analyze(records, stations, nameOf, from, to, isAr) {
  const T = (a, e) => (isAr ? a : e)
  const span = daysBetween(from, to) + 1
  const pFrom = addDays(from, -span), pTo = addDays(from, -1)
  const days = eachDay(from, to)
  const A = {
    from, to, pFrom, pTo, span, days, total: newStat(), prevTotal: newStat(), byDay: {}, byStation: {}, byStationPrev: {}, stDay: {}, hours: Array(24).fill(0), hoursParsed: 0, daysWithData: new Set(),
    status: {}, acc: { 'Early': 0, 'On Time': 0, 'Not On Time': 0, 'Delayed': 0 },
    dow: Array.from({ length: 7 }, () => ({ pax: 0, trips: 0, days: new Set() })), lastDay: {},
  }
  days.forEach(d => { A.byDay[d] = newStat() })
  records.forEach(r => {
    const d = String(r.record_date || '').slice(0, 10), sid = r.station_id
    if (d >= from && d <= to) {
      addStat(A.total, r); addStat(A.byDay[d], r); addStat(A.byStation[sid] ??= newStat(), r)
      if (r.operational_status && r.operational_status !== 'Normal') A.status[r.operational_status] = (A.status[r.operational_status] || 0) + 1
      if (r.departure_accuracy && A.acc[r.departure_accuracy] !== undefined) A.acc[r.departure_accuracy]++
      const w = dowOf(d); A.dow[w].pax += Number(r.passenger_count) || 0; A.dow[w].trips++; A.dow[w].days.add(d)
      if (!A.lastDay[sid] || d > A.lastDay[sid]) A.lastDay[sid] = d
      A.daysWithData.add(d)
      const sd = (A.stDay[sid] ??= {}); sd[d] = (sd[d] || 0) + (Number(r.passenger_count) || 0)
      const hm = /(\d{1,2}):\d{2}/.exec(String(r.actual_departure ?? ''))
      if (hm && Number(hm[1]) < 24) { A.hours[Number(hm[1])]++; A.hoursParsed++ }
    } else if (d >= pFrom && d <= pTo) {
      addStat(A.prevTotal, r); addStat(A.byStationPrev[sid] ??= newStat(), r)
    }
  })
  A.rows = stations.map(st => {
    const s = A.byStation[st.id] || newStat(), p = A.byStationPrev[st.id] || newStat()
    return { id: st.id, name: nameOf(st), s, p, change: pctChange(s.pax, p.pax) }
  }).filter(r => r.s.trips > 0 || r.p.trips > 0).sort((a, b) => b.s.pax - a.s.pax)

  // ملاحظات تحليلية تلقائية
  const t = A.total, p = A.prevTotal, out = []
  if (t.trips === 0) out.push(T('لا توجد سجلات ترحيل ضمن الفترة المحددة.', 'No trip records within the selected period.'))
  else {
    let l = T(`خلال ${span} يوماً نُفّذت ${n0(t.trips)} رحلة نقلت ${n0(t.pax)} راكباً بمتوسط ${avgPax(t).toFixed(1)} راكب للرحلة.`,
      `Over ${span} days, ${n0(t.trips)} trips carried ${n0(t.pax)} passengers (${avgPax(t).toFixed(1)} per trip).`)
    const ch = pctChange(t.pax, p.pax)
    if (ch != null) l += T(` عدد الركاب ${ch >= 0 ? 'أعلى' : 'أقل'} بنسبة ${Math.abs(Math.round(ch * 100))}% من الفترة السابقة المماثلة.`,
      ` Passengers are ${Math.abs(Math.round(ch * 100))}% ${ch >= 0 ? 'higher' : 'lower'} than the previous equal period.`)
    out.push(l)
    const pu = punct(t)
    if (pu != null) {
      let l2 = T(`الانضباط العام في المغادرة ${pc(pu)} (${pu >= 0.85 ? 'مستوى ممتاز' : pu >= 0.7 ? 'مستوى جيد ويحتاج متابعة' : 'مستوى منخفض يحتاج تدخلاً'}).`,
        `Overall departure punctuality is ${pc(pu)} (${pu >= 0.85 ? 'excellent' : pu >= 0.7 ? 'good, needs follow-up' : 'low, needs action'}).`)
      const pp = punct(p)
      if (pp != null) l2 += T(` ${pu >= pp ? 'تحسّن' : 'تراجع'} بمقدار ${Math.abs(Math.round((pu - pp) * 100))} نقطة عن الفترة السابقة.`,
        ` ${pu >= pp ? 'Up' : 'Down'} ${Math.abs(Math.round((pu - pp) * 100))} points vs the previous period.`)
      out.push(l2)
    }
    const withAcc = A.rows.filter(r => r.s.acc >= 5).sort((a, b) => punct(b.s) - punct(a.s))
    if (withAcc.length >= 2 && punct(withAcc[0].s) - punct(withAcc[withAcc.length - 1].s) >= 0.01) {
      const b = withAcc[0], w = withAcc[withAcc.length - 1]
      out.push(T(`أفضل انضباط: ${b.name} (${pc(punct(b.s))})، وأقله: ${w.name} (${pc(punct(w.s))}) ويستحق المراجعة.`,
        `Best punctuality: ${b.name} (${pc(punct(b.s))}); lowest: ${w.name} (${pc(punct(w.s))}) — worth reviewing.`))
    }
    if (A.rows.length) out.push(T(`أكثر المحطات حركة: ${A.rows[0].name} بـ ${n0(A.rows[0].s.pax)} راكب (${Math.round((A.rows[0].s.pax / t.pax) * 100)}% من الإجمالي).`,
      `Busiest station: ${A.rows[0].name} with ${n0(A.rows[0].s.pax)} passengers (${Math.round((A.rows[0].s.pax / t.pax) * 100)}% of total).`))
    const dw = A.dow.map((d, i) => ({ i, avg: d.days.size ? d.pax / d.days.size : 0 })).filter(d => d.avg > 0).sort((a, b) => b.avg - a.avg)
    if (dw.length >= 3) out.push(T(`أعلى أيام الأسبوع ازدحاماً: ${WD_AR[dw[0].i]} بمتوسط ${n0(dw[0].avg)} راكب يومياً، وأهدؤها ${WD_AR[dw[dw.length - 1].i]} (${n0(dw[dw.length - 1].avg)}).`,
      `Busiest weekday: ${WD_EN[dw[0].i]} (avg ${n0(dw[0].avg)} per day); quietest: ${WD_EN[dw[dw.length - 1].i]} (${n0(dw[dw.length - 1].avg)}).`))
    const mr = A.rows.filter(r => r.s.pax + r.s.missed >= 50).sort((a, b) => missedRate(b.s) - missedRate(a.s))
    if (t.missed > 0 && mr.length) out.push(T(`المتخلفون: ${n0(t.missed)} راكباً (${(missedRate(t) * 100).toFixed(1)}%)، وأعلى نسبة في ${mr[0].name} (${(missedRate(mr[0].s) * 100).toFixed(1)}%).`,
      `Missed passengers: ${n0(t.missed)} (${(missedRate(t) * 100).toFixed(1)}%); highest rate at ${mr[0].name} (${(missedRate(mr[0].s) * 100).toFixed(1)}%).`))
    const g = A.rows.filter(r => r.p.pax >= 100 && r.change != null).sort((a, b) => b.change - a.change)
    if (g.length >= 2) {
      if (g[0].change > 0.05) out.push(T(`أكبر نمو في الركاب: ${g[0].name} (+${Math.round(g[0].change * 100)}%).`, `Biggest growth: ${g[0].name} (+${Math.round(g[0].change * 100)}%).`))
      const d = g[g.length - 1]
      if (d.change < -0.05) out.push(T(`أكبر تراجع في الركاب: ${d.name} (${Math.round(d.change * 100)}%) — يُنصح بمعرفة السبب.`, `Biggest decline: ${d.name} (${Math.round(d.change * 100)}%) — worth investigating.`))
    }
    const sk = Object.keys(A.status).sort((a, b) => A.status[b] - A.status[a])
    if (sk.length) out.push(T(`أكثر حالة تشغيلية غير طبيعية: ${STATUS_AR[sk[0]] || sk[0]} (${A.status[sk[0]]} مرة)، وإجمالي الحالات غير الطبيعية ${sk.reduce((s, k) => s + A.status[k], 0)}.`,
      `Most common abnormal status: ${sk[0]} (${A.status[sk[0]]}×); total abnormal cases ${sk.reduce((s, k) => s + A.status[k], 0)}.`))
    const silent = A.rows.filter(r => r.s.trips > 0 && A.lastDay[r.id] && daysBetween(A.lastDay[r.id], to) >= 2).map(r => r.name)
    if (silent.length) out.push(T(`محطات توقف تسجيلها قبل نهاية الفترة بيومين أو أكثر: ${silent.slice(0, 8).join('، ')}.`, `Stations whose records stopped 2+ days before the end: ${silent.slice(0, 8).join(', ')}.`))
  }
  A.insights = out

  // توصيات مقترحة (قواعد بسيطة من الأرقام)
  const rec = []
  if (t.trips > 0) {
    const low = A.rows.filter(r => r.s.acc >= 5 && punct(r.s) < 0.7).map(r => r.name)
    if (low.length) rec.push(T(`راجع جدولة وانضباط المغادرة في: ${low.slice(0, 6).join('، ')} (الانضباط أقل من 70%).`, `Review departure scheduling and discipline at: ${low.slice(0, 6).join(', ')} (punctuality below 70%).`))
    const mr2 = A.rows.filter(r => r.s.pax + r.s.missed >= 50 && missedRate(r.s) > 0.02).map(r => r.name)
    if (mr2.length) rec.push(T(`تتبّع أسباب تخلف الركاب في: ${mr2.slice(0, 6).join('، ')} (النسبة أعلى من 2%).`, `Investigate passenger no-shows at: ${mr2.slice(0, 6).join(', ')} (rate above 2%).`))
    const dec = A.rows.filter(r => r.p.pax >= 100 && r.change != null && r.change < -0.1).map(r => `${r.name} (${Math.round(r.change * 100)}%)`)
    if (dec.length) rec.push(T(`افحص أسباب تراجع الركاب في: ${dec.slice(0, 6).join('، ')}.`, `Look into the passenger decline at: ${dec.slice(0, 6).join(', ')}.`))
    const sil = A.rows.filter(r => r.s.trips > 0 && A.lastDay[r.id] && daysBetween(A.lastDay[r.id], to) >= 2).map(r => r.name)
    if (sil.length) rec.push(T(`تأكد من إدخال سجلات الترحيل في: ${sil.slice(0, 6).join('، ')} — توقف التسجيل قبل نهاية الفترة.`, `Make sure trip records are being entered at: ${sil.slice(0, 6).join(', ')} — recording stopped before the period ended.`))
    const topSt = Object.keys(A.status).sort((a, b) => A.status[b] - A.status[a])[0]
    if (topSt && A.status[topSt] >= 3) rec.push(T(`ضع خطة تعامل مع «${STATUS_AR[topSt] || topSt}» — الحالة الأكثر تكراراً (${A.status[topSt]} مرة).`, `Prepare a response plan for “${topSt}” — the most frequent abnormal status (${A.status[topSt]}×).`))
    const missingDays = days.filter(d => !A.daysWithData.has(d)).length
    if (missingDays > 0) rec.push(T(`${missingDays} يوم من الفترة بلا أي سجل ترحيل — تحقق من اكتمال الإدخال.`, `${missingDays} day(s) in the period have no trip records — verify data entry is complete.`))
    if (!rec.length) rec.push(T('الأداء مستقر ولا توجد ملاحظات حرجة — حافظ على الممارسات الحالية.', 'Performance is stable with no critical findings — keep current practices.'))
  }
  A.recommendations = rec

  // مؤشر الأداء العام (0-100): انضباط 50 + تخلف 20 + نمو 15 + اكتمال بيانات 15
  const puV = punct(t), chV = pctChange(t.pax, p.pax)
  const comp = {
    punct: puV == null ? 0 : Math.round(puV * 50),
    missed: Math.round((1 - Math.min(missedRate(t) / 0.05, 1)) * 20),
    growth: chV == null ? 10 : Math.round(Math.max(0, Math.min(1, 1 + Math.min(chV, 0) * 2)) * 15),
    data: Math.round((A.daysWithData.size / span) * 15),
  }
  comp.total = t.trips ? comp.punct + comp.missed + comp.growth + comp.data : null
  A.health = comp
  return A
}

export async function buildOperationsReport({ supabase, isAr, from, to, onProgress }) {
  const T = (a, e) => (isAr ? a : e)
  const span = daysBetween(from, to) + 1
  if (span < 1) throw new Error(T('الفترة غير صحيحة', 'Invalid period'))
  if (span > 400) throw new Error(T('الحد الأقصى للفترة 400 يوماً', 'Maximum period is 400 days'))
  const pFrom = addDays(from, -span)

  onProgress?.(T('جلب المحطات…', 'Loading stations…'))
  const { data: stations, error: se } = await supabase.from('stations').select('id, name_ar, name_en')
  if (se) throw new Error(se.message)
  const nameOf = s => (isAr ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar)) || '—'

  onProgress?.(T('جلب سجلات الترحيل…', 'Loading trip records…'))
  const records = await fetchAll(supabase, () => supabase.from('trip_records')
    .select('id, record_date, station_id, bus_number, passenger_count, missed_count, actual_departure, departure_accuracy, operational_status, is_extra_trip, notes, created_by_name')
    .gte('record_date', pFrom).lte('record_date', to).order('record_date', { ascending: false }).order('id'),
  n => onProgress?.(T(`جلب سجلات الترحيل… ${n0(n)}`, `Loading trip records… ${n0(n)}`)))

  onProgress?.(T('تحليل البيانات…', 'Analyzing…'))
  const A = analyze(records, stations ?? [], nameOf, from, to, isAr)
  const stName = {}; (stations ?? []).forEach(s => { stName[s.id] = nameOf(s) })

  onProgress?.(T('إنشاء الملف…', 'Building the file…'))
  const book = await createBook({ isAr })
  const stamp = new Date().toLocaleString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
  const subtitle = `${T('الفترة', 'Period')}: ${from} → ${to} (${span} ${T('يوماً', 'days')})   ·   ${T('المقارنة بـ', 'Compared with')} ${A.pFrom} → ${A.pTo}   ·   ${T('تاريخ الإصدار', 'Generated')}: ${stamp}`
  const clr = v => (v == null || typeof v !== 'number' ? null : v >= 4 ? XL.green : v >= 3 ? XL.amber : XL.red)
  const puColor = v => (typeof v !== 'number' ? null : v >= 0.85 ? XL.green : v >= 0.7 ? XL.amber : XL.red)
  const t = A.total, p = A.prevTotal, pu = punct(t), pp = punct(p)
  const rankedAcc = A.rows.filter(r => r.s.acc >= 5).sort((a, b) => punct(b.s) - punct(a.s))
  const bestSt = rankedAcc[0] ?? null, worstSt = rankedAcc.length > 1 ? rankedAcc[rankedAcc.length - 1] : null
  const dTxt = (cur, prev) => {
    const ch = pctChange(cur, prev)
    if (ch == null) return T('لا توجد فترة سابقة', 'No previous period')
    if (Math.round(ch * 100) === 0) return T('بلا تغيّر عن الفترة السابقة', 'No change vs previous')
    return `${ch >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(ch * 100))}% ${T('عن الفترة السابقة', 'vs previous')}`
  }

  // ═════════ لوحة القيادة ═════════
  const S = book.sheet(T('لوحة القيادة', 'Dashboard'), Array(12).fill(13), { tab: XL.orange })
  S.header({ title: T('التقرير التشغيلي التحليلي', 'Operations Analytics Report'), subtitle })

  // مؤشر الأداء العام
  const H = A.health
  const grade = H.total == null ? ['—', XL.grey] : H.total >= 85 ? [T('ممتاز', 'Excellent'), XL.green] : H.total >= 70 ? [T('جيد', 'Good'), XL.green] : H.total >= 55 ? [T('متوسط', 'Fair'), XL.amber] : [T('يحتاج تدخلاً', 'Needs action'), XL.red]
  S.section(T('مؤشر الأداء العام', 'Overall performance index'), T('مؤشر مركّب من 100: الانضباط (50) + قلة التخلف (20) + نمو الركاب (15) + اكتمال البيانات (15)', 'Composite out of 100: punctuality (50) + low no-shows (20) + passenger growth (15) + data completeness (15)'))
  S.kpis([
    { label: T('المؤشر العام', 'Overall index'), value: H.total ?? '—', fmt: '0', color: grade[1], foot: grade[0] },
    { label: T('الانضباط', 'Punctuality'), value: `${H.punct} / 50`, foot: pc(pu) },
    { label: T('قلة التخلف', 'Low no-shows'), value: `${H.missed} / 20`, foot: `${(missedRate(t) * 100).toFixed(1)}%` },
    { label: T('نمو الركاب', 'Growth'), value: `${H.growth} / 15`, foot: pctChange(t.pax, p.pax) == null ? T('بلا مقارنة', 'no baseline') : `${pctChange(t.pax, p.pax) >= 0 ? '+' : ''}${Math.round(pctChange(t.pax, p.pax) * 100)}%` },
    { label: T('اكتمال البيانات', 'Data completeness'), value: `${H.data} / 15`, foot: `${A.daysWithData.size} ${T('من', 'of')} ${span} ${T('يوماً', 'days')}` },
  ], 2)
  S.section(T('المؤشرات الرئيسية', 'Key indicators'))
  S.spacer(0)
  const activeStations = A.rows.filter(r => r.s.trips > 0).length
  const busiest = A.days.reduce((b, d) => (A.byDay[d].pax > (A.byDay[b]?.pax ?? -1) ? d : b), A.days[0])
  S.kpis([
    { label: T('إجمالي الركاب', 'Total passengers'), value: t.pax, fmt: '#,##0', foot: dTxt(t.pax, p.pax) },
    { label: T('عدد الرحلات', 'Trips'), value: t.trips, fmt: '#,##0', foot: dTxt(t.trips, p.trips) },
    { label: T('الانضباط في المغادرة', 'Departure punctuality'), value: pu ?? '—', fmt: '0%', color: pu == null ? XL.grey : pu >= 0.85 ? XL.green : pu >= 0.7 ? XL.amber : XL.red, foot: pu != null && pp != null ? (Math.round((pu - pp) * 100) === 0 ? T('بلا تغيّر', 'No change') : `${pu >= pp ? '▲' : '▼'} ${Math.abs(Math.round((pu - pp) * 100))} ${T('نقطة', 'pts')}`) : '' },
    { label: T('المتخلفون', 'Missed passengers'), value: t.missed, fmt: '#,##0', color: t.missed > 0 ? XL.red : XL.green, foot: `${(missedRate(t) * 100).toFixed(1)}% ${T('من الركاب', 'of passengers')}` },
    { label: T('متوسط الركاب للرحلة', 'Avg passengers / trip'), value: avgPax(t), fmt: '0.0', foot: dTxt(avgPax(t), avgPax(p)) },
    { label: T('رحلات إضافية', 'Extra trips'), value: t.extra, fmt: '#,##0', color: XL.orange, foot: dTxt(t.extra, p.extra) },
    { label: T('رحلات متأخرة', 'Late trips'), value: t.late, fmt: '#,##0', color: t.late > 0 ? XL.red : XL.green, foot: `${pc(t.acc ? t.late / t.acc : null)} ${T('من المقيَّمة', 'of rated')}` },
    { label: T('المحطات النشطة', 'Active stations'), value: activeStations, fmt: '0', foot: `${T('من', 'of')} ${stations?.length ?? 0}` },
    { label: T('متوسط الركاب يومياً', 'Avg passengers / day'), value: t.pax / span, fmt: '#,##0', foot: dTxt(t.pax / span, p.pax / span) },
    { label: T('أعلى يوم ركاباً', 'Peak day'), value: busiest ? A.byDay[busiest].pax : 0, fmt: '#,##0', foot: busiest ?? '' },
    { label: T('أفضل محطة انضباطاً', 'Best punctuality'), value: bestSt ? punct(bestSt.s) : '—', fmt: '0%', color: XL.green, foot: bestSt?.name ?? '' },
    { label: T('أقل محطة انضباطاً', 'Lowest punctuality'), value: worstSt && worstSt !== bestSt ? punct(worstSt.s) : '—', fmt: '0%', color: XL.red, foot: worstSt && worstSt !== bestSt ? worstSt.name : '' },
  ], 2)

  if (A.insights.length) { S.section(T('أبرز الملاحظات التحليلية', 'Key insights')); S.spacer(0); S.bullets(A.insights) }
  if (A.recommendations.length) {
    S.section(T('توصيات مقترحة', 'Suggested actions'), T('مستخرجة تلقائياً من أرقام الفترة — للاسترشاد وليست بديلاً عن تقدير الإدارة', 'Derived automatically from the period figures — a guide, not a substitute for management judgment'))
    S.bullets(A.recommendations.map((x, i) => `${i + 1}. ${x}`))
  }

  // الرسوم (صور)
  const accKeys = ['Early', 'On Time', 'Not On Time', 'Delayed']
  const charts = []
  charts.push(lineChart({ title: T('الركاب يومياً', 'Passengers per day'), labels: A.days.map(d => d.slice(5)), values: A.days.map(d => A.byDay[d].pax), isAr, w: 560 }))
  if (A.rows.length) {
    const top = A.rows.slice(0, 10)
    charts.push(barChart({ title: T('الركاب حسب المحطة (الأعلى 10)', 'Passengers by station (top 10)'), labels: top.map(r => r.name), values: top.map(r => r.s.pax), isAr, w: 560 }))
  }
  charts.push(donutChart({ title: T('توزيع دقة المغادرة', 'Departure accuracy'), labels: accKeys.map(k => ACCURACY[k][isAr ? 0 : 1]), values: accKeys.map(k => A.acc[k]), colors: ['#15803d', '#84cc16', '#f59e0b', '#b91c1c'], isAr, w: 560 }))
  charts.push(barChart({ title: T('متوسط الركاب حسب أيام الأسبوع', 'Avg passengers by weekday'), labels: (isAr ? WD_AR : WD_EN), values: A.dow.map(d => (d.days.size ? Math.round(d.pax / d.days.size) : 0)), color: '#264673', isAr, w: 560 }))
  if (A.hoursParsed > 0) {
    const hs = A.hours.map((v, i) => [i, v]).filter(([, v]) => v > 0), lo = Math.max(0, hs[0][0] - 1), hi = Math.min(23, hs[hs.length - 1][0] + 1)
    const hrs = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    charts.push(barChart({ title: T('عدد الرحلات حسب ساعة المغادرة (أوقات الذروة)', 'Trips by departure hour (peak times)'), labels: hrs.map(h => String(h).padStart(2, '0') + ':00'), values: hrs.map(h => A.hours[h]), color: '#EE712D', isAr, w: 560 }))
  }
  charts.push(donutChart({ title: T('الرحلات العادية والإضافية', 'Regular vs extra trips'), labels: [T('عادية', 'Regular'), T('إضافية', 'Extra')], values: [t.trips - t.extra, t.extra], colors: ['#264673', '#EE712D'], isAr, w: 560 }))
  S.section(T('الرسوم البيانية', 'Charts'))
  const rowAnchor = S.r - 1
  charts.forEach((png, i) => {
    const id = book.wb.addImage({ base64: png, extension: 'png' })
    const col = i % 2 === 0 ? 0 : 6, rowOff = Math.floor(i / 2) * 15
    S.ws.addImage(id, { tl: { col: col + 0.1, row: rowAnchor + rowOff + 0.3 }, ext: { width: 560, height: 270 } })
  })
  S.r += Math.ceil(charts.length / 2) * 15 + 1

  // ترتيب المحطات
  const label = r => (r == null ? '—' : r >= 0.85 ? T('ممتاز', 'Excellent') : r >= 0.7 ? T('جيد', 'Good') : r >= 0.55 ? T('متوسط', 'Fair') : T('يحتاج تدخلاً', 'Needs action'))
  const spark = r => {
    const bins = Math.min(12, A.days.length), size = Math.ceil(A.days.length / bins), vals = []
    for (let i = 0; i < A.days.length; i += size) vals.push(A.days.slice(i, i + size).reduce((s, d) => s + (A.stDay[r.id]?.[d] || 0), 0))
    const mx = Math.max(...vals, 1), blocks = '▁▂▃▄▅▆▇█'
    return vals.map(v => blocks[Math.min(7, Math.round((v / mx) * 7))]).join('')
  }
  if (A.rows.length) {
    S.section(T('ترتيب المحطات', 'Station ranking'), T('مرتّبة حسب عدد الركاب — الألوان تدرّج من الأضعف للأقوى، والاتجاه رسم مصغّر لحركة الركاب عبر الفترة', 'Sorted by passengers — colors run weakest to strongest; the trend glyph shows passenger flow across the period'))
    const rows = A.rows.map((r, i) => [i + 1, r.name, r.s.trips, r.s.pax, avgPax(r.s), missedRate(r.s), punct(r.s) ?? '—', label(punct(r.s)), r.change == null ? '—' : r.change, spark(r)])
    const tS = S.table({
      columns: [
        { header: '#', fmt: '0' }, { header: T('المحطة', 'Station'), span: 2, bold: true, color: () => XL.navy }, { header: T('الرحلات', 'Trips'), fmt: '#,##0' }, { header: T('الركاب', 'Passengers'), fmt: '#,##0' },
        { header: T('ركاب/رحلة', 'Pax/trip'), fmt: '0.0' }, { header: T('نسبة التخلف', 'Missed %'), fmt: '0.0%' }, { header: T('الانضباط', 'Punctuality'), fmt: '0%', color: puColor },
        { header: T('التقييم', 'Rating'), span: 2, color: v => (v === T('ممتاز', 'Excellent') || v === T('جيد', 'Good') ? XL.green : v === T('متوسط', 'Fair') ? XL.amber : v === T('يحتاج تدخلاً', 'Needs action') ? XL.red : null) },
        { header: T('تغيّر الركاب', 'Pax change'), fmt: '+0%;-0%;0%', color: v => (typeof v !== 'number' ? null : v > 0 ? XL.green : v < 0 ? XL.red : null) },
        { header: T('الاتجاه', 'Trend'), color: () => XL.navy, align: 'center' },
      ],
      rows,
      totals: ['', T('الإجمالي', 'Total'), t.trips, t.pax, avgPax(t), missedRate(t), pu ?? '—', label(pu), pctChange(t.pax, p.pax) ?? '—', ''],
    })
    // الأعمدة: A # · B:C المحطة · D رحلات · E ركاب · F ركاب/رحلة · G تخلف% · H انضباط · I:J تقييم · K تغيّر · L اتجاه
    S.scale(`H${tS.first}:H${tS.last}`, { min: 0.5, mid: 0.8, max: 1 })
    S.bars(`E${tS.first}:E${tS.last}`, 'FFA9C4EB')
    S.scale(`G${tS.first}:G${tS.last}`, { min: 0, mid: 0.02, max: 0.08, reverse: true })

    // خريطة حرارية: متوسط الركاب اليومي لكل محطة حسب يوم الأسبوع
    const stDow = {}
    A.rows.forEach(r => { stDow[r.id] = Array.from({ length: 7 }, () => ({ pax: 0, days: new Set() })) })
    records.forEach(rc => {
      const d = String(rc.record_date).slice(0, 10)
      if (d < from || d > to || !stDow[rc.station_id]) return
      const x = stDow[rc.station_id][dowOf(d)]; x.pax += Number(rc.passenger_count) || 0; x.days.add(d)
    })
    S.section(T('خريطة حرارية: ازدحام المحطات حسب أيام الأسبوع', 'Heatmap: station load by weekday'), T('متوسط الركاب في اليوم — اللون الأغمق = ازدحام أعلى', 'Average passengers per day — darker = busier'))
    const wd = isAr ? WD_AR : WD_EN
    const hmRows = A.rows.map(r => {
      const v = stDow[r.id].map(x => (x.days.size ? Math.round(x.pax / x.days.size) : 0))
      return [r.name, ...v, Math.round(v.reduce((a, b) => a + b, 0) / Math.max(v.filter(x => x > 0).length, 1))]
    })
    const mx = Math.max(...hmRows.flatMap(r => r.slice(1, 8)), 1)
    const tH = S.table({
      columns: [{ header: T('المحطة', 'Station'), span: 3, bold: true, color: () => XL.navy }, ...wd.map(n => ({ header: n, fmt: '#,##0' })), { header: T('المتوسط', 'Avg'), span: 2, fmt: '#,##0', bold: true }],
      rows: hmRows, zebra: false,
    })
    S.scale(`D${tH.first}:J${tH.last}`, { min: 0, mid: mx / 2, max: mx, colors: ['FFFFFFFF', 'FFCFE0F7', 'FF4F81D6'] })
  }

  // دقة المغادرة + الحالات
  S.section(T('دقة المغادرة', 'Departure accuracy'))
  const accTot = accKeys.reduce((s, k) => s + A.acc[k], 0)
  const tA = S.table({
    columns: [{ header: T('الحالة', 'Status'), span: 4, bold: true }, { header: T('الرحلات', 'Trips'), span: 4, fmt: '#,##0' }, { header: T('النسبة', 'Share'), span: 4, fmt: '0%' }],
    rows: accKeys.map(k => [ACCURACY[k][isAr ? 0 : 1], A.acc[k], accTot ? A.acc[k] / accTot : 0]), zebra: false,
  })
  S.bars(`E${tA.first}:E${tA.last}`, 'FF7FB77E')
  const sk = Object.keys(A.status).sort((a, b) => A.status[b] - A.status[a])
  S.section(T('الحالات التشغيلية غير الطبيعية', 'Abnormal operational statuses'))
  if (!sk.length) S.note(T('✅ لا توجد حالات تشغيلية غير طبيعية ضمن الفترة', '✅ No abnormal operational statuses in the period'), { bold: true, color: XL.green })
  else {
    const tot = sk.reduce((s, k) => s + A.status[k], 0)
    const tI = S.table({
      columns: [{ header: T('الحالة', 'Status'), span: 4, bold: true }, { header: T('عدد المرات', 'Count'), span: 4, fmt: '#,##0', color: () => XL.red }, { header: T('النسبة', 'Share'), span: 4, fmt: '0%' }],
      rows: sk.map(k => [isAr ? (STATUS_AR[k] || k) : k, A.status[k], A.status[k] / tot]), zebra: false,
    })
    S.bars(`E${tI.first}:E${tI.last}`, 'FFF4A6A1')
  }
  S.section(T('جودة البيانات والمنهجية', 'Data quality & methodology'))
  S.bullets(isAr ? [
    `التغطية: ${n0(records.filter(r => r.record_date >= from && r.record_date <= to).length)} سجل ترحيل في ${A.daysWithData.size} من ${span} يوماً · ${activeStations} محطة نشطة.`,
    'الانضباط % = الرحلات المبكرة أو في الموعد ÷ الرحلات التي سُجّلت لها دقة المغادرة. نسبة التخلف = المتخلفون ÷ (الركاب + المتخلفون).',
    'المقارنة تتم بفترة سابقة مماثلة في الطول تنتهي قبل بداية الفترة المحددة مباشرة.',
    'التقييم: ممتاز ≥ 85% انضباط · جيد ≥ 70% · متوسط ≥ 55% · يحتاج تدخلاً أقل من ذلك. ساعات الذروة تُستخرج من وقت المغادرة الفعلي.',
    'ورقة «السجلات» تحوي كل البيانات الخام للتصفية والتحليل الإضافي، وورقة لكل محطة بسجلاتها.',
  ] : [
    `Coverage: ${n0(records.filter(r => r.record_date >= from && r.record_date <= to).length)} trip records over ${A.daysWithData.size} of ${span} days · ${activeStations} active stations.`,
    'Punctuality % = early or on-time trips ÷ trips with a recorded departure accuracy. Missed rate = missed ÷ (passengers + missed).',
    'Comparison uses an equal-length period ending right before the selected one.',
    'Rating: Excellent ≥ 85% punctuality · Good ≥ 70% · Fair ≥ 55% · otherwise Needs action. Peak hours come from the actual departure time.',
    'The “Records” sheet holds all raw data for filtering, plus a sheet per station with its records.',
  ])
  S.finish({ landscape: false })

  // ═════════ الاتجاه اليومي ═════════
  const D = book.sheet(T('الاتجاه اليومي', 'Daily trend'), [14, 13, 11, 12, 12, 12, 12, 11])
  D.header({ title: T('الاتجاه اليومي', 'Daily trend'), subtitle })
  const dRows = A.days.map(d => { const s = A.byDay[d]; return [d, (isAr ? WD_AR : WD_EN)[dowOf(d)], s.trips, s.pax, s.missed, avgPax(s), punct(s) ?? '—', s.late] })
  const tD = D.table({
    columns: [{ header: T('التاريخ', 'Date'), bold: true }, { header: T('اليوم', 'Day') }, { header: T('الرحلات', 'Trips'), fmt: '#,##0' }, { header: T('الركاب', 'Passengers'), fmt: '#,##0', bold: true },
      { header: T('المتخلفون', 'Missed'), fmt: '#,##0' }, { header: T('ركاب/رحلة', 'Pax/trip'), fmt: '0.0' }, { header: T('الانضباط', 'Punctuality'), fmt: '0%', color: puColor }, { header: T('متأخرة', 'Late'), fmt: '#,##0' }],
    rows: dRows, freeze: true, printTitle: true,
  })
  const tr = tD.last + 1
  ;['C', 'D', 'E', 'H'].forEach(c => { const cell = D.ws.getCell(`${c}${tr}`); cell.value = { formula: `SUM(${c}${tD.first}:${c}${tD.last})`, result: c === 'C' ? t.trips : c === 'D' ? t.pax : c === 'E' ? t.missed : t.late }; cell.numFmt = '#,##0'; cell.font = { bold: true, color: { argb: XL.navy } } })
  D.ws.getCell(`A${tr}`).value = T('الإجمالي', 'Total'); D.ws.getCell(`A${tr}`).font = { bold: true, color: { argb: XL.navy } }
  D.scale(`D${tD.first}:D${tD.last}`, { min: 0, mid: Math.max(...A.days.map(d => A.byDay[d].pax), 1) / 2, max: Math.max(...A.days.map(d => A.byDay[d].pax), 1) })
  D.bars(`C${tD.first}:C${tD.last}`, 'FFA9C4EB')
  D.finish({ landscape: false })

  // ═════════ كل السجلات ═════════
  const inPeriod = records.filter(r => r.record_date >= from && r.record_date <= to)
  const R = book.sheet(T('السجلات', 'Records'), [13, 24, 11, 10, 10, 16, 14, 22, 11, 30, 18])
  R.header({ title: T('سجلات الترحيل', 'Trip records'), subtitle })
  R.table({
    columns: [{ header: T('التاريخ', 'Date') }, { header: T('المحطة', 'Station') }, { header: T('رقم الباص', 'Bus') }, { header: T('الركاب', 'Pax'), fmt: '0', bold: true }, { header: T('المتخلفون', 'Missed'), fmt: '0', color: v => (typeof v === 'number' && v > 0 ? XL.red : null) },
      { header: T('المغادرة الفعلية', 'Actual departure') }, { header: T('الدقة', 'Accuracy') }, { header: T('الحالة التشغيلية', 'Operational status') }, { header: T('إضافية', 'Extra') }, { header: T('ملاحظات', 'Notes'), wrap: true }, { header: T('أدخلها', 'Entered by') }],
    rows: inPeriod.map(r => [r.record_date, stName[r.station_id] ?? '—', r.bus_number ?? '', Number(r.passenger_count) || 0, Number(r.missed_count) || 0, r.actual_departure ?? '',
      r.departure_accuracy ? ACCURACY[r.departure_accuracy]?.[isAr ? 0 : 1] ?? r.departure_accuracy : '', r.operational_status ? (isAr ? (STATUS_AR[r.operational_status] || r.operational_status) : r.operational_status) : '',
      r.is_extra_trip ? T('نعم', 'Yes') : '', r.notes ?? '', r.created_by_name ?? '']),
    filter: true, freeze: 2, printTitle: true,
  })
  R.finish({ landscape: true })

  // ═════════ ورقة لكل محطة ═════════
  const used = new Set([T('لوحة القيادة', 'Dashboard'), T('الاتجاه اليومي', 'Daily trend'), T('السجلات', 'Records')])
  const byStation = {}; inPeriod.forEach(r => { (byStation[r.station_id] ??= []).push(r) })
  for (const r of A.rows.filter(x => x.s.trips > 0)) {
    let nm = String(r.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Station'
    while (used.has(nm)) nm = nm.slice(0, 26) + '_' + Math.floor(Math.random() * 90 + 10)
    used.add(nm)
    const sh = book.sheet(nm, [13, 11, 11, 11, 16, 14, 24, 11, 30, 18], { tab: 'FF8B9DB8' })
    sh.header({ title: r.name, subtitle })
    const s = r.s, ps = r.p
    sh.kpis([
      { label: T('الرحلات', 'Trips'), value: s.trips, fmt: '#,##0', foot: dTxt(s.trips, ps.trips) },
      { label: T('الركاب', 'Passengers'), value: s.pax, fmt: '#,##0', foot: dTxt(s.pax, ps.pax) },
      { label: T('ركاب/رحلة', 'Pax/trip'), value: avgPax(s), fmt: '0.0', foot: '' },
      { label: T('الانضباط', 'Punctuality'), value: punct(s) ?? '—', fmt: '0%', color: punct(s) == null ? XL.grey : punct(s) >= 0.85 ? XL.green : punct(s) >= 0.7 ? XL.amber : XL.red, foot: punct(ps) != null && punct(s) != null ? `${punct(s) >= punct(ps) ? '▲' : '▼'} ${Math.abs(Math.round((punct(s) - punct(ps)) * 100))} ${T('نقطة', 'pts')}` : '' },
      { label: T('المتخلفون', 'Missed'), value: s.missed, fmt: '#,##0', color: s.missed > 0 ? XL.red : XL.green, foot: `${(missedRate(s) * 100).toFixed(1)}%` },
    ], 2)
    const rows = (byStation[r.id] ?? [])
    sh.table({
      columns: [{ header: T('التاريخ', 'Date') }, { header: T('الباص', 'Bus') }, { header: T('الركاب', 'Pax'), fmt: '0', bold: true }, { header: T('المتخلفون', 'Missed'), fmt: '0', color: v => (typeof v === 'number' && v > 0 ? XL.red : null) },
        { header: T('المغادرة', 'Departure') }, { header: T('الدقة', 'Accuracy'), color: v => (v === ACCURACY['Delayed'][isAr ? 0 : 1] ? XL.red : v === ACCURACY['Not On Time'][isAr ? 0 : 1] ? XL.amber : v ? XL.green : null) },
        { header: T('الحالة التشغيلية', 'Status') }, { header: T('إضافية', 'Extra') }, { header: T('ملاحظات', 'Notes'), wrap: true }, { header: T('أدخلها', 'By') }],
      rows: rows.map(x => [x.record_date, x.bus_number ?? '', Number(x.passenger_count) || 0, Number(x.missed_count) || 0, x.actual_departure ?? '',
        x.departure_accuracy ? ACCURACY[x.departure_accuracy]?.[isAr ? 0 : 1] ?? x.departure_accuracy : '', x.operational_status ? (isAr ? (STATUS_AR[x.operational_status] || x.operational_status) : x.operational_status) : '',
        x.is_extra_trip ? T('نعم', 'Yes') : '', x.notes ?? '', x.created_by_name ?? '']),
      filter: true, freeze: true, printTitle: true,
    })
    sh.finish({ landscape: true })
  }

  onProgress?.(T('تجهيز التنزيل…', 'Preparing download…'))
  await book.save(isAr ? `التقرير-التشغيلي_${from}_${to}` : `operations-report_${from}_${to}`)
  return { records: inPeriod.length, stations: A.rows.length, trips: t.trips }
}
