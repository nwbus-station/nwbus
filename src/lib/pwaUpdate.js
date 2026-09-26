import { registerSW } from 'virtual:pwa-register'

// إشعار تحديث بدل تحديث صامت — الموظف يضغط "تحديث الآن" وقت ما يناسبه، بدل ما يفقد
// عمل غير محفوظ برجوع تلقائي مفاجئ، وبدل ما يحتاج يسأل الأدمن "أسوي تحديث كامل؟"
let updateSWFn = null
let listeners = []
let pending = false
let lastActivity = Date.now()

// تحديث تلقائي بدون ما يضطر الموظف يضغط شي: لو رجع للتطبيق بعد ما كان بالخلفية، أو ما لمس الشاشة
// دقيقتين — نطبّق النسخة الجديدة. (لو كان يكتب ويشتغل، يبقى الإشعار بالأعلى لين يضغط أو يهدأ)
const IDLE_APPLY_MS = 2 * 60 * 1000
function autoApplyWatch() {
  ;['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, () => { lastActivity = Date.now() }, { passive: true }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pending) applyPwaUpdate()
  })
  setInterval(() => {
    if (pending && document.visibilityState === 'visible' && Date.now() - lastActivity > IDLE_APPLY_MS) applyPwaUpdate()
  }, 30 * 1000)
}

export function initPwaUpdate() {
  autoApplyWatch()
  updateSWFn = registerSW({
    onNeedRefresh() { pending = true; listeners.forEach(cb => cb()); if (document.visibilityState === 'hidden') applyPwaUpdate() },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // فحص فوري عند كل تحميل (مو بس كل ١٠ دقايق) — عشان تحديث الصفحة العادي يكتشف
      // النسخة الجديدة مباشرة بدل ما ينتظر الفحص الدوري
      registration.update()
      setInterval(() => registration.update(), 10 * 60 * 1000)
      // بالجوال، التطبيق غالباً ينتقل بالخلفية/الواجهة بدل إعادة تحميل حقيقية — نفحص
      // كل ما رجع المستخدم للتطبيق عشان ما ننتظر الفحص الدوري
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update()
      })
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
