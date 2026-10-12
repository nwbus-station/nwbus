import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getCached, setCached, clearCached } from '../lib/pageCache'
import DatePicker from '../components/shared/DatePicker'
import TimePicker from '../components/shared/TimePicker'
import { notifyMany } from '../utils/notifications'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import { ADMIN_ROLE_VALUES, ASSISTANT_DIRECTOR_ROLE, jobGroupOf } from '../utils/constants'
import { matchesSearch } from '../utils/digits'
import { yearsOfService, annualEntitlement, accruedBalance, leaveRemaining } from '../utils/leaveBalance'

/* ─── ثوابت ─── */
const LEAVE_TYPES = [
  { id: 'annual',        ar: 'إجازة سنوية',       icon: '' },
  { id: 'unpaid',        ar: 'إجازة بدون راتب',   icon: '' },
  { id: 'emergency',     ar: 'إجازة اضطرارية',     icon: '' },
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
  emergency:   null,
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

// الأنواع التي تتطلب مرفق إثبات
// أنواع سبب الإجازة فيها إلزامي، وكلها لا تُخصم من رصيد الإجازة السنوية (الرصيد يجمع الإجازة السنوية فقط)
const REASON_TYPES = {
  casual:    { label: 'سبب الاستئذان', labelEn: 'Reason', ph: 'أدخل سبب الاستئذان (إلزامي)...' },
  emergency: { label: 'سبب الإجازة الاضطرارية', labelEn: 'Emergency reason', ph: 'اكتب سبب الإجازة الاضطرارية (إلزامي)...' },
  unpaid:    { label: 'سبب الإجازة بدون راتب', labelEn: 'Reason for unpaid leave', ph: 'اكتب سبب طلب الإجازة بدون راتب (إلزامي)...' },
}
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
  const hStr = h > 0 ? `${h.toLocaleString('ar-EG-u-nu-latn')} ساعة` : ''
  const mStr = m > 0 ? `${m.toLocaleString('ar-EG-u-nu-latn')} دقيقة` : ''
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
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

/* ── سجل الموظف: كم مرة استأذن / أخذ إجازة / قدّم طلباً ── */
function summarizeLeaves(rows, year) {
  const mk = () => ({ total: 0, approved: 0, rejected: 0, pending: 0, permReq: 0, permOk: 0, permHours: 0, leaveReq: 0, leaveOk: 0, leaveDays: 0, byType: {} })
  const all = mk(), yr = mk()
  for (const r of rows ?? []) {
    const y = Number(String(r.start_date ?? '').slice(0, 4))
    const casual = r.leave_type === 'casual'
    for (const b of (y === year ? [all, yr] : [all])) {
      b.total++
      if (r.status === 'approved') b.approved++
      else if (r.status === 'rejected') b.rejected++
      else b.pending++
      if (casual) { b.permReq++; if (r.status === 'approved') { b.permOk++; b.permHours += (Number(r.days_count) || 0) * 24 } }
      else { b.leaveReq++; if (r.status === 'approved') { b.leaveOk++; b.leaveDays += Number(r.days_count) || 0 }; b.byType[r.leave_type] = (b.byType[r.leave_type] || 0) + (r.status === 'approved' ? 1 : 0) }
    }
  }
  return { year, yr, all }
}
async function fetchEmployeeLeaveStats(employeeId) {
  const { data } = await supabase.from('leaves').select('leave_type, status, start_date, days_count').eq('employee_id', employeeId)
  return summarizeLeaves(data ?? [], new Date().getFullYear())
}

const PRINT_CSS = `
  @page { size: A4; margin: 9mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e8ecf1; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; direction: rtl; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .toolbar { position: sticky; top: 0; z-index: 5; background: #1C2B36; color: #fff; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; }
  .toolbar button { background: #fff; color: #1C2B36; border: 0; border-radius: 8px; padding: 9px 20px; font-weight: 800; font-size: 14px; font-family: inherit; }
  .sheet { background: #fff; max-width: 820px; margin: 14px auto; padding: 0 0 14px; box-shadow: 0 2px 14px rgba(0,0,0,.12); }
  .hd { background: #1C2B36; color: #fff; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .hd .brand { font-size: 17px; font-weight: 900; letter-spacing: 2px; }
  .hd .sub { font-size: 9px; opacity: .7; margin-top: 2px; }
  .hd .title { text-align: left; }
  .hd .title b { display: block; font-size: 18px; font-weight: 800; }
  .hd .title span { font-size: 10px; opacity: .8; }
  .body { padding: 0 22px; }
  .meta { display: flex; justify-content: space-between; align-items: center; margin: 12px 0 4px; font-size: 10px; color: #475569; gap: 8px; flex-wrap: wrap; }
  .badge { display: inline-block; padding: 3px 12px; border-radius: 99px; font-weight: 800; font-size: 11px; }
  .sec { margin-top: 14px; }
  .sec > h3 { margin: 0 0 6px; font-size: 11.5px; font-weight: 800; color: #1C2B36; padding-right: 8px; border-right: 4px solid #EE712D; }
  .grid { display: grid; gap: 6px; }
  .g4 { grid-template-columns: repeat(4, 1fr); } .g3 { grid-template-columns: repeat(3, 1fr); } .g2 { grid-template-columns: repeat(2, 1fr); }
  .cell { border: 1px solid #dbe2ea; border-radius: 7px; padding: 6px 9px; background: #f8fafc; }
  .cell small { display: block; font-size: 8.5px; color: #64748b; margin-bottom: 2px; }
  .cell b { font-size: 11.5px; color: #0f172a; word-break: break-word; }
  .req { border: 1.5px solid #1C2B36; border-radius: 10px; padding: 10px 12px; display: grid; grid-template-columns: 1.2fr 1fr 1fr .9fr; gap: 8px; align-items: center; }
  .req .k { font-size: 8.5px; color: #64748b; } .req .v { font-size: 13px; font-weight: 800; }
  .dur { background: #1C2B36; color: #fff; border-radius: 8px; padding: 8px 6px; text-align: center; font-weight: 900; font-size: 14px; }
  table.t { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.t th { background: #1e3a5f; color: #fff; padding: 5px 8px; font-size: 10px; }
  table.t td { border: 1px solid #dbe2ea; padding: 5px 8px; text-align: center; }
  table.t td:first-child { text-align: right; font-weight: 700; background: #f8fafc; }
  .chips { margin-top: 6px; font-size: 10px; color: #334155; }
  .chips span { display: inline-block; background: #eef2f7; border-radius: 99px; padding: 2px 10px; margin: 2px 0 2px 4px; font-weight: 700; }
  .ap { border: 1px solid #dbe2ea; border-radius: 8px; padding: 8px 10px; }
  .ap h4 { margin: 0 0 4px; font-size: 10px; color: #475569; font-weight: 700; }
  .ap .st { font-size: 11px; font-weight: 800; }
  .ap .dt { font-size: 9px; color: #64748b; margin-top: 2px; min-height: 12px; }
  .sig { border-top: 1px solid #94a3b8; margin-top: 26px; padding-top: 3px; font-size: 8.5px; color: #64748b; }
  .ft { display: flex; justify-content: space-between; align-items: center; margin: 14px 22px 0; padding-top: 6px; border-top: 1px solid #cbd5e1; font-size: 9px; color: #64748b; gap: 8px; }
  .ft .pill { background: #1C2B36; color: #fff; padding: 2px 12px; border-radius: 20px; font-size: 8px; font-weight: 700; }
  @media (max-width: 640px) {
    .sheet { margin: 0; box-shadow: none; } .g4 { grid-template-columns: repeat(2, 1fr); } .g3 { grid-template-columns: 1fr; }
    .req { grid-template-columns: 1fr 1fr; } .body { padding: 0 12px; } .hd { padding: 12px 14px; } .ft { margin: 12px 12px 0; flex-wrap: wrap; }
  }
  @media print { html, body { background: #fff; } .toolbar { display: none !important; } .sheet { margin: 0; max-width: none; box-shadow: none; padding: 0; }
    .sec, .req, .ap, table.t { break-inside: avoid; } }
`

function buildLeavePrintHtml(rawLeave, employeeName, stationName, profile, usedAnnual, stats) {
  const leave = decodeLeaveNotes(rawLeave)
  const typeLabel = LEAVE_TYPES.find(t => t.id === leave.leave_type)?.ar ?? leave.leave_type
  const relLabel = BEREAVEMENT_RELS.find(r => r.id === leave.bereavement_rel)?.ar ?? ''
  const compLabel = leave.compensatory_reason ? (COMPENSATORY_REASONS.find(r => r.id === leave.compensatory_reason)?.ar ?? '') : ''
  const isCasual = leave.leave_type === 'casual'
  const isAnnual = leave.leave_type === 'annual'
  const durationStr = isCasual ? formatHoursAr((leave.days_count ?? 0) * 24) : `${Number(leave.days_count) || 0} ${Number(leave.days_count) === 1 ? 'يوم' : 'أيام'}`
  const fmtDT = d => (d ? new Date(d).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }) : '')
  const printStamp = fmtDT(new Date())
  const hireStr = profile?.hire_date ?? null
  const entitlement = annualEntitlement(hireStr)
  const accrued = accruedBalance(hireStr, entitlement)
  const remaining = Math.max(0, accrued - usedAnnual)
  const docNo = String(leave.id ?? '').replace(/-/g, '').slice(0, 6).toUpperCase()
  const docTitle = isCasual ? 'طلب استئذان خروج' : 'طلب إجازة'
  const reasonLabel = REASON_TYPES[leave.leave_type]?.label ?? 'ملاحظات'

  const st = leave.status === 'approved' ? ['معتمد نهائياً', '#dcfce7', '#166534'] : leave.status === 'rejected' ? ['مرفوض', '#fee2e2', '#b91c1c'] : ['قيد المراجعة', '#fef3c7', '#92400e']
  const step = (status, by, at) => status === 'approved'
    ? [`✓ موافق${by ? ' — ' + by : ''}`, '#166534', fmtDT(at)]
    : status === 'rejected' ? ['✗ مرفوض', '#b91c1c', fmtDT(at)] : ['بانتظار الموافقة', '#92400e', '']
  const sup = step(leave.supervisor_status, leave.supervisor_by, leave.supervisor_at)
  const mgr = step(leave.manager_status, leave.manager_by, leave.manager_at)

  const cell = (k, v) => `<div class="cell"><small>${esc(k)}</small><b>${esc(v || '—')}</b></div>`
  const row = (label, a, b) => `<tr><td>${esc(label)}</td><td>${a}</td><td>${b}</td></tr>`
  const S = stats ?? summarizeLeaves([], new Date().getFullYear())
  const hrs = h => (h > 0 ? formatHoursAr(h) : '—')
  const typeChips = Object.entries(S.yr.byType).filter(([, n]) => n > 0).map(([k, n]) => `<span>${esc(LEAVE_TYPES.find(t => t.id === k)?.ar ?? k)}: ${n}</span>`).join('')

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(docTitle)} — ${esc(employeeName)}</title><style>${PRINT_CSS}</style></head><body>
<div class="toolbar"><span>اضغط «طباعة / حفظ PDF» ثم اختر الطابعة أو «حفظ كملف PDF»</span><button onclick="window.print()">طباعة / حفظ PDF</button></div>
<div class="sheet">
  <div class="hd">
    <div><div class="brand">NORTH WEST BUS</div><div class="sub">نورث وست باص</div></div>
    <div class="title"><b>${esc(docTitle)}</b><span>${esc(stationName || '')}</span></div>
  </div>
  <div class="body">
    <div class="meta">
      <span>رقم الطلب: <b>#${esc(docNo)}</b> &nbsp;·&nbsp; تاريخ الرفع: <b>${esc(fmtDT(leave.created_at) || '—')}</b></span>
      <span class="badge" style="background:${st[1]};color:${st[2]}">${esc(st[0])}</span>
    </div>

    <div class="sec"><h3>بيانات الموظف</h3>
      <div class="grid g4">
        ${cell('اسم الموظف', employeeName)}${cell('الرقم الوظيفي', profile?.job_number)}${cell('المسمى الوظيفي', profile?.job_title)}${cell('المحطة / الإدارة', stationName)}
        ${cell('تاريخ المباشرة', hireStr)}${cell('رقم الجوال', profile?.phone)}${cell('رقم الهوية', profile?.national_id)}${cell('سنوات الخدمة', hireStr ? yearsOfService(hireStr) + ' سنة' : '')}
      </div>
    </div>

    <div class="sec"><h3>تفاصيل الطلب</h3>
      <div class="req">
        <div><div class="k">نوع الطلب</div><div class="v">${esc(typeLabel)}</div>${(relLabel || compLabel) ? `<div class="k" style="margin-top:2px">${esc(relLabel || compLabel)}</div>` : ''}</div>
        <div><div class="k">من</div><div class="v">${esc(leave.start_date)}</div>${leave.time_from ? `<div class="k">${esc(leave.time_from)}</div>` : ''}</div>
        <div><div class="k">إلى</div><div class="v">${esc(leave.end_date)}</div>${leave.time_to ? `<div class="k">${esc(leave.time_to)}</div>` : ''}</div>
        <div class="dur">${esc(durationStr)}</div>
      </div>
      ${!isCasual && leave.return_date ? `<div class="grid g2" style="margin-top:6px">${cell('تاريخ المباشرة بعد الإجازة', leave.return_date)}${cell(reasonLabel, leave.notes)}</div>`
        : `<div class="grid" style="margin-top:6px">${cell(reasonLabel, leave.notes)}</div>`}
    </div>

    <div class="sec"><h3>سجل الموظف — كم مرة استأذن وأخذ إجازة وقدّم طلباً</h3>
      <table class="t">
        <thead><tr><th style="width:46%">البند</th><th>هذا العام (${S.year})</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${row('طلبات الاستئذان المقدَّمة', S.yr.permReq, S.all.permReq)}
          ${row('الاستئذانات المقبولة (عدد المرات · المدة)', `${S.yr.permOk} · ${hrs(S.yr.permHours)}`, `${S.all.permOk} · ${hrs(S.all.permHours)}`)}
          ${row('طلبات الإجازات المقدَّمة', S.yr.leaveReq, S.all.leaveReq)}
          ${row('الإجازات المقبولة (عدد المرات · الأيام)', `${S.yr.leaveOk} · ${S.yr.leaveDays ? Number(S.yr.leaveDays.toFixed(2)) + ' يوم' : '—'}`, `${S.all.leaveOk} · ${S.all.leaveDays ? Number(S.all.leaveDays.toFixed(2)) + ' يوم' : '—'}`)}
          ${row('الطلبات المرفوضة', S.yr.rejected, S.all.rejected)}
          ${row('إجمالي الطلبات المقدَّمة', `<b>${S.yr.total}</b>`, `<b>${S.all.total}</b>`)}
        </tbody>
      </table>
      ${typeChips ? `<div class="chips">الإجازات المقبولة هذا العام حسب النوع: ${typeChips}</div>` : ''}
    </div>

    ${isAnnual ? `<div class="sec"><h3>رصيد الإجازة السنوية</h3>
      <div class="grid g3">${cell('الرصيد المستحق', accrued.toFixed(3) + ' يوم')}${cell('المستخدم هذا العام', usedAnnual.toFixed(3) + ' يوم')}${cell('المتبقي الفعلي', remaining.toFixed(3) + ' يوم')}</div></div>` : ''}

    <div class="sec"><h3>مسار الموافقة والتوقيعات</h3>
      <div class="grid g3">
        <div class="ap"><h4>مقدّم الطلب</h4><div class="st">${esc(employeeName)}</div><div class="dt">${esc(fmtDT(leave.created_at))}</div><div class="sig">التوقيع</div></div>
        <div class="ap"><h4>المشرف المباشر</h4><div class="st" style="color:${sup[1]}">${esc(sup[0])}</div><div class="dt">${esc(sup[2])}</div><div class="sig">التوقيع</div></div>
        <div class="ap"><h4>المدير المعتمِد</h4><div class="st" style="color:${mgr[1]}">${esc(mgr[0])}</div><div class="dt">${esc(mgr[2])}</div><div class="sig">التوقيع</div></div>
      </div>
    </div>
  </div>
  <div class="ft"><span>طُبع بواسطة: ${esc(employeeName)}</span><span class="pill">NORTH WEST BUS</span><span>${esc(printStamp)}</span></div>
</div></body></html>`
}

// الطباعة بنافذة مستقلة (تعمل من الجوال والكمبيوتر) — النافذة تُفتح فور الضغط (قبل جلب البيانات) لتفادي حجب النوافذ
function printLeave(w, rawLeave, employeeName, stationName, profile, usedAnnual, stats) {
  const html = buildLeavePrintHtml(rawLeave, employeeName, stationName, profile, usedAnnual, stats)
  if (w) {
    w.document.open(); w.document.write(html); w.document.close()
    // على الكمبيوتر نفتح نافذة الطباعة تلقائياً، وعلى الجوال يبقى زر «طباعة / حفظ PDF» ظاهراً أعلى الصفحة
    if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) setTimeout(() => { try { w.focus(); w.print() } catch { /* يطبع يدوياً */ } }, 500)
    return true
  }
  // النوافذ المنبثقة محجوبة: نطبع من إطار مخفي
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close()
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print() } finally { setTimeout(() => f.remove(), 2000) } }, 500)
  return false
}

// مستلمو مرحلة المشرف: المسؤول المباشر إن وُجد، وإلا كل مشرفي المحطة + مساعد المدير المخصصة له المحطة
async function findSupervisorIds(stationId, directSupervisorId, employeeId, employeeJobTitle) {
  // مسمى بموظفين محددين: يصله إشعار إجازة موظفيه المحددين له
  let assignedSups = []
  if (employeeId) {
    const { data: titles } = await supabase.from('custom_titles').select('id').contains('permissions', { assigned_leaves: true })
    const tids = (titles ?? []).map(t => t.id)
    if (tids.length) {
      const { data: asg } = await supabase.from('shift_supervisor_assignments').select('supervisor_id').eq('employee_id', employeeId)
      const sids = (asg ?? []).map(a => a.supervisor_id)
      if (sids.length) {
        const { data } = await supabase.from('users').select('id').eq('is_active', true).in('id', sids).in('custom_title_id', tids)
        assignedSups = (data ?? []).map(x => x.id)
      }
    }
  }
  // مجموعة وظيفية (مرحّلون/خدمة عملاء/مشرفون): يصله إشعار إجازة أي موظف من مجموعته لو عنده صلاحية الموافقة عليها
  const grp = jobGroupOf(employeeJobTitle)
  if (grp && grp.actions.includes('leaves')) {
    const { data: dtitles } = await supabase.from('custom_titles').select('id').contains('permissions', { [`jg_${grp.id}_leaves`]: true })
    const dids = (dtitles ?? []).map(t => t.id)
    if (dids.length) {
      const { data } = await supabase.from('users').select('id').eq('is_active', true).in('custom_title_id', dids)
      assignedSups = [...assignedSups, ...(data ?? []).map(x => x.id)]
    }
  }
  if (directSupervisorId) return [...new Set([directSupervisorId, ...assignedSups])]
  if (!stationId) return assignedSups
  const { data: sups } = await supabase.from('users')
    .select('id').in('role', ['station_admin', 'area_supervisor'])   // موافقة الإجازات لمشرف المحطة فقط (مشرف الوردية يقيّم موظفيه المحددين ولا يوافق على إجازات)
    .eq('station_id', stationId).eq('is_active', true)
  const { data: us } = await supabase.from('user_stations').select('user_id').eq('station_id', stationId)
  let assistants = []
  if (us?.length) {
    const { data: titles } = await supabase.from('custom_titles').select('id').contains('permissions', { leaves_supervisor_stage: true })
    const titleIds = (titles ?? []).map(t => t.id)
    const { data } = await supabase.from('users')
      .select('id').eq('is_active', true).in('id', us.map(r => r.user_id))
      .or(`role.eq.${ASSISTANT_DIRECTOR_ROLE}${titleIds.length ? `,custom_title_id.in.(${titleIds.join(',')})` : ''}`)
    assistants = data ?? []
  }
  return [...new Set([...(sups ?? []).map(x => x.id), ...assistants.map(x => x.id), ...assignedSups])]
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

  const { isRestricted: restrictedTitle } = useAuth()
  const isAdmin = ADMIN_ROLE_VALUES.includes(profile?.role) && !restrictedTitle

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
    if (REASON_TYPES[form.leave_type] && !form.notes?.trim()) { setError(`${REASON_TYPES[form.leave_type].label} إلزامي`); return }
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
    if (pending?.length) { setError(form.leave_type === 'casual' ? 'لديك طلب قيد المراجعة — لا يمكن رفع طلب جديد حتى يتم البت في الطلب الحالي' : 'لديك طلب إجازة قيد المراجعة — لا يمكن رفع طلب جديد حتى يتم البت في الطلب الحالي'); return }

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

    // من يحتاج موافقة مشرف المحطة: الموظف والمحاسب ومشرف الوردية (ما يعتمد لنفسه أبداً)
    const isEmployeeRole = ['station_employee', 'accountant', 'shift_supervisor'].includes(profile?.role)
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

    // إشعار طلب الإجازة الجديد → يصل للمشرف وللأدمن معاً دائماً
    {
      const typeLabel = LEAVE_TYPES.find(t => t.id === form.leave_type)?.ar ?? form.leave_type

      const isCasual = form.leave_type === 'casual'
      const periodTxt = isCasual ? `${form.start_date} · ${formatHoursAr(casualHours)}` : `${days} أيام · ${form.start_date} ← ${form.end_date}`
      const supervisorIds = (await findSupervisorIds(profile.station_id, profile.supervisor_id, profile.id, profile.job_title)).filter(id => id !== profile.id)

      const { data: adminsList } = await supabase.from('users')
        .select('id').in('role', ADMIN_ROLE_VALUES).eq('is_active', true)
      const adminIds = (adminsList ?? []).map(a => a.id).filter(id => id !== profile.id && !supervisorIds.includes(id))

      // supervisor_status = pending → المشرف مطالَب بالإجراء الآن
      const supervisorActionNeeded = !autoApproved && isEmployeeRole
      // manager_status = pending والمشرف لن يُسأل أولاً → الأدمن مطالَب بالإجراء الآن
      const managerActionNeeded = !autoApproved && !supervisorActionNeeded

      await notifyMany(supervisorIds, {
        title: supervisorActionNeeded
          ? `${isCasual ? 'طلب استئذان جديد' : 'طلب إجازة جديد'} — ${profile.full_name_ar}`
          : `${typeLabel}${autoApproved ? ' (معتمدة)' : ''} — ${profile.full_name_ar}`,
        body: supervisorActionNeeded
          ? `${typeLabel} · ${periodTxt}`
          : `${periodTxt} — للعلم`,
        type: supervisorActionNeeded ? 'warning' : 'info', refType: 'leave',
      })

      await notifyMany(adminIds, {
        title: managerActionNeeded
          ? `${isCasual ? 'طلب استئذان بانتظار موافقتك' : 'طلب إجازة بانتظار موافقتك'} — ${profile.full_name_ar}`
          : `${typeLabel}${autoApproved ? ' (معتمدة)' : ''} — ${profile.full_name_ar}`,
        body: managerActionNeeded
          ? `${typeLabel} · ${periodTxt}`
          : `${periodTxt} — للعلم`,
        type: managerActionNeeded ? 'warning' : 'info', refType: 'leave',
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

    const savedType = form.leave_type
    setForm(empty)
    setProofFile(null)
    setShowConfirm(false)
    onSaved(savedType)
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
      desc_ar: 'مرضية، زواج، مولود، وفاة، اضطرارية، بدون راتب',
      types: ['sick', 'marriage', 'paternity', 'bereavement', 'emergency', 'unpaid'],
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
    { id: 'emergency',  ar: 'اضطرارية (سبب آخر)' },
    { id: 'unpaid',     ar: 'بدون راتب' },
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
          {form.leave_type === 'emergency' && (
            <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
              {isAr ? 'إجازة اضطرارية لظرف طارئ: لا تُخصم من رصيد الإجازة السنوية، وتحتاج موافقة المشرف والمدير. اكتب سبب الإجازة في خانة السبب أدناه (إلزامي).' : 'Emergency leave: not deducted from the annual balance; needs supervisor and manager approval. A reason is required.'}
            </div>
          )}
          {form.leave_type === 'unpaid' && (
            <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
              {isAr ? 'إجازة بدون راتب: لا تُخصم من رصيد الإجازة السنوية ولا تدخل فيه، وتحتاج موافقة المشرف والمدير. اكتب سبب الطلب (إلزامي).' : 'Unpaid leave: not deducted from the annual balance; needs supervisor and manager approval. A reason is required.'}
            </div>
          )}
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
            <TimePicker value={timeFrom} onChange={setTimeFrom} style={{ ...inp }} />
          </Field>
          <Field label={isAr ? 'إلى الساعة' : 'To'}>
            <TimePicker value={timeTo} onChange={setTimeTo} style={{ ...inp }} />
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
      <Field label={REASON_TYPES[form.leave_type] ? (isAr ? `${REASON_TYPES[form.leave_type].label} *` : `${REASON_TYPES[form.leave_type].labelEn} *`) : (isAr ? 'ملاحظات' : 'Notes')}>
        <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
          style={{ ...inp, resize: 'none', borderColor: REASON_TYPES[form.leave_type] && !form.notes?.trim() ? '#fca5a5' : undefined }}
          placeholder={REASON_TYPES[form.leave_type] ? (isAr ? REASON_TYPES[form.leave_type].ph : 'Enter reason (required)...') : (isAr ? 'أي تفاصيل إضافية...' : 'Any additional details...')} />
      </Field>

      <button type="submit"
        style={{ padding: '10px 32px', borderRadius: 8, border: '1.5px solid var(--text-1)', background: 'var(--card)', color: 'var(--text-1)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
        {form.leave_type === 'casual' ? (isAr ? 'رفع طلب' : 'Submit Request') : (isAr ? 'رفع طلب الإجازة' : 'Submit Leave Request')}
      </button>

      {/* ── نافذة تأكيد الطلب ── */}
      {showConfirm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--card, #fff)', borderRadius: 12, boxShadow: '0 4px 32px rgba(0,0,0,0.14)', width: '100%', maxWidth: 400, direction: 'rtl', overflow: 'hidden' }}>

            {/* رأس */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>{form.leave_type === 'casual' ? (isAr ? 'تأكيد الطلب' : 'Confirm Request') : (isAr ? 'تأكيد طلب الإجازة' : 'Confirm Leave Request')}</span>
              <button onClick={() => setShowConfirm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '1.1rem', lineHeight: 1, padding: 0, fontFamily: 'inherit' }}>✕</button>
            </div>

            {/* تفاصيل الطلب */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: isAr ? 'الاسم' : 'Name', value: profile?.full_name_ar ?? '—' },
                { label: isAr ? 'المحطة' : 'Station', value: profile?.station?.name_ar ?? profile?.station_name ?? '—' },
                { label: isAr ? 'الوظيفة' : 'Job Title', value: profile?.job_title ?? '—' },
                { label: form.leave_type === 'casual' ? (isAr ? 'نوع الطلب' : 'Request Type') : (isAr ? 'نوع الإجازة' : 'Leave Type'), value: typeLabel + (relLabel ? ` — ${relLabel}` : '') + (compLabel ? ` — ${compLabel}` : '') },
                form.leave_type === 'casual'
                  ? { label: isAr ? 'المدة' : 'Duration', value: formatHoursAr(casualHours) }
                  : { label: isAr ? 'الفترة' : 'Period', value: `${form.start_date} ← ${form.end_date} (${days} ${isAr ? 'يوم' : 'days'})` },
                form.return_date && form.leave_type !== 'casual'
                  ? { label: isAr ? 'تاريخ المباشرة' : 'Return', value: form.return_date }
                  : null,
                form.notes?.trim()
                  ? { label: REASON_TYPES[form.leave_type] ? (isAr ? 'السبب' : 'Reason') : (isAr ? 'ملاحظات' : 'Notes'), value: form.notes }
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
// نافذة «سجل الموظف»: كم مرة استأذن وأخذ إجازة وقدّم طلباً
function EmployeeStatsModal({ leave, onClose, isAr = true }) {
  const [stats, setStats] = useState(null)
  useEffect(() => { fetchEmployeeLeaveStats(leave.employee_id).then(setStats) }, [leave.employee_id])
  const hrs = h => (h > 0 ? formatHoursAr(h) : '—')
  const box = (title, n, sub) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.2 }}>{n}</div>
      {sub != null && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
  const part = (label, b) => (
    <div>
      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-1)', margin: '4px 0 8px' }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {box(isAr ? 'استئذانات مقبولة' : 'Permissions approved', b.permOk, `${isAr ? 'من' : 'of'} ${b.permReq} ${isAr ? 'مقدَّمة' : 'requested'} · ${hrs(b.permHours)}`)}
        {box(isAr ? 'إجازات مقبولة' : 'Leaves approved', b.leaveOk, `${isAr ? 'من' : 'of'} ${b.leaveReq} ${isAr ? 'مقدَّمة' : 'requested'} · ${b.leaveDays ? Number(b.leaveDays.toFixed(2)) + (isAr ? ' يوم' : ' d') : '—'}`)}
        {box(isAr ? 'طلبات مرفوضة' : 'Rejected', b.rejected, b.pending ? `${b.pending} ${isAr ? 'قيد المراجعة' : 'pending'}` : null)}
        {box(isAr ? 'إجمالي الطلبات' : 'All requests', b.total, null)}
      </div>
    </div>
  )
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div dir={isAr ? 'rtl' : 'ltr'} style={{ background: 'var(--card, #fff)', borderRadius: 12, width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>{isAr ? 'سجل الموظف' : 'Employee record'}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>{leave.employee_name}{leave.job_title ? ` · ${leave.job_title}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-3)', fontFamily: 'inherit' }}>✕</button>
        </div>
        <div style={{ padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!stats ? <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div> : (
            <>
              {part(isAr ? `هذا العام (${stats.year})` : `This year (${stats.year})`, stats.yr)}
              {part(isAr ? 'الإجمالي (كل الفترات)' : 'All time', stats.all)}
              {Object.entries(stats.yr.byType).filter(([, n]) => n > 0).length > 0 && (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-2)' }}>
                  {isAr ? 'الإجازات المقبولة هذا العام حسب النوع: ' : 'Approved leaves this year by type: '}
                  {Object.entries(stats.yr.byType).filter(([, n]) => n > 0).map(([k, n]) => `${LEAVE_TYPES.find(t => t.id === k)?.ar ?? k}: ${n}`).join(' · ')}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function LeaveCard({ leave: rawLeave, profile, onAction, onPrint, onStats, onProofUploaded, onDelete, isAr = true }) {
  const leave = decodeLeaveNotes(rawLeave)
  const [showNotes, setShowNotes]  = useState(false)
  const [actionNotes, setActionNotes] = useState('')
  const [uploadingProof, setUploadingProof] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const proofInputRef = useRef(null)

  const role        = profile?.role
  const { isRestricted: restrictedTitle } = useAuth()
  const isAdmin     = ADMIN_ROLE_VALUES.includes(role) && !restrictedTitle
  const isSupervisor = role === 'station_admin' || role === 'area_supervisor'
  const isOwn       = leave.employee_id === profile?.id
  const { supervisedStationIds, actsAsSupervisor, allowCap, grantCap, assignedEmployeeIds, jobsFor } = useAuth()
  const leaveJobs = jobsFor('leaves')
  // مساعد المدير أو مسمى مخصص بصلاحية "يوافق كمشرف": مرحلة المشرف لموظفي محطاته المخصصة (يوافق أولاً ثم الأدمن)
  const isAssistant = actsAsSupervisor || grantCap('assigned_leaves') || leaveJobs.length > 0
  // موافقة كمشرف: لموظفي محطاته المخصصة، أو لموظفين محددين له بالاسم
  const inMySupervisedStations = (actsAsSupervisor && !!supervisedStationIds?.includes(leave.station_id))
    || (grantCap('assigned_leaves') && !!assignedEmployeeIds?.includes(leave.employee_id))
    || leaveJobs.includes(leave.job_title)

  const typeLabel   = LEAVE_TYPES.find(t => t.id === leave.leave_type)?.ar ?? leave.leave_type
  const typeIcon    = LEAVE_TYPES.find(t => t.id === leave.leave_type)?.icon ?? ''
  const relLabel    = leave.bereavement_rel ? BEREAVEMENT_RELS.find(r => r.id === leave.bereavement_rel)?.ar : null
  const compLabel   = leave.compensatory_reason ? COMPENSATORY_REASONS.find(r => r.id === leave.compensatory_reason)?.ar : null
  const casualHoursDisplay = leave.leave_type === 'casual' && leave.days_count
    ? formatHoursAr(leave.days_count * 24) : null

  // هل يمكن لهذا المستخدم الموافقة/الرفض؟
  const canActSupervisor = ((isSupervisor && allowCap('leaves_supervise')) || inMySupervisedStations) && leave.supervisor_status === 'pending' && !isOwn
  // مساعد المدير اللي وافق كمشرف ما يعتمد نفس الإجازة كأدمن — الاعتماد النهائي لأدمن آخر
  const didSupervisorStage = isAssistant && leave.supervisor_status !== 'pending' && leave.supervisor_by === profile?.full_name_ar
  const canActManager    = isAdmin && leave.manager_status === 'pending' && !didSupervisorStage && allowCap('leaves_final_approve')
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
      // الموظف ما يقدر يعدّل إجازته مباشرة (سياسة القاعدة) — نحفظ المرفق عبر دالة تتحقق أنه صاحب الطلب
      const { data: saved, error } = await supabase.rpc('add_leave_proof', { p_leave_id: leave.id, p_url: url })
      if (error) throw error
      if (saved !== true) throw new Error('تعذّر حفظ المرفق على الطلب (قد تكون مهلة الرفع انتهت أو سبق رفع مرفق)')
      onProofUploaded?.()
    } catch (err) {
      alert('فشل رفع المرفق: ' + err.message)
    }
    setUploadingProof(false)
  }

  const ST = STATUS_STYLE[leave.status] ?? STATUS_STYLE.pending
  const statusText = leave.status === 'approved' ? (isAr ? 'مقبولة' : 'Approved') : leave.status === 'rejected' ? (isAr ? 'مرفوضة' : 'Rejected') : (isAr ? 'قيد المراجعة' : 'Pending')

  const isRejected = leave.status === 'rejected'

  return (
    <div dir="rtl" style={{
      borderRadius: 10,
      border: `1px solid ${isRejected ? '#fca5a5' : 'var(--border)'}`,
      borderInlineStart: isRejected ? '5px solid #dc2626' : undefined,
      background: isRejected ? '#fff7f7' : 'var(--card)',
      overflow: 'hidden',
    }}>

      {/* ── رأس البطاقة ── */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-1)' }}>{typeLabel}</span>
            {isRejected ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 800, color: '#fff', background: '#dc2626', borderRadius: 99, padding: '2px 10px' }}>
                <span aria-hidden="true">✕</span>{isAr ? 'مرفوضة' : 'Rejected'}
              </span>
            ) : !NO_APPROVAL_TYPES.includes(leave.leave_type) && (
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
              {new Date(leave.created_at).toLocaleDateString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB')}{' — '}
              {new Date(leave.created_at).toLocaleTimeString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* أزرار الطباعة/الحذف */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={() => onStats?.(leave)} style={{
            padding: '5px 12px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--text-2)', fontSize: '0.72rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {isAr ? 'سجل الموظف' : 'Record'}
          </button>
          {(fullyApproved || isOwn) && allowCap('leaves_print') && (
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
  { id: 'new',      ar: 'طلب إجازة',       en: 'New Request',    icon: '' },
  { id: 'mine',     ar: 'طلباتي',           en: 'My Requests',   icon: '' },
  { id: 'pending',  ar: 'بانتظار موافقتي', en: 'Pending Approval', icon: '', supervisorOnly: true },
  { id: 'all',      ar: 'جميع الطلبات',    en: 'All Requests',  icon: '',  supervisorOnly: true },
  { id: 'balances', ar: 'أرصدة الإجازات',  en: 'Leave Balances', icon: '', adminOnly: true },
]

export default function LeavePage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile, isAdmin, isGeneralAdmin, isAreaSupervisor, allowedStationIds, isRestricted, grantCap, allowCap, actsAsSupervisor, assignedEmployeeIds, supervisedStationIds, jobsFor } = useAuth()
  const leaveJobs   = jobsFor('leaves')
  const role        = profile?.role
  const isSupervisor = (role === 'station_admin' || role === 'area_supervisor') && allowCap('leaves_supervise')
  const canSupervise = isAdmin || isSupervisor || actsAsSupervisor || grantCap('assigned_leaves') || leaveJobs.length > 0
  // حساب مقيّد: يشوف طلبات موظفيه المحددين والمرحّلين فقط
  const restrictedScope = q => {
    const parts = []
    if (grantCap('assigned_leaves') && assignedEmployeeIds?.length) parts.push(`employee_id.in.(${assignedEmployeeIds.join(',')})`)
    if (leaveJobs.length) parts.push(`job_title.in.(${leaveJobs.join(',')})`)
    if (actsAsSupervisor && supervisedStationIds?.length) parts.push(`station_id.in.(${supervisedStationIds.join(',')})`)
    return parts.length ? q.or(parts.join(',')) : q.eq('id', '00000000-0000-0000-0000-000000000000')
  }

  const [searchParams] = useSearchParams()
  const [tab, setTab]       = useState(() => searchParams.get('tab') || (allowCap('leaves_request') ? 'new' : 'mine'))
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [statsFor, setStatsFor] = useState(null)   // طلب نعرض سجل صاحبه
  const [filterStatus, setFilterStatus] = useState('all')
  const [balances, setBalances] = useState([])
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [balanceSearch, setBalanceSearch] = useState('')

  const visibleTabs = TABS_CFG.filter(t => {
    if (t.adminOnly && !isGeneralAdmin) return false
    if (t.supervisorOnly && !canSupervise) return false
    if (t.id === 'new' && !allowCap('leaves_request')) return false
    return true
  })

  async function load() {
    const cacheKey = `leaves_${tab}_${profile?.id}`
    const cached = getCached(cacheKey)
    if (cached) { setLeaves(cached); setLoading(false) } else { setLoading(true) }
    let q = supabase.from('leaves').select('*, station:station_id(name_ar, name_en)').order('created_at', { ascending: false })
    if (tab === 'mine')    q = q.eq('employee_id', profile.id)
    if (tab === 'pending') {
      if (isRestricted) {
        q = restrictedScope(q.eq('supervisor_status', 'pending'))
      } else if (isAdmin) {
        q = q.eq('status', 'pending')
      } else if ((isAreaSupervisor || role === 'station_admin') && allowedStationIds?.length) {
        q = q.eq('supervisor_status', 'pending').in('station_id', allowedStationIds)
      } else if (isSupervisor) {
        q = q.eq('supervisor_status', 'pending').eq('station_id', profile.station_id)
      }
    }
    if (tab === 'all' && !isAdmin) {
      if (isRestricted) q = restrictedScope(q)
      else if ((isAreaSupervisor || role === 'station_admin') && allowedStationIds?.length) q = q.in('station_id', allowedStationIds)
      else q = q.eq('station_id', profile.station_id)
    }
    const { data } = await q
    if (data) { setCached(cacheKey, data); setLeaves(data) }
    setLoading(false)
  }

  useEffect(() => { if (tab !== 'new' && tab !== 'balances') load() }, [tab])

  async function loadBalances() {
    setLoadingBalances(true)
    let uq = supabase.from('users')
      .select('id, full_name_ar, hire_date, station_id, job_number, username, leave_balance_override, leave_balance_override_date, station:station_id(name_ar, name_en)')
      .eq('is_active', true).order('full_name_ar')
    if (!isGeneralAdmin) {
      if ((isAreaSupervisor || role === 'station_admin') && allowedStationIds?.length) uq = uq.in('station_id', allowedStationIds)
      else uq = uq.eq('station_id', profile.station_id)
    }
    const { data: emps } = await uq
    const empList = (emps ?? []).filter(e => e.hire_date || e.leave_balance_override != null)
    const empIds = empList.map(e => e.id)
    let byEmployee = {}
    if (empIds.length) {
      const { data: leaveRows } = await supabase.from('leaves')
        .select('employee_id, start_date, days_count')
        .eq('leave_type', 'annual').eq('status', 'approved')
        .in('employee_id', empIds)
      byEmployee = (leaveRows ?? []).reduce((m, r) => {
        (m[r.employee_id] ??= []).push(r)
        return m
      }, {})
    }
    setBalances(empList.map(e => {
      const rows = byEmployee[e.id] ?? []
      const entitlement = annualEntitlement(e.hire_date)
      const jobNumber = e.job_number
        ?? (e.username?.toUpperCase().startsWith('NW') ? e.username.slice(2) : e.username) ?? null
      return {
        ...e,
        job_number: jobNumber,
        entitlement,
        accrued: accruedBalance(e.hire_date, entitlement),
        used: rows.reduce((s, r) => s + (r.days_count ?? 0), 0),
        remaining: leaveRemaining(e, rows),
      }
    }))
    setLoadingBalances(false)
  }

  useEffect(() => { if (tab === 'balances') loadBalances() }, [tab])

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
      const isCasual = leave.leave_type === 'casual'
      const what = isCasual ? 'استئذانك' : 'إجازتك'
      const durTxt = isCasual ? formatHoursAr(Number(leave.days_count) * 24) : `${leave.days_count} أيام`

      if (level === 'supervisor') {
        // أشعر الموظف
        await notifyMany([leave.employee_id], {
          title: isApproved ? `✓ وافق المشرف على ${what}` : `✗ رفض المشرف ${what}`,
          body: `${typeLabel} · ${durTxt}${notes ? ' · ' + notes : ''}`,
          type: isApproved ? 'success' : 'error', refType: 'leave', refId: id,
        })
        // إذا وافق → أشعر الأدمن
        if (isApproved) {
          const { data: admins } = await supabase.from('users').select('id').in('role', ADMIN_ROLE_VALUES).eq('is_active', true)
          await notifyMany((admins ?? []).map(a => a.id).filter(aid => aid !== profile.id), {
            title: `${isCasual ? 'طلب استئذان' : 'طلب إجازة'} بانتظار موافقتك — ${leave.employee_name}`,
            body: `${typeLabel} · ${durTxt} · وافق عليه المشرف`,
            type: 'warning', refType: 'leave', refId: id,
          })
        }
      } else {
        // مدير/أدمن يوافق أو يرفض → أشعر الموظف والمشرف
        await notifyMany([leave.employee_id], {
          title: isApproved ? `✓ تمت الموافقة على ${what}` : `✗ رفض المدير ${what}`,
          body: `${typeLabel} · ${durTxt}${notes ? ' · ' + notes : ''}`,
          type: isApproved ? 'success' : 'error', refType: 'leave', refId: id,
        })

        const { data: emp } = await supabase.from('users')
          .select('supervisor_id, station_id').eq('id', leave.employee_id).single()
        const supervisorIds = await findSupervisorIds(emp?.station_id, emp?.supervisor_id, leave.employee_id, leave.job_title)
        await notifyMany(supervisorIds.filter(sid => sid !== profile.id), {
          title: isApproved
            ? `✓ تمت الموافقة على ${isCasual ? 'استئذان' : 'إجازة'} ${leave.employee_name}`
            : `✗ رُفض ${isCasual ? 'استئذان' : 'إجازة'} ${leave.employee_name}`,
          body: `${typeLabel} · ${durTxt}${notes ? ' · ' + notes : ''}`,
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
    // نافذة الطباعة تُفتح فور الضغط قبل أي انتظار (وإلا يحجبها المتصفح، خصوصاً بالجوال)
    const w = window.open('', '_blank')
    if (w) { w.document.write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;color:#64748b;text-align:center;padding-top:38vh">جارٍ تجهيز النموذج…</body>'); w.document.close() }
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
    const stats = await fetchEmployeeLeaveStats(leave.employee_id)
    printLeave(w, leave, emp?.full_name_ar ?? leave.employee_name, stationName, empProfile, usedAnnual, stats)
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

      <div style={{ maxWidth: tab === 'new' ? 860 : tab === 'balances' ? 960 : 720, margin: '0 auto', padding: '24px 20px' }}>

        {statsFor && <EmployeeStatsModal leave={statsFor} isAr={isAr} onClose={() => setStatsFor(null)} />}

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
                  {saved === 'casual' ? (isAr ? '✓ تم رفع الطلب بنجاح — بانتظار الموافقة' : '✓ Request submitted — awaiting approval') : (isAr ? '✓ تم رفع طلب الإجازة بنجاح — بانتظار الموافقة' : '✓ Leave request submitted — awaiting approval')}
                </div>
              )}
              <NewLeaveForm profile={profile} isAr={isAr} onSaved={t => { setSaved(t || true); setTimeout(() => setSaved(false), 4000) }} />
            </div>
          </div>
        )}

        {/* أرصدة الإجازات */}
        {tab === 'balances' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              value={balanceSearch} onChange={e => setBalanceSearch(e.target.value)}
              placeholder={isAr ? 'بحث بالاسم أو الرقم الوظيفي...' : 'Search by name or job number...'}
              style={{ ...inp, maxWidth: 280 }}
            />
            <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'auto' }}>
              {loadingBalances ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>…</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 640 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {(isAr
                        ? ['الموظف', 'الرقم الوظيفي', 'المحطة', 'تاريخ المباشرة', 'سنوات الخدمة', 'الرصيد المستحق', 'المستخدم', 'المتبقي']
                        : ['Employee', 'Job Number', 'Station', 'Hire Date', 'Years', 'Accrued', 'Used', 'Remaining']
                      ).map((h, i) => (
                        <th key={i} style={{ padding: '10px 14px', textAlign: isAr ? 'right' : 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {balances
                      .filter(b => !balanceSearch ||
                        matchesSearch(b.full_name_ar, balanceSearch) || matchesSearch(b.job_number, balanceSearch))
                      .map(b => (
                      <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-1)' }}>{b.full_name_ar}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{b.job_number ?? '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{isAr ? b.station?.name_ar : b.station?.name_en}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{b.hire_date}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-2)', textAlign: 'center' }}>{yearsOfService(b.hire_date)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-2)', textAlign: 'center' }}>{b.accrued.toFixed(1)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-2)', textAlign: 'center' }}>{b.used}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'center', color: b.remaining > 0 ? '#166534' : '#dc2626' }}>
                          {b.remaining.toFixed(2)}
                          {b.leave_balance_override != null && (
                            <span style={{ marginInlineStart: 5, fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-3)' }}>({isAr ? 'يدوي' : 'manual'})</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {balances.length === 0 && (
                      <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>{isAr ? 'لا يوجد موظفون' : 'No employees'}</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: 0 }}>
              {isAr
                ? 'الرصيد المستحق يُحسب تراكمياً منذ تاريخ المباشرة (21 يوم/سنة لمن أقل من 5 سنوات خدمة، 30 يوم/سنة لـ 5 سنوات فأكثر) مطروحاً منه الإجازات السنوية المعتمدة — تقديري وليس رسمياً.'
                : 'Accrued balance is calculated cumulatively since the hire date (21 days/year under 5 years of service, 30 days/year at 5+) minus approved annual leave taken — an estimate, not an official figure.'}
            </p>
          </div>
        )}

        {/* قائمة الطلبات */}
        {tab !== 'new' && tab !== 'balances' && (
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
              <LeaveCard key={l.id} leave={l} profile={profile} isAr={isAr} onAction={handleAction} onPrint={handlePrint} onStats={setStatsFor} onProofUploaded={load} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
