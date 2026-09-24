import React, { useEffect, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position,
  useNodesState, useEdgesState, Node, Edge, NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Socket } from 'socket.io-client';
import {
  familyTreeAPI, characterAPI, FamilyMemberData, FamilyRelationshipData, FamilyTree,
  D5eReferenceData, Character,
} from '../../services/api';
import { getCharacterAge, getFamilyMemberAge } from '../../utils/age';
import ConfirmationModal from '../ConfirmationModal';
import { IMAGE_WIDTH, sizedImageUrl } from '../../utils/imageUrls';

interface Props {
  campaignId: number;
  players: Array<{ id: number; username: string; email: string }>;
  characters: Character[];
  currentDay: number;
  isDM: boolean;
  socket: Socket | null;
  // The logged-in player's own character in this campaign (null for the DM, or a player with
  // none yet) — used to scope a player's view down to just their own branch of the tree.
  userCharacterId: number | null;
  // Whichever character card is currently selected in the sidebar — used to scope the DM's view
  // down to just that character's branch, the same way a player is scoped to their own.
  selectedCharacterId: number | null;
  // Called whenever a mutation here may have changed a real, played character (editing a linked
  // member's stats, or assigning a player) — refetches the campaign so the Character Sheet,
  // sidebar, and player list pick up the change immediately instead of only updating this panel.
  onCharacterDataChanged: () => void;
}

type Abilities = FamilyMemberData['abilities'];
const ABILITY_KEYS: Array<keyof Abilities> = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_LABELS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const DEFAULT_ABILITIES: Abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

const abilityModifier = (score: number): string => {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : String(mod);
};

const isThriKreen = (race?: string | null): boolean => !!race && race.toLowerCase().includes('thri-kreen');
const MAX_CHILDREN_AT_ONCE = 20;

const memberAge = (member: FamilyMemberData, currentDay: number, race: string): number =>
  member.characterId ? getCharacterAge(race, currentDay, member.ageOverride) : getFamilyMemberAge(member.baseAge, currentDay);

// ── Layout ──────────────────────────────────────────────────────────────────
const NODE_W = 240;
const COUPLE_GAP = 50;
const UNIT_GAP = 90;
// Generous enough to clear a fully-grown unlinked-member card (portrait + name + age +
// a two-row-wrapped button strip) without the next generation's cards touching it.
const ROW_H = 360;

// Propagates parent generation + 1 onto each child. Declared outside computeLayout's while loop
// (rather than inline) so the closure doesn't capture a loop-reassigned variable — ESLint's
// no-loop-func flags that pattern, and CI builds treat lint warnings as hard failures.
function propagateParentToChild(parentEdges: FamilyRelationshipData[], generation: Map<number, number>): boolean {
  let changed = false;
  parentEdges.forEach(e => {
    if (generation.has(e.memberAId)) {
      const g = generation.get(e.memberAId)! + 1;
      if (!generation.has(e.memberBId) || generation.get(e.memberBId)! < g) { generation.set(e.memberBId, g); changed = true; }
    }
  });
  return changed;
}

// Shares the higher of the two generations across a spouse pair, so a married-in spouse's
// initial "guess" (see computeLayout) gets corrected once their partner's real generation
// is known — for the same no-loop-func reason, this is its own top-level function too.
function propagateSpouseMax(spouseEdges: FamilyRelationshipData[], generation: Map<number, number>): boolean {
  let changed = false;
  spouseEdges.forEach(e => {
    const ga = generation.get(e.memberAId);
    const gb = generation.get(e.memberBId);
    if (ga !== undefined && (gb === undefined || gb < ga)) { generation.set(e.memberBId, ga); changed = true; }
    if (gb !== undefined && (ga === undefined || ga < gb)) { generation.set(e.memberAId, gb); changed = true; }
  });
  return changed;
}

function computeLayout(members: FamilyMemberData[], relationships: FamilyRelationshipData[]): Map<number, { x: number; y: number }> {
  const spouseEdges = relationships.filter(r => r.type === 'spouse');
  const parentEdges = relationships.filter(r => r.type === 'parent_child');

  const spousesOf = new Map<number, Set<number>>();
  spouseEdges.forEach(e => {
    if (!spousesOf.has(e.memberAId)) spousesOf.set(e.memberAId, new Set());
    if (!spousesOf.has(e.memberBId)) spousesOf.set(e.memberBId, new Set());
    spousesOf.get(e.memberAId)!.add(e.memberBId);
    spousesOf.get(e.memberBId)!.add(e.memberAId);
  });

  const parentsOf = new Map<number, number[]>();
  const childrenOf = new Map<number, number[]>();
  parentEdges.forEach(e => {
    if (!parentsOf.has(e.memberBId)) parentsOf.set(e.memberBId, []);
    parentsOf.get(e.memberBId)!.push(e.memberAId);
    if (!childrenOf.has(e.memberAId)) childrenOf.set(e.memberAId, []);
    childrenOf.get(e.memberAId)!.push(e.memberBId);
  });

  // Generation via fixed-point propagation (parent -> child +1, spouses share a generation).
  // Every parentless member starts as a *guess* of generation 0 — right for a true root, wrong
  // for someone who married into a later generation (e.g. a brand-new spouse of a child). Both
  // propagation rules below take the max rather than only filling in gaps, so a married-in
  // spouse's wrong initial guess gets overridden once their partner's real generation is known,
  // and that correction keeps cascading through any length of spouse-of-spouse chain.
  const generation = new Map<number, number>();
  members.forEach(m => { if (!parentsOf.has(m.id) || parentsOf.get(m.id)!.length === 0) generation.set(m.id, 0); });
  let changed = true;
  let guard = 0;
  while (changed && guard < members.length + 5) {
    guard++;
    const changedByParents = propagateParentToChild(parentEdges, generation);
    const changedBySpouses = propagateSpouseMax(spouseEdges, generation);
    changed = changedByParents || changedBySpouses;
  }
  members.forEach(m => { if (!generation.has(m.id)) generation.set(m.id, 0); });

  const byGeneration = new Map<number, FamilyMemberData[]>();
  members.forEach(m => {
    const g = generation.get(m.id)!;
    if (!byGeneration.has(g)) byGeneration.set(g, []);
    byGeneration.get(g)!.push(m);
  });

  const positions = new Map<number, { x: number; y: number }>();
  // Deepest generation first: a unit with children can only be centered over them once those
  // children already have final positions, so leaves get placed by sibling order and every
  // ancestor generation is centered over its own (already-placed) children on the way back up.
  const sortedGensDesc = [...byGeneration.keys()].sort((a, b) => b - a);

  sortedGensDesc.forEach(g => {
    const membersInGen = byGeneration.get(g)!;
    const memberIdsInGen = new Set(membersInGen.map(m => m.id));
    const seen = new Set<number>();
    const units: { ids: number[] }[] = [];

    membersInGen.forEach(m => {
      if (seen.has(m.id)) return;
      const candidates = [...(spousesOf.get(m.id) || [])].filter(sid => !seen.has(sid) && memberIdsInGen.has(sid));
      if (candidates.length > 0) {
        seen.add(m.id);
        seen.add(candidates[0]);
        units.push({ ids: [m.id, candidates[0]] });
      } else {
        seen.add(m.id);
        units.push({ ids: [m.id] });
      }
    });

    // Center each unit over the full span of its own children (already positioned, since we're
    // walking generations deepest-first) rather than trying to derive position from parents.
    const desired = units.map(u => {
      const childIds = new Set<number>();
      u.ids.forEach(id => (childrenOf.get(id) || []).forEach(c => childIds.add(c)));
      const positioned = [...childIds].filter(c => positions.has(c));
      if (positioned.length === 0) return null;
      const lefts = positioned.map(c => positions.get(c)!.x);
      const rights = positioned.map(c => positions.get(c)!.x + NODE_W);
      return (Math.min(...lefts) + Math.max(...rights)) / 2;
    });

    const order = units.map((u, i) => ({ u, desired: desired[i], i }));
    order.sort((a, b) => (a.desired ?? a.i * 1e6) - (b.desired ?? b.i * 1e6));

    let cursorRight = -Infinity;
    order.forEach(({ u, desired }) => {
      const width = u.ids.length === 2 ? NODE_W * 2 + COUPLE_GAP : NODE_W;
      let left = desired !== null ? desired - width / 2 : (cursorRight === -Infinity ? 0 : cursorRight + UNIT_GAP);
      if (cursorRight !== -Infinity && left < cursorRight + UNIT_GAP) left = cursorRight + UNIT_GAP;
      if (u.ids.length === 2) {
        positions.set(u.ids[0], { x: left, y: g * ROW_H });
        positions.set(u.ids[1], { x: left + NODE_W + COUPLE_GAP, y: g * ROW_H });
      } else {
        positions.set(u.ids[0], { x: left, y: g * ROW_H });
      }
      cursorRight = left + width;
    });
  });

  // The bottom-up pass above can nudge a parent unit sideways to avoid overlapping a sibling
  // *after* its children were already placed relative to its pre-collision position — leaving
  // children looking like they belong to whichever neighboring unit they now sit under instead
  // of their real parents. Walk back top-down and re-center each unit's descendant subtree
  // under that unit's own final position.
  const sortedGensAsc = [...byGeneration.keys()].sort((a, b) => a - b);
  sortedGensAsc.forEach(g => {
    const membersInGen = byGeneration.get(g)!;
    const memberIdsInGen = new Set(membersInGen.map(m => m.id));
    const seen = new Set<number>();

    membersInGen.forEach(m => {
      if (seen.has(m.id)) return;
      const candidates = [...(spousesOf.get(m.id) || [])].filter(sid => !seen.has(sid) && memberIdsInGen.has(sid));
      const unitIds = candidates.length > 0 ? [m.id, candidates[0]] : [m.id];
      unitIds.forEach(id => seen.add(id));

      const childIds = new Set<number>();
      unitIds.forEach(id => (childrenOf.get(id) || []).forEach(c => childIds.add(c)));
      if (childIds.size === 0) return;

      const unitCenter = (Math.min(...unitIds.map(id => positions.get(id)!.x)) + Math.max(...unitIds.map(id => positions.get(id)!.x + NODE_W))) / 2;
      const childLefts = [...childIds].map(c => positions.get(c)!.x);
      const childRights = [...childIds].map(c => positions.get(c)!.x + NODE_W);
      const childrenCenter = (Math.min(...childLefts) + Math.max(...childRights)) / 2;
      const delta = unitCenter - childrenCenter;
      if (Math.abs(delta) < 0.5) return;

      // Carry the whole descendant subtree along — each child, that child's spouse (so a
      // married-in partner moves too), and so on down — without touching ancestors or siblings.
      const toShift = new Set<number>();
      const stack = [...childIds];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (toShift.has(cur)) continue;
        toShift.add(cur);
        (spousesOf.get(cur) || new Set<number>()).forEach(s => { if (!toShift.has(s)) stack.push(s); });
        (childrenOf.get(cur) || []).forEach(c => { if (!toShift.has(c)) stack.push(c); });
      }
      toShift.forEach(id => {
        const p = positions.get(id);
        if (p) positions.set(id, { x: p.x + delta, y: p.y });
      });
    });
  });

  return positions;
}

// Per-ability coin flip between two parents' resolved stats; skills each independently 50/50 from the union.
function inheritFromParents(a: Abilities, b: Abilities, skillsA: string[], skillsB: string[]): { abilities: Abilities; skills: string[] } {
  const abilities = { ...DEFAULT_ABILITIES };
  ABILITY_KEYS.forEach(key => { abilities[key] = Math.random() < 0.5 ? a[key] : b[key]; });
  const union = Array.from(new Set([...skillsA, ...skillsB]));
  const skills = union.filter(() => Math.random() < 0.5);
  return { abilities, skills };
}

// A player should only see their own branch of the tree — their character plus whoever is
// connected to them by marriage or parentage — not every other party member's family too.
function scopeToOwnBranch(tree: FamilyTree, characterId: number): FamilyTree {
  const rootMember = tree.members.find(m => m.characterId === characterId);
  if (!rootMember) return { members: [], relationships: [] };

  const adjacency = new Map<number, number[]>();
  tree.relationships.forEach(r => {
    if (!adjacency.has(r.memberAId)) adjacency.set(r.memberAId, []);
    if (!adjacency.has(r.memberBId)) adjacency.set(r.memberBId, []);
    adjacency.get(r.memberAId)!.push(r.memberBId);
    adjacency.get(r.memberBId)!.push(r.memberAId);
  });

  const visited = new Set<number>([rootMember.id]);
  const queue = [rootMember.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) || []) {
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
    }
  }

  return {
    members: tree.members.filter(m => visited.has(m.id)),
    relationships: tree.relationships.filter(r => visited.has(r.memberAId) && visited.has(r.memberBId)),
  };
}

// ── Custom node ─────────────────────────────────────────────────────────────
interface CardData {
  member: FamilyMemberData;
  currentDay: number;
  isDM: boolean;
  playedBy: string | null;
  onAddSpouse: (m: FamilyMemberData) => void;
  onAddChild: (m: FamilyMemberData) => void;
  onEdit: (m: FamilyMemberData) => void;
  onAssign: (m: FamilyMemberData) => void;
  onToggleDead: (m: FamilyMemberData) => void;
  onRemove: (m: FamilyMemberData) => void;
  [key: string]: unknown;
}

const iconBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: '#d1d5db',
  fontSize: '0.72rem',
  padding: '3px 6px',
  cursor: 'pointer',
  lineHeight: 1.3,
  transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease',
};

function FamilyCardNode({ data }: NodeProps) {
  const { member, currentDay, isDM, playedBy, onAddSpouse, onAddChild, onEdit, onAssign, onToggleDead, onRemove } = data as unknown as CardData;
  const age = memberAge(member, currentDay, member.race);
  const dead = member.isDead;

  return (
    <div
      style={{
        width: NODE_W,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'linear-gradient(160deg, rgba(28,24,20,0.97), rgba(16,14,18,0.97))',
        border: `1px solid ${dead ? 'rgba(255,255,255,0.14)' : 'rgba(var(--theme-accent-rgb),0.35)'}`,
        boxShadow: dead ? '0 10px 24px rgba(0,0,0,0.45)' : '0 10px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(var(--theme-accent-rgb),0.06)',
        filter: dead ? 'grayscale(0.85)' : 'none',
        opacity: dead ? 0.82 : 1,
        // React Flow sets `pointer-events: none` on non-draggable/non-selectable node wrappers,
        // which would otherwise cascade down and swallow clicks on the buttons below.
        pointerEvents: 'auto',
      }}
    >
      <Handle type="target" id="top" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="target" id="left" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" id="right" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />

      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#000' }}>
        {member.imageUrl ? (
          <img src={sizedImageUrl(member.imageUrl, IMAGE_WIDTH.card)} alt={member.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.4rem', color: 'rgba(255,255,255,0.25)' }}>
            👤
          </div>
        )}
        {dead && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: '2px 7px', fontSize: '0.68rem', color: '#e5e7eb', fontWeight: 600 }}>
            💀 Deceased
          </div>
        )}
        {playedBy && (
          <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 7px', fontSize: '0.65rem', color: 'var(--text-gold)', fontWeight: 600 }}>
            🎮 {playedBy}
          </div>
        )}
      </div>

      {/* Fixed height (not just min-height) regardless of race-name length or button count —
          every card must be exactly as tall as every other so the spouse/parent-child connector
          handles (centered/anchored on each node's own height) line up across the whole tree. */}
      <div style={{ padding: '10px 12px 12px', boxSizing: 'border-box', height: isDM ? 122 : 54, overflow: 'hidden' }}>
        <div style={{ color: '#f5f0e8', fontWeight: 700, fontSize: '0.92rem', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.name}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.74rem', marginBottom: isDM ? '0.55rem' : 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.race} · Age {age}
        </div>

        {isDM && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
            <button style={iconBtnStyle} title="Add spouse" onClick={() => onAddSpouse(member)}>💍 Spouse</button>
            <button style={iconBtnStyle} title="Add child" onClick={() => onAddChild(member)}>👶 Child</button>
            <button style={iconBtnStyle} title="Edit stats" onClick={() => onEdit(member)}>✏️ Edit</button>
            <button style={iconBtnStyle} title={dead ? 'Restore to living' : 'Declare deceased'} onClick={() => onToggleDead(member)}>
              {dead ? '❤️ Revive' : '💀 Deceased'}
            </button>
            {!member.characterId && !dead && (
              <button style={{ ...iconBtnStyle, borderColor: 'rgba(251,191,36,0.4)', color: 'var(--text-gold)' }} title="Assign to a player" onClick={() => onAssign(member)}>
                🎮 Assign
              </button>
            )}
            {!member.characterId && (
              <button style={{ ...iconBtnStyle, color: '#f87171' }} title="Remove from tree" onClick={() => onRemove(member)}>🗑️</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { familyCard: FamilyCardNode };

// ── Shared form field styles (mirrors the rest of the app's inline-styled modals) ──
const fieldLabel: React.CSSProperties = { display: 'block', color: 'var(--text-gold)', fontSize: '0.78rem', fontWeight: 600, marginBottom: 4 };
const fieldInput: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(var(--theme-accent-rgb),0.25)', borderRadius: 6, color: '#f1f1f1', padding: '0.5rem 0.65rem', fontSize: '0.88rem', boxSizing: 'border-box' };
const modalShell: React.CSSProperties = { background: 'linear-gradient(135deg, rgba(26,26,26,0.98), rgba(17,17,17,0.98))', borderRadius: 16, padding: '1.75rem', width: '92%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', border: '2px solid rgba(var(--theme-accent-rgb),0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' };

function primaryBtn(disabled?: boolean): React.CSSProperties {
  return {
    padding: '0.6rem 1.4rem', borderRadius: 8, fontWeight: 700, fontSize: '0.88rem', cursor: disabled ? 'default' : 'pointer',
    border: `2px solid ${disabled ? 'rgba(255,255,255,0.12)' : 'var(--primary-gold)'}`,
    background: disabled ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.32), rgba(var(--theme-accent-rgb),0.18))',
    color: disabled ? '#5b5b5b' : 'var(--primary-gold)',
    transition: 'transform 150ms ease',
  };
}
const secondaryBtn: React.CSSProperties = { padding: '0.6rem 1.2rem', borderRadius: 8, fontSize: '0.88rem', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: '#9ca3af' };
const dangerBtn: React.CSSProperties = { padding: '0.6rem 1.4rem', borderRadius: 8, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', background: 'rgba(239,68,68,0.18)', border: '2px solid #ef4444', color: '#fca5a5' };

// ── Add/Edit member modal (spouse, child, or edit-in-place) ────────────────
type MemberModalMode =
  | { kind: 'spouse'; of: FamilyMemberData }
  | { kind: 'child'; of: FamilyMemberData; coParent: FamilyMemberData | null }
  | { kind: 'edit'; member: FamilyMemberData };

function MemberFormModal({
  mode, reference, currentDay, onClose, onSubmit,
}: {
  mode: MemberModalMode;
  reference: D5eReferenceData | null;
  currentDay: number;
  onClose: () => void;
  onSubmit: (fields: { name: string; race: string; age: number; abilities: Abilities; skills: string[]; imageFile: File | null; isDead?: boolean; includeCoParent: boolean; extraNames: string[]; rerollPerChild: boolean }) => Promise<void>;
}) {
  const editing = mode.kind === 'edit' ? mode.member : null;
  const [name, setName] = useState(editing?.name || '');
  // Some races (Thri-kreen) have large broods, so let the DM add several children in one go.
  const canAddMultiple = mode.kind === 'child' && [mode.of, mode.coParent].some(p => isThriKreen(p?.race));
  const [addMultiple, setAddMultiple] = useState(false);
  // Kept as raw text while typing (so "10" doesn't get clamped to 2 on the way through "1"),
  // then clamped for use via `childCount` below.
  const [childCountInput, setChildCountInput] = useState('2');
  const [race, setRace] = useState(editing?.race || 'Human');
  const [age, setAge] = useState<number>(
    editing ? memberAge(editing, currentDay, editing.race) : (mode.kind === 'spouse' ? memberAge(mode.of, currentDay, mode.of.race) : 0)
  );
  const [abilities, setAbilities] = useState<Abilities>(editing?.abilities || { ...DEFAULT_ABILITIES });
  const [skills, setSkills] = useState<string[]>(editing?.skills || []);
  const [isDead, setIsDead] = useState<boolean>(editing?.isDead || false);
  const [includeCoParent, setIncludeCoParent] = useState<boolean>(mode.kind === 'child' && !!mode.coParent);
  const [randomized, setRandomized] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(sizedImageUrl(editing?.imageUrl, IMAGE_WIDTH.small) || null);
  const [submitting, setSubmitting] = useState(false);

  const title = mode.kind === 'spouse' ? `💍 Marry into ${mode.of.name}'s family`
    : mode.kind === 'child' ? `👶 Add a child of ${mode.of.name}`
    : `✏️ Edit ${editing!.name}`;

  const canRandomize = mode.kind === 'child' && mode.coParent && includeCoParent;
  // A linked member's age is derived from their race + the campaign day, same as any played
  // character — it can't be set directly, so only show the field for unlinked family members.
  const showAgeField = !editing || !editing.characterId;

  const rollRandom = useCallback(() => {
    if (mode.kind !== 'child' || !mode.coParent) return;
    const result = inheritFromParents(mode.of.abilities, mode.coParent.abilities, mode.of.skills, mode.coParent.skills);
    setAbilities(result.abilities);
    setSkills(result.skills);
    setRandomized(true);
  }, [mode]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const childCount = Math.max(2, Math.min(MAX_CHILDREN_AT_ONCE, parseInt(childCountInput, 10) || 2));
  const multiActive = mode.kind === 'child' && canAddMultiple && addMultiple;
  // With several children the Name field is a base name — "Klik" becomes Klik 1, Klik 2, … (rename later with Edit).
  const childNames = multiActive
    ? Array.from({ length: childCount }, (_, i) => `${name.trim()} ${i + 1}`)
    : [name.trim()];
  const namesComplete = !!name.trim();
  const totalChildren = childNames.length;

  const handleSubmit = async () => {
    if (!namesComplete || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: childNames[0], race, age, abilities, skills, imageFile, isDead: editing ? isDead : undefined, includeCoParent,
        extraNames: childNames.slice(1),
        rerollPerChild: randomized && !!canRandomize,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalShell}>
        <h3 style={{ color: 'var(--primary-gold)', margin: '0 0 1.25rem', fontSize: '1.2rem' }}>{title}</h3>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.1rem' }}>
          <div
            onClick={() => document.getElementById('family-member-image-input')?.click()}
            style={{ width: 84, height: 84, borderRadius: 10, border: '2px dashed rgba(var(--theme-accent-rgb),0.5)', cursor: 'pointer', overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            {imagePreview ? <img src={imagePreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '1.8rem', opacity: 0.4 }}>👤</span>}
          </div>
          <input id="family-member-image-input" type="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" style={{ display: 'none' }} onChange={handleImageSelect} />
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: showAgeField ? '2fr 1fr' : '1fr', gap: '0.6rem', alignContent: 'start' }}>
            <div>
              <label style={fieldLabel}>{multiActive ? 'Base name *' : 'Name *'}</label>
              <input style={fieldInput} value={name} onChange={e => setName(e.target.value)} placeholder={multiActive ? 'e.g. Klik' : 'Full name'} />
            </div>
            {showAgeField && (
              <div>
                <label style={fieldLabel}>Age</label>
                <input type="number" style={fieldInput} value={age} onChange={e => setAge(parseInt(e.target.value) || 0)} />
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fieldLabel}>Race</label>
              <select style={fieldInput} value={race} onChange={e => setRace(e.target.value)}>
                {(reference?.races || [{ name: race }]).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {canAddMultiple && (
          <div style={{ marginBottom: '1rem', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#e5e7eb', cursor: 'pointer' }}>
              <input
                type="checkbox" checked={addMultiple}
                onChange={e => setAddMultiple(e.target.checked)}
              />
              Add multiple children at once
            </label>
            {addMultiple && (
              <div style={{ marginTop: '0.7rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
                  <label style={{ ...fieldLabel, margin: 0 }}>Number of children</label>
                  <input
                    type="number" min={2} max={MAX_CHILDREN_AT_ONCE} value={childCountInput}
                    onChange={e => setChildCountInput(e.target.value)}
                    onBlur={() => setChildCountInput(String(childCount))}
                    style={{ ...fieldInput, width: 70, padding: '0.35rem 0.5rem' }}
                  />
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                  {name.trim()
                    ? <>Will be named: <strong style={{ color: 'var(--text-gold)' }}>{childNames.length > 4 ? `${childNames.slice(0, 3).join(', ')} … ${childNames[childNames.length - 1]}` : childNames.join(', ')}</strong></>
                    : 'Enter a base name above — children are numbered automatically (e.g. Klik 1, Klik 2, …).'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', marginTop: '0.5rem' }}>
                  Race, age, portrait, stats and skills apply to every child{canRandomize ? ' — except with “Inherit from parents”, where each child gets their own stat roll' : ''}.
                </div>
              </div>
            )}
          </div>
        )}

        {mode.kind === 'child' && mode.coParent && (
          <div style={{ marginBottom: '1rem', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#e5e7eb', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeCoParent} onChange={e => { setIncludeCoParent(e.target.checked); setRandomized(false); }} />
              Co-parent: <strong style={{ color: 'var(--text-gold)' }}>{mode.coParent.name}</strong>
            </label>
            {canRandomize && (
              <button type="button" onClick={rollRandom} style={{ ...iconBtnStyle, marginTop: '0.5rem', padding: '0.4rem 0.7rem', fontSize: '0.78rem' }}>
                🎲 {randomized ? 'Reroll' : 'Inherit from parents'}
              </button>
            )}
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label style={fieldLabel}>Ability Scores</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
            {ABILITY_KEYS.map((key, i) => (
              <div key={key} style={{ textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.65rem', fontWeight: 700, marginBottom: '0.2rem' }}>{ABILITY_LABELS[i]}</div>
                <input
                  type="number" min={1} max={30} value={abilities[key]}
                  onChange={e => { setAbilities(prev => ({ ...prev, [key]: Math.max(1, Math.min(30, parseInt(e.target.value) || 10)) })); setRandomized(false); }}
                  style={{ ...fieldInput, textAlign: 'center', padding: '0.4rem 0.2rem' }}
                />
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.15rem' }}>{abilityModifier(abilities[key])}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: editing ? '1rem' : '1.5rem' }}>
          <label style={fieldLabel}>Skill Proficiencies</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.35rem', maxHeight: 160, overflowY: 'auto', padding: '0.5rem', background: 'rgba(0,0,0,0.25)', borderRadius: 8 }}>
            {(reference?.skills || []).map(skill => (
              <label key={skill} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#d1d5db', cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={skills.includes(skill)}
                  onChange={e => { setSkills(prev => e.target.checked ? [...prev, skill] : prev.filter(s => s !== skill)); setRandomized(false); }}
                />
                {skill}
              </label>
            ))}
          </div>
        </div>

        {editing && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#e5e7eb', cursor: 'pointer' }}>
              <input type="checkbox" checked={isDead} onChange={e => setIsDead(e.target.checked)} />
              Deceased
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button style={secondaryBtn} onClick={onClose}>Cancel</button>
          <button style={primaryBtn(!namesComplete || submitting)} disabled={!namesComplete || submitting} onClick={handleSubmit}>
            {submitting ? 'Saving…' : editing ? 'Save Changes' : totalChildren > 1 ? `Add ${totalChildren} Children` : 'Add to Family Tree'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Assign player modal (two-step, destructive) ─────────────────────────────
function AssignPlayerModal({
  member, players, characters, reference, onClose, onConfirm,
}: {
  member: FamilyMemberData;
  players: Array<{ id: number; username: string; email: string }>;
  characters: Character[];
  reference: D5eReferenceData | null;
  onClose: () => void;
  onConfirm: (payload: { targetPlayerId: number; className: string; background: string; hitPoints: number; armorClass: number }) => Promise<void>;
}) {
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [targetPlayerId, setTargetPlayerId] = useState<number | ''>('');
  const [className, setClassName] = useState(reference?.classes[0]?.name || 'Fighter');
  const [background, setBackground] = useState(reference?.backgrounds[0] || 'Adventurer');
  const [hitPoints, setHitPoints] = useState(10);
  const [armorClass, setArmorClass] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  const targetCharacter = characters.find(c => c.player_id === targetPlayerId);
  const canProceed = targetPlayerId !== '' && className.trim();

  const handleConfirm = async () => {
    if (targetPlayerId === '' || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({ targetPlayerId: Number(targetPlayerId), className, background, hitPoints, armorClass });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalShell}>
        {step === 'form' ? (
          <>
            <h3 style={{ color: 'var(--primary-gold)', margin: '0 0 0.4rem', fontSize: '1.2rem' }}>🎮 Assign {member.name} to a player</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: '0 0 1.25rem' }}>This hands {member.name} over as that player's new character. Set the class-specific details below first.</p>

            <div style={{ marginBottom: '0.9rem' }}>
              <label style={fieldLabel}>Player *</label>
              <select style={fieldInput} value={targetPlayerId} onChange={e => setTargetPlayerId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Select a player…</option>
                {players.map(p => {
                  const current = characters.find(c => c.player_id === p.id);
                  return <option key={p.id} value={p.id}>{p.username}{current ? ` — currently playing ${current.name}` : ''}</option>;
                })}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.9rem' }}>
              <div>
                <label style={fieldLabel}>Class *</label>
                <select style={fieldInput} value={className} onChange={e => setClassName(e.target.value)}>
                  {(reference?.classes || [{ name: className }]).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Background</label>
                <select style={fieldInput} value={background} onChange={e => setBackground(e.target.value)}>
                  {(reference?.backgrounds || [background]).map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Starting HP *</label>
                <input type="number" min={1} style={fieldInput} value={hitPoints} onChange={e => setHitPoints(parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <label style={fieldLabel}>Armor Class *</label>
                <input type="number" min={1} style={fieldInput} value={armorClass} onChange={e => setArmorClass(parseInt(e.target.value) || 1)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button style={secondaryBtn} onClick={onClose}>Cancel</button>
              <button style={primaryBtn(!canProceed)} disabled={!canProceed} onClick={() => setStep('confirm')}>Continue →</button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ color: '#fca5a5', margin: '0 0 1rem', fontSize: '1.2rem' }}>⚠️ This cannot be undone</h3>
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '1rem 1.1rem', marginBottom: '1.25rem' }}>
              <p style={{ color: '#fecaca', fontSize: '0.88rem', margin: '0 0 0.6rem' }}>
                <strong>{targetCharacter?.name || 'This character'}</strong> will be permanently replaced by <strong>{member.name}</strong>. Specifically, this will:
              </p>
              <ul style={{ color: '#fecaca', fontSize: '0.82rem', margin: 0, paddingLeft: '1.2rem', lineHeight: 1.7 }}>
                <li>Reset the character to Level 1 with 0 experience</li>
                <li>Erase all inventory, equipped items, and known spells</li>
                <li>Erase all feats, subclass choices, and skill picks</li>
                <li>Remove all pets, beast companions, and shadows</li>
                <li>Unassign any mount</li>
                <li>Replace the name, portrait, race, stats, and skills with {member.name}'s</li>
              </ul>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button style={secondaryBtn} onClick={() => setStep('form')}>← Back</button>
              <button style={dangerBtn} disabled={submitting} onClick={handleConfirm}>
                {submitting ? 'Replacing…' : `Yes, replace with ${member.name}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Main panel ────────────────────────────────────────────────────────────
export default function FamilyTreePanel({ campaignId, players, characters, currentDay, isDM, socket, userCharacterId, selectedCharacterId, onCharacterDataChanged }: Props) {
  const [tree, setTree] = useState<FamilyTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<D5eReferenceData | null>(null);

  const [memberModal, setMemberModal] = useState<MemberModalMode | null>(null);
  const [assignModal, setAssignModal] = useState<FamilyMemberData | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; danger: boolean; onYes: () => void } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await familyTreeAPI.getTree(campaignId);
      setTree(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load family tree:', err);
      setError('Failed to load the family tree.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    characterAPI.getReferenceData().then(setReference).catch(err => console.error('Failed to load reference data:', err));
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (updated: FamilyTree) => setTree(updated);
    socket.on('familyTreeUpdated', handler);
    return () => { socket.off('familyTreeUpdated', handler); };
  }, [socket]);

  const playedByFor = useCallback((member: FamilyMemberData): string | null => {
    if (!member.characterId) return null;
    const character = characters.find(c => c.id === member.characterId);
    return character?.player_name || null;
  }, [characters]);

  const openAddSpouse = useCallback((m: FamilyMemberData) => setMemberModal({ kind: 'spouse', of: m }), []);
  const openAddChild = useCallback((m: FamilyMemberData) => {
    const spouseId = tree?.relationships.find(r => r.type === 'spouse' && (r.memberAId === m.id || r.memberBId === m.id));
    const coParent = spouseId ? (tree?.members.find(x => x.id === (spouseId.memberAId === m.id ? spouseId.memberBId : spouseId.memberAId)) || null) : null;
    setMemberModal({ kind: 'child', of: m, coParent });
  }, [tree]);
  const openEdit = useCallback((m: FamilyMemberData) => setMemberModal({ kind: 'edit', member: m }), []);

  const onToggleDead = useCallback((m: FamilyMemberData) => {
    setConfirmAction({
      title: m.isDead ? 'Restore to the living?' : 'Declare deceased?',
      message: m.isDead ? `${m.name} will be marked alive again.` : `${m.name} will be marked as deceased in the family tree.`,
      danger: !m.isDead,
      onYes: async () => {
        const formData = new FormData();
        formData.append('isDead', String(!m.isDead));
        const updated = await familyTreeAPI.updateMember(m.id, formData);
        setTree(updated);
      },
    });
  }, []);

  const onRemove = useCallback((m: FamilyMemberData) => {
    setConfirmAction({
      title: 'Remove from family tree?',
      message: `${m.name} and their recorded relationships will be permanently removed.`,
      danger: true,
      onYes: async () => {
        const updated = await familyTreeAPI.deleteMember(m.id);
        setTree(updated);
      },
    });
  }, []);

  // Everyone — DM included — only sees the branch of whichever character is currently selected
  // in the sidebar, not the whole campaign's combined families.
  const scopeCharacterId = isDM ? selectedCharacterId : userCharacterId;
  const visibleTree = useMemo(() => {
    if (!tree) return tree;
    if (scopeCharacterId == null) return { members: [], relationships: [] };
    return scopeToOwnBranch(tree, scopeCharacterId);
  }, [tree, scopeCharacterId]);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!visibleTree) return { flowNodes: [] as Node[], flowEdges: [] as Edge[] };
    const tree = visibleTree;
    const positions = computeLayout(tree.members, tree.relationships);

    const flowNodes: Node[] = tree.members.map(m => ({
      id: String(m.id),
      type: 'familyCard',
      position: positions.get(m.id) || { x: 0, y: 0 },
      data: {
        member: m, currentDay, isDM, playedBy: playedByFor(m),
        onAddSpouse: openAddSpouse, onAddChild: openAddChild, onEdit: openEdit,
        onAssign: setAssignModal, onToggleDead, onRemove,
      } as CardData,
      draggable: false,
    }));

    const flowEdges: Edge[] = tree.relationships.map(r => {
      if (r.type === 'spouse') {
        const posA = positions.get(r.memberAId);
        const posB = positions.get(r.memberBId);
        const aIsLeft = (posA?.x ?? 0) <= (posB?.x ?? 0);
        const leftId = aIsLeft ? r.memberAId : r.memberBId;
        const rightId = aIsLeft ? r.memberBId : r.memberAId;
        return {
          id: `spouse-${r.id}`, source: String(leftId), sourceHandle: 'right', target: String(rightId), targetHandle: 'left',
          type: 'straight', style: { stroke: 'rgba(251,191,36,0.55)', strokeWidth: 3 },
        };
      }
      return {
        id: `parent-${r.id}`, source: String(r.memberAId), sourceHandle: 'bottom', target: String(r.memberBId), targetHandle: 'top',
        type: 'smoothstep', style: { stroke: 'rgba(255,255,255,0.28)', strokeWidth: 2 },
      };
    });

    return { flowNodes, flowEdges };
  }, [visibleTree, currentDay, isDM, playedByFor, openAddSpouse, openAddChild, openEdit, onToggleDead, onRemove]);

  useEffect(() => { setNodes(flowNodes); }, [flowNodes, setNodes]);
  useEffect(() => { setEdges(flowEdges); }, [flowEdges, setEdges]);

  const handleAddSpouse = async (of: FamilyMemberData, fields: { name: string; race: string; age: number; abilities: Abilities; skills: string[]; imageFile: File | null }) => {
    const formData = new FormData();
    formData.append('name', fields.name);
    formData.append('race', fields.race);
    formData.append('baseAge', String(fields.age - Math.floor((currentDay - 1) / 365)));
    formData.append('abilities', JSON.stringify(fields.abilities));
    formData.append('skills', JSON.stringify(fields.skills));
    if (fields.imageFile) formData.append('image', fields.imageFile);
    const updated = await familyTreeAPI.addSpouse(of.id, formData);
    setTree(updated);
  };

  const handleAddChild = async (of: FamilyMemberData, coParent: FamilyMemberData | null, fields: { name: string; race: string; age: number; abilities: Abilities; skills: string[]; imageFile: File | null; includeCoParent: boolean; extraNames: string[]; rerollPerChild: boolean }) => {
    const childNames = [fields.name, ...fields.extraNames];
    // Sequential on purpose: each call creates one member, and the DM sees the tree grow child by child.
    for (let i = 0; i < childNames.length; i++) {
      // The first child keeps whatever was on the form (which may already be a roll); the rest each
      // get a fresh roll when the DM chose "Inherit from parents", so siblings don't come out identical.
      const rolled = i > 0 && fields.rerollPerChild && coParent
        ? inheritFromParents(of.abilities, coParent.abilities, of.skills, coParent.skills)
        : { abilities: fields.abilities, skills: fields.skills };
      const formData = new FormData();
      formData.append('name', childNames[i]);
      formData.append('race', fields.race);
      formData.append('baseAge', String(fields.age - Math.floor((currentDay - 1) / 365)));
      formData.append('abilities', JSON.stringify(rolled.abilities));
      formData.append('skills', JSON.stringify(rolled.skills));
      if (coParent && fields.includeCoParent) formData.append('secondParentMemberId', String(coParent.id));
      if (fields.imageFile) formData.append('image', fields.imageFile);
      setTree(await familyTreeAPI.addChild(of.id, formData));
    }
  };

  const handleEdit = async (member: FamilyMemberData, fields: { name: string; race: string; age: number; abilities: Abilities; skills: string[]; imageFile: File | null; isDead?: boolean }) => {
    const formData = new FormData();
    formData.append('name', fields.name);
    formData.append('race', fields.race);
    formData.append('abilities', JSON.stringify(fields.abilities));
    formData.append('skills', JSON.stringify(fields.skills));
    if (!member.characterId) formData.append('baseAge', String(fields.age - Math.floor((currentDay - 1) / 365)));
    if (fields.isDead !== undefined) formData.append('isDead', String(fields.isDead));
    if (fields.imageFile) formData.append('image', fields.imageFile);
    const updated = await familyTreeAPI.updateMember(member.id, formData);
    setTree(updated);
    if (member.characterId) onCharacterDataChanged();
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h5 style={{ color: 'var(--text-gold)', margin: 0 }}>🌳 Family Tree</h5>
        {!isDM && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>Read-only — only the Dungeon Master can edit</span>}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255,255,255,0.5)' }}>Loading family tree…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#fca5a5' }}>{error}</div>
      ) : !visibleTree || visibleTree.members.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255,255,255,0.6)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🌳</div>
          <p>
            {isDM
              ? 'Select a character in the sidebar to view their family tree.'
              : 'Your branch of the family tree is empty. Once the Dungeon Master adds a spouse or child connected to your character, it will show up here.'}
          </p>
        </div>
      ) : (
        <div style={{ height: 'min(72vh, 780px)', minHeight: 420, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'radial-gradient(ellipse at top, rgba(40,32,26,0.6), rgba(10,9,11,0.9))' }}>
          <style>{`
            .family-tree-flow .react-flow__controls { box-shadow: 0 8px 24px rgba(0,0,0,0.5); border-radius: 8px; overflow: hidden; }
            .family-tree-flow .react-flow__controls-button { background: rgba(24,22,26,0.94); border-bottom: 1px solid rgba(255,255,255,0.08); }
            .family-tree-flow .react-flow__controls-button:hover { background: rgba(46,40,50,0.96); }
            .family-tree-flow .react-flow__controls-button svg { fill: #d1d5db; }
            .family-tree-flow .react-flow__attribution { display: none; }
          `}</style>
          <ReactFlowProvider>
            <ReactFlow
              className="family-tree-flow"
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.25}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="rgba(255,255,255,0.08)" gap={28} size={1.5} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      )}

      {memberModal?.kind === 'spouse' && (
        <MemberFormModal
          mode={memberModal}
          reference={reference}
          currentDay={currentDay}
          onClose={() => setMemberModal(null)}
          onSubmit={fields => handleAddSpouse(memberModal.of, fields)}
        />
      )}
      {memberModal?.kind === 'child' && (
        <MemberFormModal
          mode={memberModal}
          reference={reference}
          currentDay={currentDay}
          onClose={() => setMemberModal(null)}
          onSubmit={fields => handleAddChild(memberModal.of, memberModal.coParent, fields)}
        />
      )}
      {memberModal?.kind === 'edit' && (
        <MemberFormModal
          mode={memberModal}
          reference={reference}
          currentDay={currentDay}
          onClose={() => setMemberModal(null)}
          onSubmit={fields => handleEdit(memberModal.member, fields)}
        />
      )}

      {assignModal && (
        <AssignPlayerModal
          member={assignModal}
          players={players}
          characters={characters}
          reference={reference}
          onClose={() => setAssignModal(null)}
          onConfirm={async payload => {
            const updated = await familyTreeAPI.assignPlayer(assignModal.id, payload);
            setTree(updated);
            onCharacterDataChanged();
          }}
        />
      )}

      {confirmAction && (
        <ConfirmationModal
          isOpen
          onClose={() => setConfirmAction(null)}
          onConfirm={confirmAction.onYes}
          title={confirmAction.title}
          message={confirmAction.message}
          confirmText="Yes"
          isDangerous={confirmAction.danger}
        />
      )}
    </div>
  );
}
