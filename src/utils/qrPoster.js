import { NW_LOGO_PATHS, NW_LOGO_VIEWBOX } from './nwLogoPaths'

// مقاسات الملصقات (ملم). البوصة = 25.4 ملم
const IN = 25.4
export const POSTER_SIZES = [
  { id: '4x6', label: '4 × 6 بوصة (10.2 × 15.2 سم)', w: 4 * IN, h: 6 * IN },
  { id: 'a6', label: 'A6 (10.5 × 14.8 سم)', w: 105, h: 148 },
  { id: 'a5', label: 'A5 (14.8 × 21 سم)', w: 148, h: 210 },
  { id: 'a4', label: 'A4 (21 × 29.7 سم)', w: 210, h: 297 },
  { id: '4x4', label: 'مربع 4 × 4 بوصة (10.2 سم)', w: 4 * IN, h: 4 * IN },
  { id: '3x3', label: 'مربع 3 × 3 بوصة (7.6 سم)', w: 3 * IN, h: 3 * IN },
]

const FONT = "Tajawal, 'Segoe UI', Tahoma, Arial, sans-serif"
const NAVY = '#1C2B4A'

function logo(x, y, width, fill) {
  const [, , vw, vh] = NW_LOGO_VIEWBOX.split(' ').map(Number)
  const s = width / vw
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}">${NW_LOGO_PATHS.map(d => `<path d="${d}"/>`).join('')}</g><!-- h=${(vh * s).toFixed(1)} -->`
}

// ملصق QR كـ SVG بوحدة الملم — يُستخدم للمعاينة والطباعة وتحويله لـPNG
export function buildPosterSvg({ w, h, qr }) {
  const compact = h / w < 1.25
  const m = w * 0.06
  const [, , lvw, lvh] = NW_LOGO_VIEWBOX.split(' ').map(Number)
  const logoW = w * (compact ? 0.28 : 0.42)
  const logoH = logoW * (lvh / lvw)
  const headH = compact ? logoH + m * 1.2 : logoH + m * 2
  const qrSize = compact ? Math.min(w * 0.66, h - headH - m * 3.8) : Math.min(w * 0.70, (h - headH) * 0.5)
  const qrX = (w - qrSize) / 2
  const parts = []
  parts.push(`<rect width="${w}" height="${h}" fill="#ffffff"/>`)
  parts.push(`<rect width="${w}" height="${headH}" fill="${NAVY}"/>`)
  parts.push(logo((w - logoW) / 2, (headH - logoH) / 2, logoW, '#ffffff'))

  let y = headH
  if (!compact) {
    y += w * 0.11
    parts.push(`<text x="${w / 2}" y="${y}" font-size="${w * 0.092}" font-weight="800" text-anchor="middle" fill="${NAVY}" font-family="${FONT}" direction="rtl">رأيك يهمنا</text>`)
    y += w * 0.06
    parts.push(`<text x="${w / 2}" y="${y}" font-size="${w * 0.052}" font-weight="700" text-anchor="middle" fill="#334155" font-family="${FONT}">Your opinion matters</text>`)
    y += w * 0.058
    parts.push(`<text x="${w / 2}" y="${y}" font-size="${w * 0.056}" font-weight="700" text-anchor="middle" fill="#334155" font-family="${FONT}" direction="rtl">آپ کی رائے اہم ہے</text>`)
    y += w * 0.05
  } else {
    y += m * 1.1
  }

  const qrY = y
  const pad = qrSize * 0.045
  parts.push(`<rect x="${qrX - pad}" y="${qrY - pad}" width="${qrSize + pad * 2}" height="${qrSize + pad * 2}" rx="${w * 0.03}" fill="#ffffff" stroke="${NAVY}" stroke-width="${w * 0.008}"/>`)
  parts.push(`<image x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" href="${qr}" xlink:href="${qr}" image-rendering="pixelated"/>`)
  y = qrY + qrSize + pad + (compact ? m * 0.9 : w * 0.075)

  if (!compact) {
    parts.push(`<text x="${w / 2}" y="${y}" font-size="${w * 0.062}" font-weight="800" text-anchor="middle" fill="${NAVY}" font-family="${FONT}" direction="rtl">امسح الرمز وقيّم تجربتك</text>`)
    y += w * 0.058
    parts.push(`<text x="${w / 2}" y="${y}" font-size="${w * 0.044}" font-weight="600" text-anchor="middle" fill="#475569" font-family="${FONT}">Scan to rate your experience</text>`)
    y += w * 0.058
    parts.push(`<text x="${w / 2}" y="${y}" font-size="${w * 0.048}" font-weight="600" text-anchor="middle" fill="#475569" font-family="${FONT}" direction="rtl">اسکین کریں اور اپنی رائے دیں</text>`)
    parts.push(`<text x="${w / 2}" y="${h - m * 0.8}" font-size="${w * 0.032}" font-weight="600" text-anchor="middle" fill="#94a3b8" font-family="${FONT}" direction="ltr">nwstation.com/feedback</text>`)
  } else {
    parts.push(`<text x="${w / 2}" y="${y}" font-size="${w * 0.062}" font-weight="800" text-anchor="middle" fill="${NAVY}" font-family="${FONT}" direction="rtl">امسح · Scan · اسکین</text>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`
}

// تحميل PNG بدقة طباعة 300 DPI
export function downloadPosterPng(svg, w, h, name) {
  const px = mm => Math.round((mm / IN) * 300)
  const img = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = px(w); c.height = px(h)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(url)
    c.toBlob(b => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b); a.download = name; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }, 'image/png')
  }
  img.src = url
}

// طباعة / حفظ PDF بالمقاس الحقيقي (بدون هوامش)
export function printPoster(svg, w, h) {
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>NW Bus QR</title>
    <style>@page{size:${w}mm ${h}mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${w}mm;height:${h}mm}</style>
    </head><body>${svg}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`)
  win.document.close()
  return true
}
