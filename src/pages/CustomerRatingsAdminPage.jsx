import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { todayStr } from '../utils/dates'
import { escapeHtml } from '../utils/digits'

const SHIFTS = [
  { value: 'A', ar: 'الوردية أ' },
  { value: 'B', ar: 'الوردية ب' },
  { value: 'C', ar: 'الوردية ج' },
]

export default function CustomerRatingsAdminPage() {
  const [tab, setTab] = useState('ratings') // 'ratings' | 'messages'

  return (
    <div className="max-w-5xl mx-auto p-6" dir="rtl">
      <h1 className="text-xl font-bold text-gray-800 mb-1">تقييمات العملاء</h1>
      <p className="text-sm text-gray-500 mb-5">تقييم العملاء لموظفي خدمة العملاء والمرحّلين عبر رمز QR</p>

      <div className="flex gap-2 mb-5">
        {[{ id: 'ratings', label: 'التقييمات' }, { id: 'messages', label: 'رسائل المحطات' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${tab === t.id ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ratings' ? <RatingsTab /> : <MessagesTab />}
    </div>
  )
}

function RatingsTab() {
  const [rows, setRows] = useState([])
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [stationFilter, setStationFilter] = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState(todayStr())
  const [sortBy, setSortBy] = useState('date') // 'date' | 'best' | 'worst'

  useEffect(() => {
    supabase.from('stations').select('id, name_ar').order('name_ar').then(({ data }) => setStations(data || []))
  }, [])

  useEffect(() => { load() }, [stationFilter, shiftFilter, dateFrom, dateTo])

  function load() {
    setLoading(true)
    let q = supabase.from('customer_ratings')
      .select('id, window_number, shift, ticket_number, reference_number, ticket_date, rating, comment, created_at, employee:employee_id(full_name_ar), station:station_id(name_ar)')
    if (stationFilter) q = q.eq('station_id', stationFilter)
    if (shiftFilter) q = q.eq('shift', shiftFilter)
    if (dateFrom) q = q.gte('created_at', dateFrom)
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59')
    q.order('created_at', { ascending: false }).limit(2000).then(({ data, error }) => {
      setRows(data || [])
      setLoading(false)
    })
  }

  const sorted = [...rows].sort((a, b) => {
    if (sortBy === 'best') return b.rating - a.rating
    if (sortBy === 'worst') return a.rating - b.rating
    return new Date(b.created_at) - new Date(a.created_at)
  })

  const avg = rows.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : '—'

  function printReport() {
    const rowsHtml = sorted.map(r => `<tr>
      <td>${escapeHtml(r.employee?.full_name_ar) || '—'}</td>
      <td>${escapeHtml(r.station?.name_ar) || '—'}</td>
      <td>${escapeHtml(r.window_number) || '—'}</td>
      <td>${r.rating} / 5</td>
      <td>${escapeHtml(r.ticket_number) || '—'}</td>
      <td>${escapeHtml(r.reference_number) || '—'}</td>
      <td>${r.ticket_date ? new Date(r.ticket_date).toLocaleDateString('ar-SA') : '—'}</td>
      <td>${new Date(r.created_at).toLocaleDateString('ar-SA')}</td>
      <td>${escapeHtml(r.comment)}</td>
    </tr>`).join('')
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير تقييم العملاء</title>
      <style>
        body{font-family:Arial, sans-serif; padding:24px}
        h2{color:#1C2B4A}
        table{width:100%; border-collapse:collapse; font-size:12px}
        th,td{border:1px solid #ddd; padding:6px 8px; text-align:right}
        th{background:#1C2B4A; color:#fff}
      </style></head><body>
      <h2>تقرير تقييم العملاء — إجمالي: ${rows.length} · المتوسط: ${avg}</h2>
      <table><thead><tr><th>الموظف</th><th>المحطة</th><th>الشباك</th><th>التقييم</th><th>رقم التذكرة</th><th>رقم المرجع</th><th>تاريخ التذكرة</th><th>تاريخ التقييم</th><th>ملاحظة</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <script>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-center mb-4">
        <select value={stationFilter} onChange={e => setStationFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">كل المحطات</option>
          {stations.map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
        </select>
        <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">كل الورديات</option>
          {SHIFTS.map(s => <option key={s.value} value={s.value}>{s.ar}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <span className="text-gray-400 text-sm">إلى</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="date">الأحدث</option>
          <option value="best">الأعلى تقييماً</option>
          <option value="worst">الأقل تقييماً</option>
        </select>
        <button onClick={printReport} className="mr-auto bg-nwbus-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90">
          طباعة التقرير
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3">
          <p className="text-xs text-gray-400">إجمالي التقييمات</p>
          <p className="text-xl font-bold text-gray-800">{rows.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3">
          <p className="text-xs text-gray-400">متوسط التقييم</p>
          <p className="text-xl font-bold text-amber-500">{avg} / 5</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">جارٍ التحميل...</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">لا توجد تقييمات بهذي الفلاتر</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-right">الموظف</th>
                <th className="px-4 py-2 text-right">المحطة</th>
                <th className="px-4 py-2 text-right">الشباك</th>
                <th className="px-4 py-2 text-right">التقييم</th>
                <th className="px-4 py-2 text-right">التذكرة</th>
                <th className="px-4 py-2 text-right">المرجع</th>
                <th className="px-4 py-2 text-right">تاريخ التذكرة</th>
                <th className="px-4 py-2 text-right">تاريخ التقييم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-semibold text-gray-800">{r.employee?.full_name_ar || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{r.station?.name_ar || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono">{r.window_number || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-bold ${r.rating >= 4 ? 'text-green-600' : r.rating === 3 ? 'text-amber-500' : 'text-red-500'}`}>{r.rating} / 5</span>
                    {r.comment && <p className="text-xs text-gray-400 mt-0.5">{r.comment}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono">{r.ticket_number || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{r.reference_number || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{r.ticket_date ? new Date(r.ticket_date).toLocaleDateString('ar-SA') : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString('ar-SA')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function MessagesTab() {
  const [stations, setStations] = useState([])
  const [msgs, setMsgs] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('stations').select('id, name_ar').order('name_ar'),
      supabase.from('station_rating_messages').select('*'),
    ]).then(([{ data: st }, { data: m }]) => {
      setStations(st || [])
      const map = {}
      ;(m || []).forEach(r => { map[r.station_id] = r })
      setMsgs(map)
      setLoading(false)
    })
  }, [])

  function setField(stationId, field, value) {
    setMsgs(p => ({ ...p, [stationId]: { ...(p[stationId] || {}), [field]: value } }))
  }

  async function save(stationId) {
    setSavingId(stationId)
    const row = msgs[stationId] || {}
    await supabase.from('station_rating_messages').upsert({
      station_id: stationId,
      welcome_message: row.welcome_message || null,
      closing_message: row.closing_message || null,
    }, { onConflict: 'station_id' })
    setSavingId(null)
  }

  if (loading) return <div className="text-center py-10 text-gray-400 text-sm">جارٍ التحميل...</div>

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
        اترك الحقل فاضياً لاستخدام الرسالة الافتراضية العامة لكل محطة ما لها رسالة خاصة
      </p>
      {stations.map(s => {
        const row = msgs[s.id] || {}
        return (
          <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="font-semibold text-gray-800 mb-3">{s.name_ar}</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">رسالة الترحيب</label>
                <textarea value={row.welcome_message || ''} onChange={e => setField(s.id, 'welcome_message', e.target.value)}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">رسالة الختام</label>
                <textarea value={row.closing_message || ''} onChange={e => setField(s.id, 'closing_message', e.target.value)}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <button onClick={() => save(s.id)} disabled={savingId === s.id}
              className="text-xs bg-nwbus-primary text-white rounded-lg px-4 py-1.5 font-semibold hover:opacity-90 disabled:opacity-50">
              {savingId === s.id ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
