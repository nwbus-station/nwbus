import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import DatePicker from '../components/shared/DatePicker'
import { notifyMany } from '../utils/notifications'
import ConfirmDialog from '../components/shared/ConfirmDialog'

/* ─── ثوابت ─── */
const LEAVE_TYPES = [
  { id: 'annual',      ar: 'إجازة سنوية',       icon: '' },
  { id: 'unpaid',      ar: 'إجازة بدون راتب',   icon: '' },
  { id: 'sick',        ar: 'إجازة مرضية',        icon: '' },
  { id: 'marriage',    ar: 'إجازة زواج',         icon: '' },
  { id: 'paternity',   ar: 'إجازة مولود',        icon: '' },
  { id: 'bereavement', ar: 'إجازة وفاة',         icon: '' },
]

const BEREAVEMENT_RELS = [
  { id: 'spouse',  ar: 'الزوج / الزوجة',              days: 5 },
  { id: 'parent',  ar: 'الأب أو الأم أو الجد أو الجدة', days: 5 },
  { id: 'child',   ar: 'الابن أو الابنة أو الحفيد',    days: 5 },
  { id: 'sibling', ar: 'الأخ أو الأخت',                days: 3 },
]

const LEAVE_MAX = {
  annual:      null, // يحسب حسب سنوات الخدمة
  unpaid:      null,
  sick:        null,
  marriage:    5,
  paternity:   3,
  bereavement: null, // حسب القرابة
}

const STATUS_STYLE = {
  pending:  { bg: '#fef9c3', color: '#854d0e', border: '#fde68a', label: 'قيد المراجعة' },
  approved: { bg: '#dcfce7', color: '#15803d', border: '#86efac', label: 'مقبولة' },
  rejected: { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5', label: 'مرفوضة' },
}

/* ─── helpers ─── */
const todayStr = () => new Date().toISOString().slice(0, 10)

function dateDiff(from, to) {
  if (!from || !to) return 0
  const d = Math.round((new Date(to) - new Date(from)) / 86400000) + 1
  return d > 0 ? d : 0
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function yearsOfService(hireDateStr) {
  if (!hireDateStr) return 0
  return Math.floor((Date.now() - new Date(hireDateStr)) / (365.25 * 86400000))
}

function annualEntitlement(hireDateStr) {
  return yearsOfService(hireDateStr) >= 5 ? 30 : 21
}

// الأنواع التي تتطلب مرفق إثبات
const PROOF_TYPES = ['sick', 'marriage', 'paternity', 'bereavement']
const PROOF_DAYS  = 5 // مهلة رفع الإثبات بالأيام من تاريخ التبليغ (لا تنطبق على الوفاة)
const PROOF_NO_DEADLINE = ['bereavement'] // بدون مهلة زمنية

// أنواع بدون دورة موافقات — تُعتمد مباشرة (يكفي المرفق والطباعة)
const NO_APPROVAL_TYPES = ['sick', 'marriage', 'bereavement']

// رفع مرفق الإثبات إلى التخزين — يرجع الرابط العام
async function uploadProof(file, employeeId) {
  const ext  = file.name.split('.').pop()
  const path = `${employeeId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('leave-attachments').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('leave-attachments').getPublicUrl(path)
  return data.publicUrl
}

// هل ما زالت مهلة رفع الإثبات سارية؟ (الوفاة بدون مهلة)
function proofWindowOpen(createdAt, leaveType) {
  if (PROOF_NO_DEADLINE.includes(leaveType)) return true
  return (Date.now() - new Date(createdAt)) / 86400000 <= PROOF_DAYS
}

// الرصيد المتراكم تصاعدياً من تاريخ المباشرة (يزيد يومياً)
function accruedBalance(hireDateStr, entitlement) {
  if (!hireDateStr) return 0
  const daysSince = (Date.now() - new Date(hireDateStr)) / 86400000
  if (daysSince < 0) return 0
  return (entitlement / 365) * daysSince
}

const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1.5px solid var(--border)', fontSize: '0.85rem',
  fontFamily: 'inherit', color: 'var(--text-1)', background: '#fff',
  boxSizing: 'border-box', outline: 'none',
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ margin: '3px 0 0', fontSize: '0.65rem', color: 'var(--text-3)' }}>{hint}</p>}
    </div>
  )
}

function Badge({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending
  return (
    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}

/* ══════════════════════════════════════════
   طباعة الإجازة — نفس تصميم التقارير
══════════════════════════════════════════ */
function printLeave(leave, employeeName, stationName, profile, usedAnnual = 0) {
  const typeLabel  = LEAVE_TYPES.find(t => t.id === leave.leave_type)?.ar ?? leave.leave_type
  const relLabel   = BEREAVEMENT_RELS.find(r => r.id === leave.bereavement_rel)?.ar ?? ''
  const printDate  = new Date().toLocaleDateString('ar-SA-u-ca-gregory')
  const printTime  = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
  // بيانات الموظف تُقرأ من بطاقة الموظف (جدول users) — مصدر الحقيقة الوحيد
  const hireStr    = profile?.hire_date ?? null
  const entitlement = annualEntitlement(hireStr)
  const accrued     = accruedBalance(hireStr, entitlement)
  const remaining   = Math.max(0, accrued - usedAnnual)
  const isAnnual    = leave.leave_type === 'annual'
  const hireDate   = hireStr ?? '—'
  const jobNum     = profile?.job_number ?? '—'
  const phone      = profile?.phone ?? '—'
  const nationalId = profile?.national_id ?? '—'
  const jobTitle   = profile?.job_title ?? '—'

  const supLabel = leave.supervisor_status === 'approved'
    ? `✓ موافق${leave.supervisor_by ? ' — ' + leave.supervisor_by : ''}`
    : leave.supervisor_status === 'rejected' ? '✗ مرفوض' : 'بانتظار الموافقة'
  const supColor = leave.supervisor_status === 'approved' ? '#166534'
    : leave.supervisor_status === 'rejected' ? '#dc2626' : '#92400e'

  const mgrLabel = leave.manager_status === 'approved'
    ? `✓ موافق${leave.manager_by ? ' — ' + leave.manager_by : ''}`
    : leave.manager_status === 'rejected' ? '✗ مرفوض' : 'بانتظار الموافقة'
  const mgrColor = leave.manager_status === 'approved' ? '#166534'
    : leave.manager_status === 'rejected' ? '#dc2626' : '#92400e'

  const style = document.createElement('style')
  style.innerHTML = `
    @page { size: A4; margin: 8mm; }
    @media print {
      body > *:not(#__leave_print) { display: none !important; }
      #__leave_print { display: block !important; }
    }
    #__leave_print {
      display: none;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 11px; color: #000; direction: rtl;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #__leave_print .bordered { border: 1px solid #cbd5e1; border-collapse: collapse; width: 100%; }
    #__leave_print .bordered td, #__leave_print .bordered th { border: 1px solid #cbd5e1; padding: 5px 9px; font-size: 10.5px; }
    #__leave_print .lbl { color: #475569; font-size: 9.5px; white-space: nowrap; }
    #__leave_print .val { font-weight: 700; color: #0f172a; }
    #__leave_print .sec-hd { background: #1C2B36; color: #fff; padding: 4px 10px; font-weight: 700; font-size: 10.5px; margin-top: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `
  document.head.appendChild(style)

  const div = document.createElement('div')
  div.id = '__leave_print'
  div.innerHTML = `
    <!-- رأس الصفحة -->
    <div style="background:#1C2B36;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact">
      <div style="width:160px;text-align:right;font-size:10px;opacity:.8">
        <div>${stationName}</div>
        <div>${printDate}</div>
      </div>
      <div style="text-align:center;flex:1">
        <div style="font-size:17px;font-weight:900;letter-spacing:2px">NORTH WEST BUS</div>
        <div style="width:40px;height:2px;background:#38bdf8;margin:3px auto"></div>
        <div style="font-size:8px;opacity:.7">نورث وست باص</div>
      </div>
      <div style="width:160px;text-align:left">
        <div style="font-size:16px;font-weight:800">طلب إجازة</div>
        <div style="font-size:9px;opacity:.7;margin-top:2px">المحطة: ${stationName}</div>
      </div>
    </div>


    <!-- صف معلومات -->
    <table class="bordered" style="margin-bottom:6px">
      <tr>
        <td class="lbl">تاريخ الوثيقة</td><td class="val">${printDate}</td>
        <td class="lbl">رقم الموظف</td><td class="val">${jobNum}</td>
        <td class="lbl">المحطة</td><td class="val">${stationName}</td>
      </tr>
    </table>

    <!-- بيانات الإجازة -->
    <div class="sec-hd">بيانات الإجازة</div>
    <table class="bordered">
      <thead>
        <tr>
          <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">نوع الإجازة</th>
          <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">من تاريخ</th>
          <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">إلى تاريخ</th>
          <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">المدة (أيام)</th>
          <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">تاريخ المباشرة</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align:center">${typeLabel}</td>
          <td style="text-align:center">${leave.start_date}</td>
          <td style="text-align:center">${leave.end_date}</td>
          <td style="text-align:center;font-weight:900;color:#1C2B36;font-size:13px">${leave.days_count}</td>
          <td style="text-align:center">${leave.return_date ?? '—'}</td>
        </tr>
      </tbody>
    </table>

    <!-- بيانات الموظف -->
    <div class="sec-hd">بيانات الموظف</div>
    <table class="bordered">
      <tr>
        <td class="lbl">اسم الموظف</td><td class="val">${employeeName}</td>
        <td class="lbl">المحطة / الإدارة</td><td class="val">${stationName}</td>
      </tr>
      <tr>
        <td class="lbl">المسمى الوظيفي</td><td class="val">${jobTitle}</td>
        <td class="lbl">رقم الموظف</td><td class="val">${jobNum}</td>
      </tr>
      <tr>
        <td class="lbl">تاريخ المباشرة</td><td class="val">${hireDate}</td>
        <td class="lbl">رقم الجوال</td><td class="val">${phone}</td>
      </tr>
      <tr>
        <td class="lbl">رقم الهوية</td><td class="val">${nationalId}</td>
        <td class="lbl">ملاحظات</td><td class="val">${leave.notes ?? '—'}</td>
      </tr>
    </table>

    ${isAnnual ? `
    <!-- رصيد الإجازة السنوية -->
    <div class="sec-hd">رصيد الإجازة السنوية</div>
    <table class="bordered">
      <tr>
        <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">الرصيد السنوي</th>
        <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">المستخدم</th>
        <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">المتبقي الفعلي</th>
        <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">سنوات الخدمة</th>
      </tr>
      <tr>
        <td style="text-align:center;font-weight:900;font-size:15px">${accrued.toFixed(3)} يوم</td>
        <td style="text-align:center;font-weight:900;font-size:15px">${usedAnnual.toFixed(3)} يوم</td>
        <td style="text-align:center;font-weight:900;font-size:15px">${remaining.toFixed(3)} يوم</td>
        <td style="text-align:center;font-weight:700">${yearsOfService(hireStr)} سنة</td>
      </tr>
    </table>
    ` : ''}

    <!-- حالة الموافقة -->
    <div class="sec-hd">حالة الموافقة</div>
    <table class="bordered">
      <tr>
        <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px;width:33%">مقدم الطلب</th>
        <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px;width:33%">المشرف المباشر</th>
        <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px;width:33%">المدير المباشر</th>
      </tr>
      <tr>
        <td style="padding:14px 9px 6px;vertical-align:top">
          <div style="font-size:10px">${employeeName}</div>
          <div style="border-top:1px solid #cbd5e1;margin-top:22px;font-size:9px;color:#64748b">التوقيع</div>
        </td>
        <td style="padding:14px 9px 6px;vertical-align:top">
          <div style="font-size:10px;font-weight:700;color:${supColor}">${supLabel}</div>
          <div style="border-top:1px solid #cbd5e1;margin-top:22px;font-size:9px;color:#64748b">التوقيع</div>
        </td>
        <td style="padding:14px 9px 6px;vertical-align:top">
          <div style="font-size:10px;font-weight:700;color:${mgrColor}">${mgrLabel}</div>
          <div style="border-top:1px solid #cbd5e1;margin-top:22px;font-size:9px;color:#64748b">التوقيع</div>
        </td>
      </tr>
    </table>

    <!-- تذييل -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:6px;border-top:1px solid #cbd5e1;font-size:9px;color:#64748b">
      <span>طُبع بواسطة : ${employeeName}</span>
      <span style="background:#1C2B36;color:#fff;padding:2px 12px;border-radius:20px;font-size:8px;font-weight:700">NORTH WEST BUS</span>
      <span>${printDate} — ${printTime}</span>
    </div>
  `
  document.body.appendChild(div)
  try { window.print() } finally {
    document.body.removeChild(div)
    document.head.removeChild(style)
  }
}

/* ══════════════════════════════════════════
   فورم طلب إجازة جديد
══════════════════════════════════════════ */
function NewLeaveForm({ profile, onSaved }) {
  const empty = {
    leave_type: 'annual', bereavement_rel: 'spouse',
    start_date: todayStr(), end_date: todayStr(), return_date: '', notes: '',
  }
  const [form, setForm]   = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [proofFile, setProofFile] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const days        = dateDiff(form.start_date, form.end_date)
  const entitlement = annualEntitlement(profile?.hire_date)
  const maxDays     = form.leave_type === 'bereavement'
    ? (BEREAVEMENT_RELS.find(r => r.id === form.bereavement_rel)?.days ?? 5)
    : LEAVE_MAX[form.leave_type]

  // حساب تاريخ المباشرة تلقائياً
  useEffect(() => {
    if (form.end_date) set('return_date', addDays(form.end_date, 1))
  }, [form.end_date])

  // ضبط نهاية الإجازة عند اختيار نوع بحد أقصى
  useEffect(() => {
    if (maxDays && form.start_date) set('end_date', addDays(form.start_date, maxDays - 1))
  }, [form.leave_type, form.bereavement_rel, form.start_date])

  // مسح الملف المختار عند تغيير نوع الإجازة — كل إجازة بمرفقها المستقل
  useEffect(() => { setProofFile(null) }, [form.leave_type])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (days < 1) { setError('تاريخ النهاية يجب أن يكون بعد تاريخ البداية'); return }
    if (maxDays && days > maxDays) { setError(`هذه الإجازة لا تتجاوز ${maxDays} أيام`); return }

    // التحقق من عدم وجود طلب معلق
    const { data: pending } = await supabase.from('leaves')
      .select('id').eq('employee_id', profile.id).eq('status', 'pending').limit(1)
    if (pending?.length) { setError('لديك طلب إجازة قيد المراجعة — لا يمكن رفع طلب جديد حتى يتم البت في الطلب الحالي'); return }

    setSaving(true)

    // رفع مرفق الإثبات إن وُجد
    let attachmentUrl = null
    if (proofFile && PROOF_TYPES.includes(form.leave_type)) {
      try {
        attachmentUrl = await uploadProof(proofFile, profile.id)
      } catch (upErr) {
        setSaving(false)
        setError('فشل رفع المرفق: ' + upErr.message)
        return
      }
    }

    const isEmployeeRole = profile?.role === 'station_employee'
    const autoApproved   = NO_APPROVAL_TYPES.includes(form.leave_type)
    const nowIso         = new Date().toISOString()
    const { error: err } = await supabase.from('leaves').insert({
      employee_id:     profile.id,
      employee_name:   profile.full_name_ar,
      job_number:      profile.job_number ?? null,
      hire_date:       profile.hire_date ?? null,
      national_id:     profile.national_id ?? null,
      phone:           profile.phone ?? null,
      job_title:       profile.job_title ?? null,
      station_id:      profile.station_id,
      leave_type:      form.leave_type,
      bereavement_rel: form.leave_type === 'bereavement' ? form.bereavement_rel : null,
      start_date:      form.start_date,
      end_date:        form.end_date,
      return_date:     form.return_date || null,
      days_count:      days,
      notes:           form.notes || null,
      attachment_url:  attachmentUrl,
      // المرضية/الزواج/الوفاة تُعتمد مباشرة بدون موافقات
      supervisor_status: autoApproved || !isEmployeeRole ? 'approved' : 'pending',
      supervisor_by:     autoApproved || !isEmployeeRole ? (autoApproved ? 'اعتماد تلقائي' : profile.full_name_ar) : null,
      supervisor_at:     autoApproved || !isEmployeeRole ? nowIso : null,
      manager_status:    autoApproved ? 'approved' : 'pending',
      manager_by:        autoApproved ? 'اعتماد تلقائي' : null,
      manager_at:        autoApproved ? nowIso : null,
      status:            autoApproved ? 'approved' : 'pending',
    })
    setSaving(false)
    if (err) { setError(err.message); return }

    // الأنواع المعتمدة تلقائياً → إشعار للعلم فقط للمشرفين
    if (autoApproved) {
      const { data: supervisors } = await supabase.from('users')
        .select('id').in('role', ['station_admin', 'shift_supervisor'])
        .eq('station_id', profile.station_id).eq('is_active', true)
      const typeLabel = LEAVE_TYPES.find(t => t.id === form.leave_type)?.ar ?? form.leave_type
      await notifyMany((supervisors ?? []).map(s => s.id), {
        title: `${typeLabel} (معتمدة) — ${profile.full_name_ar}`,
        body: `${days} أيام · ${form.start_date} ← ${form.end_date} — للعلم`,
        type: 'info', refType: 'leave',
      })
    } else if (isEmployeeRole) {
      const { data: supervisors } = await supabase.from('users')
        .select('id').in('role', ['station_admin', 'shift_supervisor'])
        .eq('station_id', profile.station_id).eq('is_active', true)
      const typeLabel = LEAVE_TYPES.find(t => t.id === form.leave_type)?.ar ?? form.leave_type
      await notifyMany((supervisors ?? []).map(s => s.id), {
        title: `طلب إجازة جديد — ${profile.full_name_ar}`,
        body: `${typeLabel} · ${days} أيام · ${form.start_date} ← ${form.end_date}`,
        type: 'info', refType: 'leave',
      })
    } else {
      // المشرف رفع مباشرة → أشعر الأدمن
      const { data: admins } = await supabase.from('users')
        .select('id').eq('role', 'general_admin').eq('is_active', true)
      const typeLabel = LEAVE_TYPES.find(t => t.id === form.leave_type)?.ar ?? form.leave_type
      await notifyMany((admins ?? []).map(a => a.id), {
        title: `طلب إجازة بانتظار موافقتك — ${profile.full_name_ar}`,
        body: `${typeLabel} · ${days} أيام · ${form.start_date} ← ${form.end_date}`,
        type: 'warning', refType: 'leave',
      })
    }

    // تذكير الموظف برفع الإثبات إذا لم يرفقه
    if (PROOF_TYPES.includes(form.leave_type) && !attachmentUrl) {
      const typeLabel = LEAVE_TYPES.find(t => t.id === form.leave_type)?.ar ?? form.leave_type
      await notifyMany([profile.id], {
        title: `تذكير: ارفع مرفق الإثبات — ${typeLabel}`,
        body: PROOF_NO_DEADLINE.includes(form.leave_type)
          ? 'يمكنك رفع الإثبات على نفس الطلب في أي وقت'
          : `يجب رفع الإثبات على نفس الطلب خلال ${PROOF_DAYS} أيام من تاريخ التبليغ، وإلا تعتبر المهلة منتهية`,
        type: 'warning', refType: 'leave',
      })
    }

    setForm(empty)
    setProofFile(null)
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.82rem' }}>{error}</div>}

      {/* نوع الإجازة */}
      <Field label="نوع الإجازة">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {LEAVE_TYPES.map(t => (
            <button key={t.id} type="button" onClick={() => set('leave_type', t.id)}
              style={{ padding: '6px 12px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.12s', border: `1px solid ${form.leave_type === t.id ? 'var(--brand-900)' : 'var(--border)'}`, background: form.leave_type === t.id ? 'var(--brand-900)' : '#fff', color: form.leave_type === t.id ? '#fff' : 'var(--text-2)' }}>
              {t.icon} {t.ar}
            </button>
          ))}
        </div>
      </Field>

      {/* درجة القرابة للوفاة */}
      {form.leave_type === 'bereavement' && (
        <Field label="درجة القرابة">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {BEREAVEMENT_RELS.map(r => (
              <button key={r.id} type="button" onClick={() => set('bereavement_rel', r.id)}
                style={{ padding: '6px 12px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.12s', border: `1px solid ${form.bereavement_rel === r.id ? '#6b21a8' : 'var(--border)'}`, background: form.bereavement_rel === r.id ? '#6b21a8' : '#fff', color: form.bereavement_rel === r.id ? '#fff' : 'var(--text-2)' }}>
                {r.ar} <span style={{ opacity: 0.7 }}>({r.days} أيام)</span>
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* تنبيه الإجازة المرضية */}
      {form.leave_type === 'sick' && (
        <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fffbeb', border: '1px solid #fde68a', fontSize: '0.78rem', color: '#92400e' }}>
          الإجازة المرضية يجب رفعها خلال <strong>5 أيام عمل</strong> من تاريخ المرض. تأكد من رفع التبليغ أولاً.
        </div>
      )}

      {/* تنبيه إجازة مولود */}
      {form.leave_type === 'paternity' && (
        <div style={{ padding: '10px 14px', borderRadius: 9, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.78rem', color: '#1e40af' }}>
          إجازة المولود (3 أيام) يجب أخذها خلال <strong>7 أيام</strong> من تاريخ الولادة.
        </div>
      )}

      {/* الرصيد السنوي */}
      {form.leave_type === 'annual' && (
        <div style={{ padding: '10px 14px', borderRadius: 9, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.78rem', color: '#166534' }}>
          {profile?.hire_date
            ? <>سنوات الخدمة: <strong>{yearsOfService(profile.hire_date)} سنة</strong> — رصيدك السنوي: <strong>{entitlement} يوم</strong></>
            : 'لم يُحدَّد تاريخ مباشرتك — راجع المسؤول'}
        </div>
      )}

      {/* التواريخ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="من تاريخ">
          <DatePicker value={form.start_date} onChange={v => set('start_date', v)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-right" isAr={true} />
        </Field>
        <Field label="إلى تاريخ">
          <DatePicker value={form.end_date} onChange={v => set('end_date', v)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-right" isAr={true} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="عدد الأيام">
          <div style={{ ...inp, background: '#f8fafc', color: days > (maxDays ?? Infinity) ? '#dc2626' : '#1C2B36', fontWeight: 800 }}>
            {days} يوم {maxDays ? `(الحد الأقصى ${maxDays})` : ''}
          </div>
        </Field>
        <Field label="تاريخ المباشرة (العودة)">
          <DatePicker value={form.return_date} onChange={v => set('return_date', v)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-right" isAr={true} />
        </Field>
      </div>

      {PROOF_TYPES.includes(form.leave_type) && (
        <Field label="مرفق الإثبات (صورة أو PDF)"
          hint={PROOF_NO_DEADLINE.includes(form.leave_type)
            ? 'يمكن رفع الإثبات الآن أو لاحقاً على نفس الطلب'
            : `يمكن رفع الإثبات الآن أو خلال ${PROOF_DAYS} أيام كحد أقصى من تاريخ التبليغ`}>
          <input key={form.leave_type} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={e => setProofFile(e.target.files?.[0] ?? null)}
            style={{ ...inp, padding: '7px 10px', cursor: 'pointer' }} />
          {proofFile && (
            <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#15803d', fontWeight: 600 }}>
              ✓ {proofFile.name}
            </p>
          )}
        </Field>
      )}

      <Field label="ملاحظات">
        <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
          style={{ ...inp, resize: 'none' }} placeholder="أي تفاصيل إضافية..." />
      </Field>

      <button type="submit" disabled={saving}
        style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: 'var(--brand-900)', color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
        {saving ? 'جارٍ الإرسال...' : 'رفع طلب الإجازة'}
      </button>
    </form>
  )
}

/* ══════════════════════════════════════════
   بطاقة إجازة مع خطوات الموافقة
══════════════════════════════════════════ */
function LeaveCard({ leave, profile, onAction, onPrint, onProofUploaded, onDelete }) {
  const [showNotes, setShowNotes]  = useState(false)
  const [actionNotes, setActionNotes] = useState('')
  const [uploadingProof, setUploadingProof] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const proofInputRef = useRef(null)

  const role        = profile?.role
  const isAdmin     = role === 'general_admin'
  const isSupervisor = role === 'station_admin' || role === 'shift_supervisor'
  const isOwn       = leave.employee_id === profile?.id

  const typeLabel = LEAVE_TYPES.find(t => t.id === leave.leave_type)?.ar ?? leave.leave_type
  const typeIcon  = LEAVE_TYPES.find(t => t.id === leave.leave_type)?.icon ?? ''
  const relLabel  = leave.bereavement_rel ? BEREAVEMENT_RELS.find(r => r.id === leave.bereavement_rel)?.ar : null

  // هل يمكن لهذا المستخدم الموافقة/الرفض؟
  const canActSupervisor = isSupervisor && leave.supervisor_status === 'pending' && !isOwn
  const canActManager    = isAdmin && leave.manager_status === 'pending'
  const canAct           = canActSupervisor || canActManager
  const fullyApproved    = leave.status === 'approved' && leave.supervisor_status === 'approved' && leave.manager_status === 'approved'

  async function act(decision) {
    await onAction(leave.id, decision, canActSupervisor ? 'supervisor' : 'manager', actionNotes)
    setShowNotes(false)
    setActionNotes('')
  }

  // مرفق الإثبات — للأنواع المرضية/الزواج/المولود
  const needsProof   = PROOF_TYPES.includes(leave.leave_type)
  const canAddProof  = needsProof && isOwn && !leave.attachment_url && proofWindowOpen(leave.created_at, leave.leave_type)
  const hasDeadline  = !PROOF_NO_DEADLINE.includes(leave.leave_type)

  async function handleProofPick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingProof(true)
    try {
      const url = await uploadProof(file, leave.employee_id)
      const { error } = await supabase.from('leaves')
        .update({ attachment_url: url }).eq('id', leave.id)
      if (error) throw error
      onProofUploaded?.()
    } catch (err) {
      alert('فشل رفع المرفق: ' + err.message)
    }
    setUploadingProof(false)
  }

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${leave.status === 'rejected' ? '#fca5a5' : leave.status === 'approved' ? '#86efac' : 'var(--border)'}`, background: '#fff', overflow: 'hidden' }}>
      {/* رأس البطاقة */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: '1rem' }}>{typeIcon}</span>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-1)' }}>{typeLabel}</span>
            {!NO_APPROVAL_TYPES.includes(leave.leave_type) && <Badge status={leave.status} />}
          </div>
          {/* اسم الموظف (للمشرف والأدمن) */}
          {!isOwn && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 4 }}>
              {leave.employee_name}
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-2)' }}>
            <span>{leave.start_date} ← {leave.end_date}</span>
            <span style={{ fontWeight: 700, color: 'var(--brand-900)' }}>{leave.days_count} يوم</span>
            {leave.return_date && <span>مباشرة: {leave.return_date}</span>}
          </div>
          {leave.notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>{leave.notes}</div>}

          {/* مرفق الإثبات */}
          {needsProof && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {leave.attachment_url ? (
                <a href={leave.attachment_url} target="_blank" rel="noreferrer"
                  style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: 99, textDecoration: 'none' }}>
                  عرض مرفق الإثبات
                </a>
              ) : canAddProof ? (
                <>
                  <input ref={proofInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleProofPick} style={{ display: 'none' }} />
                  <button onClick={() => proofInputRef.current?.click()} disabled={uploadingProof}
                    style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', background: '#fef9c3', border: '1px solid #fde68a', padding: '3px 10px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', opacity: uploadingProof ? 0.6 : 1 }}>
                    {uploadingProof ? 'جارٍ الرفع...' : 'رفع مرفق الإثبات'}
                  </button>
                  {hasDeadline && (
                    <span style={{ fontSize: '0.65rem', color: '#92400e' }}>
                      المهلة {PROOF_DAYS} أيام من تاريخ التبليغ
                    </span>
                  )}
                </>
              ) : (
                <span style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 600 }}>
                  لا يوجد مرفق إثبات{isOwn ? ' — انتهت مهلة الرفع' : ''}
                </span>
              )}
            </div>
          )}
        </div>

        {/* أزرار الطباعة والحذف */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          {(fullyApproved || isOwn) && (
            <button onClick={() => onPrint(leave)}
              style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              طباعة
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setConfirmDelete(true)}
              style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              حذف
            </button>
          )}
        </div>
      </div>

      {/* خطوات الموافقة — لا تظهر للأنواع المعتمدة تلقائياً */}
      {!NO_APPROVAL_TYPES.includes(leave.leave_type) && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: '#fafafa', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <StepBadge label="المشرف" status={leave.supervisor_status} by={leave.supervisor_by} />
          <span style={{ color: 'var(--text-3)', fontSize: '0.8rem' }}>←</span>
          <StepBadge label="المدير" status={leave.manager_status} by={leave.manager_by} />
        </div>
      )}

      {/* أزرار الموافقة */}
      {canAct && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {showNotes && (
            <textarea
              value={actionNotes} onChange={e => setActionNotes(e.target.value)}
              placeholder="ملاحظة (اختياري)..."
              rows={2} style={{ ...inp, resize: 'none', fontSize: '0.8rem' }} />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => act('approved')}
              style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #86efac', background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              ✓ قبول
            </button>
            <button onClick={() => { setShowNotes(true); act('rejected') }}
              style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              ✕ رفض
            </button>
            <button onClick={() => setShowNotes(v => !v)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-3)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message="حذف هذه الإجازة نهائياً؟"
          onConfirm={() => { setConfirmDelete(false); onDelete?.(leave.id) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function StepBadge({ label, status, by }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>{label}:</span>
      <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
        {s.label}{by ? ` — ${by}` : ''}
      </span>
    </div>
  )
}

/* ══════════════════════════════════════════
   الصفحة الرئيسية
══════════════════════════════════════════ */
const TABS_CFG = [
  { id: 'new',     ar: 'طلب إجازة', icon: '' },
  { id: 'mine',    ar: 'طلباتي',    icon: '' },
  { id: 'pending', ar: 'بانتظار موافقتي', icon: '', supervisorOnly: true },
  { id: 'all',     ar: 'جميع الطلبات',   icon: '',  supervisorOnly: true },
]

export default function LeavePage() {
  const { profile } = useAuth()
  const role        = profile?.role
  const isAdmin     = role === 'general_admin'
  const isSupervisor = role === 'station_admin' || role === 'shift_supervisor'
  const canSupervise = isAdmin || isSupervisor

  const [searchParams] = useSearchParams()
  const [tab, setTab]       = useState(() => searchParams.get('tab') || 'new')
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')

  const visibleTabs = TABS_CFG.filter(t => {
    if (t.adminOnly && !isAdmin) return false
    if (t.supervisorOnly && !canSupervise) return false
    return true
  })

  async function load() {
    setLoading(true)
    let q = supabase.from('leaves').select('*').order('created_at', { ascending: false })
    if (tab === 'mine')    q = q.eq('employee_id', profile.id)
    if (tab === 'pending') {
      if (isSupervisor && !isAdmin) q = q.eq('supervisor_status', 'pending').eq('station_id', profile.station_id)
      if (isAdmin) q = q.eq('status', 'pending')
    }
    if (tab === 'all' && !isAdmin) q = q.eq('station_id', profile.station_id)
    const { data } = await q
    setLeaves(data ?? [])
    setLoading(false)
  }

  useEffect(() => { if (tab !== 'new') load() }, [tab])

  async function handleAction(id, decision, level, notes) {
    const now  = new Date().toISOString()
    const name = profile.full_name_ar
    const patch = level === 'supervisor'
      ? { supervisor_status: decision, supervisor_by: name, supervisor_at: now, supervisor_notes: notes || null }
      : { manager_status: decision, manager_by: name, manager_at: now, manager_notes: notes || null }

    if (decision === 'rejected') patch.status = 'rejected'
    if (level === 'manager' && decision === 'approved') patch.status = 'approved'

    await supabase.from('leaves').update(patch).eq('id', id)

    // إشعارات
    const leave = leaves.find(l => l.id === id)
    if (leave) {
      const typeLabel = LEAVE_TYPES.find(t => t.id === leave.leave_type)?.ar ?? leave.leave_type
      const isApproved = decision === 'approved'

      if (level === 'supervisor') {
        // أشعر الموظف
        await notifyMany([leave.employee_id], {
          title: isApproved ? `✓ وافق المشرف على إجازتك` : `✗ رفض المشرف إجازتك`,
          body: `${typeLabel} · ${leave.days_count} أيام${notes ? ' · ' + notes : ''}`,
          type: isApproved ? 'success' : 'error', refType: 'leave', refId: id,
        })
        // إذا وافق → أشعر الأدمن
        if (isApproved) {
          const { data: admins } = await supabase.from('users').select('id').eq('role', 'general_admin').eq('is_active', true)
          await notifyMany((admins ?? []).map(a => a.id), {
            title: `طلب إجازة بانتظار موافقتك — ${leave.employee_name}`,
            body: `${typeLabel} · ${leave.days_count} أيام · وافق عليها المشرف`,
            type: 'warning', refType: 'leave', refId: id,
          })
        }
      } else {
        // مدير يوافق/يرفض → أشعر الموظف
        await notifyMany([leave.employee_id], {
          title: isApproved ? `✓ تمت الموافقة على إجازتك` : `✗ رفض المدير إجازتك`,
          body: `${typeLabel} · ${leave.days_count} أيام${notes ? ' · ' + notes : ''}`,
          type: isApproved ? 'success' : 'error', refType: 'leave', refId: id,
        })
      }
    }

    load()
  }

  async function handleDelete(id) {
    await supabase.from('leaves').delete().eq('id', id)
    load()
  }

  async function handlePrint(leave) {
    const thisYear = new Date().getFullYear()
    const usedAnnual = leaves
      .filter(l => l.employee_id === leave.employee_id
        && l.leave_type === 'annual'
        && l.status === 'approved'
        && new Date(l.start_date).getFullYear() === thisYear)
      .reduce((sum, l) => sum + (l.days_count ?? 0), 0)

    // جلب بيانات الموظف الكاملة من DB
    const { data: emp } = await supabase
      .from('users')
      .select('*, station:station_id(name_ar)')
      .eq('id', leave.employee_id)
      .single()

    // اشتق رقم الوظيفي من اسم المستخدم إذا لم يكن محفوظاً
    if (emp && !emp.job_number && emp.username) {
      emp.job_number = emp.username.toUpperCase().startsWith('NW')
        ? emp.username.slice(2)
        : emp.username
    }
    const empProfile = emp ?? profile
    const stationName = emp?.station?.name_ar ?? profile?.station?.name_ar ?? ''
    printLeave(leave, emp?.full_name_ar ?? leave.employee_name, stationName, empProfile, usedAnnual)
  }

  const filtered = leaves.filter(l => filterStatus === 'all' || l.status === filterStatus)

  return (
    <div style={{ minHeight: 'calc(100vh - 58px)', background: 'var(--surface)' }} dir="rtl">

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '0 20px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.88rem', fontWeight: tab === t.id ? 800 : 500, fontFamily: 'inherit', color: tab === t.id ? 'var(--brand-900)' : 'var(--text-3)', borderBottom: `2.5px solid ${tab === t.id ? 'var(--brand-900)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.icon} {t.ar}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px' }}>

        {/* طلب جديد */}
        {tab === 'new' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 8 }}>
              
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>طلب إجازة جديد</span>
              <span style={{ marginRight: 'auto', fontSize: '0.72rem', color: 'var(--text-3)' }}>{profile?.full_name_ar}</span>
            </div>
            <div style={{ padding: 20 }}>
              {saved && (
                <div style={{ marginBottom: 14, padding: '11px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontWeight: 700, fontSize: '0.88rem' }}>
                  ✓ تم رفع طلب الإجازة بنجاح — بانتظار الموافقة
                </div>
              )}
              <NewLeaveForm profile={profile} onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 3000) }} />
            </div>
          </div>
        )}

        {/* قائمة الطلبات */}
        {tab !== 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* فلتر الحالة */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['all','الكل'],['pending','قيد المراجعة'],['approved','مقبولة'],['rejected','مرفوضة']].map(([v, l]) => (
                <button key={v} onClick={() => setFilterStatus(v)}
                  style={{ padding: '5px 14px', borderRadius: 99, border: `1px solid ${filterStatus === v ? 'var(--brand-900)' : 'var(--border)'}`, background: filterStatus === v ? 'var(--brand-900)' : '#fff', color: filterStatus === v ? '#fff' : 'var(--text-3)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {l}
                </button>
              ))}
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>جارٍ التحميل...</p>
            ) : filtered.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>لا توجد طلبات</p>
            ) : filtered.map(l => (
              <LeaveCard key={l.id} leave={l} profile={profile} onAction={handleAction} onPrint={handlePrint} onProofUploaded={load} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
