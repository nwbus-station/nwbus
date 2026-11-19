// طريقة عمل المحطة: عدد ورديتها والفعلية منها (المتوقفة تُشطب وتُوسم «متوقفة») — تُعرض في الترحيل والإيرادات.
// station: صف فيه shift_ends و inactive_shifts. compact: حرف الوردية فقط (للترويسات الضيقة) والتفاصيل في التلميح.
import { shiftsOfStation } from '../../utils/stationShifts'

const MONO = "'IBM Plex Mono', ui-monospace, monospace"

export default function StationShiftsNote({ station, isAr = true, compact = false, style }) {
  if (!station) return null
  const shifts = shiftsOfStation(station)
  const active = shifts.filter(s => !s.off)
  const stopped = shifts.length - active.length
  const title = shifts.map(s => `${isAr ? s.ar : s.en}: ${s.range}${s.off ? (isAr ? ' (متوقفة)' : ' (stopped)') : ''}`).join('\n')
  const head = stopped
    ? (isAr ? `تعمل ${active.length} من ${shifts.length} ورديات` : `${active.length} of ${shifts.length} shifts operating`)
    : (isAr ? `${shifts.length} ورديات` : `${shifts.length} shifts`)
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 6 : 8, flexWrap: 'wrap', fontSize: compact ? '0.68rem' : '0.74rem', fontWeight: 700, color: 'var(--text-2)', background: 'var(--surface)', border: '1px solid var(--border-2, var(--border))', borderRadius: 6, padding: compact ? '2px 8px' : '4px 10px', ...style }}>
      <b style={{ color: stopped ? 'var(--danger, #b91c1c)' : 'var(--text-1)', fontWeight: 900 }}>{head}</b>
      {shifts.map(s => (
        <span key={s.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: s.off ? 'var(--text-3)' : 'var(--text-2)', textDecoration: s.off ? 'line-through' : 'none' }}>
          <span style={{ fontWeight: 900 }}>{s.k}</span>
          {!compact && <bdi dir="ltr" style={{ fontFamily: MONO, fontWeight: 600, fontSize: '0.92em' }}>{s.range.replace(/ – /g, '–')}</bdi>}
          {s.off && !compact && <span style={{ textDecoration: 'none', color: 'var(--danger, #b91c1c)', fontWeight: 800 }}>{isAr ? 'متوقفة' : 'stopped'}</span>}
        </span>
      ))}
    </span>
  )
}
