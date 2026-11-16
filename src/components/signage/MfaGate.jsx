// التحقق بخطوتين (TOTP) لقسم الشاشات: تفعيل المصادقة بتطبيق (Google/Microsoft Authenticator) ثم إدخال الرمز عند كل دخول
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { btn } from '../dispatch/DispatchCards'
import { lbl, input, Err, SG_ACCENT } from './common'

export default function MfaGate({ isAr = true, onDone, embedded = false }) {
  const t = (a, e) => (isAr ? a : e)
  const [state, setState] = useState('loading')      // loading | enroll | verify | error
  const [factor, setFactor] = useState(null)         // { id, qr?, secret? }
  const [code, setCode] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors()
        if (error) throw error
        const verified = (data?.totp || []).find(f => f.status === 'verified')
        if (verified) { if (alive) { setFactor({ id: verified.id }); setState('verify') } return }
        // بقايا محاولة تفعيل سابقة غير مكتملة تُحذف قبل البدء من جديد
        for (const f of (data?.all || []).filter(f => f.factor_type === 'totp' && f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
        const en = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `NWBUS ${Date.now()}` })
        if (en.error) throw en.error
        if (alive) { setFactor({ id: en.data.id, qr: en.data.totp.qr_code, secret: en.data.totp.secret }); setState('enroll') }
      } catch (e) {
        if (alive) { setErr(/mfa|totp|enabled/i.test(e?.message || '') ? t('التحقق بخطوتين غير مفعّل في مشروع Supabase (Authentication ← Multi-Factor).', 'MFA is not enabled in Supabase.') : t('تعذّر تجهيز التحقق بخطوتين، حاول لاحقاً', 'Could not prepare MFA')); setState('error') }
      }
    })()
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e?.preventDefault()
    const c = code.replace(/\D/g, '')
    if (c.length !== 6) { setErr(t('اكتب الرمز المكوّن من 6 أرقام', 'Enter the 6-digit code')); return }
    setBusy(true); setErr('')
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (ch.error) throw ch.error
      const v = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code: c })
      if (v.error) throw v.error
      await supabase.auth.refreshSession()
      onDone?.()
    } catch (e2) {
      setErr(/invalid|expired|code/i.test(e2?.message || '') ? t('الرمز غير صحيح أو انتهى، جرّب الرمز الحالي', 'Invalid or expired code') : t('تعذّر التحقق، حاول مرة أخرى', 'Verification failed'))
      setCode('')
    }
    setBusy(false)
  }

  const box = embedded ? {} : { maxWidth: 480, margin: '40px auto', padding: 24, border: '1px solid var(--border)', borderRadius: 18, background: 'var(--card)' }
  return (
    <div style={box}>
      {!embedded && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 900, fontSize: '1.15rem', color: 'var(--text-1)' }}>{t('تحقق بخطوتين مطلوب', 'Two-step verification required')}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 6, lineHeight: 1.9 }}>{t('قسم الشاشات محمي. أكّد هويتك برمز التطبيق للمتابعة.', 'The Screens section is protected. Confirm with your authenticator code.')}</div>
        </div>
      )}
      {state === 'loading' && <div style={{ padding: 20, color: 'var(--text-3)', fontWeight: 700 }}>{t('جارٍ التجهيز…', 'Preparing…')}</div>}
      {state === 'error' && <Err>{err}</Err>}
      {(state === 'enroll' || state === 'verify') && (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {state === 'enroll' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', padding: 14, borderRadius: 14, background: 'var(--surface)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.9, alignSelf: 'stretch' }}>
                {t('1) ثبّت تطبيق Google Authenticator أو Microsoft Authenticator.', '1) Install an authenticator app.')}<br />{t('2) امسح هذا الرمز، ثم اكتب الرمز المكوّن من 6 أرقام.', '2) Scan this code, then enter the 6-digit code.')}
              </div>
              <img src={factor.qr} alt="QR" width="190" height="190" style={{ background: '#fff', padding: 8, borderRadius: 12 }} />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', textAlign: 'center' }}>{t('أو أدخل المفتاح يدوياً:', 'Or enter manually:')}<br /><b dir="ltr" style={{ fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '.08em', userSelect: 'all', overflowWrap: 'anywhere', color: 'var(--text-1)' }}>{factor.secret}</b></div>
            </div>
          )}
          <Err>{err}</Err>
          <div>
            <label style={lbl}>{t('الرمز (6 أرقام)', 'Code (6 digits)')}</label>
            <input autoFocus value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setErr('') }} placeholder="000000"
              style={{ ...input, textAlign: 'center', fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 900, fontSize: '1.6rem', letterSpacing: '.3em', padding: '14px 10px' }} />
          </div>
          <button type="submit" disabled={busy} style={{ ...btn('primary'), background: SG_ACCENT, padding: '12px', fontSize: '0.9rem', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : state === 'enroll' ? t('تفعيل والمتابعة', 'Enable & continue') : t('تحقق', 'Verify')}</button>
        </form>
      )}
    </div>
  )
}
