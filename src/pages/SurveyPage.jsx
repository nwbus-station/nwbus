import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const BASE = 'https://nwbus.sa/survey.html?city='

// مدن ثابتة احتياطية — تُستخدم فقط لو تعذّر الاتصال بالقاعدة أو قبل اكتمال التحميل.
// المصدر الفعلي والقابل للتعديل هو جدول survey_cities (يديره الأدمن من هذي الصفحة).
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

// تحويل صف القاعدة لنفس شكل SURVEY_STATIONS المستخدم بالواجهة
const rowToCity = r => ({ city: r.city_key, ar: r.name_ar, en: r.name_en, color: r.color || '#5B5BD6', url: r.url || null, is_active: r.is_active !== false })

// جلب مدن الاستبيان من القاعدة — تُستخدم من هذي الصفحة ومن SurveyOverlay (بدون تسجيل دخول أيضاً)
export async function fetchSurveyCities() {
  const { data, error } = await supabase.from('survey_cities').select('*').order('sort_order').order('name_ar')
  if (error || !data?.length) return SURVEY_STATIONS.map(s => ({ ...s, is_active: true }))
  return data.map(rowToCity)
}

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
export function SurveyOverlay({ city, cityData, onClose, isAr = true }) {
  // لو المستدعي ما مرّر بيانات المدينة (Dashboard القديم)، نجيبها بأنفسنا من القاعدة —
  // عشان لو الأدمن غيّر الاسم/اللون/الرابط ينعكس هنا بدون ما نلمس كل مكان يستخدم Overlay
  const [fetched, setFetched] = useState(null)
  useEffect(() => {
    if (cityData) return
    let dead = false
    fetchSurveyCities().then(list => { if (!dead) setFetched(list.find(s => s.city === city) ?? null) })
    return () => { dead = true }
  }, [city, cityData])
  const station = cityData || fetched || SURVEY_STATIONS.find(s => s.city === city)
  const url = station?.url || `${BASE}${city}`

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
function CityCard({ station, onOpen, manage, busy, isAr = true, onEdit, onToggleActive, onDelete }) {
  const [hover, setHover] = useState(false)
  const inactive = station.is_active === false
  return (
    <div style={{ position: 'relative', opacity: inactive ? 0.55 : 1 }}>
      <button
        onClick={() => !manage && onOpen(station.city)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background: hover && !manage ? 'var(--card-hover)' : 'var(--card)',
          border: `1px solid ${hover && !manage ? station.color + '60' : 'var(--border)'}`,
          borderRadius: 10, padding: manage ? '16px 18px 40px' : '16px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
          cursor: manage ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'right',
          transition: 'all 0.15s',
          boxShadow: hover && !manage ? `0 4px 20px ${station.color}18` : 'var(--shadow-xs)',
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
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-1)' }}>{station.ar}{inactive && (isAr ? ' (معطّلة)' : ' (Inactive)')}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-3)' }}>{station.en}</p>
        </div>
        {!manage && (
          <div style={{ color: hover ? station.color : 'var(--text-3)', transform: 'rotate(180deg)', transition: 'all 0.15s' }}>
            <ArrowIcon size={14} />
          </div>
        )}
      </button>
      {manage && (
        <div style={{ position: 'absolute', insetInlineStart: 10, insetInlineEnd: 10, bottom: 8, display: 'flex', gap: 6 }}>
          <button disabled={busy} onClick={onEdit} style={{ flex: 1, fontSize: '0.68rem', fontWeight: 700, padding: '5px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>{isAr ? 'تعديل' : 'Edit'}</button>
          <button disabled={busy} onClick={onToggleActive} style={{ flex: 1, fontSize: '0.68rem', fontWeight: 700, padding: '5px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>{inactive ? (isAr ? 'تفعيل' : 'Enable') : (isAr ? 'تعطيل' : 'Disable')}</button>
          <button disabled={busy} onClick={onDelete} style={{ flex: 1, fontSize: '0.68rem', fontWeight: 700, padding: '5px 0', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontFamily: 'inherit' }}>{isAr ? 'حذف' : 'Delete'}</button>
        </div>
      )}
    </div>
  )
}

// ── نموذج إضافة/تعديل مدينة ──────────────────────────────────
function CityFormModal({ city, isNew, isAr, busy, error, onCancel, onSave }) {
  const [form, setForm] = useState({
    city: city.city || '', ar: city.ar || '', en: city.en || '',
    color: city.color || '#5B5BD6', url: city.url || '', is_active: city.is_active !== false,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inputCls = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.82rem', outline: 'none', background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit', color: '#0f172a' }
  const lbl = { display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} dir={isAr ? 'rtl' : 'ltr'}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,.3)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{isNew ? (isAr ? 'إضافة مدينة' : 'Add city') : (isAr ? 'تعديل المدينة' : 'Edit city')}</h3>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={lbl}>{isAr ? 'الرمز (يُستخدم برابط التقييم، إنجليزي بدون مسافات)' : 'Key (used in the survey link, no spaces)'}</label>
            <input style={{ ...inputCls, direction: 'ltr' }} disabled={!isNew} value={form.city} onChange={e => set('city', e.target.value.replace(/\s+/g, ''))} placeholder="Jeddah" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>{isAr ? 'الاسم بالعربي' : 'Arabic name'}</label><input style={inputCls} value={form.ar} onChange={e => set('ar', e.target.value)} /></div>
            <div><label style={lbl}>{isAr ? 'الاسم بالإنجليزي' : 'English name'}</label><input style={{ ...inputCls, direction: 'ltr' }} value={form.en} onChange={e => set('en', e.target.value)} /></div>
          </div>
          <div>
            <label style={lbl}>{isAr ? 'اللون' : 'Color'}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={form.color} onChange={e => set('color', e.target.value)} style={{ width: 38, height: 34, border: '1.5px solid var(--border)', borderRadius: 8, padding: 2, cursor: 'pointer' }} />
              <input style={{ ...inputCls, direction: 'ltr' }} value={form.color} onChange={e => set('color', e.target.value)} />
            </div>
          </div>
          <div>
            <label style={lbl}>{isAr ? 'رابط الاستبيان (اختياري — فارغ = الرابط الافتراضي بالرمز أعلاه)' : 'Survey link (optional — blank = default link with the key above)'}</label>
            <input style={{ ...inputCls, direction: 'ltr' }} value={form.url} onChange={e => set('url', e.target.value)} placeholder={`${BASE}${form.city || 'CityKey'}`} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />{isAr ? 'مدينة نشطة' : 'Active'}
          </label>
          {error && <p style={{ margin: 0, fontSize: '0.76rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 10px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button disabled={busy} onClick={() => onSave(form)} style={{ flex: 1, background: '#1C2B36', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 0', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>{busy ? '…' : (isAr ? 'حفظ' : 'Save')}</button>
            <button onClick={onCancel} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid var(--border)', background: '#fff', color: '#334155', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{isAr ? 'إلغاء' : 'Cancel'}</button>
          </div>
        </div>
      </div>
    </div>
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
  // نستخدم isGeneralAdmin بدل isAdmin هنا خصوصاً — مشرف المنطقة (isAdmin=true بسبب
  // isAreaSupervisor) له محطة أساسية واحدة يطلق منها الاستبيان مثل أي موظف، مو شبكة
  // كل المدن. الشبكة الكاملة فقط للأدمن العام/المدير التنفيذي اللي ما له محطة محددة
  const isAdmin     = authCtx?.isGeneralAdmin ?? false
  const { i18n }   = useTranslation()
  const isAr       = i18n.language === 'ar'
  const params      = useParams()
  const navigate    = useNavigate()

  // دعم /survey/:city مباشرة (رابط عام للراكب)
  const paramCity   = params?.city
  const [activeCity, setActiveCity] = useState(paramCity || null)

  // مدن الاستبيان — من القاعدة (يديرها الأدمن)، مع نسخة ثابتة احتياطية لحين اكتمال التحميل
  const [cities, setCities] = useState(SURVEY_STATIONS.map(s => ({ ...s, is_active: true })))
  const [citiesLoaded, setCitiesLoaded] = useState(false)
  const [manage, setManage] = useState(false)
  const [editingCity, setEditingCity] = useState(null)   // { } لإضافة، أو صف موجود للتعديل
  const [busyKey, setBusyKey] = useState(null)
  const [manageErr, setManageErr] = useState('')

  const reloadCities = useCallback(() => {
    fetchSurveyCities().then(list => { setCities(list); setCitiesLoaded(true) })
  }, [])
  useEffect(() => { reloadCities() }, [reloadCities])

  const visibleCities = isAdmin && manage ? cities : cities.filter(c => c.is_active !== false)
  const detectedCity = paramCity || detectSurveyCity(profile?.station)
  const cityInfo     = cities.find(s => s.city === detectedCity)

  const handleOpen  = useCallback(city => setActiveCity(city), [])
  const handleClose = useCallback(() => setActiveCity(null), [])
  const activeCityData = cities.find(s => s.city === activeCity) ?? null

  async function saveCity(payload, isNew) {
    setManageErr('')
    const row = {
      city_key: payload.city.trim(),
      name_ar: payload.ar.trim(),
      name_en: payload.en.trim(),
      color: payload.color || '#5B5BD6',
      url: payload.url?.trim() || null,
      is_active: payload.is_active !== false,
    }
    if (!row.city_key || !row.name_ar || !row.name_en) { setManageErr(isAr ? 'الرمز والاسمان مطلوبة' : 'Key and both names are required'); return false }
    setBusyKey(row.city_key)
    const { error } = isNew
      ? await supabase.from('survey_cities').insert(row)
      : await supabase.from('survey_cities').update(row).eq('city_key', row.city_key)
    setBusyKey(null)
    if (error) { setManageErr(error.message); return false }
    reloadCities()
    return true
  }
  async function deleteCity(key) {
    if (!window.confirm(isAr ? `حذف مدينة "${key}"؟ أي رابط تقييم موزّع لهذا الرمز يتوقف عن العمل.` : `Delete "${key}"? Any distributed link stops working.`)) return
    setBusyKey(key)
    const { error } = await supabase.from('survey_cities').delete().eq('city_key', key)
    setBusyKey(null)
    if (error) { setManageErr(error.message); return }
    reloadCities()
  }
  async function toggleCityActive(row) {
    setBusyKey(row.city)
    const { error } = await supabase.from('survey_cities').update({ is_active: row.is_active === false }).eq('city_key', row.city)
    setBusyKey(null)
    if (error) { setManageErr(error.message); return }
    reloadCities()
  }

  return (
    <>
      <style>{SURVEY_MOBILE_CSS}</style>
      {activeCity && <SurveyOverlay city={activeCity} cityData={activeCityData} onClose={handleClose} isAr={isAr} />}
      {editingCity && (
        <CityFormModal city={editingCity} isNew={!editingCity.city} isAr={isAr} busy={busyKey != null}
          onCancel={() => { setEditingCity(null); setManageErr('') }}
          onSave={async payload => { if (await saveCity(payload, !editingCity.city)) setEditingCity(null) }}
          error={manageErr} />
      )}

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isAdmin && (
                <button
                  onClick={() => setManage(m => !m)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: manage ? 'var(--text-1)' : 'var(--surface)',
                    border: `1px solid ${manage ? 'var(--text-1)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '7px 14px',
                    color: manage ? '#fff' : 'var(--text-2)', fontSize: '0.78rem', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
                  </svg>
                  {manage ? (isAr ? 'إنهاء التعديل' : 'Done') : (isAr ? 'تعديل روابط المدن' : 'Manage city links')}
                </button>
              )}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: '0.63rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {isAdmin ? (isAr ? 'اختر المدينة' : 'Select City') : (isAr ? 'المدن المتاحة' : 'Available Cities')}
                </p>
                {isAdmin && manage && (
                  <button onClick={() => setEditingCity({})} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'var(--text-1)', color: '#fff',
                    border: 'none', borderRadius: 8, padding: '6px 13px', fontSize: '0.75rem', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    {isAr ? 'إضافة مدينة' : 'Add city'}
                  </button>
                )}
              </div>
              {isAdmin && manage && manageErr && (
                <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>{manageErr}</p>
              )}
              {isAdmin && manage && !citiesLoaded && (
                <p style={{ margin: '0 0 12px', fontSize: '0.75rem', color: 'var(--text-3)' }}>{isAr ? 'جارٍ التحميل…' : 'Loading…'}</p>
              )}
              <div className="survey-city-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 10,
              }}>
                {visibleCities.map(s => (
                  <CityCard key={s.city} station={s} onOpen={handleOpen} isAr={isAr}
                    manage={isAdmin && manage} busy={busyKey === s.city}
                    onEdit={() => setEditingCity({ city: s.city, ar: s.ar, en: s.en, color: s.color, url: s.url, is_active: s.is_active })}
                    onToggleActive={() => toggleCityActive(s)}
                    onDelete={() => deleteCity(s.city)} />
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
