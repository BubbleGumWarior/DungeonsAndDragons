import React from 'react';
import { ArrowRight, CheckCheck, Dices, Gavel, Save } from 'lucide-react';
import { battleAPI } from '../../../services/api';
import type { Battle, BattleGoal } from '../../../services/api';
import { Stepper } from '../kingdomUi';
import { findGoalByKey } from '../../../utils/battleGoals';
import { getFactionColor, getParticipantName } from './battlefieldHelpers';

export interface GoalEdit {
  casualties_target: number;
  casualties_self: number;
  score_change_target: number;
  score_change_self: number;
  morale_self?: number;
  morale_target?: number;
  notes?: string;
}
export type GoalEdits = Record<number, GoalEdit>;

interface ResolutionPanelProps {
  battle: Battle;
  goals: BattleGoal[];
  isDM: boolean;
  userId?: number;
  goalEdits: GoalEdits;
  setGoalEdits: React.Dispatch<React.SetStateAction<GoalEdits>>;
  setBattle: React.Dispatch<React.SetStateAction<Battle | null>>;
  setGoals: React.Dispatch<React.SetStateAction<BattleGoal[]>>;
}

const STATUS_LABEL: Record<BattleGoal['status'], { text: string; tone: string }> = {
  selected: { text: 'Awaiting roll', tone: 'warn' },
  resolved: { text: 'Rolled', tone: 'info' },
  applied: { text: 'Applied', tone: 'good' },
};

// Command goals have no dice; the DM rules on them
const MANUAL_STATUS: Record<BattleGoal['status'], { text: string; tone: string }> = {
  selected: { text: 'Awaiting DM ruling', tone: 'warn' },
  resolved: { text: 'DM ruling', tone: 'info' },
  applied: { text: 'Applied', tone: 'good' },
};

// Rolls within this many points of each other count as a close call
const CLOSE_MARGIN = 10;

type ClashKind = 'good' | 'bad' | 'close' | 'neutral';

// How the clash reads for the viewer's side. `mine` and `theirs` are the viewer's roll and the opposing roll;
// with no side to take (the viewer is not in this fight) the result is neutral.
const judgeClash = (mine: number, theirs: number, hasSide: boolean): { kind: ClashKind; text: string } => {
  const diff = mine - theirs;
  const text = diff > 0 ? `+${diff}` : diff < 0 ? `−${-diff}` : '0';
  if (!hasSide) return { kind: 'neutral', text };
  if (Math.abs(diff) <= CLOSE_MARGIN) return { kind: 'close', text };
  return { kind: diff > 0 ? 'good' : 'bad', text };
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const ResolutionPanel: React.FC<ResolutionPanelProps> = ({ battle, goals, isDM, userId, goalEdits, setGoalEdits, setBattle, setGoals }) => {
  const participants = battle.participants || [];
  // Whose side the viewer is on: a player's own armies, or the DM's temporary armies. Roll colours follow this side.
  const viewerTeams = new Set(
    participants
      .filter(p => (isDM ? p.is_temporary && !p.is_summoned : p.user_id === userId))
      .map(p => p.team_name)
  );

  const applyAll = async () => {
    try {
      const applied = await battleAPI.applyGoalResults(battle.id);
      setBattle(applied.battle);
      setGoals(applied.goals);
    } catch (error) { console.error('Error applying goal results:', error); }
  };

  const pendingApply = goals.some(g => g.status === 'resolved');

  return (
    <div className="bf-pane">
      {goals.length === 0 && (
        <div className="bf-empty-note"><b>No orders this round</b>Nothing was locked in, so there is nothing to resolve.</div>
      )}

      <ul className="bf-results">
        {goals.filter(goal => {
          // Covert operations are only shown to the DM, the team that ran them and, for a strike, the team it hit
          if (isDM) return true;
          const teamOf = (id?: number | null) => participants.find(p => p.id === id)?.team_name;
          if (goal.goal_key === 'vanish') return viewerTeams.has(goal.team_name);
          if (goal.goal_key === 'stealth_strike') return viewerTeams.has(goal.team_name) || viewerTeams.has(teamOf(goal.target_participant_id) || '');
          return true;
        }).map(goal => {
          const executor = participants.find(p => p.id === goal.participant_id);
          const target = goal.target_participant_id ? participants.find(p => p.id === goal.target_participant_id) : undefined;
          const executorName = executor ? getParticipantName(executor) : (goal.executor_army_name || `Army #${goal.participant_id}`);
          const targetName = target ? getParticipantName(target) : (goal.target_army_name || '');
          const color = executor ? getFactionColor(executor) : '#888';
          const manual = !!findGoalByKey(goal.goal_key)?.manual;
          const canResolve = manual ? isDM : (isDM || (!!executor && executor.user_id === userId));
          const status = (manual ? MANUAL_STATUS : STATUS_LABEL)[goal.status] || STATUS_LABEL.selected;
          const edit: GoalEdit = goalEdits[goal.id] || {
            casualties_target: goal.casualties_target || 0,
            casualties_self: goal.casualties_self || 0,
            score_change_target: goal.score_change_target || 0,
            score_change_self: goal.score_change_self || 0,
            morale_self: goal.roll_details?.morale_change || 0,
            morale_target: goal.roll_details?.morale_change_target || 0,
            notes: goal.notes || '',
          };
          const setEdit = (next: Partial<GoalEdit>) => setGoalEdits(prev => ({ ...prev, [goal.id]: { ...edit, ...next } }));
          const num = (v: string) => parseInt(v, 10) || 0;
          const hasCasualties = (goal.casualties_target || 0) !== 0 || (goal.casualties_self || 0) !== 0;
          const hasScores = (goal.score_change_target || 0) !== 0 || (goal.score_change_self || 0) !== 0;
          const showCasualties = goal.goal_type === 'attack' || goal.goal_type === 'defend' || manual;
          const showScores = goal.goal_type === 'logistics' || goal.goal_type === 'attack' || manual;
          const moraleSelf = Number(goal.roll_details?.morale_change) || 0;
          const moraleTarget = Number(goal.roll_details?.morale_change_target) || 0;

          return (
            <li key={goal.id} className="bf-result" style={{ ['--faction' as any]: color }}>
              <div className="bf-result-head">
                <div>
                  <h4 className="bf-result-name">{goal.goal_name}</h4>
                  <div className="bf-result-who">
                    <i aria-hidden="true" /> {executorName}
                    {targetName && <><ArrowRight size={13} aria-hidden="true" /> {targetName}</>}
                  </div>
                </div>
                <span className="bf-tag" data-tone={status.tone}>{status.text}</span>
              </div>

              {goal.attacker_roll && goal.defender_roll ? (() => {
                // Colour follows whether the result is good or bad for the viewer's side, not who won the roll
                const attackerIsMine = !!executor && viewerTeams.has(executor.team_name);
                const defenderIsMine = !!target && viewerTeams.has(target.team_name);
                const viewerIsDefender = defenderIsMine && !attackerIsMine;
                const hasSide = attackerIsMine || defenderIsMine;
                const clash = viewerIsDefender
                  ? judgeClash(goal.defender_roll, goal.attacker_roll, hasSide)
                  : judgeClash(goal.attacker_roll, goal.defender_roll, hasSide);
                return (
                  <div className="bf-clash" data-result={clash.kind} role="group" aria-label={`${executorName} rolled ${goal.attacker_roll} against ${goal.defender_roll}. Difference ${clash.text}`}>
                    <span className="bf-roll" data-mine={!viewerIsDefender ? 'true' : undefined}><small>{executorName}</small><b>{goal.attacker_roll}</b></span>
                    <span className="bf-clash-verdict">{clash.text}</span>
                    <span className="bf-roll" data-pos="right" data-mine={viewerIsDefender ? 'true' : undefined}><small>{goal.roll_details?.stealth ? 'Enemy watchfulness' : (targetName || 'Defender')}</small><b>{goal.defender_roll}</b></span>
                  </div>
                );
              })() : null}

              {Array.isArray(goal.roll_details?.log) && goal.roll_details.log.length > 0 && (
                <details className="bf-log">
                  <summary>How it played out{typeof goal.roll_details.distance_feet === 'number' ? `, ${goal.roll_details.distance_feet} ft apart` : ''}</summary>
                  <ol>{goal.roll_details.log.map((line: string, i: number) => <li key={i}>{line}</li>)}</ol>
                </details>
              )}

              {(goal.logistics_roll || moraleSelf || (goal.advantage && goal.advantage !== 'none')) && (
                <div className="bf-rolls">
                  {goal.advantage && goal.advantage !== 'none' && <span>Advantage: <b>{goal.advantage}</b></span>}
                  {goal.logistics_roll ? <span>Logistics rolled <b>{goal.logistics_roll}</b></span> : null}
                  {moraleSelf ? <span>Morale <b>{signed(moraleSelf)}</b></span> : null}
                </div>
              )}

              {goal.status === 'applied' && (
                <div className="bf-outcome">
                  {hasCasualties && (
                    <div className="bf-outcome-row">
                      <span>Casualties</span>
                      <span className="bf-tag" data-tone="bad">Target {goal.casualties_target || 0}</span>
                      <span className="bf-tag">Self {goal.casualties_self || 0}</span>
                    </div>
                  )}
                  {hasScores && (
                    <div className="bf-outcome-row">
                      <span>Score change</span>
                      <span className="bf-tag" data-tone="good">Target {signed(goal.score_change_target || 0)}</span>
                      <span className="bf-tag" data-tone="info">Self {signed(goal.score_change_self || 0)}</span>
                    </div>
                  )}
                  {(moraleSelf !== 0 || moraleTarget !== 0) && (
                    <div className="bf-outcome-row">
                      <span>Morale</span>
                      {moraleTarget !== 0 && <span className="bf-tag" data-tone={moraleTarget < 0 ? 'bad' : 'good'}>Target {signed(moraleTarget)}</span>}
                      {moraleSelf !== 0 && <span className="bf-tag" data-tone={moraleSelf < 0 ? 'bad' : 'good'}>Self {signed(moraleSelf)}</span>}
                    </div>
                  )}
                  {!hasCasualties && !hasScores && moraleSelf === 0 && moraleTarget === 0 && <div className="bf-outcome-row">No changes recorded.</div>}
                  {goal.notes && <p className="bf-outcome-note">{goal.notes}</p>}
                </div>
              )}

              {manual && !isDM && goal.status !== 'applied' && (
                <p className="bf-hintline" style={{ marginTop: '0.5rem' }}>
                  <Gavel size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> No dice: the DM decides the outcome of this goal.
                </p>
              )}

              {goal.status === 'selected' && canResolve && (
                <div className="bf-result-actions">
                  <button type="button" className="bf-btn" data-variant="primary"
                    onClick={async () => {
                      try {
                        const resolved = await battleAPI.resolveGoal(battle.id, goal.id);
                        setGoals(prev => prev.map(g => (g.id === resolved.id ? resolved : g)));
                      } catch (error) { console.error('Error resolving goal:', error); }
                    }}>
                    {manual ? <Gavel size={15} aria-hidden="true" /> : <Dices size={15} aria-hidden="true" />} {manual ? 'Open for DM ruling' : 'Roll this goal'}
                  </button>
                </div>
              )}

              {isDM && goal.status === 'resolved' && (
                <>
                  <div className="bf-edit">
                    {showCasualties && (
                      <>
                        <label>Target casualties<Stepper label="Target casualties" size="sm" min={0} max={1000000} value={String(edit.casualties_target)} onChange={v => setEdit({ casualties_target: num(v) })} /></label>
                        <label>Self casualties<Stepper label="Self casualties" size="sm" min={0} max={1000000} value={String(edit.casualties_self)} onChange={v => setEdit({ casualties_self: num(v) })} /></label>
                      </>
                    )}
                    {showScores && (
                      <>
                        <label>Target score change<Stepper label="Target score change" size="sm" min={-999} max={999} value={String(edit.score_change_target)} onChange={v => setEdit({ score_change_target: num(v) })} /></label>
                        <label>Self score change<Stepper label="Self score change" size="sm" min={-999} max={999} value={String(edit.score_change_self)} onChange={v => setEdit({ score_change_self: num(v) })} /></label>
                      </>
                    )}
                    {manual && (
                      <>
                        <label>Target morale<Stepper label="Target morale change" size="sm" min={-100} max={100} value={String(edit.morale_target ?? 0)} onChange={v => setEdit({ morale_target: num(v) })} /></label>
                        <label>Self morale<Stepper label="Self morale change" size="sm" min={-100} max={100} value={String(edit.morale_self ?? 0)} onChange={v => setEdit({ morale_self: num(v) })} /></label>
                      </>
                    )}
                    <label className="bf-wide">DM notes
                      <textarea className="bf-textarea" rows={2} value={edit.notes || ''} placeholder="Anything the table should know about this result"
                        onChange={e => setEdit({ notes: e.target.value })} />
                    </label>
                  </div>
                  <div className="bf-result-actions">
                    <button type="button" className="bf-btn"
                      onClick={async () => {
                        try {
                          const updated = await battleAPI.updateGoalResult(battle.id, goal.id, {
                            casualties_target: edit.casualties_target,
                            casualties_self: edit.casualties_self,
                            score_change_target: edit.score_change_target,
                            score_change_self: edit.score_change_self,
                            notes: edit.notes,
                            ...(manual ? { morale_change_self: edit.morale_self ?? 0, morale_change_target: edit.morale_target ?? 0 } : {}),
                          });
                          setGoals(prev => prev.map(g => (g.id === updated.id ? updated : g)));
                        } catch (error) { console.error('Error updating goal result:', error); }
                      }}>
                      <Save size={14} aria-hidden="true" /> Save adjustments
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {isDM && (
        <div className="bf-commit">
          <button type="button" className="bf-btn" data-variant="primary" onClick={applyAll}>
            <CheckCheck size={16} aria-hidden="true" /> Apply results to the armies
          </button>
          {goals.length > 0 && !pendingApply && <p className="bf-hintline" style={{ flexBasis: '100%', margin: 0 }}>Roll each goal first, then adjust and apply.</p>}
        </div>
      )}
    </div>
  );
};

export default ResolutionPanel;
