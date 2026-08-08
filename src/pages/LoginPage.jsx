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
    width: '100%', padding: '10px 13px',
    background: '#fff', color: '#111',
    border: '1.5px solid #E0E0E0', borderRadius: 6,
    fontSize: '0.875rem', fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.14s, box-shadow 0.14s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{
      minHeight: '100vh', background: '#F4F5F8',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>

      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* ── Wordmark ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, background: '#111', borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)', flexShrink: 0,
          }}>
            <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '0.6rem', color: '#fff', letterSpacing: '0.04em' }}>NWB</span>
          </div>
          <div style={{ lineHeight: 1.3 }}>
            <p style={{ margin: 0, color: '#111', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.14em', fontFamily: MONO }}>
              NORTH WEST BUS
            </p>
            <p style={{ margin: 0, color: '#888', fontSize: '0.68rem', marginTop: 2 }}>
              {isAr ? 'نظام تشغيل المحطات' : 'Stations Operations System'}
            </p>
          </div>
        </div>

        {/* ── Form panel ── */}
        <form onSubmit={handleSubmit} style={{
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05)',
          padding: '28px 24px',
        }}>
          <p style={{ margin: '0 0 20px', color: '#888', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', fontFamily: MONO }}>
            {isAr ? '— تسجيل الدخول' : '— SIGN IN'}
          </p>

          <label style={{ display: 'block', marginBottom: 5, color: '#444', fontSize: '0.75rem', fontWeight: 600 }}>
            {isAr ? 'اسم المستخدم' : 'Username'}
          </label>
          <input
            type="text" value={username} onChange={e => setUsername(e.target.value)}
            required autoFocus autoComplete="username" dir="ltr"
            style={{ ...inputStyle, marginBottom: 14, textAlign: 'left' }}
            onFocus={e => { e.target.style.borderColor = '#5B5BD6'; e.target.style.boxShadow = '0 0 0 3px rgba(91,91,214,0.10)' }}
            onBlur={e => { e.target.style.borderColor = '#E0E0E0'; e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)' }}
          />

          <label style={{ display: 'block', marginBottom: 5, color: '#444', fontSize: '0.75rem', fontWeight: 600 }}>
            {isAr ? 'كلمة المرور' : 'Password'}
          </label>
          <div style={{ position: 'relative', marginBottom: 18 }}>
            <input
              type={showPass ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password" dir="ltr"
              style={{ ...inputStyle, fontFamily: MONO, letterSpacing: showPass ? 0 : '0.12em', textAlign: 'left', paddingRight: 40 }}
              onFocus={e => { e.target.style.borderColor = '#5B5BD6'; e.target.style.boxShadow = '0 0 0 3px rgba(91,91,214,0.10)' }}
              onBlur={e => { e.target.style.borderColor = '#E0E0E0'; e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)' }}
            />
            <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
              style={{
                position: 'absolute', top: 0, bottom: 0, right: 0,
                width: 40, background: 'none', border: 'none', cursor: 'pointer', color: '#BBBBBB',
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
              background: 'rgba(220,38,38,0.08)', color: '#DC2626',
              borderRadius: 6, fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '11px 0', borderRadius: 7, border: 'none',
            background: loading ? '#F0F0F0' : '#111',
            color: loading ? '#888' : '#fff',
            fontWeight: 700, fontSize: '0.875rem',
            cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'all 0.14s',
          }}>
            {loading ? (isAr ? 'جارٍ الدخول…' : 'Signing in…') : (isAr ? 'دخول' : 'Sign In')}
          </button>
        </form>

        {/* ── Footer ── */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={toggleLang} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#888', fontSize: '0.75rem', fontFamily: 'inherit', padding: 0,
          }}>
            {isAr ? 'English' : 'عربي'}
          </button>
          <p style={{ margin: 0, color: '#BBBBBB', fontSize: '0.68rem', fontFamily: MONO }}>
            NWB · 2026
          </p>
        </div>
      </div>
    </div>
  )
}
