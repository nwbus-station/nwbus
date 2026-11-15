import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAppSettings } from '../../context/AppSettingsContext'
import { useAuth } from '../../context/AuthContext'
import ConfirmDialog from '../shared/ConfirmDialog'
import { SettingsCard, Icon } from './ui'
import { OVERVIEW_USERS_KEY, overviewUsers } from '../../utils/transportOverview'

// تخصيص حسابات الجدول الشامل (الترحيل): من يضيفهم الأدمن يرون الجدول الشامل ويفتح لهم أول ما يدخلون الترحيل

export default function TransportOverviewAccess({ isAr = true, onSaved }) {
  const T = (a, e) => (isAr ? a : e)
  const { settings, saveSetting } = useAppSettings()
  const { profile } = useAuth()
  const ids = useMemo(() => overviewUsers(settings?.[OVERVIEW_USERS_KEY]), [settings])
  const [names, setNames] = useState({})
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [busy, setBusy] = useState(false)
  const [drop, setDrop] = useState(null)
  const [msg, setMsg] = useState('')

  // أسماء المخصَّصين
  useEffect(() => {
    const need = ids.filter(i => !names[i])
    if (!need.length) return
    supabase.from('users').select('id, full_name_ar, job_number, role').in('id', need).then(({ data }) => {
      if (data) setNames(prev => ({ ...prev, ...Object.fromEntries(data.map(u => [u.id, u])) }))
    })
  }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps

  // بحث بالاسم أو الرقم الوظيفي
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setFound([]); return }
    const id = setTimeout(async () => {
      const digits = /^\d+$/.test(t)
      let qq = supabase.from('users').select('id, full_name_ar, job_number, role').eq('is_active', true).limit(10)
      qq = digits ? qq.ilike('job_number', `%${t}%`) : qq.ilike('full_name_ar', `%${t}%`)
      const { data } = await qq
      setFound((data ?? []).filter(u => !ids.includes(u.id)))
    }, 300)
    return () => clearTimeout(id)
  }, [q, ids])

  async function save(next) {
    setBusy(true); setMsg('')
    await saveSetting(OVERVIEW_USERS_KEY, JSON.stringify(next))
    setBusy(false); setMsg(T('تم الحفظ', 'Saved')); onSaved?.(T('تم حفظ قائمة من يرى الجدول الشامل', 'Comprehensive schedule access saved')); setTimeout(() => setMsg(''), 1800)
  }
  const add = u => { setNames(p => ({ ...p, [u.id]: u })); setQ(''); setFound([]); save([...ids, u.id]) }
  const meIn = !!profile?.id && ids.includes(profile.id)

  return (
    <SettingsCard span icon="users"
      title={T('الجدول الشامل (الترحيل): من يراه؟', 'Comprehensive schedule: who sees it?')}
      desc={T('أضف الحسابات التي تبيها ترى الجدول الشامل. المضافون فقط يرونه ويفتح لهم أول ما يدخلون صفحة الترحيل، وباقي الحسابات (حتى الأدمن) لا يظهر لهم. وإذا ما أضفت أحداً يبقى كما كان: يظهر لمن عنده صلاحية «عرض تبويب الجدول الشامل».', 'Add the accounts that should see the comprehensive schedule. Only they see it, and it opens first when they enter Transportation; other accounts (even admins) do not. If nobody is added, it works as before: shown to anyone with the “comprehensive schedule tab” permission.')}
      aside={<span className="st-pill acc">{T('المخصَّصون', 'Assigned')} <b>{ids.length}</b></span>}>

      {ids.length > 0 && !meIn && (
        <p role="alert" className="st-note warn" style={{ margin: '0 0 14px' }}>
          {T('حسابك غير مضاف في القائمة، فلن ترى الجدول الشامل أنت أيضاً. أضف نفسك إن أردت.', 'Your account is not in the list, so you will not see it either. Add yourself if you want.')}
        </p>
      )}

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <input className="st-input" value={q} onChange={e => setQ(e.target.value)} placeholder={T('ابحث بالاسم أو الرقم الوظيفي لإضافة حساب…', 'Search by name or job number to add…')} aria-label={T('بحث عن حساب', 'Find an account')} />
        {found.length > 0 && (
          <ul style={{ position: 'absolute', insetInline: 0, top: '100%', zIndex: 5, margin: '6px 0 0', padding: 6, listStyle: 'none', background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 14, boxShadow: 'var(--shadow-md)', maxHeight: 280, overflowY: 'auto' }}>
            {found.map(u => (
              <li key={u.id}>
                <button type="button" onClick={() => add(u)} disabled={busy} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: 'var(--text-1)', borderRadius: 10 }}>
                  <b style={{ flex: 1, fontSize: '0.92rem' }}>{u.full_name_ar}</b>
                  <span dir="ltr" style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-3)' }}>#{u.job_number ?? '—'}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent)' }}>{T('إضافة', 'Add')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ids.length === 0
        ? <p className="st-note info" style={{ margin: 0 }}>{T('لم يُخصَّص أحد بعد (السلوك السابق).', 'No one assigned yet (previous behaviour).')}</p>
        : (
          <div className="st-rows">
            {ids.map(id => {
              const u = names[id]
              return (
                <div key={id} className="st-row">
                  <span aria-hidden="true" className="st-avatar" style={{ width: 40, height: 40, fontSize: '0.8rem' }}>{(u?.full_name_ar || '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: '0.92rem', color: 'var(--text-1)' }}>{u?.full_name_ar || T('جارٍ التحميل…', 'Loading…')}{id === profile?.id ? ` (${T('أنت', 'you')})` : ''}</b>
                    <div dir="ltr" style={{ fontSize: '0.8rem', color: 'var(--text-3)', fontFamily: 'monospace', textAlign: isAr ? 'right' : 'left' }}>#{u?.job_number ?? '—'}</div>
                  </div>
                  <button type="button" className="st-btn sm danger" onClick={() => setDrop({ id, name: u?.full_name_ar || '' })} disabled={busy}>{T('إزالة', 'Remove')}</button>
                </div>
              )
            })}
          </div>
        )}
      {msg && <p role="status" className="st-note ok" style={{ margin: '14px 0 0' }}><Icon name="check" size={16} />{msg}</p>}

      {drop && (
        <ConfirmDialog
          message={T(`إزالة ${drop.name || 'هذا الحساب'} من قائمة من يرى الجدول الشامل؟ ${ids.length === 1 ? 'وبما أنه الأخير، يعود الجدول للظهور لكل من عنده صلاحيته.' : 'ولن يظهر له بعد الآن.'}`, `Remove ${drop.name || 'this account'}? ${ids.length === 1 ? 'As it is the last one, the tab returns to everyone with the permission.' : 'It will no longer be shown to them.'}`)}
          confirmLabel={T('نعم، إزالة', 'Yes, remove')} cancelLabel={T('تراجع', 'Back')}
          onConfirm={() => { const next = ids.filter(i => i !== drop.id); setDrop(null); save(next) }} onCancel={() => setDrop(null)} />
      )}
    </SettingsCard>
  )
}
