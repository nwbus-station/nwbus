// بطاقة Google Wallet لرمز تقييم العميل الخاص بالموظف (رابط «حفظ في المحفظة» موقّع JWT)
// الاستدعاء: GET /functions/v1/wallet-google?token=<rating_token>  (انشرها مع --no-verify-jwt)
// الأسرار المطلوبة: GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL, GOOGLE_WALLET_SA_PRIVATE_KEY
//   واختيارياً: SITE_URL (الافتراضي https://www.nwstation.com)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const bad = (msg: string, status = 400) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let s = ''; bytes.forEach(b => { s += String.fromCharCode(b) })
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function signJwt(payload: Record<string, unknown>, privateKeyPem: string) {
  const body = privateKeyPem.replace(/\\n/g, '\n').replace(/-----(BEGIN|END) (RSA )?PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), pl = b64url(JSON.stringify(payload))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${pl}`))
  return `${head}.${pl}.${b64url(new Uint8Array(sig))}`
}
const ar = (value: string) => ({ defaultValue: { language: 'ar', value } })

Deno.serve(async (req) => {
  try {
    const token = new URL(req.url).searchParams.get('token') ?? ''
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return bad('رابط غير صالح')
    const issuer = Deno.env.get('GOOGLE_WALLET_ISSUER_ID'), saEmail = Deno.env.get('GOOGLE_WALLET_SA_EMAIL'), saKey = Deno.env.get('GOOGLE_WALLET_SA_PRIVATE_KEY')
    if (!issuer || !saEmail || !saKey) return bad('إعدادات Google Wallet غير مكتملة في الخادم', 500)
    const site = (Deno.env.get('SITE_URL') ?? 'https://www.nwstation.com').replace(/\/$/, '')

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: u } = await sb.from('users')
      .select('id, full_name_ar, job_number, can_rate_customers, is_active, station:station_id(name_ar)')
      .eq('rating_token', token).maybeSingle()
    if (!u || u.is_active === false || !u.can_rate_customers) return bad('البطاقة غير متاحة لهذا الحساب', 404)

    const ratingUrl = `${site}/rate/${token}`
    const station = (u.station as { name_ar?: string } | null)?.name_ar ?? ''
    const classId = `${issuer}.nwbus_rating_card`
    const objectId = `${issuer}.rating_${String(u.id).replace(/[^A-Za-z0-9_-]/g, '_')}`
    const claims = {
      iss: saEmail, aud: 'google', typ: 'savetowallet', iat: Math.floor(Date.now() / 1000), origins: [site],
      payload: {
        genericClasses: [{ id: classId }],
        genericObjects: [{
          id: objectId, classId, state: 'ACTIVE',
          cardTitle: ar('بطاقة تقييم الخدمة'),
          header: ar(u.full_name_ar ?? ''),
          subheader: ar(station || 'NORTH WEST BUS'),
          textModulesData: [{ id: 'job', header: 'الرقم الوظيفي', body: u.job_number ? String(u.job_number) : '—' }, { id: 'hint', header: 'التقييم', body: 'امسح الرمز ليقيّم العميل خدمتك' }],
          barcode: { type: 'QR_CODE', value: ratingUrl, alternateText: 'امسح لتقييم الخدمة' },
          hexBackgroundColor: '#1C2B4A',
          logo: { sourceUri: { uri: `${site}/wallet/icon-512.png` }, contentDescription: ar('NW') },
        }],
      },
    }
    const jwt = await signJwt(claims, saKey)
    return new Response(null, { status: 302, headers: { Location: `https://pay.google.com/gp/v/save/${jwt}`, 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('wallet-google failed', e)
    return bad('تعذّر إنشاء البطاقة', 500)
  }
})
