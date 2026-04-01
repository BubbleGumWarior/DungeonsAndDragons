import React, { useEffect, useRef, useState } from 'react';
import { CombatDiceRequest } from '../../types/campaignTypes';
import { Character } from '../../services/api';

interface Props {
  request: CombatDiceRequest;
  rollerName: string;
  character?: Character | null;
  onConfirm: (rawRoll: number, total: number, modifierValue: number, modifier: string) => void;
  onRequestReroll?: (diceType: string) => void;
  rerollApproved?: boolean;
  previousRollResult?: { label: string; total: number; color: string };
  onClose: () => void;
  precomputedModifier?: number;
}

const PURPOSE_THEMES: Record<string, { color: string; bg: string; label: string }> = {
  attack:        { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',   label: 'Attack Roll' },
  damage:        { color: '#f87171', bg: 'rgba(239,68,68,0.15)',    label: 'Damage Roll' },
  saving_throw:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',   label: 'Saving Throw' },
  ability_check: { color: '#4ade80', bg: 'rgba(74,222,128,0.15)',   label: 'Ability Check' },
  death_save:    { color: '#f97316', bg: 'rgba(249,115,22,0.15)',   label: 'Death Save' },
  initiative:    { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', label: 'Initiative' },
};

function getModifierInfo(modifier: string | undefined, character: Character | null | undefined): { value: number; label: string } {
  if (!modifier || modifier === 'none') return { value: 0, label: '' };
  if (!character?.abilities) return { value: 0, label: modifier.toUpperCase() };

  const abilityMap: Record<string, keyof typeof character.abilities> = {
    str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha',
  };

  if (abilityMap[modifier]) {
    const score = character.abilities[abilityMap[modifier]] ?? 10;
    const value = Math.floor((score - 10) / 2);
    return { value, label: modifier.toUpperCase() };
  }

  if (modifier === 'prof') {
    const value = Math.floor(((character.level ?? 1) - 1) / 4) + 2;
    return { value, label: 'PROF' };
  }

  return { value: 0, label: modifier.toUpperCase() };
}

export const DiceRollModal: React.FC<Props> = ({ request, rollerName, character, onConfirm, onRequestReroll, rerollApproved, previousRollResult, onClose, precomputedModifier }) => {
  const [rollResult, setRollResult] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [settled, setSettled] = useState(false);
  const [rerollPending, setRerollPending] = useState(false);
  const pendingTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasRolled = rollResult !== null || rolling;

  // If DM approved a reroll, reset state so player can roll again
  useEffect(() => {
    if (rerollApproved) {
      setRollResult(null);
      setRolling(false);
      setRerollPending(false);
    }
  }, [rerollApproved]);

  const { diceType, rollPurpose, purposeDetail, requesterName, targetCharacterName, modifier } = request;
  const theme = PURPOSE_THEMES[rollPurpose] ?? PURPOSE_THEMES['ability_check'];
  const baseMod = getModifierInfo(modifier, character);
  // When a precomputed modifier is provided (e.g. Quick Roll skill check), use it with purposeDetail as the label
  const mod = precomputedModifier !== undefined
    ? {
        value: precomputedModifier,
        label: purposeDetail || baseMod.label || (modifier && modifier !== 'none' ? modifier.toUpperCase() : 'Modifier'),
      }
    : baseMod;
  const total = rollResult !== null && !rolling ? rollResult + mod.value : null;

  useEffect(() => {
    return () => { pendingTimeouts.current.forEach(clearTimeout); };
  }, []);

  const handleRoll = () => {
    if (rolling || hasRolled) return;
    pendingTimeouts.current.forEach(clearTimeout);
    pendingTimeouts.current = [];
    setSettled(false);
    setRolling(true);
    setRollResult(null);

    const sides = parseInt(diceType.replace('d', ''), 10) || 20;
    const finalResult = Math.floor(Math.random() * sides) + 1;

    // Rapidly cycling delays: fast at start, slowing toward the end (~900ms total)
    const delays = [0, 55, 110, 165, 220, 290, 370, 460, 560, 670, 790, 900];
    delays.forEach((delay, i) => {
      const isFinal = i === delays.length - 1;
      const t = setTimeout(() => {
        setRollResult(isFinal ? finalResult : Math.floor(Math.random() * sides) + 1);
        if (isFinal) {
          setRolling(false);
          setSettled(true);
          setTimeout(() => setSettled(false), 350);
        }
      }, delay);
      pendingTimeouts.current.push(t);
    });
  };

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
    cursor: hasRolled ? 'default' : 'default',
  };

  const modal: React.CSSProperties = {
    background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)',
    border: `2px solid ${theme.color}`,
    borderRadius: '1rem', padding: '2rem', width: '400px', maxWidth: '95vw',
    boxShadow: `0 0 60px ${theme.color}55, 0 25px 60px rgba(0,0,0,0.8)`,
    display: 'flex', flexDirection: 'column', gap: '1.25rem',
  };

  const dieAnimation = rolling
    ? 'diceRoll 0.2s linear infinite'
    : settled
    ? 'diceSettle 0.3s ease-out forwards'
    : 'none';

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget && !hasRolled) onClose(); }}>
      <style>{`
        @keyframes diceRoll {
          0%   { transform: scale(1)    rotate(0deg);   }
          20%  { transform: scale(1.1)  rotate(-10deg); }
          50%  { transform: scale(1.05) rotate(8deg);   }
          80%  { transform: scale(1.1)  rotate(-6deg);  }
          100% { transform: scale(1)    rotate(0deg);   }
        }
        @keyframes diceSettle {
          0%   { transform: scale(1.2); }
          65%  { transform: scale(0.93); }
          100% { transform: scale(1);   }
        }
      `}</style>
      <div style={modal}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-block', padding: '0.3rem 1rem', borderRadius: '999px',
            background: theme.bg, border: `1px solid ${theme.color}`,
            color: theme.color, fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.5rem',
          }}>
            {theme.label.toUpperCase()}
          </div>
          <h3 style={{ color: '#e2e8f0', margin: 0, fontSize: '1.1rem' }}>
            {requesterName} asks you to roll!
          </h3>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            {targetCharacterName && <><strong style={{ color: theme.color }}>{targetCharacterName}</strong> — </>}
            {purposeDetail || theme.label}
          </p>
          {mod.label && (
            <p style={{ color: theme.color, margin: '0.15rem 0 0', fontSize: '0.8rem' }}>
              Modifier: {mod.label} ({mod.value >= 0 ? '+' : ''}{mod.value})
            </p>
          )}
        </div>

        {/* Previous roll result banner — shown between sequential rolls (e.g. hit roll before damage roll) */}
        {previousRollResult && (
          <div style={{
            padding: '0.5rem 1rem', borderRadius: '0.5rem', textAlign: 'center',
            background: `${previousRollResult.color}22`,
            border: `1px solid ${previousRollResult.color}66`,
          }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{previousRollResult.label}: </span>
            <strong style={{ color: previousRollResult.color, fontSize: '1.2rem' }}>{previousRollResult.total}</strong>
          </div>
        )}

        {/* Animated die face */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '130px', height: '130px', borderRadius: '18px',
            background: theme.bg, border: `3px solid ${theme.color}`,
            fontSize: rollResult !== null ? '3.2rem' : '1.8rem',
            fontWeight: 'bold', color: theme.color,
            boxShadow: `0 0 ${rolling ? '50px' : '20px'} ${theme.color}${rolling ? '99' : '44'}`,
            transition: 'box-shadow 0.2s ease',
            userSelect: 'none',
            animation: dieAnimation,
          }}>
            {rollResult !== null ? rollResult : diceType}
          </div>
        </div>

        {/* Result with modifier breakdown */}
        {rollResult !== null && !rolling && total !== null && mod.label && mod.value !== 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{
              padding: '0.4rem 1rem', borderRadius: '0.5rem',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
              fontSize: '1.4rem', fontWeight: 'bold', color: '#94a3b8',
            }}>
              {rollResult}
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
              + {mod.label} ({mod.value >= 0 ? '+' : ''}{mod.value})
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>=</span>
            <div style={{
              padding: '0.4rem 1.5rem', borderRadius: '0.5rem',
              background: theme.bg, border: `2px solid ${theme.color}`,
              fontSize: '2.2rem', fontWeight: 'bold', color: theme.color,
              boxShadow: `0 0 20px ${theme.color}55`,
            }}>
              {total}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {!hasRolled && (
              <button onClick={handleRoll} disabled={rolling}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '0.5rem', cursor: rolling ? 'not-allowed' : 'pointer',
                  background: rolling ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg, ${theme.color}cc, ${theme.color})`,
                  border: `2px solid ${rolling ? 'rgba(255,255,255,0.1)' : theme.color}`,
                  color: rolling ? 'rgba(255,255,255,0.3)' : '#000',
                  fontWeight: 'bold', fontSize: '1rem',
                }}>
                {rolling ? '🎲 Rolling...' : `🎲 Roll ${diceType}`}
              </button>
            )}

            {rollResult !== null && !rolling && total !== null && (
              <button onClick={() => onConfirm(rollResult, total, mod.value, modifier ?? 'none')}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#4ade80cc,#22c55e)',
                  border: '2px solid #22c55e', color: '#000', fontWeight: 'bold', fontSize: '1rem',
                }}>
                ✅ Confirm {total}
              </button>
            )}
          </div>

          {rollResult !== null && !rolling && onRequestReroll && !rerollPending && (
            <button
              onClick={() => { onRequestReroll(diceType); setRerollPending(true); }}
              style={{
                padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer',
                background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
                color: '#fbbf24', fontSize: '0.85rem',
              }}>
              🔄 Request Reroll
            </button>
          )}
          {rerollPending && (
            <p style={{ textAlign: 'center', color: '#fbbf24', fontSize: '0.8rem', margin: 0 }}>
              ⏳ Waiting for DM to approve reroll...
            </p>
          )}
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.7rem', margin: 0 }}>
          Result will be shared automatically with the group
        </p>
      </div>
    </div>
  );
};

export default DiceRollModal;
