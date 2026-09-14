import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

const MONO = "'IBM Plex Mono', monospace"

const TEMPLATES = {
  spotlight:    { ar: 'موظف متميز',   en: 'Employee Spotlight', bg: 'linear-gradient(135deg,#B45309,#78350F)', badge: '⭐' },
  announcement: { ar: 'إعلان',        en: 'Announcement',       bg: 'linear-gradient(135deg,#1C2B4A,#101B2E)', badge: '📢' },
  celebration:  { ar: 'تهنئة',        en: 'Celebration',        bg: 'linear-gradient(135deg,#5B5BD6,#9333EA)', badge: '🎉' },
  circular:     { ar: 'تعميم إداري',  en: 'Official Circular',  bg: 'linear-gradient(135deg,#374151,#111827)', badge: '📋' },
}
const TEMPLATE_ORDER = ['spotlight', 'announcement', 'celebration', 'circular']

const FONTS = {
  default: { ar: 'افتراضي', en: 'Default', family: 'inherit' },
  serif:   { ar: 'كلاسيكي', en: 'Classic', family: "Georgia, 'Traditional Arabic', serif" },
  mono:    { ar: 'مضغوط',   en: 'Compact', family: MONO },
}

async function uploadMagazineImage(file) {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('magazine-images').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('magazine-images').getPublicUrl(path)
  return data.publicUrl
}

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E5E7EB',
  fontSize: '0.85rem', fontFamily: 'inherit', color: '#111827', background: '#fff', boxSizing: 'border-box', outline: 'none',
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#4B5563', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

export default function MagazinePage() {
  const { profile, isGeneralAdmin } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const canEdit = isGeneralAdmin || profile?.allowed_modules === null || (profile?.allowed_modules ?? []).includes('magazine')

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('view') // view | manage
  const [index, setIndex] = useState(0)
  const [anim, setAnim] = useState('') // 'next' | 'prev' | ''

  async function load() {
    setLoading(true)
    let q = supabase.from('magazine_posts').select('*').order('created_at', { ascending: false })
    if (!canEdit) q = q.eq('is_published', true)
    const { data } = await q
    setPosts(data || [])
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

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{ minHeight: 'calc(100vh - 108px)', background: '#0B1220', padding: '28px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#fff', letterSpacing: '0.01em' }}>
              {isAr ? '📖 مجلة NW' : '📖 NW Magazine'}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
              {isAr ? 'إعلانات، تعاميم، وموظفون متميزون' : 'Announcements, circulars & spotlights'}
            </p>
          </div>
          {canEdit && (
            <button onClick={() => setMode(m => m === 'view' ? 'manage' : 'view')}
              style={{ background: mode === 'manage' ? '#fff' : 'rgba(255,255,255,0.1)', color: mode === 'manage' ? '#111827' : '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {mode === 'manage' ? (isAr ? '✓ عرض القارئ' : '✓ Reader view') : (isAr ? '⚙ إدارة المحتوى' : '⚙ Manage content')}
            </button>
          )}
        </div>

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
                position: 'relative', borderRadius: 20, overflow: 'hidden', minHeight: 440,
                background: post.background_image_url ? `url(${post.background_image_url}) center/cover` : tpl.bg,
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                transform: anim === 'next' ? (isAr ? 'perspective(1200px) rotateY(-6deg) scale(0.98)' : 'perspective(1200px) rotateY(6deg) scale(0.98)')
                  : anim === 'prev' ? (isAr ? 'perspective(1200px) rotateY(6deg) scale(0.98)' : 'perspective(1200px) rotateY(-6deg) scale(0.98)') : 'none',
                transition: 'transform 0.38s cubic-bezier(.4,0,.2,1)',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              {post.background_image_url && (
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.78), rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.35))' }} />
              )}
              {/* مناطق اللمس/الضغط — يمين ويسار */}
              <button aria-label="prev" onClick={() => go(isAr ? 1 : -1)} style={{ position: 'absolute', inset: '0 50% 0 0', background: 'none', border: 'none', cursor: index > 0 || isAr ? 'pointer' : 'default', zIndex: 1 }} />
              <button aria-label="next" onClick={() => go(isAr ? -1 : 1)} style={{ position: 'absolute', inset: '0 0 0 50%', background: 'none', border: 'none', cursor: 'pointer', zIndex: 1 }} />

              <div style={{ position: 'relative', zIndex: 2, padding: '28px 26px 24px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', padding: '4px 12px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, color: '#fff', marginBottom: 14 }}>
                  <span>{tpl.badge}</span>
                  <span>{isAr ? tpl.ar : tpl.en}</span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1.3, fontFamily: font.family }}>
                  {isAr ? post.title_ar : (post.title_en || post.title_ar)}
                </h2>
                <p style={{ margin: '12px 0 0', fontSize: '0.92rem', color: 'rgba(255,255,255,0.88)', lineHeight: 1.75, whiteSpace: 'pre-line', fontFamily: font.family }}>
                  {isAr ? post.body_ar : (post.body_en || post.body_ar)}
                </p>
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
  const { profile } = useAuth()
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
    background_image_url: post?.background_image_url ?? '', is_published: post?.is_published ?? true,
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

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

  async function handleSave() {
    if (!form.title_ar.trim() || !form.body_ar.trim()) { setErr(isAr ? 'العنوان والنص بالعربي مطلوبين' : 'Arabic title and body are required'); return }
    setSaving(true); setErr('')
    const payload = { ...form, created_by: profile?.id }
    const { error } = post
      ? await supabase.from('magazine_posts').update(payload).eq('id', post.id)
      : await supabase.from('magazine_posts').insert(payload)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#111827' }}>
        {post ? (isAr ? 'تعديل منشور' : 'Edit post') : (isAr ? 'منشور جديد' : 'New post')}
      </p>

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
          <textarea style={{ ...inp, minHeight: 110, resize: 'vertical' }} value={form.body_ar} onChange={e => set('body_ar', e.target.value)} />
        </Field>
        <Field label={isAr ? 'النص (إنجليزي)' : 'Body (English)'}>
          <textarea style={{ ...inp, minHeight: 110, resize: 'vertical' }} value={form.body_en} onChange={e => set('body_en', e.target.value)} dir="ltr" />
        </Field>
      </div>

      <Field label={isAr ? 'القالب' : 'Template'}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TEMPLATE_ORDER.map(key => (
            <button key={key} type="button" onClick={() => set('template', key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
                border: `2px solid ${form.template === key ? '#5B5BD6' : '#E5E7EB'}`,
                background: form.template === key ? '#5B5BD608' : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, color: '#111827',
              }}>
              <span>{TEMPLATES[key].badge}</span>
              <span>{isAr ? TEMPLATES[key].ar : TEMPLATES[key].en}</span>
            </button>
          ))}
        </div>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={isAr ? 'الخط' : 'Font'}>
          <select style={inp} value={form.font} onChange={e => set('font', e.target.value)}>
            {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{isAr ? f.ar : f.en}</option>)}
          </select>
        </Field>
        <Field label={isAr ? 'صورة الخلفية' : 'Background image'}>
          <input type="file" accept="image/*" onChange={handleImage} style={{ fontSize: '0.75rem' }} />
          {uploading && <p style={{ margin: '4px 0 0', fontSize: '0.68rem', color: '#9CA3AF' }}>{isAr ? 'جارٍ الرفع...' : 'Uploading...'}</p>}
          {form.background_image_url && !uploading && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={form.background_image_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />
              <button type="button" onClick={() => set('background_image_url', '')} style={{ fontSize: '0.68rem', color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>{isAr ? 'إزالة' : 'Remove'}</button>
            </div>
          )}
        </Field>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.is_published} onChange={e => set('is_published', e.target.checked)} />
        {isAr ? 'منشور (يظهر للجميع الآن)' : 'Published (visible to everyone now)'}
      </label>

      {err && <p style={{ margin: 0, fontSize: '0.78rem', color: '#DC2626' }}>⚠ {err}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={saving || uploading}
          style={{ background: '#5B5BD6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
        </button>
        <button onClick={onCancel} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {isAr ? 'إلغاء' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
