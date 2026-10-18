// عناصر واجهة مشتركة لتبويبات قسم الموجودات: نفس البطاقة والرأس والأقسام والحقول والأزرار في كل مكان
export const MONO = 'ui-monospace, Menlo, Consolas, monospace'
export const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }
export const fieldStyle = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.84rem', fontFamily: 'inherit', color: 'var(--text-1)', background: 'var(--card)', boxSizing: 'border-box', outline: 'none' }

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  hand: 'M8 11V6a1.5 1.5 0 0 1 3 0v4M11 10V4.5a1.5 1.5 0 0 1 3 0V10M14 10V6a1.5 1.5 0 0 1 3 0v6c0 4-2.5 7-6.5 7S5 16.5 4.5 14l-1-3a1.5 1.5 0 0 1 2.6-1.4L8 11',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
}
export function Icon({ name, size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={ICONS[name] || ICONS.box} />
    </svg>
  )
}

// بطاقة نموذج: رأس بأيقونة وعنوان وسطر توضيحي
export function FormCard({ icon = 'box', accent = '#d97706', title, subtitle, right, children }) {
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: `${accent}22`, color: accent, flexShrink: 0 }}><Icon name={icon} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text-1)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </div>
  )
}

// قسم داخل النموذج
export function Section({ title, hint, children }) {
  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--text-1)', paddingInlineStart: 8, borderInlineStart: '3px solid var(--text-1)' }}>{title}</span>
        {hint && <span style={{ fontSize: '0.66rem', color: 'var(--text-3)' }}>{hint}</span>}
      </div>
      {children}
    </section>
  )
}

export function Banner({ kind = 'ok', children }) {
  const ok = kind === 'ok'
  return (
    <div role={ok ? 'status' : 'alert'} style={{ ...card, padding: '12px 16px', fontSize: '0.84rem', fontWeight: 700, borderColor: ok ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.5)', background: ok ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.08)', color: ok ? '#16a34a' : '#dc2626' }}>
      {children}
    </div>
  )
}

export function PrimaryButton({ children, disabled, ...rest }) {
  return (
    <button {...rest} disabled={disabled}
      style={{ padding: '12px 28px', borderRadius: 11, border: 'none', background: 'var(--text-1)', color: 'var(--card)', fontWeight: 800, fontSize: '0.9rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: 'inherit' }}>
      {children}
    </button>
  )
}
export function GhostButton({ children, ...rest }) {
  return (
    <button {...rest} style={{ padding: '12px 20px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer', fontFamily: 'inherit' }}>
      {children}
    </button>
  )
}

// تاريخ ووقت (بتوقيت الرياض): 18/10/2026 05:12
export const fmtDT = iso => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(',', '') } catch { return '—' }
}

// حقل وقت التسليم: يُسجَّل تلقائياً لحظة التأكيد ولا يُعدَّل يدوياً
import { useState, useEffect } from 'react'
export function AutoStamp({ label, isAr = true }) {
  const [now, setNow] = useState(() => new Date().toISOString())
  useEffect(() => { const id = setInterval(() => setNow(new Date().toISOString()), 20000); return () => clearInterval(id) }, [])
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: '1.5px dashed var(--border)', background: 'var(--card)' }}>
        <span dir="ltr" style={{ fontFamily: MONO, fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)' }}>{fmtDT(now)}</span>
        <span style={{ marginInlineStart: 'auto', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-3)' }}>{isAr ? 'يُسجَّل تلقائياً — لا يُعدَّل' : 'Recorded automatically — not editable'}</span>
      </div>
    </div>
  )
}
