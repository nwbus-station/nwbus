import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseSchedule, readBusTypesByColor } from '../../utils/parseSchedule'
import { importSchedule, savePendingSchedule } from '../../utils/importSchedule'
import DatePicker from '../shared/DatePicker'
import { todayStr } from '../../utils/dates'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import ConfirmDialog from '../shared/ConfirmDialog'

export default function ScheduleUploadModal({ isAr, onClose, onDone }) {
  useEscapeKey(onClose)
  const { profile } = useAuth()
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed]     = useState(null)
  const [error, setError]       = useState('')
  const [reading, setReading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [result, setResult]     = useState(null)
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate]     = useState('')
  const [pending, setPending]     = useState([])
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [newStationNames, setNewStationNames] = useState([])
  const [confirmNewStations, setConfirmNewStations] = useState(false)
  const [manualAtRisk, setManualAtRisk] = useState([]) // رحلات يدوية مو موجودة بالملف الجديد
  const [keepManual, setKeepManual] = useState(new Set()) // اللي اخترنا نبقيها منها
  const toggleKeepManual = id => setKeepManual(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const [diff, setDiff]       = useState(null)     // مقارنة الملف بالجدول الحالي
  const [tripSearch, setTripSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [history, setHistory]       = useState([])
  const [dragOver, setDragOver]     = useState(false)
  const [showDiff, setShowDiff]     = useState('')       // 'new' | 'changed' | 'removed' | ''

  const loadPending = () => supabase.from('schedule_uploads')
    .select('id, file_name, period, start_date, end_date')
    .eq('status', 'pending').order('start_date')
    .then(({ data }) => setPending(data ?? []))
  useEffect(() => { loadPending() }, [])
  useEffect(() => {
    supabase.from('schedule_uploads').select('id, file_name, period, start_date, end_date, status, trip_count, uploaded_by_name, created_at')
      .eq('status', 'applied').order('created_at', { ascending: false }).limit(4)
      .then(({ data }) => setHistory(data ?? []))
  }, [result])

  async function updatePending(id, patch) {
    await supabase.from('schedule_uploads').update(patch).eq('id', id)
    loadPending()
  }
  async function deletePending(id) {
    setConfirmCancel(id)
  }

  async function handleFile(e) {
    const file = e?.target?.files?.[0] ?? e?.file
    if (!file) return
    setError(''); setParsed(null); setResult(null); setFileName(file.name); setReading(true)
    setNewStationNames([]); setConfirmNewStations(false)
    setManualAtRisk([]); setKeepManual(new Set())
    try {
      const buf = await file.arrayBuffer()
      const data = parseSchedule(buf)
      if (data.trips.length === 0) throw new Error('الملف لا يحتوي على رحلات صالحة')
      // نوع الحافلة من ألوان الجدول (VIP / WHEELCHAIR / STANDARD / QAID) — لو تعذّرت القراءة نكمل بالقيم الافتراضية
      try {
        const bt = await readBusTypesByColor(buf)
        if (bt) {
          data.trips.forEach(t => { const ty = bt.byCode.get(t.code); if (ty) t.busType = ty })
          data.busTypeCounts = bt.counts
          data.warnings = [...(data.warnings || []), `أنواع الحافلات من ألوان الجدول: ${Object.entries(bt.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`]
        }
      } catch (e) { console.warn('bus type colors skipped:', e) }
      // كشف المحطات الجديدة (غير موجودة في DB)
      const { data: existSt } = await supabase.from('stations').select('name_en')
      const existNames = new Set((existSt || []).map(s => s.name_en))
      const allNames = [...new Set([...data.stations, ...data.stops.map(s => s.station).filter(Boolean)])]
      setNewStationNames(allNames.filter(n => !existNames.has(n)))
      // كشف الرحلات المضافة يدوياً واللي مو موجودة بالملف الجديد — بترحل للتعطيل التلقائي
      const fileCodes = new Set(data.trips.map(t => t.code))
      const { data: manualTrips } = await supabase.from('trip_schedule')
        .select('id, trip_number, trip_name, scheduled_departure')
        .eq('is_manual', true).eq('is_active', true)
      const atRisk = (manualTrips ?? []).filter(t => !fileCodes.has(t.trip_number))
      setManualAtRisk(atRisk)
      setKeepManual(new Set(atRisk.map(t => t.id))) // افتراضياً: نبقيها كلها
      // مقارنة الملف بالجدول الحالي (للعرض فقط — لا تؤثر على الرفع)
      try {
        const { data: cur } = await supabase.from('trip_schedule')
          .select('trip_number, scheduled_departure, scheduled_arrival, bus_type, is_active, from_station:from_station_id(name_en), to_station:to_station_id(name_en)')
          .range(0, 4999)
        const byCode = new Map((cur ?? []).map(t => [t.trip_number, t]))
        const h5 = v => (v ? String(v).slice(0, 5) : '')
        const nb = v => { const k = String(v || '').toUpperCase(); return k === 'WCH' ? 'WHEELCHAIR' : k }
        const fresh = [], changed = [], reactivated = []
        data.trips.forEach(t => {
          const o = byCode.get(t.code)
          if (!o) { fresh.push(t); return }
          const reasons = []
          if (h5(o.scheduled_departure) !== h5(t.startTime)) reasons.push(`${isAr ? 'المغادرة' : 'Dep'} ${h5(o.scheduled_departure) || '—'} → ${h5(t.startTime) || '—'}`)
          if (h5(o.scheduled_arrival) !== h5(t.endTime)) reasons.push(`${isAr ? 'الوصول' : 'Arr'} ${h5(o.scheduled_arrival) || '—'} → ${h5(t.endTime) || '—'}`)
          if (nb(o.bus_type) !== nb(t.busType)) reasons.push(`${isAr ? 'النوع' : 'Type'} ${nb(o.bus_type) || '—'} → ${nb(t.busType) || '—'}`)
          if ((o.from_station?.name_en || '') !== (t.startStation || '') || (o.to_station?.name_en || '') !== (t.endStation || '')) reasons.push(isAr ? 'تغيّر المسار' : 'route changed')
          if (o.is_active === false) reactivated.push(t)
          if (reasons.length) changed.push({ ...t, reasons })
        })
        const removed = (cur ?? []).filter(o => o.is_active && !fileCodes.has(o.trip_number))
        setDiff({ fresh, changed, reactivated, removed, same: data.trips.length - fresh.length - changed.length })
      } catch (e2) { console.warn('schedule diff skipped:', e2); setDiff(null) }
      setTripSearch(''); setTypeFilter(''); setShowDiff('')
      setParsed(data)
    } catch (err) {
      setError(err.message || 'تعذّر قراءة الملف')
    } finally {
      setReading(false)
    }
  }

  const isFuture = startDate && startDate > todayStr()

  async function handleConfirm() {
    setSaving(true); setError('')
    try {
      if (isFuture) {
        // جدول مستقبلي → يُحفظ معلّقاً ويُطبَّق تلقائياً في تاريخ بدايته
        await savePendingSchedule(parsed, profile, fileName, { startDate, endDate: endDate || null })
        setResult({ pending: true, startDate, endDate })
      } else {
        const summary = await importSchedule(parsed, profile, fileName, { startDate, endDate: endDate || null, keepManualIds: [...keepManual] })
        setResult(summary)
      }
      onDone?.()
    } catch (err) {
      setError(err.message || 'تعذّر الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // ── بيانات العرض (للمعاينة فقط) ──
  const TYPE_STYLE = {
    VIP:        { bar: '#d97706', chip: 'bg-amber-100 text-amber-800', ar: 'VIP' },
    WHEELCHAIR: { bar: '#0ea5e9', chip: 'bg-sky-100 text-sky-800', ar: 'WHEELCHAIR' },
    STANDARD:   { bar: '#94a3b8', chip: 'bg-slate-100 text-slate-700', ar: 'STANDARD' },
    QAID:       { bar: '#16a34a', chip: 'bg-green-100 text-green-800', ar: 'QAID' },
  }
  const typeCounts = {}
  const stopsPer = {}
  let outCount = 0, inCount = 0
  if (parsed) {
    parsed.trips.forEach(t => {
      const k = String(t.busType || 'WHEELCHAIR').toUpperCase(); typeCounts[k] = (typeCounts[k] || 0) + 1
      if (/-I-|-I\d/i.test(t.code)) inCount++; else outCount++
    })
    parsed.stops.forEach(sp => { stopsPer[sp.code] = (stopsPer[sp.code] || 0) + 1 })
  }
  const shownTrips = parsed ? parsed.trips.filter(t => {
    if (typeFilter && String(t.busType || 'WHEELCHAIR').toUpperCase() !== typeFilter) return false
    if (!tripSearch) return true
    const q = tripSearch.toLowerCase()
    return t.code.toLowerCase().includes(q) || (t.route || '').toLowerCase().includes(q) ||
      (t.startStation || '').toLowerCase().includes(q) || (t.endStation || '').toLowerCase().includes(q)
  }) : []
  const stepNo = result ? 3 : parsed ? 2 : 1
  const STEPS = [[1, isAr ? 'اختيار الملف' : 'Choose file'], [2, isAr ? 'المراجعة' : 'Review'], [3, isAr ? 'الاعتماد' : 'Apply']]
  const isPast = startDate && startDate < todayStr()

  function onDrop(ev) {
    ev.preventDefault(); setDragOver(false)
    const f = ev.dataTransfer?.files?.[0]
    if (f) handleFile({ file: f })
  }
  const fmtD = d => (d ? new Date(d).toLocaleDateString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')

  return (
    <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden">

        {/* ═ الترويسة + الخطوات ═ */}
        <div className="shrink-0 px-6 pt-5 pb-4 text-white" style={{ background: 'linear-gradient(135deg,#0f2444,#1b3a6b 60%,#264673)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-white/60">{isAr ? 'إدارة الجداول' : 'Schedule management'}</p>
              <h3 className="text-lg font-extrabold mt-0.5">{isAr ? 'رفع جدول الرحلات' : 'Upload trip schedule'}</h3>
            </div>
            <button onClick={onClose} aria-label="close" className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-xl leading-none grid place-items-center">×</button>
          </div>
          <div className="flex items-center gap-2 mt-4">
            {STEPS.map(([n, label], i) => (
              <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
                <span className={`w-6 h-6 rounded-full text-[11px] font-extrabold grid place-items-center shrink-0 ${stepNo > n ? 'bg-emerald-400 text-emerald-950' : stepNo === n ? 'bg-white text-slate-900' : 'bg-white/15 text-white/60'}`}>{stepNo > n ? '✓' : n}</span>
                <span className={`text-xs font-bold whitespace-nowrap ${stepNo >= n ? 'text-white' : 'text-white/50'}`}>{label}</span>
                {i < STEPS.length - 1 && <span className={`h-px flex-1 ${stepNo > n ? 'bg-emerald-300/70' : 'bg-white/20'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">

          {/* ═ تم الحفظ — جدول مستقبلي ═ */}
          {result?.pending ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 grid place-items-center mx-auto text-2xl">⏱</div>
              <p className="font-extrabold text-slate-900 mt-3">{isAr ? 'تمت جدولة الجدول للمستقبل' : 'Schedule queued'}</p>
              <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3 inline-block">
                {isAr ? 'سيُطبَّق تلقائياً بتاريخ' : 'Will auto-apply on'} <b>{result.startDate}</b>
                {result.endDate ? <> {isAr ? 'حتى' : 'until'} <b>{result.endDate}</b></> : null}.
                <br />{isAr ? 'الجدول الحالي يستمر حتى ذلك التاريخ.' : 'Current schedule stays until then.'}
              </p>
              <div><button onClick={onClose} className="mt-4 bg-slate-900 text-white rounded-xl px-8 py-2.5 text-sm font-bold hover:bg-black">{isAr ? 'إغلاق' : 'Close'}</button></div>
            </div>

          ) : result ? (
            /* ═ تم الحفظ — فوري ═ */
            <div className="py-3">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center mx-auto text-2xl">✓</div>
                <p className="font-extrabold text-slate-900 mt-3">{isAr ? 'تم تحديث الجدول بنجاح' : 'Schedule updated successfully'}</p>
                <p className="text-xs text-slate-400 mt-1">{result.period || ''}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
                {[
                  [isAr ? 'رحلات جديدة' : 'New trips', result.tripsAdded, 'text-emerald-600'],
                  [isAr ? 'رحلات محدّثة' : 'Updated', result.tripsUpdated, 'text-blue-600'],
                  [isAr ? 'رحلات معطّلة' : 'Deactivated', result.tripsDeactivated, 'text-slate-500'],
                  [isAr ? 'محطات جديدة' : 'New stations', result.newStations, 'text-violet-600'],
                  [isAr ? 'محطات عبور' : 'Stops', result.stops, 'text-slate-700'],
                  ...(result.stationTimesRefreshed != null ? [[isAr ? 'أوقات محطات حُدّثت' : 'Station times refreshed', result.stationTimesRefreshed, 'text-sky-600']] : []),
                ].map(([l, v, c]) => (
                  <div key={l} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-center">
                    <p className={`text-2xl font-extrabold font-mono ${c}`}>{v ?? 0}</p>
                    <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{l}</p>
                  </div>
                ))}
              </div>
              <div className="text-center"><button onClick={onClose} className="mt-5 bg-slate-900 text-white rounded-xl px-8 py-2.5 text-sm font-bold hover:bg-black">{isAr ? 'إغلاق' : 'Close'}</button></div>
            </div>

          ) : (
            <>
              {/* ═ الخطوة 1: اختيار الملف ═ */}
              {!parsed && (
                <>
                  <label onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
                    className={`block rounded-2xl border-2 border-dashed text-center px-6 py-9 cursor-pointer transition ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'}`}>
                    <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
                    <span className="w-14 h-14 rounded-2xl bg-slate-900 text-white grid place-items-center mx-auto">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </span>
                    <p className="font-extrabold text-slate-900 mt-3">{reading ? (isAr ? 'جارٍ قراءة الملف…' : 'Reading the file…') : (isAr ? 'اسحب ملف الجدول هنا أو اضغط للاختيار' : 'Drop the schedule file here or click to choose')}</p>
                    <p className="text-xs text-slate-400 mt-1">{isAr ? 'Excel (.xlsx) — ورقة SCHEDULE وورقة Intermediate stops schedule، وأنواع الحافلات تُقرأ من ألوان الجدول' : 'Excel (.xlsx) — SCHEDULE and Intermediate stops sheets; bus types are read from the sheet colors'}</p>
                    {fileName && !reading && <p className="text-xs font-semibold text-slate-600 mt-2" dir="ltr">{fileName}</p>}
                  </label>

                  {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>}

                  {/* جداول مجدولة (مستقبلية) */}
                  {pending.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2">
                      <div className="text-xs font-extrabold text-amber-800">{isAr ? 'جداول مجدولة للمستقبل' : 'Scheduled uploads'}</div>
                      {pending.map(p => (
                        <div key={p.id} className="bg-white rounded-xl p-2.5 text-xs space-y-1.5 border border-amber-100">
                          <div className="flex justify-between items-center gap-2">
                            <span className="font-semibold text-slate-700 truncate" dir="ltr">{p.file_name || p.period || '—'}</span>
                            <button onClick={() => deletePending(p.id)} className="text-red-500 hover:underline shrink-0">{isAr ? 'إلغاء' : 'Cancel'}</button>
                          </div>
                          <div className="flex gap-2 items-center flex-wrap">
                            <span className="text-slate-500">{isAr ? 'البداية:' : 'Start:'}</span>
                            <DatePicker value={p.start_date || ''} isAr={isAr} onChange={v => updatePending(p.id, { start_date: v })} className="border rounded-lg px-2 py-1 text-xs bg-white" />
                            <span className="text-slate-500">{isAr ? 'النهاية:' : 'End:'}</span>
                            <DatePicker value={p.end_date || ''} isAr={isAr} onChange={v => updatePending(p.id, { end_date: v || null })} className="border rounded-lg px-2 py-1 text-xs bg-white" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* آخر الجداول المرفوعة */}
                  {history.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-3.5">
                      <div className="text-xs font-extrabold text-slate-700 mb-2">{isAr ? 'آخر الجداول المرفوعة' : 'Recent uploads'}</div>
                      <div className="divide-y divide-slate-100">
                        {history.map(h => (
                          <div key={h.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-700 truncate" dir="ltr">{h.file_name || h.period || '—'}</p>
                              <p className="text-slate-400">{fmtD(h.created_at)}{h.uploaded_by_name ? ` · ${h.uploaded_by_name}` : ''}</p>
                            </div>
                            <span className="shrink-0 bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 font-bold">{h.trip_count ?? '—'} {isAr ? 'رحلة' : 'trips'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ═ الخطوة 2: المراجعة ═ */}
              {parsed && !error && (
                <>
                  <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-slate-400">{isAr ? 'الملف' : 'File'}</p>
                      <p className="text-sm font-bold text-slate-800 truncate" dir="ltr">{fileName}</p>
                    </div>
                    <button onClick={() => { setParsed(null); setDiff(null); setFileName(''); setError('') }}
                      className="shrink-0 text-xs font-bold border border-slate-300 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50">{isAr ? 'تغيير الملف' : 'Change file'}</button>
                  </div>

                  {/* مؤشرات */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      [isAr ? 'الفترة' : 'Period', parsed.period || '—', 'text-sm'],
                      [isAr ? 'الرحلات' : 'Trips', parsed.trips.length, 'text-2xl'],
                      [isAr ? 'المحطات الرئيسية' : 'Main stations', parsed.stations.length, 'text-2xl'],
                      [isAr ? 'سطور العبور' : 'Stop rows', parsed.stops.length, 'text-2xl'],
                    ].map(([l, v, sz]) => (
                      <div key={l} className="bg-white border border-slate-200 rounded-2xl px-3.5 py-3 text-center min-w-0">
                        <p className="text-[11px] font-semibold text-slate-400">{l}</p>
                        <p className={`${sz === 'text-sm' ? 'text-xs break-words' : 'text-2xl font-mono truncate'} font-extrabold text-slate-900 leading-tight mt-1`} title={String(v)} dir="auto">{v}</p>
                      </div>
                    ))}
                  </div>

                  {/* أنواع الحافلات والاتجاه */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[13px] font-extrabold text-slate-800">{isAr ? 'أنواع الحافلات' : 'Bus types'} <span className="text-[11px] font-semibold text-slate-400">{isAr ? '(من ألوان الجدول)' : '(from sheet colors)'}</span></p>
                      <p className="text-[11px] text-slate-400">{isAr ? `ذهاب ${outCount} · عودة ${inCount}` : `Out ${outCount} · In ${inCount}`}</p>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
                        const st = TYPE_STYLE[k] ?? TYPE_STYLE.STANDARD
                        return (
                          <button key={k} type="button" onClick={() => setTypeFilter(f => (f === k ? '' : k))} className="w-full flex items-center gap-3 text-start group">
                            <span className={`text-[10px] font-bold rounded px-2 py-0.5 w-24 text-center ${st.chip} ${typeFilter === k ? 'ring-2 ring-slate-800' : ''}`}>{k}</span>
                            <span className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><span className="block h-2 rounded-full" style={{ width: `${Math.round((n / parsed.trips.length) * 100)}%`, background: st.bar }} /></span>
                            <span className="text-xs font-bold font-mono text-slate-700 w-16 text-end">{n} <span className="text-slate-400 font-normal">({Math.round((n / parsed.trips.length) * 100)}%)</span></span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* مقارنة بالجدول الحالي */}
                  {diff && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-4">
                      <p className="text-[13px] font-extrabold text-slate-800 mb-2.5">{isAr ? 'مقارنة بالجدول الحالي' : 'Compared with the current schedule'}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          ['new', isAr ? 'رحلات جديدة' : 'New', diff.fresh.length, 'text-emerald-700 bg-emerald-50 border-emerald-200'],
                          ['changed', isAr ? 'سيتغيّر فيها شي' : 'Changed', diff.changed.length, 'text-blue-700 bg-blue-50 border-blue-200'],
                          ['removed', isAr ? 'ستُعطَّل (غير موجودة بالملف)' : 'Will be deactivated', diff.removed.length, 'text-red-700 bg-red-50 border-red-200'],
                          ['', isAr ? 'بدون تغيير' : 'Unchanged', diff.same, 'text-slate-600 bg-slate-50 border-slate-200'],
                        ].map(([k, l, n, cls]) => (
                          <button key={l} type="button" disabled={!k || !n} onClick={() => setShowDiff(v => (v === k ? '' : k))}
                            className={`rounded-xl border px-3 py-2.5 text-center transition ${cls} ${k && n ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'} ${showDiff === k && k ? 'ring-2 ring-slate-700' : ''}`}>
                            <p className="text-xl font-extrabold font-mono">{n}</p>
                            <p className="text-[10.5px] font-bold leading-tight">{l}</p>
                          </button>
                        ))}
                      </div>
                      {diff.reactivated.length > 0 && <p className="text-[11px] text-slate-500 mt-2">{isAr ? `${diff.reactivated.length} رحلة معطّلة حالياً ستُفعَّل من جديد.` : `${diff.reactivated.length} currently inactive trip(s) will be re-activated.`}</p>}
                      {showDiff && (
                        <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                          {(showDiff === 'new' ? diff.fresh.map(t => ({ k: t.code, a: `${t.startStation} → ${t.endStation}`, b: t.startTime }))
                            : showDiff === 'changed' ? diff.changed.map(t => ({ k: t.code, a: t.reasons.join(' · '), b: '' }))
                            : diff.removed.map(t => ({ k: t.trip_number, a: `${t.from_station?.name_en ?? ''} → ${t.to_station?.name_en ?? ''}`, b: String(t.scheduled_departure || '').slice(0, 5) }))
                          ).map(r => (
                            <div key={r.k} className="px-3 py-1.5 flex items-center gap-3">
                              <span className="font-mono font-bold text-slate-800 w-28 shrink-0" dir="ltr">{r.k}</span>
                              <span className="text-slate-500 truncate flex-1" dir="auto">{r.a}</span>
                              <span className="font-mono text-slate-400" dir="ltr">{r.b}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* معاينة رحلات الملف */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                      <p className="text-[13px] font-extrabold text-slate-800 shrink-0">{isAr ? 'رحلات الملف' : 'Trips in the file'}</p>
                      <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{shownTrips.length}</span>
                      {typeFilter && <button type="button" onClick={() => setTypeFilter('')} className="text-[11px] font-bold text-slate-500 hover:text-slate-800">✕ {typeFilter}</button>}
                      <input value={tripSearch} onChange={e => setTripSearch(e.target.value)} placeholder={isAr ? 'بحث برقم الرحلة أو المحطة…' : 'Search trip or station…'}
                        className="ms-auto w-44 sm:w-56 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-slate-400 focus:outline-none" />
                    </div>
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[10.5px] font-bold">
                          <tr>
                            {[isAr ? 'الرحلة' : 'Trip', isAr ? 'المسار' : 'Route', isAr ? 'المغادرة' : 'Dep', isAr ? 'الوصول' : 'Arr', isAr ? 'عبور' : 'Stops', isAr ? 'النوع' : 'Type'].map(h => <th key={h} className="px-3 py-2 text-start whitespace-nowrap">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {shownTrips.slice(0, 300).map(t => {
                            const k = String(t.busType || 'WHEELCHAIR').toUpperCase(), st = TYPE_STYLE[k] ?? TYPE_STYLE.STANDARD
                            return (
                              <tr key={t.code} className="hover:bg-slate-50/70">
                                <td className="px-3 py-1.5 font-mono font-bold text-slate-800 whitespace-nowrap" dir="ltr">{t.code}</td>
                                <td className="px-3 py-1.5 text-slate-600 max-w-[230px] truncate" dir="ltr" title={`${t.startStation} → ${t.endStation}`}>{t.startStation} → {t.endStation}</td>
                                <td className="px-3 py-1.5 font-mono text-slate-700">{t.startTime || '—'}</td>
                                <td className="px-3 py-1.5 font-mono text-slate-700">{t.endTime || '—'}</td>
                                <td className="px-3 py-1.5 font-mono text-slate-500">{stopsPer[t.code] || 0}</td>
                                <td className="px-3 py-1.5"><span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${st.chip}`}>{k}</span></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      {shownTrips.length === 0 && <p className="text-center text-slate-400 text-xs py-6">{isAr ? 'لا توجد نتائج' : 'No results'}</p>}
                    </div>
                  </div>

                  {/* المحطات */}
                  <details className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm">
                    <summary className="cursor-pointer text-[13px] font-extrabold text-slate-800">{isAr ? `المحطات الرئيسية (${parsed.stations.length})` : `Main stations (${parsed.stations.length})`}</summary>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {parsed.stations.map(s => <span key={s} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-xs text-slate-600" dir="ltr">{s}</span>)}
                    </div>
                  </details>

                  {parsed.warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded-xl p-3 space-y-0.5">
                      {parsed.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                    </div>
                  )}

                  {/* محطات جديدة */}
                  {newStationNames.length > 0 && (
                    <div className="bg-red-50 border border-red-300 rounded-2xl p-3.5 space-y-2">
                      <div className="text-sm font-extrabold text-red-700">⚠ {newStationNames.length} {isAr ? 'محطة غير موجودة في النظام — ستُضاف تلقائياً' : 'station(s) not in the system — will be added'}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {newStationNames.map(n => <span key={n} className="bg-red-100 border border-red-300 text-red-800 text-xs px-2 py-0.5 rounded-lg" dir="ltr">{n}</span>)}
                      </div>
                      <label className="flex items-center gap-2 text-sm text-red-800 cursor-pointer select-none">
                        <input type="checkbox" checked={confirmNewStations} onChange={e => setConfirmNewStations(e.target.checked)} />
                        {isAr ? 'أؤكد إضافة هذه المحطات الجديدة' : 'I confirm adding these new stations'}
                      </label>
                    </div>
                  )}

                  {/* رحلات يدوية غير موجودة بالملف */}
                  {manualAtRisk.length > 0 && (
                    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 space-y-2">
                      <div className="text-sm font-extrabold text-amber-800">⚠ {manualAtRisk.length} {isAr ? 'رحلة مضافة يدوياً غير موجودة بهذا الملف' : 'manually-added trips not in this file'}</div>
                      <p className="text-xs text-amber-700">{isAr ? 'عادةً تُعطَّل الرحلات الغائبة عن الملف تلقائياً. اختر أي منها تبي تبقيها فعّالة:' : 'Trips missing from the file are normally deactivated. Pick which to keep active:'}</p>
                      <div className="space-y-1.5">
                        {manualAtRisk.map(t => (
                          <label key={t.id} className="flex items-center gap-2 text-sm text-amber-900 bg-white border border-amber-200 rounded-xl px-3 py-2 cursor-pointer">
                            <input type="checkbox" checked={keepManual.has(t.id)} onChange={() => toggleKeepManual(t.id)} />
                            <span className="font-mono font-bold">{t.trip_number}</span>
                            <span className="text-amber-600">{t.trip_name}</span>
                            {t.scheduled_departure && <span className="text-amber-500 text-xs ms-auto">{String(t.scheduled_departure).slice(0, 5)}</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* التواريخ */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-[13px] font-extrabold text-slate-800 mb-3">{isAr ? 'فترة التطبيق' : 'Application period'}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">{isAr ? 'تاريخ البداية' : 'Start date'}</label>
                        <DatePicker value={startDate} onChange={setStartDate} isAr={isAr} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">{isAr ? 'تاريخ النهاية (اختياري)' : 'End date (optional)'}</label>
                        <DatePicker value={endDate} onChange={setEndDate} isAr={isAr} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
                      </div>
                    </div>
                    <div className={`text-xs rounded-xl p-3 border mt-3 leading-relaxed ${isFuture ? 'bg-amber-50 border-amber-200 text-amber-900' : isPast ? 'bg-sky-50 border-sky-200 text-sky-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                      {isFuture
                        ? (isAr ? `جدول مستقبلي — يُحفظ ويُطبَّق تلقائياً بتاريخ ${startDate}، والجدول الحالي يستمر حتى ذلك اليوم.` : `Future schedule — applies automatically on ${startDate}; the current one stays until then.`)
                        : isPast
                          ? (isAr ? `تاريخ البداية ${startDate} سابق: يُسجَّل في سجل الرفع فقط — الجدول يُطبَّق الآن ولا يغيّر السجلات المُدخلة للأيام السابقة. الرحلات الغائبة عن الملف تُعطَّل ولا تُحذف.` : `Start date ${startDate} is in the past: it is only recorded in the upload log — the schedule applies now and does not alter entries already saved for past days. Trips missing from the file are deactivated, not deleted.`)
                          : (isAr ? 'يُطبَّق الآن: الرحلات الجديدة تُضاف، الموجودة تُحدَّث، والغائبة عن الملف تُعطَّل (لا تُحذف). سجلات الأيام السابقة وأوقات المحطات المعدّلة يدوياً تبقى كما هي.' : 'Applies now: new trips added, existing updated, missing deactivated (never deleted). Saved history and manually edited station times are kept.')}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* ═ الذيل ═ */}
        {parsed && !error && !result && (
          <div className="shrink-0 bg-white border-t border-slate-200 px-5 py-3 flex items-center gap-3">
            <p className="text-[11px] text-slate-400 hidden sm:block flex-1">
              {diff ? (isAr ? `${diff.fresh.length} جديدة · ${diff.changed.length} متغيّرة · ${diff.removed.length} ستُعطَّل` : `${diff.fresh.length} new · ${diff.changed.length} changed · ${diff.removed.length} to deactivate`) : ''}
            </p>
            <button onClick={onClose} disabled={saving} className="px-5 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 font-semibold ms-auto sm:ms-0">{isAr ? 'إلغاء' : 'Cancel'}</button>
            <button onClick={handleConfirm} disabled={saving || (newStationNames.length > 0 && !confirmNewStations)}
              className="px-6 py-2.5 text-sm rounded-xl bg-slate-900 text-white font-extrabold hover:bg-black disabled:opacity-50">
              {saving ? (isAr ? 'جارٍ الحفظ…' : 'Saving…') : isFuture ? (isAr ? 'جدولة للمستقبل' : 'Schedule') : (isAr ? 'اعتماد وحفظ' : 'Confirm & save')}
            </button>
          </div>
        )}
      </div>

      {confirmCancel && (
        <ConfirmDialog
          message={isAr ? 'إلغاء هذا الجدول المجدول؟' : 'Cancel this scheduled upload?'}
          danger={false}
          onConfirm={async () => {
            setConfirmCancel(null)
            await supabase.from('schedule_uploads').delete().eq('id', confirmCancel)
            loadPending()
          }}
          onCancel={() => setConfirmCancel(null)}
        />
      )}
    </div>
  )
}
