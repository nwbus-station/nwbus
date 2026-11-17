// اختيار شاشات المحطات التي يظهر عليها نص النداء (ومعه الصوت اختيارياً) عند تنفيذ النداء
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const KEY = 'nw_call_screens'
export const loadScreenSel = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return { on: !!v?.on, ids: Array.isArray(v?.ids) ? v.ids : [], audio: !!v?.audio } } catch { return { on: false, ids: [], audio: false } } }

export default function ScreenCallPicker({ isAr = true, value, onChange }) {
  const [targets, setTargets] = useState(null)       // null = يتحمّل | [] | قائمة
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.rpc('signage_call_targets')
      if (!alive) return
      if (error) { setMissing(true); return }
      setTargets(data || [])
    })()
    return () => { alive = false }
  }, [])
  const set = v => { onChange(v); try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* */ } }
  if (missing || targets === null) return null                    // قبل تشغيل SQL 035 أو أثناء التحميل: لا يظهر
  if (targets.length === 0) return null                           // لا توجد شاشات مربوطة بمحطات
  const toggle = id => set({ ...value, ids: value.ids.includes(id) ? value.ids.filter(x => x !== id) : [...value.ids, id] })
  const all = targets.every(t => value.ids.includes(t.id))

  return (
    <section className="cl-card" style={{ marginTop: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 900, fontSize: '.9rem', color: 'var(--text-1)' }}>
        <input type="checkbox" checked={value.on} onChange={e => set({ ...value, on: e.target.checked })} />
        عرض النداء على شاشات المحطات
      </label>
      <p className="cl-hint">يظهر نص النداء على شاشات المحطات المختارة لمدة 45 ثانية تقريباً، فوق أي محتوى.</p>
      {value.on && (
        <>
          <div className="cl-chips" style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className={`cl-chip${all ? ' on' : ''}`} onClick={() => set({ ...value, ids: all ? [] : targets.map(t => t.id) })}>{all ? 'إلغاء الكل' : 'كل المحطات'}</button>
            {targets.map(t => (
              <button key={t.id} type="button" aria-pressed={value.ids.includes(t.id)} className={`cl-chip${value.ids.includes(t.id) ? ' on' : ''}`} onClick={() => toggle(t.id)}>{t.name} <span dir="ltr" style={{ opacity: 0.7 }}>{t.screens}</span></button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '.8rem', fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={value.audio} onChange={e => set({ ...value, audio: e.target.checked })} /> تشغيل الصوت على الشاشات أيضاً (وضع المقاطع الجاهزة فقط)
          </label>
          <p className="cl-hint">قد يمنع المتصفح الصوت التلقائي على بعض الأجهزة؛ يظهر النص دائماً. لا تفعّل الصوت إن كانت سماعات المحطة تبثه أصلاً.</p>
          {value.ids.length === 0 && <div className="cl-note warn" style={{ marginTop: 8, marginBottom: 0 }}>اختر محطة واحدة على الأقل ليظهر النداء على شاشاتها.</div>}
        </>
      )}
    </section>
  )
}
