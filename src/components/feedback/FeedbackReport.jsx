import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase'
import { todayStr } from '../../utils/dates'
import { AR_LABELS } from '../../utils/feedbackConfig'

const lbl = k => AR_LABELS[k] || k
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
const f1 = n => (n == null ? '—' : n.toFixed(1))
const rowScores = r => Object.values(r.ratings ?? {}).map(Number)
const rowAvg = r => mean(rowScores(r))
const npsOf = rows => {
  const v = rows.map(r => r.nps).filter(n => n != null)
  if (!v.length) return null
  return Math.round(((v.filter(n => n >= 9).length - v.filter(n => n <= 6).length) / v.length) * 100)
}
const npsColor = n => (n == null ? 'text-gray-400' : n >= 50 ? 'text-green-600' : n >= 0 ? 'text-amber-500' : 'text-red-500')
const scoreColor = n => (n == null ? 'text-gray-400' : n >= 4 ? 'text-green-600' : n >= 3 ? 'text-amber-500' : 'text-red-500')

function Kpi({ label, value, sub, color }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-3xl font-extrabold mt-1 ${color || 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function CutTable({ title, field, rows }) {
  const groups = useMemo(() => {
    const m = {}
    rows.forEach(r => { const k = r[field]; if (k) (m[k] ??= []).push(r) })
    return Object.entries(m).map(([k, rs]) => ({
      k, n: rs.length, avg: mean(rs.map(rowAvg).filter(x => x != null)), nps: npsOf(rs),
    })).sort((a, b) => b.n - a.n)
  }, [rows, field])
  if (!groups.length) return null
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <p className="px-4 py-3 text-sm font-bold text-gray-800 border-b">{title}</p>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
          <th className="px-4 py-2 text-right">الفئة</th><th className="px-3 py-2 text-center">العدد</th>
          <th className="px-3 py-2 text-center">المتوسط</th><th className="px-3 py-2 text-center">NPS</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-100">
          {groups.map(g => (
            <tr key={g.k}>
              <td className="px-4 py-2 text-gray-700">{lbl(g.k)}</td>
              <td className="px-3 py-2 text-center text-gray-500">{g.n}</td>
              <td className={`px-3 py-2 text-center font-bold ${scoreColor(g.avg)}`}>{f1(g.avg)}</td>
              <td className={`px-3 py-2 text-center font-bold ${npsColor(g.nps)}`}>{g.nps ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CountList({ title, items }) {
  if (!items.length) return null
  const max = items[0][1]
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-sm font-bold text-gray-800 mb-3">{title}</p>
      <div className="space-y-2">
        {items.map(([k, n]) => (
          <div key={k}>
            <div className="flex justify-between text-xs text-gray-600 mb-0.5"><span>{lbl(k)}</span><span className="font-semibold">{n}</span></div>
            <div className="h-1.5 bg-gray-100 rounded-full"><div className="h-1.5 bg-nwbus-primary rounded-full" style={{ width: `${(n / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function FeedbackReport() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })
  const [to, setTo] = useState(todayStr())
  const [kind, setKind] = useState('all')
  const [stationFilter, setStationFilter] = useState('')
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

  const stName = id => { const s = stations.find(x => x.id === id); return s ? (s.name_ar || s.name_en) : '—' }
  const focusId = r => (r.kind === 'station' ? r.station_id : r.from_station_id)

  const filtered = useMemo(() => rows.filter(r =>
    (kind === 'all' || r.kind === kind) && (!stationFilter || r.station_id === stationFilter || r.from_station_id === stationFilter || r.to_station_id === stationFilter)
  ), [rows, kind, stationFilter])

  const stats = useMemo(() => {
    const all = filtered.flatMap(rowScores)
    const aspectMap = {}
    filtered.forEach(r => Object.entries(r.ratings ?? {}).forEach(([k, v]) => (aspectMap[k] ??= []).push(Number(v))))
    const aspects = Object.entries(aspectMap).map(([k, v]) => ({ k, n: v.length, avg: mean(v) })).sort((a, b) => a.avg - b.avg)
    const byStation = {}
    filtered.forEach(r => { const id = focusId(r); if (id) (byStation[id] ??= []).push(r) })
    const stationRows = Object.entries(byStation).map(([id, rs]) => ({
      id, n: rs.length, avg: mean(rs.map(rowAvg).filter(x => x != null)), nps: npsOf(rs),
      low: Math.round((rs.filter(r => rowScores(r).some(x => x <= 2)).length / rs.length) * 100),
    })).sort((a, b) => b.n - a.n)
    const count = f => {
      const m = {}; filtered.forEach(r => (r[f] ?? []).forEach(k => { m[k] = (m[k] || 0) + 1 }))
      return Object.entries(m).sort((a, b) => b[1] - a[1])
    }
    return {
      total: filtered.length, trips: filtered.filter(r => r.kind === 'trip').length,
      avg: mean(all), sat: all.length ? Math.round((all.filter(x => x >= 4).length / all.length) * 100) : null,
      nps: npsOf(filtered), aspects, stationRows, improve: count('improve'), reasons: count('low_reason'),
    }
  }, [filtered, stations]) // eslint-disable-line react-hooks/exhaustive-deps

  function exportExcel() {
    const data = filtered.map(r => ({
      'التاريخ': new Date(r.created_at).toLocaleString('ar-SA-u-ca-gregory'),
      'النوع': r.kind === 'trip' ? 'رحلة' : 'محطة',
      'المحطة': r.kind === 'station' ? stName(r.station_id) : stName(r.from_station_id),
      'من': r.kind === 'trip' ? stName(r.from_station_id) : '', 'إلى': r.kind === 'trip' ? stName(r.to_station_id) : '',
      'رقم الرحلة': r.trip_number ?? '', 'NPS': r.nps ?? '', 'المتوسط': rowAvg(r)?.toFixed(2) ?? '',
      ...Object.fromEntries(Object.entries(r.ratings ?? {}).map(([k, v]) => [lbl(k), v])),
      'يحتاج تحسين': (r.improve ?? []).map(lbl).join('، '), 'السبب': (r.low_reason ?? []).map(lbl).join('، '),
      'ملاحظات': r.comment ?? '', 'الفئة العمرية': lbl(r.age_group ?? ''), 'نوع المسافر': lbl(r.traveler_type ?? ''),
      'غرض الرحلة': lbl(r.trip_purpose ?? ''), 'التكرار': lbl(r.frequency ?? ''), 'جوال': r.contact_phone ?? '', 'اللغة': r.lang ?? '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'استبيان العملاء')
    XLSX.writeFile(wb, `استبيان-العملاء-${from}_${to}.xlsx`)
  }

  const comments = filtered.filter(r => r.comment).slice(0, 40)

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div><label className="block text-[11px] text-gray-500 mb-1">من</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></div>
        <div><label className="block text-[11px] text-gray-500 mb-1">إلى</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></div>
        <div><label className="block text-[11px] text-gray-500 mb-1">النوع</label>
          <select value={kind} onChange={e => setKind(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
            <option value="all">الكل</option><option value="trip">رحلات</option><option value="station">محطات</option>
          </select></div>
        <div><label className="block text-[11px] text-gray-500 mb-1">المحطة</label>
          <select value={stationFilter} onChange={e => setStationFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm max-w-[200px]">
            <option value="">كل المحطات</option>
            {stations.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en}</option>)}
          </select></div>
        <button onClick={exportExcel} disabled={!filtered.length}
          className="ms-auto bg-nwbus-primary text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">تصدير Excel</button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {loading ? <p className="text-center text-gray-400 py-10 text-sm">جاري التحميل…</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="عدد الاستبيانات" value={stats.total} sub={`${stats.trips} رحلة · ${stats.total - stats.trips} محطة`} />
            <Kpi label="مؤشر NPS" value={stats.nps ?? '—'} sub="من -100 إلى +100" color={npsColor(stats.nps)} />
            <Kpi label="متوسط التقييم" value={f1(stats.avg)} sub="من 5" color={scoreColor(stats.avg)} />
            <Kpi label="نسبة الرضا (4 أو 5)" value={stats.sat == null ? '—' : `${stats.sat}%`} color={stats.sat >= 80 ? 'text-green-600' : stats.sat >= 60 ? 'text-amber-500' : 'text-red-500'} />
          </div>

          {stats.total === 0 ? <p className="text-center text-gray-400 py-10 text-sm">لا توجد استبيانات بهذه الفترة</p> : (
            <>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-white border rounded-xl p-4">
                  <p className="text-sm font-bold text-gray-800 mb-3">متوسط كل جانب (الأضعف أولاً)</p>
                  <div className="space-y-2.5">
                    {stats.aspects.map(a => (
                      <div key={a.k}>
                        <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-700">{lbl(a.k)} <span className="text-gray-400">({a.n})</span></span>
                          <span className={`font-bold ${scoreColor(a.avg)}`}>{f1(a.avg)}</span></div>
                        <div className="h-1.5 bg-gray-100 rounded-full"><div className={`h-1.5 rounded-full ${a.avg >= 4 ? 'bg-green-500' : a.avg >= 3 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${(a.avg / 5) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <CountList title="أكثر ما يحتاج تحسين" items={stats.improve} />
              </div>

              <div className="bg-white border rounded-xl overflow-hidden">
                <p className="px-4 py-3 text-sm font-bold text-gray-800 border-b">حسب المحطة</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
                      <th className="px-4 py-2 text-right">المحطة</th><th className="px-3 py-2 text-center">العدد</th>
                      <th className="px-3 py-2 text-center">المتوسط</th><th className="px-3 py-2 text-center">NPS</th><th className="px-3 py-2 text-center">% غير راضين</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {stats.stationRows.map(s => (
                        <tr key={s.id}>
                          <td className="px-4 py-2 text-gray-800 font-medium" dir="auto">{stName(s.id)}</td>
                          <td className="px-3 py-2 text-center text-gray-500">{s.n}</td>
                          <td className={`px-3 py-2 text-center font-bold ${scoreColor(s.avg)}`}>{f1(s.avg)}</td>
                          <td className={`px-3 py-2 text-center font-bold ${npsColor(s.nps)}`}>{s.nps ?? '—'}</td>
                          <td className="px-3 py-2 text-center text-gray-500">{s.low}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <CutTable title="حسب الفئة العمرية" field="age_group" rows={filtered} />
                <CutTable title="حسب نوع المسافر" field="traveler_type" rows={filtered} />
                <CutTable title="حسب غرض الرحلة" field="trip_purpose" rows={filtered} />
                <CutTable title="حسب تكرار السفر" field="frequency" rows={filtered} />
                <CountList title="أسباب التقييم المنخفض" items={stats.reasons} />
              </div>

              {comments.length > 0 && (
                <div className="bg-white border rounded-xl">
                  <p className="px-4 py-3 text-sm font-bold text-gray-800 border-b">الملاحظات ({comments.length})</p>
                  <div className="divide-y divide-gray-100">
                    {comments.map(r => (
                      <div key={r.id} className="px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mb-1 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded font-semibold ${r.kind === 'trip' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>{r.kind === 'trip' ? 'رحلة' : 'محطة'}</span>
                          <span dir="auto">{stName(focusId(r))}</span>
                          <span className={`font-bold ${scoreColor(rowAvg(r))}`}>{f1(rowAvg(r))}</span>
                          <span>{new Date(r.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</span>
                          {r.contact_phone && <span dir="ltr" className="font-mono text-gray-600">📞 {r.contact_phone}</span>}
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <div className="bg-white border rounded-xl p-4 flex flex-wrap items-center gap-4">
        {qrUrl && <img src={qrUrl} alt="QR" className="w-32 h-32 border rounded-lg" />}
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-bold text-gray-800">رمز QR الموحّد للحافلات</p>
          <p className="text-xs text-gray-500 mt-1">يفتح صفحة الاستبيان بالعربي أو English أو اردو حسب لغة جوال العميل.</p>
          <p className="text-xs font-mono text-gray-600 mt-2 break-all" dir="ltr">{link}</p>
          <div className="flex gap-2 mt-3">
            <a href={qrUrl} download="nwbus-feedback-qr.png" className="text-xs bg-nwbus-primary text-white rounded-lg px-3 py-1.5 font-semibold">تحميل PNG</a>
            <button onClick={() => navigator.clipboard?.writeText(link)} className="text-xs border rounded-lg px-3 py-1.5 text-gray-600">نسخ الرابط</button>
            <a href={link} target="_blank" rel="noreferrer" className="text-xs border rounded-lg px-3 py-1.5 text-gray-600">معاينة</a>
          </div>
        </div>
      </div>
    </div>
  )
}
