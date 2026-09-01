import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import ConfirmDialog from '../shared/ConfirmDialog'

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

  const load = () => {
    setLoading(true)
    supabase.from('trip_schedule')
      .select('id, trip_number, scheduled_departure, is_active, from_station:from_station_id(name_ar, name_en), to_station:to_station_id(name_ar, name_en)')
      .eq('is_manual', true)
      .order('trip_number')
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        setTrips(data || [])
        setLoading(false)
      })
  }
  useEffect(load, [])

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
                <div key={tr.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 gap-3">
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
                  <button onClick={() => setConfirmId(tr.id)} disabled={deletingId === tr.id}
                    className="text-xs border border-red-300 text-red-500 rounded-lg px-3 py-1.5 hover:bg-red-500 hover:text-white transition-colors shrink-0 disabled:opacity-50">
                    {deletingId === tr.id ? '…' : t('Delete', 'حذف')}
                  </button>
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
    </div>
  )
}
