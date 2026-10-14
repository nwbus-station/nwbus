// أدوات مشتركة للمستندات المطبوعة بنافذة مستقلة (تعمل من الجوال والكمبيوتر) بهوية الشركة
import { NWB_LOGO_SVG } from './logo'

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')


// شعار الشركة بحجم مناسب للطباعة (يعمل داخل أي مستند بدون CSS خارجي)
export const brandLogo = (w = 130) => NWB_LOGO_SVG.replace('<svg ', `<svg style="display:block;width:${w}px;height:auto" `)

// ترويسة موحّدة لكل المستندات المطبوعة: المعلومات بجانب، العنوان وسطاً، الشعار بالجهة المقابلة، وخط برتقالي سفلي
// كلها inline-style فتُحقن بأي مستند طباعة قديم بدون الاعتماد على PRINT_CSS
export function brandHeader({ title, subtitle = '', lines = [], dir = 'rtl', logoW = 130, margin = '0 0 14px' }) {
  const ff = "font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif"
  return `<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:12px 6px 10px;border-bottom:3px solid #EE712D;margin:${margin};direction:${dir};${ff}">
<div style="font-size:10px;color:#475569;line-height:1.8;text-align:start">${lines.map(l => `<div>${l}</div>`).join('')}</div>
<div style="text-align:center"><b style="display:block;font-size:20px;font-weight:900;color:#264673;line-height:1.3">${title}</b>${subtitle ? `<span style="font-size:11px;color:#64748b;font-weight:600">${subtitle}</span>` : ''}</div>
<div style="justify-self:end">${brandLogo(logoW)}</div></div>`
}

export const TOOLBAR_CSS = `
  .toolbar { position: sticky; top: 0; z-index: 5; background: #1C2B36; color: #fff; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
  .toolbar .acts { display: flex; gap: 8px; }
  .toolbar button { background: #fff; color: #1C2B36; border: 0; border-radius: 8px; padding: 9px 18px; font-weight: 800; font-size: 14px; font-family: inherit; cursor: pointer; }
  .toolbar button.sh { background: #EE712D; color: #fff; display: none; }
  .toolbar .bwg { display: inline-flex; border: 1px solid rgba(255,255,255,.35); border-radius: 8px; overflow: hidden; }
  .toolbar .bwg button { background: transparent; color: #fff; border-radius: 0; padding: 8px 14px; font-size: 13px; font-weight: 700; }
  .toolbar .bwg button.on { background: #fff; color: #1C2B36; }
  @media print { .toolbar { display: none !important; } }
`

// شريط المعاينة: زر طباعة/حفظ PDF + زر مشاركة (يظهر على الأجهزة التي تدعم المشاركة، مثل الجوال)
export function previewToolbar({ label = 'معاينة المستند', shareTitle = '', shareText = '' } = {}) {
  return `<div class="toolbar" data-t="${esc(shareTitle)}" data-x="${esc(shareText)}"><span>${esc(label)}</span><span class="acts"><span class="bwg"><button class="on" type="button" data-m="c">ألوان</button><button type="button" data-m="b">أبيض وأسود</button></span><button class="sh" type="button">مشاركة / إرسال</button><button type="button" onclick="window.print()">طباعة / حفظ PDF</button></span></div>
<script>(function(){var t=document.querySelector('.toolbar');if(!t)return;Array.prototype.forEach.call(t.querySelectorAll('.bwg button'),function(b){b.onclick=function(){document.body.classList.toggle('bw',b.getAttribute('data-m')==='b');Array.prototype.forEach.call(t.querySelectorAll('.bwg button'),function(x){x.classList.toggle('on',x===b)})}});var x=t.getAttribute('data-x');var b=t.querySelector('.sh');if(navigator.share&&x&&b){b.style.display='inline-block';b.onclick=function(){navigator.share({title:t.getAttribute('data-t')||document.title,text:x}).catch(function(){})}}})();</script>`
}

export const PRINT_CSS = `
  @page { size: A4; margin: 9mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e6eaef; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; direction: rtl; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${TOOLBAR_CSS}
  .sheet { background: #fbfaf6; max-width: 920px; margin: 16px auto 28px; padding: 0 0 14px; border-radius: 14px; overflow: hidden; box-shadow: 0 8px 30px rgba(15,23,42,.12); }
  .hd { background: transparent; padding: 14px 22px 10px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; border-bottom: 3px solid #EE712D; }
  .hd .logo { justify-self: end; } .hd .logo svg { display: block; width: 140px; height: auto; }
  .hd .title { text-align: center; } .hd .title b { display: block; font-size: 22px; font-weight: 900; color: #264673; } .hd .title span { font-size: 12.5px; color: #64748b; }
  .hd .info { justify-self: start; text-align: right; font-size: 12.5px; color: #475569; line-height: 1.8; } .hd .info b { color: #0f172a; }
  .body { padding: 0 22px; }
  .sec { margin-top: 14px; break-inside: avoid; }
  .sec > h3 { margin: 0 0 6px; font-size: 15px; font-weight: 800; color: #1C2B36; padding-right: 8px; border-right: 4px solid #EE712D; }
  .grid { display: grid; gap: 6px; } .g2 { grid-template-columns: repeat(2, 1fr); } .g3 { grid-template-columns: repeat(3, 1fr); } .g4 { grid-template-columns: repeat(4, 1fr); } .g5 { grid-template-columns: repeat(5, 1fr); }
  .cell { border: 1px solid #dbe2ea; border-radius: 7px; padding: 6px 9px; background: #f8fafc; }
  .cell small { display: block; font-size: 10.6px; color: #64748b; margin-bottom: 2px; } .cell b { font-size: 14.4px; color: #0f172a; word-break: break-word; }
  .kpi { border: 1px solid #dbe2ea; border-top: 3px solid var(--c, #1C2B4A); border-radius: 8px; padding: 8px 10px; background: #fff; text-align: center; }
  .kpi small { display: block; font-size: 10.6px; color: #64748b; font-weight: 700; } .kpi b { display: block; direction: ltr; font-size: 20.2px; font-weight: 900; color: #0f172a; line-height: 1.25; font-family: ui-monospace, Menlo, Consolas, monospace; } .kpi em { font-style: normal; font-size: 10.6px; color: #64748b; }
  .person { display: flex; align-items: center; gap: 14px; border: 1px solid #dbe2ea; border-radius: 10px; padding: 10px 14px; background: linear-gradient(135deg, #f8fafc, #eef3fa); }
  .person .av { width: 52px; height: 52px; border-radius: 50%; background: #1C2B4A; color: #fff; font-weight: 900; font-size: 22px; display: grid; place-items: center; flex-shrink: 0; }
  .person b { font-size: 17.9px; color: #0f172a; } .person span { display: block; font-size: 13.1px; color: #475569; margin-top: 2px; }
  .person .score { text-align: center; border-right: 1px solid #cbd5e1; padding-right: 14px; } .person .score b { display: block; font-size: 26px; font-weight: 900; color: #EE712D; line-height: 1; font-family: ui-monospace, Menlo, monospace; } .person .score small { font-size: 12.5px; color: #475569; font-weight: 700; }
  .ins { border: 1px solid #dbe2ea; border-radius: 8px; padding: 8px 12px; } .ins.ok { background: #f0fdf4; border-color: #bbf7d0; } .ins.no { background: #fffbeb; border-color: #fde68a; }
  .ins h4 { margin: 0 0 4px; font-size: 13.8px; color: #1C2B36; } .ins ul { margin: 0; padding: 0; list-style: none; } .ins li { font-size: 12.5px; line-height: 1.7; padding-right: 12px; position: relative; color: #1e293b; } .ins li::before { content: ''; position: absolute; right: 0; top: 7px; width: 6px; height: 6px; border-radius: 50%; background: var(--c, #64748b); } .ins li.none { color: #94a3b8; } .ins li.none::before { display: none; }
  .strip { display: flex; flex-wrap: wrap; gap: 2px; } .strip i { width: 9px; height: 9px; border-radius: 2px; background: #e2e8f0; } .strip i.on { background: #0369a1; }
  .hist { display: flex; align-items: flex-end; gap: 3px; height: 50px; direction: ltr; } .hist span { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; } .hist i { display: block; width: 100%; background: #0369a1; border-radius: 2px 2px 0 0; } .hist em { font-style: normal; font-size: 9.4px; color: #64748b; height: 10px; }
  .sig { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 18px; } .sig div { text-align: center; } .sig span { display: block; font-size: 11.9px; color: #64748b; font-weight: 700; } .sig b { display: block; font-size: 13.8px; margin: 14px 0 2px; min-height: 16px; } .sig i { display: block; border-top: 1px solid #94a3b8; }
  .verdict { margin-top: 8px; border: 1px solid #dbe2ea; border-right: 4px solid #EE712D; border-radius: 8px; padding: 8px 12px; background: #f8fafc; } .verdict b { font-size: 13.8px; color: #264673; } .verdict .vg { float: left; color: #fff; border-radius: 99px; padding: 1px 12px; font-size: 12.5px; font-weight: 800; } .verdict p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.9; color: #1e293b; }
  h4.sub { margin: 10px 0 4px; font-size: 13.1px; font-weight: 800; color: #264673; } ul.notes { margin: 6px 0 0; padding: 0 14px 0 0; font-size: 11.9px; color: #475569; line-height: 1.8; }
  .stack { display: flex; height: 10px; border-radius: 99px; overflow: hidden; background: #e8edf3; margin-top: 8px; } .stack i { display: block; height: 100%; }
  .rate { display: grid; grid-template-columns: 200px 1fr; gap: 12px; align-items: center; } .rate .hero { background: linear-gradient(160deg, #1C2B4A, #2d4a7a); color: #fff; border-radius: 10px; padding: 12px; text-align: center; } .rate .hero > small { display: block; font-size: 11.2px; opacity: .8; } .rate .hero > b { display: block; font-size: 30px; font-weight: 900; line-height: 1.2; font-family: ui-monospace, Menlo, monospace; direction: ltr; } .rate .hero > b span { font-size: 15px; opacity: .6; }
  .rate .two { display: flex; gap: 8px; margin-top: 8px; } .rate .two div { flex: 1; background: rgba(255,255,255,.14); border-radius: 7px; padding: 5px 2px; } .rate .two b { display: block; font-size: 17.5px; font-family: ui-monospace, Menlo, monospace; } .rate .two small { font-size: 9.4px; opacity: .85; }
  .quotes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-top: 8px; } .q { border: 1px solid #dbe2ea; border-right: 3px solid var(--c, #64748b); border-radius: 7px; padding: 6px 9px; background: #f8fafc; } .q .d { float: left; font-size: 10px; color: #64748b; font-family: ui-monospace, Menlo, monospace; } .q p { margin: 3px 0 0; font-size: 11.9px; line-height: 1.6; }
  table.t { width: 100%; border-collapse: collapse; font-size: 12.5px; } table.t th { background: #1e3a5f; color: #fff; padding: 5px 7px; font-size: 11.9px; }
  table.t td { border: 1px solid #dbe2ea; padding: 4px 7px; text-align: center; } table.t td.l { text-align: right; } table.t tbody tr:nth-child(even) td { background: #fafbfd; }
  table.t tr.tot td { background: #eef2f7; font-weight: 800; }
  .bars .r { display: flex; align-items: center; gap: 8px; margin: 3px 0; font-size: 11.9px; } .bars .r span.k { width: 64px; flex-shrink: 0; color: #475569; font-weight: 700; }
  .bars .r .bar { flex: 1; height: 9px; background: #e8edf3; border-radius: 99px; overflow: hidden; } .bars .r .bar i { display: block; height: 100%; border-radius: 99px; background: var(--c, #1C2B4A); } .bars .r span.v { width: 64px; direction: ltr; text-align: left; font-family: ui-monospace, Menlo, monospace; font-weight: 800; }
  .chip { display: inline-block; border-radius: 99px; padding: 2px 10px; font-size: 11.9px; font-weight: 800; } .muted { color: #64748b; font-size: 12.5px; }
  .ft { display: flex; justify-content: space-between; align-items: center; margin: 14px 22px 0; padding-top: 6px; border-top: 1px solid #cbd5e1; font-size: 11.2px; color: #64748b; gap: 8px; }
  .ft .pill { background: #1C2B36; color: #fff; padding: 2px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  @media (max-width: 640px) {
    .hd { grid-template-columns: 1fr; text-align: center; } .hd .logo, .hd .info { justify-self: center; text-align: center; } .hd .logo svg { margin: 0 auto; }
    .sheet { margin: 0; box-shadow: none; } .g4, .g5 { grid-template-columns: repeat(2, 1fr); } .g3 { grid-template-columns: 1fr; } .rate { grid-template-columns: 1fr; } .quotes { grid-template-columns: 1fr; } .body { padding: 0 12px; } .ft { margin: 12px 12px 0; flex-wrap: wrap; }
    table.t { font-size: 11.2px; }
  }
  @media print { html, body { background: #fff; } .sheet { margin: 0; max-width: none; box-shadow: none; padding: 0; border-radius: 0; background: #fff; } .sec, .person, table.t tr { break-inside: avoid; } }

  body.bw .sheet { filter: grayscale(1) contrast(1.35); }
  body.bw .sheet * { color: #000 !important; }
  body.bw table.t th, body.bw .rate .hero, body.bw .ft .pill, body.bw .person .av { background: #fff !important; border: 1.5px solid #000; }
  body.bw .chip, body.bw .verdict .vg { background: #fff !important; border: 1.5px solid #000; }
  body.bw .kpi { border-color: #000; border-top-width: 4px; }
  body.bw table.t td, body.bw table.t th { border-color: #777; }
`

// ترويسة رسمية: المعلومات يميناً، العنوان وسطاً، الشعار يساراً
export function docHeader({ title, infoLines = [] }) {
  return `<div class="hd"><div class="info">${infoLines.map(l => `<div>${l}</div>`).join('')}</div><div class="title"><b>${esc(title)}</b></div><div class="logo">${NWB_LOGO_SVG}</div></div>`
}

export function docShell({ title, body, footerLeft = '', footerRight = '', shareText = '' }) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
${previewToolbar({ shareTitle: title, shareText })}
<div class="sheet">${body}<div class="ft"><span>${footerLeft}</span><span class="pill">NORTH WEST BUS</span><span>${footerRight}</span></div></div></body></html>`
}

// يفتح نافذة الطباعة فور الضغط؛ على الكمبيوتر تُفتح نافذة الطباعة تلقائياً وعلى الجوال يبقى الزر ظاهراً
export function openDocWindow(html, { autoPrint = false } = {}) {
  const w = window.open('', '_blank')
  if (w) {
    w.document.open(); w.document.write(html); w.document.close()
    if (autoPrint && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) setTimeout(() => { try { w.focus(); w.print() } catch { /* يطبع يدوياً */ } }, 500)
    return true
  }
  // المتصفح منع النافذة: نطبع من إطار مخفي كحل أخير
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close()
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print() } finally { setTimeout(() => f.remove(), 2000) } }, 500)
  return false
}

// ── معاينة الطباعة لمستندات الصفحات الأخرى (بدل تكرار شريط ومظهر كل صفحة) ──
// ورقة عاجية على خلفية هادئة، وأبيض نقي عند الطباعة، وزر أبيض وأسود
export const PAPER_CSS = `
  body { background: #e6eaef !important; }
  .paper { background: #fbfaf6; max-width: 1240px; margin: 16px auto 28px; border-radius: 14px; box-shadow: 0 8px 30px rgba(15,23,42,.12); }
  @media print { body { background: #fff !important; } .paper { background: #fff; box-shadow: none; margin: 0; max-width: none; border-radius: 0; } }
  body.bw .paper { filter: grayscale(1) contrast(1.35); }
  body.bw .paper * { color: #000 !important; }
  body.bw .paper th { background: #fff !important; border-bottom: 2px solid #000 !important; }
  body.bw .paper span[style*="background"] { background: #fff !important; border: 1.5px solid #000 !important; }
`
export function previewBar(label) {
  return `<div class="no-print" style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 20px;position:sticky;top:0;z-index:10;box-shadow:0 1px 4px rgba(0,0,0,0.05);font-family:'IBM Plex Sans Arabic',Arial,sans-serif">
    <span style="font-size:12.5px;font-weight:700;color:#1C2B4A;letter-spacing:0.04em">${esc(label)}</span>
    <span style="display:inline-flex;align-items:center;gap:10px">
      <span id="bwg" style="display:inline-flex;border:1px solid #cbd5e1;border-radius:9px;overflow:hidden">
        <button type="button" onclick="document.body.classList.remove('bw');this.style.background='#1C2B4A';this.style.color='#fff';var o=this.nextElementSibling;o.style.background='#fff';o.style.color='#1C2B4A'" style="border:none;padding:9px 16px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;background:#1C2B4A;color:#fff">ألوان</button>
        <button type="button" onclick="document.body.classList.add('bw');this.style.background='#1C2B4A';this.style.color='#fff';var o=this.previousElementSibling;o.style.background='#fff';o.style.color='#1C2B4A'" style="border:none;padding:9px 16px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;background:#fff;color:#1C2B4A">أبيض وأسود</button>
      </span>
      <button type="button" onclick="window.print()" style="display:inline-flex;align-items:center;gap:7px;background:#1C2B4A;color:#fff;border:none;border-radius:9px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">طباعة / حفظ PDF</button>
    </span>
  </div>`
}
