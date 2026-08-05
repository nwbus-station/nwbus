// Cache that survives component unmounts (module-level, not component state)
const store = {}

export function getCached(key) {
  return store[key] ?? null
}

export function setCached(key, value) {
  store[key] = value
}

export function clearCached(key) {
  delete store[key]
}

// React hook: returns [data, setData] where data is pre-populated from cache
// When component mounts, shows cached data immediately, then re-fetches in background
import { useState, useEffect, useRef } from 'react'

export function useCached(key, fetcher, deps = []) {
  const [data, setData] = useState(() => getCached(key))
  const [loading, setLoading] = useState(!getCached(key))
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!getCached(key)) setLoading(true)
      try {
        const result = await fetcher()
        if (!cancelled && mountedRef.current) {
          setCached(key, result)
          setData(result)
        }
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, deps)

  return [data, loading, setData]
}
