import { useState, useEffect } from 'react'
import ConfirmDialog from '../shared/ConfirmDialog'
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
  const target = String(settings?.daily_survey_target) === 'selected' ? 'selected' : 'all'
  let selectedIds = []
  try { selectedIds = JSON.parse(settings?.daily_survey_users || '[]') } catch { selectedIds = [] }
  const [picked, setPicked] = useState([])      // [{id, full_name_ar, job_number, station}] الأسماء المحددة (للعرض)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  useEffect(() => setCountDraft(String(count)), [count])

  useEffect(() => {
    if (target !== 'selected' || !selectedIds.length) { setPicked([]); return }
    supabase.from('users').select('id, full_name_ar, job_number, station:station_id(name_ar)').in('id', selectedIds).then(({ data }) => setPicked(data ?? []))
  }, [target, selectedIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const term = q.trim().replace(/[%,()*]/g, '')
    if (term.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('users').select('id, full_name_ar, job_number, station:station_id(name_ar)').eq('is_active', true)
        .not('role', 'in', `(${ADMIN_ROLE_VALUES.join(',')})`).or(`full_name_ar.ilike.%${term}%,job_number.ilike.%${term}%,username.ilike.%${term}%`).limit(12)
      setResults((data ?? []).filter(u => !selectedIds.includes(u.id)))
    }, 250)
    return () => clearTimeout(t)
  }, [q, selectedIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveUsers = ids => saveSetting('daily_survey_users', JSON.stringify([...new Set(ids)]))
  async function resetToday() {
    setConfirmReset(false)
    const day = riyadhDay()
    let del = supabase.from('user_daily_survey').delete().eq('day', day)
    if (target === 'selected') del = del.in('user_id', selectedIds.length ? selectedIds : ['00000000-0000-0000-0000-000000000000'])
    const { error } = await del
    setResetMsg(error ? 'تعذّر التصفير: ' + error.message : 'تم تصفير تقدّم اليوم. سيظهر الاستبيان من جديد لمن شملهم.')
    setRows(null); if (showList) load()
  }

  async function load() {
    setErr('')
    const day = riyadhDay()
    const [{ data: users }, { data: prog, error }] = await Promise.all([
      supabase.from('users').select('id, full_name_ar, role, station:station_id(name_ar)').eq('is_active', true).not('role', 'in', `(${ADMIN_ROLE_VALUES.join(',')})`).order('full_name_ar').limit(2000),
      supabase.from('user_daily_survey').select('user_id, done').eq('day', day).limit(5000),
    ])
    if (error) { setErr('جدول المتابعة غير مُنشأ بعد. شغّل استعلام SQL الخاص بالتقييم اليومي.'); setRows({ users: users ?? [], progress: {} }); return }
    const scoped = target === 'selected' ? (users ?? []).filter(u => selectedIds.includes(u.id)) : (users ?? [])
    setRows({ users: scoped, progress: Object.fromEntries((prog ?? []).map(p => [p.user_id, p.done])) })
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
      <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <p style={{ margin: '0 0 8px', fontSize: '.78rem', fontWeight: 700, color: 'var(--text-2)' }}>من يشمله التقييم؟</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {[{ id: 'all', t: 'كل الحسابات (عدا الأدمن العام)' }, { id: 'selected', t: 'حسابات محددة' }].map(o => (
            <button key={o.id} type="button" onClick={() => saveSetting('daily_survey_target', o.id)}
              style={{ padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${target === o.id ? '#059669' : 'var(--border)'}`, background: target === o.id ? 'rgba(5,150,105,.1)' : 'var(--surface)', color: target === o.id ? '#059669' : 'var(--text-2)', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>{o.t}</button>
          ))}
        </div>
        {target === 'selected' && (
          <div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث باسم الموظف أو رقمه الوظيفي لإضافته..." style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '.8rem', boxSizing: 'border-box' }} />
            {results.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 190, overflowY: 'auto', background: 'var(--card)' }}>
                {results.map(u => (
                  <button key={u.id} type="button" onClick={() => { saveUsers([...selectedIds, u.id]); setQ('') }}
                    style={{ display: 'flex', width: '100%', justifyContent: 'space-between', padding: '7px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.78rem', textAlign: 'start' }}>
                    <span>{u.full_name_ar} <span style={{ color: 'var(--text-3)' }}>· {u.station?.name_ar || '—'}</span></span><span style={{ color: '#059669', fontWeight: 800 }}>+</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {picked.map(u => (
                <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', fontSize: '.75rem', background: 'var(--surface)', color: 'var(--text-1)' }}>
                  {u.full_name_ar}<span style={{ color: 'var(--text-3)' }}>{u.station?.name_ar ? ` · ${u.station.name_ar}` : ''}</span>
                  <button type="button" onClick={() => saveUsers(selectedIds.filter(id => id !== u.id))} style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                </span>
              ))}
              {picked.length === 0 && <span style={{ fontSize: '.75rem', color: '#b45309' }}>لم تحدد أي حساب بعد: لن يظهر التقييم لأحد.</span>}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('daily-survey-preview'))}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', fontFamily: 'inherit' }}>معاينة كما يراه الموظف</button>
          <button type="button" onClick={() => setConfirmReset(true)}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #fecaca', background: 'var(--card)', color: '#dc2626', fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', fontFamily: 'inherit' }}>تصفير تقدّم اليوم (للتجربة)</button>
        </div>
        {resetMsg && <p style={{ margin: '8px 0 0', fontSize: '.75rem', color: '#059669' }}>{resetMsg}</p>}
        <p style={{ margin: '8px 0 0', fontSize: '.7rem', color: 'var(--text-3)', lineHeight: 1.6 }}>الأدمن العام لا يظهر له التقييم (مستثنى). للتجربة استخدم «معاينة»، أو سجّل بحساب موظف ثم اضغط «تصفير تقدّم اليوم» لإعادة العرض.</p>
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
      {confirmReset && <ConfirmDialog danger message={target === 'selected' ? 'تصفير تقدّم اليوم للحسابات المحددة؟ سيظهر لهم الاستبيان من جديد.' : 'تصفير تقدّم اليوم لكل الحسابات؟ سيظهر الاستبيان لهم من جديد.'} confirmLabel="تصفير" cancelLabel="إلغاء" onConfirm={resetToday} onCancel={() => setConfirmReset(false)} />}
    </div>
  )
}
