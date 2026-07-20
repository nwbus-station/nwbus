import { supabase } from '../lib/supabase'

export async function createNotification({ userId, title, body, type = 'info', refType, refId }) {
  if (!userId) return
  await supabase.from('notifications').insert({
    user_id: userId, title, body: body || null,
    type, ref_type: refType || null, ref_id: refId || null,
  })
}

export async function notifyMany(userIds, payload) {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) return
  await supabase.from('notifications').insert(
    unique.map(uid => ({ user_id: uid, ...payload, body: payload.body || null, ref_type: payload.refType || null, ref_id: payload.refId || null }))
  )
}
