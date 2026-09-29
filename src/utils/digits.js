/**
 * تحويل الأرقام العربية (٠١٢٣) والفارسية (۰۱۲۳) إلى لاتينية (0123).
 * تُستخدم في كل خانات الإدخال الرقمية حتى لو كتب المستخدم بالعربي.
 */
export function toLatinDigits(str) {
  if (str == null) return str
  return String(str)
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))   // عربية
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))   // فارسية
}

/**
 * تطبيع نص للبحث برقم وظيفي أو اسم: أرقام لاتينية + بدون أي مسافات (بادئة/تابعة/بين الأرقام)
 * + بحروف صغيرة — عشان البحث ما ينكسر لو كان بالرقم المخزّن مسافة زايدة من قبل (نسخ ولصق مثلاً).
 */
export function normSearch(str) {
  if (str == null) return ''
  return toLatinDigits(String(str)).replace(/\s+/g, '').toLowerCase()
}

/** هل يحتوي؟ (بعد تطبيع الطرفين) — الدالة الجاهزة للاستخدام المباشر بالفلاتر. */
export function matchesSearch(value, query) {
  if (!query) return true
  return normSearch(value).includes(normSearch(query))
}

/** تحويل الأرقام + إزالة الأصفار البادئة (لحقول الأعداد). */
export function cleanNumber(str) {
  const s = toLatinDigits(str).replace(/[^\d.]/g, '')
  return s.replace(/^0+(?=\d)/, '')
}

/** تنظيف النص من HTML قبل حقنه في document.write أو innerHTML. */
export function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
