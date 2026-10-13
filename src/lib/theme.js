// إدارة مظهر التطبيق:
//   auto   = تلقائي حسب الوقت (ليلي من 6 مساءً حتى 6 صباحاً بتوقيت الجهاز)
//   system = حسب إعداد الجهاز (مظهر النظام)
//   light / dark = ثابت
export const THEME_KEY = 'nwbus_theme'
export const THEME_MODES = ['auto', 'system', 'light', 'dark']
export const NIGHT_FROM = 18   // 6 م
export const NIGHT_TO = 6      // 6 ص

// ترحيل لمرة واحدة: كل الحسابات تنتقل للوضع التلقائي (حسب الوقت) عند أول فتح بعد هذا التحديث، ثم يغيّر من يشاء اختياره بحرية
export const THEME_RESET_KEY = 'nwbus_theme_reset_v1'
export function getThemeMode() {
  try {
    if (!localStorage.getItem(THEME_RESET_KEY)) {
      localStorage.setItem(THEME_RESET_KEY, '1')
      localStorage.setItem(THEME_KEY, 'auto')
      return 'auto'
    }
    const v = localStorage.getItem(THEME_KEY)
    return THEME_MODES.includes(v) ? v : 'auto'
  } catch { return 'auto' }
}
export function setThemeMode(mode) { try { localStorage.setItem(THEME_KEY, mode) } catch { /* بدون تخزين */ } }
export const systemPrefersDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
export const isNightNow = (d = new Date()) => { const h = d.getHours(); return h >= NIGHT_FROM || h < NIGHT_TO }
export const resolveDark = mode => mode === 'dark' || (mode === 'system' && systemPrefersDark()) || (mode === 'auto' && isNightNow())
