// تاريخ محلي بصيغة YYYY-MM-DD — لا يستخدم UTC (toISOString) لتفادي فرق المنطقة الزمنية
// (في السعودية UTC+3 كان يرجّع تاريخ أمس في الساعات الأولى من اليوم)
export const toLocalDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const todayStr = () => toLocalDateStr()

// تاريخ اليوم بتوقيت الرياض (YYYY-MM-DD) — أو تاريخ لحظة معيّنة إن مُرّرت (كانت الدالة تتجاهل المعامل فيرجع كل تاريخ «اليوم»)
export const riyadhDay = (d) => (d ? new Date(d) : new Date()).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })
