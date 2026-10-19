import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// نداء الركاب بصوت بشري واقعي عبر ElevenLabs — المفتاح يُقرأ من بيئة الخادم فقط،
// لا يصل إليه المتصفح أبداً. التحقق من الصلاحية يتم هنا أيضاً (من القاعدة) وليس فقط بالواجهة.
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

    const { data: profile } = await caller.from('users').select('role').eq('auth_id', user.id).single()
    if (!profile) return json({ error: 'Forbidden' }, 403)

    let allowed = ADMIN_ROLES.includes(profile.role)
    if (!allowed) {
      const { data: restricted } = await caller.rpc('is_restricted')
      if (restricted === true) {
        const { data: cap } = await caller.rpc('title_cap', { k: 'pa_calls_manage', dflt: false })
        allowed = cap === true
      } else {
        const { data: rp } = await caller.from('role_permissions').select('permissions').eq('role', profile.role).maybeSingle()
        allowed = rp?.permissions?.module_access?.pa_calls === true
      }
    }
    if (!allowed) return json({ error: 'Forbidden' }, 403)

    const { text, savePath } = await req.json()
    if (!text || typeof text !== 'string' || !text.trim()) return json({ error: 'Missing text' }, 400)
    if (text.length > 500) return json({ error: 'Text too long' }, 400)
    // savePath: لتوليد مقطع ثابت وحفظه بمكتبة النداء — يُقيَّد بمجلدين محدّدين لمنع الكتابة بأي مسار آخر
    if (savePath !== undefined && (typeof savePath !== 'string' || !/^(stations|phrases)\/[\w.-]+\.mp3$/.test(savePath))) {
      return json({ error: 'Invalid savePath' }, 400)
    }

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY')
    if (!apiKey) return json({ error: 'TTS not configured' }, 500)
    // Adam — صوت رجالي يدعم العربي عبر النموذج متعدد اللغات، قابل للتغيير بمتغيّر بيئة
    const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || 'pNInz6obpgDQGcFmaJgB'

    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: 'eleven_multilingual_v2',
        // ثبات أعلى يقلل بلع/تقطيع الحروف بالعربي (أقل تعبيرية لكن نطق أوضح وأدق)
        voice_settings: { stability: 0.85, similarity_boost: 0.85, style: 0, use_speaker_boost: true },
      }),
    })

    if (!ttsRes.ok) {
      const detail = await ttsRes.text()
      return json({ error: `ElevenLabs: ${detail}` }, 502)
    }

    const audio = await ttsRes.arrayBuffer()

    if (savePath) {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
      )
      const { error: upErr } = await admin.storage.from('audio-clips').upload(savePath, audio, {
        contentType: 'audio/mpeg', upsert: true,
      })
      if (upErr) return json({ error: upErr.message }, 500)
      const { data } = admin.storage.from('audio-clips').getPublicUrl(savePath)
      return json({ url: data.publicUrl })
    }

    return new Response(audio, { status: 200, headers: { ...CORS, 'Content-Type': 'audio/mpeg' } })
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
