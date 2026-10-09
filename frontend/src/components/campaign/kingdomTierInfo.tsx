import React from 'react';
import ReactDOM from 'react-dom';

/**
 * Player-facing tier guide + the upgrade panel for tiers 6-10.
 * Costs mirror backend/utils/kingdomTiers.js — keep the two in sync.
 */

export interface TierInfoEntry {
  tier: number;
  title: string;
  summary: string;
  unlocks: string[];
  management: string;
}

export const TIER_INFO: TierInfoEntry[] = [
  {
    tier: 1,
    title: 'Settlement',
    summary: 'A small camp learning to feed itself.',
    unlocks: ['Tents and basic storage', 'Hunting and farming for food', 'Assigning your people to jobs'],
    management: 'Keep everyone fed and housed, and decide who works where.',
  },
  {
    tier: 2,
    title: 'Village',
    summary: 'Your people start digging, praying and studying.',
    unlocks: ['Quarries for stone', 'Mines for iron', 'Research Lab', 'Faith Temple', 'Barracks and Palisades'],
    management: 'More job types to staff, and your first research to choose.',
  },
  {
    tier: 3,
    title: 'Town',
    summary: 'Real infrastructure and your first soldiers.',
    unlocks: ['Builder\'s Hut', 'Military buildings (archers, swords, spears, cavalry, siege)', 'Trade Post', 'Animal farms and stables', 'Prisons, slaves and overseers', 'Migrant Camp'],
    management: 'You can now train and house an army, keep animals and take in newcomers.',
  },
  {
    tier: 4,
    title: 'City',
    summary: 'Gold becomes its own treasury.',
    unlocks: ['Banks and the Tavern', 'Advanced military buildings', 'Another legendary character slot'],
    management: 'Your people and soldiers now cost gold every day. Watch your income.',
  },
  {
    tier: 5,
    title: 'Great City',
    summary: 'A big population is harder to keep happy.',
    unlocks: ['Boat Yard and docks', 'Amphitheater and other civic buildings', 'Another legendary character slot'],
    management: 'Unrest: if your population outgrows your guards, temples and civic buildings, people get angry, work less and may revolt.',
  },
  {
    tier: 6,
    title: 'Industrial Age',
    summary: 'Raw materials are no longer enough. You start refining them.',
    unlocks: ['Sawyer\'s Workshop, Stonecutter\'s Yard and Steel Foundry', 'Industrial quarries, mines and sawmills', 'Another legendary character slot'],
    management: 'Three new jobs to staff: Planks, Dressed Stone and Steel. Each worker turns 3 raw materials into 1 refined good, twice a day. The bigger tier upgrades need refined goods, so keep workers making them.',
  },
  {
    tier: 7,
    title: 'Age of Shadows',
    summary: 'Your spies can now act beyond your borders.',
    unlocks: ['Espionage missions', 'Another legendary character slot'],
    management: 'Send spies to a target of your choice. Your DM decides how it goes. You only see a progress bar and have to guess how long it will take. Spies who succeed stay in place until you call them home (about 30 days to return).',
  },
  {
    tier: 8,
    title: 'Age of Magic',
    summary: 'Magic powers your kingdom, and it has to be fed.',
    unlocks: ['Mana Wells and a mana job', 'Storage buildings that hold 10× as much', 'Another legendary character slot'],
    management: 'Mana: any building upgraded to its Age of Magic form (or later) uses mana every long rest. If you run out, those buildings stop working until they are powered again and show as Unpowered. Housing and food buildings are powered first, then the highest-level buildings.',
  },
  {
    tier: 9,
    title: 'Empire',
    summary: 'One fief is too small to hold everything.',
    unlocks: ['Provinces ruled by governors', 'Arcane Vaults that hold 10× more again', 'Another legendary character slot'],
    management: 'Keep your governors loyal. A province you neglect may break away.',
  },
  {
    tier: 10,
    title: 'Legacy',
    summary: 'The final age. Build something that will be remembered.',
    unlocks: ['Wonders', 'Dimensional Depositories that hold 10× more again', 'The last legendary character slot'],
    management: 'Only one of each Wonder can exist in the whole campaign, and each fief can hold only one. Your DM decides what a Wonder does. If another kingdom already has the one you want, you will have to destroy it first.',
  },
];

// Costs for the generic upgrade (tiers 6-10). Mirrors backend/utils/kingdomTiers.js.
export const HIGH_TIER_UPGRADES: Record<number, { days: number; cost: Record<string, number> }> = {
  6: { days: 45, cost: { wood: 59000, stone: 32000, minerals: 18000, gold: 20000 } },
  7: { days: 60, cost: { wood: 179000, stone: 113000, minerals: 74000, gold: 67000, planks: 27000, dressed_stone: 17000, steel: 11000 } },
  8: { days: 80, cost: { wood: 544000, stone: 399000, minerals: 302000, gold: 224000, planks: 136000, dressed_stone: 100000, steel: 75000 } },
  9: { days: 105, cost: { wood: 1649000, stone: 1413000, minerals: 1230000, gold: 748000, planks: 577000, dressed_stone: 495000, steel: 430000, mana: 10000 } },
  10: { days: 140, cost: { wood: 5000000, stone: 5000000, minerals: 5000000, gold: 2500000, planks: 2500000, dressed_stone: 2500000, steel: 2500000, mana: 100000 } },
};

const COST_LABEL: Record<string, string> = {
  wood: '🌳 Wood',
  stone: '🪨 Stone',
  minerals: '⛓️ Iron',
  gold: '🪙 Gold',
  planks: '🪵 Planks',
  dressed_stone: '🧱 Dressed Stone',
  steel: '⚔️ Steel',
  mana: '🔮 Mana',
};

const fmt = (n: number) => Math.floor(n).toLocaleString();

export const TierInfoModal: React.FC<{ currentTier: number; onClose: () => void }> = ({ currentTier, onClose }) => {
  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Kingdom tier guide"
        style={{ background: 'var(--bg-secondary, #1c1917)', border: '1px solid rgba(var(--theme-accent-rgb),0.4)', borderRadius: '0.7rem', width: 'min(44rem, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1rem', borderBottom: '1px solid rgba(var(--theme-accent-rgb),0.2)' }}>
          <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '1.1rem' }}>Tier Guide</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '0.8rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {TIER_INFO.map((t) => {
            const reached = currentTier >= t.tier;
            const isCurrent = currentTier === t.tier;
            return (
              <div
                key={t.tier}
                style={{
                  padding: '0.7rem 0.8rem',
                  borderRadius: '0.5rem',
                  border: isCurrent ? '1px solid var(--text-gold)' : '1px solid rgba(var(--theme-accent-rgb),0.15)',
                  background: reached ? 'rgba(var(--theme-accent-rgb),0.08)' : 'rgba(255,255,255,0.02)',
                  opacity: reached ? 1 : 0.85,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Tier {t.tier} · {t.title}</div>
                  {isCurrent && <span style={{ color: 'var(--text-gold)', fontSize: '0.75rem', fontWeight: 700 }}>YOU ARE HERE</span>}
                  {!isCurrent && reached && <span style={{ color: '#86efac', fontSize: '0.75rem' }}>✓ Reached</span>}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0.15rem 0 0.4rem' }}>{t.summary}</div>
                <div style={{ color: '#93c5fd', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>Unlocks</div>
                <ul style={{ margin: '0 0 0.45rem 1.1rem', padding: 0, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                  {t.unlocks.map((u) => <li key={u}>{u}</li>)}
                </ul>
                <div style={{ color: '#fcd34d', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>What you will need to manage</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{t.management}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Info button that opens the tier guide. Sits in the Fief Tier Upgrade header. */
export const TierInfoButton: React.FC<{ currentTier: number }> = ({ currentTier }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="What does each tier unlock?"
        title="What does each tier unlock?"
        style={{
          width: '1.5rem', height: '1.5rem', borderRadius: '50%', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1,
          border: '1px solid rgba(var(--theme-accent-rgb),0.5)', background: 'rgba(var(--theme-accent-rgb),0.12)', color: 'var(--text-gold)',
        }}
      >
        i
      </button>
      {open && <TierInfoModal currentTier={currentTier} onClose={() => setOpen(false)} />}
    </>
  );
};

interface HighTierPanelProps {
  currentTier: number;
  daysRemaining: number;
  target: number;
  stored: Record<string, number>;
  busy: boolean;
  onStart: () => void;
}

/** Upgrade panel for tiers 6-10: shows progress, what the next tier unlocks, and its cost. */
export const HighTierUpgradePanel: React.FC<HighTierPanelProps> = ({ currentTier, daysRemaining, target, stored, busy, onStart }) => {
  if (currentTier >= 10) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '0.5rem 0' }}>✓ Maximum tier reached</div>;
  }
  const nextTier = currentTier + 1;
  const config = HIGH_TIER_UPGRADES[nextTier];
  const info = TIER_INFO.find((t) => t.tier === nextTier);

  if (daysRemaining > 0) {
    return (
      <div style={{ marginBottom: '0.6rem' }}>
        <div style={{ color: 'var(--text-gold)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.35rem' }}>⏳ Tier {target || nextTier} Upgrade in Progress</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', textAlign: 'center', padding: '0.5rem', background: 'rgba(34,197,94,0.15)', borderRadius: '0.4rem' }}>
          {daysRemaining} day(s) remaining
        </div>
      </div>
    );
  }
  if (!config || !info) return null;

  const entries = Object.entries(config.cost);
  const canAfford = entries.every(([k, v]) => Number(stored[k] || 0) >= v);

  return (
    <>
      <div style={{ marginBottom: '0.6rem' }}>
        <div style={{ color: '#93c5fd', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 600 }}>Tier {nextTier} · {info.title} will unlock:</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
          {info.unlocks.map((u) => (
            <div key={u} style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '0.3rem 0.5rem', background: 'rgba(var(--theme-accent-rgb),0.1)', borderRadius: '0.3rem', textAlign: 'center' }}>🔓 {u}</div>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: '0.6rem', padding: '0.4rem 0.55rem', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '0.35rem' }}>
        <span style={{ color: '#fcd34d', fontSize: '0.76rem' }}>⚠️ {info.management}</span>
      </div>
      <div style={{ marginBottom: '0.6rem' }}>
        <div style={{ color: '#86efac', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 600 }}>Requirements:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: 'rgba(217,119,6,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>⏱️ Time:</span><span style={{ fontWeight: 600 }}>{config.days} days</span>
          </div>
          {entries.map(([key, required]) => {
            const have = Number(stored[key] || 0);
            const ok = have >= required;
            return (
              <div key={key} style={{ color: 'var(--text-primary)', fontSize: '0.9rem', padding: '0.35rem 0.5rem', background: ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>{COST_LABEL[key] || key}:</span>
                <span style={{ fontWeight: 600, color: ok ? '#86efac' : '#ef4444' }}>{ok ? '✓' : '✗'} {fmt(have)}/{fmt(required)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <button
        onClick={onStart}
        disabled={busy || !canAfford}
        style={{
          width: '100%', padding: '0.55rem 0.8rem', borderRadius: '0.45rem', border: '1px solid rgba(var(--theme-accent-rgb),0.5)',
          background: 'rgba(120,53,15,0.5)', color: 'var(--text-gold)', cursor: busy || !canAfford ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: '0.95rem', opacity: busy || !canAfford ? 0.6 : 1,
        }}
      >
        {busy ? 'Starting...' : `Start Tier ${nextTier} Upgrade`}
      </button>
    </>
  );
};
