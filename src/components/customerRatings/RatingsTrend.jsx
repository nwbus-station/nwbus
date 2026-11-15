import { useState } from 'react'
import Panel from './Panel'
import { MONO, f1, toneVar } from './shared'

const MAX_DAYS = 45
const H = 150

// رسم أعمدة يومي (CSS) لمتوسط التقييم — كل عمود زر قابل للتركيز، والقراءة النصية تظهر أعلى الرسم
export default function RatingsTrend({ days, isAr }) {
  const [hot, setHot] = useState(null)
  const list = days.slice(-MAX_DAYS)
  if (list.length < 2) return null
  const cur = hot != null && list[hot] ? list[hot] : null
  const step = Math.ceil(list.length / 8)
  const total = list.reduce((s, d) => s + d.n, 0)
  return (
    <Panel title={isAr ? 'متوسط التقييم اليومي' : 'Daily average rating'}
      hint={isAr ? `آخر ${list.length} يوم ضمن الفلاتر · ${total} تقييم` : `Last ${list.length} days in range · ${total} ratings`}
      action={
        <div aria-live="polite" style={{ fontFamily: MONO, fontSize: '0.84rem', color: 'var(--text-2)', minHeight: 20, textAlign: 'end' }}>
          {cur
            ? <><b style={{ color: toneVar(cur.avg) }}><bdi dir="ltr">{f1(cur.avg)} / 5</bdi></b> · <bdi dir="ltr">{cur.key}</bdi> · {cur.n} {isAr ? 'تقييم' : 'ratings'}</>
            : <span style={{ color: 'var(--text-3)' }}>{isAr ? 'مرّر على عمود لعرض التفاصيل' : 'Hover a bar for details'}</span>}
        </div>
      }>
      <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', gap: 8 }}>
        <div aria-hidden="true" style={{ position: 'relative', height: H, fontFamily: MONO, fontSize: '0.7rem', color: 'var(--text-3)' }}>
          {[5, 4, 3, 2, 1].map(v => <span key={v} style={{ position: 'absolute', insetInlineStart: 0, top: `${((5 - v) / 5) * 100}%`, transform: 'translateY(-50%)' }}>{v}</span>)}
        </div>
        <div>
          <div role="group" aria-label={isAr ? 'متوسط التقييم لكل يوم' : 'Average rating per day'}
            style={{ position: 'relative', height: H, display: 'flex', alignItems: 'flex-end', gap: 3, backgroundImage: 'linear-gradient(to bottom, var(--border) 1px, transparent 1px)', backgroundSize: `100% ${H / 5}px`, borderBottom: '1px solid var(--border-2)' }}>
            {list.map((d, i) => (
              <button key={d.key} type="button" className="cr-day"
                aria-label={`${d.key}: ${f1(d.avg)} / 5, ${d.n} ${isAr ? 'تقييم' : 'ratings'}`}
                onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(i)} onBlur={() => setHot(null)}>
                <span className="cr-bar" style={{ display: 'block', width: '100%', height: `${(d.avg / 5) * 100}%`, background: toneVar(d.avg), opacity: hot == null || hot === i ? 1 : 0.55, borderRadius: '2px 2px 0 0' }} />
              </button>
            ))}
          </div>
          <div aria-hidden="true" style={{ display: 'flex', gap: 3, marginTop: 6, fontFamily: MONO, fontSize: '0.68rem', color: 'var(--text-3)' }}>
            {list.map((d, i) => (
              <span key={d.key} style={{ flex: '1 1 0', minWidth: 6, maxWidth: 34, position: 'relative', height: 14 }}>
                {i % step === 0 && <span style={{ position: 'absolute', insetInlineStart: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{d.key.slice(5)}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  )
}
