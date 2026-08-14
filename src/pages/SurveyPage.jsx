import { useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'

const BASE = 'https://nwbus.sa/survey.html?city='

export const SURVEY_STATIONS = [
  { city: 'Jeddah',  ar: 'جدة',             en: 'Jeddah',      color: '#2563EB' },
  { city: 'Makkah',  ar: 'مكة المكرمة',      en: 'Makkah',      color: '#7C3AED' },
  { city: 'Madinah', ar: 'المدينة المنورة',   en: 'Al Madinah',  color: '#059669' },
  { city: 'Riyadh',  ar: 'الرياض',           en: 'Riyadh',      color: '#DC2626' },
  { city: 'Tabuk',   ar: 'تبوك',             en: 'Tabuk',       color: '#D97706' },
  { city: 'Hail',    ar: 'حائل',             en: 'Hail',        color: '#0891B2' },
  { city: 'Taif',    ar: 'الطائف',           en: 'Taif',        color: '#BE185D' },
  { city: 'jazan',   ar: 'جازان',            en: 'Jazan',       color: '#16A34A' },
  { city: 'Yanbu',   ar: 'ينبع',             en: 'Yanbu',       color: '#9333EA' },
  { city: 'T1',      ar: 'مطار جدة — صالة 1', en: 'Jeddah T1',  color: '#475569' },
]

export function detectSurveyCity(station) {
  if (!station) return null
  if (station.survey_city) return station.survey_city
  const name = `${station.name_ar || ''} ${station.name_en || ''}`.toLowerCase()
  const map = {
    Jeddah:  ['جدة','jeddah'], Makkah: ['مكة','makkah','mecca'],
    Madinah: ['مدينة','madinah'], Riyadh: ['رياض','riyadh'],
    Tabuk:   ['تبوك','tabuk'], Hail: ['حائل','hail'],
    Taif:    ['طائف','taif'], jazan: ['جازان','jazan','jizan'],
    Yanbu:   ['ينبع','yanbu'], T1: ['t1','صالة 1'],
  }
  for (const [city, keys] of Object.entries(map))
    if (keys.some(k => name.includes(k.toLowerCase()))) return city
  return null
}

function StarIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  )
}

function CloseIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function ArrowIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  )
}

// ── Overlay التقييم ──────────────────────────────────────────
export function SurveyOverlay({ city, onClose, isAr = true }) {
  const station = SURVEY_STATIONS.find(s => s.city === city)
  const url = `${BASE}${city}`

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#000',
      display: 'flex', flexDirection: 'column',
      animation: 'fadeIn 0.15s ease',
    }}>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* شريط علوي */}
      <div style={{
        height: 48, flexShrink: 0,
        background: 'linear-gradient(90deg, #0a0a0a 0%, #111 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 20px',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: `${station?.color || '#5B5BD6'}22`,
            border: `1px solid ${station?.color || '#5B5BD6'}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: station?.color || '#5B5BD6',
          }}>
            <StarIcon size={13} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>
              {isAr ? 'تقييم تجربة الراكب' : 'Passenger Experience Survey'}
            </p>
            <p style={{ margin: 0, fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>
              {isAr ? station?.ar : station?.en}
            </p>
          </div>
        </div>

        <button onClick={onClose} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 7, padding: '6px 14px',
          color: 'rgba(255,255,255,0.55)',
          fontSize: '0.72rem', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          transition: 'all 0.12s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}>
          <CloseIcon size={13} />
          {isAr ? 'إغلاق' : 'Close'}
        </button>
      </div>

      <iframe
        src={url}
        title="تقييم تجربة الراكب"
        style={{ flex: 1, border: 'none', width: '100%' }}
      />
    </div>
  )
}

// ── بطاقة محطة للأدمن ────────────────────────────────────────
function CityCard({ station, onOpen }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={() => onOpen(station.city)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? 'var(--card-hover)' : 'var(--card)',
        border: `1px solid ${hover ? station.color + '60' : 'var(--border)'}`,
        borderRadius: 10, padding: '16px 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
        transition: 'all 0.15s',
        boxShadow: hover ? `0 4px 20px ${station.color}18` : 'var(--shadow-xs)',
        width: '100%',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: hover ? `${station.color}18` : 'var(--surface)',
        border: `1px solid ${hover ? station.color + '40' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: hover ? station.color : 'var(--text-3)',
        transition: 'all 0.15s',
      }}>
        <StarIcon size={17} />
      </div>
      <div style={{ flex: 1, textAlign: 'right' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-1)' }}>{station.ar}</p>
        <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-3)' }}>{station.en}</p>
      </div>
      <div style={{
        color: hover ? station.color : 'var(--text-3)',
        transform: 'rotate(180deg)', transition: 'all 0.15s',
      }}>
        <ArrowIcon size={14} />
      </div>
    </button>
  )
}

const SURVEY_MOBILE_CSS = `
@media (max-width: 600px) {
  .survey-hero { padding: 20px 16px 18px !important; }
  .survey-main { padding: 16px 16px !important; }
  .survey-launch-card { padding: 28px 18px !important; }
  .survey-city-grid { grid-template-columns: 1fr !important; }
  .survey-overlay-bar { padding: 0 14px !important; }
  .survey-launch-btn { padding: 13px 28px !important; font-size: 0.95rem !important; }
}
`

// ── الصفحة الرئيسية ───────────────────────────────────────────
export default function SurveyPage() {
  const authCtx     = (() => { try { return useAuth() } catch { return {} } })()
  const profile     = authCtx?.profile
  const isAdmin     = authCtx?.isAdmin ?? false
  const { i18n }   = useTranslation()
  const isAr       = i18n.language === 'ar'
  const params      = useParams()
  const navigate    = useNavigate()

  // دعم /survey/:city مباشرة (رابط عام للراكب)
  const paramCity   = params?.city
  const [activeCity, setActiveCity] = useState(paramCity || null)

  const detectedCity = paramCity || detectSurveyCity(profile?.station)
  const cityInfo     = SURVEY_STATIONS.find(s => s.city === detectedCity)

  const handleOpen  = useCallback(city => setActiveCity(city), [])
  const handleClose = useCallback(() => setActiveCity(null), [])

  return (
    <>
      <style>{SURVEY_MOBILE_CSS}</style>
      {activeCity && <SurveyOverlay city={activeCity} onClose={handleClose} isAr={isAr} />}

      <div style={{ minHeight: 'calc(100vh - 108px)', background: 'var(--surface)' }} dir={isAr ? 'rtl' : 'ltr'}>

        {/* ── Hero ── */}
        <div className="survey-hero" style={{
          background: 'var(--card)',
          borderBottom: '1px solid var(--border)',
          padding: '28px 28px 24px',
        }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 11,
                background: `${cityInfo?.color || '#5B5BD6'}15`,
                border: `1px solid ${cityInfo?.color || '#5B5BD6'}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: cityInfo?.color || '#5B5BD6', flexShrink: 0,
              }}>
                <StarIcon size={20} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-1)' }}>
                  {isAr ? 'تقييم تجربة الراكب' : 'Passenger Experience Survey'}
                </h1>
                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-3)' }}>
                  {isAr ? 'استبيان رضا الركاب' : 'Passenger Satisfaction Survey'}
                </p>
              </div>
            </div>
            {profile && (
              <button
                onClick={() => navigate('/')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '7px 14px',
                  color: 'var(--text-2)', fontSize: '0.78rem', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
                {isAr ? 'رجوع' : 'Back'}
              </button>
            )}
          </div>
          </div>
        </div>

        <div className="survey-main" style={{ maxWidth: 860, margin: '0 auto', padding: '28px 28px' }}>

          {/* ── موظف المحطة: زر إطلاق مباشر ── */}
          {!isAdmin && detectedCity && (
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 14, overflow: 'hidden',
              boxShadow: 'var(--shadow-md)',
              marginBottom: 24,
            }}>
              {/* شريط لوني */}
              <div style={{ height: 4, background: `linear-gradient(90deg, ${cityInfo?.color || '#5B5BD6'}, ${cityInfo?.color || '#5B5BD6'}88)` }} />

              <div className="survey-launch-card" style={{ padding: '36px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
                {/* أيقونة */}
                <div style={{
                  width: 72, height: 72, borderRadius: 18,
                  background: `${cityInfo?.color || '#5B5BD6'}12`,
                  border: `2px solid ${cityInfo?.color || '#5B5BD6'}25`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: cityInfo?.color || '#5B5BD6',
                  boxShadow: `0 8px 32px ${cityInfo?.color || '#5B5BD6'}15`,
                }}>
                  <StarIcon size={32} />
                </div>

                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-1)' }}>
                    {profile?.station?.name_ar || profile?.station?.name_en}
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 380 }}>
                    {isAr ? 'اعرض الشاشة للراكب واطلب منه تقييم تجربته مع خدمة النقل' : 'Show this screen to the passenger and ask them to rate their transport experience'}
                  </p>
                </div>

                <LaunchButton color={cityInfo?.color || '#5B5BD6'} onClick={() => handleOpen(detectedCity)} isAr={isAr} />

                <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-3)' }}>
                  {isAr ? 'يفتح الاستبيان بملء الشاشة — اضغط "إغلاق" للعودة' : 'Opens the survey in full screen — press "Close" to return'}
                </p>
              </div>
            </div>
          )}

          {/* ── رسالة لمن لا توجد لديه محطة مربوطة ── */}
          {!isAdmin && !detectedCity && (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '24px 20px',
              display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-2)' }}>
                {isAr ? 'لم يتم تحديد مدينة الاستبيان لمحطتك — اختر من القائمة أدناه أو تواصل مع المشرف' : 'No survey city assigned to your station — choose from the list below or contact your supervisor'}
              </p>
            </div>
          )}

          {/* ── شبكة المدن (للأدمن أو بدون محطة) ── */}
          {(isAdmin || !detectedCity) && (
            <div>
              <p style={{ margin: '0 0 14px', fontSize: '0.63rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>
                {isAdmin ? (isAr ? 'اختر المدينة' : 'Select City') : (isAr ? 'المدن المتاحة' : 'Available Cities')}
              </p>
              <div className="survey-city-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 10,
              }}>
                {SURVEY_STATIONS.map(s => (
                  <CityCard key={s.city} station={s} onOpen={handleOpen} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── زر الإطلاق بتأثير نبضة ──────────────────────────────────
function LaunchButton({ color, onClick, isAr = true }) {
  const [hover, setHover] = useState(false)
  const [press, setPress] = useState(false)
  return (
    <>
      <style>{`
        @keyframes pulse {
          0%,100% { box-shadow: 0 0 0 0 ${color}40; }
          50%      { box-shadow: 0 0 0 12px ${color}00; }
        }
      `}</style>
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setPress(false) }}
        onMouseDown={() => setPress(true)}
        onMouseUp={() => setPress(false)}
        className="survey-launch-btn"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: color,
          border: 'none', borderRadius: 12,
          padding: '14px 40px',
          color: '#fff', fontSize: '1rem', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          animation: 'pulse 2.5s infinite',
          transform: press ? 'scale(0.97)' : hover ? 'scale(1.02)' : 'scale(1)',
          transition: 'transform 0.12s, opacity 0.12s',
          opacity: hover ? 0.95 : 1,
        }}
      >
        <StarIcon size={18} />
        {isAr ? 'ابدأ التقييم الآن' : 'Start Survey Now'}
      </button>
    </>
  )
}
