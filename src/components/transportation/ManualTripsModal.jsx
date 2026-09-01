import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import ConfirmDialog from '../shared/ConfirmDialog'
import NewTripModal from './NewTripModal'

const WEEKDAYS = [
  { value: 0, ar: 'أحد',     en: 'Sun' },
  { value: 1, ar: 'اثنين',   en: 'Mon' },
  { value: 2, ar: 'ثلاثاء',  en: 'Tue' },
  { value: 3, ar: 'أربعاء',  en: 'Wed' },
  { value: 4, ar: 'خميس',    en: 'Thu' },
  { value: 5, ar: 'جمعة',    en: 'Fri' },
  { value: 6, ar: 'سبت',     en: 'Sat' },
]

/**
 * قائمة الرحلات المُضافة يدوياً (is_manual) مع إمكانية حذف أي رحلة نهائياً.
 */
export default function ManualTripsModal({ isAr, onClose, onChanged }) {
  useEscapeKey(onClose)
  const t = (en, ar) => isAr ? ar : en

  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [err, setErr] = useState('')
  const [editTrip, setEditTrip] = useState(null)

  const load = () => {
    setLoading(true)
    supabase.from('trip_schedule')
      .select('id, trip_number, scheduled_departure, scheduled_arrival, is_active, from_station_id, to_station_id, return_trip_id, start_date, end_date, days_of_week, from_station:from_station_id(name_ar, name_en), to_station:to_station_id(name_ar, name_en), return_trip:return_trip_id(trip_number, scheduled_departure)')
      .eq('is_manual', true)
      .order('trip_number')
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        setTrips(data || [])
        setLoading(false)
      })
  }
  useEffect(load, [])

  // نقاط التوقف — تُحمّل عند فتح التفاصيل فقط وتُخزَّن مؤقتاً لكل رحلة
  const [expandedId, setExpandedId] = useState(null)
  const [stopsCache, setStopsCache] = useState({})
  const [stopsLoading, setStopsLoading] = useState(null)

  async function toggleDetails(tr) {
    if (expandedId === tr.id) { setExpandedId(null); return }
    setExpandedId(tr.id)
    if (stopsCache[tr.id]) return
    setStopsLoading(tr.id)
    const { data } = await supabase.from('trip_schedule_stops')
      .select('station_id, arrival_time, departure_time, stop_order, station:station_id(name_ar, name_en)')
      .eq('trip_schedule_id', tr.id).order('stop_order')
    const mid = (data || []).filter(s => s.station_id !== tr.from_station_id && s.station_id !== tr.to_station_id)
    setStopsCache(p => ({ ...p, [tr.id]: mid }))
    setStopsLoading(null)
  }

  async function doDelete(id) {
    setConfirmId(null)
    setDeletingId(id)
    try {
      await supabase.from('trip_records').delete().eq('trip_schedule_id', id)
      await supabase.from('station_trips').delete().eq('trip_schedule_id', id)
      await supabase.from('trip_schedule_stops').delete().eq('trip_schedule_id', id)
      const { error } = await supabase.from('trip_schedule').delete().eq('id', id)
      if (error) throw error
      setTrips(p => p.filter(x => x.id !== id))
      onChanged?.()
    } catch (e) {
      setErr((isAr ? 'فشل الحذف: ' : 'Delete failed: ') + (e.message || ''))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between bg-nwbus-primary text-white px-5 py-3 rounded-t-2xl">
          <div>
            <h3 className="font-bold">{t('Manually Added Trips', 'الرحلات المضافة يدوياً')}</h3>
            <p className="text-xs text-white/70 mt-0.5">{t('Trips created without an Excel upload', 'رحلات أُنشئت من "رحلة جديدة" بدون رفع جدول')}</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>

        {err && <div className="m-4 mb-0 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-2">{err}</div>}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">{t('Loading...', 'جاري التحميل...')}</div>
          ) : trips.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">{t('No manually added trips', 'لا توجد رحلات مضافة يدوياً')}</div>
          ) : (
            <div className="space-y-2">
              {trips.map(tr => (
                <div key={tr.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-nwbus-primary">{tr.trip_number}</span>
                        {!tr.is_active && (
                          <span className="text-[10px] bg-gray-100 text-gray-400 rounded-full px-2 py-0.5">{t('Inactive', 'معطّلة')}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {(isAr ? tr.from_station?.name_ar : tr.from_station?.name_en) || '—'}
                        {' ← '}
                        {(isAr ? tr.to_station?.name_ar : tr.to_station?.name_en) || '—'}
                        {tr.scheduled_departure && <> {' · '}{tr.scheduled_departure.slice(0, 5)}</>}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => toggleDetails(tr)}
                        className="text-xs border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-100 transition-colors">
                        {expandedId === tr.id ? t('Hide', 'إخفاء') : t('Details', 'تفاصيل')}
                      </button>
                      <button onClick={() => setEditTrip(tr)}
                        className="text-xs border border-nwbus-primary text-nwbus-primary rounded-lg px-3 py-1.5 hover:bg-nwbus-primary hover:text-white transition-colors">
                        {t('Edit', 'تعديل')}
                      </button>
                      <button onClick={() => setConfirmId(tr.id)} disabled={deletingId === tr.id}
                        className="text-xs border border-red-300 text-red-500 rounded-lg px-3 py-1.5 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50">
                        {deletingId === tr.id ? '…' : t('Delete', 'حذف')}
                      </button>
                    </div>
                  </div>

                  {expandedId === tr.id && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                      {stopsLoading === tr.id ? (
                        <p className="text-xs text-gray-400 text-center py-2">{t('Loading...', 'جاري التحميل...')}</p>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 font-semibold">{(isAr ? tr.from_station?.name_ar : tr.from_station?.name_en) || '—'}</span>
                            <span className="text-[10px] text-green-600 font-medium">{t('Origin', 'الانطلاق')} · {tr.scheduled_departure ? tr.scheduled_departure.slice(0, 5) : '—'}</span>
                          </div>
                          {(stopsCache[tr.id] || []).map((s, i) => (
                            <div key={s.station_id} className="flex items-center justify-between text-xs ps-3 border-s-2 border-gray-200">
                              <span className="text-gray-600">{i + 1}. {(isAr ? s.station?.name_ar : s.station?.name_en) || '—'}</span>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {s.arrival_time ? s.arrival_time.slice(0, 5) : (s.departure_time ? s.departure_time.slice(0, 5) : '—')}
                              </span>
                            </div>
                          ))}
                          {(stopsCache[tr.id] || []).length === 0 && (
                            <p className="text-[11px] text-gray-400 ps-3">{t('No intermediate stops — direct trip', 'بدون محطات عبور — رحلة مباشرة')}</p>
                          )}
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 font-semibold">{(isAr ? tr.to_station?.name_ar : tr.to_station?.name_en) || '—'}</span>
                            <span className="text-[10px] text-blue-600 font-medium">{t('Destination', 'الوصول')} · {tr.scheduled_arrival ? tr.scheduled_arrival.slice(0, 5) : '—'}</span>
                          </div>
                          <div className={`flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-200 text-xs ${tr.return_trip ? 'text-amber-700' : 'text-gray-400'}`}>
                            {tr.return_trip ? (
                              <>
                                <span className="text-[10px] bg-amber-500 text-white rounded-full px-2 py-0.5 font-bold shrink-0">{t('Round trip', 'ذهاب وعودة')}</span>
                                <span>{t('Return trip', 'رحلة العودة')}: <span className="font-mono font-bold">{tr.return_trip.trip_number}</span>{tr.return_trip.scheduled_departure && <> · {tr.return_trip.scheduled_departure.slice(0, 5)}</>}</span>
                              </>
                            ) : (
                              <span>{t('No linked return trip', 'بدون رحلة عودة مرتبطة')}</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 pt-2 border-t border-gray-200 space-y-1">
                            <div className="flex items-center justify-between">
                              <span>{t('Valid from', 'تاريخ البداية')}</span>
                              <span className="font-mono">{tr.start_date ? new Date(tr.start_date).toLocaleDateString(isAr ? 'ar-SA' : 'en-US') : '—'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>{t('Valid until', 'تاريخ النهاية')}</span>
                              <span className="font-mono">{tr.end_date ? new Date(tr.end_date).toLocaleDateString(isAr ? 'ar-SA' : 'en-US') : t('No end date — ongoing', 'بدون نهاية — مستمرة')}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>{t('Runs on', 'التكرار')}</span>
                              <span>{tr.days_of_week?.length
                                ? tr.days_of_week.map(d => WEEKDAYS.find(w => w.value === d)?.[isAr ? 'ar' : 'en']).join('، ')
                                : t('Daily', 'يومياً')}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmId && (
        <ConfirmDialog
          message={t('Permanently delete this trip from all stations and dates? This cannot be undone.', 'حذف هذي الرحلة نهائياً من كل المحطات والتواريخ؟ لا يمكن التراجع.')}
          confirmLabel={t('Delete', 'حذف')}
          cancelLabel={t('Cancel', 'إلغاء')}
          onConfirm={() => doDelete(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}

      {editTrip && (
        <NewTripModal
          isAr={isAr}
          editTrip={editTrip}
          onClose={() => setEditTrip(null)}
          onCreated={() => {
            setEditTrip(null)
            setStopsCache(p => { const n = { ...p }; delete n[editTrip.id]; return n })
            load()
            onChanged?.()
          }}
        />
      )}
    </div>
  )
}
