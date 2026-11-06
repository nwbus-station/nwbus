import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../shared/ConfirmDialog'
import { FEED_DATASETS, feedCode, sheetsScript } from '../../utils/excelFeedCode'
import sheetFeedSource from '../../../supabase/functions/sheet-feed/index.ts?raw'

// اتصال Excel المباشر (للأدمن العام): مفتاح قراءة فقط يُنشأ هنا ويُلصق في Excel مرة واحدة،
// وبعدها ملف Excel واحد يسحب أحدث البيانات بزر «تحديث» (أو تلقائياً كل عدة دقائق).
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const isOpen = d => !!d && new Date(d).getFullYear() > new Date().getFullYear() + 50   // بدون انتهاء
const fmtExp = (d, isAr) => (isOpen(d) ? (isAr ? 'بدون انتهاء' : 'no expiry') : fmtDT(d))
const fmtDT = d => (d ? new Date(d).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }) : '—')
const inputStyle = { border: '1px solid var(--border-2)', borderRadius: 9, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text-1)', fontSize: '0.85rem', fontFamily: 'inherit', minHeight: 44 }
const btn = (primary, disabled) => ({ minHeight: 44, padding: '0 18px', borderRadius: 10, border: primary ? 'none' : '1px solid var(--border-2)', background: primary ? 'var(--solid-btn, #1C2B4A)' : 'var(--card)', color: primary ? '#fff' : 'var(--text-1)', fontWeight: 800, fontSize: '0.84rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'inherit' })

// تنزيل نص كملف (للأجهزة اللي تمنع النسخ بين المتصفح وأوفيس): يُفتح بالمفكرة ومنها يُنسخ
function downloadText(name, text) {
  const blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = window.URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => window.URL.revokeObjectURL(a.href), 4000)
}
// صيغة قوقل شيت لتبويب بيانات: تقرأ الرابط والمفتاح من تبويب Settings
const sheetFormula = id => `=IMPORTDATA(Settings!$B$1&"?key="&Settings!$B$2&"&d=${id}&days="&Settings!$B$4&"&t="&Settings!$B$3)`
const sheetCode = id => `let\n    Source = fnFeed("${id}")\nin\n    Source`

function CopyBtn({ text, label = 'نسخ', done = 'تم النسخ' }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800) } catch { window.prompt('انسخ النص:', text) } }}
      style={{ ...btn(false), minHeight: 38, padding: '0 14px', fontSize: '0.78rem', color: ok ? 'var(--success)' : 'var(--text-1)' }}>
      {ok ? done : label}
    </button>
  )
}

export default function ExcelLiveLink({ isAr = true }) {
  const T = (a, e) => (isAr ? a : e)
  const [keys, setKeys] = useState([])
  const [loadErr, setLoadErr] = useState('')
  const [label, setLabel] = useState('Excel')
  const [days, setDays] = useState(90)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fresh, setFresh] = useState(null)       // { token, expires_at } يظهر مرة واحدة
  const [revoke, setRevoke] = useState(null)
  const [steps, setSteps] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_excel_keys')
    if (error) { setLoadErr(/not allowed/i.test(error.message) ? T('هذه الميزة للأدمن العام فقط.', 'General admin only.') : T('لم يُجهَّز الاتصال بعد: شغّل ملف SQL الخاص بـ Excel في Supabase.', 'Not set up yet: run the Excel SQL in Supabase.')); setKeys([]); return }
    setLoadErr(''); setKeys(data ?? [])
  }, [isAr]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  async function create() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('create_excel_key', { p_label: label.trim() || 'Excel', p_days: days })
    setBusy(false)
    if (error) { setErr(T('تعذّر إنشاء المفتاح: ', 'Could not create the key: ') + error.message); return }
    setFresh(data); load()
  }
  async function doRevoke(id) {
    setRevoke(null)
    const { error } = await supabase.rpc('revoke_excel_key', { p_id: id })
    if (error) { setErr(error.message); return }
    load()
  }

  const code = fresh ? feedCode({ url: SUPA_URL, anonKey: ANON, token: fresh.token }) : ''
  const active = keys.filter(k => !k.revoked_at && new Date(k.expires_at) > new Date())

  return (
    <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-1)' }}>{T('اتصال Excel المباشر', 'Live Excel connection')}</h3>
      <p style={{ margin: '0 0 14px', fontSize: '0.78rem', lineHeight: 1.8, color: 'var(--text-3)' }}>
        {T('ملف Excel واحد يسحب أحدث بيانات النظام (مبيعات، رحلات، إجازات، تقييمات…) بزر «تحديث»، بدل تنزيل نسخة كل يوم. المفتاح للقراءة فقط وللأدمن العام فقط، وينتهي تلقائياً، وتلغيه متى شئت.', 'One Excel file that pulls the latest system data with a Refresh button instead of daily copies. The key is read-only, general-admin only, expires automatically, and can be revoked any time.')}
      </p>

      {loadErr && <p role="alert" style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 9, background: 'var(--warn-bg, #fffbeb)', color: 'var(--warn, #b45309)', fontSize: '0.8rem', fontWeight: 700 }}>{loadErr}</p>}

      {!loadErr && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 160px', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-3)' }}>
              {T('اسم المفتاح', 'Key name')}
              <input value={label} maxLength={60} onChange={e => setLabel(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-3)' }}>
              {T('الصلاحية', 'Valid for')}
              <select value={days} onChange={e => setDays(Number(e.target.value))} style={inputStyle}>
                <option value={0}>{T('بدون انتهاء (يُلغى يدوياً)', 'No expiry (revoke manually)')}</option><option value={30}>{T('30 يوماً', '30 days')}</option><option value={90}>{T('90 يوماً', '90 days')}</option><option value={180}>{T('180 يوماً', '180 days')}</option><option value={365}>{T('سنة', '1 year')}</option>
              </select>
            </label>
            <button type="button" onClick={create} disabled={busy} style={btn(true, busy)}>{busy ? T('جارٍ الإنشاء…', 'Creating…') : T('إنشاء مفتاح جديد', 'Create new key')}</button>
          </div>
          {err && <p role="alert" style={{ margin: '10px 0 0', fontSize: '0.8rem', fontWeight: 700, color: 'var(--danger, #dc2626)' }}>{err}</p>}

          {fresh && (
            <div style={{ marginTop: 16, border: '1px solid var(--border-2)', borderRadius: 12, padding: 16, background: 'var(--surface)' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.82rem', fontWeight: 800, color: 'var(--success)' }}>{T('تم إنشاء المفتاح. انسخ الكود الآن: لن يظهر المفتاح مرة ثانية.', 'Key created. Copy the code now — the key will not be shown again.')}</p>
              <p style={{ margin: '0 0 12px', fontSize: '0.74rem', color: 'var(--text-3)' }}>{T(`ينتهي: ${fmtExp(fresh.expires_at, true)}. لا ترسل ملف Excel لأحد بعد لصق الكود: المفتاح داخل الملف.`, `Expires: ${fmtExp(fresh.expires_at, false)}. Do not share the Excel file after pasting — the key is inside it.`)}</p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <b style={{ fontSize: '0.8rem', color: 'var(--text-1)' }}>{T('1) كود الاتصال (الصقه مرة واحدة في Excel)', '1) Connection code (paste once in Excel)')}</b>
                <CopyBtn text={code} label={T('نسخ كود الاتصال', 'Copy code')} />
                <button type="button" onClick={() => downloadText('fnFeed.txt', code)} style={{ ...btn(false), minHeight: 38, padding: '0 14px', fontSize: '0.78rem' }}>{T('تنزيل كملف نصي', 'Download as .txt')}</button>
              </div>
              <pre dir="ltr" style={{ margin: '0 0 16px', maxHeight: 130, overflow: 'auto', padding: 10, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', fontSize: '0.68rem', color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code.replace(fresh.token, fresh.token.slice(0, 8) + '…' + fresh.token.slice(-4))}</pre>

              <b style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-1)', marginBottom: 8 }}>{T('2) لكل ورقة بيانات: استعلام فارغ جديد ← المحرر المتقدم ← الصق هذا الكود', '2) For each data sheet: new Blank Query → Advanced Editor → paste this code')}</b>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
                {FEED_DATASETS.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)' }}>{isAr ? d.ar : d.en}</span>
                    <CopyBtn text={sheetCode(d.id)} label={T('نسخ', 'Copy')} />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <b style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-1)', marginBottom: 6 }}>{T('أو: قوقل شيت (أسهل على أجهزة الشركات)', 'Or: Google Sheets (easier on locked-down PCs)')}</b>
                <p style={{ margin: '0 0 10px', fontSize: '0.76rem', lineHeight: 1.8, color: 'var(--text-3)' }}>
                  {T('ينفع بدون Power Query ولا كود. في الشيت تبويب اسمه Settings بأربع خلايا، وكل تبويب بيانات فيه صيغة واحدة. التحديث تلقائي تقريباً كل ساعة، أو غيّر الرقم في Settings!B3 لتحديث فوري. بيانات النظام تصير داخل قوقل، فلا تشارك الشيت إلا مع من يحق له.', 'No Power Query or code. The sheet has a Settings tab with four cells, and each data tab holds one formula. It refreshes about hourly, or change the number in Settings!B3 to force it. System data will live in Google, so share the sheet only with authorised people.')}
                </p>
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  {[
                    ['B1', T('رابط الدالة', 'Function URL'), `${SUPA_URL}/functions/v1/sheet-feed`],
                    ['B2', T('المفتاح', 'Key'), fresh.token],
                    ['B3', T('عدّاد التحديث (غيّره للتحديث الفوري)', 'Refresh counter (change to refresh now)'), '1'],
                    ['B4', T('عدد الأيام للخلف', 'Days back'), '365'],
                  ].map(([cellId, lbl, val]) => (
                    <div key={cellId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)' }}>Settings!{cellId} <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>· {lbl}</span></span>
                      <CopyBtn text={val} label={T('نسخ', 'Copy')} />
                    </div>
                  ))}
                </div>
                <b style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-1)', marginBottom: 8 }}>{T('صيغة كل تبويب (الصقها في الخلية A1 من التبويب)', 'Formula per tab (paste into cell A1)')}</b>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
                  {FEED_DATASETS.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)' }}>{isAr ? d.ar : d.en}</span>
                      <CopyBtn text={sheetFormula(d.id)} label={T('نسخ', 'Copy')} />
                    </div>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setFresh(null)} style={{ ...btn(false), marginTop: 14 }}>{T('تم، إخفاء المفتاح', 'Done — hide key')}</button>
            </div>
          )}

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-1)', minHeight: 40, display: 'flex', alignItems: 'center' }}>{T('تفعيل قوقل شيت (مرة واحدة في Supabase)', 'Enable Google Sheets (one time in Supabase)')}</summary>
            <ol style={{ margin: '8px 0 0', paddingInlineStart: 20, fontSize: '0.8rem', lineHeight: 2, color: 'var(--text-2)' }}>
              <li>{T('في لوحة Supabase: Edge Functions ← Deploy a new function ← Via Editor، اسم الدالة sheet-feed بالضبط.', 'In Supabase: Edge Functions → Deploy a new function → Via Editor, name it exactly sheet-feed.')}</li>
              <li>{T('امسح الكود الموجود والصق كود الدالة (الزر تحت)، ثم Deploy.', 'Replace the sample code with the function code (button below), then Deploy.')}</li>
              <li>{T('افتح الدالة ← Details ← أطفئ «Enforce JWT Verification» واحفظ. (ضروري: قوقل شيت لا يرسل ترويسات.)', 'Open the function → Details → turn OFF “Enforce JWT Verification” and save (required: Google Sheets sends no headers).')}</li>
            </ol>
            <div style={{ marginTop: 8 }}>
              <CopyBtn text={sheetFeedSource} label={T('نسخ كود الدالة', 'Copy function code')} />
              <button type="button" onClick={() => downloadText('sheet-feed.ts', sheetFeedSource)} style={{ ...btn(false), minHeight: 38, padding: '0 14px', fontSize: '0.78rem', marginInlineStart: 8 }}>{T('تنزيل كملف', 'Download file')}</button>
            </div>
            <b style={{ display: 'block', margin: '18px 0 6px', fontSize: '0.82rem', color: 'var(--text-1)' }}>{T('الشيت الجاهز بنقرة واحدة (كل الأقسام + تحديث تلقائي)', 'One-click ready sheet (all sections + auto refresh)')}</b>
            <ol style={{ margin: '0 0 8px', paddingInlineStart: 20, fontSize: '0.8rem', lineHeight: 2, color: 'var(--text-2)' }}>
              <li>{T('في قوقل شيت جديد: Extensions ← Apps Script.', 'In a new Google Sheet: Extensions → Apps Script.')}</li>
              <li>{T('امسح الكود الموجود والصق كود السكربت (الزر تحت)، ثم Save.', 'Replace the sample with the script code (button below), then Save.')}</li>
              <li>{T('اختر الدالة setup من القائمة العلوية واضغط Run، واسمح بالصلاحيات. تظهر نافذة: الصق مفتاحك.', 'Pick the function setup in the top bar and Run; allow permissions. A box appears: paste your key.')}</li>
              <li>{T('تنبني كل التبويبات تلقائياً وتتحدث كل 15 دقيقة، حتى والملف مقفل. من قائمة NW Station تقدر تحدّث فوراً.', 'All tabs are built automatically and refresh every 15 minutes, even when closed. Use the NW Station menu to refresh now.')}</li>
            </ol>
            <CopyBtn text={sheetsScript({ baseUrl: SUPA_URL })} label={T('نسخ كود السكربت', 'Copy script code')} />
            <button type="button" onClick={() => downloadText('nw-sheet-setup.gs', sheetsScript({ baseUrl: SUPA_URL }))} style={{ ...btn(false), minHeight: 38, padding: '0 14px', fontSize: '0.78rem', marginInlineStart: 8 }}>{T('تنزيل كملف', 'Download file')}</button>
          </details>

          <button type="button" onClick={() => setSteps(s => !s)} aria-expanded={steps} style={{ ...btn(false), marginTop: 14, minHeight: 40 }}>
            {steps ? T('إخفاء خطوات الإعداد', 'Hide setup steps') : T('خطوات الإعداد في Excel (مرة واحدة)', 'Excel setup steps (one time)')}
          </button>
          {steps && (
            <ol style={{ margin: '12px 0 0', paddingInlineStart: 20, fontSize: '0.8rem', lineHeight: 2, color: 'var(--text-2)' }}>
              <li>{T('افتح Excel (ملف جديد)، ثم «بيانات» ← «الحصول على البيانات» ← «من مصادر أخرى» ← «استعلام فارغ».', 'Open a new Excel file → Data → Get Data → From Other Sources → Blank Query.')}</li>
              <li>{T('اضغط «المحرر المتقدم»، احذف كل شي، والصق كود الاتصال، ثم «تم». سمِّ الاستعلام fnFeed (بهذا الاسم بالضبط). إن ما انلصق: نزّل الكود كملف نصي، افتحه بالمفكرة وانسخه منها.', 'Open Advanced Editor, delete everything, paste the connection code, Done. Name the query exactly fnFeed. If paste fails, download the code as .txt, open it in Notepad and copy from there.')}</li>
              <li>{T('إن طلب بيانات اعتماد اختر «مجهول» (Anonymous). ثم «إغلاق وتحميل إلى…» ← «إنشاء اتصال فقط».', 'If asked for credentials choose Anonymous. Then Close & Load To… → Only Create Connection.')}</li>
              <li>{T('لكل نوع بيانات: «استعلام فارغ» جديد ← «المحرر المتقدم»، الصق كود النوع (يبدأ بـ let وفيه fnFeed("sales") مثلاً)، «تم»، سمِّه باسم البيانات، ثم «إغلاق وتحميل». لا تكتب الكود في خلية بالورقة.', 'For each dataset: new Blank Query → Advanced Editor, paste the dataset code (starts with let and contains fnFeed("sales")), Done, name it, Close & Load. Do not type the code into a worksheet cell.')}</li>
              <li>{T('للتحديث التلقائي: «بيانات» ← «الاستعلامات والاتصالات» ← خصائص الاتصال ← «تحديث كل … دقيقة» و«تحديث عند فتح الملف».', 'Auto refresh: Data → Queries & Connections → connection properties → Refresh every … minutes and Refresh on open.')}</li>
              <li>{T('احفظ الملف: هذا هو ملفك الحي الوحيد. افتحه واضغط «تحديث الكل» كل ما تبي أحدث البيانات.', 'Save the file: it is your single live file. Open it and press Refresh All any time.')}</li>
            </ol>
          )}

          <h4 style={{ margin: '20px 0 8px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-1)' }}>{T(`المفاتيح (${active.length} فعّال)`, `Keys (${active.length} active)`)}</h4>
          {keys.length === 0 && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-3)' }}>{T('لا توجد مفاتيح بعد.', 'No keys yet.')}</p>}
          <div style={{ display: 'grid', gap: 8 }}>
            {keys.map(k => {
              const dead = !!k.revoked_at || new Date(k.expires_at) <= new Date()
              return (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: dead ? 'var(--surface)' : 'var(--card)', opacity: dead ? 0.7 : 1 }}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <b style={{ fontSize: '0.82rem', color: 'var(--text-1)' }}>{k.label || 'Excel'}</b>
                    <span dir="ltr" style={{ marginInlineStart: 8, fontFamily: 'monospace', fontSize: '0.74rem', color: 'var(--text-3)' }}>nwx_…{k.token_hint}</span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.7 }}>
                      {T(`أُنشئ ${fmtDT(k.created_at)} · ينتهي ${fmtExp(k.expires_at, true)}`, `Created ${fmtDT(k.created_at)} · expires ${fmtExp(k.expires_at, false)}`)}<br />
                      {k.last_used_at ? T(`آخر استخدام ${fmtDT(k.last_used_at)} · ${k.use_count} مرة`, `Last used ${fmtDT(k.last_used_at)} · ${k.use_count} times`) : T('لم يُستخدم بعد', 'Never used')}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: dead ? 'var(--surface)' : 'var(--success-bg)', color: dead ? 'var(--text-3)' : 'var(--success)', border: '1px solid var(--border)' }}>
                    {k.revoked_at ? T('مُلغى', 'Revoked') : dead ? T('منتهٍ', 'Expired') : T('فعّال', 'Active')}
                  </span>
                  {!dead && <button type="button" onClick={() => setRevoke(k)} style={{ ...btn(false), minHeight: 38, padding: '0 14px', fontSize: '0.78rem', color: 'var(--danger, #dc2626)' }}>{T('إلغاء المفتاح', 'Revoke')}</button>}
                </div>
              )
            })}
          </div>
        </>
      )}

      {revoke && (
        <ConfirmDialog
          message={T(`إلغاء المفتاح «${revoke.label || 'Excel'}»؟ أي ملف Excel يستخدمه يتوقف عن التحديث فوراً ولا يمكن التراجع.`, `Revoke key “${revoke.label || 'Excel'}”? Any Excel file using it stops refreshing immediately. This cannot be undone.`)}
          confirmLabel={T('نعم، إلغاء المفتاح', 'Yes, revoke')} cancelLabel={T('تراجع', 'Back')}
          onConfirm={() => doRevoke(revoke.id)} onCancel={() => setRevoke(null)} />
      )}
    </div>
  )
}
