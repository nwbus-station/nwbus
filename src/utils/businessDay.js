// اليوم التشغيلي للإيرادات: ما يبدأ عند 00:00 بل عند وقت الفتح (افتراضي 01:30).
// قبله تُدخل الوردية الأخيرة بتاريخ أمس. الإعداد يُحفظ في app_settings ويُفرض بالقاعدة أيضاً (trigger).
import { toLocalDateStr } from './dates'

export const DAY_CUTOFF_KEY = 'sales_day_cutoff'
export const DEFAULT_CUTOFF_MIN = 90

const clean = v => String(v ?? '').replace(/^"|"$/g, '')
export function parseCutoff(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clean(v))
  if (!m) return DEFAULT_CUTOFF_MIN
  const t = Number(m[1]) * 60 + Number(m[2])
  return t >= 0 && t <= 360 ? t : DEFAULT_CUTOFF_MIN
}
export const fmtCutoff = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// تاريخ اليوم التشغيلي الآن
export function businessDate(now = new Date(), cutoffMin = DEFAULT_CUTOFF_MIN) {
  const d = new Date(now)
  d.setMinutes(d.getMinutes() - cutoffMin)
  return toLocalDateStr(d)
}
