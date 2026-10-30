import { useEffect } from 'react'

// يمنع تمرير الصفحة الخلفية طالما النافذة مفتوحة (يعمل على آيفون وأندرويد):
// تثبيت الجسم مع حفظ موضع التمرير واستعادته، وتعويض عرض شريط التمرير بالمكتب حتى لا تهتز الصفحة.
// عدّاد: النوافذ المتداخلة لا تُفك الحجز قبل إغلاق آخرها.
let locks = 0
let saved = null
export function useBodyScrollLock() {
  useEffect(() => {
    if (locks++ === 0) {
      const b = document.body, de = document.documentElement
      const y = window.scrollY
      const gutter = Math.max(0, window.innerWidth - de.clientWidth)
      saved = { y, cssText: b.style.cssText }
      b.style.position = 'fixed'; b.style.top = `-${y}px`; b.style.left = '0'; b.style.right = '0'; b.style.width = '100%'; b.style.overflow = 'hidden'
      if (gutter) b.style.paddingRight = `${gutter}px`
    }
    return () => {
      if (--locks === 0 && saved) {
        document.body.style.cssText = saved.cssText
        window.scrollTo(0, saved.y)
        saved = null
      }
    }
  }, [])
}
