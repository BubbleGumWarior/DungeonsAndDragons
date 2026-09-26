import React, { CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, useReactFlow, useStore,
  Node, Edge, NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../../styles/constructionPanel.css';
import '../../styles/troopTree.css';
import { kingdomAPI, KingdomCustomUnit, UnitTree, UnitTreeNode } from '../../services/api';
import CustomUnitEditor from './CustomUnitEditor';
import { EmptyNote, Icon, toCount } from './kingdomUi';
import {
  descendantsOf, effectiveTrainingDays, indexTree, layoutTree, NODE_H, NODE_W, pathToRoot,
  ROOT_ID, TreeIndex, TroopFilter, visibleIds,
} from './troopTree';

interface TroopProgressionModalProps {
  tree: UnitTree | undefined;
  // Troops the open fief holds in reserve, by unit type.
  reserves: Record<string, number>;
  // Legendary training-speed bonus (percent) the open fief has.
  speedPct: number;
  isDungeonMaster: boolean;
  kingdomId: number | null;
  kingdomName: string;
  // Refetch the open fief after a custom troop or building changes.
  onChanged: () => void | Promise<void>;
  onClose: () => void;
}

/* ── Node card ────────────────────────────────────────────────────────────── */

interface TroopNodeData {
  node: UnitTreeNode;
  held: number;
  days: number;
  selected: boolean;
  onPath: boolean;
}

const HIDDEN_HANDLE: CSSProperties = { opacity: 0, width: 1, height: 1, border: 0, minWidth: 0, minHeight: 0 };

const TroopNode: React.FC<NodeProps> = ({ data }) => {
  const { node, held, days, selected, onPath } = data as unknown as TroopNodeData;
  const missing = node.required_buildings.filter((b) => !b.completed);
  return (
    <div
      className="kt-tt-node"
      style={{ width: NODE_W, height: NODE_H }}
      data-state={node.unlocked ? 'open' : 'locked'}
      data-custom={node.is_custom ? 'true' : undefined}
      data-root={node.is_root ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-onpath={onPath ? 'true' : undefined}
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} isConnectable={false} />
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} isConnectable={false} />
      <div className="kt-tt-node-top">
        <span className="kt-tt-node-name">{node.unit_type}</span>
        {held > 0 && <span className="kt-tt-node-held" title={`${held} in reserve here`}>×{held}</span>}
      </div>
      <div className="kt-tt-node-meta">
        {node.is_custom ? <span className="kt-tt-tag">Unique</span> : <span className="kt-tt-node-line">{node.is_root ? 'Root' : node.line_key}</span>}
        <span className="kt-tt-node-days"><Icon name="clock" size={11} />{days}d</span>
      </div>
      <div className="kt-tt-node-req" data-ok={node.unlocked ? 'true' : 'false'}>
        <Icon name={node.unlocked ? 'check' : 'lock'} size={12} />
        <span>
          {node.is_root
            ? (node.unlocked ? 'Recruited from civilians' : `Needs ${missing.map((b) => b.building_name).join(' + ')}`)
            : node.unlocked
              ? (node.required_buildings.length === 0 ? 'No building needed' : 'Ready to train')
              : `Needs ${missing.map((b) => b.building_name).join(' + ') || 'a building'}`}
        </span>
      </div>
    </div>
  );
};

const nodeTypes = { troop: TroopNode };

/* ── Canvas ───────────────────────────────────────────────────────────────── */

interface CanvasProps {
  index: TreeIndex;
  keep: Set<string>;
  reserves: Record<string, number>;
  speedPct: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const TroopCanvas: React.FC<CanvasProps> = ({ index, keep, reserves, speedPct, selectedId, onSelect }) => {
  const { fitView } = useReactFlow();
  const placed = useMemo(() => layoutTree(index, keep), [index, keep]);
  const path = useMemo(() => new Set(selectedId ? pathToRoot(index, selectedId) : []), [index, selectedId]);

  const nodes: Node[] = useMemo(() => placed.map((p) => {
    const node = index.byId.get(p.id)!;
    return {
      id: p.id,
      type: 'troop',
      position: { x: p.x, y: p.y },
      data: {
        node,
        held: toCount(reserves[node.unit_type]),
        days: effectiveTrainingDays(node.base_days, speedPct),
        selected: p.id === selectedId,
        onPath: path.has(p.id),
      } as unknown as Record<string, unknown>,
      draggable: false,
      connectable: false,
    };
  }), [placed, index, reserves, speedPct, selectedId, path]);

  const edges: Edge[] = useMemo(() => {
    const shown = new Set(placed.map((p) => p.id));
    const out: Edge[] = [];
    for (const [from, kids] of index.children.entries()) {
      if (!shown.has(from)) continue;
      for (const to of kids) {
        if (!shown.has(to)) continue;
        const custom = Boolean(index.byId.get(to)?.is_custom);
        const active = path.has(from) && path.has(to);
        out.push({
          id: `${from}->${to}`,
          source: from,
          target: to,
          type: 'default',
          style: {
            stroke: active ? 'rgba(var(--theme-accent-rgb),0.95)' : custom ? 'rgba(244,114,182,0.55)' : 'rgba(255,255,255,0.2)',
            strokeWidth: active ? 2.6 : 1.6,
            strokeDasharray: custom ? '6 5' : undefined,
          },
        });
      }
    }
    return out;
  }, [placed, index, path]);

  // Re-frame whenever the visible troops or the canvas size change. When fitting the whole tree would
  // shrink the cards past readability, follow the selection instead: frame its path back to Militia
  // plus its first few upgrades, so clicking through the tree keeps the relevant branch on screen.
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const shownKey = useMemo(() => placed.map((p) => p.id).join('|'), [placed]);
  const largeTree = useMemo(() => {
    if (width <= 0 || height <= 0 || placed.length === 0) return false;
    const spanX = Math.max(...placed.map((p) => p.x)) + NODE_W;
    const spanY = Math.max(...placed.map((p) => p.y)) + NODE_H;
    return Math.min(width / (spanX * 1.2), height / (spanY * 1.2)) < 0.6;
  }, [placed, width, height]);
  const followId = largeTree ? selectedId : null;
  useEffect(() => {
    if (width <= 0 || height <= 0 || placed.length === 0) return;
    let focus = placed.map((p) => p.id);
    if (largeTree) {
      const shown = new Set(focus);
      const anchor = followId && shown.has(followId) ? followId : ROOT_ID;
      const kids = (index.children.get(anchor) || []).filter((c) => shown.has(c)).slice(0, 8);
      focus = [...pathToRoot(index, anchor), ...kids].filter((id) => shown.has(id));
    }
    const id = requestAnimationFrame(() => fitView({ nodes: focus.map((nid) => ({ id: nid })), padding: 0.2, maxZoom: 1, duration: 260 }));
    return () => cancelAnimationFrame(id);
    // shownKey stands in for placed: same troops on screen, so no need to re-frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, width, height, largeTree, followId, index, fitView]);

  return (
    <ReactFlow
      className="kt-tt-flow"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      onNodeClick={(_, node) => onSelect(node.id)}
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
      minZoom={0.15}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="rgba(255,255,255,0.07)" gap={28} size={1.5} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
};

/* ── Modal ────────────────────────────────────────────────────────────────── */

const toCustomUnit = (node: UnitTreeNode): KingdomCustomUnit => ({
  id: Number(node.custom_id),
  name: node.unit_type,
  description: node.description || '',
  parent_unit_type: node.parent_unit_type || ROOT_ID,
  base_days: node.base_days,
  requires_building: Boolean(node.requires_building),
  custom_building_id: node.custom_building_id ?? null,
  building_name: node.required_buildings[0]?.building_name || null,
});

const TroopProgressionModal: React.FC<TroopProgressionModalProps> = ({
  tree, reserves, speedPct, isDungeonMaster, kingdomId, kingdomName, onChanged, onClose,
}) => {
  const index = useMemo(() => indexTree(tree), [tree]);
  const totals = useMemo(() => {
    const nodes = Array.from(index.byId.values());
    return { all: nodes.length, available: nodes.filter((n) => n.unlocked).length, custom: nodes.filter((n) => n.is_custom).length };
  }, [index]);

  const [filter, setFilter] = useState<TroopFilter>(() => (totals.available > 1 ? 'available' : 'all'));
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(ROOT_ID);
  const [editor, setEditor] = useState<{ editing: KingdomCustomUnit | null; parent: string | null } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const keep = useMemo(() => visibleIds(index, filter, query), [index, filter, query]);
  const selected = selectedId ? index.byId.get(selectedId) || null : null;
  const canEditTree = isDungeonMaster && kingdomId != null;

  // If the selected troop disappears (deleted, or filtered out of an empty result) fall back to the root.
  useEffect(() => {
    if (selectedId && !index.byId.has(selectedId)) setSelectedId(ROOT_ID);
  }, [index, selectedId]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setActionError(null);
  }, []);

  const childrenOfSelected = selected ? (index.children.get(selected.id) || []).map((id) => index.byId.get(id)!).filter(Boolean) : [];
  const parentOfSelected = selected ? index.byId.get(index.parent.get(selected.id) || '') || null : null;
  const heldSelected = selected ? toCount(reserves[selected.unit_type]) : 0;

  const saved = async (_message: string, savedName: string) => {
    await onChanged();
    setEditor(null);
    setSelectedId(savedName);
    setFilter((f) => (f === 'available' ? 'all' : f));
  };

  const removeSelected = async () => {
    if (!selected?.is_custom || kingdomId == null) return;
    const descendants = descendantsOf(index, selected.id).size;
    const ok = window.confirm(
      descendants > 0
        ? `Delete ${selected.unit_type}? Its ${descendants} upgrade${descendants === 1 ? '' : 's'} must be removed first.`
        : `Delete ${selected.unit_type} from the troop tree?`
    );
    if (!ok) return;
    setDeleting(true);
    setActionError(null);
    try {
      await kingdomAPI.deleteCustomUnit(kingdomId, Number(selected.custom_id));
      const parentId = index.parent.get(selected.id) || ROOT_ID;
      await onChanged();
      setSelectedId(parentId);
    } catch (e: any) {
      setActionError(e?.response?.data?.error || 'Could not delete this troop.');
    } finally {
      setDeleting(false);
    }
  };

  const filters: Array<{ key: TroopFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: totals.all },
    { key: 'available', label: 'Available now', count: totals.available },
    ...(totals.custom > 0 || canEditTree ? [{ key: 'custom' as TroopFilter, label: 'Custom', count: totals.custom }] : []),
  ];

  return (
    <>
      <Dialog.Root open onOpenChange={(open) => { if (!open && !editor) onClose(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="kt-cs-overlay" />
          <Dialog.Content className="kt-cs-modal kt-tt-modal kt-ui" aria-describedby="kt-tt-desc">
            <div className="kt-cs-modal-head">
              <div>
                <Dialog.Title className="kt-cs-modal-title">Troop progression</Dialog.Title>
                <Dialog.Description id="kt-tt-desc" className="kt-cs-modal-sub">
                  Recruit Militia, then train them up any branch. A troop unlocks in a fief once its building is finished there.
                </Dialog.Description>
              </div>
              <Dialog.Close className="kt-cs-close" aria-label="Close">
                <Icon name="x" size={18} />
              </Dialog.Close>
            </div>

            <div className="kt-cs-toolbar">
              <label className="kt-cs-search">
                <Icon name="search" size={15} />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search troops or lines" aria-label="Search troops" />
              </label>
              <div className="kt-tt-filters" role="group" aria-label="Show">
                {filters.map((f) => (
                  <button key={f.key} type="button" className="kt-ui-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                    {f.label} <span className="kt-cs-chip-n">{f.count}</span>
                  </button>
                ))}
              </div>
              {canEditTree && (
                <button type="button" className="kt-ui-btn" data-variant="primary" onClick={() => setEditor({ editing: null, parent: selected?.id || ROOT_ID })}>
                  <Icon name="plus" size={14} />
                  New troop
                </button>
              )}
            </div>

            <div className="kt-tt-body">
              <div className="kt-tt-canvas">
                {index.byId.size === 0 ? (
                  <EmptyNote title="No troop data yet">Open a fief to see its troop tree.</EmptyNote>
                ) : keep.size === 0 ? (
                  <div className="kt-tt-none"><EmptyNote title="No troops match">Try another filter or search.</EmptyNote></div>
                ) : (
                  <ReactFlowProvider>
                    <TroopCanvas index={index} keep={keep} reserves={reserves} speedPct={speedPct} selectedId={selectedId} onSelect={select} />
                  </ReactFlowProvider>
                )}
                <ul className="kt-tt-legend" aria-label="Legend">
                  <li data-kind="open">Ready to train</li>
                  <li data-kind="locked">Building missing</li>
                  <li data-kind="custom">Unique to {kingdomName || 'this kingdom'}</li>
                </ul>
              </div>

              <aside className="kt-tt-inspector" aria-label="Selected troop" aria-live="polite">
                {!selected ? (
                  <EmptyNote title="Select a troop">Click any troop in the tree to see what it needs.</EmptyNote>
                ) : (
                  <>
                    <div className="kt-tt-ins-head">
                      <h3 className="kt-tt-ins-name">{selected.unit_type}</h3>
                      <div className="kt-tt-ins-tags">
                        {selected.is_custom ? <span className="kt-tt-tag">Unique</span> : null}
                        <span className="kt-tt-ins-line">{selected.is_root ? 'Root of the tree' : selected.is_custom ? `Branch of ${selected.line_key}` : selected.line_key}</span>
                      </div>
                    </div>

                    {selected.description ? <p className="kt-tt-ins-desc">{selected.description}</p> : null}

                    <dl className="kt-tt-ins-facts">
                      <div>
                        <dt>Training</dt>
                        <dd>
                          {effectiveTrainingDays(selected.base_days, speedPct)} day{effectiveTrainingDays(selected.base_days, speedPct) === 1 ? '' : 's'}
                          {speedPct !== 0 ? <span className="kt-ui-note"> (base {selected.base_days})</span> : null}
                        </dd>
                      </div>
                      <div>
                        <dt>In reserve here</dt>
                        <dd>{heldSelected}</dd>
                      </div>
                      {parentOfSelected && (
                        <div>
                          <dt>Upgrades from</dt>
                          <dd><button type="button" className="kt-tt-link" onClick={() => select(parentOfSelected.id)}>{parentOfSelected.unit_type}</button></dd>
                        </div>
                      )}
                    </dl>

                    <div className="kt-tt-ins-sec">
                      <h4 className="kt-ui-h">Needs</h4>
                      {selected.required_buildings.length === 0 ? (
                        <p className="kt-ui-note">{selected.is_root ? 'Recruited straight from unassigned adults.' : 'No building. Available once the fief has troops to upgrade from.'}</p>
                      ) : (
                        <ul className="kt-tt-reqs">
                          {selected.required_buildings.map((b) => (
                            <li key={b.building_type} data-ok={b.completed ? 'true' : 'false'}>
                              <Icon name={b.completed ? 'check' : 'lock'} size={13} />
                              <span>{b.building_name}</span>
                              {b.is_custom ? <span className="kt-tt-tag">Unique</span> : null}
                              {b.inherited && parentOfSelected ? <span className="kt-tt-req-inherit">from {parentOfSelected.unit_type}</span> : null}
                              <span className="kt-tt-req-state">{b.completed ? 'Built here' : 'Not built here'}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {childrenOfSelected.length > 0 && (
                      <div className="kt-tt-ins-sec">
                        <h4 className="kt-ui-h">Upgrades into</h4>
                        <div className="kt-tt-kids">
                          {childrenOfSelected.map((c) => (
                            <button key={c.id} type="button" className="kt-ui-chip" data-custom={c.is_custom ? 'true' : undefined} onClick={() => select(c.id)}>
                              {c.unit_type}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {canEditTree && (
                      <div className="kt-tt-ins-actions">
                        <button type="button" className="kt-ui-btn" data-variant="primary" onClick={() => setEditor({ editing: null, parent: selected.id })}>
                          <Icon name="plus" size={14} />
                          Add branch from {selected.unit_type}
                        </button>
                        {selected.is_custom && (
                          <div className="kt-tt-ins-actions-row">
                            <button type="button" className="kt-ui-btn" data-variant="ghost" onClick={() => setEditor({ editing: toCustomUnit(selected), parent: null })}>
                              <Icon name="pencil" size={13} />
                              Edit
                            </button>
                            <button type="button" className="kt-ui-btn" data-variant="danger" onClick={removeSelected} disabled={deleting}>
                              <Icon name="trash" size={13} />
                              {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        )}
                        {actionError && <p className="kt-cb-error" role="alert">{actionError}</p>}
                      </div>
                    )}
                  </>
                )}
              </aside>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {editor && kingdomId != null && (
        <CustomUnitEditor
          kingdomId={kingdomId}
          kingdomName={kingdomName || 'this kingdom'}
          editing={editor.editing}
          presetParent={editor.parent}
          index={index}
          onSaved={saved}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
};

export default TroopProgressionModal;
