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
  qunfudah: 'القنفذة', haramain: 'الحرمين', jarwal: 'جروال', kaec: 'مدينة الملك عبدالله الاقتصادية',
  jumum: 'الجموم', ruwaidhah: 'الرويضة', ruwaidah: 'الرويضة', muwayh: 'المويه', baljurashi: 'بلجرشي', sabya: 'صبيا', shaqra: 'شقراء',
  rass: 'الرس', khurma: 'الخرمة', quwaiiyah: 'القويعية', quwayiyah: 'القويعية', atawilah: 'العطاولة', ghat: 'الغاط', bahah: 'الباحة',
  muzahmiyya: 'المزاحمية', muzahmiyyah: 'المزاحمية', muthallth: 'المثلث', baqaa: 'بقعاء', dhurma: 'ضرما', linah: 'لينة', halaban: 'حلبان',
  shihiya: 'الشحية', turbah: 'تربة', trubah: 'تربة', mastorah: 'مستورة', shuqaiq: 'الشقيق', nabhaniyah: 'النبهانية', badayea: 'البدائع',
  henakiah: 'الحناكية', ghazalah: 'الغزالة', hulayfah: 'الحليفة', baish: 'بيش', marat: 'مرات', radwan: 'رضوان', hawiyah: 'الحوية',
  suwaydrah: 'صويدرة', halat: 'حالة', ammar: 'عمار', sir: 'السر', balad: 'البلد', khomrah: 'الخمرة', petra: 'البتراء', hirmas: 'حرمس',
}
const WORDS = { square: 'ميدان', hospital: 'مستشفى', dar: 'دار', tuwaiq: 'طويق', metro: 'المترو', qaffar: 'قفار', sufla: 'السفلى', ulya: 'العليا', abu: 'أبو', arish: 'عريش', bir: 'بئر', ibn: 'ابن', terminal: 'الصالة', north: 'الشمالية', south: 'الجنوبية', east: 'الشرقية', west: 'الغربية', central: 'المركزية', main: 'الرئيسية', new: 'الجديدة', old: 'القديمة', international: 'الدولي', industrial: 'الصناعية', city: 'المدينة', royal: 'الملكية', commission: 'الهيئة', kilo: 'كيلو', km: 'كم', and: 'و' }

const norm = w => w.toLowerCase().replace(/[^a-z0-9]/g, '')
// حروف عربية تقريبية لكلمة لاتينية غير موجودة بالقاموس (الأسماء السعودية المكتوبة بحروف لاتينية)
const DIGRAPHS = [['kh', 'خ'], ['sh', 'ش'], ['th', 'ث'], ['dh', 'ض'], ['gh', 'غ'], ['ch', 'تش'], ['aa', 'ا'], ['ee', 'ي'], ['ii', 'ي'], ['oo', 'و'], ['ou', 'و'], ['uu', 'و'], ['ai', 'ي'], ['ay', 'ي'], ['ei', 'ي'], ['ey', 'ي'], ['aw', 'او']]
const LETTERS = { b: 'ب', t: 'ت', j: 'ج', h: 'ه', d: 'د', r: 'ر', z: 'ز', s: 'س', f: 'ف', q: 'ق', k: 'ك', l: 'ل', m: 'م', n: 'ن', w: 'و', y: 'ي', g: 'ج', p: 'ب', v: 'ف', c: 'ك', x: 'كس' }
export function translit(word) {
  const w = String(word).toLowerCase().replace(/[^a-z']/g, '')
  if (!w) return word
  let out = '', i = 0
  while (i < w.length) {
    if (i === w.length - 2 && w.slice(i) === 'ah') { out += 'ة'; break }
    if (i === w.length - 1 && w[i] === 'a' && i > 0) { out += 'ا'; i++; continue }
    const d2 = w.slice(i, i + 2), dg = DIGRAPHS.find(([k]) => k === d2)
    if (dg) { out += dg[1]; i += 2; continue }
    const c = w[i]
    if (c === "'") { out += 'ع'; i++; continue }
    if (LETTERS[c]) { out += LETTERS[c]; i++; continue }
    if ('aeiou'.includes(c)) { if (i === 0) out += c === 'e' || c === 'i' ? 'إ' : 'أ'; i++; continue }   // الحركات القصيرة لا تُكتب
    i++
  }
  return out
}
const ARTICLES = /^(al|el|ar|as|ash|ad|an|at|az|ath|adh)$/i
const tr = w => { const k = norm(w); return CITIES[k] ?? WORDS[k] ?? (/^\d+$/.test(w) ? w : (/^[A-Za-z']+$/.test(w) ? translit(w) : w)) }
// كلمات الاسم → عربي، مع أداة التعريف (Al/Ar/As…) ملصوقة بالكلمة التي بعدها
function render(tokens) {
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (ARTICLES.test(t) && tokens[i + 1] && /^[A-Za-z']+$/.test(tokens[i + 1])) {
      const v = tr(tokens[i + 1]); out.push(v.startsWith('ال') ? v : 'ال' + v); i++
    } else out.push(tr(t))
  }
  return out.join(' ')
}

const ADJ = { north: 'الشمالية', south: 'الجنوبية', east: 'الشرقية', west: 'الغربية', main: 'الرئيسية', new: 'الجديدة', old: 'القديمة' }
// "Al Madinah" → "المدينة المنورة" (الأداة تأتي مع الاسم العربي)، و"North Terminal" → "الصالة الشمالية"
function words(str) {
  const t = String(str || '').replace(/\b(al|el)-/gi, '$1 ').replace(/\b(north|south|east|west|main|new|old)\s+terminal\b/gi, (_, a) => 'الصالة ' + ADJ[a.toLowerCase()])
    .replace(/[-–]/g, ' - ').split(/\s+/).filter(Boolean)
  // New Muwayh ← المويه الجديدة (الصفة بعد الاسم)
  if (t.length > 1 && /^(new|old)$/i.test(t[0])) return [...t.slice(1), t[0]]
  return t
}

export const hasLatin = s => /[A-Za-z]/.test(s || '')

export function arabizeStation(name) {
  let s = String(name || '').trim()
  if (!s) return ''
  // ما بين الأقواس يُترجم لوحده
  let paren = ''
  s = s.replace(/\(([^)]*)\)/g, (_, inner) => { paren = ' (' + render(words(inner)) + ')'; return '' }).trim()

  const lower = s.toLowerCase()
  let kind = '', rest = s
  const cut = (re, k) => { const m = lower.match(re); if (m) { kind = k; rest = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim() } }
  if (/royal commission station/.test(lower)) {
    const m = lower.match(/(.*?)\s*royal commission station/); const city = m?.[1] ? render(words(m[1])) : ''
    return ('محطة الهيئة الملكية' + (city ? ' ب' + city : '') + paren).trim()
  }
  if (/red sea welcome center/.test(lower)) return 'مركز استقبال البحر الأحمر' + paren
  cut(/\btrain station\b/, 'محطة قطار')
  if (!kind) cut(/\bbus station\b/, 'محطة')
  if (!kind) cut(/\bairport\b/, 'مطار')
  if (!kind) cut(/\bstation\b/, 'محطة')
  const body = render(words(rest)).replace(/\s+-\s+/g, ' - ').replace(/\s+/g, ' ').trim()
  const out = kind ? `${kind} ${body}` : body
  return (out + paren).trim()
}
