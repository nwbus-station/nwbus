// تبويب الحماية والتحكم (أدمن): إيقاف جميع الشاشات، التحقق بخطوتين، رسالة الطوارئ، تدوير المفاتيح، وسجل التدقيق
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Sheet, { Ic } from '../dispatch/Sheet'
import { btn } from '../dispatch/DispatchCards'
import ConfirmDialog from '../shared/ConfirmDialog'
import SelectField from '../shared/SelectField'
import MfaGate from './MfaGate'
import { lbl, input, Pill, Empty, Err } from './common'
import { AUDIT_LABEL, fmtDT, sgError } from '../../utils/signage'

const DURATIONS = [[15, '15 دقيقة', '15 min'], [60, 'ساعة', '1 hour'], [240, '4 ساعات', '4 hours'], [1440, '24 ساعة', '24 hours'], [0, 'حتى أوقفها يدوياً', 'Until I stop it']]
const CONFIRM_WORD = 'إيقاف'

// نافذة إيقاف جميع الشاشات: تتطلب كتابة كلمة التأكيد لتفادي الضغط بالخطأ
export function HaltSheet({ isAr, onClose, onDone }) {
  const t = (a, e) => (isAr ? a : e)
  const [reason, setReason] = useState(''); const [word, setWord] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const ok = word.trim() === CONFIRM_WORD
  async function go() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('signage_halt_set', { p_halted: true, p_reason: reason.trim() || null })
    setBusy(false)
    if (error) { setErr(sgError(error, isAr)); return }
    onDone()
  }
  return (
    <Sheet isAr={isAr} title={t('إيقاف جميع الشاشات', 'Stop all screens')} icon={Ic.alert} accent="#dc2626" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="button" disabled={!ok || busy} onClick={go} style={{ ...btn('danger'), background: '#dc2626', color: '#fff', border: 'none', padding: '11px 28px', fontSize: '0.88rem', opacity: ok && !busy ? 1 : 0.5 }}>{busy ? '…' : t('إيقاف كل الشاشات الآن', 'Stop all now')}</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(220,38,38,.1)', color: '#dc2626', fontWeight: 800, fontSize: '0.82rem', lineHeight: 1.9 }}>
          {t('ستتحول كل شاشات المملكة إلى شاشة سوداء خلال نصف دقيقة، ولن يُعرض أي محتوى حتى تعيد تشغيلها من هنا.', 'Every screen goes black within ~30 seconds until you resume.')}
        </div>
        <Err>{err}</Err>
        <div><label style={lbl}>{t('السبب (اختياري، يظهر بخط صغير على الشاشة)', 'Reason (optional)')}</label><input value={reason} maxLength={200} onChange={e => setReason(e.target.value)} style={input} placeholder={t('مثال: صيانة الشبكة', 'e.g. network maintenance')} /></div>
        <div><label style={lbl}>{t(`للتأكيد اكتب كلمة «${CONFIRM_WORD}»`, `Type "${CONFIRM_WORD}" to confirm`)}</label><input value={word} onChange={e => setWord(e.target.value)} style={input} autoFocus /></div>
      </div>
    </Sheet>
  )
}

export default function SafetyTab({ isAr, emergency, audit, control, access, reload, flash, onHalt }) {
  const t = (a, e) => (isAr ? a : e)
  const [msg, setMsg] = useState(''); const [mins, setMins] = useState('60')
  const [ask, setAsk] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [enroll, setEnroll] = useState(false)
  const live = emergency?.active && (!emergency.ends_at || new Date(emergency.ends_at) > new Date())
  const halted = !!control?.halted

  async function call(fn, okMsg) {
    setBusy(true); setErr('')
    const { error } = await fn()
    setBusy(false); setAsk(null)
    if (error) { setErr(sgError(error, isAr)); flash(sgError(error, isAr), false); return }
    flash(okMsg, true); reload()
  }
  const setEmergency = active => call(() => supabase.rpc('signage_emergency_set', { p_active: active, p_message: active ? msg.trim() : null, p_minutes: active && Number(mins) > 0 ? Number(mins) : null }),
    active ? t('فُعّلت رسالة الطوارئ، ستظهر على كل الشاشات خلال دقيقة', 'Emergency active within a minute') : t('أُوقفت رسالة الطوارئ', 'Emergency stopped'))

  const Section = ({ title, pill, children, danger }) => (
    <section style={{ border: `1.5px solid ${danger ? '#dc2626' : 'var(--border)'}`, background: danger ? 'rgba(220,38,38,.05)' : 'var(--card)', borderRadius: 16, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 900, color: 'var(--text-1)' }}>{title}</h2>{pill}
      </div>
      {children}
    </section>
  )
  const P = ({ children }) => <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: 'var(--text-3)', lineHeight: 1.9 }}>{children}</p>

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Err>{err}</Err>

      <Section danger={halted} title={t('إيقاف جميع الشاشات', 'Stop all screens')} pill={<Pill color={halted ? '#dc2626' : '#16a34a'} dot>{halted ? t('الشاشات متوقفة', 'Halted') : t('تعمل', 'Running')}</Pill>}>
        <P>{t('زر الطوارئ الأخير: يحوّل كل شاشات المملكة إلى شاشة سوداء بلا محتوى خلال نصف دقيقة، ويمكن عكسه في أي وقت. للأدمن فقط ويُسجَّل من أوقفها ويُشعَر باقي الأدمن.', 'Last-resort kill switch. Reversible. Admin only and audited.')}</P>
        {halted ? (
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.9 }}>{t('أوقفها', 'By')} <b>{control.halted_by_name || '—'}</b> · {fmtDT(control.halted_at)}{control.halt_reason ? ` · ${control.halt_reason}` : ''}</div>
            <button type="button" disabled={busy} onClick={() => setAsk('resume')} style={{ ...btn('primary'), background: '#16a34a', padding: '11px 26px', fontSize: '0.88rem' }}>{t('تشغيل الشاشات', 'Resume screens')}</button>
          </div>
        ) : <button type="button" onClick={onHalt} style={{ ...btn('primary'), background: '#dc2626', padding: '11px 26px', fontSize: '0.88rem' }}>{t('إيقاف جميع الشاشات…', 'Stop all screens…')}</button>}
      </Section>

      <Section title={t('التحقق بخطوتين', 'Two-step verification')} pill={<Pill color={control?.require_mfa ? '#16a34a' : '#d97706'} dot>{control?.require_mfa ? t('مفروض', 'Enforced') : t('غير مفروض', 'Not enforced')}</Pill>}>
        <P>{t('عند الفرض لا يدخل أحد قسم الشاشات (أدمن أو تسويق) إلا برمز من تطبيق المصادقة، حتى لو سُرقت كلمة مرور حسابه. الأجهزة نفسها لا تتأثر. لا تُفرض قبل أن تُفعّل المصادقة لحسابك أنت.', 'When enforced, nobody can open Screens without an authenticator code.')}</P>
        {control?.require_mfa ? (
          <button type="button" disabled={busy} onClick={() => setAsk('mfa_off')} style={btn('warn', { padding: '10px 20px' })}>{t('إلغاء فرض التحقق', 'Stop enforcing')}</button>
        ) : access?.aal2 ? (
          <button type="button" disabled={busy} onClick={() => setAsk('mfa_on')} style={{ ...btn('primary'), background: '#16a34a', padding: '10px 22px' }}>{t('فرض التحقق بخطوتين على الجميع', 'Enforce for everyone')}</button>
        ) : (
          <button type="button" onClick={() => setEnroll(true)} style={{ ...btn('primary'), padding: '10px 22px' }}>{t('فعّل المصادقة لحسابي أولاً', 'Set up my authenticator first')}</button>
        )}
        {control?.mfa_set_at && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 8 }}>{t('آخر تغيير', 'Last change')}: {control.mfa_set_by_name || '—'} · {fmtDT(control.mfa_set_at)}</div>}
      </Section>

      <Section title={t('رسالة الطوارئ', 'Emergency message')} pill={<Pill color={live ? '#dc2626' : '#64748b'} dot>{live ? t('مفعّلة الآن', 'Active') : t('غير مفعّلة', 'Off')}</Pill>} danger={live}>
        <P>{t('تقطع كل المحتوى على جميع الشاشات بشاشة حمراء بالرسالة، وتصل خلال دقيقة. للأدمن فقط ويُسجَّل من فعّلها.', 'Replaces all content with a red message. Admin only and audited.')}</P>
        {live ? (
          <div>
            <div style={{ padding: '14px 16px', borderRadius: 12, background: '#b91c1c', color: '#fff', fontWeight: 900, fontSize: '1rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{emergency.message}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', margin: '8px 0 12px' }}>{t('فعّلها', 'By')} {emergency.set_by_name || '—'} · {fmtDT(emergency.set_at)}{emergency.ends_at ? ` · ${t('تنتهي', 'ends')} ${fmtDT(emergency.ends_at)}` : ''}</div>
            <button type="button" disabled={busy} onClick={() => setEmergency(false)} style={{ ...btn('primary'), background: '#16a34a', padding: '11px 24px', fontSize: '0.86rem' }}>{t('إيقاف رسالة الطوارئ', 'Stop emergency')}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div><label style={lbl}>{t('نص الرسالة *', 'Message *')}</label><textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3} maxLength={300} style={{ ...input, resize: 'vertical' }} placeholder={t('مثال: يُرجى التوجه إلى أقرب مخرج', 'e.g. Please proceed to the nearest exit')} /></div>
            <div style={{ maxWidth: 260 }}><label style={lbl}>{t('المدة', 'Duration')}</label>
              <SelectField value={mins} onChange={e => setMins(e.target.value)} style={input}>{DURATIONS.map(([v, a, e]) => <option key={v} value={v}>{isAr ? a : e}</option>)}</SelectField></div>
            <div><button type="button" disabled={!msg.trim() || busy} onClick={() => setAsk('on')} style={{ ...btn('primary'), background: '#dc2626', padding: '11px 24px', fontSize: '0.86rem', opacity: !msg.trim() ? 0.5 : 1 }}>{t('تفعيل الطوارئ على كل الشاشات', 'Activate on all screens')}</button></div>
          </div>
        )}
      </Section>

      <Section title={t('مفاتيح الأجهزة', 'Device keys')}>
        <P>{t('كل شاشة تغيّر مفتاحها السري تلقائياً كل 3 أيام، فمفتاح مسروق يفقد قيمته. استخدم الزر عند الشك بحدوث تسريب لتدوير مفاتيح كل الشاشات فوراً.', 'Each screen rotates its secret key every 3 days automatically.')}</P>
        <button type="button" disabled={busy} onClick={() => setAsk('rotate_all')} style={btn('warn', { padding: '10px 20px' })}>{t('تدوير مفاتيح كل الشاشات الآن', 'Rotate all keys now')}</button>
      </Section>

      <section>
        <h2 style={{ margin: '0 0 10px', fontSize: '1.02rem', fontWeight: 900, color: 'var(--text-1)' }}>{t('سجل التدقيق', 'Audit log')}</h2>
        {audit.length === 0 ? <Empty title={t('لا توجد عمليات مسجّلة', 'No entries')} /> : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--card)' }}>
            {audit.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: '0.8rem' }}>
                <span dir="ltr" style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--text-3)', fontSize: '0.72rem', minWidth: 118 }}>{fmtDT(a.at)}</span>
                <b style={{ color: a.action === 'device.suspect' || a.action === 'halt.on' ? '#dc2626' : 'var(--text-1)' }}>{AUDIT_LABEL[a.action] || a.action}</b>
                <span style={{ color: 'var(--text-2)', flex: 1, minWidth: 160, overflowWrap: 'anywhere' }}>{a.detail?.title || a.detail?.name || a.detail?.message || a.detail?.reason || ''}</span>
                <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>{a.actor_name || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {ask === 'on' && <ConfirmDialog title={t('تفعيل الطوارئ', 'Activate emergency')} confirmLabel={busy ? '…' : t('تفعيل الآن', 'Activate now')}
        message={t('ستُقطع كل الشاشات في المملكة وتعرض هذه الرسالة فقط. هل أنت متأكد؟', 'Every screen will show only this message. Are you sure?')} onCancel={() => setAsk(null)} onConfirm={() => setEmergency(true)} />}
      {ask === 'resume' && <ConfirmDialog danger={false} title={t('تشغيل الشاشات', 'Resume screens')} confirmLabel={busy ? '…' : t('تشغيل', 'Resume')}
        message={t('ستعود كل الشاشات لعرض محتواها خلال نصف دقيقة.', 'All screens resume within ~30 seconds.')} onCancel={() => setAsk(null)}
        onConfirm={() => call(() => supabase.rpc('signage_halt_set', { p_halted: false, p_reason: null }), t('أُعيد تشغيل الشاشات', 'Screens resumed'))} />}
      {ask === 'mfa_on' && <ConfirmDialog danger={false} title={t('فرض التحقق بخطوتين', 'Enforce MFA')} confirmLabel={busy ? '…' : t('فرض', 'Enforce')}
        message={t('كل من لديه صلاحية قسم الشاشات (أدمن أو تسويق) سيُطلب منه تفعيل التطبيق وإدخال الرمز عند الدخول. حسابك جاهز بالفعل.', 'Everyone with Screens access will need an authenticator code.')} onCancel={() => setAsk(null)}
        onConfirm={() => call(() => supabase.rpc('signage_mfa_require', { p_on: true }), t('فُرض التحقق بخطوتين', 'MFA enforced'))} />}
      {ask === 'mfa_off' && <ConfirmDialog title={t('إلغاء فرض التحقق', 'Stop enforcing MFA')} confirmLabel={busy ? '…' : t('إلغاء الفرض', 'Stop')}
        message={t('سيُسمح بالدخول بكلمة المرور فقط، وهذا يقلل الحماية.', 'Access will need only the password, lowering protection.')} onCancel={() => setAsk(null)}
        onConfirm={() => call(() => supabase.rpc('signage_mfa_require', { p_on: false }), t('أُلغي الفرض', 'Not enforced'))} />}
      {ask === 'rotate_all' && <ConfirmDialog danger={false} title={t('تدوير كل المفاتيح', 'Rotate all keys')} confirmLabel={busy ? '…' : t('تدوير الآن', 'Rotate')}
        message={t('ستستلم كل شاشة مفتاحاً جديداً عند اتصالها القادم (خلال دقيقة تقريباً) وتبطل المفاتيح القديمة.', 'Each screen receives a new key on its next poll.')} onCancel={() => setAsk(null)}
        onConfirm={() => call(() => supabase.rpc('signage_devices_command_all', { p_cmd: 'rotate' }), t('طُلب تدوير المفاتيح', 'Rotation requested'))} />}
      {enroll && (
        <Sheet isAr={isAr} title={t('تفعيل المصادقة لحسابك', 'Set up authenticator')} icon={Ic.check} accent="#2563eb" onClose={() => setEnroll(false)}
          footer={<button type="button" onClick={() => setEnroll(false)} style={btn('ghost')}>{t('إغلاق', 'Close')}</button>}>
          <MfaGate isAr={isAr} embedded onDone={() => { setEnroll(false); flash(t('تم تفعيل المصادقة لحسابك. يمكنك الآن فرض التحقق على الجميع', 'Authenticator enabled'), true); reload(true) }} />
        </Sheet>
      )}
    </div>
  )
}
