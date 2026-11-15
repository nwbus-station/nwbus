import { useState, useEffect } from 'react'
import TimeInput24 from '../shared/TimeInput24'
import { useAppSettings } from '../../context/AppSettingsContext'
import { SettingsCard, Icon } from './ui'
import { DAY_CUTOFF_KEY, parseCutoff, fmtCutoff } from '../../utils/businessDay'

// وقت فتح اليوم التشغيلي للإيرادات: قبله تُسجَّل الوردية الأخيرة بتاريخ أمس، ولا تُقبل إيرادات بتاريخ اليوم الجديد
export default function SalesDaySettings({ isAr = true, onSaved }) {
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
    onSaved?.(isAr ? 'تم حفظ وقت اليوم التشغيلي' : 'Business day time saved')
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <SettingsCard span icon="clock"
      title={isAr ? 'اليوم التشغيلي (الإيرادات)' : 'Business day (Sales)'}
      desc={isAr
        ? 'اليوم الجديد يُفتح للإيرادات عند هذا الوقت. قبله تُدخل الوردية الأخيرة بتاريخ أمس، ولا تُقبل إيرادات بتاريخ اليوم الجديد. يُفرض في التطبيق وفي قاعدة البيانات.'
        : 'The new day opens for sales at this time. Before it, the last shift is entered with yesterday\'s date and new-day sales are rejected. Enforced in the app and the database.'}>
      <div className="st-split">
        <div>
          <label className="st-lbl">{isAr ? 'وقت فتح اليوم الجديد' : 'New day opens at'}</label>
          <div style={{ maxWidth: 240 }}>
            <TimeInput24 value={val} onChange={x => { setVal(x); setSaved(false) }} style={{ minHeight: 56, fontSize: '1.4rem', borderRadius: 14 }} />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: 'var(--text-3)' }}>{isAr ? 'بصيغة 24 ساعة، بين 00:00 و06:00' : '24-hour format, between 00:00 and 06:00'}</p>
        </div>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          {err && <p role="alert" className="st-note err" style={{ margin: 0 }}>{err}</p>}
          <div className="st-actions">
            <button type="button" className="st-btn pri" onClick={save} disabled={!dirty}>{isAr ? 'حفظ' : 'Save'}</button>
            {saved && <span className="st-note ok" role="status"><Icon name="check" size={16} />{isAr ? 'تم الحفظ' : 'Saved'}</span>}
          </div>
        </div>
      </div>
    </SettingsCard>
  )
}
