import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { todayStr } from '../utils/dates'
import { escapeHtml } from '../utils/digits'
import DatePicker from '../components/shared/DatePicker'

const SHIFTS = [
  { value: 'A', ar: 'الوردية أ' },
  { value: 'B', ar: 'الوردية ب' },
  { value: 'C', ar: 'الوردية ج' },
]

const JOB_TITLE_AR = { customer_service: 'خدمة عملاء', dispatcher: 'مرحّل' }

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
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [stationFilter, setStationFilter] = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState(todayStr())
  const [sortBy, setSortBy] = useState('date') // 'date' | 'best' | 'worst'

  useEffect(() => {
    supabase.from('stations').select('id, name_ar').order('name_ar').then(({ data }) => setStations(data || []))
  }, [])

  // موظفو خدمة العملاء/الترحيل — نطاقهم يضيق مع فلتر المحطة، ونمسح تحديد الموظف
  // لو تغيّرت المحطة عشان ما يبقى محدد موظف من محطة ثانية
  useEffect(() => {
    let q = supabase.from('users').select('id, full_name_ar, job_number, job_title, station_id')
      .in('job_title', ['customer_service', 'dispatcher']).eq('is_active', true)
    if (stationFilter) q = q.eq('station_id', stationFilter)
    q.order('full_name_ar').then(({ data }) => setEmployees(data || []))
    setEmployeeFilter('')
  }, [stationFilter])

  useEffect(() => { load() }, [stationFilter, shiftFilter, employeeFilter, dateFrom, dateTo])

  function load() {
    setLoading(true)
    let q = supabase.from('customer_ratings')
      .select('id, window_number, shift, ticket_number, reference_number, ticket_date, rating, comment, created_at, employee:employee_id(full_name_ar, job_number, job_title), station:station_id(name_ar)')
    if (stationFilter) q = q.eq('station_id', stationFilter)
    if (shiftFilter) q = q.eq('shift', shiftFilter)
    if (employeeFilter) q = q.eq('employee_id', employeeFilter)
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
    const selectedEmployee = employeeFilter ? employees.find(e => e.id === employeeFilter) : null
    const selectedStation = stationFilter ? stations.find(s => s.id === stationFilter) : null
    const showEmpCol = !selectedEmployee

    const rowsHtml = sorted.map((r, i) => `
      <tr style="background:${i % 2 ? '#F9FAFB' : '#fff'}">
        <td style="padding:9px 12px;text-align:center;color:#9CA3AF;font-size:11px;border:1px solid #EEF0F3">${i + 1}</td>
        ${showEmpCol ? `<td style="padding:9px 12px;font-weight:700;color:#111827;font-size:13px;border:1px solid #EEF0F3">${escapeHtml(r.employee?.full_name_ar) || '—'}</td>` : ''}
        <td style="padding:9px 12px;color:#6B7280;font-size:12px;border:1px solid #EEF0F3">${escapeHtml(r.station?.name_ar) || '—'}</td>
        <td style="padding:9px 12px;text-align:center;font-family:monospace;color:#4B5563;font-size:12px;border:1px solid #EEF0F3">${escapeHtml(r.window_number) || '—'}</td>
        <td style="padding:9px 12px;text-align:center;border:1px solid #EEF0F3">
          <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;${r.rating >= 4 ? 'background:#F0FDF4;color:#16A34A' : r.rating === 3 ? 'background:#FFFBEB;color:#B45309' : 'background:#FEF2F2;color:#DC2626'}">${r.rating} / 5</span>
        </td>
        <td style="padding:9px 12px;text-align:center;font-family:monospace;color:#4B5563;font-size:12px;border:1px solid #EEF0F3">${escapeHtml(r.ticket_number) || '—'}</td>
        <td style="padding:9px 12px;text-align:center;font-family:monospace;color:#9CA3AF;font-size:11px;border:1px solid #EEF0F3">${escapeHtml(r.reference_number) || '—'}</td>
        <td style="padding:9px 12px;text-align:center;color:#6B7280;font-size:11px;border:1px solid #EEF0F3">${r.ticket_date ? new Date(r.ticket_date).toLocaleDateString('ar-SA') : '—'}</td>
        <td style="padding:9px 12px;text-align:center;color:#6B7280;font-size:11px;border:1px solid #EEF0F3">${new Date(r.created_at).toLocaleDateString('ar-SA')}</td>
        <td style="padding:9px 12px;color:#6B7280;font-size:11px;border:1px solid #EEF0F3">${escapeHtml(r.comment) || ''}</td>
      </tr>`).join('')

    // صندوق السياق — بيانات الموظف كاملة لو التقرير لموظف واحد، وإلا اسم المحطة
    const contextBoxHtml = selectedEmployee ? `
      <div style="background:#1C2B36;color:#fff;padding:16px 20px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <div style="font-size:16px;font-weight:800">${escapeHtml(selectedEmployee.full_name_ar)}</div>
          <div style="font-size:11px;opacity:0.75;margin-top:4px">
            ${selectedEmployee.job_number ? `الرقم الوظيفي: ${escapeHtml(selectedEmployee.job_number)} · ` : ''}${JOB_TITLE_AR[selectedEmployee.job_title] || ''}${selectedStation ? ` · ${escapeHtml(selectedStation.name_ar)}` : ''}
          </div>
        </div>
        <div style="text-align:left">
          <div style="font-size:20px;font-weight:800;color:#F59E0B">${avg} / 5</div>
          <div style="font-size:10px;opacity:0.7">${rows.length} تقييم</div>
        </div>
      </div>` : `
      <div style="background:#1C2B36;color:#fff;padding:14px 20px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <div style="font-size:15px;font-weight:800">تقرير تقييم العملاء${selectedStation ? ` — ${escapeHtml(selectedStation.name_ar)}` : ''}</div>
          <div style="font-size:10px;opacity:0.7;margin-top:3px">${rows.length} تقييم · المتوسط ${avg} / 5 · ${new Date().toLocaleDateString('ar-SA')}</div>
        </div>
        <div style="font-size:12px;font-weight:800;letter-spacing:1px">NORTH WEST BUS</div>
      </div>`

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير تقييم العملاء</title>
      <style>
        *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        body{margin:0;font-family:Arial,sans-serif;background:#fff;color:#1a1a1a}
        @page{size:A4 landscape;margin:10mm}
        @media print{.no-print{display:none!important}}
        table{width:100%;border-collapse:collapse}
        th{background:#F9FAFB;color:#6B7280;padding:8px 12px;font-size:11px;font-weight:700;text-align:right;border-bottom:1.5px solid #E5E7EB}
      </style></head><body>
      <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e5e7eb;padding:14px 20px;position:sticky;top:0;z-index:10;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <span style="font-size:12.5px;font-weight:700;color:#1C2B4A;letter-spacing:0.04em">NORTH WEST BUS — معاينة قبل الطباعة</span>
        <button onclick="window.print()" style="display:inline-flex;align-items:center;gap:7px;background:#1C2B4A;color:#fff;border:none;border-radius:9px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(28,43,74,0.25)">
          🖨 طباعة / حفظ PDF
        </button>
      </div>
      <div style="padding:24px 28px">
        ${contextBoxHtml}
        <table>
          <thead><tr>
            <th style="width:36px;text-align:center">#</th>
            ${showEmpCol ? '<th>الموظف</th>' : ''}
            <th>المحطة</th>
            <th style="text-align:center">الشباك</th>
            <th style="text-align:center">التقييم</th>
            <th style="text-align:center">رقم التذكرة</th>
            <th style="text-align:center">رقم المرجع</th>
            <th style="text-align:center">تاريخ التذكرة</th>
            <th style="text-align:center">تاريخ التقييم</th>
            <th>ملاحظة</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </body></html>`

    const w = window.open('', '_blank')
    w.document.write(html)
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
        <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">{stationFilter ? 'كل موظفي المحطة' : 'كل الموظفين'}</option>
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.full_name_ar}{e.job_number ? ` (${e.job_number})` : ''}</option>
          ))}
        </select>
        <DatePicker value={dateFrom} onChange={setDateFrom} className="border rounded-lg px-3 py-2 text-sm" placeholder="من تاريخ" />
        <span className="text-gray-400 text-sm">إلى</span>
        <DatePicker value={dateTo} onChange={setDateTo} className="border rounded-lg px-3 py-2 text-sm" placeholder="إلى تاريخ" />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="date">الأحدث</option>
          <option value="best">الأعلى تقييماً</option>
          <option value="worst">الأقل تقييماً</option>
        </select>
        <button onClick={printReport} className="mr-auto bg-nwbus-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90">
          🖨 {employeeFilter ? 'طباعة تقرير الموظف' : stationFilter ? 'طباعة تقرير المحطة' : 'طباعة التقرير'}
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
