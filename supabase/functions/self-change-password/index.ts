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

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const url = Deno.env.get('SUPABASE_URL') ?? ''

    // تحقق من هوية المُستدعي — أي مستخدم مسجّل دخول، مو أدمن فقط
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authErr } = await caller.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { current_password, new_password } = await req.json()
    if (!current_password || !new_password || new_password.length < 6) {
      return json({ error: 'Invalid parameters' }, 400)
    }

    const { data: callerProfile } = await caller
      .from('users')
      .select('id, username')
      .eq('auth_id', user.id)
      .single()
    if (!callerProfile) return json({ error: 'Profile not found' }, 404)

    // تحقق من كلمة المرور الحالية بمحاولة دخول منفصلة — بدون المساس بجلسة المستخدم الفعلية
    const verifier = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: verifyErr } = await verifier.auth.signInWithPassword({
      email: `${callerProfile.username}@nwbus.sa`,
      password: current_password,
    })
    if (verifyErr) return json({ error: 'Current password is incorrect' }, 401)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false },
    })
    const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { password: new_password })
    if (updateErr) throw updateErr

    // كلمة المرور صارت من اختيار الموظف نفسه — تُمسح النسخة اللي كان الأدمن يقدر يشوفها
    await admin.from('users').update({ login_password: null }).eq('id', callerProfile.id)

    // إشعار للموظف نفسه يؤكد إن كلمة مروره تغيّرت
    await admin.from('notifications').insert({
      user_id: callerProfile.id,
      type: 'info',
      title: 'تم تغيير كلمة المرور',
      body: 'تم تغيير كلمة مرور حسابك بنجاح. إذا لم تكن أنت من قام بهذا، تواصل مع الإدارة فوراً.',
    })

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
