import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// تغيير اسم المستخدم (يُستخدم للدخول: username@nwbus.sa) من الخادم فقط — يحدّث حساب المصادقة وجدول users معاً
// نفس ضوابط reset-password: أدمن أي صلاحية، ومشرف المحطة للموظفين والمحاسبين فقط، والحساب المقيّد ممنوع
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

    const { auth_id, new_username } = await req.json()
    const uname = String(new_username ?? '').toLowerCase().trim()
    if (!auth_id || !/^[a-z0-9._-]{2,40}$/.test(uname)) return json({ error: 'Invalid parameters' }, 400)

    // مشرف المحطة يغيّر فقط اسم مستخدم الموظفين والمحاسبين
    if (!isAdmin) {
      const { data: target } = await caller.from('users').select('role').eq('auth_id', auth_id).single()
      if (!target || !['station_employee', 'accountant'].includes(target.role)) return json({ error: 'Forbidden' }, 403)
    }

    // المفتاح الخادمي يُقرأ من بيئة الخادم فقط — لا يصل للمتصفح
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { data: row } = await admin.from('users').select('id, username').eq('auth_id', auth_id).maybeSingle()
    if (!row) return json({ error: 'User not found' }, 404)
    if (row.username === uname) return json({ success: true, username: uname })

    // التفرّد: لا يوجد موظف آخر بنفس الاسم
    const { data: clash } = await admin.from('users').select('id').eq('username', uname).neq('auth_id', auth_id).maybeSingle()
    if (clash) return json({ error: 'exists' }, 409)

    const oldEmail = `${row.username}@nwbus.sa`
    const newEmail = `${uname}@nwbus.sa`
    const { error: aErr } = await admin.auth.admin.updateUserById(auth_id, { email: newEmail, email_confirm: true })
    if (aErr) {
      if (/already|exists|registered/i.test(aErr.message || '') || (aErr as { code?: string }).code === 'email_exists') return json({ error: 'exists' }, 409)
      return json({ error: aErr.message }, 400)
    }

    const { error: uErr } = await admin.from('users').update({ username: uname }).eq('auth_id', auth_id)
    if (uErr) {
      // تراجع: نعيد بريد المصادقة القديم حتى لا يبقى الحساب بوجهين
      await admin.auth.admin.updateUserById(auth_id, { email: oldEmail, email_confirm: true })
      if (/duplicate|unique/i.test(uErr.message || '')) return json({ error: 'exists' }, 409)
      return json({ error: uErr.message }, 400)
    }

    return json({ success: true, username: uname })
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
