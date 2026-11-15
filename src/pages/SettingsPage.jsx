import { useState, useEffect, useRef } from 'react'
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
import { Icon, SettingsCard, SETTINGS_CSS } from '../components/settings/ui'

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

const initials = name => (name || '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')

function SectionHead({ icon, title, desc }) {
  return (
    <div className="st-sec-head">
      <span className="st-sec-ico"><Icon name={icon} size={26} /></span>
      <div>
        <h2 className="st-h2">{title}</h2>
        <p className="st-h2p">{desc}</p>
      </div>
    </div>
  )
}

function LinkTile({ to, icon, title, desc, isAr }) {
  return (
    <Link to={to} className="st-link">
      <span className="st-card-ico"><Icon name={icon} size={20} /></span>
      <span className="st-link-tx"><b>{title}</b><span>{desc}</span></span>
      <span className="st-link-go"><Icon name="chev" size={20} flip={isAr} /></span>
    </Link>
  )
}

function ThemeTile({ t, on, isAr, onPick }) {
  return (
    <button type="button" className={`st-theme${on ? ' on' : ''}`} onClick={() => onPick(t.id)} aria-pressed={on}>
      <span className="st-theme-mock" aria-hidden="true" style={{ background: t.preview[2] }}>
        <span className="st-theme-side" style={{ background: t.preview[0] }} />
        <span className="st-theme-main">
          <span className="st-theme-bar" style={{ background: t.preview[1] }} />
          <span className="st-theme-line" style={{ width: '78%' }} />
          <span className="st-theme-line" style={{ width: '52%' }} />
        </span>
      </span>
      <span className="st-theme-name">{isAr ? t.labelAr : t.labelEn}</span>
      <span className="st-theme-tick" aria-hidden="true"><Icon name="check" size={14} /></span>
    </button>
  )
}

export default function SettingsPage() {
  const { i18n } = useTranslation()
  const { profile, isAdmin: isAdminRole, isGeneralAdmin, allowCap } = useAuth()
  const isAdmin = isAdminRole && allowCap('settings_access')
  const { settings, saveSetting } = useAppSettings()
  const isAr = i18n.language === 'ar'
  const T = (a, e) => (isAr ? a : e)

  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('st_tab') || 'general' } catch { return 'general' } })
  const [upd, setUpd] = useState('')   // '' | 'checking' | 'latest' | 'new'

  const tabs = [
    { id: 'general', ar: 'عام', en: 'General', icon: 'general', dAr: 'المظهر واليوم التشغيلي', dEn: 'Theme and business day' },
    { id: 'access', ar: 'الصلاحيات والوصول', en: 'Access', icon: 'access', dAr: 'من يرى ماذا في النظام', dEn: 'Who can see what' },
    { id: 'data', ar: 'البيانات والتصدير', en: 'Data & export', icon: 'data', dAr: 'تقارير وملفات Excel', dEn: 'Reports and Excel files' },
    { id: 'backup', ar: 'النسخ الاحتياطي', en: 'Backup', icon: 'backup', dAr: 'التقرير اليومي بالبريد', dEn: 'Daily report by email' },
    { id: 'about', ar: 'حول النظام', en: 'About', icon: 'about', dAr: 'النسخة والتحديث والحساب', dEn: 'Version, updates, account' },
  ]
  const active = tabs.some(t => t.id === tab) ? tab : 'general'
  useEffect(() => { try { localStorage.setItem('st_tab', active) } catch { /* بدون تخزين */ } }, [active])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 58px)', color: 'var(--text-3)', fontSize: '0.9rem' }}>
        {T('غير مصرح', 'Access denied')}
      </div>
    )
  }

  function flash(text) {
    setToast(text || T('تم الحفظ', 'Saved'))
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }

  async function save(key, value, okText) {
    await saveSetting(key, value)
    flash(okText)
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
  const themeLabel = themeName ? (isAr ? themeName.labelAr : themeName.labelEn) : '—'
  const activeTab = tabs.find(t => t.id === active)
  const updDot = upd === 'new' ? 'warn' : upd === 'latest' ? 'ok' : upd === 'checking' ? 'busy' : ''
  const updText = upd === 'new' ? T('تتوفر نسخة جديدة', 'A new version is available')
    : upd === 'latest' ? T('أنت على آخر نسخة', 'You are on the latest version')
    : upd === 'checking' ? T('جارٍ الفحص…', 'Checking…')
    : T('لم يتم الفحص بعد في هذه الجلسة', 'Not checked yet in this session')

  return (
    <div className="st-wrap" style={{ maxWidth: 'min(100%, 1560px)', margin: '0 auto', padding: 'clamp(16px, 2vw, 32px)', paddingBottom: 'clamp(32px, 4vw, 56px)' }}>
      <style>{SETTINGS_CSS}</style>

      <header className="st-hero">
        <div className="st-hero-in">
          <span className="st-hero-ico"><Icon name="gear" size={32} /></span>
          <div className="st-hero-tx">
            <h1>{T('إعدادات النظام', 'System Settings')}</h1>
            <p>{T('تحكّم بمظهر النظام وقواعد التشغيل والصلاحيات والتصدير والنسخ الاحتياطي. تُطبَّق على جميع المستخدمين.', 'Control appearance, operating rules, access, exports and backups. Applied to all users.')}</p>
          </div>
          <div className="st-chips">
            <span className="st-pill acc">{T('الدور', 'Role')} <b>{role}</b></span>
            <span className="st-pill mono">{T('النسخة', 'Version')} <b dir="ltr">v{ver}</b></span>
          </div>
        </div>
      </header>

      <div className="st-grid">
        <aside className="st-side">
          <nav className="st-nav" role="tablist" aria-label={T('أقسام الإعدادات', 'Settings sections')}>
            {tabs.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className="st-tab" onClick={() => setTab(t.id)}>
                <span className="st-tab-ico"><Icon name={t.icon} size={20} /></span>
                <span className="st-tab-tx"><b>{T(t.ar, t.en)}</b><small>{T(t.dAr, t.dEn)}</small></span>
              </button>
            ))}
          </nav>
          <div className="st-side-foot">
            <span className="st-avatar" aria-hidden="true">{initials(profile?.full_name_ar)}</span>
            <div><b>{profile?.full_name_ar || '—'}</b><span>{role}</span></div>
          </div>
        </aside>

        <div className="st-pane" role="tabpanel">
          <SectionHead icon={activeTab.icon} title={T(activeTab.ar, activeTab.en)} desc={T(activeTab.dAr, activeTab.dEn)} />

          {/* ───────── عام ───────── */}
          {active === 'general' && (
            <div className="st-cards">
              <SettingsCard span icon="palette" title={T('ألوان النظام', 'System Colors')} desc={T('يُطبَّق فوراً على جميع المستخدمين المتصلين', 'Applies instantly to all connected users')}
                aside={<span className="st-pill acc">{T('الحالي', 'Current')} <b>{themeLabel}</b></span>}>
                <div className="st-themes">
                  {THEMES.map(t => (
                    <ThemeTile key={t.id} t={t} isAr={isAr} on={settings.theme === t.id}
                      onPick={id => save('theme', id, T('تم حفظ لون النظام', 'System color saved'))} />
                  ))}
                </div>
              </SettingsCard>
              <SalesDaySettings isAr={isAr} onSaved={flash} />
            </div>
          )}

          {/* ───────── الصلاحيات ───────── */}
          {active === 'access' && (
            <div className="st-cards">
              <TransportOverviewAccess isAr={isAr} onSaved={flash} />
              <div className="st-span">
                <LinkTile to="/users" icon="users" isAr={isAr}
                  title={T('المستخدمون والمسميات الوظيفية', 'Users & job titles')}
                  desc={T('إدارة الحسابات وصلاحيات كل مسمى', 'Manage accounts and each title’s permissions')} />
              </div>
            </div>
          )}

          {/* ───────── البيانات ───────── */}
          {active === 'data' && (
            <div className="st-cards">
              {isGeneralAdmin && (
                <div className="st-span">
                  <LinkTile to="/data" icon="bolt" isAr={isAr}
                    title={T('مركز البيانات المباشر', 'Live Data Center')}
                    desc={T('كل أقسام النظام في شبكة بنمط Excel تتحدث لحظياً', 'Every section in a live Excel-style grid')} />
                </div>
              )}
              {isGeneralAdmin && <MasterWorkbookExport isAr={isAr} />}
              <OperationsReportDownload isAr={isAr} />
              {isGeneralAdmin && <ExcelLiveLink isAr={isAr} />}
            </div>
          )}

          {/* ───────── النسخ الاحتياطي ───────── */}
          {active === 'backup' && (
            <div className="st-cards">
              <BackupSettings isAr={isAr} onSaved={flash} />
            </div>
          )}

          {/* ───────── حول ───────── */}
          {active === 'about' && (
            <div className="st-cards">
              <SettingsCard span icon="about" title={T('النسخة والتحديثات', 'Version & updates')}
                desc={T('إذا ظهر لك سلوك قديم فالتحديث غالباً لم يصل لجهازك بعد.', 'If you see old behavior, the update likely has not reached your device yet.')}>
                <div className="st-split">
                  <div>
                    <div className="st-lbl">{T('رقم النسخة', 'Build')}</div>
                    <div className="st-ver" dir="ltr" style={{ textAlign: isAr ? 'right' : 'left' }}>v{ver}</div>
                    <div className="st-kv" style={{ marginTop: 16 }}>
                      <div><span>{T('تاريخ البناء (الرياض)', 'Built (Riyadh)')}</span><b style={{ fontFamily: MONO }} dir="ltr">{buildStamp() || '—'}</b></div>
                      <div><span>{T('الواجهة', 'Frontend')}</span><b style={{ fontFamily: MONO }}>React 18 · PWA</b></div>
                    </div>
                  </div>
                  <div className="st-panel">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <span className={`st-dot ${updDot}`} aria-hidden="true" />
                      <b aria-live="polite" style={{ fontSize: 'inherit', fontWeight: 800, color: 'var(--text-1)' }}>{updText}</b>
                    </div>
                    <div className="st-actions">
                      <button type="button" className="st-btn" onClick={checkUpdate} disabled={upd === 'checking'}>
                        <Icon name="refresh" size={18} />
                        {upd === 'checking' ? T('جارٍ الفحص…', 'Checking…') : T('التحقق من التحديثات', 'Check for updates')}
                      </button>
                      {upd === 'new' && <button type="button" className="st-btn pri" onClick={hardRefresh}>{T('إعادة التشغيل للتحديث', 'Restart to update')}</button>}
                    </div>
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard span icon="users" title={T('الحساب الحالي', 'Current account')} desc={T('للتأكد من الصلاحيات التي تعمل بها الآن.', 'To confirm the access you are working with.')}>
                <div style={{ display: 'flex', gap: 'clamp(16px, 2vw, 28px)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="st-avatar" aria-hidden="true" style={{ width: 72, height: 72, fontSize: '1.4rem' }}>{initials(profile?.full_name_ar)}</span>
                  <div className="st-kv" style={{ flex: 1, minWidth: 260 }}>
                    <div><span>{T('الاسم', 'Name')}</span><b>{profile?.full_name_ar || '—'}</b></div>
                    <div><span>{T('الدور', 'Role')}</span><b>{role}</b></div>
                    <div><span>{T('اللغة', 'Language')}</span><b>{isAr ? 'العربية' : 'English'}</b></div>
                    <div><span>{T('نمط الألوان', 'Theme')}</span><b>{themeLabel}</b></div>
                  </div>
                </div>
              </SettingsCard>
            </div>
          )}
        </div>
      </div>

      <div aria-live="polite" role="status">
        {toast && (
          <div className="st-toast">
            <span className="st-toast-ic"><Icon name="check" size={14} /></span>
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
