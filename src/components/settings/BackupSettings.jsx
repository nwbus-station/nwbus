import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import SelectField from '../shared/SelectField'

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const fmtDT = (v, isAr) => v ? new Date(v).toLocaleString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }) : '—'

// إعدادات النسخة الاحتياطية والتقرير اليومي — السكربت على Google يقرأ هذي القيم من قاعدة البيانات
export default function BackupSettings({ isAr }) {
  const [cfg, setCfg] = useState(null)
  const [emails, setEmails] = useState([])
  const [draft, setDraft] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [hour, setHour] = useState(5)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null) // { ok, text }
  const [missing, setMissing] = useState(false)

  const load = useCallback(async (keepDraft) => {
    const { data, error } = await supabase.from('backup_settings').select('*').eq('id', 1).maybeSingle()
    if (error || !data) { setMissing(true); return }
    setMissing(false); setCfg(data)
    if (!keepDraft) { setEmails(data.emails ?? []); setEnabled(!!data.enabled); setHour(data.send_hour ?? 5) }
  }, [])
  useEffect(() => { load(false) }, [load])

  const pending = !!cfg?.send_now_at && (!cfg.last_run_at || new Date(cfg.send_now_at) > new Date(cfg.last_run_at))
  // أثناء انتظار تنفيذ الطلب نحدّث الحالة كل 20 ثانية
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => load(true), 20000)
    return () => clearInterval(t)
  }, [pending, load])

  function addEmail(raw) {
    const parts = String(raw ?? draft).split(/[\s,;،]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!parts.length) return
    const bad = parts.filter(p => !EMAIL_RE.test(p))
    if (bad.length) { setMsg({ ok: false, text: (isAr ? 'إيميل غير صحيح: ' : 'Invalid email: ') + bad.join(' , ') }); return }
    setEmails(prev => [...new Set([...prev, ...parts])]); setDraft(''); setMsg(null)
  }

  const dirty = cfg && (JSON.stringify(emails) !== JSON.stringify(cfg.emails ?? []) || enabled !== !!cfg.enabled || hour !== cfg.send_hour)

  async function save() {
    if (draft.trim()) { addEmail(); return }
    setBusy('save'); setMsg(null)
    const { error } = await supabase.from('backup_settings').update({ emails, enabled, send_hour: hour, updated_at: new Date().toISOString() }).eq('id', 1)
    setBusy('')
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setMsg({ ok: true, text: isAr ? 'تم حفظ الإعدادات' : 'Settings saved' })
    load(false)
  }

  async function sendNow() {
    if (dirty) { setMsg({ ok: false, text: isAr ? 'احفظ التعديلات أولاً' : 'Save your changes first' }); return }
    if (!emails.length) { setMsg({ ok: false, text: isAr ? 'أضف إيميلاً واحداً على الأقل' : 'Add at least one email' }); return }
    setBusy('now'); setMsg(null)
    const { error } = await supabase.from('backup_settings').update({ send_now_at: new Date().toISOString() }).eq('id', 1)
    setBusy('')
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setMsg({ ok: true, text: isAr ? 'تم الطلب — يصلك الملف خلال 5 دقائق تقريباً' : 'Requested — the file arrives within about 5 minutes' })
    load(true)
  }

  const card = { background: '#fff', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 16 }
  const lbl = { fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 6, display: 'block' }

  if (missing) {
    return (
      <div style={card}>
        <h3 style={{ margin: '0 0 8px', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-1)' }}>{isAr ? 'النسخ الاحتياطي والتقرير اليومي' : 'Backup & daily report'}</h3>
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#B45309' }}>{isAr ? 'جدول الإعدادات غير مثبّت بقاعدة البيانات — شغّل ملف backup_settings.sql من SQL Editor.' : 'The settings table is not installed — run backup_settings.sql in the SQL Editor.'}</p>
      </div>
    )
  }
  if (!cfg) return <div style={card}><p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-3)' }}>{isAr ? 'جاري التحميل…' : 'Loading…'}</p></div>

  const status = cfg.last_run_at
    ? (cfg.last_ok ? { c: '#15803D', bg: '#F0FDF4', bd: '#BBF7D0', t: isAr ? 'نجحت' : 'Succeeded' } : { c: '#B91C1C', bg: '#FEF2F2', bd: '#FECACA', t: isAr ? 'فشلت' : 'Failed' })
    : null

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-1)' }}>{isAr ? 'النسخ الاحتياطي والتقرير اليومي' : 'Backup & daily report'}</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
            {isAr ? 'ملف Excel احترافي: لوحة تحليل تنفيذية، ترتيب المحطات، اتجاهات 30 يوماً، ورقة لكل محطة، ونسخة كاملة من الجداول — يُرسل للإيميلات أدناه.' : 'A professional Excel file: executive analysis dashboard, station ranking, 30-day trends, a sheet per station and a full data copy — sent to the emails below.'}
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', fontWeight: 700, color: enabled ? '#15803D' : 'var(--text-3)', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ accentColor: '#15803D' }} />
          {isAr ? 'الإرسال اليومي مفعّل' : 'Daily sending on'}
        </label>
      </div>

      <label style={lbl}>{isAr ? 'الإيميلات المستلمة' : 'Recipient emails'}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {emails.length === 0 && <span style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>{isAr ? 'لم تُضف إيميلات بعد' : 'No emails yet'}</span>}
        {emails.map(e => (
          <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 99, padding: '4px 6px 4px 12px', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-1)' }} dir="ltr">
            {e}
            <button type="button" onClick={() => setEmails(p => p.filter(x => x !== e))} aria-label="remove"
              style={{ width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#e2e8f0', color: '#475569', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} dir="ltr" inputMode="email" placeholder="name@company.com"
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEmail() } }}
          style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: '0.82rem', outline: 'none' }} />
        <button type="button" onClick={() => addEmail()} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>{isAr ? 'إضافة' : 'Add'}</button>
      </div>

      <label style={lbl}>{isAr ? 'وقت الإرسال اليومي (بتوقيت الرياض)' : 'Daily send time (Riyadh)'}</label>
      <SelectField value={hour} onChange={e => setHour(Number(e.target.value))} dir="ltr"
        style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: '0.82rem', background: '#fff', marginBottom: 14 }}>
        {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
      </SelectField>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={save} disabled={!dirty && !draft.trim() || busy === 'save'}
          style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: '#1C2B4A', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: (!dirty && !draft.trim()) ? 0.4 : 1 }}>
          {busy === 'save' ? (isAr ? 'جاري الحفظ…' : 'Saving…') : (isAr ? 'حفظ' : 'Save')}
        </button>
        <button type="button" onClick={sendNow} disabled={busy === 'now' || pending}
          style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid #1C2B4A', background: '#fff', color: '#1C2B4A', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: (busy === 'now' || pending) ? 0.5 : 1 }}>
          {pending ? (isAr ? 'بانتظار التنفيذ…' : 'Waiting…') : (isAr ? 'إرسال الآن' : 'Send now')}
        </button>
        {msg && <span style={{ fontSize: '0.76rem', fontWeight: 600, color: msg.ok ? '#15803D' : '#B91C1C' }}>{msg.text}</span>}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 9, padding: '10px 14px' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginBottom: 3 }}>{isAr ? 'آخر إرسال' : 'Last run'}</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>{fmtDT(cfg.last_run_at, isAr)}</div>
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 9, padding: '10px 14px' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginBottom: 3 }}>{isAr ? 'النتيجة' : 'Result'}</div>
          {status ? <span style={{ fontSize: '0.74rem', fontWeight: 800, color: status.c, background: status.bg, border: `1px solid ${status.bd}`, borderRadius: 99, padding: '2px 10px' }}>{status.t}</span> : <span style={{ fontSize: '0.8rem' }}>—</span>}
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 9, padding: '10px 14px' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginBottom: 3 }}>{isAr ? 'الصفوف المنسوخة' : 'Rows copied'}</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }} dir="ltr">{cfg.last_rows != null ? Number(cfg.last_rows).toLocaleString('en-US') : '—'}{cfg.last_seconds != null ? ` · ${cfg.last_seconds}s` : ''}</div>
        </div>
      </div>
      {cfg.last_message && (
        <p style={{ margin: '10px 0 0', fontSize: '0.74rem', color: cfg.last_ok ? 'var(--text-3)' : '#B91C1C', lineHeight: 1.7 }}>{cfg.last_message}</p>
      )}
    </div>
  )
}
