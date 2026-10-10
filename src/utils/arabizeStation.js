/* اقتراح اسم عربي لمحطة اسمها بالإنجليزية — لتحسين نطق النداء الصوتي.
   اقتراح فقط: يُراجَع ويُعدَّل قبل الحفظ. الكلمات غير المعروفة تبقى كما هي ليكملها المستخدم. */
const CITIES = {
  yanbu: 'ينبع', madinah: 'المدينة المنورة', medina: 'المدينة المنورة', jeddah: 'جدة', jiddah: 'جدة', riyadh: 'الرياض',
  makkah: 'مكة المكرمة', mecca: 'مكة المكرمة', hail: 'حائل', tabuk: 'تبوك', badr: 'بدر', rafha: 'رفحاء', jazan: 'جازان',
  dammam: 'الدمام', khobar: 'الخبر', taif: 'الطائف', abha: 'أبها', buraydah: 'بريدة', qassim: 'القصيم', alula: 'العلا',
  ula: 'العلا', duba: 'ضباء', umluj: 'أملج', wajh: 'الوجه', haql: 'حقل', tayma: 'تيماء', sakaka: 'سكاكا', arar: 'عرعر',
  jouf: 'الجوف', hafar: 'حفر الباطن', najran: 'نجران', jubail: 'الجبيل', ahsa: 'الأحساء', hofuf: 'الهفوف', khamis: 'خميس مشيط',
  bisha: 'بيشة', qunfudhah: 'القنفذة', laith: 'الليث', rabigh: 'رابغ', khulais: 'خليص', usfan: 'عسفان', thuwal: 'ثول',
  unaizah: 'عنيزة', onaiza: 'عنيزة', majmaah: 'المجمعة', zulfi: 'الزلفي', dawadmi: 'الدوادمي', afif: 'عفيف', khaybar: 'خيبر',
  mahd: 'مهد الذهب', yanbuindustrial: 'ينبع الصناعية', sharma: 'شرما', neom: 'نيوم', amaala: 'أمالا', diriyah: 'الدرعية',
  haramain: 'الحرمين', jarwal: 'جروال', kaec: 'مدينة الملك عبدالله الاقتصادية',
}
const WORDS = { terminal: 'الصالة', north: 'الشمالية', south: 'الجنوبية', east: 'الشرقية', west: 'الغربية', central: 'المركزية', main: 'الرئيسية', new: 'الجديدة', old: 'القديمة', international: 'الدولي', industrial: 'الصناعية', city: 'المدينة', royal: 'الملكية', commission: 'الهيئة', kilo: 'كيلو', km: 'كم', and: 'و' }

const norm = w => w.toLowerCase().replace(/[^a-z0-9]/g, '')
const tr = w => { const k = norm(w); return CITIES[k] ?? WORDS[k] ?? (/^\d+$/.test(w) ? w : w) }

const ADJ = { north: 'الشمالية', south: 'الجنوبية', east: 'الشرقية', west: 'الغربية', main: 'الرئيسية', new: 'الجديدة', old: 'القديمة' }
// "Al Madinah" → "المدينة المنورة" (الأداة تأتي مع الاسم العربي)، و"North Terminal" → "الصالة الشمالية"
function words(str) {
  const t = String(str || '').replace(/\b(al|el)-/gi, '$1 ').replace(/\b(north|south|east|west|main|new|old)\s+terminal\b/gi, (_, a) => 'الصالة ' + ADJ[a.toLowerCase()])
    .replace(/[-–]/g, ' - ').split(/\s+/).filter(Boolean)
  return t.filter((w, i) => !(/^(al|el)$/i.test(norm(w)) && t[i + 1] && CITIES[norm(t[i + 1])]))
}

export const hasLatin = s => /[A-Za-z]/.test(s || '')

export function arabizeStation(name) {
  let s = String(name || '').trim()
  if (!s) return ''
  // ما بين الأقواس يُترجم لوحده
  let paren = ''
  s = s.replace(/\(([^)]*)\)/g, (_, inner) => { paren = ' (' + words(inner).map(tr).join(' ') + ')'; return '' }).trim()

  const lower = s.toLowerCase()
  let kind = '', rest = s
  const cut = (re, k) => { const m = lower.match(re); if (m) { kind = k; rest = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim() } }
  if (/royal commission station/.test(lower)) {
    const m = lower.match(/(.*?)\s*royal commission station/); const city = m?.[1] ? words(m[1]).map(tr).join(' ') : ''
    return ('محطة الهيئة الملكية' + (city ? ' ب' + city : '') + paren).trim()
  }
  cut(/\btrain station\b/, 'محطة قطار')
  if (!kind) cut(/\bbus station\b/, 'محطة')
  if (!kind) cut(/\bairport\b/, 'مطار')
  if (!kind) cut(/\bstation\b/, 'محطة')
  const body = words(rest).map(tr).join(' ').replace(/\s+-\s+/g, ' - ').replace(/\s+/g, ' ').trim()
  const out = kind ? `${kind} ${body}` : body
  return (out + paren).trim()
}
