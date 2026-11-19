// الإدخالات المتأخرة للأدمن (الرئيسية): من أقرّ ومن لم يقرّ من المشرفين بإيراد الورديات والرحلات غير المدخلة.
// يُجلب بعد ثانيتين من فتح الصفحة (لا يؤخر ظهورها) ويُحفظ 5 دقائق؛ التفاصيل الكاملة في السجل الوظيفي ← الإدخالات المتأخرة.
import { useState, useEffect, useMemo } from 'react'
import { useShortfalls } from './ShortfallCard'

const MONO = "'IBM Plex Mono', ui-monospace, monospace"
const stamp = iso => { const r = new Date(new Date(iso).getTime() + 3 * 3600 * 1000); return `${r.toISOString().slice(5, 10).replace('-', '/')} ${r.toISOString().slice(11, 16)}` }
const ROWS = 6

export default function AdminLateCard({ isAr, navigate, compact = false, sx }) {
  const t = (a, e) => (isAr ? a : e)
  const [on, setOn] = useState(false)
  useEffect(() => { const id = setTimeout(() => setOn(true), 2000); return () => clearTimeout(id) }, [])
  const { items, acks, today } = useShortfalls('all', on, 2)
  const [showAll, setShowAll] = useState(false)
  const rows = useMemo(() => (items || []).map(it => ({ ...it, a: acks[it.key] || null }))
    .sort((a, b) => (Number(!!a.a) - Number(!!b.a)) || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)), [items, acks])
  if (!on || !items) return null
  const pending = rows.filter(r => !r.a).length, acked = rows.length - pending
  const pendingSt = new Set(rows.filter(r => !r.a).map(r => r.station.id)).size
  const nm = s => (isAr ? s.name_ar : (s.name_en || s.name_ar))
  const dayLbl = d => `${d === today ? t('اليوم', 'Today') : t('أمس', 'Yesterday')} ${d.slice(5).replace('-', '/')}`
  const tone = pending > 0 ? 'var(--danger)' : 'var(--success)'
  const shown = showAll ? rows : rows.slice(0, ROWS)
  const go = () => navigate('/employee-file?view=late')
  return (
    <section aria-label={t('الإدخالات المتأخرة', 'Late entries')} style={{ background: 'var(--card)', border: `1px solid ${tone}`, borderInlineStart: `5px solid ${tone}`, borderRadius: compact ? 14 : 8, overflow: 'hidden', boxShadow: 'var(--shadow-sm)', ...sx }}>
      <div style={{ padding: compact ? '12px 14px' : '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: rows.length ? '1px solid var(--border)' : 'none' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: compact ? '0.86rem' : '0.95rem', fontWeight: 900, color: 'var(--text-1)' }}>{t('الإدخالات المتأخرة — إقرارات المشرفين', 'Late entries — supervisor acknowledgements')}</div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', marginTop: 2 }}>
            {rows.length === 0 ? t('لا إدخالات متأخرة الآن — كل المحطات مُدخِلة', 'No late entries right now') : t('إيراد ورديات ورحلات لم تُدخل (أمس واليوم)', 'Revenue shifts and trips not entered (yesterday/today)')}
          </div>
        </div>
        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: 14, marginInlineStart: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* أزرار الطي والتفاصيل في الأعلى: لا تنزل مع طول القائمة */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              {rows.length > ROWS && <button type="button" onClick={() => setShowAll(v => !v)} aria-expanded={showAll} style={btnTop}>{showAll ? t('طي القائمة', 'Collapse') : t(`عرض الكل (${rows.length})`, `Show all (${rows.length})`)}</button>}
              <button type="button" onClick={go} style={btnTop}>{t('التفاصيل والسجل', 'Details and log')}</button>
            </div>
            {[[pending, t('لم يقرّ', 'Not ack.'), pending ? 'var(--danger)' : 'var(--text-1)'], [acked, t('أقرّ', 'Ack.'), 'var(--success)'], [pendingSt, t('محطات', 'Stations'), 'var(--text-1)']].map(([n, l, c]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.25rem', color: c, lineHeight: 1 }}>{n}</div>
                <div style={{ fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-3)', marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {shown.map((r, i) => (
        <div key={r.key} style={{ padding: compact ? '9px 14px' : '9px 18px', borderTop: i ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: r.a ? 'var(--surface)' : 'transparent' }}>
          <span style={{ flexShrink: 0, fontSize: '0.64rem', fontWeight: 900, padding: '2px 8px', borderRadius: 4, background: r.kind === 'sales' ? 'rgba(180,83,9,0.12)' : 'rgba(37,99,235,0.12)', color: r.kind === 'sales' ? '#b45309' : '#2563eb' }}>{r.kind === 'sales' ? t('إيراد', 'Revenue') : t('رحلات', 'Trips')}</span>
          <div style={{ flex: '1 1 180px', minWidth: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-1)' }}>
            {nm(r.station)}
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}> · {r.kind === 'sales' ? r.shiftAr : t(`${r.list.length} رحلة`, `${r.list.length} trips`)} · {dayLbl(r.day)}</span>
          </div>
          {r.a
            ? <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--success)' }}>{t('أقرّ', 'Ack.')}: {r.a.ack_by_name} · <bdi dir="ltr" style={{ fontFamily: MONO }}>{stamp(r.a.ack_at)}</bdi></span>
            : <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--danger)' }}>{t('لم يقرّ', 'Not acknowledged')}</span>}
        </div>
      ))}
    </section>
  )
}
const btnTop = { border: '1px solid var(--border-2)', background: 'var(--card)', color: 'var(--accent)', fontWeight: 800, fontSize: '0.72rem', fontFamily: 'inherit', cursor: 'pointer', padding: '5px 12px', borderRadius: 6, whiteSpace: 'nowrap' }
