// ورديات كل محطة (3 أو 4): تُحدَّد من صفحة المحطات (عمود stations.shift_ends = أوقات نهاية الورديات بالدقائق).
// بدون تخصيص تكون الورديات القياسية الثلاث (نهاية 08:00 و16:00 و24:00). نفس الورديات تُستخدم في الإيرادات والترحيل والتقييم والسجل الوظيفي.
import { parseShifts, validEnds } from './shifts'

export const shiftsFromEnds = ends => parseShifts(Array.isArray(ends) && validEnds(ends) ? JSON.stringify({ ends }) : null)
export const shiftsOfStation = st => shiftsFromEnds(st?.shift_ends)
