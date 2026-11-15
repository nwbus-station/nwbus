import { useEffect, useRef } from 'react'

// نافذة تأكيد موحّدة: عنوان + نص + زرّان؛ للإجراءات الخطرة يكون التركيز الأول على «إلغاء» تفادياً للضغط بالخطأ
export default function ConfirmDialog({ message, title, confirmLabel = 'حسناً', cancelLabel = 'إلغاء', onConfirm, onCancel, danger = true }) {
  const cancelRef = useRef(null)
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    cancelRef.current?.focus()
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])
  const accent = danger ? '#dc2626' : '#2563eb'
  const heading = title || (danger ? 'تأكيد الإجراء' : 'تأكيد')

  return (
    <div
      className="nw-confirm-bd"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.55)', zIndex: 10060, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, WebkitBackdropFilter: 'blur(3px)', backdropFilter: 'blur(3px)' }}>
      <div role="alertdialog" aria-modal="true" aria-label={heading} className="nw-confirm"
        style={{ position: 'relative', background: 'var(--card, #fff)', borderRadius: 18, boxShadow: '0 28px 70px -12px rgba(0,0,0,0.5)', width: '100%', maxWidth: 400, direction: 'rtl', overflow: 'hidden', border: '1px solid var(--border-2, #e5e7eb)' }}>
        <div aria-hidden="true" style={{ height: 4, background: accent }} />
        <div style={{ padding: '22px 24px 8px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-1, #0f172a)' }}>{heading}</h3>
          <p style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-2, #475569)', margin: '10px 0 0', lineHeight: 1.9 }}>{message}</p>
        </div>
        <div style={{ padding: '16px 24px 22px', display: 'flex', gap: 10 }}>
          <button ref={cancelRef} onClick={onCancel} style={{
            flex: 1, height: 44, borderRadius: 12,
            border: '1px solid var(--border-2, #e2e8f0)', background: 'var(--surface, #f8fafc)', color: 'var(--text-1, #475569)',
            fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>{cancelLabel}</button>
          <button onClick={onConfirm} style={{
            flex: 1, height: 44, borderRadius: 12, border: 'none',
            background: accent, color: '#fff',
            fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
