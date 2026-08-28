import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import SearchSelect from '../shared/SearchSelect'
import DatePicker from '../shared/DatePicker'
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
    trip_number: '', route: '',
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
  const [autoActivate, setAutoActivate] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_en')
      .then(({ data }) => setStations((data ?? []).filter(s => !isRestStation(s))))
  }, [])

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
    const cleanStops = stops.filter(s => s.station_id)
    const dup = cleanStops.find((s, i) => cleanStops.findIndex(x => x.station_id === s.station_id) !== i
      || s.station_id === form.from_station_id || s.station_id === form.to_station_id)
    if (dup) { setError(t('A stop is duplicated or matches an endpoint', 'محطة عبور مكررة أو تطابق الانطلاق/الوصول')); return }

    setSaving(true)
    let newTripId = null
    try {
      /* 1) الرحلة */
      const { data: newTrip, error: e1 } = await supabase.from('trip_schedule').insert({
        trip_number: num,
        trip_name: form.route.trim() || num,
        route: form.route.trim() || null,
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

      onCreated?.()
      onClose()
    } catch (err) {
      // تنظيف: لا نُبقي رحلة ناقصة
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('Trip number *', 'رقم الرحلة *')}</label>
              <input value={form.trip_number} onChange={e => set('trip_number', e.target.value)} dir="ltr"
                className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('Route name', 'اسم الخط (اختياري)')}</label>
              <input value={form.route} onChange={e => set('route', e.target.value)} dir="ltr"
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
              <input type="time" value={form.scheduled_departure} onChange={e => set('scheduled_departure', e.target.value)}
                className={inputCls} dir="ltr" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('Arrival time', 'وقت الوصول للوجهة')}</label>
              <input type="time" value={form.scheduled_arrival} onChange={e => set('scheduled_arrival', e.target.value)}
                className={inputCls} dir="ltr" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">{t('Bus type', 'نوع الحافلة')}</label>
              <select value={form.bus_type} onChange={e => set('bus_type', e.target.value)} className={inputCls}>
                {BUS_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
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
                      <input type="time" value={s.arrival_time} onChange={e => setStop(i, 'arrival_time', e.target.value)}
                        className="border rounded px-1.5 py-1 text-xs" dir="ltr" />
                    </div>
                    <div className="shrink-0">
                      <label className="block text-[9px] text-gray-400">{t('Dep.', 'مغادرة')}</label>
                      <input type="time" value={s.departure_time} onChange={e => setStop(i, 'departure_time', e.target.value)}
                        className="border rounded px-1.5 py-1 text-xs" dir="ltr" />
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
