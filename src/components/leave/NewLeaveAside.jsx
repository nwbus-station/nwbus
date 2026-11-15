// الشريط الجانبي لنموذج الطلب على الكمبيوتر: ملخص حيّ للطلب + الرصيد + شروط النوع + مسار الموافقة + زر الرفع
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"

const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }
const cardHead = { padding: '12px 18px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)', background: 'var(--surface)' }

function Row({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: '1px solid var(--border)', fontSize: '0.88rem' }}>
      <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-1)', fontWeight: 700, textAlign: 'end', minWidth: 0, wordBreak: 'break-word', fontFamily: mono ? MONO : 'inherit' }} dir={mono ? 'ltr' : undefined}>{value || '—'}</span>
    </div>
  )
}

export default function NewLeaveAside({ profile, typeLabel, isCasual, startDate, endDate, returnDate, timeFrom, timeTo, durationValue, durationUnit, durationMax, over, annual, quota, rules, autoApproved, submitLabel }) {
  const stage = (n, t, sub) => (
    <div key={n} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#1C2B4A', color: '#fff', fontSize: '0.76rem', fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-1)' }}>{t}</div>
        {sub && <div style={{ fontSize: '0.76rem', color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 76, minWidth: 0 }}>
      {/* الملخص */}
      <section style={card}>
        <div style={cardHead}>ملخص الطلب</div>
        <div style={{ padding: '16px 18px 10px' }}>
          <div style={{ textAlign: 'center', padding: '14px 10px', borderRadius: 14, background: over ? 'rgba(220,38,38,.08)' : 'var(--surface)', border: `1px solid ${over ? '#fca5a5' : 'var(--border)'}`, marginBottom: 10 }}>
            <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: '2.5rem', lineHeight: 1.1, color: over ? '#dc2626' : 'var(--text-1)', letterSpacing: '0.04em' }} dir="ltr">{durationValue}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', fontWeight: 700, marginTop: 4 }}>
              {durationUnit}{durationMax ? ` — الحد الأقصى ${durationMax}` : ''}
            </div>
          </div>
          <Row label="مقدّم الطلب" value={profile?.full_name_ar} />
          <Row label="النوع" value={typeLabel} />
          {isCasual ? (
            <>
              <Row label="التاريخ" value={startDate} mono />
              <Row label="الوقت" value={timeFrom && timeTo ? `${timeFrom} — ${timeTo}` : ''} mono />
            </>
          ) : (
            <>
              <Row label="من" value={startDate} mono />
              <Row label="إلى" value={endDate} mono />
              <Row label="المباشرة" value={returnDate} mono />
            </>
          )}
        </div>
      </section>

      {/* الرصيد السنوي */}
      {annual && (
        <section style={card}>
          <div style={cardHead}>رصيدك السنوي</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {[['سنوات الخدمة', annual.years, null], ['الاستحقاق', annual.entitlement, 'يوم'], ['المتراكم', annual.accrued.toFixed(1), 'يوم']].map(([l, v, u], i) => (
              <div key={l} style={{ padding: '14px 8px', textAlign: 'center', borderInlineStart: i ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.3rem', color: 'var(--text-1)' }}>{v}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', fontWeight: 700, marginTop: 2 }}>{l}{u ? ` (${u})` : ''}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* حدّ الاستئذان */}
      {quota && (
        <section style={card}>
          <div style={cardHead}>{quota.period === 'year' ? 'حدّ الاستئذان السنوي' : 'حدّ الاستئذان الشهري'}</div>
          <div style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontWeight: 800, fontSize: '0.98rem', color: quota.over ? '#dc2626' : 'var(--text-1)' }} dir="ltr">
              <span>{quota.hhmm(quota.used)}</span><span>{quota.hhmm(quota.hours)}</span>
            </div>
            <div style={{ marginTop: 8, height: 9, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ width: `${quota.pct}%`, height: '100%', background: quota.over ? '#dc2626' : quota.pct > 80 ? '#d97706' : '#1C2B4A', transition: 'width .25s' }} />
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 8, fontWeight: 600 }}>
              {quota.over ? 'الطلب يتجاوز الحد المتاح' : `المتبقي بعد الطلب ${quota.hhmm(quota.after)}`}
            </div>
          </div>
        </section>
      )}

      {/* مسار الموافقة */}
      <section style={card}>
        <div style={cardHead}>مسار الموافقة</div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {autoApproved ? (
            <div style={{ fontSize: '0.86rem', color: '#15803d', fontWeight: 700, background: 'rgba(22,163,74,.12)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.7 }}>
              هذا النوع يُعتمد تلقائياً بعد الرفع بدون دورة موافقات.
            </div>
          ) : (
            [stage(1, 'مقدّم الطلب', 'رفع الطلب'), stage(2, 'المشرف المباشر', 'مراجعة أولية'), stage(3, 'المدير المعتمِد', 'الاعتماد النهائي')]
          )}
        </div>
      </section>

      {/* القواعد */}
      {rules?.length > 0 && (
        <section style={card}>
          <div style={cardHead}>قبل الرفع</div>
          <ul style={{ margin: 0, padding: '14px 18px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {rules.map((r, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.65 }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, background: '#EE712D', marginTop: 8, flexShrink: 0 }} />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="submit"
        style={{ padding: '15px 24px', borderRadius: 12, border: 'none', background: '#1C2B4A', color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', width: '100%', boxShadow: '0 6px 18px rgba(28,43,74,.28)' }}>
        {submitLabel}
      </button>
    </aside>
  )
}
