import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useAppSettings } from '../../context/AppSettingsContext'
import { supabase } from '../../lib/supabase'

const MONO = "'IBM Plex Mono', monospace"

const TYPE_STYLE = {
  info:    { dot: '#2E6577' },
  success: { dot: '#1E7A55' },
  warning: { dot: '#A06B14' },
  error:   { dot: '#B23B27' },
}

function NotificationBell({ profile }) {
  const [open, setOpen]       = useState(false)
  const [notifs, setNotifs]   = useState([])
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  const unread = notifs.filter(n => !n.is_read).length

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifs(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [profile?.id])

  // polling كل 30 ثانية
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [profile?.id])

  useEffect(() => {
    if (!open) return
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

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
    if (diff < 1) return 'الآن'
    if (diff < 60) return `منذ ${diff} د`
    if (diff < 1440) return `منذ ${Math.floor(diff / 60)} س`
    return `منذ ${Math.floor(diff / 1440)} يوم`
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => { setOpen(o => !o); if (!open) load() }}
        style={{ width: 32, height: 32, borderRadius: 3, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', color: '#A8B2BA', flexShrink: 0 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 15, height: 15, borderRadius: 2, background: '#DE9526', color: '#101B24', fontSize: '0.58rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1, fontFamily: MONO }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 40, left: 0, width: 320, background: 'var(--card)', borderRadius: 4, boxShadow: '0 0 0 1px var(--border-2), 0 12px 32px rgba(26,33,41,0.16)', zIndex: 100, overflow: 'hidden' }} dir="rtl">
          {/* Header */}
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-1)' }}>الإشعارات</span>
              {unread > 0 && <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '1px 7px', borderRadius: 2, background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid #E0CFA4' }}>{unread} جديد</span>}
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize: '0.68rem', color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                قراءة الكل
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: '0.82rem' }}>جارٍ التحميل...</p>
            ) : notifs.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--text-3)', fontSize: '0.82rem' }}>لا توجد إشعارات</p>
            ) : notifs.map(n => {
              const s = TYPE_STYLE[n.type] ?? TYPE_STYLE.info
              return (
                <div key={n.id} onClick={() => markRead(n.id)}
                  style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start', background: n.is_read ? 'var(--card)' : '#F5F2EB', cursor: 'pointer', transition: 'background 0.1s' }}>
                  <div style={{ width: 7, height: 7, borderRadius: 1, background: n.is_read ? 'var(--border-2)' : s.dot, marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: n.is_read ? 500 : 700, color: 'var(--text-1)', lineHeight: 1.4 }}>{n.title}</p>
                    {n.body && <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.4 }}>{n.body}</p>}
                    <p style={{ margin: '4px 0 0', fontSize: '0.64rem', color: 'var(--text-3)', fontFamily: MONO }}>{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
)

const ICONS = {
  home:    ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z','M9 22V12h6v10'],
  bus:     ['M8 6v6','M15 6v6','M2 12h19.6','M18 18h2l1-3H3l1 3h2','M7 18a2 2 0 100 4 2 2 0 000-4z','M17 18a2 2 0 100 4 2 2 0 000-4z','M2 6h20v12H2z'],
  bag:     ['M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z','M3 6h18','M16 10a4 4 0 01-8 0'],
  sales:   ['M12 2v20','M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'],
  report:  ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z','M14 2v6h6','M16 13H8','M16 17H8','M10 9H8'],
  users:   ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2','M23 21v-2a4 4 0 00-3-3.87','M9 3a4 4 0 010 8','M16 3.13a4 4 0 010 7.75'],
  station: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z','M12 7a3 3 0 100 6 3 3 0 000-6z'],
  map:     ['M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z','M8 2v16','M16 6v16'],
  logout:  ['M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4','M16 17l5-5-5-5','M21 12H9'],
  settings:['M12 15a3 3 0 100-6 3 3 0 000 6z','M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z'],
  globe:   ['M12 2a10 10 0 100 20A10 10 0 0012 2z','M2 12h20','M12 2a15.3 15.3 0 010 20'],
  monitor: ['M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3'],
  leave:   ['M8 2v4','M16 2v4','M3 10h18','M21 8H3a1 1 0 00-1 1v11a1 1 0 001 1h18a1 1 0 001-1V9a1 1 0 00-1-1z','M8 14h.01','M12 14h.01','M16 14h.01','M8 18h.01','M12 18h.01'],
}

const NAV_GROUPS = [
  {
    items: [
      { to: '/',               labelAr: 'الرئيسية',      labelEn: 'Dashboard',      icon: 'home',    roles: null,                                          module: null },
      { to: '/transportation', labelAr: 'الترحيل',        labelEn: 'Transportation', icon: 'bus',     roles: null,                                          module: 'transportation' },
      { to: '/lost-found',     labelAr: 'الموجودات',      labelEn: 'Lost & Found',   icon: 'bag',     roles: null,                                          module: 'lost_found' },
      { to: '/sales',          labelAr: 'الإيرادات',      labelEn: 'Sales',          icon: 'sales',   roles: null,                                          module: 'sales' },
      { to: '/reports',        labelAr: 'التقارير',        labelEn: 'Reports',        icon: 'report',  roles: ['general_admin','station_admin','accountant'], module: 'reports' },
      { to: '/leaves',         labelAr: 'الإجازات',        labelEn: 'Leaves',         icon: 'leave',   roles: null, module: 'leaves' },
    ]
  },
  {
    items: [
      { to: '/users',    labelAr: 'الموظفون', labelEn: 'Staff',     icon: 'users',   roles: ['general_admin','station_admin'], module: null },
      { to: '/stations', labelAr: 'المحطات',  labelEn: 'Stations',  icon: 'station', roles: ['general_admin'],                 module: null },
      { to: '/settings', labelAr: 'الإعدادات', labelEn: 'Settings', icon: 'settings', roles: ['general_admin'],               module: null },
      { to: '/map',      labelAr: 'الخريطة',  labelEn: 'Map',       icon: 'map',     roles: ['general_admin','station_admin'], module: null, disabled: true },
    ]
  },
]

const ROLE_LABELS = {
  general_admin:    { ar: 'أدمن عام',    en: 'General Admin' },
  station_admin:    { ar: 'مشرف المحطة', en: 'Supervisor' },
  accountant:       { ar: 'محاسب',        en: 'Accountant' },
  station_employee: { ar: 'موظف',         en: 'Employee' },
  shift_supervisor: { ar: 'مشرف وردية',  en: 'Shift Supervisor' },
}

// ── تبويب تنقّل علوي — نصي صافٍ بخط سفلي للنشط ─────────
function NavTab({ item, isAr }) {
  if (item.disabled) return (
    <span style={{
      display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
      padding: '13px 14px 11px', fontSize: '0.84rem', fontWeight: 500,
      color: 'var(--border-2)', cursor: 'not-allowed',
      borderBottom: '2px solid transparent', marginBottom: -2,
    }}>
      {isAr ? item.labelAr : item.labelEn}
    </span>
  )

  return (
    <NavLink to={item.to} end={item.to === '/'} className="navtab"
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
        padding: '13px 14px 11px', fontSize: '0.84rem',
        fontWeight: isActive ? 700 : 500,
        color: isActive ? 'var(--text-1)' : 'var(--text-3)',
        textDecoration: 'none',
        borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        marginBottom: -2,
        transition: 'color 0.12s',
      })}>
      {isAr ? item.labelAr : item.labelEn}
    </NavLink>
  )
}

export default function AppLayout() {
  const { i18n } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const isAr = i18n.language === 'ar'
  const { settings } = useAppSettings()

  const mods = profile?.allowed_modules
  const visibleGroups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(n => {
      if (n.roles && !n.roles.includes(profile?.role)) return false
      if (n.module && mods && !mods.includes(n.module)) return false
      return true
    })
  })).filter(g => g.items.length > 0)

  const roleLabel   = ROLE_LABELS[profile?.role]?.[isAr ? 'ar' : 'en'] ?? profile?.role
  const stationName = profile?.station ? (isAr ? profile.station.name_ar : profile.station.name_en) : null

  function toggleLang() {
    const next = isAr ? 'en' : 'ar'
    i18n.changeLanguage(next)
    localStorage.setItem('nwbus_lang', next)
    document.documentElement.lang = next
    document.documentElement.dir  = next === 'ar' ? 'rtl' : 'ltr'
  }

  async function handleLogout() { await signOut(); navigate('/login') }

  const idleTimer = useRef(null)
  useEffect(() => {
    const idleEnabled = settings.idle_enabled !== 'false'
    if (!idleEnabled) return
    const idleMin = parseInt(settings.idle_min || '3')
    const reset = () => {
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => navigate('/board'), idleMin * 60 * 1000)
    }
    const evts = ['mousemove','mousedown','keydown','touchstart','scroll']
    evts.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => { clearTimeout(idleTimer.current); evts.forEach(e => window.removeEventListener(e, reset)) }
  }, [navigate, settings.idle_enabled, settings.idle_min])

  const ghostBtn = {
    display: 'flex', alignItems: 'center', gap: 6,
    height: 32, padding: '0 10px', borderRadius: 3,
    background: 'transparent', border: '1px solid rgba(255,255,255,0.16)',
    color: '#A8B2BA', fontSize: '0.72rem', fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    transition: 'all 0.13s',
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>

      {/* ══ شريط العلامة العلوي ══════════════════════════ */}
      <header className="no-print" style={{
        background: '#101B24', height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        {/* Wordmark */}
        <div style={{ lineHeight: 1.15, flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: '#F2EFE8', letterSpacing: '0.16em', fontFamily: MONO }}>NORTH WEST BUS</p>
          <p style={{ margin: 0, fontSize: '0.56rem', color: '#77848E' }} className="hidden sm:block">{isAr ? 'نظام تشغيل المحطات' : 'Stations Operations'}</p>
        </div>

        <div style={{ flex: 1 }} />

        {/* شاشة العرض — تُخفى لمن حُجب عنه القسم */}
        {(!mods || mods.includes('live_board')) && (
        <button onClick={() => navigate('/board')} style={ghostBtn}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#DE9526'; e.currentTarget.style.color = '#DE9526' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = '#A8B2BA' }}>
          <Icon d={ICONS.monitor} size={13} />
          <span className="hidden md:inline">{isAr ? 'شاشة العرض' : 'Live Board'}</span>
        </button>
        )}

        {/* اللغة */}
        <button onClick={toggleLang} style={ghostBtn}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#DE9526'; e.currentTarget.style.color = '#DE9526' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = '#A8B2BA' }}>
          {isAr ? 'EN' : 'ع'}
        </button>

        <NotificationBell profile={profile} />

        {/* المستخدم */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInlineStart: 10, borderInlineStart: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ textAlign: isAr ? 'right' : 'left', lineHeight: 1.2 }} className="hidden sm:block">
            <p style={{ margin: 0, fontSize: '0.74rem', fontWeight: 600, color: '#F2EFE8', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.full_name_ar}
            </p>
            <p style={{ margin: 0, fontSize: '0.58rem', color: '#DE9526', fontFamily: MONO, letterSpacing: '0.04em' }}>
              {roleLabel}{stationName ? ` · ${stationName}` : ''}
            </p>
          </div>
          <button onClick={handleLogout} title={isAr ? 'تسجيل الخروج' : 'Sign Out'}
            style={{ ...ghostBtn, padding: 0, width: 32, justifyContent: 'center' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#B23B27'; e.currentTarget.style.color = '#D9705C' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = '#A8B2BA' }}>
            <Icon d={ICONS.logout} size={13} />
          </button>
        </div>
      </header>

      {/* ══ شريط التبويبات ══════════════════════════════ */}
      <nav className="no-print" style={{
        background: 'var(--surface)', flexShrink: 0,
        borderBottom: '2px solid var(--brand-900)',
        display: 'flex', alignItems: 'stretch', gap: 2,
        padding: '0 10px', overflowX: 'auto',
        position: 'sticky', top: 52, zIndex: 39,
      }}>
        {visibleGroups.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', alignItems: 'stretch', gap: 2 }}>
            {gi > 0 && <div style={{ width: 1, background: 'var(--border-2)', margin: '12px 8px' }} />}
            {group.items.map(item => <NavTab key={item.to} item={item} isAr={isAr} />)}
          </div>
        ))}
      </nav>

      {/* ══ المحتوى ══════════════════════════════════════ */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  )
}
