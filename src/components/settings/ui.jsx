// عناصر وأنماط مشتركة لصفحة الإعدادات: بطاقة، مفتاح تبديل، تحكم مجزّأ، أيقونات، وCSS الصفحة.
// الأنماط محصورة تحت .st-wrap فلا تتسرب لبقية النظام. الجوال (<= 820px) يبقى مضغوطاً كما كان، والتكبير للكمبيوتر فقط.

const ICONS = {
  gear: ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'],
  general: ['M4 6h3', 'M11 6h9', 'M4 12h9', 'M17 12h3', 'M4 18h5', 'M13 18h7', 'M9 6m-2 0a2 2 0 104 0 2 2 0 10-4 0', 'M15 12m-2 0a2 2 0 104 0 2 2 0 10-4 0', 'M11 18m-2 0a2 2 0 104 0 2 2 0 10-4 0'],
  access: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z', 'M9 12l2 2 4-4'],
  data: ['M3 5h18v14H3z', 'M3 10h18', 'M9 5v14'],
  backup: ['M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  about: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 11v5', 'M12 8h.01'],
  palette: ['M12 3a9 9 0 100 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4.4-4-8-9-8z', 'M7.5 11h.01', 'M10 7.5h.01', 'M14.5 7.5h.01'],
  clock: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 7v5l3 2'],
  users: ['M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1', 'M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z', 'M21 19v-1a4 4 0 00-3-3.9', 'M16 4.1a3.5 3.5 0 010 6.8'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
  mail: ['M3 6h18v12H3z', 'M3 7l9 6 9-6'],
  link: ['M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1', 'M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'],
  file: ['M5 3h9l5 5v13H5z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
  refresh: ['M20 11a8 8 0 00-14.5-4.5L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0014.5 4.5L20 16', 'M20 20v-4h-4'],
  check: ['M5 12l5 5 10-10'],
  key: ['M8 15m-4 0a4 4 0 108 0 4 4 0 10-8 0', 'M11 12l9-9', 'M17 6l3 3'],
  chev: ['M9 6l6 6-6 6'],
  bolt: ['M13 3L5 14h6l-1 7 8-11h-6l1-7z'],
}

export function Icon({ name, size = 18, flip = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      {(ICONS[name] || ICONS.about).map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

// بطاقة إعداد موحّدة: أيقونة + عنوان + وصف + (aside عنصر تحكم يظهر بجانب العنوان) + المحتوى
export function SettingsCard({ icon, title, desc, aside, span = false, tone, children }) {
  return (
    <section className={`st-card${span ? ' st-span' : ''}${tone ? ` tone-${tone}` : ''}`}>
      <header className="st-card-head">
        {icon && <span className="st-card-ico"><Icon name={icon} size={20} /></span>}
        <div className="st-card-tx">
          <h3>{title}</h3>
          {desc && <p className="st-sub">{desc}</p>}
        </div>
        {aside && <div className="st-card-aside">{aside}</div>}
      </header>
      {children}
    </section>
  )
}

// مفتاح تبديل (switch) فوق checkbox حقيقي لإمكانية الوصول
export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className={`st-switch${checked ? ' on' : ''}${disabled ? ' dis' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="st-switch-track" aria-hidden="true"><span className="st-switch-dot" /></span>
      <span className="st-switch-text">{label}</span>
    </label>
  )
}

// تحكم مجزّأ: options = [[value, label], ...]؛ variant 'track' (شريط متصل) أو 'chips' (أزرار تلتف)
export function Segmented({ options, value, onChange, label, variant = 'track', disabled }) {
  return (
    <div className={`st-seg ${variant}`} role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} disabled={disabled} className="st-seg-b" onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

export const SETTINGS_CSS = `
.st-wrap{--st-r:16px;color:var(--text-1)}
.st-wrap *{box-sizing:border-box}

/* ───── الترويسة ───── */
.st-hero{position:relative;overflow:hidden;background:var(--card);border:1px solid var(--border);border-radius:14px;margin-bottom:14px}
.st-hero::before{content:"";display:block;height:4px;background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 30%,transparent))}
.st-hero-in{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px}
.st-hero-ico{display:none}
.st-hero-tx{flex:1;min-width:200px}
.st-hero h1{margin:0;font-size:1.2rem;font-weight:900;letter-spacing:-.01em;color:var(--text-1)}
.st-hero p{margin:4px 0 0;font-size:.8rem;color:var(--text-3);line-height:1.7}
.st-chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.st-pill{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:0 12px;border-radius:99px;background:var(--surface);border:1px solid var(--border);font-size:.74rem;font-weight:700;color:var(--text-2);white-space:nowrap}
.st-pill b{font-weight:800;color:var(--text-1)}
.st-pill.mono b{font-family:'IBM Plex Mono',ui-monospace,monospace}
.st-pill.acc{background:var(--gold-dim);border-color:transparent;color:var(--text-1)}

/* ───── التخطيط ───── */
.st-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.st-side{display:block}
.st-side-foot{display:none}
.st-nav{display:flex;flex-direction:row;overflow-x:auto;gap:6px;padding-bottom:4px;scrollbar-width:none;margin-inline:-14px;padding-inline:14px}
.st-nav::-webkit-scrollbar{display:none}
.st-tab{flex:0 0 auto;display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border:none;border-bottom:2px solid transparent;background:transparent;color:var(--text-2);font:inherit;font-size:.84rem;font-weight:600;cursor:pointer;text-align:start;border-radius:6px 6px 0 0;white-space:nowrap;transition:background .15s,color .15s}
.st-tab:hover{background:var(--surface);color:var(--text-1)}
.st-tab[aria-selected="true"]{background:var(--gold-dim);color:var(--text-1);font-weight:800;border-bottom-color:var(--accent)}
.st-tab:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.st-tab-ico{display:grid;place-items:center;flex:none}
.st-tab-tx{display:flex;flex-direction:column;min-width:0}
.st-tab-tx small{display:none}

.st-sec-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.st-sec-ico{display:none}
.st-h2{margin:0 0 4px;font-size:1.05rem;font-weight:800;color:var(--text-1)}
.st-h2p{margin:0;font-size:.78rem;color:var(--text-3)}

.st-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}

/* ───── البطاقة ───── */
.st-card{position:relative;background:var(--card);border:1px solid var(--border);border-radius:var(--st-r);padding:16px;box-shadow:var(--shadow-xs)}
.st-card-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.st-card-ico{flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--gold-dim);color:var(--accent)}
.st-card-tx{flex:1 1 180px;min-width:0}
.st-card h3{margin:0 0 4px;font-size:.92rem;font-weight:800;color:var(--text-1)}
.st-card .st-sub{margin:0;font-size:.76rem;color:var(--text-3);line-height:1.75}
.st-card-aside{flex:none}
.st-split{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.st-sep{height:1px;background:var(--border);margin:16px 0}

/* ───── حقول وأزرار ───── */
.st-lbl{display:block;font-size:.72rem;font-weight:700;color:var(--text-3);margin-bottom:6px}
.st-wrap .st-input{width:100%;min-height:44px;padding:0 14px;border:1px solid var(--border-2);border-radius:12px;background:var(--surface);color:var(--text-1);font:inherit;font-size:.88rem;outline:none;transition:border-color .15s,box-shadow .15s}
.st-wrap .st-input:focus,.st-wrap .st-input:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--gold-dim)}
.st-wrap .st-input::placeholder{color:var(--text-3)}
.st-wrap .st-input-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer}
.st-date{flex:1 1 180px;min-width:0}
.st-btn{min-height:44px;padding:0 18px;border-radius:12px;border:1px solid var(--border-2);background:var(--card);color:var(--text-1);font:inherit;font-size:.84rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;transition:border-color .15s,background .15s,transform .1s}
.st-btn:hover:not(:disabled){border-color:var(--accent)}
.st-btn:active:not(:disabled){transform:translateY(1px)}
.st-btn.pri{background:var(--solid-btn);border-color:var(--solid-btn);color:#fff}
.st-btn.pri:hover:not(:disabled){filter:brightness(1.12)}
.st-btn.danger{color:var(--danger)}
.st-btn.sm{min-height:38px;padding:0 14px;font-size:.78rem}
.st-btn:disabled{opacity:.5;cursor:not-allowed}
.st-btn:focus-visible,.st-seg-b:focus-visible,.st-theme:focus-visible,.st-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.st-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

/* ───── ملاحظات الحالة ───── */
.st-note{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;font-size:.78rem;font-weight:700;line-height:1.7;border:1px solid transparent}
.st-note.ok{background:var(--success-bg);color:var(--success);border-color:color-mix(in srgb,var(--success) 30%,transparent)}
.st-note.err{background:var(--danger-bg);color:var(--danger);border-color:color-mix(in srgb,var(--danger) 30%,transparent)}
.st-note.warn{background:var(--warning-bg);color:var(--warning);border-color:color-mix(in srgb,var(--warning) 30%,transparent)}
.st-note.info{background:var(--surface);color:var(--text-2);border-color:var(--border)}
.st-note svg{flex:none}

/* ───── مفتاح التبديل ───── */
.st-switch{position:relative;display:inline-flex;align-items:center;gap:12px;min-height:44px;cursor:pointer;font-size:.8rem;font-weight:700;color:var(--text-3);user-select:none}
.st-switch.on{color:var(--success)}
.st-switch.dis{opacity:.55;cursor:not-allowed}
.st-switch input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:inherit}
.st-switch-track{position:relative;flex:none;width:48px;height:28px;border-radius:99px;background:var(--border-2);transition:background .2s}
.st-switch-dot{position:absolute;top:3px;inset-inline-start:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:inset-inline-start .2s}
.st-switch.on .st-switch-track{background:var(--success)}
.st-switch.on .st-switch-dot{inset-inline-start:23px}
.st-switch:focus-within .st-switch-track{outline:2px solid var(--accent);outline-offset:2px}

/* ───── تحكم مجزّأ ───── */
.st-seg{display:flex;gap:6px;flex-wrap:wrap}
.st-seg-b{min-height:38px;padding:0 14px;border-radius:99px;border:1px solid var(--border-2);background:var(--card);color:var(--text-2);font:inherit;font-size:.76rem;font-weight:700;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.st-seg-b:hover:not(:disabled){border-color:var(--accent);color:var(--text-1)}
.st-seg-b[aria-checked="true"]{background:var(--solid-btn);border-color:var(--solid-btn);color:#fff}
.st-seg-b:disabled{opacity:.55;cursor:not-allowed}
.st-seg.track{display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--surface);border:1px solid var(--border)}
.st-seg.track .st-seg-b{flex:1 1 auto;border:none;border-radius:10px;background:transparent;min-height:40px}
.st-seg.track .st-seg-b[aria-checked="true"]{background:var(--solid-btn);color:#fff;box-shadow:var(--shadow-sm)}

/* ───── بلاطات صغيرة وقوائم ───── */
.st-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.st-kv > div{background:var(--surface);border-radius:12px;padding:10px 14px;border:1px solid var(--border)}
.st-kv span{display:block;font-size:.68rem;color:var(--text-3);margin-bottom:3px;font-weight:600}
.st-kv b{font-size:.84rem;font-weight:700;color:var(--text-1);word-break:break-word}
.st-chip{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border-2);border-radius:99px;padding:4px 6px 4px 12px;font-size:.78rem;font-weight:600;color:var(--text-1)}
.st-chip button{width:22px;height:22px;border-radius:50%;border:none;background:var(--border-2);color:var(--text-2);cursor:pointer;display:grid;place-items:center;font:inherit;font-size:.7rem;line-height:1}
.st-chip button:hover{background:var(--danger-bg);color:var(--danger)}
.st-rows{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.st-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:14px;border:1px solid var(--border);background:var(--surface)}
.st-mini{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:12px;background:var(--card);border:1px solid var(--border)}
.st-minis{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
.st-check{display:flex;align-items:center;gap:9px;min-height:44px;padding:8px 12px;border-radius:12px;border:1.5px solid var(--border-2);background:var(--card);cursor:pointer;font-size:.8rem;font-weight:700;color:var(--text-1);transition:border-color .15s,background .15s}
.st-check.on{border-color:var(--accent);background:var(--gold-dim)}
.st-check input{width:18px;height:18px;accent-color:var(--accent);flex:none}
.st-checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.st-avatar{flex:none;display:grid;place-items:center;border-radius:50%;background:linear-gradient(135deg,var(--solid-1),var(--solid-2));color:#fff;font-weight:800}

/* ───── روابط البطاقات ───── */
.st-link{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--border);border-radius:var(--st-r);background:var(--card);text-decoration:none;color:var(--text-1);box-shadow:var(--shadow-xs);transition:border-color .15s,transform .15s}
.st-link:hover{border-color:var(--accent)}
.st-link-tx{flex:1;min-width:0}
.st-link-tx b{display:block;font-size:.88rem;font-weight:800}
.st-link-tx span{display:block;margin-top:2px;font-size:.76rem;color:var(--text-3);line-height:1.6}
.st-link-go{flex:none;color:var(--text-3)}

/* ───── ألوان النظام ───── */
.st-themes{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.st-theme{position:relative;display:flex;flex-direction:column;gap:10px;padding:8px 8px 12px;border-radius:14px;border:2px solid var(--border-2);background:var(--card);cursor:pointer;font:inherit;text-align:center;transition:border-color .15s,background .15s,transform .15s}
.st-theme:hover{border-color:var(--accent)}
.st-theme.on{border-color:var(--accent);background:var(--gold-dim)}
.st-theme-mock{display:flex;height:64px;border-radius:9px;overflow:hidden;border:1px solid rgba(128,128,128,.25)}
.st-theme-side{width:28%}
.st-theme-main{flex:1;display:flex;flex-direction:column;gap:5px;padding:7px}
.st-theme-bar{height:10px;border-radius:3px}
.st-theme-line{height:5px;border-radius:3px;background:rgba(128,128,128,.28)}
.st-theme-name{font-size:.78rem;font-weight:700;color:var(--text-2)}
.st-theme.on .st-theme-name{color:var(--text-1);font-weight:800}
.st-theme-tick{position:absolute;top:14px;inset-inline-end:14px;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;display:none;place-items:center}
.st-theme.on .st-theme-tick{display:grid}

/* ───── إشعار الحفظ العائم ───── */
.st-toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:9000;display:flex;align-items:center;gap:10px;padding:12px 20px;border-radius:99px;background:var(--solid-btn);color:#fff;font-size:.86rem;font-weight:800;box-shadow:var(--shadow-xl);animation:stToast .22s ease-out;pointer-events:none}
.st-toast-ic{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--success);color:#fff}
@keyframes stToast{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
@media (prefers-reduced-motion:reduce){.st-toast{animation:none}}

/* ───── الحالة والنسخة ───── */
.st-ver{font-family:'IBM Plex Mono',ui-monospace,monospace;font-weight:900;font-size:2rem;line-height:1.1;letter-spacing:-.02em;color:var(--text-1)}
.st-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--text-3);flex:none}
.st-dot.ok{background:var(--success);box-shadow:0 0 0 4px var(--success-bg)}
.st-dot.warn{background:var(--warning);box-shadow:0 0 0 4px var(--warning-bg)}
.st-dot.busy{background:var(--info);box-shadow:0 0 0 4px var(--info-bg)}
.st-panel{border:1px solid var(--border);background:var(--surface);border-radius:14px;padding:14px}

/* ═══════════ الكمبيوتر ═══════════ */
@media (min-width:821px){
  .st-wrap{--st-r:18px}
  .st-hero{border-radius:20px;margin-bottom:28px;box-shadow:var(--shadow-sm)}
  .st-hero::before{height:5px}
  .st-hero-in{gap:22px;padding:28px 34px}
  .st-hero-ico{display:grid;place-items:center;flex:none;width:64px;height:64px;border-radius:18px;background:var(--gold-dim);color:var(--accent)}
  .st-hero-tx{min-width:260px}
  .st-hero h1{font-size:2rem}
  .st-hero p{font-size:1rem;margin-top:6px}
  .st-pill{min-height:40px;padding:0 16px;font-size:.86rem}

  .st-grid{grid-template-columns:320px minmax(0,1fr);gap:clamp(24px,2.4vw,40px)}
  .st-side{position:sticky;top:76px;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:12px;box-shadow:var(--shadow-sm)}
  .st-nav{flex-direction:column;overflow:visible;gap:4px;padding:0;margin:0}
  .st-tab{flex:none;gap:14px;min-height:68px;padding:10px 14px;border-bottom:none;border-radius:14px;font-size:1rem;white-space:normal;position:relative}
  .st-tab[aria-selected="true"]{background:var(--gold-dim);border-bottom:none;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent)}
  .st-tab[aria-selected="true"]::after{content:"";position:absolute;inset-block:16px;inset-inline-start:0;width:4px;border-radius:0 4px 4px 0;background:var(--accent)}
  [dir="rtl"] .st-tab[aria-selected="true"]::after{border-radius:4px 0 0 4px}
  .st-tab-ico{width:42px;height:42px;border-radius:12px;background:var(--surface);color:var(--text-2);transition:background .15s,color .15s}
  .st-tab:hover .st-tab-ico{color:var(--accent)}
  .st-tab[aria-selected="true"] .st-tab-ico{background:var(--accent);color:#fff}
  .st-tab-tx{gap:2px}
  .st-tab-tx b{font-size:1rem;font-weight:800;color:var(--text-1)}
  .st-tab-tx small{display:block;font-size:.8rem;font-weight:500;color:var(--text-3);line-height:1.5}
  .st-tab[aria-selected="true"] .st-tab-tx small{color:var(--text-2)}
  .st-side-foot{display:flex;align-items:center;gap:12px;margin-top:10px;padding:14px 12px 6px;border-top:1px solid var(--border)}
  .st-side-foot .st-avatar{width:42px;height:42px;font-size:.9rem}
  .st-side-foot div{min-width:0}
  .st-side-foot b{display:block;font-size:.92rem;font-weight:800;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .st-side-foot span{display:block;font-size:.8rem;color:var(--text-3)}

  .st-sec-head{gap:16px;margin-bottom:22px}
  .st-sec-ico{display:grid;place-items:center;flex:none;width:52px;height:52px;border-radius:16px;background:var(--gold-dim);color:var(--accent)}
  .st-h2{font-size:1.65rem;margin-bottom:4px;letter-spacing:-.01em}
  .st-h2p{font-size:.98rem}
  .st-cards{gap:20px}

  .st-card{padding:30px 34px}
  .st-card-head{gap:16px;margin-bottom:24px}
  .st-card-tx{flex-basis:280px}
  .st-card-ico{width:48px;height:48px;border-radius:14px}
  .st-card h3{font-size:1.2rem;margin-bottom:6px}
  .st-card .st-sub{font-size:.92rem;line-height:1.85}
  .st-split{grid-template-columns:minmax(0,1fr) minmax(300px,420px);gap:36px;align-items:start}
  .st-sep{margin:24px 0}

  .st-lbl{font-size:.84rem;margin-bottom:8px}
  .st-wrap .st-input{min-height:52px;font-size:1rem;border-radius:14px;padding:0 16px}
  .st-btn{min-height:50px;padding:0 24px;font-size:.96rem;border-radius:14px}
  .st-btn.sm{min-height:42px;padding:0 16px;font-size:.84rem}
  .st-note{padding:13px 16px;font-size:.9rem;border-radius:14px}
  .st-switch{font-size:.92rem}
  .st-switch-track{width:54px;height:32px}
  .st-switch-dot{width:26px;height:26px}
  .st-switch.on .st-switch-dot{inset-inline-start:25px}
  .st-seg-b{min-height:44px;padding:0 18px;font-size:.88rem}
  .st-seg.track .st-seg-b{min-height:46px;padding:0 22px}
  .st-kv{grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
  .st-kv > div{padding:14px 18px;border-radius:14px}
  .st-kv span{font-size:.8rem}
  .st-kv b{font-size:1rem}
  .st-chip{font-size:.88rem;padding:6px 8px 6px 16px}
  .st-row{padding:14px 16px;border-radius:16px}
  .st-rows{grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}
  .st-mini{padding:10px 14px}
  .st-check{min-height:52px;padding:10px 16px;font-size:.92rem;border-radius:14px}
  .st-checks{grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
  .st-link{padding:22px 26px;gap:18px}
  .st-link-tx b{font-size:1.05rem}
  .st-link-tx span{font-size:.88rem}
  .st-themes{grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px}
  .st-theme{padding:12px 12px 16px;border-radius:18px;gap:14px}
  .st-theme:hover{transform:translateY(-2px)}
  .st-theme-mock{height:96px;border-radius:12px}
  .st-theme-main{padding:10px;gap:7px}
  .st-theme-bar{height:14px}
  .st-theme-line{height:7px}
  .st-theme-name{font-size:.95rem}
  .st-theme-tick{top:22px;inset-inline-end:22px;width:26px;height:26px}
  .st-toast{bottom:32px;padding:15px 26px;font-size:1rem}
  .st-ver{font-size:2.8rem}
  .st-panel{padding:22px;border-radius:16px}
}

/* شاشات عريضة جداً: بطاقتان جنباً إلى جنب */
@media (min-width:1700px){
  .st-cards{grid-template-columns:repeat(2,minmax(0,1fr))}
}
.st-cards > .st-span{grid-column:1 / -1}
`
