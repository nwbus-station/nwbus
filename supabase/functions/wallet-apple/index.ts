// بطاقة Apple Wallet لرمز تقييم العميل الخاص بالموظف (.pkpass موقّع)
// الاستدعاء: GET /functions/v1/wallet-apple?token=<rating_token>  (انشرها مع --no-verify-jwt)
// الأسرار المطلوبة: APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT_PEM, APPLE_PASS_KEY_PEM, APPLE_WWDR_PEM
//   واختيارياً: APPLE_PASS_KEY_PASSPHRASE, SITE_URL (الافتراضي https://www.nwstation.com)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import forge from 'npm:node-forge@1.3.1'
import JSZip from 'npm:jszip@3.10.1'
import { ASSETS } from './assets.ts'

const pem = (v: string | undefined) => (v ?? '').replace(/\\n/g, '\n').trim()
const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))
const sha1Hex = async (bytes: Uint8Array) => {
  const h = await crypto.subtle.digest('SHA-1', bytes)
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('')
}
const text = (s: string) => new TextEncoder().encode(s)
const bad = (msg: string, status = 400) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token') ?? ''
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return bad('رابط غير صالح')

    const passTypeId = Deno.env.get('APPLE_PASS_TYPE_ID'), teamId = Deno.env.get('APPLE_TEAM_ID')
    const certPem = pem(Deno.env.get('APPLE_PASS_CERT_PEM')), keyPem = pem(Deno.env.get('APPLE_PASS_KEY_PEM')), wwdrPem = pem(Deno.env.get('APPLE_WWDR_PEM'))
    if (!passTypeId || !teamId || !certPem || !keyPem || !wwdrPem) return bad('إعدادات Apple Wallet غير مكتملة في الخادم', 500)
    const site = (Deno.env.get('SITE_URL') ?? 'https://www.nwstation.com').replace(/\/$/, '')

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: u } = await sb.from('users')
      .select('id, full_name_ar, job_number, can_rate_customers, is_active, station:station_id(name_ar)')
      .eq('rating_token', token).maybeSingle()
    if (!u || u.is_active === false || !u.can_rate_customers) return bad('البطاقة غير متاحة لهذا الحساب', 404)

    const ratingUrl = `${site}/rate/${token}`
    const station = (u.station as { name_ar?: string } | null)?.name_ar ?? ''
    const passJson = {
      formatVersion: 1, passTypeIdentifier: passTypeId, teamIdentifier: teamId, serialNumber: token,
      organizationName: 'NORTH WEST BUS', description: 'بطاقة تقييم الخدمة', logoText: 'NORTH WEST BUS',
      foregroundColor: 'rgb(255,255,255)', backgroundColor: 'rgb(28,43,74)', labelColor: 'rgb(238,113,45)',
      barcodes: [{ format: 'PKBarcodeFormatQR', message: ratingUrl, messageEncoding: 'iso-8859-1', altText: 'امسح لتقييم الخدمة' }],
      barcode: { format: 'PKBarcodeFormatQR', message: ratingUrl, messageEncoding: 'iso-8859-1' },
      generic: {
        primaryFields: [{ key: 'name', label: 'الموظف', value: u.full_name_ar ?? '' }],
        secondaryFields: [
          { key: 'station', label: 'المحطة', value: station || '—' },
          { key: 'job', label: 'الرقم الوظيفي', value: u.job_number ? String(u.job_number) : '—' },
        ],
        auxiliaryFields: [{ key: 'hint', label: 'التقييم', value: 'امسح الرمز ليقيّم العميل خدمتك' }],
        backFields: [{ key: 'link', label: 'رابط التقييم', value: ratingUrl }],
      },
    }

    // ملفات البطاقة + manifest (SHA-1 لكل ملف)
    const files: Record<string, Uint8Array> = { 'pass.json': text(JSON.stringify(passJson)) }
    for (const [name, b64] of Object.entries(ASSETS)) files[name] = b64ToBytes(b64)
    const manifest: Record<string, string> = {}
    for (const [name, bytes] of Object.entries(files)) manifest[name] = await sha1Hex(bytes)
    const manifestStr = JSON.stringify(manifest)
    files['manifest.json'] = text(manifestStr)

    // توقيع PKCS#7 منفصل لملف manifest.json
    const signerCert = forge.pki.certificateFromPem(certPem)
    const wwdrCert = forge.pki.certificateFromPem(wwdrPem)
    const pass = Deno.env.get('APPLE_PASS_KEY_PASSPHRASE')
    const signerKey = pass ? forge.pki.decryptRsaPrivateKey(keyPem, pass) : forge.pki.privateKeyFromPem(keyPem)
    if (!signerKey) return bad('تعذّر قراءة مفتاح التوقيع', 500)
    const p7 = forge.pkcs7.createSignedData()
    p7.content = forge.util.createBuffer(manifestStr, 'utf8')
    p7.addCertificate(signerCert); p7.addCertificate(wwdrCert)
    p7.addSigner({
      key: signerKey, certificate: signerCert, digestAlgorithm: forge.pki.oids.sha1,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() },
      ],
    })
    p7.sign({ detached: true })
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
    files['signature'] = Uint8Array.from(der, (c: string) => c.charCodeAt(0))

    const zip = new JSZip()
    for (const [name, bytes] of Object.entries(files)) zip.file(name, bytes)
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    return new Response(out, { headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': 'inline; filename="nwbus-rating.pkpass"',
      'Cache-Control': 'no-store',
    } })
  } catch (e) {
    console.error('wallet-apple failed', e)
    return bad('تعذّر إنشاء البطاقة', 500)
  }
})
