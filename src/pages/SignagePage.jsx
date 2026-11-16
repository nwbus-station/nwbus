// قسم «الشاشات»: إدارة شاشات المحطات (ربط الأجهزة، مكتبة المحتوى، الحملات والموافقة، الطوارئ، سجل التدقيق)
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/shared/PageHeader'
import LoadingSpinner from '../components/shared/LoadingSpinner'
import { useMedia } from '../components/dispatch/Sheet'
import DevicesTab from '../components/signage/DevicesTab'
import MediaTab from '../components/signage/MediaTab'
import CampaignsTab from '../components/signage/CampaignsTab'
import SafetyTab from '../components/signage/SafetyTab'
import { Empty, SG_ACCENT } from '../components/signage/common'
import { isOnline } from '../utils/signage'

export default function SignagePage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const desk = useMedia('(min-width: 900px)')
  const [role, setRole] = useState(undefined)            // undefined = يتحمّل، null = بلا صلاحية
  const [myUserId, setMyUserId] = useState(null)
  const [data, setData] = useState({ devices: [], media: [], campaigns: [], stations: [], emergency: null, audit: [], plays: {} })
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('sg_tab') || 'devices' } catch { return 'devices' } })
  const [filter, setFilter] = useState('all')
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const t = (a, e) => (isAr ? a : e)

  const flash = useCallback((msg, ok = true) => {
    setToast({ msg, ok }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  const load = useCallback(async (r = role) => {
    if (!r) return
    const since = new Date(Date.now() - 86400000).toISOString()
    const [dv, md, cp, st, em, au, pl] = await Promise.all([
      supabase.from('signage_devices').select('id,name,station_id,orientation,status,last_seen_at,app_version,now_playing,paired_at').order('name'),
      supabase.from('signage_media').select('*').order('created_at', { ascending: false }),
      supabase.from('signage_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('stations').select('id,name_ar,name_en').eq('is_active', true).order('name_ar'),
      supabase.from('signage_emergency').select('*').eq('id', 1).maybeSingle(),
      r === 'admin' ? supabase.from('signage_audit').select('*').order('at', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
      supabase.from('signage_playlog').select('device_id').gte('played_at', since).limit(10000),
    ])
    const first = [dv, md, cp].find(x => x.error)
    if (first) { setLoadErr(/does not exist|schema cache/i.test(first.error.message) ? 'setup' : 'fail'); return }
    setLoadErr('')
    const plays = {}; (pl.data || []).forEach(p => { plays[p.device_id] = (plays[p.device_id] || 0) + 1 })
    setData({ devices: dv.data || [], media: md.data || [], campaigns: cp.data || [], stations: st.data || [], emergency: em.data || null, audit: au.data || [], plays })
  }, [role])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: r }, { data: { user } }] = await Promise.all([supabase.rpc('signage_role'), supabase.auth.getUser()])
      if (!alive) return
      if (user) { const { data: u } = await supabase.from('users').select('id').eq('auth_id', user.id).maybeSingle(); if (alive) setMyUserId(u?.id || null) }
      setRole(r || null)
      if (r) load(r)
    })().catch(() => { if (alive) setRole(null) })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // تحديث حالة الاتصال دورياً
  useEffect(() => {
    if (!role) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30000)
    return () => clearInterval(id)
  }, [role, load])

  const go = k => { setTab(k); try { localStorage.setItem('sg_tab', k) } catch { /* */ } }

  if (role === undefined) return <LoadingSpinner />
  if (!role) return <div style={{ padding: 24 }}><Empty title={t('ليس لديك صلاحية قسم الشاشات', 'You do not have access to Screens')} hint={t('تُمنح الصلاحية من إدارة الموظفين.', 'Access is granted in Staff management.')} /></div>

  const isAdmin = role === 'admin'
  const active = data.devices.filter(d => d.status === 'active')
  const online = active.filter(isOnline).length
  const live = data.campaigns.filter(c => c.status === 'approved').length
  const pending = data.campaigns.filter(c => c.status === 'pending').length
  const tabs = [
    ['devices', t('الشاشات', 'Screens'), active.length],
    ['media', t('المحتوى', 'Media'), data.media.length],
    ['campaigns', t('الحملات', 'Campaigns'), pending || null],
    ...(isAdmin ? [['safety', t('الطوارئ والسجل', 'Emergency & audit'), null]] : []),
  ]
  const cur = tabs.some(x => x[0] === tab) ? tab : 'devices'
  const emergencyLive = data.emergency?.active && (!data.emergency.ends_at || new Date(data.emergency.ends_at) > new Date())

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: desk ? '4px 0 40px' : '0 0 80px' }}>
      <PageHeader title={t('شاشات المحطات', 'Station screens')} accent={SG_ACCENT}
        subtitle={t('أدر محتوى الشاشات في كل المحطات: ارفع الصور والفيديو، حدّد أين ومتى تُعرض، وراقب اتصال كل شاشة.', 'Manage content on every station screen: upload, target, schedule and monitor.')}
        stats={[
          { label: t('شاشات متصلة', 'Online'), value: `${online}/${active.length}`, color: online === active.length && active.length ? '#16a34a' : '#d97706', onClick: () => go('devices') },
          { label: t('حملات منشورة', 'Live campaigns'), value: live, color: SG_ACCENT, onClick: () => { setFilter('approved'); go('campaigns') } },
          { label: t('بانتظار الموافقة', 'Pending'), value: pending, color: pending ? '#d97706' : undefined, onClick: () => { setFilter('pending'); go('campaigns') } },
          { label: t('ملفات المحتوى', 'Media files'), value: data.media.length, onClick: () => go('media') },
        ]} />

      {emergencyLive && (
        <div role="alert" style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 12, background: '#b91c1c', color: '#fff', fontWeight: 800, fontSize: '0.86rem', lineHeight: 1.8 }}>
          {t('رسالة الطوارئ مفعّلة الآن على كل الشاشات: ', 'Emergency message is live on all screens: ')}{data.emergency.message}
        </div>
      )}

      <div role="tablist" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 2 }}>
        {tabs.map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} onClick={() => go(k)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 900, fontSize: '0.86rem', cursor: 'pointer', whiteSpace: 'nowrap', border: `2px solid ${cur === k ? SG_ACCENT : 'var(--border)'}`, background: cur === k ? SG_ACCENT : 'var(--card)', color: cur === k ? '#fff' : 'var(--text-2)' }}>
            {label}{n ? <span dir="ltr" style={{ opacity: 0.85, fontFamily: 'ui-monospace, Menlo, monospace' }}>{n}</span> : null}
          </button>
        ))}
      </div>

      {loadErr === 'setup' ? (
        <Empty title={t('لم يُجهَّز قسم الشاشات بعد', 'Screens is not set up yet')} hint={t('شغّل ملف SQL «027» في Supabase ثم حدّث الصفحة.', 'Run the 027 SQL file in Supabase, then refresh.')} />
      ) : loadErr ? (
        <Empty title={t('تعذّر تحميل البيانات', 'Could not load data')} action={<button type="button" onClick={() => load()} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', fontFamily: 'inherit', fontWeight: 800, cursor: 'pointer' }}>{t('إعادة المحاولة', 'Retry')}</button>} />
      ) : <>
        {cur === 'devices' && <DevicesTab isAr={isAr} isAdmin={isAdmin} devices={data.devices} stations={data.stations} plays={data.plays} reload={load} flash={flash} />}
        {cur === 'media' && <MediaTab isAr={isAr} role={role} myUserId={myUserId} media={data.media} campaigns={data.campaigns} reload={load} flash={flash} />}
        {cur === 'campaigns' && <CampaignsTab isAr={isAr} role={role} myUserId={myUserId} campaigns={data.campaigns} media={data.media} devices={data.devices} stations={data.stations} filter={filter} setFilter={setFilter} reload={load} flash={flash} />}
        {cur === 'safety' && isAdmin && <SafetyTab isAr={isAr} emergency={data.emergency} audit={data.audit} reload={load} flash={flash} />}
      </>}

      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', insetInline: 16, bottom: 'calc(20px + env(safe-area-inset-bottom))', zIndex: 10070, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ padding: '12px 20px', borderRadius: 12, background: toast.ok ? '#15803d' : '#b91c1c', color: '#fff', fontWeight: 800, fontSize: '0.86rem', boxShadow: '0 12px 32px rgba(0,0,0,.3)', maxWidth: 560, lineHeight: 1.7 }}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
