// علامة «NEW» للأقسام الجديدة: تظهر أسبوعاً من أول مرة يراها المستخدم على جهازه ثم تختفي تلقائياً
const KEY = 'nw_new_first'
const WEEK = 7 * 24 * 3600 * 1000

let first = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} } })()

export function useIsNew(to, flag) {
  if (!flag) return false
  if (!first[to]) {
    first = { ...first, [to]: Date.now() }
    try { localStorage.setItem(KEY, JSON.stringify(first)) } catch { /* بدون تخزين */ }
  }
  return Date.now() - first[to] < WEEK
}
