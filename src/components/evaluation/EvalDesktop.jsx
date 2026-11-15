// عروض صفحة التقييم الوظيفي لسطح المكتب: تبويبات، شريط أدوات، جدول الأشخاص بأعمدة المصادر، لوحة ملخص جانبية،
// بطاقات المحطات، وصفحة "تقييمي". كل المكوّنات تستقبل نماذج عرض جاهزة (view models) من الصفحة — بدون أي منطق بيانات.
import { MONO, Avatar, ScoreMeter, ScoreRing, Chip, EmptyState, SkeletonRows, Icon, ICONS, StarMark, toneOf } from './evalUi'

export const DESK_CSS = `
.evd-row { transition: background .12s; }
.evd-row:hover { background: var(--surface); }
.evd-btn { padding: 9px 22px; border-radius: 10px; font-family: inherit; font-size: .88rem; font-weight: 800; cursor: pointer; white-space: nowrap; transition: all .12s; border: 1px solid transparent; }
.evd-btn:disabled { cursor: not-allowed; opacity: .45; }
.evd-btn-primary { background: var(--accent); color: #fff; }
.evd-btn-primary:hover:not(:disabled) { background: var(--accent-dark); }
.evd-btn-ghost { background: var(--card); color: var(--text-2); border-color: var(--border-2); }
.evd-btn-ghost:hover:not(:disabled) { background: var(--surface); color: var(--text-1); }
.evd-cell { transition: transform .12s, border-color .12s, background .12s; }
.evd-cell:hover { transform: translateY(-1px); border-color: var(--accent) !important; }
.evd-search:focus { border-color: var(--accent) !important; box-shadow: 0 0 0 3px var(--gold-dim); }
.evd-select { padding: 10px 14px; border-radius: 11px; border: 1px solid var(--border-2); background: var(--card); color: var(--text-1); font-family: inherit; font-size: .92rem; font-weight: 700; cursor: pointer; outline: none; }
.evd-split { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); align-items: start; }
.evd-split.evd-side { grid-template-columns: minmax(0, 1fr) 330px; }
.evd-cards { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.evd-card:hover { border-color: var(--border-2) !important; box-shadow: 0 6px 22px rgba(0,0,0,.07); }
`

export const deskCard = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18 }

// ── تبويبات علوية ──────────────────────────────────────────────
export function EvalTabs({ tabs, tab, onChange }) {
  return (
    <div role="tablist" style={{ display: 'inline-flex', gap: 6, padding: 6, marginBottom: 20, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, maxWidth: '100%', overflowX: 'auto' }}>
      {tabs.map(t => {
        const on = tab === t.id
        return (
          <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '11px 22px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.96rem', fontWeight: 800, whiteSpace: 'nowrap', transition: 'all .15s',
              background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--text-2)' }}>
            {t.label}
            {t.count != null && (
              <span style={{ fontFamily: MONO, fontSize: '.74rem', fontWeight: 800, padding: '1px 8px', borderRadius: 99, background: on ? 'rgba(255,255,255,.22)' : 'var(--surface-2)', color: on ? '#fff' : 'var(--text-3)' }}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── أدوات البحث والفلترة ───────────────────────────────────────
export function SearchInput({ value, onChange, placeholder, isAr }) {
  return (
    <label style={{ position: 'relative', flex: '1 1 260px', minWidth: 220, display: 'block' }}>
      <span style={{ position: 'absolute', insetInlineStart: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', display: 'grid' }}><Icon d={ICONS.search} size={17} /></span>
      <input className="evd-search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', height: 46, padding: '0 14px', paddingInlineStart: 42, borderRadius: 12, border: '1px solid var(--border-2)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '.95rem', outline: 'none', direction: isAr ? 'rtl' : 'ltr' }} />
    </label>
  )
}

export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', padding: 4, gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          style={{ padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 800, background: value === v ? 'var(--accent)' : 'transparent', color: value === v ? '#fff' : 'var(--text-2)' }}>{label}</button>
      ))}
    </div>
  )
}

export function Toolbar({ children }) {
  return (
    <div style={{ ...deskCard, padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>{children}</div>
  )
}

// ── خلية مصدر تقييم (زر) ───────────────────────────────────────
function SourceCell({ s, isAr, onOpen }) {
  const t = toneOf(s.score)
  const has = s.score != null
  return (
    <button type="button" className="evd-cell" onClick={() => onOpen(s.open)} aria-label={`${s.label} ${has ? (s.score / 10).toFixed(1) : (isAr ? 'لم يُقيَّم' : 'not rated')}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 12px', borderRadius: 12, textAlign: 'start', cursor: 'pointer', fontFamily: 'inherit', minHeight: 62, justifyContent: 'center',
        border: has ? `1.5px solid ${t.color}40` : '1.5px dashed var(--border-2)', background: has ? `${t.color}10` : 'transparent', minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        {has
          ? <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.15rem', color: t.color }}>{(s.score / 10).toFixed(1)}<span style={{ fontSize: '.68rem', color: 'var(--text-3)', fontWeight: 600 }}>/10</span></span>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.84rem', fontWeight: 800, color: 'var(--accent)' }}><Icon d={ICONS.plus} size={13} stroke={2.4} />{isAr ? 'قيّم الآن' : 'Rate now'}</span>}
        <span style={{ fontFamily: MONO, fontSize: '.68rem', fontWeight: 800, color: 'var(--text-3)' }}>{s.weight}%</span>
      </span>
      {has && <span style={{ fontSize: '.78rem', color: 'var(--text-2)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.evaluator || '—'}</span>}
      {s.substitute && <span style={{ fontSize: '.68rem', color: '#2563EB', fontWeight: 800 }}>{isAr ? 'بدل: مشرف المرحّلين' : 'via dispatchers supervisor'}</span>}
    </button>
  )
}

function PersonCell({ m, isAr }) {
  const meta = [m.title, m.jobNumber, m.station].filter(Boolean)
  const t = toneOf(m.score, m.complete !== false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <Avatar name={m.name} tone={m.score != null ? t.color : undefined} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
          {m.hasStar && <StarMark size={15} />}
        </div>
        <div style={{ marginTop: 3, fontSize: '.8rem', color: 'var(--text-3)', fontWeight: 500, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {meta.map((x, i) => (
            <span key={i} style={{ fontFamily: x === m.jobNumber ? MONO : undefined }}>{i > 0 && <span style={{ marginInlineEnd: 6, color: 'var(--border-2)' }}>·</span>}{x}</span>
          ))}
        </div>
        {m.note && <div style={{ marginTop: 3, fontSize: '.76rem', fontWeight: 700, color: '#B45309' }}>{m.note}</div>}
        {m.dispInfo && <div style={{ marginTop: 3, fontSize: '.76rem', fontWeight: 700, color: m.dispInfo.locked ? '#B45309' : '#2563EB' }}>{m.dispInfo.text}</div>}
      </div>
    </div>
  )
}

// ── جدول الأشخاص (موظفون / مشرفون) ─────────────────────────────
// columns: null => عرض مصدر واحد (زر تقييم/تعديل)؛ مصفوفة => أعمدة المصادر + النتيجة النهائية
export function PeopleTable({ models, columns, isAr, loading, emptyText, onOpen, skeleton = 5 }) {
  const multi = !!columns
  const tpl = multi
    ? `minmax(210px, 1.5fr) repeat(${columns.length}, minmax(124px, 1fr)) minmax(190px, 1fr)`
    : 'minmax(240px, 1.6fr) minmax(220px, 1fr) 130px'
  const head = { fontSize: '.78rem', fontWeight: 800, color: 'var(--text-2)' }
  return (
    <div style={{ ...deskCard, overflow: 'clip' }}>
      {!loading && models.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: tpl, gap: 14, padding: '12px 22px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 60, zIndex: 2 }}>
          <span style={head}>{isAr ? 'الاسم' : 'Name'}</span>
          {multi ? columns.map(c => (
            <span key={c.key} style={head}>{c.label}{c.weight != null && <span style={{ fontFamily: MONO, color: 'var(--text-3)', fontWeight: 700 }}> · {c.weight}%</span>}</span>
          )) : <span style={head}>{isAr ? 'نتيجتك' : 'Your score'}</span>}
          <span style={head}>{multi ? (isAr ? 'النتيجة النهائية' : 'Final score') : ''}</span>
        </div>
      )}
      {loading ? <SkeletonRows count={skeleton} /> : models.length === 0 ? <EmptyState title={emptyText} /> : models.map((m, i) => (
        <div key={m.id} className="evd-row" style={{ display: 'grid', gridTemplateColumns: tpl, gap: 14, alignItems: 'center', padding: '14px 22px', borderBottom: i < models.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <PersonCell m={m} isAr={isAr} />
          {multi ? (
            <>
              {columns.map(c => {
                const s = m.sources.find(x => x.key === c.key)
                return s
                  ? <SourceCell key={c.key} s={s} isAr={isAr} onOpen={onOpen} />
                  : <span key={c.key} style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '.8rem' }}>—</span>
              })}
              <div style={{ minWidth: 0 }}>
                {m.score != null ? (
                  <>
                    <ScoreMeter score={m.score} complete={m.complete} isAr={isAr} />
                    <div style={{ marginTop: 5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Chip color={toneOf(m.score, m.complete).color} bg="transparent" border="transparent" style={{ padding: 0 }}>{isAr ? toneOf(m.score, m.complete).ar : toneOf(m.score, m.complete).en}</Chip>
                      {!m.complete && <span style={{ fontSize: '.74rem', color: 'var(--text-3)', fontWeight: 600 }}>{isAr ? `جزئية — ${m.ratedCount}/${m.totalSources} قيّموا` : `Partial — ${m.ratedCount}/${m.totalSources} rated`}</span>}
                    </div>
                  </>
                ) : <Chip>{isAr ? 'لم يُقيَّم بعد' : 'Not yet rated'}</Chip>}
              </div>
            </>
          ) : (
            <>
              <div style={{ minWidth: 0 }}>
                {m.score != null
                  ? <ScoreMeter score={m.score} isAr={isAr} />
                  : <Chip>{isAr ? 'لم يُقيَّم بعد' : 'Not yet evaluated'}</Chip>}
              </div>
              <button type="button" className={`evd-btn ${m.ev ? 'evd-btn-ghost' : 'evd-btn-primary'}`} disabled={!!m.dispInfo?.locked} onClick={() => onOpen(m.open)}>
                {m.dispInfo?.locked ? (isAr ? 'مكتمل' : 'Complete') : m.ev ? (isAr ? 'تعديل' : 'Edit') : (isAr ? 'تقييم' : 'Evaluate')}
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ── لوحة الملخص ────────────────────────────────────────────────
function ProgressRing({ pct, size = 96 }) {
  const stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: MONO, fontWeight: 900, fontSize: '1.2rem', color: 'var(--text-1)' }}>{pct}%</div>
    </div>
  )
}

const panelTitle = { margin: '0 0 12px', fontSize: '.9rem', fontWeight: 900, color: 'var(--text-1)' }

/**
 * summary: { total, evaluated, completeCount (أو null), avg (من 100 أو null), tiers:[{key,color,label,count}],
 *            top:[{id,name,score}] , pending:[{id,name,open}] }
 * mode: 'top' (الأدمن: الأعلى تقييماً) | 'pending' (المقيّم: بانتظار تقييمك)
 */
export function SummaryPanel({ summary, mode, layout, isAr, onOpen, sticky }) {
  const pct = summary.total ? Math.round(summary.evaluated / summary.total * 100) : 0
  const maxTier = Math.max(1, ...summary.tiers.map(t => t.count))
  const side = layout === 'side'
  return (
    <aside style={side ? { display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: sticky } : { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
      <section style={{ ...deskCard, padding: 18 }}>
        <h3 style={panelTitle}>{isAr ? 'تقدّم التقييم' : 'Evaluation progress'}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ProgressRing pct={pct} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: '.88rem', color: 'var(--text-2)', fontWeight: 700 }}><span style={{ fontFamily: MONO, fontWeight: 900, color: 'var(--text-1)', fontSize: '1.05rem' }}>{summary.evaluated}</span> {isAr ? 'من' : 'of'} <span style={{ fontFamily: MONO }}>{summary.total}</span> {isAr ? 'مُقيَّم' : 'evaluated'}</span>
            <span style={{ fontSize: '.84rem', color: 'var(--text-3)', fontWeight: 600 }}><span style={{ fontFamily: MONO, fontWeight: 800, color: '#B45309' }}>{summary.total - summary.evaluated}</span> {isAr ? 'بانتظار التقييم' : 'pending'}</span>
            {summary.completeCount != null && <span style={{ fontSize: '.84rem', color: 'var(--text-3)', fontWeight: 600 }}><span style={{ fontFamily: MONO, fontWeight: 800, color: '#059669' }}>{summary.completeCount}</span> {isAr ? 'مكتمل المصادر' : 'fully rated'}</span>}
          </div>
        </div>
      </section>

      <section style={{ ...deskCard, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <h3 style={{ ...panelTitle, margin: 0 }}>{isAr ? 'توزيع النتائج' : 'Score distribution'}</h3>
          {summary.avg != null && <span style={{ fontSize: '.8rem', color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? 'المتوسط' : 'Avg'} <span style={{ fontFamily: MONO, fontWeight: 900, color: 'var(--text-1)' }}>{(summary.avg / 10).toFixed(1)}</span></span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {summary.tiers.map(t => (
            <div key={t.key} style={{ display: 'grid', gridTemplateColumns: '88px minmax(0,1fr) 30px', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-2)' }}>{t.label}</span>
              <span style={{ height: 8, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${t.count / maxTier * 100}%`, background: t.color, borderRadius: 99 }} />
              </span>
              <span style={{ fontFamily: MONO, fontSize: '.8rem', fontWeight: 800, color: 'var(--text-1)', textAlign: 'end' }}>{t.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...deskCard, padding: 18 }}>
        <h3 style={panelTitle}>{mode === 'pending' ? (isAr ? 'بانتظار تقييمك' : 'Waiting for you') : (isAr ? 'الأعلى تقييماً' : 'Top rated')}</h3>
        {mode === 'pending' ? (
          summary.pending.length === 0
            ? <p style={{ margin: 0, fontSize: '.86rem', color: 'var(--text-3)', fontWeight: 600 }}>{isAr ? 'تم تقييم الجميع.' : 'Everyone is evaluated.'}</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {summary.pending.slice(0, 6).map(p => (
                  <button key={p.id} type="button" className="evd-row" disabled={!p.open} onClick={() => p.open && onOpen(p.open)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 10px', borderRadius: 10, border: 'none', background: 'transparent', fontFamily: 'inherit', cursor: p.open ? 'pointer' : 'default', textAlign: 'start' }}>
                    <span style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>{isAr ? 'تقييم' : 'Evaluate'}</span>
                  </button>
                ))}
                {summary.pending.length > 6 && <span style={{ fontSize: '.78rem', color: 'var(--text-3)', fontWeight: 700, padding: '4px 10px' }}>+ {summary.pending.length - 6} {isAr ? 'آخرين' : 'more'}</span>}
              </div>
        ) : (
          summary.top.length === 0
            ? <p style={{ margin: 0, fontSize: '.86rem', color: 'var(--text-3)', fontWeight: 600 }}>{isAr ? 'لا توجد نتائج بعد.' : 'No results yet.'}</p>
            : <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {summary.top.map((p, i) => (
                  <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 8, display: 'grid', placeItems: 'center', background: i === 0 ? 'var(--gold-dim)' : 'var(--surface)', color: i === 0 ? 'var(--accent)' : 'var(--text-3)', fontFamily: MONO, fontSize: '.74rem', fontWeight: 900 }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '.88rem', fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: '.92rem', color: toneOf(p.score).color }}>{(p.score / 10).toFixed(1)}</span>
                  </li>
                ))}
              </ol>
        )}
      </section>
    </aside>
  )
}

// ── بطاقات المحطات ─────────────────────────────────────────────
export function StationCards({ items, isAr, loading, emptyText, onOpen }) {
  if (loading) return <div style={{ ...deskCard }}><SkeletonRows count={3} height={90} /></div>
  if (items.length === 0) return <div style={{ ...deskCard }}><EmptyState title={emptyText} icon={ICONS.station} /></div>
  return (
    <div className="evd-cards">
      {items.map(({ stn, ev }) => {
        const t = toneOf(ev?.total_score)
        return (
          <div key={stn.id} className="evd-card" style={{ ...deskCard, padding: 18, display: 'flex', flexDirection: 'column', gap: 16, transition: 'all .15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 46, height: 46, borderRadius: 13, display: 'grid', placeItems: 'center', flexShrink: 0, background: ev ? `${t.color}14` : 'var(--surface)', color: ev ? t.color : 'var(--text-3)', border: `1px solid ${ev ? `${t.color}30` : 'var(--border)'}` }}>
                <Icon d={ICONS.station} size={21} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stn.name_ar || stn.name_en}</div>
                {stn.name_en && stn.name_ar && <div style={{ marginTop: 2, fontSize: '.8rem', color: 'var(--text-3)' }}>{stn.name_en}</div>}
              </div>
            </div>
            <div style={{ minHeight: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
              {ev ? (
                <>
                  <ScoreMeter score={ev.total_score} isAr={isAr} />
                  {ev.evaluator?.full_name_ar && <span style={{ fontSize: '.78rem', color: 'var(--text-3)', fontWeight: 600 }}>{isAr ? 'بواسطة ' : 'By '}{ev.evaluator.full_name_ar}</span>}
                </>
              ) : <Chip style={{ alignSelf: 'flex-start' }}>{isAr ? 'لم تُقيَّم بعد' : 'Not yet evaluated'}</Chip>}
            </div>
            <button type="button" className={`evd-btn ${ev ? 'evd-btn-ghost' : 'evd-btn-primary'}`} style={{ width: '100%' }} onClick={() => onOpen({ station: stn, existing: ev || null })}>
              {ev ? (isAr ? 'تعديل التقييم' : 'Edit evaluation') : (isAr ? 'تقييم المحطة' : 'Evaluate station')}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── تقييمي ─────────────────────────────────────────────────────
/**
 * data: { final, complete, ratedCount, totalCount, sources:[{key,label,weight,evaluator,score,notes}], monthLabel }
 */
export function MyEvalPanel({ data, loading, hasRows, isAr }) {
  if (loading) return <div style={deskCard}><SkeletonRows count={3} height={110} /></div>
  if (!hasRows) {
    return (
      <div style={deskCard}>
        <EmptyState title={isAr ? 'لم يتم تقييمك هذا الشهر بعد' : 'You have not been evaluated this month yet'} hint={data.monthLabel} />
      </div>
    )
  }
  const t = toneOf(data.final, data.complete)
  return (
    <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)', alignItems: 'start' }}>
      <section style={{ ...deskCard, padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, position: 'sticky', top: 76 }}>
        <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--text-3)' }}>{data.complete ? (isAr ? 'النتيجة النهائية' : 'Final Result') : (isAr ? 'النتيجة الحالية (جزئية)' : 'Current Result (partial)')} · {data.monthLabel}</div>
        <ScoreRing score={data.final} size={200} stroke={16} complete={data.complete} />
        {data.final != null ? (
          <>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: t.color }}>{isAr ? t.ar : t.en}</div>
            {data.complete && data.final >= 98 && (
              <Chip color="#B45309" bg="#F59E0B15" border="#F59E0B40"><StarMark size={14} />{isAr ? 'متميز' : 'Outstanding'}</Chip>
            )}
            {!data.complete && (
              <p style={{ margin: 0, fontSize: '.84rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
                {isAr ? `مبنية على ${data.ratedCount}/${data.totalCount} مصادر حالياً — بتتغيّر مع اكتمال الباقي` : `Based on ${data.ratedCount}/${data.totalCount} sources so far — will update as the rest come in`}
              </p>
            )}
          </>
        ) : <p style={{ margin: 0, fontSize: '.9rem', color: 'var(--text-3)' }}>{isAr ? 'ما تم تقييمك من أي مصدر بعد' : 'No source has rated you yet'}</p>}
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data.sources.map(s => (
          <section key={s.key} style={{ ...deskCard, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: s.notes ? '1px solid var(--border)' : 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-1)' }}>{s.label} <span style={{ fontFamily: MONO, color: 'var(--text-3)', fontWeight: 700, fontSize: '.86rem' }}>({s.weight}%)</span></div>
                {s.evaluator && <div style={{ marginTop: 3, fontSize: '.82rem', color: 'var(--text-3)' }}>{isAr ? 'بواسطة ' : 'By '}{s.evaluator}</div>}
              </div>
              <div style={{ minWidth: 220, flex: '0 1 300px' }}>
                {s.score != null ? <ScoreMeter score={s.score} isAr={isAr} /> : <Chip>{isAr ? 'لم يُقيَّم بعد' : 'Not yet evaluated'}</Chip>}
              </div>
            </div>
            {s.notes && (
              <div style={{ padding: '14px 22px', background: 'var(--surface)' }}>
                <div style={{ fontSize: '.74rem', fontWeight: 800, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'ملاحظات' : 'Notes'}</div>
                <p style={{ margin: 0, fontSize: '.92rem', color: 'var(--text-2)', lineHeight: 1.8 }}>{s.notes}</p>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
