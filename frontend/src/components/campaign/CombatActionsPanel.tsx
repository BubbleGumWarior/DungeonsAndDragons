import React, { useState } from 'react';
import { ActionEconomy, CombatCondition, DotCondition } from '../../types/campaignTypes';

const D5E_CONDITIONS: CombatCondition[] = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened',
  'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified',
  'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

interface Combatant {
  characterId: string | number;
  name: string;
  isMonster?: boolean;
  playerId?: number;
  conditions?: string[];
  concentration_spell?: string | null;
}

interface Props {
  activeCombatant: Combatant | null;
  isMyTurn: boolean;
  isDM: boolean;
  actionEconomy: ActionEconomy | null;
  onAttack: () => void;
  onDealDamage: () => void;
  onHealHealth: () => void;
  onOpenStatusEffects: () => void;
  onSpendAction: (type: 'action' | 'bonus_action' | 'reaction', spent: boolean) => void;
  onAddCondition: (condition: string) => void;
  onRemoveCondition: (condition: string) => void;
  onRemoveCombatant: () => void;
  onRequestDiceRoll: (params: { diceType: string; modifier: string; rollPurpose: string; purposeDetail: string }) => void;
  onQuickRequestRoll: () => void;
  dotConditions?: DotCondition[];
  onRemoveDotCondition?: (dotType: string) => void;
}

const Slot: React.FC<{ used: boolean; label: string; onClick?: () => void }> = ({ used, label, onClick }) => (
  <button onClick={onClick}
    title={`${label}: ${used ? 'Used' : 'Available'}`}
    style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '0.35rem 0.6rem', borderRadius: '0.4rem', cursor: onClick ? 'pointer' : 'default',
      background: used ? 'rgba(239,68,68,0.15)' : 'rgba(74,222,128,0.12)',
      border: `1px solid ${used ? 'rgba(239,68,68,0.4)' : 'rgba(74,222,128,0.4)'}`,
      minWidth: '60px',
    }}>
    <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{used ? '●' : '○'}</span>
    <span style={{ fontSize: '0.65rem', color: used ? '#f87171' : '#4ade80', marginTop: '0.2rem' }}>{label}</span>
  </button>
);

const conditionColor = (c: string): { bg: string; border: string; color: string } => {
  if (['Stunned', 'Paralyzed', 'Unconscious', 'Incapacitated', 'Petrified'].includes(c))
    return { bg: 'rgba(239,68,68,0.2)', border: 'rgba(239,68,68,0.5)', color: '#f87171' };
  if (['Grappled', 'Restrained'].includes(c))
    return { bg: 'rgba(249,115,22,0.2)', border: 'rgba(249,115,22,0.5)', color: '#fb923c' };
  if (['Blinded', 'Deafened'].includes(c))
    return { bg: 'rgba(148,163,184,0.2)', border: 'rgba(148,163,184,0.5)', color: '#94a3b8' };
  if (c === 'Frightened')
    return { bg: 'rgba(167,139,250,0.2)', border: 'rgba(167,139,250,0.5)', color: '#a78bfa' };
  if (c === 'Charmed')
    return { bg: 'rgba(244,114,182,0.2)', border: 'rgba(244,114,182,0.5)', color: '#f472b6' };
  if (c === 'Invisible')
    return { bg: 'rgba(103,232,249,0.2)', border: 'rgba(103,232,249,0.5)', color: '#67e8f9' };
  return { bg: 'rgba(250,204,21,0.15)', border: 'rgba(250,204,21,0.4)', color: '#fbbf24' };
};

const dotConditionStyle: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  Burning:  { bg: 'rgba(249,115,22,0.2)',  border: 'rgba(249,115,22,0.5)',  color: '#fb923c', icon: '🔥' },
  Bleeding: { bg: 'rgba(239,68,68,0.2)',   border: 'rgba(239,68,68,0.5)',   color: '#f87171', icon: '🩸' },
  Poison:   { bg: 'rgba(34,197,94,0.2)',   border: 'rgba(34,197,94,0.5)',   color: '#4ade80', icon: '☠️' },
};

export const CombatActionsPanel: React.FC<Props> = ({
  activeCombatant, isMyTurn, isDM, actionEconomy,
  onAttack, onDealDamage, onHealHealth, onOpenStatusEffects, onSpendAction, onAddCondition, onRemoveCondition,
  onRemoveCombatant, onRequestDiceRoll, onQuickRequestRoll,
  dotConditions = [], onRemoveDotCondition,
}) => {
  const canAct = isMyTurn || isDM;
  const conditions = activeCombatant?.conditions ?? [];

  // Roll request local state
  const [showRollPanel, setShowRollPanel] = useState(false);
  const [rollDice, setRollDice] = useState('d20');
  const [rollModifier, setRollModifier] = useState('none');
  const [rollPurpose, setRollPurpose] = useState('ability_check');
  const [rollDetail, setRollDetail] = useState('');

  const btnStyle = (color: string, disabled = false): React.CSSProperties => ({
    padding: '0.45rem 0.75rem', borderRadius: '0.4rem', cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(255,255,255,0.04)' : `${color}22`,
    border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : color}`,
    color: disabled ? 'rgba(255,255,255,0.3)' : '#e2e8f0',
    fontSize: '0.8rem', fontWeight: '500',
    opacity: disabled ? 0.5 : 1,
  });

  if (!activeCombatant) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        No active combatant selected
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>


      {/* Combat Actions */}
      <div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: '0 0 0.4rem' }}>Actions</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {isDM ? (
            <>
              <button onClick={onDealDamage} disabled={!canAct} style={btnStyle('#f87171', !canAct)}>🗡️ Deal Damage</button>
              <button onClick={onHealHealth} disabled={!canAct} style={btnStyle('#4ade80', !canAct)}>💚 Heal Health</button>
              <button onClick={onOpenStatusEffects} disabled={!canAct} style={btnStyle('#fb923c', !canAct)}>🔥 Status Effects</button>
              <button onClick={onQuickRequestRoll} disabled={!canAct} style={btnStyle('#a78bfa', !canAct)}>🎲 Quick Roll</button>
            </>
          ) : (
            <>
              <button onClick={onAttack} disabled={!canAct} style={btnStyle('#f87171', !canAct)}>⚔️ Attack</button>
              <button disabled={!canAct}
                onClick={() => { onSpendAction('action', true); }}
                style={btnStyle('#a78bfa', !canAct)}>💨 Dash</button>
              <button disabled={!canAct}
                onClick={() => { onSpendAction('action', true); }}
                style={btnStyle('#fbbf24', !canAct)}>🚶 Disengage</button>
              <button disabled={!canAct}
                onClick={() => { onSpendAction('action', true); }}
                style={btnStyle('#4ade80', !canAct)}>🤝 Help</button>
              <button disabled={!canAct}
                onClick={() => { onSpendAction('action', true); }}
                style={btnStyle('#94a3b8', !canAct)}>🌑 Hide</button>
            </>
          )}
        </div>
      </div>

      {/* Active effects */}
      {isDM && (conditions.length > 0 || dotConditions.length > 0) && (
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: '0 0 0.4rem' }}>Active Effects</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.2rem' }}>
            {conditions.map(c => {
              const s = conditionColor(c);
              return (
                <button key={c} onClick={() => onRemoveCondition(c)}
                  title={`Remove ${c}`}
                  style={{
                    padding: '0.2rem 0.5rem', borderRadius: '999px',
                    background: s.bg, border: `1px solid ${s.border}`,
                    color: s.color, fontSize: '0.7rem', cursor: 'pointer',
                  }}>
                  {c} ×
                </button>
              );
            })}
            {dotConditions.map(dot => {
              const s = dotConditionStyle[dot.type] ?? dotConditionStyle.Poison;
              const turns = dot.turnsRemaining !== null ? ` (${dot.turnsRemaining})` : '';
              return (
                <button key={`dot-${dot.type}`} onClick={() => onRemoveDotCondition?.(dot.type)}
                  title={`Remove ${dot.type} DOT`}
                  style={{
                    padding: '0.2rem 0.5rem', borderRadius: '999px',
                    background: s.bg, border: `1px solid ${s.border}`,
                    color: s.color, fontSize: '0.7rem', cursor: 'pointer',
                  }}>
                  {s.icon} {dot.type}{turns} ×
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* DM-only extras */}
      {isDM && (
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: '0 0 0.4rem' }}>DM Tools</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <button onClick={() => setShowRollPanel(p => !p)} style={btnStyle('#a78bfa')}>
              🎲 {showRollPanel ? 'Cancel Roll' : 'Request Roll'}
            </button>
            <button onClick={onRemoveCombatant} style={btnStyle('#f87171')}>💀 Remove Fighter</button>
          </div>

          {showRollPanel && (
            <div style={{
              padding: '0.75rem', borderRadius: '0.5rem',
              background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.3)',
              display: 'flex', flexDirection: 'column', gap: '0.5rem',
            }}>
              {/* Dice type */}
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', margin: '0 0 0.3rem' }}>Dice</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].map(d => (
                    <button key={d} onClick={() => setRollDice(d)}
                      style={{
                        padding: '0.2rem 0.45rem', borderRadius: '0.3rem', fontSize: '0.75rem', cursor: 'pointer',
                        background: rollDice === d ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${rollDice === d ? '#a78bfa' : 'rgba(255,255,255,0.15)'}`,
                        color: rollDice === d ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
                        fontWeight: rollDice === d ? 'bold' : 'normal',
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modifier */}
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', margin: '0 0 0.3rem' }}>Modifier</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {['none', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'prof'].map(m => (
                    <button key={m} onClick={() => setRollModifier(m)}
                      style={{
                        padding: '0.2rem 0.45rem', borderRadius: '0.3rem', fontSize: '0.7rem', cursor: 'pointer',
                        background: rollModifier === m ? 'rgba(96,165,250,0.35)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${rollModifier === m ? '#60a5fa' : 'rgba(255,255,255,0.15)'}`,
                        color: rollModifier === m ? '#93c5fd' : 'rgba(255,255,255,0.5)',
                        fontWeight: rollModifier === m ? 'bold' : 'normal',
                        textTransform: 'uppercase',
                      }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Purpose */}
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', margin: '0 0 0.3rem' }}>Purpose</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {[
                    { key: 'attack', label: 'Attack Roll' },
                    { key: 'damage', label: 'Damage' },
                    { key: 'saving_throw', label: 'Saving Throw' },
                    { key: 'ability_check', label: 'Ability Check' },
                    { key: 'initiative', label: 'Initiative' },
                  ].map(p => (
                    <button key={p.key} onClick={() => setRollPurpose(p.key)}
                      style={{
                        padding: '0.2rem 0.45rem', borderRadius: '0.3rem', fontSize: '0.7rem', cursor: 'pointer',
                        background: rollPurpose === p.key ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${rollPurpose === p.key ? '#4ade80' : 'rgba(255,255,255,0.15)'}`,
                        color: rollPurpose === p.key ? '#86efac' : 'rgba(255,255,255,0.5)',
                        fontWeight: rollPurpose === p.key ? 'bold' : 'normal',
                      }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional detail label */}
              <input
                type="text"
                placeholder="Detail (optional, e.g. 'Stealth check')"
                value={rollDetail}
                onChange={e => setRollDetail(e.target.value)}
                style={{
                  padding: '0.35rem 0.6rem', borderRadius: '0.3rem', fontSize: '0.75rem',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                  color: '#e2e8f0', outline: 'none',
                }}
              />

              {/* Send button */}
              <button
                onClick={() => {
                  onRequestDiceRoll({ diceType: rollDice, modifier: rollModifier, rollPurpose, purposeDetail: rollDetail || rollPurpose });
                  setShowRollPanel(false);
                  setRollDetail('');
                }}
                style={{
                  padding: '0.45rem', borderRadius: '0.4rem', cursor: 'pointer',
                  background: 'linear-gradient(135deg, rgba(167,139,250,0.4), rgba(139,92,246,0.4))',
                  border: '1px solid #a78bfa', color: '#c4b5fd', fontWeight: 'bold', fontSize: '0.8rem',
                }}>
                📤 Send Roll Request ({rollDice}{rollModifier !== 'none' ? ` + ${rollModifier.toUpperCase()}` : ''})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Concentration */}
      {activeCombatant.concentration_spell && (
        <div style={{
          padding: '0.4rem 0.6rem', background: 'rgba(20,184,166,0.1)',
          border: '1px solid rgba(20,184,166,0.35)', borderRadius: '0.4rem',
          fontSize: '0.8rem', color: '#2dd4bf',
        }}>
          🔮 Concentrating: <strong>{activeCombatant.concentration_spell}</strong>
        </div>
      )}
    </div>
  );
};

export default CombatActionsPanel;
