import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import SelectField from '../shared/SelectField'
import { SettingsCard, Switch, Icon } from './ui'

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const fmtDT = (v, isAr) => v ? new Date(v).toLocaleString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }) : '—'

// إعدادات النسخة الاحتياطية والتقرير اليومي — السكربت على Google يقرأ هذي القيم من قاعدة البيانات
export default function BackupSettings({ isAr, onSaved }) {
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
    onSaved?.(isAr ? 'تم حفظ إعدادات النسخ الاحتياطي' : 'Backup settings saved')
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

  const title = isAr ? 'النسخ الاحتياطي والتقرير اليومي' : 'Backup & daily report'

  if (missing) {
    return (
      <SettingsCard span icon="backup" title={title}>
        <p className="st-note warn" style={{ margin: 0 }}>{isAr ? 'جدول الإعدادات غير مثبّت بقاعدة البيانات — شغّل ملف backup_settings.sql من SQL Editor.' : 'The settings table is not installed — run backup_settings.sql in the SQL Editor.'}</p>
      </SettingsCard>
    )
  }
  if (!cfg) return <SettingsCard span icon="backup" title={title}><p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-3)' }}>{isAr ? 'جاري التحميل…' : 'Loading…'}</p></SettingsCard>

  const status = cfg.last_run_at
    ? (cfg.last_ok ? { tone: 'ok', t: isAr ? 'نجحت' : 'Succeeded' } : { tone: 'err', t: isAr ? 'فشلت' : 'Failed' })
    : null
  const canSave = !(!dirty && !draft.trim() || busy === 'save')

  return (
    <SettingsCard span icon="mail" title={title}
      desc={isAr ? 'ملف Excel احترافي: لوحة تحليل تنفيذية، ترتيب المحطات، اتجاهات 30 يوماً، ورقة لكل محطة، ونسخة كاملة من الجداول — يُرسل للإيميلات أدناه.' : 'A professional Excel file: executive analysis dashboard, station ranking, 30-day trends, a sheet per station and a full data copy — sent to the emails below.'}
      aside={<Switch checked={enabled} onChange={setEnabled} label={enabled ? (isAr ? 'الإرسال اليومي مفعّل' : 'Daily sending on') : (isAr ? 'الإرسال اليومي متوقف' : 'Daily sending off')} />}>

      <div className="st-split">
        <div>
          <label className="st-lbl" htmlFor="st-bk-email">{isAr ? 'الإيميلات المستلمة' : 'Recipient emails'}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, minHeight: 34 }}>
            {emails.length === 0 && <span style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>{isAr ? 'لم تُضف إيميلات بعد' : 'No emails yet'}</span>}
            {emails.map(e => (
              <span key={e} className="st-chip" dir="ltr">
                {e}
                <button type="button" onClick={() => setEmails(p => p.filter(x => x !== e))} aria-label={isAr ? 'إزالة' : 'Remove'}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input id="st-bk-email" className="st-input" value={draft} onChange={e => setDraft(e.target.value)} dir="ltr" inputMode="email" placeholder="name@company.com"
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEmail() } }} style={{ flex: 1 }} />
            <button type="button" className="st-btn" onClick={() => addEmail()}>{isAr ? 'إضافة' : 'Add'}</button>
          </div>

          <label className="st-lbl">{isAr ? 'وقت الإرسال اليومي (بتوقيت الرياض)' : 'Daily send time (Riyadh)'}</label>
          <div style={{ maxWidth: 220, marginBottom: 22 }}>
            <SelectField value={hour} onChange={e => setHour(Number(e.target.value))} dir="ltr" className="st-input st-input-btn">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </SelectField>
          </div>

          {dirty && <p className="st-note warn" role="status" style={{ margin: '0 0 14px' }}>{isAr ? 'لديك تعديلات غير محفوظة. اضغط «حفظ» لتطبيقها.' : 'You have unsaved changes. Press Save to apply them.'}</p>}
          <div className="st-actions">
            <button type="button" className="st-btn pri" onClick={save} disabled={!canSave}>
              {busy === 'save' ? (isAr ? 'جاري الحفظ…' : 'Saving…') : (isAr ? 'حفظ' : 'Save')}
            </button>
            <button type="button" className="st-btn" onClick={sendNow} disabled={busy === 'now' || pending}>
              <Icon name="mail" size={18} />
              {pending ? (isAr ? 'بانتظار التنفيذ…' : 'Waiting…') : (isAr ? 'إرسال الآن' : 'Send now')}
            </button>
          </div>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={`st-note ${msg.ok ? 'ok' : 'err'}`} style={{ margin: '14px 0 0' }}>{msg.ok && <Icon name="check" size={16} />}{msg.text}</p>}
        </div>

        <div className="st-panel">
          <div className="st-lbl" style={{ marginBottom: 12 }}>{isAr ? 'حالة آخر تشغيل' : 'Last run status'}</div>
          <div className="st-kv" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
            <div><span>{isAr ? 'آخر إرسال' : 'Last run'}</span><b>{fmtDT(cfg.last_run_at, isAr)}</b></div>
            <div><span>{isAr ? 'النتيجة' : 'Result'}</span>{status ? <b className={`st-note ${status.tone}`} style={{ display: 'inline-flex', padding: '2px 12px', borderRadius: 99 }}>{status.t}</b> : <b>—</b>}</div>
            <div><span>{isAr ? 'الصفوف المنسوخة' : 'Rows copied'}</span><b dir="ltr">{cfg.last_rows != null ? Number(cfg.last_rows).toLocaleString('en-US') : '—'}{cfg.last_seconds != null ? ` · ${cfg.last_seconds}s` : ''}</b></div>
          </div>
          {cfg.last_message && (
            <p style={{ margin: '12px 0 0', fontSize: '0.84rem', color: cfg.last_ok ? 'var(--text-3)' : 'var(--danger)', lineHeight: 1.7 }}>{cfg.last_message}</p>
          )}
        </div>
      </div>
    </SettingsCard>
  )
}
