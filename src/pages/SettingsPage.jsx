import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAppSettings } from '../context/AppSettingsContext'

const THEMES = [
  { id:'bw',     labelAr:'أسود وأبيض',    labelEn:'Black & White',   preview:['#0a0a0a','#ffffff','#f0f0f0'] },
  { id:'navy',   labelAr:'أزرق ملكي',     labelEn:'Royal Navy',      preview:['#0f2042','#1b3a6b','#f0f4ff'] },
  { id:'forest', labelAr:'أخضر الغابة',   labelEn:'Forest',          preview:['#1a3a2a','#2d6a4f','#f0faf4'] },
  { id:'slate',  labelAr:'رمادي داكن',    labelEn:'Slate',           preview:['#1e293b','#334155','#f1f5f9'] },
  { id:'coffee', labelAr:'بني كلاسيكي',   labelEn:'Classic Brown',   preview:['#2c1a0e','#5c3317','#fdf6f0'] },
]

const IDLE_OPTIONS = [
  { value:'3',  labelAr:'3 دقائق',  labelEn:'3 min' },
  { value:'5',  labelAr:'5 دقائق',  labelEn:'5 min' },
  { value:'10', labelAr:'10 دقائق', labelEn:'10 min' },
  { value:'30', labelAr:'30 دقيقة', labelEn:'30 min' },
  { value:'60', labelAr:'ساعة',      labelEn:'1 hour' },
]

export default function SettingsPage() {
  const { i18n } = useTranslation()
  const { profile } = useAuth()
  const { settings, saveSetting } = useAppSettings()
  const navigate = useNavigate()
  const isAr = i18n.language === 'ar'
  const isAdmin = profile?.role === 'general_admin'

  const [saved, setSaved] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const countRef = useRef(null)

  useEffect(() => () => clearInterval(countRef.current), [])

  if (!isAdmin) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'calc(100vh - 58px)', color:'var(--text-3)', fontSize:'0.9rem' }}>
        {isAr ? 'غير مصرح' : 'Access denied'}
      </div>
    )
  }

  async function save(key, value) {
    await saveSetting(key, value)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  function startPreview() {
    let n = 5
    setCountdown(n)
    countRef.current = setInterval(() => {
      n--
      if (n <= 0) { clearInterval(countRef.current); setCountdown(null); navigate('/board') }
      else setCountdown(n)
    }, 1000)
  }

  const Section = ({ titleAr, titleEn, children }) => (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid var(--border)', padding:'20px 24px', marginBottom:16 }}>
      <h3 style={{ margin:'0 0 16px', fontSize:'0.88rem', fontWeight:800, color:'var(--text-1)' }}>
        {isAr ? titleAr : titleEn}
      </h3>
      {children}
    </div>
  )

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'28px 20px' }}>
      <div style={{ marginBottom:24, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ margin:0, fontSize:'1.3rem', fontWeight:800, color:'var(--text-1)' }}>
            {isAr ? 'إعدادات النظام' : 'System Settings'}
          </h1>
          <p style={{ margin:'4px 0 0', fontSize:'0.82rem', color:'var(--text-3)' }}>
            {isAr ? 'تُطبَّق على جميع المستخدمين' : 'Applied to all users'}
          </p>
        </div>
        {saved && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:99, background:'#f0fdf4', border:'1px solid #bbf7d0', fontSize:'0.78rem', fontWeight:700, color:'#15803d' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            {isAr ? 'تم الحفظ' : 'Saved'}
          </div>
        )}
      </div>

      {/* ── Colors ── */}
      <Section titleAr="ألوان النظام" titleEn="System Colors">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px,1fr))', gap:10 }}>
          {THEMES.map(t => {
            const active = settings.theme === t.id
            return (
              <button key={t.id} onClick={() => save('theme', t.id)}
                style={{ border:`2px solid ${active ? t.preview[0] : 'var(--border)'}`, borderRadius:12, padding:'10px 8px', background: active ? `${t.preview[0]}12` : '#fff', cursor:'pointer', transition:'all 0.15s', textAlign:'center' }}>
                <div style={{ display:'flex', justifyContent:'center', gap:4, marginBottom:8 }}>
                  {t.preview.map((c,i) => <div key={i} style={{ width:15, height:15, borderRadius:'50%', background:c, border:'1px solid rgba(0,0,0,0.08)' }} />)}
                </div>
                <div style={{ fontSize:'0.7rem', fontWeight: active ? 700 : 500, color: active ? t.preview[0] : 'var(--text-2)' }}>
                  {isAr ? t.labelAr : t.labelEn}
                </div>
                {active && (
                  <div style={{ marginTop:5, display:'inline-flex', alignItems:'center', justifyContent:'center', width:16, height:16, borderRadius:'50%', background:t.preview[0] }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>
        <p style={{ margin:'10px 0 0', fontSize:'0.72rem', color:'var(--text-3)' }}>
          {isAr ? 'يُطبَّق فوراً على جميع المستخدمين المتصلين' : 'Applies instantly to all connected users'}
        </p>
      </Section>

      {/* ── Sleep ── */}
      <Section titleAr="شاشة السكون" titleEn="Sleep Screen">
        {/* Toggle */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, padding:'12px 14px', background:'var(--surface)', borderRadius:10 }}>
          <div>
            <div style={{ fontSize:'0.85rem', fontWeight:700, color:'var(--text-1)' }}>
              {isAr ? 'تفعيل شاشة السكون' : 'Enable Sleep Screen'}
            </div>
            <div style={{ fontSize:'0.72rem', color:'var(--text-3)', marginTop:2 }}>
              {isAr ? 'ينتقل تلقائياً لشاشة العرض الحيّة عند عدم النشاط' : 'Auto-switches to Live Board on inactivity'}
            </div>
          </div>
          <button onClick={() => save('idle_enabled', settings.idle_enabled === 'false' ? 'true' : 'false')}
            style={{ width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', background: settings.idle_enabled !== 'false' ? 'var(--brand-900)' : '#ddd', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
            <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left: settings.idle_enabled !== 'false' ? 23 : 3, transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
          </button>
        </div>

        {settings.idle_enabled !== 'false' && (
          <>
            <p style={{ margin:'0 0 10px', fontSize:'0.78rem', color:'var(--text-3)' }}>
              {isAr ? 'المدة قبل الانتقال لشاشة السكون' : 'Time before sleep screen'}
            </p>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
              {IDLE_OPTIONS.map(o => (
                <button key={o.value} onClick={() => save('idle_min', o.value)}
                  style={{ padding:'7px 14px', borderRadius:8, border:`1.5px solid ${settings.idle_min === o.value ? 'var(--brand-900)' : 'var(--border)'}`, background: settings.idle_min === o.value ? 'var(--brand-900)' : '#fff', color: settings.idle_min === o.value ? '#fff' : 'var(--text-2)', fontSize:'0.8rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                  {isAr ? o.labelAr : o.labelEn}
                </button>
              ))}
            </div>

            <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
              <p style={{ margin:'0 0 10px', fontSize:'0.78rem', color:'var(--text-3)' }}>
                {isAr ? 'معاينة شاشة السكون' : 'Preview sleep screen'}
              </p>
              {countdown === null ? (
                <button onClick={startPreview}
                  style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'9px 18px', borderRadius:9, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-1)', fontSize:'0.82rem', fontWeight:600, cursor:'pointer' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  {isAr ? 'تشغيل المعاينة' : 'Launch Preview'}
                </button>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'9px 16px', borderRadius:9, background:'var(--brand-900)', color:'#fff', fontSize:'0.82rem', fontWeight:600 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {isAr ? `خلال ${countdown}...` : `In ${countdown}...`}
                  </div>
                  <button onClick={() => { clearInterval(countRef.current); setCountdown(null) }}
                    style={{ padding:'9px 14px', borderRadius:9, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-2)', fontSize:'0.8rem', fontWeight:600, cursor:'pointer' }}>
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </Section>

      {/* ── System info ── */}
      <Section titleAr="معلومات النظام" titleEn="System Info">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[
            { ar:'الإصدار', en:'Version', val:'1.0.0' },
            { ar:'قاعدة البيانات', en:'Database', val:'Supabase' },
            { ar:'الواجهة', en:'Frontend', val:'React 18' },
          ].map((r,i) => (
            <div key={i} style={{ background:'var(--surface)', borderRadius:9, padding:'10px 14px' }}>
              <div style={{ fontSize:'0.68rem', color:'var(--text-3)', marginBottom:2 }}>{isAr ? r.ar : r.en}</div>
              <div style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text-1)', fontFamily:'monospace' }}>{r.val}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
