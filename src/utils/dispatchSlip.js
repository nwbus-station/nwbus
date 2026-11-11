import QRCode from 'qrcode'
import { fmtDate, fmtTime, DISPATCH_KINDS, LEG_STATUS, sortLegs } from './dispatch'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// تذكرة الإرسالية للطباعة (A5 عمودي): رقم التذكرة + QR + الخطوط والأغراض والتوقيع. التاريخ ميلادي والوقت 24 ساعة.
export async function printDispatchSlip(d, names) {
  const w = window.open('', '_blank')
  if (!w) return false
  const qr = await QRCode.toDataURL(d.ticket_no, { width: 360, margin: 1, errorCorrectionLevel: 'M' })
  const legs = sortLegs(d)
  const legHtml = legs.map(l => `
    <div class="leg">
      <div class="lt">الخط ${l.leg_no === 1 ? 'الأول' : 'الثاني'} <span class="st">${esc(LEG_STATUS[l.status]?.ar || '')}</span></div>
      <div class="route">${esc(names[l.from_station_id] || '—')} <b>←</b> ${esc(names[l.to_station_id] || '—')}</div>
      ${l.status === 'pending' ? '<div class="meta">لم تُرسل بعد — تُرسل من محطة التحويل بعد استلام الخط الأول</div>' : `<div class="meta">
        <span>المُرسِل: <b>${esc(l.sent_by_name || '—')}</b></span>
        <span>الحافلة: <b dir="ltr">${esc(l.bus_number || '—')}</b></span>
        <span>التاريخ: <b dir="ltr">${fmtDate(l.sent_at)}</b></span>
        <span>الوقت: <b dir="ltr">${fmtTime(l.sent_at)}</b></span>
      </div>`}
      ${l.received_at ? `<div class="meta rc"><span>المُستلِم: <b>${esc(l.received_by_name || '—')}</b></span><span>تاريخ الاستلام: <b dir="ltr">${fmtDate(l.received_at)}</b></span><span>الوقت: <b dir="ltr">${fmtTime(l.received_at)}</b></span></div>` : ''}
    </div>`).join('')
  const items = (d.items || []).map(i => `<tr><td>${esc(i.description)}</td><td class="q" dir="ltr">${i.qty}</td></tr>`).join('')
  const k = DISPATCH_KINDS[d.kind] || DISPATCH_KINDS.found
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${esc(d.ticket_no)}</title>
<style>
  @page { size: A5 portrait; margin: 8mm }
  * { box-sizing: border-box } body { margin: 0; font-family: Tajawal, 'Segoe UI', Tahoma, Arial, sans-serif; color: #1C2B4A; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 2.5px solid #1C2B4A; padding-bottom: 8px }
  .head h1 { margin: 0; font-size: 17pt } .head small { display: block; color: #64748b; font-size: 8.5pt; margin-top: 2px }
  .tk { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 18pt; font-weight: 800; letter-spacing: .04em; direction: ltr; margin-top: 4px }
  .kind { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 9pt; font-weight: 800; background: ${k.bg}; color: ${k.color}; margin-top: 4px }
  img { width: 28mm; height: 28mm }
  .leg { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; margin-top: 8px }
  .lt { font-weight: 800; font-size: 9.5pt; color: #475569 } .st { float: left; font-size: 8.5pt; color: #2563eb }
  .route { font-size: 13pt; font-weight: 800; margin: 3px 0 5px } .meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 9pt; color: #475569 } .meta b { color: #1C2B4A }
  .rc { margin-top: 4px; padding-top: 4px; border-top: 1px dashed #cbd5e1 }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10pt } th { text-align: right; background: #f1f5f9; padding: 5px 8px; border: 1px solid #cbd5e1; font-size: 9pt } td { padding: 5px 8px; border: 1px solid #cbd5e1 } td.q { width: 16mm; text-align: center; font-weight: 800 }
  .note { margin-top: 8px; font-size: 9.5pt; color: #475569 } .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; font-size: 9pt; color: #64748b } .sig div { border-top: 1px solid #94a3b8; padding-top: 4px }
  .foot { margin-top: 12px; text-align: center; font-size: 8pt; color: #94a3b8 }
</style></head><body>
  <div class="head">
    <div><h1>تذكرة إرسالية</h1><small>NORTH WEST BUS · إرساليات الموجودات والمفقودات</small><div class="tk">${esc(d.ticket_no)}</div><span class="kind">${esc(k.ar)}</span></div>
    <img src="${qr}" alt="QR" />
  </div>
  <div class="meta" style="margin-top:8px"><span>أنشأها: <b>${esc(d.created_by_name || '—')}</b></span><span>التاريخ: <b dir="ltr">${fmtDate(d.created_at)}</b></span><span>الوقت: <b dir="ltr">${fmtTime(d.created_at)}</b></span></div>
  ${legHtml}
  <table><thead><tr><th>الغرض</th><th>العدد</th></tr></thead><tbody>${items}</tbody></table>
  ${d.note ? `<div class="note">ملاحظة المُرسِل: ${esc(d.note)}</div>` : ''}
  <div class="sig"><div>توقيع المُرسِل</div><div>توقيع المُستلِم</div></div>
  <div class="foot">طُبعت بتاريخ ${fmtDate(new Date().toISOString())} · ${fmtTime(new Date().toISOString())}</div>
  <script>window.onload = () => setTimeout(() => window.print(), 350)<\/script>
</body></html>`)
  w.document.close()
  return true
}
