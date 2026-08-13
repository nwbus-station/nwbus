import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

const MONO = "'IBM Plex Mono', monospace"
const STAR_THRESHOLD = 98

// ── معايير تقييم الموظفين ─────────────────────────────────────
const EMP_CRITERIA = [
  { key: 'attendance',    ar: 'الالتزام بالدوام والحضور',       weight: 10 },
  { key: 'work_quality',  ar: 'جودة العمل والدقة',              weight: 15 },
  { key: 'customer',      ar: 'التعامل مع الركاب والعملاء',      weight: 15 },
  { key: 'discipline',    ar: 'الانضباط الوظيفي والمظهر',       weight: 10 },
  { key: 'productivity',  ar: 'الإنتاجية وإنجاز المهام',        weight: 15 },
  { key: 'teamwork',      ar: 'التعاون مع الفريق',              weight: 10 },
  { key: 'compliance',    ar: 'الالتزام بالإجراءات والسياسات',  weight: 10 },
  { key: 'initiative',    ar: 'المبادرة وحل المشكلات',          weight: 10 },
  { key: 'development',   ar: 'التطوير الذاتي والتعلم',         weight: 5  },
  { key: 'integrity',     ar: 'الأمانة والنزاهة',               weight: 5  },
]

// ── معايير تقييم المحطات ──────────────────────────────────────
const STN_CRITERIA = [
  { key: 'sales',         ar: 'أداء المبيعات',           weight: 20 },
  { key: 'trips',         ar: 'انضباط الرحلات والترحيل', weight: 20 },
  { key: 'safety',        ar: 'السلامة التشغيلية',       weight: 15 },
  { key: 'cleanliness',   ar: 'نظافة المحطة وصيانتها',   weight: 15 },
  { key: 'satisfaction',  ar: 'رضا الركاب',              weight: 15 },
  { key: 'hospitality',   ar: 'الضيافة والخدمات',        weight: 10 },
  { key: 'procedures',    ar: 'الالتزام بالإجراءات',     weight: 5  },
]

const SCORE_LABELS = ['', 'ضعيف', 'مقبول', 'جيد', 'جيد جداً', 'ممتاز']
const SCORE_COLORS = ['', '#DC2626', '#D97706', '#2563EB', '#059669', '#7C3AED']

const ROLE_LABELS = {
  general_admin:    'المدير التنفيذي التجاري',
  station_admin:    'مشرف المحطة',
  accountant:       'محاسب',
  station_employee: 'موظف محطة',
  shift_supervisor: 'مشرف وردية',
}

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

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
function EvalForm({ criteria, scores, onChange, notes, onNotes, disabled }) {
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
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)' }}>{c.ar}</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.62rem', color: 'var(--text-3)', fontFamily: MONO }}>
                وزن: {c.weight}%
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
              }}>{SCORE_LABELS[s]}</span>
            )}
          </div>
        )
      })}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
        <p style={{ margin: '0 0 8px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          ملاحظات
        </p>
        <textarea
          value={notes}
          onChange={e => onNotes(e.target.value)}
          disabled={disabled}
          placeholder="أضف ملاحظاتك هنا..."
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
  const color = score >= 98 ? '#6D28D9' : score >= 85 ? '#059669' : score >= 70 ? '#2563EB' : score >= 50 ? '#D97706' : '#DC2626'
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
function EmployeeEvalModal({ employee, month, year, existing, onClose, onSave, isAdmin, evaluatorId }) {
  const [scores, setScores] = useState(existing?.scores || {})
  const [notes, setNotes]   = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)

  const totalScore = calcScore(scores, EMP_CRITERIA)
  const allFilled  = EMP_CRITERIA.every(c => scores[c.key] > 0)

  async function handleSave() {
    if (!allFilled) return setErr('يرجى تقييم جميع البنود قبل الحفظ')
    setSaving(true); setErr(null)
    const payload = {
      evaluator_id: evaluatorId,
      employee_id: employee.id,
      station_id: employee.station_id,
      eval_month: month, eval_year: year,
      scores, notes, total_score: totalScore,
    }
    let error
    if (existing) {
      ;({ error } = await supabase.from('employee_evaluations').update(payload).eq('id', existing.id))
    } else {
      ;({ error } = await supabase.from('employee_evaluations').insert(payload))
    }
    setSaving(false)
    if (error) return setErr(error.message)
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
              تقييم: {employee.full_name_ar || employee.full_name}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)', fontFamily: MONO }}>
              {MONTHS_AR[month - 1]} {year} · {ROLE_LABELS[employee.role]}
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
        />

        {/* تذييل */}
        {!readonly && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            {err && <p style={{ margin: 0, fontSize: '0.72rem', color: '#DC2626' }}>{err}</p>}
            <div style={{ display: 'flex', gap: 10, marginInlineStart: 'auto' }}>
              <button onClick={onClose} style={{ padding: '9px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>
                إلغاء
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
                {saving ? 'جارٍ الحفظ…' : existing ? 'تحديث التقييم' : 'حفظ التقييم'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── صفحة تقييم المحطة ────────────────────────────────────────
function StationEvalModal({ station, month, year, existing, onClose, onSave, evaluatorId }) {
  const [scores, setScores] = useState(existing?.scores || {})
  const [notes, setNotes]   = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)

  const totalScore = calcScore(scores, STN_CRITERIA)
  const allFilled  = STN_CRITERIA.every(c => scores[c.key] > 0)

  async function handleSave() {
    if (!allFilled) return setErr('يرجى تقييم جميع البنود')
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
              تقييم محطة: {station.name_ar}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)', fontFamily: MONO }}>
              {MONTHS_AR[month - 1]} {year}
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
        />

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {err && <p style={{ margin: 0, fontSize: '0.72rem', color: '#DC2626' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, marginInlineStart: 'auto' }}>
            <button onClick={onClose} style={{ padding: '9px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>
              إلغاء
            </button>
            <button onClick={handleSave} disabled={saving || !allFilled} style={{
              padding: '9px 24px',
              background: allFilled ? 'var(--accent)' : 'var(--surface-2)',
              border: 'none', borderRadius: 7,
              cursor: allFilled ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700,
              color: allFilled ? '#fff' : 'var(--text-3)',
            }}>
              {saving ? 'جارٍ الحفظ…' : existing ? 'تحديث' : 'حفظ التقييم'}
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
  const { profile } = useAuth()
  const { i18n }   = useTranslation()
  const isAr       = i18n.language === 'ar'
  const isAdmin    = profile?.role === 'general_admin'
  const canEvalEmp = ['general_admin','station_admin','shift_supervisor','area_supervisor'].includes(profile?.role)
  const canEvalStn = ['general_admin','station_admin','area_supervisor'].includes(profile?.role)

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

  const [empModal,    setEmpModal]    = useState(null)
  const [stnModal,    setStnModal]    = useState(null)
  const [printModal,  setPrintModal]  = useState(null) // 'employees' | 'stations' | 'range'

  // ── تحميل البيانات ─────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const promises = []

    // الموظفون
    if (canEvalEmp || isAdmin) {
      let q = supabase.from('users').select('id, full_name_ar, username, job_number, role, station_id, station:station_id(name_ar, name_en)')
        .neq('role', 'general_admin')
      if (!isAdmin) {
        q = q.eq('role', 'station_employee')
        const stationId = profile?.station_id || profile?.station?.id
        if (stationId) q = q.eq('station_id', stationId)
      }
      promises.push(q.then(r => setEmployees(r.data || [])))
    }

    // المحطات
    if (canEvalStn) {
      promises.push(
        supabase.from('stations').select('id, name_ar, name_en').then(r => setStations((r.data || []).sort((a,b) => a.name_ar.localeCompare(b.name_ar, 'ar'))))
      )
    }

    // تقييمات الموظفين
    {
      let q = supabase.from('employee_evaluations').select('*').eq('eval_month', selMonth).eq('eval_year', selYear)
      if (!isAdmin) q = q.eq('evaluator_id', profile?.id)
      promises.push(q.then(r => setEmpEvals(r.data || [])))
    }

    // تقييمات المحطات
    if (canEvalStn) {
      promises.push(
        supabase.from('station_evaluations').select('*').eq('eval_month', selMonth).eq('eval_year', selYear)
          .then(r => setStnEvals(r.data || []))
      )
    }

    // تقييمي الشخصي
    if (!isAdmin) {
      promises.push(
        supabase.from('employee_evaluations').select('*, evaluator:evaluator_id(full_name_ar, role)')
          .eq('employee_id', profile?.id).eq('eval_month', selMonth).eq('eval_year', selYear)
          .maybeSingle()
          .then(r => setMyEval(r.data))
      )
    }

    await Promise.all(promises)
    setLoading(false)
  }, [selMonth, selYear, profile?.id, isAdmin, canEvalEmp, canEvalStn])

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

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: 'var(--shadow-sm)' }

  // ── الجدول ────────────────────────────────────────────────
  const TABS = [
    ...(canEvalEmp ? [{ id: 'employees', ar: 'تقييم الموظفين' }] : []),
    ...(canEvalStn ? [{ id: 'stations',  ar: 'تقييم المحطات'  }] : []),
    { id: 'my_eval', ar: 'تقييمي' },
  ]

  return (
    <div dir="rtl" style={{ minHeight: 'calc(100vh - 108px)', background: 'var(--surface)' }}>

      {/* ── رأس الصفحة ── */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '16px 28px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-1)' }}>نظام التقييم</h1>
              <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)', fontFamily: MONO }}>
                تقييم الموظفين والمحطات — دوري شهري
              </p>
            </div>
            {/* اختيار الشهر والسنة */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={selMonth} onChange={e => setSelMonth(+e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.78rem', cursor: 'pointer' }}>
                {MONTHS_AR.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <select value={selYear} onChange={e => setSelYear(+e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.78rem', cursor: 'pointer' }}>
                {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setPrintModal('employees')} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 16px', background: '#1C2B4A', color: '#fff',
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                  }}>
                    <Svg d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" size={14} />
                    طباعة تقييم الموظفين
                  </button>
                  <button onClick={() => setPrintModal('stations')} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 16px', background: 'var(--card)', color: 'var(--text-1)',
                    border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                  }}>
                    <Svg d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" size={14} />
                    طباعة تقييم المحطات
                  </button>
                  <button onClick={() => setPrintModal('range')} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 16px', background: 'var(--card)', color: 'var(--text-1)',
                    border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                  }}>
                    <Svg d="M8 2v4M16 2v4M3 10h18M21 8H3a1 1 0 00-1 1v11a1 1 0 001 1h18a1 1 0 001-1V9a1 1 0 00-1-1z" size={14} />
                    تقرير فترة
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* تبويبات */}
          <div style={{ display: 'flex', gap: 0, marginTop: 16, borderBottom: '1px solid var(--border)' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 18px', background: 'none', border: 'none',
                borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === t.id ? 'var(--accent)' : 'var(--text-3)',
                fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: tab === t.id ? 700 : 500,
                cursor: 'pointer', marginBottom: -1,
              }}>{t.ar}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── المحتوى ── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 28px' }}>

        {/* ══ تقييم الموظفين ══ */}
        {tab === 'employees' && canEvalEmp && (
          <div>
            {/* فلتر + إحصاء */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="بحث: اسم، رقم وظيفي، محطة..."
                  style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.78rem', minWidth: 220, outline: 'none' }}
                />
                {isAdmin && (
                  <select value={filterStation} onChange={e => setFilterStation(e.target.value)}
                    style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.78rem' }}>
                    <option value="all">كل المحطات</option>
                    {stations.map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
                  </select>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, background: 'var(--card)', border: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
                  تم تقييمهم: <strong style={{ fontFamily: MONO }}>{empEvals.length}</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, background: 'var(--card)', border: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-2)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
                  لم يُقيَّموا: <strong style={{ fontFamily: MONO }}>{notEvaluated.length}</strong>
                </span>
              </div>
            </div>

            {/* جدول الموظفين */}
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 14, background: 'var(--accent)', borderRadius: 2 }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.09em', fontFamily: MONO, textTransform: 'uppercase' }}>
                  قائمة الموظفين — {MONTHS_AR[selMonth-1]} {selYear}
                </span>
              </div>

              {loading ? (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[1,2,3].map(i => <div key={i} style={{ height: 52, background: 'var(--surface)', borderRadius: 6 }} />)}
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.82rem' }}>
                  لا يوجد موظفون
                </div>
              ) : filteredEmployees.map((emp, i) => {
                const ev = empEvals.find(x => x.employee_id === emp.id)
                const hasStar = ev?.total_score >= STAR_THRESHOLD
                return (
                  <div key={emp.id} style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '13px 18px',
                    borderBottom: i < filteredEmployees.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    {/* رقم الصف */}
                    <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: 'var(--text-3)', minWidth: 20, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>

                    {/* مؤشر الحالة */}
                    <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: '50%', background: ev ? '#059669' : 'var(--border)' }} />

                    {/* اسم الموظف */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-1)' }}>
                          {emp.full_name_ar || '—'}
                        </span>
                        {hasStar && <StarBadge size={13} />}
                      </div>
                      <div style={{ marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {emp.job_number && (
                          <span style={{ fontFamily: MONO, fontSize: '0.67rem', color: 'var(--text-3)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 4 }}>
                            {emp.job_number}
                          </span>
                        )}
                        {emp.station?.name_ar && <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{emp.station.name_ar}</span>}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>· {ROLE_LABELS[emp.role]}</span>
                      </div>
                    </div>

                    {/* النتيجة */}
                    <div style={{ minWidth: 170 }}>
                      {ev ? <ScoreBar score={ev.total_score} /> : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>لم يُقيَّم بعد</span>
                      )}
                    </div>

                    {/* زر التقييم */}
                    <button
                      onClick={() => setEmpModal({ employee: emp, existing: ev || null })}
                      style={{
                        padding: '6px 18px', borderRadius: 6, flexShrink: 0,
                        background: ev ? 'var(--card)' : '#1C2B4A',
                        border: ev ? '1px solid var(--border)' : 'none',
                        color: ev ? 'var(--text-2)' : '#fff',
                        fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600,
                        cursor: 'pointer',
                      }}>
                      {ev ? 'تعديل' : 'تقييم'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ تقييم المحطات ══ */}
        {tab === 'stations' && canEvalStn && (
          <div>
            {/* بحث المحطات */}
            <div style={{ marginBottom: 14 }}>
              <input
                value={stnSearchQuery} onChange={e => setStnSearchQuery(e.target.value)}
                placeholder="بحث باسم المحطة..."
                style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.78rem', minWidth: 240, outline: 'none' }}
              />
            </div>

          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 14, background: 'var(--border)', borderRadius: 2 }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.09em', fontFamily: MONO, textTransform: 'uppercase' }}>
                تقييم المحطات — {MONTHS_AR[selMonth-1]} {selYear}
              </span>
            </div>

            {loading ? (
              <div style={{ padding: 20 }}><div style={{ height: 60, background: 'var(--surface)', borderRadius: 6 }} /></div>
            ) : (() => {
              const filtered = stations.filter(s =>
                !stnSearchQuery ||
                s.name_ar.includes(stnSearchQuery) ||
                (s.name_en || '').toLowerCase().includes(stnSearchQuery.toLowerCase())
              )
              return filtered.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.82rem' }}>لا توجد نتائج</div>
              ) : filtered.map((stn, i) => {
              const ev = stnEvals.find(x => x.station_id === stn.id)
              return (
                <div key={stn.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: '13px 18px',
                  borderBottom: i < stations.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: 'var(--text-3)', minWidth: 20, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: '50%', background: ev ? '#059669' : 'var(--border)' }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-1)' }}>{stn.name_ar}</span>
                    <div style={{ marginTop: 2, fontSize: '0.7rem', color: 'var(--text-3)' }}>{stn.name_en}</div>
                  </div>
                  <div style={{ minWidth: 170 }}>
                    {ev ? <ScoreBar score={ev.total_score} /> : <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>لم تُقيَّم بعد</span>}
                  </div>
                  <button
                    onClick={() => setStnModal({ station: stn, existing: ev || null })}
                    style={{
                      padding: '6px 18px', borderRadius: 6, flexShrink: 0,
                      background: ev ? 'var(--card)' : '#1C2B4A',
                      border: ev ? '1px solid var(--border)' : 'none',
                      color: ev ? 'var(--text-2)' : '#fff',
                      fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600,
                      cursor: 'pointer',
                    }}>
                    {ev ? 'تعديل' : 'تقييم'}
                  </button>
                </div>
              )
            })})()}
          </div>
          </div>
        )}

        {/* ══ تقييمي ══ */}
        {tab === 'my_eval' && (
          <div>
            {loading ? (
              <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--text-3)' }}>جاري التحميل…</div>
            ) : !myEval ? (
              <div style={{ ...card, padding: '48px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                  <Svg d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" size={22} />
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-2)' }}>لم يتم تقييمك هذا الشهر بعد</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-3)' }}>{MONTHS_AR[selMonth-1]} {selYear}</p>
              </div>
            ) : (
              <div style={{ ...card, overflow: 'hidden' }}>
                {/* نتيجة عامة */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-1)' }}>
                        نتيجة تقييم {MONTHS_AR[selMonth-1]} {selYear}
                      </p>
                      <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-3)' }}>
                        المُقيِّم: {myEval.evaluator?.full_name_ar} · {ROLE_LABELS[myEval.evaluator?.role]}
                      </p>
                    </div>
                    {myEval.total_score >= STAR_THRESHOLD && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#F59E0B15', border: '1px solid #F59E0B30', borderRadius: 8 }}>
                        <StarBadge size={16} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F59E0B' }}>موظف متميز</span>
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
                      <p style={{ flex: 1, margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>{c.ar}</p>
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
                        {s > 0 ? SCORE_LABELS[s] : '—'}
                      </span>
                    </div>
                  )
                })}

                {myEval.notes && (
                  <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                    <p style={{ margin: '0 0 6px', fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ملاحظات المقيِّم</p>
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
          onClose={() => setPrintModal(null)}
        />
      )}
    </div>
  )
}

// ── مودال الطباعة المتقدمة ────────────────────────────────────
function PrintModal({ type, employees, stations, empEvals, stnEvals, selMonth, selYear, onClose }) {
  const now = new Date()
  const [selStations, setSelStations] = useState(new Set(stations.map(s => s.id)))
  const [selEmployee, setSelEmployee] = useState('all')
  const [rangeStart, setRangeStart] = useState({ month: selMonth, year: selYear })
  const [rangeEnd,   setRangeEnd]   = useState({ month: selMonth, year: selYear })
  const [rangeData,  setRangeData]  = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [stnSearch,  setStnSearch]  = useState('')
  const [empSearch,  setEmpSearch]  = useState('')
  const [empDropOpen, setEmpDropOpen] = useState(false)
  const [empSelected, setEmpSelected] = useState(null)
  const empRef = useRef(null)

  useEffect(() => {
    function h(e) { if (empRef.current && !empRef.current.contains(e.target)) setEmpDropOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

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
    const months = monthsBetween(rangeStart, rangeEnd)
    const empId = selEmployee === 'all' ? null : selEmployee
    const results = await Promise.all(months.map(async ({ month, year }) => {
      let q = supabase.from('employee_evaluations').select('*, employee:employee_id(full_name_ar, username, job_number, role, station:station_id(name_ar))')
        .eq('eval_month', month).eq('eval_year', year)
      if (empId) q = q.eq('employee_id', empId)
      const { data } = await q
      return (data || []).map(r => ({ ...r, month, year }))
    }))
    setRangeData(results.flat())
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
    if (rows.length === 0) { alert('لا توجد محطات مقيّمة في الفترة المحددة'); return }
    printHtml(buildStationReportHtml(rows, selMonth, selYear))
  }

  function printRange() {
    if (!rangeData) return
    printHtml(buildRangeReportHtml(rangeData, rangeStart, rangeEnd, selEmployee, employees))
  }

  const inp = { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.78rem' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, width: '100%', maxWidth: 540, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-1)' }}>
            {type === 'employees' ? 'طباعة تقرير الموظفين' : type === 'stations' ? 'طباعة تقرير المحطات' : 'تقرير فترة زمنية'}
          </p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <Svg d="M18 6L6 18M6 6l12 12" size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* تحديد المحطات */}
          {(type === 'employees' || type === 'stations') && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>اختر المحطات</p>
                <button onClick={toggleAll} style={{ fontSize: '0.68rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  {selStations.size === stations.length ? 'إلغاء الكل' : 'تحديد الكل'}
                </button>
              </div>
              <input
                value={stnSearch} onChange={e => setStnSearch(e.target.value)}
                placeholder="بحث باسم المحطة..."
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
                {stations.filter(s => !stnSearch || s.name_ar.includes(stnSearch) || (s.name_en || '').toLowerCase().includes(stnSearch.toLowerCase())).map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 0' }}>
                    <input type="checkbox" checked={selStations.has(s.id)} onChange={() => toggleStation(s.id)}
                      style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-1)', fontWeight: 500 }}>{s.name_ar}</span>
                  </label>
                ))}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '0.65rem', color: 'var(--text-3)', fontFamily: MONO }}>{selStations.size} محطة محددة</p>
            </div>
          )}

          {/* تقرير فترة */}
          {type === 'range' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>الموظف</p>
                <div ref={empRef} style={{ position: 'relative' }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      value={empSearch}
                      onChange={e => { setEmpSearch(e.target.value); setEmpDropOpen(true); if (!e.target.value) { setSelEmployee('all'); setEmpSelected(null) } }}
                      onFocus={() => setEmpDropOpen(true)}
                      placeholder="ابحث بالاسم أو الرقم الوظيفي..."
                      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 36px 9px 12px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none' }}
                    />
                    {empSelected && (
                      <button onClick={() => { setEmpSearch(''); setEmpSelected(null); setSelEmployee('all') }}
                        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16, lineHeight: 1 }}>×</button>
                    )}
                  </div>
                  {empSelected && (
                    <div style={{ marginTop: 6, padding: '7px 12px', background: '#5B5BD615', border: '1px solid #5B5BD630', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)' }}>{empSelected.name}</span>
                        {empSelected.job && <span style={{ fontSize: '0.68rem', color: 'var(--accent)', fontFamily: MONO, marginRight: 8 }}>{empSelected.job}</span>}
                        {empSelected.station && <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}> · {empSelected.station}</span>}
                      </div>
                    </div>
                  )}
                  {empDropOpen && empSearch && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 10, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
                      <div
                        onClick={() => { setSelEmployee('all'); setEmpSelected(null); setEmpSearch(''); setEmpDropOpen(false) }}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 600 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >كل الموظفين</div>
                      {employees
                        .filter(e =>
                          (e.full_name_ar || '').includes(empSearch) ||
                          (e.job_number   || '').includes(empSearch) ||
                          (e.username     || '').includes(empSearch)
                        )
                        .slice(0, 12)
                        .map(e => (
                          <div key={e.id}
                            onClick={() => { setSelEmployee(e.id); setEmpSelected({ name: e.full_name_ar, job: e.job_number, station: e.station?.name_ar }); setEmpSearch(e.full_name_ar || ''); setEmpDropOpen(false) }}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-1)' }}>{e.full_name_ar}</span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              {e.job_number && <span style={{ fontSize: '0.68rem', fontFamily: MONO, color: 'var(--accent)', background: '#5B5BD612', padding: '2px 7px', borderRadius: 4 }}>{e.job_number}</span>}
                              {e.station?.name_ar && <span style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>{e.station.name_ar}</span>}
                            </div>
                          </div>
                        ))}
                      {employees.filter(e => (e.full_name_ar||'').includes(empSearch)||(e.job_number||'').includes(empSearch)||(e.username||'').includes(empSearch)).length === 0 && (
                        <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.78rem' }}>لا نتائج</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>من</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={rangeStart.month} onChange={e => setRangeStart(p => ({ ...p, month: +e.target.value }))} style={inp}>
                      {MONTHS_AR.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                    </select>
                    <select value={rangeStart.year} onChange={e => setRangeStart(p => ({ ...p, year: +e.target.value }))} style={inp}>
                      {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>إلى</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={rangeEnd.month} onChange={e => setRangeEnd(p => ({ ...p, month: +e.target.value }))} style={inp}>
                      {MONTHS_AR.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                    </select>
                    <select value={rangeEnd.year} onChange={e => setRangeEnd(p => ({ ...p, year: +e.target.value }))} style={inp}>
                      {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <button onClick={loadRange} disabled={loading} style={{ padding: '9px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-1)' }}>
                {loading ? 'جارٍ التحميل…' : 'تحميل البيانات'}
              </button>
              {rangeData && (
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#059669', fontFamily: MONO }}>✓ تم تحميل {rangeData.length} تقييم</p>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>إلغاء</button>
          <button
            disabled={type === 'range' && !rangeData}
            onClick={type === 'employees' ? printEmployees : type === 'stations' ? printStations : printRange}
            style={{ padding: '9px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, opacity: type === 'range' && !rangeData ? 0.5 : 1 }}>
            طباعة
          </button>
        </div>
      </div>
    </div>
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
function buildRangeReportHtml(data, rangeStart, rangeEnd, selEmployee, employees) {
  const MN = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const empName = selEmployee === 'all' ? 'جميع الموظفين' : employees.find(e => e.id === selEmployee)?.full_name_ar || ''
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
