import React, { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Crown, EyeOff, Flame, Mail, Package, Plus, Shield, Swords, Trash2, Upload, UserPlus, VenetianMask, X, Trophy } from 'lucide-react';
import '../../../styles/battlefield.css';
import { ARMY_CATEGORY_GROUPS } from '../../../utils/unitTemplates';
import { Stepper } from '../kingdomUi';
import { BASE_TYPE_GLYPH, formatCount, getArmyBaseType, type BattlePlayer } from './battlefieldHelpers';

/* ── Shell ─────────────────────────────────────────────────────────────────── */

interface ShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  wide?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const DialogShell: React.FC<ShellProps> = ({ open, onOpenChange, title, description, wide, footer, children }) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="bf-dialog-overlay" />
      <Dialog.Content className="bf-dialog kt-ui" data-wide={wide ? 'true' : undefined}>
        <div className="bf-dialog-head">
          <div>
            <Dialog.Title className="bf-dialog-title">{title}</Dialog.Title>
            {description ? <Dialog.Description className="bf-dialog-desc">{description}</Dialog.Description> : null}
          </div>
          <Dialog.Close asChild>
            <button type="button" className="bf-icon-btn" aria-label="Close"><X size={18} aria-hidden="true" /></button>
          </Dialog.Close>
        </div>
        <div className="bf-dialog-body">{children}</div>
        {footer ? <div className="bf-dialog-foot">{footer}</div> : null}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

/* ── Shared field pieces ───────────────────────────────────────────────────── */

interface FactionPickerProps {
  factions: string[];
  mode: 'existing' | 'new';
  selection: string;
  name: string;
  onPickExisting: (faction: string) => void;
  onPickNew: () => void;
  onNameChange: (name: string) => void;
}

const FactionPicker: React.FC<FactionPickerProps> = ({ factions, mode, selection, name, onPickExisting, onPickNew, onNameChange }) => (
  <fieldset className="bf-field">
    <legend>Team or faction</legend>
    <div className="bf-chips">
      {factions.map(f => (
        <button key={f} type="button" className="bf-chip" aria-pressed={mode === 'existing' && selection === f} onClick={() => onPickExisting(f)}>
          {mode === 'existing' && selection === f ? <Check size={13} aria-hidden="true" /> : null}{f}
        </button>
      ))}
      <button type="button" className="bf-chip" data-dashed="true" aria-pressed={mode === 'new'} onClick={onPickNew}>
        <Plus size={13} aria-hidden="true" /> New faction
      </button>
    </div>
    {mode === 'new' && (
      <input className="bf-input" type="text" value={name} placeholder="Name the new faction" aria-label="New faction name" onChange={e => onNameChange(e.target.value)} />
    )}
    <p className="bf-hintline">Faction colours are assigned automatically.</p>
  </fieldset>
);

/* Who commands a DM army: the DM, or a player who has brought armies (the army then joins that player's faction) */
export const CommanderPicker: React.FC<{
  players: BattlePlayer[];
  value: number | null;
  onChange: (userId: number | null) => void;
  label?: string;
}> = ({ players, value, onChange, label = 'Commanded by' }) => (
  <div className="bf-chips" role="group" aria-label={label}>
    <button type="button" className="bf-chip" aria-pressed={value === null} onClick={() => onChange(null)}>
      {value === null ? <Check size={13} aria-hidden="true" /> : null}Dungeon Master
    </button>
    {players.map(p => (
      <button key={p.userId} type="button" className="bf-chip" aria-pressed={value === p.userId} onClick={() => onChange(p.userId)}>
        {value === p.userId ? <Check size={13} aria-hidden="true" /> : null}{p.name}
      </button>
    ))}
  </div>
);

/* ── Start a battle ────────────────────────────────────────────────────────── */

export interface BattleSetupData { name: string; terrain_description: string; total_rounds: number }

export const BattleSetupDialog: React.FC<{
  open: boolean;
  data: BattleSetupData;
  setData: (next: BattleSetupData) => void;
  onCreate: () => void;
  onCancel: () => void;
}> = ({ open, data, setData, onCreate, onCancel }) => (
  <DialogShell
    open={open}
    onOpenChange={(o) => { if (!o) onCancel(); }}
    title="Start a battle"
    description="Name the fight and describe the ground. You add armies once it is created."
    footer={
      <>
        <button type="button" className="bf-btn" data-variant="quiet" onClick={onCancel}>Cancel</button>
        <button type="button" className="bf-btn" data-variant="primary" disabled={!data.name.trim()} onClick={onCreate}>
          <Swords size={15} aria-hidden="true" /> Create battle
        </button>
      </>
    }
  >
    <div className="bf-field">
      <label className="bf-label" htmlFor="bf-battle-name">Battle name</label>
      <input id="bf-battle-name" className="bf-input" type="text" autoFocus value={data.name} placeholder="Siege of Ironhold"
        onChange={e => setData({ ...data, name: e.target.value })} />
    </div>
    <div className="bf-field">
      <label className="bf-label" htmlFor="bf-battle-terrain">Terrain</label>
      <textarea id="bf-battle-terrain" className="bf-textarea" rows={4} value={data.terrain_description}
        placeholder="Fortifications, weather, obstacles, anything that tilts the fight."
        onChange={e => setData({ ...data, terrain_description: e.target.value })} />
    </div>
    <div className="bf-field">
      <span className="bf-label" id="bf-rounds-label">Rounds</span>
      <div><Stepper label="Number of rounds" min={1} max={20} value={String(data.total_rounds)}
        onChange={v => setData({ ...data, total_rounds: parseInt(v, 10) || 1 })} /></div>
      <p className="bf-hintline">Five rounds is the default. The battle ends after the last round is resolved.</p>
    </div>
  </DialogShell>
);

/* ── Add AI army ───────────────────────────────────────────────────────────── */

export interface AiArmyData {
  team: string;
  tempArmyName: string;
  tempArmyCategory: string;
  tempArmyTroops: number;
  tempArmyStats: { equipment: number; discipline: number; morale: number; command: number; logistics: number };
  // Concealed from every faction but the DM (and the faction commanding it) until it has locked a goal
  dmHidden: boolean;
  // A player the army is handed to; it then fights for that player's faction. Null means the DM runs it.
  controllerUserId: number | null;
}

const STAT_ROWS: Array<{ key: keyof AiArmyData['tempArmyStats']; label: string; Icon: typeof Swords }> = [
  { key: 'equipment', label: 'Equipment', Icon: Swords },
  { key: 'discipline', label: 'Discipline', Icon: Shield },
  { key: 'morale', label: 'Morale', Icon: Flame },
  { key: 'command', label: 'Command', Icon: Crown },
  { key: 'logistics', label: 'Logistics', Icon: Package },
];

const TROOP_QUICK = [50, 100, 250, 500, 1000, 5000];

export const AddArmyDialog: React.FC<{
  open: boolean;
  factions: string[];
  players: BattlePlayer[];
  teamMode: 'existing' | 'new';
  teamSelection: string;
  data: AiArmyData;
  onPickExisting: (faction: string) => void;
  onPickNew: () => void;
  onTeamName: (name: string) => void;
  onChange: (next: Partial<AiArmyData>) => void;
  onCategory: (category: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ open, factions, players, teamMode, teamSelection, data, onPickExisting, onPickNew, onTeamName, onChange, onCategory, onSubmit, onCancel }) => {
  const groupOf = (category: string) => Object.keys(ARMY_CATEGORY_GROUPS).find(g => ARMY_CATEGORY_GROUPS[g].includes(category)) || 'Infantry';
  const [group, setGroup] = useState(() => groupOf(data.tempArmyCategory));
  const commander = players.find(pl => pl.userId === data.controllerUserId) || null;
  const ready = !!data.tempArmyName.trim() && (!!commander || !!data.team.trim());

  return (
    <DialogShell
      open={open}
      onOpenChange={(o) => { if (!o) onCancel(); }}
      title="Add a temporary army"
      description="A DM-run army for this battle only. It is removed when the battle ends."
      footer={
        <>
          <button type="button" className="bf-btn" data-variant="quiet" onClick={onCancel}>Cancel</button>
          <button type="button" className="bf-btn" data-variant="primary" disabled={!ready} onClick={onSubmit}>
            <VenetianMask size={15} aria-hidden="true" /> Add army
          </button>
        </>
      }
    >
      <fieldset className="bf-field">
        <legend>Commanded by</legend>
        <CommanderPicker players={players} value={commander ? commander.userId : null} onChange={(userId) => onChange({ controllerUserId: userId })} />
        <p className="bf-hintline">
          {commander
            ? `${commander.name} controls this army and it fights for team ${commander.team}.`
            : 'You run this army. Hand it to a player who has joined the battle and they command it instead.'}
        </p>
      </fieldset>

      {!commander && (
        <FactionPicker factions={factions} mode={teamMode} selection={teamSelection} name={data.team}
          onPickExisting={onPickExisting} onPickNew={onPickNew} onNameChange={onTeamName} />
      )}

      <fieldset className="bf-field">
        <legend>Visibility</legend>
        <div className="bf-chips">
          <button type="button" className="bf-chip" aria-pressed={data.dmHidden} onClick={() => onChange({ dmHidden: !data.dmHidden })}>
            <EyeOff size={13} aria-hidden="true" /> Hidden from other factions
          </button>
        </div>
        <p className="bf-hintline">
          {data.dmHidden
            ? 'Only you and the army’s own faction can see it, and no one can target it. It appears when the battle moves to resolution after its goal is locked.'
            : 'Visible to everyone on the map.'}
        </p>
      </fieldset>

      <div className="bf-field">
        <label className="bf-label" htmlFor="bf-ai-name">Army name</label>
        <input id="bf-ai-name" className="bf-input" type="text" value={data.tempArmyName} placeholder="Goblin horde"
          onChange={e => onChange({ tempArmyName: e.target.value })} />
      </div>

      <fieldset className="bf-field">
        <legend>Unit type</legend>
        <div className="bf-chips" role="group" aria-label="Unit line">
          {Object.keys(ARMY_CATEGORY_GROUPS).map(g => {
            const Glyph = BASE_TYPE_GLYPH[getArmyBaseType(ARMY_CATEGORY_GROUPS[g][0])];
            return (
              <button key={g} type="button" className="bf-chip" aria-pressed={group === g} onClick={() => setGroup(g)}>
                <Glyph size={14} aria-hidden="true" /> {g}
              </button>
            );
          })}
        </div>
        <div className="bf-chips" role="group" aria-label="Unit rank">
          {ARMY_CATEGORY_GROUPS[group].map(category => (
            <button key={category} type="button" className="bf-chip" aria-pressed={data.tempArmyCategory === category} onClick={() => onCategory(category)}>
              {category}
            </button>
          ))}
        </div>
        <p className="bf-hintline">Choosing a unit type fills in matching stats. Adjust them below.</p>
      </fieldset>

      <fieldset className="bf-field">
        <legend>Troops</legend>
        <div><Stepper label="Troop count" min={1} step={10} value={String(data.tempArmyTroops)}
          onChange={v => onChange({ tempArmyTroops: parseInt(v, 10) || 1 })} /></div>
        <div className="bf-chips">
          {TROOP_QUICK.map(n => (
            <button key={n} type="button" className="bf-chip" aria-pressed={data.tempArmyTroops === n} onClick={() => onChange({ tempArmyTroops: n })}>{formatCount(n)}</button>
          ))}
        </div>
        <p className="bf-hintline">The numbers stat is worked out from the troop count.</p>
      </fieldset>

      <fieldset className="bf-field">
        <legend>Stats, 1 to 10</legend>
        {STAT_ROWS.map(({ key, label, Icon }) => (
          <div key={key} className="bf-stat-row">
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
            <Stepper label={label} size="sm" min={1} max={10} value={String(data.tempArmyStats[key])}
              onChange={v => onChange({ tempArmyStats: { ...data.tempArmyStats, [key]: Math.min(10, Math.max(1, parseInt(v, 10) || 1)) } })} />
          </div>
        ))}
      </fieldset>
    </DialogShell>
  );
};

/* ── Invite players ────────────────────────────────────────────────────────── */

export interface InvitePerson { playerId: number; name: string; detail: string }

export const InvitePlayersDialog: React.FC<{
  open: boolean;
  factions: string[];
  teamMode: 'existing' | 'new';
  teamSelection: string;
  teamName: string;
  people: InvitePerson[];
  selected: number[];
  onPickExisting: (faction: string) => void;
  onPickNew: () => void;
  onTeamName: (name: string) => void;
  onToggle: (playerId: number) => void;
  onSend: () => void;
  onCancel: () => void;
}> = ({ open, factions, teamMode, teamSelection, teamName, people, selected, onPickExisting, onPickNew, onTeamName, onToggle, onSend, onCancel }) => (
  <DialogShell
    open={open}
    onOpenChange={(o) => { if (!o) onCancel(); }}
    title="Invite players"
    description="Invited players are notified and choose which of their armies to bring."
    footer={
      <>
        <button type="button" className="bf-btn" data-variant="quiet" onClick={onCancel}>Cancel</button>
        <button type="button" className="bf-btn" data-variant="primary" disabled={selected.length === 0 || !teamName.trim()} onClick={onSend}>
          <UserPlus size={15} aria-hidden="true" /> Send {selected.length > 0 ? `${selected.length} ` : ''}invitation{selected.length === 1 ? '' : 's'}
        </button>
      </>
    }
  >
    <FactionPicker factions={factions} mode={teamMode} selection={teamSelection} name={teamName}
      onPickExisting={onPickExisting} onPickNew={onPickNew} onNameChange={onTeamName} />
    <fieldset className="bf-field">
      <legend>Who is invited</legend>
      {people.length === 0 ? (
        <p className="bf-hintline">No players in this campaign yet.</p>
      ) : (
        <ul className="bf-people">
          {people.map(p => {
            const on = selected.includes(p.playerId);
            return (
              <li key={p.playerId}>
                <button type="button" className="bf-person" aria-pressed={on} onClick={() => onToggle(p.playerId)}>
                  <span className="bf-check" aria-hidden="true">{on && <Check size={12} strokeWidth={3.5} />}</span>
                  <span><b>{p.name}</b><small>{p.detail}</small></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  </DialogShell>
);

/* ── Player: battle invitations ────────────────────────────────────────────── */

export interface InvitationView { id: number; battle_name: string; terrain_description?: string; team_name: string }
export interface ArmyOption { id: number; name: string; numbers: number; equipment: number; discipline: number; morale: number; command: number; logistics: number }

export const BattleInvitationsDialog: React.FC<{
  open: boolean;
  invitations: InvitationView[];
  armies: ArmyOption[];
  onDecline: (invitationId: number) => void;
  onAccept: (invitationId: number, armyIds: number[]) => void;
  onClose: () => void;
}> = ({ open, invitations, armies, onDecline, onAccept, onClose }) => {
  const [picks, setPicks] = useState<Record<number, number[]>>({});
  const toggle = (invitationId: number, armyId: number) =>
    setPicks(prev => {
      const current = prev[invitationId] || [];
      return { ...prev, [invitationId]: current.includes(armyId) ? current.filter(id => id !== armyId) : [...current, armyId] };
    });

  return (
    <DialogShell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Battle invitations"
      description={`You have ${invitations.length} pending ${invitations.length === 1 ? 'invitation' : 'invitations'}. Pick the armies you will bring.`}
    >
      {invitations.map(inv => {
        const chosen = picks[inv.id] || [];
        return (
          <section key={inv.id} className="bf-invite" aria-label={inv.battle_name}>
            <div>
              <h3>{inv.battle_name}</h3>
              <p className="bf-hintline" style={{ marginTop: '0.3rem' }}>{inv.terrain_description || 'No terrain description.'}</p>
              <p style={{ margin: '0.5rem 0 0' }}><span className="bf-tag" data-tone="info"><Mail size={11} aria-hidden="true" /> You fight for team {inv.team_name}</span></p>
            </div>
            {armies.length === 0 ? (
              <p className="bf-hintline">You have no armies yet. Create one in the Armies tab first.</p>
            ) : (
              <ul className="bf-people" aria-label="Your armies">
                {armies.map(a => {
                  const on = chosen.includes(a.id);
                  return (
                    <li key={a.id}>
                      <button type="button" className="bf-person" aria-pressed={on} onClick={() => toggle(inv.id, a.id)}>
                        <span className="bf-check" aria-hidden="true">{on && <Check size={12} strokeWidth={3.5} />}</span>
                        <span><b>{a.name}</b><small>Combined stats {a.numbers + a.equipment + a.discipline + a.morale + a.command + a.logistics}</small></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="bf-invite-actions">
              <button type="button" className="bf-btn" data-variant="danger" onClick={() => onDecline(inv.id)}>Decline</button>
              <button type="button" className="bf-btn" data-variant="primary" disabled={chosen.length === 0} onClick={() => onAccept(inv.id, chosen)}>
                <Check size={15} aria-hidden="true" /> Join with {chosen.length || 'your'} {chosen.length === 1 ? 'army' : 'armies'}
              </button>
            </div>
          </section>
        );
      })}
    </DialogShell>
  );
};

/* ── Battle summary ────────────────────────────────────────────────────────── */

export interface BattleSummaryView {
  battleName: string;
  results: any[];
  summary: {
    winningTeam?: string;
    winningScore?: number;
    strongestArmy?: { name?: string; score?: number };
    killsByParticipant?: Record<number, number>;
  } | null;
}

export const BattleSummaryDialog: React.FC<{ open: boolean; data: BattleSummaryView | null; onClose: () => void }> = ({ open, data, onClose }) => {
  const ranked = useMemo(
    () => [...(data?.results || [])].sort((a, b) => (b.current_score ?? 0) - (a.current_score ?? 0)),
    [data]
  );
  if (!data) return null;
  const { summary } = data;
  return (
    <DialogShell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Battle complete"
      description={data.battleName}
      wide
      footer={<button type="button" className="bf-btn" data-variant="primary" onClick={onClose}>Close</button>}
    >
      {summary && (
        <dl className="bf-verdicts">
          <div className="bf-verdict">
            <dt><Trophy size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Winning team</dt>
            <dd>{summary.winningTeam || 'Unknown'}<small>{summary.winningScore ?? 0} score</small></dd>
          </div>
          <div className="bf-verdict">
            <dt>Strongest army</dt>
            <dd>{summary.strongestArmy?.name || 'Unknown'}<small>{summary.strongestArmy?.score ?? 0} score</small></dd>
          </div>
        </dl>
      )}
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--bf-ink)', fontSize: '0.98rem', fontWeight: 800 }}>Final scores</h3>
        <ul className="bf-final">
          {ranked.map((p: any) => {
            const kills = summary?.killsByParticipant?.[p.id] || 0;
            const color = p.faction_color || '#888';
            return (
              <li key={p.id} style={{ ['--faction' as any]: color }}>
                <span className="bf-final-name"><i aria-hidden="true" /><span>{p.temp_army_name || p.army_name || `Army #${p.id}`}</span></span>
                <span>Score <b>{p.current_score ?? 0}</b></span>
                <span>Troops <b>{formatCount(p.current_troops)}</b></span>
                <span>Kills <b>{formatCount(kills)}</b></span>
              </li>
            );
          })}
        </ul>
      </div>
    </DialogShell>
  );
};

/* ── Map picker ────────────────────────────────────────────────────────────── */

export interface MapOption { id: number; display_name: string }

export const MapPickerDialog: React.FC<{
  open: boolean;
  maps: MapOption[];
  activeMapId: number | null;
  imageUrl: (id: number) => string;
  uploadName: string;
  uploadFile: File | null;
  onUploadName: (name: string) => void;
  onUploadFile: (file: File | null) => void;
  onUpload: () => void;
  onPick: (id: number) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}> = ({ open, maps, activeMapId, imageUrl, uploadName, uploadFile, onUploadName, onUploadFile, onUpload, onPick, onDelete, onClose }) => (
  <DialogShell
    open={open}
    onOpenChange={(o) => { if (!o) onClose(); }}
    title="Battlefield map"
    description="Pick the map for this battle. Everyone sees it change at once."
    wide
  >
    <div className="bf-upload">
      <span className="bf-label" style={{ color: 'var(--bf-ink)', fontWeight: 700, fontSize: '0.86rem' }}>Upload a new map</span>
      <div className="bf-upload-row">
        <input className="bf-input" type="text" value={uploadName} placeholder="Map name" aria-label="Map name" onChange={e => onUploadName(e.target.value)} />
        <input className="bf-file" type="file" accept="image/*" aria-label="Map image" onChange={e => onUploadFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="bf-btn" disabled={!uploadFile || !uploadName.trim()} onClick={onUpload}>
          <Upload size={14} aria-hidden="true" /> Upload
        </button>
      </div>
    </div>

    {maps.length === 0 ? (
      <p className="bf-hintline">No maps uploaded yet.</p>
    ) : (
      <ul className="bf-maps">
        {maps.map(m => (
          <li key={m.id} className="bf-map" data-active={activeMapId === m.id ? 'true' : undefined}>
            <button type="button" className="bf-map-pick" onClick={() => onPick(m.id)} aria-label={`Use ${m.display_name}`}>
              <img src={imageUrl(m.id)} alt="" loading="lazy" />
            </button>
            {activeMapId === m.id && <span className="bf-tag bf-map-live" data-tone="good" style={{ background: '#0f1a12' }}><Check size={11} aria-hidden="true" /> On the table</span>}
            <div className="bf-map-meta">
              <span>{m.display_name}</span>
              <button type="button" className="bf-icon-btn" data-danger="true" aria-label={`Delete ${m.display_name}`} onClick={() => onDelete(m.id)}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    )}
  </DialogShell>
);

