import { useState, useEffect } from 'react'
import TimeInput24 from '../shared/TimeInput24'
import { useAppSettings } from '../../context/AppSettingsContext'
import { SHIFT_SETTING_KEY, parseShifts, fmtMin, toMin, validEnds } from '../../utils/shifts'

const MONO = "'IBM Plex Mono', ui-monospace, monospace"

// إعداد الورديات: 3 أو 4. نهاية كل وردية شاملة (الرحلة 08:00 تتبع الوردية التي تنتهي 08:00)
export default function ShiftSettings({ isAr = true }) {
  const { settings, saveSetting } = useAppSettings()
  const current = parseShifts(settings?.[SHIFT_SETTING_KEY])
  const [count, setCount] = useState(current.length)
  const [ends, setEnds] = useState(current.slice(0, -1).map(s => fmtMin(s.to)))   // أوقات نهاية الورديات عدا الأخيرة
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  // مزامنة عند وصول تحديث من جهاز آخر
  useEffect(() => { const c = parseShifts(settings?.[SHIFT_SETTING_KEY]); setCount(c.length); setEnds(c.slice(0, -1).map(s => fmtMin(s.to))) }, [settings?.[SHIFT_SETTING_KEY]])

  const setCountSafe = n => {
    setCount(n)
    setEnds(prev => {
      const need = n - 1
      if (prev.length === need) return prev
      if (need === 3) return [...prev.slice(0, 2), '20:00']                    // إضافة وردية رابعة: نقسم الأخيرة
      return prev.slice(0, 2)                                                // العودة لثلاث ورديات
    })
    setSaved(false)
  }
  const minsArr = ends.map(toMin)
  const draftEnds = [...minsArr, 1440]
  const valid = minsArr.every(m => m != null) && validEnds(draftEnds)
  const preview = valid ? parseShifts(JSON.stringify({ ends: draftEnds })) : null
  const dirty = JSON.stringify(valid ? draftEnds : null) !== JSON.stringify([...current.map(s => s.to)])

  async function save() {
    if (!valid) { setErr(isAr ? 'رتّب الأوقات تصاعدياً (كل وقت بعد الذي قبله وقبل 24:00)' : 'Times must be ascending and before 24:00'); return }
    setErr('')
    await saveSetting(SHIFT_SETTING_KEY, JSON.stringify({ ends: draftEnds }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  const labels = isAr ? ['نهاية الوردية أ', 'نهاية الوردية ب', 'نهاية الوردية ج'] : ['End of shift A', 'End of shift B', 'End of shift C']
  return (
    <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-1)' }}>{isAr ? 'الورديات (الترحيل)' : 'Shifts (Transportation)'}</h3>
      <p style={{ margin: '0 0 14px', fontSize: '0.74rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
        {isAr ? 'تُستخدم لتجميع الرحلات بالترحيل والجدول الشامل وتحليل السجل الوظيفي. نهاية كل وردية شاملة: فالرحلة عند 08:00 مثلاً تتبع الوردية التي تنتهي 08:00، وتبدأ التالية بعدها مباشرة.' : 'Used to group trips and analytics. A shift end time is inclusive.'}
      </p>
      <div role="radiogroup" style={{ display: 'inline-flex', border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
        {[3, 4].map(n => (
          <button key={n} type="button" role="radio" aria-checked={count === n} onClick={() => setCountSafe(n)}
            style={{ padding: '8px 22px', fontWeight: 800, fontSize: '0.8rem', fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: count === n ? 'var(--accent)' : 'transparent', color: count === n ? '#fff' : 'var(--text-2)' }}>
            {isAr ? `${n} ورديات` : `${n} shifts`}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
        {ends.map((v, i) => (
          <div key={i}>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{labels[i]}</label>
            <TimeInput24 value={v} onChange={x => { const n = [...ends]; n[i] = x; setEnds(n); setSaved(false) }} />
          </div>
        ))}
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? `نهاية الوردية ${['أ', 'ب', 'ج', 'د'][count - 1]}` : 'Last shift end'}</label>
          <div style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-3)', fontFamily: MONO, fontWeight: 700, fontSize: '0.85rem' }}>24:00 {isAr ? '(ثابتة)' : '(fixed)'}</div>
        </div>
      </div>
      {preview && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {preview.map(s => (
            <div key={s.k} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '8px 14px' }}>
              <div style={{ fontWeight: 800, fontSize: '0.78rem', color: 'var(--text-1)' }}>{isAr ? s.ar : s.en}</div>
              <div dir="ltr" style={{ fontFamily: MONO, fontSize: '0.78rem', color: 'var(--text-2)' }}>{s.range}</div>
            </div>
          ))}
        </div>
      )}
      {err && <p style={{ color: 'var(--danger)', fontSize: '0.76rem', margin: '0 0 10px' }}>{err}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={save} disabled={!dirty && !err}
          style={{ padding: '9px 26px', borderRadius: 9, border: 'none', background: 'var(--solid-btn)', color: '#fff', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'inherit', cursor: dirty ? 'pointer' : 'not-allowed', opacity: dirty ? 1 : 0.45 }}>
          {isAr ? 'حفظ الورديات' : 'Save shifts'}
        </button>
        {saved && <span style={{ color: 'var(--success)', fontWeight: 800, fontSize: '0.78rem' }}>✓ {isAr ? 'تم الحفظ — يُطبَّق على جميع المستخدمين' : 'Saved — applies to everyone'}</span>}
      </div>
    </div>
  )
}
