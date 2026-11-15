// دمج محطة مكررة في الأساسية — أدمن فقط (نفس منطق الدمج السابق، بعرض Sheet موحّد)
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { mergeStations, checkMergeReady } from '../../utils/mergeStations'
import Sheet, { Ic } from '../dispatch/Sheet'
import SearchSelect from '../shared/SearchSelect'
import { MONO, tint } from './stationsUi'

const MERGE_SQL = 'ALTER TABLE stations ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES stations(id);'
const WARN = 'var(--warning)'

export default function MergeSheet({ stations, onClose, onSaved }) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const t = (en, ar) => isAr ? ar : en

  const [ready, setReady]     = useState(null)   // null = يفحص، false = يحتاج SQL
  const [srcId, setSrcId]     = useState('')
  const [dstId, setDstId]     = useState('')
  const [confirm, setConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [log, setLog]         = useState(null)

  useEffect(() => { checkMergeReady().then(setReady) }, [])

  const opts = exclude => stations
    .filter(s => s.id !== exclude && !s.merged_into)
    .map(s => ({ value: s.id, label: `${s.name_en}${s.name_ar && s.name_ar !== s.name_en ? ` · ${s.name_ar}` : ''}${s.is_active ? '' : t(' (inactive)', ' (معطلة)')}` }))
  const nameOf = id => stations.find(s => s.id === id)?.name_en || '—'

  async function run() {
    setRunning(true)
    try { setLog(await mergeStations(srcId, dstId)) }
    catch (err) { setLog([{ label: t('Merge', 'الدمج'), ok: false, error: err.message }]) }
    setRunning(false)
    onSaved()
  }

  const canRun = !(!srcId || !dstId || !confirm || running)
  const showForm = ready && !log
  const footer = showForm ? (
    <>
      <button type="button" className="stn-btn stn-btn-ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</button>
      <button type="button" className="stn-btn stn-btn-primary" onClick={run} disabled={!canRun}
        style={{ background: WARN, minWidth: 140 }}>
        {running ? t('Merging…', 'جارٍ الدمج…') : t('Merge now', 'دمج الآن')}
      </button>
    </>
  ) : (
    <button type="button" className="stn-btn stn-btn-primary" onClick={onClose}>{t('Close', 'إغلاق')}</button>
  )

  const note = { margin: 0, padding: 14, borderRadius: 12, fontSize: '.84rem', lineHeight: 1.8 }

  return (
    <Sheet variant="modal" width={600} isAr={isAr} accent="#d97706" icon={Ic.alert} onClose={onClose} footer={footer}
      title={t('Merge duplicate station', 'دمج محطة مكررة')}
      sub={t('Move everything from a duplicate station to the main one.', 'انقل كل شيء من محطة مكررة إلى المحطة الأساسية.')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {ready === null ? (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: '24px 0', margin: 0 }}>…</p>
        ) : ready === false ? (
          <>
            <p style={{ margin: 0, fontSize: '.9rem', color: 'var(--text-2)', lineHeight: 1.8 }}>
              {t('One-time setup: run this in Supabase (SQL Editor) then reopen:',
                 'إعداد لمرة واحدة: شغّل هذا السطر في Supabase (SQL Editor) ثم أعد فتح النافذة:')}
            </p>
            <pre dir="ltr" style={{ margin: 0, background: '#111', color: '#86efac', fontSize: '.78rem', borderRadius: 12, padding: 14, overflowX: 'auto', userSelect: 'all', fontFamily: MONO }}>{MERGE_SQL}</pre>
            <div>
              <button type="button" className="stn-btn stn-btn-ghost stn-btn-sm" onClick={() => { navigator.clipboard?.writeText(MERGE_SQL) }}>{t('Copy', 'نسخ')}</button>
            </div>
          </>
        ) : log ? (
          <>
            <p style={{ margin: 0, fontSize: '.95rem', fontWeight: 900, color: log.every(l => l.ok) ? 'var(--success)' : WARN }}>
              {log.every(l => l.ok) ? t('Merge completed', 'تم الدمج') : t('Merge finished with issues', 'انتهى الدمج مع ملاحظات')}
            </p>
            <div style={{ border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden' }}>
              {log.map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', fontSize: '.84rem', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontWeight: l.ok ? 600 : 800, color: l.ok ? 'var(--text-2)' : 'var(--danger)' }}>{l.ok ? t('OK', 'تم') : t('Failed', 'فشل')} · {l.label}</span>
                  <span dir="ltr" style={{ color: 'var(--text-3)', fontFamily: MONO, fontSize: '.78rem' }}>
                    {l.ok
                      ? [l.moved ? `${l.moved} ${t('moved', 'نُقل')}` : '', l.removed ? `${l.removed} ${t('removed', 'حُذف')}` : '', l.left ? `${l.left} ${t('left', 'بقي')}` : ''].filter(Boolean).join(' · ') || '—'
                      : l.error}
                  </span>
                </div>
              ))}
            </div>
            {log.some(l => l.left) && (
              <p style={{ ...note, background: tint(WARN, 10), border: `1px solid ${tint(WARN, 35)}`, color: WARN, fontWeight: 700 }}>
                {t('Some records stayed on the old station because an identical record already exists on the target (same trip & date). Review them manually.',
                   'بعض السجلات بقيت على المحطة القديمة لوجود سجل مطابق على الأساسية (نفس الرحلة والتاريخ). راجعها يدوياً.')}
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{ ...note, background: tint('#2563eb', 9), border: `1px solid ${tint('#2563eb', 25)}`, color: 'var(--text-2)' }}>
              {t('Moves everything (trips, stops, activations, records, sales, lost & found, users) from the duplicate to the main station, then disables the duplicate. Future Excel uploads will map the old name to the main station automatically.',
                 'ينقل كل شيء (الرحلات، التوقفات، الترحيل، السجلات، المبيعات، المفقودات، المستخدمين) من المحطة المكررة إلى الأساسية ثم يعطّل المكررة. أي رفع Excel قادم سيوجّه الاسم القديم للمحطة الأساسية تلقائياً.')}
            </p>
            <div>
              <label className="stn-lbl">{t('Duplicate station (will be disabled)', 'المحطة المكررة (ستُعطَّل)')}</label>
              <SearchSelect isAr={isAr} value={srcId} onChange={setSrcId}
                placeholder={t('— Select —', '— اختر —')}
                className="stn-input" options={opts(dstId)} />
            </div>
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '.8rem', fontWeight: 800 }}>{t('moves into', 'تُدمج في')}</div>
            <div>
              <label className="stn-lbl">{t('Main station (keeps everything)', 'المحطة الأساسية (يبقى كل شيء عليها)')}</label>
              <SearchSelect isAr={isAr} value={dstId} onChange={setDstId}
                placeholder={t('— Select —', '— اختر —')}
                className="stn-input" options={opts(srcId)} />
            </div>
            {srcId && dstId && (
              <label className="stn-opt" style={{ borderColor: tint(WARN, 40), background: tint(WARN, 8) }}>
                <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />
                <span style={{ fontSize: '.84rem', lineHeight: 1.8, color: 'var(--text-1)', fontWeight: 600 }}>
                  {t('I confirm merging', 'أؤكد دمج')} <b dir="ltr">{nameOf(srcId)}</b> {t('into', 'في')} <b dir="ltr">{nameOf(dstId)}</b>.
                  {' '}{t('This cannot be undone automatically.', 'لا يمكن التراجع تلقائياً.')}
                </span>
              </label>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
