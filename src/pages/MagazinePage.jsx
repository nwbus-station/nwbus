import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const MONO = "'IBM Plex Mono', monospace"
const STAR_THRESHOLD = 98
const ORDINALS_AR = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر']

// لمسة إضاءة خفيفة موحّدة فوق أي خلفية تدرّج — بريق أعلى-يسار وتعميق ظل أسفل-يمين،
// يعطي إحساس "لوحة فاخرة" بدل التدرّج المسطّح
const SHEEN = 'radial-gradient(1000px circle at 12% -15%, rgba(255,255,255,0.14), transparent 50%), radial-gradient(800px circle at 110% 120%, rgba(0,0,0,0.35), transparent 55%)'

// تأثيرات خلفية اختيارية — قابلة للتوسعة لاحقاً بإضافة مفاتيح جديدة هنا فقط
export const BG_EFFECTS = {
  shadow: { ar: 'بظل احترافي', en: 'With shadow', css: SHEEN },
  flat:   { ar: 'بدون ظل (مسطح)', en: 'Flat', css: '' },
}
const BG_EFFECT_ORDER = ['shadow', 'flat']

export const TEMPLATES = {
  spotlight:    { ar: 'موظف متميز',   en: 'Employee Spotlight', bg: 'linear-gradient(135deg,#8A6116 0%,#3B2A0F 55%,#17110A 100%)', accent: 'linear-gradient(90deg,#C99A32,#F1DDA0)', badge: '⭐' },
  announcement: { ar: 'إعلان',        en: 'Announcement',       bg: 'linear-gradient(135deg,#0F1F38 0%,#16233F 55%,#060B14 100%)', accent: 'linear-gradient(90deg,#3E63A8,#9FBBE6)', badge: '📢' },
  celebration:  { ar: 'تهنئة',        en: 'Celebration',        bg: 'linear-gradient(135deg,#3B2159 0%,#241536 55%,#100A1A 100%)', accent: 'linear-gradient(90deg,#8B5CF6,#D8CCFB)', badge: '🎉' },
  circular:     { ar: 'تعميم إداري',  en: 'Official Circular',  bg: 'linear-gradient(135deg,#2B323C 0%,#1A1F26 55%,#0C0F13 100%)', accent: 'linear-gradient(90deg,#94A3B8,#E9EEF4)', badge: '📋' },
}
export const TEMPLATE_ORDER = ['spotlight', 'announcement', 'celebration', 'circular']

// خلفيات جاهزة إضافية — تدرّجات مصمّمة بدل ما تحتاج ترفع صورة كل مرة
const PRESET_BACKGROUNDS = [
  { key: 'navy',      ar: 'كحلي رسمي',    en: 'Corporate Navy', css: 'linear-gradient(135deg,#0C1B32 0%,#152544 55%,#050A14 100%)' },
  { key: 'gold',      ar: 'ذهبي فاخر',    en: 'Elegant Gold',   css: 'linear-gradient(135deg,#6B4210 0%,#8A5A12 55%,#241505 100%)' },
  { key: 'emerald',   ar: 'زمردي',        en: 'Emerald',        css: 'linear-gradient(135deg,#093528 0%,#0F4D3A 55%,#041712 100%)' },
  { key: 'violet',    ar: 'بنفسجي فاخر',   en: 'Deep Violet',    css: 'linear-gradient(135deg,#2F1C52 0%,#452A72 55%,#140B28 100%)' },
  { key: 'crimson',   ar: 'عنّابي',        en: 'Crimson',        css: 'linear-gradient(135deg,#3A0D10 0%,#5C1319 55%,#170506 100%)' },
  { key: 'slate',     ar: 'رمادي إداري',   en: 'Formal Slate',   css: 'linear-gradient(135deg,#1B232E 0%,#28323F 55%,#0A0E13 100%)' },
  { key: 'teal',      ar: 'فيروزي',        en: 'Teal',           css: 'linear-gradient(135deg,#083A37 0%,#0C534E 55%,#031715 100%)' },
  { key: 'sunset',    ar: 'كهرماني',       en: 'Amber',          css: 'linear-gradient(135deg,#5A2A0C 0%,#7A3C12 55%,#241004 100%)' },
]

const FONTS = {
  default: { ar: 'افتراضي',    en: 'Default',        family: 'inherit' },
  tajawal: { ar: 'عصري',       en: 'Modern',          family: "'Tajawal', sans-serif" },
  amiri:   { ar: 'رسمي أنيق',  en: 'Elegant Formal',  family: "'Amiri', serif" },
  lalezar: { ar: 'احتفالي',    en: 'Festive',         family: "'Lalezar', cursive" },
  serif:   { ar: 'كلاسيكي',    en: 'Classic',         family: "Georgia, 'Traditional Arabic', serif" },
  mono:    { ar: 'مضغوط',      en: 'Compact',         family: MONO },
}

// القوالب اللي يمكن ترفق لها ملف PDF كمحتوى رئيسي بدل النص (كل شي إلا "موظف متميز")
const PDF_TEMPLATES = ['announcement', 'celebration', 'circular']

export function bgFor(post) {
  if (post?.background_image_url) return { image: post.background_image_url }
  let gradient
  if (post?.background_preset) {
    const p = PRESET_BACKGROUNDS.find(b => b.key === post.background_preset)
    gradient = p?.css
  }
  gradient ??= (TEMPLATES[post?.template] ?? TEMPLATES.announcement).bg
  const effect = BG_EFFECTS[post?.bg_effect]?.css ?? SHEEN
  return { css: effect ? `${effect}, ${gradient}` : gradient }
}

// اسم القالب المعروض — يسمح بتسمية مخصصة (مثلاً "تعزية" بدل "تهنئة") بدون إضافة قالب جديد
export function templateLabel(post, isAr) {
  const tpl = TEMPLATES[post?.template] ?? TEMPLATES.announcement
  if (isAr && post?.label_ar) return post.label_ar
  return isAr ? tpl.ar : tpl.en
}

function ordinalMonthAr(n) { return `الشهر ${ORDINALS_AR[n] || n} على التوالي` }

// أنماط نص جاهزة لتكريم "موظف متميز" — الأدمن يختار الأسلوب اللي يناسب بدل نص واحد ثابت
const SPOTLIGHT_STYLES = [
  {
    key: 'classic', ar: 'كلاسيكي', en: 'Classic',
    gen: c => ({
      title: `تكريم موظف الشهر: ${c.name}`,
      body: `نبارك للزميل ${c.name} حصوله على تقييم متميز هذا الشهر، تقديراً لجهوده والتزامه المتواصل.${c.streak >= 2 ? ` هذا هو ${ordinalMonthAr(c.streak)} له.` : ''} نتمنى له دوام التوفيق والتميز.`,
    }),
  },
  {
    key: 'formal', ar: 'رسمي', en: 'Formal',
    gen: c => ({
      title: `تقدير وتكريم: ${c.name}`,
      body: `تتقدّم إدارة نورث وست باص بخالص الشكر والتقدير للزميل ${c.name} لتميّزه في الأداء وحصوله على أعلى تقييم هذا الشهر.${c.streak >= 2 ? ` وهذا إنجازه ${ordinalMonthAr(c.streak)}.` : ''} نتطلع لاستمرار هذا التميز.`,
    }),
  },
  {
    key: 'warm', ar: 'حماسي', en: 'Enthusiastic',
    gen: c => ({
      title: `تألق الشهر: ${c.name}`,
      body: `فخورون جداً بالزميل ${c.name}! أداء استثنائي وتفانٍ واضح جعله يتصدّر تقييم هذا الشهر.${c.streak >= 2 ? ` وهذه ${ordinalMonthAr(c.streak)} على التوالي — إنجاز رائع!` : ''} استمر بهذا التألق!`,
    }),
  },
  {
    key: 'motivational', ar: 'تحفيزي', en: 'Motivational',
    gen: c => ({
      title: `إنجاز الشهر: ${c.name}`,
      body: `تميّز الزميل ${c.name} هذا الشهر بتقييم استثنائي يعكس التزامه وحرصه على تقديم الأفضل دائماً.${c.streak >= 2 ? ` وهو يحافظ على هذا المستوى منذ ${ordinalMonthAr(c.streak)}.` : ''} نفخر بهذا الإنجاز في نورث وست باص.`,
    }),
  },
]

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

// يحوّل timestamptz المخزّن إلى صيغة input[type=datetime-local] (بتوقيت الجهاز المحلي)
function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// هل المنشور "حيّ" الآن — منشور، ووصل وقت بدايته (إن وُجد)، وما انتهى وقته (إن وُجد)
export function isPostLive(p, now = Date.now()) {
  if (!p.is_published) return false
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return false
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return false
  return true
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

function pad2(n) { return String(n).padStart(2, '0') }

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// منتقي تاريخ ووقت مبني بالكامل من قوائم اختيار (يوم/شهر/سنة/ساعة/دقيقة) بدل
// input[type=date|datetime-local] الأصلي — الحقل الأصلي يعرض عناصره الداخلية بصيغة
// نظام تشغيل/متصفح المستخدم، وعلى بعض الأنظمة العربية تظهر مشوّهة؛ القوائم المخصصة
// نصها ثابت نتحكم فيه بالكامل، وتضمن نظام ٢٤ ساعة دائماً
function DateTimeField({ value, onChange, isAr }) {
  const [datePart, timePart] = value ? value.split('T') : ['', '']
  const [y, mo, d] = datePart ? datePart.split('-').map(Number) : [null, null, null]
  const hh = pad2((timePart || '00:00').split(':')[0] || 0)
  let mm = Math.round(Number((timePart || '00:00').split(':')[1] || 0) / 5) * 5
  if (mm >= 60) mm = 0
  mm = pad2(mm)

  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 7 }, (_, i) => thisYear - 1 + i)
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
  const months = isAr ? AR_MONTHS : EN_MONTHS

  function emit(nextY, nextMo, nextD, nextH, nextM) {
    if (!nextY || !nextMo || !nextD) { onChange(''); return }
    onChange(`${nextY}-${pad2(nextMo)}-${pad2(nextD)}T${nextH}:${nextM}`)
  }

  const selStyle = { ...inp, padding: '9px 4px', textAlign: 'center' }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      <select dir="ltr" value={d ?? ''} onChange={e => emit(y, mo, Number(e.target.value), hh, mm)} style={{ ...selStyle, flex: '0 1 56px' }}>
        <option value="" disabled>{isAr ? 'يوم' : 'Day'}</option>
        {days.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select dir="ltr" value={mo ?? ''} onChange={e => emit(y, Number(e.target.value), d, hh, mm)} style={{ ...selStyle, flex: '1 1 90px', textAlign: 'start' }}>
        <option value="" disabled>{isAr ? 'شهر' : 'Month'}</option>
        {months.map((mLabel, i) => <option key={mLabel} value={i + 1}>{mLabel}</option>)}
      </select>
      <select dir="ltr" value={y ?? ''} onChange={e => emit(Number(e.target.value), mo, d, hh, mm)} style={{ ...selStyle, flex: '0 1 74px' }}>
        <option value="" disabled>{isAr ? 'سنة' : 'Year'}</option>
        {years.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select dir="ltr" value={hh} onChange={e => emit(y || new Date().getFullYear(), mo || new Date().getMonth() + 1, d || new Date().getDate(), e.target.value, mm)} style={{ ...selStyle, flex: '0 1 56px' }}>
        {Array.from({ length: 24 }, (_, i) => pad2(i)).map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span style={{ alignSelf: 'center', color: '#9CA3AF', fontWeight: 700 }}>:</span>
      <select dir="ltr" value={mm} onChange={e => emit(y || new Date().getFullYear(), mo || new Date().getMonth() + 1, d || new Date().getDate(), hh, e.target.value)} style={{ ...selStyle, flex: '0 1 56px' }}>
        {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(m => <option key={m} value={m}>{m}</option>)}
      </select>
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
  const location = useLocation()
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    let q = supabase.from('magazine_posts').select('*').order('created_at', { ascending: false })
    if (!canEdit) q = q.eq('is_published', true)
    const { data } = await q
    // غير الأدمن يشوف بس المنشورات اللي وصل وقت بدايتها وما انتهت — الأدمن يشوف كل شي
    // (مسودات ومجدولة ومنتهية) عشان يقدر يديرها
    const rows = canEdit ? (data || []) : (data || []).filter(p => isPostLive(p))
    const allIds = [...new Set(rows.flatMap(p => p.employee_ids || []))]
    let peopleMap = {}
    if (allIds.length) {
      const { data: people } = await supabase.from('users').select('id, full_name_ar, station:station_id(name_ar, name_en)').in('id', allIds)
      peopleMap = Object.fromEntries((people || []).map(p => [p.id, p]))
    }
    const finalRows = rows.map(p => ({ ...p, employees: (p.employee_ids || []).map(id => peopleMap[id]).filter(Boolean) }))
    setPosts(finalRows)
    // إذا وصلنا من بطاقة "مجلة NW" بالرئيسية بمنشور معيّن، نروح له مباشرة بدل أول واحد
    const targetId = location.state?.postId
    if (targetId) {
      const foundIdx = finalRows.findIndex(p => p.id === targetId)
      setIndex(foundIdx >= 0 ? foundIdx : 0)
      navigate(location.pathname, { replace: true, state: {} })
    } else {
      setIndex(0)
    }
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
            <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 9, fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>
              <span>📅</span>
              <span style={{ fontFamily: MONO, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Event</span>
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
              <div style={{ position: 'absolute', top: 0, insetInline: 0, height: 4, background: tpl.accent, zIndex: 2 }} />
              {/* مناطق اللمس/الضغط — يمين ويسار */}
              <button aria-label="prev" onClick={() => go(isAr ? 1 : -1)} style={{ position: 'absolute', inset: '0 50% 0 0', background: 'none', border: 'none', cursor: index > 0 || isAr ? 'pointer' : 'default', zIndex: 1 }} />
              <button aria-label="next" onClick={() => go(isAr ? -1 : 1)} style={{ position: 'absolute', inset: '0 0 0 50%', background: 'none', border: 'none', cursor: 'pointer', zIndex: 1 }} />

              <div style={{ position: 'relative', zIndex: 2, padding: '28px 26px 24px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(4px)', padding: '4px 12px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, color: '#fff', marginBottom: 14, border: '1px solid rgba(255,255,255,0.2)' }}>
                  <span>{tpl.badge}</span>
                  <span>{templateLabel(post, isAr)}</span>
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
                {PDF_TEMPLATES.includes(post.template) && post.pdf_url && (
                  <a href={post.pdf_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '10px 16px', color: '#fff', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 }}>
                    <span>📄</span>
                    <span>{isAr ? 'فتح الملف المرفق (PDF)' : 'Open attached PDF'}</span>
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
                  {!post.is_published ? (
                    <span style={{ fontSize: '0.65rem', color: '#FCA5A5', fontWeight: 700 }}>{isAr ? 'مسودة' : 'Draft'}</span>
                  ) : post.starts_at && new Date(post.starts_at) > new Date() ? (
                    <span style={{ fontSize: '0.65rem', color: '#93C5FD', fontWeight: 700 }}>{isAr ? '🕓 مجدول' : '🕓 Scheduled'}</span>
                  ) : post.ends_at && new Date(post.ends_at) < new Date() ? (
                    <span style={{ fontSize: '0.65rem', color: '#FCA5A5', fontWeight: 700 }}>{isAr ? '⏳ منتهي' : '⏳ Expired'}</span>
                  ) : null}
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
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkEditing, setBulkEditing] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkErr, setBulkErr] = useState('')

  if (editing) {
    return <PostForm post={editing === 'new' ? null : editing} isAr={isAr}
      onCancel={() => setEditing(null)}
      onSaved={() => { setEditing(null); onChanged() }} />
  }

  const selectedPosts = posts.filter(p => selectedIds.has(p.id))
  const sameTemplate = selectedPosts.length > 0 && new Set(selectedPosts.map(p => p.template)).size === 1

  if (bulkEditing) {
    return <BulkEditForm posts={selectedPosts} isAr={isAr}
      onCancel={() => setBulkEditing(false)}
      onSaved={() => { setBulkEditing(false); setSelectedIds(new Set()); setSelectMode(false); onChanged() }} />
  }

  async function doDelete(id) {
    await supabase.from('magazine_posts').delete().eq('id', id)
    setDeleting(null)
    onChanged()
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function doBulkDelete() {
    const { error } = await supabase.from('magazine_posts').delete().in('id', [...selectedIds])
    if (error) { setBulkErr(error.message); return }
    setSelectedIds(new Set()); setBulkDeleting(false); setSelectMode(false); setBulkErr('')
    onChanged()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setEditing('new')}
          style={{ background: '#5B5BD6', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + {isAr ? 'منشور جديد' : 'New post'}
        </button>
        <button onClick={() => { setSelectMode(m => !m); setSelectedIds(new Set()); setBulkDeleting(false); setBulkErr('') }}
          style={{ background: selectMode ? '#111827' : '#F3F4F6', color: selectMode ? '#fff' : '#374151', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {selectMode ? (isAr ? '✕ إلغاء التحديد' : '✕ Cancel selection') : (isAr ? '☑ تحديد متعدد' : '☑ Select multiple')}
        </button>

        {selectMode && selectedIds.size > 0 && (
          <>
            <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 700 }}>
              {isAr ? `${selectedIds.size} محدد` : `${selectedIds.size} selected`}
            </span>
            <button onClick={() => sameTemplate && setBulkEditing(true)} disabled={!sameTemplate}
              title={!sameTemplate ? (isAr ? 'اختر منشورات من نفس القالب فقط' : 'Select posts of the same template only') : ''}
              style={{ background: '#EEF0FF', color: '#5B5BD6', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: '0.76rem', fontWeight: 700, cursor: sameTemplate ? 'pointer' : 'not-allowed', opacity: sameTemplate ? 1 : 0.45, fontFamily: 'inherit' }}>
              ✎ {isAr ? 'تعديل جماعي' : 'Bulk edit'}
            </button>
            {bulkDeleting ? (
              <>
                <button onClick={doBulkDelete} style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {isAr ? `تأكيد حذف ${selectedIds.size}` : `Confirm delete ${selectedIds.size}`}
                </button>
                <button onClick={() => setBulkDeleting(false)} style={{ background: 'none', border: 'none', fontSize: '0.76rem', color: '#9CA3AF', cursor: 'pointer' }}>{isAr ? 'إلغاء' : 'Cancel'}</button>
              </>
            ) : (
              <button onClick={() => setBulkDeleting(true)} style={{ background: 'none', border: '1.5px solid #FCA5A5', color: '#DC2626', borderRadius: 8, padding: '7px 14px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                🗑 {isAr ? 'حذف المحدد' : 'Delete selected'}
              </button>
            )}
          </>
        )}
      </div>

      {!sameTemplate && selectedIds.size > 1 && (
        <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: '#B45309' }}>
          {isAr ? 'التعديل الجماعي متاح بس لما تختار منشورات من نفس القالب — الحذف الجماعي شغّال بأي مزيج' : 'Bulk edit only works when the selection is all one template — bulk delete works with any mix'}
        </p>
      )}
      {bulkErr && <p style={{ margin: '0 0 10px', fontSize: '0.76rem', color: '#DC2626' }}>⚠ {bulkErr}</p>}

      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden' }}>
        {posts.length === 0 ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: '0.85rem' }}>{isAr ? 'لا يوجد منشورات' : 'No posts'}</p>
        ) : posts.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < posts.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
            {selectMode && (
              <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
            )}
            <span style={{ fontSize: '1.1rem' }}>{TEMPLATES[p.template]?.badge ?? '📄'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>{p.title_ar}</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#9CA3AF' }}>
                {new Date(p.created_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')} · {
                  !p.is_published ? (isAr ? 'مسودة' : 'Draft')
                    : p.starts_at && new Date(p.starts_at) > new Date() ? (isAr ? '🕓 مجدول' : '🕓 Scheduled')
                    : p.ends_at && new Date(p.ends_at) < new Date() ? (isAr ? '⏳ منتهي' : '⏳ Expired')
                    : (isAr ? 'منشور' : 'Published')
                }
              </p>
            </div>
            {!selectMode && (
              <>
                <button onClick={() => setEditing(p)} style={{ background: '#F3F4F6', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>{isAr ? 'تعديل' : 'Edit'}</button>
                {deleting === p.id ? (
                  <>
                    <button onClick={() => doDelete(p.id)} style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>{isAr ? 'تأكيد الحذف' : 'Confirm'}</button>
                    <button onClick={() => setDeleting(null)} style={{ background: 'none', border: 'none', fontSize: '0.72rem', color: '#9CA3AF', cursor: 'pointer' }}>{isAr ? 'إلغاء' : 'Cancel'}</button>
                  </>
                ) : (
                  <button onClick={() => setDeleting(p.id)} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '0.72rem', cursor: 'pointer' }}>{isAr ? 'حذف' : 'Delete'}</button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// تعديل جماعي — بس لمنشورات من نفس القالب (شرط صريح). كل حقل له مفتاح تفعيل خاص
// بيه، فقط الحقول المفعّلة تنطبّق على كل المنشورات المحددة؛ الباقي يبقى كما هو
function BulkEditForm({ posts, isAr, onCancel, onSaved }) {
  const template = posts[0]?.template
  const [changeFont, setChangeFont] = useState(false)
  const [font, setFontVal] = useState('default')
  const [changeBg, setChangeBg] = useState(false)
  const [backgroundPreset, setBackgroundPreset] = useState('navy')
  const [changeEffect, setChangeEffect] = useState(false)
  const [bgEffect, setBgEffect] = useState('shadow')
  const [changeLabel, setChangeLabel] = useState(false)
  const [labelAr, setLabelAr] = useState('')
  const [changePublish, setChangePublish] = useState(false)
  const [isPublished, setIsPublished] = useState(true)
  const [changeSchedule, setChangeSchedule] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const anyChangeSelected = changeFont || changeBg || changeEffect || changeLabel || changePublish || changeSchedule

  async function handleSave() {
    if (!anyChangeSelected) { setErr(isAr ? 'فعّل حقل واحد على الأقل عشان تغيّره' : 'Enable at least one field to change'); return }
    if (changeSchedule && startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setErr(isAr ? 'وقت النهاية لازم يكون بعد وقت البداية' : 'End time must be after start time')
      return
    }
    const payload = {}
    if (changeFont) payload.font = font
    if (changeBg) { payload.background_preset = backgroundPreset; payload.background_image_url = '' }
    if (changeEffect) payload.bg_effect = bgEffect
    if (changeLabel) payload.label_ar = labelAr
    if (changePublish) payload.is_published = isPublished
    if (changeSchedule) {
      payload.starts_at = startsAt ? new Date(startsAt).toISOString() : null
      payload.ends_at = endsAt ? new Date(endsAt).toISOString() : null
    }
    setSaving(true); setErr('')
    const { error } = await supabase.from('magazine_posts').update(payload).in('id', posts.map(p => p.id))
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const row = { display: 'flex', alignItems: 'center', gap: 10 }
  const checkboxLabel = { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700, color: '#374151', cursor: 'pointer', minWidth: 150 }

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div>
        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#111827' }}>
          {isAr ? `تعديل جماعي — ${posts.length} منشورات` : `Bulk edit — ${posts.length} posts`}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: '#6B7280' }}>
          {TEMPLATES[template]?.badge} {isAr ? TEMPLATES[template]?.ar : TEMPLATES[template]?.en}
        </p>
      </div>
      <p style={{ margin: 0, fontSize: '0.72rem', color: '#9CA3AF' }}>
        {isAr ? 'فعّل فقط الحقول اللي تبي تغيّرها لكل المنشورات المحددة — الباقي يبقى كما هو لكل منشور' : 'Enable only the fields you want to change for all selected posts — everything else stays as-is per post'}
      </p>

      <div style={row}>
        <label style={checkboxLabel}><input type="checkbox" checked={changeFont} onChange={e => setChangeFont(e.target.checked)} /> {isAr ? 'الخط' : 'Font'}</label>
        {changeFont && (
          <select style={inp} value={font} onChange={e => setFontVal(e.target.value)}>
            {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{isAr ? f.ar : f.en}</option>)}
          </select>
        )}
      </div>

      <div style={row}>
        <label style={checkboxLabel}><input type="checkbox" checked={changeBg} onChange={e => setChangeBg(e.target.checked)} /> {isAr ? 'الخلفية الجاهزة' : 'Preset background'}</label>
        {changeBg && (
          <select style={inp} value={backgroundPreset} onChange={e => setBackgroundPreset(e.target.value)}>
            {PRESET_BACKGROUNDS.map(b => <option key={b.key} value={b.key}>{isAr ? b.ar : b.en}</option>)}
          </select>
        )}
      </div>

      <div style={row}>
        <label style={checkboxLabel}><input type="checkbox" checked={changeEffect} onChange={e => setChangeEffect(e.target.checked)} /> {isAr ? 'تأثير الخلفية' : 'Background effect'}</label>
        {changeEffect && (
          <div style={{ display: 'flex', gap: 6 }}>
            {BG_EFFECT_ORDER.map(key => (
              <button key={key} type="button" onClick={() => setBgEffect(key)}
                style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, border: `1.5px solid ${bgEffect === key ? '#5B5BD6' : '#E5E7EB'}`, background: bgEffect === key ? '#EEF0FF' : '#fff', color: '#374151' }}>
                {isAr ? BG_EFFECTS[key].ar : BG_EFFECTS[key].en}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={row}>
        <label style={checkboxLabel}><input type="checkbox" checked={changeLabel} onChange={e => setChangeLabel(e.target.checked)} /> {isAr ? 'تسمية القالب المخصصة' : 'Custom template label'}</label>
        {changeLabel && <input style={inp} value={labelAr} onChange={e => setLabelAr(e.target.value)} />}
      </div>

      <div style={row}>
        <label style={checkboxLabel}><input type="checkbox" checked={changePublish} onChange={e => setChangePublish(e.target.checked)} /> {isAr ? 'حالة النشر' : 'Publish status'}</label>
        {changePublish && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setIsPublished(true)} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, border: `1.5px solid ${isPublished ? '#5B5BD6' : '#E5E7EB'}`, background: isPublished ? '#EEF0FF' : '#fff', color: '#374151' }}>{isAr ? 'منشور' : 'Published'}</button>
            <button type="button" onClick={() => setIsPublished(false)} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, border: `1.5px solid ${!isPublished ? '#5B5BD6' : '#E5E7EB'}`, background: !isPublished ? '#EEF0FF' : '#fff', color: '#374151' }}>{isAr ? 'مسودة' : 'Draft'}</button>
          </div>
        )}
      </div>

      <div>
        <label style={checkboxLabel}><input type="checkbox" checked={changeSchedule} onChange={e => setChangeSchedule(e.target.checked)} /> {isAr ? 'جدولة العرض' : 'Display schedule'}</label>
        {changeSchedule && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            <Field label={isAr ? 'يبدأ في (٢٤ ساعة)' : 'Starts at (24h)'}>
              <DateTimeField value={startsAt} onChange={setStartsAt} isAr={isAr} />
            </Field>
            <Field label={isAr ? 'ينتهي في (٢٤ ساعة)' : 'Ends at (24h)'}>
              <DateTimeField value={endsAt} onChange={setEndsAt} isAr={isAr} />
            </Field>
          </div>
        )}
      </div>

      {err && <p style={{ margin: 0, fontSize: '0.78rem', color: '#DC2626' }}>⚠ {err}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ background: '#5B5BD6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? `تطبيق على ${posts.length}` : `Apply to ${posts.length}`)}
        </button>
        <button onClick={onCancel} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {isAr ? 'إلغاء' : 'Cancel'}
        </button>
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
    pdf_url: post?.pdf_url ?? '',
    starts_at: toLocalInputValue(post?.starts_at), ends_at: toLocalInputValue(post?.ends_at),
    label_ar: post?.label_ar ?? '', bg_effect: post?.bg_effect ?? 'shadow', text_style: 'classic',
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
    const style = SPOTLIGHT_STYLES.find(s => s.key === form.text_style) ?? SPOTLIGHT_STYLES[0]
    return style.gen(c)
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

  // تغيير نمط النص يستبدل العنوان/النص فوراً بالنمط الجديد — إجراء صريح من الأدمن
  // (اختيار نمط) فما فيه داعي لأي شرط "بس إذا ما عدّلته يدوياً"، نطبّقه مباشرة دايماً.
  // عند تعديل منشور قديم، الشخص قد ما يكون موجود بقائمة "المتميزين حالياً" (لو انتهت
  // فترة تميّزه) فما نلقاه بـ candidates — نرجع لاسمه المحفوظ بالمنشور نفسه كحل بديل
  function selectTextStyle(styleKey) {
    if (form.employee_ids.length === 1) {
      const targetId = form.employee_ids[0]
      const fromCandidates = candidates.find(cc => cc.id === targetId)
      const fromPost = post?.employees?.find(e => e.id === targetId)
      const c = fromCandidates ?? (fromPost ? { id: targetId, name: fromPost.full_name_ar, streak: 0 } : null)
      const style = SPOTLIGHT_STYLES.find(s => s.key === styleKey) ?? SPOTLIGHT_STYLES[0]
      if (c) {
        const { title, body } = style.gen(c)
        setForm(f => ({ ...f, text_style: styleKey, title_ar: title, body_ar: body }))
        autoTextRef.current = { title, body }
        return
      }
    }
    set('text_style', styleKey)
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
      set('pdf_url', url)
    } catch (e2) {
      setErr(e2.message)
    }
    setUploadingPdf(false)
  }

  async function handleSave() {
    // أكثر من موظف بقالب "موظف متميز" — كل واحد ياخذ صفحة/منشور مستقل بنص مخصص له،
    // بدل ما يتكدسوا كلهم بمنشور واحد. ينطبق على منشور جديد وعلى تعديل منشور موجود
    // (أول شخص مختار ياخذ نفس المنشور المعدَّل، والباقي يأخذون منشورات جديدة)
    if (form.template === 'spotlight' && form.employee_ids.length > 1) {
      setSaving(true); setErr('')
      const picked = candidates.filter(c => form.employee_ids.includes(c.id))
      const payloadFor = c => {
        const { title, body } = personalizedText(c)
        return {
          title_ar: title, title_en: '', body_ar: body, body_en: '',
          template: 'spotlight', font: form.font,
          background_image_url: form.background_image_url, background_preset: form.background_preset,
          bg_effect: form.bg_effect, label_ar: form.label_ar,
          starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
          ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
          employee_ids: [c.id], is_published: form.is_published, created_by: profile?.id,
        }
      }
      if (post) {
        const [first, ...rest] = picked
        const { error: updErr } = await supabase.from('magazine_posts').update(payloadFor(first)).eq('id', post.id)
        if (updErr) { setSaving(false); setErr(updErr.message); return }
        if (rest.length) {
          const { error: insErr } = await supabase.from('magazine_posts').insert(rest.map(payloadFor))
          if (insErr) { setSaving(false); setErr(insErr.message); return }
        }
      } else {
        const { error } = await supabase.from('magazine_posts').insert(picked.map(payloadFor))
        if (error) { setSaving(false); setErr(error.message); return }
      }
      setSaving(false)
      onSaved()
      return
    }
    const hasPdf = PDF_TEMPLATES.includes(form.template) && !!form.pdf_url
    if (!form.title_ar.trim() || (!hasPdf && !form.body_ar.trim())) {
      setErr(isAr ? 'العنوان مطلوب دائماً، والنص مطلوب إلا إذا رفعت ملف PDF' : 'Title is always required; body is required unless a PDF is attached')
      return
    }
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) {
      setErr(isAr ? 'وقت النهاية لازم يكون بعد وقت البداية' : 'End time must be after start time')
      return
    }
    setSaving(true); setErr('')
    const { text_style, ...formToSave } = form
    const payload = {
      ...formToSave,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      created_by: profile?.id,
    }
    const { error } = post
      ? await supabase.from('magazine_posts').update(payload).eq('id', post.id)
      : await supabase.from('magazine_posts').insert(payload)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const isBulkSpotlight = form.template === 'spotlight' && form.employee_ids.length > 1
  const previewGradient = PRESET_BACKGROUNDS.find(b => b.key === form.background_preset)?.css ?? TEMPLATES[form.template].bg
  const previewEffect = BG_EFFECTS[form.bg_effect]?.css ?? SHEEN
  const previewBg = form.background_image_url ? `url(${form.background_image_url}) center/cover`
    : (previewEffect ? `${previewEffect}, ${previewGradient}` : previewGradient)

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
              <div style={{ marginTop: 10 }}>
                <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#4B5563' }}>
                  {isAr ? 'نمط نص التكريم' : 'Congratulation text style'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SPOTLIGHT_STYLES.map(s => (
                    <button key={s.key} type="button" onClick={() => selectTextStyle(s.key)}
                      style={{
                        padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600,
                        border: `1.5px solid ${form.text_style === s.key ? '#5B5BD6' : '#E5E7EB'}`,
                        background: form.text_style === s.key ? '#EEF0FF' : '#fff', color: '#374151',
                      }}>
                      {isAr ? s.ar : s.en}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Field label={isAr ? 'تسمية مخصصة للقالب (اختياري)' : 'Custom template label (optional)'}>
            <input style={inp} value={form.label_ar} onChange={e => set('label_ar', e.target.value)} />
          </Field>
        </SectionCard>

        {isBulkSpotlight ? (
          <SectionCard title={isAr ? 'المحتوى' : 'Content'}>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: '#92400E' }}>
              {post
                ? (isAr
                  ? `سيمثّل هذا المنشور أول شخص محدد، وسيُنشأ ${form.employee_ids.length - 1} منشورات مستقلة إضافية للباقي — كل واحد صفحته الخاصة بنص تهنئة مخصص له تلقائياً.`
                  : `This post will represent the first selected person, and ${form.employee_ids.length - 1} more independent posts will be created for the rest — each with their own automatically personalized page.`)
                : (isAr
                  ? `سيُنشأ ${form.employee_ids.length} منشورات مستقلة — كل موظف/مشرف يأخذ صفحته الخاصة بنص تهنئة مخصص له تلقائياً (يذكر عدد أشهره المتتالية إن وُجد).`
                  : `${form.employee_ids.length} separate posts will be created — each person gets their own page with an automatically personalized congratulation.`)}
            </div>
          </SectionCard>
        ) : PDF_TEMPLATES.includes(form.template) ? (
          <SectionCard title={form.template === 'circular' ? (isAr ? 'عنوان الموضوع' : 'Subject title') : (isAr ? 'العنوان' : 'Title')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label={form.template === 'circular' ? (isAr ? 'عنوان الموضوع (عربي) *' : 'Subject title (Arabic) *') : (isAr ? 'العنوان (عربي) *' : 'Title (Arabic) *')}>
                <input style={inp} value={form.title_ar} onChange={e => set('title_ar', e.target.value)} />
              </Field>
              <Field label={form.template === 'circular' ? (isAr ? 'عنوان الموضوع (إنجليزي)' : 'Subject title (English)') : (isAr ? 'العنوان (إنجليزي)' : 'Title (English)')}>
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
          <Field label={isAr ? 'تأثير الخلفية' : 'Background effect'}>
            <div style={{ display: 'flex', gap: 6 }}>
              {BG_EFFECT_ORDER.map(key => (
                <button key={key} type="button" onClick={() => set('bg_effect', key)}
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600,
                    border: `1.5px solid ${form.bg_effect === key ? '#5B5BD6' : '#E5E7EB'}`,
                    background: form.bg_effect === key ? '#EEF0FF' : '#fff', color: '#374151',
                  }}>
                  {isAr ? BG_EFFECTS[key].ar : BG_EFFECTS[key].en}
                </button>
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

        {PDF_TEMPLATES.includes(form.template) && (
          <SectionCard title={isAr ? 'محتوى المنشور' : 'Post content'}>
            <Field label={isAr ? 'ارفع ملف PDF (يُعرض كمحتوى رئيسي)' : 'Upload a PDF (shown as the main content)'}>
              <input type="file" accept="application/pdf" onChange={handlePdf} style={{ fontSize: '0.72rem' }} />
              {uploadingPdf && <p style={{ margin: '4px 0 0', fontSize: '0.66rem', color: '#9CA3AF' }}>{isAr ? 'جارٍ الرفع...' : 'Uploading...'}</p>}
              {form.pdf_url && !uploadingPdf && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <a href={form.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: '#5B5BD6', fontWeight: 700 }}>{isAr ? '📄 عرض الملف المرفوع' : '📄 View uploaded file'}</a>
                  <button type="button" onClick={() => set('pdf_url', '')} style={{ fontSize: '0.66rem', color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>{isAr ? '✕ إزالة' : '✕ Remove'}</button>
                </div>
              )}
            </Field>

            <p style={{ margin: 0, fontSize: '0.7rem', color: '#9CA3AF' }}>
              {isAr ? 'الحقول التالية اختيارية وتُعرض تحت ملف الـ PDF إن رفعته (أو بديلاً عنه إن ما رفعت ملف):' : 'The fields below are optional and appear under the PDF if uploaded (or as a substitute if you skip the PDF):'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label={isAr ? `النص (عربي)${form.pdf_url ? '' : ' *'}` : `Body (Arabic)${form.pdf_url ? '' : ' *'}`}>
                <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={form.body_ar} onChange={e => set('body_ar', e.target.value)} />
              </Field>
              <Field label={isAr ? 'النص (إنجليزي)' : 'Body (English)'}>
                <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={form.body_en} onChange={e => set('body_en', e.target.value)} dir="ltr" />
              </Field>
            </div>
            {form.template === 'circular' && (
              <>
                <Field label={isAr ? 'الخاتمة' : 'Closing'}>
                  <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={form.closing_ar} onChange={e => set('closing_ar', e.target.value)}
                    placeholder={isAr ? 'مثال: وتفضلوا بقبول فائق الاحترام والتقدير' : ''} />
                </Field>
                <Field label={isAr ? 'الاسم (اختياري — إن تُرك فارغاً لا يظهر)' : 'Signer name (optional — hidden if empty)'}>
                  <input style={inp} value={form.signer_name} onChange={e => set('signer_name', e.target.value)} />
                </Field>
              </>
            )}
          </SectionCard>
        )}

        <SectionCard title={isAr ? 'جدولة العرض' : 'Display schedule'}>
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#9CA3AF' }}>
            {isAr ? 'اختياري — اتركهما فارغين لعرض المنشور فوراً وبدون تاريخ انتهاء' : 'Optional — leave both empty to show the post immediately with no expiry'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={isAr ? 'يبدأ في (٢٤ ساعة)' : 'Starts at (24h)'}>
              <DateTimeField value={form.starts_at} onChange={v => set('starts_at', v)} isAr={isAr} />
            </Field>
            <Field label={isAr ? 'ينتهي في (٢٤ ساعة)' : 'Ends at (24h)'}>
              <DateTimeField value={form.ends_at} onChange={v => set('ends_at', v)} isAr={isAr} />
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
            <div style={{ position: 'absolute', top: 0, insetInline: 0, height: 4, background: TEMPLATES[form.template].accent }} />
            <div style={{ position: 'relative', padding: '22px 20px 18px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.16)', padding: '3px 10px', borderRadius: 999, fontSize: '0.64rem', fontWeight: 700, color: '#fff', marginBottom: 10 }}>
                <span>{TEMPLATES[form.template].badge}</span><span>{templateLabel(form, isAr)}</span>
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
              {PDF_TEMPLATES.includes(form.template) && form.pdf_url && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>
                  📄 {isAr ? 'ملف PDF مرفق' : 'PDF attached'}
                </div>
              )}
              {(form.body_ar || !(PDF_TEMPLATES.includes(form.template) && form.pdf_url)) && (
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
