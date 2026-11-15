// أنماط صفحة نداء الركاب (معزولة بالبادئة cl-). الجوال هو الأساس، والكمبيوتر يوسّع عبر media query.
export const CALL_CSS = `
.cl-page{width:100%;max-width:min(100%,1560px);margin:0 auto;padding:clamp(16px,2vw,32px);box-sizing:border-box;color:var(--text-1)}
.cl-note{border-radius:12px;padding:12px 14px;font-size:.82rem;font-weight:600;line-height:1.8;margin-bottom:12px;border:1px solid}
.cl-note.warn{background:color-mix(in srgb,#d97706 10%,var(--card));border-color:color-mix(in srgb,#d97706 40%,var(--border-2));color:#b45309}
.cl-note.err{background:color-mix(in srgb,#dc2626 9%,var(--card));border-color:color-mix(in srgb,#dc2626 40%,var(--border-2));color:#dc2626}

.cl-grid{display:flex;flex-direction:column;gap:12px}
.cl-main,.cl-side{display:flex;flex-direction:column;gap:12px;min-width:0}

.cl-seg{display:flex;gap:4px;padding:4px;background:var(--surface);border:1px solid var(--border);border-radius:12px}
.cl-seg button{flex:1;border:none;background:transparent;color:var(--text-2);font:inherit;font-size:.85rem;font-weight:800;padding:9px 14px;border-radius:9px;cursor:pointer;transition:background .15s,color .15s}
.cl-seg button.on{background:var(--card);color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.14)}
.cl-seg button:not(.on):hover{color:var(--text-1)}

.cl-card{background:var(--card);border:1px solid var(--border-2);border-radius:14px;padding:14px;min-width:0}
.cl-card-h{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.cl-step{width:26px;height:26px;flex-shrink:0;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 14%,var(--card));color:var(--accent);font-weight:900;font-size:.8rem;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace}
.cl-card-t{font-weight:900;font-size:.92rem;color:var(--text-1);line-height:1.3}
.cl-card-s{font-size:.72rem;color:var(--text-3);margin-top:2px;line-height:1.6;font-weight:500}
.cl-card-h .cl-grow{flex:1;min-width:0}
.cl-link{border:none;background:none;color:var(--accent);font:inherit;font-size:.78rem;font-weight:800;cursor:pointer;padding:4px 6px;border-radius:6px}
.cl-link:hover{background:var(--surface)}
.cl-link.mute{color:var(--text-3)}

.cl-pickers{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.cl-label{display:block;font-size:.74rem;font-weight:800;color:var(--text-2);margin-bottom:6px}
.cl-input{width:100%;box-sizing:border-box;border:1px solid var(--border-2);background:var(--card);color:var(--text-1);border-radius:10px;padding:9px 12px;font:inherit;font-size:.88rem;outline:none;transition:border-color .15s,box-shadow .15s}
.cl-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}
.cl-input:disabled{background:var(--surface);color:var(--text-3);cursor:not-allowed}
textarea.cl-input{resize:vertical;line-height:1.9}

.cl-list{border:1px solid var(--border);border-radius:12px;overflow-y:auto;max-height:13rem;background:var(--card);margin-top:8px;scrollbar-width:thin;scrollbar-color:var(--border-2) transparent}
.cl-list.tall{max-height:16rem}
.cl-trip{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;text-align:start;padding:10px 12px;border:none;border-bottom:1px solid var(--border);background:transparent;cursor:pointer;font:inherit;color:var(--text-1);position:relative;transition:background .12s}
.cl-trip:last-child{border-bottom:none}
.cl-trip:hover{background:var(--surface)}
.cl-trip.on{background:color-mix(in srgb,var(--accent) 9%,var(--card))}
.cl-trip.on::before{content:'';position:absolute;inset-block:0;inset-inline-start:0;width:4px;background:var(--accent)}
.cl-tn{min-width:2.9rem;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-weight:900;font-size:.95rem;color:var(--accent)}
.cl-tb{flex:1;min-width:0}
.cl-tr{font-weight:800;font-size:.86rem;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl-tm{font-size:.72rem;color:var(--text-3);font-weight:600;margin-top:1px}
.cl-tt{font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-size:.76rem;color:var(--text-2);font-weight:700;white-space:nowrap;direction:ltr;unicode-bidi:isolate}
.cl-empty{padding:18px 12px;text-align:center;font-size:.82rem;color:var(--text-3);font-weight:600;line-height:1.8}
.cl-empty.big{display:grid;place-content:center;gap:6px;min-height:14rem;border:1px dashed var(--border-2);border-radius:12px}
.cl-empty.big b{color:var(--text-2);font-size:.95rem}

.cl-stop{display:flex;align-items:center;gap:12px;padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s;position:relative}
.cl-stop:last-child{border-bottom:none}
.cl-stop.on{background:color-mix(in srgb,var(--accent) 7%,var(--card))}
.cl-stop input{accent-color:var(--accent);width:16px;height:16px;flex-shrink:0}
.cl-sn{flex:1;min-width:0;font-size:.86rem;font-weight:700;color:var(--text-1);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cl-badge{font-size:.66rem;font-weight:800;padding:2px 8px;border-radius:99px;line-height:1.5;white-space:nowrap}
.cl-badge.org{background:color-mix(in srgb,#16a34a 14%,var(--card));color:#15803d}
.cl-badge.dst{background:color-mix(in srgb,var(--accent) 16%,var(--card));color:var(--accent)}
.cl-badge.ok{background:color-mix(in srgb,#16a34a 12%,var(--card));color:#15803d}
.cl-badge.no{background:color-mix(in srgb,#d97706 14%,var(--card));color:#b45309}
.cl-badge.mute{background:var(--surface);color:var(--text-3)}

.cl-status{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:var(--surface);border:1px solid var(--border);margin-bottom:14px}
.cl-status.live{background:color-mix(in srgb,#dc2626 8%,var(--card));border-color:color-mix(in srgb,#dc2626 35%,var(--border-2))}
.cl-eq{display:flex;align-items:flex-end;gap:3px;height:22px;width:26px;flex-shrink:0}
.cl-eq i{display:block;width:4px;height:5px;border-radius:2px;background:var(--text-3)}
.cl-status.live .cl-eq i{background:#dc2626;animation:clEq .9s ease-in-out infinite}
.cl-status.live .cl-eq i:nth-child(2){animation-delay:.15s}.cl-status.live .cl-eq i:nth-child(3){animation-delay:.3s}.cl-status.live .cl-eq i:nth-child(4){animation-delay:.45s}
@keyframes clEq{0%,100%{height:5px}50%{height:22px}}
@media (prefers-reduced-motion: reduce){.cl-status.live .cl-eq i{animation:none;height:14px}}
.cl-st-t{font-weight:900;font-size:.9rem;color:var(--text-1)}
.cl-st-s{font-size:.72rem;color:var(--text-3);font-weight:600;margin-top:1px}

.cl-target{padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--card);margin-bottom:14px}
.cl-target-k{font-size:.7rem;font-weight:800;color:var(--text-3);letter-spacing:.02em}
.cl-target-v{font-size:1.1rem;font-weight:900;color:var(--text-1);margin-top:3px;line-height:1.4}
.cl-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.cl-chip{font-size:.74rem;font-weight:700;padding:3px 10px;border-radius:99px;background:var(--surface);border:1px solid var(--border);color:var(--text-2)}

.cl-hint{font-size:.72rem;color:var(--text-3);margin:6px 0 0;line-height:1.7;font-weight:500}
.cl-opts{display:flex;flex-direction:column;gap:12px;margin-top:14px}
.cl-opt-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cl-opt-row>label,.cl-opt-k{font-size:.78rem;font-weight:800;color:var(--text-2);flex-shrink:0}
.cl-check{display:flex;align-items:center;gap:8px;font-size:.84rem;font-weight:700;color:var(--text-1);cursor:pointer}
.cl-check input{accent-color:var(--accent);width:16px;height:16px}
.cl-sel{flex:1;min-width:0}

.cl-ready{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:10px;font-size:.78rem;font-weight:700;margin-top:12px;border:1px solid}
.cl-ready.ok{background:color-mix(in srgb,#16a34a 9%,var(--card));border-color:color-mix(in srgb,#16a34a 35%,var(--border-2));color:#15803d}
.cl-ready.no{background:color-mix(in srgb,#d97706 10%,var(--card));border-color:color-mix(in srgb,#d97706 38%,var(--border-2));color:#b45309}
.cl-ready span{flex:1;min-width:0;line-height:1.7}

.cl-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--border-2);background:var(--surface);color:var(--text-1);font:inherit;font-size:.84rem;font-weight:800;cursor:pointer;white-space:nowrap;transition:filter .12s,background .12s}
.cl-btn:hover:not(:disabled){filter:brightness(.97);background:var(--surface-2)}
.cl-btn:disabled{opacity:.4;cursor:not-allowed}
.cl-btn.sm{height:34px;padding:0 12px;font-size:.76rem;border-radius:9px}
.cl-btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}
.cl-btn.pri:hover:not(:disabled){background:var(--accent);filter:brightness(1.08)}
.cl-btn.stop{background:color-mix(in srgb,#dc2626 10%,var(--card));border-color:color-mix(in srgb,#dc2626 40%,var(--border-2));color:#dc2626}
.cl-btn.warn{background:#d97706;border-color:#d97706;color:#fff}
.cl-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.cl-go{flex:1;min-width:150px;height:52px;font-size:1rem;font-weight:900}
.cl-actions .cl-btn.stop{align-self:stretch;height:auto}

.cl-hist{display:flex;flex-direction:column}
.cl-h-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)}
.cl-h-item:last-child{border-bottom:none}
.cl-h-time{font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-size:.76rem;font-weight:700;color:var(--text-3);direction:ltr;flex-shrink:0}
.cl-h-b{flex:1;min-width:0}
.cl-h-t{font-size:.84rem;font-weight:800;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl-h-s{font-size:.7rem;color:var(--text-3);font-weight:600;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.cl-lib-toggle{display:flex;align-items:center;justify-content:space-between;width:100%;text-align:start;border:none;background:none;font:inherit;cursor:pointer;color:var(--text-1);padding:0}
.cl-lib{display:flex;flex-direction:column;gap:14px}
.cl-lib-info{font-size:.78rem;color:var(--text-2);line-height:1.9;margin:0;font-weight:500}
.cl-phrases{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.cl-phrase{border:1px solid var(--border-2);border-radius:12px;padding:12px;background:var(--surface)}
.cl-phrase-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;font-size:.8rem;font-weight:800}
.cl-phrase-b{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-file{font-size:.72rem;color:var(--text-2);min-width:0;max-width:100%;flex:1}
.cl-lib-bar{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.cl-fix{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-radius:12px;border:1px solid color-mix(in srgb,#d97706 45%,var(--border-2));background:color-mix(in srgb,#d97706 9%,var(--card));padding:10px 12px;margin-bottom:10px}
.cl-fix p{flex:1;min-width:200px;margin:0;font-size:.78rem;color:#b45309;line-height:1.8;font-weight:600}
.cl-lib-rows{border:1px solid var(--border);border-radius:12px;max-height:20rem;overflow-y:auto;background:var(--card)}
.cl-lib-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--border)}
.cl-lib-row:last-child{border-bottom:none}
.cl-lib-name{flex:1;min-width:0;font-size:.84rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl-lib-edit{width:100%;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-lib-edit .cl-input{flex:1;min-width:150px;padding:7px 10px;font-size:.84rem}
.cl-lib-edit .cl-input.bad{border-color:#d97706;background:color-mix(in srgb,#d97706 9%,var(--card))}
.cl-lib-old{font-size:.7rem;color:var(--text-3);max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl-file.sm{flex:none;width:7rem}

/* ===== الكمبيوتر ===== */
@media (min-width:900px){
  .cl-grid{gap:20px}
  .cl-main,.cl-side{gap:20px}
  .cl-note{font-size:.92rem;padding:14px 18px;margin-bottom:18px}
  .cl-seg{max-width:460px}
  .cl-seg button{font-size:.95rem;padding:12px 18px}
  .cl-card{border-radius:18px;padding:22px}
  .cl-card-h{margin-bottom:16px;gap:12px}
  .cl-step{width:32px;height:32px;border-radius:10px;font-size:.95rem}
  .cl-card-t{font-size:1.08rem}
  .cl-card-s{font-size:.82rem}
  .cl-link{font-size:.86rem}
  .cl-pickers{grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;align-items:start}
  .cl-label{font-size:.82rem}
  .cl-input{font-size:.98rem;padding:12px 16px;border-radius:12px}
  textarea.cl-input{font-size:1.08rem;padding:16px 18px;min-height:9.5rem}
  .cl-list{max-height:clamp(320px,52vh,560px)}
  .cl-list.tall{max-height:clamp(320px,52vh,560px)}
  .cl-trip{padding:13px 16px;gap:16px}
  .cl-tn{font-size:1.15rem;min-width:3.6rem}
  .cl-tr{font-size:.98rem}
  .cl-tm{font-size:.8rem;margin-top:2px}
  .cl-tt{font-size:.86rem}
  .cl-empty{font-size:.92rem}
  .cl-stop{padding:12px 16px;gap:14px}
  .cl-stop input{width:18px;height:18px}
  .cl-sn{font-size:.98rem}
  .cl-badge{font-size:.74rem;padding:3px 10px}
  .cl-status{padding:16px 18px;border-radius:14px}
  .cl-eq{height:28px;width:32px}
  @keyframes clEq{0%,100%{height:6px}50%{height:28px}}
  .cl-st-t{font-size:1.05rem}
  .cl-st-s{font-size:.82rem}
  .cl-target{padding:16px 18px;border-radius:14px}
  .cl-target-k{font-size:.78rem}
  .cl-target-v{font-size:1.5rem}
  .cl-chip{font-size:.84rem;padding:4px 12px}
  .cl-hint{font-size:.8rem}
  .cl-opts{gap:16px;margin-top:18px}
  .cl-opt-row>label,.cl-opt-k{font-size:.88rem}
  .cl-check{font-size:.94rem}
  .cl-ready{font-size:.86rem;padding:12px 14px}
  .cl-btn{height:48px;font-size:.92rem;padding:0 20px}
  .cl-btn.sm{height:38px;font-size:.84rem}
  .cl-actions{gap:10px;margin-top:20px}
  .cl-go{height:62px;font-size:1.2rem;border-radius:14px}
  .cl-h-item{padding:12px 0;gap:14px}
  .cl-h-time{font-size:.86rem}
  .cl-h-t{font-size:.96rem}
  .cl-h-s{font-size:.78rem}
  .cl-lib-info{font-size:.88rem}
  .cl-phrases{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .cl-phrase{padding:16px;border-radius:14px}
  .cl-phrase-h{font-size:.9rem}
  .cl-file{font-size:.8rem}
  .cl-fix p{font-size:.86rem}
  .cl-lib-rows{max-height:none}
  .cl-lib-row{padding:10px 16px;gap:12px}
  .cl-lib-name{font-size:.96rem}
  .cl-lib-edit .cl-input{font-size:.92rem}
  .cl-file{min-width:13rem}
  .cl-file.sm{width:15rem}
  .cl-file::file-selector-button{margin-inline-end:8px;padding:5px 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--card);color:var(--text-1);font:inherit;font-weight:700;cursor:pointer}
}
@media (min-width:1180px){
  .cl-grid{display:grid;grid-template-columns:minmax(0,1fr) clamp(400px,31vw,520px);align-items:start}
}
`
