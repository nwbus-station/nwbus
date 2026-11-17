// استوديو الإعلانات: القوالب والألوان ومكوّن AdCanvas (يُصدَّر إلى JPEG عبر html2canvas)
// قيود html2canvas: تخطيط مطلق/flex + ألوان صلبة وتدرجات + SVG مضمّن فقط (بلا filter/mask/clip-path/blend)
import { NWB_LOGO_SVG } from '../../utils/logo'

const FONT = "'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif"
const MONO = "'IBM Plex Mono',monospace"

export const AD_SIZES = { landscape: { w: 1920, h: 1080 }, portrait: { w: 1080, h: 1920 } }

// onAccent: لون النص فوق لون التمييز · mono: شعار أبيض بالكامل (خلفية برتقالية)
export const PALETTES = [
  { key: 'navy',   ar: 'رسمي أزرق', bg: '#0F2340', bg2: '#264673', fg: '#FFFFFF', accent: '#EE712D', accent2: '#6E94D1', muted: '#B9C8E0', onAccent: '#FFFFFF', dark: true },
  { key: 'orange', ar: 'برتقالي',   bg: '#EE712D', bg2: '#D45A17', fg: '#FFFFFF', accent: '#264673', accent2: '#1D1D1C', muted: '#FFE6D6', onAccent: '#FFFFFF', dark: true, mono: true },
  { key: 'dark',   ar: 'داكن',      bg: '#0B0B0D', bg2: '#1C1C22', fg: '#FFFFFF', accent: '#EE712D', accent2: '#6E94D1', muted: '#A9ABB5', onAccent: '#FFFFFF', dark: true },
  { key: 'light',  ar: 'فاتح',      bg: '#FFFFFF', bg2: '#E9EEF6', fg: '#264673', accent: '#EE712D', accent2: '#264673', muted: '#56667E', onAccent: '#FFFFFF', dark: false },
  { key: 'teal',   ar: 'هادئ',      bg: '#0A3637', bg2: '#13605D', fg: '#FFFFFF', accent: '#F2B24C', accent2: '#7FD1C7', muted: '#B3D6D1', onAccent: '#0A2B2C', dark: true },
]

// ───────── أدوات مساعدة ─────────
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})` }
const fill = p => `linear-gradient(160deg, ${p.bg} 0%, ${p.bg2} 100%)`
// حجم الخط يصغر مع طول النص: بعد "free" حرفاً ينقص perChar لكل حرف، ضمن [min, base]
const fit = (text, base, min, perChar, free = 8) => Math.round(Math.max(min, Math.min(base, base - Math.max(0, (text || '').length - free) * perChar)))
const longest = (...a) => a.reduce((m, s) => ((s || '').length > m.length ? s : m), '')
const clamp = n => ({ display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden' })

const logoSvg = (w, dark, mono) => {
  const s = NWB_LOGO_SVG.replace(/width="180" height="90"/, `width="${w}" height="${Math.round(w * 198 / 398)}"`)
  if (mono) return s.replace(/fill="#(?!FFFFFF)[0-9A-F]{6}"/gi, 'fill="#FFFFFF"').replace(/fill="white"/g, 'fill="none"')
  return dark ? s.replace(/#1D1D1C/gi, '#FFFFFF').replace(/#264673/gi, '#6E94D1').replace(/fill="white"/g, 'fill="none"') : s
}

// نص مع قصّ بعدد أسطر (قصّ احتياطي بـ maxHeight لأن html2canvas لا يطبّق line-clamp)
function Txt({ v, size, n = 2, w = 800, c, lh = 1.3, ta, st }) {
  if (!v) return null
  // مساحة إضافية أسفل السطر الأخير: الرسم عبر html2canvas يزيح الحروف العربية للأسفل قليلاً فتُقص بدونها؛ الهامش السالب يُبقي التخطيط كما هو
  const pad = Math.ceil(size * 0.24)
  return <div style={{ fontSize: size, fontWeight: w, color: c, lineHeight: lh, maxHeight: Math.ceil(size * lh * n) + pad, paddingBottom: pad, marginBottom: -pad, textAlign: ta, whiteSpace: 'pre-line', ...clamp(n), ...st }}>{v}</div>
}

function Photo({ src, style }) {
  return <img src={src} alt="" crossOrigin="anonymous" style={{ position: 'absolute', objectFit: 'cover', display: 'block', ...style }} />
}

function WarnIcon({ s, c, bg }) {
  return (
    <svg width={s} height={Math.round(s * 0.92)} viewBox="0 0 120 110" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M60 4L118 106H2Z" fill={c} />
      <rect x="53" y="38" width="14" height="38" fill={bg} />
      <rect x="53" y="84" width="14" height="14" fill={bg} />
    </svg>
  )
}

function Arrow({ c, vertical, s }) {
  return vertical
    ? <svg width={s * 0.6} height={s} viewBox="0 0 60 110" style={{ display: 'block', flexShrink: 0 }}><path d="M30 2V104M4 74L30 106L56 74" stroke={c} strokeWidth="12" fill="none" strokeLinecap="square" /></svg>
    : <svg width={s} height={s * 0.6} viewBox="0 0 110 60" style={{ display: 'block', flexShrink: 0 }}><path d="M108 30H6M36 4L4 30L36 56" stroke={c} strokeWidth="12" fill="none" strokeLinecap="square" /></svg>
}

// ───────── محتوى كل قالب (دوال ترجع JSX، لا hooks) ─────────
const BODY = {
  // إعلان رئيسي: صورة كاملة + تدرج داكن، العنوان أسفل اليمين، الشعار أعلى اليسار
  hero: ({ d, p, P, W, H, photo, ta, ax, logoEl }) => {
    const fg = photo ? '#FFFFFF' : p.fg, mu = photo ? '#D8DFEA' : p.muted
    const pad = P ? 80 : 110
    return <>
      {photo && <Photo src={photo} style={{ top: 0, left: 0, width: W, height: H }} />}
      {photo && <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, background: 'linear-gradient(to top, rgba(4,10,20,0.94) 0%, rgba(4,10,20,0.66) 40%, rgba(4,10,20,0) 78%)' }} />}
      {photo && !P && <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, background: 'linear-gradient(to left, rgba(4,10,20,0.55) 0%, rgba(4,10,20,0) 62%)' }} />}
      <div style={{ position: 'absolute', top: 0, right: 0, width: 20, height: H, background: p.accent }} />
      {logoEl(P ? 300 : 320, photo ? true : p.dark, { top: 70, left: 80 })}
      <div style={{ position: 'absolute', left: pad, right: pad + 20, bottom: P ? 150 : 100, display: 'flex', flexDirection: 'column', alignItems: ax }}>
        <div style={{ width: 140, height: 16, background: p.accent, marginBottom: 44 }} />
        <Txt v={d.title} size={fit(d.title, P ? 140 : 160, 80, 5)} n={P ? 3 : 2} c={fg} lh={1.25} ta={ta} st={{ maxWidth: P ? undefined : 1300 }} />
        <Txt v={d.subtitle} size={P ? 52 : 58} n={2} w={500} c={fg} ta={ta} st={{ marginTop: 30, maxWidth: P ? undefined : 1300 }} />
        <Txt v={d.note} size={34} n={2} w={500} c={mu} ta={ta} st={{ marginTop: 36, maxWidth: P ? undefined : 1300 }} />
      </div>
    </>
  },

  // عرض خاص: لوحة ملونة بشارة ضخمة + صورة على الجانب الآخر
  offer: ({ d, p, P, W, H, photo, ta, ax, logoEl }) => {
    const ph = P ? 600 : 700
    const panel = P
      ? { left: 0, bottom: 0, width: W, height: photo ? H - ph : H }
      : { right: 0, top: 0, width: photo ? W - ph : W, height: H }
    const pad = P ? '190px 70px 80px' : '180px 110px 80px'
    return <>
      {photo && <Photo src={photo} style={P ? { top: 0, left: 0, width: W, height: ph } : { top: 0, left: 0, width: ph, height: H }} />}
      <div style={{ position: 'absolute', ...panel, background: fill(p), boxSizing: 'border-box', padding: pad, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: ax }}>
        {!photo && !P && <div style={{ position: 'absolute', left: 90, bottom: 90, width: 380, height: 380, border: `26px solid ${rgba(p.accent2, 0.28)}` }} />}
        <div style={{ background: p.accent, color: p.onAccent, fontSize: fit(d.badge, P ? 190 : 200, 90, 12, 5), fontWeight: 800, lineHeight: 1.1, padding: '14px 50px 22px', whiteSpace: 'nowrap', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>{d.badge}</div>
        <Txt v={d.title} size={fit(d.title, P ? 92 : 88, 54, 3, 12)} n={2} c={p.fg} ta={ta} st={{ marginTop: 40 }} />
        <Txt v={d.subtitle} size={P ? 46 : 44} n={2} w={500} c={p.muted} ta={ta} st={{ marginTop: 20 }} />
        <Txt v={d.note} size={30} n={2} w={500} c={p.muted} ta={ta} st={{ marginTop: 36, opacity: 0.85 }} />
      </div>
      {logoEl(P ? 260 : 250, p.dark, P ? { left: 70, top: (photo ? ph : 0) + 60 } : { left: (photo ? ph : 0) + 70, top: 60 })}
    </>
  },

  // تنبيه: شريط تمييز بأيقونة + رسالة كبيرة في الوسط
  notice: ({ d, p, P, W, H, logoEl }) => {
    const bandH = P ? 640 : 300
    return <>
      <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: bandH, background: p.accent, boxSizing: 'border-box', padding: '0 80px', display: 'flex', flexDirection: P ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: P ? 50 : 70 }}>
        <WarnIcon s={P ? 230 : 180} c={p.onAccent} bg={p.accent} />
        <Txt v={d.title} size={fit(d.title, 140, 70, 6, 8)} n={2} c={p.onAccent} ta={P ? 'center' : 'right'} st={{ maxWidth: P ? W - 160 : 1300 }} />
      </div>
      <div style={{ position: 'absolute', top: bandH, left: 0, width: W, height: H - bandH, boxSizing: 'border-box', padding: P ? '60px 80px 170px' : '30px 160px 150px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <Txt v={d.message} size={fit(d.message, P ? 120 : 118, 56, 3.5, 20)} n={P ? 5 : 3} w={700} c={p.fg} lh={1.3} ta="center" />
        <Txt v={d.note} size={P ? 44 : 42} n={P ? 2 : 1} w={500} c={p.muted} ta="center" st={{ marginTop: 40 }} />
      </div>
      {logoEl(P ? 260 : 240, p.dark, { left: 70, bottom: 50 })}
    </>
  },

  // ترحيب: شعار كبير في الوسط + تحية + سطر المحطة/المدينة
  welcome: ({ d, p, P, W, H, photo, logoEl }) => {
    const fg = photo ? '#FFFFFF' : p.fg
    const lw = P ? 760 : 520
    return <>
      {photo && <Photo src={photo} style={{ top: 0, left: 0, width: W, height: H }} />}
      {photo && <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, background: 'linear-gradient(to top, rgba(6,16,32,0.8) 0%, rgba(6,16,32,0.6) 100%)' }} />}
      <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, boxSizing: 'border-box', padding: P ? '0 80px' : '0 160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        {logoEl(lw, photo ? true : p.dark, { position: 'relative', marginBottom: P ? 80 : 50, lineHeight: 0 })}
        <div style={{ width: 180, height: 10, background: p.accent, marginBottom: P ? 70 : 54 }} />
        <Txt v={d.title} size={fit(d.title, P ? 120 : 130, 76, 4, 14)} n={2} w={700} c={fg} ta="center" />
        <Txt v={d.subtitle} size={P ? 52 : 52} n={2} w={500} c={photo ? '#DCE4F0' : p.muted} ta="center" st={{ marginTop: 30 }} />
      </div>
    </>
  },

  // معلومة/خدمة: صورة على جانب، وعنوان + حتى 4 نقاط على الآخر
  info: ({ d, p, P, W, H, photo, ta, ax, logoEl }) => {
    const ph = P ? 760 : 820
    const lines = ['line1', 'line2', 'line3', 'line4'].map(k => (d[k] || '').trim()).filter(Boolean)
    const ls = fit(longest(...lines), P ? 56 : 52, 34, 1.3, 14)
    const panel = P
      ? { left: 0, bottom: 0, width: W, height: photo ? H - ph : H }
      : { right: 0, top: 0, width: photo ? W - ph : W, height: H }
    return <>
      {photo && <Photo src={photo} style={P ? { top: 0, left: 0, width: W, height: ph } : { top: 0, left: 0, width: ph, height: H }} />}
      <div style={{ position: 'absolute', ...panel, background: fill(p), boxSizing: 'border-box', padding: P ? '70px 80px 210px' : '90px 100px 210px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: ax }}>
        <Txt v={d.title} size={fit(d.title, 92, 56, 3, 10)} n={2} c={p.fg} ta={ta} />
        <div style={{ width: 120, height: 14, background: p.accent, margin: '28px 0 44px' }} />
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 28, marginBottom: i < lines.length - 1 ? 30 : 0, maxWidth: P ? undefined : 1400 }}>
            <div style={{ width: 26, height: 26, background: p.accent, flexShrink: 0, marginTop: Math.round((ls * 1.3 - 26) / 2) }} />
            <Txt v={l} size={ls} n={2} w={500} c={p.fg} ta="right" st={{ flex: 1, minWidth: 0 }} />
          </div>
        ))}
      </div>
      {logoEl(P ? 260 : 250, p.dark, { left: (photo && !P ? ph : 0) + 80, bottom: 60 })}
    </>
  },

  // رحلة: من -> إلى، الوقت بخط mono ضخم، الرصيف/الخط، ملاحظة
  route: ({ d, p, P, W, H, logoEl }) => {
    const ns = fit(longest(d.from, d.to), P ? 140 : 160, 80, 6, 6)
    const name = v => <Txt v={v} size={ns} n={2} w={800} c={p.fg} lh={1.25} ta="right" st={{ flex: P ? undefined : 1, minWidth: 0, width: P ? '100%' : undefined }} />
    const ts = fit(d.time, P ? 300 : 300, 180, 40, 5)
    return <>
      <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: 18, background: p.accent }} />
      {logoEl(P ? 280 : 260, p.dark, { top: 60, left: 80 })}
      <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, boxSizing: 'border-box', padding: P ? '210px 80px 80px' : '180px 110px 70px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: P ? 'column' : 'row', alignItems: P ? 'stretch' : 'center', gap: P ? 36 : 60 }}>
          {name(d.from)}
          <div style={{ display: 'flex', justifyContent: 'center' }}><Arrow c={p.accent} vertical={P} s={P ? 100 : 150} /></div>
          {name(d.to)}
        </div>
        <div style={{ height: 6, background: rgba(p.fg, 0.2), margin: P ? '48px 0' : '40px 0' }} />
        <div style={{ display: 'flex', flexDirection: P ? 'column' : 'row', alignItems: P ? 'stretch' : 'center', justifyContent: 'space-between', gap: P ? 40 : 70 }}>
          <div dir="ltr" style={{ fontFamily: MONO, fontWeight: 700, fontSize: ts, lineHeight: 1, color: p.accent, textAlign: P ? 'center' : 'left', whiteSpace: 'nowrap' }}>{d.time}</div>
          {d.platform && (
            <div style={{ flex: P ? undefined : 1, minWidth: 0, background: rgba(p.fg, 0.1), borderRight: `16px solid ${p.accent}`, boxSizing: 'border-box', padding: P ? '34px 44px' : '40px 50px' }}>
              <Txt v={d.platform} size={fit(d.platform, 76, 44, 3, 10)} n={2} c={p.fg} ta="right" />
            </div>
          )}
        </div>
        <Txt v={d.note} size={P ? 40 : 36} n={2} w={500} c={p.muted} ta="right" st={{ marginTop: P ? 50 : 40 }} />
      </div>
    </>
  },
}

// ───────── تعريف القوالب ─────────
export const TEMPLATES = [
  { key: 'hero', ar: 'إعلان رئيسي', desc: 'صورة كاملة مع عنوان كبير أسفل اليمين', bg: 'required',
    fields: [
      { k: 'title', label: 'العنوان', placeholder: 'رحلات يومية إلى كل المدن', max: 60 },
      { k: 'subtitle', label: 'العنوان الفرعي', placeholder: 'مقاعد مريحة ومواعيد دقيقة', max: 90 },
      { k: 'note', label: 'ملاحظة صغيرة', placeholder: 'الحجز عبر التطبيق أو شباك التذاكر', max: 90 },
    ],
    defaults: { title: 'رحلات يومية من حائل إلى الرياض', subtitle: 'مقاعد مريحة ومواعيد دقيقة على مدار الأسبوع', note: 'الحجز عبر تطبيق نورث وست باص أو من شباك التذاكر' } },
  { key: 'offer', ar: 'عرض خاص', desc: 'شارة عرض ضخمة على لوحة ملونة مع صورة اختيارية', bg: 'optional',
    fields: [
      { k: 'badge', label: 'شارة العرض', placeholder: 'خصم 20%', max: 14 },
      { k: 'title', label: 'العنوان', placeholder: 'على رحلات الذهاب والعودة', max: 50 },
      { k: 'subtitle', label: 'العنوان الفرعي', placeholder: 'احجز الآن', max: 80 },
      { k: 'note', label: 'الشروط', placeholder: 'تطبق الشروط والأحكام', max: 90 },
    ],
    defaults: { badge: 'خصم 20%', title: 'على رحلات الذهاب والعودة', subtitle: 'احجز تذكرتك الآن واستمتع بالسعر الأفضل', note: 'ساري حتى نهاية الشهر · تطبق الشروط والأحكام' } },
  { key: 'notice', ar: 'تنبيه', desc: 'شريط تمييز بأيقونة ورسالة كبيرة في الوسط', bg: 'none',
    fields: [
      { k: 'title', label: 'عنوان التنبيه', placeholder: 'تنبيه هام', max: 30 },
      { k: 'message', label: 'الرسالة', placeholder: 'نص التنبيه', max: 140, multiline: true },
      { k: 'note', label: 'سطر ثانوي', placeholder: 'نتمنى لكم رحلة سعيدة', max: 80 },
    ],
    defaults: { title: 'تنبيه هام', message: 'يرجى إبراز التذكرة لمشرف الرحلة قبل الصعود إلى الحافلة', note: 'نتمنى لكم رحلة سعيدة' } },
  { key: 'welcome', ar: 'ترحيب', desc: 'شعار كبير وتحية هادئة', bg: 'optional',
    fields: [
      { k: 'title', label: 'التحية', placeholder: 'أهلاً بكم في محطة حائل', max: 50 },
      { k: 'subtitle', label: 'سطر المحطة / المدينة', placeholder: 'يسعدنا خدمتكم', max: 80 },
    ],
    defaults: { title: 'أهلاً بكم في محطة حائل', subtitle: 'يسعدنا خدمتكم · نورث وست باص' } },
  { key: 'info', ar: 'معلومة / خدمة', desc: 'صورة على جانب وعنوان مع حتى 4 نقاط', bg: 'optional',
    fields: [
      { k: 'title', label: 'العنوان', placeholder: 'خدمات المحطة', max: 40 },
      { k: 'line1', label: 'النقطة 1', placeholder: 'نقطة قصيرة', max: 60 },
      { k: 'line2', label: 'النقطة 2 (اختياري)', placeholder: '', max: 60 },
      { k: 'line3', label: 'النقطة 3 (اختياري)', placeholder: '', max: 60 },
      { k: 'line4', label: 'النقطة 4 (اختياري)', placeholder: '', max: 60 },
    ],
    defaults: { title: 'خدمات المحطة', line1: 'صالة انتظار مكيفة ومقاعد مريحة', line2: 'شحن مجاني للجوال داخل الصالة', line3: 'مصلى ودورات مياه على مدار الساعة', line4: 'خدمة الأمتعة وتتبع الرحلات' } },
  { key: 'route', ar: 'رحلة', desc: 'إعلان رحلة: من وإلى والوقت والرصيف', bg: 'none',
    fields: [
      { k: 'from', label: 'من', placeholder: 'حائل', max: 30 },
      { k: 'to', label: 'إلى', placeholder: 'الرياض', max: 30 },
      { k: 'time', label: 'وقت المغادرة', placeholder: '08:30', max: 6 },
      { k: 'platform', label: 'الرصيف / الخط', placeholder: 'الرصيف 4', max: 40 },
      { k: 'note', label: 'ملاحظة', placeholder: 'يرجى الحضور قبل الموعد', max: 80 },
    ],
    defaults: { from: 'حائل', to: 'الرياض', time: '08:30', platform: 'الرصيف 4', note: 'يرجى الحضور قبل الموعد بـ 15 دقيقة' } },
]

// ───────── اللوحة المُصدَّرة: عنصر جذر واحد بحجم البكسل الفعلي، بلا scale ─────────
export function AdCanvas({ template, data = {}, palette, bgUrl, orientation = 'landscape', logo = true, align }) {
  const tpl = TEMPLATES.find(t => t.key === template) || TEMPLATES[0]
  const { w: W, h: H } = AD_SIZES[orientation] || AD_SIZES.landscape
  const p = palette || PALETTES[0]
  const P = H > W
  const d = {}
  Object.keys(tpl.defaults).forEach(k => { d[k] = data[k] ?? tpl.defaults[k] })
  const ta = align === 'center' || align === 'left' ? align : 'right'
  const ax = { right: 'flex-start', center: 'center', left: 'flex-end' }[ta]
  const photo = tpl.bg === 'none' ? '' : (bgUrl || '')
  const logoEl = (w, dark, style) => logo
    ? <div style={{ position: 'absolute', width: w, height: Math.round(w * 198 / 398), ...style }} dangerouslySetInnerHTML={{ __html: logoSvg(w, dark, p.mono) }} />
    : null
  return (
    <div dir="rtl" style={{ position: 'relative', overflow: 'hidden', width: W, height: H, boxSizing: 'border-box', background: fill(p), color: p.fg, fontFamily: FONT }}>
      {BODY[tpl.key]({ d, p, P, W, H, photo, ta, ax, logoEl })}
    </div>
  )
}
