// ورديات تقييم العميل: تتبع ورديات المحطة (الافتراضي أ ٠٠:٠٠-٠٨:٠٠، ب ٠٨:٠٠-١٦:٠٠، ج ١٦:٠٠-٢٤:٠٠)،
// مع فترة سماح ساعتين قبل/بعد حدود كل وردية (يسمح بالتفعيل المبكر أو التأخر بالخروج)
// بدون السماح باختيار ورديات غير المرتبطة بالوقت الحالي فعلياً.
import { shiftsFromEnds } from './stationShifts'

// ورديات المحطة (3 أو 4 من صفحة المحطات)؛ بدون تخصيص: القياسية الثلاث
export const ratingShiftsFor = ends => shiftsFromEnds(ends).map(x => ({ value: x.k, ar: x.ar, range: x.range.replace(' – ', ' - '), start: x.from / 60, end: x.to / 60 }))
export const SHIFTS = ratingShiftsFor(null)

const GRACE_MS = 2 * 60 * 60 * 1000

function occurrence(shift, dayOffset, ref) {
  const base = new Date(ref)
  base.setHours(0, 0, 0, 0)
  base.setDate(base.getDate() + dayOffset)
  return {
    start: new Date(base.getTime() + shift.start * 3600000),
    end: new Date(base.getTime() + shift.end * 3600000),
  }
}

// نبحث في وردية أمس/اليوم/غداً لأن فترة السماح قد تمد الوردية عبر منتصف الليل
function windowFor(shiftValue, now = new Date(), list = SHIFTS) {
  const shift = list.find(s => s.value === shiftValue)
  if (!shift) return null
  for (const offset of [-1, 0, 1]) {
    const { start, end } = occurrence(shift, offset, now)
    if (now.getTime() >= start.getTime() - GRACE_MS && now.getTime() < end.getTime() + GRACE_MS) {
      return { start, end }
    }
  }
  return null
}

export function currentShift(now = new Date(), list = SHIFTS) {
  const h = now.getHours() + now.getMinutes() / 60
  return (list.find(x => h < x.end) ?? list[list.length - 1]).value
}

export function isShiftAllowedNow(shiftValue, now = new Date(), list = SHIFTS) {
  return !!windowFor(shiftValue, now, list)
}

export function allowedShiftsNow(now = new Date(), list = SHIFTS) {
  return list.filter(s => isShiftAllowedNow(s.value, now, list)).map(s => s.value)
}

// وقت انتهاء التفعيل التلقائي: نهاية الوردية الفعلية، أو بعد ساعتين لو فُعّلت
// أصلاً ضمن فترة سماح الخروج (يعني الوردية خلصت أصلاً) — حتى ما يبقى شغال بلا داعي
export function computeActiveUntil(shiftValue, now = new Date(), list = SHIFTS) {
  const win = windowFor(shiftValue, now, list)
  if (!win) return null
  return win.end.getTime() > now.getTime() ? win.end : new Date(now.getTime() + GRACE_MS)
}

export function formatTime(date) {
  if (!date) return ''
  return date.toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false })
}
