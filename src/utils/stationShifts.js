// ورديات كل محطة (3 أو 4): تُحدَّد من صفحة المحطات (عمود stations.shift_ends = أوقات نهاية الورديات بالدقائق).
// بدون تخصيص تكون الورديات القياسية الثلاث (نهاية 08:00 و16:00 و24:00). نفس الورديات تُستخدم في الإيرادات والترحيل والتقييم والسجل الوظيفي.
import { parseShifts, validEnds } from './shifts'

// الورديات المتوقفة في المحطة (stations.inactive_shifts مثل ['A']): تبقى في القائمة لتصنيف الأوقات، لكن off=true فلا تدخل في أي نسبة أداء
export const offShiftsOf = st => (Array.isArray(st?.inactive_shifts) ? st.inactive_shifts : [])
export const shiftsFromEnds = (ends, off = []) => parseShifts(Array.isArray(ends) && validEnds(ends) ? JSON.stringify({ ends }) : null).map(s => ({ ...s, off: off.includes(s.k) }))
export const shiftsOfStation = st => shiftsFromEnds(st?.shift_ends, offShiftsOf(st))
