import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getCached, setCached, clearCached } from '../lib/pageCache'
import DatePicker from '../components/shared/DatePicker'
import { notifyMany } from '../utils/notifications'
import ConfirmDialog from '../components/shared/ConfirmDialog'

/* ─── ثوابت ─── */
const LEAVE_TYPES = [
  { id: 'annual',        ar: 'إجازة سنوية',       icon: '' },
  { id: 'unpaid',        ar: 'إجازة بدون راتب',   icon: '' },
  { id: 'sick',          ar: 'إجازة مرضية',        icon: '' },
  { id: 'marriage',      ar: 'إجازة زواج',         icon: '' },
  { id: 'paternity',     ar: 'إجازة مولود',        icon: '' },
  { id: 'bereavement',   ar: 'إجازة وفاة',         icon: '' },
  { id: 'casual',        ar: 'استئذان خروج',        icon: '' },
  { id: 'compensatory',  ar: 'إجازة تعويضية',      icon: '' },
]

const COMPENSATORY_REASONS = [
  { id: 'before_rest',  ar: 'راحة أسبوعية' },
  { id: 'eid_fitr',     ar: 'عيد الفطر' },
  { id: 'eid_adha',     ar: 'عيد الأضحى' },
  { id: 'national_day', ar: 'اليوم الوطني' },
  { id: 'founding_day', ar: 'يوم التأسيس' },
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
  pending:  { bg: '#fef9c3', color: '#854d0e', border: '#fde68a', ar: 'قيد المراجعة', en: 'Pending' },
  approved: { bg: '#dcfce7', color: '#15803d', border: '#86efac', ar: 'مقبولة',        en: 'Approved' },
  rejected: { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5', ar: 'مرفوضة',        en: 'Rejected' },
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

// حساب الفرق بالساعات بين تاريخين ووقتين
function timeDiffHours(dateFrom, timeFrom, dateTo, timeTo) {
  if (!dateFrom || !timeFrom || !dateTo || !timeTo) return 0
  const from = new Date(`${dateFrom}T${timeFrom}:00`)
  const to   = new Date(`${dateTo}T${timeTo}:00`)
  const diff = (to - from) / 3600000
  return diff > 0 ? diff : 0
}

function formatHoursAr(totalHours) {
  const h = Math.floor(totalHours)
  const m = Math.round((totalHours - h) * 60)
  const hStr = h > 0 ? `${h.toLocaleString('ar-EG')} ساعة` : ''
  const mStr = m > 0 ? `${m.toLocaleString('ar-EG')} دقيقة` : ''
  if (hStr && mStr) return `${hStr} و${mStr}`
  return hStr || mStr || 'صفر'
}

// ترميز/فك ترميز الأوقات وسبب التعويض في حقل notes
function encodeLeaveNotes({ timeFrom, timeTo, compReason, userNotes, leaveType }) {
  const parts = []
  if (leaveType === 'casual' && timeFrom && timeTo) parts.push(`[TF:${timeFrom}][TT:${timeTo}]`)
  if (leaveType === 'compensatory' && compReason) parts.push(`[CR:${compReason}]`)
  if (userNotes) parts.push(userNotes)
  return parts.join(' ').trim() || null
}

function decodeLeaveNotes(leave) {
  const notes = leave.notes ?? ''
  const tfMatch = notes.match(/\[TF:(\d{2}:\d{2})\]/)
  const ttMatch = notes.match(/\[TT:(\d{2}:\d{2})\]/)
  const crMatch = notes.match(/\[CR:([^\]]+)\]/)
  const cleanNotes = notes.replace(/\[TF:[^\]]+\]|\[TT:[^\]]+\]|\[CR:[^\]]+\]/g, '').trim()
  return {
    ...leave,
    time_from:           tfMatch ? tfMatch[1] : (leave.time_from ?? null),
    time_to:             ttMatch ? ttMatch[1] : (leave.time_to ?? null),
    compensatory_reason: crMatch ? crMatch[1]  : (leave.compensatory_reason ?? null),
    notes:               cleanNotes || null,
  }
}

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

function Badge({ status, isAr = true }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending
  return (
    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {isAr ? s.ar : s.en}
    </span>
  )
}

/* ══════════════════════════════════════════
   طباعة الإجازة — نفس تصميم التقارير
══════════════════════════════════════════ */
function printLeave(rawLeave, employeeName, stationName, profile, usedAnnual = 0) {
  const leave = decodeLeaveNotes(rawLeave)
  const typeLabel   = LEAVE_TYPES.find(t => t.id === leave.leave_type)?.ar ?? leave.leave_type
  const relLabel    = BEREAVEMENT_RELS.find(r => r.id === leave.bereavement_rel)?.ar ?? ''
  const compLabel   = leave.compensatory_reason ? (COMPENSATORY_REASONS.find(r => r.id === leave.compensatory_reason)?.ar ?? '') : ''
  const isCasual    = leave.leave_type === 'casual'
  const durationStr = isCasual ? formatHoursAr((leave.days_count ?? 0) * 24) : `${leave.days_count} يوم`
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
          <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">المدة</th>
          <th style="background:#1e3a5f;color:#fff;text-align:center;font-size:10px">تاريخ المباشرة</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align:center">${typeLabel}${compLabel ? '<br><span style="font-size:9px;color:#0f766e">' + compLabel + '</span>' : ''}</td>
          <td style="text-align:center">${leave.start_date}${leave.time_from ? '<br><span style="font-size:9px">' + leave.time_from + '</span>' : ''}</td>
          <td style="text-align:center">${leave.end_date}${leave.time_to ? '<br><span style="font-size:9px">' + leave.time_to + '</span>' : ''}</td>
          <td style="text-align:center;font-weight:900;color:#1C2B36;font-size:${isCasual ? '11' : '13'}px">${durationStr}</td>
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
function NewLeaveForm({ profile, onSaved, isAr = true }) {
  const empty = {
    leave_type: 'annual', bereavement_rel: 'spouse',
    start_date: todayStr(), end_date: todayStr(), return_date: '', notes: '',
  }
  const [form, setForm]   = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [proofFile, setProofFile] = useState(null)
  const [timeFrom, setTimeFrom] = useState('08:00')
  const [timeTo, setTimeTo]     = useState('17:00')
  const [compReason, setCompReason] = useState('before_rest')
  const [bypassDeadline, setBypassDeadline] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const isAdmin = profile?.role === 'general_admin'

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

  const casualHours = form.leave_type === 'casual'
    ? timeDiffHours(form.start_date, timeFrom, form.end_date, timeTo)
    : 0

  async function handleSubmit(e) {
    e?.preventDefault()
    setError('')
    if (form.leave_type !== 'casual' && days < 1) { setError('تاريخ النهاية يجب أن يكون بعد تاريخ البداية'); return }
    if (form.leave_type === 'casual' && casualHours <= 0) { setError('وقت الانتهاء يجب أن يكون بعد وقت البداية'); return }
    if (form.leave_type === 'casual' && !form.notes?.trim()) { setError('سبب الإجازة إلزامي'); return }
    if (maxDays && days > maxDays) { setError(`هذه الإجازة لا تتجاوز ${maxDays} أيام`); return }

    // التحقق من مواعيد التقديم حسب السياسة (الأدمن يمكنه تجاوزها)
    if (form.start_date && !bypassDeadline) {
      const today = new Date(); today.setHours(0,0,0,0)
      const startD = new Date(form.start_date); startD.setHours(0,0,0,0)
      const daysUntilStart = Math.round((startD - today) / 86400000)

      if (form.leave_type === 'compensatory' && daysUntilStart < 2) {
        setError('الإجازة التعويضية يجب تقديمها قبل الإجازة بيومين على الأقل'); return
      }
      if (form.leave_type === 'annual' && daysUntilStart < 10) {
        setError('الإجازة السنوية يجب تقديمها قبل الإجازة بـ 10 أيام على الأقل'); return
      }
    }

    // الإجازة السنوية: فترتان فقط في السنة (الأدمن يمكنه تجاوزها)
    if (form.leave_type === 'annual' && !bypassDeadline) {
      const year = new Date().getFullYear()
      const { data: annualThisYear } = await supabase.from('leaves')
        .select('id')
        .eq('employee_id', profile.id)
        .eq('leave_type', 'annual')
        .gte('start_date', `${year}-01-01`)
        .lte('start_date', `${year}-12-31`)
        .neq('status', 'rejected')
      if ((annualThisYear?.length ?? 0) >= 2) {
        setError('لا يُسمح بأكثر من فترتين للإجازة السنوية في نفس العام'); return
      }
    }

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
      employee_id:          profile.id,
      employee_name:        profile.full_name_ar,
      job_number:           profile.job_number ?? null,
      hire_date:            profile.hire_date ?? null,
      national_id:          profile.national_id ?? null,
      phone:                profile.phone ?? null,
      job_title:            profile.job_title ?? null,
      station_id:           profile.station_id,
      leave_type:           form.leave_type,
      bereavement_rel:      form.leave_type === 'bereavement' ? form.bereavement_rel : null,
      start_date:           form.start_date,
      end_date:             form.end_date,
      return_date:          form.return_date || null,
      days_count:           form.leave_type === 'casual' ? casualHours / 24 : days,
      notes:                encodeLeaveNotes({ timeFrom, timeTo, compReason, userNotes: form.notes, leaveType: form.leave_type }),
      attachment_url:       attachmentUrl,
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
      const typeLabel = LEAVE_TYPES.find(t => t.id === form.leave_type)?.ar ?? form.leave_type
      // إشعار المسؤول المباشر المحدد في بيانات الموظف — إن لم يُحدَّد يُرسَل لكل مشرفي المحطة
      let recipientIds = []
      if (profile.supervisor_id) {
        recipientIds = [profile.supervisor_id]
      } else {
        const { data: supervisors } = await supabase.from('users')
          .select('id').in('role', ['station_admin', 'shift_supervisor'])
          .eq('station_id', profile.station_id).eq('is_active', true)
        recipientIds = (supervisors ?? []).map(s => s.id)
      }
      await notifyMany(recipientIds, {
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
    setShowConfirm(false)
    onSaved()
  }

  // تصنيف الأنواع إلى 4 فئات رئيسية
  const MAIN_CATS = [
    {
      id: 'annual',
      ar: 'إجازة سنوية',
      en: 'Annual Leave',
      desc_ar: 'الإجازة السنوية المقررة',
      types: ['annual'],
      defaultType: 'annual',
    },
    {
      id: 'emergency',
      ar: 'إجازة اضطرارية',
      en: 'Emergency Leave',
      desc_ar: 'مرضية، زواج، مولود، وفاة',
      types: ['sick', 'marriage', 'paternity', 'bereavement', 'unpaid'],
      defaultType: 'sick',
    },
    {
      id: 'compensatory',
      ar: 'إجازة تعويضية',
      en: 'Compensatory Leave',
      desc_ar: 'عن أيام العطل الرسمية',
      types: ['compensatory'],
      defaultType: 'compensatory',
    },
    {
      id: 'casual',
      ar: 'استئذان خروج',
      en: 'Exit Permission',
      desc_ar: 'غياب جزئي خلال اليوم',
      types: ['casual'],
      defaultType: 'casual',
    },
  ]
  const EMERGENCY_TYPES = [
    { id: 'sick',        ar: 'مرضية'   },
    { id: 'marriage',   ar: 'زواج'     },
    { id: 'paternity',  ar: 'مولود'    },
    { id: 'bereavement',ar: 'وفاة'     },
  ]
  const activeCat = MAIN_CATS.find(c => c.types.includes(form.leave_type)) ?? MAIN_CATS[0]

  const catTileStyle = (selected) => ({
    flex: '1 1 0', minWidth: 120, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
    border: selected ? '2px solid var(--text-1)' : '1.5px solid var(--border)',
    background: 'var(--card)',
    color: 'var(--text-1)',
    textAlign: 'center', transition: 'all 0.15s', fontFamily: 'inherit',
    fontWeight: selected ? 800 : 500,
  })

  const typeLabel   = LEAVE_TYPES.find(t => t.id === form.leave_type)?.ar ?? form.leave_type
  const relLabel    = form.leave_type === 'bereavement' ? BEREAVEMENT_RELS.find(r => r.id === form.bereavement_rel)?.ar : null
  const compLabel   = form.leave_type === 'compensatory' ? COMPENSATORY_REASONS.find(r => r.id === compReason)?.ar : null

  return (
    <form onSubmit={e => { e.preventDefault(); setError(''); setShowConfirm(true) }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {/* ── اختيار الفئة الرئيسية ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {MAIN_CATS.map(cat => {
          const sel = activeCat.id === cat.id
          return (
            <button key={cat.id} type="button"
              onClick={() => set('leave_type', cat.defaultType)}
              style={catTileStyle(sel)}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                {isAr ? cat.ar : cat.en}
              </div>
              {cat.id !== 'casual' && (
                <div style={{ fontSize: '0.65rem', opacity: sel ? 0.7 : 0.5, marginTop: 3 }}>
                  {cat.desc_ar}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ── خيارات الإجازة الاضطرارية ── */}
      {activeCat.id === 'emergency' && (
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.05em' }}>
            {isAr ? 'نوع الإجازة الاضطرارية' : 'Emergency Leave Type'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EMERGENCY_TYPES.map(t => (
              <button key={t.id} type="button" onClick={() => set('leave_type', t.id)}
                style={{
                  padding: '7px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.12s',
                  border: `1.5px solid ${form.leave_type === t.id ? '#1C2B4A' : 'var(--border)'}`,
                  background: form.leave_type === t.id ? '#1C2B4A' : 'var(--card)',
                  color: form.leave_type === t.id ? '#fff' : 'var(--text-2)',
                }}>
                {t.ar}
              </button>
            ))}
          </div>
          {/* قرابة الوفاة */}
          {form.leave_type === 'bereavement' && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.05em' }}>
                {isAr ? 'درجة القرابة' : 'Relation'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {BEREAVEMENT_RELS.map(r => (
                  <button key={r.id} type="button" onClick={() => set('bereavement_rel', r.id)}
                    style={{
                      padding: '7px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                      fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.12s',
                      border: `1.5px solid ${form.bereavement_rel === r.id ? '#1C2B4A' : 'var(--border)'}`,
                      background: form.bereavement_rel === r.id ? '#1C2B4A' : 'var(--card)',
                      color: form.bereavement_rel === r.id ? '#fff' : 'var(--text-2)',
                    }}>
                    {r.ar} <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>({r.days} أيام)</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* تنبيه مرضية */}
          {form.leave_type === 'sick' && (
            <div style={{ marginTop: 10, padding: '9px 14px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.76rem', color: 'var(--text-2)', display: 'flex', gap: 8 }}>
              <span style={{ color: '#1C2B4A', fontWeight: 800 }}>!</span>
              <span>{isAr ? <>يجب رفعها خلال <strong>5 أيام عمل</strong> من تاريخ المرض.</> : <>Submit within <strong>5 working days</strong> of illness.</>}</span>
            </div>
          )}
          {/* تنبيه مولود */}
          {form.leave_type === 'paternity' && (
            <div style={{ marginTop: 10, padding: '9px 14px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.76rem', color: 'var(--text-2)', display: 'flex', gap: 8 }}>
              <span style={{ color: '#1C2B4A', fontWeight: 800 }}>!</span>
              <span>{isAr ? <>يجب أخذها خلال <strong>7 أيام</strong> من تاريخ الولادة (3 أيام).</> : <>Must be taken within <strong>7 days</strong> of birth (3 days).</>}</span>
            </div>
          )}
        </div>
      )}

      {/* ── خيارات الإجازة التعويضية ── */}
      {activeCat.id === 'compensatory' && (
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.05em' }}>
            {isAr ? 'سبب الإجازة التعويضية' : 'Reason'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {COMPENSATORY_REASONS.map(r => (
              <button key={r.id} type="button" onClick={() => setCompReason(r.id)}
                style={{
                  padding: '7px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.12s',
                  border: `1.5px solid ${compReason === r.id ? '#1C2B4A' : 'var(--border)'}`,
                  background: compReason === r.id ? '#1C2B4A' : 'var(--card)',
                  color: compReason === r.id ? '#fff' : 'var(--text-2)',
                }}>
                {r.ar}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: '9px 14px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.76rem', color: 'var(--text-2)', display: 'flex', gap: 8 }}>
            <span style={{ color: '#1C2B4A', fontWeight: 800 }}>!</span>
            <span>{isAr ? <>يجب تقديمها <strong>قبل الإجازة بيومين على الأقل</strong>.</> : <>Must be submitted <strong>at least 2 days before</strong>.</>}</span>
          </div>
        </div>
      )}

      {/* ── معلومات الإجازة السنوية ── */}
      {activeCat.id === 'annual' && profile?.hire_date && (
        <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ flex: 1, padding: '12px 16px', background: 'var(--surface)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginBottom: 2 }}>{isAr ? 'سنوات الخدمة' : 'Service'}</div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-1)' }}>{yearsOfService(profile.hire_date)}</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 1, padding: '12px 16px', background: 'var(--surface)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginBottom: 2 }}>{isAr ? 'الرصيد السنوي' : 'Entitlement'}</div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-1)' }}>{entitlement} {isAr ? 'يوم' : 'd'}</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 2, padding: '12px 16px', background: 'var(--surface)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginBottom: 2 }}>{isAr ? 'ملاحظة' : 'Note'}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-2)' }}>
              {isAr ? <>يجب تقديمها <strong>قبل 10 أيام</strong>، فترتان كحد أقصى في السنة.</> : <>Submit <strong>10+ days ahead</strong>, max 2 periods/year.</>}
            </div>
          </div>
        </div>
      )}

      {/* ── استثناء الأدمن ── */}
      {isAdmin && ['compensatory', 'annual'].includes(form.leave_type) && (
        <button type="button" onClick={() => setBypassDeadline(b => !b)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, border: `1.5px solid ${bypassDeadline ? '#dc2626' : 'var(--border)'}`, background: bypassDeadline ? '#fef2f2' : 'var(--surface)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: bypassDeadline ? '#dc2626' : 'var(--text-3)', transition: 'all 0.15s', width: '100%' }}>
          <div style={{ width: 32, height: 18, borderRadius: 9, background: bypassDeadline ? '#dc2626' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, right: bypassDeadline ? 2 : 14, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'right 0.2s' }} />
          </div>
          {bypassDeadline ? (isAr ? 'تجاوز قيود المواعيد مفعّل' : 'Deadline bypass enabled') : (isAr ? 'تجاوز قيود المواعيد — استثناء أدمن' : 'Bypass deadlines — admin exception')}
        </button>
      )}

      {/* ── خط فاصل ── */}
      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* ── التواريخ ── */}
      {form.leave_type === 'casual' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label={isAr ? 'التاريخ' : 'Date'}>
            <DatePicker value={form.start_date} onChange={v => { set('start_date', v); set('end_date', v) }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-right" isAr={true} />
          </Field>
          <Field label={isAr ? 'من الساعة' : 'From'}>
            <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} style={{ ...inp }} />
          </Field>
          <Field label={isAr ? 'إلى الساعة' : 'To'}>
            <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} style={{ ...inp }} />
          </Field>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <Field label={isAr ? 'من تاريخ' : 'Start Date'}>
            <DatePicker value={form.start_date} onChange={v => set('start_date', v)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-right" isAr={true} />
          </Field>
          <Field label={isAr ? 'إلى تاريخ' : 'End Date'}>
            <DatePicker value={form.end_date} onChange={v => set('end_date', v)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-right" isAr={true} />
          </Field>
          <Field label={isAr ? 'عدد الأيام' : 'Days'}>
            <div style={{ ...inp, background: 'var(--surface)', color: days > (maxDays ?? Infinity) ? '#dc2626' : 'var(--text-1)', fontWeight: 800 }}>
              {days} {isAr ? 'يوم' : 'd'}{maxDays ? ` / ${maxDays}` : ''}
            </div>
          </Field>
          <Field label={isAr ? 'تاريخ المباشرة' : 'Return Date'}>
            <DatePicker value={form.return_date} onChange={v => set('return_date', v)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-right" isAr={true} />
          </Field>
        </div>
      )}

      {/* مدة استئذان الخروج */}
      {form.leave_type === 'casual' && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{isAr ? 'المدة:' : 'Duration:'}</span>
          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-1)' }}>{formatHoursAr(casualHours)}</span>
        </div>
      )}

      {/* مرفق الإثبات */}
      {PROOF_TYPES.includes(form.leave_type) && (
        <Field label={isAr ? 'مرفق الإثبات' : 'Proof Attachment'}
          hint={PROOF_NO_DEADLINE.includes(form.leave_type)
            ? (isAr ? 'يمكن رفعه الآن أو لاحقاً على نفس الطلب' : 'Can be uploaded now or later on the same request')
            : (isAr ? `يمكن رفعه الآن أو خلال ${PROOF_DAYS} أيام من تاريخ التبليغ` : `Can upload now or within ${PROOF_DAYS} days`)}>
          <input key={form.leave_type} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={e => setProofFile(e.target.files?.[0] ?? null)}
            style={{ ...inp, padding: '7px 10px', cursor: 'pointer' }} />
          {proofFile && (
            <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-2)', fontWeight: 600 }}>✓ {proofFile.name}</p>
          )}
        </Field>
      )}

      {/* ملاحظات */}
      <Field label={form.leave_type === 'casual' ? (isAr ? 'سبب الاستئذان *' : 'Reason *') : (isAr ? 'ملاحظات' : 'Notes')}>
        <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
          style={{ ...inp, resize: 'none', borderColor: form.leave_type === 'casual' && !form.notes?.trim() ? '#fca5a5' : undefined }}
          placeholder={form.leave_type === 'casual' ? (isAr ? 'أدخل سبب الاستئذان (إلزامي)...' : 'Enter reason (required)...') : (isAr ? 'أي تفاصيل إضافية...' : 'Any additional details...')} />
      </Field>

      <button type="submit"
        style={{ padding: '10px 32px', borderRadius: 8, border: '1.5px solid var(--text-1)', background: 'var(--card)', color: 'var(--text-1)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
        {isAr ? 'رفع طلب الإجازة' : 'Submit Leave Request'}
      </button>

      {/* ── نافذة تأكيد الطلب ── */}
      {showConfirm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--card, #fff)', borderRadius: 12, boxShadow: '0 4px 32px rgba(0,0,0,0.14)', width: '100%', maxWidth: 400, direction: 'rtl', overflow: 'hidden' }}>

            {/* رأس */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>{isAr ? 'تأكيد طلب الإجازة' : 'Confirm Leave Request'}</span>
              <button onClick={() => setShowConfirm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '1.1rem', lineHeight: 1, padding: 0, fontFamily: 'inherit' }}>✕</button>
            </div>

            {/* تفاصيل الطلب */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: isAr ? 'الاسم' : 'Name', value: profile?.full_name_ar ?? '—' },
                { label: isAr ? 'المحطة' : 'Station', value: profile?.station?.name_ar ?? profile?.station_name ?? '—' },
                { label: isAr ? 'الوظيفة' : 'Job Title', value: profile?.job_title ?? '—' },
                { label: isAr ? 'نوع الإجازة' : 'Leave Type', value: typeLabel + (relLabel ? ` — ${relLabel}` : '') + (compLabel ? ` — ${compLabel}` : '') },
                form.leave_type === 'casual'
                  ? { label: isAr ? 'المدة' : 'Duration', value: formatHoursAr(casualHours) }
                  : { label: isAr ? 'الفترة' : 'Period', value: `${form.start_date} ← ${form.end_date} (${days} ${isAr ? 'يوم' : 'days'})` },
                form.return_date && form.leave_type !== 'casual'
                  ? { label: isAr ? 'تاريخ المباشرة' : 'Return', value: form.return_date }
                  : null,
                form.notes?.trim()
                  ? { label: isAr ? 'ملاحظات' : 'Notes', value: form.notes }
                  : null,
              ].filter(Boolean).map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, fontSize: '0.83rem' }}>
                  <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{row.label}</span>
                  <span style={{ color: 'var(--text-1)', fontWeight: 600, textAlign: 'left' }}>{row.value}</span>
                </div>
              ))}

              {error && (
                <div style={{ padding: '9px 12px', borderRadius: 7, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.78rem' }}>{error}</div>
              )}
            </div>

            {/* أزرار */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowConfirm(false)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                {isAr ? 'تعديل' : 'Edit'}
              </button>
              <button onClick={async () => { await handleSubmit({ preventDefault: () => {} }); setShowConfirm(false) }} disabled={saving}
                style={{ padding: '8px 24px', borderRadius: 8, border: '1.5px solid var(--text-1)', background: 'var(--card)', color: 'var(--text-1)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? (isAr ? 'جارٍ الإرسال...' : 'Submitting...') : (isAr ? 'تأكيد الرفع' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}

/* ══════════════════════════════════════════
   بطاقة إجازة مع خطوات الموافقة
══════════════════════════════════════════ */
function LeaveCard({ leave: rawLeave, profile, onAction, onPrint, onProofUploaded, onDelete, isAr = true }) {
  const leave = decodeLeaveNotes(rawLeave)
  const [showNotes, setShowNotes]  = useState(false)
  const [actionNotes, setActionNotes] = useState('')
  const [uploadingProof, setUploadingProof] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const proofInputRef = useRef(null)

  const role        = profile?.role
  const isAdmin     = role === 'general_admin'
  const isSupervisor = role === 'station_admin' || role === 'shift_supervisor'
  const isOwn       = leave.employee_id === profile?.id

  const typeLabel   = LEAVE_TYPES.find(t => t.id === leave.leave_type)?.ar ?? leave.leave_type
  const typeIcon    = LEAVE_TYPES.find(t => t.id === leave.leave_type)?.icon ?? ''
  const relLabel    = leave.bereavement_rel ? BEREAVEMENT_RELS.find(r => r.id === leave.bereavement_rel)?.ar : null
  const compLabel   = leave.compensatory_reason ? COMPENSATORY_REASONS.find(r => r.id === leave.compensatory_reason)?.ar : null
  const casualHoursDisplay = leave.leave_type === 'casual' && leave.days_count
    ? formatHoursAr(leave.days_count * 24) : null

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

  const ST = STATUS_STYLE[leave.status] ?? STATUS_STYLE.pending
  const statusText = leave.status === 'approved' ? (isAr ? 'مقبولة' : 'Approved') : leave.status === 'rejected' ? (isAr ? 'مرفوضة' : 'Rejected') : (isAr ? 'قيد المراجعة' : 'Pending')

  return (
    <div dir="rtl" style={{
      borderRadius: 10,
      border: '1px solid var(--border)',
      background: 'var(--card)',
      overflow: 'hidden',
    }}>

      {/* ── رأس البطاقة ── */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-1)' }}>{typeLabel}</span>
            {!NO_APPROVAL_TYPES.includes(leave.leave_type) && (
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)' }}>— {statusText}</span>
            )}
          </div>
          {(leave.employee_name || leave.job_title || leave.station?.name_ar) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              {leave.employee_name && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-2)' }}>{leave.employee_name}</span>
              )}
              {leave.job_title && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>· {leave.job_title}</span>
              )}
              {(leave.station?.name_ar || leave.station?.name_en) && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>· {isAr ? leave.station.name_ar : leave.station.name_en}</span>
              )}
            </div>
          )}
          {leave.created_at && (
            <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 3 }}>
              {isAr ? 'تاريخ الرفع:' : 'Submitted:'}{' '}
              {new Date(leave.created_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB')}{' — '}
              {new Date(leave.created_at).toLocaleTimeString(isAr ? 'ar-SA' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* أزرار الطباعة/الحذف */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {(fullyApproved || isOwn) && (
            <button onClick={() => onPrint(leave)} style={{
              padding: '5px 12px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--text-2)', fontSize: '0.72rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {isAr ? 'طباعة' : 'Print'}
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setConfirmDelete(true)} style={{
              padding: '5px 12px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--text-2)', fontSize: '0.72rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {isAr ? 'حذف' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      {/* ── تفاصيل الإجازة ── */}
      <div style={{ padding: '14px 18px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* التواريخ */}
        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>
            {isAr ? 'فترة الإجازة' : 'Leave Period'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-1)', fontWeight: 700 }}>
            <span>{leave.start_date}</span>
            <span style={{ color: 'var(--text-3)' }}>←</span>
            <span>{leave.end_date}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)', padding: '1px 8px', border: '1px solid var(--border)', borderRadius: 6 }}>
              {casualHoursDisplay ?? `${leave.days_count} ${isAr ? 'يوم' : 'days'}`}
            </span>
          </div>
          {leave.return_date && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 5 }}>
              {isAr ? 'المباشرة:' : 'Return:'} <strong style={{ color: 'var(--text-2)' }}>{leave.return_date}</strong>
            </div>
          )}
          {leave.time_from && leave.time_to && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
              {leave.time_from} — {leave.time_to}
            </div>
          )}
        </div>

        {/* التفاصيل */}
        {(compLabel || relLabel || leave.notes) && (
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>
              {isAr ? 'التفاصيل' : 'Details'}
            </div>
            {compLabel && <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 600 }}>{compLabel}</div>}
            {relLabel  && <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 600 }}>{relLabel}</div>}
            {leave.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{leave.notes}</div>}
          </div>
        )}

        {/* مرفق الإثبات */}
        {needsProof && (
          <div style={{ minWidth: 140 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>
              {isAr ? 'مرفق الإثبات' : 'Proof'}
            </div>
            {leave.attachment_url ? (
              <a href={leave.attachment_url} target="_blank" rel="noreferrer" style={{
                fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)',
                border: '1px solid var(--border)', background: 'var(--card)',
                padding: '4px 12px', borderRadius: 7, textDecoration: 'none', display: 'inline-block',
              }}>
                {isAr ? 'عرض المرفق' : 'View Proof'}
              </a>
            ) : canAddProof ? (
              <>
                <input ref={proofInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleProofPick} style={{ display: 'none' }} />
                <button onClick={() => proofInputRef.current?.click()} disabled={uploadingProof} style={{
                  fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)',
                  border: '1px solid var(--border)', background: 'var(--card)',
                  padding: '4px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                  opacity: uploadingProof ? 0.6 : 1,
                }}>
                  {uploadingProof ? (isAr ? 'جارٍ الرفع...' : 'Uploading...') : (isAr ? 'رفع المرفق' : 'Upload Proof')}
                </button>
                {hasDeadline && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginTop: 4 }}>
                    {isAr ? `المهلة ${PROOF_DAYS} أيام` : `Deadline: ${PROOF_DAYS} days`}
                  </div>
                )}
              </>
            ) : (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                {isAr ? 'لا يوجد مرفق' : 'No proof'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── خطوات الموافقة ── */}
      {!NO_APPROVAL_TYPES.includes(leave.leave_type) && (
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 600 }}>{isAr ? 'الموافقة:' : 'Approval:'}</span>
          <StepBadge label={isAr ? 'المشرف' : 'Supervisor'} status={leave.supervisor_status} by={leave.supervisor_by} isAr={isAr} />
          <span style={{ color: 'var(--border)', fontSize: '0.7rem' }}>→</span>
          <StepBadge label={isAr ? 'المدير المباشر' : 'Manager'} status={leave.manager_status} by={leave.manager_by} isAr={isAr} />
        </div>
      )}

      {/* ── أزرار القبول/الرفض ── */}
      {canAct && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {showNotes && (
            <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)}
              placeholder={isAr ? 'ملاحظة (اختياري)...' : 'Note (optional)...'}
              rows={2} style={{ ...inp, resize: 'none', fontSize: '0.8rem' }} />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => act('approved')} style={{
              flex: 1, padding: '8px 16px', borderRadius: 8,
              border: '1.5px solid var(--text-1)', background: 'var(--card)',
              color: 'var(--text-1)', fontWeight: 700, fontSize: '0.82rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {isAr ? '✓ قبول' : '✓ Approve'}
            </button>
            <button onClick={() => { setShowNotes(true); act('rejected') }} style={{
              flex: 1, padding: '8px 16px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--text-2)', fontWeight: 600, fontSize: '0.82rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {isAr ? 'رفض' : 'Reject'}
            </button>
            <button onClick={() => setShowNotes(v => !v)} style={{
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--text-3)', fontSize: '0.8rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>✎</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={isAr ? 'حذف هذه الإجازة نهائياً؟' : 'Permanently delete this leave request?'}
          onConfirm={() => { setConfirmDelete(false); onDelete?.(leave.id) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function StepBadge({ label, status, by, isAr = true }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>{label}:</span>
      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-2)' }}>
        {isAr ? s.ar : s.en}{by ? ` — ${by}` : ''}
      </span>
    </div>
  )
}

/* ══════════════════════════════════════════
   الصفحة الرئيسية
══════════════════════════════════════════ */
const TABS_CFG = [
  { id: 'new',     ar: 'طلب إجازة',       en: 'New Request',    icon: '' },
  { id: 'mine',    ar: 'طلباتي',           en: 'My Requests',   icon: '' },
  { id: 'pending', ar: 'بانتظار موافقتي', en: 'Pending Approval', icon: '', supervisorOnly: true },
  { id: 'all',     ar: 'جميع الطلبات',    en: 'All Requests',  icon: '',  supervisorOnly: true },
]

export default function LeavePage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile, isAdmin, isGeneralAdmin, isAreaSupervisor, allowedStationIds } = useAuth()
  const role        = profile?.role
  const isSupervisor = role === 'station_admin' || role === 'shift_supervisor' || role === 'area_supervisor'
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
    const cacheKey = `leaves_${tab}_${profile?.id}`
    const cached = getCached(cacheKey)
    if (cached) { setLeaves(cached); setLoading(false) } else { setLoading(true) }
    let q = supabase.from('leaves').select('*, station:station_id(name_ar, name_en)').order('created_at', { ascending: false })
    if (tab === 'mine')    q = q.eq('employee_id', profile.id)
    if (tab === 'pending') {
      if (isAdmin) {
        q = q.eq('status', 'pending')
      } else if (isAreaSupervisor && allowedStationIds?.length) {
        q = q.eq('supervisor_status', 'pending').in('station_id', allowedStationIds)
      } else if (isSupervisor) {
        q = q.eq('supervisor_status', 'pending').eq('station_id', profile.station_id)
      }
    }
    if (tab === 'all' && !isAdmin) {
      if (isAreaSupervisor && allowedStationIds?.length) q = q.in('station_id', allowedStationIds)
      else q = q.eq('station_id', profile.station_id)
    }
    const { data } = await q
    if (data) { setCached(cacheKey, data); setLeaves(data) }
    setLoading(false)
  }

  useEffect(() => { if (tab !== 'new') load() }, [tab])

  useEffect(() => {
    if (tab === 'new') return
    const ch = supabase.channel(`leaves_rt_${tab}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, () => {
        clearCached(`leaves_${tab}_${profile?.id}`)
        load()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tab])

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
    <div style={{ minHeight: 'calc(100vh - 58px)', background: 'var(--surface)' }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '0 20px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.88rem', fontWeight: tab === t.id ? 800 : 500, fontFamily: 'inherit', color: tab === t.id ? 'var(--brand-900)' : 'var(--text-3)', borderBottom: `2.5px solid ${tab === t.id ? 'var(--brand-900)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.icon} {isAr ? t.ar : t.en}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: tab === 'new' ? 860 : 720, margin: '0 auto', padding: '24px 20px' }}>

        {/* طلب جديد */}
        {tab === 'new' && (
          <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-1)' }}>{isAr ? 'طلب إجازة جديد' : 'New Leave Request'}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 500 }}>{profile?.full_name_ar}</span>
            </div>
            <div style={{ padding: '24px' }}>
              {saved && (
                <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'var(--surface)', border: '1.5px solid var(--text-1)', color: 'var(--text-1)', fontWeight: 700, fontSize: '0.85rem' }}>
                  {isAr ? '✓ تم رفع طلب الإجازة بنجاح — بانتظار الموافقة' : '✓ Leave request submitted — awaiting approval'}
                </div>
              )}
              <NewLeaveForm profile={profile} isAr={isAr} onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 4000) }} />
            </div>
          </div>
        )}

        {/* قائمة الطلبات */}
        {tab !== 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* فلتر الحالة */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(isAr ? [['all','الكل'],['pending','قيد المراجعة'],['approved','مقبولة'],['rejected','مرفوضة']] : [['all','All'],['pending','Pending'],['approved','Approved'],['rejected','Rejected']]).map(([v, l]) => (
                <button key={v} onClick={() => setFilterStatus(v)}
                  style={{ padding: '5px 16px', borderRadius: 8, border: `1.5px solid ${filterStatus === v ? '#1C2B4A' : 'var(--border)'}`, background: filterStatus === v ? '#1C2B4A' : 'var(--card)', color: filterStatus === v ? '#fff' : 'var(--text-3)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {l}
                </button>
              ))}
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40 }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
            ) : filtered.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40 }}>{isAr ? 'لا توجد طلبات' : 'No requests found'}</p>
            ) : filtered.map(l => (
              <LeaveCard key={l.id} leave={l} profile={profile} isAr={isAr} onAction={handleAction} onPrint={handlePrint} onProofUploaded={load} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
