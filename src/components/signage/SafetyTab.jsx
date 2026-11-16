// تبويب الحماية (أدمن): رسالة الطوارئ لكل الشاشات + سجل التدقيق
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { btn } from '../dispatch/DispatchCards'
import ConfirmDialog from '../shared/ConfirmDialog'
import SelectField from '../shared/SelectField'
import { lbl, input, Pill, Empty, Err } from './common'
import { AUDIT_LABEL, fmtDT, sgError } from '../../utils/signage'

const DURATIONS = [[15, '15 دقيقة', '15 min'], [60, 'ساعة', '1 hour'], [240, '4 ساعات', '4 hours'], [1440, '24 ساعة', '24 hours'], [0, 'حتى أوقفها يدوياً', 'Until I stop it']]

export default function SafetyTab({ isAr, emergency, audit, reload, flash }) {
  const t = (a, e) => (isAr ? a : e)
  const [msg, setMsg] = useState(''); const [mins, setMins] = useState('60')
  const [ask, setAsk] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const live = emergency?.active && (!emergency.ends_at || new Date(emergency.ends_at) > new Date())

  async function set(active) {
    setBusy(true)
    const { error } = await supabase.rpc('signage_emergency_set', { p_active: active, p_message: active ? msg.trim() : null, p_minutes: active && Number(mins) > 0 ? Number(mins) : null })
    setBusy(false); setAsk(null)
    if (error) { setErr(sgError(error, isAr)); return }
    setErr(''); flash(active ? t('فُعّلت رسالة الطوارئ، ستظهر على كل الشاشات خلال دقيقة', 'Emergency active on all screens within a minute') : t('أُوقفت رسالة الطوارئ', 'Emergency stopped'), true); reload()
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ border: `1.5px solid ${live ? '#dc2626' : 'var(--border)'}`, background: live ? 'rgba(220,38,38,.06)' : 'var(--card)', borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 900, color: 'var(--text-1)' }}>{t('رسالة الطوارئ', 'Emergency message')}</h2>
          <Pill color={live ? '#dc2626' : '#64748b'} dot>{live ? t('مفعّلة الآن', 'Active') : t('غير مفعّلة', 'Off')}</Pill>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: 'var(--text-3)', lineHeight: 1.9 }}>{t('تقطع كل المحتوى على جميع الشاشات بشاشة حمراء بالرسالة، وتصل خلال دقيقة. للأدمن فقط ويُسجَّل من فعّلها.', 'Replaces all content on every screen with a red message within a minute. Admin only and audited.')}</p>
        <Err>{err}</Err>
        {live ? (
          <div>
            <div style={{ padding: '14px 16px', borderRadius: 12, background: '#b91c1c', color: '#fff', fontWeight: 900, fontSize: '1rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{emergency.message}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', margin: '8px 0 12px' }}>{t('فعّلها', 'By')} {emergency.set_by_name || '—'} · {fmtDT(emergency.set_at)}{emergency.ends_at ? ` · ${t('تنتهي', 'ends')} ${fmtDT(emergency.ends_at)}` : ''}</div>
            <button type="button" disabled={busy} onClick={() => set(false)} style={{ ...btn('primary'), background: '#16a34a', padding: '11px 24px', fontSize: '0.86rem' }}>{t('إيقاف رسالة الطوارئ', 'Stop emergency')}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div><label style={lbl}>{t('نص الرسالة *', 'Message *')}</label><textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3} maxLength={300} style={{ ...input, resize: 'vertical' }} placeholder={t('مثال: يُرجى التوجه إلى أقرب مخرج', 'e.g. Please proceed to the nearest exit')} /></div>
            <div style={{ maxWidth: 260 }}><label style={lbl}>{t('المدة', 'Duration')}</label>
              <SelectField value={mins} onChange={e => setMins(e.target.value)} style={input}>{DURATIONS.map(([v, a, e]) => <option key={v} value={v}>{isAr ? a : e}</option>)}</SelectField></div>
            <div><button type="button" disabled={!msg.trim() || busy} onClick={() => setAsk('on')} style={{ ...btn('primary'), background: '#dc2626', padding: '11px 24px', fontSize: '0.86rem', opacity: !msg.trim() ? 0.5 : 1 }}>{t('تفعيل الطوارئ على كل الشاشات', 'Activate on all screens')}</button></div>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ margin: '0 0 10px', fontSize: '1.02rem', fontWeight: 900, color: 'var(--text-1)' }}>{t('سجل التدقيق', 'Audit log')}</h2>
        {audit.length === 0 ? <Empty title={t('لا توجد عمليات مسجّلة', 'No entries')} /> : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--card)' }}>
            {audit.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: '0.8rem' }}>
                <span dir="ltr" style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--text-3)', fontSize: '0.72rem', minWidth: 118 }}>{fmtDT(a.at)}</span>
                <b style={{ color: 'var(--text-1)' }}>{AUDIT_LABEL[a.action] || a.action}</b>
                <span style={{ color: 'var(--text-2)', flex: 1, minWidth: 160, overflowWrap: 'anywhere' }}>{a.detail?.title || a.detail?.name || a.detail?.message || ''}</span>
                <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>{a.actor_name || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {ask === 'on' && <ConfirmDialog title={t('تفعيل الطوارئ', 'Activate emergency')} confirmLabel={busy ? '…' : t('تفعيل الآن', 'Activate now')}
        message={t('ستُقطع كل الشاشات في المملكة وتعرض هذه الرسالة فقط. هل أنت متأكد؟', 'Every screen will show only this message. Are you sure?')}
        onCancel={() => setAsk(null)} onConfirm={() => set(true)} />}
    </div>
  )
}
