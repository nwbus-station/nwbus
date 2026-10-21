import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { matchesSearch } from '../../utils/digits'
import StatStrip from '../shared/StatStrip'
import ConfirmDialog from '../shared/ConfirmDialog'
import SelectField from '../shared/SelectField'
import { docHeader, docShell, openDocWindow, esc } from '../../utils/printDoc'

const JOB_LABEL = { dispatcher_supervisor: 'مشرف مرحّلين', cleaner: 'عامل نظافة', dispatcher: 'مرحّل', customer_service: 'خدمة عملاء', station_supervisor: 'مشرف محطة', shift_supervisor: 'مشرف وردية', area_supervisor: 'مشرف منطقة' }
const jobOf = u => JOB_LABEL[u.job_title] || (u.role === 'station_employee' ? 'موظف محطة' : u.job_title || '—')

// قراءة كل الصفوف رغم حد 1000 صف
async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

const stationName = u => u?.station?.name_ar || '—'

// تقرير مشرفي الورديات: لكل مشرف قائمة الموظفين الذين أُسندوا له، مع تنبيهات الجودة والتغطية
export default function ShiftSupervisorsReport({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [users, setUsers] = useState([])
  const [assignments, setAssignments] = useState([])
  const [titles, setTitles] = useState([])
  const [tab, setTab] = useState('by')      // by | alerts | gap
  const [q, setQ] = useState('')
  const [station, setStation] = useState('')
  const [emptyOnly, setEmptyOnly] = useState(false)
  const [open, setOpen] = useState({})       // { supervisorId: bool }
  const [exporting, setExporting] = useState(false)
  const [confirmClean, setConfirmClean] = useState(false)

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const [u, a, t] = await Promise.all([
          fetchAll(() => supabase.from('users').select('id, full_name_ar, job_number, role, job_title, station_id, is_active, supervisor_id, custom_title_id, station:station_id(name_ar)').order('full_name_ar')),
          fetchAll(() => supabase.from('shift_supervisor_assignments').select('supervisor_id, employee_id')),
          supabase.from('custom_titles').select('id, permissions').then(r => r.data ?? []),
        ])
        if (off) return
        setUsers(u); setAssignments(a); setTitles(t)
      } catch (e) { if (!off) setErr(e.message || 'تعذّر تحميل البيانات') }
      if (!off) setLoading(false)
    })()
    return () => { off = true }
  }, [])

  const model = useMemo(() => {
    const byId = new Map(users.map(u => [u.id, u]))
    const assignedTitleIds = new Set(titles.filter(t => t.permissions?.assigned_evaluate || t.permissions?.assigned_leaves).map(t => t.id))
    const empsOf = new Map()                // مشرف ← [موظفون]
    const supsOf = new Map()                // موظف ← [مشرفون]
    for (const a of assignments) {
      const emp = byId.get(a.employee_id), sup = byId.get(a.supervisor_id)
      if (!emp || !sup) continue
      if (!empsOf.has(sup.id)) empsOf.set(sup.id, [])
      empsOf.get(sup.id).push(emp)
      if (!supsOf.has(emp.id)) supsOf.set(emp.id, [])
      supsOf.get(emp.id).push(sup)
    }
    const isSup = u => u.role === 'shift_supervisor' || empsOf.has(u.id) || (u.custom_title_id && assignedTitleIds.has(u.custom_title_id))
    const sups = users.filter(isSup).map(s => ({ ...s, emps: (empsOf.get(s.id) ?? []).sort((a, b) => (a.full_name_ar || '').localeCompare(b.full_name_ar || '', 'ar')) }))
      .sort((a, b) => stationName(a).localeCompare(stationName(b), 'ar') || (a.full_name_ar || '').localeCompare(b.full_name_ar || '', 'ar'))

    const assignedIds = new Set(supsOf.keys())
    const multi = [...supsOf.entries()].filter(([, s]) => s.length > 1).map(([id, s]) => ({ emp: byId.get(id), sups: s }))
    const stale = sups.filter(s => s.emps.length && s.role !== 'shift_supervisor' && !(s.custom_title_id && assignedTitleIds.has(s.custom_title_id)))   // لم يعودوا مشرفي ورديات
    const emptySups = sups.filter(s => s.is_active && !s.emps.length)
    const inactiveSupWithEmps = sups.filter(s => !s.is_active && s.emps.length)
    const inactiveAssigned = [...supsOf.entries()].filter(([id]) => byId.get(id)?.is_active === false).map(([id, s]) => ({ emp: byId.get(id), sups: s }))
    // موظفو محطات فيها مشرف وردية فعّال لكنهم غير مُسندين لأي مشرف
    const stationsWithSup = new Set(sups.filter(s => s.is_active && s.station_id).map(s => s.station_id))
    const gap = users.filter(u => u.is_active && u.role === 'station_employee' && !isSup(u) && !assignedIds.has(u.id) && stationsWithSup.has(u.station_id))
    return { sups, stale, multi, emptySups, inactiveSupWithEmps, inactiveAssigned, gap, assignedCount: assignedIds.size }
  }, [users, assignments, titles])

  const stations = useMemo(() => {
    const m = new Map()
    model.sups.forEach(s => { if (s.station_id) m.set(s.station_id, stationName(s)) })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'))
  }, [model.sups])

  const shownSups = model.sups.filter(s => {
    if (station && s.station_id !== station) return false
    if (emptyOnly && s.emps.length) return false
    if (!q.trim()) return true
    return matchesSearch(s.full_name_ar, q) || matchesSearch(s.job_number, q) || s.emps.some(e => matchesSearch(e.full_name_ar, q) || matchesSearch(e.job_number, q))
  })
  const alertCount = model.stale.length + model.emptySups.length + model.multi.length + model.inactiveSupWithEmps.length + model.inactiveAssigned.length
  const today = new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', year: 'numeric' })

  const flatRows = () => {
    const rows = []
    let i = 0
    for (const s of shownSups) {
      if (!s.emps.length) rows.push([++i, s.full_name_ar, s.job_number || '', stationName(s), '', '', '', '', s.is_active ? 'نشط' : 'معطّل', 'بلا موظفين'])
      for (const e of s.emps) {
        const others = (model.multi.find(m => m.emp.id === e.id)?.sups ?? []).filter(x => x.id !== s.id).map(x => x.full_name_ar)
        rows.push([++i, s.full_name_ar, s.job_number || '', stationName(s), e.full_name_ar, e.job_number || '', jobOf(e), stationName(e), e.is_active ? 'نشط' : 'معطّل', others.length ? `مُسند أيضاً لـ: ${others.join('، ')}` : ''])
      }
    }
    return rows
  }

  async function cleanStale() {
    setConfirmClean(false)
    const ids = model.stale.map(s => s.id)
    const { error } = await supabase.from('shift_supervisor_assignments').delete().in('supervisor_id', ids)
    if (error) { alert('تعذّرت الإزالة: ' + error.message); return }
    setAssignments(prev => prev.filter(a => !ids.includes(a.supervisor_id)))
  }

  async function exportExcel() {
    setExporting(true)
    try {
      const { exportTableXlsx } = await import('../../utils/excelExport')
      await exportTableXlsx({
        isAr: true, filename: `تقرير-مشرفي-الورديات-${new Date().toISOString().slice(0, 10)}`, sheetName: 'مشرفو الورديات', title: 'تقرير مشرفي الورديات وموظفيهم',
        subtitle: 'الموظفون المُسندون لكل مشرف وردية', meta: [['مشرفو الورديات', model.sups.length], ['موظفون مُسندون', model.assignedCount]],
        columns: [{ header: '#', w: 6 }, { header: 'مشرف الوردية', w: 26 }, { header: 'رقمه الوظيفي', w: 14 }, { header: 'محطة المشرف', w: 20 }, { header: 'الموظف', w: 26 }, { header: 'الرقم الوظيفي', w: 14 }, { header: 'المسمى الوظيفي', w: 16 }, { header: 'محطة الموظف', w: 20 }, { header: 'الحالة', w: 10 }, { header: 'ملاحظة', w: 34 }],
        rows: flatRows(), landscape: true,
      })
    } catch (e) { alert('تعذّر التصدير: ' + (e.message || '')) }
    setExporting(false)
  }

  function printReport() {
    const th = 'background:#F3F4F6;color:#374151;padding:7px 9px;font-size:11px;text-align:right;border-bottom:1.5px solid #E5E7EB'
    const td = 'padding:6px 9px;font-size:11.5px;border-bottom:1px solid #EEF0F3;text-align:right'
    const sect = shownSups.map(s => `
      <div style="margin-top:16px;page-break-inside:avoid">
        <div style="display:flex;align-items:center;gap:10px;background:#EEF2F7;border-right:4px solid #264673;padding:8px 12px">
          <b style="font-size:13.5px;color:#1C2B36">${esc(s.full_name_ar)}</b>
          <span style="font-size:11px;color:#6B7280">#${esc(s.job_number || '—')} · ${esc(stationName(s))}${s.is_active ? '' : ' · معطّل'}</span>
          <span style="margin-inline-start:auto;font-size:11.5px;font-weight:700;color:#264673">${s.emps.length} موظف</span>
        </div>
        ${s.emps.length ? `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="${th};width:34px">#</th><th style="${th}">الموظف</th><th style="${th}">الرقم الوظيفي</th><th style="${th}">المسمى</th><th style="${th}">المحطة</th></tr></thead><tbody>
          ${s.emps.map((e, i) => `<tr><td style="${td}">${i + 1}</td><td style="${td}">${esc(e.full_name_ar)}${e.is_active ? '' : ' <i style="color:#B91C1C">(معطّل)</i>'}</td><td style="${td};direction:ltr;text-align:right">${esc(e.job_number || '—')}</td><td style="${td}">${esc(jobOf(e))}</td><td style="${td}">${esc(stationName(e))}</td></tr>`).join('')}
        </tbody></table>` : '<div style="padding:10px 12px;font-size:11.5px;color:#B45309">لا يوجد موظفون مُسندون لهذا المشرف</div>'}
      </div>`).join('')
    const body = `${docHeader({ title: 'تقرير مشرفي الورديات وموظفيهم', infoLines: [today, `${shownSups.length} مشرف`, `${model.assignedCount} موظف مُسند`] })}${sect}`
    openDocWindow(docShell({ title: 'تقرير مشرفي الورديات', body, footerLeft: today, footerRight: `${shownSups.length} مشرف` }))
  }

  const chip = (txt, tone) => <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${tone}`}>{txt}</span>
  const badge = a => (a ? chip('نشط', 'text-green-700 bg-green-50 border-green-200') : chip('معطّل', 'text-red-700 bg-red-50 border-red-200'))

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto" dir="rtl">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-gray-800">تقرير مشرفي الورديات</h2>
          <p className="text-xs text-gray-500">الموظفون الذين يقيّمهم كل مشرف وردية، مع تنبيهات الجودة والتغطية</p>
        </div>
        <button type="button" onClick={exportExcel} disabled={loading || exporting || !shownSups.length} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">{exporting ? 'جارٍ التصدير...' : 'تصدير Excel'}</button>
        <button type="button" onClick={printReport} disabled={loading || !shownSups.length} className="px-4 py-2 bg-nwbus-primary text-white rounded-lg text-sm font-semibold disabled:opacity-40">طباعة / PDF</button>
        <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50">إغلاق</button>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}
        {loading ? <p className="text-center text-gray-400 py-16">جارٍ تحميل البيانات...</p> : (
          <>
            <StatStrip items={[
              { label: 'مشرفو الورديات', val: model.sups.length },
              { label: 'موظفون مُسندون', val: model.assignedCount },
              { label: 'مشرفون بلا موظفين', val: model.emptySups.length, tone: model.emptySups.length ? 'text-amber-600' : undefined },
              { label: 'موظفون بلا مشرف', val: model.gap.length, tone: model.gap.length ? 'text-amber-600' : undefined },
              { label: 'تنبيهات', val: alertCount, tone: alertCount ? 'text-red-600' : 'text-green-600' },
            ]} />

            <div className="flex border-b border-gray-200">
              {[{ id: 'by', l: `حسب المشرف (${model.sups.length})` }, { id: 'alerts', l: `تنبيهات (${alertCount})` }, { id: 'gap', l: `موظفون بلا مشرف (${model.gap.length})` }].map(t => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-nwbus-primary text-nwbus-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.l}</button>
              ))}
            </div>

            {tab === 'by' && (
              <>
                <div className="flex gap-2 flex-wrap items-center">
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث باسم المشرف أو الموظف أو الرقم الوظيفي..." className="flex-1 min-w-[220px] border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
                  <SelectField value={station} onChange={e => setStation(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">كل المحطات</option>
                    {stations.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                  </SelectField>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" className="accent-nwbus-primary" checked={emptyOnly} onChange={e => setEmptyOnly(e.target.checked)} />المشرفون بلا موظفين فقط</label>
                </div>

                {shownSups.length === 0 && <p className="text-center text-gray-400 py-10">لا توجد نتائج</p>}
                {shownSups.map(s => {
                  const isOpen = open[s.id] ?? shownSups.length <= 6
                  return (
                    <div key={s.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <button type="button" onClick={() => setOpen(o => ({ ...o, [s.id]: !isOpen }))} className="w-full flex items-center gap-3 px-4 py-3 text-start hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{s.full_name_ar}</p>
                          <p className="text-xs text-gray-500 mt-0.5"><span className="font-mono">#{s.job_number || '—'}</span> · {stationName(s)}</p>
                        </div>
                        {badge(s.is_active)}
                        {model.stale.some(x => x.id === s.id) && chip('لم يعد مشرفاً', 'text-red-700 bg-red-50 border-red-200')}
                        {s.emps.length ? chip(`${s.emps.length} موظف`, 'text-nwbus-primary bg-blue-50 border-blue-200') : chip('بلا موظفين', 'text-amber-700 bg-amber-50 border-amber-200')}
                        <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                      </button>
                      {isOpen && (s.emps.length ? (
                        <div className="overflow-x-auto border-t border-gray-100">
                          <table className="w-full text-sm">
                            <thead><tr className="bg-gray-50 text-gray-500 text-xs"><th className="px-4 py-2 text-start w-10">#</th><th className="px-4 py-2 text-start">الموظف</th><th className="px-4 py-2 text-start">الرقم الوظيفي</th><th className="px-4 py-2 text-start">المسمى</th><th className="px-4 py-2 text-start">المحطة</th><th className="px-4 py-2 text-start">الحالة</th></tr></thead>
                            <tbody>
                              {s.emps.map((e, i) => {
                                const others = (model.multi.find(m => m.emp.id === e.id)?.sups ?? []).filter(x => x.id !== s.id)
                                return (
                                  <tr key={e.id} className="border-t border-gray-100">
                                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                                    <td className="px-4 py-2 text-gray-800">{e.full_name_ar}{others.length > 0 && <span className="ms-2 text-[11px] text-amber-700">مُسند أيضاً لـ {others.map(x => x.full_name_ar).join('، ')}</span>}</td>
                                    <td className="px-4 py-2 font-mono text-gray-600">{e.job_number || '—'}</td>
                                    <td className="px-4 py-2 text-gray-600">{jobOf(e)}</td>
                                    <td className="px-4 py-2 text-gray-600">{stationName(e)}</td>
                                    <td className="px-4 py-2">{badge(e.is_active)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : <p className="px-4 py-3 text-sm text-amber-700 border-t border-gray-100">لا يوجد موظفون مُسندون لهذا المشرف. أسندهم من تعديل حسابه ← «موظفو المشرف».</p>)}
                    </div>
                  )
                })}
              </>
            )}

            {tab === 'alerts' && (
              <div className="space-y-3">
                {alertCount === 0 && <p className="text-center text-green-700 py-10">لا توجد تنبيهات. كل مشرف له موظفون فعّالون وغير مكرّرين.</p>}
                {model.stale.length > 0 && (
                  <div className="bg-white border border-red-200 rounded-lg p-4">
                    <p className="text-sm font-bold text-gray-800">حساب لم يعد مشرف وردية وما زال له موظفون ({model.stale.length})</p>
                    <p className="text-xs text-gray-500 mt-0.5 mb-2"><b className="text-gray-800">المشكلة:</b> صلاحية الحساب الآن ليست «مشرف وردية»، لكن موظفيه القدامى ما زالوا مُسندين له.</p>
                    <ul className="text-sm text-gray-700 space-y-1 list-disc ps-5">{model.stale.map(s => <li key={s.id}>{s.full_name_ar} — {s.emps.length} موظف</li>)}</ul>
                    <button type="button" onClick={() => setConfirmClean(true)} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold">إزالة إسناداتهم ({model.stale.reduce((n, s) => n + s.emps.length, 0)})</button>
                  </div>
                )}
                {[
                  { t: 'موظف عند أكثر من مشرف وردية', bad: 'نفس الموظف مُسند لمشرفَي وردية أو أكثر، فيصل تقييمه للجميع.', fix: 'اترك الموظف عند مشرف واحد وأزله من الآخرين (من تعديل حساب المشرف ← موظفو المشرف). وإن كان مقصوداً فتجاهل التنبيه.', list: model.multi.map(m => ({ a: m.emp.full_name_ar, b: `عند: ${m.sups.map(s => s.full_name_ar).join(' و ')}` })) },
                  { t: 'مشرف وردية بلا موظفين', bad: 'مشرف فعّال لم تُسند له أي موظف، فلن يصله شيء ليقيّمه.', fix: 'أسند له موظفيه من تعديل حسابه ← موظفو المشرف.', list: model.emptySups.map(s => ({ a: s.full_name_ar, b: stationName(s) })) },
                  { t: 'مشرف معطّل وما زال له موظفون', bad: 'حساب المشرف معطّل لكن موظفيه ما زالوا مُسندين له، فلا أحد يقيّمهم.', fix: 'انقل موظفيه إلى مشرف فعّال.', list: model.inactiveSupWithEmps.map(s => ({ a: s.full_name_ar, b: `${s.emps.length} موظف` })) },
                  { t: 'موظف معطّل وما زال مُسنداً', bad: 'موظف أُوقف حسابه لكنه ما زال في قائمة مشرف.', fix: 'أزله من قائمة المشرف.', list: model.inactiveAssigned.map(m => ({ a: m.emp.full_name_ar, b: `عند: ${m.sups.map(s => s.full_name_ar).join(' و ')}` })) },
                ].filter(g => g.list.length).map(g => (
                  <div key={g.t} className="bg-white border border-amber-200 rounded-lg p-4">
                    <p className="text-sm font-bold text-gray-800">{g.t} <span className="text-amber-700">({g.list.length})</span></p>
                    <p className="text-xs text-gray-600 mt-1.5"><b className="text-gray-800">المشكلة:</b> {g.bad}</p>
                    <p className="text-xs text-gray-600 mt-1 mb-3"><b className="text-gray-800">الحل:</b> {g.fix}</p>
                    <div className="border border-gray-200 rounded divide-y divide-gray-100">
                      {g.list.map((x, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="font-semibold text-gray-800">{x.a}</span>
                          <span className="text-gray-500 text-xs text-end">{x.b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'gap' && (
              model.gap.length === 0 ? <p className="text-center text-green-700 py-10">كل موظفي المحطات التي فيها مشرف وردية مُسندون لمشرف.</p> : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                  <p className="px-4 py-3 text-xs text-gray-500 border-b border-gray-100">موظفون فعّالون في محطات فيها مشرف وردية فعّال، لكنهم غير مُسندين لأي مشرف.</p>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-gray-500 text-xs"><th className="px-4 py-2 text-start w-10">#</th><th className="px-4 py-2 text-start">الموظف</th><th className="px-4 py-2 text-start">الرقم الوظيفي</th><th className="px-4 py-2 text-start">المسمى</th><th className="px-4 py-2 text-start">المحطة</th></tr></thead>
                    <tbody>
                      {[...model.gap].sort((a, b) => stationName(a).localeCompare(stationName(b), 'ar') || (a.full_name_ar || '').localeCompare(b.full_name_ar || '', 'ar')).map((e, i) => (
                        <tr key={e.id} className="border-t border-gray-100"><td className="px-4 py-2 text-gray-400">{i + 1}</td><td className="px-4 py-2 text-gray-800">{e.full_name_ar}</td><td className="px-4 py-2 font-mono text-gray-600">{e.job_number || '—'}</td><td className="px-4 py-2 text-gray-600">{jobOf(e)}</td><td className="px-4 py-2 text-gray-600">{stationName(e)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </div>
      {confirmClean && <ConfirmDialog message={`إزالة كل الموظفين المُسندين لـ ${model.stale.length} حساب لم يعودوا مشرفي ورديات؟`} confirmLabel="إزالة" cancelLabel="إلغاء" onConfirm={cleanStale} onCancel={() => setConfirmClean(false)} />}
    </div>
  )
}
