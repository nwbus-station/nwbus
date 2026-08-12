import { useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

const BASE = 'https://nwbus.sa/survey.html?city='

const STATIONS = [
  { city: 'Jeddah',  ar: 'جدة',        en: 'Jeddah'    },
  { city: 'Tabuk',   ar: 'تبوك',        en: 'Tabuk'     },
  { city: 'Makkah',  ar: 'مكة المكرمة', en: 'Makkah'    },
  { city: 'T1',      ar: 'مطار T1',     en: 'Airport T1' },
  { city: 'Hail',    ar: 'حائل',        en: 'Hail'      },
  { city: 'Riyadh',  ar: 'الرياض',      en: 'Riyadh'    },
  { city: 'jazan',   ar: 'جازان',       en: 'Jazan'     },
  { city: 'Taif',    ar: 'الطائف',      en: 'Taif'      },
  { city: 'Madinah', ar: 'المدينة المنورة', en: 'Al Madinah' },
  { city: 'Yanbu',   ar: 'ينبع',        en: 'Yanbu'     },
]

const KEYWORDS = {
  Jeddah:  ['جدة', 'jeddah'],
  Tabuk:   ['تبوك', 'tabuk'],
  Makkah:  ['مكة', 'makkah', 'mecca'],
  T1:      ['t1', 'مطار'],
  Hail:    ['حائل', 'hail'],
  Riyadh:  ['رياض', 'riyadh'],
  jazan:   ['جازان', 'jazan', 'jizan'],
  Taif:    ['طائف', 'taif'],
  Madinah: ['مدينة', 'madinah', 'madina'],
  Yanbu:   ['ينبع', 'yanbu'],
}

function detectStation(station) {
  if (!station) return null
  // أولاً: العمود المباشر survey_city (الأدق)
  if (station.survey_city) return station.survey_city
  // احتياط: كشف تلقائي من اسم المحطة
  const name = `${station.name_ar || ''} ${station.name_en || ''}`.toLowerCase()
  for (const [city, keys] of Object.entries(KEYWORDS)) {
    if (keys.some(k => name.includes(k.toLowerCase()))) return city
  }
  return null
}

function StarIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function ChevronRight({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function CloseIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ── Iframe overlay مُغلِّف ────────────────────────────────────
function SurveyOverlay({ city, onClose }) {
  const station = STATIONS.find(s => s.city === city)
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#000',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* شريط علوي رفيع */}
      <div style={{
        height: 44, flexShrink: 0,
        background: 'rgba(10,10,10,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5B5BD6' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.02em' }}>
            تقييم هيئة النقل — {station?.ar}
          </span>
        </div>
        <button onClick={onClose} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 6, padding: '4px 12px', color: 'rgba(255,255,255,0.6)',
          fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          transition: 'all 0.12s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        >
          <CloseIcon size={13} />
          إغلاق
        </button>
      </div>

      {/* الـ iframe */}
      <iframe
        src={`${BASE}${city}`}
        title="تقييم هيئة النقل"
        style={{ flex: 1, border: 'none', width: '100%' }}
        allow="fullscreen"
      />
    </div>
  )
}

// ── بطاقة محطة (للأدمن) ──────────────────────────────────────
function StationCard({ station, onOpen }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={() => onOpen(station.city)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? 'var(--card-hover)' : 'var(--card)',
        border: `1px solid ${hover ? '#5B5BD6' : 'var(--border)'}`,
        borderRadius: 8, padding: '18px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
        transition: 'all 0.15s', boxShadow: hover ? '0 4px 16px rgba(91,91,214,0.12)' : 'var(--shadow-xs)',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: hover ? 'rgba(91,91,214,0.15)' : 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: hover ? '#5B5BD6' : 'var(--text-3)', flexShrink: 0,
          transition: 'all 0.15s',
        }}>
          <StarIcon size={16} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-1)' }}>{station.ar}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-3)' }}>{station.en}</p>
        </div>
      </div>
      <div style={{ color: hover ? '#5B5BD6' : 'var(--text-3)', transform: 'rotate(180deg)', transition: 'all 0.15s' }}>
        <ChevronRight size={15} />
      </div>
    </button>
  )
}

// ── واجهة إطلاق لموظف المحطة ─────────────────────────────────
function StationLaunch({ city, stationName, onOpen }) {
  const [hover, setHover] = useState(false)
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 'calc(100vh - 108px)', padding: '24px 16px', textAlign: 'center',
    }}>
      {/* أيقونة */}
      <div style={{
        width: 80, height: 80, borderRadius: 20,
        background: 'rgba(91,91,214,0.10)',
        border: '1px solid rgba(91,91,214,0.20)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#5B5BD6', marginBottom: 28,
        boxShadow: '0 8px 32px rgba(91,91,214,0.12)',
      }}>
        <StarIcon size={34} />
      </div>

      {/* العنوان */}
      <h1 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>
        تقييم تجربة الراكب
      </h1>
      <p style={{ margin: '0 0 4px', fontSize: '0.9rem', color: 'var(--text-2)' }}>
        هيئة النقل — {stationName}
      </p>
      <p style={{ margin: '0 0 40px', fontSize: '0.78rem', color: 'var(--text-3)', maxWidth: 340, lineHeight: 1.6 }}>
        اعرض الشاشة للراكب واطلب منه تقييم تجربته مع الخدمة
      </p>

      {/* زر التشغيل */}
      <button
        onClick={() => onOpen(city)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: hover ? '#4A4ABF' : '#5B5BD6',
          border: 'none', borderRadius: 10, padding: '14px 36px',
          color: '#fff', fontSize: '1rem', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: hover
            ? '0 8px 24px rgba(91,91,214,0.35)'
            : '0 4px 14px rgba(91,91,214,0.25)',
          transition: 'all 0.15s',
          transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        }}
      >
        <StarIcon size={18} />
        ابدأ التقييم
      </button>

      {/* تلميح */}
      <p style={{ margin: '24px 0 0', fontSize: '0.72rem', color: 'var(--text-3)' }}>
        سيفتح الاستبيان في ملء الشاشة — اضغط "إغلاق" للعودة
      </p>
    </div>
  )
}

// ── الصفحة الرئيسية ───────────────────────────────────────────
export default function SurveyPage() {
  const { profile } = useAuth()
  const [activeCity, setActiveCity] = useState(null)

  const isAdmin = profile?.role === 'general_admin'
  const detectedCity = detectStation(profile?.station)

  const handleOpen  = useCallback(city => setActiveCity(city), [])
  const handleClose = useCallback(() => setActiveCity(null), [])

  return (
    <>
      {/* Overlay عند فتح استبيان */}
      {activeCity && <SurveyOverlay city={activeCity} onClose={handleClose} />}

      <div style={{ padding: '24px 20px', maxWidth: 800, margin: '0 auto' }}>

        {/* رأس الصفحة */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ color: '#5B5BD6' }}><StarIcon size={18} /></div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-1)' }}>
              تقييم تجربة الراكب
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-3)' }}>
            هيئة النقل العام — استبيان رضا الركاب
          </p>
        </div>

        {/* محتوى الصفحة */}
        {isAdmin ? (
          // للأدمن: شبكة جميع المحطات
          <div>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: 'var(--text-2)', fontWeight: 500 }}>
              اختر المحطة لفتح استبيان التقييم
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 10,
            }}>
              {STATIONS.map(s => (
                <StationCard key={s.city} station={s} onOpen={handleOpen} />
              ))}
            </div>
          </div>
        ) : detectedCity ? (
          // لموظف المحطة: إطلاق مباشر
          <StationLaunch
            city={detectedCity}
            stationName={profile?.station?.name_ar || profile?.station?.name_en || ''}
            onOpen={handleOpen}
          />
        ) : (
          // محطة غير معرّفة في الخريطة
          <div>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: 'var(--text-2)', fontWeight: 500 }}>
              اختر المحطة لفتح استبيان التقييم
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 10,
            }}>
              {STATIONS.map(s => (
                <StationCard key={s.city} station={s} onOpen={handleOpen} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
