import { supabase } from '../lib/supabase'

/**
 * دمج محطة مكررة في المحطة الأساسية:
 * ينقل كل المراجع (رحلات، توقفات، ترحيل، سجلات، مبيعات، مفقودات، مستخدمين)
 * من المحطة المكررة إلى الأساسية، ثم يعطّل المكررة ويعلّمها merged_into.
 *
 * الصفوف التي يمنعها قيد UNIQUE:
 *  - جداول الربط (توقفات/ترحيل/محطات المستخدم): يُحذف صف المكررة (الأساسية موجودة أصلاً).
 *  - جداول السجلات (trip_records/sales…): تُترك على المحطة المكررة ويُبلَّغ عنها (لا نحذف بيانات).
 *
 * @returns {Array<{label, ok, moved?, removed?, left?, error?}>} تقرير خطوة بخطوة
 */
const CHUNK = 200

export async function checkMergeReady() {
  const { error } = await supabase.from('stations').select('merged_into').limit(1)
  return !error
}

const isMissingFn = err =>
  err && (err.code === 'PGRST202' || /could not find the function|does not exist/i.test(err.message || ''))

export async function mergeStations(srcId, dstId) {
  if (!srcId || !dstId || srcId === dstId) throw new Error('اختيار غير صالح')

  /* المسار الذرّي: دالة merge_stations_rpc تنفذ الدمج كاملاً في معاملة
     واحدة وترجع التقرير جاهزاً (migration 012). أي فشل = تراجع كامل. */
  const rpc = await supabase.rpc('merge_stations_rpc', { p_src: srcId, p_dst: dstId })
  if (!rpc.error) return rpc.data
  if (!isMissingFn(rpc.error)) return [{ label: 'الدمج الذرّي', ok: false, error: rpc.error.message }]

  /* الدالة غير منصّبة بعد → المسار القديم خطوة بخطوة */
  const log = []
  const step = async (label, fn) => {
    try {
      const r = await fn()
      log.push({ label, ok: true, ...(r || {}) })
    } catch (err) {
      log.push({ label, ok: false, error: err.message || String(err) })
    }
  }

  // تحديث بسيط: عمود ليس ضمن قيد UNIQUE
  const simple = (table, col) => async () => {
    const { count, error } = await supabase.from(table)
      .update({ [col]: dstId }, { count: 'exact' }).eq(col, srcId)
    if (error) throw error
    return { moved: count ?? 0 }
  }

  // جدول له قيد UNIQUE (station_id + keyCol) وصف id — يعتمد id للتحديث الدقيق
  // deletable: صفوف الربط تُحذف عند التعارض، صفوف السجلات تُترك
  const uniqueById = ({ table, keyCols, deletable }) => async () => {
    const cols = ['id', ...keyCols].join(',')
    const { data: srcRows, error: e1 } = await supabase.from(table).select(cols).eq('station_id', srcId)
    if (e1) throw e1
    if (!srcRows?.length) return { moved: 0, removed: 0, left: 0 }
    const { data: dstRows, error: e2 } = await supabase.from(table).select(keyCols.join(',')).eq('station_id', dstId)
    if (e2) throw e2
    const keyOf = r => keyCols.map(c => r[c]).join('|')
    const dstKeys = new Set((dstRows ?? []).map(keyOf))
    const conflict = srcRows.filter(r => dstKeys.has(keyOf(r)))
    const ok = srcRows.filter(r => !dstKeys.has(keyOf(r)))
    for (let i = 0; i < ok.length; i += CHUNK) {
      const { error } = await supabase.from(table).update({ station_id: dstId })
        .in('id', ok.slice(i, i + CHUNK).map(r => r.id))
      if (error) throw error
    }
    if (deletable && conflict.length) {
      for (let i = 0; i < conflict.length; i += CHUNK) {
        const { error } = await supabase.from(table).delete()
          .in('id', conflict.slice(i, i + CHUNK).map(r => r.id))
        if (error) throw error
      }
    }
    return { moved: ok.length, removed: deletable ? conflict.length : 0, left: deletable ? 0 : conflict.length }
  }

  // جدول ربط بدون الاعتماد على عمود id (قد لا يوجد) — بمفتاح عمود واحد
  const uniqueByCol = ({ table, keyCol, deletable = true }) => async () => {
    const { data: srcRows, error: e1 } = await supabase.from(table).select(keyCol).eq('station_id', srcId)
    if (e1) throw e1
    if (!srcRows?.length) return { moved: 0, removed: 0, left: 0 }
    const { data: dstRows, error: e2 } = await supabase.from(table).select(keyCol).eq('station_id', dstId)
    if (e2) throw e2
    const dstKeys = new Set((dstRows ?? []).map(r => r[keyCol]))
    const conflict = srcRows.map(r => r[keyCol]).filter(k => dstKeys.has(k))
    const ok = srcRows.map(r => r[keyCol]).filter(k => !dstKeys.has(k))
    for (let i = 0; i < ok.length; i += CHUNK) {
      const { error } = await supabase.from(table).update({ station_id: dstId })
        .eq('station_id', srcId).in(keyCol, ok.slice(i, i + CHUNK))
      if (error) throw error
    }
    if (deletable && conflict.length) {
      for (let i = 0; i < conflict.length; i += CHUNK) {
        const { error } = await supabase.from(table).delete()
          .eq('station_id', srcId).in(keyCol, conflict.slice(i, i + CHUNK))
        if (error) throw error
      }
    }
    return { moved: ok.length, removed: deletable ? conflict.length : 0, left: deletable ? 0 : conflict.length }
  }

  /* 1) جدول الرحلات: منشأ/وجهة */
  await step('رحلات (منشأ)', simple('trip_schedule', 'from_station_id'))
  await step('رحلات (وجهة)', simple('trip_schedule', 'to_station_id'))

  /* 2) محطات العبور — UNIQUE(trip_schedule_id, station_id) */
  await step('محطات العبور', uniqueByCol({ table: 'trip_schedule_stops', keyCol: 'trip_schedule_id' }))

  /* 3) ربط الترحيل — UNIQUE(station_id, trip_schedule_id) */
  await step('رحلات الترحيل المفعّلة', uniqueByCol({ table: 'station_trips', keyCol: 'trip_schedule_id' }))
  await step('محطة مغادرة معدّلة', simple('station_trips', 'departure_station_id'))

  /* 4) سجلات الترحيل — UNIQUE(trip_schedule_id, record_date, station_id) — لا حذف */
  await step('سجلات الرحلات', uniqueById({ table: 'trip_records', keyCols: ['trip_schedule_id', 'record_date'], deletable: false }))

  /* 5) سجلات العبور القديمة — قد لا تكون مستخدمة */
  await step('سجلات العبور', uniqueById({ table: 'trip_transit_records', keyCols: ['trip_record_id'], deletable: false }))

  /* 6) المبيعات — UNIQUE(station_id, sale_date, shift, created_by) — لا حذف */
  await step('سجلات المبيعات', uniqueById({ table: 'sales_records', keyCols: ['sale_date', 'shift', 'created_by'], deletable: false }))

  /* 7) المفقودات + المستخدمون */
  await step('المفقودات', simple('lost_found_items', 'station_id'))
  await step('المستخدمون (المحطة الأساسية)', simple('users', 'station_id'))
  await step('محطات المستخدمين', uniqueByCol({ table: 'user_stations', keyCol: 'user_id' }))

  /* 8) دمج أرقام الرحلات الثابتة ثم تعطيل المكررة ووسمها */
  await step('إقفال المحطة المكررة', async () => {
    const { data: pair, error: e1 } = await supabase.from('stations')
      .select('id, trip_numbers').in('id', [srcId, dstId])
    if (e1) throw e1
    const src = pair.find(s => s.id === srcId)
    const dst = pair.find(s => s.id === dstId)
    const merged = [...new Set([
      ...(Array.isArray(dst?.trip_numbers) ? dst.trip_numbers : []),
      ...(Array.isArray(src?.trip_numbers) ? src.trip_numbers : []),
    ])]
    const { error: e2 } = await supabase.from('stations')
      .update({ trip_numbers: merged }).eq('id', dstId)
    if (e2) throw e2
    const { error: e3 } = await supabase.from('stations')
      .update({ is_active: false, merged_into: dstId }).eq('id', srcId)
    if (e3) throw e3
    return { moved: 1 }
  })

  return log
}
