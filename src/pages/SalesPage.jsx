import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getCached, setCached } from '../lib/pageCache'
import { toLatinDigits, cleanNumber } from '../utils/digits'
import DatePicker from '../components/shared/DatePicker'
import StatStrip from '../components/shared/StatStrip'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import PrintAccessModal from '../components/sales/PrintAccessModal'
import BalanceDocScan, { openBalanceDoc } from '../components/sales/BalanceDocScan'
import { useAppSettings } from '../context/AppSettingsContext'
import { PRINT_ACCESS_KEY, parseAccess, accountState } from '../utils/printAccess'
import { todayStr, toLocalDateStr } from '../utils/dates'
import { parseShifts, validEnds } from '../utils/shifts'
import { DAY_CUTOFF_KEY, parseCutoff, fmtCutoff, businessDate } from '../utils/businessDay'
import { isRestStation } from '../utils/stations'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { safeImport } from '../lib/chunkReload'
import SelectField from '../components/shared/SelectField'
import SearchSelect from '../components/shared/SearchSelect'
import { SALES_VIEW_CAPS } from '../utils/constants'
import { brandHeader, docHeader, docShell, openDocWindow, previewToolbar, TOOLBAR_CSS, esc } from '../utils/printDoc'

// الورديات تتبع إعداد الأدمن (3 أو 4) من الإعدادات؛ تُحدَّث عند كل عرض من app_settings
const salesShiftsFrom = raw => parseShifts(raw).map(s => ({ value: s.k, ar: s.ar, en: s.en, range: s.range, end: s.to / 60 }))
let SHIFTS = salesShiftsFrom(null)
const lastShift = () => SHIFTS[SHIFTS.length - 1]

// الوردية المتوقعة من الوقت الحالي: وقت الإقفال (قبل نهاية الوردية بساعة وحتى ساعة ونصف بعدها) يعني الوردية المنتهية،
// وإلا فالوردية الجارية. بعد منتصف الليل مباشرة (حتى 1:30) تكون ورديّة ج ليوم أمس — الوردية الأخيرة فقط، وباقي الأوقات تتبع الوردية الجارية.
function suggestShift(now = new Date(), cutoffMin = 90) {
  const h = now.getHours() + now.getMinutes() / 60
  const today = todayStr()
  for (const sh of SHIFTS) {
    if (h >= sh.end - 1 && h < sh.end + 1.5 && sh.end < 24) return { shift: sh.value, date: today, closing: true }
  }
  if (h >= 23) return { shift: lastShift().value, date: today, closing: true }
  if (h < cutoffMin / 60) { const d = new Date(now); d.setDate(d.getDate() - 1); return { shift: lastShift().value, date: toLocalDateStr(d), closing: true, yesterday: true } }
  return { shift: (SHIFTS.find(sh => h <= sh.end) ?? lastShift()).value, date: today, closing: false }
}

const fmt  = n => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtD = d => d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year:'numeric', month:'short', day:'numeric' }) : '—'
const fmtT = d => d ? new Date(d).toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour:'2-digit', minute:'2-digit', hour12: false }) : ''

const CASHIER_KEY  = 'nwbus_cashier_ref'
const DRAFT_KEY    = 'nwbus_sales_draft'

const parseRefs = raw => {
  if (!raw) return ''
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.join(' / ') : raw } catch { return raw }
}
const parseRefsArr = raw => {
  if (!raw) return []
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : [raw] } catch { return [raw] }
}

// لوحة الورديات: ما سُجّل لهذي المحطة بهذا التاريخ ومن سجّله، وتنبيه فوري لو الموظف مكرر قبل الحفظ
function ShiftBoard({ stationId, date, shift, onPick, saleId, employeeName, profileId, isAr }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!stationId || !date) { setRows(null); return }
    let alive = true
    supabase.from('sales_records').select('id, shift, employee_name, created_by_name, created_by')
      .eq('station_id', stationId).eq('sale_date', date)
      .then(({ data }) => { if (alive) setRows((data ?? []).filter(r => r.id !== saleId)) })
    return () => { alive = false }
  }, [stationId, date, saleId])
  if (!stationId || !rows) return null
  const norm = v => String(v || '').trim().toLowerCase()
  const nameOf = r => r.employee_name || r.created_by_name || '—'
  const dupe = rows.find(r => r.shift === shift && r.created_by === profileId && norm(r.employee_name) === norm(employeeName))
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <p className="text-[11px] font-bold text-gray-500 mb-2">{isAr ? `يوميات هذي المحطة بتاريخ ${date}` : `Records for this station on ${date}`}</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${SHIFTS.length}, minmax(0, 1fr))` }}>
        {SHIFTS.map(sh => {
          const list = rows.filter(r => r.shift === sh.value)
          const active = shift === sh.value
          return (
            <button key={sh.value} type="button" onClick={() => onPick(sh.value)}
              className={`text-start rounded-lg border px-2.5 py-2 transition-colors ${active ? 'border-emerald-500 bg-white shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-gray-800">{isAr ? sh.ar : sh.en}</span>
                <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${list.length ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{list.length || (isAr ? 'فارغة' : 'empty')}</span>
              </div>
              <p className="text-[10.5px] text-gray-500 mt-1 truncate">{list.length ? list.map(nameOf).join('، ') : sh.range}</p>
            </button>
          )
        })}
      </div>
      {dupe && (
        <p className="mt-2 text-[12px] font-bold text-red-600">
          {isAr ? 'تنبيه: هذا الموظف عنده يومية مسجلة لهذي الوردية. افتحها وعدّلها من القائمة، أو غيّر الوردية/التاريخ.' : 'Warning: this employee already has a record for this shift. Edit it from the list or change shift/date.'}
        </p>
      )}
    </div>
  )
}

// بطاقة قسم داخل نموذج الإيراد (خارج المكوّن عشان ما تُعاد تهيئة الحقول مع كل ضغطة مفتاح)
function SectionCard({ n, title, children, tone = 'bg-white border-gray-200' }) {
  return (
    <section className={`rounded-lg border ${tone} p-4`}>
      {title && (
        <h3 className="text-[13px] font-bold text-gray-800 mb-3">
          {title}
        </h3>
      )}
      {children}
    </section>
  )
}

/* ─── طباعة سجل إيراد واحد (كشف الإيرادات اليومية) — تُستدعى من النافذة ومن زر الطباعة بصف السجل ─── */
function buildSaleRecordHtml({ sale, isAr, profile, docUrl, docIsPdf }) {
    const dir = isAr ? 'rtl' : 'ltr'
    const now = new Date()
    const printDate = now.toLocaleDateString('en-GB')
    const printTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const printerName = profile?.full_name_ar ?? profile?.full_name ?? '—'
    const employeeName = sale?.employee_name || sale?.created_by_name || '—'
    const jobNumber = ((!sale?.employee_name || sale.employee_name === sale.created_by_name) ? sale?.created_by_user?.job_number : null) ?? '—'
    const stationName = sale?.station?.name_ar ?? sale?.station?.name_en ?? '—'
    const accountantName = sale?.confirmed_by_name ?? '—'
    const totalActualVal = (Number(sale?.cash_amount??0) + Number(sale?.mada_amount??0) + Number(sale?.visa_amount??0) + Number(sale?.mastercard_amount??0) + Number(sale?.other_amount??0))
    const diff = totalActualVal - Number(sale?.total_expected??0)
    const hasDeficit = diff < 0
    const deficitAcknowledged = sale?.accountant_notes?.includes('تم إقرار العجز')
    const shiftLabel = { A: isAr ? 'الوردية أ' : 'Shift A', B: isAr ? 'الوردية ب' : 'Shift B', C: isAr ? 'الوردية ج' : 'Shift C', D: isAr ? 'الوردية د' : 'Shift D' }[sale?.shift] ?? sale?.shift ?? '—'

    const shareText = [
      `${isAr ? 'كشف الإيرادات اليومية' : 'Daily Revenue Report'} — ${stationName}`,
      `${isAr ? 'التاريخ' : 'Date'}: ${sale?.sale_date ?? '—'} · ${shiftLabel}`,
      `${isAr ? 'الموظف' : 'Employee'}: ${employeeName}${jobNumber !== '—' ? ` (#${jobNumber})` : ''}`,
      `${isAr ? 'المحصَّل' : 'Collected'}: ${fmt(totalActualVal)} ${isAr ? 'ر.س' : 'SAR'} · ${isAr ? 'المبيعات' : 'Sales'}: ${fmt(sale?.total_expected)} · ${isAr ? 'الفرق' : 'Diff'}: ${diff > 0 ? '+' : ''}${fmt(diff)}`,
    ].join('\n')
    const docTitle = `إيرادات_${stationName}_${sale?.sale_date ?? ''}_${shiftLabel}`.replace(/\s+/g, '_')
    const html = `<!DOCTYPE html><html dir="${dir}"><head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>${docTitle}</title>
      <style>
        ${TOOLBAR_CSS}
        @media (max-width: 640px) { .page { padding: 14px 12px !important; } .meta { flex-wrap: wrap; } .meta-cell { flex: 1 1 45%; border-bottom: 1px solid #d1d5db; } .footer { flex-direction: column; gap: 16px; } .print-footer { flex-direction: column; gap: 6px; align-items: flex-start; } .print-footer .pf-left { flex-wrap: wrap; gap: 8px 14px; } }
        @import url('https://fonts.googleapis.com/css2?family=IBM Plex Sans Arabic:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'IBM Plex Sans Arabic', Arial, sans-serif; background: #fff; color: #1a1a2e; direction: ${dir}; font-size: 13px; }
        .page { max-width: 720px; margin: 0 auto; padding: 28px 32px; }
        @page { size: A4; margin: 12mm; }

        /* Header */
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1B3A6B; padding-bottom: 14px; margin-bottom: 16px; }
        .header-right h1 { font-size: 20px; font-weight: 700; color: #1B3A6B; }
        .header-right .sys { font-size: 11px; color: #888; margin-top: 2px; }
        .header-left { text-align: ${isAr ? 'left' : 'right'}; }
        .header-left .doc-title { font-size: 15px; font-weight: 700; color: #1B3A6B; }
        .header-left .doc-date { font-size: 11px; color: #666; margin-top: 3px; }
        .confirmed-stamp { display: inline-block; border: 2px solid #16a34a; color: #16a34a; border-radius: 6px; padding: 2px 10px; font-size: 12px; font-weight: 700; margin-top: 6px; letter-spacing: 1px; }

        /* Meta row */
        .meta { display: flex; gap: 0; margin-bottom: 16px; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; }
        .meta-cell { flex: 1; padding: 8px 14px; border-${isAr ? 'left' : 'right'}: 1px solid #d1d5db; background: #f8fafc; }
        .meta-cell:last-child { border: none; }
        .meta-cell .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
        .meta-cell .value { font-size: 13px; font-weight: 600; color: #1a1a2e; margin-top: 2px; }

        /* Main table */
        table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        thead tr { background: #1B3A6B; color: #fff; }
        thead th { padding: 9px 14px; font-size: 12px; font-weight: 600; text-align: ${isAr ? 'right' : 'left'}; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        tbody tr:hover { background: #f0f4fa; }
        tbody td { padding: 8px 14px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        tbody td.label-col { color: #374151; font-weight: 600; width: 45%; }
        tbody td.value-col { color: #1a1a2e; }
        tbody td.amount { font-weight: 600; color: #1B3A6B; font-variant-numeric: tabular-nums; }

        /* Totals section */
        .totals { border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; margin-top: 14px; }
        .totals-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        .totals-row:last-child { border: none; }
        .totals-row.highlight { background: #1B3A6B; color: #fff; font-weight: 700; font-size: 14px; }
        .totals-row.surplus { background: #f0fdf4; color: #15803d; font-weight: 700; }
        .totals-row.deficit { background: #fef2f2; color: #dc2626; font-weight: 700; }
        .totals-row .t-label { }
        .totals-row .t-value { font-variant-numeric: tabular-nums; }

        /* Footer */
        .footer { margin-top: 28px; border-top: 2px solid #e5e7eb; padding-top: 14px; display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; }
        .footer .sig-box { border-top: 1px solid #9ca3af; padding-top: 4px; min-width: 140px; text-align: center; font-size: 11px; color: #374151; }
        .footer .sig-label { font-size: 10px; color: #9ca3af; margin-bottom: 20px; }
        .print-footer { margin-top: 14px; border-top: 1px solid #d1d5db; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #6b7280; }
        .print-footer .pf-left { display: flex; gap: 18px; }
        .print-footer strong { color: #374151; }
        .system-info { font-size: 10px; color: #9ca3af; text-align: center; margin-top: 10px; }

        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { padding: 0; max-width: 100%; width: 100%; }
          table { table-layout: fixed; }
          td, th { word-wrap: break-word; overflow-wrap: anywhere; }
        }
      </style>
    </head><body>
    ${previewToolbar({ label: isAr ? 'معاينة كشف الإيرادات' : 'Revenue sheet preview', shareTitle: docTitle, shareText })}
    <div class="page">

      <!-- Header -->
      ${brandHeader({
        title: isAr ? 'كشف الإيرادات اليومية' : 'Daily Revenue Report',
        subtitle: stationName,
        lines: [`${isAr ? 'تاريخ السجل' : 'Record date'}: <b>${sale?.sale_date ?? '—'}</b>`, sale?.is_confirmed ? `<span style="display:inline-block;border:1.5px solid #16a34a;color:#16a34a;border-radius:6px;padding:0 8px;font-weight:700">&#10003; ${isAr ? 'سجل مؤكد' : 'CONFIRMED'}</span>` : ''].filter(Boolean),
        dir, margin: '0 0 16px',
      })}

      <!-- Meta -->
      <div class="meta">
        <div class="meta-cell">
          <div class="label">${isAr ? 'الوردية' : 'Shift'}</div>
          <div class="value">${shiftLabel}</div>
        </div>
        <div class="meta-cell">
          <div class="label">${isAr ? 'اسم الموظف' : 'Employee'}</div>
          <div class="value">${employeeName}</div>
        </div>
        <div class="meta-cell">
          <div class="label">${isAr ? 'الرقم الوظيفي' : 'Job No.'}</div>
          <div class="value" style="font-family:monospace;font-size:14px;font-weight:700;color:#1B3A6B">${jobNumber}</div>
        </div>
        <div class="meta-cell">
          <div class="label">${isAr ? 'رقم الصرافة' : 'Cashier No.'}</div>
          <div class="value" style="font-family:monospace;font-size:14px;font-weight:700;color:#1B3A6B">${parseRefsArr(sale?.balance_ref)[0] || '—'}</div>
        </div>
        <div class="meta-cell">
          <div class="label">${isAr ? 'رقم الموازنة' : 'Balance Ref'}</div>
          <div class="value">${parseRefsArr(sale?.balance_ref).slice(1).filter(Boolean).join(' / ') || '—'}</div>
        </div>
      </div>

      <!-- Sales Table -->
      <table>
        <thead>
          <tr>
            <th>${isAr ? 'البيان' : 'Description'}</th>
            <th style="text-align:${isAr?'left':'right'}">${isAr ? 'المبلغ (ر.س)' : 'Amount (SAR)'}</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="label-col">${isAr ? 'مبيعات كاش' : 'Cash Sales'}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.cash_amount)}</td></tr>
          <tr><td class="label-col">${isAr ? 'مبيعات مدى' : 'Mada Sales'}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.mada_amount)}</td></tr>
          <tr><td class="label-col">${isAr ? 'مبيعات فيزا' : 'Visa Sales'}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.visa_amount)}</td></tr>
          <tr><td class="label-col">${isAr ? 'مبيعات ماستركارد' : 'Mastercard Sales'}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.mastercard_amount)}</td></tr>
          <tr><td class="label-col">${isAr ? 'مبيعات أخرى' : 'Other Sales'}${sale?.other_type ? ` (${sale.other_type})` : ''}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.other_amount)}</td></tr>
          ${sale?.bank_deposit_amount ? `<tr><td class="label-col">${isAr ? 'المودع بالبنك' : 'Bank Deposit'}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.bank_deposit_amount)}</td></tr>` : ''}
          ${sale?.accountant_notes ? `<tr><td class="label-col">${isAr ? 'ملاحظات المحاسب' : 'Accountant Notes'}</td><td class="value-col">${sale.accountant_notes}</td></tr>` : ''}
        </tbody>
      </table>

      <!-- Totals -->
      <div class="totals">
        <div class="totals-row">
          <span class="t-label">${isAr ? 'إجمالي المبيعات' : 'Total Sales'}</span>
          <span class="t-value">${fmt(sale?.total_expected)} ر.س</span>
        </div>
        <div class="totals-row highlight">
          <span class="t-label">${isAr ? 'إجمالي الإيرادات الفعلي' : 'Actual Total Revenue'}</span>
          <span class="t-value">${fmt(totalActualVal)} ر.س</span>
        </div>
        <div class="totals-row ${diff >= 0 ? 'surplus' : 'deficit'}">
          <span class="t-label">${diff >= 0 ? (isAr ? '▲ فائض' : '▲ Surplus') : (isAr ? '▼ عجز' : '▼ Deficit')}</span>
          <span class="t-value">${fmt(Math.abs(diff))} ر.س</span>
        </div>
      </div>

      <!-- Deficit Acknowledgment Box -->
      ${hasDeficit ? `
      <div style="margin-top:14px;border:2px solid #dc2626;border-radius:8px;padding:14px;background:#fff5f5;direction:${dir}">
        <div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:8px">
          ⚠ ${isAr ? 'إقرار العجز' : 'Deficit Acknowledgment'}
        </div>
        <div style="font-size:12px;color:#374151;line-height:2">
          <div>${isAr ? 'مبلغ العجز:' : 'Deficit Amount:'} <strong style="color:#dc2626">${fmt(Math.abs(diff))} ${isAr ? 'ر.س' : 'SAR'}</strong></div>
          <div>${isAr ? 'اسم الموظف:' : 'Employee:'} <strong>${employeeName}</strong></div>
          <div>${isAr ? 'الرقم الوظيفي:' : 'Job No.:'} <strong style="font-family:monospace">${jobNumber}</strong></div>
          <div>${isAr ? 'اعتمد بواسطة المحاسب:' : 'Approved by Accountant:'} <strong>${accountantName}</strong></div>
          <div>${isAr ? 'المحطة:' : 'Station:'} <strong>${stationName}</strong></div>
          <div style="margin-top:6px;padding:6px 10px;background:${deficitAcknowledged ? '#dcfce7' : '#fef2f2'};border-radius:4px;font-weight:700;color:${deficitAcknowledged ? '#15803d' : '#dc2626'}">
            ${deficitAcknowledged
              ? (isAr ? '✓ تم إقرار العجز وتحميله على الموظف من قِبل محاسب المحطة' : '✓ Deficit acknowledged and charged to employee by station accountant')
              : (isAr ? '⚠ لم يتم إقرار العجز بعد' : '⚠ Deficit not yet acknowledged')}
          </div>
        </div>
      </div>` : ''}

      <!-- Signature / Footer -->
      <div class="footer">
        <div>
          <div class="sig-label">${isAr ? 'توقيع الموظف' : 'Employee Signature'}</div>
          <div class="sig-box">${employeeName}${jobNumber !== '—' ? `<br><span style="font-size:10px;color:#888">${isAr ? 'رقم وظيفي:' : 'Job No:'} ${jobNumber}</span>` : ''}</div>
        </div>
        <div style="text-align:center">
          <div class="sig-label">${isAr ? 'اعتماد محاسب المحطة' : 'Station Accountant Approval'}</div>
          <div class="sig-box">${accountantName}</div>
        </div>
      </div>

      <!-- Print info footer -->
      <div class="print-footer">
        <div class="pf-left">
          <span><strong>${isAr ? 'طُبع بواسطة:' : 'Printed by:'}</strong> ${printerName}</span>
          <span><strong>${isAr ? 'التاريخ:' : 'Date:'}</strong> ${printDate}</span>
          <span><strong>${isAr ? 'الوقت:' : 'Time:'}</strong> ${printTime}</span>
        </div>
        <div style="color:#9ca3af">Station System — نظام المحطة</div>
      </div>
    </div>
    ${docUrl ? `<div style="page-break-before:always;max-width:720px;margin:0 auto;padding:28px 32px;direction:${dir}">
      <div style="border-bottom:2px solid #1C2B4A;padding-bottom:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
        <b style="font-size:15px;color:#1C2B4A">${isAr ? 'مرفق: ورقة الموازنة' : 'Attachment: balance sheet'}</b>
        <span style="font-size:11px;color:#6b7280">${stationName} · ${sale?.sale_date ?? '—'} · ${shiftLabel} · ${employeeName}</span>
      </div>
      ${docIsPdf
        ? `<p style="font-size:12px;color:#374151">${isAr ? 'ورقة الموازنة مرفقة بصيغة PDF.' : 'The balance sheet is attached as a PDF.'} <a href="${docUrl}" target="_blank">${isAr ? 'افتح الملف' : 'Open the file'}</a></p>`
        : `<img src="${docUrl}" alt="" style="width:100%;max-height:235mm;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px">`}
    </div>` : ''}
    </body></html>`

    return html
}

// طباعة يومية واحدة: إن كان لها صورة موازنة تُطبع معها في صفحة مرفقة بعد الكشف مباشرة
export function printSaleRecord({ sale, isAr, profile }) {
  if (!sale?.balance_doc_path) { openDocWindow(buildSaleRecordHtml({ sale, isAr, profile })); return }
  const w = window.open('', '_blank')   // تُفتح فوراً (قبل انتظار الرابط) حتى لا يحجبها المتصفح
  try { w?.document.write(`<p style="font-family:sans-serif;padding:24px;color:#555">${isAr ? 'جارٍ تجهيز الطباعة مع ورقة الموازنة...' : 'Preparing print with the balance sheet...'}</p>`) } catch { /* لا شي */ }
  ;(async () => {
    let docUrl = null
    try { docUrl = (await supabase.storage.from('sales-docs').createSignedUrl(sale.balance_doc_path, 1800)).data?.signedUrl ?? null } catch { /* نطبع بدون المرفق */ }
    const html = buildSaleRecordHtml({ sale, isAr, profile, docUrl, docIsPdf: /\.pdf$/i.test(sale.balance_doc_path) })
    if (w && !w.closed) { w.document.open(); w.document.write(html); w.document.close() } else openDocWindow(html)
  })()
}

// طباعة ورقة الموازنة وحدها (صورة/PDF) بترويسة اليومية — معاينة تناسب الجوال مع مشاركة وحفظ PDF
export function printBalanceSheet({ sale, isAr, profile }) {
  if (!sale?.balance_doc_path) return
  const w = window.open('', '_blank')
  try { w?.document.write(`<p style="font-family:sans-serif;padding:24px;color:#555">${isAr ? 'جارٍ تجهيز ورقة الموازنة...' : 'Preparing the balance sheet...'}</p>`) } catch { /* لا شي */ }
  ;(async () => {
    let url = null
    try { url = (await supabase.storage.from('sales-docs').createSignedUrl(sale.balance_doc_path, 1800)).data?.signedUrl ?? null } catch { /* بدون رابط */ }
    const st = sale?.station?.name_ar ?? sale?.station?.name_en ?? '—'
    const shift = { A: 'الوردية أ', B: 'الوردية ب', C: 'الوردية ج', D: 'الوردية د' }[sale?.shift] ?? sale?.shift ?? '—'
    const emp = sale?.employee_name || sale?.created_by_name || '—'
    const isPdf = /\.pdf$/i.test(sale.balance_doc_path)
    const html = docShell({
      title: `موازنة_${st}_${sale?.sale_date ?? ''}_${shift}`.replace(/\s+/g, '_'),
      body: docHeader({ title: 'ورقة الموازنة', infoLines: [`المحطة: <b>${esc(st)}</b>`, `التاريخ: <b>${esc(sale?.sale_date ?? '—')}</b> · ${esc(shift)}`, `الموظف: <b>${esc(emp)}</b>`] })
        + `<div class="body"><div class="sec">${!url ? '<p class="muted">تعذّر تحميل الورقة. أعد المحاولة.</p>'
          : isPdf ? `<p class="muted">ورقة الموازنة بصيغة PDF: <a href="${url}" target="_blank">افتح الملف</a> ثم اطبعه أو احفظه.</p>`
          : `<img src="${url}" alt="" style="display:block;width:100%;max-height:250mm;object-fit:contain;border:1px solid #dbe2ea;border-radius:8px;background:#fff">`}</div></div>`,
      footerLeft: `طُبع: ${esc(new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }))} · ${esc(profile?.full_name_ar ?? '')}`, footerRight: 'وثيقة داخلية',
      shareText: `ورقة الموازنة — ${st} · ${sale?.sale_date ?? ''} · ${shift}`,
    })
    if (w && !w.closed) { w.document.open(); w.document.write(html); w.document.close() } else openDocWindow(html)
  })()
}

// محطات الوكلاء: ليس لها يوميات إيرادات — تُستبعد من القوائم والإدخال (تُقرأ مرة واحدة بالجلسة)
let agentIdsCache = null
async function loadAgentIds() {
  if (agentIdsCache) return agentIdsCache
  const { data, error } = await supabase.from('stations').select('id, is_agent')
  agentIdsCache = new Set(error ? [] : (data ?? []).filter(x => x.is_agent).map(x => x.id))
  return agentIdsCache
}

/* ─── Sales Modal ───────────────────────────────────────── */
export function SalesModal({ sale, stations, onClose, onSaved, onOpenExisting }) {
  useEscapeKey(onClose)
  const { profile, isAccountant, isGeneralAdmin, isAreaSupervisor, isStationAdmin, allowedStationIds, allowCap, grantCap, workStations } = useAuth()
  const { settings } = useAppSettings()
  SHIFTS = salesShiftsFrom(null)
  // موظف يعمل بأكثر من محطة (محطة أساسية + إضافية حدّدها الأدمن): لازم يحدد محطة اليومية بنفسه
  const multi = !isGeneralAdmin && workStations?.length > 1
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [savedCashier]  = useState(() => localStorage.getItem(CASHIER_KEY)  ?? '')

  // مشرف المحطة/المنطقة يضيف يومية باسم موظف من نطاقه: تُنسب للموظف نفسه وتُسجَّل «أدخلها المشرف»
  const [agentIds, setAgentIds] = useState(() => new Set())
  useEffect(() => { loadAgentIds().then(setAgentIds) }, [])
  const canProxy = !sale && !isGeneralAdmin && (isStationAdmin || isAreaSupervisor)
  const [proxyEmps, setProxyEmps] = useState([])
  const [proxyId, setProxyId] = useState('')
  const [who, setWho] = useState('self')            // self = يوميتي | employee = لأحد موظفيّ
  const proxyOn = canProxy && who === 'employee'
  const proxyEmp = proxyEmps.find(e => e.id === proxyId) ?? null
  useEffect(() => {
    if (!canProxy) return
    let off = false
    ;(async () => {
      let q = supabase.from('users').select('id, full_name_ar, job_number, station_id, station:station_id(name_ar, name_en)')
        .eq('is_active', true).eq('role', 'station_employee').or('job_title.is.null,job_title.neq.cleaner').or('is_agent.is.null,is_agent.eq.false').order('full_name_ar')   // عمال النظافة والوكلاء لا علاقة لهم بالإيرادات
      const scope = isAreaSupervisor ? allowedStationIds : [profile.station_id]   // مشرف المحطة: موظفو محطته فقط
      if (scope) q = q.in('station_id', scope)
      const { data } = await q.limit(1000)
      const ag = await loadAgentIds()
      if (!off) setProxyEmps((data ?? []).filter(e => !ag.has(e.station_id)))
    })()
    return () => { off = true }
  }, [canProxy]) // eslint-disable-line react-hooks/exhaustive-deps

  // لا توجد مسودات: نمسح أي مسودة قديمة محفوظة بالمتصفح
  useEffect(() => { try { localStorage.removeItem(DRAFT_KEY) } catch { /* لا شي */ } }, [])

  // السجل مقفول إذا كان مؤكداً وليس الأدمن
  // ومن يرى إيرادات موظفي محطته (مسمى محاسب داخل المحطة) يعرض يومياتهم دون تعديل
  const viewStationCap = SALES_VIEW_CAPS.some(grantCap)
  const viewOnlyOther = !!sale && viewStationCap && !isGeneralAdmin && !isAccountant && !isStationAdmin && !isAreaSupervisor && sale.created_by !== profile?.id
  // التأكيد/إلغاؤه: للمحاسب، أو لمن مُنح صلاحية التأكيد/الإلغاء بمسماه (على يوميات محطاته)
  const canConfirmHere = (isAccountant && allowCap('sales_confirm')) || grantCap('sales_confirm_station')
  const confirmerOnly = viewOnlyOther && canConfirmHere && !sale?.is_confirmed   // يراجع ويؤكد دون تعديل بيانات اليومية
  const isLocked = (sale?.is_confirmed && !isGeneralAdmin) || viewOnlyOther

  const handlePrint = () => printSaleRecord({ sale, isAr, profile })
  const canPrintHere = !!sale && (isGeneralAdmin || ((isAccountant || viewStationCap) && allowCap('sales_print')) || (allowCap('sales_print') && sale.created_by === profile?.id && accountState(parseAccess(settings?.[PRINT_ACCESS_KEY]), profile?.id, todayStr()).allowed))

  // الوردية المتوقعة تُحسب مرة واحدة عند فتح السجل الجديد
  const cutoffMin = parseCutoff(settings?.[DAY_CUTOFF_KEY])
  const [initialSuggest] = useState(() => suggestShift(new Date(), cutoffMin))
  const [shiftConfirmed, setShiftConfirmed] = useState(false)

  const parseInitialRefs = raw => {
    if (!raw) return ['']
    try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : [raw] } catch { return [raw] }
  }

  const [form, setForm] = useState({
    sale_date:         sale?.sale_date ?? initialSuggest.date,
    shift:             sale?.shift ?? initialSuggest.shift,
    station_id:        sale?.station_id ?? (multi ? '' : (profile.station_id ?? '')),
    employee_name:     sale?.employee_name      ?? profile?.full_name_ar          ?? '',
    balance_doc_path:  sale?.balance_doc_path ?? null,
    cashier_ref:       sale ? (parseInitialRefs(sale.balance_ref)[0] ?? '') : savedCashier,
    balance_refs:      sale ? (parseInitialRefs(sale.balance_ref).slice(1).length > 0 ? parseInitialRefs(sale.balance_ref).slice(1) : ['']) : [''],
    cash_amount:       sale?.cash_amount ?? 0,
    mada_amount:       sale?.mada_amount ?? 0,
    mada_network_ref:  sale?.mada_network_ref ?? '',
    visa_amount:       sale?.visa_amount ?? 0,
    mastercard_amount: sale?.mastercard_amount ?? 0,
    other_amount:      sale?.other_amount ?? 0,
    other_type:        sale?.other_type ?? '',
    total_sales:       sale?.total_expected ?? '',
    is_confirmed:          sale?.is_confirmed       ?? false,
    accountant_notes:      sale?.accountant_notes   ?? '',
    deficit_acknowledged:  false,
  })
  const [saving, setSaving] = useState(false)
  const [confirmUnconfirm, setConfirmUnconfirm] = useState(false)
  // ورديات المحطة المختارة (3 أو 4): من إعداد المحطة نفسها، وإلا الافتراضي العام من الإعدادات
  const curStationId = (isGeneralAdmin || multi) ? form.station_id : profile.station_id
  const [stEnds, setStEnds] = useState({})
  useEffect(() => {
    if (!curStationId || stEnds[curStationId] !== undefined) return
    supabase.from('stations').select('shift_ends').eq('id', curStationId).maybeSingle()
      .then(({ data, error }) => setStEnds(m => ({ ...m, [curStationId]: !error && Array.isArray(data?.shift_ends) && validEnds(data.shift_ends) ? data.shift_ends : null })))
  }, [curStationId])
  const stationEnds = stEnds[curStationId] ?? null
  SHIFTS = salesShiftsFrom(stationEnds ? JSON.stringify({ ends: stationEnds }) : null)
  const shiftsKey = SHIFTS.map(sh => sh.value + sh.end).join()
  const suggested = useMemo(() => suggestShift(new Date(), cutoffMin), [shiftsKey, cutoffMin])
  const shiftTouched = useRef(false)
  useEffect(() => {
    if (sale) return
    setForm(f => (shiftTouched.current && SHIFTS.some(sh => sh.value === f.shift) ? f : { ...f, shift: suggested.shift }))
  }, [shiftsKey, suggested.shift])
  const [error,  setError]  = useState('')
  const [totalMissing, setTotalMissing] = useState(false)
  // الحقول التي تعتبر تغييراً حقيقياً للبيانات (لا تشمل is_confirmed والملاحظات فقط)
  const DATA_FIELDS = ['sale_date','shift','station_id','employee_name','cashier_ref','balance_refs','cash_amount','mada_amount','mada_network_ref','visa_amount','mastercard_amount','other_amount','other_type','total_sales','balance_doc_path']
  const set = (k, v) => { if (k === 'shift') shiftTouched.current = true; setForm(f => ({
    ...f, [k]: v,
    ...(DATA_FIELDS.includes(k) && sale ? { _dataChanged: true } : {}),
  })) }

  const totalActual = Math.round(Number(form.cash_amount)) + Math.round(Number(form.mada_amount)) +
    Math.round(Number(form.visa_amount)) + Math.round(Number(form.mastercard_amount)) + Math.round(Number(form.other_amount))
  const diff = totalActual - Math.round(Number(form.total_sales))

  function addBalanceRef()      { set('balance_refs', [...form.balance_refs, '']) }
  function removeBalanceRef(i)  { set('balance_refs', form.balance_refs.filter((_, idx) => idx !== i)) }
  function setBalanceRef(i, v)  { const refs = [...form.balance_refs]; refs[i] = v; set('balance_refs', refs) }
  function persistCashier()   { localStorage.setItem(CASHIER_KEY,  form.cashier_ref)   }

  // حالة اليوم: من سجّل يوميته بهذا التاريخ (للمشرف: هو وموظفوه) — لمنع الإضافة المكرّرة وإظهار الحالة فوراً
  const [dayRecs, setDayRecs] = useState({})
  const trackDay = !sale && !isGeneralAdmin && !isAccountant
  useEffect(() => {
    if (!trackDay) return
    let off = false
    ;(async () => {
      const ids = [profile.id, ...(canProxy ? proxyEmps.map(e => e.id) : [])]
      const { data } = await supabase.from('sales_records').select('id, created_by, employee_name, shift, is_confirmed')
        .eq('sale_date', form.sale_date).in('created_by', ids).limit(2000)
      if (off) return
      const nn = v => String(v || '').trim().toLowerCase()
      const m = {}
      for (const r of data ?? []) {
        if (r.created_by === profile.id && r.employee_name && nn(r.employee_name) !== nn(profile.full_name_ar)) continue   // قيود قديمة أدخلها المشرف لغيره بالاسم
        m[r.created_by] = r
      }
      setDayRecs(m)
    })()
    return () => { off = true }
  }, [trackDay, canProxy, form.sale_date, proxyEmps.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const ownerId = proxyOn ? proxyId : profile?.id
  const ownerRec = trackDay && ownerId ? dayRecs[ownerId] : null
  const takenCount = canProxy ? proxyEmps.filter(e => dayRecs[e.id]).length : 0

  // المحاسب (أو الأدمن) يلغي تأكيد اليومية لتعود قابلة لتعديل الموظف
  const canUnconfirm = !!sale?.is_confirmed && (isGeneralAdmin || (isAccountant && allowCap('sales_confirm')) || grantCap('sales_unconfirm_station'))
  async function doUnconfirm() {
    setConfirmUnconfirm(false); setSaving(true); setError('')
    const { data, error: upErr } = await supabase.from('sales_records').update({
      is_confirmed: false, confirmed_by: null, confirmed_by_name: null, confirmed_at: null,
      updated_by: profile.id, updated_by_name: profile.full_name_ar, updated_at: new Date().toISOString(),
    }).eq('id', sale.id).select('id')
    setSaving(false)
    if (upErr || !data?.length) { setError(upErr?.message || (isAr ? 'لم يُلغَ التأكيد: لا تملك صلاحية على هذه اليومية.' : 'Could not remove the confirmation: no permission for this record.')); return }
    onSaved(); onClose()
  }

  async function handleSave(e) {
    e.preventDefault()
    if (isLocked && !confirmerOnly) return
    // إجمالي المبيعات إلزامي الإدخال (اكتب 0 إن لم تكن هناك مبيعات)
    if (form.total_sales === '' || form.total_sales === null || form.total_sales === undefined) {
      setTotalMissing(true)
      setError(isAr ? 'أدخل إجمالي المبيعات قبل الحفظ' : 'Enter the total sales before saving')
      return
    }
    // اليوم الجديد ما يُفتح قبل وقت الفتح (إعداد، افتراضي 01:30): قبله تُدخل الوردية الأخيرة بتاريخ أمس فقط
    if (!sale && form.sale_date > businessDate(new Date(), cutoffMin)) {
      const t = fmtCutoff(cutoffMin)
      setError(isAr ? `اليوم الجديد يُفتح بعد الساعة ${t}. قبلها تُدخل ${lastShift().ar} بتاريخ أمس.` : `The new day opens after ${t}. Before that, enter ${lastShift().en} with yesterday's date.`)
      return
    }
    if (!sale && (form.shift !== suggested.shift || form.sale_date !== suggested.date) && !shiftConfirmed) {
      setError(isAr ? 'الوردية أو التاريخ يختلف عن المتوقع حسب الوقت الحالي — أكّد صحتهما بالتأشير على خانة التأكيد' : 'The shift or date differs from the one expected for the current time — tick the confirmation box')
      return
    }
    setSaving(true); setError('')

    if (proxyOn && !proxyEmp) {
      setError(isAr ? 'اختر الموظف الذي تُدخل اليومية باسمه' : 'Select the employee you are entering this record for')
      setSaving(false)
      return
    }
    const stationId = proxyOn ? proxyEmp.station_id : ((isGeneralAdmin || multi) ? form.station_id : profile.station_id)
    if (!stationId) {
      setError(isAr
        ? ((isGeneralAdmin || multi) ? 'اختر المحطة أولاً' : 'حسابك غير مرتبط بمحطة — تواصل مع الأدمن')
        : ((isGeneralAdmin || multi) ? 'Please select a station' : 'Your account is not linked to a station'))
      setSaving(false)
      return
    }

    const filteredRefs = [form.cashier_ref.trim(), ...form.balance_refs].filter(r => r.trim())
    const balanceRefStr = filteredRefs.length > 0 ? JSON.stringify(filteredRefs) : null

    const payload = {
      station_id:         stationId,
      sale_date:          form.sale_date,
      shift:              form.shift,
      employee_name:      proxyOn ? proxyEmp.full_name_ar : (form.employee_name.trim() || null),
      cash_amount:        Number(form.cash_amount),
      mada_amount:        Number(form.mada_amount),
      mada_network_ref:   form.mada_network_ref || null,
      visa_amount:        Number(form.visa_amount),
      mastercard_amount:  Number(form.mastercard_amount),
      other_amount:       Number(form.other_amount),
      other_type:         form.other_type || null,
      total_expected:     Number(form.total_sales),
      balance_ref:        balanceRefStr,
      ...(form.balance_doc_path !== (sale?.balance_doc_path ?? null) ? { balance_doc_path: form.balance_doc_path } : {}),
      bank_deposit_amount: 0,
      bank_deposit_ref:   null,
      // created_by يُضاف فقط عند الإنشاء الجديد، لا عند التعديل
      ...(!sale && (proxyOn
        ? { created_by: proxyEmp.id, created_by_name: proxyEmp.full_name_ar, entered_by: profile.id, entered_by_name: profile.full_name_ar }
        : { created_by: profile.id, created_by_name: profile.full_name_ar })),
    }

    if (canConfirmHere && form.is_confirmed) {
      payload.is_confirmed        = true
      payload.confirmed_by        = profile.id
      payload.confirmed_by_name   = profile.full_name_ar
      payload.confirmed_at        = new Date().toISOString()
      // Strip any previous deficit annotation to avoid duplicating on re-save
      const baseNotes = (form.accountant_notes || '').replace(/\n?\[عجز[^\]]*\]/g, '').trim()
      payload.accountant_notes = baseNotes || null
      if (diff < 0) {
        payload.accountant_notes = (baseNotes ? baseNotes + '\n' : '') +
          `[عجز ${fmt(Math.abs(diff))} ر.س — ${form.deficit_acknowledged ? 'تم إقرار العجز على الموظف ✓' : 'لم يتم إقرار العجز'}]`
      }
    }

    let res
    if (sale) {
      // لا نُحدّث updated_by عند التأكيد فقط (بدون تغيير بيانات)
      const confirmOnly = canConfirmHere && form.is_confirmed && !form._dataChanged
      res = await supabase.from('sales_records').update({
        ...payload,
        ...(confirmOnly ? {} : {
          updated_by:      profile.id,
          updated_by_name: profile.full_name_ar,
          updated_at:      new Date().toISOString(),
        }),
      }).eq('id', sale.id).select('id')
      // سياسة الأمان قد ترفض التعديل بصمت (0 صف) فيبدو للمستخدم أنه حُفظ وهو لم يُحفظ — نكشف ذلك بدل الإغلاق الكاذب
      if (!res.error && (!res.data || res.data.length === 0)) {
        res = { error: { message: 'SALES_UPDATE_BLOCKED' } }
      }
    } else {
      // التكرار = نفس الموظف بنفس المحطة والتاريخ والوردية (أكثر من موظف بنفس الوردية مسموح، والأدمن يدخل لعدة موظفين)
      const normName = v => String(v || '').trim().toLowerCase()
      const { data: same } = await supabase.from('sales_records').select('id, employee_name')
        .eq('station_id', stationId).eq('sale_date', form.sale_date).eq('shift', form.shift).eq('created_by', proxyOn ? proxyEmp.id : profile.id)
      if ((same ?? []).some(r => normName(r.employee_name) === normName(payload.employee_name))) {
        setError(isAr ? `الموظف ${payload.employee_name || ''} عنده يومية مسجلة لنفس المحطة والتاريخ والوردية. افتحها وعدّلها من القائمة بدل إضافة يومية ثانية.` : 'This employee already has a record for this station, date and shift. Edit it from the list.')
        setSaving(false)
        return
      }
      // يومية واحدة فقط لكل شخص في اليوم: الموظف، والمشرف ليوميته، وكل موظف يُدخلها المشرف باسمه
      // (الأدمن والمحاسب يدخلون لعدة موظفين بأسمائهم فلا يُقيَّدون)
      if (!isGeneralAdmin && !isAccountant) {
        const owner = proxyOn ? proxyEmp : profile
        const { data: sameDay } = await supabase.from('sales_records').select('id, shift, employee_name')
          .eq('created_by', owner.id).eq('sale_date', form.sale_date)
        const mine = (sameDay ?? []).filter(r => proxyOn || !r.employee_name || normName(r.employee_name) === normName(profile.full_name_ar))
        if (mine.length) {
          const sh = SHIFTS.find(x => x.value === mine[0].shift)
          setError(isAr ? `${proxyOn ? `الموظف ${proxyEmp.full_name_ar} لديه` : 'لديك'} يومية مسجلة بتاريخ ${form.sale_date}${sh ? ` (${sh.ar})` : ''}. لا يمكن إضافة يومية ثانية في نفس اليوم — افتح اليومية وعدّلها.` : `${proxyOn ? proxyEmp.full_name_ar + ' already has' : 'You already have'} a record for ${form.sale_date}. Only one daily record per day is allowed — edit it instead.`)
          setSaving(false)
          return
        }
      }
      res = await supabase.from('sales_records').insert(payload)
    }

    if (res.error) {
      const blocked = res.error.message === 'SALES_UPDATE_BLOCKED'
      const oneDay = /sales_one_per_day/.test(res.error.message || '')
      const dup = /duplicate key|unique constraint/i.test(res.error.message || '')
      const future = /sales_future_day/.test(res.error.message || '')
      setError(oneDay ? (isAr ? 'لديك يومية مسجلة بهذا التاريخ. لا يمكن إضافة يومية ثانية في نفس اليوم — افتحها من القائمة وعدّلها.' : 'You already have a record for this date. Only one daily record per day is allowed — edit it from the list.')
        : blocked ? (isAr ? 'لم يُحفظ التعديل: لا تملك صلاحية تعديل هذه اليومية الآن (غالباً لانتهاء يومها التشغيلي أو لأنها لموظف آخر). لا تُضف يومية جديدة بدلاً منها، وتواصل مع المحاسب أو الأدمن لتعديلها.' : 'The change was NOT saved: you cannot edit this record now (usually its business day has ended, or it belongs to someone else). Do not add a new one; ask the accountant or admin to edit it.')
        : future ? (isAr ? `اليوم الجديد لم يُفتح بعد (يُفتح ${fmtCutoff(cutoffMin)}). أدخل الوردية بتاريخ أمس.` : 'The new day is not open yet. Use yesterday\'s date.')
        : dup
        ? (isAr ? 'يوجد سجل مطابق لنفس الموظف والمحطة والتاريخ والوردية. افتحه وعدّله من القائمة، أو غيّر الوردية/التاريخ.' : 'A matching record already exists for this employee, station, date and shift. Edit it from the list, or change the shift/date.')
        : res.error.message)
    }
    else {
      // صورة قديمة استُبدلت أو أُزيلت: تُحذف من المخزن بعد نجاح الحفظ
      if (sale?.balance_doc_path && form.balance_doc_path !== sale.balance_doc_path) await supabase.storage.from('sales-docs').remove([sale.balance_doc_path])
      localStorage.removeItem(DRAFT_KEY); onSaved(); onClose()
    }
    setSaving(false)
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 focus:outline-none transition"

  // الموظف: من حساب المستخدم (للسجل الجديد) أو من السجل المحفوظ؛ الرقم الوظيفي بجانبه ومربوط بالطباعة
  const empName = sale ? (sale.employee_name || sale.created_by_name || '—') : (proxyOn ? (proxyEmp?.full_name_ar || '— اختر الموظف —') : (profile?.full_name_ar || '—'))
  const empJob  = sale
    ? ((!sale.employee_name || sale.employee_name === sale.created_by_name) ? (sale.created_by_user?.job_number ?? null) : null)
    : (proxyOn ? (proxyEmp?.job_number ?? null) : (profile?.job_number ?? null))
  const stationLabel = (() => {
    const id = proxyOn ? proxyEmp?.station_id : ((isGeneralAdmin || multi) ? form.station_id : (sale?.station_id ?? profile.station_id))
    // الموظف العادي لا تُحمَّل له قائمة المحطات — نرجع لمحطته من بروفايله (أو محطات عمله المتعددة)
    const st = stations.find(s => s.id === id) ?? workStations?.find(s => s.id === id) ?? sale?.station ?? (id && id === profile?.station_id ? profile.station : null)
    return st ? (isAr ? (st.name_ar || st.name_en) : (st.name_en || st.name_ar)) : null
  })()
  const shiftObj = SHIFTS.find(s => s.value === form.shift)
  const diffTone = diff === 0 ? { c: 'var(--success)', bg: 'var(--success-bg)', bd: 'rgba(22,163,74,0.35)', t: isAr ? 'مطابق ✓' : 'Matched ✓' }
    : diff > 0 ? { c: 'var(--info)', bg: 'var(--info-bg)', bd: 'rgba(37,99,235,0.35)', t: isAr ? 'زيادة' : 'Surplus' }
    : { c: 'var(--danger)', bg: 'var(--danger-bg)', bd: 'rgba(220,38,38,0.35)', t: isAr ? 'عجز' : 'Deficit' }
  const METHODS = [
    { key: 'cash_amount',       label: isAr ? 'نقداً' : 'Cash',  dot: '#16a34a' },
    { key: 'mada_amount',       label: isAr ? 'مدى' : 'Mada',    dot: '#2563eb', ref: 'mada_network_ref', refLabel: isAr ? 'الرقم المرجعي لمدى' : 'Mada reference' },
    { key: 'visa_amount',       label: 'Visa',                    dot: '#4f46e5' },
    { key: 'mastercard_amount', label: 'Mastercard',              dot: '#ea580c' },
    { key: 'other_amount',      label: isAr ? 'أخرى' : 'Other', dot: '#64748b', ref: 'other_type', refLabel: isAr ? 'نوع الدفع' : 'Payment type' },
  ]
  return (
    <div className={`fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4${isLocked ? ' print-modal-root' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <div className={`bg-gray-50 rounded-lg shadow-2xl w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden${isLocked ? ' print-modal-panel' : ''}`}>

        {/* ═ الترويسة ═ */}
        <div className="relative px-6 pt-5 pb-4 text-white shrink-0"
          style={{ background: isLocked ? '#3F4A52' : '#1E7A55' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
                            <h2 className="text-base font-bold">
                {sale ? (isAr ? 'سجل المبيعات' : 'Sales record') : (isAr ? 'إدخال مبيعات' : 'Sales entry')}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {stationLabel && <span className="text-[11px] font-semibold bg-white/15 rounded px-2 py-0.5">{stationLabel}</span>}
                <span className="text-[11px] font-semibold bg-white/15 rounded px-2 py-0.5" dir="ltr">{form.sale_date}</span>
                {shiftObj && <span className="text-[11px] font-semibold bg-white/15 rounded px-2 py-0.5">{isAr ? shiftObj.ar : shiftObj.en}</span>}
                {isLocked && <span className="text-[11px] font-bold bg-amber-400 text-amber-950 rounded px-2 py-0.5">{isAr ? 'مؤكد ومقفول' : 'Confirmed · locked'}</span>}
              </div>
            </div>
            <button onClick={onClose} aria-label="close"
              className="w-8 h-8 rounded-md bg-white/15 hover:bg-white/25 text-white text-xl leading-none grid place-items-center no-print">×</button>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">

          {isLocked && (
            <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-lg px-4 py-2.5">
              <p className="text-xs font-semibold text-gray-600">
                {isAr ? 'هذا السجل مؤكد ومقفول — لا يمكن التعديل' : 'This record is confirmed and locked — editing is disabled'}
              </p>
            </div>
          )}

          <fieldset disabled={isLocked} className="space-y-3.5 disabled:opacity-70 min-w-0">

            {canProxy && (
              <div className="space-y-2.5">
                <p className="text-[11px] font-bold text-gray-500">{isAr ? 'لمن هذه اليومية؟' : 'Who is this record for?'}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'self', t: isAr ? 'يوميتي أنا' : 'My own record', d: isAr ? 'تُسجَّل باسمك' : 'Recorded under you' },
                    { id: 'employee', t: isAr ? 'لأحد موظفيّ' : 'For one of my staff', d: isAr ? 'تُنسب للموظف وتظهر «أدخلها المشرف»' : 'Belongs to the employee, marked as entered by you' },
                  ].map(o => (
                    <button key={o.id} type="button" onClick={() => { setWho(o.id); setProxyId('') }}
                      className={`text-start rounded-lg border-2 px-3 py-2.5 transition ${who === o.id ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <p className={`text-sm font-bold ${who === o.id ? 'text-emerald-800' : 'text-gray-800'}`}>{o.t}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{o.d}</p>
                    </button>
                  ))}
                </div>
                {who === 'employee' && (
                  <div>
                    <SearchSelect required className={inputCls} isAr={isAr} value={proxyId} onChange={setProxyId}
                      placeholder={isAr ? '— اختر الموظف —' : '— Select employee —'}
                      options={proxyEmps.map(e => ({
                        value: e.id, disabled: !!dayRecs[e.id],
                        label: `${e.full_name_ar}${e.job_number ? ` (${e.job_number})` : ''} — ${isAr ? e.station?.name_ar : (e.station?.name_en || e.station?.name_ar)}${dayRecs[e.id] ? (isAr ? ' · ✓ سجّل يوميته' : ' · ✓ already recorded') : ''}`,
                      }))} />
                    <p className="text-[11px] text-gray-500 mt-1">{isAr ? `${proxyEmps.length} موظف في نطاقك — ${takenCount} سجّلوا يوميتهم بتاريخ ${form.sale_date}، و${proxyEmps.length - takenCount} متاحون.` : `${proxyEmps.length} staff — ${takenCount} already recorded on ${form.sale_date}, ${proxyEmps.length - takenCount} available.`}</p>
                  </div>
                )}
              </div>
            )}

            {trackDay && (
              <div>
                {ownerRec ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3">
                    <p className="text-xs font-bold text-amber-900">{isAr ? `${proxyOn ? 'هذا الموظف' : 'أنت'} ${proxyOn ? 'لديه' : 'لديك'} يومية مسجلة بتاريخ ${form.sale_date}${SHIFTS.find(x => x.value === ownerRec.shift) ? ` (${SHIFTS.find(x => x.value === ownerRec.shift).ar})` : ''}${ownerRec.is_confirmed ? ' — مؤكدة' : ''}.` : 'A record already exists for this date.'}</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">{isAr ? 'لا يمكن إضافة يومية ثانية في نفس اليوم. افتحها وعدّلها إن لزم.' : 'A second record on the same day is not allowed. Open it to edit.'}</p>
                    {onOpenExisting && <button type="button" onClick={() => onOpenExisting(ownerRec.id)} className="mt-2 text-xs font-bold bg-amber-600 text-white rounded-lg px-3 py-1.5">{isAr ? 'فتح اليومية للتعديل' : 'Open the record'}</button>}
                  </div>
                ) : (ownerId ? (
                  <p className="text-[11px] font-semibold text-emerald-700">{isAr ? `✓ لا توجد يومية ${proxyOn ? 'لهذا الموظف' : 'لك'} بتاريخ ${form.sale_date} — يمكنك الإضافة.` : `✓ No record for ${form.sale_date} — you can add one.`}</p>
                ) : null)}
              </div>
            )}

            {/* بطاقة الموظف — من الحساب */}
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-gray-100 text-gray-600 grid place-items-center text-base font-bold shrink-0">
                {(empName || '؟').trim().charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-400">{proxyOn ? (isAr ? 'الموظف المختار' : 'Selected employee') : (isAr ? 'الموظف (من الحساب)' : 'Employee (from account)')}{sale?.entered_by_name ? (isAr ? ` · أدخلها المشرف ${sale.entered_by_name}` : ` · entered by ${sale.entered_by_name}`) : ''}</p>
                <p className="text-sm font-bold text-gray-900 truncate" dir="auto">{empName}</p>
              </div>
              <div className="text-end shrink-0">
                <p className="text-[11px] text-gray-400">{isAr ? 'الرقم الوظيفي' : 'Job no.'}</p>
                <p className="text-sm font-bold font-mono text-gray-900" dir="ltr">{empJob ? `#${empJob}` : '—'}</p>
              </div>
            </div>

            {/* بيانات السجل */}
            <SectionCard n={1} title={isAr ? 'بيانات السجل' : 'Record details'}>
              <div className="space-y-3">
                {(isGeneralAdmin || multi) && !proxyOn && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">{isAr ? 'المحطة *' : 'Station *'}</label>
                    <SelectField required className={inputCls} value={form.station_id} onChange={e => set('station_id', e.target.value)}>
                      <option value="">{isAr ? '— اختر المحطة —' : '— Select Station —'}</option>
                      {(multi ? workStations : stations).filter(s => !agentIds.has(s.id)).map(s => <option key={s.id} value={s.id}>{isAr ? s.name_ar : s.name_en}</option>)}
                    </SelectField>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">{isAr ? 'التاريخ' : 'Date'}</label>
                    <DatePicker className={inputCls} isAr={isAr} value={form.sale_date} onChange={v => set('sale_date', v)} max={sale ? undefined : businessDate(new Date(), cutoffMin)} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">{isAr ? 'الوردية' : 'Shift'}</label>
                    <SelectField className={inputCls} value={form.shift} onChange={e => set('shift', e.target.value)}>
                      {SHIFTS.map(s => <option key={s.value} value={s.value}>{isAr ? s.ar : s.en} ({s.range})</option>)}
                    </SelectField>
                  </div>
                </div>
                <ShiftBoard stationId={proxyOn ? proxyEmp?.station_id : ((isGeneralAdmin || multi) ? form.station_id : profile.station_id)} date={form.sale_date} shift={form.shift}
                  onPick={v => set('shift', v)} saleId={sale?.id} employeeName={form.employee_name} profileId={sale?.created_by ?? (proxyOn ? proxyEmp?.id : profile?.id)} isAr={isAr} />
                {!sale && (() => {
                  const sug = SHIFTS.find(x => x.value === suggested.shift)
                  const mismatch = form.shift !== suggested.shift || form.sale_date !== suggested.date
                  const cur = SHIFTS.find(x => x.value === form.shift)
                  const hhmm = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div className={`rounded-lg border px-3.5 py-3 text-[12.5px] leading-relaxed ${mismatch ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                      <p className="font-bold mb-0.5">{mismatch ? (isAr ? 'تنبيه: الوردية تختلف عن المتوقع' : 'Warning: shift differs from the expected one') : (isAr ? 'تأكيد الوردية' : 'Confirm the shift')}</p>
                      <p>
                        {isAr
                          ? `الوقت الآن ${hhmm} — الوردية المتوقعة: ${sug.ar} (${sug.range})${suggested.closing ? ' · وقت إقفال الوردية' : ''}${suggested.yesterday ? ` · وتاريخ السجل ${suggested.date} (الوردية تنتهي بعد منتصف الليل)` : ''}.`
                          : `Time now ${hhmm} — expected shift: ${sug.en} (${sug.range})${suggested.closing ? ' · shift closing time' : ''}${suggested.yesterday ? ` · record date ${suggested.date} (shift ends after midnight)` : ''}.`}
                      </p>
                      {mismatch ? (
                        <>
                          <p className="mt-1">{isAr ? `اخترت ${cur?.ar} بتاريخ ${form.sale_date}.` : `You picked ${cur?.en} on ${form.sale_date}.`}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-3">
                            <button type="button" onClick={() => { set('shift', suggested.shift); set('sale_date', suggested.date); setShiftConfirmed(false) }}
                              className="text-xs font-bold bg-white border border-red-300 text-red-700 rounded-lg px-3 py-1 hover:bg-red-100">{isAr ? 'استخدام المتوقعة' : 'Use expected'}</button>
                            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                              <input type="checkbox" className="rounded accent-red-600" checked={shiftConfirmed} onChange={e => setShiftConfirmed(e.target.checked)} />
                              {isAr ? 'أؤكد أن الوردية والتاريخ صحيحان' : 'I confirm the shift and date are correct'}
                            </label>
                          </div>
                        </>
                      ) : (
                        <p className="mt-0.5 font-semibold">{isAr ? 'تأكد أنها وردتك قبل الحفظ.' : 'Make sure this is your shift before saving.'}</p>
                      )}
                    </div>
                  )
                })()}
              </div>
            </SectionCard>

            {/* المراجع */}
            <SectionCard n={2} title={isAr ? 'المراجع' : 'References'}>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">{isAr ? 'رقم الصرافة' : 'Cashier number'}</label>
                  <div className="flex gap-2">
                    <input className={inputCls + ' font-mono'} dir="ltr" value={form.cashier_ref}
                      onChange={e => set('cashier_ref', toLatinDigits(e.target.value))}
                      placeholder={isAr ? 'أدخل رقم الصرافة' : 'Enter cashier number'} />
                    <button type="button" onClick={persistCashier}
                      className="shrink-0 px-3.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100 transition">
                      {isAr ? 'تثبيت' : 'Pin'}
                    </button>
                  </div>
                  {savedCashier && savedCashier !== form.cashier_ref && (
                    <button type="button" onClick={() => set('cashier_ref', savedCashier)} className="text-xs text-amber-700 mt-1.5 underline">
                      ↩ {isAr ? `استخدام المثبت: ${savedCashier}` : `Use pinned: ${savedCashier}`}
                    </button>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-gray-500">
                      {isAr ? 'رقم الموازنة' : 'Budget reference'}
                      <span className="ms-1.5 text-gray-400 font-normal">({isAr ? 'اختياري' : 'optional'})</span>
                    </label>
                    <button type="button" onClick={addBalanceRef} className="text-xs text-emerald-700 font-bold hover:underline">+ {isAr ? 'إضافة رقم' : 'Add another'}</button>
                  </div>
                  {form.balance_refs.map((ref, i) => (
                    <div key={i} className="flex gap-2 mb-2 last:mb-0">
                      <input className={inputCls + ' font-mono'} dir="ltr" value={ref}
                        onChange={e => setBalanceRef(i, toLatinDigits(e.target.value))}
                        placeholder={isAr ? 'أدخل رقم الموازنة أو اتركه فارغاً' : 'Enter budget ref or leave blank'} />
                      {form.balance_refs.length > 1 && (
                        <button type="button" onClick={() => removeBalanceRef(i)} className="shrink-0 text-red-400 hover:text-red-600 px-2 text-lg">✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <BalanceDocScan path={form.balance_doc_path} onChange={v => set('balance_doc_path', v)} isAr={isAr} />
              </div>
            </SectionCard>

            {/* طرق الدفع */}
            <SectionCard n={3} title={isAr ? 'طرق الدفع' : 'Payment methods'}>
              <div className="space-y-2.5">
                {METHODS.map(m => (
                  <div key={m.key}>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-2 w-28 shrink-0 text-[13px] font-semibold text-gray-700">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.dot }} />{m.label}
                      </span>
                      <div className="relative flex-1">
                        <input type="text" inputMode="numeric" lang="en" dir="ltr"
                          className={inputCls + ' text-end font-mono font-bold pe-12'}
                          value={form[m.key]}
                          onChange={e => set(m.key, Math.round(Number(cleanNumber(e.target.value))) || 0)}
                          onFocus={e => e.target.select()} />
                        <span className="absolute inset-y-0 end-3 flex items-center text-[11px] font-semibold text-gray-400 pointer-events-none">{isAr ? 'ر.س' : 'SAR'}</span>
                      </div>
                    </div>
                    {m.ref && Number(form[m.key]) > 0 && (
                      <div className="mt-1.5 ms-[7.75rem]">
                        <input placeholder={m.refLabel} dir="ltr"
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:ring-2 focus:ring-emerald-500/40 focus:outline-none font-mono"
                          value={form[m.ref]} onChange={e => set(m.ref, toLatinDigits(e.target.value))} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* الإجماليات */}
            <SectionCard n={4} title={isAr ? 'الإجماليات' : 'Totals'} tone="bg-white border-emerald-200">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[13px] font-bold text-gray-700">{isAr ? 'إجمالي المبيعات' : 'Total sales'}</span>
                <div className="relative w-40">
                  <input type="text" inputMode="numeric" lang="en" dir="ltr"
                    className={inputCls + ' text-end font-mono font-bold pe-12' + (totalMissing && form.total_sales === '' ? ' !border-red-400 !bg-red-50' : '')}
                    value={form.total_sales} placeholder="0"
                    onChange={e => { const c = cleanNumber(e.target.value); set('total_sales', String(c).trim() === '' ? '' : (Math.round(Number(c)) || 0)) }}
                    onFocus={e => e.target.select()} />
                  <span className="absolute inset-y-0 end-3 flex items-center text-[11px] font-semibold text-gray-400 pointer-events-none">{isAr ? 'ر.س' : 'SAR'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-semibold text-gray-400">{isAr ? 'الإجمالي الفعلي' : 'Actual total'}</p>
                  <p className="text-lg font-bold font-mono text-emerald-700 leading-tight" dir="ltr">{fmt(totalActual)} <span className="text-[10px] font-semibold text-gray-400">{isAr ? 'ر.س' : 'SAR'}</span></p>
                </div>
                <div className="rounded-lg px-3 py-2.5 text-center border" style={{ background: diffTone.bg, borderColor: diffTone.bd }}>
                  <p className="text-[10px] font-bold" style={{ color: diffTone.c }}>{isAr ? 'الفرق' : 'Difference'} · {diffTone.t}</p>
                  <p className="text-lg font-bold font-mono leading-tight" style={{ color: diffTone.c }} dir="ltr">
                    {diff > 0 ? '+' : ''}{fmt(diff)} <span className="text-[10px] font-semibold opacity-70">{isAr ? 'ر.س' : 'SAR'}</span>
                  </p>
                </div>
              </div>
            </SectionCard>

          </fieldset>
          <fieldset disabled={!!sale?.is_confirmed && !isGeneralAdmin} className="space-y-3.5 disabled:opacity-70 min-w-0 mt-3.5">
            {/* تأكيد المحاسب (أو مؤكّد المحطة بصلاحية مسمى) */}
            {sale && ((isAccountant && (allowCap('sales_confirm') || allowCap('sales_deficit_ack') || allowCap('sales_notes'))) || (!isAccountant && grantCap('sales_confirm_station'))) && (
              <SectionCard title={isAr ? 'تأكيد المحاسب' : 'Accountant confirmation'} tone="bg-amber-50/70 border-amber-200">
                <div className="space-y-3">
                  {isAccountant && diff < 0 && allowCap('sales_deficit_ack') && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-bold text-red-700">⚠ {isAr ? 'يوجد عجز بمقدار' : 'Deficit of'} {fmt(Math.abs(diff))} {isAr ? 'ر.س' : 'SAR'}</p>
                      <p className="text-xs text-red-600">
                        {isAr
                          ? `الموظف: ${sale.employee_name || sale.created_by_name || '—'} · الرقم الوظيفي: ${sale.created_by_user?.job_number || '—'}`
                          : `Employee: ${sale.employee_name || sale.created_by_name || '—'} · Job No: ${sale.created_by_user?.job_number || '—'}`}
                      </p>
                      <label className="flex items-center gap-2 text-xs text-red-700 cursor-pointer font-semibold">
                        <input type="checkbox" className="rounded accent-red-600" checked={form.deficit_acknowledged ?? false}
                          onChange={e => set('deficit_acknowledged', e.target.checked)} />
                        {isAr ? 'أُقر بتحميل العجز على الموظف وأعتمده بصفتي محاسب المحطة' : 'I acknowledge the deficit is charged to the employee and approve as station accountant'}
                      </label>
                    </div>
                  )}
                  {canConfirmHere && (
                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                      <input type="checkbox" className="rounded accent-emerald-700" checked={form.is_confirmed} onChange={e => set('is_confirmed', e.target.checked)} />
                      {isAr ? 'تأكيد وإغلاق السجل' : 'Confirm and close this record'}
                    </label>
                  )}
                  {isAccountant && allowCap('sales_notes') && <textarea rows={2} placeholder={isAr ? 'ملاحظات...' : 'Notes...'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none bg-white focus:ring-2 focus:ring-emerald-500/40 focus:outline-none"
                    value={form.accountant_notes} onChange={e => set('accountant_notes', e.target.value)} />}
                </div>
              </SectionCard>
            )}
          </fieldset>

          {canUnconfirm && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-amber-900 leading-relaxed flex-1 min-w-[200px]">{isAr ? 'هذه اليومية مؤكدة. بعد إلغاء التأكيد يستطيع الموظف تعديلها من جديد، ثم تؤكدها أنت بعد المراجعة.' : 'This record is confirmed. After removing the confirmation the employee can edit it again, then you confirm after review.'}</p>
              <button type="button" disabled={saving} onClick={() => setConfirmUnconfirm(true)} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shrink-0">{isAr ? 'إلغاء التأكيد' : 'Remove confirmation'}</button>
            </div>
          )}

          {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg p-2.5 border border-red-100">⚠ {error}</p>}
        </div>

        {/* ═ الذيل: أزرار ثابتة ═ */}
        <div className="shrink-0 px-5 py-3.5 bg-white border-t border-gray-200 flex flex-wrap items-center gap-2.5" style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}>
          {(!isLocked || confirmerOnly) && (
            <button type="submit" disabled={saving || !!ownerRec || (proxyOn && !proxyId)}
              className="flex-1 bg-green-700 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-green-800 transition-colors ">
              {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'حفظ السجل' : 'Save record')}
            </button>
          )}
          {canPrintHere && (
            <button type="button" onClick={handlePrint}
              className="flex-1 min-w-[140px] bg-nwbus-primary text-white py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
              {isAr ? (sale?.balance_doc_path ? 'طباعة اليومية والموازنة' : 'طباعة اليومية') : (sale?.balance_doc_path ? 'Print daily + balance' : 'Print daily')}
            </button>
          )}
          {canPrintHere && sale?.balance_doc_path && (
            <button type="button" onClick={() => printBalanceSheet({ sale, isAr, profile })}
              className="flex-1 min-w-[140px] border border-nwbus-primary text-nwbus-primary py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
              {isAr ? 'طباعة الموازنة' : 'Print balance'}
            </button>
          )}
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white hover:bg-gray-50">
            {isLocked ? (isAr ? 'إغلاق' : 'Close') : (isAr ? 'إلغاء' : 'Cancel')}
          </button>
        </div>
        </form>
      </div>
      {confirmUnconfirm && (
        <ConfirmDialog danger={false} message={isAr ? 'إلغاء تأكيد هذه اليومية ليتمكن الموظف من تعديلها؟' : 'Remove the confirmation so the employee can edit this record?'}
          confirmLabel={isAr ? 'إلغاء التأكيد' : 'Remove confirmation'} cancelLabel={isAr ? 'تراجع' : 'Back'}
          onConfirm={doUnconfirm} onCancel={() => setConfirmUnconfirm(false)} />
      )}
    </div>
  )
}

/* ─── Audit History Modal ───────────────────────────────── */
function AuditModal({ sale, onClose }) {
  useEscapeKey(onClose)
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const events = []
  if (sale.created_at)   events.push({ label: isAr ? 'إضافة' : 'Created',   by: sale.created_by_name,   at: sale.created_at,   color: 'bg-green-100 text-green-700' })
  if (sale.updated_at)   events.push({ label: isAr ? 'تعديل' : 'Updated',   by: sale.updated_by_name,   at: sale.updated_at,   color: 'bg-blue-100 text-blue-700' })
  if (sale.confirmed_at) events.push({ label: isAr ? 'تأكيد' : 'Confirmed', by: sale.confirmed_by_name, at: sale.confirmed_at, color: 'bg-yellow-100 text-yellow-700' })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-sm">{isAr ? 'سجل التعديلات' : 'Audit History'}</h3>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {events.map((ev, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className={`text-xs rounded-full px-2.5 py-1 font-bold shrink-0 ${ev.color}`}>{ev.label}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{ev.by ?? '—'}</p>
                <p className="text-xs text-gray-400">{fmtD(ev.at)} · {fmtT(ev.at)}</p>
              </div>
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-gray-400">{isAr ? 'لا توجد سجلات' : 'No records'}</p>}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ────────────────────────────────────────── */
export default function SalesPage() {
  const { profile, isAccountant, isStationAdmin, isGeneralAdmin, isEmployee, isAreaSupervisor, allowedStationIds, allowCap, grantCap, workStations } = useAuth()
  const viewStation = SALES_VIEW_CAPS.some(grantCap)   // مسمى يرى إيرادات موظفي محطاته (عرض / تأكيد / إلغاء تأكيد)
  const isViewOnlyRow = r => viewStation && !isGeneralAdmin && !isAccountant && !isStationAdmin && !isAreaSupervisor && r.created_by !== profile?.id
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const today = todayStr()
  const initialFilterStation = localStorage.getItem('sales_filter_station') ?? ''
  const initialSalesCacheKey = `sales_${today}_${initialFilterStation}_${profile?.id}`

  const [records,     setRecords]     = useState(() => getCached(initialSalesCacheKey) ?? [])
  const [stations,    setStations]    = useState([])
  const [loading,     setLoading]     = useState(() => !getCached(initialSalesCacheKey))
  const [modal,       setModal]       = useState(null)
  const [audit,       setAudit]       = useState(null)
  const [deleting,    setDeleting]    = useState(null)
  const [confirmDel,  setConfirmDel]  = useState(null)
  const [filterDate,    setFilterDate]    = useState(today)
  const [filterStation, setFilterStation] = useState(initialFilterStation)
  const [pinnedStations, setPinnedStations] = useState(() => { try { return JSON.parse(localStorage.getItem('sales_pinned_stations') ?? '[]') } catch { return [] } })
  const [showPinModal, setShowPinModal] = useState(false)

  const setStation = v => { setFilterStation(v); localStorage.setItem('sales_filter_station', v) }
  const stationOrder = [...stations.filter(x => pinnedStations.includes(x.id)), ...stations.filter(x => !pinnedStations.includes(x.id))]
  const stepStation = dir => {
    if (!stationOrder.length) return
    const i = stationOrder.findIndex(x => x.id === filterStation)
    const n = i < 0 ? (dir > 0 ? 0 : stationOrder.length - 1) : (i + dir + stationOrder.length) % stationOrder.length
    setStation(stationOrder[n].id)
  }
  const togglePin = id => {
    const next = pinnedStations.includes(id) ? pinnedStations.filter(x => x !== id) : [...pinnedStations, id]
    setPinnedStations(next)
    localStorage.setItem('sales_pinned_stations', JSON.stringify(next))
  }
  const [openDays,      setOpenDays]      = useState({})   // { 'YYYY-MM-DD': true }

  function toggleDay(d) { setOpenDays(p => ({ ...p, [d]: !p[d] })) }

  // افتح اليوم الوحيد تلقائياً عند تحميل السجلات (لا يعمل داخل render)
  useEffect(() => {
    if (records.length === 0) return
    const dates = [...new Set(records.map(r => r.sale_date))].sort((a, b) => b.localeCompare(a))
    if (dates.length === 1) {
      setOpenDays(prev => prev[dates[0]] === undefined ? { [dates[0]]: true } : prev)
    }
  }, [records])

  useEffect(() => {
    if (isGeneralAdmin) {
      supabase.from('stations').select('id,name_ar,name_en').eq('is_active', true).order('name_ar')
        .then(async ({ data }) => { const ag = await loadAgentIds(); setStations((data ?? []).filter(s => !isRestStation(s) && !ag.has(s.id))) })
    } else if ((isAreaSupervisor || isStationAdmin) && allowedStationIds?.length) {
      supabase.from('stations').select('id,name_ar,name_en').in('id', allowedStationIds).eq('is_active', true).order('name_ar')
        .then(async ({ data }) => { const ag = await loadAgentIds(); setStations((data ?? []).filter(s => !isRestStation(s) && !ag.has(s.id))) })
    } else if ((isAccountant || viewStation) && workStations?.length > 1) {
      loadAgentIds().then(ag => setStations(workStations.filter(s => !isRestStation(s) && !ag.has(s.id)).map(s => ({ id: s.id, name_ar: s.name_ar, name_en: s.name_en }))))
    }
  }, [isGeneralAdmin, isAreaSupervisor, isStationAdmin, allowedStationIds, isAccountant, viewStation, workStations])

  async function handleDelete(id) {
    setConfirmDel(id)
  }
  async function doDelete(id) {
    setConfirmDel(null)
    setDeleting(id)
    const { error } = await supabase.from('sales_records').delete().eq('id', id)
    setDeleting(null)
    if (error) { alert(isAr ? 'فشل الحذف: ' + error.message : 'Delete failed: ' + error.message); return }
    fetchRecords()
  }

  const fetchRecords = useCallback(async () => {
    const cacheKey = `sales_${filterDate}_${filterStation}_${profile?.id}`
    const cached = getCached(cacheKey)
    if (cached) { setRecords(cached); setLoading(false) } else { setLoading(true) }
    let q = supabase
      .from('sales_records')
      .select('*, station:station_id(name_ar, name_en)')
      .eq('sale_date', filterDate)
      .order('sale_date', { ascending: false })
      .order('shift')

    // ── Privacy filters ──────────────────────────────────
    if (isGeneralAdmin) {
      if (filterStation) q = q.eq('station_id', filterStation)
    } else if (isStationAdmin && !isAreaSupervisor) {
      q = q.eq('station_id', profile.station_id)   // مشرف المحطة يرى يوميات محطته فقط
    } else if (isAreaSupervisor && allowedStationIds?.length) {
      const ids = filterStation ? [filterStation] : allowedStationIds
      q = q.in('station_id', ids)
    } else if (isStationAdmin || isAccountant || viewStation) {
      const wsIds = workStations?.map(x => x.id) ?? []
      q = wsIds.length > 1 ? (wsIds.includes(filterStation) ? q.eq('station_id', filterStation) : q.in('station_id', wsIds)) : q.eq('station_id', profile.station_id)
    } else {
      q = q.eq('created_by', profile.id)
    }

    const { data, error } = await q
    if (error) { setLoading(false); return }

    // جلب الرقم الوظيفي للموظفين بشكل منفصل
    const agentIds = await loadAgentIds()
    const rows = (data ?? []).filter(r => !agentIds.has(r.station_id))   // محطات الوكلاء بلا يوميات
    const creatorIds = [...new Set(rows.map(r => r.created_by).filter(Boolean))]
    let jobMap = {}
    if (creatorIds.length > 0) {
      const { data: users } = await supabase
        .from('users').select('id, job_number').in('id', creatorIds)
      if (users) users.forEach(u => { jobMap[u.id] = u.job_number })
    }
    const finalRows = rows.map(r => ({ ...r, created_by_user: { job_number: jobMap[r.created_by] ?? null } }))
    if (finalRows.length) setCached(cacheKey, finalRows)
    setRecords(finalRows)
    setLoading(false)
  }, [filterDate, filterStation, profile?.id, profile?.station_id, isEmployee, isStationAdmin, isAccountant, viewStation, isGeneralAdmin, isAreaSupervisor, allowedStationIds, workStations])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // Real-time sync للمبيعات
  useEffect(() => {
    const channel = supabase.channel('sales_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_records' }, () => fetchRecords())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchRecords])

  const totalActualSum   = records.reduce((s, r) => s + Number(r.total_actual   ?? 0), 0)
  const totalExpectedSum = records.reduce((s, r) => s + Number(r.total_expected  ?? 0), 0)
  const confirmed        = records.filter(r => r.is_confirmed).length

  // تنزيل الجدول اليومي (Excel محاسبي) — للأدمن العام، وللمحاسب فقط إذا فعّل له الأدمن الصلاحية
  const canExportDaily = isGeneralAdmin || (isAccountant && grantCap('sales_export_daily'))
  // طباعة اليومية (الكشف الكامل لليوم) — للأدمن، وللمحاسب (كل محطاته)
  const canPrintDaily = isGeneralAdmin || ((isAccountant || viewStation) && allowCap('sales_print'))   // المحاسب: كشف محطاته
  // صلاحية طباعة يوميات الموظفين: إعداد عام يديره الأدمن (وضع عام + استثناءات حسابات، مستمر أو مؤقت)
  const { settings, saveSetting } = useAppSettings()
  SHIFTS = salesShiftsFrom(null)
  const printAccess = parseAccess(settings?.[PRINT_ACCESS_KEY])
  const [printAccessOpen, setPrintAccessOpen] = useState(false)
  const canPrintRecord = r => isGeneralAdmin || ((isAccountant || viewStation) && allowCap('sales_print')) || (r.created_by === profile?.id && allowCap('sales_print') && accountState(printAccess, profile?.id, todayStr()).allowed)
  async function printDaily() {
    if (!records.length) return
    const sName = r => (isAr ? (r.station?.name_ar || r.station?.name_en) : (r.station?.name_en || r.station?.name_ar)) || '—'
    const oth = r => Number(r.visa_amount ?? 0) + Number(r.mastercard_amount ?? 0) + Number(r.other_amount ?? 0)
    const sum = (list, f) => list.reduce((a, r) => a + Number(f(r) ?? 0), 0)
    const shiftLbl = v => SHIFTS.find(x => x.value === v)?.ar ?? ({ A: 'الوردية أ', B: 'الوردية ب', C: 'الوردية ج', D: 'الوردية د' }[v] ?? v)
    const sgn = n => (n > 0 ? '+' : '') + fmt(n)
    const stIds = [...new Set(records.map(r => r.station_id))]
    const groups = stIds.map(id => ({ name: sName(records.find(r => r.station_id === id)), list: records.filter(r => r.station_id === id).sort((a, b) => String(a.shift).localeCompare(String(b.shift))) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    const tA = sum(records, r => r.total_actual), tE = sum(records, r => r.total_expected), tD = tA - tE
    const dayLabel = new Date(filterDate + 'T00:00:00').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const tbl = list => `<table class="t"><thead><tr><th>الوردية</th><th>الموظف</th><th>نقد</th><th>مدى</th><th>بطاقات وأخرى</th><th>المحصَّل</th><th>إجمالي المبيعات</th><th>الفرق</th><th>الحالة</th></tr></thead><tbody>${list.map(r => {
      const d = Number(r.total_actual ?? 0) - Number(r.total_expected ?? 0)
      return `<tr><td>${esc(shiftLbl(r.shift))}</td><td class="l">${esc(r.employee_name || r.created_by_name || '—')}${r.created_by_user?.job_number ? ` <span class="muted">#${esc(r.created_by_user.job_number)}</span>` : ''}</td><td>${fmt(r.cash_amount)}</td><td>${fmt(r.mada_amount)}</td><td>${fmt(oth(r))}</td><td><b>${fmt(r.total_actual)}</b></td><td>${fmt(r.total_expected)}</td><td style="color:${d < 0 ? '#b91c1c' : d > 0 ? '#1d4ed8' : '#64748b'};direction:ltr"><b>${d === 0 ? '0' : sgn(d)}</b></td><td><span class="chip" style="background:${r.is_confirmed ? '#dcfce7' : '#fef3c7'};color:${r.is_confirmed ? '#15803d' : '#b45309'}">${r.is_confirmed ? 'مؤكد' : 'قيد المراجعة'}</span></td></tr>`
    }).join('')}<tr class="tot"><td class="l" colspan="2">الإجمالي</td><td>${fmt(sum(list, r => r.cash_amount))}</td><td>${fmt(sum(list, r => r.mada_amount))}</td><td>${fmt(sum(list, oth))}</td><td>${fmt(sum(list, r => r.total_actual))}</td><td>${fmt(sum(list, r => r.total_expected))}</td><td style="direction:ltr">${sgn(sum(list, r => r.total_actual) - sum(list, r => r.total_expected))}</td><td></td></tr></tbody></table>`
    const body = `<div class="body">
      <div class="sec"><div class="grid g4">
        <div class="kpi" style="--c:#15803d"><small>إجمالي المحصَّل</small><b>${fmt(tA)}</b><em>ر.س</em></div>
        <div class="kpi" style="--c:#1C2B4A"><small>إجمالي المبيعات</small><b>${fmt(tE)}</b><em>ر.س</em></div>
        <div class="kpi" style="--c:${tD < 0 ? '#dc2626' : '#1d4ed8'}"><small>الفرق</small><b>${tD === 0 ? '0' : sgn(tD)}</b><em>ر.س</em></div>
        <div class="kpi" style="--c:#7c3aed"><small>القيود</small><b>${records.length}</b><em>${records.filter(r => r.is_confirmed).length} مؤكد</em></div>
      </div></div>
      ${groups.map(g => `<div class="sec"><h3>${esc(g.name)} <span class="muted">(${g.list.length} قيد)</span></h3>${tbl(g.list)}</div>`).join('')}
      <div class="sec"><div class="sig"><div><span>الموظف</span><b>&nbsp;</b><i></i></div><div><span>المحاسب</span><b>&nbsp;</b><i></i></div><div><span>المشرف / الاعتماد</span><b>&nbsp;</b><i></i></div></div></div>
    </div>`
    const html = docShell({
      title: `اليومية — ${filterDate}`,
      body: docHeader({ title: 'كشف الإيرادات اليومي', infoLines: [`اليوم: <b>${esc(dayLabel)}</b>`, `المحطة: <b>${esc(groups.length === 1 ? groups[0].name : `${groups.length} محطات`)}</b>`, `الطابع: <b>${esc(profile?.full_name_ar ?? '—')}</b>`] }) + body,
      footerLeft: `طُبع: ${esc(new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }))}`, footerRight: 'وثيقة داخلية',
      shareText: `كشف الإيرادات اليومي — ${dayLabel}\nالقيود: ${records.length} · المحصَّل: ${fmt(tA)} ر.س · المبيعات: ${fmt(tE)} · الفرق: ${tD > 0 ? '+' : ''}${fmt(tD)}`,
    })
    const withDocs = records.filter(r => r.balance_doc_path)
    if (!withDocs.length) { openDocWindow(html); return }
    // أوراق الموازنة المرفقة تُطبع بعد الكشف، صفحة لكل يومية (تُفتح النافذة فوراً قبل انتظار الروابط)
    const w = window.open('', '_blank')
    try { w?.document.write('<p style="font-family:sans-serif;padding:24px;color:#555">جارٍ تجهيز الطباعة مع أوراق الموازنة...</p>') } catch { /* لا شي */ }
    let urls = {}
    try {
      const { data } = await supabase.storage.from('sales-docs').createSignedUrls(withDocs.map(r => r.balance_doc_path), 1800)
      urls = Object.fromEntries((data ?? []).filter(x => x.signedUrl).map(x => [x.path, x.signedUrl]))
    } catch { /* نطبع بدون المرفقات */ }
    const appendix = withDocs.filter(r => urls[r.balance_doc_path]).map(r => `
      <div style="page-break-before:always;max-width:760px;margin:0 auto;padding:24px 28px;direction:rtl;font-family:'IBM Plex Sans Arabic',Arial,sans-serif">
        <div style="border-bottom:2px solid #1C2B4A;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
          <b style="font-size:15px;color:#1C2B4A">مرفق: ورقة الموازنة</b>
          <span style="font-size:11px;color:#6b7280">${esc(sName(r))} · ${esc(r.sale_date)} · ${esc(shiftLbl(r.shift))} · ${esc(r.employee_name || r.created_by_name || '—')}</span>
        </div>
        ${/\.pdf$/i.test(r.balance_doc_path)
          ? `<p style="font-size:12px">ملف PDF مرفق. <a href="${urls[r.balance_doc_path]}" target="_blank">افتح الملف</a></p>`
          : `<img src="${urls[r.balance_doc_path]}" alt="" style="width:100%;max-height:230mm;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px">`}
      </div>`).join('')
    const full = html.replace('</body>', `${appendix}</body>`)
    if (w && !w.closed) { w.document.open(); w.document.write(full); w.document.close() } else openDocWindow(full)
  }

  const [xlBusy, setXlBusy] = useState(false)
  const [xlOpen, setXlOpen] = useState(false)
  const [xlFrom, setXlFrom] = useState(filterDate)
  const [xlTo, setXlTo] = useState(filterDate)
  // محطات التنزيل المختارة — فارغة = كل المحطات. تُحفظ بالجهاز فتبقى ثابتة بين مرة وأخرى حتى تغيّرها أنت
  const [xlSel, setXlSel] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('sales_xl_stations') ?? '[]')) } catch { return new Set() } })
  useEffect(() => { try { localStorage.setItem('sales_xl_stations', JSON.stringify([...xlSel])) } catch { /* بدون تخزين */ } }, [xlSel])
  const [xlSearch, setXlSearch] = useState('')
  const [xlErr, setXlErr] = useState('')
  const dayShift = n => { const d = new Date(); d.setDate(d.getDate() + n); return toLocalDateStr(d) }
  const xlPresets = [
    [isAr ? 'اليوم' : 'Today', dayShift(0), dayShift(0)],
    [isAr ? 'أمس' : 'Yesterday', dayShift(-1), dayShift(-1)],
    [isAr ? 'آخر 7 أيام' : 'Last 7 days', dayShift(-6), dayShift(0)],
    [isAr ? 'آخر 30 يوماً' : 'Last 30 days', dayShift(-29), dayShift(0)],
    [isAr ? 'هذا الشهر' : 'This month', toLocalDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), dayShift(0)],
    [isAr ? 'الشهر الماضي' : 'Last month', toLocalDateStr(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)), toLocalDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 0))],
  ]
  function openXl() { setXlFrom(filterDate); setXlTo(filterDate); setXlSearch(''); setXlErr(''); setXlOpen(true) }
  async function downloadDailyExcel() {
    if (!canExportDaily) return
    if (!xlFrom || !xlTo || xlFrom > xlTo) { setXlErr(isAr ? 'حدّد فترة صحيحة' : 'Pick a valid period'); return }
    if ((new Date(xlTo) - new Date(xlFrom)) / 86400000 > 92) { setXlErr(isAr ? 'الحد الأقصى للفترة 93 يوماً' : 'Maximum period is 93 days'); return }
    setXlBusy(true); setXlErr('')
    try {
      // نفس نطاق الصلاحية الذي يطبّقه جلب السجلات في الصفحة (المحطات المحذوفة من القائمة تُتجاهل)
      const selIds = stations.filter(x => xlSel.has(x.id)).map(x => x.id)
      const build = () => {
        let q = supabase.from('sales_records').select('*, station:station_id(name_ar, name_en)')
          .gte('sale_date', xlFrom).lte('sale_date', xlTo).order('sale_date').order('shift').order('id')
        if (isGeneralAdmin) { if (selIds.length) q = q.in('station_id', selIds) }
        else if (workStations?.length > 1) q = q.in('station_id', workStations.map(x => x.id))
        else q = q.eq('station_id', profile.station_id)
        return q
      }
      let all = []
      for (let page = 0; page < 50; page++) {
        const { data, error } = await build().range(page * 1000, page * 1000 + 999)
        if (error) throw new Error(error.message)
        all = all.concat(data ?? [])
        if (!data || data.length < 1000) break
      }
      if (!all.length) { setXlErr(isAr ? 'لا توجد سجلات إيرادات في هذه الفترة' : 'No revenue records in this period'); setXlBusy(false); return }
      const creatorIds = [...new Set(all.map(r => r.created_by).filter(Boolean))]
      const jobMap = {}
      for (let i = 0; i < creatorIds.length; i += 150) {
        const { data: us } = await supabase.from('users').select('id, job_number').in('id', creatorIds.slice(i, i + 150))
        ;(us ?? []).forEach(u => { jobMap[u.id] = u.job_number })
      }
      const rows = all.map(r => ({ ...r, created_by_user: { job_number: jobMap[r.created_by] ?? null } }))
      const { exportDailySalesExcel } = await safeImport(() => import('../utils/salesDailyExport'))
      const nm = x => (isAr ? (x.name_ar || x.name_en) : (x.name_en || x.name_ar))
      const picked = stations.filter(x => xlSel.has(x.id))
      const scopeText = !isGeneralAdmin ? (isAr ? 'محطتك' : 'Your station')
        : !picked.length ? (isAr ? 'جميع المحطات' : 'All stations')
        : picked.length <= 3 ? picked.map(nm).join(isAr ? '، ' : ', ')
        : (isAr ? `${picked.length} محطات مختارة` : `${picked.length} selected stations`)
      await exportDailySalesExcel({
        isAr, records: rows, from: xlFrom, to: xlTo,
        scopeText, shifts: SHIFTS.map(sh => ({ k: sh.value, range: sh.range })),
        preparedBy: profile?.full_name_ar || '',
      })
      setXlOpen(false)
    } catch (e) { setXlErr((isAr ? 'تعذّر إنشاء الملف: ' : 'Could not create the file: ') + (e?.message || e)) }
    setXlBusy(false)
  }
  const canAdd           = !isAccountant && allowCap('sales_add')

  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isAr ? 'الإيرادات' : 'Revenue'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isGeneralAdmin ? (isAr ? 'جميع المحطات' : 'All stations')
              : (isAreaSupervisor || isStationAdmin) && allowedStationIds?.length > 1 ? (isAr ? 'محطاتك المخصصة' : 'Your assigned stations')
              : (isAccountant || viewStation) && workStations?.length > 1 ? (isAr ? 'محطاتك المخصصة' : 'Your assigned stations')
              : isStationAdmin || isAccountant || viewStation ? (isAr ? 'محطتك فقط' : 'Your station only')
              : (isAr ? 'مبيعاتك الخاصة' : 'Your own entries')}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
        {isGeneralAdmin && (
          <button type="button" onClick={() => setPrintAccessOpen(true)}
            title={isAr ? 'تحكّم في من يستطيع طباعة يومياته' : 'Control who can print their dailies'}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
            {isAr ? 'صلاحية الطباعة' : 'Print access'}
            <span className={`text-[10px] rounded-full px-2 py-0.5 font-extrabold ${printAccess.all ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {printAccess.all ? (isAr ? 'مفتوحة' : 'Open') : (isAr ? 'مغلقة' : 'Closed')}{Object.keys(printAccess.accounts).length ? ` · ${Object.keys(printAccess.accounts).length}` : ''}
            </span>
          </button>
        )}
        {canPrintDaily && records.length > 0 && (
          <button type="button" onClick={printDaily}
            title={isAr ? 'كشف اليومية للطباعة بالشعار والتواقيع' : 'Daily sheet for printing'}
            className="bg-white text-gray-800 border border-gray-300 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
            {isAr ? 'طباعة اليومية' : 'Print daily sheet'}
          </button>
        )}
        {canExportDaily && (
          <button type="button" onClick={openXl} disabled={xlBusy}
            title={isAr ? 'جدول يومي بأسلوب محاسبي: قيود + تسوية ورديات + توزيع طرق الدفع + توقيعات الاعتماد' : 'Accounting-style daily workbook'}
            className="bg-white text-gray-800 border border-gray-300 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40">
            {isAr ? 'تنزيل الجدول (Excel)' : 'Download sheet (Excel)'}
          </button>
        )}
        {canAdd && (
          <button onClick={() => setModal('new')}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-black transition-colors self-start sm:self-auto">
            + {isAr ? 'إدخال إيرادات' : 'New Entry'}
          </button>
        )}
        </div>
      </div>

      {/* Date + Station filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button type="button" onClick={() => setFilterDate(todayStr())}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${filterDate === todayStr() ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{isAr ? 'اليوم' : 'Today'}</button>
        <button type="button" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setFilterDate(toLocalDateStr(d)) }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${filterDate === (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toLocalDateStr(d) })() ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{isAr ? 'أمس' : 'Yesterday'}</button>
        <div className="w-44">
          <DatePicker value={filterDate} onChange={setFilterDate} isAr={isAr}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white" />
        </div>
        {(isGeneralAdmin || isAreaSupervisor || isStationAdmin || ((isAccountant || viewStation) && workStations?.length > 1)) && stations.length > 0 && (
          <>
            <button type="button" onClick={() => stepStation(isAr ? 1 : -1)} title={isAr ? 'المحطة السابقة' : 'Previous station'}
              className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 text-sm font-bold leading-none">{isAr ? '›' : '‹'}</button>
            <SelectField value={filterStation} onChange={e => setStation(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white min-w-[180px]">
              <option value="">{isAr ? 'جميع المحطات' : 'All stations'}</option>
              {pinnedStations.length > 0 && <>
                <optgroup label={isAr ? 'المثبّتة' : 'Pinned'}>
                  {stations.filter(s => pinnedStations.includes(s.id)).map(s => (
                    <option key={s.id} value={s.id}>{isAr ? s.name_ar : s.name_en}</option>
                  ))}
                </optgroup>
                <optgroup label={isAr ? 'الكل' : 'All'}>
                  {stations.filter(s => !pinnedStations.includes(s.id)).map(s => (
                    <option key={s.id} value={s.id}>{isAr ? s.name_ar : s.name_en}</option>
                  ))}
                </optgroup>
              </>}
              {pinnedStations.length === 0 && stations.map(s => (
                <option key={s.id} value={s.id}>{isAr ? s.name_ar : s.name_en}</option>
              ))}
            </SelectField>
            <button type="button" onClick={() => stepStation(isAr ? -1 : 1)} title={isAr ? 'المحطة التالية' : 'Next station'}
              className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 text-sm font-bold leading-none">{isAr ? '‹' : '›'}</button>
            <button onClick={() => setShowPinModal(true)}
              title={isAr ? 'تثبيت محطات' : 'Pin stations'}
              className={`text-sm leading-none rounded-lg px-2.5 py-2 border transition-colors ${pinnedStations.length > 0 ? 'text-amber-600 border-amber-300 bg-amber-50' : 'text-gray-400 border-gray-200 bg-white hover:text-amber-600'}`}>
              {isAr ? 'تثبيت' : 'Pin'}
            </button>
          </>
        )}
      </div>

      {/* Summary — للأدمن والمحاسب */}
      {(isGeneralAdmin || isAccountant) && <StatStrip className="mb-4" sticky={isGeneralAdmin} items={[
        { label: isAr ? 'إجمالي المحصَّل' : 'Total collected', val: fmt(totalActualSum) + ' ر.س', tone: 'text-green-700' },
        { label: isAr ? 'إجمالي المبيعات' : 'Total sales', val: fmt(totalExpectedSum) + ' ر.س' },
        { label: isAr ? 'الفرق' : 'Difference',
          val: (totalActualSum - totalExpectedSum > 0 ? '+' : '') + fmt(totalActualSum - totalExpectedSum) + ' ر.س',
          tone: totalActualSum - totalExpectedSum === 0 ? 'text-gray-500' : totalActualSum > totalExpectedSum ? 'text-blue-600' : 'text-red-600' },
        { label: isAr ? 'مؤكدة' : 'Confirmed', val: `${confirmed} / ${records.length}` },
      ]} />}

      {/* Records */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>
      ) : records.length === 0 ? (
        <div className="text-center py-20 text-gray-400 bg-white border border-gray-200 rounded-lg">
          <p>{isAr ? 'لا توجد سجلات في هذا اليوم' : 'No records for this date'}</p>
        </div>
      ) : (() => {
        const byDay = {}
        records.forEach(r => { (byDay[r.sale_date] ??= []).push(r) })
        const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a))
        const others = r => Number(r.visa_amount ?? 0) + Number(r.mastercard_amount ?? 0) + Number(r.other_amount ?? 0)

        return (
          <div className="space-y-3">
            {days.map(day => {
              const dayRecs = byDay[day]
              const isOpen = openDays[day] ?? (days.length === 1)
              const dayActual = dayRecs.reduce((s, r) => s + Number(r.total_actual ?? 0), 0)
              const daySales = dayRecs.reduce((s, r) => s + Number(r.total_expected ?? 0), 0)
              const dayDiff = dayActual - daySales
              const dayConfirmed = dayRecs.filter(r => r.is_confirmed).length
              const dayHasDeficit = dayRecs.some(r => Number(r.total_actual ?? 0) - Number(r.total_expected ?? 0) < 0)
              const stName = r => (isAr ? (r.station?.name_ar || r.station?.name_en) : (r.station?.name_en || r.station?.name_ar)) || '—'
              const stIds = [...new Set(dayRecs.map(r => r.station_id))]
              const multiSt = stIds.length > 1
              const sortedRecs = multiSt ? [...dayRecs].sort((a, b) => stName(a).localeCompare(stName(b), isAr ? 'ar' : 'en') || String(a.shift).localeCompare(String(b.shift))) : dayRecs
              const dayLabel = new Date(day + 'T00:00:00').toLocaleDateString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

              return (
                <div key={day} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => toggleDay(day)} className="w-full flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50 transition-colors text-start">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-gray-400 text-sm w-3">{isOpen ? '▾' : (isAr ? '◂' : '▸')}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900 text-sm truncate">{dayLabel}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {multiSt ? `${stIds.length} ${isAr ? 'محطة' : 'stations'} · ` : (dayRecs[0] ? `${stName(dayRecs[0])} · ` : '')}{dayRecs.length} {isAr ? 'سجل' : 'records'} · {dayConfirmed} {isAr ? 'مؤكد' : 'confirmed'}
                          {dayHasDeficit && <span className="text-red-500 font-semibold"> · {isAr ? 'يوجد عجز' : 'deficit'}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="font-bold text-green-700 text-sm font-mono" dir="ltr">{fmt(dayActual)} <span className="text-xs font-normal text-gray-400">{isAr ? 'ر.س' : 'SAR'}</span></div>
                      <div className="text-xs text-gray-400">{isAr ? 'إجمالي اليوم' : 'Day total'}</div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs">
                          <tr>
                            {[
                              [isAr ? 'الوردية' : 'Shift', ''],
                              [isAr ? 'الموظف' : 'Employee', ''],
                              [isAr ? 'نقد' : 'Cash', 'hidden md:table-cell'],
                              [isAr ? 'مدى' : 'Mada', 'hidden md:table-cell'],
                              [isAr ? 'بطاقات وأخرى' : 'Cards & other', 'hidden lg:table-cell'],
                              [isAr ? 'المحصَّل' : 'Collected', ''],
                              [isAr ? 'إجمالي المبيعات' : 'Total sales', ''],
                              [isAr ? 'الفرق' : 'Diff', ''],
                              [isAr ? 'الحالة' : 'Status', ''],
                              ['', ''],
                            ].map(([h, cls], i) => (
                              <th key={i} className={`px-3 py-2 text-start font-medium whitespace-nowrap ${cls}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sortedRecs.map((r, ri) => {
                            const diff = Number(r.total_actual ?? 0) - Number(r.total_expected ?? 0)
                            const nm = r.employee_name || r.created_by_name || '—'
                            const newSt = multiSt && (ri === 0 || sortedRecs[ri - 1].station_id !== r.station_id)
                            const grp = newSt ? sortedRecs.filter(x => x.station_id === r.station_id) : null
                            const gAct = grp ? grp.reduce((a, x) => a + Number(x.total_actual ?? 0), 0) : 0
                            const gDiff = grp ? gAct - grp.reduce((a, x) => a + Number(x.total_expected ?? 0), 0) : 0
                            return (
                              <Fragment key={r.id}>
                              {newSt && (
                                <tr className="bg-nwbus-primary/5 border-t-2 border-nwbus-primary/20">
                                  <td colSpan={10} className="px-3 py-2">
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <span className="w-1 h-4 rounded bg-nwbus-primary" />
                                      <span className="text-[13px] font-extrabold text-gray-900">{stName(r)}</span>
                                      <span className="text-[11px] text-gray-500">{grp.length} {isAr ? 'سجل' : 'records'}</span>
                                      <span className="ms-auto font-mono text-xs font-bold text-green-700" dir="ltr">{fmt(gAct)} {isAr ? 'ر.س' : 'SAR'}</span>
                                      <span className={`font-mono text-xs font-bold ${gDiff === 0 ? 'text-gray-400' : gDiff > 0 ? 'text-blue-600' : 'text-red-600'}`} dir="ltr">{gDiff > 0 ? '+' : ''}{fmt(gDiff)}</span>
                                    </div>
                                  </td>
                                </tr>
                              )}
                              <tr className={`hover:bg-gray-50 transition-colors ${diff < 0 && r.is_confirmed ? 'bg-red-50/30' : ''}`}>
                                <td className="px-3 py-3 font-bold text-nwbus-primary">{r.shift}</td>
                                <td className="px-3 py-3 min-w-[140px]">
                                  <div className="text-[13px] text-gray-800 truncate max-w-[160px]" title={nm} dir="auto">{nm}</div>
                                  <div className="text-[11px] text-gray-400 font-mono">{r.created_by_user?.job_number ? `#${r.created_by_user.job_number}` : ''}</div>
                                  {r.entered_by_name && <div className="text-[10px] text-amber-700">{isAr ? `أدخلها المشرف: ${r.entered_by_name}` : `Entered by: ${r.entered_by_name}`}</div>}
                                </td>
                                <td className="px-3 py-3 font-mono text-xs text-gray-600 hidden md:table-cell">{fmt(r.cash_amount)}</td>
                                <td className="px-3 py-3 font-mono text-xs text-gray-600 hidden md:table-cell">{fmt(r.mada_amount)}</td>
                                <td className="px-3 py-3 font-mono text-xs text-gray-600 hidden lg:table-cell">{fmt(others(r))}</td>
                                <td className="px-3 py-3 font-mono text-xs font-semibold text-green-700">{fmt(r.total_actual)}</td>
                                <td className="px-3 py-3 font-mono text-xs text-gray-500">{fmt(r.total_expected)}</td>
                                <td className={`px-3 py-3 font-mono text-xs font-semibold ${diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`} dir="ltr">
                                  {diff > 0 ? '+' : ''}{fmt(diff)}
                                  {diff < 0 && r.is_confirmed && <div className="text-red-400 text-[10px] font-sans">{isAr ? 'عجز مُقَر' : 'acknowledged'}</div>}
                                </td>
                                <td className="px-3 py-3">
                                  <span className={`text-xs rounded-full px-2 py-0.5 ${r.is_confirmed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {r.is_confirmed ? (isAr ? 'مؤكد ✓' : 'Confirmed ✓') : (isAr ? 'قيد المراجعة' : 'Pending')}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex gap-1 items-center">
                                    <button onClick={() => setAudit(r)}
                                      className="text-xs border border-gray-200 text-gray-500 rounded-lg px-2 py-1 hover:bg-gray-50"
                                      title={isAr ? 'سجل التعديلات' : 'Audit History'}>{isAr ? 'السجل' : 'Log'}</button>
                                    {r.balance_doc_path && (
                                      <button type="button" onClick={() => openBalanceDoc(r.balance_doc_path)}
                                        className="border border-gray-200 text-gray-600 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors"
                                        title={isAr ? 'عرض ورقة الموازنة' : 'View balance document'} aria-label={isAr ? 'عرض ورقة الموازنة' : 'View balance document'}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></svg>
                                      </button>
                                    )}
                                    {r.balance_doc_path && canPrintRecord(r) && (
                                      <button type="button" onClick={() => printBalanceSheet({ sale: r, isAr, profile })}
                                        className="text-xs border border-gray-200 text-gray-600 rounded-lg px-2 py-1 hover:bg-gray-50 transition-colors whitespace-nowrap"
                                        title={isAr ? 'طباعة ورقة الموازنة وحدها' : 'Print the balance sheet only'}>
                                        {isAr ? 'طباعة الموازنة' : 'Print balance'}
                                      </button>
                                    )}
                                    {canPrintRecord(r) && (
                                      <button type="button" onClick={() => printSaleRecord({ sale: r, isAr, profile })}
                                        className="border border-gray-200 text-gray-600 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors"
                                        title={isAr ? 'طباعة هذه اليومية' : 'Print this daily sheet'} aria-label={isAr ? 'طباعة هذه اليومية' : 'Print this daily sheet'}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                                      </button>
                                    )}
                                    {(r.is_confirmed && !isGeneralAdmin) || (isViewOnlyRow(r) && !grantCap('sales_confirm_station'))
                                      ? (
                                        <button onClick={() => setModal(r)}
                                          className="text-xs border border-gray-300 text-gray-500 rounded-lg px-3 py-1 hover:bg-gray-50 transition-colors">
                                          {isAr ? 'عرض' : 'View'}
                                        </button>
                                      ) : (
                                        <button onClick={() => setModal(r)}
                                          className="text-xs border border-nwbus-primary text-nwbus-primary rounded-lg px-3 py-1 hover:bg-nwbus-primary hover:text-white transition-colors">
                                          {isViewOnlyRow(r) ? (isAr ? 'مراجعة وتأكيد' : 'Review & confirm') : (isAr ? 'تعديل' : 'Edit')}
                                        </button>
                                      )
                                    }
                                    {isGeneralAdmin && (
                                      <button onClick={() => handleDelete(r.id)}
                                        disabled={deleting === r.id}
                                        className="text-xs border border-red-200 text-red-500 rounded-lg px-2 py-1 hover:bg-red-50 transition-colors disabled:opacity-40"
                                        title={isAr ? 'حذف' : 'Delete'}>
                                        {deleting === r.id ? '…' : (isAr ? 'حذف' : 'Del')}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              </Fragment>
                            )
                          })}
                        </tbody>
                        {dayRecs.length > 1 && (
                          <tfoot>
                            <tr className="bg-gray-50 border-t border-gray-200 text-xs font-bold text-gray-700">
                              <td className="px-3 py-2" colSpan={2}>{isAr ? 'إجمالي اليوم' : 'Day total'}</td>
                              <td className="px-3 py-2 font-mono hidden md:table-cell">{fmt(dayRecs.reduce((s, r) => s + Number(r.cash_amount ?? 0), 0))}</td>
                              <td className="px-3 py-2 font-mono hidden md:table-cell">{fmt(dayRecs.reduce((s, r) => s + Number(r.mada_amount ?? 0), 0))}</td>
                              <td className="px-3 py-2 font-mono hidden lg:table-cell">{fmt(dayRecs.reduce((s, r) => s + others(r), 0))}</td>
                              <td className="px-3 py-2 font-mono text-green-700">{fmt(dayActual)}</td>
                              <td className="px-3 py-2 font-mono">{fmt(daySales)}</td>
                              <td className={`px-3 py-2 font-mono ${dayDiff === 0 ? 'text-gray-400' : dayDiff > 0 ? 'text-blue-700' : 'text-red-600'}`} dir="ltr">{dayDiff > 0 ? '+' : ''}{fmt(dayDiff)}</td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {printAccessOpen && (
        <PrintAccessModal isAr={isAr} access={printAccess} onClose={() => setPrintAccessOpen(false)}
          onSave={next => saveSetting(PRINT_ACCESS_KEY, JSON.stringify(next))} />
      )}

      {xlOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3" dir={isAr ? 'rtl' : 'ltr'} onClick={e => { if (e.target === e.currentTarget && !xlBusy) setXlOpen(false) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-gray-900">{isAr ? 'تنزيل جدول الإيرادات (Excel)' : 'Download revenue sheet (Excel)'}</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">{isAr ? 'قيود مفصّلة + ملخص محاسبي + تسوية الورديات + توقيعات الاعتماد' : 'Entries + accounting summary + shift reconciliation + sign-off'}</p>
              </div>
              <button type="button" onClick={() => !xlBusy && setXlOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {xlPresets.map(([l, a, b]) => {
                  const on = xlFrom === a && xlTo === b
                  return <button key={l} type="button" onClick={() => { setXlFrom(a); setXlTo(b) }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
                })}
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">{isAr ? 'من' : 'From'}</label>
                  <DatePicker value={xlFrom} onChange={v => { setXlFrom(v); if (v && xlTo && v > xlTo) setXlTo(v) }} isAr={isAr} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-44" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">{isAr ? 'إلى' : 'To'}</label>
                  <DatePicker value={xlTo} onChange={v => { setXlTo(v); if (v && xlFrom && v < xlFrom) setXlFrom(v) }} isAr={isAr} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-44" />
                </div>
              </div>
              {isGeneralAdmin && stations.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-gray-500">{isAr ? 'المحطات' : 'Stations'}
                      <span className="ms-1.5 font-semibold text-gray-700">{xlSel.size ? (isAr ? `(${xlSel.size} مختارة)` : `(${xlSel.size} selected)`) : (isAr ? '(الكل)' : '(all)')}</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setXlSel(new Set())} className="text-[11px] font-bold text-nwbus-primary hover:underline">{isAr ? 'الكل' : 'All'}</button>
                      {xlSel.size > 0 && <button type="button" onClick={() => setXlSel(new Set())} className="text-[11px] text-red-500 hover:underline">{isAr ? 'مسح التحديد' : 'Clear'}</button>}
                    </div>
                  </div>
                  <input value={xlSearch} onChange={e => setXlSearch(e.target.value)} placeholder={isAr ? 'ابحث عن محطة…' : 'Search a station…'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs mb-1.5 focus:ring-2 focus:ring-nwbus-primary/40 focus:outline-none" />
                  <div className="border border-gray-200 rounded-lg max-h-52 overflow-y-auto overscroll-contain divide-y divide-gray-50">
                    <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm font-bold text-gray-800">
                      <input type="checkbox" className="accent-gray-900 w-4 h-4" checked={xlSel.size === 0} onChange={() => setXlSel(new Set())} />
                      {isAr ? 'جميع المحطات' : 'All stations'}
                    </label>
                    {[...stations].sort((a, b) => (isAr ? (a.name_ar || a.name_en) : (a.name_en || a.name_ar)).localeCompare(isAr ? (b.name_ar || b.name_en) : (b.name_en || b.name_ar)))
                      .filter(x => !xlSearch || (x.name_ar ?? '').includes(xlSearch) || (x.name_en ?? '').toLowerCase().includes(xlSearch.toLowerCase()))
                      .map(x => (
                        <label key={x.id} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-gray-50 text-sm text-gray-700">
                          <input type="checkbox" className="accent-gray-900 w-4 h-4" checked={xlSel.has(x.id)}
                            onChange={() => setXlSel(prev => { const n = new Set(prev); n.has(x.id) ? n.delete(x.id) : n.add(x.id); return n.size === stations.length ? new Set() : n })} />
                          <span dir="auto" className="truncate">{isAr ? (x.name_ar || x.name_en) : (x.name_en || x.name_ar)}</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}
              {xlErr && <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{xlErr}</p>}
            </div>
            <div className="px-5 py-3.5 border-t border-gray-100 flex items-center gap-2.5">
              <button type="button" onClick={downloadDailyExcel} disabled={xlBusy}
                className="flex-1 bg-gray-900 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-black disabled:opacity-50">
                {xlBusy ? (isAr ? 'جارٍ التجهيز…' : 'Preparing…') : (isAr ? 'تنزيل الملف' : 'Download')}
              </button>
              <button type="button" onClick={() => setXlOpen(false)} disabled={xlBusy} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white hover:bg-gray-50">{isAr ? 'إلغاء' : 'Cancel'}</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <SalesModal
          sale={modal === 'new' ? null : modal}
          stations={stations}
          onClose={() => setModal(null)}
          onSaved={fetchRecords}
          onOpenExisting={async id => {
            const r = records.find(x => x.id === id)
            if (r) { setModal(r); return }
            const { data } = await supabase.from('sales_records').select('*, station:station_id(name_ar, name_en)').eq('id', id).maybeSingle()
            if (data) setModal({ ...data, created_by_user: { job_number: null } })
          }}
        />
      )}
      {audit && <AuditModal sale={audit} onClose={() => setAudit(null)} />}
      {showPinModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.15)', width: '100%', maxWidth: 400, maxHeight: '80vh', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
            <div style={{ background: '#1C2B36', color: '#fff', padding: '12px 16px', borderRadius: '14px 14px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700 }}>{isAr ? 'اختر المحطات المثبّتة' : 'Pin Stations'}</span>
              <button onClick={() => setShowPinModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stations.map(s => {
                const pinned = pinnedStations.includes(s.id)
                return (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9, background: pinned ? '#eff6ff' : '#f8fafc', border: `1px solid ${pinned ? '#bfdbfe' : '#e2e8f0'}`, cursor: 'pointer', fontWeight: pinned ? 700 : 400, color: pinned ? '#1d4ed8' : '#374151' }}>
                    <input type="checkbox" checked={pinned} onChange={() => togglePin(s.id)} style={{ accentColor: '#1C2B36', width: 16, height: 16 }} />
                    {isAr ? s.name_ar : s.name_en}
                    {pinned && <span style={{ marginRight: 'auto', fontSize: '0.7rem', color: '#3b82f6' }}></span>}
                  </label>
                )
              })}
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
              <button onClick={() => setShowPinModal(false)} style={{ background: '#1C2B36', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 32px', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                {isAr ? 'حفظ' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <ConfirmDialog
          message={isAr ? 'هل تريد حذف هذا الإيراد نهائياً؟' : 'Delete this record permanently?'}
          onConfirm={() => doDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}
