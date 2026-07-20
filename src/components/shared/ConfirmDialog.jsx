import { useEffect } from 'react'

/**
 * نافذة تأكيد داخل التطبيق بدلاً من window.confirm
 * الاستخدام: <ConfirmDialog message="..." onConfirm={fn} onCancel={fn} />
 */
export default function ConfirmDialog({ message, confirmLabel = 'حسناً', cancelLabel = 'إلغاء', onConfirm, onCancel, danger = true }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: '100%', maxWidth: 380, padding: '28px 24px', textAlign: 'center', direction: 'rtl' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠ </div>
        <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b', marginBottom: 24, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={onConfirm}
            style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: danger ? '#dc2626' : '#1C2B36', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{ padding: '9px 28px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
