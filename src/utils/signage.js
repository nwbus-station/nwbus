// أدوات قسم شاشات المحطات (Signage): روابط الملفات، التحقق من الرفع، أسماء الحالات، وترجمة أخطاء القاعدة
export const SG_BUCKET = 'signage'
export const MAX_VIDEO = 200 * 1024 * 1024
export const MAX_IMAGE = 15 * 1024 * 1024
export const ONLINE_MS = 150000          // الشاشة تُعدّ متصلة إن ظهرت خلال آخر دقيقتين ونصف

export const mediaUrl = path => `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${SG_BUCKET}/${path}`

const TYPES = {
  'video/mp4': { kind: 'video', ext: 'mp4' }, 'video/webm': { kind: 'video', ext: 'webm' },
  'image/jpeg': { kind: 'image', ext: 'jpg' }, 'image/png': { kind: 'image', ext: 'png' }, 'image/webp': { kind: 'image', ext: 'webp' },
}
export const ACCEPT = Object.keys(TYPES).join(',')

const mb = n => `${Math.round(n / 1048576)}MB`
export function validateFile(file, isAr = true) {
  const t = TYPES[file?.type]
  if (!t) return { error: isAr ? 'النوع غير مدعوم. المسموح: MP4 وWebM للفيديو، وJPG وPNG وWebP للصور' : 'Unsupported type. Allowed: MP4/WebM video, JPG/PNG/WebP images' }
  const max = t.kind === 'video' ? MAX_VIDEO : MAX_IMAGE
  if (file.size > max) return { error: isAr ? `الحجم أكبر من الحد (${mb(max)})` : `File exceeds the ${mb(max)} limit` }
  if (file.size < 1) return { error: isAr ? 'الملف فارغ' : 'Empty file' }
  return { kind: t.kind, ext: t.ext }
}

// مدة الفيديو الحقيقية بالثواني (تُحفظ ليعرف المشغّل متى ينتقل)
export function readVideoDuration(file) {
  return new Promise(resolve => {
    const v = document.createElement('video'); const url = URL.createObjectURL(file)
    const done = d => { URL.revokeObjectURL(url); resolve(d) }
    v.preload = 'metadata'; v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.max(1, Math.min(1800, Math.round(v.duration))) : 30)
    v.onerror = () => done(30); v.src = url
    setTimeout(() => done(30), 8000)
  })
}

export const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('')
export const newFileName = ext => `${crypto.randomUUID()}.${ext}`

export const isOnline = d => d?.status === 'active' && !!d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < ONLINE_MS

// تاريخ ميلادي ووقت 24 ساعة بتوقيت السعودية
export function fmtDT(x) {
  if (!x) return '—'
  return new Date(x).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}
export function ago(x, isAr = true) {
  if (!x) return isAr ? 'لم تتصل بعد' : 'never'
  const s = Math.max(0, Math.round((Date.now() - new Date(x).getTime()) / 1000))
  if (s < 60) return isAr ? 'الآن' : 'now'
  if (s < 3600) return isAr ? `قبل ${Math.floor(s / 60)} د` : `${Math.floor(s / 60)}m ago`
  if (s < 86400) return isAr ? `قبل ${Math.floor(s / 3600)} س` : `${Math.floor(s / 3600)}h ago`
  return isAr ? `قبل ${Math.floor(s / 86400)} يوم` : `${Math.floor(s / 86400)}d ago`
}
export const fmtSize = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)
export const fmtDur = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export const DAYS = [
  { v: 0, ar: 'الأحد', en: 'Sun' }, { v: 1, ar: 'الاثنين', en: 'Mon' }, { v: 2, ar: 'الثلاثاء', en: 'Tue' }, { v: 3, ar: 'الأربعاء', en: 'Wed' },
  { v: 4, ar: 'الخميس', en: 'Thu' }, { v: 5, ar: 'الجمعة', en: 'Fri' }, { v: 6, ar: 'السبت', en: 'Sat' },
]
export const minToStr = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const strToMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0) }

export const CAMP_STATUS = {
  draft:    { ar: 'مسودة',          en: 'Draft',     color: '#64748b' },
  pending:  { ar: 'بانتظار الموافقة', en: 'Pending',   color: '#d97706' },
  approved: { ar: 'منشورة',         en: 'Live',      color: '#16a34a' },
  rejected: { ar: 'مرفوضة',         en: 'Rejected',  color: '#dc2626' },
  paused:   { ar: 'موقوفة',         en: 'Paused',    color: '#6366f1' },
}
export const AUDIT_LABEL = {
  'device.pair': 'ربط شاشة', 'device.update': 'تعديل شاشة', 'device.revoke': 'إيقاف شاشة', 'device.delete': 'حذف شاشة',
  'media.add': 'رفع محتوى', 'media.delete': 'حذف محتوى',
  'campaign.create': 'إنشاء حملة', 'campaign.update': 'تعديل حملة', 'campaign.submit': 'نشر/تقديم حملة', 'campaign.approve': 'موافقة على حملة',
  'campaign.reject': 'رفض حملة', 'campaign.pause': 'إيقاف حملة مؤقتاً', 'campaign.delete': 'حذف حملة',
  'emergency.on': 'تفعيل رسالة الطوارئ', 'emergency.off': 'إيقاف رسالة الطوارئ',
}

const MSG = {
  'not allowed': ['ليس لديك صلاحية لهذا الإجراء', 'You are not allowed to do this'],
  'invalid or expired code': ['الرمز غير صحيح أو انتهت صلاحيته (10 دقائق). أعد تشغيل الشاشة للحصول على رمز جديد', 'Invalid or expired code. Restart the screen to get a new one'],
  'name required': ['الاسم مطلوب', 'Name required'], 'title required': ['العنوان مطلوب', 'Title required'], 'media required': ['اختر المحتوى', 'Pick the media'],
  'stations required': ['اختر محطة واحدة على الأقل', 'Pick at least one station'], 'devices required': ['اختر شاشة واحدة على الأقل', 'Pick at least one screen'],
  'bad dates': ['تاريخ النهاية يجب أن يكون بعد البداية', 'End must be after start'], 'bad time window': ['حدّد وقت البداية والنهاية معاً', 'Set both start and end time'],
  'bad state': ['الحالة الحالية لا تسمح بهذا الإجراء', 'Not possible in the current state'], 'media in use': ['المحتوى مستخدم في حملة. احذف الحملة أولاً', 'Media is used by a campaign. Delete the campaign first'],
  'creator cannot review': ['لا يمكنك الموافقة على حملة أنشأتها بنفسك', 'You cannot review your own campaign'], 'note required': ['اكتب سبب الرفض', 'Enter a reason'],
  'message required': ['اكتب رسالة الطوارئ', 'Enter the emergency message'], 'device limit': ['بلغ الحد الأقصى للشاشات', 'Device limit reached'],
  'bad video': ['الفيديو غير مقبول (النوع أو الحجم)', 'Video rejected (type or size)'], 'bad image': ['الصورة غير مقبولة (النوع أو الحجم)', 'Image rejected (type or size)'],
  'bad path': ['مسار الملف غير صالح', 'Invalid file path'], 'not found': ['العنصر غير موجود', 'Not found'],
}
export function sgError(error, isAr = true) {
  const m = String(error?.message || error || '')
  if (/function .* does not exist|schema cache|relation .* does not exist/i.test(m)) return isAr ? 'لم يُجهَّز قسم الشاشات بعد: شغّل ملف SQL «027» في Supabase' : 'Run the 027 SQL file in Supabase first'
  const k = Object.keys(MSG).find(x => m.includes(x))
  return k ? MSG[k][isAr ? 0 : 1] : (isAr ? 'تعذّر تنفيذ الإجراء، حاول مرة أخرى' : 'Action failed, try again')
}

// تاريخ ووقت بتوقيت السعودية (UTC+3 بدون توقيت صيفي) ⇄ ISO
export const toRiyadhISO = (date, time) => (date ? `${date}T${time || '00:00'}:00+03:00` : null)
export function fromRiyadhISO(iso) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString()
  return { date: d.slice(0, 10), time: d.slice(11, 16) }
}
export function scopeLabel(c, stationsById, devicesById, isAr = true) {
  if (c.scope === 'all') return isAr ? 'كل الشاشات' : 'All screens'
  if (c.scope === 'stations') {
    const n = (c.station_ids || []).map(id => stationsById[id]).filter(Boolean)
    return n.length <= 2 ? n.join('، ') : (isAr ? `${n.length} محطات` : `${n.length} stations`)
  }
  const n = (c.device_ids || []).map(id => devicesById[id]?.name).filter(Boolean)
  return n.length <= 2 ? n.join('، ') : (isAr ? `${n.length} شاشات` : `${n.length} screens`)
}
export function scheduleLabel(c, isAr = true) {
  const parts = []
  if (c.starts_at || c.ends_at) parts.push(`\u2066${c.starts_at ? fmtDT(c.starts_at).slice(0, 10) : '…'} → ${c.ends_at ? fmtDT(c.ends_at).slice(0, 10) : '…'}\u2069`)
  if (c.days?.length && c.days.length < 7) parts.push(c.days.map(d => DAYS[d][isAr ? 'ar' : 'en']).join('، '))
  if (c.from_min != null) parts.push(`\u2066${minToStr(c.from_min)}–${minToStr(c.to_min)}\u2069`)
  return parts.length ? parts.join(' · ') : (isAr ? 'دائمة' : 'Always')
}
