// السجل والأرشيف: الموجودات وبلاغات المفقودات كبطاقات مع فلاتر ومؤشرات.
// تسليم الموجودات للجمعية للمشرفين فقط (canDonate)، والحذف للأدمن فقط (isAdmin).
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { getCached, setCached, clearCached } from '../../lib/pageCache'
import { ITEM_TYPES } from '../../utils/constants'
import RouteText from '../shared/RouteText'
import SelectField from '../shared/SelectField'
import ConfirmDialog from '../shared/ConfirmDialog'
import { fmtDT } from './ui'

const CACHE_KEY = 'lostfound_logs_all'
const PAGE = 60
const DONATE_AFTER = 30    // يوم: بعدها يحق تسليم الغرض للجمعية
const DELETE_AFTER = 40    // يوم: بعدها يُقترح الحذف (بعد تأكيد الأدمن)
const DELIVERED_KEEP = 30  // يوم: بعد التسليم للعميل

const daysSince = d => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : 0)
const day10 = d => (d ? String(d).slice(0, 10) : '—')

const STATES = {
  unclaimed: { ar: 'غير مستلم', en: 'Unclaimed', c: '#d97706', bg: 'rgba(217,119,6,0.14)' },
  due: { ar: 'مستحق للجمعية', en: 'Due for charity', c: '#dc2626', bg: 'rgba(220,38,38,0.13)' },
  claimed: { ar: 'سُلّم للعميل', en: 'Delivered', c: '#16a34a', bg: 'rgba(22,163,74,0.14)' },
  donated: { ar: 'سُلّم للجمعية', en: 'Donated', c: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
}
const itemState = it => {
  if (it.status === 'claimed') return 'claimed'
  if (it.status === 'donated') return 'donated'
  return daysSince(it.found_date || it.created_at) >= DONATE_AFTER ? 'due' : 'unclaimed'
}
const PERIODS = [['all', 'كل الفترات', 'All time'], ['7', 'آخر 7 أيام', 'Last 7 days'], ['30', 'آخر 30 يوماً', 'Last 30 days'], ['90', 'آخر 90 يوماً', 'Last 90 days']]

const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }
const fieldStyle = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.84rem', fontFamily: 'inherit', color: 'var(--text-1)', background: 'var(--card)', boxSizing: 'border-box', outline: 'none' }

function Chip({ s, children }) {
  return <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: s.bg, color: s.c, whiteSpace: 'nowrap' }}>{children}</span>
}
function Meta({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  )
}
const actBtn = (danger = false) => ({ padding: '6px 12px', borderRadius: 8, border: `1px solid ${danger ? 'rgba(220,38,38,0.4)' : 'var(--border)'}`, background: 'var(--surface)', color: danger ? '#dc2626' : 'var(--text-2)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' })

export default function LostFoundArchive({ isAdmin = false, canDonate = false, onDonate = null, isAr = true }) {
  const t = (ar, en) => (isAr ? ar : en)
  const cached = getCached(CACHE_KEY)
  const [sub, setSub] = useState('items')
  const [reports, setReports] = useState(() => cached?.reports ?? [])
  const [items, setItems] = useState(() => cached?.items ?? [])
  const [donMap, setDonMap] = useState({})   // donation_id → محضر التسليم للجمعية
  const [loading, setLoading] = useState(() => !cached)
  const [search, setSearch] = useState('')
  const [fStation, setFStation] = useState('')
  const [fStatus, setFStatus] = useState('all')
  const [fType, setFType] = useState('')
  const [fPeriod, setFPeriod] = useState('all')
  const [sort, setSort] = useState('new')
  const [limit, setLimit] = useState(PAGE)
  const [openId, setOpenId] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [phones, setPhones] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null)   // { kind: 'donate'|'item'|'report'|'expired', id? }
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')
  const [hideExpired, setHideExpired] = useState(false)

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  const load = useCallback(async () => {
    const [{ data: i }, rRes] = await Promise.all([
      supabase.from('lost_found_items').select('*, creator:created_by(phone)').order('created_at', { ascending: false }),
      supabase.from('lost_reports').select('*, from_st:from_station_id(name_ar), to_st:to_station_id(name_ar)').order('created_at', { ascending: false }),
    ])
    let r = rRes.data
    if (rRes.error) {
      // فشل جلب البلاغات مع أسماء المحطات المرتبطة: نجلبها بدونها ونركّب الأسماء من جدول المحطات
      const [{ data: plain }, { data: sts }] = await Promise.all([
        supabase.from('lost_reports').select('*').order('created_at', { ascending: false }),
        supabase.from('stations').select('id, name_ar'),
      ])
      const nm = Object.fromEntries((sts ?? []).map(x => [x.id, x.name_ar]))
      r = (plain ?? []).map(x => ({ ...x, from_st: x.from_station_id ? { name_ar: nm[x.from_station_id] } : null, to_st: x.to_station_id ? { name_ar: nm[x.to_station_id] } : null }))
    }
    const rpts = r ?? [], itms = i ?? []
    // محاضر التسليم للجمعية (قد يكون الجدول غير منشأ بعد: نتجاهل الخطأ)
    const { data: dons } = await supabase.from('charity_donations').select('id, donation_no, charity_name, created_by_name, station_name')
    setDonMap(Object.fromEntries((dons ?? []).map(d => [d.id, d])))
    if (rpts.length || itms.length) setCached(CACHE_KEY, { reports: rpts, items: itms })
    setReports(rpts); setItems(itms); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const refresh = () => { clearCached(CACHE_KEY); load() }
    const ch = supabase.channel('lostfound_archive_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lost_found_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lost_reports' }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])
  // أي تغيير فلتر يرجع العدّاد لأول صفحة
  useEffect(() => { setLimit(PAGE) }, [sub, search, fStation, fStatus, fType, fPeriod, sort])

  // ── عمليات ──
  async function removeOne(table, id) {
    setBusy(id)
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) flash(t('تعذّر الحذف: ', 'Delete failed: ') + error.message)
    else {
      if (table === 'lost_reports') setReports(prev => prev.filter(x => x.id !== id))
      else setItems(prev => prev.filter(x => x.id !== id))
      clearCached(CACHE_KEY)
    }
    setBusy(null)
  }

  const expiredItems = useMemo(() => items.filter(i => (i.created_at && daysSince(i.created_at) >= DELETE_AFTER)
    || (i.status === 'claimed' && i.delivered_to_client_at && daysSince(i.delivered_to_client_at) >= DELIVERED_KEEP)), [items])
  const expiredReports = useMemo(() => reports.filter(r => r.created_at && daysSince(r.created_at) >= DELETE_AFTER), [reports])
  async function removeExpired() {
    setBusy('expired')
    const rid = expiredReports.map(r => r.id), iid = expiredItems.map(i => i.id)
    const errs = []
    if (rid.length) { const { error } = await supabase.from('lost_reports').delete().in('id', rid); if (error) errs.push(error.message) }
    if (iid.length) { const { error } = await supabase.from('lost_found_items').delete().in('id', iid); if (error) errs.push(error.message) }
    if (errs.length) flash(t('تعذّر الحذف: ', 'Delete failed: ') + errs[0])
    else { setReports(prev => prev.filter(r => !rid.includes(r.id))); setItems(prev => prev.filter(i => !iid.includes(i.id))); clearCached(CACHE_KEY) }
    setBusy(null)
  }
  function runConfirmed() {
    const c = confirm; setConfirm(null)
    if (!c) return
    if (c.kind === 'item') removeOne('lost_found_items', c.id)
    else if (c.kind === 'report') removeOne('lost_reports', c.id)
    else if (c.kind === 'expired') removeExpired()
  }

  // ── الفلترة ──
  const q = search.trim().toLowerCase()
  const inPeriod = d => fPeriod === 'all' || daysSince(d) <= Number(fPeriod)
  const stations = useMemo(() => [...new Map(items.filter(i => i.station_id && i.found_location).map(i => [i.station_id, i.found_location])).entries()]
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'ar')), [items])

  const itemsBase = useMemo(() => items.filter(i =>
    (!fStation || i.station_id === fStation)
    && (!fType || i.item_type === fType)
    && inPeriod(i.found_date || i.created_at)
    && (!q || [i.item_description, i.created_by_name, i.found_location, i.owner_name, String(i.item_number ?? '')].some(v => String(v ?? '').toLowerCase().includes(q)))
  ), [items, fStation, fType, fPeriod, q])
  const stateCounts = useMemo(() => {
    const c = { all: itemsBase.length, unclaimed: 0, due: 0, claimed: 0, donated: 0 }
    itemsBase.forEach(i => { c[itemState(i)]++ })
    return c
  }, [itemsBase])
  const itemsList = useMemo(() => {
    const l = itemsBase.filter(i => fStatus === 'all' || itemState(i) === fStatus)
    const ts = i => new Date(i.found_date || i.created_at || 0).getTime()
    return [...l].sort((a, b) => (sort === 'old' ? ts(a) - ts(b) : ts(b) - ts(a)))
  }, [itemsBase, fStatus, sort])

  const reportsList = useMemo(() => {
    const l = reports.filter(r => inPeriod(r.created_at)
      && (!q || [r.customer_name, r.contact_number, r.created_by_name, r.item_description, String(r.report_number ?? ''), r.ticket_number, r.sticker_number].some(v => String(v ?? '').toLowerCase().includes(q))))
    const ts = r => new Date(r.created_at || 0).getTime()
    return [...l].sort((a, b) => (sort === 'old' ? ts(a) - ts(b) : ts(b) - ts(a)))
  }, [reports, q, fPeriod, sort])

  const filtersActive = !!(search || fStation || fType || fPeriod !== 'all' || fStatus !== 'all')
  const clearFilters = () => { setSearch(''); setFStation(''); setFType(''); setFPeriod('all'); setFStatus('all') }
  const togglePhone = id => setPhones(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── مؤشرات ──
  const kpis = sub === 'items'
    ? [['all', t('الإجمالي', 'Total'), stateCounts.all, 'var(--text-1)'], ['unclaimed', t('غير مستلم', 'Unclaimed'), stateCounts.unclaimed, STATES.unclaimed.c], ['due', t('مستحق للجمعية', 'Due for charity'), stateCounts.due, STATES.due.c], ['claimed', t('سُلّم للعميل', 'Delivered'), stateCounts.claimed, STATES.claimed.c], ['donated', t('سُلّم للجمعية', 'Donated'), stateCounts.donated, STATES.donated.c]]
    : [[null, t('إجمالي البلاغات', 'Total reports'), reports.length, 'var(--text-1)'], [null, t('آخر 7 أيام', 'Last 7 days'), reports.filter(r => daysSince(r.created_at) <= 7).length, STATES.unclaimed.c], [null, t('أقدم من 30 يوماً', 'Older than 30 days'), reports.filter(r => daysSince(r.created_at) >= 30).length, STATES.due.c]]

  const shown = (sub === 'items' ? itemsList : reportsList)
  const visible = shown.slice(0, limit)

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '18px 14px 40px' }} dir={isAr ? 'rtl' : 'ltr'}>
      {msg && <div style={{ ...card, padding: '10px 14px', marginBottom: 12, borderColor: 'rgba(220,38,38,0.4)', color: '#dc2626', fontSize: '0.82rem', fontWeight: 700 }}>{msg}</div>}

      {isAdmin && !hideExpired && (expiredItems.length + expiredReports.length) > 0 && (
        <div style={{ ...card, borderColor: 'rgba(217,119,6,0.45)', background: 'rgba(217,119,6,0.08)', padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: '0.8rem', color: 'var(--text-1)', lineHeight: 1.7 }}>
            <b>{t('انتهت مدة الاحتفاظ', 'Retention period ended')}</b> — {t(
              `${expiredItems.length} من الموجودات و${expiredReports.length} من البلاغات (أكثر من ${DELETE_AFTER} يوماً، أو مُسلَّمة للعميل من أكثر من ${DELIVERED_KEEP} يوماً). لن تُحذف إلا بعد تأكيدك.`,
              `${expiredItems.length} items and ${expiredReports.length} reports. Nothing is deleted until you confirm.`)}
          </div>
          <button onClick={() => setConfirm({ kind: 'expired' })} disabled={busy === 'expired'} style={{ ...actBtn(true), background: '#dc2626', color: '#fff', border: 'none' }}>{t('مراجعة وحذف', 'Review & delete')}</button>
          <button onClick={() => setHideExpired(true)} style={actBtn()}>{t('لاحقاً', 'Later')}</button>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.kind === 'expired' ? t(`حذف نهائي لـ ${expiredItems.length} من الموجودات و${expiredReports.length} من البلاغات المنتهية مدتها؟ لا يمكن التراجع.`, `Permanently delete ${expiredItems.length} items and ${expiredReports.length} reports?`)
            : confirm.kind === 'report' ? t('حذف هذا البلاغ نهائياً؟ لا يمكن التراجع.', 'Delete this report permanently?')
            : t('حذف هذه القطعة نهائياً؟ لا يمكن التراجع.', 'Delete this item permanently?')}
          confirmLabel={t('حذف', 'Delete')} cancelLabel={t('إلغاء', 'Cancel')}
          onConfirm={runConfirmed} onCancel={() => setConfirm(null)} />
      )}

      {/* العنوان والتبويب الفرعي */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-1)' }}>{t('السجل والأرشيف', 'Archive & Log')}</h2>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 3 }}>{t(`${DONATE_AFTER} يوماً ← تسليم للجمعية (للمشرفين) · ${DELETE_AFTER} يوماً ← حذف بعد تأكيد الأدمن`, `${DONATE_AFTER} days → charity (supervisors) · ${DELETE_AFTER} days → delete after admin confirmation`)}</div>
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
          {[['items', t('الموجودات', 'Found items'), items.length], ['reports', t('بلاغات المفقودات', 'Lost reports'), reports.length]].map(([k, l, n]) => (
            <button key={k} type="button" onClick={() => setSub(k)} style={{ padding: '9px 18px', border: 'none', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', background: sub === k ? 'var(--text-1)' : 'transparent', color: sub === k ? 'var(--card)' : 'var(--text-2)' }}>
              {l} <span style={{ opacity: 0.65, fontFamily: MONO }}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* المؤشرات (تعمل كفلاتر للموجودات) */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${sub === 'items' ? 104 : 104}px, 1fr))`, gap: 8, marginBottom: 12 }}>
        {kpis.map(([key, label, n, color], i) => {
          const clickable = sub === 'items' && key
          const on = clickable && fStatus === key
          return (
            <button key={i} type="button" disabled={!clickable} onClick={() => clickable && setFStatus(key === fStatus ? 'all' : key)}
              style={{ ...card, padding: '12px 14px', textAlign: 'start', cursor: clickable ? 'pointer' : 'default', fontFamily: 'inherit', borderTop: `3px solid ${color}`, outline: on ? `2px solid ${color}` : 'none', outlineOffset: -1 }}>
              <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.4rem', lineHeight: 1.1, color: 'var(--text-1)' }}>{n}</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginTop: 4 }}>{label}</div>
            </button>
          )
        })}
      </div>

      {/* الفلاتر */}
      <div style={{ ...card, padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 220px', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{t('بحث', 'Search')}</label>
          <input value={search} onChange={e => setSearch(e.target.value)} style={fieldStyle}
            placeholder={sub === 'items' ? t('وصف الغرض، رقم، محطة، مسجّل…', 'Description, number, station…') : t('اسم العميل، جوال، رقم بلاغ، تذكرة…', 'Customer, phone, report/ticket no…')} />
        </div>
        {sub === 'items' && (
          <>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{t('المحطة', 'Station')}</label>
              <SelectField value={fStation} onChange={e => setFStation(e.target.value)} style={fieldStyle}>
                <option value="">{t('كل المحطات', 'All stations')}</option>
                {stations.map(([sid, name]) => <option key={sid} value={sid}>{name}</option>)}
              </SelectField>
            </div>
            <div style={{ flex: '1 1 130px', minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{t('نوع الغرض', 'Type')}</label>
              <SelectField value={fType} onChange={e => setFType(e.target.value)} style={fieldStyle}>
                <option value="">{t('كل الأنواع', 'All types')}</option>
                {ITEM_TYPES.map(x => <option key={x.value} value={x.value}>{isAr ? x.ar : x.en}</option>)}
              </SelectField>
            </div>
          </>
        )}
        <div style={{ flex: '1 1 140px', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{t('الفترة', 'Period')}</label>
          <SelectField value={fPeriod} onChange={e => setFPeriod(e.target.value)} style={fieldStyle}>
            {PERIODS.map(([v, ar, en]) => <option key={v} value={v}>{isAr ? ar : en}</option>)}
          </SelectField>
        </div>
        <div style={{ flex: '1 1 130px', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{t('الترتيب', 'Sort')}</label>
          <SelectField value={sort} onChange={e => setSort(e.target.value)} style={fieldStyle}>
            <option value="new">{t('الأحدث أولاً', 'Newest first')}</option>
            <option value="old">{t('الأقدم أولاً', 'Oldest first')}</option>
          </SelectField>
        </div>
        {filtersActive && <button type="button" onClick={clearFilters} style={{ ...actBtn(), height: 38 }}>{t('مسح الفلاتر', 'Clear')}</button>}
      </div>

      {sub === 'items' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {[['all', t('الكل', 'All')], ['unclaimed', t('غير مستلم', 'Unclaimed')], ['due', t('مستحق للجمعية', 'Due')], ['claimed', t('سُلّم للعميل', 'Delivered')], ['donated', t('سُلّم للجمعية', 'Donated')]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFStatus(k)}
              style={{ padding: '7px 14px', borderRadius: 99, fontSize: '0.76rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: `1.5px solid ${fStatus === k ? 'var(--text-1)' : 'var(--border)'}`, background: fStatus === k ? 'var(--text-1)' : 'var(--card)', color: fStatus === k ? 'var(--card)' : 'var(--text-2)' }}>
              {l} <span style={{ fontFamily: MONO, opacity: 0.75 }}>{stateCounts[k]}</span>
            </button>
          ))}
        </div>
      )}

      {/* البطاقات */}
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40 }}>{t('جارٍ التحميل...', 'Loading...')}</p>
      ) : shown.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.88rem' }}>
          {sub === 'items' ? t('لا توجد موجودات مطابقة', 'No matching items') : t('لا توجد بلاغات مطابقة', 'No matching reports')}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {sub === 'items' ? visible.map(item => {
              const st = itemState(item), S = STATES[st]
              const foundDays = daysSince(item.found_date || item.created_at)
              const photos = Array.isArray(item.photos) ? item.photos : []
              const typeLabel = ITEM_TYPES.find(x => x.value === item.item_type)
              const open = openId === item.id
              const left = Math.max(0, DONATE_AFTER - foundDays)
              const pctAge = Math.min(100, Math.round((foundDays / DONATE_AFTER) * 100))
              const ageColor = foundDays >= DONATE_AFTER ? '#dc2626' : foundDays >= 20 ? '#d97706' : '#16a34a'
              const deliveredLeft = item.status === 'claimed' && item.delivered_to_client_at ? Math.max(0, DELIVERED_KEEP - daysSince(item.delivered_to_client_at)) : null
              return (
                <article key={item.id} style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: `3px solid ${S.c}` }}>
                  <div style={{ padding: '12px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 8px' }}>{item.item_number ? `#${item.item_number}` : '—'}</span>
                    <Chip s={S}>{isAr ? S.ar : S.en}</Chip>
                  </div>
                  <div style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {photos[0] && (
                      <img src={photos[0]} alt="" onClick={() => setLightbox(photos[0])}
                        style={{ width: 62, height: 62, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'zoom-in', flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.item_description || '—'}</div>
                      {photos.length > 1 && <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', marginTop: 2 }}>{t(`${photos.length} صور`, `${photos.length} photos`)}</div>}
                    </div>
                  </div>
                  <div style={{ padding: '0 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                    <Meta label={t('المحطة', 'Station')}>{item.found_location || '—'}</Meta>
                    <Meta label={t('النوع', 'Type')}>{typeLabel ? (isAr ? typeLabel.ar : typeLabel.en) : '—'}</Meta>
                    <Meta label={t('تاريخ العثور', 'Found on')}><span dir="ltr">{day10(item.found_date || item.created_at)}</span></Meta>
                    <Meta label={t('المسجّل', 'Registered by')}>{item.created_by_name || '—'}</Meta>
                    {item.status === 'claimed' && <Meta label={t('العميل', 'Client')}>{item.owner_name || '—'}</Meta>}
                    {item.status === 'claimed' && <Meta label={t('تاريخ ووقت التسليم للعميل', 'Delivered on')}><span dir="ltr">{item.delivered_to_client_at ? fmtDT(item.delivered_to_client_at) : day10(item.resolved_date)}</span></Meta>}
                    {item.status === 'claimed' && <Meta label={t('سلّمه', 'Delivered by')}>{item.delivered_by_name || item.updated_by_name || '—'}</Meta>}
                    {item.status === 'claimed' && <Meta label={t('محطة التسليم', 'Delivery station')}>{item.delivered_station_name || '—'}</Meta>}
                    {item.status === 'donated' && <Meta label={t('تاريخ ووقت التسليم للجمعية', 'Donated on')}><span dir="ltr">{fmtDT(item.donated_at)}</span></Meta>}
                    {item.status === 'donated' && <Meta label={t('الجمعية', 'Charity')}>{donMap[item.donation_id]?.charity_name || '—'}</Meta>}
                    {item.status === 'donated' && <Meta label={t('سلّمها', 'Delivered by')}>{donMap[item.donation_id]?.created_by_name || '—'}</Meta>}
                    {item.status === 'donated' && <Meta label={t('محطة التسليم', 'Delivery station')}>{donMap[item.donation_id]?.station_name || '—'}</Meta>}
                    {item.status === 'donated' && donMap[item.donation_id] && <Meta label={t('رقم المحضر', 'Record')}><span dir="ltr" style={{ fontFamily: MONO }}>{`DN-${String(donMap[item.donation_id].donation_no ?? 0).padStart(4, '0')}`}</span></Meta>}
                  </div>
                  {item.status !== 'claimed' && item.status !== 'donated' && (
                    <div style={{ padding: '0 14px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>
                        <span>{t(`${foundDays} يوم منذ العثور`, `${foundDays} days since found`)}</span>
                        <span style={{ color: ageColor }}>{foundDays >= DONATE_AFTER ? t('يحق تسليمه للجمعية', 'Eligible for charity') : t(`يتبقى ${left} يوم للجمعية`, `${left} days to charity`)}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-2, var(--surface))', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${pctAge}%`, background: ageColor, borderRadius: 99 }} /></div>
                    </div>
                  )}
                  {deliveredLeft !== null && <div style={{ padding: '0 14px 10px', fontSize: '0.66rem', color: 'var(--text-3)' }}>{t(`يُحذف بعد ${deliveredLeft} يوم`, `Deleted in ${deliveredLeft} days`)}</div>}

                  {open && (
                    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {item.status === 'claimed' && item.owner_id_number && (isAdmin || canDonate) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>{t('رقم هوية المستلم', 'Recipient ID')}</span>
                          <button type="button" onClick={() => togglePhone('id' + item.id)} style={actBtn()}>{phones.has('id' + item.id) ? t('إخفاء', 'Hide') : t('إظهار', 'Show')}</button>
                          {phones.has('id' + item.id) && <span dir="ltr" style={{ fontFamily: MONO, fontWeight: 700, color: 'var(--text-1)' }}>{item.owner_id_number}</span>}
                        </div>
                      )}
                      {item.creator?.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>{t('جوال المسجّل', 'Registrant phone')}</span>
                          <button type="button" onClick={() => togglePhone(item.id)} style={actBtn()}>{phones.has(item.id) ? t('إخفاء', 'Hide') : t('إظهار', 'Show')}</button>
                          {phones.has(item.id) && <span dir="ltr" style={{ fontFamily: MONO, fontWeight: 700, color: 'var(--text-1)' }}>{item.creator.phone}</span>}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 }}>{t('الصور', 'Photos')}{photos.length ? ` · ${photos.length}` : ''}</div>
                        {photos.length === 0
                          ? <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t('لا توجد صور مرفقة', 'No photos attached')}</div>
                          : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{photos.map((url, pi) => (
                            <img key={pi} src={url} alt="" onClick={() => setLightbox(url)} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'zoom-in' }} />
                          ))}</div>}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" onClick={() => setOpenId(open ? null : item.id)} style={actBtn()}>{open ? t('إخفاء التفاصيل', 'Hide details') : t('التفاصيل والصور', 'Details & photos')}</button>
                    <span style={{ flex: 1 }} />
                    {canDonate && onDonate && st === 'due' && (
                      <button type="button" onClick={() => onDonate(item.id)} style={{ ...actBtn(), background: 'rgba(139,92,246,0.14)', color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.4)' }}>
                        {t('تسليم للجمعية', 'Donate')}
                      </button>
                    )}
                    {isAdmin && <button type="button" disabled={busy === item.id} onClick={() => setConfirm({ kind: 'item', id: item.id })} style={actBtn(true)}>{t('حذف', 'Delete')}</button>}
                  </div>
                </article>
              )
            }) : visible.map(r => {
              const days = daysSince(r.created_at)
              const old = days >= 30
              const refs = [[t('رقم التذكرة', 'Ticket'), r.ticket_number], [t('رقم الملصق', 'Sticker'), r.sticker_number], [t('رقم الباص', 'Bus'), r.bus_number], [t('وقت المغادرة', 'Departure'), r.departure_time]].filter(([, v]) => v)
              return (
                <article key={r.id} style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: `3px solid ${old ? '#dc2626' : '#d97706'}` }}>
                  <div style={{ padding: '12px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 8px' }}>{r.report_number ? `#${r.report_number}` : '—'}</span>
                    <Chip s={old ? STATES.due : STATES.unclaimed}>{t(`${days} يوم`, `${days} d`)}</Chip>
                  </div>
                  <div style={{ padding: '10px 14px 4px' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-1)' }}>{r.customer_name || '—'}</div>
                    {r.item_description && <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginTop: 4, lineHeight: 1.6 }}>{r.item_description}</div>}
                  </div>
                  <div style={{ padding: '6px 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                    <Meta label={t('رقم التواصل', 'Contact')}><span dir="ltr" style={{ fontFamily: MONO }}>{r.contact_number || '—'}</span></Meta>
                    <Meta label={t('تاريخ البلاغ', 'Reported on')}><span dir="ltr">{day10(r.report_at || r.created_at)}</span></Meta>
                    {r.from_st?.name_ar && r.to_st?.name_ar && (
                      <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 2 }}>{t('خط الرحلة', 'Route')}</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}><RouteText from={r.from_st.name_ar} to={r.to_st.name_ar} /></div>
                      </div>
                    )}
                    {refs.map(([l, v]) => <Meta key={l} label={l}><span dir="ltr">{String(v)}</span></Meta>)}
                    <Meta label={t('المسجّل', 'Registered by')}>{r.created_by_name || '—'}</Meta>
                  </div>
                  {r.notes && <div style={{ padding: '0 14px 12px', fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.7 }}><b style={{ color: 'var(--text-3)', fontSize: '0.64rem' }}>{t('ملاحظات', 'Notes')}: </b>{r.notes}</div>}
                  {isAdmin && (
                    <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" disabled={busy === r.id} onClick={() => setConfirm({ kind: 'report', id: r.id })} style={actBtn(true)}>{t('حذف', 'Delete')}</button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
          {shown.length > visible.length && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" onClick={() => setLimit(l => l + PAGE)} style={{ ...actBtn(), padding: '10px 26px' }}>{t(`عرض المزيد (${shown.length - visible.length})`, `Show more (${shown.length - visible.length})`)}</button>
            </div>
          )}
        </>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8 }} />
          <button type="button" onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 18, insetInlineEnd: 18, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
        </div>
      )}
    </div>
  )
}
