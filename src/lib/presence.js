// الحضور اللحظي: كل حساب مسجّل يعلن اتصاله على قناة Realtime Presence واحدة، وصفحة الموظفين تقرأ حالتها.
// الحمولة بدون أسماء (معرّف الحساب + المحطة + الدور فقط) حتى لا تكشف بيانات لمن يتنصّت على القناة.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const CHANNEL = 'nwbus-presence'
let ch = null
let me = null
let meta = null
let state = {}
const listeners = new Set()

const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible'

function compute() {
  const raw = ch?.presenceState?.() ?? {}
  const out = {}
  for (const [key, metas] of Object.entries(raw)) {
    const list = Array.isArray(metas) ? metas : []
    if (!list.length) continue
    // أكثر من جهاز/تبويب لنفس الحساب: نعتبره نشطاً إن كان أي واحد منها ظاهراً
    out[key] = {
      active: list.some(m => m.active !== false),
      since: Math.min(...list.map(m => m.at || Date.now())),
      devices: list.length,
      station_id: list[list.length - 1].station_id ?? null,
      path: list[list.length - 1].path ?? '',
    }
  }
  return out
}
function emit() { state = compute(); listeners.forEach(f => f(state)) }
const push = () => { if (ch && meta) ch.track({ ...meta, active: isVisible() }) }

export function startPresence(profile, path = '/') {
  if (!profile?.id) return
  if (ch && me === profile.id) return
  stopPresence()
  me = profile.id
  meta = { at: Date.now(), station_id: profile.station_id ?? null, role: profile.role ?? null, path }
  ch = supabase.channel(CHANNEL, { config: { presence: { key: profile.id } } })
  ch.on('presence', { event: 'sync' }, emit)
    .on('presence', { event: 'join' }, emit)
    .on('presence', { event: 'leave' }, emit)
    .subscribe(status => { if (status === 'SUBSCRIBED') push() })
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', push)
}
export function updatePresencePath(path) { if (meta && meta.path !== path) { meta = { ...meta, path }; push() } }
export function stopPresence() {
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', push)
  if (ch) { try { supabase.removeChannel(ch) } catch { /* بدون قناة */ } }
  ch = null; me = null; meta = null; state = {}
  listeners.forEach(f => f(state))
}
export function usePresence() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); setS(state); return () => { listeners.delete(setS) } }, [])
  return s
}
