import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { todayStr } from '../utils/dates'
import { escapeHtml, toLatinDigits, matchesSearch } from '../utils/digits'
import DatePicker from '../components/shared/DatePicker'
import { useAuth } from '../context/AuthContext'
import FeedbackReport from '../components/feedback/FeedbackReport'
import SelectField from '../components/shared/SelectField'

const SHIFTS = [
  { value: 'A', ar: 'الوردية أ', en: 'Shift A' },
  { value: 'B', ar: 'الوردية ب', en: 'Shift B' },
  { value: 'C', ar: 'الوردية ج', en: 'Shift C' },
]

const JOB_TITLE_AR = { customer_service: 'خدمة عملاء', dispatcher: 'مرحّل' }
const JOB_TITLE_EN = { customer_service: 'Customer Service', dispatcher: 'Dispatcher' }

function stationLabel(st, isAr) {
  if (!st) return st
  return isAr ? st.name_ar : (st.name_en || st.name_ar)
}

// قائمة موظفين قابلة للبحث بالاسم أو الرقم الوظيفي — بديل عن <SelectField> عادي لما تكون
// القائمة طويلة (كل من عنده صلاحية "يُقيّم من العميل" بكل المحطات)
function EmployeePicker({ employees, value, onChange, defaultLabel }) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const selected = employees.find(e => e.id === value)

  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = query.trim()
  const filtered = !q ? employees : employees.filter(e =>
    matchesSearch(e.full_name_ar, q) || matchesSearch(e.job_number, q)
  )

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen(o => !o); setQuery('') }}
        className="border rounded-lg px-3 py-2 text-sm bg-white text-start w-48 truncate">
        {selected ? `${selected.full_name_ar}${selected.job_number ? ` (${selected.job_number})` : ''}` : defaultLabel}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 p-2">
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder={isAr ? 'بحث بالاسم أو الرقم الوظيفي...' : 'Search by name or job number...'}
            className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2" />
          <div className="max-h-56 overflow-y-auto">
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className={`block w-full text-start px-2 py-1.5 rounded-lg text-sm hover:bg-gray-50 ${!value ? 'font-bold text-nwbus-primary' : 'text-gray-700'}`}>
              {defaultLabel}
            </button>
            {filtered.map(e => (
              <button key={e.id} type="button" onClick={() => { onChange(e.id); setOpen(false) }}
                className={`block w-full text-start px-2 py-1.5 rounded-lg text-sm hover:bg-gray-50 ${value === e.id ? 'font-bold text-nwbus-primary' : 'text-gray-700'}`}>
                {e.full_name_ar}{e.job_number ? ` (${e.job_number})` : ''}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-3">{isAr ? 'لا يوجد نتائج' : 'No results'}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CustomerRatingsAdminPage() {
  const { allowCap } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [tab, setTab] = useState('ratings') // 'ratings' | 'messages'

  if (!allowCap('customer_ratings_view')) {
    return <div className="max-w-5xl mx-auto p-10 text-center text-gray-500" dir={isAr ? 'rtl' : 'ltr'}>{isAr ? 'ما عندك صلاحية لعرض تقييمات العملاء' : "You don't have permission to view customer ratings"}</div>
  }

  return (
    <div className="max-w-5xl mx-auto p-6" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-xl font-bold text-gray-800 mb-1">{isAr ? 'تقييمات العملاء' : 'Customer Ratings'}</h1>
      <p className="text-sm text-gray-500 mb-5">{isAr ? 'تقييم العملاء لموظفي خدمة العملاء والمرحّلين عبر رمز QR' : 'Customer ratings of customer service staff and dispatchers via QR code'}</p>

      <div className="flex gap-2 mb-5">
        {[{ id: 'ratings', label: isAr ? 'التقييمات' : 'Ratings' }, { id: 'messages', label: isAr ? 'رسائل المحطات' : 'Station Messages' }, { id: 'survey', label: isAr ? 'استبيان العملاء' : 'Customer Survey' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${tab === t.id ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ratings' ? <RatingsTab /> : tab === 'messages' ? <MessagesTab /> : <FeedbackReport />}
    </div>
  )
}

function RatingsTab() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const loc = isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB'
  // وقت تقييم العميل بتوقيت الرياض (24 ساعة، أرقام لاتينية)
  const ratedTime = d => new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false })
  const ratedDate = d => new Date(d).toLocaleDateString(loc, { timeZone: 'Asia/Riyadh' })
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
    supabase.from('stations').select('id, name_ar, name_en').order('name_ar').then(({ data }) => setStations(data || []))
  }, [])

  // أي حساب مفعّل له "يُقيّم من العميل" — مو بس خدمة عملاء/ترحيل، ممكن يكون مشرف
  // مفعّل له نفس الخاصية. نطاقهم يضيق مع فلتر المحطة، ونمسح تحديد الموظف لو تغيّرت
  // المحطة عشان ما يبقى محدد موظف من محطة ثانية
  useEffect(() => {
    let q = supabase.from('users').select('id, full_name_ar, job_number, job_title, station_id')
      .eq('can_rate_customers', true).eq('is_active', true)
    if (stationFilter) q = q.eq('station_id', stationFilter)
    q.order('full_name_ar').then(({ data }) => setEmployees(data || []))
    setEmployeeFilter('')
  }, [stationFilter])

  useEffect(() => { load() }, [stationFilter, shiftFilter, employeeFilter, dateFrom, dateTo])

  function load() {
    setLoading(true)
    let q = supabase.from('customer_ratings')
      .select('id, window_number, shift, ticket_number, reference_number, ticket_date, rating, comment, created_at, employee:employee_id(full_name_ar, job_number, job_title), station:station_id(name_ar, name_en)')
    if (stationFilter) q = q.eq('station_id', stationFilter)
    if (shiftFilter) q = q.eq('shift', shiftFilter)
    if (employeeFilter) q = q.eq('employee_id', employeeFilter)
    if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00+03:00')
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59.999+03:00')
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
        <td style="padding:9px 12px;color:#6B7280;font-size:12px;border:1px solid #EEF0F3">${escapeHtml(stationLabel(r.station, isAr)) || '—'}</td>
        <td style="padding:9px 12px;text-align:center;font-family:monospace;color:#4B5563;font-size:12px;border:1px solid #EEF0F3">${escapeHtml(r.window_number) || '—'}</td>
        <td style="padding:9px 12px;text-align:center;border:1px solid #EEF0F3">
          <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;${r.rating >= 4 ? 'background:#F0FDF4;color:#16A34A' : r.rating === 3 ? 'background:#FFFBEB;color:#B45309' : 'background:#FEF2F2;color:#DC2626'}">${r.rating} / 5</span>
        </td>
        <td style="padding:9px 12px;text-align:center;font-family:monospace;color:#4B5563;font-size:12px;border:1px solid #EEF0F3">${escapeHtml(r.ticket_number) || '—'}</td>
        <td style="padding:9px 12px;text-align:center;font-family:monospace;color:#9CA3AF;font-size:11px;border:1px solid #EEF0F3">${escapeHtml(r.reference_number) || '—'}</td>
        <td style="padding:9px 12px;text-align:center;color:#6B7280;font-size:11px;border:1px solid #EEF0F3">${r.ticket_date ? new Date(r.ticket_date).toLocaleDateString(loc) : '—'}</td>
        <td style="padding:9px 12px;text-align:center;color:#6B7280;font-size:11px;border:1px solid #EEF0F3;white-space:nowrap">${ratedDate(r.created_at)}<br><b style="color:#374151;font-family:monospace">${ratedTime(r.created_at)}</b></td>
        <td style="padding:9px 12px;color:#6B7280;font-size:11px;border:1px solid #EEF0F3">${escapeHtml(r.comment) || ''}</td>
      </tr>`).join('')

    // صندوق السياق — بيانات الموظف كاملة لو التقرير لموظف واحد، وإلا اسم المحطة
    const contextBoxHtml = selectedEmployee ? `
      <div style="background:#1C2B36;color:#fff;padding:16px 20px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <div style="font-size:16px;font-weight:800">${escapeHtml(selectedEmployee.full_name_ar)}</div>
          <div style="font-size:11px;opacity:0.75;margin-top:4px">
            ${selectedEmployee.job_number ? `${isAr ? 'الرقم الوظيفي' : 'Job No.'}: ${escapeHtml(selectedEmployee.job_number)} · ` : ''}${(isAr ? JOB_TITLE_AR : JOB_TITLE_EN)[selectedEmployee.job_title] || ''}${selectedStation ? ` · ${escapeHtml(stationLabel(selectedStation, isAr))}` : ''}
          </div>
        </div>
        <div style="text-align:${isAr ? 'left' : 'right'}">
          <div style="font-size:20px;font-weight:800;color:#F59E0B">${avg} / 5</div>
          <div style="font-size:10px;opacity:0.7">${rows.length} ${isAr ? 'تقييم' : 'ratings'}</div>
        </div>
      </div>` : `
      <div style="background:#1C2B36;color:#fff;padding:14px 20px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <div style="font-size:15px;font-weight:800">${isAr ? 'تقرير تقييم العملاء' : 'Customer Ratings Report'}${selectedStation ? ` — ${escapeHtml(stationLabel(selectedStation, isAr))}` : ''}</div>
          <div style="font-size:10px;opacity:0.7;margin-top:3px">${rows.length} ${isAr ? 'تقييم' : 'ratings'} · ${isAr ? 'المتوسط' : 'Average'} ${avg} / 5 · ${new Date().toLocaleDateString(loc)}</div>
        </div>
        <div style="font-size:12px;font-weight:800;letter-spacing:1px">NORTH WEST BUS</div>
      </div>`

    const html = `<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}"><head><meta charset="UTF-8"><title>${isAr ? 'تقرير تقييم العملاء' : 'Customer Ratings Report'}</title>
      <style>
        *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        body{margin:0;font-family:Arial,sans-serif;background:#fff;color:#1a1a1a}
        @page{size:A4 landscape;margin:10mm}
        @media print{.no-print{display:none!important}}
        table{width:100%;border-collapse:collapse}
        th{background:#F9FAFB;color:#6B7280;padding:8px 12px;font-size:11px;font-weight:700;text-align:${isAr ? 'right' : 'left'};border-bottom:1.5px solid #E5E7EB}
      </style></head><body>
      <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e5e7eb;padding:14px 20px;position:sticky;top:0;z-index:10;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <span style="font-size:12.5px;font-weight:700;color:#1C2B4A;letter-spacing:0.04em">NORTH WEST BUS — ${isAr ? 'معاينة قبل الطباعة' : 'Print preview'}</span>
        <button onclick="window.print()" style="display:inline-flex;align-items:center;gap:7px;background:#1C2B4A;color:#fff;border:none;border-radius:9px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(28,43,74,0.25)">
          🖨 ${isAr ? 'طباعة / حفظ PDF' : 'Print / Save PDF'}
        </button>
      </div>
      <div style="padding:24px 28px">
        ${contextBoxHtml}
        <table>
          <thead><tr>
            <th style="width:36px;text-align:center">#</th>
            ${showEmpCol ? `<th>${isAr ? 'الموظف' : 'Employee'}</th>` : ''}
            <th>${isAr ? 'المحطة' : 'Station'}</th>
            <th style="text-align:center">${isAr ? 'الشباك' : 'Window'}</th>
            <th style="text-align:center">${isAr ? 'التقييم' : 'Rating'}</th>
            <th style="text-align:center">${isAr ? 'رقم التذكرة' : 'Ticket No.'}</th>
            <th style="text-align:center">${isAr ? 'رقم المرجع' : 'Reference No.'}</th>
            <th style="text-align:center">${isAr ? 'تاريخ التذكرة' : 'Ticket Date'}</th>
            <th style="text-align:center">${isAr ? 'تاريخ ووقت التقييم' : 'Rated at'}</th>
            <th>${isAr ? 'ملاحظة' : 'Comment'}</th>
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
        <SelectField value={stationFilter} onChange={e => setStationFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">{isAr ? 'كل المحطات' : 'All stations'}</option>
          {stations.map(s => <option key={s.id} value={s.id}>{stationLabel(s, isAr)}</option>)}
        </SelectField>
        <SelectField value={shiftFilter} onChange={e => setShiftFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">{isAr ? 'كل الورديات' : 'All shifts'}</option>
          {SHIFTS.map(s => <option key={s.value} value={s.value}>{isAr ? s.ar : s.en}</option>)}
        </SelectField>
        <EmployeePicker employees={employees} value={employeeFilter} onChange={setEmployeeFilter}
          defaultLabel={stationFilter ? (isAr ? 'كل موظفي المحطة' : 'All station employees') : (isAr ? 'كل الموظفين' : 'All employees')} />
        <DatePicker value={dateFrom} onChange={setDateFrom} className="border rounded-lg px-3 py-2 text-sm" placeholder={isAr ? 'من تاريخ' : 'From date'} />
        <span className="text-gray-400 text-sm">{isAr ? 'إلى' : 'to'}</span>
        <DatePicker value={dateTo} onChange={setDateTo} className="border rounded-lg px-3 py-2 text-sm" placeholder={isAr ? 'إلى تاريخ' : 'To date'} />
        <SelectField value={sortBy} onChange={e => setSortBy(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="date">{isAr ? 'الأحدث' : 'Newest'}</option>
          <option value="best">{isAr ? 'الأعلى تقييماً' : 'Highest rated'}</option>
          <option value="worst">{isAr ? 'الأقل تقييماً' : 'Lowest rated'}</option>
        </SelectField>
        <button onClick={printReport} className="ms-auto bg-nwbus-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90">
          🖨 {employeeFilter ? (isAr ? 'طباعة تقرير الموظف' : 'Print employee report') : stationFilter ? (isAr ? 'طباعة تقرير المحطة' : 'Print station report') : (isAr ? 'طباعة التقرير' : 'Print report')}
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3">
          <p className="text-xs text-gray-400">{isAr ? 'إجمالي التقييمات' : 'Total ratings'}</p>
          <p className="text-xl font-bold text-gray-800">{rows.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3">
          <p className="text-xs text-gray-400">{isAr ? 'متوسط التقييم' : 'Average rating'}</p>
          <p className="text-xl font-bold text-amber-500">{avg} / 5</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">{isAr ? 'لا توجد تقييمات بهذي الفلاتر' : 'No ratings match these filters'}</div>
        ) : (
          <>
            {/* جدول — من md فأعلى فقط، بدون داعي للتمرير الأفقي أو تدوير الشاشة بالجوال */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-2 text-start">{isAr ? 'الموظف' : 'Employee'}</th>
                    <th className="px-4 py-2 text-start">{isAr ? 'المحطة' : 'Station'}</th>
                    <th className="px-4 py-2 text-start">{isAr ? 'الشباك' : 'Window'}</th>
                    <th className="px-4 py-2 text-start">{isAr ? 'التقييم' : 'Rating'}</th>
                    <th className="px-4 py-2 text-start">{isAr ? 'التذكرة' : 'Ticket'}</th>
                    <th className="px-4 py-2 text-start">{isAr ? 'المرجع' : 'Reference'}</th>
                    <th className="px-4 py-2 text-start">{isAr ? 'تاريخ التذكرة' : 'Ticket Date'}</th>
                    <th className="px-4 py-2 text-start">{isAr ? 'تاريخ ووقت التقييم' : 'Rated at'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map(r => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{r.employee?.full_name_ar || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{stationLabel(r.station, isAr) || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono">{r.window_number || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-bold ${r.rating >= 4 ? 'text-green-600' : r.rating === 3 ? 'text-amber-500' : 'text-red-500'}`}>{r.rating} / 5</span>
                        {r.comment && <p className="text-xs text-gray-400 mt-0.5">{r.comment}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono">{r.ticket_number || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{r.reference_number || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{r.ticket_date ? new Date(r.ticket_date).toLocaleDateString(loc) : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{ratedDate(r.created_at)}<span className="block font-mono font-bold text-gray-600 text-[13px]" dir="ltr">{ratedTime(r.created_at)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* بطاقات — بالجوال فقط، نفس بيانات الجدول بدون تمرير أفقي ولا تدوير الشاشة */}
            <div className="md:hidden divide-y divide-gray-100">
              {sorted.map(r => (
                <div key={r.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{r.employee?.full_name_ar || '—'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{stationLabel(r.station, isAr) || '—'}{r.window_number ? ` · ${isAr ? 'شباك' : 'Window'} ${r.window_number}` : ''}</p>
                    </div>
                    <span className={`shrink-0 font-bold text-sm px-2 py-0.5 rounded-full ${r.rating >= 4 ? 'bg-green-50 text-green-600' : r.rating === 3 ? 'bg-amber-50 text-amber-500' : 'bg-red-50 text-red-500'}`}>{r.rating} / 5</span>
                  </div>
                  {r.comment && <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg px-2.5 py-1.5">{r.comment}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11px] text-gray-400">
                    {r.ticket_number && <span>{isAr ? 'تذكرة:' : 'Ticket:'} <span className="font-mono text-gray-500">{r.ticket_number}</span></span>}
                    {r.reference_number && <span>{isAr ? 'مرجع:' : 'Ref:'} <span className="font-mono text-gray-500">{r.reference_number}</span></span>}
                    {r.ticket_date && <span>{isAr ? 'تاريخ التذكرة:' : 'Ticket date:'} {new Date(r.ticket_date).toLocaleDateString(loc)}</span>}
                    <span>{isAr ? 'وقت التقييم:' : 'Rated at:'} {ratedDate(r.created_at)} <span className="font-mono font-bold text-gray-600" dir="ltr">{ratedTime(r.created_at)}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MessagesTab() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [stations, setStations] = useState([])
  const [msgs, setMsgs] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('stations').select('id, name_ar, name_en').order('name_ar'),
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

  if (loading) return <div className="text-center py-10 text-gray-400 text-sm">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</div>

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
        {isAr ? 'اترك الحقل فاضياً لاستخدام الرسالة الافتراضية العامة لكل محطة ما لها رسالة خاصة' : 'Leave a field empty to use the general default message for any station without a custom message'}
      </p>
      {stations.map(s => {
        const row = msgs[s.id] || {}
        return (
          <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="font-semibold text-gray-800 mb-3">{stationLabel(s, isAr)}</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">{isAr ? 'رسالة الترحيب' : 'Welcome message'}</label>
                <textarea value={row.welcome_message || ''} onChange={e => setField(s.id, 'welcome_message', e.target.value)}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">{isAr ? 'رسالة الختام' : 'Closing message'}</label>
                <textarea value={row.closing_message || ''} onChange={e => setField(s.id, 'closing_message', e.target.value)}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <button onClick={() => save(s.id)} disabled={savingId === s.id}
              className="text-xs bg-nwbus-primary text-white rounded-lg px-4 py-1.5 font-semibold hover:opacity-90 disabled:opacity-50">
              {savingId === s.id ? (isAr ? 'جارٍ الحفظ…' : 'Saving…') : (isAr ? 'حفظ' : 'Save')}
            </button>
          </div>
        )
      })}
    </div>
  )
}
