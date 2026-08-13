import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useAppSettings } from '../context/AppSettingsContext'

const THEMES = [
  { id:'bw',     labelAr:'أسود وأبيض',    labelEn:'Black & White',   preview:['#0a0a0a','#ffffff','#f0f0f0'] },
  { id:'navy',   labelAr:'أزرق ملكي',     labelEn:'Royal Navy',      preview:['#0f2042','#1b3a6b','#f0f4ff'] },
  { id:'forest', labelAr:'أخضر الغابة',   labelEn:'Forest',          preview:['#1a3a2a','#2d6a4f','#f0faf4'] },
  { id:'slate',  labelAr:'رمادي داكن',    labelEn:'Slate',           preview:['#1e293b','#334155','#f1f5f9'] },
  { id:'coffee', labelAr:'بني كلاسيكي',   labelEn:'Classic Brown',   preview:['#2c1a0e','#5c3317','#fdf6f0'] },
]


export default function SettingsPage() {
  const { i18n } = useTranslation()
  const { profile, isAdmin } = useAuth()
  const { settings, saveSetting } = useAppSettings()
  const isAr = i18n.language === 'ar'

  const [saved, setSaved] = useState(false)

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

      {/* ── System info ── */}
      <Section titleAr="معلومات النظام" titleEn="System Info">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[
            { ar:'الإصدار', en:'Version', val:'1.0.0' },
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
