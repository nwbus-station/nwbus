// نافذة «طلب إرسال» لموجود أو بلاغ مفقود: اختيار المحطة المطلوب الإرسال إليها، ثم يُشعَر موظفو المحطة التي فيها الغرض.
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import SelectField from '../shared/SelectField'
import { fieldStyle } from './ui'
import { dispatchError } from '../../utils/dispatch'

export default function RequestSendModal({ target, isAr = true, onClose, onDone }) {
  const t = (a, e) => (isAr ? a : e)
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stations, setStations] = useState([])
  const [toId, setToId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const nm = useMemo(() => Object.fromEntries(stations.map(s => [s.id, s.name_ar || s.name_en])), [stations])

  useEffect(() => {
    supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_ar').then(({ data }) => {
      setStations(data ?? [])
      // الافتراضي: محطة الموظف نفسه إن كانت مختلفة عن المحطة الحاملة للغرض
      if (profile?.station_id && profile.station_id !== target.stationId) setToId(profile.station_id)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function submit(e) {
    e.preventDefault()
    if (!toId) { setErr(t('اختر المحطة المطلوب الإرسال إليها', 'Select the destination station')); return }
    setSaving(true); setErr('')
    const { error } = await supabase.rpc('dispatch_request_create', { p_ref_type: target.refType, p_ref_id: target.id, p_to: toId, p_note: note.trim() || null })
    setSaving(false)
    if (error) { const m = dispatchError(error); setErr(m === 'SETUP' ? t('لم يُجهَّز قسم الإرساليات بعد: شغّل ملفي SQL «024» و«025» في Supabase', 'Run the 024_dispatches SQL in Supabase first') : m); return }
    setOk(true)
    onDone?.()
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={t('طلب إرسال', 'Request send')} dir={isAr ? 'rtl' : 'ltr'}
        style={{ background: 'var(--card)', borderRadius: 14, boxShadow: '0 10px 40px rgba(0,0,0,0.25)', width: '100%', maxWidth: 440, overflow: 'visible' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '14px 14px 0 0' }}>
          <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text-1)' }}>{target.refType === 'report' ? t('طلب إرسال بلاغ مفقود', 'Request to send a lost report') : t('طلب إرسال موجود', 'Request to send a found item')}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: 4, lineHeight: 1.6 }}>{target.desc}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{t('موجود في', 'Held at')}: <b>{target.stationName || '—'}</b></div>
        </div>
        {ok ? (
          <div style={{ padding: '26px 20px', textAlign: 'center' }}>
            <div style={{ width: 50, height: 50, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(22,163,74,0.14)', color: '#16a34a', margin: '0 auto 10px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ fontWeight: 900, color: 'var(--text-1)' }}>{t('تم إرسال الطلب', 'Request sent')}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: '6px 0 16px', lineHeight: 1.7 }}>{t(`أُشعر موظفو محطة ${target.stationName || ''} باسمك ووقت الطلب والمحطة المطلوب الإرسال إليها`, 'The station staff were notified with your name, the time and the destination')}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={onClose} style={{ padding: '10px 28px', borderRadius: 10, border: 'none', background: 'var(--text-1)', color: 'var(--card)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{t('تم', 'Done')}</button>
              <button type="button" onClick={() => { onClose(); navigate('/dispatches?tab=requests') }} style={{ padding: '10px 22px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-1)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{t('عرض طلبات الإرسال', 'View requests')}</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && <div role="alert" style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: '0.82rem', fontWeight: 700 }}>{err}</div>}
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 5 }}>{t('إرساله إلى محطة *', 'Send to station *')}</label>
              <SelectField value={toId} onChange={e => setToId(e.target.value)} style={fieldStyle}>
                <option value="">{t('— اختر المحطة —', '— Select —')}</option>
                {stations.filter(s => s.id !== target.stationId).map(s => <option key={s.id} value={s.id}>{nm[s.id]}</option>)}
              </SelectField>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 5 }}>{t('ملاحظة (اختياري)', 'Note (optional)')}</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={300} placeholder={t('مثال: العميل ينتظر في المحطة', 'e.g. the customer is waiting at the station')} style={{ ...fieldStyle, resize: 'vertical' }} />
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.7 }}>{t('سيصل إشعار لكل موظفي المحطة التي فيها الغرض، فيه اسمك ومحطتك ووقت الطلب.', 'Every employee at the holding station gets a notification with your name, station and the request time.')}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{t('إلغاء', 'Cancel')}</button>
              <button type="submit" disabled={saving} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>{saving ? t('جارٍ الإرسال…', 'Sending…') : t('إرسال الطلب', 'Send request')}</button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
