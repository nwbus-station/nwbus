import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase'
import { todayStr } from '../../utils/dates'
import { AR_LABELS, AR_O, AR_A, TRIP_ASPECTS, STATION_ASPECTS } from '../../utils/feedbackConfig'

const lbl = k => AR_LABELS[k] || k
const lblO = k => AR_O[k] || k
const lblA = k => AR_A[k] || k
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
const f1 = n => (n == null ? '—' : n.toFixed(1))
const rowScores = r => Object.values(r.ratings ?? {}).map(Number)
const rowAvg = r => mean(rowScores(r))
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

function npsParts(rows) {
  const v = rows.map(r => r.nps).filter(n => n != null)
  if (!v.length) return null
  const pro = v.filter(n => n >= 9).length
  const det = v.filter(n => n <= 6).length
  return { n: v.length, pro, det, pas: v.length - pro - det, score: Math.round(((pro - det) / v.length) * 100) }
}
const npsScore = rows => npsParts(rows)?.score ?? null

const tone = (v, good = 4, mid = 3) => (v == null ? 'text-gray-400' : v >= good ? 'text-green-700' : v >= mid ? 'text-amber-600' : 'text-red-600')
const npsTone = n => (n == null ? 'text-gray-400' : n >= 50 ? 'text-green-700' : n >= 0 ? 'text-amber-600' : 'text-red-600')
const barTone = v => (v >= 4 ? 'bg-green-500' : v >= 3 ? 'bg-amber-400' : 'bg-red-500')

function ScorePill({ v }) {
  const c = v == null ? 'bg-gray-50 text-gray-400' : v >= 4 ? 'bg-green-50 text-green-700' : v >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
  return <span className={`inline-block min-w-[2.5rem] text-center px-2 py-0.5 rounded-full text-xs font-bold ${c}`}>{f1(v)}</span>
}

function Card({ title, hint, children, className = '' }) {
  return (
    <section className={`bg-white border border-gray-100 rounded-2xl shadow-sm p-5 ${className}`}>
      {title && (
        <div className="mb-4">
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

function Kpi({ label, value, sub, valueClass = 'text-gray-900' }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className={`text-4xl font-extrabold mt-2 leading-none ${valueClass}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-2 min-h-[1rem]">{sub}</p>
    </div>
  )
}

function ScoreRows({ items }) {
  if (!items.length) return <p className="text-sm text-gray-400">لا توجد بيانات</p>
  return (
    <div className="space-y-3">
      {items.map(a => (
        <div key={a.k} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <span className="text-sm text-gray-700 truncate" title={lblA(a.k)}>{lblA(a.k)}</span>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-2 rounded-full ${barTone(a.avg)}`} style={{ width: `${(a.avg / 5) * 100}%` }} /></div>
          <span className="flex items-center gap-1.5"><ScorePill v={a.avg} /><span className="text-[11px] text-gray-400 w-8">({a.n})</span></span>
        </div>
      ))}
    </div>
  )
}

function CountRows({ items, total }) {
  if (!items.length) return <p className="text-sm text-gray-400">لا توجد بيانات</p>
  return (
    <div className="space-y-3">
      {items.map(([k, n]) => (
        <div key={k} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <span className="text-sm text-gray-700 truncate">{lblO(k)}</span>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-2 rounded-full bg-slate-700" style={{ width: `${pct(n, total)}%` }} /></div>
          <span className="text-xs font-semibold text-gray-600 w-16 text-left">{pct(n, total)}% <span className="text-gray-400 font-normal">({n})</span></span>
        </div>
      ))}
    </div>
  )
}

function CutTable({ title, field, rows }) {
  const groups = useMemo(() => {
    const m = {}
    rows.forEach(r => { const k = r[field]; if (k) (m[k] ??= []).push(r) })
    return Object.entries(m).map(([k, rs]) => ({ k, n: rs.length, avg: mean(rs.map(rowAvg).filter(x => x != null)), nps: npsScore(rs) })).sort((a, b) => b.n - a.n)
  }, [rows, field])
  return (
    <Card title={title}>
      {!groups.length ? <p className="text-sm text-gray-400">لا توجد بيانات بعد</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-400">
            <th className="pb-2 text-right font-medium">الفئة</th><th className="pb-2 text-center font-medium">العدد</th>
            <th className="pb-2 text-center font-medium">المتوسط</th><th className="pb-2 text-center font-medium">NPS</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {groups.map(g => (
              <tr key={g.k}>
                <td className="py-2.5 text-gray-800">{lbl(g.k)}</td>
                <td className="py-2.5 text-center text-gray-500">{g.n}</td>
                <td className="py-2.5 text-center"><ScorePill v={g.avg} /></td>
                <td className={`py-2.5 text-center font-bold ${npsTone(g.nps)}`}>{g.nps ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

const TABS = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'stations', label: 'المحطات' },
  { id: 'audience', label: 'الجمهور' },
  { id: 'comments', label: 'الملاحظات' },
  { id: 'qr', label: 'رمز QR' },
]
const PRESETS = [{ d: 7, l: '7 أيام' }, { d: 30, l: '30 يوم' }, { d: 90, l: '90 يوم' }]
const daysAgo = d => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10) }

export default function FeedbackReport() {
  const [from, setFrom] = useState(() => daysAgo(30))
  const [to, setTo] = useState(todayStr())
  const [kind, setKind] = useState('all')
  const [stationFilter, setStationFilter] = useState('')
  const [tab, setTab] = useState('overview')
  const [sortBy, setSortBy] = useState('n')
  const [rows, setRows] = useState([])
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const link = `${window.location.origin}/feedback`

  useEffect(() => { supabase.rpc('survey_stations').then(({ data }) => setStations(data ?? [])) }, [])
  useEffect(() => { QRCode.toDataURL(link, { width: 1024, margin: 2 }).then(setQrUrl) }, [link])

  useEffect(() => {
    let dead = false
    ;(async () => {
      setLoading(true); setErr('')
      const end = new Date(to + 'T00:00:00'); end.setDate(end.getDate() + 1)
      const { data, error } = await supabase.from('customer_surveys').select('*')
        .gte('created_at', new Date(from + 'T00:00:00').toISOString()).lt('created_at', end.toISOString())
        .order('created_at', { ascending: false }).limit(5000)
      if (dead) return
      if (error) setErr(error.message)
      setRows(data ?? []); setLoading(false)
    })()
    return () => { dead = true }
  }, [from, to])

  const stName = id => { const s = stations.find(x => x.id === id); return s ? (s.survey_name_ar || s.name_ar || s.name_en) : '—' }
  const focusId = r => (r.kind === 'station' ? r.station_id : r.from_station_id)

  const filtered = useMemo(() => rows.filter(r =>
    (kind === 'all' || r.kind === kind) && (!stationFilter || r.station_id === stationFilter || r.from_station_id === stationFilter || r.to_station_id === stationFilter)
  ), [rows, kind, stationFilter])

  const S = useMemo(() => {
    const all = filtered.flatMap(rowScores)
    const aspectMap = {}
    filtered.forEach(r => Object.entries(r.ratings ?? {}).forEach(([k, v]) => (aspectMap[k] ??= []).push(Number(v))))
    const aspectList = keys => keys.map(({ key }) => aspectMap[key] ? { k: key, n: aspectMap[key].length, avg: mean(aspectMap[key]) } : null).filter(Boolean)
    const tripAspects = aspectList(TRIP_ASPECTS)
    const stationAspects = aspectList(STATION_ASPECTS)
    const byStation = {}
    filtered.forEach(r => { const id = focusId(r); if (id) (byStation[id] ??= []).push(r) })
    const stationRows = Object.entries(byStation).map(([id, rs]) => ({
      id, n: rs.length, avg: mean(rs.map(rowAvg).filter(x => x != null)), nps: npsScore(rs),
      low: pct(rs.filter(r => rowScores(r).some(x => x <= 2)).length, rs.length),
    }))
    const count = f => {
      const m = {}; filtered.forEach(r => (r[f] ?? []).forEach(k => { m[k] = (m[k] || 0) + 1 }))
      return Object.entries(m).sort((a, b) => b[1] - a[1])
    }
    const everyAspect = [...tripAspects, ...stationAspects].sort((a, b) => a.avg - b.avg)
    const ranked = stationRows.filter(s => s.avg != null && s.n >= 3)
    const pool = ranked.length >= 2 ? ranked : stationRows.filter(s => s.avg != null)
    const byAvg = [...pool].sort((a, b) => b.avg - a.avg)
    return {
      total: filtered.length, trips: filtered.filter(r => r.kind === 'trip').length,
      avg: mean(all), sat: all.length ? pct(all.filter(x => x >= 4).length, all.length) : null,
      nps: npsParts(filtered), tripAspects, stationAspects, stationRows,
      improve: count('improve'), reasons: count('low_reason'),
      weakest: everyAspect[0] ?? null, strongest: everyAspect[everyAspect.length - 1] ?? null,
      bestStation: byAvg[0] ?? null, worstStation: byAvg.length > 1 ? byAvg[byAvg.length - 1] : null,
    }
  }, [filtered, stations]) // eslint-disable-line react-hooks/exhaustive-deps

  const sortedStations = useMemo(() => {
    const a = [...S.stationRows]
    if (sortBy === 'low') return a.sort((x, y) => (x.avg ?? 9) - (y.avg ?? 9))
    if (sortBy === 'high') return a.sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1))
    return a.sort((x, y) => y.n - x.n)
  }, [S.stationRows, sortBy])

  function exportExcel() {
    const data = filtered.map(r => ({
      'التاريخ': new Date(r.created_at).toLocaleString('ar-SA-u-ca-gregory'),
      'النوع': r.kind === 'trip' ? 'رحلة' : 'محطة',
      'المحطة': stName(focusId(r)),
      'من': r.kind === 'trip' ? stName(r.from_station_id) : '', 'إلى': r.kind === 'trip' ? stName(r.to_station_id) : '',
      'رقم الرحلة': r.trip_number ?? '', 'NPS': r.nps ?? '', 'المتوسط': rowAvg(r)?.toFixed(2) ?? '',
      ...Object.fromEntries(Object.entries(r.ratings ?? {}).map(([k, v]) => [lblA(k), v])),
      'يحتاج تحسين': (r.improve ?? []).map(lblO).join('، '), 'السبب': (r.low_reason ?? []).map(lblO).join('، '),
      'ملاحظات': r.comment ?? '', 'الفئة العمرية': lbl(r.age_group ?? ''), 'نوع المسافر': lbl(r.traveler_type ?? ''),
      'غرض الرحلة': lbl(r.trip_purpose ?? ''), 'التكرار': lbl(r.frequency ?? ''), 'جوال': r.contact_phone ?? '', 'اللغة': r.lang ?? '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'استبيان العملاء')
    XLSX.writeFile(wb, `استبيان-العملاء-${from}_${to}.xlsx`)
  }

  const comments = filtered.filter(r => r.comment)
  const insight = (label, text, tone_) => (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className={`text-sm font-semibold text-end ${tone_ || 'text-gray-800'}`}>{text}</span>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* الفلاتر */}
      <Card>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">الفترة</p>
            <div className="flex items-center gap-1.5">
              {PRESETS.map(p => (
                <button key={p.d} type="button" onClick={() => { setFrom(daysAgo(p.d)); setTo(todayStr()) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${from === daysAgo(p.d) && to === todayStr() ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{p.l}</button>
              ))}
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
              <span className="text-gray-300 text-xs">—</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">النوع</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[['all', 'الكل'], ['trip', 'الرحلات'], ['station', 'المحطات']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setKind(v)}
                  className={`px-3 py-1.5 text-xs font-semibold ${kind === v ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">المحطة</p>
            <select value={stationFilter} onChange={e => setStationFilter(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-44">
              <option value="">كل المحطات</option>
              {stations.map(s => <option key={s.id} value={s.id}>{s.survey_name_ar || s.name_ar || s.name_en}</option>)}
            </select>
          </div>
          <button type="button" onClick={exportExcel} disabled={!filtered.length}
            className="ms-auto px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white disabled:opacity-40">تصدير Excel</button>
        </div>
      </Card>

      {/* التبويبات الفرعية */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {t.label}{t.id === 'comments' && comments.length ? <span className="ms-1.5 text-[11px] text-gray-400">({comments.length})</span> : null}
          </button>
        ))}
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {loading && <p className="text-center text-gray-400 py-12 text-sm">جاري التحميل…</p>}

      {!loading && tab === 'overview' && (
        S.total === 0 ? <p className="text-center text-gray-400 py-12 text-sm">لا توجد استبيانات بهذه الفترة</p> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi label="عدد الاستبيانات" value={S.total} sub={`${S.trips} رحلة · ${S.total - S.trips} محطة`} />
              <Kpi label="مؤشر التوصية NPS" value={S.nps?.score ?? '—'} valueClass={npsTone(S.nps?.score)} sub={S.nps ? `من ${S.nps.n} إجابة` : 'بدون إجابات'} />
              <Kpi label="متوسط التقييم" value={f1(S.avg)} valueClass={tone(S.avg)} sub="من 5" />
              <Kpi label="نسبة الرضا" value={S.sat == null ? '—' : `${S.sat}%`} valueClass={tone(S.sat, 80, 60)} sub="تقييمات 4 و 5" />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {S.nps && (
                <Card title="توزيع التوصية" hint="منتقدون 0–6 · محايدون 7–8 · داعمون 9–10">
                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                    <div className="bg-red-500" style={{ width: `${pct(S.nps.det, S.nps.n)}%` }} />
                    <div className="bg-amber-400" style={{ width: `${pct(S.nps.pas, S.nps.n)}%` }} />
                    <div className="bg-green-500" style={{ width: `${pct(S.nps.pro, S.nps.n)}%` }} />
                  </div>
                  <div className="grid grid-cols-3 mt-3 text-center">
                    {[['منتقدون', S.nps.det, 'text-red-600'], ['محايدون', S.nps.pas, 'text-amber-600'], ['داعمون', S.nps.pro, 'text-green-700']].map(([l, n, c]) => (
                      <div key={l}><p className={`text-xl font-extrabold ${c}`}>{pct(n, S.nps.n)}%</p><p className="text-xs text-gray-500">{l} ({n})</p></div>
                    ))}
                  </div>
                </Card>
              )}
              <Card title="أبرز النتائج">
                {S.strongest && insight('أقوى جانب', `${lblA(S.strongest.k)} (${f1(S.strongest.avg)})`, 'text-green-700')}
                {S.weakest && S.weakest.k !== S.strongest?.k && insight('أضعف جانب', `${lblA(S.weakest.k)} (${f1(S.weakest.avg)})`, 'text-red-600')}
                {S.bestStation && insight('أفضل محطة', `${stName(S.bestStation.id)} (${f1(S.bestStation.avg)})`)}
                {S.worstStation && insight('أضعف محطة', `${stName(S.worstStation.id)} (${f1(S.worstStation.avg)})`)}
                {!S.strongest && <p className="text-sm text-gray-400">لا توجد بيانات كافية</p>}
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {S.tripAspects.length > 0 && <Card title="جوانب الرحلة" hint="من 5"><ScoreRows items={S.tripAspects} /></Card>}
              {S.stationAspects.length > 0 && <Card title="جوانب المحطة" hint="من 5"><ScoreRows items={S.stationAspects} /></Card>}
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card title="أكثر ما يحتاج تحسين" hint="نسبة المشاركين اللي اختاروه"><CountRows items={S.improve.slice(0, 8)} total={S.total} /></Card>
              {S.reasons.length > 0 && <Card title="أسباب التقييم المنخفض"><CountRows items={S.reasons.slice(0, 8)} total={S.total} /></Card>}
            </div>
          </>
        )
      )}

      {!loading && tab === 'stations' && (
        <Card title="تقييم كل محطة" hint="للرحلات: تُنسب لمحطة الركوب">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-500">ترتيب:</span>
            {[['n', 'الأكثر استبيانات'], ['low', 'الأقل تقييماً'], ['high', 'الأعلى تقييماً']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setSortBy(v)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${sortBy === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
            ))}
          </div>
          {!sortedStations.length ? <p className="text-sm text-gray-400 py-6 text-center">لا توجد بيانات</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2.5 text-right font-medium">المحطة</th><th className="pb-2.5 text-center font-medium">الاستبيانات</th>
                  <th className="pb-2.5 text-center font-medium">المتوسط</th><th className="pb-2.5 text-center font-medium">NPS</th><th className="pb-2.5 text-center font-medium">غير راضين</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedStations.map(s => (
                    <tr key={s.id}>
                      <td className="py-3 text-gray-900 font-medium" dir="auto">{stName(s.id)}</td>
                      <td className="py-3 text-center text-gray-500">{s.n}</td>
                      <td className="py-3 text-center"><ScorePill v={s.avg} /></td>
                      <td className={`py-3 text-center font-bold ${npsTone(s.nps)}`}>{s.nps ?? '—'}</td>
                      <td className={`py-3 text-center text-xs font-semibold ${s.low >= 30 ? 'text-red-600' : 'text-gray-500'}`}>{s.low}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {!loading && tab === 'audience' && (
        <div className="grid md:grid-cols-2 gap-4">
          <CutTable title="حسب الفئة العمرية" field="age_group" rows={filtered} />
          <CutTable title="حسب نوع المسافر" field="traveler_type" rows={filtered} />
          <CutTable title="حسب غرض الرحلة" field="trip_purpose" rows={filtered} />
          <CutTable title="حسب تكرار السفر" field="frequency" rows={filtered} />
        </div>
      )}

      {!loading && tab === 'comments' && (
        <Card title="الملاحظات" hint="الأحدث أولاً — الرقم بجانب الملاحظة يظهر لمن طلب التواصل">
          {!comments.length ? <p className="text-sm text-gray-400 py-6 text-center">لا توجد ملاحظات بهذه الفترة</p> : (
            <div className="divide-y divide-gray-50">
              {comments.slice(0, 100).map(r => (
                <div key={r.id} className="py-3.5">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${r.kind === 'trip' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{r.kind === 'trip' ? 'رحلة' : 'محطة'}</span>
                    <span className="text-gray-600" dir="auto">{stName(focusId(r))}</span>
                    <ScorePill v={rowAvg(r)} />
                    <span>{new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</span>
                    {r.contact_phone && <span dir="ltr" className="font-mono text-gray-700 bg-gray-50 px-2 py-0.5 rounded">{r.contact_phone}</span>}
                  </div>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'qr' && (
        <Card title="رمز QR الموحّد للحافلات" hint="يفتح الاستبيان بالعربي أو English أو اردو حسب لغة جوال العميل">
          <div className="flex flex-wrap items-center gap-6">
            {qrUrl && <img src={qrUrl} alt="QR" className="w-44 h-44 border border-gray-100 rounded-xl" />}
            <div className="flex-1 min-w-[220px]">
              <p className="text-xs font-mono text-gray-600 break-all bg-gray-50 rounded-lg p-3" dir="ltr">{link}</p>
              <div className="flex gap-2 mt-4">
                <a href={qrUrl} download="nwbus-feedback-qr.png" className="text-xs bg-slate-900 text-white rounded-lg px-4 py-2 font-bold">تحميل PNG</a>
                <button type="button" onClick={() => navigator.clipboard?.writeText(link)} className="text-xs border border-gray-200 rounded-lg px-4 py-2 text-gray-700 font-semibold">نسخ الرابط</button>
                <a href={link} target="_blank" rel="noreferrer" className="text-xs border border-gray-200 rounded-lg px-4 py-2 text-gray-700 font-semibold">معاينة</a>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
