// إدارة مظهر التطبيق:
//   auto   = تلقائي حسب الوقت (ليلي من 6 مساءً حتى 6 صباحاً بتوقيت الجهاز)
//   system = حسب إعداد الجهاز (مظهر النظام)
//   light / dark = ثابت
export const THEME_KEY = 'nwbus_theme'
export const THEME_MODES = ['auto', 'system', 'light', 'dark']
export const NIGHT_FROM = 18   // 6 م
export const NIGHT_TO = 6      // 6 ص

// الافتراضي ليلي لكل الحسابات (الجديدة والقديمة): ترحيل لمرة واحدة ينقل الجميع للوضع الليلي عند أول فتح بعد هذا التحديث،
// ثم من يبغى النهاري يغيّره من قائمة المظهر ويُحفظ اختياره.
export const THEME_RESET_KEY = 'nwbus_theme_reset_v2'
export const DEFAULT_THEME = 'dark'
export function getThemeMode() {
  try {
    if (!localStorage.getItem(THEME_RESET_KEY)) {
      localStorage.setItem(THEME_RESET_KEY, '1')
      localStorage.setItem(THEME_KEY, DEFAULT_THEME)
      return DEFAULT_THEME
    }
    const v = localStorage.getItem(THEME_KEY)
    return THEME_MODES.includes(v) ? v : DEFAULT_THEME
  } catch { return DEFAULT_THEME }
}
export function setThemeMode(mode) { try { localStorage.setItem(THEME_KEY, mode) } catch { /* بدون تخزين */ } }
export const systemPrefersDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
export const isNightNow = (d = new Date()) => { const h = d.getHours(); return h >= NIGHT_FROM || h < NIGHT_TO }
export const resolveDark = mode => mode === 'dark' || (mode === 'system' && systemPrefersDark()) || (mode === 'auto' && isNightNow())

// تطبيق المظهر على الصفحة (متغيرات الألوان + meta) — مشترك بين التطبيق والصفحات المستقلة مثل /survey
const DARK_VARS = {
  '--brand-900':'#F0F0F0','--brand-800':'#D0D0D0','--brand-700':'#A0A0A0','--brand-600':'#707070',
  '--accent':'#7B7BDE','--accent-dark':'#9090E8','--gold':'#7B7BDE','--gold-light':'#9B9BE8','--gold-dim':'rgba(123,123,222,0.12)',
  '--surface':'#111111','--surface-2':'#1C1C1E','--card':'#1C1C1E','--card-hover':'#252528',
  '--border':'#2C2C2E','--border-2':'#3A3A3C',
  '--text-1':'#F0F0F0','--text-2':'#AEAEB2','--text-3':'#6C6C70',
  '--success':'#34D399','--success-bg':'rgba(52,211,153,0.10)',
  '--danger':'#F87171','--danger-bg':'rgba(248,113,113,0.10)',
  '--warning':'#FBBF24','--warning-bg':'rgba(251,191,36,0.10)',
  '--info':'#60A5FA','--info-bg':'rgba(96,165,250,0.10)',
  '--shadow-xs':'0 1px 2px rgba(0,0,0,0.3)',
  '--shadow-sm':'0 1px 3px rgba(0,0,0,0.35),0 1px 8px rgba(0,0,0,0.25)',
  '--shadow-md':'0 2px 8px rgba(0,0,0,0.4),0 1px 2px rgba(0,0,0,0.3)',
  '--shadow-lg':'0 4px 16px rgba(0,0,0,0.45),0 1px 4px rgba(0,0,0,0.35)',
  '--shadow-xl':'0 20px 50px rgba(0,0,0,0.6),0 4px 12px rgba(0,0,0,0.4)',
  '--shadow-icon':'0 2px 10px rgba(0,0,0,0.5),0 1px 3px rgba(0,0,0,0.4)',
}

export function applyTheme(isDark) {
  const root = document.documentElement
  root.setAttribute('data-theme', isDark ? 'dark' : 'light')
  root.classList.toggle('dark', isDark)
  try { document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#111111' : '#1C2B36') } catch { /* بدون meta */ }
  if (isDark) {
    Object.entries(DARK_VARS).forEach(([k, v]) => root.style.setProperty(k, v))
  } else {
    Object.keys(DARK_VARS).forEach(k => root.style.removeProperty(k))
  }
}
