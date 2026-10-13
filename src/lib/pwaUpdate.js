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
  // فحص النسخة: بعد الفتح بثوانٍ، وعند كل رجوع للتطبيق، وعند عودة الشبكة، وكل 3 دقائق
  setTimeout(() => checkAppVersion('open'), 4000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkAppVersion('resume') })
  window.addEventListener('pageshow', e => { if (e.persisted) checkAppVersion('resume') })
  window.addEventListener('online', () => checkAppVersion('resume'))
  setInterval(() => { if (document.visibilityState === 'visible') checkAppVersion('poll') }, 3 * 60 * 1000)
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

export function isPwaUpdatePending() { return pending }

export function onPwaUpdateAvailable(cb) {
  listeners.push(cb)
  return () => { listeners = listeners.filter(l => l !== cb) }
}

export function applyPwaUpdate() {
  // حماية من حلقة إعادة تحميل (مثلاً لو وصلت صفحة قديمة من كاش الحافة): لا أكثر من مرة كل دقيقة تلقائياً
  try {
    const last = Number(sessionStorage.getItem('nw_auto_reload') || 0)
    if (Date.now() - last < 60 * 1000) return
    sessionStorage.setItem('nw_auto_reload', String(Date.now()))
  } catch { /* بدون sessionStorage */ }
  try { updateSWFn?.(true) } catch { /* بدون SW */ }
  // التحديث الفعلي = إعادة تحميل الصفحة (تطبيق الشاشة الرئيسية لا يعيد التحميل لوحده)
  setTimeout(() => window.location.reload(), 250)
}

// تحديث يدوي فوري (زر التحديث / السحب للأسفل)
export function hardRefresh() {
  try { updateSWFn?.(true) } catch { /* بدون SW */ }
  window.location.reload()
}

// فحص النسخة: يقارن رقم النسخة الحالية بما على الخادم (/version.json) — لا يعتمد على ملف الـ Service Worker
let checking = false
export async function checkAppVersion(cause = 'poll') {
  if (checking || typeof __APP_VERSION__ === 'undefined' || __APP_VERSION__ === 'dev') return
  checking = true
  try {
    const r = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' })
    if (!r.ok) return
    const { v } = await r.json()
    if (v && v !== __APP_VERSION__) {
      pending = true
      listeners.forEach(cb => cb())
      // رجوع المستخدم للتطبيق من الخلفية: نطبّق فوراً ما لم يكن يكتب في حقل
      const a = document.activeElement
      const typing = a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)
      if (cause === 'resume' && !typing) applyPwaUpdate()
    }
  } catch { /* بدون شبكة */ } finally { checking = false }
}
