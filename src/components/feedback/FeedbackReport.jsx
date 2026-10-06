import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase'
import DatePicker from '../shared/DatePicker'
import { todayStr } from '../../utils/dates'
import { AR_LABELS, AR_O, AR_A, EN_LABELS, EN_O, EN_A, TRIP_ASPECTS, STATION_ASPECTS } from '../../utils/feedbackConfig'
import { exportSurveyExcel } from '../../utils/surveyExport'
import { buildSurveyReportHtml, openPrintWindow, printInto } from '../../utils/surveyPdf'
import { POSTER_SIZES, buildPosterSvg, downloadPosterPng, printPoster } from '../../utils/qrPoster'

const useIsAr = () => useTranslation().i18n.language === 'ar'
const mkLbl = isAr => { const d = isAr ? AR_LABELS : EN_LABELS; return k => d[k] || k }
const mkLblO = isAr => { const d = isAr ? AR_O : EN_O; return k => d[k] || k }
const mkLblA = isAr => { const d = isAr ? AR_A : EN_A; return k => d[k] || k }
const num = v => (v == null ? null : Number(v))
const f1 = n => (n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(1))
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const TRIP_KEYS = new Set(TRIP_ASPECTS.map(a => a.key))
const STATION_KEYS = new Set(STATION_ASPECTS.map(a => a.key))

const npsScore = n => (n && n.n ? Math.round(((n.pro - n.det) / n.n) * 100) : null)
const npsLevel = (s, isAr) => (s == null ? '—' : s >= 50 ? (isAr ? 'ممتاز' : 'Excellent') : s >= 30 ? (isAr ? 'جيد جداً' : 'Very good') : s >= 0 ? (isAr ? 'جيد' : 'Good') : (isAr ? 'يحتاج تحسيناً' : 'Needs improvement'))
const scoreLevel = (v, isAr) => (v == null ? '—' : v >= 4.5 ? (isAr ? 'ممتاز' : 'Excellent') : v >= 4 ? (isAr ? 'جيد جداً' : 'Very good') : v >= 3 ? (isAr ? 'مقبول' : 'Acceptable') : (isAr ? 'ضعيف' : 'Poor'))

const tone = (v, good = 4, mid = 3) => (v == null ? 'text-gray-400' : v >= good ? 'text-green-700' : v >= mid ? 'text-amber-600' : 'text-red-600')
const npsTone = n => (n == null ? 'text-gray-400' : n >= 50 ? 'text-green-700' : n >= 0 ? 'text-amber-600' : 'text-red-600')
const barTone = v => (v >= 4 ? 'bg-green-500' : v >= 3 ? 'bg-amber-400' : 'bg-red-500')
const daysAgo = d => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10) }
const shiftDay = (iso, n) => { const x = new Date(iso + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const dayLabel = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`

function ScorePill({ v }) {
  const c = v == null ? 'bg-gray-50 text-gray-400' : v >= 4 ? 'bg-green-50 text-green-700' : v >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
  return <span className={`inline-block min-w-[2.5rem] text-center px-2 py-0.5 rounded-full text-xs font-bold ${c}`}>{f1(v)}</span>
}

function Card({ title, hint, children, className = '', action }) {
  return (
    <section className={`bg-white border border-gray-100 rounded-2xl shadow-sm p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{title}</h3>
            {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

function Delta({ cur, prev, digits = 1, unit = '', invert = false }) {
  const isAr = useIsAr()
  if (cur == null || prev == null) return <span className="text-gray-300">{isAr ? 'لا توجد مقارنة' : 'No comparison'}</span>
  const d = Number(cur) - Number(prev)
  if (Math.abs(d) < 0.05) return <span className="text-gray-400">{isAr ? 'بدون تغيير عن الفترة السابقة' : 'No change vs. previous period'}</span>
  const good = invert ? d < 0 : d > 0
  return (
    <span className={good ? 'text-green-700' : 'text-red-600'}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(digits)}{unit} <span className="text-gray-400">{isAr ? 'عن الفترة السابقة' : 'vs. previous period'}</span>
    </span>
  )
}

function Kpi({ label, value, valueClass = 'text-gray-900', foot, level }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex flex-col">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <p dir="ltr" className={`text-4xl font-extrabold leading-none ${valueClass}`}>{value}</p>
        {level && <span className={`text-xs font-bold ${valueClass}`}>{level}</span>}
      </div>
      <p className="text-[11px] mt-3 pt-3 border-t border-gray-50 min-h-[2rem]">{foot}</p>
    </div>
  )
}

function ScoreRows({ items }) {
  const isAr = useIsAr()
  const lblA = mkLblA(isAr)
  if (!items.length) return <p className="text-sm text-gray-400">{isAr ? 'لا توجد بيانات' : 'No data'}</p>
  return (
    <div className="space-y-3.5">
      {items.map(a => (
        <div key={a.k} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
          <span className="text-sm text-gray-700 truncate" title={lblA(a.k)}>{lblA(a.k)}</span>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-2 rounded-full ${barTone(a.avg)}`} style={{ width: `${(a.avg / 5) * 100}%` }} /></div>
          <span className="flex items-center gap-1.5"><ScorePill v={a.avg} /><span className="text-[11px] text-gray-400 w-9">({a.n})</span></span>
        </div>
      ))}
    </div>
  )
}

function CountRows({ items, total }) {
  const isAr = useIsAr()
  const lblO = mkLblO(isAr)
  if (!items.length) return <p className="text-sm text-gray-400">{isAr ? 'لا توجد بيانات' : 'No data'}</p>
  return (
    <div className="space-y-3.5">
      {items.map(({ k, n }) => (
        <div key={k} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
          <span className="text-sm text-gray-700 truncate">{lblO(k)}</span>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-2 rounded-full bg-slate-700" style={{ width: `${pct(n, total)}%` }} /></div>
          <span className="text-xs font-semibold text-gray-700 w-20 text-start">{pct(n, total)}% <span className="text-gray-400 font-normal">({n})</span></span>
        </div>
      ))}
    </div>
  )
}

function TrendChart({ data, bucket }) {
  const isAr = useIsAr()
  if (!data.length) return <p className="text-sm text-gray-400 py-6 text-center">{isAr ? 'لا توجد بيانات' : 'No data'}</p>
  const W = 640, H = 190, padL = 28, padR = 12, padT = 12, padB = 26
  const maxN = Math.max(...data.map(p => p.n), 1)
  const step = (W - padL - padR) / data.length
  const x = i => padL + step * i + step / 2
  const yAvg = v => padT + (H - padT - padB) * (1 - (v - 1) / 4)
  const yBar = n => H - padB - (H - padT - padB) * 0.55 * (n / maxN)
  const pts = data.filter(p => p.avg != null)
  const line = pts.map(p => `${x(data.indexOf(p))},${yAvg(p.avg)}`).join(' ')
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label={isAr ? 'اتجاه الرضا' : 'Satisfaction trend'}>
        {[1, 3, 5].map(v => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={yAvg(v)} y2={yAvg(v)} stroke="#f1f5f9" />
            <text x={padL - 6} y={yAvg(v) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{v}</text>
          </g>
        ))}
        {data.map((p, i) => (
          <rect key={p.d} x={x(i) - Math.min(14, step / 2.6)} y={yBar(p.n)} width={Math.min(28, step / 1.3)} height={H - padB - yBar(p.n)} rx="3" fill="#e2e8f0">
            <title>{`${dayLabel(p.d)} — ${p.n} ${isAr ? 'استجابة' : 'responses'}`}</title>
          </rect>
        ))}
        {pts.length > 1 && <polyline points={line} fill="none" stroke="#0f172a" strokeWidth="2" strokeLinejoin="round" />}
        {pts.map(p => (
          <circle key={p.d} cx={x(data.indexOf(p))} cy={yAvg(p.avg)} r="3.5" fill="#0f172a">
            <title>{`${dayLabel(p.d)} — ${isAr ? 'المتوسط' : 'Average'} ${f1(p.avg)}`}</title>
          </circle>
        ))}
        <text x={x(0)} y={H - 8} fontSize="9" fill="#94a3b8" textAnchor="middle">{dayLabel(data[0].d)}</text>
        {data.length > 1 && <text x={x(data.length - 1)} y={H - 8} fontSize="9" fill="#94a3b8" textAnchor="middle">{dayLabel(data[data.length - 1].d)}</text>}
      </svg>
      <div className="flex items-center gap-4 text-[11px] text-gray-500 mt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-slate-900 inline-block" /> {isAr ? 'متوسط الرضا (من 5)' : 'Average satisfaction (out of 5)'}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-200 inline-block" /> {isAr ? 'عدد الاستجابات' : 'Number of responses'}</span>
        <span className="ms-auto">{isAr ? 'كل نقطة =' : 'Each point ='} {bucket === 'week' ? (isAr ? 'أسبوع' : 'week') : (isAr ? 'يوم' : 'day')}</span>
      </div>
    </div>
  )
}

function CutTable({ title, items }) {
  const isAr = useIsAr()
  const lbl = mkLbl(isAr)
  return (
    <Card title={title}>
      {!items.length ? <p className="text-sm text-gray-400">{isAr ? 'لا توجد بيانات بعد' : 'No data yet'}</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-400">
            <th className="pb-2 text-start font-medium">{isAr ? 'الفئة' : 'Category'}</th><th className="pb-2 text-center font-medium">{isAr ? 'الاستجابات' : 'Responses'}</th>
            <th className="pb-2 text-center font-medium">{isAr ? 'متوسط الرضا' : 'Avg. satisfaction'}</th><th className="pb-2 text-center font-medium">NPS</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(g => (
              <tr key={g.k}>
                <td className="py-2.5 text-gray-800">{lbl(g.k)}</td>
                <td className="py-2.5 text-center text-gray-500">{g.n}</td>
                <td className="py-2.5 text-center"><ScorePill v={num(g.avg)} /></td>
                <td dir="ltr" className={`py-2.5 text-center font-bold ${npsTone(num(g.nps))}`}>{g.nps ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

const TABS = [
  { id: 'overview', ar: 'لوحة المؤشرات', en: 'Dashboard' },
  { id: 'stations', ar: 'أداء المحطات', en: 'Station performance' },
  { id: 'audience', ar: 'شرائح العملاء', en: 'Customer segments' },
  { id: 'log', ar: 'سجل الاستجابات', en: 'Response log' },
  { id: 'voice', ar: 'صوت العميل', en: 'Voice of customer' },
  { id: 'qr', ar: 'رمز الاستبيان', en: 'Survey QR code' },
]
const PRESETS = [{ d: 7, ar: '7 أيام', en: '7 days' }, { d: 30, ar: '30 يوماً', en: '30 days' }, { d: 90, ar: '90 يوماً', en: '90 days' }]
const POSTER_LABELS_EN = {
  '4x6': '4 × 6 in (10.2 × 15.2 cm)', a6: 'A6 (10.5 × 14.8 cm)', a5: 'A5 (14.8 × 21 cm)', a4: 'A4 (21 × 29.7 cm)',
  '4x4': 'Square 4 × 4 in (10.2 cm)', '3x3': 'Square 3 × 3 in (7.6 cm)',
}

export default function FeedbackReport() {
  const isAr = useIsAr()
  const lbl = mkLbl(isAr), lblO = mkLblO(isAr), lblA = mkLblA(isAr)
  const [from, setFrom] = useState(() => daysAgo(29))
  const [to, setTo] = useState(todayStr())
  const [kind, setKind] = useState('all')
  const [stationFilter, setStationFilter] = useState('')
  const [tab, setTab] = useState('overview')
  const [sortBy, setSortBy] = useState('n')
  const [data, setData] = useState(null)
  const [prev, setPrev] = useState(null)
  const [stations, setStations] = useState([])
  const [voice, setVoice] = useState([])
  const [logRows, setLogRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [posterQr, setPosterQr] = useState('')
  const [sizeId, setSizeId] = useState('4x6')
  const link = `${window.location.origin}/feedback`

  useEffect(() => { supabase.rpc('survey_stations').then(({ data: d }) => setStations(d ?? [])) }, [])
  useEffect(() => {
    QRCode.toDataURL(link, { width: 1024, margin: 2 }).then(setQrUrl)
    QRCode.toDataURL(link, { width: 1400, margin: 0, errorCorrectionLevel: 'H' }).then(setPosterQr)
  }, [link])
  const size = POSTER_SIZES.find(x => x.id === sizeId) ?? POSTER_SIZES[0]
  const posterSvg = useMemo(() => (posterQr ? buildPosterSvg({ w: size.w, h: size.h, qr: posterQr }) : ''), [posterQr, size])

  const args = useMemo(() => ({ p_kind: kind === 'all' ? null : kind, p_station: stationFilter || null }), [kind, stationFilter])

  useEffect(() => {
    let dead = false
    ;(async () => {
      setLoading(true); setErr('')
      const span = Math.round((new Date(to) - new Date(from)) / 86400000) + 1
      const pTo = shiftDay(from, -1), pFrom = shiftDay(pTo, -(span - 1))
      const [cur, old] = await Promise.all([
        supabase.rpc('survey_report', { p_from: from, p_to: to, ...args }),
        supabase.rpc('survey_report', { p_from: pFrom, p_to: pTo, ...args }),
      ])
      if (dead) return
      if (cur.error) {
        setErr(/Could not find|PGRST202|survey_report/i.test(cur.error.message || '') ? (isAr ? 'دالة التقرير غير مثبتة بالقاعدة — شغّل ملف survey_report.sql' : 'The report function is not installed in the database — run survey_report.sql') : cur.error.message)
        setData(null); setPrev(null)
      } else { setData(cur.data); setPrev(old.error ? null : old.data) }
      setLoading(false)
    })()
    return () => { dead = true }
  }, [from, to, args, isAr])

  // صوت العميل: الملاحظات وطلبات التواصل (تُجلب عند فتح التبويب فقط)
  useEffect(() => {
    if (tab !== 'voice') return
    let dead = false
    ;(async () => {
      let q = supabase.from('customer_surveys')
        .select('id, created_at, kind, station_id, from_station_id, ratings, comment, contact_phone')
        .or('comment.not.is.null,contact_phone.not.is.null')
        .gte('created_at', `${from}T00:00:00+03:00`).lte('created_at', `${to}T23:59:59.999+03:00`)
        .order('created_at', { ascending: false }).limit(150)
      if (args.p_kind) q = q.eq('kind', args.p_kind)
      if (args.p_station) q = q.or(`station_id.eq.${args.p_station},from_station_id.eq.${args.p_station},to_station_id.eq.${args.p_station}`)
      const { data: rows } = await q
      if (!dead) setVoice(rows ?? [])
    })()
    return () => { dead = true }
  }, [tab, from, to, args])

  // سجل الاستجابات بالوقت: يُجلب عند فتح التبويب فقط
  useEffect(() => {
    if (tab !== 'log') return
    let dead = false
    ;(async () => {
      let q = supabase.from('customer_surveys')
        .select('id, created_at, opened_at, kind, station_id, from_station_id, to_station_id, ratings, nps, lang, device_hash')
        .gte('created_at', `${from}T00:00:00+03:00`).lte('created_at', `${to}T23:59:59.999+03:00`)
        .order('created_at', { ascending: false }).limit(200)
      if (args.p_kind) q = q.eq('kind', args.p_kind)
      if (args.p_station) q = q.or(`station_id.eq.${args.p_station},from_station_id.eq.${args.p_station},to_station_id.eq.${args.p_station}`)
      const { data: rows } = await q
      if (!dead) setLogRows(rows ?? [])
    })()
    return () => { dead = true }
  }, [tab, from, to, args])

  const stLabel = s => (isAr ? (s.survey_name_ar || s.name_ar || s.name_en) : (s.name_en || s.name_ar))
  const stName = id => { const s = stations.find(x => x.id === id); return s ? stLabel(s) : '—' }
  const repName = s => { if (isAr) return s.name; const x = stations.find(y => y.id === s.id); return x ? (x.name_en || x.name_ar || s.name) : s.name }
  const focusId = r => (r.kind === 'station' ? r.station_id : r.from_station_id)
  const avgOfRow = r => { const v = Object.values(r.ratings ?? {}).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }

  const D = useMemo(() => {
    if (!data) return null
    const aspects = (data.aspects ?? []).map(a => ({ ...a, avg: num(a.avg) }))
    const tripAspects = aspects.filter(a => TRIP_KEYS.has(a.k))
    const stationAspects = aspects.filter(a => STATION_KEYS.has(a.k))
    const sts = (data.stations ?? []).map(s => ({ ...s, avg: num(s.avg), nps: num(s.nps), low: num(s.low) }))
    const ranked = sts.filter(s => s.avg != null && s.n >= 3)
    const pool = (ranked.length >= 2 ? ranked : sts.filter(s => s.avg != null)).slice().sort((a, b) => b.avg - a.avg)
    const sorted = aspects.slice().sort((a, b) => a.avg - b.avg)
    return {
      ...data, avg: num(data.avg), sat: num(data.sat), score: npsScore(data.nps),
      tripAspects, stationAspects, stationList: sts,
      weakest: sorted[0] ?? null, strongest: sorted.length ? sorted[sorted.length - 1] : null,
      best: pool[0] ?? null, worst: pool.length > 1 ? pool[pool.length - 1] : null,
      trend: (data.trend ?? []).map(t => ({ ...t, avg: num(t.avg) })),
    }
  }, [data])

  const sortedStations = useMemo(() => {
    if (!D) return []
    const a = [...D.stationList]
    if (sortBy === 'low') return a.sort((x, y) => (x.avg ?? 9) - (y.avg ?? 9))
    if (sortBy === 'high') return a.sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1))
    return a.sort((x, y) => y.n - x.n)
  }, [D, sortBy])

  const [busy, setBusy] = useState('')
  async function runExport(kindOf, fn) {
    setBusy(kindOf); setErr('')
    try { await fn() } catch (e) { setErr((isAr ? 'تعذّر إنشاء الملف: ' : 'Could not create the file: ') + (e?.message || e)) }
    setBusy('')
  }

  // تقرير PDF: نفتح النافذة فوراً من ضغطة المستخدم ثم نجلب أحدث الملاحظات ونطبع
  async function printPdf() {
    const w = openPrintWindow()
    if (!w) { setErr(isAr ? 'المتصفح منع النافذة — اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة' : 'Pop-ups are blocked — allow pop-ups for this site and try again'); return }
    let q = supabase.from('customer_surveys').select('id, created_at, kind, station_id, from_station_id, ratings, comment')
      .not('comment', 'is', null)
      .gte('created_at', `${from}T00:00:00+03:00`).lte('created_at', `${to}T23:59:59.999+03:00`)
      .order('created_at', { ascending: false }).limit(12)
    if (args.p_kind) q = q.eq('kind', args.p_kind)
    if (args.p_station) q = q.or(`station_id.eq.${args.p_station},from_station_id.eq.${args.p_station},to_station_id.eq.${args.p_station}`)
    const { data: vrows } = await q
    printInto(w, buildSurveyReportHtml({
      isAr, D, prev, summary, from, to, scopeText, stations: D.stationList, voice: vrows ?? [], npsLevel, scoreLevel,
      fns: { lbl, lblO, lblA, repName, stName, focusId, avgOfRow },
    }))
  }

  async function exportExcel() {
    let rows = [], page = 0
    for (;;) {
      let q = supabase.from('customer_surveys').select('*')
        .gte('created_at', `${from}T00:00:00+03:00`).lte('created_at', `${to}T23:59:59.999+03:00`)
        .order('created_at', { ascending: false }).range(page * 1000, page * 1000 + 999)
      if (args.p_kind) q = q.eq('kind', args.p_kind)
      if (args.p_station) q = q.or(`station_id.eq.${args.p_station},from_station_id.eq.${args.p_station},to_station_id.eq.${args.p_station}`)
      const { data: chunk, error } = await q
      if (error || !chunk?.length) break
      rows = rows.concat(chunk)
      if (chunk.length < 1000 || page >= 9) break
      page++
    }
    await exportSurveyExcel({
      isAr, rows, D, prev, summary, from, to, scopeText,
      fns: { stName, focusId, lbl, lblO, lblA },
      filename: isAr ? `رضا-العملاء-${from}_${to}` : `customer-satisfaction-${from}_${to}`,
    })
  }

  const prevScore = prev ? npsScore(prev.nps) : null
  const scopeText = [kind === 'trip' ? (isAr ? 'الرحلات' : 'Trips') : kind === 'station' ? (isAr ? 'المحطات' : 'Stations') : (isAr ? 'الرحلات والمحطات' : 'Trips and stations'), stationFilter ? stName(stationFilter) : (isAr ? 'كل المحطات' : 'All stations')].join(' · ')

  const summary = useMemo(() => {
    if (!D || !D.total) return []
    const out = []
    const nl = npsLevel(D.score, isAr)
    if (isAr) {
      out.push(`تم استلام ${D.total} استجابة (${D.trips} عن الرحلات و${D.total - D.trips} عن المحطات).`)
      if (D.score != null) out.push(`مؤشر التوصية NPS يبلغ ${D.score} ويُصنَّف «${nl}»، ${pct(D.nps.pro, D.nps.n)}% من العملاء داعمون و${pct(D.nps.det, D.nps.n)}% منتقدون.`)
      if (D.sat != null) out.push(`${D.sat}% من التقييمات راضية (4 أو 5) بمتوسط عام ${f1(D.avg)} من 5.`)
      if (D.strongest) out.push(`أقوى عنصر: ${lblA(D.strongest.k)} (${f1(D.strongest.avg)}).`)
      if (D.weakest && D.weakest.k !== D.strongest?.k) out.push(`أضعف عنصر ويحتاج أولوية: ${lblA(D.weakest.k)} (${f1(D.weakest.avg)}).`)
      if (D.best) out.push(`أفضل محطة أداءً: ${repName(D.best)} (${f1(D.best.avg)}).`)
      if (D.worst) out.push(`أقل محطة أداءً: ${repName(D.worst)} (${f1(D.worst.avg)}) وتستحق المتابعة.`)
      if (D.low) out.push(`${D.low} استجابة (${pct(D.low, D.total)}%) تضمنت تقييماً منخفضاً (1 أو 2)${D.contacts ? `، منها ${D.contacts} عميل ترك رقمه للتواصل` : ''}.`)
    } else {
      out.push(`${D.total} responses received (${D.trips} about trips and ${D.total - D.trips} about stations).`)
      if (D.score != null) out.push(`The NPS is ${D.score}, rated "${nl}": ${pct(D.nps.pro, D.nps.n)}% of customers are promoters and ${pct(D.nps.det, D.nps.n)}% are detractors.`)
      if (D.sat != null) out.push(`${D.sat}% of ratings are satisfied (4 or 5), with an overall average of ${f1(D.avg)} out of 5.`)
      if (D.strongest) out.push(`Strongest aspect: ${lblA(D.strongest.k)} (${f1(D.strongest.avg)}).`)
      if (D.weakest && D.weakest.k !== D.strongest?.k) out.push(`Weakest aspect, needs priority: ${lblA(D.weakest.k)} (${f1(D.weakest.avg)}).`)
      if (D.best) out.push(`Best performing station: ${repName(D.best)} (${f1(D.best.avg)}).`)
      if (D.worst) out.push(`Lowest performing station: ${repName(D.worst)} (${f1(D.worst.avg)}), worth following up.`)
      if (D.low) out.push(`${D.low} responses (${pct(D.low, D.total)}%) included a low rating (1 or 2)${D.contacts ? `, of which ${D.contacts} customers left their number to be contacted` : ''}.`)
    }
    return out
  }, [D, isAr, stations])

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-5">
      {/* الفلاتر */}
      <Card>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">{isAr ? 'الفترة' : 'Period'}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESETS.map(p => {
                const on = from === daysAgo(p.d - 1) && to === todayStr()
                return (
                  <button key={p.d} type="button" onClick={() => { setFrom(daysAgo(p.d - 1)); setTo(todayStr()) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{isAr ? p.ar : p.en}</button>
                )
              })}
              <DatePicker value={from} onChange={v => { setFrom(v); if (v && to && v > to) setTo(v) }} isAr={isAr} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white" />
              <span className="text-gray-300 text-xs">—</span>
              <DatePicker value={to} onChange={v => { setTo(v); if (v && from && v < from) setFrom(v) }} isAr={isAr} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white" />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">{isAr ? 'النوع' : 'Type'}</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[['all', isAr ? 'الكل' : 'All'], ['trip', isAr ? 'الرحلات' : 'Trips'], ['station', isAr ? 'المحطات' : 'Stations']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setKind(v)}
                  className={`px-3 py-1.5 text-xs font-semibold ${kind === v ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">{isAr ? 'المحطة' : 'Station'}</p>
            <select value={stationFilter} onChange={e => setStationFilter(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-48">
              <option value="">{isAr ? 'كل المحطات' : 'All stations'}</option>
              {stations.map(s => <option key={s.id} value={s.id}>{stLabel(s)}</option>)}
            </select>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <button type="button" onClick={() => runExport('pdf', printPdf)} disabled={!D?.total || !!busy}
              className="px-4 py-2 rounded-lg text-xs font-bold border border-slate-900 text-slate-900 bg-white disabled:opacity-40">{busy === 'pdf' ? (isAr ? 'جاري التجهيز…' : 'Preparing…') : (isAr ? 'طباعة / PDF' : 'Print / PDF')}</button>
            <button type="button" onClick={() => runExport('xlsx', exportExcel)} disabled={!D?.total || !!busy}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white disabled:opacity-40">{busy === 'xlsx' ? (isAr ? 'جاري الإنشاء…' : 'Creating…') : (isAr ? 'تصدير Excel' : 'Export Excel')}</button>
          </div>
        </div>
      </Card>

      {/* التبويبات */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {isAr ? t.ar : t.en}
          </button>
        ))}
      </div>

      {err && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl p-4">{err}</div>}
      {loading && <p className="text-center text-gray-400 py-12 text-sm">{isAr ? 'جاري تحميل المؤشرات…' : 'Loading indicators…'}</p>}

      {!loading && !err && tab !== 'qr' && tab !== 'voice' && D && D.total === 0 && (
        <p className="text-center text-gray-400 py-12 text-sm">{isAr ? 'لا توجد استجابات ضمن الفترة والفلاتر المحددة' : 'No responses within the selected period and filters'}</p>
      )}

      {!loading && D && D.total > 0 && tab === 'overview' && (
        <>
          <div>
            <h2 className="text-lg font-extrabold text-gray-900">{isAr ? 'لوحة مؤشرات رضا العملاء' : 'Customer Satisfaction Dashboard'}</h2>
            <p className="text-xs text-gray-500 mt-1">{dayLabel(from)} → {dayLabel(to)} · {scopeText}</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label={isAr ? 'عدد الاستجابات' : 'Responses'} value={D.total}
              foot={<Delta cur={D.total} prev={prev?.total} digits={0} />} />
            <Kpi label={isAr ? 'صافي نقاط التوصية (NPS)' : 'Net Promoter Score (NPS)'} value={D.score ?? '—'} valueClass={npsTone(D.score)} level={npsLevel(D.score, isAr)}
              foot={<Delta cur={D.score} prev={prevScore} digits={0} />} />
            <Kpi label={isAr ? 'مؤشر الرضا العام (من 5)' : 'Overall satisfaction (out of 5)'} value={f1(D.avg)} valueClass={tone(D.avg)} level={scoreLevel(D.avg, isAr)}
              foot={<Delta cur={D.avg} prev={prev ? num(prev.avg) : null} />} />
            <Kpi label={isAr ? 'نسبة العملاء الراضين' : 'Satisfied customers'} value={D.sat == null ? '—' : `${D.sat}%`} valueClass={tone(D.sat, 80, 60)}
              foot={<Delta cur={D.sat} prev={prev ? num(prev.sat) : null} digits={0} unit="%" />} />
          </div>

          <div className="grid lg:grid-cols-5 gap-4">
            <Card title={isAr ? 'الخلاصة التنفيذية' : 'Executive summary'} className="lg:col-span-3">
              <ul className="space-y-2.5">
                {summary.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-gray-700 leading-relaxed">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />{s}
                  </li>
                ))}
              </ul>
            </Card>
            {D.nps?.n > 0 && (
              <Card title={isAr ? 'توزيع ولاء العملاء' : 'Customer loyalty distribution'} hint={isAr ? 'منتقدون 0–6 · محايدون 7–8 · داعمون 9–10' : 'Detractors 0–6 · Passives 7–8 · Promoters 9–10'} className="lg:col-span-2">
                <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                  <div className="bg-red-500" style={{ width: `${pct(D.nps.det, D.nps.n)}%` }} />
                  <div className="bg-amber-400" style={{ width: `${pct(D.nps.pas, D.nps.n)}%` }} />
                  <div className="bg-green-500" style={{ width: `${pct(D.nps.pro, D.nps.n)}%` }} />
                </div>
                <div className="grid grid-cols-3 mt-5 text-center gap-2">
                  {[[isAr ? 'منتقدون' : 'Detractors', D.nps.det, 'text-red-600'], [isAr ? 'محايدون' : 'Passives', D.nps.pas, 'text-amber-600'], [isAr ? 'داعمون' : 'Promoters', D.nps.pro, 'text-green-700']].map(([l, n, c]) => (
                    <div key={l} className="bg-gray-50 rounded-xl py-3">
                      <p className={`text-2xl font-extrabold ${c}`}>{pct(n, D.nps.n)}%</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{l} ({n})</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <Card title={isAr ? 'اتجاه الرضا عبر الزمن' : 'Satisfaction trend over time'} hint={isAr ? 'متوسط الرضا (الخط) مع عدد الاستجابات (الأعمدة)' : 'Average satisfaction (line) with number of responses (bars)'}>
            <TrendChart data={D.trend} bucket={D.bucket} />
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            {D.tripAspects.length > 0 && <Card title={isAr ? 'أداء عناصر الرحلة' : 'Trip aspects performance'} hint={isAr ? 'متوسط التقييم من 5 · الأضعف أولاً' : 'Average rating out of 5 · weakest first'}><ScoreRows items={D.tripAspects} /></Card>}
            {D.stationAspects.length > 0 && <Card title={isAr ? 'أداء عناصر المحطة' : 'Station aspects performance'} hint={isAr ? 'متوسط التقييم من 5 · الأضعف أولاً' : 'Average rating out of 5 · weakest first'}><ScoreRows items={D.stationAspects} /></Card>}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title={isAr ? 'أولويات التحسين' : 'Improvement priorities'} hint={isAr ? 'نسبة العملاء الذين اختاروا كل بند' : 'Share of customers who selected each item'}><CountRows items={(D.improve ?? []).slice(0, 8)} total={D.total} /></Card>
            {(D.reasons ?? []).length > 0 && <Card title={isAr ? 'أسباب عدم الرضا' : 'Reasons for dissatisfaction'} hint={isAr ? 'من العملاء ذوي التقييم المنخفض' : 'From customers with a low rating'}><CountRows items={D.reasons.slice(0, 8)} total={D.total} /></Card>}
          </div>
        </>
      )}

      {!loading && D && D.total > 0 && tab === 'stations' && (
        <Card title={isAr ? 'أداء المحطات' : 'Station performance'} hint={isAr ? 'الرحلات تُنسب إلى محطة الركوب' : 'Trips are attributed to the boarding station'}>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-gray-500">{isAr ? 'الترتيب:' : 'Sort by:'}</span>
            {[['n', isAr ? 'الأكثر استجابات' : 'Most responses'], ['low', isAr ? 'الأقل رضا' : 'Lowest satisfaction'], ['high', isAr ? 'الأعلى رضا' : 'Highest satisfaction']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setSortBy(v)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${sortBy === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2.5 text-start font-medium">{isAr ? 'المحطة' : 'Station'}</th><th className="pb-2.5 text-center font-medium">{isAr ? 'الاستجابات' : 'Responses'}</th>
                <th className="pb-2.5 text-center font-medium">{isAr ? 'متوسط الرضا' : 'Avg. satisfaction'}</th><th className="pb-2.5 text-center font-medium">{isAr ? 'المستوى' : 'Level'}</th>
                <th className="pb-2.5 text-center font-medium">NPS</th><th className="pb-2.5 text-center font-medium">{isAr ? 'تقييمات منخفضة' : 'Low ratings'}</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {sortedStations.map(s => (
                  <tr key={s.id}>
                    <td className="py-3 text-gray-900 font-medium" dir="auto">{repName(s)}</td>
                    <td className="py-3 text-center text-gray-500">{s.n}</td>
                    <td className="py-3 text-center"><ScorePill v={s.avg} /></td>
                    <td className={`py-3 text-center text-xs font-semibold ${tone(s.avg)}`}>{scoreLevel(s.avg, isAr)}</td>
                    <td dir="ltr" className={`py-3 text-center font-bold ${npsTone(s.nps)}`}>{s.nps ?? '—'}</td>
                    <td className={`py-3 text-center text-xs font-semibold ${s.low >= 30 ? 'text-red-600' : 'text-gray-500'}`}>{s.low}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && D && D.total > 0 && tab === 'audience' && (
        <div className="grid md:grid-cols-2 gap-4">
          <CutTable title={isAr ? 'حسب الفئة العمرية' : 'By age group'} items={D.age ?? []} />
          <CutTable title={isAr ? 'حسب نوع المسافر' : 'By traveler type'} items={D.traveler ?? []} />
          <CutTable title={isAr ? 'حسب غرض الرحلة' : 'By trip purpose'} items={D.purpose ?? []} />
          <CutTable title={isAr ? 'حسب تكرار السفر' : 'By travel frequency'} items={D.freq ?? []} />
        </div>
      )}

      {!loading && tab === 'log' && (
        <Card title={isAr ? 'سجل الاستجابات' : 'Response log'} hint={isAr ? 'وقت فتح الاستبيان ووقت إرساله ومدة التعبئة (بتوقيت الرياض) — آخر 200 استجابة' : 'Survey open time, submit time and completion duration (Riyadh time) — last 200 responses'}>
          {!logRows.length ? <p className="text-sm text-gray-400 py-6 text-center">{isAr ? 'لا توجد استجابات ضمن الفترة' : 'No responses within the period'}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2.5 text-start font-medium">{isAr ? 'التاريخ' : 'Date'}</th><th className="pb-2.5 text-center font-medium">{isAr ? 'وقت الفتح' : 'Opened'}</th>
                  <th className="pb-2.5 text-center font-medium">{isAr ? 'وقت الإرسال' : 'Submitted'}</th><th className="pb-2.5 text-center font-medium">{isAr ? 'المدة' : 'Duration'}</th>
                  <th className="pb-2.5 text-start font-medium">{isAr ? 'النوع / المحطة' : 'Type / Station'}</th><th className="pb-2.5 text-center font-medium">NPS</th>
                  <th className="pb-2.5 text-center font-medium">{isAr ? 'التقييم' : 'Rating'}</th><th className="pb-2.5 text-center font-medium">{isAr ? 'الجهاز' : 'Device'}</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {logRows.map(r => {
                    const hm = d => d ? new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
                    const secs = r.opened_at ? Math.max(0, Math.round((new Date(r.created_at) - new Date(r.opened_at)) / 1000)) : null
                    return (
                      <tr key={r.id}>
                        <td className="py-2.5 text-gray-600 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' })}</td>
                        <td className="py-2.5 text-center font-mono text-xs text-gray-500" dir="ltr">{hm(r.opened_at)}</td>
                        <td className="py-2.5 text-center font-mono text-xs text-gray-800" dir="ltr">{hm(r.created_at)}</td>
                        <td className="py-2.5 text-center text-xs text-gray-500">{secs == null ? '—' : secs >= 60 ? (isAr ? `${Math.floor(secs / 60)}د ${secs % 60}ث` : `${Math.floor(secs / 60)}m ${secs % 60}s`) : (isAr ? `${secs}ث` : `${secs}s`)}</td>
                        <td className="py-2.5 text-gray-800" dir="auto">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold me-1.5 ${r.kind === 'trip' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{r.kind === 'trip' ? (isAr ? 'رحلة' : 'Trip') : (isAr ? 'محطة' : 'Station')}</span>
                          {stName(focusId(r))}{r.kind === 'trip' && r.to_station_id ? ` ${isAr ? '←' : '→'} ${stName(r.to_station_id)}` : ''}
                        </td>
                        <td dir="ltr" className={`py-2.5 text-center font-bold ${npsTone(r.nps == null ? null : (r.nps >= 9 ? 100 : r.nps >= 7 ? 0 : -100))}`}>{r.nps ?? '—'}</td>
                        <td className="py-2.5 text-center"><ScorePill v={avgOfRow(r)} /></td>
                        <td className="py-2.5 text-center font-mono text-[10px] text-gray-400" dir="ltr">{r.device_hash ? r.device_hash.slice(0, 6) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {!loading && tab === 'voice' && (
        <Card title={isAr ? 'صوت العميل' : 'Voice of customer'} hint={isAr ? 'ملاحظات العملاء وطلبات التواصل — الأحدث أولاً' : 'Customer comments and contact requests — newest first'}>
          {!voice.length ? <p className="text-sm text-gray-400 py-6 text-center">{isAr ? 'لا توجد ملاحظات أو طلبات تواصل ضمن الفترة' : 'No comments or contact requests within the period'}</p> : (
            <div className="divide-y divide-gray-50">
              {voice.map(r => (
                <div key={r.id} className="py-3.5">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${r.kind === 'trip' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{r.kind === 'trip' ? (isAr ? 'رحلة' : 'Trip') : (isAr ? 'محطة' : 'Station')}</span>
                    <span className="text-gray-600" dir="auto">{stName(focusId(r))}</span>
                    <ScorePill v={avgOfRow(r)} />
                    <span>{new Date(r.created_at).toLocaleDateString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB')}</span>
                    {r.contact_phone && <span dir="ltr" className="font-mono text-gray-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded">{isAr ? 'طلب تواصل:' : 'Contact request:'} {r.contact_phone}</span>}
                  </div>
                  {r.comment ? <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{r.comment}</p> : <p className="text-xs text-gray-400">{isAr ? 'بدون ملاحظة نصية' : 'No written comment'}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'qr' && (
        <div className="grid lg:grid-cols-5 gap-4">
          <Card title={isAr ? 'ملصق الاستبيان للطباعة' : 'Printable survey poster'} hint={isAr ? 'اختر المقاس ثم حمّل أو اطبع — الملصق ثلاثي اللغة (عربي · English · اردو)' : 'Choose a size, then download or print — the poster is trilingual (Arabic · English · Urdu)'} className="lg:col-span-3">
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 mb-1.5">{isAr ? 'المقاس' : 'Size'}</p>
                <select value={sizeId} onChange={e => setSizeId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64">
                  {POSTER_SIZES.map(z => <option key={z.id} value={z.id}>{isAr ? z.label : (POSTER_LABELS_EN[z.id] || z.label)}</option>)}
                </select>
              </div>
              <button type="button" disabled={!posterSvg} onClick={() => downloadPosterPng(posterSvg, size.w, size.h, `nwbus-qr-${size.id}.png`)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white disabled:opacity-40">{isAr ? 'تحميل PNG (300 DPI)' : 'Download PNG (300 DPI)'}</button>
              <button type="button" disabled={!posterSvg} onClick={() => printPoster(posterSvg, size.w, size.h)}
                className="px-4 py-2 rounded-lg text-xs font-bold border border-gray-200 text-gray-800 bg-white disabled:opacity-40">{isAr ? 'طباعة / حفظ PDF' : 'Print / Save PDF'}</button>
            </div>
            <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
              {isAr
                ? 'عند الطباعة اختر الحجم الفعلي (100%) وبدون هوامش. لو بتطبع بمطبعة أرسل لهم ملف PNG بالمقاس نفسه. الرمز بمستوى تصحيح أخطاء عالٍ (H) فيبقى مقروءاً حتى لو اتّسخ الملصق أو انخدش جزء منه.'
                : 'When printing, choose actual size (100%) with no margins. If using a print shop, send them the PNG file at the same size. The code uses a high error-correction level (H), so it stays scannable even if the poster gets dirty or partly scratched.'}
            </p>
            <div className="bg-gray-50 rounded-2xl p-5 flex justify-center">
              {posterSvg
                ? <img alt={isAr ? 'معاينة الملصق' : 'Poster preview'} className="shadow-lg bg-white" style={{ maxHeight: 460, maxWidth: '100%', aspectRatio: `${size.w} / ${size.h}` }}
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(posterSvg)}`} />
                : <p className="text-sm text-gray-400 py-10">{isAr ? 'جاري التجهيز…' : 'Preparing…'}</p>}
            </div>
          </Card>
          <Card title={isAr ? 'الرمز والرابط' : 'Code and link'} hint={isAr ? 'يفتح الاستبيان بلغة جوال العميل' : "Opens the survey in the customer's phone language"} className="lg:col-span-2 self-start">
            {qrUrl && <img src={qrUrl} alt="QR" className="w-44 h-44 border border-gray-100 rounded-xl mx-auto" />}
            <p className="text-xs font-mono text-gray-600 break-all bg-gray-50 rounded-lg p-3 mt-4" dir="ltr">{link}</p>
            <div className="flex gap-2 mt-4 flex-wrap">
              <a href={qrUrl} download="nwbus-feedback-qr.png" className="text-xs bg-slate-900 text-white rounded-lg px-4 py-2 font-bold">{isAr ? 'الرمز فقط PNG' : 'Code only PNG'}</a>
              <button type="button" onClick={() => navigator.clipboard?.writeText(link)} className="text-xs border border-gray-200 rounded-lg px-4 py-2 text-gray-700 font-semibold">{isAr ? 'نسخ الرابط' : 'Copy link'}</button>
              <a href={link} target="_blank" rel="noreferrer" className="text-xs border border-gray-200 rounded-lg px-4 py-2 text-gray-700 font-semibold">{isAr ? 'معاينة' : 'Preview'}</a>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
