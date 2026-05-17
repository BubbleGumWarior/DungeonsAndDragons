import React, { useEffect, useRef } from 'react';
import { CombatLogEntry } from '../../types/campaignTypes';

interface Props {
  entries: CombatLogEntry[];
  maxHeight?: string;
}

const ACTION_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  damage:       { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)',   icon: '⚔️' },
  heal:         { bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.4)',  icon: '💚' },
  death_save:   { bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.4)',  icon: '☠️' },
  dice_roll:    { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.4)', icon: '🎲' },
  condition:    { bg: 'rgba(var(--theme-accent-rgb),0.12)',  border: 'rgba(var(--theme-accent-rgb),0.4)',  icon: '🌀' },
  concentration:{ bg: 'rgba(20,184,166,0.12)',  border: 'rgba(20,184,166,0.4)',  icon: '🔮' },
  turn_start:   { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.4)',  icon: '▶️' },
  combat_start: { bg: 'rgba(var(--theme-accent-rgb),0.1)',  border: 'rgba(var(--theme-accent-rgb),0.3)', icon: '⚡' },
  default:      { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', icon: '📝' },
};

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function buildDescription(entry: CombatLogEntry): string {
  const { action_type, actor_name, target_name, limb_name, roll_result, damage, details } = entry;
  if (details) return details;
  switch (action_type) {
    case 'damage':
      return `${actor_name} attacked ${target_name}${limb_name ? ` (${limb_name.replace('_', ' ')})` : ''}${roll_result ? ` [Roll: ${roll_result}]` : ''}${damage ? ` — ${damage} damage` : ''}`;
    case 'heal':
      return `${actor_name} healed ${target_name ?? 'themselves'}${damage ? ` for ${damage} hp` : ''}`;
    case 'death_save':
      return `${actor_name} makes a death saving throw`;
    case 'dice_roll':
      return `${actor_name} rolled ${roll_result !== null && roll_result !== undefined ? roll_result : '?'}`;
    case 'condition':
      return `${target_name ?? actor_name} condition changed`;
    case 'turn_start':
      return `${actor_name}'s turn begins`;
    default:
      return `${actor_name}${target_name ? ` → ${target_name}` : ''}`;
  }
}

export const CombatLog: React.FC<Props> = ({ entries, maxHeight = '300px' }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)', borderRadius: '0.5rem',
      border: '1px solid rgba(var(--theme-accent-rgb),0.2)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid rgba(var(--theme-accent-rgb),0.15)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: 'var(--text-gold)', fontWeight: 'bold', fontSize: '0.85rem' }}>📜 Combat Log</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{entries.length} entries</span>
      </div>

      <div style={{ overflowY: 'auto', maxHeight, padding: '0.4rem' }}>
        {entries.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1rem', fontSize: '0.85rem' }}>
            No actions yet...
          </div>
        )}
        {entries.map((entry, i) => {
          const style = ACTION_COLORS[entry.action_type] ?? ACTION_COLORS.default;
          return (
            <div key={entry.id ?? i} style={{
              display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
              padding: '0.35rem 0.6rem', marginBottom: '0.25rem',
              background: style.bg, border: `1px solid ${style.border}`,
              borderRadius: '0.35rem', fontSize: '0.8rem',
            }}>
              <span style={{ flexShrink: 0, fontSize: '1rem' }}>{style.icon}</span>
              <span style={{ color: 'var(--text-secondary)', flexShrink: 0, fontSize: '0.7rem', paddingTop: '0.1rem' }}>
                {formatTime(entry.created_at)}
              </span>
              <span style={{ color: '#e2e8f0', lineHeight: 1.4, flex: 1 }}>
                {buildDescription(entry)}
              </span>
              {entry.damage !== null && entry.damage !== undefined && entry.action_type === 'damage' && (
                <span style={{ color: '#f87171', fontWeight: 'bold', flexShrink: 0 }}>-{entry.damage}</span>
              )}
              {entry.damage !== null && entry.damage !== undefined && entry.action_type === 'heal' && (
                <span style={{ color: '#4ade80', fontWeight: 'bold', flexShrink: 0 }}>+{entry.damage}</span>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default CombatLog;
