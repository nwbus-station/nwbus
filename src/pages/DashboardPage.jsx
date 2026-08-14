import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { getCached, setCached } from '../lib/pageCache'
import { SurveyOverlay, detectSurveyCity, SURVEY_STATIONS } from './SurveyPage'

const MONO = "'IBM Plex Mono', monospace"

const ROLE_LABELS = {
  general_admin:    { ar: 'أدمن عام',    en: 'General Admin' },
  station_admin:    { ar: 'مشرف المحطة', en: 'Station Supervisor' },
  accountant:       { ar: 'محاسب',        en: 'Accountant' },
  station_employee: { ar: 'موظف محطة',   en: 'Station Employee' },
  shift_supervisor: { ar: 'مشرف وردية',  en: 'Shift Supervisor' },
}

const NOTIF_DOT = {
  info:    '#2E6577',
  success: '#1E7A55',
  warning: '#A06B14',
  error:   '#B23B27',
}

function NWLogo({ height = 36 }) {
  const w = height * (398 / 115)
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={w} height={height} viewBox="0 0 398 115" fill="none">
      <path d="M217.45 73.4831L230.225 100.856H204.675L217.45 73.4831Z" fill="#111111"/>
      <path d="M123.432 32.9644L108.667 8.56036H135.605L123.432 32.9644Z" fill="#111111"/>
      <path d="M310.21 108.097C304.406 108.021 299.419 103.036 299.37 97.2583C299.318 91.2463 304.441 86.165 310.49 86.233C316.379 86.297 321.182 91.133 321.237 97.0583C321.294 103.156 316.279 108.177 310.21 108.097ZM389.265 46.289C388.59 40.337 387.926 34.385 387.263 28.433C387.01 26.1396 385.57 25.0636 383.443 24.6943C378.678 23.865 375.034 22.0183 372.829 17.069C370.747 12.4023 365.938 10.453 361.077 9.3063C357.753 8.5223 354.357 8.39297 350.941 8.39697C338.082 8.4103 325.218 8.4143 312.315 8.4143L310.175 15.237C323.375 15.2383 336.571 15.233 349.771 15.245C352.515 15.249 355.287 15.325 357.994 15.717C365.442 16.797 368.906 20.341 369.549 27.7863C370.647 40.5183 371.547 53.269 372.583 66.6996C365.827 66.6996 359.538 66.589 353.255 66.7516C350.782 66.8183 349.049 66.0916 347.339 64.2823C340.633 57.1756 333.799 50.1916 326.954 43.2183C324.837 41.0623 322.738 39.2276 319.165 39.257C313.651 39.305 308.137 39.301 302.625 39.3196L300.495 46.1156C305.831 46.1036 311.169 46.101 316.509 46.0716C319.147 46.0556 321.021 46.7716 322.846 48.7023C329.735 55.997 336.873 63.0543 343.727 70.3796C345.907 72.7116 348.154 73.6836 351.342 73.589C358.543 73.3783 365.753 73.525 373.237 73.525V93.597H328.055C325.225 84.8303 319.629 79.4383 310.382 79.397C300.893 79.353 295.351 85.025 292.506 93.8623H268.971L266.766 100.892H292.217C293.411 101.544 293.359 103.012 293.893 104.132C297.199 111.061 302.633 114.96 310.325 114.972C318.018 114.986 323.697 111.186 326.614 104.098C327.762 101.301 329.117 100.608 331.905 100.63C346.155 100.756 360.406 100.58 374.657 100.748C378.87 100.797 380.27 99.2663 380.367 95.069C380.817 75.7476 378.498 56.5983 377.17 37.3876C377.015 35.1436 376.825 32.9023 376.647 30.6023C379.727 29.9063 380.817 31.293 381.058 33.9716C381.45 38.325 381.982 42.665 382.427 47.0143C382.655 49.2383 383.762 50.9116 386.031 50.7676C388.531 50.6076 389.551 48.7863 389.265 46.289Z" fill="#111111"/>
      <path d="M252.214 100.857H272.386L322.254 8.39827H291.612L262.204 60.6503L231.402 8.39827H199.972L171.4 59.1623L148.504 20.3209L133.057 48.7383L151.996 77.8729L166.937 100.857H182.856L217.782 40.2049L252.214 100.857Z" fill="#111111"/>
      <path d="M118.531 64.0054L87.9068 8.70808H56.8414L8.94678 100.545H42.0241L73.2681 38.3561L103.923 100.545H133.191L180.985 8.70808H147.773L118.531 64.0054Z" fill="#111111"/>
    </svg>
  )
}

function Svg({ paths, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {(Array.isArray(paths) ? paths : [paths]).map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

const ICONS = {
  bus:     ['M8 6v6','M15 6v6','M2 12h19.6','M18 18h2l1-3H3l1 3h2','M7 18a2 2 0 100 4 2 2 0 000-4z','M17 18a2 2 0 100 4 2 2 0 000-4z','M2 6h20v12H2z'],
  report:  ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z','M14 2v6h6','M16 13H8','M16 17H8','M10 9H8'],
  monitor: ['M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3'],
  bag:     ['M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z','M3 6h18','M16 10a4 4 0 01-8 0'],
  bell:    ['M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9','M13.73 21a2 2 0 01-3.46 0'],
  leave:   ['M8 2v4','M16 2v4','M3 10h18','M21 8H3a1 1 0 00-1 1v11a1 1 0 001 1h18a1 1 0 001-1V9a1 1 0 00-1-1z'],
  arrow:   'M5 12h14M12 5l7 7-7 7',
}

function StarIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  )
}

const SURVEY_DASH_CSS = `
@media (max-width: 480px) {
  .dash-survey-inner { flex-wrap: wrap !important; }
  .dash-survey-btn { width: 100% !important; justify-content: center !important; margin-top: 4px; }
}
`

function SurveyWidget({ city, isAdmin, isAr, onLaunch, onNavigate }) {
  const [hover, setHover] = useState(false)
  const cityInfo = SURVEY_STATIONS.find(s => s.city === city)
  const color = cityInfo?.color || '#5B5BD6'

  if (isAdmin) {
    return (
      <button
        onClick={onNavigate}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '14px 18px', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: isAr ? 'right' : 'left',
          boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
          transition: 'box-shadow 0.14s',
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: hover ? `${color}18` : 'var(--surface)',
          border: `1px solid ${hover ? color + '40' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: hover ? color : 'var(--text-3)',
          transition: 'all 0.14s',
        }}>
          <StarIcon size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-1)' }}>
            {isAr ? 'تقييم الركاب' : 'Passenger Rating'}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)' }}>
            {isAr ? 'استبيان رضا الركاب — جميع المحطات' : 'Passenger survey — all stations'}
          </p>
        </div>
        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>
          <Svg paths={ICONS.arrow} size={15} />
        </span>
      </button>
    )
  }

  if (!city) return null

  return (
    <>
      <style>{`@keyframes dash-pulse{0%,100%{box-shadow:0 0 0 0 ${color}35}50%{box-shadow:0 0 0 8px ${color}00}}`}</style>
      <div style={{
        background: 'var(--card)',
        border: `1px solid ${hover ? color + '50' : 'var(--border)'}`,
        borderRadius: 6,
        boxShadow: hover ? `0 2px 16px ${color}18` : 'var(--shadow-sm)',
        overflow: 'hidden',
        transition: 'all 0.15s',
      }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}66)` }} />
        <div className="dash-survey-inner" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: `${color}12`, border: `1px solid ${color}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: color,
          }}>
            <StarIcon size={19} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-1)' }}>
              {isAr ? 'تقييم تجربة الراكب' : 'Passenger Survey'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isAr ? `استبيان الركاب — ${cityInfo?.ar}` : `Passenger survey — ${cityInfo?.en}`}
            </p>
          </div>
          <button
            onClick={onLaunch}
            className="dash-survey-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: color, border: 'none', borderRadius: 8,
              padding: '9px 16px', color: '#fff',
              fontSize: '0.78rem', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              animation: 'dash-pulse 2.8s infinite',
              transition: 'opacity 0.12s, transform 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'scale(1.03)' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}
          >
            <StarIcon size={13} />
            {isAr ? 'ابدأ' : 'Launch'}
          </button>
        </div>
      </div>
    </>
  )
}

export default function DashboardPage() {
  const { profile, isAdmin, isGeneralAdmin, allowedStationIds } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const navigate = useNavigate()

  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const roleLabel   = ROLE_LABELS[profile?.role]?.[isAr ? 'ar' : 'en'] ?? profile?.role
  const stationName = profile?.station ? (isAr ? profile.station.name_ar : profile.station.name_en) : null
  const userName    = profile?.full_name_ar ?? ''

  const [hasStar, setHasStar] = useState(false)
  useEffect(() => {
    if (!profile?.id) return
    const n = new Date()
    const m = n.getMonth() + 1, y = n.getFullYear()
    async function fetchStar() {
      // موظف
      const { data: empData } = await supabase.from('employee_evaluations').select('total_score')
        .eq('employee_id', profile.id).eq('eval_month', m).eq('eval_year', y).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (empData) { setHasStar((empData.total_score ?? 0) >= 98); return }
      // مشرف
      const { data: supData } = await supabase.from('supervisor_evaluations').select('total_score')
        .eq('supervisor_id', profile.id).eq('eval_month', m).eq('eval_year', y).order('created_at', { ascending: false }).limit(1).maybeSingle()
      setHasStar((supData?.total_score ?? 0) >= 98)
    }
    fetchStar()
    const ch = supabase.channel('dash-star')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_evaluations', filter: `employee_id=eq.${profile.id}` }, fetchStar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supervisor_evaluations', filter: `supervisor_id=eq.${profile.id}` }, fetchStar)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [profile?.id])
  const [surveyCity, setSurveyCity] = useState(null)
  useEffect(() => { setSurveyCity(detectSurveyCity(profile?.station)) }, [profile?.station])
  const mods        = profile?.allowed_modules

  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const dateStr = now.toLocaleDateString(isAr ? 'ar-SA-u-ca-gregory' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const greet = () => {
    const h = now.getHours()
    if (isAr) {
      if (h < 12) return 'صباح الخير'
      if (h < 17) return 'مساء الخير'
      return 'مساء النور'
    }
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  /* ── إجازات معلقة ── */
  const [pendingLeaves, setPendingLeaves] = useState([])
  useEffect(() => {
    if (!profile?.id || !isAdmin) return
    async function load() {
      const key = `dash_leaves_${profile.id}_${profile.role}`
      const cached = getCached(key)
      if (cached) setPendingLeaves(cached)
      let q = supabase.from('leaves').select('id, employee_name, station_id').eq('status', 'pending').order('created_at', { ascending: false })
      if (profile.role === 'station_admin' && profile.station_id) q = q.eq('station_id', profile.station_id)
      else if (profile.role === 'area_supervisor' && allowedStationIds?.length) q = q.in('station_id', allowedStationIds)
      const { data, error } = await q
      if (!error && data) { setCached(key, data); setPendingLeaves(data) }
    }
    load()
    const ch = supabase.channel('dash-leaves').on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [profile?.id, profile?.role, profile?.station_id, isAdmin])

  /* ── إشعارات ── */
  const [notifs, setNotifs]           = useState([])
  const [notifLoading, setNotifLoading] = useState(true)

  const loadNotifs = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(15)
    setNotifs(data ?? [])
    setNotifLoading(false)
  }, [profile?.id])

  useEffect(() => {
    loadNotifs()
    const t = setInterval(loadNotifs, 30000)
    return () => clearInterval(t)
  }, [loadNotifs])

  const unread = notifs.filter(n => !n.is_read).length

  async function markRead(id) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }
  async function markAllRead() {
    const ids = notifs.filter(n => !n.is_read).map(n => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ is_read: true }).in('id', ids)
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - new Date(ts)) / 60000)
    if (diff < 1) return isAr ? 'الآن' : 'now'
    if (diff < 60) return isAr ? `منذ ${diff} د` : `${diff}m ago`
    if (diff < 1440) return isAr ? `منذ ${Math.floor(diff / 60)} س` : `${Math.floor(diff / 60)}h ago`
    return isAr ? `منذ ${Math.floor(diff / 1440)} يوم` : `${Math.floor(diff / 1440)}d ago`
  }

  /* ── وصلات سريعة ── */
  const quickLinks = [
    ...(!mods || mods.includes('transportation') ? [{ to: '/transportation', ar: 'الترحيل',    en: 'Transportation', icon: 'bus',     desc_ar: 'تتبع الرحلات والمغادرات', desc_en: 'Trips & departures' }] : []),
    ...(isAdmin || profile?.role === 'accountant' ? [{ to: '/reports',       ar: 'التقارير',    en: 'Reports',        icon: 'report',  desc_ar: 'تقارير تشغيلية شاملة',    desc_en: 'Operational reports' }] : []),
    ...(!mods || mods.includes('lost_found')       ? [{ to: '/lost-found',    ar: 'الموجودات',  en: 'Lost & Found',  icon: 'bag',     desc_ar: 'تسجيل وتسليم الموجودات', desc_en: 'Register & hand over items' }] : []),
  ]

  /* ── المعلومات ── */
  const infoRows = [
    { label: isAr ? 'المستخدم' : 'User',    value: userName || '—' },
    { label: isAr ? 'الدور'    : 'Role',    value: roleLabel || '—' },
    { label: isAr ? 'المحطة'  : 'Station', value: stationName || (isAr ? 'جميع المحطات' : 'All Stations') },
    { label: isAr ? 'التاريخ' : 'Date',    value: now.toLocaleDateString('en-GB') },
  ]

  const [surveyOpen, setSurveyOpen] = useState(false)

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: 'var(--shadow-sm)' }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{ minHeight: 'calc(100vh - 108px)', background: 'var(--surface)' }}>

      <style>{SURVEY_DASH_CSS}</style>
      {surveyOpen && surveyCity && <SurveyOverlay city={surveyCity} onClose={() => setSurveyOpen(false)} />}

      {/* ── شريط الترحيب ── */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '16px 28px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>

          {/* الترحيب */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-1)' }}>
                {greet()}{userName ? `، ${userName}` : ''}
              </p>
              {hasStar && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  borderRadius: 20, padding: '3px 10px',
                  boxShadow: '0 2px 8px rgba(245,158,11,0.4)',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>موظف متميز</span>
                </div>
              )}
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--text-3)' }}>
              {dateStr}
            </p>
          </div>

          <div dir="ltr" style={{
            fontFamily: MONO, fontWeight: 700, fontSize: '1.5rem',
            color: 'var(--text-1)', letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {timeStr}
          </div>
        </div>
      </div>

      {/* ── المحتوى الرئيسي ── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 28px' }}>

        {/* تنبيه إجازات معلقة */}
        {isAdmin && pendingLeaves.length > 0 && (
          <button onClick={() => navigate('/leaves?tab=pending')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 14,
              ...card,
              borderInlineStart: '3px solid var(--accent)',
              padding: '14px 18px', cursor: 'pointer', marginBottom: 20,
              fontFamily: 'inherit', textAlign: isAr ? 'right' : 'left',
              transition: 'box-shadow 0.14s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 4,
              background: 'var(--accent)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: MONO, fontWeight: 800, fontSize: '1rem', flexShrink: 0,
            }}>
              {pendingLeaves.length}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-1)' }}>
                {isAr ? `${pendingLeaves.length} طلب إجازة بانتظار الموافقة` : `${pendingLeaves.length} leave requests pending`}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: '0.7rem', color: 'var(--text-3)' }}>
                {pendingLeaves.slice(0, 3).map(l => l.employee_name).filter(Boolean).join(' · ')}
                {pendingLeaves.length > 3 ? ` +${pendingLeaves.length - 3}` : ''}
              </p>
            </div>
            <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>
              <Svg paths={ICONS.arrow} size={16} />
            </span>
          </button>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'start' }}>

            {/* عمود يسار */}
            <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* وصول سريع */}
              {quickLinks.length > 0 && (
                <div>
                  <p style={{ margin: '0 0 10px', fontSize: '0.63rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', fontFamily: MONO, textTransform: 'uppercase' }}>
                    {isAr ? 'وصول سريع' : 'QUICK ACCESS'}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(quickLinks.length, 3)}, 1fr)`, gap: 12 }}>
                    {quickLinks.map(l => (
                      <button key={l.to} onClick={() => navigate(l.to)}
                        style={{
                          ...card, padding: '18px 16px',
                          cursor: 'pointer', fontFamily: 'inherit',
                          textAlign: isAr ? 'right' : 'left',
                          display: 'flex', flexDirection: 'column', gap: 12,
                          transition: 'box-shadow 0.14s',
                          border: '1px solid var(--border)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
                      >
                        <div style={{
                          width: 38, height: 38, borderRadius: 8,
                          background: 'var(--surface)', color: 'var(--text-1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: 'var(--shadow-icon)',
                        }}>
                          <Svg paths={ICONS[l.icon]} size={16} />
                        </div>
                        <div>
                          <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-1)' }}>{isAr ? l.ar : l.en}</p>
                          <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)' }}>{isAr ? l.desc_ar : l.desc_en}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* بطاقة التقييم */}
              <SurveyWidget
                city={surveyCity}
                isAdmin={profile?.role === 'general_admin'}
                isAr={isAr}
                onLaunch={() => setSurveyOpen(true)}
                onNavigate={() => navigate('/survey')}
              />

              {/* معلومات الجلسة */}
              <div style={card}>
                <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: 'var(--accent)', borderRadius: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.09em', fontFamily: MONO, textTransform: 'uppercase' }}>
                    {isAr ? 'معلومات الجلسة' : 'Session Info'}
                  </span>
                </div>
                <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                  {infoRows.map(r => (
                    <div key={r.label}>
                      <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{r.label}</p>
                      <p style={{ margin: '3px 0 0', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>{r.value}</p>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '11px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                  <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600, fontFamily: MONO }}>
                    {isAr ? 'متصل بالنظام' : 'CONNECTED'}
                  </span>
                </div>
              </div>
            </div>

            {/* لوحة الإشعارات */}
            <aside style={{ flex: '0 0 310px', minWidth: 0, display: 'flex', flexDirection: 'column', borderRadius: 6, overflow: 'hidden', background: 'var(--card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>

              {/* رأس */}
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: 'var(--accent)', borderRadius: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.09em', fontFamily: MONO, textTransform: 'uppercase' }}>
                    {isAr ? 'الإشعارات' : 'Notifications'}
                  </span>
                  {unread > 0 && (
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 800, fontFamily: MONO,
                      background: 'var(--accent)', color: '#fff',
                      borderRadius: 4, padding: '1px 6px', lineHeight: 1.6,
                    }}>{unread}</span>
                  )}
                </div>
                {unread > 0 && (
                  <button onClick={markAllRead} style={{
                    fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-3)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0',
                    textDecoration: 'underline', textUnderlineOffset: 3, opacity: 0.7,
                  }}>
                    {isAr ? 'قراءة الكل' : 'Mark all'}
                  </button>
                )}
              </div>

              {/* قائمة */}
              <div style={{ overflowY: 'auto', maxHeight: 320 }}>
                {notifLoading ? (
                  <div style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {[75, 55, 68].map((w, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface-2)', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ height: 9, width: `${w}%`, background: 'var(--surface-2)', borderRadius: 4, marginBottom: 7 }} />
                          <div style={{ height: 7, width: '42%', background: 'var(--surface)', borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : notifs.length === 0 ? (
                  <div style={{ padding: '36px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-3)',
                    }}>
                      <Svg paths={ICONS.bell} size={17} />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)' }}>
                        {isAr ? 'لا توجد إشعارات' : 'No notifications'}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '0.67rem', color: 'var(--text-3)' }}>
                        {isAr ? 'ستظهر هنا عند وصولها' : 'They will appear here'}
                      </p>
                    </div>
                  </div>
                ) : notifs.map((n, i) => {
                  const dotColor = NOTIF_DOT[n.type] ?? NOTIF_DOT.info
                  return (
                    <div key={n.id} onClick={() => markRead(n.id)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 11,
                        padding: '11px 16px',
                        borderBottom: i < notifs.length - 1 ? '1px solid var(--border)' : 'none',
                        background: n.is_read ? 'transparent' : `${dotColor}08`,
                        cursor: 'pointer', transition: 'background 0.12s',
                        position: 'relative',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                      onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : `${dotColor}08`}
                    >
                      {!n.is_read && (
                        <div style={{
                          position: 'absolute', [isAr ? 'right' : 'left']: 0, top: 0, bottom: 0,
                          width: 3, background: dotColor,
                        }} />
                      )}
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: n.is_read ? 'var(--surface)' : `${dotColor}15`,
                        border: `1px solid ${n.is_read ? 'var(--border)' : `${dotColor}25`}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: n.is_read ? 'var(--text-3)' : dotColor,
                      }}>
                        <Svg paths={ICONS.bell} size={13} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: n.is_read ? 500 : 700, color: n.is_read ? 'var(--text-2)' : 'var(--text-1)', lineHeight: 1.45 }}>{n.title}</p>
                        {n.body && <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)', lineHeight: 1.4 }}>{n.body}</p>}
                        <p style={{ margin: '5px 0 0', fontSize: '0.6rem', color: 'var(--text-3)', fontFamily: MONO, display: 'inline-block', background: 'var(--surface)', padding: '1px 6px', borderRadius: 3 }}>{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </aside>

        </div>

      </div>
    </div>
  )
}
