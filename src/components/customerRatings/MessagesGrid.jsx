import { useState } from 'react'
import { FIELD_LABEL, stationLabel } from './shared'

function Chip({ on, children }) {
  return (
    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 9px', borderRadius: 3, border: '1px solid var(--border-2)', background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--text-3)' }}>
      {children}
    </span>
  )
}

// شبكة رسائل المحطات للكمبيوتر: بطاقة لكل محطة مع بحث، والحقول والحفظ نفس منطق الجوال
export default function MessagesGrid({ stations, msgs, setField, save, savingId, savedId, isAr }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const list = !needle ? stations : stations.filter(s => `${s.name_ar} ${s.name_en || ''}`.toLowerCase().includes(needle))
  return (
    <div>
      <div className="cr-card" style={{ padding: 20, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, flex: '1 1 380px', fontSize: '0.88rem', lineHeight: 1.8, color: 'var(--text-2)', borderInlineStart: '3px solid var(--info)', paddingInlineStart: 14 }}>
          {isAr ? 'اترك الحقل فاضياً لاستخدام الرسالة الافتراضية العامة لكل محطة ما لها رسالة خاصة' : 'Leave a field empty to use the general default message for any station without a custom message'}
        </p>
        <div style={{ flex: '0 1 320px', minWidth: 220 }}>
          <label style={FIELD_LABEL} htmlFor="cr-msg-q">{isAr ? 'بحث عن محطة' : 'Find a station'}</label>
          <input id="cr-msg-q" value={q} onChange={e => setQ(e.target.value)} placeholder={isAr ? 'اسم المحطة...' : 'Station name...'}
            className="cr-ctl" style={{ display: 'block' }} />
        </div>
      </div>
      {list.length === 0 ? (
        <div className="cr-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.92rem' }}>{isAr ? 'لا توجد محطات مطابقة' : 'No matching stations'}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))', gap: 16 }}>
          {list.map(s => {
            const row = msgs[s.id] || {}
            const busy = savingId === s.id
            return (
              <section key={s.id} className="cr-card" style={{ padding: 20, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-1)' }}>{stationLabel(s, isAr)}</h2>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Chip on={!!row.welcome_message}>{isAr ? (row.welcome_message ? 'ترحيب مخصص' : 'ترحيب افتراضي') : (row.welcome_message ? 'Custom welcome' : 'Default welcome')}</Chip>
                    <Chip on={!!row.closing_message}>{isAr ? (row.closing_message ? 'ختام مخصص' : 'ختام افتراضي') : (row.closing_message ? 'Custom closing' : 'Default closing')}</Chip>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                  <div>
                    <label style={FIELD_LABEL} htmlFor={`cr-w-${s.id}`}>{isAr ? 'رسالة الترحيب' : 'Welcome message'}</label>
                    <textarea id={`cr-w-${s.id}`} className="cr-ta" value={row.welcome_message || ''} onChange={e => setField(s.id, 'welcome_message', e.target.value)} rows={3} />
                  </div>
                  <div>
                    <label style={FIELD_LABEL} htmlFor={`cr-c-${s.id}`}>{isAr ? 'رسالة الختام' : 'Closing message'}</label>
                    <textarea id={`cr-c-${s.id}`} className="cr-ta" value={row.closing_message || ''} onChange={e => setField(s.id, 'closing_message', e.target.value)} rows={3} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                  <button type="button" className="cr-btn" style={{ height: 40 }} onClick={() => save(s.id)} disabled={busy}>
                    {busy ? (isAr ? 'جارٍ الحفظ…' : 'Saving…') : (isAr ? 'حفظ' : 'Save')}
                  </button>
                  <span aria-live="polite" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--success)' }}>{savedId === s.id && !busy ? (isAr ? 'تم الحفظ' : 'Saved') : ''}</span>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
