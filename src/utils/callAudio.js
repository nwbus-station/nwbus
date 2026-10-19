// صوتيات نداء الركاب: نغمة، تشغيل مقاطع، صوت الجهاز، توليد ElevenLabs، ورسائل أخطاء مفهومة
import { supabase } from '../lib/supabase'
import { vocalize } from './arabicVocalize'

export const AUDIO_BUCKET = 'audio-clips'
// العبارتان الثابتتان في النداء
export const PHRASE_DEFS = [
  { key: 'intro', ar: 'عبارة المقدمة', text: 'نداء على الركاب المسافرين إلى' },
  { key: 'via', ar: 'عبارة «مروراً بـ»', text: 'مروراً بـ' },
]

export const clipUrl = path => supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl

// جملة النداء: السفر إلى المدينة، مروراً بالمدن
export function buildAnnouncement(destName, viaNames) {
  const via = viaNames.length ? ` مروراً بـ ${viaNames.join('، ')}` : ''
  return `نداء على الركاب المسافرين إلى ${destName}${via}.`
}

// النص المرسل للصوت البشري: مشكَّل لنطق أدق (وإن زاد عن حد الخادم 500 حرف نرسل الأصلي)
const speakable = text => { const v = vocalize(text); return v.length <= 480 ? v : text }

// رسائل أخطاء مفهومة بدل نصوص الخادم الخام
export function friendlyError(err) {
  const m = String(err?.message || err || '')
  if (/api_key|authentication_error|invalid_api_key|api_key_id_used/i.test(m)) return 'مفتاح ElevenLabs غير صحيح. احفظ المفتاح الكامل (يبدأ بـ sk_) في Supabase ← Edge Functions ← Secrets باسم ELEVENLABS_API_KEY.'
  if (/quota|exceeded|credits|characters? limit|payment/i.test(m)) return 'انتهى حدّ حسابك في ElevenLabs لهذا الشهر. رقّ الباقة أو انتظر التجديد.'
  if (/TTS not configured/i.test(m)) return 'مفتاح ElevenLabs غير مضبوط في Supabase (Secrets). أضف ELEVENLABS_API_KEY.'
  if (/missing_permissions|voices_write|permission/i.test(m)) return 'مفتاح ElevenLabs لا يملك صلاحية إضافة الأصوات. أنشئ مفتاحاً جديداً وفعّل Voices = Write ثم حدّث السر في Supabase.'
  if (/can_not_use_instant_voice_cloning|instant.*voice.*clon|subscription/i.test(m)) return 'خطة ElevenLabs الحالية لا تدعم استنساخ الأصوات. رقِّ الحساب إلى باقة Starter أو أعلى.'
  if (/Sample too large/i.test(m)) return 'ملف العيّنة كبير. استخدم ملفاً أقل من 8 ميجا.'
  if (/Forbidden/i.test(m)) return 'ما عندك صلاحية لقسم نداء الركاب.'
  if (/Unauthorized|لا توجد جلسة|No active session/i.test(m)) return 'انتهت جلسة الدخول. سجّل دخولك من جديد.'
  if (/Text too long/i.test(m)) return 'النص أطول من الحد المسموح (500 حرف).'
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'تعذّر الاتصال بالخادم. تأكد من الإنترنت وأعد المحاولة.'
  return m || 'حدث خطأ غير متوقع'
}

// ── نغمة نداء المطار (Web Audio) ──
export function playChime(controller) {
  return new Promise(resolve => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      const ctx = new Ctx()
      if (controller) controller.ctx = ctx
      if (controller?.stopped) { ctx.close().catch(() => {}); return resolve() }
      const now = ctx.currentTime
      const notes = [988, 784, 659, 523]
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain()
        osc.type = 'sine'; osc.frequency.value = freq
        const start = now + i * 0.46
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.4, start + 0.04)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.46)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start); osc.stop(start + 0.48)
      })
      setTimeout(() => { try { ctx.close() } catch { /* أُغلق بالإيقاف */ } resolve() }, notes.length * 460 + 250)
    } catch { resolve() }
  })
}

// ── تشغيل رابط صوت مع دعم الإيقاف الفوري ──
export function playAudioUrl(url, controller) {
  return new Promise((resolve, reject) => {
    if (controller?.stopped) return resolve()
    const audio = new Audio(url)
    if (controller) controller.audio = audio
    audio.onended = resolve
    audio.onpause = resolve
    audio.onerror = () => reject(new Error('تعذّر تشغيل الصوت'))
    audio.play().catch(reject)
  })
}
export async function playClipSequence(urls, controller) {
  for (const url of urls) {
    if (controller?.stopped) return
    await playAudioUrl(url, controller)
  }
}

// ── صوت الجهاز (احتياطي) ──
export const listArabicVoices = () => (window.speechSynthesis?.getVoices?.() || []).filter(v => v.lang?.toLowerCase().startsWith('ar'))
export const pickBestVoice = list => {
  const rank = v => { const n = v.name.toLowerCase(); return n.includes('google') ? 4 : (n.includes('online') || n.includes('natural') || n.includes('neural')) ? 3 : v.lang?.toLowerCase() === 'ar-sa' ? 2 : 1 }
  return [...list].sort((a, b) => rank(b) - rank(a))[0] || null
}
export function speakWithDevice(text, controller) {
  return new Promise(resolve => {
    if (!window.speechSynthesis || !text.trim() || controller?.stopped) return resolve()
    const voice = pickBestVoice(listArabicVoices())
    const u = new SpeechSynthesisUtterance(text)
    u.lang = voice?.lang || 'ar-SA'; u.rate = 0.88; u.pitch = 1
    if (voice) u.voice = voice
    u.onend = resolve; u.onerror = resolve
    if (controller) controller.cancelSpeech = () => window.speechSynthesis.cancel()
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u)
  })
}

// ── ElevenLabs عبر الخادم (swift-responder) ──
async function callTts(body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('لا توجد جلسة دخول')
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/swift-responder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  })
}
// الصوت المعتمد للنداء (يُحفظ في config/voice.json بمكتبة الصوتيات ويُحمّل عند فتح الصفحة)
let activeVoice = { id: null, name: '' }
export const getActiveVoice = () => activeVoice
export async function loadVoiceConfig() {
  try {
    const r = await fetch(`${clipUrl('config/voice.json')}?t=${Date.now()}`)
    if (r.ok) { const j = await r.json(); if (j?.voiceId) activeVoice = { id: j.voiceId, name: j.name || '' } }
  } catch { /* لا إعداد محفوظ: الصوت الافتراضي */ }
  return activeVoice
}
async function jsonCall(body) {
  const res = await callTts(body)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'تعذّر تنفيذ الطلب')
  return data
}
export async function listVoices() {
  const d = await jsonCall({ action: 'voices' })
  if (!Array.isArray(d.voices)) throw new Error('الدالة swift-responder قديمة: حدّثها بالكود الجديد في Supabase')
  return d.voices
}
export async function chooseVoice(id, name) {
  const d = await jsonCall({ action: 'setVoice', voiceId: id, voiceName: name })
  if (!d.ok) throw new Error('الدالة swift-responder قديمة: حدّثها بالكود الجديد في Supabase')
  activeVoice = { id, name }
}

// استنساخ صوت من ملف عيّنة ثم اعتماده للنداء
export async function cloneVoice(name, file) {
  const audio = await new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '')
    fr.onerror = () => reject(new Error('تعذّر قراءة الملف'))
    fr.readAsDataURL(file)
  })
  const d = await jsonCall({ action: 'cloneVoice', voiceName: name, audio, mime: file.type, filename: file.name })
  if (!d.voice_id) throw new Error('الدالة swift-responder قديمة: حدّثها بالكود الجديد في Supabase')
  await chooseVoice(d.voice_id, name)
  return d.voice_id
}

// توليد مقطع وحفظه في مكتبة النداء
export async function generateClip(text, savePath) {
  const res = await callTts({ text: speakable(text), savePath, voiceId: activeVoice.id })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'تعذّر توليد المقطع')
  return body.url
}
// نطق نص مباشرة بصوت ElevenLabs
export async function speakLive(text, controller, voiceOverride) {
  if (controller?.stopped) return
  const res = await callTts({ text: speakable(text), voiceId: voiceOverride || activeVoice.id })
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || 'تعذّر توليد الصوت') }
  if (controller?.stopped) return
  const url = URL.createObjectURL(await res.blob())
  try { await playAudioUrl(url, controller) } finally { URL.revokeObjectURL(url) }
}
