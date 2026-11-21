// ملخص المحطات (الصفحة الرئيسية لمركز التقارير): تختار ما تريد عرضه من المقاييس ومن طريقة عرض النسب، فتتغير الصفحة والطباعة معاً.
// الوصول والمغادرة منفصلان دائماً. بدون جداول رحلات تفصيلية (هذه في تبويبات التفاصيل).
import { useMemo, useState } from 'react'
import { METRIC_GROUPS, PRESETS, availableMetrics, buildSummary, rateTone } from '../../utils/reportSummary'

const MONO = "'IBM Plex Mono', ui-monospace, monospace"
const nf = n => Number(n ?? 0).toLocaleString('en-US')
const money = n => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

export const PCT_STYLES = [
  { id: 'bar', ar: 'شريط', en: 'Bar' },
  { id: 'chip', ar: 'بطاقة ملوّنة', en: 'Colored chip' },
  { id: 'num', ar: 'رقم فقط', en: 'Number' },
]

// خلية نسبة بحسب الطريقة المختارة
export function PctCell({ v, style }) {
  if (v == null) return <span style={{ color: '#9ca3af' }}>—</span>
  const c = rateTone(v)
  if (style === 'chip') return <span style={{ display: 'inline-block', minWidth: 46, padding: '2px 8px', borderRadius: 6, background: `${c}1f`, color: c, fontWeight: 900, fontFamily: MONO }}>{v}%</span>
  if (style === 'num') return <b style={{ color: c, fontFamily: MONO }}>{v}%</b>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 96 }}>
      <span style={{ flex: 1, height: 7, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', minWidth: 44 }}><i style={{ display: 'block', width: `${Math.min(100, v)}%`, height: '100%', background: c }} /></span>
      <b style={{ color: c, fontFamily: MONO, fontSize: '0.74rem' }}>{v}%</b>
    </span>
  )
}

export function cellText(m, v, isAr) {
  const x = v[m.id]
  if (m.kind === 'pct') return x == null ? '—' : `${x}%`
  if (m.kind === 'money') return x == null ? '—' : money(x)
  if (m.kind === 'text') return x ? (x.act < x.n ? `${x.act} ${isAr ? 'من' : 'of'} ${x.n}` : String(x.n)) : '—'
  return nf(x)
}

export default function SummaryPanel({
  data, isAr, allowed, metrics, setMetrics, pctStyle, setPctStyle, flags,
  onPrintSummary, onPrintDetailed, onOpenFolder, onExport, canPrint,
}) {
  const t = (a, e) => (isAr ? a : e)
  const [pick, setPick] = useState(false)
  const [sort, setSort] = useState({ id: 'name', dir: 1 })
  const avail = useMemo(() => availableMetrics(allowed), [allowed])
  const ids = metrics.filter(id => avail.some(m => m.id === id))
  const model = useMemo(() => buildSummary(data, ids), [data, ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const r = [...model.rows]
    r.sort((a, b) => {
      if (sort.id === 'name') return a.name.localeCompare(b.name, 'ar') * sort.dir
      const x = a.v[sort.id], y = b.v[sort.id]
      const nx = x && typeof x === 'object' ? x.act : x, ny = y && typeof y === 'object' ? y.act : y
      return ((nx ?? -1) - (ny ?? -1)) * sort.dir
    })
    return r
  }, [model.rows, sort])

  const toggle = id => setMetrics(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const head = (id, label) => (
    <th key={id} onClick={() => setSort(s => ({ id, dir: s.id === id ? -s.dir : (id === 'name' ? 1 : -1) }))}
      style={{ padding: '10px 12px', fontWeight: 800, fontSize: '0.74rem', color: 'var(--text-2)', background: 'var(--surface)', textAlign: id === 'name' ? 'start' : 'center', whiteSpace: 'nowrap', cursor: 'pointer', position: 'sticky', top: 0, borderBottom: '2px solid var(--border-2)' }}>
      {label}{sort.id === id ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
    </th>
  )
  const btn = (primary, dis) => ({ border: primary ? 'none' : '1px solid var(--border-2)', background: primary ? '#1C2B4A' : 'var(--card)', color: primary ? '#fff' : 'var(--text-1)', borderRadius: 8, padding: '9px 16px', fontSize: '0.8rem', fontWeight: 800, fontFamily: 'inherit', cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.5 : 1 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ما الذي تريد عرضه؟ */}
      <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <button type="button" onClick={() => setPick(v => !v)} aria-expanded={pick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start' }}>
          <span style={{ fontWeight: 900, fontSize: '0.92rem', color: 'var(--text-1)' }}>{t('ما الذي تريد عرضه؟', 'What to show')}</span>
          <span style={{ fontFamily: MONO, fontSize: '0.72rem', fontWeight: 800, background: 'var(--surface-2)', borderRadius: 99, padding: '1px 10px', color: 'var(--text-2)' }}>{ids.length}/{avail.length}</span>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-3)', fontWeight: 600 }}>{t('الأعمدة والنسب وطريقة عرضها', 'Columns, percentages and their style')}</span>
          <span style={{ marginInlineStart: 'auto', fontSize: '0.74rem', fontWeight: 800, color: 'var(--accent)' }}>{pick ? t('إخفاء', 'Hide') : t('تغيير', 'Change')}</span>
        </button>
        {pick && (
          <div style={{ padding: '4px 16px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12 }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-3)' }}>{t('اختيار سريع:', 'Quick:')}</span>
              {PRESETS.map(p => <button key={p.id} type="button" onClick={() => setMetrics(p.ids.filter(id => avail.some(m => m.id === id)))} style={{ ...btn(false), padding: '5px 14px', fontSize: '0.74rem' }}>{isAr ? p.ar : p.en}</button>)}
              <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-3)' }}>{t('طريقة عرض النسب:', 'Percent style:')}</span>
                {PCT_STYLES.map(p => <button key={p.id} type="button" onClick={() => setPctStyle(p.id)} aria-pressed={pctStyle === p.id} style={{ ...btn(pctStyle === p.id), padding: '5px 14px', fontSize: '0.74rem' }}>{isAr ? p.ar : p.en}</button>)}
              </span>
            </div>
            {METRIC_GROUPS.map(g => {
              const list = avail.filter(m => m.group === g.id)
              if (!list.length) return null
              return (
                <div key={g.id}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text-3)', marginBottom: 6, letterSpacing: '0.04em' }}>{isAr ? g.ar : g.en}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {list.map(m => {
                      const on = ids.includes(m.id)
                      return (
                        <label key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: on ? 800 : 600, border: `1px solid ${on ? '#1C2B4A' : 'var(--border-2)'}`, background: on ? 'rgba(28,43,74,0.08)' : 'var(--card)', color: 'var(--text-1)' }}>
                          <input type="checkbox" checked={on} onChange={() => toggle(m.id)} style={{ accentColor: '#1C2B4A' }} />
                          {isAr ? m.ar : m.en}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* الإجراءات: طباعة وتصدير — بما فيها ملفات المحطات المتعددة */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {canPrint && <button type="button" onClick={() => onPrintSummary(model)} disabled={!ids.length} style={btn(true, !ids.length)}>{t('طباعة الملخص', 'Print summary')}</button>}
        {canPrint && <button type="button" onClick={onOpenFolder} style={btn(false)}>{t('بوصلة الأداء — تقرير تنفيذي', 'Performance Compass — executive report')}</button>}
        {canPrint && <button type="button" onClick={onPrintDetailed} style={btn(false)}>{t('تقرير مفصّل', 'Detailed report')}</button>}
        <button type="button" onClick={() => onExport(model)} disabled={!ids.length} style={btn(false, !ids.length)}>{t('تصدير Excel', 'Export Excel')}</button>
        <span style={{ marginInlineStart: 'auto', fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 700 }}>
          {flags.onlyStaffed && t('المحطات التي فيها حسابات فقط', 'Stations with users only')}{flags.onlyStaffed && flags.activeOnly ? ' · ' : ''}{flags.activeOnly && t('الورديات الفعلية فقط', 'Operating shifts only')}
        </span>
      </div>

      {/* الجدول */}
      {!ids.length ? (
        <div style={{ background: 'var(--card)', border: '1px dashed var(--border-2)', borderRadius: 12, padding: 36, textAlign: 'center', color: 'var(--text-3)', fontWeight: 700 }}>{t('اختر مقياساً واحداً على الأقل من «ما الذي تريد عرضه؟»', 'Pick at least one metric')}</div>
      ) : rows.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px dashed var(--border-2)', borderRadius: 12, padding: 36, textAlign: 'center', color: 'var(--text-3)', fontWeight: 700 }}>{t('لا بيانات لهذي الفترة والمحطات', 'No data for this period')}</div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto', maxHeight: '68vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 560 }}>
            <thead><tr>{head('name', t('المحطة', 'Station'))}{model.cols.map(m => head(m.id, isAr ? m.ar : m.en))}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{r.name}</td>
                  {model.cols.map(m => (
                    <td key={m.id} style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600, color: m.id === 'diff' && r.v.diff != null ? (r.v.diff >= 0 ? '#16a34a' : '#dc2626') : 'var(--text-1)', fontFamily: m.kind === 'text' ? 'inherit' : MONO }}>
                      {m.kind === 'pct' ? <PctCell v={r.v[m.id]} style={pctStyle} />
                        : m.id === 'shifts' && r.v.shifts && r.v.shifts.act < r.v.shifts.n ? <b style={{ color: '#dc2626' }}>{cellText(m, r.v, isAr)}</b>
                        : cellText(m, r.v, isAr)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border-2)', background: 'var(--surface-2)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 900 }}>{t(`الإجمالي (${rows.length} محطة)`, `Total (${rows.length})`)}</td>
                {model.cols.map(m => (
                  <td key={m.id} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 900, fontFamily: MONO }}>
                    {m.id === 'shifts' ? '—' : m.kind === 'pct' ? <PctCell v={model.totals[m.id]} style={pctStyle} /> : cellText(m, model.totals, isAr)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.8 }}>
        {t('الوصول والمغادرة منفصلان في الرحلات والركاب والنسب. «نسبة الإدخال» = الرحلات المُدخلة من المجدولة. التفاصيل (جداول الرحلات والمتخلفين…) في التبويبات.', 'Arrivals and departures are separate. Entry % = entered out of scheduled. Details are in the tabs.')}
      </p>
    </div>
  )
}
