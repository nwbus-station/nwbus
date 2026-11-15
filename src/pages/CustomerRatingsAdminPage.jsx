import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { todayStr } from '../utils/dates'
import DatePicker from '../components/shared/DatePicker'
import { useAuth } from '../context/AuthContext'
import FeedbackReport from '../components/feedback/FeedbackReport'
import SelectField from '../components/shared/SelectField'
import { buildRatingsReportHtml } from '../utils/ratingsReport'
import { useMedia } from '../components/dispatch/Sheet'
import EmployeePicker from '../components/customerRatings/EmployeePicker'
import RatingsHeader from '../components/customerRatings/RatingsHeader'
import RatingsFilterBar from '../components/customerRatings/RatingsFilterBar'
import RatingsInsights from '../components/customerRatings/RatingsInsights'
import RatingsTrend from '../components/customerRatings/RatingsTrend'
import RatingsTable from '../components/customerRatings/RatingsTable'
import RatingDetailSheet from '../components/customerRatings/RatingDetailSheet'
import MessagesGrid from '../components/customerRatings/MessagesGrid'
import { SHIFTS, CR_CSS, stationLabel, summarize, f1, toneVar } from '../components/customerRatings/shared'

// حاوية الكمبيوتر: عرض صريح (الـ CSS العام يعيد كتابة max-width الشائعة داخل main)
const DESK_WRAP = { maxWidth: 'min(100%, 1560px)', margin: '0 auto', padding: 'clamp(16px, 2vw, 32px)' }
// يوم التقييم بتوقيت الرياض بصيغة YYYY-MM-DD
const dayOf = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })

export default function CustomerRatingsAdminPage() {
  const { allowCap } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [tab, setTab] = useState('ratings') // 'ratings' | 'messages' | 'survey'
  const desk = useMedia('(min-width: 900px)')

  if (!allowCap('customer_ratings_view')) {
    return <div className={desk ? 'text-center text-gray-500' : 'max-w-5xl mx-auto p-10 text-center text-gray-500'} style={desk ? { ...DESK_WRAP, padding: 'clamp(32px, 6vw, 80px)' } : undefined} dir={isAr ? 'rtl' : 'ltr'}>{isAr ? 'ما عندك صلاحية لعرض تقييمات العملاء' : "You don't have permission to view customer ratings"}</div>
  }

  // الكمبيوتر: ترويسة موحّدة بالمؤشرات والتبويبات (تُرسم داخل كل تبويب ليحصل على مؤشراته)، الجوال: كما كان
  if (desk) {
    return (
      <div className="cr-root" style={DESK_WRAP} dir={isAr ? 'rtl' : 'ltr'}>
        <style>{CR_CSS}</style>
        {tab === 'ratings' ? <RatingsTab desk onTab={setTab} />
          : tab === 'messages' ? <MessagesTab desk onTab={setTab} />
          : (
            <>
              <RatingsHeader isAr={isAr} tab={tab} onTab={setTab} />
              <FeedbackReport />
            </>
          )}
      </div>
    )
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

function RatingsTab({ desk = false, onTab }) {
  const { profile } = useAuth()
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
  const [printing, setPrinting] = useState(false)
  // حالات عرض فقط (الكمبيوتر): عدد الصفوف الظاهرة، التقييم المفتوح بالتفاصيل
  const wide = useMedia('(min-width: 1560px)')
  const roomy = useMedia('(min-width: 1280px)') // الجدول يتّسع بلا تمرير أفقي فيثبت رأسه
  const [limit, setLimit] = useState(100)
  const [detail, setDetail] = useState(null)

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
    setLimit(100)
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
  const summary = useMemo(() => summarize(rows, dayOf), [rows])

  // التقرير يقرأ كل التقييمات المطابقة للفلاتر (الشاشة محدودة بـ 2000) ثم يبنيه مجمّعاً بالمحطة
  async function printReport() {
    if (printing) return
    setPrinting(true)
    const win = window.open('', '_blank')
    try {
      const all = []
      for (let from = 0; ; from += 1000) {
        let q = supabase.from('customer_ratings')
          .select('id, window_number, shift, ticket_number, reference_number, ticket_date, rating, comment, created_at, employee:employee_id(full_name_ar, job_number, job_title), station:station_id(name_ar, name_en)')
        if (stationFilter) q = q.eq('station_id', stationFilter)
        if (shiftFilter) q = q.eq('shift', shiftFilter)
        if (employeeFilter) q = q.eq('employee_id', employeeFilter)
        if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00+03:00')
        if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59.999+03:00')
        const { data, error } = await q.order('created_at', { ascending: false }).range(from, from + 999)
        if (error) throw error
        all.push(...(data ?? []))
        if ((data ?? []).length < 1000) break
      }
      const selectedEmployee = employeeFilter ? employees.find(e => e.id === employeeFilter) : null
      const selectedStation = stationFilter ? stations.find(s => s.id === stationFilter) : null
      const shiftLbl = shiftFilter ? SHIFTS.find(s => s.value === shiftFilter) : null
      const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString(loc)
      const scopeParts = [
        selectedStation ? stationLabel(selectedStation, isAr) : (isAr ? 'جميع المحطات' : 'All stations'),
        shiftLbl ? (isAr ? shiftLbl.ar : shiftLbl.en) : '',
        dateFrom || dateTo ? `${dateFrom ? (isAr ? 'من ' : 'From ') + fmtD(dateFrom) : ''} ${dateTo ? (isAr ? 'إلى ' : 'to ') + fmtD(dateTo) : ''}`.trim() : (isAr ? 'كل الفترات' : 'All periods'),
      ]
      const html = buildRatingsReportHtml({ rows: all, isAr, loc, stationLabel: st => stationLabel(st, isAr), ratedDate, ratedTime, scopeParts, printedBy: profile?.full_name_ar, selectedEmployee, withDetails: true })
      if (win) { win.document.open(); win.document.write(html); win.document.close() }
    } catch (e) {
      win?.close()
      alert((isAr ? 'تعذّر إنشاء التقرير: ' : 'Could not build the report: ') + (e.message || ''))
    }
    setPrinting(false)
  }

  const printLabel = printing ? (isAr ? 'جارٍ إعداد التقرير...' : 'Preparing report...') : employeeFilter ? (isAr ? 'طباعة تقرير الموظف' : 'Print employee report') : stationFilter ? (isAr ? 'طباعة تقرير المحطة' : 'Print station report') : (isAr ? 'طباعة التقرير' : 'Print report')

  // الكمبيوتر: ترويسة بمؤشرات + فلاتر بتسميات + رسم ومخططات + جدول عريض (الجوال أدناه كما كان)
  if (desk) {
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
    const activeStationKey = stations.find(s => s.id === stationFilter)?.name_ar
    const pickStation = nameAr => {
      const st = stations.find(s => s.name_ar === nameAr)
      if (st) setStationFilter(f => (f === st.id ? '' : st.id))
    }
    const dirty = !!(stationFilter || shiftFilter || employeeFilter || dateFrom || dateTo !== todayStr())
    const resetFilters = () => { setStationFilter(''); setShiftFilter(''); setEmployeeFilter(''); setDateFrom(''); setDateTo(todayStr()) }
    const hasRows = summary.n > 0
    const stats = [
      { label: isAr ? 'إجمالي التقييمات' : 'Total ratings', value: summary.n, hint: summary.n >= 2000 ? (isAr ? 'أحدث 2000 تقييم' : 'Latest 2000 ratings') : (isAr ? 'ضمن الفلاتر الحالية' : 'Within current filters') },
      { label: isAr ? 'متوسط التقييم' : 'Average rating', value: hasRows ? <bdi dir="ltr">{f1(summary.avg)} / 5</bdi> : '—', color: hasRows ? toneVar(summary.avg) : undefined, hint: isAr ? 'من 5 درجات' : 'Out of 5' },
      { label: isAr ? 'نسبة الرضا (4 فأعلى)' : 'Satisfaction (4+)', value: hasRows ? `${pct(summary.high, summary.n)}%` : '—', color: hasRows ? 'var(--success)' : undefined, hint: `${summary.high} ${isAr ? 'تقييم' : 'ratings'}` },
      { label: isAr ? 'تقييمات منخفضة (2 فأقل)' : 'Low ratings (2 or less)', value: summary.low, color: summary.low ? 'var(--danger)' : undefined, hint: hasRows ? `${pct(summary.low, summary.n)}%` : undefined },
      { label: isAr ? 'تقييمات بتعليق' : 'With comments', value: summary.withComment, hint: hasRows ? `${pct(summary.withComment, summary.n)}%` : undefined },
    ]
    const printBtn = <button type="button" className="cr-btn" onClick={printReport} disabled={printing}>{printLabel}</button>
    const insights = <RatingsInsights summary={summary} isAr={isAr} wide={wide} activeStationKey={activeStationKey} onPickStation={pickStation} />
    const note = msg => <div className="cr-card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.95rem' }}>{msg}</div>
    return (
      <div>
        <RatingsHeader isAr={isAr} tab="ratings" onTab={onTab} stats={stats} actions={printBtn} />
        <RatingsFilterBar isAr={isAr} stations={stations} employees={employees}
          stationFilter={stationFilter} setStationFilter={setStationFilter} shiftFilter={shiftFilter} setShiftFilter={setShiftFilter}
          employeeFilter={employeeFilter} setEmployeeFilter={setEmployeeFilter} dateFrom={dateFrom} setDateFrom={setDateFrom}
          dateTo={dateTo} setDateTo={setDateTo} sortBy={sortBy} setSortBy={setSortBy} dirty={dirty} onReset={resetFilters} />
        {loading ? note(isAr ? 'جارٍ التحميل...' : 'Loading...')
          : sorted.length === 0 ? note(isAr ? 'لا توجد تقييمات بهذي الفلاتر' : 'No ratings match these filters')
          : (
            <div style={wide ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 16, alignItems: 'start' } : { display: 'grid', gap: 16 }}>
              {!wide && insights}
              <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
                <RatingsTrend days={summary.days} isAr={isAr} />
                <RatingsTable rows={sorted.slice(0, limit)} total={sorted.length} isAr={isAr} loc={loc} ratedDate={ratedDate} ratedTime={ratedTime}
                  sticky={roomy} onOpen={setDetail} onMore={() => setLimit(l => l + 100)} />
              </div>
              {wide && insights}
            </div>
          )}
        {detail && <RatingDetailSheet rating={detail} isAr={isAr} loc={loc} ratedDate={ratedDate} ratedTime={ratedTime} onClose={() => setDetail(null)} />}
      </div>
    )
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
        <button onClick={printReport} disabled={printing} className="ms-auto bg-nwbus-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          {printing ? (isAr ? 'جارٍ إعداد التقرير...' : 'Preparing report...') : employeeFilter ? (isAr ? 'طباعة تقرير الموظف' : 'Print employee report') : stationFilter ? (isAr ? 'طباعة تقرير المحطة' : 'Print station report') : (isAr ? 'طباعة التقرير' : 'Print report')}
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3">
          <p className="text-xs text-gray-400">{isAr ? 'إجمالي التقييمات' : 'Total ratings'}</p>
          <p className="text-xl font-bold text-gray-800">{rows.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3">
          <p className="text-xs text-gray-400">{isAr ? 'متوسط التقييم' : 'Average rating'}</p>
          <p className="text-xl font-bold text-amber-500"><bdi dir="ltr">{avg} / 5</bdi></p>
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
                        <span className={`font-bold ${r.rating >= 4 ? 'text-green-600' : r.rating === 3 ? 'text-amber-500' : 'text-red-500'}`}><bdi dir="ltr">{r.rating} / 5</bdi></span>
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
                    <span className={`shrink-0 font-bold text-sm px-2 py-0.5 rounded-full ${r.rating >= 4 ? 'bg-green-50 text-green-600' : r.rating === 3 ? 'bg-amber-50 text-amber-500' : 'bg-red-50 text-red-500'}`}><bdi dir="ltr">{r.rating} / 5</bdi></span>
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

function MessagesTab({ desk = false, onTab }) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [stations, setStations] = useState([])
  const [msgs, setMsgs] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [savedId, setSavedId] = useState(null) // عرض فقط: تأكيد الحفظ بالكمبيوتر

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
    const { error } = await supabase.from('station_rating_messages').upsert({
      station_id: stationId,
      welcome_message: row.welcome_message || null,
      closing_message: row.closing_message || null,
    }, { onConflict: 'station_id' })
    setSavingId(null)
    if (error) return
    setSavedId(stationId)
    setTimeout(() => setSavedId(cur => (cur === stationId ? null : cur)), 2500)
  }

  if (desk) {
    const custom = k => Object.values(msgs).filter(m => m[k]).length
    const stats = [
      { label: isAr ? 'عدد المحطات' : 'Stations', value: loading ? '—' : stations.length },
      { label: isAr ? 'ترحيب مخصص' : 'Custom welcome', value: loading ? '—' : custom('welcome_message'), hint: isAr ? 'محطات لها رسالة ترحيب خاصة' : 'Stations with their own welcome' },
      { label: isAr ? 'ختام مخصص' : 'Custom closing', value: loading ? '—' : custom('closing_message'), hint: isAr ? 'محطات لها رسالة ختام خاصة' : 'Stations with their own closing' },
    ]
    return (
      <div>
        <RatingsHeader isAr={isAr} tab="messages" onTab={onTab} stats={stats} />
        {loading
          ? <div className="cr-card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.95rem' }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</div>
          : <MessagesGrid stations={stations} msgs={msgs} setField={setField} save={save} savingId={savingId} savedId={savedId} isAr={isAr} />}
      </div>
    )
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
