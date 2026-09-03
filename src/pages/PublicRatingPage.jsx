import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import TicketNumberScanner from '../components/shared/TicketNumberScanner'

const STARS = [1, 2, 3, 4, 5]
// نمنع إعادة الإرسال من نفس الجهاز لفترة قصيرة بس (منع تحديث الصفحة وإعادة الإرسال) —
// مو منع دائم، لأن نفس العميل ممكن يرجع يوم ثاني ويستاهل يقيّم رحلة جديدة فعلية
const RESUBMIT_BLOCK_MS = 12 * 60 * 60 * 1000 // 12 ساعة

export default function PublicRatingPage() {
  const { token } = useParams()
  const [target, setTarget] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  const [ticketNumber, setTicketNumber] = useState('')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(() => {
    try {
      const ts = Number(localStorage.getItem('nwbus_rated_' + token))
      return !!ts && (Date.now() - ts) < RESUBMIT_BLOCK_MS
    } catch { return false }
  })
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('get_rating_target', { p_token: token }).then(({ data, error }) => {
      if (error || !data?.length) { setNotFound(true); setLoading(false); return }
      setTarget(data[0])
      setLoading(false)
    })
  }, [token])

  async function submit() {
    if (!ticketNumber.trim()) { setError('أدخل رقم التذكرة أو امسحه بالكاميرا'); return }
    if (!rating) { setError('اختر تقييمك أولاً'); return }
    setError('')
    setSubmitting(true)
    const { error } = await supabase.from('customer_ratings').insert({
      employee_id: target.employee_id,
      station_id: target.station_id,
      window_number: target.window_number,
      shift: target.shift,
      ticket_number: ticketNumber.trim(),
      rating,
      comment: comment.trim() || null,
    })
    setSubmitting(false)
    if (error) {
      const dup = /duplicate key|unique constraint/i.test(error.message || '')
      setError(dup ? 'هذي التذكرة تم تقييمها من قبل — شكراً لك' : 'تعذّر إرسال التقييم، حاول مرة أخرى')
      return
    }
    try { localStorage.setItem('nwbus_rated_' + token, String(Date.now())) } catch {}
    setDone(true)
  }

  const wrap = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6F9', padding: 20 }
  const card = { background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)', width: '100%', maxWidth: 420, padding: '32px 24px', textAlign: 'center' }

  if (loading) return <div style={wrap}><p style={{ color: '#999' }}>جارٍ التحميل…</p></div>

  if (notFound) return (
    <div style={wrap} dir="rtl">
      <div style={card}>
        <p style={{ fontSize: '2rem', marginBottom: 12 }}>—</p>
        <h2 style={{ color: '#333', margin: '0 0 8px' }}>الرابط غير متاح</h2>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>تأكد من الرمز أو تواصل مع الموظف</p>
      </div>
    </div>
  )

  if (done) return (
    <div style={wrap} dir="rtl">
      <div style={card}>
        <p style={{ fontSize: '2.5rem', marginBottom: 12 }}>✓</p>
        <h2 style={{ color: '#1C2B4A', margin: '0 0 10px' }}>شكراً لتقييمك</h2>
        <p style={{ color: '#666', fontSize: '0.95rem', lineHeight: 1.6 }}>{target.closing_message}</p>
      </div>
    </div>
  )

  return (
    <div style={wrap} dir="rtl">
      <div style={card}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#1C2B4A15', color: '#1C2B4A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.3rem', margin: '0 auto 14px' }}>
          {target.employee_name?.trim()[0] || '؟'}
        </div>
        <h2 style={{ color: '#1C2B4A', margin: '0 0 4px', fontSize: '1.15rem' }}>{target.employee_name}</h2>
        <p style={{ color: '#999', fontSize: '0.8rem', margin: '0 0 14px' }}>
          {target.station_name} {target.window_number && <>· شباك {target.window_number}</>}
        </p>
        <p style={{ color: '#555', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 22px' }}>{target.welcome_message}</p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 18 }}>
          {STARS.map(n => (
            <button key={n} type="button" onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)} onMouseLeave={() => setHoverRating(0)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', lineHeight: 1, color: (hoverRating || rating) >= n ? '#F5B942' : '#E2E5EA', padding: 2 }}>
              ★
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input value={ticketNumber} onChange={e => setTicketNumber(e.target.value)}
            placeholder="رقم التذكرة *" dir="ltr" maxLength={7} inputMode="numeric"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E5EA', borderRadius: 10, padding: '10px 44px 10px 14px', fontSize: '0.9rem', textAlign: 'center' }} />
          <button type="button" onClick={() => setShowScanner(true)}
            style={{ position: 'absolute', insetInlineStart: 6, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, border: 'none', background: '#1C2B4A', borderRadius: 8, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}
            title="مسح رقم التذكرة بالكاميرا">
            📷
          </button>
        </div>

        <textarea value={comment} onChange={e => setComment(e.target.value)}
          placeholder="ملاحظة إضافية (اختياري)" rows={3}
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E5EA', borderRadius: 10, padding: '10px 14px', fontSize: '0.9rem', marginBottom: 14, resize: 'none', fontFamily: 'inherit' }} />

        {error && <p style={{ color: '#DC2626', fontSize: '0.82rem', marginBottom: 10 }}>{error}</p>}

        <button onClick={submit} disabled={submitting}
          style={{ width: '100%', background: '#1C2B4A', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'جارٍ الإرسال…' : 'إرسال التقييم'}
        </button>
      </div>

      {showScanner && (
        <TicketNumberScanner
          onScan={t => setTicketNumber(t)}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}
