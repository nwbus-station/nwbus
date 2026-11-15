// أرصدة الإجازات (كمبيوتر): جدول عريض بأشرطة تقدّم + عمود جانبي لحدّ الاستئذان (للأدمن)
import { useState } from 'react'
import { matchesSearch } from '../../utils/digits'
import { yearsOfService } from '../../utils/leaveBalance'

const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"

export default function BalancesPanel({ balances, loading, isAr = true, search, setSearch, side, note }) {
  const [only, setOnly] = useState('all')   // all | zero
  const rows = balances
    .filter(b => !search || matchesSearch(b.full_name_ar, search) || matchesSearch(b.job_number, search))
    .filter(b => only === 'all' || !(b.remaining > 0))
  const zeroCount = balances.filter(b => !(b.remaining > 0)).length

  const heads = isAr
    ? ['الموظف', 'المحطة', 'تاريخ المباشرة', 'سنوات الخدمة', 'المتراكم', 'المستخدم', 'المتبقي']
    : ['Employee', 'Station', 'Hire Date', 'Years', 'Accrued', 'Used', 'Remaining']
  const th = { padding: '13px 18px', textAlign: isAr ? 'right' : 'left', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-3)', whiteSpace: 'nowrap', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }
  const td = { padding: '14px 18px', fontSize: '0.92rem', color: 'var(--text-2)', borderTop: '1px solid var(--border)' }
  const field = { padding: '10px 13px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontSize: '0.92rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: side ? 'minmax(0, 1fr) clamp(300px, 24vw, 380px)' : 'minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 14px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isAr ? 'بحث بالاسم أو الرقم الوظيفي...' : 'Search by name or job number...'}
            style={{ ...field, width: 'clamp(240px, 28vw, 380px)' }} />
          <div role="group" style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 11, padding: 4 }}>
            {[['all', isAr ? 'كل الموظفين' : 'All', balances.length], ['zero', isAr ? 'نفد الرصيد' : 'No balance', zeroCount]].map(([v, l, n]) => {
              const on = only === v
              return (
                <button key={v} type="button" onClick={() => setOnly(v)}
                  style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: on ? 800 : 600, background: on ? 'var(--card)' : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-3)', boxShadow: on ? '0 1px 4px rgba(0,0,0,.12)' : 'none' }}>
                  {l}<span style={{ fontFamily: MONO, fontSize: '0.76rem', fontWeight: 800, color: on ? '#EE712D' : 'var(--text-3)' }}>{n}</span>
                </button>
              )
            })}
          </div>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: '0.84rem', color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? `${rows.length} موظف معروض` : `${rows.length} shown`}</span>
        </div>

        <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.95rem' }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead>
                <tr>{heads.map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 3 ? 'center' : th.textAlign }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(b => {
                  const manual = b.leave_balance_override != null
                  const pct = !manual && b.accrued > 0 ? Math.max(0, Math.min(100, (b.remaining / b.accrued) * 100)) : null
                  const good = b.remaining > 0
                  return (
                    <tr key={b.id}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(28,43,74,.1)', color: 'var(--text-1)', display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 }}>{String(b.full_name_ar || '?').trim().charAt(0)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, color: 'var(--text-1)' }}>{b.full_name_ar}</div>
                            <div style={{ fontFamily: MONO, fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 2 }} dir="ltr">{b.job_number ?? '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={td}>{(isAr ? b.station?.name_ar : b.station?.name_en) || '—'}</td>
                      <td style={{ ...td, fontFamily: MONO }} dir="ltr">{b.hire_date || '—'}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: MONO }}>{yearsOfService(b.hire_date)}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: MONO }}>{b.accrued.toFixed(1)}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: MONO }}>{b.used}</td>
                      <td style={{ ...td, textAlign: 'center', minWidth: 150 }}>
                        <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.02rem', color: good ? '#15803d' : '#dc2626' }}>
                          {b.remaining.toFixed(2)}
                          {manual && <span style={{ marginInlineStart: 6, fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-3)' }}>({isAr ? 'يدوي' : 'manual'})</span>}
                        </div>
                        {pct != null && (
                          <div style={{ marginTop: 6, height: 5, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: good ? '#16a34a' : '#dc2626' }} />
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={7} style={{ ...td, padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>{isAr ? 'لا يوجد موظفون' : 'No employees'}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {note && <p style={{ fontSize: '0.82rem', color: 'var(--text-3)', margin: 0, lineHeight: 1.8 }}>{note}</p>}
      </div>
      {side && <div style={{ position: 'sticky', top: 76, minWidth: 0 }}>{side}</div>}
    </div>
  )
}
