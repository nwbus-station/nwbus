import { useEffect } from 'react'

// يمنع تمرير الصفحة الخلفية طالما النافذة مفتوحة
export function useBodyScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
}
