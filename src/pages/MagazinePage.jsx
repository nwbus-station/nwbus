import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

const MONO = "'IBM Plex Mono', monospace"
const STAR_THRESHOLD = 98
const ORDINALS_AR = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر']

const TEMPLATES = {
  spotlight:    { ar: 'موظف متميز',   en: 'Employee Spotlight', bg: 'linear-gradient(135deg,#B45309,#78350F)', badge: '⭐' },
  announcement: { ar: 'إعلان',        en: 'Announcement',       bg: 'linear-gradient(135deg,#1C2B4A,#101B2E)', badge: '📢' },
  celebration:  { ar: 'تهنئة',        en: 'Celebration',        bg: 'linear-gradient(135deg,#5B5BD6,#9333EA)', badge: '🎉' },
  circular:     { ar: 'تعميم إداري',  en: 'Official Circular',  bg: 'linear-gradient(135deg,#374151,#111827)', badge: '📋' },
}
const TEMPLATE_ORDER = ['spotlight', 'announcement', 'celebration', 'circular']

// خلفيات جاهزة إضافية — تدرّجات مصمّمة بدل ما تحتاج ترفع صورة كل مرة
const PRESET_BACKGROUNDS = [
  { key: 'navy',      ar: 'كحلي رسمي',    en: 'Corporate Navy', css: 'linear-gradient(135deg,#0F1C33,#1C2B4A 60%,#2A3D63)' },
  { key: 'gold',      ar: 'ذهبي فاخر',    en: 'Elegant Gold',   css: 'linear-gradient(135deg,#78350F,#B45309 55%,#D97706)' },
  { key: 'emerald',   ar: 'زمردي',        en: 'Emerald',        css: 'linear-gradient(135deg,#064E3B,#059669 60%,#10B981)' },
  { key: 'violet',    ar: 'بنفسجي احتفالي', en: 'Festive Violet', css: 'linear-gradient(135deg,#4C1D95,#7C3AED 55%,#A78BFA)' },
  { key: 'crimson',   ar: 'عنّابي',        en: 'Crimson',        css: 'linear-gradient(135deg,#450A0A,#B91C1C 60%,#EF4444)' },
  { key: 'slate',     ar: 'رمادي إداري',   en: 'Formal Slate',   css: 'linear-gradient(135deg,#1E293B,#334155 60%,#475569)' },
  { key: 'teal',      ar: 'فيروزي',        en: 'Teal',           css: 'linear-gradient(135deg,#134E4A,#0D9488 60%,#2DD4BF)' },
  { key: 'sunset',    ar: 'غروب',          en: 'Sunset',         css: 'linear-gradient(135deg,#7C2D12,#C2410C 50%,#F59E0B)' },
]

const FONTS = {
  default: { ar: 'افتراضي',    en: 'Default',        family: 'inherit' },
  tajawal: { ar: 'عصري',       en: 'Modern',          family: "'Tajawal', sans-serif" },
  amiri:   { ar: 'رسمي أنيق',  en: 'Elegant Formal',  family: "'Amiri', serif" },
  lalezar: { ar: 'احتفالي',    en: 'Festive',         family: "'Lalezar', cursive" },
  serif:   { ar: 'كلاسيكي',    en: 'Classic',         family: "Georgia, 'Traditional Arabic', serif" },
  mono:    { ar: 'مضغوط',      en: 'Compact',         family: MONO },
}

function bgFor(post) {
  if (post?.background_image_url) return { image: post.background_image_url }
  if (post?.background_preset) {
    const p = PRESET_BACKGROUNDS.find(b => b.key === post.background_preset)
    if (p) return { css: p.css }
  }
  return { css: (TEMPLATES[post?.template] ?? TEMPLATES.announcement).bg }
}

function ordinalMonthAr(n) { return `الشهر ${ORDINALS_AR[n] || n} على التوالي` }

// عدد الأشهر المتتالية (منتهية بآخر شهر مُقيَّم) اللي حصل فيها الشخص ٩٨٪ فأكثر
function consecutiveStreak(sortedDescRows) {
  let streak = 0
  let expY = sortedDescRows[0]?.eval_year, expM = sortedDescRows[0]?.eval_month
  for (const r of sortedDescRows) {
    if (r.eval_year !== expY || r.eval_month !== expM || r.total_score < STAR_THRESHOLD) break
    streak++
    expM--; if (expM < 1) { expM = 12; expY-- }
  }
  return streak
}

async function uploadMagazineImage(file) {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('magazine-images').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('magazine-images').getPublicUrl(path)
  return data.publicUrl
}

async function uploadMagazinePdf(file) {
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
  const { error } = await supabase.storage.from('magazine-files').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('magazine-files').getPublicUrl(path)
  return data.publicUrl
}

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E5E7EB',
  fontSize: '0.85rem', fontFamily: 'inherit', color: '#111827', background: '#fff', boxSizing: 'border-box', outline: 'none',
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#4B5563', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <div style={{ border: '1px solid #EEF0F3', borderRadius: 12, padding: 16, background: '#FAFBFC' }}>
      <p style={{ margin: '0 0 12px', fontSize: '0.7rem', fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}

// شريط جانبي (يغطي الشاشة) لتصفح كل الصفحات بصور مصغّرة — يوضّح الصفحة الحالية ويقفل بزر خروج
function PageSidebar({ posts, activeIndex, onSelect, onClose, isAr }) {
  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, background: 'rgba(6,10,20,0.96)', zIndex: 80, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>{isAr ? `كل الصفحات (${posts.length})` : `All pages (${posts.length})`}</h2>
          <button onClick={onClose} aria-label="close"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', fontSize: '1.05rem', lineHeight: 1 }}>
            ✕
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
          {posts.map((p, i) => {
            const tpl = TEMPLATES[p.template] ?? TEMPLATES.announcement
            const bg = bgFor(p)
            const active = i === activeIndex
            return (
              <button key={p.id} onClick={() => onSelect(i)}
                style={{
                  textAlign: 'start', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', padding: 0,
                  border: active ? '3px solid #F59E0B' : '3px solid transparent',
                  background: bg.image ? `url(${bg.image}) center/cover` : bg.css,
                  minHeight: 130, position: 'relative', fontFamily: 'inherit',
                  boxShadow: active ? '0 0 0 2px rgba(245,158,11,0.3), 0 8px 20px rgba(0,0,0,0.4)' : '0 4px 14px rgba(0,0,0,0.3)',
                }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.8), transparent 55%)' }} />
                <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '10px 12px' }}>
                  <span style={{ fontSize: '0.62rem', marginBottom: 4 }}>{tpl.badge}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {isAr ? p.title_ar : (p.title_en || p.title_ar)}
                  </span>
                  {active && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', color: '#F59E0B', fontWeight: 800, marginTop: 6 }}>
                      ● {isAr ? 'الصفحة الحالية' : 'Current page'}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function MagazinePage() {
  const { isGeneralAdmin } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  // حصري للأدمن العام حالياً — لاحقاً ممكن نفتحها لحسابات ثانية عبر قسم "مجلة NW"
  const canEdit = isGeneralAdmin

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('view') // view | manage
  const [index, setIndex] = useState(0)
  const [anim, setAnim] = useState('') // 'next' | 'prev' | ''
  const [showSidebar, setShowSidebar] = useState(false)

  async function load() {
    setLoading(true)
    let q = supabase.from('magazine_posts').select('*').order('created_at', { ascending: false })
    if (!canEdit) q = q.eq('is_published', true)
    const { data } = await q
    const rows = data || []
    const allIds = [...new Set(rows.flatMap(p => p.employee_ids || []))]
    let peopleMap = {}
    if (allIds.length) {
      const { data: people } = await supabase.from('users').select('id, full_name_ar, station:station_id(name_ar, name_en)').in('id', allIds)
      peopleMap = Object.fromEntries((people || []).map(p => [p.id, p]))
    }
    setPosts(rows.map(p => ({ ...p, employees: (p.employee_ids || []).map(id => peopleMap[id]).filter(Boolean) })))
    setIndex(0)
    setLoading(false)
  }
  useEffect(() => { load() }, [canEdit])

  function go(delta) {
    setIndex(i => {
      const next = i + delta
      if (next < 0 || next >= posts.length) return i
      setAnim(delta > 0 ? 'next' : 'prev')
      setTimeout(() => setAnim(''), 380)
      return next
    })
  }

  // سحب باللمس — يمين/يسار يقلب الصفحة
  const touchX = useRef(null)
  function onTouchStart(e) { touchX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    if (Math.abs(dx) > 50) go(isAr ? (dx > 0 ? 1 : -1) : (dx > 0 ? -1 : 1))
    touchX.current = null
  }

  const post = posts[index]
  const tpl = TEMPLATES[post?.template] ?? TEMPLATES.announcement
  const font = FONTS[post?.font] ?? FONTS.default
  const bg = post ? bgFor(post) : null

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{ minHeight: 'calc(100vh - 108px)', background: '#0B1220', padding: '28px 16px' }}>
      <div style={{ maxWidth: mode === 'manage' ? 1200 : 720, margin: '0 auto', transition: 'max-width 0.2s' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#fff', letterSpacing: '0.01em' }}>
              {isAr ? '📖 مجلة NW' : '📖 NW Magazine'}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
              {isAr ? 'إعلانات، تعاميم، وموظفون متميزون' : 'Announcements, circulars & spotlights'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {mode === 'view' && posts.length > 0 && (
              <button onClick={() => setShowSidebar(true)}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {isAr ? '▤ كل الصفحات' : '▤ All pages'}
              </button>
            )}
            {canEdit && (
              <button onClick={() => setMode(m => m === 'view' ? 'manage' : 'view')}
                style={{ background: mode === 'manage' ? '#fff' : 'rgba(255,255,255,0.1)', color: mode === 'manage' ? '#111827' : '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {mode === 'manage' ? (isAr ? '✓ عرض القارئ' : '✓ Reader view') : (isAr ? '⚙ إدارة المحتوى' : '⚙ Manage content')}
              </button>
            )}
          </div>
        </div>

        {showSidebar && (
          <PageSidebar posts={posts} activeIndex={index} isAr={isAr}
            onSelect={(i) => { setIndex(i); setShowSidebar(false) }}
            onClose={() => setShowSidebar(false)} />
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>…</div>
        ) : mode === 'manage' ? (
          <ManagePanel posts={posts} isAr={isAr} onChanged={load} />
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', borderRadius: 16 }}>
            {isAr ? 'لا يوجد منشورات بعد' : 'No posts yet'}
          </div>
        ) : (
          <>
            <div
              onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
              style={{
                position: 'relative', borderRadius: 20, overflow: 'hidden', minHeight: 460,
                background: bg.image ? `url(${bg.image}) center/cover` : bg.css,
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                transform: anim === 'next' ? (isAr ? 'perspective(1200px) rotateY(-6deg) scale(0.98)' : 'perspective(1200px) rotateY(6deg) scale(0.98)')
                  : anim === 'prev' ? (isAr ? 'perspective(1200px) rotateY(6deg) scale(0.98)' : 'perspective(1200px) rotateY(-6deg) scale(0.98)') : 'none',
                transition: 'transform 0.38s cubic-bezier(.4,0,.2,1)',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, background: bg.image ? 'linear-gradient(0deg, rgba(0,0,0,0.8), rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.35))' : 'linear-gradient(0deg, rgba(0,0,0,0.35), transparent 45%)' }} />
              {/* مناطق اللمس/الضغط — يمين ويسار */}
              <button aria-label="prev" onClick={() => go(isAr ? 1 : -1)} style={{ position: 'absolute', inset: '0 50% 0 0', background: 'none', border: 'none', cursor: index > 0 || isAr ? 'pointer' : 'default', zIndex: 1 }} />
              <button aria-label="next" onClick={() => go(isAr ? -1 : 1)} style={{ position: 'absolute', inset: '0 0 0 50%', background: 'none', border: 'none', cursor: 'pointer', zIndex: 1 }} />

              <div style={{ position: 'relative', zIndex: 2, padding: '28px 26px 24px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(4px)', padding: '4px 12px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, color: '#fff', marginBottom: 14, border: '1px solid rgba(255,255,255,0.2)' }}>
                  <span>{tpl.badge}</span>
                  <span>{isAr ? tpl.ar : tpl.en}</span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800, color: '#fff', lineHeight: 1.3, fontFamily: font.family, textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
                  {isAr ? post.title_ar : (post.title_en || post.title_ar)}
                </h2>
                {post.employees?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                    {post.employees.map((e, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: tpl.badge ? '#F59E0B' : '#fff', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{e.full_name_ar}</span>
                        {e.station && (
                          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
                            {isAr ? e.station.name_ar : (e.station.name_en || e.station.name_ar)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {post.template === 'circular' && post.circular_pdf_url && (
                  <a href={post.circular_pdf_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '10px 16px', color: '#fff', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 }}>
                    <span>📄</span>
                    <span>{isAr ? 'فتح ملف التعميم (PDF)' : 'Open circular PDF'}</span>
                  </a>
                )}
                {(isAr ? post.body_ar : (post.body_en || post.body_ar)) && (
                  <p style={{ margin: '12px 0 0', fontSize: '0.92rem', color: 'rgba(255,255,255,0.88)', lineHeight: 1.75, whiteSpace: 'pre-line', fontFamily: font.family }}>
                    {isAr ? post.body_ar : (post.body_en || post.body_ar)}
                  </p>
                )}
                {post.template === 'circular' && post.closing_ar && (
                  <p style={{ margin: '14px 0 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.88)', lineHeight: 1.75, whiteSpace: 'pre-line', fontFamily: font.family }}>
                    {post.closing_ar}
                  </p>
                )}
                {post.template === 'circular' && post.signer_name && (
                  <p style={{ margin: '18px 0 0', fontSize: '0.85rem', color: '#fff', fontWeight: 700 }}>
                    {post.signer_name}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)', fontFamily: MONO }}>
                    {new Date(post.created_at).toLocaleString(isAr ? 'ar-SA' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  {!post.is_published && (
                    <span style={{ fontSize: '0.65rem', color: '#FCA5A5', fontWeight: 700 }}>{isAr ? 'مسودة' : 'Draft'}</span>
                  )}
                </div>
              </div>
            </div>

            {/* مؤشر الصفحات */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button onClick={() => go(isAr ? 1 : -1)} disabled={index >= posts.length - 1 && !isAr}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '1.2rem', padding: 4 }}>{isAr ? '›' : '‹'}</button>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontFamily: MONO, minWidth: 50, textAlign: 'center' }}>
                {index + 1} / {posts.length}
              </span>
              <button onClick={() => go(isAr ? -1 : 1)} disabled={index >= posts.length - 1}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '1.2rem', padding: 4 }}>{isAr ? '‹' : '›'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ManagePanel({ posts, isAr, onChanged }) {
  const [editing, setEditing] = useState(null) // post object | 'new' | null
  const [deleting, setDeleting] = useState(null)

  if (editing) {
    return <PostForm post={editing === 'new' ? null : editing} isAr={isAr}
      onCancel={() => setEditing(null)}
      onSaved={() => { setEditing(null); onChanged() }} />
  }

  async function doDelete(id) {
    await supabase.from('magazine_posts').delete().eq('id', id)
    setDeleting(null)
    onChanged()
  }

  return (
    <div>
      <button onClick={() => setEditing('new')}
        style={{ background: '#5B5BD6', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', marginBottom: 16, fontFamily: 'inherit' }}>
        + {isAr ? 'منشور جديد' : 'New post'}
      </button>
      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden' }}>
        {posts.length === 0 ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: '0.85rem' }}>{isAr ? 'لا يوجد منشورات' : 'No posts'}</p>
        ) : posts.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < posts.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
            <span style={{ fontSize: '1.1rem' }}>{TEMPLATES[p.template]?.badge ?? '📄'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>{p.title_ar}</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#9CA3AF' }}>
                {new Date(p.created_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')} · {p.is_published ? (isAr ? 'منشور' : 'Published') : (isAr ? 'مسودة' : 'Draft')}
              </p>
            </div>
            <button onClick={() => setEditing(p)} style={{ background: '#F3F4F6', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>{isAr ? 'تعديل' : 'Edit'}</button>
            {deleting === p.id ? (
              <>
                <button onClick={() => doDelete(p.id)} style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>{isAr ? 'تأكيد الحذف' : 'Confirm'}</button>
                <button onClick={() => setDeleting(null)} style={{ background: 'none', border: 'none', fontSize: '0.72rem', color: '#9CA3AF', cursor: 'pointer' }}>{isAr ? 'إلغاء' : 'Cancel'}</button>
              </>
            ) : (
              <button onClick={() => setDeleting(p.id)} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '0.72rem', cursor: 'pointer' }}>{isAr ? 'حذف' : 'Delete'}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function PostForm({ post, isAr, onCancel, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    title_ar: post?.title_ar ?? '', title_en: post?.title_en ?? '',
    body_ar: post?.body_ar ?? '', body_en: post?.body_en ?? '',
    template: post?.template ?? 'announcement', font: post?.font ?? 'default',
    background_image_url: post?.background_image_url ?? '', background_preset: post?.background_preset ?? 'navy',
    employee_ids: post?.employee_ids ?? [], is_published: post?.is_published ?? true,
    closing_ar: post?.closing_ar ?? '', signer_name: post?.signer_name ?? '',
    circular_pdf_url: post?.circular_pdf_url ?? '',
  })
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [candidates, setCandidates] = useState([])
  const autoTextRef = useRef({ title: '', body: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // موظفون ومشرفون متميزون — أي شخص وصل ٩٨٪+ بآخر تقييم له (وردية/محطة/موظفين)، مع عدد
  // الأشهر المتتالية اللي حافظ فيها على هذا المستوى
  useEffect(() => {
    if (form.template !== 'spotlight') return
    async function loadCandidates() {
      const [{ data: empRows }, { data: supRows }] = await Promise.all([
        supabase.from('employee_evaluations')
          .select('employee_id, total_score, eval_month, eval_year, employee:employee_id(full_name_ar, station:station_id(name_ar))'),
        supabase.from('supervisor_evaluations')
          .select('supervisor_id, total_score, eval_month, eval_year, supervisor:supervisor_id(full_name_ar, station:station_id(name_ar))'),
      ])
      const byPerson = {}
      ;(empRows || []).forEach(r => {
        if (!r.employee) return
        ;(byPerson[r.employee_id] ??= { id: r.employee_id, name: r.employee.full_name_ar, station: r.employee.station?.name_ar, rows: [] }).rows.push(r)
      })
      ;(supRows || []).forEach(r => {
        if (!r.supervisor) return
        ;(byPerson[r.supervisor_id] ??= { id: r.supervisor_id, name: r.supervisor.full_name_ar, station: r.supervisor.station?.name_ar, rows: [] }).rows.push(r)
      })
      const list = Object.values(byPerson).map(p => {
        const sorted = [...p.rows].sort((a, b) => b.eval_year - a.eval_year || b.eval_month - a.eval_month)
        return { id: p.id, name: p.name, station: p.station, streak: consecutiveStreak(sorted) }
      }).filter(p => p.streak > 0).sort((a, b) => b.streak - a.streak)
      setCandidates(list)
    }
    loadCandidates()
  }, [form.template])

  function personalizedText(c) {
    const hasStreak = c.streak >= 2
    return {
      title: `تكريم موظف الشهر: ${c.name}`,
      body: `نبارك للزميل ${c.name} حصوله على تقييم متميز هذا الشهر، تقديراً لجهوده والتزامه المتواصل.${hasStreak ? ` هذا هو ${ordinalMonthAr(c.streak)} له.` : ''} نتمنى له دوام التوفيق والتميز.`,
    }
  }

  // موظف واحد: يعبّي العنوان/النص القابلين للتعديل مباشرة (منشور واحد).
  // أكثر من موظف: كل واحد ياخذ منشوره المستقل بنص مخصص له تلقائياً عند الحفظ —
  // ما نعبّي حقول نص مشتركة لأنها ما راح تُستخدم
  function afterSelectionChange(ids) {
    if (ids.length === 1) {
      const { title, body } = personalizedText(candidates.find(c => c.id === ids[0]))
      setForm(f => ({
        ...f,
        title_ar: (!f.title_ar.trim() || f.title_ar === autoTextRef.current.title) ? title : f.title_ar,
        body_ar: (!f.body_ar.trim() || f.body_ar === autoTextRef.current.body) ? body : f.body_ar,
      }))
      autoTextRef.current = { title, body }
    } else {
      setForm(f => ({
        ...f,
        title_ar: f.title_ar === autoTextRef.current.title ? '' : f.title_ar,
        body_ar: f.body_ar === autoTextRef.current.body ? '' : f.body_ar,
      }))
      autoTextRef.current = { title: '', body: '' }
    }
  }

  function toggleCandidate(cand) {
    const has = form.employee_ids.includes(cand.id)
    const next = has ? form.employee_ids.filter(id => id !== cand.id) : [...form.employee_ids, cand.id]
    set('employee_ids', next)
    afterSelectionChange(next)
  }

  function selectAllCandidates() {
    const next = form.employee_ids.length === candidates.length ? [] : candidates.map(c => c.id)
    set('employee_ids', next)
    afterSelectionChange(next)
  }

  // تغيير القالب بعيداً عن "موظف متميز" يمسح البيانات المولّدة تلقائياً بدل ما يحتاج يمسحها يدوياً
  function changeTemplate(key) {
    if (key !== 'spotlight' && form.template === 'spotlight' && form.employee_ids.length > 0) {
      setForm(f => ({ ...f, template: key, employee_ids: [], title_ar: '', title_en: '', body_ar: '', body_en: '' }))
      autoTextRef.current = { title: '', body: '' }
    } else {
      set('template', key)
    }
  }

  async function handleImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setErr('')
    try {
      const url = await uploadMagazineImage(file)
      set('background_image_url', url)
    } catch (e2) {
      setErr(e2.message)
    }
    setUploading(false)
  }

  async function handlePdf(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPdf(true); setErr('')
    try {
      const url = await uploadMagazinePdf(file)
      set('circular_pdf_url', url)
    } catch (e2) {
      setErr(e2.message)
    }
    setUploadingPdf(false)
  }

  async function handleSave() {
    // أكثر من موظف بقالب "موظف متميز" (منشور جديد) — كل واحد ياخذ صفحة/منشور مستقل
    // بنص مخصص له، بدل ما يتكدسوا كلهم بمنشور واحد
    if (!post && form.template === 'spotlight' && form.employee_ids.length > 1) {
      setSaving(true); setErr('')
      const picked = candidates.filter(c => form.employee_ids.includes(c.id))
      const payloads = picked.map(c => {
        const { title, body } = personalizedText(c)
        return {
          title_ar: title, title_en: '', body_ar: body, body_en: '',
          template: 'spotlight', font: form.font,
          background_image_url: form.background_image_url, background_preset: form.background_preset,
          employee_ids: [c.id], is_published: form.is_published, created_by: profile?.id,
        }
      })
      const { error } = await supabase.from('magazine_posts').insert(payloads)
      setSaving(false)
      if (error) { setErr(error.message); return }
      onSaved()
      return
    }
    const circularHasPdf = form.template === 'circular' && !!form.circular_pdf_url
    if (!form.title_ar.trim() || (!circularHasPdf && !form.body_ar.trim())) {
      setErr(isAr ? 'العنوان مطلوب دائماً، والنص مطلوب إلا إذا رفعت ملف PDF' : 'Title is always required; body is required unless a PDF is attached')
      return
    }
    setSaving(true); setErr('')
    const payload = { ...form, created_by: profile?.id }
    const { error } = post
      ? await supabase.from('magazine_posts').update(payload).eq('id', post.id)
      : await supabase.from('magazine_posts').insert(payload)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const isBulkSpotlight = !post && form.template === 'spotlight' && form.employee_ids.length > 1
  const previewBg = form.background_image_url ? `url(${form.background_image_url}) center/cover`
    : (PRESET_BACKGROUNDS.find(b => b.key === form.background_preset)?.css ?? TEMPLATES[form.template].bg)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, alignItems: 'start' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#111827' }}>
          {post ? (isAr ? 'تعديل منشور' : 'Edit post') : (isAr ? 'منشور جديد' : 'New post')}
        </p>

        <SectionCard title={isAr ? 'القالب' : 'Template'}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {TEMPLATE_ORDER.map(key => (
              <button key={key} type="button" onClick={() => changeTemplate(key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 6px', borderRadius: 10,
                  border: `2px solid ${form.template === key ? '#5B5BD6' : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <div style={{ width: '100%', height: 34, borderRadius: 7, background: TEMPLATES[key].bg }} />
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#374151' }}>{TEMPLATES[key].badge} {isAr ? TEMPLATES[key].ar : TEMPLATES[key].en}</span>
              </button>
            ))}
          </div>

          {form.template === 'spotlight' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#4B5563' }}>
                  {isAr ? 'المتميزون حالياً (موظفون ومشرفون، ٩٨٪+)' : 'Currently outstanding (staff & supervisors, 98%+)'}
                </p>
                {candidates.length > 0 && (
                  <button type="button" onClick={selectAllCandidates} style={{ fontSize: '0.68rem', color: '#5B5BD6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                    {form.employee_ids.length === candidates.length ? (isAr ? 'إلغاء الكل' : 'Clear all') : (isAr ? 'تحديد الكل' : 'Select all')}
                  </button>
                )}
              </div>
              {candidates.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#9CA3AF' }}>{isAr ? 'لا يوجد أحد بهذا المستوى حالياً' : 'No one at this level right now'}</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {candidates.map(c => {
                    const on = form.employee_ids.includes(c.id)
                    return (
                      <button key={c.id} type="button" onClick={() => toggleCandidate(c)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999,
                          border: `1.5px solid ${on ? '#B45309' : '#E5E7EB'}`,
                          background: on ? '#FFFBEB' : '#fff',
                          cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, color: '#374151',
                        }}>
                        {on ? '✓' : '⭐'} {c.name}
                        {c.station ? <span style={{ color: '#9CA3AF', fontWeight: 500 }}> · {c.station}</span> : null}
                        {c.streak >= 2 && <span style={{ color: '#B45309', fontWeight: 700 }}> · ×{c.streak}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {isBulkSpotlight ? (
          <SectionCard title={isAr ? 'المحتوى' : 'Content'}>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: '#92400E' }}>
              {isAr
                ? `سيُنشأ ${form.employee_ids.length} منشورات مستقلة — كل موظف/مشرف يأخذ صفحته الخاصة بنص تهنئة مخصص له تلقائياً (يذكر عدد أشهره المتتالية إن وُجد).`
                : `${form.employee_ids.length} separate posts will be created — each person gets their own page with an automatically personalized congratulation.`}
            </div>
          </SectionCard>
        ) : form.template === 'circular' ? (
          <SectionCard title={isAr ? 'عنوان الموضوع' : 'Subject title'}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label={isAr ? 'عنوان الموضوع (عربي) *' : 'Subject title (Arabic) *'}>
                <input style={inp} value={form.title_ar} onChange={e => set('title_ar', e.target.value)} />
              </Field>
              <Field label={isAr ? 'عنوان الموضوع (إنجليزي)' : 'Subject title (English)'}>
                <input style={inp} value={form.title_en} onChange={e => set('title_en', e.target.value)} dir="ltr" />
              </Field>
            </div>
          </SectionCard>
        ) : (
          <SectionCard title={isAr ? 'المحتوى' : 'Content'}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label={isAr ? 'العنوان (عربي) *' : 'Title (Arabic) *'}>
                <input style={inp} value={form.title_ar} onChange={e => set('title_ar', e.target.value)} />
              </Field>
              <Field label={isAr ? 'العنوان (إنجليزي)' : 'Title (English)'}>
                <input style={inp} value={form.title_en} onChange={e => set('title_en', e.target.value)} dir="ltr" />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label={isAr ? 'النص (عربي) *' : 'Body (Arabic) *'}>
                <textarea style={{ ...inp, minHeight: 100, resize: 'vertical' }} value={form.body_ar} onChange={e => set('body_ar', e.target.value)} />
              </Field>
              <Field label={isAr ? 'النص (إنجليزي)' : 'Body (English)'}>
                <textarea style={{ ...inp, minHeight: 100, resize: 'vertical' }} value={form.body_en} onChange={e => set('body_en', e.target.value)} dir="ltr" />
              </Field>
            </div>
          </SectionCard>
        )}

        <SectionCard title={isAr ? 'المظهر' : 'Appearance'}>
          <Field label={isAr ? 'خلفية جاهزة' : 'Preset background'}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {PRESET_BACKGROUNDS.map(b => (
                <button key={b.key} type="button" onClick={() => { set('background_preset', b.key); set('background_image_url', '') }}
                  title={isAr ? b.ar : b.en}
                  style={{ height: 38, borderRadius: 8, background: b.css, border: `2px solid ${!form.background_image_url && form.background_preset === b.key ? '#111827' : 'transparent'}`, cursor: 'pointer' }} />
              ))}
            </div>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={isAr ? 'أو ارفع صورة خاصة' : 'Or upload your own image'}>
              <input type="file" accept="image/*" onChange={handleImage} style={{ fontSize: '0.72rem' }} />
              {uploading && <p style={{ margin: '4px 0 0', fontSize: '0.66rem', color: '#9CA3AF' }}>{isAr ? 'جارٍ الرفع...' : 'Uploading...'}</p>}
              {form.background_image_url && !uploading && (
                <button type="button" onClick={() => set('background_image_url', '')} style={{ marginTop: 4, fontSize: '0.66rem', color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>{isAr ? '✕ إزالة الصورة' : '✕ Remove image'}</button>
              )}
            </Field>
            <Field label={isAr ? 'الخط' : 'Font'}>
              <select style={inp} value={form.font} onChange={e => set('font', e.target.value)}>
                {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{isAr ? f.ar : f.en}</option>)}
              </select>
            </Field>
          </div>
        </SectionCard>

        {form.template === 'circular' && (
          <SectionCard title={isAr ? 'محتوى التعميم' : 'Circular content'}>
            <Field label={isAr ? 'ارفع التعميم كملف PDF (يُعرض كمحتوى رئيسي)' : 'Upload the circular as a PDF (shown as the main content)'}>
              <input type="file" accept="application/pdf" onChange={handlePdf} style={{ fontSize: '0.72rem' }} />
              {uploadingPdf && <p style={{ margin: '4px 0 0', fontSize: '0.66rem', color: '#9CA3AF' }}>{isAr ? 'جارٍ الرفع...' : 'Uploading...'}</p>}
              {form.circular_pdf_url && !uploadingPdf && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <a href={form.circular_pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: '#5B5BD6', fontWeight: 700 }}>{isAr ? '📄 عرض الملف المرفوع' : '📄 View uploaded file'}</a>
                  <button type="button" onClick={() => set('circular_pdf_url', '')} style={{ fontSize: '0.66rem', color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>{isAr ? '✕ إزالة' : '✕ Remove'}</button>
                </div>
              )}
            </Field>

            <p style={{ margin: 0, fontSize: '0.7rem', color: '#9CA3AF' }}>
              {isAr ? 'الحقول التالية اختيارية وتُعرض تحت ملف الـ PDF إن رفعته (أو بديلاً عنه إن ما رفعت ملف):' : 'The fields below are optional and appear under the PDF if uploaded (or as a substitute if you skip the PDF):'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label={isAr ? `الموضوع (عربي)${form.circular_pdf_url ? '' : ' *'}` : `Body (Arabic)${form.circular_pdf_url ? '' : ' *'}`}>
                <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={form.body_ar} onChange={e => set('body_ar', e.target.value)} />
              </Field>
              <Field label={isAr ? 'الموضوع (إنجليزي)' : 'Body (English)'}>
                <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={form.body_en} onChange={e => set('body_en', e.target.value)} dir="ltr" />
              </Field>
            </div>
            <Field label={isAr ? 'الخاتمة' : 'Closing'}>
              <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={form.closing_ar} onChange={e => set('closing_ar', e.target.value)}
                placeholder={isAr ? 'مثال: وتفضلوا بقبول فائق الاحترام والتقدير' : ''} />
            </Field>
            <Field label={isAr ? 'الاسم (اختياري — إن تُرك فارغاً لا يظهر)' : 'Signer name (optional — hidden if empty)'}>
              <input style={inp} value={form.signer_name} onChange={e => set('signer_name', e.target.value)} />
            </Field>
          </SectionCard>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_published} onChange={e => set('is_published', e.target.checked)} />
          {isAr ? 'منشور (يظهر للجميع الآن)' : 'Published (visible to everyone now)'}
        </label>

        {err && <p style={{ margin: 0, fontSize: '0.78rem', color: '#DC2626' }}>⚠ {err}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving || uploading}
            style={{ background: '#5B5BD6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving
              ? (isAr ? 'جارٍ الحفظ...' : 'Saving...')
              : isBulkSpotlight
                ? (isAr ? `إنشاء ${form.employee_ids.length} منشورات` : `Create ${form.employee_ids.length} posts`)
                : (isAr ? 'حفظ' : 'Save')}
          </button>
          <button onClick={onCancel} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>

      {/* معاينة حية */}
      <div style={{ position: 'sticky', top: 16 }}>
        <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>
          {isBulkSpotlight ? (isAr ? `معاينة (${form.employee_ids.length} صفحات)` : `Preview (${form.employee_ids.length} pages)`) : (isAr ? 'معاينة' : 'Preview')}
        </p>
        {isBulkSpotlight ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {candidates.filter(c => form.employee_ids.includes(c.id)).map(c => {
              const { title, body } = personalizedText(c)
              return (
                <div key={c.id} style={{ borderRadius: 14, overflow: 'hidden', background: previewBg, boxShadow: '0 10px 24px rgba(0,0,0,0.35)', position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 0, background: form.background_image_url ? 'linear-gradient(0deg, rgba(0,0,0,0.8), rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.35))' : 'linear-gradient(0deg, rgba(0,0,0,0.35), transparent 45%)' }} />
                  <div style={{ position: 'relative', padding: '16px 16px 14px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#fff' }}>{title}</h4>
                    <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>{body}</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ borderRadius: 16, overflow: 'hidden', minHeight: 340, background: previewBg, boxShadow: '0 16px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: form.background_image_url ? 'linear-gradient(0deg, rgba(0,0,0,0.8), rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.35))' : 'linear-gradient(0deg, rgba(0,0,0,0.35), transparent 45%)' }} />
            <div style={{ position: 'relative', padding: '22px 20px 18px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.16)', padding: '3px 10px', borderRadius: 999, fontSize: '0.64rem', fontWeight: 700, color: '#fff', marginBottom: 10 }}>
                <span>{TEMPLATES[form.template].badge}</span><span>{isAr ? TEMPLATES[form.template].ar : TEMPLATES[form.template].en}</span>
              </div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff', lineHeight: 1.3, fontFamily: FONTS[form.font].family }}>
                {form.title_ar || (isAr ? 'عنوان المنشور' : 'Post title')}
              </h3>
              {form.employee_ids.length === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {candidates.filter(c => form.employee_ids.includes(c.id)).map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#fff' }}>{c.name}</span>
                      {c.station && <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.55)' }}>{c.station}</span>}
                    </div>
                  ))}
                </div>
              )}
              {form.template === 'circular' && form.circular_pdf_url && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>
                  📄 {isAr ? 'ملف PDF مرفق' : 'PDF attached'}
                </div>
              )}
              {(form.body_ar || !(form.template === 'circular' && form.circular_pdf_url)) && (
                <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, whiteSpace: 'pre-line', fontFamily: FONTS[form.font].family }}>
                  {form.body_ar || (isAr ? 'نص المنشور يظهر هنا...' : 'Post body appears here...')}
                </p>
              )}
              {form.template === 'circular' && form.closing_ar && (
                <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, whiteSpace: 'pre-line', fontFamily: FONTS[form.font].family }}>
                  {form.closing_ar}
                </p>
              )}
              {form.template === 'circular' && form.signer_name && (
                <p style={{ margin: '14px 0 0', fontSize: '0.75rem', color: '#fff', fontWeight: 700 }}>
                  {form.signer_name}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
