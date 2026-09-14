import { registerSW } from 'virtual:pwa-register'

// إشعار تحديث بدل تحديث صامت — الموظف يضغط "تحديث الآن" وقت ما يناسبه، بدل ما يفقد
// عمل غير محفوظ برجوع تلقائي مفاجئ، وبدل ما يحتاج يسأل الأدمن "أسوي تحديث كامل؟"
let updateSWFn = null
let listeners = []

export function initPwaUpdate() {
  updateSWFn = registerSW({
    onNeedRefresh() { listeners.forEach(cb => cb()) },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // فحص فوري عند كل تحميل (مو بس كل ١٠ دقايق) — عشان تحديث الصفحة العادي يكتشف
      // النسخة الجديدة مباشرة بدل ما ينتظر الفحص الدوري
      registration.update()
      setInterval(() => registration.update(), 10 * 60 * 1000)
    },
  })
}

export function onPwaUpdateAvailable(cb) {
  listeners.push(cb)
  return () => { listeners = listeners.filter(l => l !== cb) }
}

export function applyPwaUpdate() {
  updateSWFn?.(true)
}
