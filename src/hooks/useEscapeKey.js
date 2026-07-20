import { useEffect } from 'react'

export function useEscapeKey(onClose) {
  useEffect(() => {
    if (!onClose) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
}
