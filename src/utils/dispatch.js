// الإرساليات: ثوابت وتنسيق وأخطاء مترجمة (التاريخ ميلادي والوقت 24 ساعة بتوقيت الرياض دائماً)
export const DISPATCH_KINDS = {
  found: { ar: 'موجودات', en: 'Found items', color: '#16a34a', bg: 'rgba(22,163,74,0.14)' },
  lost: { ar: 'مفقودات', en: 'Lost items', color: '#d97706', bg: 'rgba(217,119,6,0.15)' },
}

export const DISPATCH_STATUS = {
  in_transit: { ar: 'في الطريق', en: 'In transit', color: '#2563eb', bg: 'rgba(37,99,235,0.13)' },
  awaiting_leg2: { ar: 'بانتظار إرسال الخط الثاني', en: 'Awaiting 2nd leg', color: '#d97706', bg: 'rgba(217,119,6,0.15)' },
  received: { ar: 'تم الاستلام', en: 'Received', color: '#16a34a', bg: 'rgba(22,163,74,0.14)' },
}

export const LEG_STATUS = {
  pending: { ar: 'لم تُرسل بعد', en: 'Not sent yet', color: '#94a3b8' },
  sent: { ar: 'في الطريق', en: 'In transit', color: '#2563eb' },
  received: { ar: 'تم الاستلام', en: 'Received', color: '#16a34a' },
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
  if (/could not find the function|does not exist|schema cache|relation .*dispatch/i.test(m)) return 'SETUP'
  const map = [
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
  ]
  for (const [re, t] of map) if (re.test(m)) return t
  return m || 'حدث خطأ غير متوقع'
}

// حالة خط واحد للعرض: هل أنا أستطيع الاستلام/الإرسال
export const sortLegs = d => [...(d.legs || [])].sort((a, b) => a.leg_no - b.leg_no)
