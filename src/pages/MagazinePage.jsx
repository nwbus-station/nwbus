import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

const MONO = "'IBM Plex Mono', monospace"
const STAR_THRESHOLD = 98

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
  default: { ar: 'افتراضي', en: 'Default', family: 'inherit' },
  serif:   { ar: 'كلاسيكي', en: 'Classic', family: "Georgia, 'Traditional Arabic', serif" },
  mono:    { ar: 'مضغوط',   en: 'Compact', family: MONO },
}

function bgFor(post) {
  if (post?.background_image_url) return { image: post.background_image_url }
  if (post?.background_preset) {
    const p = PRESET_BACKGROUNDS.find(b => b.key === post.background_preset)
    if (p) return { css: p.css }
  }
  return { css: (TEMPLATES[post?.template] ?? TEMPLATES.announcement).bg }
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

  async function load() {
    setLoading(true)
    let q = supabase.from('magazine_posts')
      .select('*, employee:employee_id(full_name_ar, station:station_id(name_ar, name_en))')
      .order('created_at', { ascending: false })
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
  const bg = post ? bgFor(post) : null
  const stationLabel = post?.employee?.station ? (isAr ? post.employee.station.name_ar : (post.employee.station.name_en || post.employee.station.name_ar)) : null

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
                {post.employee?.full_name_ar && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                    {post.employee.full_name_ar}{stationLabel ? ` · ${stationLabel}` : ''}
                  </p>
                )}
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
    employee_id: post?.employee_id ?? null, is_published: post?.is_published ?? true,
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [topEmployees, setTopEmployees] = useState([])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // الموظفون المتميزون — أي موظف حصل تقييم ٩٨٪ فأكثر من أي مصدر، الأحدث أول
  useEffect(() => {
    if (form.template !== 'spotlight') return
    supabase.from('employee_evaluations')
      .select('employee_id, total_score, created_at, employee:employee_id(full_name_ar, station:station_id(name_ar))')
      .gte('total_score', STAR_THRESHOLD)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const seen = new Set()
        const uniq = (data || []).filter(r => {
          if (!r.employee || seen.has(r.employee_id)) return false
          seen.add(r.employee_id)
          return true
        })
        setTopEmployees(uniq)
      })
  }, [form.template])

  function pickEmployee(emp) {
    set('employee_id', emp.employee_id)
    const stationName = emp.employee?.station?.name_ar
    if (!form.title_ar.trim()) set('title_ar', isAr ? `تكريم موظف الشهر: ${emp.employee.full_name_ar}` : `Employee of the Month: ${emp.employee.full_name_ar}`)
    if (!form.body_ar.trim()) set('body_ar',
      `نبارك للزميل ${emp.employee.full_name_ar}${stationName ? ` (${stationName})` : ''} حصوله على تقييم متميز هذا الشهر، تقديراً لجهوده والتزامه المتواصل. نتمنى له دوام التوفيق والتميز.`)
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
              <button key={key} type="button" onClick={() => set('template', key)}
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
              <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#4B5563' }}>
                {isAr ? 'اختر من الموظفين المتميزين (تقييم ٩٨٪+)' : 'Pick from top-rated employees (98%+)'}
              </p>
              {topEmployees.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#9CA3AF' }}>{isAr ? 'لا يوجد موظفون بهذا المستوى حالياً' : 'No employees at this level yet'}</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {topEmployees.map(e => (
                    <button key={e.employee_id} type="button" onClick={() => pickEmployee(e)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999,
                        border: `1.5px solid ${form.employee_id === e.employee_id ? '#B45309' : '#E5E7EB'}`,
                        background: form.employee_id === e.employee_id ? '#FFFBEB' : '#fff',
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, color: '#374151',
                      }}>
                      ⭐ {e.employee.full_name_ar}{e.employee?.station?.name_ar ? <span style={{ color: '#9CA3AF', fontWeight: 500 }}> · {e.employee.station.name_ar}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>

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

      {/* معاينة حية */}
      <div style={{ position: 'sticky', top: 16 }}>
        <p style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>{isAr ? 'معاينة' : 'Preview'}</p>
        <div style={{ borderRadius: 16, overflow: 'hidden', minHeight: 340, background: previewBg, boxShadow: '0 16px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: form.background_image_url ? 'linear-gradient(0deg, rgba(0,0,0,0.8), rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.35))' : 'linear-gradient(0deg, rgba(0,0,0,0.35), transparent 45%)' }} />
          <div style={{ position: 'relative', padding: '22px 20px 18px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.16)', padding: '3px 10px', borderRadius: 999, fontSize: '0.64rem', fontWeight: 700, color: '#fff', marginBottom: 10 }}>
              <span>{TEMPLATES[form.template].badge}</span><span>{isAr ? TEMPLATES[form.template].ar : TEMPLATES[form.template].en}</span>
            </div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff', lineHeight: 1.3, fontFamily: FONTS[form.font].family }}>
              {form.title_ar || (isAr ? 'عنوان المنشور' : 'Post title')}
            </h3>
            <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, whiteSpace: 'pre-line', fontFamily: FONTS[form.font].family }}>
              {form.body_ar || (isAr ? 'نص المنشور يظهر هنا...' : 'Post body appears here...')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
