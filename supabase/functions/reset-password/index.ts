import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    // تحقق من هوية المُستدعي باستخدام الـ anon key
    const caller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authErr } = await caller.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    // تحقق من الدور — فقط general_admin أو station_admin
    const { data: profile } = await caller
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (!profile || !['general_admin', 'station_admin'].includes(profile.role)) {
      return json({ error: 'Forbidden' }, 403)
    }

    const { auth_id, new_password } = await req.json()
    if (!auth_id || !new_password || new_password.length < 6) {
      return json({ error: 'Invalid parameters' }, 400)
    }

    // المفتاح يُقرأ من بيئة الخادم فقط — لا يصل إليه المتصفح
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { error } = await admin.auth.admin.updateUserById(auth_id, { password: new_password })
    if (error) throw error

    return json({ success: true })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
