// الورديات (الترحيل والتحليل): 3 أو 4 ورديات يضبطها الأدمن من الإعدادات (المفتاح transport_shifts في app_settings)
// القاعدة: نهاية كل وردية شاملة — فرحلة 08:00 تتبع الوردية التي تنتهي 08:00، والوردية التالية تبدأ بعدها مباشرة.
// المعروض أرقام ثابتة (00:00 – 08:00 / 08:00 – 16:00 ...) بدون إضافة دقيقة.
export const SHIFT_SETTING_KEY = 'transport_shifts'
const KEYS = ['A', 'B', 'C', 'D']
export const SHIFT_AR = { A: 'الوردية أ', B: 'الوردية ب', C: 'الوردية ج', D: 'الوردية د' }
export const SHIFT_EN = { A: 'Shift A', B: 'Shift B', C: 'Shift C', D: 'Shift D' }
export const DEFAULT_ENDS = [480, 960, 1440]

export const fmtMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const toMin = hhmm => { const [h, m] = String(hhmm || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null }

// ends: أوقات نهاية الورديات بالدقائق (آخر واحدة دائماً 1440)
export function validEnds(ends) {
  return Array.isArray(ends) && (ends.length === 3 || ends.length === 4) && ends.every(Number.isFinite)
    && ends[ends.length - 1] === 1440 && ends.slice(0, -1).every((x, i) => x > 0 && x < 1440 && (i === 0 || x > ends[i - 1]))
}

export function parseShifts(raw) {
  let ends = DEFAULT_ENDS
  try {
    const o = JSON.parse(raw || 'null')
    if (o && Array.isArray(o.ends)) { const e = o.ends.map(Number); if (validEnds(e)) ends = e }
  } catch { /* الافتراضي */ }
  return ends.map((to, i) => {
    const from = i === 0 ? 0 : ends[i - 1], k = KEYS[i]
    return { k, ar: SHIFT_AR[k], en: SHIFT_EN[k], from, to, range: `${fmtMin(from)} – ${fmtMin(to)}` }
  })
}

// فهرس الوردية لوقت معيّن (بالدقائق من منتصف الليل): أول وردية نهايتها >= الوقت
export const shiftIdx = (min, shifts) => {
  for (let i = 0; i < shifts.length; i++) if (min <= shifts[i].to) return i
  return shifts.length - 1
}
