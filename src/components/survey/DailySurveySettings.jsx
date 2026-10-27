import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAppSettings } from '../../context/AppSettingsContext'
import { ADMIN_ROLE_VALUES } from '../../utils/constants'
import { riyadhDay } from '../../utils/dates'

// إعداد الأدمن: تفعيل التقييم اليومي الإلزامي وعدد التقييمات، ومتابعة من أكمل اليوم
export default function DailySurveySettings() {
  const { settings, saveSetting } = useAppSettings()
  const enabled = String(settings?.daily_survey_enabled) === 'true'
  const count = Math.max(1, Number(settings?.daily_survey_count) || 5)
  const [countDraft, setCountDraft] = useState(String(count))
  const [rows, setRows] = useState(null)       // { users, progress }
  const [showList, setShowList] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => setCountDraft(String(count)), [count])

  async function load() {
    setErr('')
    const day = riyadhDay()
    const [{ data: users }, { data: prog, error }] = await Promise.all([
      supabase.from('users').select('id, full_name_ar, role, station:station_id(name_ar)').eq('is_active', true).not('role', 'in', `(${ADMIN_ROLE_VALUES.join(',')})`).order('full_name_ar').limit(2000),
      supabase.from('user_daily_survey').select('user_id, done').eq('day', day).limit(5000),
    ])
    if (error) { setErr('جدول المتابعة غير مُنشأ بعد. شغّل استعلام SQL الخاص بالتقييم اليومي.'); setRows({ users: users ?? [], progress: {} }); return }
    setRows({ users: users ?? [], progress: Object.fromEntries((prog ?? []).map(p => [p.user_id, p.done])) })
  }
  useEffect(() => { if (showList && !rows) load() }, [showList]) // eslint-disable-line react-hooks/exhaustive-deps

  const completed = rows ? rows.users.filter(u => (rows.progress[u.id] ?? 0) >= count).length : 0
  const pending = rows ? rows.users.filter(u => (rows.progress[u.id] ?? 0) < count) : []

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ margin: 0, fontSize: '.9rem', fontWeight: 800, color: 'var(--text-1)' }}>التقييم اليومي الإلزامي</p>
          <p style={{ margin: '3px 0 0', fontSize: '.72rem', color: 'var(--text-3)', lineHeight: 1.6 }}>عند أول فتح في اليوم يظهر الاستبيان لكل الحسابات عدا الأدمن العام، ويبقى حتى يُكمل الموظف العدد المطلوب (مرة واحدة باليوم).</p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={e => saveSetting('daily_survey_enabled', e.target.checked ? 'true' : 'false')} />
          {enabled ? 'مفعّل' : 'معطّل'}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', color: 'var(--text-2)' }}>
          عدد التقييمات
          <input type="number" min={1} max={50} value={countDraft} onChange={e => setCountDraft(e.target.value)}
            onBlur={() => { const n = Math.min(50, Math.max(1, Number(countDraft) || 5)); setCountDraft(String(n)); if (n !== count) saveSetting('daily_survey_count', String(n)) }}
            style={{ width: 64, padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'monospace', textAlign: 'center' }} />
        </label>
        <button type="button" onClick={() => { setShowList(s => !s); setRows(null) }}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          {showList ? 'إخفاء المتابعة' : 'متابعة اليوم'}
        </button>
      </div>
      {showList && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {err && <p style={{ margin: '0 0 8px', fontSize: '.75rem', color: '#b91c1c' }}>{err}</p>}
          {!rows ? <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-3)' }}>جارٍ التحميل...</p> : (
            <>
              <p style={{ margin: '0 0 8px', fontSize: '.8rem', color: 'var(--text-2)' }}><b style={{ color: '#059669' }}>{completed}</b> أكملوا من {rows.users.length} حساب اليوم · <b style={{ color: '#b45309' }}>{pending.length}</b> لم يكملوا</p>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {pending.map(u => (
                  <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid var(--border)', fontSize: '.78rem', color: 'var(--text-1)' }}>
                    <span>{u.full_name_ar} <span style={{ color: 'var(--text-3)' }}>· {u.station?.name_ar || '—'}</span></span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-3)' }}>{rows.progress[u.id] ?? 0} / {count}</span>
                  </div>
                ))}
                {pending.length === 0 && <p style={{ margin: 0, padding: 14, fontSize: '.78rem', color: '#059669', textAlign: 'center' }}>أكمل الجميع تقييم اليوم.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
