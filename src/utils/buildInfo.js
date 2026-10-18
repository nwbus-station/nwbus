// تاريخ ووقت بناء النسخة بتوقيت الرياض: 15/10/2026 23:06 (أرقام لاتينية، بدون تأثر باتجاه النص)
export const buildStamp = () => {
  try {
    if (typeof __BUILD_TIME__ === 'undefined' || !__BUILD_TIME__) return ''
    return new Date(__BUILD_TIME__).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(',', '')
  } catch { return '' }
}
