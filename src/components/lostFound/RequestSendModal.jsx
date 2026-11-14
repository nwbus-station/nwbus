// نافذة «طلب إرسال» لموجود أو بلاغ مفقود: اختيار المحطة المطلوب الإرسال إليها، ثم يُشعَر موظفو المحطة التي فيها الغرض.
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import SelectField from '../shared/SelectField'
import Sheet, { Ic } from '../dispatch/Sheet'
import { btn } from '../dispatch/DispatchCards'
import { fieldStyle } from './ui'
import { dispatchError } from '../../utils/dispatch'

const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 6 }

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

  async function submit(e) {
    e?.preventDefault()
    if (!toId) { setErr(t('اختر المحطة المطلوب الإرسال إليها', 'Select the destination station')); return }
    setSaving(true); setErr('')
    const { error } = await supabase.rpc('dispatch_request_create', { p_ref_type: target.refType, p_ref_id: target.id, p_to: toId, p_note: note.trim() || null })
    setSaving(false)
    if (error) { const m = dispatchError(error); setErr(m === 'SETUP' ? t('لم يُجهَّز قسم الإرساليات بعد: شغّل ملفات SQL «024» و«025» و«026» في Supabase', 'Run the 024/025/026 SQL files in Supabase first') : m); return }
    setOk(true)
    onDone?.()
  }

  const title = target.refType === 'report' ? t('طلب إرسال بلاغ مفقود', 'Request to send a lost report') : t('طلب إرسال موجود', 'Request to send a found item')

  if (ok) {
    return (
      <Sheet isAr={isAr} title={t('تم إرسال الطلب', 'Request sent')} icon={Ic.check} accent="#16a34a" onClose={onClose}
        footer={<>
          <button type="button" onClick={onClose} style={btn('ghost')}>{t('تم', 'Done')}</button>
          <button type="button" onClick={() => { onClose(); navigate('/dispatches?tab=requests') }} style={{ ...btn('primary'), padding: '11px 24px', fontSize: '0.86rem' }}>{t('عرض طلبات الإرسال', 'View requests')}</button>
        </>}>
        <div style={{ textAlign: 'center', padding: '14px 4px 4px' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(22,163,74,0.14)', color: '#16a34a', margin: '0 auto 12px' }}>{Ic.check}</div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.9 }}>{t(`أُشعر موظفو محطة ${target.stationName || ''} باسمك ووقت الطلب والمحطة المطلوب الإرسال إليها`, 'The station staff were notified with your name, the time and the destination')}</div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet isAr={isAr} title={title} icon={Ic.send} onClose={onClose}
      sub={<>{target.desc}<br />{t('موجود في', 'Held at')}: <b>{target.stationName || '—'}</b></>}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="submit" form="dsp-req" disabled={saving} style={{ ...btn('primary'), padding: '11px 28px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}>{saving ? t('جارٍ الإرسال…', 'Sending…') : t('إرسال الطلب', 'Send request')}</button>
      </>}>
      <form id="dsp-req" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {err && <div role="alert" style={{ padding: '10px 13px', borderRadius: 10, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: '0.82rem', fontWeight: 800, lineHeight: 1.7 }}>{err}</div>}
        <div>
          <label style={lbl}>{t('إرساله إلى محطة *', 'Send to station *')}</label>
          <SelectField value={toId} onChange={e => setToId(e.target.value)} style={fieldStyle}>
            <option value="">{t('— اختر المحطة —', '— Select —')}</option>
            {stations.filter(s => s.id !== target.stationId).map(s => <option key={s.id} value={s.id}>{nm[s.id]}</option>)}
          </SelectField>
        </div>
        <div>
          <label style={lbl}>{t('ملاحظة (اختياري)', 'Note (optional)')}</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={300} placeholder={t('مثال: العميل ينتظر في المحطة', 'e.g. the customer is waiting at the station')} style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.8 }}>{t('سيصل إشعار لكل موظفي المحطة التي فيها الغرض، فيه اسمك ومحطتك ووقت الطلب.', 'Every employee at the holding station gets a notification with your name, station and the request time.')}</div>
      </form>
    </Sheet>
  )
}
