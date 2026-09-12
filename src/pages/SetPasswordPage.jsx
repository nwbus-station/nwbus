import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

const MONO = "'IBM Plex Mono', monospace"

export default function SetPasswordPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const isAr = i18n.language === 'ar'

  const [status,   setStatus]   = useState('checking') // checking | ready | invalid
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [done,     setDone]     = useState(false)

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const access_token  = hash.get('access_token')
    const refresh_token = hash.get('refresh_token')
    if (!access_token || !refresh_token) { setStatus('invalid'); return }

    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      setStatus(error ? 'invalid' : 'ready')
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError(isAr ? 'كلمة المرور 6 أحرف على الأقل' : 'Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match')
      return
    }
    setSaving(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateErr) { setError(updateErr.message); return }
    setDone(true)
    setTimeout(() => navigate('/'), 1800)
  }

  const inputStyle = {
    width: '100%', padding: '10px 13px',
    background: '#0C151D', color: '#F2EFE8',
    border: '1px solid #2C3B47', borderRadius: 4,
    fontSize: '0.875rem', fontFamily: MONO,
    outline: 'none', transition: 'border-color 0.14s',
    boxSizing: 'border-box', textAlign: 'left',
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{
      minHeight: '100vh', background: '#101B24',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ margin: 0, color: '#F2EFE8', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.14em', fontFamily: MONO }}>
            NORTH WEST BUS
          </p>
          <p style={{ margin: 0, color: '#77848E', fontSize: '0.68rem', marginTop: 2 }}>
            {isAr ? 'تفعيل الحساب' : 'Account Activation'}
          </p>
        </div>

        <div style={{ background: '#16232E', border: '1px solid #2C3B47', borderRadius: 4, padding: '28px 24px' }}>
          {status === 'checking' && (
            <p style={{ color: '#77848E', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
              {isAr ? 'جارٍ التحقق من الرابط…' : 'Verifying link…'}
            </p>
          )}

          {status === 'invalid' && (
            <p style={{ color: '#F87171', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
              {isAr ? 'الرابط غير صالح أو منتهي الصلاحية — اطلب من الإدارة إرسال رابط جديد.' : 'This link is invalid or expired — ask your admin to resend it.'}
            </p>
          )}

          {status === 'ready' && !done && (
            <form onSubmit={handleSubmit}>
              <p style={{ margin: '0 0 20px', color: '#77848E', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', fontFamily: MONO }}>
                {isAr ? '— عيّن كلمة مرورك' : '— SET YOUR PASSWORD'}
              </p>

              <label style={{ display: 'block', marginBottom: 5, color: '#A8B2BA', fontSize: '0.75rem', fontWeight: 600 }}>
                {isAr ? 'كلمة المرور الجديدة' : 'New Password'}
              </label>
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  required autoComplete="new-password" dir="ltr"
                  style={{ ...inputStyle, paddingRight: 40 }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                  style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 40, background: 'none', border: 'none', cursor: 'pointer', color: '#77848E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {showPass
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>

              <label style={{ display: 'block', marginBottom: 5, color: '#A8B2BA', fontSize: '0.75rem', fontWeight: 600 }}>
                {isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                value={confirm} onChange={e => setConfirm(e.target.value)}
                required autoComplete="new-password" dir="ltr"
                style={{ ...inputStyle, marginBottom: 18 }}
              />

              {error && (
                <div style={{ marginBottom: 16, padding: '9px 12px', fontSize: '0.75rem', background: 'rgba(220,38,38,0.12)', color: '#F87171', borderRadius: 4, fontWeight: 500 }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={saving} style={{
                width: '100%', padding: '11px 0', borderRadius: 4, border: 'none',
                background: saving ? '#2C3B47' : '#111',
                color: saving ? '#77848E' : '#fff',
                fontWeight: 700, fontSize: '0.875rem',
                cursor: saving ? 'default' : 'pointer',
                fontFamily: 'inherit', transition: 'all 0.14s',
              }}>
                {saving ? (isAr ? 'جارٍ الحفظ…' : 'Saving…') : (isAr ? 'تفعيل الحساب' : 'Activate Account')}
              </button>
            </form>
          )}

          {done && (
            <p style={{ color: '#4ADE80', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
              {isAr ? '✓ تم تفعيل حسابك — جارٍ تحويلك…' : '✓ Account activated — redirecting…'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
