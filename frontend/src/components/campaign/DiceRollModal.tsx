import React, { useEffect, useRef, useState } from 'react';
import { CombatDiceRequest, DiceGroup, RollMode, RollSet } from '../../types/campaignTypes';
import { Character } from '../../services/api';

/** Extra detail when the roll was made with advantage/disadvantage: every set rolled, one flagged as kept. */
export interface RollModeInfo {
  rollMode: RollMode;
  rollSets: RollSet[];
}

interface Props {
  request: CombatDiceRequest;
  rollerName: string;
  character?: Character | null;
  onConfirm: (rawRoll: number, total: number, modifierValue: number, modifier: string, allRolls?: { diceType: string; rolls: number[] }[], modeInfo?: RollModeInfo) => void;
  /** When provided, the result is submitted automatically the moment all dice settle,
   *  and the confirm button only closes the modal (via onClose). */
  onRollComplete?: (rawRoll: number, total: number, modifierValue: number, modifier: string, allRolls?: { diceType: string; rolls: number[] }[], modeInfo?: RollModeInfo) => void;
  onRequestReroll?: (diceType: string) => void;
  rerollApproved?: boolean;
  previousRollResult?: { label: string; total: number; color: string };
  onClose: () => void;
  precomputedModifier?: number;
}

const PURPOSE_THEMES: Record<string, { color: string; bg: string; label: string }> = {
  attack:        { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',   label: 'Attack Roll' },
  damage:        { color: '#f87171', bg: 'rgba(239,68,68,0.15)',    label: 'Damage Roll' },
  saving_throw:  { color: 'var(--text-gold)', bg: 'rgba(251,191,36,0.15)',   label: 'Saving Throw' },
  ability_check: { color: '#4ade80', bg: 'rgba(74,222,128,0.15)',   label: 'Ability Check' },
  death_save:    { color: '#f97316', bg: 'rgba(249,115,22,0.15)',   label: 'Death Save' },
  initiative:    { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', label: 'Initiative' },
};

// Skill name → governing ability mapping
const SKILL_ABILITY_MAP: Record<string, keyof NonNullable<Character['abilities']>> = {
  acrobatics: 'dex', 'animal handling': 'wis', animalhandling: 'wis',
  arcana: 'int', athletics: 'str', deception: 'cha',
  history: 'int', insight: 'wis', intimidation: 'cha',
  investigation: 'int', medicine: 'wis', nature: 'int',
  perception: 'wis', performance: 'cha', persuasion: 'cha',
  religion: 'int', 'sleight of hand': 'dex', sleightofhand: 'dex',
  stealth: 'dex', survival: 'wis',
};

function getModifierInfo(modifier: string | undefined, character: Character | null | undefined, purposeDetail?: string): { value: number; label: string } {
  if (!modifier || modifier === 'none') return { value: 0, label: '' };
  if (!character?.abilities) return { value: 0, label: modifier.toUpperCase() };

  const abilityMap: Record<string, keyof typeof character.abilities> = {
    str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha',
  };

  if (abilityMap[modifier]) {
    const score = character.abilities[abilityMap[modifier]] ?? 10;
    const abilityMod = Math.floor((score - 10) / 2);
    const level = character.level ?? 1;
    const profBonus = Math.floor((level - 1) / 4) + 2;

    // If a purposeDetail matches a known skill, apply proficiency/expertise
    if (purposeDetail) {
      const key = purposeDetail.toLowerCase().replace(/\s+/g, '');
      const keySpaced = purposeDetail.toLowerCase();
      const skillAbility = SKILL_ABILITY_MAP[key] || SKILL_ABILITY_MAP[keySpaced];
      if (skillAbility) {
        const profSkills: string[] = (character.skills ?? []).map(s => s.toLowerCase());
        const expertiseSkills: string[] = ((character as any).expertise ?? []).map((s: string) => s.toLowerCase());
        const pdLower = purposeDetail.toLowerCase();
        const isExpert = expertiseSkills.includes(pdLower);
        const isProf = isExpert || profSkills.includes(pdLower);
        const bonus = isExpert ? profBonus * 2 : isProf ? profBonus : 0;
        const label = `${modifier.toUpperCase()}${isExpert ? ' (Expertise)' : isProf ? ' (Prof)' : ''}`;
        return { value: abilityMod + bonus, label };
      }
    }
    return { value: abilityMod, label: modifier.toUpperCase() };
  }

  if (modifier === 'prof') {
    const value = Math.floor(((character.level ?? 1) - 1) / 4) + 2;
    return { value, label: 'PROF' };
  }

  return { value: 0, label: modifier.toUpperCase() };
}

/** Flatten diceGroups into a list of individual dice, each tagged with their groupIndex */
function flattenDice(groups: DiceGroup[]): { diceType: string; groupIdx: number }[] {
  const flat: { diceType: string; groupIdx: number }[] = [];
  groups.forEach((g, gi) => {
    for (let i = 0; i < g.count; i++) flat.push({ diceType: g.diceType, groupIdx: gi });
  });
  return flat;
}

const MODE_THEMES: Record<Exclude<RollMode, 'normal'>, { color: string; label: string; keep: string }> = {
  advantage:    { color: '#4ade80', label: 'Advantage',    keep: 'higher' },
  disadvantage: { color: '#f87171', label: 'Disadvantage', keep: 'lower' },
};

export const DiceRollModal: React.FC<Props> = ({ request, rollerName, character, onConfirm, onRollComplete, onRequestReroll, rerollApproved, previousRollResult, onClose, precomputedModifier }) => {
  // Derive dice groups — fall back to single die from request.diceType
  const diceGroups: DiceGroup[] = request.diceGroups && request.diceGroups.length > 0
    ? request.diceGroups
    : [{ count: 1, diceType: request.diceType || 'd20' }];

  const rollMode: RollMode = request.rollMode === 'advantage' || request.rollMode === 'disadvantage' ? request.rollMode : 'normal';
  const setCount = rollMode === 'normal' ? 1 : 2;
  const baseDice = flattenDice(diceGroups);
  // Advantage/disadvantage rolls the whole requested set twice; setIdx says which set a die belongs to.
  const allDice = Array.from({ length: setCount }).flatMap((_, si) => baseDice.map(d => ({ ...d, setIdx: si })));

  // Per-die results (null = not yet revealed)
  const [dieResults, setDieResults] = useState<(number | null)[]>(() => Array(allDice.length).fill(null));
  // Index of the die currently animating (-1 = idle)
  const [currentlyRollingIndex, setCurrentlyRollingIndex] = useState(-1);
  // True once every die has settled
  const [allDiceRolled, setAllDiceRolled] = useState(false);
  // Settled highlight index (for bounce animation)
  const [settledIndex, setSettledIndex] = useState(-1);
  const [rerollPending, setRerollPending] = useState(false);

  const pendingTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasRolled = allDiceRolled || currentlyRollingIndex >= 0;

  // If DM approved a reroll, reset all state
  useEffect(() => {
    if (rerollApproved) {
      pendingTimeouts.current.forEach(clearTimeout);
      pendingTimeouts.current = [];
      setDieResults(Array(allDice.length).fill(null));
      setCurrentlyRollingIndex(-1);
      setAllDiceRolled(false);
      setSettledIndex(-1);
      setRerollPending(false);
    }
  }, [rerollApproved]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { pendingTimeouts.current.forEach(clearTimeout); };
  }, []);

  const { rollPurpose, purposeDetail, requesterName, targetCharacterName, modifier } = request;
  const theme = PURPOSE_THEMES[rollPurpose] ?? PURPOSE_THEMES['ability_check'];
  const baseMod = getModifierInfo(modifier, character, purposeDetail);
  const mod = precomputedModifier !== undefined
    ? {
        value: precomputedModifier,
        label: purposeDetail || baseMod.label || (modifier && modifier !== 'none' ? modifier.toUpperCase() : 'Modifier'),
      }
    : baseMod;

  // Compute sums only after all dice rolled; under advantage/disadvantage one set is kept, the other dropped
  const setSums: number[] | null = allDiceRolled
    ? Array.from({ length: setCount }, (_, si) =>
        allDice.reduce((acc, d, di) => (d.setIdx === si ? acc + (dieResults[di] ?? 0) : acc), 0))
    : null;
  // Ties keep the first set, which is the same total either way
  const keptSet = !setSums || setCount === 1 ? 0
    : rollMode === 'advantage' ? (setSums[1] > setSums[0] ? 1 : 0)
    : (setSums[1] < setSums[0] ? 1 : 0);
  const rawSum = setSums ? setSums[keptSet] : null;
  const total = rawSum !== null ? rawSum + mod.value : null;

  const revealDie = (index: number, finalValues: number[]) => {
    if (index >= allDice.length) {
      setCurrentlyRollingIndex(-1);
      setAllDiceRolled(true);
      return;
    }

    setCurrentlyRollingIndex(index);
    const sides = parseInt(allDice[index].diceType.replace('d', ''), 10) || 20;

    // 12-step reveal: fast at start, slowing toward end (~900ms total)
    const delays = [0, 55, 110, 165, 220, 290, 370, 460, 560, 670, 790, 900];
    delays.forEach((delay, i) => {
      const isFinal = i === delays.length - 1;
      const t = setTimeout(() => {
        if (isFinal) {
          setDieResults(prev => {
            const next = [...prev];
            next[index] = finalValues[index];
            return next;
          });
          setCurrentlyRollingIndex(-1);
          setSettledIndex(index);
          setTimeout(() => setSettledIndex(-1), 350);
          // Move to next die after a short gap
          const gap = setTimeout(() => revealDie(index + 1, finalValues), 200);
          pendingTimeouts.current.push(gap);
        } else {
          // Cycling random value for animation
          setDieResults(prev => {
            const next = [...prev];
            next[index] = Math.floor(Math.random() * sides) + 1;
            return next;
          });
        }
      }, delay);
      pendingTimeouts.current.push(t);
    });
  };

  const handleRoll = () => {
    if (hasRolled) return;
    pendingTimeouts.current.forEach(clearTimeout);
    pendingTimeouts.current = [];
    setAllDiceRolled(false);
    setSettledIndex(-1);

    // Pre-compute all final values upfront
    const finalValues = allDice.map(d => {
      const sides = parseInt(d.diceType.replace('d', ''), 10) || 20;
      return Math.floor(Math.random() * sides) + 1;
    });

    // Reset all die slots to null (unrolled)
    setDieResults(Array(allDice.length).fill(null));
    revealDie(0, finalValues);
  };

  // Build grouped allRolls for one set (the kept set by default) for onConfirm
  const buildAllRolls = (setIdx: number = keptSet): { diceType: string; rolls: number[] }[] => {
    return diceGroups.map((g, gi) => {
      const rolls: number[] = [];
      allDice.forEach((d, di) => {
        if (d.groupIdx === gi && d.setIdx === setIdx) rolls.push(dieResults[di] ?? 0);
      });
      return { diceType: g.diceType, rolls };
    });
  };

  const buildModeInfo = (): RollModeInfo | undefined => {
    if (setCount === 1 || !setSums) return undefined;
    return {
      rollMode,
      rollSets: setSums.map((sum, si) => ({ groups: buildAllRolls(si), sum, kept: si === keptSet })),
    };
  };

  // Auto-submit as soon as the roll is revealed so a bad roll can't be discarded
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (!onRollComplete) return;
    if (rerollApproved) autoSubmitted.current = false;
    if (allDiceRolled && total !== null && rawSum !== null && !autoSubmitted.current) {
      autoSubmitted.current = true;
      onRollComplete(rawSum, total, mod.value, modifier ?? 'none', buildAllRolls(), buildModeInfo());
    }
  }, [allDiceRolled]); // eslint-disable-line react-hooks/exhaustive-deps

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
  };

  const modal: React.CSSProperties = {
    background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)',
    border: `2px solid ${theme.color}`,
    borderRadius: '1rem', padding: '2rem', width: '440px', maxWidth: '95vw',
    boxShadow: `0 0 60px ${theme.color}55, 0 25px 60px rgba(0,0,0,0.8)`,
    display: 'flex', flexDirection: 'column', gap: '1.25rem',
  };

  // Whether one set is a multi-die roll (more than 1 die per set)
  const isMultiDie = baseDice.length > 1;
  const modeTheme = rollMode === 'normal' ? null : MODE_THEMES[rollMode];

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
            {PURPOSE_THEMES[rollPurpose]?.label.toUpperCase() ?? rollPurpose.toUpperCase()}
          </div>
          <h3 style={{ color: '#e2e8f0', margin: 0, fontSize: '1.1rem' }}>
            {requesterName} asks you to roll!
          </h3>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            {targetCharacterName && <><strong style={{ color: theme.color }}>{targetCharacterName}</strong> — </>}
            {purposeDetail || PURPOSE_THEMES[rollPurpose]?.label}
          </p>
          {/* Dice summary label */}
          <p style={{ color: theme.color, margin: '0.2rem 0 0', fontSize: '0.82rem', fontWeight: 'bold' }}>
            {diceGroups.map(g => `${g.count}${g.diceType}`).join(' + ')}
            {mod.label ? ` + ${mod.label} (${mod.value >= 0 ? '+' : ''}${mod.value})` : ''}
          </p>
          {modeTheme && (
            <p style={{ color: modeTheme.color, margin: '0.35rem 0 0', fontSize: '0.8rem', fontWeight: 'bold' }}>
              {modeTheme.label} — roll twice, keep the {modeTheme.keep} result
            </p>
          )}
        </div>

        {/* Previous roll result banner */}
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

        {/* Dice faces — one per die, arranged in a flex row that wraps. Advantage/disadvantage shows two sets. */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.6rem',
          justifyContent: 'center',
        }}>
          {Array.from({ length: setCount }, (_, si) => {
            const boxed = setCount > 1;
            const isKept = allDiceRolled && si === keptSet;
            const isDropped = allDiceRolled && boxed && si !== keptSet;
            const setColor = isKept && modeTheme ? modeTheme.color : 'rgba(255,255,255,0.25)';
            return (
              <div key={si} style={boxed ? {
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem', borderRadius: '14px', minWidth: 0,
                border: `2px ${isDropped ? 'dashed' : 'solid'} ${allDiceRolled ? setColor : 'rgba(255,255,255,0.12)'}`,
                background: isKept ? `${modeTheme?.color}14` : 'transparent',
                opacity: isDropped ? 0.5 : 1,
                transition: 'opacity 0.25s ease, border-color 0.25s ease, background 0.25s ease',
              } : { display: 'contents' }}>
                {boxed && (
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 'bold', letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: isKept ? modeTheme?.color : 'rgba(255,255,255,0.4)',
                  }}>
                    {allDiceRolled
                      ? (isKept ? `✔ Roll ${si + 1} · kept` : `✖ Roll ${si + 1} · dropped`)
                      : `Roll ${si + 1}`}
                  </span>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'center' }}>
                  {allDice.map((die, di) => {
                    if (die.setIdx !== si) return null;
                    const result = dieResults[di];
                    const isRolling = currentlyRollingIndex === di;
                    const isSettled = settledIndex === di;
                    const isRevealed = result !== null && currentlyRollingIndex !== di;
                    // Show max value (unrolled state) as placeholder label
                    const sides = parseInt(die.diceType.replace('d', ''), 10) || 20;
                    const dieAnimation = isRolling
                      ? 'diceRoll 0.2s linear infinite'
                      : isSettled
                      ? 'diceSettle 0.3s ease-out forwards'
                      : 'none';
                    const faceSize = isMultiDie ? '78px' : boxed ? '104px' : '130px';
                    const fontSize = isMultiDie
                      ? (isRevealed ? '1.9rem' : '0.9rem')
                      : (isRevealed ? (boxed ? '2.6rem' : '3.2rem') : (boxed ? '1.5rem' : '1.8rem'));
                    const faceColor = isDropped ? 'rgba(255,255,255,0.55)' : theme.color;
                    return (
                      <div key={di} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: faceSize, height: faceSize, borderRadius: '14px',
                          background: isRevealed ? (isDropped ? 'rgba(255,255,255,0.04)' : theme.bg) : 'rgba(255,255,255,0.04)',
                          border: `${isRevealed ? 3 : 2}px solid ${isRevealed ? faceColor : 'rgba(255,255,255,0.2)'}`,
                          fontSize, fontWeight: 'bold',
                          color: isRevealed ? faceColor : isRolling ? theme.color : 'rgba(255,255,255,0.4)',
                          textDecoration: isDropped && isRevealed ? 'line-through' : 'none',
                          boxShadow: isRolling
                            ? `0 0 30px ${theme.color}99`
                            : isRevealed && !isDropped ? `0 0 12px ${theme.color}44` : 'none',
                          transition: 'box-shadow 0.2s ease, border-color 0.15s ease',
                          userSelect: 'none',
                          animation: dieAnimation,
                        }}>
                          {isRolling && result !== null
                            ? result
                            : isRevealed
                            ? result
                            : sides /* max value as placeholder */}
                        </div>
                        {(isMultiDie || boxed) && (
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.62rem' }}>{die.diceType}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {boxed && isMultiDie && allDiceRolled && setSums && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: isKept ? modeTheme?.color : 'rgba(255,255,255,0.45)' }}>
                    Sum {setSums[si]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Per-group breakdown shown after all dice are rolled */}
        {allDiceRolled && rawSum !== null && total !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {isMultiDie && diceGroups.map((g, gi) => {
              const groupDice = allDice.map((d, di) => ({ d, di })).filter(x => x.d.groupIdx === gi && x.d.setIdx === keptSet);
              const groupRolls = groupDice.map(x => dieResults[x.di] ?? 0);
              const groupSum = groupRolls.reduce((a, b) => a + b, 0);
              return (
                <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '0.2rem 0.6rem', borderRadius: '4px',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                    color: theme.color, fontWeight: 'bold', fontSize: '0.8rem',
                  }}>
                    {g.count}{g.diceType}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                    [{groupRolls.join(', ')}] = {groupSum}
                  </span>
                </div>
              );
            })}
            {/* Raw total + modifier = grand total */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              {isMultiDie && (
                <>
                  <div style={{
                    padding: '0.4rem 0.8rem', borderRadius: '0.5rem',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                    fontSize: '1.3rem', fontWeight: 'bold', color: '#94a3b8',
                  }}>
                    {rawSum}
                  </div>
                </>
              )}
              {mod.label && mod.value !== 0 && (
                <>
                  {isMultiDie && <span style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>+</span>}
                  <span style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                    {isMultiDie ? '' : `${rawSum} + `}{mod.label} ({mod.value >= 0 ? '+' : ''}{mod.value})
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>=</span>
                </>
              )}
              {(!mod.label || mod.value === 0) && isMultiDie && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>=</span>
              )}
              <div style={{
                padding: '0.4rem 1.5rem', borderRadius: '0.5rem',
                background: theme.bg, border: `2px solid ${theme.color}`,
                fontSize: '2.2rem', fontWeight: 'bold', color: theme.color,
                boxShadow: `0 0 20px ${theme.color}55`,
              }}>
                {total}
              </div>
            </div>
          </div>
        )}

        {/* Single die no-modifier result (kept for clean display when only 1 die + no modifier) */}
        {!isMultiDie && setCount === 1 && !allDiceRolled && dieResults[0] !== null && currentlyRollingIndex === -1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: theme.color, fontSize: '1.5rem', fontWeight: 'bold' }}>
              {dieResults[0]}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {!hasRolled && (
              <button onClick={handleRoll}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                  background: `linear-gradient(135deg, ${theme.color}cc, ${theme.color})`,
                  border: `2px solid ${theme.color}`,
                  color: '#000', fontWeight: 'bold', fontSize: '1rem',
                }}>
                🎲 Roll {diceGroups.map(g => `${g.count}${g.diceType}`).join(' + ')}{modeTheme ? ` (${modeTheme.label.toLowerCase()})` : ''}
              </button>
            )}

            {allDiceRolled && total !== null && (
              <button onClick={() => onRollComplete ? onClose() : onConfirm(rawSum!, total, mod.value, modifier ?? 'none', buildAllRolls(), buildModeInfo())}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#4ade80cc,#22c55e)',
                  border: '2px solid #22c55e', color: '#000', fontWeight: 'bold', fontSize: '1rem',
                }}>
                {onRollComplete ? '✅ OK' : `✅ Confirm ${total}`}
              </button>
            )}
          </div>

          {allDiceRolled && onRequestReroll && !rerollPending && (
            <button
              onClick={() => { onRequestReroll(request.diceType); setRerollPending(true); }}
              style={{
                padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer',
                background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
                color: 'var(--text-gold)', fontSize: '0.85rem',
              }}>
              🔄 Request Reroll
            </button>
          )}
          {rerollPending && (
            <p style={{ textAlign: 'center', color: 'var(--text-gold)', fontSize: '0.8rem', margin: 0 }}>
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

