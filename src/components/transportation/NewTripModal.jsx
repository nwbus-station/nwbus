import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import SearchSelect from '../shared/SearchSelect'
import DatePicker from '../shared/DatePicker'
import TimeInput24 from '../shared/TimeInput24'
import { isRestStation } from '../../utils/stations'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { todayStr } from '../../utils/dates'

/**
 * إضافة رحلة (خط) جديدة يدوياً — للأدمن فقط.
 * تُنشئ رحلة دائمة في trip_schedule بدون رفع Excel، مع محطات العبور
 * وتفعيلها مباشرة في ترحيل محطاتها (اختياري).
 */
const BUS_TYPES = ['STANDARD', 'VIP', 'WHEELCHAIR', 'QAID']
// 0=أحد..6=سبت — نفس ترقيم Date.getDay()
const WEEKDAYS = [
  { value: 0, ar: 'أحد',     en: 'Sun' },
  { value: 1, ar: 'اثنين',   en: 'Mon' },
  { value: 2, ar: 'ثلاثاء',  en: 'Tue' },
  { value: 3, ar: 'أربعاء',  en: 'Wed' },
  { value: 4, ar: 'خميس',    en: 'Thu' },
  { value: 5, ar: 'جمعة',    en: 'Fri' },
  { value: 6, ar: 'سبت',     en: 'Sat' },
]

export default function NewTripModal({ isAr, onClose, onCreated }) {
  useEscapeKey(onClose)
  const { profile } = useAuth()
  const t = (en, ar) => isAr ? ar : en

  const [stations, setStations] = useState([])
  const [form, setForm] = useState({
    trip_number: '',
    from_station_id: '', to_station_id: '',
    scheduled_departure: '', scheduled_arrival: '',
    bus_type: 'WHEELCHAIR',
    start_date: todayStr(), end_date: '',
  })
  const [recurrence, setRecurrence] = useState('daily') // 'daily' | 'custom'
  const [selectedDays, setSelectedDays] = useState(new Set())
  const toggleDay = d => setSelectedDays(prev => {
    const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n
  })
  const [stops, setStops]   = useState([])   // [{station_id, arrival_time, departure_time}]
  const [hasReturn, setHasReturn] = useState(false)
  const [returnForm, setReturnForm] = useState({ trip_number: '', scheduled_departure: '', scheduled_arrival: '' })
  const setReturn = (k, v) => setReturnForm(f => ({ ...f, [k]: v }))
  const [autoActivate, setAutoActivate] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // نسخ من رحلة موجودة (نفس فكرة اختيار الرحلة الأساسية بالرحلة الإضافية RF)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerTrips, setPickerTrips] = useState([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  useEffect(() => {
    supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_en')
      .then(({ data }) => setStations((data ?? []).filter(s => !isRestStation(s))))
  }, [])

  function openPicker() {
    setShowPicker(true)
    if (pickerTrips.length) return
    setPickerLoading(true)
    supabase.from('trip_schedule')
      .select('id, trip_number, trip_name, route, scheduled_departure, scheduled_arrival, bus_type, from_station:from_station_id(id, name_en, name_ar), to_station:to_station_id(id, name_en, name_ar)')
      .eq('is_active', true).or('is_rf.is.null,is_rf.eq.false')
      .order('scheduled_departure').limit(4000)
      .then(({ data }) => { setPickerTrips(data ?? []); setPickerLoading(false) })
  }

  // معاينة رحلة قبل نسخها — تعرض نقاط توقفها ليختار المستخدم أيها يضيف
  const [previewTrip, setPreviewTrip] = useState(null)
  const [previewStops, setPreviewStops] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)

  async function previewBase(tr) {
    setPreviewTrip(tr)
    setPreviewLoading(true)
    const { data } = await supabase.from('trip_schedule_stops')
      .select('station_id, arrival_time, departure_time, stop_order, station:station_id(id, name_ar, name_en)')
      .eq('trip_schedule_id', tr.id).order('stop_order')
    const mid = (data ?? []).filter(s => s.station_id !== tr.from_station?.id && s.station_id !== tr.to_station?.id)
    const list = []
    if (tr.from_station) list.push({ station_id: tr.from_station.id, station: tr.from_station, arrival_time: null, departure_time: tr.scheduled_departure, endpoint: 'from', on: true })
    mid.forEach(s => list.push({ ...s, on: true }))
    if (tr.to_station) list.push({ station_id: tr.to_station.id, station: tr.to_station, arrival_time: tr.scheduled_arrival, departure_time: null, endpoint: 'to', on: true })
    setPreviewStops(list)
    setPreviewLoading(false)
  }

  function applyBase() {
    const tr = previewTrip
    const dep = tr.scheduled_departure ? tr.scheduled_departure.slice(0, 5) : ''
    const arr = tr.scheduled_arrival ? tr.scheduled_arrival.slice(0, 5) : ''
    set('trip_number', tr.trip_number || '')
    set('from_station_id', tr.from_station?.id || '')
    set('to_station_id', tr.to_station?.id || '')
    set('scheduled_departure', dep)
    set('scheduled_arrival', arr)
    set('bus_type', tr.bus_type || 'WHEELCHAIR')
    lastDepartureRef.current = dep
    setStops(previewStops.filter(s => s.on && !s.endpoint).map(s => ({
      station_id: s.station_id,
      arrival_time: s.arrival_time ? s.arrival_time.slice(0, 5) : '',
      departure_time: s.departure_time ? s.departure_time.slice(0, 5) : '',
    })))
    setPreviewTrip(null)
    setPreviewStops([])
    setShowPicker(false)
  }

  const togglePreviewStop = id => setPreviewStops(prev => prev.map(s => s.station_id === id ? { ...s, on: !s.on } : s))

  // اقتراح رقم رحلة العودة — نفس رقم الذهاب مع رفع آخر رقم فيه بواحد (مثلاً NW28-I-1 → NW28-I-2)
  function suggestReturnNumber(num) {
    const m = num.match(/^(.*?)(\d+)$/)
    if (!m) return ''
    const [, prefix, digits] = m
    const next = String(parseInt(digits, 10) + 1).padStart(digits.length, '0')
    return prefix + next
  }
  // يقترح رقم العودة أول ما تتوفر رحلة عودة + رقم رحلة أصلي — بغض النظر عن ترتيب تعبئة الحقول
  useEffect(() => {
    if (hasReturn && !returnForm.trip_number && form.trip_number.trim()) {
      setReturn('trip_number', suggestReturnNumber(form.trip_number.trim().toUpperCase()))
    }
  }, [hasReturn, form.trip_number])

  // إزاحة كل الأوقات تلقائياً عند تغيير وقت المغادرة — نفس فرق الدقائق يُطبَّق على الوصول ونقاط التوقف
  const toMinutes = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
  const shiftTime = (hhmm, delta) => {
    let total = (toMinutes(hhmm) + delta) % 1440
    if (total < 0) total += 1440
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }
  // آخر وقت مغادرة "مكتمل" فعلياً — نحتفظ فيه بمرجع منفصل لأن مسح الحقل قبل إعادة الكتابة
  // يمرّ بقيمة فاضية مؤقتة، ولو اعتمدنا على form.scheduled_departure مباشرة يضيع الوقت الأصلي قبل ما يكتمل الرقم الجديد
  const lastDepartureRef = useRef('')
  function changeDeparture(v) {
    set('scheduled_departure', v)
    if (!v) return
    const old = lastDepartureRef.current
    if (old && old !== v) {
      const delta = toMinutes(v.slice(0, 5)) - toMinutes(old.slice(0, 5))
      if (delta) {
        if (form.scheduled_arrival) set('scheduled_arrival', shiftTime(form.scheduled_arrival, delta))
        setStops(prev => prev.map(s => ({
          ...s,
          arrival_time: s.arrival_time ? shiftTime(s.arrival_time, delta) : s.arrival_time,
          departure_time: s.departure_time ? shiftTime(s.departure_time, delta) : s.departure_time,
        })))
      }
    }
    lastDepartureRef.current = v
  }

  // وقت وصول العودة = وقت مغادرة العودة + نفس مدة رحلة الذهاب (نفس المسافة، اتجاه معاكس)
  function changeReturnDeparture(v) {
    setReturn('scheduled_departure', v)
    if (v && form.scheduled_departure && form.scheduled_arrival) {
      const duration = ((toMinutes(form.scheduled_arrival.slice(0, 5)) - toMinutes(form.scheduled_departure.slice(0, 5))) % 1440 + 1440) % 1440
      setReturn('scheduled_arrival', shiftTime(v.slice(0, 5), duration))
    }
  }

  const pickerShown = pickerTrips.filter(tr => {
    if (!pickerSearch) return true
    const q = pickerSearch.toLowerCase()
    return (tr.trip_number ?? '').toLowerCase().includes(q) ||
           (tr.route ?? '').toLowerCase().includes(q) ||
           (tr.from_station?.name_en ?? '').toLowerCase().includes(q) ||
           (tr.to_station?.name_en ?? '').toLowerCase().includes(q)
  })

  const stName = id => {
    const s = stations.find(x => x.id === id)
    return s ? (isAr ? s.name_ar : s.name_en) : '—'
  }
  const stationOpts = exclude => stations
    .filter(s => !exclude.includes(s.id))
    .map(s => ({ value: s.id, label: isAr ? s.name_ar : s.name_en }))

  const addStop = () => setStops(p => [...p, { station_id: '', arrival_time: '', departure_time: '' }])
  const setStop = (i, k, v) => setStops(p => p.map((s, idx) => idx === i ? { ...s, [k]: v } : s))
  const delStop = i => setStops(p => p.filter((_, idx) => idx !== i))

  async function create() {
    setError('')
    const num = form.trip_number.trim().toUpperCase()
    if (!num) { setError(t('Enter trip number', 'أدخل رقم الرحلة')); return }
    if (!form.from_station_id || !form.to_station_id) { setError(t('Pick origin and destination', 'اختر محطة الانطلاق والوصول')); return }
    if (form.from_station_id === form.to_station_id) { setError(t('Origin and destination must differ', 'محطة الانطلاق والوصول متطابقتان')); return }
    if (!form.scheduled_departure) { setError(t('Enter departure time', 'أدخل وقت المغادرة')); return }
    if (!form.start_date) { setError(t('Enter start date', 'أدخل تاريخ البداية')); return }
    if (recurrence === 'custom' && selectedDays.size === 0) { setError(t('Pick at least one day', 'اختر يوماً واحداً على الأقل')); return }
    if (hasReturn) {
      if (!returnForm.trip_number.trim()) { setError(t('Enter the return trip number', 'أدخل رقم رحلة العودة')); return }
      if (!returnForm.scheduled_departure) { setError(t('Enter the return departure time', 'أدخل وقت مغادرة العودة')); return }
    }
    const cleanStops = stops.filter(s => s.station_id)
    const dup = cleanStops.find((s, i) => cleanStops.findIndex(x => x.station_id === s.station_id) !== i
      || s.station_id === form.from_station_id || s.station_id === form.to_station_id)
    if (dup) { setError(t('A stop is duplicated or matches an endpoint', 'محطة عبور مكررة أو تطابق الانطلاق/الوصول')); return }

    setSaving(true)
    let newTripId = null
    let newReturnTripId = null
    try {
      /* 1) الرحلة */
      const { data: newTrip, error: e1 } = await supabase.from('trip_schedule').insert({
        trip_number: num,
        trip_name: num,
        route: null,
        from_station_id: form.from_station_id,
        to_station_id: form.to_station_id,
        scheduled_departure: form.scheduled_departure,
        scheduled_arrival: form.scheduled_arrival || null,
        bus_type: form.bus_type,
        is_active: true,
        is_manual: true,
        start_date: form.start_date,
        end_date: form.end_date || null,
        days_of_week: recurrence === 'custom' ? [...selectedDays].sort() : null,
      }).select('id').single()
      if (e1) throw e1
      newTripId = newTrip.id

      /* 2) محطات العبور */
      if (cleanStops.length) {
        const { error: e2 } = await supabase.from('trip_schedule_stops').insert(
          cleanStops.map((s, i) => ({
            trip_schedule_id: newTrip.id, station_id: s.station_id,
            stop_order: i + 1,
            arrival_time: s.arrival_time || null,
            departure_time: s.departure_time || null,
          }))
        )
        if (e2) throw e2
      }

      /* 3) تفعيلها مباشرة في ترحيل محطاتها — نفس منطق رفع الجدول */
      if (autoActivate) {
        const rows = [
          { station_id: form.from_station_id, departure_time: form.scheduled_departure.slice(0, 5), arrival_time: null },
          { station_id: form.to_station_id, departure_time: null, arrival_time: form.scheduled_arrival ? form.scheduled_arrival.slice(0, 5) : null },
          ...cleanStops.map(s => ({
            station_id: s.station_id,
            arrival_time: s.arrival_time ? s.arrival_time.slice(0, 5) : null,
            departure_time: s.departure_time ? s.departure_time.slice(0, 5) : null,
          })),
        ].map(r => ({
          ...r, trip_schedule_id: newTrip.id,
          departure_station_id: null, dep_enabled: true, arr_enabled: true,
          selected_by: profile.id, selected_by_name: profile.full_name_ar,
        }))
        const { error: e3 } = await supabase.from('station_trips')
          .upsert(rows, { onConflict: 'station_id,trip_schedule_id' })
        if (e3) throw e3
      }

      /* 4) رحلة العودة (اختياري) — نفس الخط بعكس الاتجاه */
      if (hasReturn) {
        const retNum = returnForm.trip_number.trim().toUpperCase()
        const { data: newReturn, error: r1 } = await supabase.from('trip_schedule').insert({
          trip_number: retNum,
          trip_name: retNum,
          route: null,
          from_station_id: form.to_station_id,
          to_station_id: form.from_station_id,
          scheduled_departure: returnForm.scheduled_departure,
          scheduled_arrival: returnForm.scheduled_arrival || null,
          bus_type: form.bus_type,
          is_active: true,
          is_manual: true,
          start_date: form.start_date,
          end_date: form.end_date || null,
          days_of_week: recurrence === 'custom' ? [...selectedDays].sort() : null,
        }).select('id').single()
        if (r1) throw r1
        newReturnTripId = newReturn.id

        if (autoActivate) {
          const retRows = [
            { station_id: form.to_station_id, departure_time: returnForm.scheduled_departure.slice(0, 5), arrival_time: null },
            { station_id: form.from_station_id, departure_time: null, arrival_time: returnForm.scheduled_arrival ? returnForm.scheduled_arrival.slice(0, 5) : null },
          ].map(r => ({
            ...r, trip_schedule_id: newReturn.id,
            departure_station_id: null, dep_enabled: true, arr_enabled: true,
            selected_by: profile.id, selected_by_name: profile.full_name_ar,
          }))
          const { error: r2 } = await supabase.from('station_trips')
            .upsert(retRows, { onConflict: 'station_id,trip_schedule_id' })
          if (r2) throw r2
        }

        // ربط الرحلتين ببعض عشان تظهر إشارة "لها رحلة عودة" بتفاصيل كل وحدة منهم
        const { error: r3 } = await supabase.from('trip_schedule').update({ return_trip_id: newReturn.id }).eq('id', newTrip.id)
        if (r3) throw r3
        const { error: r4 } = await supabase.from('trip_schedule').update({ return_trip_id: newTrip.id }).eq('id', newReturn.id)
        if (r4) throw r4
      }

      onCreated?.()
      onClose()
    } catch (err) {
      // تنظيف: لا نُبقي رحلة ناقصة
      if (newReturnTripId) {
        await supabase.from('station_trips').delete().eq('trip_schedule_id', newReturnTripId)
        await supabase.from('trip_schedule').delete().eq('id', newReturnTripId)
      }
      if (newTripId) {
        await supabase.from('station_trips').delete().eq('trip_schedule_id', newTripId)
        await supabase.from('trip_schedule_stops').delete().eq('trip_schedule_id', newTripId)
        await supabase.from('trip_schedule').delete().eq('id', newTripId)
      }
      const dupErr = /duplicate key|unique constraint/i.test(err.message || '')
      setError(dupErr
        ? t('Trip number already exists — change it', 'رقم الرحلة موجود مسبقاً — غيّر الرقم')
        : (err.message || t('Failed to create', 'تعذّر الإنشاء')))
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between bg-nwbus-primary text-white px-5 py-3 rounded-t-2xl">
          <div>
            <h3 className="font-bold">{t('New Trip (Route)', 'إضافة رحلة جديدة (خط)')}</h3>
            <p className="text-xs text-white/70 mt-0.5">
              {t('Permanent trip without Excel upload', 'رحلة دائمة في الجدول بدون رفع Excel')}
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>

        {error && <div className="m-4 mb-0 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-2">{error}</div>}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* نسخ من رحلة موجودة */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <button type="button" onClick={() => { if (showPicker) { setShowPicker(false); setPreviewTrip(null); setPreviewStops([]) } else openPicker() }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
              <span className="text-xs font-semibold text-gray-600">{t('Copy from an existing trip (optional)', 'نسخ من رحلة موجودة (اختياري)')}</span>
              <span className="text-gray-400 text-xs">{showPicker ? '▲' : '▼'}</span>
            </button>
            {showPicker && !previewTrip && (
              <div className="border-t border-gray-200">
                <div className="p-2.5 border-b border-gray-100">
                  <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                    placeholder={t('Search trips…', 'بحث برقم الرحلة أو المحطة…')}
                    className="w-full border rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-nwbus-primary focus:outline-none" />
                </div>
                <div className="max-h-52 overflow-y-auto p-2 space-y-1">
                  {pickerLoading ? (
                    <p className="text-center text-gray-400 py-6 text-xs">{t('Loading…', 'جارٍ التحميل…')}</p>
                  ) : pickerShown.length === 0 ? (
                    <p className="text-center text-gray-400 py-6 text-xs">{t('No trips found', 'لا توجد رحلات')}</p>
                  ) : pickerShown.map(tr => (
                    <button key={tr.id} type="button" onClick={() => previewBase(tr)}
                      className="w-full text-start rounded-lg border border-gray-200 px-3 py-2 hover:border-nwbus-primary hover:bg-gray-50 transition">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-nwbus-primary">{tr.trip_number}</span>
                        {tr.route && <span className="text-[11px] text-gray-400">{tr.route}</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                        {(isAr ? tr.from_station?.name_ar : tr.from_station?.name_en) || '—'}
                        {' → '}
                        {(isAr ? tr.to_station?.name_ar : tr.to_station?.name_en) || '—'}
                        {tr.scheduled_departure && <span className="text-gray-400"> · {tr.scheduled_departure.slice(0, 5)}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showPicker && previewTrip && (
              <div className="border-t border-gray-200">
                <div className="p-2.5 border-b border-gray-100 flex items-center justify-between">
                  <button type="button" onClick={() => { setPreviewTrip(null); setPreviewStops([]) }}
                    className="text-xs text-gray-500 hover:text-gray-700">← {t('Back', 'رجوع')}</button>
                  <span className="text-xs font-bold text-nwbus-primary">{previewTrip.trip_number}</span>
                </div>
                <div className="px-2.5 pt-2 pb-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-500">{t('Intermediate stops — pick which to add', 'نقاط التوقف — اختر أيها تضاف')}</span>
                  {previewStops.some(s => !s.endpoint) && (
                    <div className="flex gap-2 text-[10px]">
                      <button type="button" onClick={() => setPreviewStops(p => p.map(s => s.endpoint ? s : { ...s, on: true }))} className="text-nwbus-primary hover:underline">{t('All', 'الكل')}</button>
                      <button type="button" onClick={() => setPreviewStops(p => p.map(s => s.endpoint ? s : { ...s, on: false }))} className="text-gray-400 hover:underline">{t('None', 'لا شيء')}</button>
                    </div>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto px-2 pb-2 space-y-1">
                  {previewLoading ? (
                    <p className="text-center text-gray-400 py-4 text-xs">{t('Loading…', 'جارٍ التحميل…')}</p>
                  ) : previewStops.length === 0 ? (
                    <p className="text-center text-gray-400 py-4 text-xs">{t('This trip has no intermediate stops', 'هذي الرحلة بدون نقاط توقف')}</p>
                  ) : previewStops.map(s => (
                    <label key={s.station_id}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-1.5 transition ${s.endpoint ? 'border-gray-100 bg-gray-50' : (s.on ? 'border-nwbus-primary bg-gray-50 cursor-pointer' : 'border-gray-200 cursor-pointer')}`}>
                      {s.endpoint ? (
                        <span className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <input type="checkbox" checked={s.on} onChange={() => togglePreviewStop(s.station_id)} className="rounded accent-nwbus-primary" />
                      )}
                      <span className="flex-1 text-xs text-gray-700">
                        {(isAr ? s.station?.name_ar : s.station?.name_en) || '—'}
                        {s.endpoint === 'from' && <span className="text-[10px] text-green-600 ms-2">{t('Origin', 'المنشأ')}</span>}
                        {s.endpoint === 'to' && <span className="text-[10px] text-blue-600 ms-2">{t('Destination', 'الوجهة')}</span>}
                      </span>
                      <span className="text-[11px] text-gray-400 font-mono">
                        {s.departure_time ? s.departure_time.slice(0, 5) : (s.arrival_time ? s.arrival_time.slice(0, 5) : '')}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="px-2.5 pb-2.5">
                  <button type="button" onClick={applyBase}
                    className="w-full bg-nwbus-primary text-white rounded-lg py-1.5 text-xs font-semibold hover:opacity-90">
                    {t('Use this trip', 'استخدام هذه الرحلة')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] text-gray-500 mb-1">{t('Trip number *', 'رقم الرحلة *')}</label>
              <input value={form.trip_number} onChange={e => set('trip_number', e.target.value)} dir="ltr"
                className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('Origin station *', 'محطة الانطلاق *')}</label>
              <SearchSelect isAr={isAr} value={form.from_station_id} onChange={v => set('from_station_id', v)}
                placeholder={t('— Select —', '— اختر —')} className={inputCls}
                options={stationOpts([form.to_station_id])} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('Destination station *', 'محطة الوصول *')}</label>
              <SearchSelect isAr={isAr} value={form.to_station_id} onChange={v => set('to_station_id', v)}
                placeholder={t('— Select —', '— اختر —')} className={inputCls}
                options={stationOpts([form.from_station_id])} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('Departure time *', 'وقت المغادرة *')}</label>
              <TimeInput24 value={form.scheduled_departure} onChange={changeDeparture} style={{ fontSize: '0.9rem', padding: '8px 12px' }} />
              {(stops.length > 0 || form.scheduled_arrival) && (
                <p className="text-[10px] text-gray-400 mt-1">{t('Changing this shifts arrival & stop times by the same amount', 'تغيير الوقت يزيح وقت الوصول ونقاط التوقف بنفس الفرق تلقائياً')}</p>
              )}
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('Arrival time', 'وقت الوصول للوجهة')}</label>
              <TimeInput24 value={form.scheduled_arrival} onChange={v => set('scheduled_arrival', v)} style={{ fontSize: '0.9rem', padding: '8px 12px' }} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('Bus type', 'نوع الحافلة')}</label>
              <select value={form.bus_type} onChange={e => set('bus_type', e.target.value)} className={inputCls}>
                {BUS_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          {/* رحلة عودة */}
          <div className={`rounded-xl border p-3 transition-colors ${hasReturn ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
            <label className="flex items-center gap-2 text-sm cursor-pointer font-semibold text-gray-700">
              <input type="checkbox" className="rounded accent-amber-500"
                checked={hasReturn} onChange={e => setHasReturn(e.target.checked)} />
              <span>{t('Add a return trip', 'إضافة رحلة عودة')}</span>
              {hasReturn && (
                <span className="text-[10px] bg-amber-500 text-white rounded-full px-2 py-0.5 font-bold">
                  {t('Round trip', 'ذهاب وعودة')}
                </span>
              )}
            </label>
            {hasReturn && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('Return trip number *', 'رقم رحلة العودة *')}</label>
                  <input value={returnForm.trip_number} onChange={e => setReturn('trip_number', e.target.value)} dir="ltr"
                    className={inputCls} />
                  <p className="text-[10px] text-amber-700 mt-1">{t('Auto-suggested from the trip number — confirm it\'s correct before creating', 'اقتراح تلقائي من رقم الرحلة — تأكد إنه صحيح قبل الإنشاء')}</p>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('Return departure *', 'وقت مغادرة العودة *')}</label>
                  <TimeInput24 value={returnForm.scheduled_departure} onChange={changeReturnDeparture} style={{ fontSize: '0.9rem', padding: '8px 12px' }} />
                  {form.scheduled_departure && form.scheduled_arrival && (
                    <p className="text-[10px] text-amber-700 mt-1">{t('Arrival is calculated using the outbound trip\'s duration', 'وقت الوصول يُحسب تلقائياً بنفس مدة رحلة الذهاب')}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('Return arrival', 'وقت وصول العودة')}</label>
                  <TimeInput24 value={returnForm.scheduled_arrival} onChange={v => setReturn('scheduled_arrival', v)} style={{ fontSize: '0.9rem', padding: '8px 12px' }} />
                </div>
                <p className="col-span-3 text-[11px] text-gray-500">
                  {form.to_station_id && form.from_station_id
                    ? `${stName(form.to_station_id)} → ${stName(form.from_station_id)}`
                    : t('Same line, reversed direction', 'نفس الخط بعكس الاتجاه')}
                </p>
              </div>
            )}
          </div>

          {/* التكرار + الصلاحية */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            {/* التكرار */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('Recurrence', 'التكرار')}</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRecurrence('daily')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                    ${recurrence === 'daily' ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                  {t('Daily', 'يومي')}
                </button>
                <button type="button" onClick={() => setRecurrence('custom')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                    ${recurrence === 'custom' ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                  {t('Specific days', 'أيام محددة')}
                </button>
              </div>
              {recurrence === 'custom' && (
                <div className="flex gap-1.5 mt-2 flex-wrap" dir="ltr">
                  {WEEKDAYS.map(d => {
                    const on = selectedDays.has(d.value)
                    return (
                      <button type="button" key={d.value} onClick={() => toggleDay(d.value)}
                        className={`w-11 py-1.5 rounded-full text-xs font-bold border transition-colors
                          ${on ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                        {d.en}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* صلاحية الرحلة بالتاريخ */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('Valid from / until', 'صلاحية الرحلة')}</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('Start date *', 'تاريخ البداية *')}</label>
                  <DatePicker value={form.start_date} onChange={v => set('start_date', v)} isAr={isAr}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('End date (optional)', 'تاريخ النهاية (اختياري)')}</label>
                  <DatePicker value={form.end_date} onChange={v => set('end_date', v)} isAr={isAr}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white" />
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">
                {t('No end date = trip keeps running until you edit or deactivate it', 'بدون تاريخ نهاية = الرحلة تستمر تلقائياً حتى تعدّلها أو توقفها لاحقاً')}
              </p>
            </div>
          </div>

          {/* محطات العبور */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-600">{t('Intermediate stops (in order)', 'محطات العبور (بالترتيب)')}</label>
              <button type="button" onClick={addStop} className="text-xs text-nwbus-primary font-semibold hover:underline">
                + {t('Add stop', 'إضافة محطة عبور')}
              </button>
            </div>
            {stops.length === 0 ? (
              <p className="text-xs text-gray-400 border rounded-lg p-3 bg-gray-50">{t('No stops — direct trip', 'بدون محطات عبور — رحلة مباشرة')}</p>
            ) : (
              <div className="space-y-2">
                {stops.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 border rounded-lg p-2 bg-gray-50">
                    <span className="text-xs text-gray-400 w-4 text-center shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <SearchSelect isAr={isAr} value={s.station_id} onChange={v => setStop(i, 'station_id', v)}
                        placeholder={t('— Station —', '— المحطة —')}
                        className="w-full border rounded-lg px-2 py-1.5 text-xs bg-white"
                        options={stationOpts([form.from_station_id, form.to_station_id, ...stops.filter((_, x) => x !== i).map(x => x.station_id)])} />
                    </div>
                    <div className="shrink-0">
                      <label className="block text-[9px] text-gray-400">{t('Arr.', 'وصول')}</label>
                      <TimeInput24 value={s.arrival_time} onChange={v => setStop(i, 'arrival_time', v)}
                        style={{ width: 74, fontSize: '0.75rem', fontWeight: 500, padding: '4px 6px', letterSpacing: 0 }} />
                    </div>
                    <div className="shrink-0">
                      <label className="block text-[9px] text-gray-400">{t('Dep.', 'مغادرة')}</label>
                      <TimeInput24 value={s.departure_time} onChange={v => setStop(i, 'departure_time', v)}
                        style={{ width: 74, fontSize: '0.75rem', fontWeight: 500, padding: '4px 6px', letterSpacing: 0 }} />
                    </div>
                    <button type="button" onClick={() => delStop(i)} className="text-gray-400 hover:text-red-500 shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* تفعيل مباشر */}
          <label className="flex items-center gap-2 text-sm cursor-pointer bg-blue-50 border border-blue-100 rounded-lg p-3">
            <input type="checkbox" className="rounded accent-nwbus-primary"
              checked={autoActivate} onChange={e => setAutoActivate(e.target.checked)} />
            <span>
              {t('Activate immediately in transportation for its stations', 'تفعيلها مباشرة في ترحيل محطاتها')}
              <span className="block text-[11px] text-gray-500 mt-0.5">
                {form.from_station_id
                  ? `${stName(form.from_station_id)} → ${stops.filter(s => s.station_id).map(s => stName(s.station_id)).join(' → ')}${stops.some(s => s.station_id) ? ' → ' : ''}${stName(form.to_station_id)}`
                  : t('Trip appears for supervisors without manual selection', 'تظهر الرحلة للمشرفين بدون اختيار يدوي')}
              </span>
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-gray-100">
          <button onClick={create} disabled={saving}
            className="bg-nwbus-primary text-white rounded-lg px-6 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {saving ? t('Creating…', 'جارٍ الإنشاء…') : `✓ ${t('Create trip', 'إنشاء الرحلة')}`}
          </button>
        </div>
      </div>
    </div>
  )
}
