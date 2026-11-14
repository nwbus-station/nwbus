// الرئيسية على الجوال: تصميم تطبيق — ترحيب مضغوط، ما يحتاج انتباهك الآن، أيقونات وصول سريع (شبكة)، آخر الإشعارات، ثم المجلة والتقييم.
import { useState } from 'react'

const MONO = "'IBM Plex Mono', monospace"
const NOTIF_DOT = { info: '#2E6577', success: '#1E7A55', warning: '#A06B14', error: '#B23B27' }
const label = { margin: '0 0 8px', fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em' }

const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')

export default function MobileHome({
  isAr, now, greeting, userName, roleLabel, stationName, hasStar, curShift, shiftPct, remText,
  quickLinks, renderIcon, attention, notifs, notifLoading, unread, markRead, markAllRead, timeAgo, onNotifOpen,
  updatePending, onUpdate, version, stamp, navigate, children,
}) {
  const t = (a, e) => (isAr ? a : e)
  const [showAll, setShowAll] = useState(false)
  const hhmm = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateShort = now.toLocaleDateString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const shown = showAll ? notifs : notifs.slice(0, 3)

  return (
    <div style={{ padding: '12px 14px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── الترحيب ── */}
      <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg, var(--accent), transparent)' }} />
        <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div aria-hidden="true" style={{ width: 50, height: 50, borderRadius: 16, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--accent), #7B7BDE)', color: '#fff', fontWeight: 900, fontSize: '1.05rem', letterSpacing: '.02em' }}>{initials(userName)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)' }}>{greeting}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.22rem', fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName || '—'}</h1>
              {hasStar && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'linear-gradient(135deg, #F59E0B, #D97706)', borderRadius: 99, padding: '2px 9px', fontSize: '0.62rem', fontWeight: 800, color: '#fff' }}>{t('متميز', 'Star')}</span>}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-2)', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[roleLabel, stationName || t('جميع المحطات', 'All stations')].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'end', flexShrink: 0 }}>
            <div dir="ltr" style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.5rem', color: 'var(--text-1)', lineHeight: 1 }}>{hhmm}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-3)', marginTop: 4, fontWeight: 600, maxWidth: 110 }}>{dateShort}</div>
          </div>
        </div>
        {/* الوردية */}
        <div style={{ padding: '10px 16px 13px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--text-1)' }}>{isAr ? curShift.ar : curShift.en}</span>
            <span dir="ltr" style={{ fontFamily: MONO, fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 600 }}>{curShift.range}</span>
            <span style={{ marginInlineStart: 'auto', fontSize: '0.68rem', fontWeight: 800, color: 'var(--accent)' }}>{remText}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-2)', marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: `${shiftPct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width .6s' }} />
          </div>
        </div>
      </section>

      {/* ── ما يحتاج انتباهك ── */}
      <section aria-label={t('ما يحتاج انتباهك', 'Needs your attention')}>
        <p style={label}>{t('ما يحتاج انتباهك', 'NEEDS YOUR ATTENTION')}</p>
        {attention.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }}>
            <span style={{ width: 30, height: 30, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(22,163,74,0.14)', color: '#16a34a' }}>{renderIcon('check', 16)}</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-2)' }}>{t('لا شيء معلّق الآن — كل شيء تحت السيطرة', 'Nothing pending — all clear')}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -14px', padding: '2px 14px 6px', scrollSnapType: 'x proximity', scrollbarWidth: 'none' }}>
            {attention.map(a => (
              <button key={a.key} type="button" onClick={a.onClick} style={{ flex: '0 0 auto', minWidth: 138, scrollSnapAlign: 'start', textAlign: 'start', background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${a.color}`, borderRadius: 14, padding: '11px 14px', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.65rem', color: a.color, lineHeight: 1 }}>{a.n}</span>
                  <span style={{ color: a.color, opacity: 0.8, marginInlineStart: 'auto' }}>{renderIcon(a.icon, 18)}</span>
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-1)', marginTop: 6 }}>{a.label}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── وصول سريع ── */}
      {quickLinks.length > 0 && (
        <section aria-label={t('وصول سريع', 'Quick access')}>
          <p style={label}>{t('وصول سريع', 'QUICK ACCESS')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px 6px' }}>
            {quickLinks.map(l => (
              <button key={l.to} type="button" onClick={() => navigate(l.to)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: 0 }}>
                <span style={{ position: 'relative', width: 58, height: 58, borderRadius: 18, display: 'grid', placeItems: 'center', background: `${l.hue}1f`, color: l.hue, border: `1px solid ${l.hue}33` }}>
                  {renderIcon(l.icon, 25)}
                  {l.badge > 0 && <span style={{ position: 'absolute', top: -6, insetInlineEnd: -6, minWidth: 20, height: 20, padding: '0 5px', borderRadius: 99, background: l.hue, color: '#fff', fontFamily: MONO, fontWeight: 900, fontSize: '0.68rem', display: 'grid', placeItems: 'center', border: '2px solid var(--surface)' }}>{l.badge}</span>}
                </span>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-1)', textAlign: 'center', lineHeight: 1.35, maxWidth: '100%', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{isAr ? l.ar : l.en}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── آخر الإشعارات ── */}
      <section id="home-notifs" aria-label={t('الإشعارات', 'Notifications')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <p style={{ ...label, margin: 0 }}>{t('آخر الإشعارات', 'LATEST NOTIFICATIONS')}</p>
          {unread > 0 && <span style={{ fontFamily: MONO, fontSize: '0.62rem', fontWeight: 800, background: 'var(--accent)', color: '#fff', borderRadius: 99, padding: '1px 7px' }}>{unread}</span>}
          {unread > 0 && <button type="button" onClick={markAllRead} style={{ marginInlineStart: 'auto', background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', padding: 4 }}>{t('قراءة الكل', 'Mark all read')}</button>}
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {notifLoading ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>{[70, 55, 62].map((w, i) => <div key={i} style={{ height: 10, width: `${w}%`, background: 'var(--surface-2)', borderRadius: 4 }} />)}</div>
          ) : notifs.length === 0 ? (
            <div style={{ padding: '26px 16px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-3)' }}>{t('لا توجد إشعارات', 'No notifications')}</div>
          ) : shown.map((n, i) => {
            const c = NOTIF_DOT[n.type] ?? NOTIF_DOT.info
            return (
              <button key={n.id} type="button" onClick={() => onNotifOpen(n)} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 11, textAlign: 'start', padding: '12px 14px', border: 'none', borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none', background: n.is_read ? 'transparent' : `${c}0d`, cursor: 'pointer', fontFamily: 'inherit', position: 'relative' }}>
                {!n.is_read && <i aria-hidden="true" style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: 3, background: c }} />}
                <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: n.is_read ? 'var(--surface)' : `${c}1c`, color: n.is_read ? 'var(--text-3)' : c }}>{renderIcon('bell', 15)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: n.is_read ? 600 : 800, color: n.is_read ? 'var(--text-2)' : 'var(--text-1)', lineHeight: 1.5 }}>{n.title}</span>
                  {n.body && <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.55, marginTop: 2, whiteSpace: 'pre-line' }}>{n.body}</span>}
                  <span style={{ display: 'block', fontSize: '0.62rem', color: 'var(--text-3)', fontFamily: MONO, marginTop: 5 }}>{timeAgo(n.created_at)}</span>
                </span>
              </button>
            )
          })}
          {notifs.length > 3 && (
            <button type="button" onClick={() => setShowAll(v => !v)} style={{ width: '100%', padding: '12px', border: 'none', borderTop: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              {showAll ? t('عرض أقل', 'Show less') : t(`عرض الكل (${notifs.length})`, `Show all (${notifs.length})`)}
            </button>
          )}
        </div>
      </section>

      {/* المجلة والتقييم */}
      {children}

      {/* ── حالة النظام ── */}
      <footer style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 4px 0', fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: updatePending ? 'var(--warning)' : 'var(--success)' }} />
          {updatePending ? t('تحديث متوفر', 'Update ready') : t('متصل', 'Online')}
        </span>
        {updatePending && <button type="button" onClick={onUpdate} style={{ border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: 8, padding: '5px 12px', fontWeight: 800, fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'inherit' }}>{t('تحديث الآن', 'Update now')}</button>}
        <span dir="ltr" style={{ marginInlineStart: 'auto', fontFamily: MONO }}>v{version} · {stamp}</span>
      </footer>
    </div>
  )
}
