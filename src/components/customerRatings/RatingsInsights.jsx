import Panel from './Panel'
import RatingStrip from './RatingStrip'
import { MONO, MIN_EMP_RATINGS, f1, toneVar, shiftLabel, stationLabel } from './shared'

const num = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }

function Distribution({ s, isAr }) {
  const max = Math.max(1, ...s.dist.slice(1))
  return (
    <Panel title={isAr ? 'توزيع التقييمات' : 'Rating distribution'} hint={isAr ? 'عدد التقييمات لكل درجة' : 'Ratings count per score'}>
      <div style={{ display: 'grid', gap: 10 }}>
        {[5, 4, 3, 2, 1].map(v => {
          const c = s.dist[v]
          const pct = s.n ? Math.round((c / s.n) * 100) : 0
          return (
            <div key={v} style={{ display: 'grid', gridTemplateColumns: '58px minmax(0,1fr) 96px', alignItems: 'center', gap: 12 }}>
              <span style={{ ...num, fontWeight: 900, fontSize: '0.95rem', color: 'var(--text-1)', whiteSpace: 'nowrap' }}><bdi dir="ltr">{v} / 5</bdi></span>
              <span style={{ height: 12, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden', display: 'block' }}>
                <span style={{ display: 'block', height: '100%', width: `${(c / max) * 100}%`, background: toneVar(v), minWidth: c ? 3 : 0 }} />
              </span>
              <span style={{ ...num, fontSize: '0.82rem', color: 'var(--text-2)', textAlign: 'end' }}><b style={{ color: 'var(--text-1)' }}>{c}</b> <span style={{ color: 'var(--text-3)' }}>({pct}%)</span></span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function Shifts({ s, isAr }) {
  const rows = ['A', 'B', 'C'].map(v => s.shifts.find(x => x.key === v) || { key: v, n: 0, avg: null })
  return (
    <Panel title={isAr ? 'حسب الوردية' : 'By shift'} hint={isAr ? 'متوسط التقييم وعدده لكل وردية' : 'Average and count per shift'}>
      <div style={{ display: 'grid', gap: 12 }}>
        {rows.map(x => (
          <div key={x.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '6px 12px', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-1)' }}>{shiftLabel(x.key, isAr)}</span>
            <span style={{ ...num, fontSize: '0.86rem', color: 'var(--text-2)' }}>
              <b style={{ color: x.avg == null ? 'var(--text-3)' : toneVar(x.avg), fontSize: '1rem' }}>{f1(x.avg)}</b>
              <span style={{ color: 'var(--text-3)' }}> <bdi dir="ltr">/ 5</bdi> · {x.n} {isAr ? 'تقييم' : 'ratings'}</span>
            </span>
            <span style={{ gridColumn: '1 / -1', height: 8, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden', display: 'block' }}>
              <span style={{ display: 'block', height: '100%', width: x.avg == null ? 0 : `${(x.avg / 5) * 100}%`, background: x.avg == null ? 'transparent' : toneVar(x.avg) }} />
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function Stations({ s, isAr, activeKey, onPick }) {
  const list = s.stations.slice(0, 7)
  return (
    <Panel title={isAr ? 'أكثر المحطات تقييماً' : 'Most rated stations'} hint={isAr ? 'اضغط على محطة لتصفية الجدول عليها' : 'Select a station to filter the table'}>
      {list.length === 0 ? <Empty isAr={isAr} /> : (
        <div style={{ display: 'grid', gap: 2, margin: '0 -10px' }}>
          {list.map(x => (
            <button key={x.key} type="button" className="cr-link" aria-pressed={activeKey === x.key} onClick={() => onPick(x.key)}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stationLabel(x.label, isAr)}</span>
              <span style={{ ...num, fontSize: '0.8rem', color: 'var(--text-3)' }}>{x.n}</span>
              <span style={{ ...num, fontWeight: 900, fontSize: '0.92rem', color: toneVar(x.avg), minWidth: 34, textAlign: 'end' }}>{f1(x.avg)}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

function EmpList({ title, list, isAr }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-3)' }}>{title}</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {list.map(e => (
          <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label.full_name_ar}</span>
            <RatingStrip value={e.avg} isAr={isAr} width={54} height={6} />
            <span style={{ ...num, fontWeight: 900, fontSize: '0.88rem', color: toneVar(e.avg), minWidth: 30, textAlign: 'end' }}>{f1(e.avg)}</span>
            <span style={{ ...num, fontSize: '0.74rem', color: 'var(--text-3)', minWidth: 22, textAlign: 'end' }}>{e.n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Employees({ s, isAr }) {
  const enough = s.topEmployees.length >= 2
  return (
    <Panel title={isAr ? 'الموظفون' : 'Employees'}
      hint={isAr ? `يُحتسب من ${MIN_EMP_RATINGS} تقييمات فأكثر لكل موظف` : `Employees with ${MIN_EMP_RATINGS}+ ratings only`}>
      {!enough ? <Empty isAr={isAr} text={isAr ? 'لا يوجد موظفون بتقييمات كافية بعد' : 'Not enough ratings per employee yet'} /> : (
        <div style={{ display: 'grid', gap: 18 }}>
          <EmpList title={isAr ? 'الأعلى تقييماً' : 'Top rated'} list={s.topEmployees} isAr={isAr} />
          <EmpList title={isAr ? 'الأحوج للمتابعة' : 'Needs follow-up'} list={s.lowEmployees} isAr={isAr} />
        </div>
      )}
    </Panel>
  )
}

function Empty({ isAr, text }) {
  return <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-3)', lineHeight: 1.7 }}>{text || (isAr ? 'لا توجد بيانات' : 'No data')}</p>
}

// ملخصات جانبية: عمود بجانب الجدول على الشاشات العريضة، أو شبكة بطاقات فوقه على الأضيق
export default function RatingsInsights({ summary, isAr, wide, activeStationKey, onPickStation }) {
  const style = wide
    ? { display: 'grid', gap: 16, alignContent: 'start', minWidth: 0 }
    : { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', alignItems: 'start' }
  return (
    <aside style={style} aria-label={isAr ? 'ملخصات' : 'Summaries'}>
      <Distribution s={summary} isAr={isAr} />
      <Shifts s={summary} isAr={isAr} />
      <Stations s={summary} isAr={isAr} activeKey={activeStationKey} onPick={onPickStation} />
      <Employees s={summary} isAr={isAr} />
    </aside>
  )
}
