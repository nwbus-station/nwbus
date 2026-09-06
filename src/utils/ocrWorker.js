// عامل tesseract مشترك لماسح رقم التذكرة — يُنشأ مرة واحدة فقط ويبقى شغّال طول الجلسة
// (بدل إنشاء عامل جديد بكل فتح للماسح)، لأن تحميل وتهيئة tesseract.js تاخذ ثانية أو أكثر
// بحد ذاتها، وهذا كان يضيف تأخير حقيقي فوق وقت القراءة نفسه في كل مرة يفتح فيها العميل الكاميرا.
let workerPromise = null

export function getTicketOCRWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      const w = await createWorker('eng', 1, { logger: () => {} })
      await w.setParameters({ tessedit_char_whitelist: '0123456789:/W', tessedit_pageseg_mode: '6' })
      return w
    })().catch(err => { workerPromise = null; throw err })
  }
  return workerPromise
}

// استدعِها بأقرب وقت ممكن (مثلاً عند فتح صفحة التقييم) حتى يكون العامل جاهزاً
// قبل ما العميل يضغط زر الكاميرا أصلاً
export function warmUpTicketOCR() {
  getTicketOCRWorker().catch(() => {})
}
