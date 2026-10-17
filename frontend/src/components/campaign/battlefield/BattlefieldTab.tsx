import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ClipboardList, HeartCrack, Flag, Hourglass, Mail, Play, ScrollText, Swords, Users, Dices, FastForward, Trophy, LogOut, type LucideIcon } from 'lucide-react';
import '../../../styles/battlefield.css';
import type { Battle, BattleGoal, BattleParticipant } from '../../../services/api';
import BattleMapStage, { BoardLightingNode } from './BattleMapStage';
import RosterPanel from './RosterPanel';
import OrdersPanel, { GoalSelections } from './OrdersPanel';
import ResolutionPanel, { GoalEdits } from './ResolutionPanel';
import { ArmyBaseType, BASE_TYPE_GLYPH, getMoraleLevel, isDmRun, MORALE_BREAK_POINT, MORALE_TONE, UNIT_LINES } from './battlefieldHelpers';

export interface BattlefieldActions {
  openSetup: () => void;
  pickMap: () => void;
  clearMap: () => void;
  openLighting: () => void;
  openInvite: () => void;
  openAddArmy: () => void;
  openInvitations: () => void;
  startBattle: () => void;
  toResolution: () => void;
  nextRound: () => void;
  completeBattle: () => void;
  endBattle: () => void;
  moveArmy: (participantId: number, x: number, y: number) => void;
  assignArmy: (participantId: number, patch: { controller_user_id?: number | null; dm_hidden?: boolean }) => void;
  setMorale: (participantId: number, morale: number) => void;
  reviveArmy: (participantId: number) => void;
  placeNode: (x: number, y: number) => void;
  moveNode: (id: string, x: number, y: number) => void;
}

export interface BattlefieldTabProps {
  battle: Battle | null;
  setBattle: React.Dispatch<React.SetStateAction<Battle | null>>;
  goals: BattleGoal[];
  setGoals: React.Dispatch<React.SetStateAction<BattleGoal[]>>;
  isDM: boolean;
  userId?: number;
  mapUrl: string | null;
  remainingMovement: Record<number, number>;
  darknessLevel: number;
  darknessConfirmed: boolean;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  lightingNodes: BoardLightingNode[];
  placingNode: boolean;
  goalSelections: GoalSelections;
  setGoalSelections: React.Dispatch<React.SetStateAction<GoalSelections>>;
  selectedGoalArmyId: number | null;
  setSelectedGoalArmyId: (id: number | null) => void;
  goalEdits: GoalEdits;
  setGoalEdits: React.Dispatch<React.SetStateAction<GoalEdits>>;
  ordersRequested: boolean;
  pendingInvitationCount: number;
  notify: (message: string) => void;
  actions: BattlefieldActions;
}

type RailTab = 'roster' | 'orders';

const PHASES: Array<{ key: Battle['status']; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'goal_selection', label: 'Orders' },
  { key: 'resolution', label: 'Resolution' },
];
const phaseIndex = (status: Battle['status']) => Math.max(0, PHASES.findIndex(p => p.key === status));

const MANUAL_STEPS: Array<{ Icon: LucideIcon; tone: string; title: string; text: string }> = [
  { Icon: Users, tone: '132, 168, 204', title: 'Planning', text: 'The DM invites players, adds temporary enemy armies and lays out the map. Armies are set where the fight will start.' },
  { Icon: ClipboardList, tone: 'var(--theme-accent-rgb)', title: 'Orders', text: 'Each round, every army locks in one goal: attack, defend, resupply or command. Armies move first, then orders are locked in.' },
  { Icon: Dices, tone: '226, 108, 98', title: 'Resolution', text: 'Goals are rolled, the DM adjusts the casualties and score changes, and the results are applied before the next round.' },
];

const REACH_ROWS = (Object.keys(UNIT_LINES) as ArmyBaseType[]).map(baseType => ({ baseType, ...UNIT_LINES[baseType] }));

const BattlefieldTab: React.FC<BattlefieldTabProps> = (props) => {
  const {
    battle, setBattle, goals, setGoals, isDM, userId, mapUrl, remainingMovement, darknessLevel, darknessConfirmed,
    canvasRef, lightingNodes, placingNode, goalSelections, setGoalSelections, selectedGoalArmyId, setSelectedGoalArmyId,
    goalEdits, setGoalEdits, ordersRequested, pendingInvitationCount, notify, actions,
  } = props;

  const [tab, setTab] = useState<RailTab>('roster');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [terrainOpen, setTerrainOpen] = useState(false);

  const status = battle?.status;
  const round = battle?.current_round;

  useEffect(() => {
    if (!battle) return;
    setTab(battle.status === 'planning' ? 'roster' : 'orders');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.id, status, round]);

  useEffect(() => {
    if (ordersRequested && battle && battle.status !== 'planning') setTab('orders');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersRequested]);

  useEffect(() => {
    if (!battle) { setSelectedId(null); return; }
    if (selectedId && !(battle.participants || []).some(p => p.id === selectedId && (p.current_troops || 0) > 0)) setSelectedId(null);
  }, [battle, selectedId]);

  const selectable: BattleParticipant[] = useMemo(() => {
    if (!battle?.participants) return [];
    return battle.participants.filter(p => {
      if ((p.current_troops || 0) <= 0) return false;
      if (isDmRun(p)) return isDM;
      return p.user_id === userId;
    });
  }, [battle?.participants, isDM, userId]);

  const orderingArmyId = selectedGoalArmyId ?? selectable[0]?.id ?? null;

  const handleSelect = (id: number | null) => {
    setSelectedId(id);
    if (id && status === 'goal_selection' && selectable.some(p => p.id === id)) setSelectedGoalArmyId(id);
  };

  /* ── No battle: field manual ───────────────────────────────────────────── */
  if (!battle) {
    return (
      <section className="bf-manual bf kt-ui" aria-labelledby="bf-manual-title">
        <div>
          <h2 id="bf-manual-title">No battle in the field</h2>
          <p className="bf-manual-lead">
            {isDM
              ? 'Start a battle, bring in the players’ armies and set up the enemy. Each round the armies move, lock in orders, and the DM rolls the results.'
              : 'The Dungeon Master has not started a battle. When one begins you will join with your armies, move them on the map and lock in orders each round.'}
          </p>
          {isDM ? (
            <button type="button" className="bf-btn" data-variant="primary" onClick={actions.openSetup}>
              <Swords size={17} aria-hidden="true" /> Start a battle
            </button>
          ) : pendingInvitationCount > 0 ? (
            <button type="button" className="bf-btn" data-variant="primary" onClick={actions.openInvitations}>
              <Mail size={17} aria-hidden="true" /> {pendingInvitationCount === 1 ? 'You have a battle invitation' : `You have ${pendingInvitationCount} battle invitations`}
            </button>
          ) : null}
          <ol className="bf-steps" style={{ marginTop: '2rem' }}>
            {MANUAL_STEPS.map(({ Icon, tone, title, text }) => (
              <li key={title}>
                <span className="bf-step-icon" style={{ ['--tone' as any]: tone }} aria-hidden="true"><Icon size={19} /></span>
                <div><strong>{title}</strong><p>{text}</p></div>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3>Reach and movement per round</h3>
          <table className="bf-reach">
            <thead><tr><th scope="col">Unit line</th><th scope="col">Reach</th><th scope="col">Movement</th></tr></thead>
            <tbody>
              {REACH_ROWS.map(({ baseType, label, reach, movement }) => {
                const Glyph = BASE_TYPE_GLYPH[baseType];
                return (
                  <tr key={baseType}>
                    <td><Glyph size={17} aria-hidden="true" /> {label}</td>
                    <td>{reach} ft</td>
                    <td>{movement} ft</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="bf-manual-note">Distances are measured on the map. A goal against an enemy army can only be locked in when that army is inside your reach.</p>
        </div>
      </section>
    );
  }

  /* ── Battle in progress ────────────────────────────────────────────────── */
  const participants = battle.participants || [];
  const alive = participants.filter(p => (p.current_troops || 0) > 0);
  const total = battle.total_rounds || 5;
  const current = phaseIndex(battle.status);
  const lockedCount = alive.filter(p => p.has_selected_goal).length;
  const myUnlocked = selectable.filter(p => !p.has_selected_goal).length;
  const pendingResolve = goals.filter(g => g.status === 'selected' && (isDM || participants.some(p => p.id === g.participant_id && p.user_id === userId))).length;
  const ordersTabLabel = battle.status === 'resolution' ? 'Results' : 'Orders';
  const ordersAlert = battle.status === 'goal_selection' ? myUnlocked : battle.status === 'resolution' ? pendingResolve : 0;

  const targetId = battle.status === 'goal_selection' && orderingArmyId ? (goalSelections[orderingArmyId]?.targetId ?? null) : null;
  const terrain = battle.terrain_description || '';
  const terrainLong = terrain.length > 120;

  const primary = (() => {
    if (!isDM) return null;
    if (battle.status === 'planning') {
      return { label: 'Start the battle', Icon: Play, onClick: actions.startBattle, disabled: participants.length === 0, note: participants.length === 0 ? 'Add armies before starting.' : `${alive.length} armies ready. Starting sets each army’s base score.` };
    }
    if (battle.status === 'goal_selection') {
      return { label: 'Move to resolution', Icon: FastForward, onClick: actions.toResolution, disabled: false, note: `${lockedCount} of ${alive.length} armies have locked orders.` };
    }
    if (battle.status === 'resolution' && battle.current_round < total) {
      return { label: `Start round ${battle.current_round + 1}`, Icon: FastForward, onClick: actions.nextRound, disabled: false, note: 'Apply this round’s results first, then move on. Movement resets for everyone.' };
    }
    if (battle.status === 'resolution') {
      return { label: 'Complete the battle', Icon: Trophy, onClick: actions.completeBattle, disabled: false, note: 'This was the final round. Completing shows the final scores.' };
    }
    return null;
  })();

  // Armies the viewer commands whose morale has slipped
  const shaky = selectable.filter(p => { const level = getMoraleLevel(p); return level && level !== 'steady'; });
  const breaking = shaky.filter(p => getMoraleLevel(p) === 'breaking');
  const moraleAlert = shaky.length === 0 ? null : {
    tone: breaking.length > 0 ? 'bad' : MORALE_TONE.wavering,
    text: breaking.length > 0
      ? `${breaking.map(p => p.temp_army_name || p.army_name).join(', ')} ${breaking.length === 1 ? 'is' : 'are'} below ${MORALE_BREAK_POINT} morale and may flee at the start of the next round.`
      : `${shaky.map(p => p.temp_army_name || p.army_name).join(', ')} ${shaky.length === 1 ? 'is' : 'are'} losing heart.`,
  };

  const playerStatus = (() => {
    if (isDM) return null;
    if (battle.status === 'planning') return { Icon: Hourglass, text: 'The Dungeon Master is setting up the armies. You can still look around the map.' };
    if (battle.status === 'goal_selection') {
      return myUnlocked > 0
        ? { Icon: ClipboardList, text: `${myUnlocked} of your ${selectable.length === 1 ? 'army needs' : 'armies need'} orders. Move first, then lock them in.` }
        : { Icon: Check, text: selectable.length > 0 ? `Your orders are locked. ${alive.length - lockedCount} armies still deciding.` : `${alive.length - lockedCount} armies still deciding.` };
    }
    if (battle.status === 'resolution') return { Icon: Dices, text: pendingResolve > 0 ? `${pendingResolve} of your goals can be rolled now.` : 'Goals are being rolled and applied.' };
    return null;
  })();

  return (
    <div className="bf kt-ui">
      <BattleMapStage
        battle={battle}
        isDM={isDM}
        userId={userId}
        mapUrl={mapUrl}
        remainingMovement={remainingMovement}
        darknessLevel={darknessLevel}
        darknessConfirmed={darknessConfirmed}
        canvasRef={canvasRef}
        lightingNodes={lightingNodes}
        placingNode={placingNode}
        selectedId={selectedId}
        targetId={targetId}
        hoveredId={hoveredId}
        onSelect={handleSelect}
        onHover={setHoveredId}
        onMoveArmy={actions.moveArmy}
        onPlaceNode={actions.placeNode}
        onMoveNode={actions.moveNode}
        onPickMap={actions.pickMap}
        onClearMap={actions.clearMap}
        onOpenLighting={actions.openLighting}
      />

      <aside className="bf-rail" data-phase={battle.status} aria-label="Battle command rail">
        <div className="bf-rail-head">
          <h3 className="bf-title" key={battle.status}>{battle.battle_name}</h3>
          {terrain && (
            terrainLong ? (
              <button type="button" className="bf-terrain" data-clamped={!terrainOpen ? 'true' : undefined} aria-expanded={terrainOpen} onClick={() => setTerrainOpen(o => !o)}>
                <span>{terrain}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            ) : <p className="bf-terrain">{terrain}</p>
          )}

          <div className="bf-round">
            <span className="bf-round-label">Round {battle.current_round} <span>of {total}</span></span>
            <div className="bf-round-track" role="img" aria-label={`Round ${battle.current_round} of ${total}`}>
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className="bf-round-seg" data-state={i + 1 < battle.current_round ? 'done' : i + 1 === battle.current_round ? 'now' : 'todo'} />
              ))}
            </div>
          </div>

          <ol className="bf-phases" style={{ listStyle: 'none', padding: 0, marginBottom: 0 }} aria-label="Battle phase">
            {PHASES.map((p, i) => (
              <li key={p.key} className="bf-phase" data-state={i < current ? 'done' : i === current ? 'now' : 'todo'} aria-current={i === current ? 'step' : undefined}>
                {i < current ? <Check size={13} aria-hidden="true" /> : null}{p.label}
              </li>
            ))}
          </ol>

          {(primary || playerStatus || moraleAlert) && (
            <div className="bf-action">
              {primary && (
                <>
                  <button type="button" className="bf-btn" data-variant="primary" data-size="lg" disabled={primary.disabled} onClick={primary.onClick}>
                    <primary.Icon size={17} aria-hidden="true" /> {primary.label}
                  </button>
                  <p className="bf-action-note">{primary.note}</p>
                </>
              )}
              {moraleAlert && (
                <div className="bf-status" data-tone={moraleAlert.tone} role="status"><HeartCrack size={18} aria-hidden="true" /> <span>{moraleAlert.text}</span></div>
              )}
              {playerStatus && (
                <div className="bf-status" role="status"><playerStatus.Icon size={18} aria-hidden="true" /> <span>{playerStatus.text}</span></div>
              )}
            </div>
          )}
        </div>

        <div className="bf-tabs" role="tablist" aria-label="Rail sections">
          <button type="button" role="tab" id="bf-tab-roster" className="bf-tab" aria-selected={tab === 'roster'} aria-controls="bf-panel" onClick={() => setTab('roster')}>
            <Flag size={15} aria-hidden="true" /> Armies <span className="bf-count">{participants.length}</span>
          </button>
          {battle.status !== 'planning' && (
            <button type="button" role="tab" id="bf-tab-orders" className="bf-tab" aria-selected={tab === 'orders'} aria-controls="bf-panel" onClick={() => setTab('orders')}>
              <ScrollText size={15} aria-hidden="true" /> {ordersTabLabel}
              {ordersAlert > 0 && <span className="bf-count" data-alert="true">{ordersAlert}</span>}
            </button>
          )}
        </div>

        <div className="bf-body" id="bf-panel" role="tabpanel" aria-labelledby={tab === 'roster' ? 'bf-tab-roster' : 'bf-tab-orders'}>
          {(tab === 'roster' || battle.status === 'planning') ? (
            <RosterPanel
              key="roster"
              battle={battle}
              isDM={isDM}
              userId={userId}
              selectedId={selectedId}
              hoveredId={hoveredId}
              remainingMovement={remainingMovement}
              onSelect={handleSelect}
              onHover={setHoveredId}
              onInvite={actions.openInvite}
              onAddArmy={actions.openAddArmy}
              onAssign={actions.assignArmy}
              onSetMorale={actions.setMorale}
              onRevive={actions.reviveArmy}
            />
          ) : battle.status === 'goal_selection' ? (
            <OrdersPanel
              key={`orders-${battle.current_round}`}
              battle={battle}
              goals={goals}
              selectable={selectable}
              selectedArmyId={orderingArmyId}
              goalSelections={goalSelections}
              setGoalSelections={setGoalSelections}
              onPickArmy={(id) => { setSelectedGoalArmyId(id); setSelectedId(id); }}
              setBattle={setBattle}
              setGoals={setGoals}
              notify={notify}
            />
          ) : (
            <ResolutionPanel
              key={`results-${battle.current_round}`}
              battle={battle}
              goals={goals}
              isDM={isDM}
              userId={userId}
              goalEdits={goalEdits}
              setGoalEdits={setGoalEdits}
              setBattle={setBattle}
              setGoals={setGoals}
            />
          )}
        </div>

        {isDM && (
          <div className="bf-rail-foot">
            <button type="button" className="bf-btn" data-variant="quiet" data-size="sm" onClick={actions.endBattle}>
              <LogOut size={14} aria-hidden="true" /> End battle
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};

export default BattlefieldTab;
