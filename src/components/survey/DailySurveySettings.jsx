import { useState, useEffect } from 'react'
import ConfirmDialog from '../shared/ConfirmDialog'
import { supabase } from '../../lib/supabase'
import { useAppSettings } from '../../context/AppSettingsContext'
import { ADMIN_ROLE_VALUES } from '../../utils/constants'
import { riyadhDay } from '../../utils/dates'
import DailySurveyReport from './DailySurveyReport'

// إعداد الأدمن: تفعيل التقييم اليومي الإلزامي وعدد التقييمات، ومتابعة من أكمل اليوم
export default function DailySurveySettings({ cities = [], detectCity = () => null }) {
  const { settings, saveSetting } = useAppSettings()
  const enabled = String(settings?.daily_survey_enabled) === 'true'
  const count = Math.max(1, Number(settings?.daily_survey_count) || 5)
  const [countDraft, setCountDraft] = useState(String(count))
  const [reportKey, setReportKey] = useState(0)
  const [tab, setTab] = useState('report')   // report | settings | check
  const target = String(settings?.daily_survey_target) === 'selected' ? 'selected' : 'all'
  let selectedIds = []
  try { selectedIds = JSON.parse(settings?.daily_survey_users || '[]') } catch { selectedIds = [] }
  const [picked, setPicked] = useState([])      // [{id, full_name_ar, job_number, station}] الأسماء المحددة (للعرض)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  // فحص حساب: لماذا يظهر أو لا يظهر له التقييم
  const [cq, setCq] = useState('')
  const [cres, setCres] = useState([])
  const [diag, setDiag] = useState(null)
  useEffect(() => {
    const term = cq.trim().replace(/[%,()*]/g, '')
    if (term.length < 2) { setCres([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('users').select('id, full_name_ar, job_number, station:station_id(name_ar)').or(`full_name_ar.ilike.%${term}%,job_number.ilike.%${term}%,username.ilike.%${term}%`).limit(8)
      setCres(data ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [cq])
  async function runDiag(u) {
    setCres([]); setCq(''); setDiag({ loading: true, name: u.full_name_ar })
    const [{ data: usr }, { data: prog, error: pe }] = await Promise.all([
      supabase.from('users').select('id, role, station_id, station:station_id(name_ar, name_en, survey_city)').eq('id', u.id).maybeSingle(),
      supabase.from('user_daily_survey').select('done').eq('user_id', u.id).eq('day', riyadhDay()).maybeSingle(),
    ])
    const reasons = []
    const isAdminRole = ADMIN_ROLE_VALUES.includes(usr?.role)
    if (!enabled) reasons.push('التقييم اليومي معطّل (فعّل المفتاح أعلاه).')
    if (isAdminRole) reasons.push('الحساب أدمن، والأدمن مستثنى من التقييم.')
    if (target === 'selected' && !selectedIds.includes(u.id)) reasons.push('الفئة «حسابات محددة» وهذا الحساب ليس ضمنها.')
    const key = detectCity(usr?.station)
    const city = cities.find(c => c.city === key && c.is_active !== false)
    if (!usr?.station_id) reasons.push('الحساب غير مرتبط بمحطة.')
    else if (!city) reasons.push(`محطته (${usr?.station?.name_ar || '—'}) لا ترتبط بمدينة استبيان نشطة، فلا يوجد رابط يُعرض له. اربط المحطة بمدينة من «تعديل روابط المدن».`)
    if (pe) reasons.push('جدول المتابعة غير مُنشأ أو لا يُقرأ: ' + pe.message)
    const done = prog?.done ?? 0
    if (!pe && done >= count) reasons.push(`أكمل اليوم (${done} / ${count}) فلن يظهر حتى الغد. استخدم «تصفير تقدّم اليوم».`)
    setDiag({ name: u.full_name_ar, ok: reasons.length === 0, reasons, station: usr?.station?.name_ar, city: city ? `${city.ar} (${city.city})` : '—', done })
  }
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
    // سجل التفاصيل لنفس اليوم/الحسابات يُحذف أيضاً حتى يتطابق التقرير مع التصفير
    let delEv = supabase.from('user_survey_events').delete().eq('day', day)
    if (target === 'selected') delEv = delEv.in('user_id', selectedIds.length ? selectedIds : ['00000000-0000-0000-0000-000000000000'])
    await delEv
    setResetMsg(error ? 'تعذّر التصفير: ' + error.message : 'تم تصفير تقدّم اليوم. سيظهر الاستبيان من جديد لمن شملهم.')
    setReportKey(k => k + 1)
  }

  const card = { background: 'var(--card)', border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 12 }
  const lbl = { margin: '0 0 8px', fontSize: '.78rem', fontWeight: 800, color: 'var(--text-1)' }
  const hint = { margin: '4px 0 0', fontSize: '.72rem', color: 'var(--text-3)', lineHeight: 1.7 }
  const input = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-2, #e0e0e0)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '.8rem', boxSizing: 'border-box' }
  const ghost = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-2, #e0e0e0)', background: 'var(--card)', color: 'var(--text-2)', fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', fontFamily: 'inherit' }
  const tabs = [['report', 'التقرير'], ['settings', 'الإعدادات'], ['check', 'الفحص والتجربة']]

  return (
    <div style={{ ...card, marginBottom: 18, overflow: 'hidden' }}>
      {/* الرأس: العنوان + حالة التفعيل + العدد */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '16px 18px' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--text-1)' }}>التقييم اليومي الإلزامي</p>
            <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: '.66rem', fontWeight: 800, background: enabled ? 'rgba(5,150,105,.12)' : 'var(--surface-2, #ebebed)', color: enabled ? '#059669' : 'var(--text-3)' }}>{enabled ? 'مفعّل' : 'معطّل'}</span>
          </div>
          <p style={hint}>{enabled
            ? `يعمل كل يوم تلقائياً ويستمر حتى توقفه أنت: عند أول فتح في اليوم (وعند منتصف الليل للشاشات المفتوحة) يطلب من كل حساب ${count} تقييمات من الركاب.`
            : 'معطّل حالياً. عند التفعيل يستمر يوماً بعد يوم حتى توقفه.'}</p>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-2)' }}>
          <span role="switch" aria-checked={enabled} tabIndex={0} onClick={() => saveSetting('daily_survey_enabled', enabled ? 'false' : 'true')}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); saveSetting('daily_survey_enabled', enabled ? 'false' : 'true') } }}
            style={{ width: 44, height: 24, borderRadius: 99, background: enabled ? '#059669' : 'var(--border-2, #cfcfcf)', position: 'relative', transition: 'background .15s', flexShrink: 0 }}>
            <i style={{ position: 'absolute', top: 3, insetInlineStart: enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'inset-inline-start .15s' }} />
          </span>
          {enabled ? 'إيقاف' : 'تفعيل'}
        </label>
      </div>

      {/* التبويبات */}
      <div style={{ display: 'flex', borderTop: '1px solid var(--border-2, #e0e0e0)', borderBottom: '1px solid var(--border-2, #e0e0e0)', background: 'var(--surface)' }}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} role="tab" aria-selected={tab === id}
            style={{ padding: '11px 20px', border: 'none', borderBottom: `2px solid ${tab === id ? '#1C2B4A' : 'transparent'}`, marginBottom: -1, background: 'transparent', color: tab === id ? 'var(--text-1)' : 'var(--text-3)', fontWeight: tab === id ? 800 : 600, fontSize: '.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '18px' }}>
        {tab === 'report' && <DailySurveyReport key={reportKey} need={count} target={target} selectedIds={selectedIds} />}

        {tab === 'settings' && (
          <div style={{ display: 'grid', gap: 22, maxWidth: 760 }}>
            <div>
              <p style={lbl}>عدد التقييمات المطلوبة من كل حساب باليوم</p>
              <input type="number" min={1} max={50} value={countDraft} onChange={e => setCountDraft(e.target.value)}
                onBlur={() => { const n = Math.min(50, Math.max(1, Number(countDraft) || 5)); setCountDraft(String(n)); if (n !== count) saveSetting('daily_survey_count', String(n)) }}
                style={{ ...input, width: 90, fontFamily: 'monospace', textAlign: 'center' }} />
              <p style={hint}>يُحفظ تلقائياً. الأدمن العام مستثنى دائماً.</p>
            </div>
            <div>
              <p style={lbl}>من يشمله التقييم؟</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[{ id: 'all', t: 'كل الحسابات (عدا الأدمن العام)' }, { id: 'selected', t: 'حسابات محددة' }].map(o => (
                  <button key={o.id} type="button" onClick={() => saveSetting('daily_survey_target', o.id)}
                    style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${target === o.id ? '#059669' : 'var(--border-2, #e0e0e0)'}`, background: target === o.id ? 'rgba(5,150,105,.1)' : 'var(--card)', color: target === o.id ? '#059669' : 'var(--text-2)', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>{o.t}</button>
                ))}
              </div>
              {target === 'selected' && (
                <div style={{ marginTop: 12 }}>
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث باسم الموظف أو رقمه الوظيفي لإضافته..." style={input} />
                  {results.length > 0 && (
                    <div style={{ border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto', background: 'var(--card)' }}>
                      {results.map(u => (
                        <button key={u.id} type="button" onClick={() => { saveUsers([...selectedIds, u.id]); setQ('') }}
                          style={{ display: 'flex', width: '100%', justifyContent: 'space-between', padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.78rem', textAlign: 'start' }}>
                          <span>{u.full_name_ar} <span style={{ color: 'var(--text-3)' }}>· {u.station?.name_ar || '—'}</span></span><span style={{ color: '#059669', fontWeight: 800 }}>+</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {picked.map(u => (
                      <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 99, padding: '4px 6px 4px 12px', fontSize: '.75rem', background: 'var(--surface)', color: 'var(--text-1)' }}>
                        {u.full_name_ar}<span style={{ color: 'var(--text-3)' }}>{u.station?.name_ar ? ` · ${u.station.name_ar}` : ''}</span>
                        <button type="button" onClick={() => saveUsers(selectedIds.filter(id => id !== u.id))} aria-label="إزالة" style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    {picked.length === 0 && <span style={{ fontSize: '.75rem', color: '#b45309' }}>لم تحدد أي حساب بعد: لن يظهر التقييم لأحد.</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'check' && (
          <div style={{ display: 'grid', gap: 22, maxWidth: 760 }}>
            <div>
              <p style={lbl}>فحص حساب: لماذا يظهر أو لا يظهر له التقييم؟</p>
              <input value={cq} onChange={e => setCq(e.target.value)} placeholder="اكتب اسم الموظف أو رقمه الوظيفي..." style={input} />
              {cres.length > 0 && (
                <div style={{ border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 8, marginTop: 4, background: 'var(--card)' }}>
                  {cres.map(u => <button key={u.id} type="button" onClick={() => runDiag(u)} style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.78rem' }}>{u.full_name_ar} <span style={{ color: 'var(--text-3)' }}>· {u.station?.name_ar || '—'}</span></button>)}
                </div>
              )}
              {diag && !diag.loading && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', fontSize: '.78rem', color: 'var(--text-1)', lineHeight: 1.8 }}>
                  <b>{diag.name}</b> — المحطة: {diag.station || '—'} · مدينة الاستبيان: {diag.city} · تقدّم اليوم: {diag.done}/{count}
                  {diag.ok
                    ? <p style={{ margin: '4px 0 0', color: '#059669', fontWeight: 700 }}>سيظهر له التقييم عند فتح البرنامج.</p>
                    : <ul style={{ margin: '4px 0 0', paddingInlineStart: 18, color: '#b45309' }}>{diag.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                </div>
              )}
              {diag?.loading && <p style={hint}>جارٍ الفحص...</p>}
            </div>
            <div>
              <p style={lbl}>تجربة</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('daily-survey-preview'))} style={ghost}>معاينة كما يراه الموظف</button>
                <button type="button" onClick={() => setConfirmReset(true)} style={{ ...ghost, borderColor: '#fecaca', color: '#dc2626' }}>تصفير تقدّم اليوم (للتجربة)</button>
              </div>
              {resetMsg && <p style={{ ...hint, color: '#059669' }}>{resetMsg}</p>}
              <p style={hint}>المعاينة لا تُحتسب ولا تُحفظ. التصفير يحذف تقدّم اليوم وسجل تفاصيله للحسابات الشاملة فيظهر لها الاستبيان من جديد.</p>
            </div>
          </div>
        )}
      </div>
      {confirmReset && <ConfirmDialog danger message={target === 'selected' ? 'تصفير تقدّم اليوم للحسابات المحددة؟ سيظهر لهم الاستبيان من جديد، ويُحذف سجل تقييمات اليوم لهم.' : 'تصفير تقدّم اليوم لكل الحسابات؟ سيظهر الاستبيان لهم من جديد، ويُحذف سجل تقييمات اليوم.'} confirmLabel="تصفير" cancelLabel="إلغاء" onConfirm={resetToday} onCancel={() => setConfirmReset(false)} />}
    </div>
  )
}
