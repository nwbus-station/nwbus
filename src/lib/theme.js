// إدارة مظهر التطبيق: تلقائي (يتبع إعداد الجهاز) أو نهاري أو ليلي. الاختيار يُحفظ بالمتصفح.
export const THEME_KEY = 'nwbus_theme'
export const THEME_MODES = ['auto', 'light', 'dark']

export function getThemeMode() {
  try { const v = localStorage.getItem(THEME_KEY); return THEME_MODES.includes(v) ? v : 'auto' } catch { return 'auto' }
}
export function setThemeMode(mode) { try { localStorage.setItem(THEME_KEY, mode) } catch { /* بدون تخزين */ } }
export const systemPrefersDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
export const resolveDark = mode => mode === 'dark' || (mode === 'auto' && systemPrefersDark())
