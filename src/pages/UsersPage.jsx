import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getCached, setCached, clearCached } from '../lib/pageCache'
import { USER_ROLES, MODULES } from '../utils/constants'
import { toLatinDigits, escapeHtml } from '../utils/digits'
import { isRestStation } from '../utils/stations'
import { useEscapeKey } from '../hooks/useEscapeKey'
import DatePicker from '../components/shared/DatePicker'
import ConfirmDialog from '../components/shared/ConfirmDialog'

async function resetPasswordViaEdge(authId, newPassword) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('No active session')
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-password`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ auth_id: authId, new_password: newPassword }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Failed to reset password')
}

function buildUsername(jobNum) {
  return jobNum ? 'NW' + jobNum : ''
}

function buildPassword(nameEn, nationalId) {
  const first = (nameEn || '').trim().split(/\s+/)[0] || ''
  const prefix = first.slice(0, 3) || 'NW'
  const suffix = (nationalId || '').replace(/\D/g, '').slice(-3)
  return prefix + suffix + '.'
}

const JOB_TITLES = [
  { value: 'area_supervisor',    ar: 'مشرف منطقة',  en: 'Area Supervisor' },
  { value: 'station_supervisor', ar: 'مشرف محطة',   en: 'Station Supervisor' },
  { value: 'shift_supervisor',   ar: 'مشرف وردية',  en: 'Shift Supervisor' },
  { value: 'customer_service',   ar: 'خدمة عملاء',  en: 'Customer Service' },
  { value: 'dispatcher',         ar: 'مرحّل',        en: 'Dispatcher' },
]

const ROLE_COLORS = {
  general_admin:    'bg-red-100 text-red-700 border-red-200',
  area_supervisor:  'bg-purple-100 text-purple-700 border-purple-200',
  station_admin:    'bg-amber-100 text-amber-700 border-amber-200',
  shift_supervisor: 'bg-orange-100 text-orange-700 border-orange-200',
  accountant:       'bg-blue-100 text-blue-700 border-blue-200',
  station_employee: 'bg-gray-100 text-gray-600 border-gray-200',
}

/* ─── Credential Card ──────────────────────────────────── */
function CredentialCard({ username, password, nameAr, jobNumber, phone, hireDate, stationName, onClose }) {
  useEscapeKey(onClose)
  function handlePrint() {
    const w = window.open('', '_blank', 'width=794,height=1123')
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>بطاقة دخول - ${nameAr}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      @page{size:A4;margin:0}
      body{font-family:Arial,sans-serif;direction:rtl;background:#EBEBEB;display:flex;align-items:center;justify-content:center;min-height:100vh;print-color-adjust:exact;-webkit-print-color-adjust:exact}
      .card{width:480px;background:#fff;border-radius:0;overflow:hidden;border:1px solid #D1D1D1}
      .header{background:#2C2C2C;padding:30px 32px 24px}
      .brand{font-size:9px;letter-spacing:4px;color:#888;margin-bottom:10px;font-weight:600;text-transform:uppercase}
      .header-title{font-size:20px;font-weight:700;color:#fff;letter-spacing:0.5px}
      .header-sub{font-size:11px;color:#666;margin-top:5px;letter-spacing:1px}
      .stripe{height:2px;background:#888}
      .body{padding:28px 32px;background:#fff}
      .employee-section{margin-bottom:26px;padding-bottom:22px;border-bottom:1px solid #EBEBEB}
      .section-label{font-size:9px;letter-spacing:3px;color:#999;font-weight:600;text-transform:uppercase;margin-bottom:10px}
      .employee-name{font-size:20px;font-weight:700;color:#1A1A1A;margin-bottom:14px}
      .info-row{display:flex;gap:0;border:1px solid #E8E8E8}
      .info-cell{flex:1;padding:11px 14px;border-left:1px solid #E8E8E8}
      .info-cell:last-child{border-left:none}
      .info-cell .lbl{font-size:9px;color:#AAA;letter-spacing:1px;font-weight:600;margin-bottom:4px}
      .info-cell .val{font-size:12px;font-weight:700;color:#2C2C2C}
      .info-row2{display:flex;gap:0;border:1px solid #E8E8E8;border-top:none}
      .cred-section{background:#F5F5F5;border:1px solid #E0E0E0;padding:20px 22px;margin-top:20px}
      .cred-header{font-size:9px;letter-spacing:3px;color:#999;font-weight:600;margin-bottom:16px}
      .cred-item{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #E8E8E8}
      .cred-item:last-child{border-bottom:none;padding-bottom:0}
      .cred-lbl{font-size:10px;color:#888;letter-spacing:1px}
      .cred-val{font-family:monospace;font-size:15px;font-weight:700;color:#1A1A1A;direction:ltr;letter-spacing:2px}
      .notice{margin-top:18px;padding:12px 14px;border-right:3px solid #BDBDBD;background:#FAFAFA}
      .notice-text{font-size:10px;color:#888;line-height:1.6}
      .footer{padding:14px 32px;border-top:1px solid #EBEBEB;display:flex;justify-content:space-between;align-items:center}
      .footer-brand{font-size:9px;letter-spacing:2px;color:#BDBDBD;font-weight:600}
      .footer-date{font-size:9px;color:#BDBDBD}
    </style></head><body>
    <div class="card">
      <div class="header">
        <div class="brand">NORTH WEST BUS · نظام المحطات</div>
        <div class="header-title">بطاقة بيانات الدخول</div>
        <div class="header-sub">Credential Card</div>
      </div>
      <div class="stripe"></div>
      <div class="body">
        <div class="employee-section">
          <div class="section-label">الموظف</div>
          <div class="employee-name">${escapeHtml(nameAr)}</div>
          <div class="info-row">
            ${jobNumber ? `<div class="info-cell"><div class="lbl">الرقم الوظيفي</div><div class="val">${escapeHtml(jobNumber)}</div></div>` : ''}
            ${phone ? `<div class="info-cell"><div class="lbl">رقم الجوال</div><div class="val" dir="ltr">${escapeHtml(phone)}</div></div>` : ''}
          </div>
          <div class="info-row2">
            ${stationName ? `<div class="info-cell"><div class="lbl">المحطة</div><div class="val">${escapeHtml(stationName)}</div></div>` : ''}
            ${hireDate ? `<div class="info-cell"><div class="lbl">تاريخ المباشرة</div><div class="val">${escapeHtml(hireDate)}</div></div>` : ''}
          </div>
        </div>
        <div class="cred-section">
          <div class="cred-header">بيانات الدخول</div>
          <div class="cred-item">
            <span class="cred-lbl">اسم المستخدم</span>
            <span class="cred-val">${escapeHtml(username)}</span>
          </div>
          <div class="cred-item">
            <span class="cred-lbl">كلمة المرور</span>
            <span class="cred-val">${escapeHtml(password)}</span>
          </div>
        </div>
        <div class="notice">
          <div class="notice-text">هذه البطاقة سرية — احتفظ بها في مكان آمن ولا تشاركها مع أي شخص آخر</div>
        </div>
      </div>
      <div class="footer">
        <span class="footer-brand">NWB STATIONS SYSTEM</span>
        <span class="footer-date">${new Date().toLocaleDateString('ar-SA')}</span>
      </div>
    </div>
    <script>window.onload=()=>{window.print()}</script>
    </body></html>`)
    w.document.close()
  }
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4 text-white text-center" style={{ background: '#0F2444' }}>
          <h2 className="font-bold text-base">بطاقة بيانات الدخول</h2>
          <p className="text-white/60 text-xs mt-0.5">احتفظ بها في مكان آمن</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="bg-gray-50 rounded-xl p-3 border">
            <p className="text-xs text-gray-400 mb-0.5">الاسم</p>
            <p className="font-bold text-gray-800">{nameAr}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
            <p className="text-xs text-blue-400 mb-0.5">اسم المستخدم</p>
            <p className="font-mono font-bold text-blue-800 text-lg tracking-wide">{username}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
            <p className="text-xs text-amber-500 mb-0.5">كلمة المرور</p>
            <p className="font-mono font-bold text-amber-800 text-lg tracking-widest" dir="ltr">{password}</p>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handlePrint}
              className="flex-1 bg-nwbus-primary text-white py-2 rounded-lg text-sm font-semibold hover:bg-nwbus-dark transition-colors">
              طباعة
            </button>
            <button onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── User Modal ────────────────────────────────────────── */
const NEW_USER_DRAFT_KEY = 'um_new_draft'

function UserModal({ user, stations, supervisors, onClose, onSaved }) {
  const { profile, isGeneralAdmin, isStationAdmin } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  // station_admin can only create employees/accountants for their station
  const allowedRoles = isGeneralAdmin
    ? USER_ROLES
    : USER_ROLES.filter(r => ['station_employee', 'accountant'].includes(r.value))

  // استعادة مسودة "موظف جديد" محفوظة (لو انقطع النت أو حدّث الصفحة قبل الحفظ)
  const newUserDraft = (() => {
    if (user) return null // مو لموظف جديد
    try {
      const raw = sessionStorage.getItem(NEW_USER_DRAFT_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })()

  function clearNewUserDraft() { sessionStorage.removeItem(NEW_USER_DRAFT_KEY) }
  function closeAndClearDraft() { if (!user) clearNewUserDraft(); onClose() }
  useEscapeKey(closeAndClearDraft)

  const [form, setForm] = useState(newUserDraft?.form ?? {
    job_number:      user?.job_number      ?? '',
    username:        user?.username        ?? '',
    password:        '',
    full_name_ar:    user?.full_name_ar    ?? '',
    full_name_en:    user?.full_name_en    ?? '',
    role:            user?.role            ?? 'station_employee',
    station_id:      user?.station_id      ?? (isStationAdmin ? profile.station_id : ''),
    supervisor_id:   user?.supervisor_id   ?? '',
    phone:           user?.phone           ?? '',
    national_id:     user?.national_id     ?? '',
    job_title:       user?.job_title        ?? '',
    hire_date:       user?.hire_date        ?? '',
    is_accountant:   user?.is_accountant   ?? false,
    is_agent:        user?.is_agent        ?? false,
    language:        user?.language        ?? 'ar',
    is_active:       user?.is_active       ?? true,
    allowed_modules: user?.allowed_modules ?? null,
  })
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [credential, setCredential] = useState(null) // { username, password, nameAr }
  // password reset for edit mode
  const [newPwd,      setNewPwd]      = useState('')
  const [showNewPwd,  setShowNewPwd]  = useState(false)
  const [pwdSaving,   setPwdSaving]   = useState(false)
  const [pwdMsg,      setPwdMsg]      = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // auto-fill username when job_number changes (new user only)
  function handleJobNumberChange(val) {
    const n = toLatinDigits(val).replace(/\D/g, '')
    set('job_number', n)
    if (!user) set('username', buildUsername(n))
  }

  // auto-fill password when English name or national_id changes (new user only)
  function handleNameEnChange(val) {
    set('full_name_en', val)
    if (!user) set('password', buildPassword(val, form.national_id))
  }

  function handleNationalIdChange(val) {
    const n = toLatinDigits(val).replace(/\D/g, '')
    set('national_id', n)
    if (!user) set('password', buildPassword(form.full_name_en, n))
  }

  // محطات المشرف المتعددة (station_admin) — تُحفظ في user_stations
  const [stationSet,    setStationSet]    = useState(new Set(
    newUserDraft?.stationSet ?? (user?.station_id ? [user.station_id] : [])
  ))
  const [stationSearch, setStationSearch] = useState('')

  // حفظ مسودة "موظف جديد" عند كل تغيير — تحمي من فقدان البيانات بانقطاع النت أو تحديث الصفحة
  useEffect(() => {
    if (user) return
    try {
      sessionStorage.setItem(NEW_USER_DRAFT_KEY, JSON.stringify({
        form, stationSet: [...stationSet],
      }))
    } catch {}
  }, [user, form, stationSet])
  useEffect(() => {
    if (user?.id && (user.role === 'station_admin' || user.role === 'area_supervisor')) {
      supabase.from('user_stations').select('station_id').eq('user_id', user.id)
        .then(({ data }) => { if (data?.length) setStationSet(new Set(data.map(r => r.station_id))) })
    }
  }, [user?.id])
  const toggleStation = sid => setStationSet(prev => {
    const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n
  })
  async function syncStations(uid) {
    await supabase.from('user_stations').delete().eq('user_id', uid)
    const ids = [...stationSet]
    if (ids.length) await supabase.from('user_stations').insert(ids.map(sid => ({ user_id: uid, station_id: sid })))
  }
  // المحطة الأساسية للمشرف = أول محطة مختارة (للتوافق مع station_id)
  const primaryStation = () =>
    (form.role === 'station_admin' && stationSet.size) ? [...stationSet][0] : (form.station_id || null)

  function toggleModule(mod) {
    setForm(f => {
      const current = f.allowed_modules ?? MODULES.map(m => m.value)
      const next = current.includes(mod)
        ? current.filter(m => m !== mod)
        : [...current, mod]
      // If all selected → null (means all)
      return { ...f, allowed_modules: next.length === MODULES.length ? null : next }
    })
  }

  const selectedMods = form.allowed_modules ?? MODULES.map(m => m.value)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (!user) {
        if (!form.password) throw new Error(isAr ? 'كلمة المرور مطلوبة' : 'Password is required')
        if (form.password.length < 6) throw new Error(isAr ? 'كلمة المرور 6 أحرف على الأقل' : 'Password must be at least 6 characters')

        const tempClient = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY,
          { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'nwbus_temp_' + Date.now() } }
        )
        const email = `${form.username.toLowerCase()}@nwbus.sa`
        const { data: authData, error: authErr } = await tempClient.auth.signUp({ email, password: form.password })
        if (authErr) throw authErr
        const authId = authData?.user?.id
        if (!authId) throw new Error(isAr ? 'فشل إنشاء حساب المصادقة — تأكد من تعطيل Email Confirmation في Supabase' : 'Auth account creation failed — disable Email Confirmation in Supabase')

        const { data: inserted, error: insertErr } = await supabase.from('users').insert({
          username:     form.username.toLowerCase(),
          full_name_ar: form.full_name_ar,
          full_name_en: form.full_name_en || null,
          role:         form.role,
          station_id:   primaryStation(),
          language:     form.language,
          is_active:    form.is_active,
          auth_id:      authId,
          created_by:   profile.id,
        }).select('id').single()
        if (insertErr) throw insertErr
        if (inserted?.id && (form.role === 'station_admin' || form.role === 'shift_supervisor' || form.role === 'area_supervisor')) await syncStations(inserted.id)

        if (inserted?.id) {
          const extras = {}
          if (form.job_number.trim())        extras.job_number      = form.job_number.trim()
          if (form.supervisor_id)            extras.supervisor_id   = form.supervisor_id
          if (form.allowed_modules !== null) extras.allowed_modules = form.allowed_modules
          if (Object.keys(extras).length) {
            const { error: extrasErr } = await supabase.from('users').update(extras).eq('id', inserted.id)
            if (extrasErr && !extrasErr.message?.includes('column') && !extrasErr.message?.includes('does not exist')) throw extrasErr
          }
          // حفظ كلمة المرور للأدمن — صامت إن لم يكن العمود موجوداً بعد
          await supabase.from('users').update({ login_password: form.password }).eq('id', inserted.id)

          const { error: nErr } = await supabase.from('users').update({
            phone: form.phone.trim() || null,
            national_id: form.national_id.trim() || null,
            job_title: form.job_title || null,
            hire_date: form.hire_date || null,
            ...(isGeneralAdmin ? { is_accountant: !!form.is_accountant, is_agent: !!form.is_agent } : {}),
          }).eq('id', inserted.id)
          if (nErr && !nErr.message?.includes('column') && !nErr.message?.includes('does not exist')) throw nErr
        }

        // نجح الحفظ — امسح المسودة واعرض بطاقة بيانات الدخول
        clearNewUserDraft()
        setCredential({ username: form.username.toLowerCase(), password: form.password, nameAr: form.full_name_ar, jobNumber: form.job_number, phone: form.phone, hireDate: form.hire_date, stationName: stations.find(s => s.id === form.station_id)?.name_ar ?? '' })
        await onSaved()

      } else {
        const { error: updErr } = await supabase.rpc('admin_update_user', {
          p_id:              user.id,
          p_full_name_ar:    form.full_name_ar,
          p_full_name_en:    form.full_name_en || null,
          p_role:            form.role,
          p_station_id:      primaryStation(),
          p_language:        form.language,
          p_is_active:       form.is_active,
          p_supervisor_id:   form.supervisor_id || null,
          p_allowed_modules: form.allowed_modules ?? null,
          p_job_number:      form.job_number.trim() || null,
          p_phone:           form.phone.trim() || null,
          p_national_id:     form.national_id.trim() || null,
          p_job_title:       form.job_title || null,
          p_hire_date:       form.hire_date || null,
          p_is_accountant:   isGeneralAdmin ? !!form.is_accountant : false,
          p_is_agent:        !!form.is_agent,
        })
        if (updErr) throw updErr
        if (form.role === 'station_admin' || form.role === 'shift_supervisor' || form.role === 'area_supervisor') await syncStations(user.id)

        await onSaved()
        onClose()
      }
    } catch (err) {
      const msg = err.message ?? ''
      if (msg.includes('users_username_key') || (msg.includes('duplicate key') && msg.includes('username'))) {
        setError(isAr ? 'اسم المستخدم مستخدم بالفعل — اختر اسماً آخر' : 'Username already exists — choose a different one')
      } else if (msg.includes('duplicate key')) {
        setError(isAr ? 'البيانات مكررة — تحقق من المدخلات' : 'Duplicate entry — check your inputs')
      } else if (msg.includes('User already registered') || msg.includes('already been registered')) {
        setError(isAr ? 'هذا الحساب موجود مسبقاً في نظام المصادقة' : 'This account already exists in the auth system')
      } else {
        setError(msg)
      }
    }
    setSaving(false)
  }

  async function handlePasswordReset(e) {
    e.preventDefault()
    if (!newPwd || newPwd.length < 6) { setPwdMsg(isAr ? '⚠ كلمة المرور 6 أحرف على الأقل' : '⚠ Min 6 chars'); return }
    setPwdSaving(true)
    setPwdMsg('')
    try {
      await resetPasswordViaEdge(user.auth_id, newPwd)
      setPwdMsg(isAr ? '✓ تم تغيير كلمة المرور' : '✓ Password updated')
      setCredential({ username: user.username, password: newPwd, nameAr: user.full_name_ar, jobNumber: user.job_number, phone: user.phone, hireDate: user.hire_date, stationName: stations.find(s => s.id === user.station_id)?.name_ar ?? '' })
      setNewPwd('')
    } catch (err) {
      setPwdMsg('⚠ ' + err.message)
    }
    setPwdSaving(false)
  }

  const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"

  return (
    <>
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between"
          style={{ background: '#1C2B36' }}>
          <h2 className="font-bold text-white text-base">
            {user ? (isAr ? 'تعديل موظف' : 'Edit Staff') : (isAr ? 'موظف جديد' : 'New Staff')}
          </h2>
          <button onClick={closeAndClearDraft} className="text-white/50 hover:text-white text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">

          {/* رقم الوظيفي */}
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
            <label className="block text-xs font-bold text-amber-800 mb-1.5">
              {isAr ? 'الرقم الوظيفي' : 'Employee Number'}
            </label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white font-mono"
              value={form.job_number}
              onChange={e => handleJobNumberChange(e.target.value)}
              placeholder={isAr ? 'مثال: 1030986' : 'e.g. 1030986'}
            />
            {!user && form.job_number && (
              <p className="text-xs text-amber-700 mt-1 font-mono font-bold">
                {buildUsername(form.job_number)}
              </p>
            )}
          </div>

          {/* Username + Password — new user only */}
          {!user && (
            <div className="bg-blue-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                {isAr ? 'بيانات الدخول' : 'Login Credentials'}
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'اسم المستخدم *' : 'Username *'}</label>
                <input required className={inputCls + ' font-mono font-bold uppercase'} value={form.username}
                  onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
                  placeholder="NW1030986" />
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{form.username}@nwbus.sa</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'كلمة المرور *' : 'Password *'}</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required minLength={6}
                    className={inputCls + ' pe-10 font-mono'}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder={isAr ? 'تولّد تلقائياً من الاسم والرقم' : 'Auto-generated from name + number'}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute inset-y-0 end-0 px-3 flex items-center text-gray-400 hover:text-gray-700">
                    {showPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-blue-500 mt-0.5">
                  {isAr ? 'تولّد تلقائياً — يمكن تعديلها' : 'Auto-generated — editable'}
                </p>
              </div>
            </div>
          )}

          {/* بيانات الدخول + تغيير كلمة المرور — للأدمن عند التعديل */}
          {user && isGeneralAdmin && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  {isAr ? 'بيانات الدخول' : 'Login Info'}
                </p>
                {user.login_password && (
                  <button type="button"
                    onClick={() => setCredential({ username: user.username, password: user.login_password, nameAr: user.full_name_ar, jobNumber: user.job_number, phone: user.phone, hireDate: user.hire_date, stationName: stations.find(s => s.id === user.station_id)?.name_ar ?? '' })}
                    className="text-xs text-nwbus-primary underline">
                    {isAr ? 'عرض البطاقة' : 'Show Card'}
                  </button>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">{isAr ? 'اسم المستخدم' : 'Username'}</p>
                <p className="font-mono text-sm text-nwbus-primary font-bold">{user.username}</p>
              </div>
              {/* تغيير كلمة المرور */}
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-gray-600">{isAr ? 'تغيير كلمة المرور' : 'Reset Password'}</p>
                <div className="relative">
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    minLength={6}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none font-mono pe-10"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    placeholder={isAr ? 'كلمة مرور جديدة...' : 'New password...'}
                  />
                  <button type="button" onClick={() => setShowNewPwd(v => !v)}
                    className="absolute inset-y-0 end-0 px-3 flex items-center text-gray-400 hover:text-gray-600">
                    {showNewPwd
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
                {pwdMsg && <p className={`text-xs ${pwdMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{pwdMsg}</p>}
                <button type="button" onClick={handlePasswordReset} disabled={pwdSaving || !newPwd}
                  className="w-full bg-amber-500 text-white py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-amber-600 transition-colors">
                  {pwdSaving ? '...' : (isAr ? 'تغيير كلمة المرور' : 'Update Password')}
                </button>
              </div>
            </div>
          )}

          {/* Names */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'}</label>
              <input required className={inputCls} value={form.full_name_ar}
                onChange={e => set('full_name_ar', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
              <input className={inputCls} value={form.full_name_en}
                onChange={e => handleNameEnChange(e.target.value)} />
            </div>
          </div>

          {/* Phone + Job title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'رقم الجوال' : 'Mobile'}</label>
              <input className={inputCls} value={form.phone} inputMode="numeric" dir="ltr"
                onChange={e => set('phone', toLatinDigits(e.target.value))}
                placeholder="05xxxxxxxx" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'المسمى الوظيفي' : 'Job Title'}</label>
              <select className={inputCls} value={form.job_title} onChange={e => set('job_title', e.target.value)}>
                <option value="">{isAr ? '— اختر —' : '— Select —'}</option>
                {JOB_TITLES.map(j => <option key={j.value} value={j.value}>{isAr ? j.ar : j.en}</option>)}
              </select>
            </div>
          </div>

          {/* رقم الهوية */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'رقم الهوية / الإقامة' : 'National / Iqama ID'}</label>
            <input className={inputCls + ' font-mono'} value={form.national_id} inputMode="numeric" dir="ltr"
              onChange={e => handleNationalIdChange(e.target.value)}
              placeholder="1xxxxxxxxx" />
            {!user && form.full_name_en && form.national_id && (
              <p className="text-xs text-green-600 mt-0.5 font-mono">
                {buildPassword(form.full_name_en, form.national_id)}
              </p>
            )}
          </div>

          {/* Role + Language */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'الصلاحية *' : 'Role *'}</label>
              <select required className={inputCls} value={form.role} onChange={e => set('role', e.target.value)}>
                {allowedRoles.map(r => (
                  <option key={r.value} value={r.value}>{isAr ? r.ar : r.en}</option>
                ))}
              </select>
              {isGeneralAdmin && form.role !== 'accountant' && form.role !== 'general_admin' && (
                <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded accent-nwbus-primary"
                    checked={form.is_accountant} onChange={e => set('is_accountant', e.target.checked)} />
                  {isAr ? 'صلاحيات محاسب أيضاً (بنفس الوقت)' : 'Also grant accountant access'}
                </label>
              )}
              {isGeneralAdmin && (
                <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded accent-nwbus-primary"
                    checked={form.is_agent} onChange={e => set('is_agent', e.target.checked)} />
                  {isAr ? 'حساب وكيل (لا يظهر في التقييم والإجازات)' : 'Agent account (hidden from evaluations & leaves)'}
                </label>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'اللغة' : 'Language'}</label>
              <select className={inputCls} value={form.language} onChange={e => set('language', e.target.value)}>
                <option value="ar">عربي</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* Station — single (لغير المشرف) */}
          {!(isGeneralAdmin && (form.role === 'station_admin' || form.role === 'area_supervisor')) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'المحطة' : 'Station'}</label>
              <select className={inputCls} value={form.station_id} onChange={e => set('station_id', e.target.value)}
                disabled={isStationAdmin}>
                <option value="">{isAr ? '— بدون محطة —' : '— No Station —'}</option>
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{isAr ? s.name_ar : s.name_en}</option>
                ))}
              </select>
            </div>
          )}

          {/* Multi-station — for supervisor (station_admin) or area_supervisor, admin assigns */}
          {isGeneralAdmin && (form.role === 'station_admin' || form.role === 'area_supervisor') && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">
                  {isAr ? 'محطات المشرف (يمكن اختيار أكثر من محطة)' : 'Supervisor Stations (multiple allowed)'}
                </label>
                {stationSet.size > 0 && (
                  <button type="button" onClick={() => setStationSet(new Set())}
                    className="text-[11px] text-red-400 hover:text-red-600">
                    {isAr ? 'مسح الكل' : 'Clear all'}
                  </button>
                )}
              </div>
              {/* Search inside station list */}
              <input
                type="text"
                value={stationSearch}
                onChange={e => setStationSearch(e.target.value)}
                placeholder={isAr ? 'بحث عن محطة...' : 'Search station...'}
                className="w-full border rounded-lg px-3 py-1.5 text-xs mb-1.5 focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
              />
              <div className="border rounded-lg p-2 max-h-48 overflow-y-auto grid grid-cols-2 gap-1">
                {stations
                  .filter(s => {
                    const q = stationSearch.toLowerCase()
                    return !q || (s.name_ar ?? '').toLowerCase().includes(q) || (s.name_en ?? '').toLowerCase().includes(q)
                  })
                  .map(s => {
                    const on = stationSet.has(s.id)
                    return (
                      <button type="button" key={s.id} onClick={() => toggleStation(s.id)}
                        className={`flex items-center gap-2 text-right rounded px-2 py-1.5 text-sm transition
                          ${on ? 'bg-blue-50 text-nwbus-primary font-medium' : 'hover:bg-gray-50 text-gray-600'}`}>
                        <span className={`w-4 h-4 rounded grid place-items-center text-[10px] border shrink-0
                          ${on ? 'bg-nwbus-primary border-nwbus-primary text-white' : 'border-gray-300'}`}>
                          {on && '✓'}
                        </span>
                        <span className="truncate">{isAr ? s.name_ar : s.name_en}</span>
                      </button>
                    )
                  })}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? `المختارة: ${stationSet.size}` : `Selected: ${stationSet.size}`}
                {stationSearch && ` — ${isAr ? 'تصفية نشطة' : 'filtered'}`}
              </p>
            </div>
          )}

          {/* Supervisor — for all roles except general_admin */}
          {form.role !== 'general_admin' && supervisors.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isAr ? 'المسؤول المباشر' : 'Direct Supervisor'}
              </label>
              <select className={inputCls} value={form.supervisor_id} onChange={e => set('supervisor_id', e.target.value)}>
                <option value="">{isAr ? '— بدون مشرف —' : '— No Supervisor —'}</option>
                {supervisors.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name_ar}</option>
                ))}
              </select>
            </div>
          )}

          {/* تاريخ المباشرة */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isAr ? 'تاريخ المباشرة' : 'Hire Date'}
            </label>
            <DatePicker
              value={form.hire_date}
              onChange={v => set('hire_date', v)}
              className={inputCls}
              isAr={isAr}
              placeholder={isAr ? 'اختر تاريخ المباشرة' : 'Select hire date'}
            />
          </div>

          {/* Module Permissions */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                {isAr ? 'الأقسام المتاحة' : 'Allowed Sections'}
              </p>
              <button type="button" onClick={() => set('allowed_modules', null)}
                className="text-xs text-nwbus-primary underline">
                {isAr ? 'الكل' : 'All'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-52 overflow-y-auto pr-1">
              {MODULES.map(m => (
                <label key={m.value} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-white transition-colors">
                  <input type="checkbox" className="rounded accent-nwbus-primary"
                    checked={selectedMods.includes(m.value)}
                    onChange={() => toggleModule(m.value)} />
                  <span className="text-gray-700">{isAr ? m.ar : m.en}</span>
                </label>
              ))}
            </div>
            {form.allowed_modules === null && (
              <p className="text-xs text-green-600 mt-2">✓ {isAr ? 'صلاحية وصول كاملة لجميع الأقسام' : 'Full access to all sections'}</p>
            )}
          </div>

          {/* Active */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded accent-nwbus-primary"
              checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            <span className={form.is_active ? 'text-green-700 font-medium' : 'text-gray-400'}>
              {form.is_active ? (isAr ? '✓ حساب نشط' : '✓ Active Account') : (isAr ? 'حساب معطّل' : 'Disabled Account')}
            </span>
          </label>

          {error && (
            <div className="text-xs rounded-lg p-3 bg-red-50 text-red-600 border border-red-100">
              ⚠ {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-nwbus-primary text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-nwbus-dark transition-colors">
              {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
            </button>
            <button type="button" onClick={closeAndClearDraft}
              className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>

    {credential && (
      <CredentialCard
        username={credential.username}
        password={credential.password}
        nameAr={credential.nameAr}
        jobNumber={credential.jobNumber}
        phone={credential.phone}
        hireDate={credential.hireDate}
        stationName={credential.stationName}
        onClose={() => { setCredential(null); if (!user) onClose() }}
      />
    )}
    </>
  )
}

/* ─── Main Page ────────────────────────────────────────── */
export default function UsersPage() {
  const { profile, isGeneralAdmin, isStationAdmin, isAccountant, isAreaSupervisor, allowedStationIds } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const usersCacheKey = `users_all_${profile?.station_id ?? 'admin'}`
  const [users,    setUsers]    = useState(() => getCached(usersCacheKey)?.users ?? [])
  const [stations, setStations] = useState(() => getCached(usersCacheKey)?.stations ?? [])
  const [loading,  setLoading]  = useState(() => !getCached(usersCacheKey))
  const [modal,    setModal]    = useState(null)
  const [search,       setSearch]       = useState('')
  const [roleFilter,   setRoleFilter]   = useState('')
  const [stationFilter, setStationFilter] = useState('')
  const [statusFilter,  setStatusFilter]  = useState('')   // '' | 'active' | 'inactive'
  const [jobFilter,     setJobFilter]     = useState('')
  const [cardUser, setCardUser] = useState(null)
  const [confirmDlg, setConfirmDlg] = useState(null) // { message, onConfirm, onCancel? }

  const fetchAll = useCallback(async (bust = false) => {
    const cacheKey = `users_all_${profile?.station_id ?? 'admin'}`
    if (bust) clearCached(cacheKey)
    const cached = getCached(cacheKey)
    if (cached) { setUsers(cached.users); setStations(cached.stations); setLoading(false) } else { setLoading(true) }
    let usersQuery = supabase
      .from('users')
      .select('*, station:station_id(name_ar, name_en)')
      .order('created_at', { ascending: false })

    // Station admin only sees users of their station; area supervisor sees their assigned stations
    if (isAreaSupervisor && allowedStationIds?.length) {
      usersQuery = usersQuery.in('station_id', allowedStationIds)
    } else if (isStationAdmin && !isGeneralAdmin) {
      usersQuery = usersQuery.eq('station_id', profile.station_id)
    }

    const [{ data: u }, { data: s }] = await Promise.all([
      usersQuery,
      supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_ar'),
    ])
    const filteredStations = (s ?? []).filter(st => !isRestStation(st))
    if (u) {
      setCached(cacheKey, { users: u, stations: filteredStations })
      setUsers(u)
      setStations(filteredStations)
    }
    setLoading(false)
  }, [isGeneralAdmin, isStationAdmin, isAreaSupervisor, allowedStationIds, profile?.station_id])

  useEffect(() => { fetchAll() }, [fetchAll])

  // حذف الحساب — للأدمن، وللمشرف ضمن محطته فقط
  async function deleteUser(u) {
    const canDelete = isGeneralAdmin || (isStationAdmin && u.station_id === profile?.station_id && u.id !== profile?.id)
    if (!canDelete) return
    setConfirmDlg({
      message: isAr ? `حذف حساب «${u.full_name_ar}» نهائياً؟` : `Delete «${u.full_name_ar}» permanently?`,
      onConfirm: () => { setConfirmDlg(null); doDelete(u) },
      onCancel:  () => setConfirmDlg(null),
    })
  }

  async function doDelete(u) {
    const { data, error } = await supabase.from('users').delete().eq('id', u.id).select('id')
    if (error) {
      const fk = /foreign key|violates|referenced/i.test(error.message)
      if (fk) {
        setConfirmDlg({
          message: isAr ? 'الحساب مرتبط بسجلات ولا يمكن حذفه نهائياً. هل تريد تعطيله بدلاً من ذلك؟' : 'Account has linked records. Deactivate instead?',
          confirmLabel: isAr ? 'تعطيل' : 'Deactivate',
          onConfirm: async () => {
            setConfirmDlg(null)
            const { error: e2 } = await supabase.from('users').update({ is_active: false }).eq('id', u.id)
            if (e2) { alert((isAr ? 'فشل التعطيل: ' : 'Failed: ') + e2.message); return }
            fetchAll()
          },
          onCancel: () => setConfirmDlg(null),
        })
        return
      }
      alert((isAr ? 'فشل الحذف: ' : 'Delete failed: ') + error.message); return
    }
    if (!data || data.length === 0) {
      alert(isAr ? 'لم يُحذف الحساب — تأكد من تفعيل صلاحية الحذف (RLS) في قاعدة البيانات.' : 'Not deleted — check delete RLS policy.')
      return
    }
    fetchAll()
  }

  const supervisors = users.filter(u => ['station_admin', 'area_supervisor', 'general_admin'].includes(u.role))

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !search ||
      (u.full_name_ar ?? '').toLowerCase().includes(q) ||
      (u.username     ?? '').toLowerCase().includes(q) ||
      (u.full_name_en ?? '').toLowerCase().includes(q) ||
      (u.job_number   ?? '').includes(q) ||
      (u.phone        ?? '').includes(q) ||
      (u.national_id  ?? '').includes(q)
    const matchRole    = !roleFilter    || u.role       === roleFilter
    const matchStation = !stationFilter || u.station_id === stationFilter
    const matchStatus  = !statusFilter  || (statusFilter === 'active' ? u.is_active : !u.is_active)
    const matchJob     = !jobFilter     || u.job_title  === jobFilter
    return matchSearch && matchRole && matchStation && matchStatus && matchJob
  })

  const activeFilters = [roleFilter, stationFilter, statusFilter, jobFilter].filter(Boolean).length

  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-nwbus-primary">{isAr ? 'إدارة الموظفين' : 'Staff Management'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isAr ? `${filtered.length} من ${users.length} موظف` : `${filtered.length} of ${users.length} staff`}
          </p>
        </div>
        <button onClick={() => setModal('new')}
          className="bg-nwbus-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-nwbus-dark transition-colors whitespace-nowrap self-start sm:self-auto">
          + {isAr ? 'جديد' : 'New'}
        </button>
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 space-y-3">
        {/* Search bar */}
        <div className="relative">
          <svg className="absolute top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none"
            style={{ [isAr ? 'right' : 'left']: '10px' }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            placeholder={isAr ? 'بحث بالاسم، المستخدم، الرقم الوظيفي، الجوال، الهوية...' : 'Search name, username, emp#, phone, ID...'}
            value={search} onChange={e => setSearch(e.target.value)}
            className={`w-full border rounded-lg py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-gray-50 ${isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
          />
          {search && (
            <button onClick={() => setSearch('')}
              className={`absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 ${isAr ? 'left-2' : 'right-2'}`}>
              ×
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex gap-2 flex-wrap">
          {/* Roles */}
          {isGeneralAdmin && (
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-xs bg-white focus:ring-2 focus:ring-nwbus-primary focus:outline-none text-gray-700"
              style={{ fontFamily: 'inherit' }}>
              <option value="">{isAr ? 'كل الصلاحيات' : 'All Roles'}</option>
              {USER_ROLES.map(r => (
                <option key={r.value} value={r.value}>
                  {isAr ? r.ar : r.en} ({users.filter(u => u.role === r.value).length})
                </option>
              ))}
            </select>
          )}

          {/* Station — للأدمن ومشرف المنطقة */}
          {(isGeneralAdmin || isAreaSupervisor) && stations.length > 1 && (
            <select value={stationFilter} onChange={e => setStationFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-xs bg-white focus:ring-2 focus:ring-nwbus-primary focus:outline-none text-gray-700"
              style={{ fontFamily: 'inherit' }}>
              <option value="">{isAr ? 'كل المحطات' : 'All Stations'}</option>
              {stations.map(s => (
                <option key={s.id} value={s.id}>{isAr ? s.name_ar : s.name_en}</option>
              ))}
            </select>
          )}

          {/* Job Title */}
          <select value={jobFilter} onChange={e => setJobFilter(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-xs bg-white focus:ring-2 focus:ring-nwbus-primary focus:outline-none text-gray-700"
            style={{ fontFamily: 'inherit' }}>
            <option value="">{isAr ? 'كل المسميات' : 'All Titles'}</option>
            {JOB_TITLES.map(j => (
              <option key={j.value} value={j.value}>{isAr ? j.ar : j.en}</option>
            ))}
          </select>

          {/* Status */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-xs bg-white focus:ring-2 focus:ring-nwbus-primary focus:outline-none text-gray-700"
            style={{ fontFamily: 'inherit' }}>
            <option value="">{isAr ? 'كل الحالات' : 'All Status'}</option>
            <option value="active">{isAr ? 'نشط فقط' : 'Active only'}</option>
            <option value="inactive">{isAr ? 'معطّل فقط' : 'Inactive only'}</option>
          </select>

          {/* Clear all */}
          {activeFilters > 0 && (
            <button onClick={() => { setRoleFilter(''); setStationFilter(''); setStatusFilter(''); setJobFilter('') }}
              className="px-3 py-1.5 rounded-lg text-xs bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors font-medium">
              {isAr ? `مسح الفلاتر (${activeFilters})` : `Clear (${activeFilters})`}
            </button>
          )}
        </div>
      </div>


      {loading ? (
        <div className="text-center py-20 text-gray-400">…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2"></p>
          <p>{isAr ? 'لا يوجد أعضاء' : 'No members found'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-nwbus-primary text-white text-xs">
              <tr>
                {[
                  isAr ? 'الرقم الوظيفي' : 'Emp. No.',
                  isAr ? 'الموظف' : 'Employee',
                  isAr ? 'المسمى الوظيفي' : 'Job Title',
                  isAr ? 'الصلاحية' : 'Role',
                  isAr ? 'المحطة' : 'Station',
                  isAr ? 'الأقسام' : 'Modules',
                  isAr ? 'الحالة' : 'Status',
                  '',
                ].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-right font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${!u.is_active ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-nwbus-primary">
                    {u.job_number || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{u.full_name_ar}
                      {u.is_accountant && <span className="ms-1 text-[10px] bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5">+ محاسب</span>}
                    </p>
                    {(isGeneralAdmin || isAccountant) && u.phone && (
                      <p className="text-xs text-gray-500 font-mono" dir="ltr">{u.phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {u.job_title ? (JOB_TITLES.find(j => j.value === u.job_title)?.[isAr ? 'ar' : 'en'] ?? u.job_title) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded-full px-2.5 py-0.5 border font-semibold ${ROLE_COLORS[u.role]}`}>
                      {USER_ROLES.find(r => r.value === u.role)?.[isAr ? 'ar' : 'en']}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {u.station ? (isAr ? u.station.name_ar : u.station.name_en) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {u.allowed_modules === null ? (
                      <span className="text-xs text-green-600 font-medium">جميع الأقسام</span>
                    ) : (
                      <span className="text-xs text-gray-400">{u.allowed_modules?.length ?? 0} قسم</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {u.is_active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطّل' : 'Inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => setModal(u)}
                        className="text-xs border border-nwbus-primary text-nwbus-primary rounded-lg px-3 py-1 hover:bg-nwbus-primary hover:text-white transition-colors">
                        {isAr ? 'تعديل' : 'Edit'}
                      </button>
                      {isGeneralAdmin && u.login_password && (
                        <button onClick={() => setCardUser(u)}
                          className="text-xs border border-amber-300 text-amber-600 rounded-lg px-2.5 py-1 hover:bg-amber-500 hover:text-white transition-colors"
                          title={isAr ? 'بطاقة بيانات الدخول' : 'Credential Card'}>
                          
                        </button>
                      )}
                      {(isGeneralAdmin || (isStationAdmin && u.station_id === profile?.station_id && u.id !== profile?.id)) && (
                        <button onClick={() => deleteUser(u)}
                          className="text-xs border border-red-300 text-red-500 rounded-lg px-2.5 py-1 hover:bg-red-500 hover:text-white transition-colors">
                          {isAr ? 'حذف' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <UserModal
          user={modal === 'new' ? null : modal}
          stations={stations}
          supervisors={supervisors}
          onClose={() => setModal(null)}
          onSaved={() => fetchAll(true)}
        />
      )}

      {cardUser && (
        <CredentialCard
          username={cardUser.username}
          password={cardUser.login_password}
          nameAr={cardUser.full_name_ar}
          onClose={() => setCardUser(null)}
        />
      )}

      {confirmDlg && (
        <ConfirmDialog
          message={confirmDlg.message}
          confirmLabel={confirmDlg.confirmLabel}
          onConfirm={confirmDlg.onConfirm}
          onCancel={confirmDlg.onCancel}
        />
      )}
    </div>
  )
}
