// ورديات تقييم العميل: أوقات ثابتة يومياً — أ ٠٠:٠٠-٠٨:٠٠، ب ٠٨:٠٠-١٦:٠٠، ج ١٦:٠٠-٢٤:٠٠،
// مع فترة سماح ساعتين قبل/بعد حدود كل وردية (يسمح بالتفعيل المبكر أو التأخر بالخروج)
// بدون السماح باختيار ورديات غير المرتبطة بالوقت الحالي فعلياً.
export const SHIFTS = [
  { value: 'A', ar: 'الوردية أ', range: '00:00 - 08:00', start: 0, end: 8 },
  { value: 'B', ar: 'الوردية ب', range: '08:00 - 16:00', start: 8, end: 16 },
  { value: 'C', ar: 'الوردية ج', range: '16:00 - 23:59', start: 16, end: 24 },
]

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
function windowFor(shiftValue, now = new Date()) {
  const shift = SHIFTS.find(s => s.value === shiftValue)
  if (!shift) return null
  for (const offset of [-1, 0, 1]) {
    const { start, end } = occurrence(shift, offset, now)
    if (now.getTime() >= start.getTime() - GRACE_MS && now.getTime() < end.getTime() + GRACE_MS) {
      return { start, end }
    }
  }
  return null
}

export function currentShift(now = new Date()) {
  const h = now.getHours()
  if (h < 8) return 'A'
  if (h < 16) return 'B'
  return 'C'
}

export function isShiftAllowedNow(shiftValue, now = new Date()) {
  return !!windowFor(shiftValue, now)
}

export function allowedShiftsNow(now = new Date()) {
  return SHIFTS.filter(s => isShiftAllowedNow(s.value, now)).map(s => s.value)
}

// وقت انتهاء التفعيل التلقائي: نهاية الوردية الفعلية، أو بعد ساعتين لو فُعّلت
// أصلاً ضمن فترة سماح الخروج (يعني الوردية خلصت أصلاً) — حتى ما يبقى شغال بلا داعي
export function computeActiveUntil(shiftValue, now = new Date()) {
  const win = windowFor(shiftValue, now)
  if (!win) return null
  return win.end.getTime() > now.getTime() ? win.end : new Date(now.getTime() + GRACE_MS)
}

export function formatTime(date) {
  if (!date) return ''
  return date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: false })
}
