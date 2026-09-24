import React, { useEffect, useRef } from 'react';

/* ───────────────────────── View model ───────────────────────── */

export interface RosterPip {
  /** Filled (available / active) vs hollow (spent / empty) */
  on: boolean;
  title: string;
  /** When set the pip renders as a button (DM controls) */
  onClick?: () => void;
}

export type RosterTone = 'arcane' | 'pact' | 'trick' | 'reap' | 'step' | 'shadow';

export interface RosterTrack {
  key: string;
  label: string;
  tone: RosterTone;
  groups: { label?: string; pips: RosterPip[] }[];
}

export interface RosterEntry {
  id: number;
  name: string;
  imageUrl?: string;
  online: boolean;
  classLine: string;
  /** Class name, used to tint the monogram */
  classKey: string;
  subclass?: { name?: string; missing?: boolean; assignTitle?: string; onAssign?: () => void };
  detail: string;
  hp: { current: number; max: number };
  xp: { current: number; required: number; pct: number; maxed: boolean; ready: boolean };
  tracks: RosterTrack[];
}

interface Props {
  entries: RosterEntry[];
  selectedId: number | null;
  keyboardNav: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (id: number) => void;
}

const TONES: Record<RosterTone, string> = {
  arcane: '#7cc8f2',
  pact: '#c39bff',
  trick: '#fb9a54',
  reap: '#b39dfa',
  step: '#8f9bff',
  shadow: '#f47a7a',
};

/** Stable hue per name so portraits without an image still read as individuals. */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function hpState(current: number, max: number): { color: string; label: 'dead' | 'critical' | 'hurt' | 'healthy' } {
  const pct = max > 0 ? (current / max) * 100 : 0;
  if (current <= 0) return { color: '#ef5b5b', label: 'dead' };
  if (pct > 50) return { color: '#5ec27b', label: 'healthy' };
  if (pct > 25) return { color: '#e6b84a', label: 'hurt' };
  return { color: '#ef5b5b', label: 'critical' };
}

const IconChevronLeft: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

const IconStar: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" />
  </svg>
);

/* ───────────────────────── Styles ───────────────────────── */

const ROSTER_CSS = `
.rs-panel {
  --rs-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --rs-text: #f0ece2;
  --rs-muted: rgba(240,236,226,0.64);
  --rs-line: rgba(255,255,255,0.08);
  position: sticky; top: 1rem; flex: 1;
  display: flex; flex-direction: column;
  max-height: calc(100vh - 2rem);
  overflow-y: auto; overscroll-behavior: contain;
  padding: 14px !important;
  scrollbar-width: thin; scrollbar-color: rgba(var(--theme-accent-rgb), 0.35) transparent;
  color: var(--rs-text);
  text-align: left;
}
.rs-panel *, .rs-panel *::before, .rs-panel *::after { box-sizing: border-box; }

.rs-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 2px 2px 12px; }
.rs-title { margin: 0; font-family: var(--font-fantasy, serif); font-size: 1.1rem; letter-spacing: 0.05em; color: var(--text-gold, #d4c19c); line-height: 1.2; }
.rs-sub { margin-top: 3px; display: flex; align-items: center; gap: 8px; font-size: 0.74rem; color: var(--rs-muted); }
.rs-kbd { display: inline-flex; gap: 3px; }
.rs-kbd kbd { min-width: 18px; height: 18px; display: inline-grid; place-items: center; padding: 0 4px; border-radius: 5px; border: 1px solid var(--rs-line); background: rgba(255,255,255,0.05); font: inherit; font-size: 0.66rem; color: var(--rs-muted); }
.rs-head .rs-collapse { width: 34px; height: 34px; min-width: 0; margin: 0; padding: 0; display: grid; place-items: center; flex: none; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--rs-muted); cursor: pointer; transition: background 0.15s ease, color 0.15s ease, transform 0.2s var(--rs-ease); }
.rs-head .rs-collapse:hover { background: rgba(255,255,255,0.08); color: var(--rs-text); }
.rs-head .rs-collapse:active { transform: scale(0.9); }
.rs-head .rs-collapse:focus-visible, .rs-hit:focus-visible, .rs-pip-btn:focus-visible, .rs-assign:focus-visible { outline: 2px solid rgba(var(--theme-accent-rgb), 0.9); outline-offset: 2px; }

.rs-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

.rs-card {
  position: relative; padding: 13px; border-radius: 16px;
  background: rgba(255,255,255,0.045);
  border: 1px solid rgba(var(--theme-accent-rgb), 0.15);
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.35s var(--rs-ease);
  animation: rs-in 0.55s var(--rs-ease) both; animation-delay: calc(var(--i, 0) * 50ms);
}
.rs-card:hover { background: rgba(255,255,255,0.075); border-color: rgba(var(--theme-accent-rgb), 0.34); }
.rs-card.sel { background: rgba(var(--theme-accent-rgb), 0.13); border-color: rgba(var(--theme-accent-rgb), 0.72); box-shadow: 0 0 0 1px rgba(var(--theme-accent-rgb), 0.3), 0 14px 28px -14px rgba(0,0,0,0.9); }
.rs-card.sel.kbd { box-shadow: 0 0 0 4px rgba(var(--theme-accent-rgb), 0.28), 0 14px 28px -14px rgba(0,0,0,0.9); }
.rs-hit { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; padding: 0; border: 0; border-radius: inherit; background: transparent; cursor: pointer; }
.rs-body { position: relative; pointer-events: none; }

.rs-top { display: flex; align-items: center; gap: 12px; }
.rs-avatar { position: relative; flex: none; width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; font-family: var(--font-fantasy, serif); font-size: 1.3rem; font-weight: 700; border: 1px solid; }
.rs-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; object-position: center top; border-radius: 13px; display: block; }
.rs-online { position: absolute; right: -4px; bottom: -4px; width: 13px; height: 13px; border-radius: 50%; background: #5ec27b; border: 2.5px solid #17161a; }
.rs-who { min-width: 0; flex: 1; }
.rs-name { font-family: var(--font-fantasy, serif); font-size: 1.02rem; color: #f6f2e8; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-class { margin-top: 2px; font-size: 0.78rem; color: var(--rs-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-subclass { margin-top: 3px; display: inline-flex; align-items: center; gap: 5px; font-size: 0.74rem; font-weight: 600; color: var(--accent-highlight, #00d9ff); }
.rs-subclass.none { font-weight: 500; color: var(--rs-muted); }
.rs-assign { pointer-events: auto; position: relative; z-index: 2; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-decoration: underline dotted; text-underline-offset: 3px; cursor: pointer; }
.rs-assign:hover { color: var(--rs-text); }

.rs-vitals { margin-top: 13px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px 10px; }
.rs-lab { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.09em; color: var(--rs-muted); }
.rs-val { font-size: 0.78rem; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; color: var(--rs-text); }
.rs-val.small { font-size: 0.72rem; font-weight: 500; color: var(--rs-muted); }
.rs-val.ready { font-weight: 700; color: var(--text-gold, #d4c19c); }
.rs-bar { position: relative; height: 8px; border-radius: 999px; background: rgba(0,0,0,0.5); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); overflow: hidden; }
.rs-bar.thin { height: 5px; }
.rs-fill, .rs-ghost { position: absolute; inset: 0 auto 0 0; border-radius: 999px; transform-origin: left center; }
.rs-fill { transition: width 0.55s var(--rs-ease), background-color 0.3s ease; animation: rs-grow 0.8s var(--rs-ease) both; animation-delay: calc(var(--i, 0) * 50ms + 160ms); }
.rs-ghost { background: rgba(239,91,91,0.5); transition: width 1s var(--rs-ease) 0.4s; }
.rs-card.dead .rs-avatar { filter: grayscale(1) brightness(0.75); }
.rs-card.dead .rs-name { color: rgba(246,242,232,0.6); text-decoration: line-through; text-decoration-thickness: 1px; }

.rs-tracks { margin-top: 12px; padding-top: 11px; border-top: 1px solid var(--rs-line); display: flex; flex-direction: column; gap: 10px; }
.rs-track { display: flex; align-items: center; gap: 10px; }
.rs-tlab { flex: none; width: 56px; font-size: 0.64rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--tone); }
.rs-groups { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; }
.rs-group { display: inline-flex; align-items: center; }
.rs-glab { margin-right: 6px; min-width: 14px; font-family: var(--font-fantasy, serif); font-size: 0.74rem; color: var(--tone); }
.rs-pips { display: inline-flex; align-items: center; }

/* Multi-level tracks (spell slots): a header with a running total, then one tidy cell per level */
.rs-track.grid { flex-direction: column; align-items: stretch; gap: 7px; }
.rs-thead { display: flex; align-items: baseline; justify-content: space-between; }
.rs-thead .rs-tlab { width: auto; }
.rs-tsum { font-size: 0.72rem; font-variant-numeric: tabular-nums; color: var(--rs-muted); }
.rs-tsum b { color: var(--rs-text); font-weight: 600; }
.rs-tgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.rs-cell { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 4px 10px 4px 9px; border-radius: 10px; background: rgba(255,255,255,0.045); border: 1px solid var(--rs-line); transition: opacity 0.3s ease, border-color 0.3s ease; }
.rs-cell .rs-glab { width: 18px; min-width: 18px; margin: 0; text-align: center; }
.rs-cell .rs-pips { flex: 1; min-width: 0; }
.rs-cell .rs-cnt { margin-left: auto; font-size: 0.7rem; font-variant-numeric: tabular-nums; color: var(--rs-muted); }
.rs-cell.spent { opacity: 0.5; }

.rs-pip, .rs-pip-btn { position: relative; width: 16px; height: 16px; padding: 0; border: 0; background: transparent; display: grid; place-items: center; }
.rs-pip-btn { pointer-events: auto; z-index: 2; cursor: pointer; }
.rs-pip::before, .rs-pip-btn::before { content: ''; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--tone); background: var(--tone); transition: transform 0.3s var(--rs-ease), background-color 0.2s ease, opacity 0.2s ease; }
.rs-pip.off::before, .rs-pip-btn.off::before { background: transparent; opacity: 0.4; transform: scale(0.78); }
.rs-pip-btn:hover::before { transform: scale(1.35); }
.rs-pip-btn:active::before { transform: scale(0.9); }

@keyframes rs-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes rs-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

@media (max-width: 768px) {
  .rs-panel { max-height: none; }
}
@media (prefers-reduced-motion: reduce) {
  .rs-panel *, .rs-panel *::before, .rs-panel *::after {
    animation-duration: 0.01ms !important; animation-delay: 0s !important;
    transition-duration: 0.01ms !important; transition-delay: 0s !important;
  }
}
`;

/* ───────────────────────── Component ───────────────────────── */

const CharacterRoster: React.FC<Props> = ({ entries, selectedId, keyboardNav, collapsed, onToggleCollapsed, onSelect }) => {
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the selected card visible while arrowing through a long roster
  useEffect(() => {
    if (selectedId === null || !keyboardNav) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cid="${selectedId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId, keyboardNav]);

  return (
    <div className="glass-panel rs-panel">
      <style>{ROSTER_CSS}</style>

      <div className="rs-head">
        <div>
          <h3 className="rs-title">Characters</h3>
          <div className="rs-sub">
            <span>{entries.length} in the campaign</span>
            {entries.length > 1 && (
              <span className="rs-kbd" title="Use the arrow keys to move between characters"><kbd>↑</kbd><kbd>↓</kbd></span>
            )}
          </div>
        </div>
        <button className="character-list-collapse-btn rs-collapse" onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Show character list' : 'Hide character list'} title={collapsed ? 'Show character list' : 'Hide character list'}>
          <IconChevronLeft />
        </button>
      </div>

      {!collapsed && (
        <ul className="rs-list" ref={listRef}>
          {entries.map((e, i) => {
            const selected = selectedId === e.id;
            const hp = hpState(e.hp.current, e.hp.max);
            const hpPct = e.hp.max > 0 ? Math.max(0, Math.min(100, (e.hp.current / e.hp.max) * 100)) : 0;
            const hue = hueOf(e.classKey);
            return (
              <li key={e.id} data-cid={e.id} className={`rs-card${selected ? ' sel' : ''}${selected && keyboardNav ? ' kbd' : ''}${hp.label === 'dead' ? ' dead' : ''}`}
                style={{ ['--i' as any]: Math.min(i, 8) }}>
                <button className="rs-hit" onClick={() => onSelect(e.id)} aria-pressed={selected} aria-label={`Select ${e.name}`} />
                <div className="rs-body">
                  <div className="rs-top">
                    <div className="rs-avatar" style={e.imageUrl ? { borderColor: `hsl(${hue} 40% 42%)` } : { background: `hsl(${hue} 38% 19%)`, color: `hsl(${hue} 62% 76%)`, borderColor: `hsl(${hue} 38% 38%)` }}>
                      {e.imageUrl ? <img src={e.imageUrl} alt="" /> : e.name.trim().charAt(0).toUpperCase()}
                      {e.online && <span className="rs-online" title="Online" />}
                    </div>
                    <div className="rs-who">
                      <div className="rs-name" title={e.name}>{e.name}</div>
                      <div className="rs-class">{e.classLine}</div>
                      {e.subclass && (
                        e.subclass.missing ? (
                          <div className="rs-subclass none">
                            {e.subclass.onAssign
                              ? <button className="rs-assign" onClick={ev => { ev.stopPropagation(); e.subclass!.onAssign!(); }} title={e.subclass.assignTitle}>No subclass</button>
                              : <span title={e.subclass.assignTitle}>No subclass</span>}
                          </div>
                        ) : (
                          <div className="rs-subclass"><IconStar />{e.subclass.name}</div>
                        )
                      )}
                    </div>
                  </div>

                  <div className="rs-vitals">
                    <span className="rs-lab">HP</span>
                    <div className="rs-bar" role="progressbar" aria-label={`${e.name} hit points`} aria-valuemin={0} aria-valuemax={e.hp.max} aria-valuenow={Math.max(0, e.hp.current)}>
                      <div className="rs-ghost" style={{ width: `${hpPct}%` }} />
                      <div className="rs-fill" style={{ width: `${hpPct}%`, background: hp.color }} />
                    </div>
                    <span className="rs-val" style={hp.label === 'healthy' ? undefined : { color: hp.color }}>
                      {hp.label === 'dead' ? 'Dead' : `${e.hp.current}/${e.hp.max}`}
                    </span>

                    <span className="rs-lab">XP</span>
                    <div className="rs-bar thin" role="progressbar" aria-label={`${e.name} experience`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(e.xp.pct)}>
                      <div className="rs-fill" style={{ width: `${e.xp.maxed ? 100 : Math.min(100, e.xp.pct)}%`, background: 'rgb(var(--theme-accent-rgb))' }} />
                    </div>
                    <span className={`rs-val ${e.xp.ready || e.xp.maxed ? 'ready' : 'small'}`}>
                      {e.xp.maxed ? 'Max' : e.xp.ready ? 'Level up' : `${e.xp.current}/${e.xp.required}`}
                    </span>
                  </div>

                  {e.tracks.length > 0 && (
                    <div className="rs-tracks">
                      {e.tracks.map(track => {
                        const renderPips = (g: RosterTrack['groups'][number]) => [...g.pips].sort((a, b) => Number(b.on) - Number(a.on)).map((p, pi) => p.onClick ? (
                          <button key={pi} className={`rs-pip-btn${p.on ? '' : ' off'}`} title={p.title} aria-label={`${track.label}${g.label ? ` ${g.label}` : ''}: ${p.title}`}
                            onClick={ev => { ev.stopPropagation(); p.onClick!(); }} />
                        ) : (
                          <span key={pi} className={`rs-pip${p.on ? '' : ' off'}`} title={p.title} />
                        ));
                        const tone = { ['--tone' as any]: TONES[track.tone] };

                        // Several levels: header + one cell per level
                        if (track.groups.length > 1) {
                          const total = track.groups.reduce((n, g) => n + g.pips.length, 0);
                          const left = track.groups.reduce((n, g) => n + g.pips.filter(p => p.on).length, 0);
                          return (
                            <div key={track.key} className="rs-track grid" style={tone}>
                              <div className="rs-thead">
                                <span className="rs-tlab">{track.label}</span>
                                <span className="rs-tsum"><b>{left}</b> of {total} left</span>
                              </div>
                              <div className="rs-tgrid">
                                {track.groups.map((g, gi) => {
                                  const gLeft = g.pips.filter(p => p.on).length;
                                  return (
                                    <div key={gi} className={`rs-cell${gLeft === 0 ? ' spent' : ''}`}>
                                      {g.label && <span className="rs-glab">{g.label}</span>}
                                      <span className="rs-pips">{renderPips(g)}</span>
                                      <span className="rs-cnt">{gLeft}/{g.pips.length}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        // Single group: label and pips on one line
                        return (
                          <div key={track.key} className="rs-track" style={tone}>
                            <span className="rs-tlab">{track.label}</span>
                            <div className="rs-groups">
                              {track.groups.map((g, gi) => (
                                <span key={gi} className="rs-group">
                                  {g.label && <span className="rs-glab">{g.label}</span>}
                                  <span className="rs-pips">{renderPips(g)}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default CharacterRoster;
