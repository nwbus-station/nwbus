import { useState, useEffect } from 'react'
import TimeInput24 from '../shared/TimeInput24'
import { useAppSettings } from '../../context/AppSettingsContext'
import { DAY_CUTOFF_KEY, parseCutoff, fmtCutoff } from '../../utils/businessDay'

// وقت فتح اليوم التشغيلي للإيرادات: قبله تُسجَّل الوردية الأخيرة بتاريخ أمس، ولا تُقبل إيرادات بتاريخ اليوم الجديد
export default function SalesDaySettings({ isAr = true }) {
  const { settings, saveSetting } = useAppSettings()
  const current = fmtCutoff(parseCutoff(settings?.[DAY_CUTOFF_KEY]))
  const [val, setVal] = useState(current)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setVal(fmtCutoff(parseCutoff(settings?.[DAY_CUTOFF_KEY]))) }, [settings?.[DAY_CUTOFF_KEY]])

  const m = /^(\d{2}):(\d{2})$/.exec(val)
  const mins = m ? Number(m[1]) * 60 + Number(m[2]) : null
  const valid = mins != null && mins <= 360
  const dirty = valid && val !== current

  async function save() {
    if (!valid) { setErr(isAr ? 'اختر وقتاً بين 00:00 و06:00' : 'Pick a time between 00:00 and 06:00'); return }
    setErr('')
    await saveSetting(DAY_CUTOFF_KEY, val)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-1)' }}>{isAr ? 'اليوم التشغيلي (الإيرادات)' : 'Business day (Sales)'}</h3>
      <p style={{ margin: '0 0 14px', fontSize: '0.74rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
        {isAr
          ? 'اليوم الجديد يُفتح للإيرادات عند هذا الوقت. قبله تُدخل الوردية الأخيرة بتاريخ أمس، ولا تُقبل إيرادات بتاريخ اليوم الجديد. يُفرض في التطبيق وفي قاعدة البيانات.'
          : 'The new day opens for sales at this time. Before it, the last shift is entered with yesterday\'s date and new-day sales are rejected. Enforced in the app and the database.'}
      </p>
      <div style={{ maxWidth: 180, marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'وقت فتح اليوم الجديد' : 'New day opens at'}</label>
        <TimeInput24 value={val} onChange={x => { setVal(x); setSaved(false) }} />
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: '0.76rem', margin: '0 0 10px' }}>{err}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={save} disabled={!dirty}
          style={{ padding: '9px 26px', borderRadius: 9, border: 'none', background: 'var(--solid-btn)', color: '#fff', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'inherit', cursor: dirty ? 'pointer' : 'default', opacity: dirty ? 1 : 0.5 }}>
          {isAr ? 'حفظ' : 'Save'}
        </button>
        {saved && <span style={{ color: 'var(--success)', fontWeight: 800, fontSize: '0.78rem' }}>✓ {isAr ? 'تم الحفظ' : 'Saved'}</span>}
      </div>
    </div>
  )
}
