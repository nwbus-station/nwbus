import { useEffect } from 'react'

export default function ConfirmDialog({ message, confirmLabel = 'حسناً', cancelLabel = 'إلغاء', onConfirm, onCancel, danger = true }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--card, #fff)', borderRadius: 12, boxShadow: '0 4px 32px rgba(0,0,0,0.14)', width: '100%', maxWidth: 360, direction: 'rtl', overflow: 'hidden' }}>

        {/* رأس */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
          <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-1, #0f172a)', margin: 0, lineHeight: 1.6 }}>
            {message}
          </p>
        </div>

        {/* أزرار */}
        <div style={{ padding: '14px 24px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 20px', borderRadius: 8,
            border: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface, #f8fafc)',
            color: 'var(--text-2, #475569)',
            fontWeight: 600, fontSize: '0.85rem',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: danger ? '#dc2626' : '#1C2B4A',
            color: '#fff',
            fontWeight: 700, fontSize: '0.85rem',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
