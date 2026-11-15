// نافذة تعبئة التقييم على الكمبيوتر: لوحة جانبية عريضة، ملخّص حي للنتيجة، والمعايير بعمودين.
// عرض فقط — الحفظ والحساب يبقيان في الصفحة (تُمرَّر نتائجه: totalScore/allFilled/onSave).
import Sheet from '../dispatch/Sheet'
import { MONO, SCORE_COLORS, SCORE_LABELS, SCORE_LABELS_EN, ScoreRing, Icon, ICONS, toneOf } from './evalUi'

function CriterionCard({ index, criterion, value, onChange, disabled, isAr }) {
  const color = value ? SCORE_COLORS[value] : 'var(--text-3)'
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${value ? `${SCORE_COLORS[value]}45` : 'var(--border)'}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, transition: 'border-color .12s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', fontFamily: MONO, fontSize: '.72rem', fontWeight: 800, color: 'var(--text-3)', flexShrink: 0 }}>{index + 1}</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.5 }}>{isAr ? criterion.ar : criterion.en}</div>
        <span style={{ fontFamily: MONO, fontSize: '.72rem', fontWeight: 800, color: 'var(--text-2)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 99, padding: '2px 9px', flexShrink: 0 }}>{criterion.weight}%</span>
      </div>
      <div role="radiogroup" aria-label={isAr ? criterion.ar : criterion.en} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(v => {
          const on = value === v
          return (
            <button key={v} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => !disabled && onChange(criterion.key, v)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 2px 7px', borderRadius: 10, fontFamily: 'inherit',
                border: `1.5px solid ${on ? SCORE_COLORS[v] : 'var(--border)'}`, background: on ? `${SCORE_COLORS[v]}1a` : 'var(--card)',
                color: on ? SCORE_COLORS[v] : 'var(--text-3)', cursor: disabled ? 'default' : 'pointer', transition: 'all .12s',
              }}>
              <span style={{ fontFamily: MONO, fontSize: '1.05rem', fontWeight: 900, lineHeight: 1 }}>{v}</span>
              <span style={{ fontSize: '.64rem', fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{isAr ? SCORE_LABELS[v] : SCORE_LABELS_EN[v]}</span>
            </button>
          )
        })}
      </div>
      <div style={{ height: 3, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }} aria-hidden="true">
        <div style={{ width: `${(value || 0) * 20}%`, height: '100%', background: color, transition: 'width .2s' }} />
      </div>
    </div>
  )
}

export default function EvalSheet({
  title, sub, isAr, onClose, criteria, scores, onScore, notes, onNotes, disabled = false,
  totalScore, allFilled, err, saving, onSave, saveLabel, accent = '#5B5BD6', readonly = false,
}) {
  const filled = criteria.filter(c => scores[c.key] > 0).length
  const tone = toneOf(filled ? totalScore : null, false)

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {err
          ? <p style={{ margin: 0, fontSize: '.84rem', color: '#DC2626', fontWeight: 700, lineHeight: 1.6 }}>{err}</p>
          : <p style={{ margin: 0, fontSize: '.84rem', color: 'var(--text-3)', fontWeight: 600 }}>
              {filled}/{criteria.length} {isAr ? 'بنود مُقيَّمة' : 'items rated'}
              {filled > 0 && <> {' · '} <span style={{ fontFamily: MONO, fontWeight: 800, color: tone.color }}>{(totalScore / 10).toFixed(1)}/10</span></>}
            </p>}
      </div>
      <button type="button" onClick={onClose}
        style={{ padding: '11px 22px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.9rem', fontWeight: 700, color: 'var(--text-2)' }}>
        {readonly ? (isAr ? 'إغلاق' : 'Close') : (isAr ? 'إلغاء' : 'Cancel')}
      </button>
      {!readonly && (
        <button type="button" onClick={onSave} disabled={saving || !allFilled}
          style={{ padding: '11px 30px', background: allFilled ? accent : 'var(--surface-2)', border: 'none', borderRadius: 11, cursor: allFilled ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: '.9rem', fontWeight: 800, color: allFilled ? '#fff' : 'var(--text-3)', transition: 'all .12s' }}>
          {saving ? (isAr ? 'جارٍ الحفظ…' : 'Saving...') : saveLabel}
        </button>
      )}
    </div>
  )

  return (
    <Sheet variant="drawer" width={900} isAr={isAr} accent={accent} onClose={onClose} title={title} sub={sub}
      icon={<Icon d={ICONS.clipboard} size={19} />} footer={footer} closeOnBackdrop={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', padding: '16px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <ScoreRing score={filled ? totalScore : null} size={112} stroke={11} complete={false} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: filled ? tone.color : 'var(--text-3)' }}>
              {filled ? (isAr ? tone.ar : tone.en) : (isAr ? 'ابدأ بتقييم البنود' : 'Start rating the items')}
            </div>
            <div style={{ fontSize: '.84rem', color: 'var(--text-3)', marginTop: 4, lineHeight: 1.7 }}>
              {isAr ? 'تقييم كل بند من 1 إلى 5 — تُحسب النتيجة بالأوزان تلقائياً.' : 'Rate each item from 1 to 5 — the score is weighted automatically.'}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
              {[1, 2, 3, 4, 5].map(v => (
                <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.74rem', fontWeight: 700, color: 'var(--text-2)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: SCORE_COLORS[v] }} />
                  <span style={{ fontFamily: MONO }}>{v}</span> {isAr ? SCORE_LABELS[v] : SCORE_LABELS_EN[v]}
                </span>
              ))}
            </div>
          </div>
          <div style={{ minWidth: 140 }}>
            <div style={{ fontSize: '.74rem', fontWeight: 800, color: 'var(--text-3)', marginBottom: 6 }}>{isAr ? 'الإنجاز' : 'Progress'} <span style={{ fontFamily: MONO }}>{filled}/{criteria.length}</span></div>
            <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ width: `${(filled / criteria.length) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 99, transition: 'width .2s' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {criteria.map((c, i) => (
            <CriterionCard key={c.key} index={i} criterion={c} value={scores[c.key] || 0} onChange={onScore} disabled={disabled} isAr={isAr} />
          ))}
        </div>

        <div>
          <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 8 }}>{isAr ? 'ملاحظات' : 'Notes'}</div>
          <textarea value={notes} onChange={e => onNotes(e.target.value)} disabled={disabled} rows={4}
            placeholder={isAr ? 'أضف ملاحظاتك هنا...' : 'Add your notes here...'}
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: '.92rem', color: 'var(--text-1)', fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.7 }} />
        </div>
      </div>
    </Sheet>
  )
}
