import RatingStrip from './RatingStrip'
import { MONO, JOB_TITLE_AR, JOB_TITLE_EN, stationLabel, shiftLabel, toneVar, toneBg } from './shared'

const num = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }
const dash = <span style={{ color: 'var(--text-3)' }}>—</span>

// جدول الكمبيوتر: صفوف عريضة، شريط تقييم، عمود تعليق مستقل، والضغط على الصف يفتح التفاصيل
export default function RatingsTable({ rows, total, isAr, loc, ratedDate, ratedTime, sticky, onOpen, onMore }) {
  const heads = [
    isAr ? 'الموظف' : 'Employee',
    isAr ? 'المحطة والوردية' : 'Station & shift',
    isAr ? 'التقييم' : 'Rating',
    isAr ? 'التعليق' : 'Comment',
    isAr ? 'التذكرة / المرجع' : 'Ticket / Reference',
    isAr ? 'تاريخ التذكرة' : 'Ticket date',
    isAr ? 'وقت التقييم' : 'Rated at',
  ]
  const jobTitle = t => (isAr ? JOB_TITLE_AR : JOB_TITLE_EN)[t] || ''
  return (
    <section className="cr-card" style={{ overflow: 'clip', minWidth: 0 }} aria-label={isAr ? 'سجل التقييمات' : 'Ratings log'}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-1)' }}>{isAr ? 'سجل التقييمات' : 'Ratings log'}</h2>
        <span style={{ ...num, fontSize: '0.82rem', color: 'var(--text-3)' }}>{isAr ? `عرض ${rows.length} من ${total}` : `Showing ${rows.length} of ${total}`}</span>
      </div>
      <div style={sticky ? undefined : { overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: sticky ? 0 : 940 }}>
          <thead>
            <tr>{heads.map(h => <th key={h} className="cr-th" style={sticky ? undefined : { position: 'static' }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="cr-row" onClick={() => onOpen(r)}>
                <td className="cr-td">
                  <button type="button" className="cr-link" onClick={e => { e.stopPropagation(); onOpen(r) }}
                    style={{ display: 'block', padding: 0, background: 'transparent', cursor: 'pointer' }}>
                    <span style={{ display: 'block', fontWeight: 900, fontSize: '0.98rem', color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{r.employee?.full_name_ar || '—'}</span>
                    <span style={{ display: 'block', marginTop: 3, fontSize: '0.78rem', color: 'var(--text-3)' }}>
                      {jobTitle(r.employee?.job_title)}{r.employee?.job_number ? <>{r.employee?.job_title ? ' · ' : ''}<span style={num}>{r.employee.job_number}</span></> : null}
                    </span>
                  </button>
                </td>
                <td className="cr-td">
                  <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>{stationLabel(r.station, isAr) || '—'}</div>
                  <div style={{ marginTop: 3, fontSize: '0.78rem', color: 'var(--text-3)' }}>
                    {[r.shift ? shiftLabel(r.shift, isAr) : '', r.window_number ? `${isAr ? 'شباك' : 'Window'} ${r.window_number}` : ''].filter(Boolean).join(' · ') || '—'}
                  </div>
                </td>
                <td className="cr-td" style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ ...num, fontWeight: 900, fontSize: '1.05rem', color: toneVar(r.rating), background: toneBg(r.rating), padding: '3px 10px', borderRadius: 4, minWidth: 58, textAlign: 'center' }}><bdi dir="ltr">{r.rating} / 5</bdi></span>
                    <RatingStrip value={r.rating} isAr={isAr} />
                  </div>
                </td>
                <td className="cr-td" style={{ maxWidth: 320, minWidth: 180 }}>
                  {r.comment
                    ? <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.7, color: 'var(--text-2)' }}>{r.comment}</span>
                    : dash}
                </td>
                <td className="cr-td">
                  <div style={{ ...num, fontWeight: 700, color: 'var(--text-1)' }}>{r.ticket_number || '—'}</div>
                  <div style={{ ...num, marginTop: 3, fontSize: '0.76rem', color: 'var(--text-3)' }}>{r.reference_number || '—'}</div>
                </td>
                <td className="cr-td" style={{ ...num, fontSize: '0.84rem', whiteSpace: 'nowrap' }}>{r.ticket_date ? new Date(r.ticket_date).toLocaleDateString(loc) : '—'}</td>
                <td className="cr-td" style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ ...num, fontSize: '0.84rem', color: 'var(--text-2)' }}>{ratedDate(r.created_at)}</div>
                  <div dir="ltr" style={{ ...num, marginTop: 3, fontWeight: 900, fontSize: '0.95rem', color: 'var(--text-1)', textAlign: 'start' }}>{ratedTime(r.created_at)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length < total && (
        <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <button type="button" className="cr-ghost" onClick={onMore} style={{ height: 40, padding: '0 22px' }}>
            {isAr ? `عرض المزيد (${total - rows.length} متبقّي)` : `Show more (${total - rows.length} left)`}
          </button>
        </div>
      )}
    </section>
  )
}
