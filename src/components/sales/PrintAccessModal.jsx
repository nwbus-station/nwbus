import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import DatePicker from '../shared/DatePicker'
import SearchSelect from '../shared/SearchSelect'
import ConfirmDialog from '../shared/ConfirmDialog'
import { accountState } from '../../utils/printAccess'
import { todayStr } from '../../utils/dates'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white'

function Seg({ value, onChange, options }) {
  return (
    <div role="radiogroup" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
      {options.map(o => {
        const on = value === o.value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            style={{ padding: '8px 16px', fontSize: '0.78rem', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: 'none', minHeight: 36,
              background: on ? o.color : 'transparent', color: on ? '#fff' : 'var(--text-2)' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// لوحة إدارة طباعة اليومية (للأدمن فقط): وضع عام + استثناءات حسابات، كل منها مستمر أو مؤقت بتاريخ انتهاء
export default function PrintAccessModal({ isAr = true, access, onSave, onClose }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(access)))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState([])
  const [makers, setMakers] = useState(new Set())
  const [pick, setPick] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(null)
  const today = todayStr()

  useEffect(() => {
    supabase.from('users').select('id, full_name_ar, job_number, is_active').order('full_name_ar').then(({ data }) => setUsers((data ?? []).filter(u => u.is_active !== false)))
    supabase.from('sales_records').select('created_by').order('sale_date', { ascending: false }).limit(4000).then(({ data }) => setMakers(new Set((data ?? []).map(r => r.created_by).filter(Boolean))))
  }, [])

  const edit = fn => { setDraft(d => { const n = JSON.parse(JSON.stringify(d)); fn(n); return n }); setDirty(true) }
  const entries = Object.entries(draft.accounts).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name), 'ar'))

  const options = useMemo(() => {
    const free = users.filter(u => !draft.accounts[u.id])
    const label = u => `${u.full_name_ar}${u.job_number ? ' — ' + u.job_number : ''}`
    return [
      ...free.filter(u => makers.has(u.id)).map(u => ({ value: u.id, label: label(u), group: isAr ? 'أدخلوا يوميات' : 'Entered dailies' })),
      ...free.filter(u => !makers.has(u.id)).map(u => ({ value: u.id, label: label(u), group: isAr ? 'باقي الحسابات' : 'Other accounts' })),
    ]
  }, [users, makers, draft.accounts, isAr])

  function addAccount() {
    const u = users.find(x => x.id === pick)
    if (!u) return
    edit(d => { d.accounts[u.id] = { mode: 'allow', until: null, name: u.full_name_ar, job: u.job_number || '' } })
    setPick('')
  }

  async function save() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setDirty(false)
    onClose()
  }

  const globalOn = draft.all && (!draft.allUntil || draft.allUntil >= today)
  const chip = (txt, c, bg) => <span style={{ background: bg, color: c, borderRadius: 99, padding: '2px 11px', fontSize: '0.7rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{txt}</span>
  const stateChip = id => {
    const st = accountState(draft, id, today)
    if (!st.allowed) return chip(isAr ? 'ممنوع' : 'Blocked', '#b91c1c', '#fee2e2')
    return chip(st.until ? (isAr ? `مسموح حتى ${st.until}` : `Allowed until ${st.until}`) : (isAr ? 'مسموح — مستمر' : 'Allowed — ongoing'), '#15803d', '#dcfce7')
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div role="dialog" aria-modal="true" aria-label={isAr ? 'إدارة طباعة اليومية' : 'Daily print access'}
        style={{ background: 'var(--card, #fff)', borderRadius: 18, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        {/* الرأس */}
        <div style={{ background: 'linear-gradient(135deg,#1C2B4A,#2d4a7a)', color: '#fff', padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 4, alignSelf: 'stretch', background: '#EE712D', borderRadius: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>{isAr ? 'إدارة طباعة اليومية' : 'Daily print access'}</div>
            <div style={{ fontSize: '0.74rem', opacity: 0.8, marginTop: 3 }}>{isAr ? 'حدّد من يستطيع طباعة يومياته التي أدخلها — بشكل مستمر أو مؤقت' : 'Choose who can print the dailies they entered — ongoing or temporary'}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={isAr ? 'إغلاق' : 'Close'} style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: 'none', borderRadius: 10, width: 36, height: 36, fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* الوضع العام */}
          <section style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-1)' }}>{isAr ? 'الوضع العام لكل الحسابات' : 'Default for all accounts'}</span>
              {globalOn ? chip(draft.allUntil ? (isAr ? `مفتوح حتى ${draft.allUntil}` : `Open until ${draft.allUntil}`) : (isAr ? 'مفتوح — مستمر' : 'Open — ongoing'), '#15803d', '#dcfce7') : chip(isAr ? 'مغلق' : 'Closed', '#475569', '#e2e8f0')}
            </div>
            <Seg value={draft.all ? 'on' : 'off'} onChange={v => edit(d => { d.all = v === 'on'; if (v !== 'on') d.allUntil = null })}
              options={[{ value: 'off', label: isAr ? 'مغلق للجميع' : 'Closed for all', color: '#475569' }, { value: 'on', label: isAr ? 'مفتوح للجميع' : 'Open for all', color: '#15803d' }]} />
            {draft.all && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? 'مؤقت حتى (اتركه فارغاً ليبقى مستمراً):' : 'Temporary until (leave empty for ongoing):'}</span>
                <div style={{ width: 190 }}><DatePicker value={draft.allUntil || ''} onChange={v => edit(d => { d.allUntil = v || null })} isAr={isAr} className={inp + ' w-full'} /></div>
                {draft.allUntil && <button type="button" onClick={() => edit(d => { d.allUntil = null })} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>{isAr ? 'جعله مستمراً' : 'Make ongoing'}</button>}
              </div>
            )}
            <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '10px 0 0', lineHeight: 1.7 }}>
              {isAr ? 'الاستثناءات أدناه تغلب الوضع العام. الأدمن يطبع دائماً، والموظف يطبع اليوميات التي أدخلها هو فقط.' : 'Account exceptions below override the default. Admins always print; staff print only their own dailies.'}
            </p>
          </section>

          {/* الحسابات */}
          <section style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-1)' }}>{isAr ? 'حسابات مخصّصة' : 'Specific accounts'}</span>
              <span style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 99, padding: '0 9px', fontSize: '0.7rem', fontWeight: 800, fontFamily: MONO }}>{entries.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <SearchSelect isAr={isAr} value={pick} onChange={setPick} options={options} placeholder={isAr ? 'ابحث عن حساب لإضافته…' : 'Find an account to add…'} className={inp + ' w-full'} />
              </div>
              <button type="button" onClick={addAccount} disabled={!pick}
                style={{ padding: '0 20px', minHeight: 40, borderRadius: 10, border: 'none', background: '#1C2B4A', color: '#fff', fontWeight: 800, fontSize: '0.8rem', cursor: pick ? 'pointer' : 'not-allowed', opacity: pick ? 1 : 0.4, fontFamily: 'inherit' }}>
                {isAr ? '+ إضافة' : '+ Add'}
              </button>
            </div>

            {entries.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '0.78rem', padding: '18px 0', margin: 0 }}>{isAr ? 'لا توجد استثناءات — الجميع يتبع الوضع العام' : 'No exceptions — everyone follows the default'}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {entries.map(([id, e]) => (
                  <div key={id} style={{ border: '1px solid var(--border)', borderInlineStart: `4px solid ${e.mode === 'allow' ? '#16a34a' : '#dc2626'}`, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--surface)' }}>
                    <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#1C2B4A', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, flexShrink: 0 }}>{String(e.name || '?').trim().charAt(0)}</span>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--text-1)' }}>{e.name}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                        {e.job && <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: 'var(--text-3)' }}>#{e.job}</span>}
                        {stateChip(id)}
                      </div>
                    </div>
                    <Seg value={e.mode} onChange={v => edit(d => { d.accounts[id].mode = v })}
                      options={[{ value: 'allow', label: isAr ? 'سماح' : 'Allow', color: '#15803d' }, { value: 'deny', label: isAr ? 'منع' : 'Block', color: '#b91c1c' }]} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? 'حتى' : 'Until'}</span>
                      <div style={{ width: 150 }}><DatePicker value={e.until || ''} onChange={v => edit(d => { d.accounts[id].until = v || null })} isAr={isAr} className={inp + ' w-full'} placeholder={isAr ? 'مستمر' : 'Ongoing'} /></div>
                    </div>
                    <button type="button" onClick={() => setConfirmRemove(id)} aria-label={isAr ? 'إزالة الحساب' : 'Remove account'} title={isAr ? 'إزالة من الاستثناءات' : 'Remove exception'}
                      style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', fontFamily: 'inherit' }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* التذييل */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: dirty ? '#b45309' : 'var(--text-3)', flex: 1 }}>{dirty ? (isAr ? 'توجد تغييرات غير محفوظة' : 'Unsaved changes') : (isAr ? 'لا تغييرات' : 'No changes')}</span>
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: '0 20px', minHeight: 40, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>{isAr ? 'إغلاق' : 'Close'}</button>
          <button type="button" onClick={save} disabled={!dirty || saving} style={{ padding: '0 26px', minHeight: 40, borderRadius: 10, border: 'none', background: '#EE712D', color: '#fff', fontWeight: 900, fontSize: '0.84rem', cursor: dirty && !saving ? 'pointer' : 'not-allowed', opacity: dirty && !saving ? 1 : 0.45, fontFamily: 'inherit' }}>{saving ? '…' : (isAr ? 'حفظ التغييرات' : 'Save changes')}</button>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmDialog message={isAr ? `إزالة «${draft.accounts[confirmRemove]?.name}» من الاستثناءات؟ سيتبع الوضع العام بعد الحفظ.` : 'Remove this account from exceptions? It will follow the default after saving.'}
          confirmLabel={isAr ? 'إزالة' : 'Remove'} cancelLabel={isAr ? 'تراجع' : 'Cancel'}
          onConfirm={() => { edit(d => { delete d.accounts[confirmRemove] }); setConfirmRemove(null) }} onCancel={() => setConfirmRemove(null)} />
      )}
    </div>
  )
}
