import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

const MONO = "'IBM Plex Mono', monospace"

export default function LoginPage() {
  const { i18n } = useTranslation()
  const { signIn, profile } = useAuth()
  const navigate = useNavigate()
  const isAr = i18n.language === 'ar'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  if (profile) { navigate('/'); return null }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(username.trim(), password)
      navigate('/')
    } catch {
      setError(isAr ? 'اسم المستخدم أو كلمة المرور غير صحيحة' : 'Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  function toggleLang() {
    const next = isAr ? 'en' : 'ar'
    i18n.changeLanguage(next)
    document.documentElement.lang = next
    document.documentElement.dir  = next === 'ar' ? 'rtl' : 'ltr'
  }

  const inputStyle = {
    width: '100%', padding: '11px 13px',
    background: '#0C151D', color: '#F2EFE8',
    border: '1px solid #2C3B47', borderRadius: 3,
    fontSize: '0.875rem', fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.15s',
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{
      minHeight: '100vh', background: '#101B24',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>

      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* ── Wordmark ── */}
        <div style={{ lineHeight: 1.2, marginBottom: 22 }}>
          <p style={{ margin: 0, color: '#F2EFE8', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '0.18em', fontFamily: MONO }}>
            NORTH WEST BUS
          </p>
          <p style={{ margin: 0, color: '#77848E', fontSize: '0.72rem', marginTop: 4 }}>
            {isAr ? 'نظام تشغيل المحطات' : 'Stations Operations System'}
          </p>
        </div>

        {/* ── خط المسار (زخرفة نقل) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 22 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', border: '2px solid #DE9526', flexShrink: 0 }} />
          <div style={{ flex: 1, height: 2, background: 'repeating-linear-gradient(90deg, #2C3B47 0 10px, transparent 10px 16px)' }} />
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#DE9526', flexShrink: 0 }} />
        </div>

        {/* ── Form panel ── */}
        <form onSubmit={handleSubmit} style={{
          background: '#16232E', border: '1px solid #2C3B47', borderRadius: 4,
          padding: '26px 24px',
        }}>
          <p style={{ margin: '0 0 20px', color: '#77848E', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.18em', fontFamily: MONO }}>
            {isAr ? '— تسجيل الدخول' : '— SIGN IN'}
          </p>

          <label style={{ display: 'block', marginBottom: 6, color: '#A8B2BA', fontSize: '0.75rem', fontWeight: 600 }}>
            {isAr ? 'اسم المستخدم' : 'Username'}
          </label>
          <input
            type="text" value={username} onChange={e => setUsername(e.target.value)}
            required autoFocus autoComplete="username" dir="ltr"
            style={{ ...inputStyle, marginBottom: 16, textAlign: 'left' }}
            onFocus={e => e.target.style.borderColor = '#DE9526'}
            onBlur={e => e.target.style.borderColor = '#2C3B47'}
          />

          <label style={{ display: 'block', marginBottom: 6, color: '#A8B2BA', fontSize: '0.75rem', fontWeight: 600 }}>
            {isAr ? 'كلمة المرور' : 'Password'}
          </label>
          <div style={{ position: 'relative', marginBottom: 18 }}>
            <input
              type={showPass ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password" dir="ltr"
              style={{ ...inputStyle, fontFamily: MONO, letterSpacing: showPass ? 0 : '0.15em', textAlign: 'left', paddingRight: 40 }}
              onFocus={e => e.target.style.borderColor = '#DE9526'}
              onBlur={e => e.target.style.borderColor = '#2C3B47'}
            />
            <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
              style={{
                position: 'absolute', top: 0, bottom: 0, right: 0,
                width: 40, background: 'none', border: 'none', cursor: 'pointer', color: '#4E5E6A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {showPass
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: '9px 12px', fontSize: '0.75rem',
              background: 'rgba(178,59,39,0.14)', color: '#D9705C',
              border: '1px solid rgba(178,59,39,0.4)', borderRadius: 3,
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '12px 0', borderRadius: 3, border: 'none',
            background: loading ? '#2C3B47' : '#DE9526',
            color: loading ? '#77848E' : '#101B24',
            fontWeight: 700, fontSize: '0.875rem', cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit', transition: 'background 0.15s',
          }}>
            {loading ? (isAr ? 'جارٍ الدخول…' : 'Signing in…') : (isAr ? 'دخول' : 'Sign In')}
          </button>
        </form>

        {/* ── Footer ── */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={toggleLang} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#4E5E6A', fontSize: '0.75rem', fontFamily: 'inherit', padding: 0,
          }}>
            {isAr ? 'English' : 'عربي'}
          </button>
          <p style={{ margin: 0, color: '#3E4E5A', fontSize: '0.68rem', fontFamily: MONO }}>
            NWB · 2026
          </p>
        </div>
      </div>
    </div>
  )
}
