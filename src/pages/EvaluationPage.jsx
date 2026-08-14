import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

const MONO = "'IBM Plex Mono', monospace"
const STAR_THRESHOLD = 98

// ── معايير تقييم الموظفين ─────────────────────────────────────
const EMP_CRITERIA = [
  { key: 'attendance',    ar: 'الالتزام بالدوام والحضور',       en: 'Attendance & Commitment',          weight: 10 },
  { key: 'work_quality',  ar: 'جودة العمل والدقة',              en: 'Work Quality & Accuracy',          weight: 15 },
  { key: 'customer',      ar: 'التعامل مع الركاب والعملاء',      en: 'Passenger & Customer Service',     weight: 15 },
  { key: 'discipline',    ar: 'الانضباط الوظيفي والمظهر',       en: 'Discipline & Appearance',          weight: 10 },
  { key: 'productivity',  ar: 'الإنتاجية وإنجاز المهام',        en: 'Productivity & Task Completion',   weight: 15 },
  { key: 'teamwork',      ar: 'التعاون مع الفريق',              en: 'Teamwork & Collaboration',         weight: 10 },
  { key: 'compliance',    ar: 'الالتزام بالإجراءات والسياسات',  en: 'Procedures & Policy Compliance',   weight: 10 },
  { key: 'initiative',    ar: 'المبادرة وحل المشكلات',          en: 'Initiative & Problem Solving',     weight: 10 },
  { key: 'development',   ar: 'التطوير الذاتي والتعلم',         en: 'Self-Development & Learning',      weight: 5  },
  { key: 'integrity',     ar: 'الأمانة والنزاهة',               en: 'Honesty & Integrity',              weight: 5  },
]

// ── معايير تقييم المشرفين ─────────────────────────────────────
const SUP_CRITERIA = [
  { key: 'leadership',    ar: 'القيادة وإدارة الفريق',              en: 'Leadership & Team Management',          weight: 20 },
  { key: 'planning',      ar: 'التخطيط وتنظيم العمل',              en: 'Planning & Work Organization',          weight: 15 },
  { key: 'communication', ar: 'التواصل وحل المشكلات',              en: 'Communication & Problem Solving',        weight: 15 },
  { key: 'attendance',    ar: 'الالتزام بالدوام والحضور',           en: 'Attendance & Commitment',               weight: 10 },
  { key: 'targets',       ar: 'تحقيق الأهداف والمؤشرات',           en: 'Targets & KPI Achievement',             weight: 15 },
  { key: 'compliance',    ar: 'الالتزام بالتعليمات والسياسات',     en: 'Instructions & Policy Compliance',      weight: 10 },
  { key: 'development',   ar: 'تطوير الكوادر وتحفيزهم',            en: 'Staff Development & Motivation',        weight: 10 },
  { key: 'integrity',     ar: 'الأمانة والنزاهة والمظهر',          en: 'Honesty, Integrity & Appearance',       weight: 5  },
]

// ── معايير تقييم المحطات ──────────────────────────────────────
const STN_CRITERIA = [
  { key: 'quality',       ar: 'الجودة والمحافظة على الممتلكات',       en: 'Quality & Property Maintenance',    weight: 20 },
  { key: 'cleanliness',   ar: 'نظافة المحطة ودورات المياه',           en: 'Station & Restroom Cleanliness',    weight: 20 },
  { key: 'security',      ar: 'الحراسات الأمنية',                     en: 'Security Guards',                   weight: 15 },
  { key: 'safety',        ar: 'أدوات السلامة والإسعافات الأولية',     en: 'Safety & First Aid Equipment',      weight: 15 },
  { key: 'disability',    ar: 'خدمات ذوي الاحتياجات الخاصة',          en: 'Special Needs Services',            weight: 10 },
  { key: 'compliance',    ar: 'الالتزام بالتعليمات',                  en: 'Instructions Compliance',           weight: 10 },
  { key: 'emp_appear',    ar: 'المظهر الخارجي للموظف',                en: 'Employee Appearance',               weight: 5  },
  { key: 'stn_appear',    ar: 'المظهر الخارجي للمحطة',                en: 'Station Appearance',                weight: 5  },
]

const SCORE_LABELS    = ['', 'ضعيف', 'مقبول', 'جيد', 'جيد جداً', 'ممتاز']
const SCORE_LABELS_EN = ['', 'Poor',  'Acceptable', 'Good', 'Very Good', 'Excellent']
const SCORE_COLORS    = ['', '#DC2626', '#D97706', '#2563EB', '#059669', '#7C3AED']

const ROLE_LABELS = {
  general_admin:    'المدير التنفيذي التجاري',
  station_admin:    'مشرف المحطة',
  accountant:       'محاسب',
  station_employee: 'موظف محطة',
  shift_supervisor: 'مشرف وردية',
}

const JOB_TITLES = {
  area_supervisor:    { ar: 'مشرف منطقة',  en: 'Area Supervisor'   },
  station_supervisor: { ar: 'مشرف محطة',   en: 'Station Supervisor' },
  shift_supervisor:   { ar: 'مشرف وردية',  en: 'Shift Supervisor'  },
  customer_service:   { ar: 'خدمة عملاء',  en: 'Customer Service'  },
  dispatcher:         { ar: 'مرحّل',        en: 'Dispatcher'        },
}
function getJobTitle(emp, isAr) {
  if (emp.job_title && JOB_TITLES[emp.job_title]) return JOB_TITLES[emp.job_title][isAr ? 'ar' : 'en']
  if (emp.job_title) return emp.job_title
  return isAr ? (ROLE_LABELS[emp.role] || emp.role) : (ROLE_LABELS_EN[emp.role] || emp.role)
}

const ROLE_LABELS_EN = {
  general_admin:    'Executive Admin',
  station_admin:    'Station Supervisor',
  accountant:       'Accountant',
  station_employee: 'Station Employee',
  shift_supervisor: 'Shift Supervisor',
  area_supervisor:  'Area Supervisor',
}

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']

function StationPicker({ stations, value, onChange, isAr }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  const selected = stations.find(s => s.id === value)
  const filtered = stations.filter(s =>
    !q || (s.name_ar || '').toLowerCase().includes(q.toLowerCase()) || (s.name_en || '').toLowerCase().includes(q.toLowerCase())
  )
  useEffect(() => {
    if (!open) setQ('')
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative', flex: '0 0 auto' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--card)', color:'var(--text-1)', fontSize:'0.82rem', fontFamily:'inherit', cursor:'pointer', minWidth:160, justifyContent:'space-between' }}>
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {selected ? (isAr ? selected.name_ar : (selected.name_en || selected.name_ar)) : (isAr ? 'كل المحطات' : 'All Stations')}
        </span>
        <span style={{ fontSize:'0.65rem', color:'var(--text-3)', flexShrink:0 }}>▼</span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:200, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 6px 24px rgba(0,0,0,0.12)', minWidth:220, maxWidth:300, overflow:'hidden' }}>
          <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder={isAr ? 'ابحث عن محطة...' : 'Search station...'}
              style={{ width:'100%', padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-1)', fontSize:'0.8rem', fontFamily:'inherit', outline:'none' }} />
          </div>
          <div style={{ maxHeight:240, overflowY:'auto' }}>
            <div onClick={() => { onChange('all'); setOpen(false) }}
              style={{ padding:'9px 14px', fontSize:'0.82rem', cursor:'pointer', fontWeight: value==='all' ? 700 : 400, background: value==='all' ? 'var(--surface)' : 'transparent', color:'var(--text-1)' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--surface)'}
              onMouseLeave={e => e.currentTarget.style.background = value==='all' ? 'var(--surface)' : 'transparent'}>
              {isAr ? 'كل المحطات' : 'All Stations'}
            </div>
            {filtered.length === 0 && (
              <div style={{ padding:'12px 14px', fontSize:'0.8rem', color:'var(--text-3)', textAlign:'center' }}>{isAr ? 'لا توجد نتائج' : 'No results'}</div>
            )}
            {filtered.map(s => (
              <div key={s.id} onClick={() => { onChange(s.id); setOpen(false) }}
                style={{ padding:'9px 14px', fontSize:'0.82rem', cursor:'pointer', fontWeight: value===s.id ? 700 : 400, background: value===s.id ? 'var(--surface)' : 'transparent', color:'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--surface)'}
                onMouseLeave={e => e.currentTarget.style.background = value===s.id ? 'var(--surface)' : 'transparent'}>
                {isAr ? s.name_ar : (s.name_en || s.name_ar)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function calcScore(scores, criteria) {
  let total = 0, totalWeight = 0
  for (const c of criteria) {
    const s = scores[c.key]
    if (s != null && s > 0) { total += (s / 5) * c.weight; totalWeight += c.weight }
  }
  if (totalWeight === 0) return 0
  return Math.round((total / totalWeight) * 100 * 10) / 10
}

function Svg({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function StarBadge({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#F59E0B">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  )
}

// ── مكوّن نموذج التقييم ────────────────────────────────────────
function EvalForm({ criteria, scores, onChange, notes, onNotes, disabled, isAr }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {criteria.map((c, i) => {
        const s = scores[c.key] || 0
        return (
          <div key={c.key} style={{
            padding: '14px 20px',
            borderBottom: i < criteria.length - 1 ? '1px solid var(--border)' : 'none',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)' }}>{isAr ? c.ar : c.en}</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.62rem', color: 'var(--text-3)', fontFamily: MONO }}>
                {isAr ? 'وزن:' : 'Weight:'} {c.weight}%
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1,2,3,4,5].map(v => (
                <button key={v} onClick={() => !disabled && onChange(c.key, v)}
                  style={{
                    width: 38, height: 38, borderRadius: 8,
                    border: `2px solid ${s === v ? SCORE_COLORS[v] : 'var(--border)'}`,
                    background: s === v ? `${SCORE_COLORS[v]}15` : 'var(--surface)',
                    color: s === v ? SCORE_COLORS[v] : 'var(--text-3)',
                    fontWeight: s === v ? 800 : 500,
                    fontSize: '0.85rem', fontFamily: MONO,
                    cursor: disabled ? 'default' : 'pointer',
                    transition: 'all 0.12s',
                  }}>
                  {v}
                </button>
              ))}
            </div>
            {s > 0 && (
              <span style={{
                fontSize: '0.68rem', fontWeight: 700,
                color: SCORE_COLORS[s], minWidth: 60,
                fontFamily: MONO,
              }}>{isAr ? SCORE_LABELS[s] : SCORE_LABELS_EN[s]}</span>
            )}
          </div>
        )
      })}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
        <p style={{ margin: '0 0 8px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {isAr ? 'ملاحظات' : 'Notes'}
        </p>
        <textarea
          value={notes}
          onChange={e => onNotes(e.target.value)}
          disabled={disabled}
          placeholder={isAr ? 'أضف ملاحظاتك هنا...' : 'Add your notes here...'}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '10px 12px',
            fontSize: '0.8rem', color: 'var(--text-1)',
            fontFamily: 'inherit', resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>
    </div>
  )
}

// ── شريط النتيجة ───────────────────────────────────────────────
function ScoreBar({ score }) {
  const color = score >= 85 ? '#1C2B4A' : score >= 50 ? '#555' : '#999'
  const outOf10 = (score / 10).toFixed(1)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', minWidth: 80 }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 60, lineHeight: 1.2 }}>
        <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '0.92rem', color }}>
          {outOf10}<span style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 500 }}>/10</span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: '0.65rem', color: 'var(--text-3)' }}>{score}%</span>
      </div>
      {score >= STAR_THRESHOLD && <StarBadge size={14} />}
    </div>
  )
}

// ── صفحة تقييم الموظف (نموذج) ────────────────────────────────
function useEscClose(onClose) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

function EmployeeEvalModal({ employee, month, year, existing, onClose, onSave, isAdmin, evaluatorId, isAr }) {
  const [scores, setScores] = useState(existing?.scores || {})
  const [notes, setNotes]   = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)
  useEscClose(onClose)

  const totalScore = calcScore(scores, EMP_CRITERIA)
  const allFilled  = EMP_CRITERIA.every(c => scores[c.key] > 0)

  async function handleSave() {
    if (!allFilled) return setErr(isAr ? 'يرجى تقييم جميع البنود قبل الحفظ' : 'Please evaluate all items before saving')
    setSaving(true); setErr(null)
    const payload = {
      evaluator_id: evaluatorId,
      employee_id: employee.id,
      station_id: employee.station_id,
      eval_month: month, eval_year: year,
      scores, notes, total_score: totalScore,
    }
    let error, data
    if (existing) {
      ;({ error } = await supabase.from('employee_evaluations').update(payload).eq('id', existing.id))
    } else {
      ;({ error, data } = await supabase.from('employee_evaluations').insert(payload).select().maybeSingle())
    }
    setSaving(false)
    if (error) return setErr(error.message)
    // إشعار للموظف — استبدل القديم عبر دالة SECURITY DEFINER
    const isStar = totalScore >= 98
    await supabase.rpc('replace_eval_notification', {
      p_user_id: employee.id,
      p_type: isStar ? 'success' : 'info',
      p_title: isStar ? `تقييمك ${totalScore}/10 ⭐ — ممتاز!` : `صدر تقييمك لشهر ${MONTHS_AR[month - 1]}`,
      p_body: isStar ? `حصلت على النجمة المميزة بنتيجة ${totalScore}/10` : `نتيجتك: ${totalScore}/10 — يمكنك مراجعة التفاصيل في قسم "تقييمي"`,
    })
    // تحديث كاش النجمة فوراً
    try {
      const now = new Date()
      localStorage.setItem(`nwbus_star_${employee.id}`, JSON.stringify({ month: now.getMonth() + 1, year: now.getFullYear(), star: isStar }))
    } catch {}
    onSave()
  }

  const readonly = !!existing && !isAdmin

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, width: '100%', maxWidth: 700, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* رأس */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-1)' }}>
              {isAr ? 'تقييم:' : 'Evaluate:'} {employee.full_name_ar || employee.full_name}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)', fontFamily: MONO }}>
              {isAr ? MONTHS_AR[month - 1] : MONTHS_EN[month - 1]} {year} · {getJobTitle(employee, isAr)}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}>
            <Svg d="M18 6L6 18M6 6l12 12" size={18} />
          </button>
        </div>

        {/* النتيجة الحالية */}
        {Object.keys(scores).length > 0 && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <ScoreBar score={totalScore} />
          </div>
        )}

        {/* النموذج */}
        <EvalForm
          criteria={EMP_CRITERIA}
          scores={scores}
          onChange={(k, v) => setScores(p => ({ ...p, [k]: v }))}
          notes={notes}
          onNotes={setNotes}
          disabled={readonly}
          isAr={isAr}
        />

        {/* تذييل */}
        {!readonly && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            {err && <p style={{ margin: 0, fontSize: '0.72rem', color: '#DC2626' }}>{err}</p>}
            <div style={{ display: 'flex', gap: 10, marginInlineStart: 'auto' }}>
              <button onClick={onClose} style={{ padding: '9px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={handleSave} disabled={saving || !allFilled} style={{
                padding: '9px 24px',
                background: allFilled ? 'var(--accent)' : 'var(--surface-2)',
                border: 'none', borderRadius: 7,
                cursor: allFilled ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700,
                color: allFilled ? '#fff' : 'var(--text-3)',
                transition: 'all 0.12s',
              }}>
                {saving ? (isAr ? 'جارٍ الحفظ…' : 'Saving...') : existing ? (isAr ? 'تحديث التقييم' : 'Update Evaluation') : (isAr ? 'حفظ التقييم' : 'Save Evaluation')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── مودال تقييم المشرفين ─────────────────────────────────────
function SupervisorEvalModal({ supervisor, month, year, existing, onClose, onSave, evaluatorId, isAr }) {
  const [scores, setScores] = useState(existing?.scores || {})
  const [notes, setNotes]   = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)
  useEscClose(onClose)

  const totalScore = calcScore(scores, SUP_CRITERIA)
  const allFilled  = SUP_CRITERIA.every(c => scores[c.key] > 0)

  async function handleSave() {
    if (!allFilled) return setErr(isAr ? 'يرجى تقييم جميع البنود قبل الحفظ' : 'Please evaluate all items before saving')
    setSaving(true); setErr(null)
    const payload = {
      evaluator_id: evaluatorId,
      supervisor_id: supervisor.id,
      supervisor_role: supervisor.role,
      station_id: supervisor.station_id || null,
      eval_month: month, eval_year: year,
      scores, notes, total_score: totalScore,
    }
    let error
    if (existing) {
      ;({ error } = await supabase.from('supervisor_evaluations').update(payload).eq('id', existing.id))
    } else {
      ;({ error } = await supabase.from('supervisor_evaluations').insert(payload))
    }
    setSaving(false)
    if (error) return setErr(error.message)
    // إشعار للمشرف — استبدل القديم عبر دالة SECURITY DEFINER
    const isStar = totalScore >= 98
    await supabase.rpc('replace_eval_notification', {
      p_user_id: supervisor.id,
      p_type: isStar ? 'success' : 'info',
      p_title: isStar ? `تقييمك ${totalScore}/10 ⭐ — ممتاز!` : `صدر تقييمك لشهر ${MONTHS_AR[month - 1]}`,
      p_body: isStar ? `حصلت على النجمة المميزة بنتيجة ${totalScore}/10` : `نتيجتك: ${totalScore}/10 — يمكنك مراجعة التفاصيل في قسم "تقييمي"`,
    })
    try {
      const now = new Date()
      localStorage.setItem(`nwbus_star_${supervisor.id}`, JSON.stringify({ month: now.getMonth() + 1, year: now.getFullYear(), star: isStar }))
    } catch {}
    onSave()
  }

  const supRoleLabel = isAr
    ? (supervisor.role === 'area_supervisor' ? 'مشرف المنطقة' : 'مشرف المحطة')
    : (supervisor.role === 'area_supervisor' ? 'Area Supervisor' : 'Station Supervisor')

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, width: '100%', maxWidth: 700, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-1)' }}>
              {isAr ? 'تقييم:' : 'Evaluate:'} {supervisor.full_name_ar || supervisor.full_name}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)', fontFamily: MONO }}>
              {isAr ? MONTHS_AR[month - 1] : MONTHS_EN[month - 1]} {year} · {supRoleLabel}
              {supervisor.station?.name_ar ? ` · ${supervisor.station.name_ar}` : ''}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}>
            <Svg d="M18 6L6 18M6 6l12 12" size={18} />
          </button>
        </div>

        {Object.keys(scores).length > 0 && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <ScoreBar score={totalScore} />
          </div>
        )}

        <EvalForm
          criteria={SUP_CRITERIA}
          scores={scores}
          onChange={(k, v) => setScores(p => ({ ...p, [k]: v }))}
          notes={notes}
          onNotes={setNotes}
          disabled={false}
          isAr={isAr}
        />

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {err && <p style={{ margin: 0, fontSize: '0.72rem', color: '#DC2626' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, marginInlineStart: 'auto' }}>
            <button onClick={onClose} style={{ padding: '9px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button onClick={handleSave} disabled={saving || !allFilled} style={{
              padding: '9px 24px',
              background: allFilled ? '#7C3AED' : 'var(--surface-2)',
              border: 'none', borderRadius: 7,
              cursor: allFilled ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700,
              color: allFilled ? '#fff' : 'var(--text-3)',
            }}>
              {saving ? (isAr ? 'جارٍ الحفظ…' : 'Saving...') : existing ? (isAr ? 'تحديث التقييم' : 'Update Evaluation') : (isAr ? 'حفظ التقييم' : 'Save Evaluation')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── صفحة تقييم المحطة ────────────────────────────────────────
function StationEvalModal({ station, month, year, existing, onClose, onSave, evaluatorId, isAr }) {
  const [scores, setScores] = useState(existing?.scores || {})
  const [notes, setNotes]   = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)
  useEscClose(onClose)

  const totalScore = calcScore(scores, STN_CRITERIA)
  const allFilled  = STN_CRITERIA.every(c => scores[c.key] > 0)

  async function handleSave() {
    if (!allFilled) return setErr(isAr ? 'يرجى تقييم جميع البنود' : 'Please evaluate all items')
    setSaving(true); setErr(null)
    const payload = {
      evaluator_id: evaluatorId,
      station_id: station.id,
      eval_month: month, eval_year: year,
      scores, notes, total_score: totalScore,
    }
    let error
    if (existing) {
      ;({ error } = await supabase.from('station_evaluations').update(payload).eq('id', existing.id))
    } else {
      ;({ error } = await supabase.from('station_evaluations').insert(payload))
    }
    setSaving(false)
    if (error) return setErr(error.message)
    onSave()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, width: '100%', maxWidth: 700, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-1)' }}>
              {isAr ? 'تقييم محطة:' : 'Station Evaluation:'} {station.name_ar}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)', fontFamily: MONO }}>
              {isAr ? MONTHS_AR[month - 1] : MONTHS_EN[month - 1]} {year}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}>
            <Svg d="M18 6L6 18M6 6l12 12" size={18} />
          </button>
        </div>

        {Object.keys(scores).length > 0 && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <ScoreBar score={totalScore} />
          </div>
        )}

        <EvalForm
          criteria={STN_CRITERIA}
          scores={scores}
          onChange={(k, v) => setScores(p => ({ ...p, [k]: v }))}
          notes={notes}
          onNotes={setNotes}
          disabled={false}
          isAr={isAr}
        />

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {err && <p style={{ margin: 0, fontSize: '0.72rem', color: '#DC2626' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, marginInlineStart: 'auto' }}>
            <button onClick={onClose} style={{ padding: '9px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button onClick={handleSave} disabled={saving || !allFilled} style={{
              padding: '9px 24px',
              background: allFilled ? 'var(--accent)' : 'var(--surface-2)',
              border: 'none', borderRadius: 7,
              cursor: allFilled ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700,
              color: allFilled ? '#fff' : 'var(--text-3)',
            }}>
              {saving ? (isAr ? 'جارٍ الحفظ…' : 'Saving...') : existing ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'حفظ التقييم' : 'Save Evaluation')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ══════════════════════════════════════════════════════════════
export default function EvaluationPage() {
  const { profile, isAdmin, isGeneralAdmin, allowedStationIds } = useAuth()
  const { i18n }   = useTranslation()
  const isAr       = i18n.language === 'ar'
  const canEvalEmp = ['general_admin','station_admin','shift_supervisor','area_supervisor'].includes(profile?.role)
  const canEvalStn = ['general_admin','station_admin','area_supervisor'].includes(profile?.role)
  const canEvalSup = isGeneralAdmin

  const now = new Date()
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [selYear,  setSelYear]  = useState(now.getFullYear())
  const [tab, setTab] = useState('employees') // employees | stations | my_eval

  const [employees,    setEmployees]    = useState([])
  const [stations,     setStations]     = useState([])
  const [empEvals,     setEmpEvals]     = useState([])
  const [stnEvals,     setStnEvals]     = useState([])
  const [myEval,       setMyEval]       = useState(null)

  const [filterStation,   setFilterStation]   = useState('all')
  const [searchQuery,     setSearchQuery]     = useState('')
  const [stnSearchQuery,  setStnSearchQuery]  = useState('')
  const [loading,       setLoading]       = useState(true)

  const [supervisors,  setSupervisors]  = useState([])
  const [supEvals,     setSupEvals]     = useState([])

  const [empModal,    setEmpModal]    = useState(null)
  const [stnModal,    setStnModal]    = useState(null)
  const [supModal,    setSupModal]    = useState(null)
  const [printModal,  setPrintModal]  = useState(null) // 'employees' | 'stations' | 'range'

  // ── تحميل البيانات ─────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const promises = []

    // الموظفون
    if (canEvalEmp || isAdmin) {
      let q = supabase.from('users').select('id, full_name_ar, username, job_number, role, job_title, station_id, station:station_id(name_ar, name_en)')
        .not('role', 'in', '("general_admin","station_admin","area_supervisor")')
      if (!isAdmin) {
        q = q.eq('role', 'station_employee')
        const stationId = profile?.station_id || profile?.station?.id
        if (stationId) q = q.eq('station_id', stationId)
      } else if (!isGeneralAdmin && allowedStationIds?.length) {
        // area_supervisor — فقط موظفو محطاته
        q = q.in('station_id', allowedStationIds)
      }
      promises.push(q.then(r => setEmployees(r.data || [])))
    }

    // المشرفون (للأدمن العام فقط)
    if (canEvalSup) {
      promises.push(
        supabase.from('users')
          .select('id, full_name_ar, username, job_number, role, station_id, station:station_id(name_ar)')
          .in('role', ['station_admin', 'area_supervisor'])
          .then(r => setSupervisors((r.data || []).sort((a, b) => {
            // مشرفو المنطقة أولاً ثم مشرفو المحطة
            if (a.role !== b.role) return a.role === 'area_supervisor' ? -1 : 1
            return (a.full_name_ar || '').localeCompare(b.full_name_ar || '', 'ar')
          })))
      )
      promises.push(
        supabase.from('supervisor_evaluations').select('*')
          .eq('eval_month', selMonth).eq('eval_year', selYear)
          .then(r => setSupEvals(r.data || []))
      )
    }

    // المحطات
    if (canEvalStn) {
      let q = supabase.from('stations').select('id, name_ar, name_en')
      if (!isGeneralAdmin && allowedStationIds?.length) q = q.in('id', allowedStationIds)
      promises.push(q.then(r => setStations((r.data || []).sort((a,b) => a.name_ar.localeCompare(b.name_ar, 'ar')))))
    }

    // تقييمات الموظفين
    {
      let q = supabase.from('employee_evaluations').select('*').eq('eval_month', selMonth).eq('eval_year', selYear)
      if (!isAdmin) q = q.eq('evaluator_id', profile?.id)
      else if (!isGeneralAdmin && allowedStationIds?.length) q = q.in('station_id', allowedStationIds)
      promises.push(q.then(r => setEmpEvals(r.data || [])))
    }

    // تقييمات المحطات
    if (canEvalStn) {
      let q = supabase.from('station_evaluations').select('*').eq('eval_month', selMonth).eq('eval_year', selYear)
      if (!isGeneralAdmin && allowedStationIds?.length) q = q.in('station_id', allowedStationIds)
      promises.push(q.then(r => setStnEvals(r.data || [])))
    }

    // تقييمي الشخصي — لجميع المستخدمين
    if (profile?.id) {
      promises.push(
        supabase.from('employee_evaluations').select('*, evaluator:evaluator_id(full_name_ar, role)')
          .eq('employee_id', profile.id).eq('eval_month', selMonth).eq('eval_year', selYear)
          .maybeSingle()
          .then(r => setMyEval(r.data))
      )
    }

    await Promise.all(promises)
    setLoading(false)
  }, [selMonth, selYear, profile?.id, isAdmin, isGeneralAdmin, allowedStationIds, canEvalEmp, canEvalStn, canEvalSup])

  useEffect(() => { load() }, [load])

  // ── فلترة ─────────────────────────────────────────────────
  const filteredEmployees = employees
    .filter(e => filterStation === 'all' || e.station_id === filterStation)
    .filter(e => !searchQuery ||
      (e.full_name_ar || '').includes(searchQuery) ||
      (e.job_number   || '').includes(searchQuery) ||
      (e.username     || '').includes(searchQuery) ||
      (e.station?.name_ar || '').includes(searchQuery)
    )

  const notEvaluated = filteredEmployees.filter(e => !empEvals.find(ev => ev.employee_id === e.id))

  // ── طباعة التقرير ─────────────────────────────────────────
  function printReport() {
    const rows = (filterStation === 'all' ? employees : filteredEmployees)
      .map(e => {
        const ev = empEvals.find(x => x.employee_id === e.id)
        return { name: e.full_name_ar, station: e.station?.name_ar, score: ev?.total_score ?? null, has_star: ev?.total_score >= STAR_THRESHOLD }
      })
    const html = buildReportHtml(rows, selMonth, selYear, filterStation, stations)
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    w.print()
  }

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }

  // ── الجدول ────────────────────────────────────────────────
  const TABS = [
    ...(canEvalEmp ? [{ id: 'employees',   ar: 'تقييم الموظفين',  en: 'Employee Evaluation'   }] : []),
    ...(canEvalSup ? [{ id: 'supervisors', ar: 'تقييم المشرفين',  en: 'Supervisor Evaluation' }] : []),
    ...(canEvalStn ? [{ id: 'stations',    ar: 'تقييم المحطات',   en: 'Station Evaluation'    }] : []),
    { id: 'my_eval', ar: 'تقييمي', en: 'My Evaluation' },
  ]

  return (
    <>
    <style>{`
      @keyframes spin { to { transform: rotate(360deg) } }
      .ev-row { display:flex; flex-direction:row; align-items:center; gap:14px; padding:14px 20px; transition:background 0.1s; direction:ltr; }
      .ev-row:hover { background: var(--surface); }
      .ev-avatar { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; flex-shrink:0; }
      .ev-btn { padding:7px 18px; border-radius:8px; font-family:inherit; font-size:0.78rem; font-weight:700; cursor:pointer; border:none; white-space:nowrap; transition:all 0.12s; }
      .tab-pill { padding:7px 16px; border-radius:20px; font-family:inherit; font-size:0.8rem; font-weight:600; cursor:pointer; border:none; white-space:nowrap; transition:all 0.15s; }
      .ev-select { padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--text-1); font-family:inherit; font-size:0.82rem; cursor:pointer; outline:none; }
      .ev-input { padding:8px 14px; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--text-1); font-family:inherit; font-size:0.82rem; outline:none; width:100%; box-sizing:border-box; }
      .ev-input:focus { border-color:var(--accent); }
      @media (max-width:640px) {
        .ev-header-inner { flex-direction:column !important; gap:12px !important; }
        .ev-print-row { display:grid !important; grid-template-columns:1fr 1fr !important; gap:6px !important; }
        .ev-print-row button { justify-content:center !important; }
        .ev-content { padding:12px 14px !important; }
        .ev-row { padding:12px 14px !important; gap:10px !important; }
        .ev-row .score-col { width:100% !important; min-width:unset !important; order:3 !important; }
        .ev-row .btn-col { order:4 !important; }
        .ev-row .ev-avatar { width:32px !important; height:32px !important; font-size:0.75rem !important; }
        .ev-filter-row { flex-direction:column !important; gap:8px !important; }
        .tab-pill { padding:6px 12px !important; font-size:0.75rem !important; }
        .ev-month-row { flex-wrap:wrap !important; }
      }
    `}</style>
    <div dir="rtl" style={{ minHeight: 'calc(100vh - 108px)', background: 'var(--surface)' }}>

      {/* ── رأس الصفحة ── */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '16px 24px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* صف العنوان + الأدوات */}
          <div className="ev-header-inner" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 14 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{isAr ? 'نظام التقييم الوظيفي' : 'Employee Evaluation System'}</h1>
              <p style={{ margin: '3px 0 0', fontSize: '0.7rem', color: 'var(--text-3)' }}>
                {isAr ? MONTHS_AR[selMonth-1] : MONTHS_EN[selMonth-1]} {selYear} — {isAr ? 'تقييم دوري شهري' : 'Monthly Periodic Evaluation'}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              {/* اختيار الشهر والسنة */}
              <div className="ev-month-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={selMonth} onChange={e => setSelMonth(+e.target.value)} className="ev-select" style={{ minWidth: 96 }}>
                  {MONTHS_AR.map((m, i) => <option key={i} value={i+1}>{isAr ? m : MONTHS_EN[i]}</option>)}
                </select>
                <select value={selYear} onChange={e => setSelYear(+e.target.value)} className="ev-select">
                  {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {/* أزرار الطباعة */}
              {isAdmin && (
                <div className="ev-print-row" style={{ display: 'flex', gap: 6 }}>
                  {[
                    { labelAr: 'طباعة الموظفين', labelEn: 'Print Employees', type: 'employees', primary: true },
                    { labelAr: 'طباعة المحطات', labelEn: 'Print Stations', type: 'stations', primary: false },
                    { labelAr: 'تقرير فترة', labelEn: 'Period Report', type: 'range', primary: false },
                  ].map(b => (
                    <button key={b.type} onClick={() => setPrintModal(b.type)} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '7px 14px',
                      background: b.primary ? '#1C2B4A' : 'var(--surface)',
                      color: b.primary ? '#fff' : 'var(--text-2)',
                      border: b.primary ? 'none' : '1px solid var(--border)',
                      borderRadius: 8, cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600,
                    }}>
                      <Svg d={b.type === 'range'
                        ? "M8 2v4M16 2v4M3 10h18M21 8H3a1 1 0 00-1 1v11a1 1 0 001 1h18a1 1 0 001-1V9a1 1 0 00-1-1z"
                        : "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"} size={13} />
                      {isAr ? b.labelAr : b.labelEn}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* تبويبات pill */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 14 }}>
            {TABS.map(t => (
              <button className="tab-pill" key={t.id} onClick={() => setTab(t.id)} style={{
                background: tab === t.id ? '#1C2B4A' : 'transparent',
                color: tab === t.id ? '#fff' : 'var(--text-3)',
                boxShadow: tab === t.id ? '0 2px 8px rgba(28,43,74,0.25)' : 'none',
              }}>{isAr ? t.ar : t.en}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── المحتوى ── */}
      <div className="ev-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>

        {/* ══ تقييم الموظفين ══ */}
        {tab === 'employees' && canEvalEmp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* شريط الفلتر */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', display: 'flex', flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', direction: 'ltr' }}>
              <input className="ev-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث: اسم، رقم وظيفي، محطة...' : 'Search: name, job no., station...'}
                style={{ maxWidth: 260, flex: '1 1 180px', direction: isAr ? 'rtl' : 'ltr' }} />
              {isAdmin && (
                <StationPicker stations={stations} value={filterStation} onChange={setFilterStation} isAr={isAr} />
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 14px', borderRadius:20, background:'#ECFDF5', border:'1px solid #A7F3D0' }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#10B981', flexShrink:0 }} />
                  <span style={{ fontSize:'0.72rem', fontWeight:700, color:'#065F46', fontFamily:MONO }}>
                    {filteredEmployees.filter(e => empEvals.find(ev => ev.employee_id === e.id)).length}
                  </span>
                  <span style={{ fontSize:'0.7rem', fontWeight:600, color:'#065F46' }}>{isAr ? 'مُقيَّم' : 'Evaluated'}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 14px', borderRadius:20, background:'var(--surface)', border:'1px solid var(--border)' }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--text-3)', flexShrink:0 }} />
                  <span style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-2)', fontFamily:MONO }}>{notEvaluated.length}</span>
                  <span style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--text-3)' }}>{isAr ? 'لم يُقيَّم' : 'Pending'}</span>
                </div>
              </div>
            </div>

            {/* جدول الموظفين */}
            <div style={{ ...card, overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[1,2,3,4].map(i => <div key={i} style={{ height: 60, background: 'var(--surface)', borderRadius: 8 }} />)}
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>{isAr ? 'لا يوجد موظفون' : 'No employees'}</div>
              ) : filteredEmployees.map((emp, i) => {
                const ev = empEvals.find(x => x.employee_id === emp.id)
                const hasStar = ev?.total_score >= STAR_THRESHOLD
                const initials = (emp.full_name_ar || '?').trim()[0]
                return (
                  <div key={emp.id} style={{
                    display: 'flex', flexDirection: 'row', alignItems: 'center',
                    gap: 0, padding: '0 20px',
                    borderBottom: i < filteredEmployees.length - 1 ? '1px solid var(--border)' : 'none',
                    minHeight: 64, transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {/* الاسم والمعلومات — يسار */}
                    <div style={{ flex: 1, minWidth: 0, direction: 'rtl', padding: '12px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-1)' }}>{emp.full_name_ar || '—'}</span>
                        {hasStar && <StarBadge size={13} />}
                      </div>
                      <div style={{ marginTop: 5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 500 }}>{getJobTitle(emp, isAr)}</span>
                        {emp.job_number && <>
                          <span style={{ color: 'var(--border)' }}>·</span>
                          <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: 'var(--text-3)' }}>{emp.job_number}</span>
                        </>}
                        {emp.station?.name_ar && <>
                          <span style={{ color: 'var(--border)' }}>·</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{emp.station.name_ar}</span>
                        </>}
                      </div>
                    </div>
                    {/* الدرجة — وسط */}
                    <div style={{ width: 160, flexShrink: 0, textAlign: 'center' }}>
                      {ev ? <ScoreBar score={ev.total_score} isAr={isAr} /> : (
                        <span style={{ fontSize: '0.71rem', color: 'var(--text-3)', fontStyle: 'italic' }}>{isAr ? 'لم يُقيَّم بعد' : 'Not yet evaluated'}</span>
                      )}
                    </div>
                    {/* زر — يمين */}
                    <div style={{ paddingRight: 0, paddingLeft: 0, marginLeft: 16 }}>
                      <button className="ev-btn" onClick={() => setEmpModal({ employee: emp, existing: ev || null })} style={{
                        background: ev ? 'var(--surface)' : '#1C2B4A',
                        color: ev ? 'var(--text-2)' : '#fff',
                        border: ev ? '1px solid var(--border)' : 'none',
                        minWidth: 72,
                      }}>{ev ? (isAr ? 'تعديل' : 'Edit') : (isAr ? 'تقييم' : 'Evaluate')}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ تقييم المشرفين ══ */}
        {tab === 'supervisors' && canEvalSup && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:20, background:'var(--card)', border:'1px solid var(--border)' }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:'#1C2B4A', flexShrink:0 }} />
                <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-1)', fontFamily:MONO }}>{supEvals.length} {isAr ? 'مُقيَّم من' : 'Evaluated of'} {supervisors.length}</span>
              </div>
            </div>
            <div style={{ ...card, overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[1,2,3].map(i => <div key={i} style={{ height: 60, background: 'var(--surface)', borderRadius: 8 }} />)}
                </div>
              ) : supervisors.length === 0 ? (
                <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>{isAr ? 'لا يوجد مشرفون' : 'No supervisors'}</div>
              ) : supervisors.map((sup, i) => {
                const ev = supEvals.find(x => x.supervisor_id === sup.id)
                const hasStar = ev?.total_score >= STAR_THRESHOLD
                const roleLabel = sup.role === 'area_supervisor' ? (isAr ? 'مشرف المنطقة' : 'Area Supervisor') : (isAr ? 'مشرف المحطة' : 'Station Supervisor')
                const initials = (sup.full_name_ar || '?').trim()[0]
                const isAreaSup = sup.role === 'area_supervisor'
                return (
                  <div key={sup.id} style={{
                    display: 'flex', flexDirection: 'row', alignItems: 'center',
                    gap: 0, padding: '0 20px',
                    borderBottom: i < supervisors.length - 1 ? '1px solid var(--border)' : 'none',
                    minHeight: 64, transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ flex: 1, minWidth: 0, direction: 'rtl', padding: '12px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-1)' }}>{sup.full_name_ar || '—'}</span>
                        {hasStar && <StarBadge size={13} />}
                      </div>
                      <div style={{ marginTop: 5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 500 }}>{roleLabel}</span>
                        {sup.job_number && <>
                          <span style={{ color: 'var(--border)' }}>·</span>
                          <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: 'var(--text-3)' }}>{sup.job_number}</span>
                        </>}
                        {sup.station?.name_ar && <>
                          <span style={{ color: 'var(--border)' }}>·</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{sup.station.name_ar}</span>
                        </>}
                      </div>
                    </div>
                    <div style={{ width: 160, flexShrink: 0, textAlign: 'center' }}>
                      {ev ? <ScoreBar score={ev.total_score} isAr={isAr} /> : (
                        <span style={{ fontSize: '0.71rem', color: 'var(--text-3)', fontStyle: 'italic' }}>{isAr ? 'لم يُقيَّم بعد' : 'Not yet evaluated'}</span>
                      )}
                    </div>
                    <div style={{ marginLeft: 16 }}>
                      <button className="ev-btn" onClick={() => setSupModal({ supervisor: sup, existing: ev || null })} style={{
                        background: ev ? 'var(--surface)' : '#1C2B4A',
                        color: ev ? 'var(--text-2)' : '#fff',
                        border: ev ? '1px solid var(--border)' : 'none',
                        minWidth: 72,
                      }}>{ev ? (isAr ? 'تعديل' : 'Edit') : (isAr ? 'تقييم' : 'Evaluate')}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ تقييم المحطات ══ */}
        {tab === 'stations' && canEvalStn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="ev-filter-row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="ev-input" value={stnSearchQuery} onChange={e => setStnSearchQuery(e.target.value)}
                placeholder="بحث باسم المحطة..." style={{ maxWidth: 280 }} />
              <div style={{ marginInlineStart: 'auto', display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:20, background:'var(--card)', border:'1px solid var(--border)' }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:'#1C2B4A', flexShrink:0 }} />
                <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-1)', fontFamily:MONO }}>{stnEvals.length} من {stations.length}</span>
              </div>
            </div>
            <div style={{ ...card, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 20 }}><div style={{ height: 60, background: 'var(--surface)', borderRadius: 8 }} /></div>
            ) : (() => {
              const filtered = stations.filter(s =>
                !stnSearchQuery || s.name_ar.includes(stnSearchQuery) ||
                (s.name_en || '').toLowerCase().includes(stnSearchQuery.toLowerCase())
              )
              return filtered.length === 0 ? (
                <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>{isAr ? 'لا توجد نتائج' : 'No results'}</div>
              ) : filtered.map((stn, i) => {
                const ev = stnEvals.find(x => x.station_id === stn.id)
                return (
                  <div key={stn.id} className="ev-row" style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div className="ev-avatar" style={{ background: ev ? '#1C2B4A12' : 'var(--surface)', color: ev ? '#1C2B4A' : 'var(--text-3)', border: `1.5px solid ${ev ? '#1C2B4A30' : 'var(--border)'}`, fontSize: '0.7rem' }}>
                      <Svg d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-1)' }}>{stn.name_ar}</span>
                      {stn.name_en && <div style={{ marginTop: 3, fontSize: '0.72rem', color: 'var(--text-3)' }}>{stn.name_en}</div>}
                    </div>
                    <div className="score-col" style={{ minWidth: 150 }}>
                      {ev ? <ScoreBar score={ev.total_score} /> : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontStyle: 'italic' }}>{isAr ? 'لم تُقيَّم بعد' : 'Not yet evaluated'}</span>
                      )}
                    </div>
                    <button className="ev-btn" onClick={() => setStnModal({ station: stn, existing: ev || null })} style={{
                      background: ev ? 'var(--surface)' : '#1C2B4A',
                      color: ev ? 'var(--text-2)' : '#fff',
                      border: ev ? '1px solid var(--border)' : 'none',
                    }}>{ev ? (isAr ? 'تعديل' : 'Edit') : (isAr ? 'تقييم' : 'Evaluate')}</button>
                  </div>
                )
              })
            })()}
            </div>
          </div>
        )}

        {/* ══ تقييمي ══ */}
        {tab === 'my_eval' && (
          <div>
            {loading ? (
              <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>{isAr ? 'جاري التحميل…' : 'Loading...'}</div>
            ) : !myEval ? (
              <div style={{ ...card, padding: '48px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                  <Svg d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" size={22} />
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-2)' }}>{isAr ? 'لم يتم تقييمك هذا الشهر بعد' : 'You have not been evaluated this month yet'}</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-3)' }}>{isAr ? MONTHS_AR[selMonth-1] : MONTHS_EN[selMonth-1]} {selYear}</p>
              </div>
            ) : (
              <div style={{ ...card, overflow: 'hidden' }}>
                {/* نتيجة عامة */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-1)' }}>
                        {isAr ? 'نتيجة تقييم' : 'Evaluation Result'} {isAr ? MONTHS_AR[selMonth-1] : MONTHS_EN[selMonth-1]} {selYear}
                      </p>
                      <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)' }}>
                        {isAr ? 'المُقيِّم:' : 'Evaluator:'} {myEval.evaluator?.full_name_ar} · {isAr ? ROLE_LABELS[myEval.evaluator?.role] : (ROLE_LABELS_EN[myEval.evaluator?.role] || myEval.evaluator?.role)}
                      </p>
                    </div>
                    {myEval.total_score >= STAR_THRESHOLD && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#F59E0B15', border: '1px solid #F59E0B30', borderRadius: 8 }}>
                        <StarBadge size={16} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F59E0B' }}>{isAr ? 'موظف متميز' : 'Outstanding Employee'}</span>
                      </div>
                    )}
                  </div>
                  <ScoreBar score={myEval.total_score} />
                </div>

                {/* التفاصيل */}
                {EMP_CRITERIA.map((c, i) => {
                  const s = myEval.scores?.[c.key] || 0
                  return (
                    <div key={c.key} style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 24px',
                      borderBottom: i < EMP_CRITERIA.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <p style={{ flex: 1, margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>{isAr ? c.ar : c.en}</p>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {[1,2,3,4,5].map(v => (
                          <div key={v} style={{
                            width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: s === v ? `${SCORE_COLORS[v]}18` : 'var(--surface)',
                            border: `1.5px solid ${s === v ? SCORE_COLORS[v] : 'var(--border)'}`,
                            color: s === v ? SCORE_COLORS[v] : 'var(--text-3)',
                            fontSize: '0.72rem', fontWeight: s === v ? 800 : 400, fontFamily: MONO,
                          }}>{v}</div>
                        ))}
                      </div>
                      <span style={{ minWidth: 64, fontSize: '0.68rem', fontWeight: 700, color: s > 0 ? SCORE_COLORS[s] : 'var(--text-3)', fontFamily: MONO }}>
                        {s > 0 ? (isAr ? SCORE_LABELS[s] : SCORE_LABELS_EN[s]) : '—'}
                      </span>
                    </div>
                  )
                })}

                {myEval.notes && (
                  <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                    <p style={{ margin: '0 0 6px', fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{isAr ? 'ملاحظات المقيِّم' : 'Evaluator Notes'}</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{myEval.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {empModal && (
        <EmployeeEvalModal
          employee={empModal.employee}
          month={selMonth} year={selYear}
          existing={empModal.existing}
          isAdmin={isAdmin}
          evaluatorId={profile?.id}
          onClose={() => setEmpModal(null)}
          onSave={() => { setEmpModal(null); load() }}
          isAr={isAr}
        />
      )}
      {supModal && (
        <SupervisorEvalModal
          supervisor={supModal.supervisor}
          month={selMonth} year={selYear}
          existing={supModal.existing}
          evaluatorId={profile?.id}
          onClose={() => setSupModal(null)}
          onSave={() => { setSupModal(null); load() }}
          isAr={isAr}
        />
      )}
      {stnModal && (
        <StationEvalModal
          station={stnModal.station}
          month={selMonth} year={selYear}
          existing={stnModal.existing}
          evaluatorId={profile?.id}
          onClose={() => setStnModal(null)}
          onSave={() => { setStnModal(null); load() }}
          isAr={isAr}
        />
      )}
      {printModal && (
        <PrintModal
          type={printModal}
          employees={employees}
          stations={stations}
          empEvals={empEvals}
          stnEvals={stnEvals}
          selMonth={selMonth}
          selYear={selYear}
          isAdmin={isAdmin}
          onClose={() => setPrintModal(null)}
        />
      )}
    </div>
    </>
  )
}

// ── مودال الطباعة المتقدمة ────────────────────────────────────
function PrintModal({ type, employees, stations, empEvals, stnEvals, selMonth, selYear, isAdmin, onClose }) {
  const now = new Date()
  useEscClose(onClose)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // محطات محفوظة (محطات / محطات الوكلاء)
  const [savedGroups,   setSavedGroups]   = useState({ stations: new Set(), agent_stations: new Set() })
  const [editingGroup,  setEditingGroup]  = useState(null)   // 'stations' | 'agent_stations' | null
  const [groupDraft,    setGroupDraft]    = useState(new Set())
  const [groupSaving,   setGroupSaving]   = useState(false)

  useEffect(() => {
    supabase.from('saved_station_groups').select('group_name, station_id').then(({ data }) => {
      const g = { stations: new Set(), agent_stations: new Set() }
      ;(data || []).forEach(r => { if (g[r.group_name]) g[r.group_name].add(r.station_id) })
      setSavedGroups(g)
    })
  }, [])

  function startEditGroup(group) {
    setGroupDraft(new Set(savedGroups[group]))
    setEditingGroup(group)
    setRangeData(null)
  }

  const toggleGroupDraft = id => setGroupDraft(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })
  const toggleAllGroupDraft = () => setGroupDraft(prev =>
    prev.size === stations.length ? new Set() : new Set(stations.map(s => s.id))
  )

  async function saveGroup() {
    if (!editingGroup) return
    setGroupSaving(true)
    await supabase.from('saved_station_groups').delete().eq('group_name', editingGroup)
    if (groupDraft.size > 0)
      await supabase.from('saved_station_groups').insert([...groupDraft].map(id => ({ group_name: editingGroup, station_id: id })))
    setSavedGroups(prev => ({ ...prev, [editingGroup]: new Set(groupDraft) }))
    setEditingGroup(null)
    setGroupSaving(false)
  }

  const [selStations,  setSelStations]  = useState(new Set(stations.map(s => s.id)))
  const [selEmpSet,    setSelEmpSet]    = useState(new Set())  // empty = all
  const [rangeStart,   setRangeStart]   = useState({ month: selMonth, year: selYear })
  const [rangeEnd,     setRangeEnd]     = useState({ month: selMonth, year: selYear })
  const [rangeData,    setRangeData]    = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [modalErr,     setModalErr]     = useState('')
  const [stnSearch,    setStnSearch]    = useState('')
  const [empRangeSearch, setEmpRangeSearch] = useState('')
  const [rangeMode,    setRangeMode]    = useState('employees')
  const [selStnRange,  setSelStnRange]  = useState('all')
  const [stnRangeSearch, setStnRangeSearch] = useState('')
  const toggleEmp = id => setSelEmpSet(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleAllEmps = () => setSelEmpSet(prev => prev.size === employees.length ? new Set() : new Set(employees.map(e => e.id)))

  function toggleStation(id) {
    setSelStations(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleAll() {
    if (selStations.size === stations.length) setSelStations(new Set())
    else setSelStations(new Set(stations.map(s => s.id)))
  }

  // توليد قائمة أشهر بين فترتين
  function monthsBetween(s, e) {
    const months = []
    let y = s.year, m = s.month
    while (y < e.year || (y === e.year && m <= e.month)) {
      months.push({ month: m, year: y })
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }

  async function loadRange() {
    setLoading(true)
    setRangeData(null)
    setModalErr('')
    const months = monthsBetween(rangeStart, rangeEnd)
    if (rangeMode === 'employees') {
      const empIds = selEmpSet.size > 0 ? [...selEmpSet] : null
      const results = await Promise.all(months.map(async ({ month, year }) => {
        let q = supabase.from('employee_evaluations').select('*, employee:employee_id(full_name_ar, username, job_number, role, station:station_id(name_ar))')
          .eq('eval_month', month).eq('eval_year', year)
        if (empIds) q = q.in('employee_id', empIds)
        const { data } = await q
        return (data || []).map(r => ({ ...r, month, year }))
      }))
      setRangeData(results.flat())
    } else if (rangeMode === 'agent_stations' || rangeMode === 'stations') {
      const savedIds = savedGroups[rangeMode]
      const ids = savedIds.size > 0 ? [...savedIds] : null
      const results = await Promise.all(months.map(async ({ month, year }) => {
        let q = supabase.from('station_evaluations').select('*, station:station_id(name_ar, name_en)')
          .eq('eval_month', month).eq('eval_year', year)
        if (ids) q = q.in('station_id', ids)
        const { data } = await q
        return (data || []).map(r => ({ ...r, month, year }))
      }))
      setRangeData(results.flat())
    } else {
      const stnId = selStnRange === 'all' ? null : selStnRange
      const results = await Promise.all(months.map(async ({ month, year }) => {
        let q = supabase.from('station_evaluations').select('*, station:station_id(name_ar, name_en)')
          .eq('eval_month', month).eq('eval_year', year)
        if (stnId) q = q.eq('station_id', stnId)
        const { data } = await q
        return (data || []).map(r => ({ ...r, month, year }))
      }))
      setRangeData(results.flat())
    }
    setLoading(false)
  }

  function printHtml(html) {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none'
    document.body.appendChild(iframe)
    iframe.contentDocument.open()
    iframe.contentDocument.write(html)
    iframe.contentDocument.close()
    iframe.contentWindow.focus()
    setTimeout(() => {
      iframe.contentWindow.print()
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }, 300)
  }

  function printEmployees() {
    const filtered = employees.filter(e => selStations.has(e.station_id))
    const rows = filtered.map(e => {
      const ev = empEvals.find(x => x.employee_id === e.id)
      return { name: e.full_name_ar, job_number: e.job_number, username: e.username, station: e.station?.name_ar, role: ROLE_LABELS[e.role], score: ev?.total_score ?? null, has_star: ev?.total_score >= STAR_THRESHOLD }
    })
    printHtml(buildReportHtml(rows, selMonth, selYear, [...selStations], stations))
  }

  function printStations() {
    const filtered = stations.filter(s => selStations.has(s.id))
    const rows = filtered
      .map(s => {
        const ev = stnEvals.find(x => x.station_id === s.id)
        return { name: s.name_ar, score: ev?.total_score ?? null, has_star: ev?.total_score >= STAR_THRESHOLD }
      })
      .filter(r => r.score != null)
    if (rows.length === 0) { setModalErr('لا توجد محطات مقيّمة في الفترة المحددة'); return }
    printHtml(buildStationReportHtml(rows, selMonth, selYear))
  }

  function printRange() {
    if (!rangeData || rangeData.length === 0) { setModalErr('لا توجد بيانات في هذه الفترة'); return }
    if (rangeMode === 'employees') {
      printHtml(buildRangeReportHtml(rangeData, rangeStart, rangeEnd, selEmpSet, employees))
    } else {
      const label = rangeMode === 'agent_stations' ? 'محطات الوكلاء' : 'المحطات'
      printHtml(buildStnRangeReportHtml(rangeData, rangeStart, rangeEnd, 'all', stations, label))
    }
  }

  const inp = { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.78rem' }

  const MODAL_TITLES = { employees: 'طباعة تقييم الموظفين', stations: 'طباعة تقييم المحطات', range: 'تقرير فترة زمنية' }
  const F = { fontFamily: 'inherit' }
  const INP = { ...F, width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontSize: '0.85rem', outline: 'none' }

  return (
    <>
    <style>{`
      @keyframes nwIn { from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none} }
      .nw-inp:focus { border-color: #4A6FA5 !important; box-shadow: 0 0 0 3px rgba(74,111,165,0.12) !important; }
      .nw-tab-btn { transition: all 0.18s; }
      .nw-row-lbl:hover { background: var(--surface) !important; }
      .nw-load-btn:hover:not(:disabled) { background: #f1f5f9 !important; }
      .nw-sel:focus { border-color: #4A6FA5 !important; outline: none; }
      @media (max-width:600px) {
        .nw-modal-wrap { padding:0 !important; align-items:flex-end !important; }
        .nw-modal-box  { max-width:100% !important; border-radius:22px 22px 0 0 !important; max-height:96vh !important; }
        .nw-modal-foot { padding:14px 20px 28px !important; }
        .nw-modal-body { padding:18px 20px !important; }
        .nw-modal-head { padding:18px 20px !important; }
      }
    `}</style>

    <div className="nw-modal-wrap" onKeyDown={e => e.stopPropagation()} style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(6px)' }}>
      <div className="nw-modal-box" style={{ background:'var(--card)', borderRadius:20, width:'100%', maxWidth:660, boxShadow:'0 32px 80px rgba(0,0,0,0.2)', maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', animation:'nwIn 0.22s cubic-bezier(.22,.68,0,1.2)' }}>

        {/* ── رأس ── */}
        <div className="nw-modal-head" style={{ padding:'22px 28px 18px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
          <div>
            <p style={{ margin:0, fontWeight:800, fontSize:'1.05rem', color:'var(--text-1)', lineHeight:1.3 }}>{MODAL_TITLES[type]}</p>
            <p style={{ margin:'4px 0 0', fontSize:'0.73rem', color:'var(--text-3)', fontWeight:500 }}>{MONTHS_AR[selMonth-1]} {selYear}</p>
          </div>
          <button onClick={onClose} style={{ background:'var(--surface)', border:'1px solid var(--border)', cursor:'pointer', color:'var(--text-3)', borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
            <Svg d="M18 6L6 18M6 6l12 12" size={15} />
          </button>
        </div>

        {/* فاصل */}
        <div style={{ height:1, background:'var(--border)', margin:'0 28px' }} />

        <div className="nw-modal-body" style={{ overflowY:'auto', padding:'22px 28px', display:'flex', flexDirection:'column', gap:20 }}>

          {/* تحديد المحطات */}
          {(type === 'employees' || type === 'stations') && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <p style={{ margin:0, fontSize:'0.72rem', fontWeight:700, color:'var(--text-2)' }}>اختر المحطات</p>
                <button onClick={toggleAll} style={{ fontFamily:'inherit', fontSize:'0.72rem', color:'#4A6FA5', background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0 }}>
                  {selStations.size === stations.length ? 'إلغاء الكل' : 'تحديد الكل'}
                </button>
              </div>
              <input className="nw-inp" value={stnSearch} onChange={e => setStnSearch(e.target.value)}
                placeholder="بحث باسم المحطة..." style={{ ...INP }} />
              <div style={{ display:'flex', flexDirection:'column', maxHeight:190, overflowY:'auto', overflowX:'hidden', borderRadius:12, border:'1px solid var(--border)' }}>
                {stations.filter(s => !stnSearch || s.name_ar.includes(stnSearch) || (s.name_en||'').toLowerCase().includes(stnSearch.toLowerCase())).map((s, i, arr) => (
                  <label key={s.id} className="nw-row-lbl" style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer', padding:'10px 16px', background:'transparent', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none' }}>
                    <input type="checkbox" checked={selStations.has(s.id)} onChange={() => toggleStation(s.id)} style={{ width:16, height:16, accentColor:'#4A6FA5', cursor:'pointer', flexShrink:0 }} />
                    <span style={{ fontSize:'0.85rem', color:'var(--text-1)', fontWeight:500 }}>{s.name_ar}</span>
                  </label>
                ))}
              </div>
              <p style={{ margin:0, fontSize:'0.68rem', color:'var(--text-3)' }}>{selStations.size} من {stations.length} محطة</p>
            </div>
          )}

          {/* تقرير فترة */}
          {type === 'range' && (
            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

              {/* تبديل الوضع — pill style */}
              <div style={{ display:'flex', gap:6 }}>
                {[{ id:'employees', label:'موظفين' }, { id:'stations', label:'محطات' }, { id:'agent_stations', label:'محطات الوكلاء' }].map(m => (
                  <button key={m.id} className="nw-tab-btn" onClick={() => { setRangeMode(m.id); setRangeData(null) }} style={{
                    fontFamily:'inherit', padding:'8px 22px', borderRadius:50, border:'1.5px solid',
                    borderColor: rangeMode === m.id ? '#4A6FA5' : 'var(--border)',
                    background: rangeMode === m.id ? '#4A6FA5' : 'transparent',
                    color: rangeMode === m.id ? '#fff' : 'var(--text-3)',
                    fontSize:'0.83rem', fontWeight:700, cursor:'pointer',
                  }}>{m.label}</button>
                ))}
              </div>

              {/* اختيار الموظفين */}
              {rangeMode === 'employees' && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <p style={{ margin:0, fontSize:'0.72rem', fontWeight:700, color:'var(--text-2)' }}>الموظفون</p>
                  <button onClick={toggleAllEmps} style={{ fontFamily:'inherit', fontSize:'0.72rem', color:'#4A6FA5', background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0 }}>
                    {selEmpSet.size === employees.length ? 'إلغاء الكل' : 'تحديد الكل'}
                  </button>
                </div>
                <input className="nw-inp" value={empRangeSearch} onChange={e => setEmpRangeSearch(e.target.value)}
                  placeholder="بحث بالاسم أو الرقم الوظيفي..." style={{ ...INP }} />
                <div style={{ display:'flex', flexDirection:'column', maxHeight:200, overflowY:'auto', overflowX:'hidden', borderRadius:12, border:'1px solid var(--border)' }}>
                  {employees
                    .filter(e => !empRangeSearch ||
                      (e.full_name_ar||'').includes(empRangeSearch) ||
                      (e.job_number||'').includes(empRangeSearch))
                    .map((e, i, arr) => (
                      <label key={e.id} className="nw-row-lbl" style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer', padding:'9px 16px', background:'transparent', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none' }}>
                        <input type="checkbox" checked={selEmpSet.has(e.id)} onChange={() => toggleEmp(e.id)} style={{ width:16, height:16, accentColor:'#4A6FA5', cursor:'pointer', flexShrink:0 }} />
                        <span style={{ flex:1, fontSize:'0.84rem', color:'var(--text-1)', fontWeight:500 }}>{e.full_name_ar}</span>
                        {e.job_number && <span style={{ fontSize:'0.68rem', fontFamily:MONO, color:'var(--text-3)' }}>{e.job_number}</span>}
                      </label>
                    ))}
                </div>
                <p style={{ margin:0, fontSize:'0.68rem', color:'var(--text-3)' }}>
                  {selEmpSet.size === 0 ? 'كل الموظفين' : `${selEmpSet.size} موظف محدد`}
                </p>
              </div>
              )}

              {/* محطات / محطات الوكلاء — ثابتة محفوظة */}
              {(rangeMode === 'stations' || rangeMode === 'agent_stations') && (() => {
                const grpLabel = rangeMode === 'agent_stations' ? 'محطات الوكلاء' : 'المحطات'
                const saved    = savedGroups[rangeMode]
                const isEditing = editingGroup === rangeMode
                const draft    = groupDraft
                const displayed = isEditing ? draft : saved
                const filteredStns = stations.filter(s => !stnRangeSearch || s.name_ar.includes(stnRangeSearch) || (s.name_en||'').toLowerCase().includes(stnRangeSearch.toLowerCase()))
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <p style={{ margin:0, fontSize:'0.72rem', fontWeight:700, color:'var(--text-2)' }}>
                        {grpLabel} {!isEditing && <span style={{ color:'var(--text-3)', fontWeight:400 }}>({saved.size} محطة)</span>}
                      </p>
                      {isAdmin && !isEditing && (
                        <button onClick={() => startEditGroup(rangeMode)} style={{ fontFamily:'inherit', fontSize:'0.72rem', color:'#4A6FA5', background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0 }}>تعديل التحديد</button>
                      )}
                      {isEditing && (
                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={toggleAllGroupDraft} style={{ fontFamily:'inherit', fontSize:'0.7rem', color:'#4A6FA5', background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0 }}>
                            {draft.size === stations.length ? 'إلغاء الكل' : 'تحديد الكل'}
                          </button>
                          <button onClick={saveGroup} disabled={groupSaving} style={{ fontFamily:'inherit', fontSize:'0.7rem', color:'#fff', background:'#4A6FA5', border:'none', borderRadius:6, padding:'3px 10px', cursor:'pointer', fontWeight:600 }}>
                            {groupSaving ? '...' : 'حفظ'}
                          </button>
                          <button onClick={() => setEditingGroup(null)} style={{ fontFamily:'inherit', fontSize:'0.7rem', color:'var(--text-3)', background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0 }}>إلغاء</button>
                        </div>
                      )}
                    </div>
                    <input className="nw-inp" value={stnRangeSearch} onChange={e => setStnRangeSearch(e.target.value)}
                      placeholder="بحث باسم المحطة..." style={{ ...INP }} />
                    <div style={{ display:'flex', flexDirection:'column', maxHeight:160, overflowY:'auto', overflowX:'hidden', borderRadius:12, border:'1px solid var(--border)' }}>
                      {filteredStns.map((s, i, arr) => (
                        <label key={s.id} className="nw-row-lbl" style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 16px', background: !isEditing && displayed.has(s.id) ? 'var(--surface)' : 'transparent', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none', cursor: isEditing ? 'pointer' : 'default' }}>
                          {isEditing
                            ? <input type="checkbox" checked={draft.has(s.id)} onChange={() => toggleGroupDraft(s.id)} style={{ width:16, height:16, accentColor:'#4A6FA5', cursor:'pointer', flexShrink:0 }} />
                            : <span style={{ width:8, height:8, borderRadius:'50%', background: displayed.has(s.id) ? '#4A6FA5' : 'var(--border)', flexShrink:0 }} />
                          }
                          <span style={{ flex:1, fontSize:'0.84rem', color: displayed.has(s.id) ? 'var(--text-1)' : 'var(--text-3)', fontWeight: displayed.has(s.id) ? 600 : 400 }}>{s.name_ar}</span>
                        </label>
                      ))}
                    </div>
                    {!isEditing && saved.size === 0 && isAdmin && (
                      <p style={{ margin:0, fontSize:'0.7rem', color:'#E57373', textAlign:'center' }}>لم يتم تحديد أي محطات — اضغط "تعديل التحديد" لتحديدها</p>
                    )}
                  </div>
                )
              })()}

              {/* من / إلى */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {[
                  { label:'من', month: rangeStart.month, year: rangeStart.year, setM: v => setRangeStart(p=>({...p,month:v})), setY: v => setRangeStart(p=>({...p,year:v})) },
                  { label:'إلى', month: rangeEnd.month,   year: rangeEnd.year,   setM: v => setRangeEnd(p=>({...p,month:v})),   setY: v => setRangeEnd(p=>({...p,year:v})) },
                ].map(r => (
                  <div key={r.label}>
                    <p style={{ margin:'0 0 8px', fontSize:'0.72rem', fontWeight:700, color:'var(--text-2)' }}>{r.label}</p>
                    <div style={{ display:'flex', gap:8 }}>
                      <select className="nw-sel" value={r.month} onChange={e => r.setM(+e.target.value)} style={{ ...INP, flex:1, padding:'9px 10px' }}>
                        {MONTHS_AR.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                      </select>
                      <select className="nw-sel" value={r.year} onChange={e => r.setY(+e.target.value)} style={{ ...INP, width:80, padding:'9px 10px' }}>
                        {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <button className="nw-load-btn" onClick={loadRange} disabled={loading} style={{ padding:'11px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, cursor: loading ? 'not-allowed' : 'pointer', fontFamily:'inherit', fontWeight:700, fontSize:'0.85rem', color:'var(--text-1)', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {loading
                  ? <><span style={{ width:14, height:14, borderRadius:'50%', border:'2px solid var(--border)', borderTopColor:'#4A6FA5', display:'inline-block', animation:'spin 0.7s linear infinite' }} />جارٍ التحميل…</>
                  : <><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>تحميل البيانات</>
                }
              </button>

              {rangeData && (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px', background:'#F0FDF4', borderRadius:12 }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize:'0.82rem', color:'#15803d', fontWeight:600 }}>تم تحميل {rangeData.length} تقييم</span>
                </div>
              )}
            </div>
          )}
        </div>

        {modalErr && (
          <div style={{ margin:'0 28px 10px', padding:'12px 16px', background:'#FFF5F5', borderRadius:12, display:'flex', alignItems:'center', gap:10 }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#E53E3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p style={{ margin:0, fontSize:'0.82rem', color:'#C53030', fontWeight:600, flex:1 }}>{modalErr}</p>
            <button onClick={() => setModalErr('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#C53030', fontSize:18, lineHeight:1 }}>×</button>
          </div>
        )}

        {/* فاصل */}
        <div style={{ height:1, background:'var(--border)', margin:'0 28px' }} />

        <div className="nw-modal-foot" style={{ padding:'18px 28px', display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ fontFamily:'inherit', flex:1, padding:'12px', borderRadius:12, border:'1.5px solid var(--border)', background:'transparent', color:'var(--text-2)', fontSize:'0.85rem', fontWeight:700, cursor:'pointer' }}>
            إلغاء
          </button>
          <button
            disabled={type === 'range' && !rangeData}
            onClick={type === 'employees' ? printEmployees : type === 'stations' ? printStations : printRange}
            style={{ fontFamily:'inherit', flex:2, padding:'12px', borderRadius:12, border:'none', background:'#4A6FA5', color:'#fff', fontSize:'0.88rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity: type==='range' && !rangeData ? 0.4 : 1 }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            طباعة التقرير
          </button>
        </div>

      </div>
    </div>
    </>
  )
}

// ── CSS مشترك للتقارير ────────────────────────────────────────
function reportCss() {
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;direction:rtl;font-size:13px}
  .wrap{max-width:960px;margin:0 auto;padding:28px 32px}

  /* ── رأس الصفحة ── */
  .cover{background:#1C2B4A;padding:28px 36px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between}
  .cover-right{}
  .logo-mark{display:none}
  .cover-title{font-size:22px;font-weight:700;color:#fff;line-height:1.25;margin-bottom:4px}
  .cover-sub{font-size:12px;color:rgba(255,255,255,0.5);font-weight:400}
  .cover-left{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
  .nw-logo{font-size:10px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:0.22em;text-transform:uppercase}
  .nw-logo-line{width:32px;height:1px;background:rgba(255,255,255,0.2);margin:5px 0}
  .cover-date{font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:0.05em}

  /* ── إحصاءات ── */
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;margin-bottom:20px}
  .stat{background:#fff;padding:18px 24px}
  .stat-val{font-size:30px;font-weight:800;line-height:1;margin-bottom:5px;color:#1C2B4A}
  .stat-lbl{font-size:11px;color:#9ca3af;font-weight:400;letter-spacing:0.03em}

  /* ── الجدول ── */
  .table-wrap{border:1px solid #e5e7eb;margin-bottom:20px}
  .table-head{background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:10px 16px;display:flex;align-items:center;justify-content:space-between}
  .table-head-title{font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase}
  table{width:100%;border-collapse:collapse}
  th{background:#f9fafb;color:#6b7280;padding:10px 16px;font-size:10px;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;letter-spacing:0.06em;text-transform:uppercase}
  td{padding:11px 16px;font-size:12.5px;border-bottom:1px solid #f3f4f6;vertical-align:middle;color:#374151}
  tr:last-child td{border-bottom:none}

  /* ── شريط النتيجة ── */
  .bar-wrap{display:flex;align-items:center;gap:8px;min-width:110px}
  .bar{height:5px;border-radius:2px;flex:1;background:#f3f4f6;overflow:hidden}
  .bar-fill{height:100%;border-radius:2px}
  .score-num{font-weight:700;font-size:12px;min-width:40px;text-align:left;color:#1C2B4A}

  /* ── بادجات ── */
  .badge{display:inline-block;padding:2px 9px;border-radius:3px;font-size:10.5px;font-weight:600;white-space:nowrap}
  .badge-great{background:#EEF2FF;color:#4338CA}
  .badge-good{background:#F0FDF4;color:#166534}
  .badge-ok{background:#EFF6FF;color:#1D4ED8}
  .badge-avg{background:#FFFBEB;color:#92400E}
  .badge-low{background:#FEF2F2;color:#991B1B}
  .badge-none{background:#F9FAFB;color:#9CA3AF}
  .job-tag{display:inline-block;padding:2px 7px;border-radius:3px;font-family:monospace;font-size:11px;font-weight:600;background:#F5F3FF;color:#5B21B6}
  .emp-name{font-weight:600;font-size:13px;color:#111827;line-height:1.3}
  .emp-sub{font-size:10.5px;color:#9CA3AF;font-family:monospace;margin-top:2px}
  .row-num{font-size:11px;color:#d1d5db;font-weight:600}
  .station-text{font-size:12px;color:#6B7280}
  .role-text{font-size:11px;color:#9CA3AF}

  /* ── تذييل ── */
  .footer{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid #e5e7eb;margin-top:4px}
  .footer-brand{font-size:10px;font-weight:600;color:#9ca3af;letter-spacing:0.1em;text-transform:uppercase}
  .footer-meta{font-size:10px;color:#d1d5db;letter-spacing:0.04em}

  @media print{
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    body{background:#fff;font-size:13px;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    .wrap{padding:16px}
    .cover{page-break-inside:avoid}
    table{page-break-inside:auto}
    tr{page-break-inside:avoid;page-break-after:auto}
  }`
}

function scoreBadge(s) {
  if (s == null) return '<span class="badge badge-none">لم يُقيَّم</span>'
  if (s >= 98)   return '<span class="badge badge-great">متميز ★</span>'
  if (s >= 85)   return '<span class="badge badge-good">ممتاز</span>'
  if (s >= 70)   return '<span class="badge badge-ok">جيد جداً</span>'
  if (s >= 50)   return '<span class="badge badge-avg">جيد</span>'
  return '<span class="badge badge-low">يحتاج تحسين</span>'
}

function scoreBarHtml(s) {
  if (s == null) return '<span style="color:#d1d5db">—</span>'
  const color = s >= 98 ? '#7C3AED' : s >= 85 ? '#059669' : s >= 70 ? '#3B82F6' : s >= 50 ? '#F59E0B' : '#EF4444'
  const outOf10 = (s / 10).toFixed(1)
  return `<div class="bar-wrap">
    <div class="bar"><div class="bar-fill" style="width:${s}%;background:${color}"></div></div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;min-width:54px;line-height:1.2">
      <span style="font-weight:800;font-size:13px;color:${color}">${outOf10}<span style="font-size:10px;opacity:0.55">/10</span></span>
      <span style="font-size:10px;color:${color};opacity:0.65">${s}%</span>
    </div>
  </div>`
}

// ── HTML تقرير الموظفين ───────────────────────────────────────
function buildReportHtml(rows, month, year, selStationIds, stations) {
  const MN = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const stnName = (!selStationIds || selStationIds.length === stations.length) ? 'جميع المحطات'
    : selStationIds.map(id => stations.find(s => s.id === id)?.name_ar).filter(Boolean).join('، ')
  const evaluated = rows.filter(r => r.score != null).length
  const stars = rows.filter(r => r.has_star).length

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>تقرير التقييم — ${MN[month-1]} ${year}</title>
<style>${reportCss()}</style></head><body>
<div class="wrap">
  <div class="cover">
    <div class="cover-right">
      <div class="logo-mark">Northwest Bus · تقرير رسمي</div>
      <div class="cover-title">تقرير تقييم الموظفين</div>
      <div class="cover-sub">${MN[month-1]} ${year} &nbsp;·&nbsp; ${stnName}</div>
    </div>
    <div class="cover-left">
      <div class="nw-logo">NORTH WEST BUS</div>
      <div class="nw-logo-line"></div>
      <div class="cover-date">${new Date().toLocaleDateString('ar-SA')}</div>
    </div>
  </div>

  <div class="stats">
    <div class="stat purple">
      <div class="stat-val" style="color:#5B5BD6">${rows.length}</div>
      <div class="stat-lbl">إجمالي الموظفين</div>
    </div>
    <div class="stat green">
      <div class="stat-val" style="color:#059669">${evaluated}</div>
      <div class="stat-lbl">تم تقييمهم</div>
    </div>
    <div class="stat gold">
      <div class="stat-val" style="color:#B45309">${stars}</div>
      <div class="stat-lbl">موظف متميز ★</div>
    </div>
  </div>

  <div class="table-wrap">
    <div class="table-head">
      <div class="table-head-dot"></div>
      <div class="table-head-title">قائمة الموظفين — ${MN[month-1]} ${year}</div>
    </div>
    <table>
      <thead><tr>
        <th style="width:36px">#</th>
        <th>الموظف</th>
        <th>الرقم الوظيفي</th>
        <th>المحطة</th>
        <th>الوظيفة</th>
        <th>النتيجة</th>
        <th>التقدير</th>
      </tr></thead>
      <tbody>
      ${rows.map((r, i) => `<tr>
        <td><span class="row-num">${i+1}</span></td>
        <td>
          <div class="emp-name">${r.name || '—'}${r.has_star ? ' <span style="color:#F59E0B">★</span>' : ''}</div>
          ${r.username ? `<div class="emp-sub">${r.username}</div>` : ''}
        </td>
        <td>${r.job_number ? `<span class="job-tag">${r.job_number}</span>` : '<span style="color:#d1d5db">—</span>'}</td>
        <td><span class="station-text">${r.station || '—'}</span></td>
        <td><span class="role-text">${r.role || '—'}</span></td>
        <td>${scoreBarHtml(r.score)}</td>
        <td>${scoreBadge(r.score)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <div class="footer-brand">NORTH WEST BUS &nbsp;—&nbsp; www.nwstation.com</div>
    <div class="footer-meta">تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}</div>
  </div>
</div></body></html>`
}

// ── HTML تقرير المحطات ────────────────────────────────────────
function buildStationReportHtml(rows, month, year) {
  const MN = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const evaluated = rows.filter(r => r.score != null).length
  const stars = rows.filter(r => r.has_star).length

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>تقرير تقييم المحطات — ${MN[month-1]} ${year}</title>
<style>${reportCss()}</style></head><body>
<div class="wrap">
  <div class="cover">
    <div class="cover-right">
      <div class="logo-mark">Northwest Bus · تقرير رسمي</div>
      <div class="cover-title">تقرير تقييم المحطات</div>
      <div class="cover-sub">${MN[month-1]} ${year}</div>
    </div>
    <div class="cover-left">
      <div class="nw-logo">NORTH WEST BUS</div>
      <div class="nw-logo-line"></div>
      <div class="cover-date">${new Date().toLocaleDateString('ar-SA')}</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat purple"><div class="stat-val" style="color:#5B5BD6">${rows.length}</div><div class="stat-lbl">إجمالي المحطات</div></div>
    <div class="stat green"><div class="stat-val" style="color:#059669">${evaluated}</div><div class="stat-lbl">تم تقييمها</div></div>
    <div class="stat gold"><div class="stat-val" style="color:#B45309">${stars}</div><div class="stat-lbl">محطة متميزة ★</div></div>
  </div>
  <div class="table-wrap">
    <div class="table-head"><div class="table-head-dot"></div><div class="table-head-title">قائمة المحطات — ${MN[month-1]} ${year}</div></div>
    <table><thead><tr><th style="width:36px">#</th><th>المحطة</th><th>النتيجة</th><th>التقدير</th></tr></thead><tbody>
    ${rows.map((r,i) => `<tr>
      <td><span class="row-num">${i+1}</span></td>
      <td><div class="emp-name">${r.name||'—'}${r.has_star?' <span style="color:#F59E0B">★</span>':''}</div></td>
      <td>${scoreBarHtml(r.score)}</td>
      <td>${scoreBadge(r.score)}</td>
    </tr>`).join('')}
    </tbody></table>
  </div>
  <div class="footer"><div class="footer-brand">NORTH WEST BUS &nbsp;—&nbsp; www.nwstation.com</div><div class="footer-meta">تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}</div></div>
</div></body></html>`
}

// ── HTML تقرير الفترة ─────────────────────────────────────────
function buildRangeReportHtml(data, rangeStart, rangeEnd, selEmpSet, employees) {
  const MN = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const empName = selEmpSet.size === 0 ? 'جميع الموظفين' : [...selEmpSet].map(id => employees.find(e => e.id === id)?.full_name_ar || '').filter(Boolean).join('، ')
  const sorted = [...data].sort((a,b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>تقرير فترة التقييم</title>
<style>${reportCss()}</style></head><body>
<div class="wrap">
  <div class="cover">
    <div class="cover-right">
      <div class="logo-mark">Northwest Bus · تقرير رسمي</div>
      <div class="cover-title">تقرير فترة التقييم</div>
      <div class="cover-sub">${MN[rangeStart.month-1]} ${rangeStart.year} — ${MN[rangeEnd.month-1]} ${rangeEnd.year} &nbsp;·&nbsp; ${empName}</div>
    </div>
    <div class="cover-left">
      <div class="nw-logo">NORTH WEST BUS</div>
      <div class="nw-logo-line"></div>
      <div class="cover-date">${new Date().toLocaleDateString('ar-SA')}</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat purple"><div class="stat-val" style="color:#5B5BD6">${sorted.length}</div><div class="stat-lbl">إجمالي التقييمات</div></div>
    <div class="stat green"><div class="stat-val" style="color:#059669">${sorted.filter(r=>r.total_score>=85).length}</div><div class="stat-lbl">ممتاز وما فوق</div></div>
    <div class="stat gold"><div class="stat-val" style="color:#B45309">${sorted.filter(r=>r.total_score>=98).length}</div><div class="stat-lbl">متميز ★</div></div>
  </div>
  <div class="table-wrap">
    <div class="table-head"><div class="table-head-dot"></div><div class="table-head-title">سجل التقييمات</div></div>
    <table><thead><tr><th style="width:36px">#</th><th>الموظف</th><th>الرقم الوظيفي</th><th>الشهر</th><th>المحطة</th><th>النتيجة</th><th>التقدير</th></tr></thead><tbody>
    ${sorted.map((r,i) => `<tr>
      <td><span class="row-num">${i+1}</span></td>
      <td><div class="emp-name">${r.employee?.full_name_ar||'—'}</div></td>
      <td>${r.employee?.job_number?`<span class="job-tag">${r.employee.job_number}</span>`:'<span style="color:#d1d5db">—</span>'}</td>
      <td><span style="font-family:monospace;font-size:12px;color:#6B7280">${MN[r.month-1]} ${r.year}</span></td>
      <td><span class="station-text">${r.employee?.station?.name_ar||'—'}</span></td>
      <td>${scoreBarHtml(r.total_score)}</td>
      <td>${scoreBadge(r.total_score)}</td>
    </tr>`).join('')}
    </tbody></table>
  </div>
  <div class="footer"><div class="footer-brand">NORTH WEST BUS &nbsp;—&nbsp; www.nwstation.com</div><div class="footer-meta">تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}</div></div>
</div></body></html>`
}

// ── HTML تقرير فترة المحطات ───────────────────────────────────
function buildStnRangeReportHtml(data, rangeStart, rangeEnd, selStnRange, stations, reportLabel = 'المحطات') {
  const MN = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const allLabel = reportLabel === 'محطات الوكلاء' ? 'جميع محطات الوكلاء' : 'جميع المحطات'
  const stnName = selStnRange === 'all' ? allLabel : stations.find(s => s.id === selStnRange)?.name_ar || ''
  const sorted = [...data].sort((a,b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>تقرير فترة تقييم ${reportLabel}</title>
<style>${reportCss()}</style></head><body>
<div class="wrap">
  <div class="cover">
    <div class="cover-right">
      <div class="logo-mark"></div>
      <div class="cover-title">تقرير فترة تقييم ${reportLabel}</div>
      <div class="cover-sub">${MN[rangeStart.month-1]} ${rangeStart.year} — ${MN[rangeEnd.month-1]} ${rangeEnd.year} &nbsp;·&nbsp; ${stnName}</div>
    </div>
    <div class="cover-left">
      <div class="nw-logo">NORTH WEST BUS</div>
      <div class="nw-logo-line"></div>
      <div class="cover-date">${new Date().toLocaleDateString('ar-SA')}</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat purple"><div class="stat-val" style="color:#5B5BD6">${sorted.length}</div><div class="stat-lbl">إجمالي التقييمات</div></div>
    <div class="stat green"><div class="stat-val" style="color:#059669">${sorted.filter(r=>r.total_score>=85).length}</div><div class="stat-lbl">ممتاز وما فوق</div></div>
    <div class="stat gold"><div class="stat-val" style="color:#B45309">${sorted.filter(r=>r.total_score>=98).length}</div><div class="stat-lbl">متميزة ★</div></div>
  </div>
  <div class="table-wrap">
    <div class="table-head"><div class="table-head-dot"></div><div class="table-head-title">سجل تقييمات المحطات</div></div>
    <table><thead><tr><th style="width:36px">#</th><th>المحطة</th><th>الشهر</th><th>النتيجة</th><th>التقدير</th></tr></thead><tbody>
    ${sorted.map((r,i) => `<tr>
      <td><span class="row-num">${i+1}</span></td>
      <td><div class="emp-name">${r.station?.name_ar||'—'}</div></td>
      <td><span style="font-family:monospace;font-size:12px;color:#6B7280">${MN[r.month-1]} ${r.year}</span></td>
      <td>${scoreBarHtml(r.total_score)}</td>
      <td>${scoreBadge(r.total_score)}</td>
    </tr>`).join('')}
    </tbody></table>
  </div>
  <div class="footer"><div class="footer-brand">NORTH WEST BUS &nbsp;—&nbsp; www.nwstation.com</div><div class="footer-meta">تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}</div></div>
</div></body></html>`
}
