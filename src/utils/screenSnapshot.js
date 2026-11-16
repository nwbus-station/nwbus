// لقطة مصغّرة لما تعرضه الشاشة الآن (للمعاينة عن بُعد). تُحمَّل مكتبة الالتقاط عند الطلب فقط.
export async function captureScreen(root, W = 640) {
  const { default: html2canvas } = await import('html2canvas')
  const rect = root.getBoundingClientRect()
  const scale = W / Math.max(1, rect.width)
  // مقاطع الفيديو لا تلتقطها المكتبة: نتجاهلها ثم نرسم الإطار الحالي يدوياً في مكانها
  const canvas = await html2canvas(root, { scale, useCORS: true, backgroundColor: '#000', logging: false, ignoreElements: el => el.tagName === 'VIDEO' })
  const ctx = canvas.getContext('2d')
  root.querySelectorAll('video').forEach(v => {
    if (v.readyState < 2 || !v.videoWidth) return
    const r = v.getBoundingClientRect()
    const x = (r.left - rect.left) * scale, y = (r.top - rect.top) * scale, w = r.width * scale, h = r.height * scale
    const ar = v.videoWidth / v.videoHeight
    let dw = w, dh = w / ar
    if (dh > h) { dh = h; dw = h * ar }
    ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  })
  let url = canvas.toDataURL('image/jpeg', 0.6)
  if (url.length > 200000) url = canvas.toDataURL('image/jpeg', 0.35)
  return url
}

// بطاقة احتياطية إن تعذّر الالتقاط (مثلاً مقطع من مصدر لا يسمح بذلك)
export function fallbackCard(text) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 360
  const g = c.getContext('2d')
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, 640, 360)
  g.fillStyle = '#94a3b8'; g.font = '22px sans-serif'; g.textAlign = 'center'
  g.fillText('تعذّر التقاط الصورة', 320, 150)
  g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'
  g.fillText(String(text || '').slice(0, 40), 320, 200)
  return c.toDataURL('image/jpeg', 0.6)
}
