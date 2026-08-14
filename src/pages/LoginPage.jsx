import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

const MONO = "'IBM Plex Mono', monospace"

export default function LoginPage() {
  const { i18n } = useTranslation()
  const { signIn, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const isAr = i18n.language === 'ar'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // تطبيق الثيم المحفوظ قبل أول render لتجنب الوميض
  const saved = localStorage.getItem('nwbus_theme') ?? 'light'
  document.documentElement.setAttribute('data-theme', saved)

  if (authLoading) return null
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
    width: '100%', padding: '10px 13px',
    background: '#0C151D', color: '#F2EFE8',
    border: '1px solid #2C3B47', borderRadius: 4,
    fontSize: '0.875rem', fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.14s',
    boxSizing: 'border-box',
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{
      minHeight: '100vh', background: '#101B24',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>

      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* ── Wordmark ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ lineHeight: 1.3 }}>
            <p style={{ margin: 0, color: '#F2EFE8', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.14em', fontFamily: MONO }}>
              NORTH WEST BUS
            </p>
            <p style={{ margin: 0, color: '#77848E', fontSize: '0.68rem', marginTop: 2 }}>
              {isAr ? 'نظام تشغيل المحطات' : 'Stations Operations System'}
            </p>
          </div>
        </div>

        {/* ── Route decoration ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2C3B47', flexShrink: 0 }} />
          <div style={{ flex: 1, borderTop: '1px dashed #2C3B47' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2C3B47', flexShrink: 0 }} />
        </div>

        {/* ── Form panel ── */}
        <form onSubmit={handleSubmit} style={{
          background: '#16232E',
          border: '1px solid #2C3B47',
          borderRadius: 4,
          padding: '28px 24px',
        }}>
          <p style={{ margin: '0 0 20px', color: '#77848E', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', fontFamily: MONO }}>
            {isAr ? '— تسجيل الدخول' : '— SIGN IN'}
          </p>

          <label style={{ display: 'block', marginBottom: 5, color: '#A8B2BA', fontSize: '0.75rem', fontWeight: 600 }}>
            {isAr ? 'اسم المستخدم' : 'Username'}
          </label>
          <input
            type="text" value={username} onChange={e => setUsername(e.target.value)}
            required autoFocus autoComplete="username" dir="ltr"
            style={{ ...inputStyle, marginBottom: 14, textAlign: 'left' }}
            onFocus={e => { e.target.style.borderColor = '#5B5BD6' }}
            onBlur={e => { e.target.style.borderColor = '#2C3B47' }}
          />

          <label style={{ display: 'block', marginBottom: 5, color: '#A8B2BA', fontSize: '0.75rem', fontWeight: 600 }}>
            {isAr ? 'كلمة المرور' : 'Password'}
          </label>
          <div style={{ position: 'relative', marginBottom: 18 }}>
            <input
              type={showPass ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password" dir="ltr"
              style={{ ...inputStyle, fontFamily: MONO, letterSpacing: showPass ? 0 : '0.12em', textAlign: 'left', paddingRight: 40 }}
              onFocus={e => { e.target.style.borderColor = '#5B5BD6' }}
              onBlur={e => { e.target.style.borderColor = '#2C3B47' }}
            />
            <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
              style={{
                position: 'absolute', top: 0, bottom: 0, right: 0,
                width: 40, background: 'none', border: 'none', cursor: 'pointer', color: '#77848E',
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
              background: 'rgba(220,38,38,0.12)', color: '#F87171',
              borderRadius: 4, fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '11px 0', borderRadius: 4, border: 'none',
            background: loading ? '#2C3B47' : '#111',
            color: loading ? '#77848E' : '#fff',
            fontWeight: 700, fontSize: '0.875rem',
            cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.14s',
          }}>
            {loading ? (isAr ? 'جارٍ الدخول…' : 'Signing in…') : (isAr ? 'دخول' : 'Sign In')}
          </button>
        </form>

        {/* ── Footer ── */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={toggleLang} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#3E4E5A', fontSize: '0.75rem', fontFamily: MONO, padding: 0,
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
