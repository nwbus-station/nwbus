import Sheet from '../dispatch/Sheet'
import RatingStrip from './RatingStrip'
import { MONO, JOB_TITLE_AR, JOB_TITLE_EN, stationLabel, shiftLabel, toneVar, toneBg } from './shared'

function Row({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr)', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <dt style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-3)' }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-1)', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</dd>
    </div>
  )
}

// تفاصيل تقييم واحد في لوحة جانبية
export default function RatingDetailSheet({ rating: r, isAr, loc, ratedDate, ratedTime, onClose }) {
  const mono = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }
  const jt = (isAr ? JOB_TITLE_AR : JOB_TITLE_EN)[r.employee?.job_title]
  return (
    <Sheet variant="drawer" width={520} isAr={isAr} accent="var(--accent)" onClose={onClose}
      title={r.employee?.full_name_ar || (isAr ? 'تقييم' : 'Rating')}
      sub={[stationLabel(r.station, isAr), r.shift ? shiftLabel(r.shift, isAr) : ''].filter(Boolean).join(' · ')}
      footer={<button type="button" className="cr-ghost" style={{ height: 40, padding: '0 22px' }} onClick={onClose}>{isAr ? 'إغلاق' : 'Close'}</button>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: 18, background: toneBg(r.rating), borderInlineStart: `4px solid ${toneVar(r.rating)}`, marginBottom: 18 }}>
        <span style={{ ...mono, fontWeight: 900, fontSize: '2.6rem', lineHeight: 1, color: toneVar(r.rating) }}><bdi dir="ltr">{r.rating}<span style={{ fontSize: '1.1rem', color: 'var(--text-3)' }}> / 5</span></bdi></span>
        <RatingStrip value={r.rating} isAr={isAr} width={150} height={12} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-3)' }}>{isAr ? 'تعليق العميل' : 'Customer comment'}</h3>
        {r.comment
          ? <p style={{ margin: 0, padding: 14, background: 'var(--surface)', fontSize: '0.95rem', lineHeight: 1.9, color: 'var(--text-1)', whiteSpace: 'pre-wrap' }}>{r.comment}</p>
          : <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-3)' }}>{isAr ? 'لا يوجد تعليق' : 'No comment'}</p>}
      </div>
      <dl style={{ margin: 0 }}>
        <Row label={isAr ? 'الموظف' : 'Employee'}>{r.employee?.full_name_ar || '—'}{jt ? ` · ${jt}` : ''}</Row>
        <Row label={isAr ? 'الرقم الوظيفي' : 'Job number'}><span style={mono}>{r.employee?.job_number || '—'}</span></Row>
        <Row label={isAr ? 'المحطة' : 'Station'}>{stationLabel(r.station, isAr) || '—'}</Row>
        <Row label={isAr ? 'الوردية' : 'Shift'}>{r.shift ? shiftLabel(r.shift, isAr) : '—'}</Row>
        <Row label={isAr ? 'الشباك' : 'Window'}><span style={mono}>{r.window_number || '—'}</span></Row>
        <Row label={isAr ? 'رقم التذكرة' : 'Ticket number'}><span style={mono}>{r.ticket_number || '—'}</span></Row>
        <Row label={isAr ? 'المرجع' : 'Reference'}><span style={mono}>{r.reference_number || '—'}</span></Row>
        <Row label={isAr ? 'تاريخ التذكرة' : 'Ticket date'}><span style={mono}>{r.ticket_date ? new Date(r.ticket_date).toLocaleDateString(loc) : '—'}</span></Row>
        <Row label={isAr ? 'وقت التقييم' : 'Rated at'}><span style={mono}>{ratedDate(r.created_at)} <b dir="ltr">{ratedTime(r.created_at)}</b></span></Row>
      </dl>
    </Sheet>
  )
}
