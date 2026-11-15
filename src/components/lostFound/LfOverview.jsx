// نظرة عامة على قسم الموجودات: إجراءات سريعة + مؤشرات + آخر المسجّل
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useMedia } from '../dispatch/Sheet'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16 }
const fmt = d => { try { return new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short' }) } catch { return '' } }
const ST = { unclaimed: ['بانتظار التسليم', '#d97706'], claimed: ['سُلّم لصاحبه', '#16a34a'], donated: ['سُلّم للجمعية', '#64748b'] }

function Kpi({ label, n, color, onClick, hint, compact }) {
  return (
    <button type="button" onClick={onClick} style={{ ...card, textAlign: 'start', padding: compact ? '12px 12px' : '16px 18px', cursor: 'pointer', fontFamily: 'inherit', borderInlineStart: compact ? undefined : `4px solid ${color}`, borderTop: compact ? `3px solid ${color}` : undefined, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: compact ? '1.45rem' : '1.9rem', fontWeight: 900, lineHeight: 1, color: 'var(--text-1)', fontFamily: MONO }}>{n ?? '—'}</span>
      <span style={{ fontSize: compact ? '0.7rem' : '0.8rem', fontWeight: 800, color: 'var(--text-1)' }}>{label}</span>
      {hint && !compact && <span style={{ fontSize: '0.66rem', color: 'var(--text-3)', fontWeight: 600 }}>{hint}</span>}
    </button>
  )
}

function Action({ title, sub, color, onClick, disabled, compact }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...card, flex: 1, minWidth: 0, textAlign: 'start', padding: compact ? '12px 14px' : '16px 18px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'inherit', background: color, border: 'none', color: '#fff', display: 'flex', alignItems: 'center', gap: compact ? 10 : 14 }}>
      <span aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', fontSize: '1.5rem', fontWeight: 300, flexShrink: 0 }}>+</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 900, fontSize: '0.98rem' }}>{title}</span>
        {!compact && <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.88, marginTop: 2, fontWeight: 600 }}>{sub}</span>}
      </span>
    </button>
  )
}

function Recent({ title, rows, empty, onAll, allLabel, render }) {
  return (
    <section style={{ ...card, overflow: 'hidden', minWidth: 0 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 900, color: 'var(--text-1)', flex: 1 }}>{title}</h3>
        {onAll && <button type="button" onClick={onAll} style={{ border: 'none', background: 'none', color: '#2563eb', fontWeight: 800, fontSize: '0.74rem', cursor: 'pointer', fontFamily: 'inherit' }}>{allLabel}</button>}
      </header>
      {rows === null ? <p style={{ margin: 0, padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.82rem' }}>…</p>
        : rows.length === 0 ? <p style={{ margin: 0, padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.82rem' }}>{empty}</p>
        : rows.map(r => <div key={r.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>{render(r)}</div>)}
    </section>
  )
}

export default function LfOverview({ isAr = true, counts, canRegister, canReport, canArchive, onNew, onGo, refresh = 0 }) {
  const t = (a, e) => (isAr ? a : e)
  const wide = useMedia('(min-width: 980px)')
  const [items, setItems] = useState(null)
  const [reports, setReports] = useState(null)
  useEffect(() => {
    let off = false
    supabase.from('lost_found_items').select('*').order('created_at', { ascending: false }).limit(6).then(({ data }) => { if (!off) setItems(data ?? []) })
    supabase.from('lost_reports').select('*').order('created_at', { ascending: false }).limit(6).then(({ data }) => { if (!off) setReports(data ?? []) })
    return () => { off = true }
  }, [refresh])
  return (
    <div style={{ padding: wide ? 24 : 14, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1180, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', gap: wide ? 12 : 8, flexDirection: 'row' }}>
        {canRegister && <Action compact={!wide} title={t(wide ? 'تسجيل موجود جديد' : 'تسجيل موجود', 'Register a found item')} sub={t('عثرت على غرض؟ سجّله هنا', 'Found something? Log it')} color="#d97706" onClick={() => onNew('register')} />}
        {canReport && <Action compact={!wide} title={t(wide ? 'بلاغ مفقود جديد' : 'بلاغ مفقود', 'New lost report')} sub={t('عميل فقد غرضاً؟ سجّل بلاغه', 'A customer lost something')} color="#8b5cf6" onClick={() => onNew('report')} />}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: wide ? 12 : 8 }}>
        <Kpi compact={!wide} label={t('بانتظار التسليم', 'Awaiting hand-over')} n={counts.unclaimed} color="#d97706" hint={t('موجودات لم يستلمها أصحابها', 'Unclaimed items')} onClick={() => onGo('handover')} />
        <Kpi compact={!wide} label={t('تجاوزت 30 يوماً', 'Over 30 days')} n={counts.aging} color="#dc2626" hint={t('مرشّحة للتسليم للجمعية', 'Candidates for charity')} onClick={() => onGo(canArchive ? 'items' : 'handover')} />
        <Kpi compact={!wide} label={t('بلاغات المفقودات', 'Lost reports')} n={counts.reports} color="#8b5cf6" hint={t('إجمالي البلاغات المسجّلة', 'All reports')} onClick={() => onGo(canArchive ? 'reports' : 'handover')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 14, alignItems: 'start' }}>
        <Recent title={t('آخر الموجودات المسجّلة', 'Latest found items')} rows={items} empty={t('لا توجد موجودات بعد', 'No items yet')} onAll={canArchive ? () => onGo('items') : null} allLabel={t('عرض الكل', 'View all')}
          render={r => {
            const st = ST[r.status] || ST.unclaimed
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item_description || '—'}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{r.item_number ? <span style={{ fontFamily: MONO }}>#{r.item_number} · </span> : null}{fmt(r.created_at)}</div>
                </div>
                <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: st[1] + '1f', color: st[1], whiteSpace: 'nowrap' }}>{st[0]}</span>
              </div>
            )
          }} />
        <Recent title={t('آخر البلاغات', 'Latest reports')} rows={reports} empty={t('لا توجد بلاغات بعد', 'No reports yet')} onAll={canArchive ? () => onGo('reports') : null} allLabel={t('عرض الكل', 'View all')}
          render={r => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item_description || r.customer_name || '—'}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{r.customer_name || ''} · {fmt(r.created_at)}</div>
              </div>
            </div>
          )} />
      </div>
    </div>
  )
}
