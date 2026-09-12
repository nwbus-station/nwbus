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

    // تحقق من الدور — فقط general_admin
    const { data: callerProfile } = await caller
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'general_admin') {
      return json({ error: 'Forbidden' }, 403)
    }

    const { employee_id, redirect_to } = await req.json()
    if (!employee_id || !redirect_to) return json({ error: 'Invalid parameters' }, 400)

    // المفتاح يُقرأ من بيئة الخادم فقط — لا يصل إليه المتصفح
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { data: employee, error: empErr } = await admin
      .from('users')
      .select('username, full_name_ar, email, auth_id')
      .eq('id', employee_id)
      .single()

    if (empErr || !employee) return json({ error: 'Employee not found' }, 404)
    if (!employee.email) return json({ error: 'Employee has no email on file' }, 400)

    // رابط تعيين كلمة المرور — يولّده Supabase نفسه (آمن، مؤقت، صالح لمرة واحدة)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: `${employee.username}@nwbus.sa`,
      options: { redirectTo: redirect_to },
    })
    if (linkErr) throw linkErr
    const actionLink = linkData.properties?.action_link
    if (!actionLink) throw new Error('Failed to generate activation link')

    const fromAddress = Deno.env.get('RESEND_FROM_EMAIL') || 'NWBUS <onboarding@resend.dev>'

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [employee.email],
        subject: 'تفعيل حسابك بنظام NWBUS',
        html: `
          <div dir="rtl" style="font-family: sans-serif; max-width: 480px; margin: auto;">
            <h2>مرحباً ${employee.full_name_ar}</h2>
            <p>تم إنشاء حسابك بنظام NWBUS. اضغط الزر أدناه لتعيين كلمة مرورك وتفعيل الحساب.</p>
            <p><a href="${actionLink}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">تعيين كلمة المرور</a></p>
            <p style="color:#888;font-size:12px;">اسم المستخدم: ${employee.username}@nwbus.sa</p>
          </div>
        `,
      }),
    })

    if (!emailRes.ok) {
      const errBody = await emailRes.text()
      throw new Error(`Resend error: ${errBody}`)
    }

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
