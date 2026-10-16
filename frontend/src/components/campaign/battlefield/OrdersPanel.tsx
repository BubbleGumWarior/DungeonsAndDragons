import React, { useRef } from 'react';
import { Check, Crown, EyeOff, Gavel, HeartCrack, Lock, LockKeyhole, Package, Shield, SkipForward, Sparkles, Swords, Target, Crosshair, type LucideIcon } from 'lucide-react';
import { battleAPI } from '../../../services/api';
import type { Battle, BattleGoal, BattleParticipant } from '../../../services/api';
import { BATTLE_GOALS, findGoalByKey, isGoalEligible, type BattleGoalDefinition } from '../../../utils/battleGoals';
import {
  BASE_TYPE_GLYPH,
  formatCount,
  getArmyBaseType,
  getArmyRangeFeet,
  getArmyRangeLabel,
  getBattlefieldDistanceFeet,
  getFactionColor,
  getMoraleLevel,
  MORALE_BREAK_POINT,
  MORALE_LABEL,
  MORALE_TONE,
  getParticipantCategory,
  getParticipantName,
  readableOn,
} from './battlefieldHelpers';

export type GoalSection = 'attacking' | 'defending' | 'logistics' | 'commander' | 'unique';
export interface GoalSelection { goalKey?: string; targetId?: number | null; activeTab?: GoalSection }
export type GoalSelections = Record<number, GoalSelection>;

const SECTIONS: Array<{ key: GoalSection; label: string; Icon: LucideIcon }> = [
  { key: 'attacking', label: 'Attack', Icon: Swords },
  { key: 'defending', label: 'Defend', Icon: Shield },
  { key: 'logistics', label: 'Supply', Icon: Package },
  { key: 'commander', label: 'Command', Icon: Crown },
  { key: 'unique', label: 'Unique', Icon: Sparkles },
];

interface OrdersPanelProps {
  battle: Battle;
  goals: BattleGoal[];
  selectable: BattleParticipant[];
  selectedArmyId: number | null;
  goalSelections: GoalSelections;
  setGoalSelections: React.Dispatch<React.SetStateAction<GoalSelections>>;
  onPickArmy: (id: number) => void;
  setBattle: React.Dispatch<React.SetStateAction<Battle | null>>;
  setGoals: React.Dispatch<React.SetStateAction<BattleGoal[]>>;
  notify: (message: string) => void;
}

const scoreOf = (p?: BattleParticipant | null): number => {
  if (!p) return 0;
  if (typeof p.current_score === 'number') return p.current_score;
  if (typeof p.base_score === 'number') return p.base_score;
  return 0;
};

const requirementText = (req?: { method: 'ahead' | 'behind'; delta: number }) => {
  if (!req) return '';
  return req.method === 'ahead' ? `Needs score +${req.delta} vs target` : `Needs score −${req.delta} vs target`;
};

const meetsRequirement = (req: { method: 'ahead' | 'behind'; delta: number }, attacker: number, defender: number) => {
  const d = attacker - defender;
  return req.method === 'ahead' ? d >= req.delta : d <= -req.delta;
};

const OrdersPanel: React.FC<OrdersPanelProps> = ({
  battle, goals, selectable, selectedArmyId, goalSelections, setGoalSelections, onPickArmy, setBattle, setGoals, notify,
}) => {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const participants = battle.participants || [];
  const active = selectable.find(p => p.id === selectedArmyId) || selectable[0];

  if (!active) {
    return (
      <div className="bf-pane">
        <div className="bf-empty-note">
          <b>No army to command</b>
          You have no armies in this battle. Orders from the other side will appear as they lock in.
        </div>
      </div>
    );
  }

  const category = getParticipantCategory(active);
  const moraleLevel = getMoraleLevel(active);
  const selection = goalSelections[active.id] || {};
  const sectionKey: GoalSection = selection.activeTab || 'attacking';
  const lockedGoal = goals.find(g => g.participant_id === active.id);
  // Hidden armies cannot be picked as targets
  const enemies = participants.filter(p => p.team_name !== active.team_name && (p.current_troops || 0) > 0 && !p.is_hidden && !p.dm_hidden);
  const hiddenOk = (goal: BattleGoalDefinition) => !goal.requires_hidden || !!active.is_hidden;
  // Some goals only make sense against certain unit lines (attacking a dragon)
  const candidatesFor = (goal: BattleGoalDefinition) =>
    goal.target_base_types && goal.target_base_types.length > 0
      ? enemies.filter(t => goal.target_base_types!.includes(getArmyBaseType(getParticipantCategory(t))))
      : enemies;
  const targetNoun = (goal: BattleGoalDefinition) =>
    goal.target_base_types && goal.target_base_types.length > 0 ? goal.target_base_types.map(t => `${t}s`).join(' or ') : 'enemies';
  const myScore = scoreOf(active);
  const rangeFeet = getArmyRangeFeet(category);

  const scoreEligibility = (goal: BattleGoalDefinition, target: BattleParticipant | undefined) => {
    if (!goal.score_requirement || goal.target_type !== 'enemy') return { ok: true, reason: '' };
    const reason = requirementText(goal.score_requirement);
    if (target) return { ok: meetsRequirement(goal.score_requirement, myScore, scoreOf(target)), reason };
    const pool = candidatesFor(goal);
    if (pool.length === 0) return { ok: false, reason };
    return { ok: pool.some(t => meetsRequirement(goal.score_requirement!, myScore, scoreOf(t))), reason };
  };

  const rangeEligibility = (goal: BattleGoalDefinition, target: BattleParticipant | undefined) => {
    if (goal.target_type !== 'enemy') return { ok: true, reason: '' };
    if (target) {
      const d = getBattlefieldDistanceFeet(active, target);
      return { ok: d <= rangeFeet, reason: d <= rangeFeet ? '' : `Out of range (${d.toFixed(0)}ft > ${rangeFeet}ft)` };
    }
    const pool = candidatesFor(goal);
    if (pool.length === 0) return { ok: false, reason: `No ${targetNoun(goal)} on the field` };
    const any = pool.some(t => getBattlefieldDistanceFeet(active, t) <= rangeFeet);
    return { ok: any, reason: any ? '' : `No ${targetNoun(goal)} within ${rangeFeet}ft` };
  };

  const eligibleIn = (section: GoalSection) =>
    ((BATTLE_GOALS as Record<string, BattleGoalDefinition[]>)[section] || []).filter(goal =>
      isGoalEligible(goal, category) && hiddenOk(goal) && scoreEligibility(goal, undefined).ok && rangeEligibility(goal, undefined).ok
    ).length;
  const hasAnyEligible = SECTIONS.some(s => eligibleIn(s.key) > 0);

  const chosenGoal = selection.goalKey ? findGoalByKey(selection.goalKey) : undefined;
  const chosenTarget = selection.targetId && chosenGoal ? candidatesFor(chosenGoal).find(t => t.id === selection.targetId) : undefined;
  const needsTarget = chosenGoal?.target_type === 'enemy';
  const canLock = !!chosenGoal && (!needsTarget || !!selection.targetId);

  const patch = (next: Partial<GoalSelection>) =>
    setGoalSelections(prev => ({ ...prev, [active.id]: { ...prev[active.id], ...next } }));

  const refresh = async () => {
    const updated = await battleAPI.getBattle(battle.id);
    setBattle(updated);
    setGoals(await battleAPI.getGoals(battle.id, battle.current_round));
  };

  // After orders are locked, return to the army picker at the top so the next army can be chosen
  const scrollToTop = () => {
    const scroller = paneRef.current?.closest('.bf-body');
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const lockIn = async () => {
    if (!chosenGoal) return;
    if (needsTarget && !selection.targetId) return;
    if (chosenGoal.score_requirement && needsTarget) {
      const s = scoreEligibility(chosenGoal, chosenTarget);
      if (!chosenTarget || !s.ok) { notify(chosenTarget ? s.reason : 'Select a target to confirm the score requirement.'); return; }
    }
    if (needsTarget) {
      const r = rangeEligibility(chosenGoal, chosenTarget);
      if (!chosenTarget || !r.ok) { notify(chosenTarget ? r.reason : `Select a target within ${rangeFeet}ft.`); return; }
    }
    try {
      await battleAPI.setGoal(battle.id, { participant_id: active.id, goal_key: chosenGoal.key, target_participant_id: selection.targetId || null });
      await refresh();
      scrollToTop();
    } catch (e) { console.error('Error setting goal:', e); notify('Could not lock that goal'); }
  };

  const skip = async () => {
    try {
      await battleAPI.setGoal(battle.id, { participant_id: active.id, goal_key: 'skip_goal', target_participant_id: null });
      await refresh();
      scrollToTop();
    } catch (e) { console.error('Error skipping goal:', e); }
  };

  const sectionGoals = ((BATTLE_GOALS as Record<string, BattleGoalDefinition[]>)[sectionKey] || []);
  const ActiveGlyph = BASE_TYPE_GLYPH[getArmyBaseType(category)];
  const activeColor = getFactionColor(active);

  return (
    <div className="bf-pane" ref={paneRef}>
      {selectable.length > 1 && (
        <div className="bf-picker" role="group" aria-label="Choose an army to give orders">
          {selectable.map(p => {
            const color = getFactionColor(p);
            const Glyph = BASE_TYPE_GLYPH[getArmyBaseType(getParticipantCategory(p))];
            return (
              <button key={p.id} type="button" className="bf-pick" aria-pressed={p.id === active.id}
                style={{ ['--faction' as any]: color, ['--on-faction' as any]: readableOn(color) }}
                onClick={() => onPickArmy(p.id)}>
                <span className="bf-army-glyph" aria-hidden="true"><Glyph size={14} strokeWidth={2.25} /></span>
                <span className="bf-pick-name">{getParticipantName(p)}</span>
                <span className="bf-pick-state" data-done={p.has_selected_goal ? 'true' : undefined} aria-label={p.has_selected_goal ? 'Orders locked' : 'Needs orders'}>
                  {p.has_selected_goal ? <Check size={15} aria-hidden="true" /> : <LockKeyhole size={15} aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="bf-me" style={{ ['--faction' as any]: activeColor }}>
        {selectable.length === 1 && (
          <span className="bf-army-glyph" style={{ ['--on-faction' as any]: readableOn(activeColor), width: '1.9rem', height: '1.9rem' }} aria-hidden="true"><ActiveGlyph size={16} strokeWidth={2.25} /></span>
        )}
        <b>{getParticipantName(active)}</b>
        <span className="bf-tag">{category}</span>
        <span className="bf-tag"><Crosshair size={11} aria-hidden="true" /> {getArmyRangeLabel(category)}</span>
        <span className="bf-tag" data-tone="info">Score {myScore}</span>
        <span className="bf-tag" data-tone="good">{formatCount(active.current_troops)} troops</span>
        {active.is_hidden && <span className="bf-tag" data-tone="info"><EyeOff size={11} aria-hidden="true" /> Hidden until round {active.hidden_until_round}</span>}
        {moraleLevel && <span className="bf-tag" data-tone={MORALE_TONE[moraleLevel]}><HeartCrack size={11} aria-hidden="true" /> Morale {active.current_morale}</span>}
      </div>

      {moraleLevel && moraleLevel !== 'steady' && (
        <div className="bf-status" data-tone={MORALE_TONE[moraleLevel]} role="status" style={{ marginBottom: '0.9rem' }}>
          <HeartCrack size={18} aria-hidden="true" />
          <span>
            {moraleLevel === 'breaking'
              ? `Morale has fallen below ${MORALE_BREAK_POINT}. At the start of the next round this army must pass a morale save or it flees the battle.`
              : `${MORALE_LABEL[moraleLevel]}: morale is ${active.current_morale}. Below ${MORALE_BREAK_POINT} it can start to desert.`}
            {' '}Steady the Ranks restores it.
          </span>
        </div>
      )}

      {lockedGoal && (
        <div className="bf-locked" role="status">
          <Lock size={16} aria-hidden="true" />
          <span>
            Orders locked: <b>{lockedGoal.goal_name}</b>
            {lockedGoal.target_army_name ? <> against {lockedGoal.target_army_name}</> : null}
          </span>
        </div>
      )}

      <div className="bf-sections" role="tablist" aria-label="Goal types">
        {SECTIONS.map(({ key, label, Icon }) => {
          const count = eligibleIn(key);
          return (
            <button key={key} type="button" role="tab" className="bf-section" aria-selected={key === sectionKey}
              onClick={() => patch({ activeTab: key })} title={`${label}: ${count} available`}>
              <Icon size={17} aria-hidden="true" />
              {label}
              {count > 0 && <span className="bf-count" aria-label={`${count} available`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {sectionGoals.length === 0 ? (
        <div className="bf-empty-note"><b>Nothing here yet</b>New {SECTIONS.find(s => s.key === sectionKey)?.label.toLowerCase()} orders are coming.</div>
      ) : (
        <ul className="bf-goals">
          {sectionGoals.map(goal => {
            const catOk = isGoalEligible(goal, category);
            const score = scoreEligibility(goal, chosenTarget && selection.goalKey === goal.key ? chosenTarget : undefined);
            const range = rangeEligibility(goal, chosenTarget && selection.goalKey === goal.key ? chosenTarget : undefined);
            const hiddenGate = hiddenOk(goal);
            const eligible = catOk && hiddenGate && score.ok && range.ok;
            const picked = selection.goalKey === goal.key;
            const locks: string[] = [];
            if (!catOk) locks.push(goal.lock_reason || 'Wrong unit type');
            else if (!hiddenGate) locks.push('Must be hidden first: use Melt into the Shadows');
            else if (!score.ok) locks.push(score.reason);
            else if (!range.ok) locks.push(range.reason);
            return (
              <li key={goal.key}>
                <button type="button" className="bf-goal" aria-pressed={picked} disabled={!eligible}
                  onClick={() => patch({ goalKey: goal.key })}>
                  <span className="bf-radio" aria-hidden="true">{picked && <Check size={11} strokeWidth={3} />}</span>
                  <span>
                    <span className="bf-goal-name">{goal.name}</span>
                    <span className="bf-goal-desc" style={{ display: 'block' }}>{goal.description}</span>
                    {(eligible && (goal.target_type === 'enemy' || goal.score_requirement || goal.key === 'assassinate_commander')) && (
                      <span className="bf-goal-chips">
                        {goal.manual && <span className="bf-tag" data-tone="warn"><Gavel size={11} aria-hidden="true" /> DM rules, no roll</span>}
                        {goal.target_type === 'enemy' && <span className="bf-tag" data-tone="info"><Target size={11} aria-hidden="true" /> {rangeFeet}ft range</span>}
                        {goal.score_requirement && <span className="bf-tag" data-tone="info">{requirementText(goal.score_requirement)}</span>}
                        {goal.key === 'assassinate_commander' && <span className="bf-tag" data-tone="bad">Halves target score</span>}
                      </span>
                    )}
                    {locks.length > 0 && (
                      <span className="bf-goal-chips">
                        {locks.map((reason, i) => <span key={i} className="bf-tag" data-tone="warn"><Lock size={11} aria-hidden="true" /> {reason}</span>)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {needsTarget && chosenGoal && (
        <>
          <h4 className="bf-sub">Choose a target <small>within {rangeFeet} ft</small></h4>
          {candidatesFor(chosenGoal).length === 0 ? (
            <div className="bf-empty-note">No enemy armies are on the field.</div>
          ) : (
            <ul className="bf-targets">
              {candidatesFor(chosenGoal).map(t => {
                const feet = Math.round(getBattlefieldDistanceFeet(active, t));
                const inRange = feet <= rangeFeet;
                const scoreOk = !chosenGoal.score_requirement || meetsRequirement(chosenGoal.score_requirement, myScore, scoreOf(t));
                const ok = inRange && scoreOk;
                const color = getFactionColor(t);
                const Glyph = BASE_TYPE_GLYPH[getArmyBaseType(getParticipantCategory(t))];
                return (
                  <li key={t.id}>
                    <button type="button" className="bf-target" aria-pressed={selection.targetId === t.id} disabled={!ok}
                      style={{ ['--faction' as any]: color, ['--on-faction' as any]: readableOn(color) }}
                      onClick={() => patch({ targetId: t.id })}>
                      <span className="bf-army-glyph" aria-hidden="true"><Glyph size={15} strokeWidth={2.25} /></span>
                      <span className="bf-army-main">
                        <span className="bf-army-name">{getParticipantName(t)}</span>
                        <span className="bf-army-sub">Score {scoreOf(t)} · {formatCount(t.current_troops)} troops{!scoreOk ? ' · score too close' : ''}</span>
                      </span>
                      <span className="bf-tag" data-tone={inRange ? 'good' : 'bad'}>{feet} ft {inRange ? 'in range' : 'too far'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <div className="bf-commit">
        <button type="button" className="bf-btn" data-variant="primary" disabled={!canLock} onClick={lockIn}>
          <Lock size={15} aria-hidden="true" /> Lock in orders
        </button>
        {!canLock && (
          <p className="bf-commit-why">{!chosenGoal ? 'Choose a goal to lock in your orders.' : 'Choose a target for this goal.'}</p>
        )}
        {!hasAnyEligible && (
          <button type="button" className="bf-btn" onClick={skip}>
            <SkipForward size={15} aria-hidden="true" /> Skip, nothing available
          </button>
        )}
      </div>
    </div>
  );
};

export default OrdersPanel;
