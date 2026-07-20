import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

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

// شعار الشركة (NW + الباص)
function NWIcon({ width = 200 }) {
  const h = width * (115 / 398)
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={h} viewBox="0 0 398 115" fill="none">
      <path d="M217.45 73.4831L230.225 100.856H204.675L217.45 73.4831Z" fill="#1D1D1C"/>
      <path d="M123.432 32.9644L108.667 8.56036H135.605L123.432 32.9644Z" fill="#264673"/>
      <path d="M310.21 108.097C304.406 108.021 299.419 103.036 299.37 97.2583C299.318 91.2463 304.441 86.165 310.49 86.233C316.379 86.297 321.182 91.133 321.237 97.0583C321.294 103.156 316.279 108.177 310.21 108.097ZM389.265 46.289C388.59 40.337 387.926 34.385 387.263 28.433C387.01 26.1396 385.57 25.0636 383.443 24.6943C378.678 23.865 375.034 22.0183 372.829 17.069C370.747 12.4023 365.938 10.453 361.077 9.3063C357.753 8.5223 354.357 8.39297 350.941 8.39697C338.082 8.4103 325.218 8.4143 312.315 8.4143L310.175 15.237C323.375 15.2383 336.571 15.233 349.771 15.245C352.515 15.249 355.287 15.325 357.994 15.717C365.442 16.797 368.906 20.341 369.549 27.7863C370.647 40.5183 371.547 53.269 372.583 66.6996C365.827 66.6996 359.538 66.589 353.255 66.7516C350.782 66.8183 349.049 66.0916 347.339 64.2823C340.633 57.1756 333.799 50.1916 326.954 43.2183C324.837 41.0623 322.738 39.2276 319.165 39.257C313.651 39.305 308.137 39.301 302.625 39.3196L300.495 46.1156C305.831 46.1036 311.169 46.101 316.509 46.0716C319.147 46.0556 321.021 46.7716 322.846 48.7023C329.735 55.997 336.873 63.0543 343.727 70.3796C345.907 72.7116 348.154 73.6836 351.342 73.589C358.543 73.3783 365.753 73.525 373.237 73.525V93.597H328.055C325.225 84.8303 319.629 79.4383 310.382 79.397C300.893 79.353 295.351 85.025 292.506 93.8623H268.971L266.766 100.892H292.217C293.411 101.544 293.359 103.012 293.893 104.132C297.199 111.061 302.633 114.96 310.325 114.972C318.018 114.986 323.697 111.186 326.614 104.098C327.762 101.301 329.117 100.608 331.905 100.63C346.155 100.756 360.406 100.58 374.657 100.748C378.87 100.797 380.27 99.2663 380.367 95.069C380.817 75.7476 378.498 56.5983 377.17 37.3876C377.015 35.1436 376.825 32.9023 376.647 30.6023C379.727 29.9063 380.817 31.293 381.058 33.9716C381.45 38.325 381.982 42.665 382.427 47.0143C382.655 49.2383 383.762 50.9116 386.031 50.7676C388.531 50.6076 389.551 48.7863 389.265 46.289Z" fill="#1D1D1C"/>
      <path d="M252.214 100.857H272.386L322.254 8.39827H291.612L262.204 60.6503L231.402 8.39827H199.972L171.4 59.1623L148.504 20.3209L133.057 48.7383L151.996 77.8729L166.937 100.857H182.856L217.782 40.2049L252.214 100.857Z" fill="#264673"/>
      <path d="M118.531 64.0054L87.9068 8.70808H56.8414L8.94678 100.545H42.0241L73.2681 38.3561L103.923 100.545H133.191L180.985 8.70808H147.773L118.531 64.0054Z" fill="#EE712D"/>
    </svg>
  )
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const navigate = useNavigate()

  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  const roleLabel   = ROLE_LABELS[profile?.role]?.[isAr ? 'ar' : 'en'] ?? profile?.role
  const stationName = profile?.station ? (isAr ? profile.station.name_ar : profile.station.name_en) : null
  const userName    = profile?.full_name_ar ?? ''
  const isAdmin     = profile?.role === 'general_admin' || profile?.role === 'station_admin'

  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const dateStr = now.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  /* ── طلبات الإجازات المعلقة (للمشرف/الأدمن) ── */
  const [pendingLeaves, setPendingLeaves] = useState([])
  useEffect(() => {
    if (!profile?.id || !isAdmin) return
    async function load() {
      let q = supabase
        .from('leaves')
        .select('id, employee_name, station_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (profile.role === 'station_admin' && profile.station_id) {
        q = q.eq('station_id', profile.station_id)
      }
      const { data, error } = await q
      if (!error) setPendingLeaves(data ?? [])
    }
    load()
    const ch = supabase.channel('dashboard-leaves')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [profile?.id, profile?.role, profile?.station_id, isAdmin])

  /* ── الإشعارات ── */
  const [notifs, setNotifs] = useState([])
  const [notifLoading, setNotifLoading] = useState(true)

  const loadNotifs = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(15)
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

  /* ── وصلات سريعة (تحترم الأقسام المحجوبة عن المستخدم) ── */
  const mods = profile?.allowed_modules
  const quickLinks = [
    ...(!mods || mods.includes('transportation') ? [{ to: '/transportation', ar: 'الترحيل', en: 'Transportation' }] : []),
    ...(isAdmin || profile?.role === 'accountant' ? [{ to: '/reports', ar: 'التقارير', en: 'Reports' }] : []),
    ...(!mods || mods.includes('live_board') ? [{ to: '/board', ar: 'شاشة العرض', en: 'Live Board' }] : []),
  ]

  const card = 'bg-white border border-gray-200 rounded-lg'

  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'} style={{ minHeight: 'calc(100vh - 100px)' }}>
      <div className="max-w-6xl mx-auto grid gap-4 md:grid-cols-[1fr_340px] items-start">

        {/* ══ العمود الرئيسي ══ */}
        <div className="space-y-4 min-w-0">

          {/* بطاقة الترحيب + الساعة */}
          <div className={`${card} overflow-hidden`}>
            {/* شريط المستخدم */}
            <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3 border-b border-gray-200" style={{ background: '#F5F2EB' }}>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="font-bold text-gray-800">{userName}</span>
                <span className="text-gray-300">|</span>
                <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-sm"
                  style={{ background: 'var(--brand-900)', color: 'var(--accent)' }}>
                  {roleLabel}
                </span>
                {stationName && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="text-gray-500">{stationName}</span>
                  </>
                )}
              </div>
            </div>

            {/* الشعار + الساعة */}
            <div className="flex flex-col items-center py-10 px-6">
              <NWIcon width={180} />
              <p className="mt-3 mb-8 text-[0.8rem] font-bold tracking-[0.3em] text-gray-700 uppercase" style={{ fontFamily: MONO }}>
                North West Bus
              </p>

              <div className="w-10 h-0.5 mb-8" style={{ background: 'var(--accent)' }} />

              <div dir="ltr" className="leading-none font-bold" style={{
                fontFamily: MONO,
                fontSize: 'clamp(2.6rem, 8vw, 4.6rem)',
                color: 'var(--text-1)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {timeStr}
              </div>
              <p className="mt-3 text-sm text-gray-400">{dateStr}</p>
            </div>

            {/* وصلات سريعة */}
            <div className="flex border-t border-gray-200">
              {quickLinks.map((l, i) => (
                <button key={l.to} onClick={() => navigate(l.to)}
                  className={`flex-1 py-3 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors ${i > 0 ? 'border-s border-gray-200' : ''}`}
                  style={{ background: 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F5F2EB'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {isAr ? l.ar : l.en} ←
                </button>
              ))}
            </div>
          </div>

          {/* طلبات الإجازات المعلقة */}
          {isAdmin && pendingLeaves.length > 0 && (
            <div
              role="button" tabIndex={0}
              onClick={() => navigate('/leaves?tab=pending')}
              onKeyDown={e => e.key === 'Enter' && navigate('/leaves?tab=pending')}
              className="w-full flex items-center gap-4 cursor-pointer rounded-lg px-5 py-4"
              style={{ background: '#16232E', border: '1px solid #2C3B47' }}
            >
              <div className="flex items-center justify-center shrink-0 font-bold"
                style={{ width: 42, height: 42, borderRadius: 3, background: 'var(--accent)', color: '#101B24', fontFamily: MONO, fontSize: '1.1rem' }}>
                {pendingLeaves.length}
              </div>
              <div className="flex-1 min-w-0">
                <p className="m-0 text-sm font-bold text-white">
                  {pendingLeaves.length === 1
                    ? (isAr ? 'طلب إجازة بانتظار الموافقة' : 'One leave request pending')
                    : (isAr ? `${pendingLeaves.length} طلبات إجازة بانتظار الموافقة` : `${pendingLeaves.length} leave requests pending`)}
                </p>
                <p className="m-0 mt-0.5 text-xs" style={{ color: '#77848E' }}>
                  {pendingLeaves.slice(0, 2).map(l => l.employee_name).filter(Boolean).join('، ')}
                  {pendingLeaves.length > 2 ? (isAr ? ` و${pendingLeaves.length - 2} آخرون` : ` +${pendingLeaves.length - 2} more`) : ''}
                </p>
              </div>
              <span style={{ color: '#77848E' }}>‹</span>
            </div>
          )}
        </div>

        {/* ══ لوحة الإشعارات ══ */}
        <aside className={`${card} overflow-hidden`}>
          {/* رأس اللوحة */}
          <div className="flex items-center justify-between px-4 py-3 border-b-2" style={{ borderColor: 'var(--brand-900)' }}>
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-900)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              <span className="text-sm font-bold text-gray-800">{isAr ? 'الإشعارات' : 'Notifications'}</span>
              {unread > 0 && (
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm"
                  style={{ background: 'var(--accent)', color: '#101B24' }}>
                  {unread}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-[11px] font-semibold text-gray-400 hover:text-gray-700">
                {isAr ? 'قراءة الكل' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* المحتوى */}
          <div className="max-h-[430px] overflow-y-auto">
            {notifLoading ? (
              <p className="text-center text-gray-400 text-xs py-10">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</p>
            ) : notifs.length === 0 ? (
              /* لا توجد إشعارات */
              <div className="flex flex-col items-center py-12 px-4 text-center">
                <div className="flex items-center justify-center mb-3"
                  style={{ width: 44, height: 44, borderRadius: 3, background: '#F5F2EB', border: '1px solid var(--border)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C7CFDA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
                  </svg>
                </div>
                <p className="m-0 text-sm font-semibold text-gray-500">{isAr ? 'لا توجد إشعارات' : 'No notifications'}</p>
                <p className="m-0 mt-1 text-[11px] text-gray-400">
                  {isAr ? 'كل جديد يخص حسابك بيظهر هنا' : 'Anything new for your account shows up here'}
                </p>
              </div>
            ) : notifs.map(n => (
              <div key={n.id} onClick={() => markRead(n.id)}
                className="flex items-start gap-2.5 px-4 py-3 border-b border-gray-100 last:border-b-0 cursor-pointer transition-colors"
                style={{ background: n.is_read ? 'transparent' : '#F5F2EB' }}>
                <span className="shrink-0 mt-1.5"
                  style={{ width: 7, height: 7, borderRadius: 1, background: n.is_read ? 'var(--border-2)' : (NOTIF_DOT[n.type] ?? NOTIF_DOT.info) }} />
                <div className="flex-1 min-w-0">
                  <p className={`m-0 text-xs leading-snug ${n.is_read ? 'font-medium text-gray-500' : 'font-bold text-gray-800'}`}>
                    {n.title}
                  </p>
                  {n.body && <p className="m-0 mt-0.5 text-[11px] text-gray-400 leading-snug">{n.body}</p>}
                  <p className="m-0 mt-1 text-[10px] text-gray-300 font-mono">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

      </div>
    </div>
  )
}
