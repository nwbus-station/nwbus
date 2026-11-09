import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useAppSettings } from '../context/AppSettingsContext'
import { buildStamp } from '../utils/buildInfo'
import { checkAppVersion, hardRefresh, isPwaUpdatePending } from '../lib/pwaUpdate'
import BackupSettings from '../components/settings/BackupSettings'
import OperationsReportDownload from '../components/settings/OperationsReportDownload'
import SalesDaySettings from '../components/settings/SalesDaySettings'
import ExcelLiveLink from '../components/settings/ExcelLiveLink'
import MasterWorkbookExport from '../components/settings/MasterWorkbookExport'
import TransportOverviewAccess from '../components/settings/TransportOverviewAccess'

const THEMES = [
  { id: 'bw',     labelAr: 'أسود وأبيض',  labelEn: 'Black & White', preview: ['#0a0a0a', '#ffffff', '#f0f0f0'] },
  { id: 'navy',   labelAr: 'أزرق ملكي',   labelEn: 'Royal Navy',    preview: ['#0f2042', '#1b3a6b', '#f0f4ff'] },
  { id: 'forest', labelAr: 'أخضر الغابة', labelEn: 'Forest',        preview: ['#1a3a2a', '#2d6a4f', '#f0faf4'] },
  { id: 'slate',  labelAr: 'رمادي داكن',  labelEn: 'Slate',         preview: ['#1e293b', '#334155', '#f1f5f9'] },
  { id: 'coffee', labelAr: 'بني كلاسيكي', labelEn: 'Classic Brown', preview: ['#2c1a0e', '#5c3317', '#fdf6f0'] },
]

const ROLE_LABELS = {
  general_admin: ['أدمن عام', 'General Admin'],
  stations_executive_director: ['المدير التنفيذي للمحطات', 'Stations Executive Director'],
  assistant_stations_executive_director: ['مساعد المدير التنفيذي للمحطات', 'Assistant Executive Director'],
  station_admin: ['مشرف المحطة', 'Supervisor'],
  accountant: ['محاسب', 'Accountant'],
  station_employee: ['موظف', 'Employee'],
  shift_supervisor: ['مشرف وردية', 'Shift Supervisor'],
  area_supervisor: ['مشرف منطقة', 'Area Supervisor'],
}

const MONO = "'IBM Plex Mono', ui-monospace, monospace"
const ICONS = {
  general: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 3v18', 'M3 12h18'],
  access:  ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z', 'M9 12l2 2 4-4'],
  data:    ['M3 5h18v14H3z', 'M3 10h18', 'M9 5v14'],
  backup:  ['M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  about:   ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 11v5', 'M12 8h.01'],
}
const Icon = ({ name, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name].map((d, i) => <path key={i} d={d} />)}
  </svg>
)

const CSS = `
.st-wrap{max-width:1040px;margin:0 auto;padding:24px 20px 48px}
.st-grid{display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;align-items:start}
.st-nav{position:sticky;top:76px;display:flex;flex-direction:column;gap:2px}
.st-tab{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 14px;border:none;background:transparent;color:var(--text-2);font:inherit;font-size:.84rem;font-weight:600;cursor:pointer;text-align:start;border-radius:6px;border-inline-start:3px solid transparent;transition:background .15s,color .15s}
.st-tab:hover{background:var(--surface);color:var(--text-1)}
.st-tab[aria-selected="true"]{background:var(--gold-dim);color:var(--text-1);font-weight:800;border-inline-start-color:var(--accent)}
.st-tab:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.st-tab small{margin-inline-start:auto;font-size:.66rem;font-weight:700;color:var(--text-3)}
.st-pane > div, .st-pane > section{border-radius:8px !important}
.st-card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:20px 24px;margin-bottom:16px}
.st-card h3{margin:0 0 4px;font-size:.9rem;font-weight:800;color:var(--text-1)}
.st-card .st-sub{margin:0 0 16px;font-size:.76rem;color:var(--text-3);line-height:1.7}
.st-h2{margin:0 0 4px;font-size:1.05rem;font-weight:800;color:var(--text-1)}
.st-h2p{margin:0 0 18px;font-size:.78rem;color:var(--text-3)}
.st-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.st-kv > div{background:var(--surface);border-radius:6px;padding:10px 14px}
.st-kv span{display:block;font-size:.68rem;color:var(--text-3);margin-bottom:3px}
.st-kv b{font-size:.84rem;font-weight:700;color:var(--text-1);word-break:break-word}
.st-btn{min-height:44px;padding:0 18px;border-radius:6px;border:1px solid var(--border-2);background:var(--card);color:var(--text-1);font:inherit;font-size:.82rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px;text-decoration:none}
.st-btn.pri{background:var(--solid-btn);border-color:var(--solid-btn);color:#fff}
.st-btn:disabled{opacity:.55;cursor:not-allowed}
.st-link{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;margin-bottom:16px;border:1px solid var(--border-2);border-radius:8px;background:var(--card);text-decoration:none;color:var(--text-1)}
.st-link:hover{border-color:var(--accent)}
@media (max-width:820px){
  .st-wrap{padding:16px 14px 40px}
  .st-grid{grid-template-columns:minmax(0,1fr);gap:14px}
  .st-nav{position:static;flex-direction:row;overflow-x:auto;gap:6px;padding-bottom:4px;scrollbar-width:none;margin-inline:-14px;padding-inline:14px}
  .st-nav::-webkit-scrollbar{display:none}
  .st-tab{flex:0 0 auto;border-inline-start:none;border-bottom:2px solid transparent;border-radius:6px 6px 0 0;padding:0 12px;white-space:nowrap}
  .st-tab[aria-selected="true"]{border-bottom-color:var(--accent)}
  .st-tab small{display:none}
  .st-card{padding:16px}
}
`

export default function SettingsPage() {
  const { i18n } = useTranslation()
  const { profile, isAdmin: isAdminRole, isGeneralAdmin, allowCap } = useAuth()
  const isAdmin = isAdminRole && allowCap('settings_access')
  const { settings, saveSetting } = useAppSettings()
  const isAr = i18n.language === 'ar'
  const T = (a, e) => (isAr ? a : e)

  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('st_tab') || 'general' } catch { return 'general' } })
  const [upd, setUpd] = useState('')   // '' | 'checking' | 'latest' | 'new'

  const tabs = [
    { id: 'general', ar: 'عام', en: 'General', icon: 'general' },
    { id: 'access', ar: 'الصلاحيات والوصول', en: 'Access', icon: 'access' },
    { id: 'data', ar: 'البيانات والتصدير', en: 'Data & export', icon: 'data' },
    { id: 'backup', ar: 'النسخ الاحتياطي', en: 'Backup', icon: 'backup' },
    { id: 'about', ar: 'حول النظام', en: 'About', icon: 'about' },
  ]
  const active = tabs.some(t => t.id === tab) ? tab : 'general'
  useEffect(() => { try { localStorage.setItem('st_tab', active) } catch { /* بدون تخزين */ } }, [active])

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 58px)', color: 'var(--text-3)', fontSize: '0.9rem' }}>
        {T('غير مصرح', 'Access denied')}
      </div>
    )
  }

  async function save(key, value) {
    await saveSetting(key, value)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  async function checkUpdate() {
    setUpd('checking')
    await checkAppVersion('manual')
    setUpd(isPwaUpdatePending() ? 'new' : 'latest')
  }

  const roleKey = profile?.display_role ?? profile?.role
  const role = ROLE_LABELS[roleKey]?.[isAr ? 0 : 1] || roleKey || '—'
  const ver = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
  const themeName = THEMES.find(t => t.id === settings.theme)
  const Head = ({ ar, en, pAr, pEn }) => (
    <>
      <h2 className="st-h2">{T(ar, en)}</h2>
      <p className="st-h2p">{T(pAr, pEn)}</p>
    </>
  )

  return (
    <div className="st-wrap">
      <style>{CSS}</style>

      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-1)' }}>{T('إعدادات النظام', 'System Settings')}</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-3)' }}>{T('تُطبَّق على جميع المستخدمين', 'Applied to all users')}</p>
        </div>
        <div aria-live="polite" style={{ minHeight: 30 }}>
          {saved && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 99, background: 'var(--success-bg)', border: '1px solid rgba(22,163,74,0.35)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--success)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
              {T('تم الحفظ', 'Saved')}
            </div>
          )}
        </div>
      </div>

      <div className="st-grid">
        <nav className="st-nav" role="tablist" aria-label={T('أقسام الإعدادات', 'Settings sections')}>
          {tabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className="st-tab" onClick={() => setTab(t.id)}>
              <Icon name={t.icon} />{T(t.ar, t.en)}
            </button>
          ))}
        </nav>

        <div className="st-pane" role="tabpanel">
          {/* ───────── عام ───────── */}
          {active === 'general' && (
            <>
              <Head ar="عام" en="General" pAr="المظهر وقواعد التشغيل اليومية" pEn="Appearance and daily operating rules" />
              <section className="st-card">
                <h3>{T('ألوان النظام', 'System Colors')}</h3>
                <p className="st-sub">{T('يُطبَّق فوراً على جميع المستخدمين المتصلين', 'Applies instantly to all connected users')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 10 }}>
                  {THEMES.map(t => {
                    const on = settings.theme === t.id
                    return (
                      <button key={t.id} type="button" onClick={() => save('theme', t.id)} aria-pressed={on}
                        style={{ border: `2px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, borderRadius: 8, padding: '12px 8px', background: on ? 'var(--gold-dim)' : 'var(--card)', cursor: 'pointer', transition: 'all .15s', textAlign: 'center', fontFamily: 'inherit', minHeight: 44 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 8 }}>
                          {t.preview.map((c, i) => <div key={i} style={{ width: 15, height: 15, borderRadius: '50%', background: c, border: '1px solid var(--border-2)' }} />)}
                        </div>
                        <div style={{ fontSize: '0.72rem', fontWeight: on ? 800 : 500, color: on ? 'var(--text-1)' : 'var(--text-2)' }}>{isAr ? t.labelAr : t.labelEn}</div>
                      </button>
                    )
                  })}
                </div>
              </section>
              <SalesDaySettings isAr={isAr} />
            </>
          )}

          {/* ───────── الصلاحيات ───────── */}
          {active === 'access' && (
            <>
              <Head ar="الصلاحيات والوصول" en="Access" pAr="من يرى ماذا في النظام" pEn="Who can see what" />
              <TransportOverviewAccess isAr={isAr} />
              <Link to="/users" className="st-link">
                <span>
                  <b style={{ display: 'block', fontSize: '0.86rem' }}>{T('المستخدمون والمسميات الوظيفية', 'Users & job titles')}</b>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>{T('إدارة الحسابات وصلاحيات كل مسمى', 'Manage accounts and each title’s permissions')}</span>
                </span>
                <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }} aria-hidden="true">{isAr ? '‹' : '›'}</span>
              </Link>
            </>
          )}

          {/* ───────── البيانات ───────── */}
          {active === 'data' && (
            <>
              <Head ar="البيانات والتصدير" en="Data & export" pAr="تقارير وملفات Excel وربط مباشر بالبيانات" pEn="Reports, Excel files and live data links" />
              {isGeneralAdmin && (
                <Link to="/data" className="st-link">
                  <span>
                    <b style={{ display: 'block', fontSize: '0.86rem' }}>{T('مركز البيانات المباشر', 'Live Data Center')}</b>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>{T('كل أقسام النظام في شبكة بنمط Excel تتحدث لحظياً', 'Every section in a live Excel-style grid')}</span>
                  </span>
                  <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }} aria-hidden="true">{isAr ? '‹' : '›'}</span>
                </Link>
              )}
              {isGeneralAdmin && <MasterWorkbookExport isAr={isAr} />}
              <OperationsReportDownload isAr={isAr} />
              {isGeneralAdmin && <ExcelLiveLink isAr={isAr} />}
            </>
          )}

          {/* ───────── النسخ الاحتياطي ───────── */}
          {active === 'backup' && (
            <>
              <Head ar="النسخ الاحتياطي" en="Backup" pAr="التقرير اليومي ونسخة البيانات بالبريد" pEn="Daily report and data backup by email" />
              <BackupSettings isAr={isAr} />
            </>
          )}

          {/* ───────── حول ───────── */}
          {active === 'about' && (
            <>
              <Head ar="حول النظام" en="About" pAr="معلومات النسخة والحساب الحالي" pEn="Version and current account info" />
              <section className="st-card">
                <h3>{T('النسخة', 'Version')}</h3>
                <p className="st-sub">{T('إذا ظهر لك سلوك قديم فالتحديث غالباً لم يصل لجهازك بعد.', 'If you see old behavior, the update likely has not reached your device yet.')}</p>
                <div className="st-kv" style={{ marginBottom: 14 }}>
                  <div><span>{T('رقم النسخة', 'Build')}</span><b style={{ fontFamily: MONO }} dir="ltr">v{ver}</b></div>
                  <div><span>{T('تاريخ البناء (الرياض)', 'Built (Riyadh)')}</span><b style={{ fontFamily: MONO }} dir="ltr">{buildStamp() || '—'}</b></div>
                  <div><span>{T('الواجهة', 'Frontend')}</span><b style={{ fontFamily: MONO }}>React 18 · PWA</b></div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="st-btn" onClick={checkUpdate} disabled={upd === 'checking'}>
                    {upd === 'checking' ? T('جارٍ الفحص…', 'Checking…') : T('التحقق من التحديثات', 'Check for updates')}
                  </button>
                  {upd === 'new' && <button type="button" className="st-btn pri" onClick={hardRefresh}>{T('إعادة التشغيل للتحديث', 'Restart to update')}</button>}
                  {upd === 'latest' && <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success)' }}>{T('أنت على آخر نسخة', 'You are on the latest version')}</span>}
                </div>
              </section>
              <section className="st-card">
                <h3>{T('الحساب الحالي', 'Current account')}</h3>
                <p className="st-sub" style={{ marginBottom: 12 }}>{T('للتأكد من الصلاحيات التي تعمل بها الآن.', 'To confirm the access you are working with.')}</p>
                <div className="st-kv">
                  <div><span>{T('الاسم', 'Name')}</span><b>{profile?.full_name_ar || '—'}</b></div>
                  <div><span>{T('الدور', 'Role')}</span><b>{role}</b></div>
                  <div><span>{T('اللغة', 'Language')}</span><b>{isAr ? 'العربية' : 'English'}</b></div>
                  <div><span>{T('نمط الألوان', 'Theme')}</span><b>{themeName ? (isAr ? themeName.labelAr : themeName.labelEn) : '—'}</b></div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
