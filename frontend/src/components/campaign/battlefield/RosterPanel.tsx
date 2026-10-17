import React from 'react';
import { EyeOff, Footprints, HeartCrack, Target, User, UserPlus, Users, VenetianMask } from 'lucide-react';
import type { Battle, BattleParticipant } from '../../../services/api';
import { CommanderPicker } from './BattleDialogs';
import {
  BASE_TYPE_GLYPH,
  BASE_TYPE_LABEL,
  getMoraleLevel,
  goneKind,
  getBattlePlayers,
  isConcealedFrom,
  isDmRun,
  isGone,
  MORALE_BREAK_POINT,
  MORALE_LABEL,
  MORALE_TONE,
  formatCount,
  getArmyBaseType,
  getArmyMovementSpeed,
  getArmyRangeLabel,
  getFactionColor,
  getParticipantCategory,
  getParticipantName,
  readableOn,
} from './battlefieldHelpers';

// DM stepper for an army's morale: the typed number is committed on blur or Enter, the buttons nudge it at once
const MoraleEditor: React.FC<{ value: number; onCommit: (morale: number) => void }> = ({ value, onCommit }) => {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = (next: number) => {
    const morale = Math.max(0, Math.round(next));
    if (Number.isFinite(morale) && morale !== value) onCommit(morale);
    else setDraft(String(value));
  };

  return (
    <div className="bf-morale-edit">
      <span>Set morale</span>
      <button type="button" className="bf-btn" data-size="sm" aria-label="Lower morale by 5" onClick={() => commit(value - 5)}>−5</button>
      <button type="button" className="bf-btn" data-size="sm" aria-label="Lower morale by 1" onClick={() => commit(value - 1)}>−1</button>
      <input
        className="bf-input"
        type="number"
        min={0}
        inputMode="numeric"
        aria-label="Army morale"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(Number(draft))}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <button type="button" className="bf-btn" data-size="sm" aria-label="Raise morale by 1" onClick={() => commit(value + 1)}>+1</button>
      <button type="button" className="bf-btn" data-size="sm" aria-label="Raise morale by 5" onClick={() => commit(value + 5)}>+5</button>
    </div>
  );
};

interface RosterPanelProps {
  battle: Battle;
  isDM: boolean;
  userId?: number;
  selectedId: number | null;
  hoveredId: number | null;
  remainingMovement: Record<number, number>;
  onSelect: (id: number | null) => void;
  onHover: (id: number | null) => void;
  onInvite: () => void;
  onAddArmy: () => void;
  onAssign: (participantId: number, patch: { controller_user_id?: number | null; dm_hidden?: boolean }) => void;
  onSetMorale: (participantId: number, morale: number) => void;
}

const RosterPanel: React.FC<RosterPanelProps> = ({
  battle, isDM, userId, selectedId, hoveredId, remainingMovement, onSelect, onHover, onInvite, onAddArmy, onAssign, onSetMorale,
}) => {
  // Hidden enemy armies are not on anyone's roster but their own side's
  const participants = (battle.participants || []).filter(p => !isConcealedFrom(p, battle.participants || [], userId, isDM));
  const planning = battle.status === 'planning';
  const players = getBattlePlayers(battle.participants || []);

  const teams: Array<{ name: string; members: BattleParticipant[] }> = [];
  participants.forEach(p => {
    let team = teams.find(t => t.name === p.team_name);
    if (!team) { team = { name: p.team_name, members: [] }; teams.push(team); }
    team.members.push(p);
  });

  return (
    <div className="bf-pane">
      {isDM && planning && (
        <div className="bf-roster-tools">
          <button type="button" className="bf-btn" onClick={onInvite}>
            <UserPlus size={14} aria-hidden="true" /> Invite players
          </button>
          <button type="button" className="bf-btn" onClick={onAddArmy}>
            <VenetianMask size={14} aria-hidden="true" /> Add AI army
          </button>
        </div>
      )}

      {teams.length === 0 && (
        <div className="bf-empty-note">
          <b>No armies yet</b>
          {isDM
            ? 'Invite players to bring their armies, or add a temporary army for the enemy.'
            : 'Waiting for the Dungeon Master to bring armies into the battle.'}
        </div>
      )}

      {teams.map(team => {
        const color = getFactionColor(team.members[0]);
        const score = team.members.reduce((sum, p) => sum + ((p.current_troops || 0) > 0 ? (p.current_score || 0) : 0), 0);
        return (
          <section key={team.name} className="bf-team" style={{ ['--faction' as any]: color }} aria-label={`Team ${team.name}`}>
            <header className="bf-team-head">
              <span className="bf-team-swatch" aria-hidden="true" />
              <h4 className="bf-team-name">{team.name}</h4>
              <span className="bf-team-meta">{team.members.length} {team.members.length === 1 ? 'army' : 'armies'}</span>
              {!planning && (
                <span className="bf-team-score">Score <b>{score}</b></span>
              )}
            </header>
            <ul className="bf-army-list">
              {team.members.map(p => {
                const category = getParticipantCategory(p);
                const baseType = getArmyBaseType(category);
                const Glyph = BASE_TYPE_GLYPH[baseType];
                const pColor = getFactionColor(p);
                const troops = p.current_troops || 0;
                const total = p.army_total_troops || troops || 1;
                const low = troops < total * 0.5;
                const open = p.id === selectedId;
                const modifier = (p.current_score || 0) - (p.base_score || 0);
                const left = remainingMovement[p.id] ?? 0;
                const wiped = isGone(p);
                const gone = goneKind(p);
                // Morale is shown to the DM and to the player who commands the army, never to the other side
                const moraleVisible = isDM || p.user_id === userId;
                const moraleLevel = moraleVisible && !wiped ? getMoraleLevel(p) : null;
                // Morale has no ceiling: the bar scales to whichever is larger, the starting value or the current morale
                const moraleStart = p.max_morale || 100;
                const moraleMax = Math.max(moraleStart, p.current_morale || 0);
                return (
                  <li key={p.id} data-hover={hoveredId === p.id ? 'true' : undefined}>
                    <button
                      type="button"
                      className="bf-army"
                      aria-pressed={open}
                      style={{ ['--faction' as any]: pColor, ['--on-faction' as any]: readableOn(pColor), opacity: wiped ? 0.5 : 1 }}
                      onClick={() => onSelect(open ? null : p.id)}
                      onPointerEnter={() => onHover(p.id)}
                      onPointerLeave={() => onHover(null)}
                    >
                      <span className="bf-army-glyph" aria-hidden="true"><Glyph size={17} strokeWidth={2.25} /></span>
                      <span className="bf-army-main">
                        <span className="bf-army-name">{getParticipantName(p)}</span>
                        {p.is_hidden && <span className="bf-tag" data-tone="info" style={{ marginTop: '0.25rem', marginRight: '0.3rem' }}><EyeOff size={11} aria-hidden="true" /> Hidden</span>}
                        {p.dm_hidden && <span className="bf-tag" data-tone="info" style={{ marginTop: '0.25rem', marginRight: '0.3rem' }}><EyeOff size={11} aria-hidden="true" /> {isDM ? 'Unseen by other factions' : 'Hidden from the enemy'}</span>}
                        {moraleLevel && moraleLevel !== 'steady' && (
                          <span className="bf-tag" data-tone={MORALE_TONE[moraleLevel]} style={{ marginTop: '0.25rem' }}>
                            <HeartCrack size={11} aria-hidden="true" /> {MORALE_LABEL[moraleLevel]}
                          </span>
                        )}
                        <span className="bf-army-sub">
                          {category}{p.is_summoned ? ` · raised, ${p.player_name || 'undead'}` : p.player_name ? ` · ${p.player_name}` : p.is_temporary ? ' · DM' : ''}
                        </span>
                      </span>
                      <span className="bf-army-figure">
                        <b>{wiped && p.has_fled ? formatCount(p.fled_troops) : formatCount(troops)}</b>
                        <span>{wiped ? (gone === 'fled' ? 'fled the field' : 'fallen') : 'troops'}</span>
                      </span>
                      <span className="bf-army-bar" data-low={low ? 'true' : undefined} aria-hidden="true">
                        <i style={{ width: `${Math.min(100, (troops / total) * 100)}%` }} />
                      </span>
                    </button>
                    {open && (
                      <div className="bf-army-detail" style={{ ['--faction' as any]: pColor }}>
                        {!planning && (
                          <dl className="bf-facts">
                            <div><dt>Base score</dt><dd>{p.base_score || 0}</dd></div>
                            <div><dt>Current</dt><dd>{p.current_score || 0}</dd></div>
                            <div>
                              <dt>Modifier</dt>
                              <dd data-tone={modifier > 0 ? 'good' : modifier < 0 ? 'bad' : undefined}>{modifier > 0 ? '+' : ''}{modifier}</dd>
                            </div>
                          </dl>
                        )}
                        {moraleLevel && p.current_morale !== null && p.current_morale !== undefined && (
                          <div className="bf-morale" data-tone={MORALE_TONE[moraleLevel]}>
                            <div className="bf-morale-head">
                              <span>Morale</span>
                              <b>{p.current_morale}</b><small>started at {moraleStart}</small>
                              <em>{MORALE_LABEL[moraleLevel]}</em>
                            </div>
                            <div className="bf-morale-bar" role="img" aria-label={`Morale ${p.current_morale}, started at ${moraleStart}. Below ${MORALE_BREAK_POINT} the army may desert.`}>
                              <i style={{ transform: `scaleX(${Math.min(1, p.current_morale / moraleMax)})` }} />
                              <u style={{ left: `${(MORALE_BREAK_POINT / moraleMax) * 100}%` }} />
                            </div>
                            <small>Below {MORALE_BREAK_POINT} the army risks deserting at the start of a round.</small>
                            {isDM && <MoraleEditor value={p.current_morale} onCommit={(morale) => onSetMorale(p.id, morale)} />}
                          </div>
                        )}
                        {wiped && gone === 'fled' && p.last_morale_check && (
                          <p className="bf-hintline">Failed its morale save in round {p.last_morale_check.round}: rolled {p.last_morale_check.roll}, needed {p.last_morale_check.needed} or less.</p>
                        )}
                        <ul className="bf-lines">
                          <li><Target size={14} aria-hidden="true" /> {BASE_TYPE_LABEL[baseType]} · {getArmyRangeLabel(category)}</li>
                          <li><Footprints size={14} aria-hidden="true" /> {Math.round(left)} of {getArmyMovementSpeed(category)} ft movement left this round</li>
                          <li>
                            {isDmRun(p) ? <Users size={14} aria-hidden="true" /> : <User size={14} aria-hidden="true" />}
                            {p.is_summoned
                              ? `Raised undead, commanded by ${p.player_name || 'its master'}`
                              : isDmRun(p) ? 'Temporary army run by the DM'
                              : p.is_temporary ? `Temporary army, commanded by ${p.player_name || 'a player'}`
                              : `Commanded by ${p.player_name || 'a player'}`}
                          </li>
                          {p.dm_hidden && (
                            <li><EyeOff size={14} aria-hidden="true" /> {isDM ? 'Other factions cannot see or target it. It is revealed in the resolution phase once its goal is locked.' : 'Other factions cannot see or target it yet.'}</li>
                          )}
                        </ul>
                        {isDM && p.is_temporary && !p.is_summoned && !wiped && (
                          <>
                            <fieldset className="bf-field">
                              <legend>Commanded by</legend>
                              <CommanderPicker players={players} value={p.controller_user_id ?? null} onChange={(id) => onAssign(p.id, { controller_user_id: id })} />
                              {players.length === 0 && <p className="bf-hintline">No players have joined yet. Invite some to hand this army over.</p>}
                            </fieldset>
                            <fieldset className="bf-field">
                              <legend>Visibility</legend>
                              <div className="bf-chips">
                                <button type="button" className="bf-chip" aria-pressed={!!p.dm_hidden} onClick={() => onAssign(p.id, { dm_hidden: !p.dm_hidden })}>
                                  <EyeOff size={13} aria-hidden="true" /> Hidden from other factions
                                </button>
                              </div>
                            </fieldset>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

export default RosterPanel;
