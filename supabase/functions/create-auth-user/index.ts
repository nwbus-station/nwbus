import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// إنشاء حساب مصادقة لموظف جديد من الخادم (admin API) — يسمح لنا نقفل "التسجيل العام" بالكامل بـSupabase Auth
const ADMIN_ROLES = ['general_admin', 'stations_executive_director', 'assistant_stations_executive_director']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const caller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authErr } = await caller.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile } = await caller.from('users').select('role, is_active').eq('auth_id', user.id).single()
    if (!profile || profile.is_active === false) return json({ error: 'Forbidden' }, 403)
    const isAdmin = ADMIN_ROLES.includes(profile.role)
    if (!isAdmin && profile.role !== 'station_admin') return json({ error: 'Forbidden' }, 403)

    const { data: restricted } = await caller.rpc('is_restricted')
    if (restricted === true) return json({ error: 'Forbidden' }, 403)

    const { username, password } = await req.json()
    const uname = String(username ?? '').toLowerCase().trim()
    if (!/^[a-z0-9._-]{2,40}$/.test(uname)) return json({ error: 'Invalid username' }, 400)
    if (typeof password !== 'string' || password.length < 6 || password.length > 72) return json({ error: 'Invalid password' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )
    const { data, error } = await admin.auth.admin.createUser({
      email: `${uname}@nwbus.sa`, password, email_confirm: true,
    })
    if (error) {
      if (/already|exists|registered/i.test(error.message || '') || (error as { code?: string }).code === 'email_exists') {
        return json({ error: 'exists' }, 409)
      }
      return json({ error: error.message }, 400)
    }
    return json({ auth_id: data.user.id })
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
