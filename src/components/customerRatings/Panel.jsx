// بطاقة قسم بعنوان — تُستخدم في ملخصات الجانب والرسم الزمني
export default function Panel({ title, hint, action, children, pad = 20, style }) {
  return (
    <section className="cr-card" style={{ padding: pad, minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-1)' }}>{title}</h2>
          {hint && <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--text-3)', lineHeight: 1.6 }}>{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
