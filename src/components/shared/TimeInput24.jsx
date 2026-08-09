import { useState, useEffect, useRef } from 'react'
import { toLatinDigits } from '../../utils/digits'

/**
 * مدخل وقت 24 ساعة بحقلين: ساعة ودقائق.
 * بعد إدخال الساعة ينتقل تلقائياً للدقائق.
 * value/onChange بصيغة "HH:MM".
 */
export default function TimeInput24({ value = '', onChange, placeholder = '--:--', style = {} }) {
  const [hh, setHh] = useState('')
  const [mm, setMm] = useState('')
  const minRef = useRef(null)
  const hrRef  = useRef(null)

  // sync from parent value
  useEffect(() => {
    if (value && /^\d{1,2}:\d{2}$/.test(value)) {
      const [h, m] = value.split(':')
      setHh(h.replace(/^0+/, '') || '')
      setMm(m)
    } else if (!value) {
      setHh(''); setMm('')
    }
  }, [value])

  function emit(h, m) {
    if (h === '' && m === '') { onChange(''); return }
    const hNum = Math.min(23, parseInt(h || '0', 10))
    const mNum = Math.min(59, parseInt(m || '0', 10))
    onChange(`${String(hNum).padStart(2,'0')}:${String(mNum).padStart(2,'0')}`)
  }

  function handleHr(e) {
    const raw = toLatinDigits(e.target.value).replace(/\D/g,'').slice(0,2)
    setHh(raw)
    // انتقل للدقائق إذا: رقمان، أو الرقم > 2 (لا يمكن أن يكون عشرات الساعة)
    if (raw.length === 2 || (raw.length === 1 && parseInt(raw,10) > 2)) {
      emit(raw, mm)
      setTimeout(() => { minRef.current?.focus(); minRef.current?.select() }, 0)
    } else if (raw.length === 0) {
      emit('', mm)
    }
  }

  function handleMm(e) {
    const raw = toLatinDigits(e.target.value).replace(/\D/g,'').slice(0,2)
    setMm(raw)
    if (raw.length === 2) emit(hh, raw)
    else if (raw.length === 0) emit(hh, '')
  }

  function blurHr() {
    if (!hh) return
    const h = Math.min(23, parseInt(hh,10))
    const str = String(h)
    setHh(str)
    emit(str, mm)
  }

  function blurMm() {
    if (!mm) { emit(hh, '00'); setMm('00'); return }
    const m = Math.min(59, parseInt(mm,10))
    const str = String(m).padStart(2,'0')
    setMm(str)
    emit(hh, str)
  }

  function onHrKey(e) {
    if (e.key === ':' || e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault()
      minRef.current?.focus(); minRef.current?.select()
    }
  }

  function onMmKey(e) {
    if (e.key === 'Backspace' && mm === '') {
      hrRef.current?.focus()
    }
  }

  const cell = {
    width: 36, border: 'none', background: 'transparent',
    textAlign: 'center', fontFamily: 'monospace', fontSize: '0.95rem',
    fontWeight: 600, outline: 'none', color: 'var(--text-1)',
    padding: 0,
  }

  const empty = !hh && !mm

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      border: '1px solid var(--border)', borderRadius: 8,
      padding: '9px 12px', background: 'var(--surface)',
      cursor: 'text', userSelect: 'none',
      ...style,
    }}
      onClick={() => (hh ? minRef.current : hrRef.current)?.focus()}
    >
      <input
        ref={hrRef}
        value={hh}
        onChange={handleHr}
        onBlur={blurHr}
        onKeyDown={onHrKey}
        inputMode="numeric"
        maxLength={2}
        placeholder={empty ? '--' : 'ش'}
        dir="ltr"
        style={{ ...cell, color: hh ? 'var(--text-1)' : 'var(--text-3)' }}
      />
      <span style={{ color: hh || mm ? 'var(--text-1)' : 'var(--text-3)', fontWeight:700, fontSize:'1rem', lineHeight:1 }}>:</span>
      <input
        ref={minRef}
        value={mm}
        onChange={handleMm}
        onBlur={blurMm}
        onKeyDown={onMmKey}
        inputMode="numeric"
        maxLength={2}
        placeholder={empty ? '--' : '00'}
        dir="ltr"
        style={{ ...cell, color: mm ? 'var(--text-1)' : 'var(--text-3)' }}
      />
    </div>
  )
}
