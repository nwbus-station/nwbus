// الإرساليات: ثوابت وتنسيق وأخطاء مترجمة (التاريخ ميلادي والوقت 24 ساعة بتوقيت الرياض دائماً)
export const DISPATCH_KINDS = {
  found: { ar: 'موجودات', en: 'Found items', color: '#16a34a', bg: 'rgba(22,163,74,0.14)' },
  lost: { ar: 'مفقودات', en: 'Lost items', color: '#d97706', bg: 'rgba(217,119,6,0.15)' },
  shipment: { ar: 'شحنة', en: 'Shipment', color: '#7c3aed', bg: 'rgba(124,58,237,0.14)' },
}

// تصعيد: 1 = تنبيه لموظفي المحطة (تأخر) · 2 = وصل للإدارة والمشرفين
export const ESCALATION = {
  1: { ar: 'متأخرة', en: 'Overdue', color: '#d97706', bg: 'rgba(217,119,6,0.16)' },
  2: { ar: 'مُصعّدة للإدارة', en: 'Escalated', color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
}

export const DISPATCH_STATUS = {
  in_transit: { ar: 'في الطريق', en: 'In transit', color: '#2563eb', bg: 'rgba(37,99,235,0.13)' },
  awaiting_leg2: { ar: 'بانتظار إرسال الخط الثاني', en: 'Awaiting 2nd leg', color: '#d97706', bg: 'rgba(217,119,6,0.15)' },
  received: { ar: 'تم الاستلام', en: 'Received', color: '#16a34a', bg: 'rgba(22,163,74,0.14)' },
  rejected: { ar: 'مرفوضة', en: 'Rejected', color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
}

export const LEG_STATUS = {
  pending: { ar: 'لم تُرسل بعد', en: 'Not sent yet', color: '#94a3b8' },
  sent: { ar: 'في الطريق', en: 'In transit', color: '#2563eb' },
  received: { ar: 'تم الاستلام', en: 'Received', color: '#16a34a' },
  rejected: { ar: 'مرفوض', en: 'Rejected', color: '#dc2626' },
}

export const REQUEST_STATUS = {
  open: { ar: 'مفتوح', en: 'Open', color: '#d97706', bg: 'rgba(217,119,6,0.15)' },
  fulfilled: { ar: 'نُفِّذ', en: 'Fulfilled', color: '#16a34a', bg: 'rgba(22,163,74,0.14)' },
  dismissed: { ar: 'مُغلق', en: 'Dismissed', color: '#64748b', bg: 'rgba(100,116,139,0.14)' },
}

const RIYADH = { timeZone: 'Asia/Riyadh' }
// 11/11/2026 — ميلادي
export const fmtDate = iso => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-GB', { ...RIYADH, day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return '—' }
}
// 18:32 — نظام 24 ساعة
export const fmtTime = iso => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleTimeString('en-GB', { ...RIYADH, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) } catch { return '—' }
}
export const fmtStamp = iso => (iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : '—')

export const stName = (map, id) => (id ? (map[id] || '—') : '—')

// ترجمة أخطاء الخادم لرسائل مفهومة
export function dispatchError(e) {
  const m = String(e?.message || e || '')
  // «لم يُجهَّز» فقط عندما تكون دالة/جدول الإرساليات نفسه غير موجود؛ باقي الأخطاء تُعرض كما هي (لا نخفي السبب الحقيقي)
  if (/could not find the function public\.dispatch|could not find the table 'public\.dispatch|relation "?(public\.)?dispatch\w*"? does not exist/i.test(m)) return 'SETUP'
  if (typeof console !== 'undefined') console.error('[dispatch]', e)
  const map = [
    [/only supervisors can reject/i, 'الرفض للمشرفين والأدمن فقط'],
    [/not allowed for this station/i, 'لا تملك صلاحية على هذه المحطة'],
    [/not allowed/i, 'غير مصرّح لك بهذا الإجراء'],
    [/bus number required/i, 'أدخل رقم الحافلة'],
    [/items required/i, 'أضف غرضاً واحداً على الأقل'],
    [/bad route/i, 'مسار الإرسالية غير صحيح: المحطتان لا يجوز أن تتطابقا'],
    [/bad second leg/i, 'محطة الخط الثاني لا يجوز أن تكون نفس محطات الخط الأول'],
    [/leg is not in transit/i, 'هذا الخط ليس في الطريق (استُلم مسبقاً أو لم يُرسل)'],
    [/leg already sent/i, 'هذا الخط أُرسل مسبقاً'],
    [/previous leg not received/i, 'لا يمكن إرسال الخط الثاني قبل استلام الأول'],
    [/request already open/i, 'يوجد طلب إرسال مفتوح لهذا الغرض إلى نفس المحطة'],
    [/bad destination/i, 'اختر محطة مختلفة عن المحطة التي فيها الغرض'],
    [/item has no station/i, 'هذا الغرض غير مرتبط بمحطة'],
    [/request already handled/i, 'هذا الطلب عولج مسبقاً'],
    [/empty note/i, 'اكتب الملاحظة أولاً'],
    [/note required/i, 'اكتب سبب الملاحظة عند الاستلام بملاحظات'],
    [/reason required/i, 'اكتب سبب التصعيد'],
    [/bad condition/i, 'حالة الاستلام غير صحيحة'],
    [/bad priority/i, 'أولوية غير صحيحة'],
  ]
  for (const [re, t] of map) if (re.test(m)) return t
  return (e?.details || e?.hint) ? `${m} (${[e.details, e.hint].filter(Boolean).join(' — ')})` : (m || 'حدث خطأ غير متوقع')
}

// حالة خط واحد للعرض: هل أنا أستطيع الاستلام/الإرسال
export const sortLegs = d => [...(d.legs || [])].sort((a, b) => a.leg_no - b.leg_no)

// منذ كم؟ «3 س 20 د» / «45 د» / «2 يوم»
export function ageLabel(iso, isAr = true) {
  if (!iso) return '—'
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return isAr ? `${m} د` : `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return isAr ? `${h} س ${m % 60} د` : `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return isAr ? `${d} يوم ${h % 24} س` : `${d}d ${h % 24}h`
}

// يستخرج مُعرّف الإرسالية من محتوى QR: رابط فيه ?d=<uuid> أو رقم تذكرة NWD-000123 أو uuid مباشر
export function parseDispatchCode(raw) {
  const s = toLatinDigits(String(raw || '')).trim()
  if (!s) return null
  const u = s.match(/[?&]d=([0-9a-f-]{36})/i); if (u) return { id: u[1] }
  const t = s.match(/NWD-?\s*(\d{1,8})/i); if (t) return { ticket: 'NWD-' + String(t[1]).padStart(6, '0') }
  const g = s.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i); if (g) return { id: s }
  const n = s.match(/^\d{1,8}$/); if (n) return { ticket: 'NWD-' + s.padStart(6, '0') }
  return null
}

// أرقام عربية/هندية ← إنجليزية (رقم الحافلة والجوال)
export const toLatinDigits = v => String(v ?? '').replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776)

// الإرسالية فعّالة (لم تُستلم ولم تُرفض)
export const isActiveDispatch = d => d.status !== 'received' && d.status !== 'rejected'
