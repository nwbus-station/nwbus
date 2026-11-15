// المعلومات الكاملة للموظف: قائمة مفتاح/قيمة (البطاقة الجانبية) أو شبكة مربعات (الجوال والعرض الضيّق)
import { f, Chip, SecCard } from './ui'

export default function InfoPanel({ fields, modNames, isAr, list }) {
  const rows = fields.filter(([, v]) => v)
  return (
    <SecCard title={isAr ? 'المعلومات الكاملة' : 'Full information'}>
      {list ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, padding: '9px 0', borderTop: i ? '1px dashed var(--border)' : 'none' }}>
              <span style={{ fontSize: f('0.72rem'), color: 'var(--text-3)', fontWeight: 700, flexShrink: 0 }}>{k}</span>
              <span dir="auto" style={{ fontSize: f('0.82rem'), fontWeight: 700, color: 'var(--text-1)', wordBreak: 'break-word', textAlign: 'end', minWidth: 0 }}>{v}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', background: 'var(--surface)' }}>
              <div style={{ fontSize: f('0.64rem'), color: 'var(--text-3)', fontWeight: 700 }}>{k}</div>
              <div style={{ fontSize: f('0.84rem'), fontWeight: 700, color: 'var(--text-1)', wordBreak: 'break-word' }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      {modNames.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: f('0.7rem'), color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? 'الأقسام المسموحة:' : 'Modules:'}</span>
          {modNames.map(m => <Chip key={m}>{m}</Chip>)}
        </div>
      )}
    </SecCard>
  )
}
