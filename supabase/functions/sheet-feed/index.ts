// تصدير البيانات الحيّة لقوقل شيت: GET ?key=<مفتاح Excel>&d=<نوع البيانات>&days=<عدد الأيام> يرجع CSV.
// المفتاح نفسه مفتاح «اتصال Excel المباشر» (قراءة فقط، أدمن عام، ينتهي ويُلغى). يستدعي الدالة excel_feed بمفتاح anon،
// وهي التي تتحقق من المفتاح. أطفئ «Verify JWT» لهذه الدالة في لوحة Supabase لأن قوقل شيت لا يرسل ترويسات.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HEADERS = { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' }
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/
const pad = (n: number) => String(n).padStart(2, '0')

// الأوقات بتوقيت الرياض (+3) بصيغة يفهمها قوقل شيت
const riyadh = (s: string) => {
  const d = new Date(new Date(s).getTime() + 3 * 3600 * 1000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? (TS.test(v) ? riyadh(v) : v) : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csvError = (msg: string) => new Response(`خطأ\n${cell(msg)}`, { status: 200, headers: HEADERS })   // 200 ليظهر النص داخل الشيت

Deno.serve(async (req) => {
  const u = new URL(req.url)
  const key = u.searchParams.get('key') ?? ''
  const dataset = u.searchParams.get('d') ?? ''
  const days = Math.min(Math.max(Number(u.searchParams.get('days') ?? 365) || 365, 1), 1500)
  if (!key || !dataset) return csvError('المفتاح أو نوع البيانات ناقص في الرابط')

  const iso = (x: Date) => x.toISOString().slice(0, 10)
  const now = Date.now()
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await supa.rpc('excel_feed', {
    p_token: key, p_dataset: dataset, p_from: iso(new Date(now - days * 86400000)), p_to: iso(new Date(now + 31 * 86400000)),
  })
  if (error) return csvError(/invalid key/i.test(error.message) ? 'المفتاح غير صالح أو منتهٍ أو مُلغى' : error.message)

  const rows = Array.isArray(data) ? data as Record<string, unknown>[] : []
  if (!rows.length) return new Response('لا توجد بيانات\n', { status: 200, headers: HEADERS })
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const out = [cols.map(cell).join(',')]
  for (const r of rows) out.push(cols.map((c) => cell(r[c])).join(','))
  return new Response(out.join('\n'), { status: 200, headers: HEADERS })
})
