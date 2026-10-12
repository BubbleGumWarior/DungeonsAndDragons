import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Crosshair as ReachIcon, EyeOff, Footprints, HeartCrack, ImageOff, Lightbulb, Maximize2, Skull, ZoomIn, ZoomOut, Map as MapIcon, MousePointerClick, X } from 'lucide-react';
import type { Battle, BattleParticipant } from '../../../services/api';
import {
  BASE_TYPE_GLYPH,
  BATTLEFIELD_FEET_PER_PERCENT,
  formatCount,
  formatFeet,
  getArmyBaseType,
  getArmyMovementSpeed,
  getArmyRangeFeet,
  getFactionColor,
  getFogState,
  getMoraleLevel,
  goneKind,
  isGone,
  MORALE_LABEL,
  MORALE_TONE,
  getParticipantCategory,
  getParticipantName,
  getPercentDistanceFeet,
  readableOn,
} from './battlefieldHelpers';

export interface BoardLightingNode {
  id: string;
  type: 'light' | 'dark';
  strength: number;
  x: number;
  y: number;
}

interface BattleMapStageProps {
  battle: Battle;
  isDM: boolean;
  userId?: number;
  mapUrl: string | null;
  remainingMovement: Record<number, number>;
  darknessLevel: number;
  darknessConfirmed: boolean;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  lightingNodes: BoardLightingNode[];
  placingNode: boolean;
  selectedId: number | null;
  targetId: number | null;
  hoveredId: number | null;
  onSelect: (id: number | null) => void;
  onHover: (id: number | null) => void;
  onMoveArmy: (participantId: number, x: number, y: number) => void;
  onPlaceNode: (x: number, y: number) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onPickMap: () => void;
  onClearMap: () => void;
  onOpenLighting: () => void;
}

interface DragState {
  id: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  originClientX: number;
  originClientY: number;
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n));
const STAGE_PAD = 18;
const STACKED_TOP = 48;
const COMPACT_BELOW_PX = 560;
const DRAG_THRESHOLD_PX = 4;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.4;
const SCALE_STEPS_FEET = [5, 10, 20, 25, 50, 100, 200, 250, 500];

interface MapView { zoom: number; x: number; y: number }

// Keep the zoomed map from sliding out of the stage: it can pan until its edge reaches the far side
const clampView = (view: MapView, stage: { w: number; h: number }, base: { w: number; h: number }): MapView => {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom));
  const maxX = Math.max(0, (base.w * zoom - stage.w) / 2 + 40);
  const maxY = Math.max(0, (base.h * zoom - stage.h) / 2 + 40);
  return { zoom, x: zoom === 1 ? 0 : Math.min(maxX, Math.max(-maxX, view.x)), y: zoom === 1 ? 0 : Math.min(maxY, Math.max(-maxY, view.y)) };
};

// A ring is drawn twice: a dark casing first so the bright line reads on any map colour.
const Ring: React.FC<{ kind: 'move' | 'reach'; spent?: boolean; cx: number; cy: number; r: number }> = ({ kind, spent, cx, cy, r }) => (
  <>
    <ellipse className="bf-ring" data-kind="case" cx={cx} cy={cy} rx={r} ry={r} />
    <ellipse className="bf-ring" data-kind={kind} data-spent={spent ? 'true' : undefined} cx={cx} cy={cy} rx={r} ry={r} />
  </>
);

const BattleMapStage: React.FC<BattleMapStageProps> = ({
  battle, isDM, userId, mapUrl, remainingMovement, darknessLevel, darknessConfirmed, canvasRef,
  lightingNodes, placingNode, selectedId, targetId, hoveredId,
  onSelect, onHover, onMoveArmy, onPlaceNode, onMoveNode, onPickMap, onClearMap, onOpenLighting,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const nodeDragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [nodeDrag, setNodeDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [ratio, setRatio] = useState(16 / 10);
  const [view, setView] = useState<MapView>({ zoom: 1, x: 0, y: 0 });
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [stacked, setStacked] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1080px)').matches);

  useLayoutEffect(() => {
    const query = window.matchMedia('(max-width: 1080px)');
    const onChange = () => setStacked(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStageSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const boardSize = useMemo(() => {
    const aw = Math.max(0, stageSize.w - STAGE_PAD * 2);
    const ah = Math.max(0, stageSize.h - STAGE_PAD * 2);
    let w = aw;
    let h = aw / ratio;
    // Stacked layout: the stage grows to fit the map instead of the map shrinking to fit the stage.
    if (!stacked && h > ah) { h = ah; w = ah * ratio; }
    return { w: Math.floor(w), h: Math.floor(h) };
  }, [stageSize, ratio, stacked]);
  const topInset = stacked && isDM ? STACKED_TOP : 0;
  const stageHeight = stacked && boardSize.h ? boardSize.h + STAGE_PAD * 2 + topInset : undefined;

  // Zoom is purely visual: the board just gets bigger, counters keep their size, and all positions stay in % of the map
  const current = clampView(view, stageSize, boardSize);
  const boardPx = { w: boardSize.w * current.zoom, h: boardSize.h * current.zoom };

  // Zoom towards a point (relative to the middle of the stage) so what you are looking at stays put
  const zoomTo = useCallback((nextZoom: number, anchorX = 0, anchorY = 0) => {
    setView(prev => {
      const from = clampView(prev, stageSize, boardSize);
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
      const ratioChange = zoom / from.zoom;
      return clampView({ zoom, x: anchorX - (anchorX - from.x) * ratioChange, y: anchorY - (anchorY - from.y) * ratioChange }, stageSize, boardSize);
    });
  }, [stageSize, boardSize]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // In the stacked phone/tablet layout the wheel keeps scrolling the page unless ctrl or pinch is used
      if (stacked && !e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchorX = e.clientX - (rect.left + rect.width / 2);
      const anchorY = e.clientY - (rect.top + rect.height / 2 + topInset / 2);
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView(prev => {
        const from = clampView(prev, stageSize, boardSize);
        const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, from.zoom * factor));
        const change = zoom / from.zoom;
        return clampView({ zoom, x: anchorX - (anchorX - from.x) * change, y: anchorY - (anchorY - from.y) * change }, stageSize, boardSize);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [stacked, stageSize, boardSize, topInset]);

  const participants = battle.participants || [];
  const alive = participants.filter(p => (p.current_troops || 0) > 0);
  const selected = alive.find(p => p.id === selectedId) || null;
  const target = alive.find(p => p.id === targetId) || null;

  const toPct = useCallback((clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 50, y: 50 };
    return {
      x: clampPct(((clientX - rect.left) / rect.width) * 100),
      y: clampPct(((clientY - rect.top) / rect.height) * 100),
    };
  }, []);

  const canControl = useCallback((p: BattleParticipant) =>
    isDM || (p.user_id === userId && (!p.is_temporary || !!p.is_summoned)), [isDM, userId]);

  /* ── Army drag (pointer events: works with mouse, pen and touch) ───────── */
  const handleTokenDown = (e: React.PointerEvent<HTMLButtonElement>, p: BattleParticipant) => {
    if (e.button !== 0 || placingNode) return;
    e.stopPropagation();
    if (!canControl(p)) { onSelect(p.id); return; }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const sx = p.position_x ?? 50;
    const sy = p.position_y ?? 50;
    const next: DragState = { id: p.id, startX: sx, startY: sy, x: sx, y: sy, moved: false, originClientX: e.clientX, originClientY: e.clientY };
    dragRef.current = next;
    setDrag(next);
  };

  const handleTokenMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const travelled = Math.hypot(e.clientX - current.originClientX, e.clientY - current.originClientY);
    if (!current.moved && travelled < DRAG_THRESHOLD_PX) return;
    const { x, y } = toPct(e.clientX, e.clientY);
    const next = { ...current, x, y, moved: true };
    dragRef.current = next;
    setDrag(next);
  };

  const handleTokenUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!current.moved) { onSelect(current.id); return; }
    const feet = getPercentDistanceFeet(current.startX, current.startY, current.x, current.y);
    const left = remainingMovement[current.id] ?? 0;
    if (!isDM && feet > left) { onSelect(current.id); return; }
    onSelect(current.id);
    onMoveArmy(current.id, current.x, current.y);
  };

  const handleTokenCancel = () => {
    dragRef.current = null;
    setDrag(null);
  };

  /* ── Lighting node drag (DM) ───────────────────────────────────────────── */
  const handleNodeDown = (e: React.PointerEvent<HTMLButtonElement>, n: BoardLightingNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    nodeDragRef.current = { id: n.id, moved: false };
    setNodeDrag({ id: n.id, x: n.x, y: n.y });
  };
  const handleNodeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!nodeDragRef.current) return;
    nodeDragRef.current.moved = true;
    const { x, y } = toPct(e.clientX, e.clientY);
    setNodeDrag({ id: nodeDragRef.current.id, x, y });
  };
  const handleNodeUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const current = nodeDragRef.current;
    nodeDragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (current?.moved) {
      const { x, y } = toPct(e.clientX, e.clientY);
      onMoveNode(current.id, x, y);
    }
    setNodeDrag(null);
  };

  const handleBoardDown = (e: React.PointerEvent<HTMLDivElement>) => {
    suppressClickRef.current = false;
    if (e.button !== 0 || placingNode || current.zoom <= 1) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, originX: current.x, originY: current.y, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  };
  const handleBoardMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    if (!pan.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    pan.moved = true;
    setView(prev => clampView({ zoom: prev.zoom, x: pan.originX + dx, y: pan.originY + dy }, stageSize, boardSize));
  };
  const handleBoardUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    panRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (pan?.moved) suppressClickRef.current = true; // a pan is not a click on the map
  };

  const handleBoardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (placingNode) {
      const { x, y } = toPct(e.clientX, e.clientY);
      onPlaceNode(x, y);
      return;
    }
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.board === 'true') onSelect(null);
  };

  /* ── Derived overlay data ───────────────────────────────────────────────── */
  const dragging = drag && drag.moved ? drag : null;
  const posOf = (p: BattleParticipant) =>
    dragging && dragging.id === p.id ? { x: dragging.x, y: dragging.y } : { x: p.position_x ?? 50, y: p.position_y ?? 50 };

  const selectedVisible = selected && getFogState(selected, participants, userId, isDM, darknessLevel) === 'visible';
  const ringCenter = selected
    ? (dragging && dragging.id === selected.id ? { x: dragging.startX, y: dragging.startY } : { x: selected.position_x ?? 50, y: selected.position_y ?? 50 })
    : null;
  // The reach ring follows the counter while it is being dragged, so you can see who a new position would threaten
  const reachCenter = selected
    ? (dragging && dragging.id === selected.id ? { x: dragging.x, y: dragging.y } : { x: selected.position_x ?? 50, y: selected.position_y ?? 50 })
    : null;
  const moveLeft = selected ? (remainingMovement[selected.id] ?? 0) : 0;
  const reachFeet = selected ? getArmyRangeFeet(getParticipantCategory(selected)) : 0;

  const inReachIds = new Set<number>();
  if (selected && selectedVisible && reachCenter && reachFeet > 0) {
    alive.forEach(p => {
      if (p.id === selected.id || p.team_name === selected.team_name) return;
      if (getFogState(p, participants, userId, isDM, darknessLevel) !== 'visible') return;
      const at = posOf(p);
      if (getPercentDistanceFeet(reachCenter.x, reachCenter.y, Number(at.x), Number(at.y)) <= reachFeet) inReachIds.add(p.id);
    });
  }

  // Scale bar: pick a round distance that makes a bar of a sensible length at the current zoom
  const feetAcross = 100 * BATTLEFIELD_FEET_PER_PERCENT;
  const pxPerFoot = boardPx.w > 0 ? boardPx.w / feetAcross : 0;
  const scaleFeet = pxPerFoot > 0
    ? ([...SCALE_STEPS_FEET].reverse().find(ft => ft * pxPerFoot <= 150) || SCALE_STEPS_FEET[0])
    : 100;

  const dragFeet = dragging ? getPercentDistanceFeet(dragging.startX, dragging.startY, dragging.x, dragging.y) : 0;
  const dragLeft = dragging ? (remainingMovement[dragging.id] ?? 0) : 0;
  const dragOver = !!dragging && !isDM && dragFeet > dragLeft;
  const dragged = dragging ? alive.find(p => p.id === dragging.id) : undefined;

  const linkEnds = selected && target && selectedVisible &&
    getFogState(target, participants, userId, isDM, darknessLevel) === 'visible'
    ? { a: posOf(selected), b: posOf(target) } : null;

  const movableCount = alive.filter(canControl).length;
  const hint = placingNode
    ? <><MousePointerClick size={14} aria-hidden="true" /> <b>Click the map</b> to place it</>
    : selected
      ? <><b>{getParticipantName(selected)}</b> · dashed ring is movement left, solid ring is reach{inReachIds.size > 0 ? <>, <b>{inReachIds.size} enemy in reach</b></> : null}</>
      : movableCount > 0
        ? <>Select an army to see its reach. <b>Drag</b> a counter to move it.</>
        : null;

  return (
    <div className="bf-stage" ref={stageRef} style={stageHeight ? { height: stageHeight } : undefined}>
      <div className="bf-stage-top">
        {hint ? <div className="bf-hint" role="status">{hint}</div> : <span />}
        {isDM && (
          <div className="bf-tools">
            <button type="button" className="bf-btn" onClick={onPickMap} aria-label={mapUrl ? 'Change map' : 'Choose map'}>
              <MapIcon size={14} aria-hidden="true" /> <span className="bf-btn-label">{mapUrl ? 'Change map' : 'Choose map'}</span>
            </button>
            {mapUrl && (
              <button type="button" className="bf-btn" data-variant="quiet" onClick={onClearMap} aria-label="Clear map">
                <X size={14} aria-hidden="true" /> <span className="bf-btn-label">Clear</span>
              </button>
            )}
            <button type="button" className="bf-btn" onClick={onOpenLighting} aria-label="Lighting">
              <Lightbulb size={14} aria-hidden="true" /> <span className="bf-btn-label">Lighting</span>
            </button>
          </div>
        )}
      </div>

      <div
        ref={boardRef}
        className="bf-board"
        data-board="true"
        data-placing={placingNode ? 'true' : undefined}
        data-compact={boardSize.w > 0 && boardSize.w < COMPACT_BELOW_PX ? 'true' : undefined}
        data-pannable={current.zoom > 1 ? 'true' : undefined}
        style={{
          width: boardPx.w || undefined,
          height: boardPx.h || undefined,
          visibility: boardSize.w ? 'visible' : 'hidden',
          top: topInset ? `calc(50% + ${topInset / 2}px)` : undefined,
          transform: `translate(calc(-50% + ${current.x}px), calc(-50% + ${current.y}px))`,
        }}
        onPointerDown={handleBoardDown}
        onPointerMove={handleBoardMove}
        onPointerUp={handleBoardUp}
        onPointerCancel={handleBoardUp}
        onClick={handleBoardClick}
      >
        {mapUrl ? (
          <img
            className="bf-board-img"
            src={mapUrl}
            alt="Battlefield map"
            draggable={false}
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget;
              if (naturalWidth && naturalHeight) setRatio(naturalWidth / naturalHeight);
            }}
          />
        ) : (
          <div className="bf-board-blank" data-board="true">
            <ImageOff size={30} aria-hidden="true" />
            <strong>{isDM ? 'No map on the table' : 'Waiting for a map'}</strong>
            <span>{isDM ? 'Choose or upload a map and every player sees it at once.' : 'The Dungeon Master has not laid out the battlefield yet.'}</span>
          </div>
        )}

        <div className="bf-grid" aria-hidden="true" />

        {!darknessConfirmed && <div className="bf-fog-gate" />}
        <canvas ref={canvasRef} className="bf-fog" />

        <svg className="bf-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {selectedVisible && ringCenter && (
            <>
              {reachFeet > 0 && reachCenter && (
                <Ring kind="reach" cx={reachCenter.x} cy={reachCenter.y} r={reachFeet / BATTLEFIELD_FEET_PER_PERCENT} />
              )}
              <Ring kind="move" spent={moveLeft <= 0} cx={ringCenter.x} cy={ringCenter.y} r={moveLeft > 0 ? moveLeft / BATTLEFIELD_FEET_PER_PERCENT : 0.6} />
            </>
          )}
          {linkEnds && <line className="bf-link" x1={linkEnds.a.x} y1={linkEnds.a.y} x2={linkEnds.b.x} y2={linkEnds.b.y} />}
          {dragging && (
            <line className="bf-trace" data-over={dragOver ? 'true' : undefined}
              x1={dragging.startX} y1={dragging.startY} x2={dragging.x} y2={dragging.y} />
          )}
        </svg>

        {dragging && (
          <div className="bf-ghost" style={{ left: `${dragging.startX}%`, top: `${dragging.startY}%` }} aria-hidden="true" />
        )}

        {participants.filter(isGone).map(p => {
          if (getFogState(p, participants, userId, isDM, darknessLevel) !== 'visible') return null;
          const kind = goneKind(p);
          const color = getFactionColor(p);
          return (
            <div
              key={`remains-${p.id}`}
              className="bf-remains"
              data-kind={kind}
              style={{ left: `${p.position_x ?? 50}%`, top: `${p.position_y ?? 50}%`, ['--faction' as any]: color }}
              title={`${getParticipantName(p)} ${kind === 'fled' ? 'fled the battle' : 'was destroyed'}`}
            >
              <span className="bf-remains-mark" aria-hidden="true">
                {kind === 'fled' ? <Footprints size={15} /> : <Skull size={15} />}
              </span>
              <span className="bf-remains-name">{getParticipantName(p)}<b>{kind === 'fled' ? 'Fled' : 'Fallen'}</b></span>
            </div>
          );
        })}

        {alive.map(p => {
          const fog = getFogState(p, participants, userId, isDM, darknessLevel);
          if (fog === 'hidden') return null;
          const pos = posOf(p);
          if (fog === 'silhouette') {
            return (
              <div key={p.id} className="bf-token" data-silhouette="true" style={{ left: `${pos.x}%`, top: `${pos.y}%` }} aria-hidden="true">
                <span className="bf-token-face"><span className="bf-token-body">?</span></span>
              </div>
            );
          }
          const category = getParticipantCategory(p);
          const Glyph = BASE_TYPE_GLYPH[getArmyBaseType(category)];
          const color = getFactionColor(p);
          const maxTroops = p.army_total_troops || p.current_troops || 0;
          const low = (p.current_troops || 0) < maxTroops * 0.5;
          const speedLeft = remainingMovement[p.id] ?? 0;
          const controllable = canControl(p);
          const isSelected = p.id === selectedId;
          const morale = controllable ? getMoraleLevel(p) : null;
          const worried = morale && morale !== 'steady' ? morale : null;
          return (
            <button
              key={p.id}
              type="button"
              className="bf-token"
              data-draggable={controllable ? 'true' : undefined}
              data-dragging={dragging?.id === p.id ? 'true' : undefined}
              data-selected={isSelected ? 'true' : undefined}
              data-undead={p.is_summoned ? 'true' : undefined}
              data-hidden={p.is_hidden ? 'true' : undefined}
              data-inreach={inReachIds.has(p.id) ? 'true' : undefined}
              data-hover={hoveredId === p.id ? 'true' : undefined}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, ['--faction' as any]: color, ['--on-faction' as any]: readableOn(color) }}
              aria-pressed={isSelected}
              aria-label={`${getParticipantName(p)}, team ${p.team_name}, ${formatCount(p.current_troops)} troops${inReachIds.has(p.id) ? ', in reach of the selected army' : ''}${controllable ? `, ${formatFeet(speedLeft)} movement left` : ''}`}
              onPointerDown={(e) => handleTokenDown(e, p)}
              onPointerMove={handleTokenMove}
              onPointerUp={handleTokenUp}
              onPointerCancel={handleTokenCancel}
              onPointerEnter={() => onHover(p.id)}
              onPointerLeave={() => onHover(null)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id); } }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="bf-token-face">
                <span className="bf-token-band">{p.is_summoned && <Skull size={11} aria-label="Raised undead" style={{ marginRight: 3, verticalAlign: '-1px' }} />}{p.team_name}</span>
                <span className="bf-token-body">
                  <Glyph size={20} strokeWidth={2.25} aria-hidden="true" />
                  <span className="bf-token-troops" data-low={low ? 'true' : undefined}>{formatCount(p.current_troops)}</span>
                </span>
                {controllable && (
                  <span className="bf-token-move" data-empty={speedLeft <= 0 ? 'true' : undefined}>
                    <i style={{ transform: `scaleX(${Math.min(1, speedLeft / Math.max(1, getArmyMovementSpeed(category)))})` }} />
                  </span>
                )}
              </span>
              {worried && (
                <span className="bf-token-morale" data-tone={MORALE_TONE[worried]} title={`Morale ${p.current_morale}: ${MORALE_LABEL[worried]}`}>
                  <HeartCrack size={12} aria-label={`Morale ${MORALE_LABEL[worried]}`} />
                </span>
              )}
              {p.is_hidden && (
                <span className="bf-token-hidden" title="Hidden from the enemy"><EyeOff size={12} aria-label="Hidden from the enemy" /></span>
              )}
              {inReachIds.has(p.id) && (
                <span className="bf-token-reach"><ReachIcon size={11} aria-hidden="true" /> In reach</span>
              )}
              <span className="bf-token-name">{getParticipantName(p)}</span>
            </button>
          );
        })}

        {isDM && lightingNodes.map(n => {
          const pos = nodeDrag && nodeDrag.id === n.id ? nodeDrag : n;
          return (
            <button
              key={n.id}
              type="button"
              className="bf-node"
              data-type={n.type}
              data-dragging={nodeDrag?.id === n.id ? 'true' : undefined}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              title={`${n.type === 'light' ? 'Light source' : 'Darkness field'} · ${Math.round(n.strength * 100)}% strength. Drag to move.`}
              aria-label={`${n.type === 'light' ? 'Light source' : 'Darkness field'}, ${Math.round(n.strength * 100)} percent`}
              onPointerDown={(e) => handleNodeDown(e, n)}
              onPointerMove={handleNodeMove}
              onPointerUp={handleNodeUp}
              onClick={(e) => e.stopPropagation()}
            />
          );
        })}

      </div>

      <div className="bf-zoom" role="group" aria-label="Map zoom">
        <button type="button" className="bf-icon-btn" onClick={() => zoomTo(current.zoom * ZOOM_STEP)} disabled={current.zoom >= ZOOM_MAX} aria-label="Zoom in">
          <ZoomIn size={17} aria-hidden="true" />
        </button>
        <button type="button" className="bf-zoom-level" onClick={() => zoomTo(1)} disabled={current.zoom === 1} aria-label="Reset zoom" title="Reset zoom">
          {current.zoom === 1 ? <Maximize2 size={14} aria-hidden="true" /> : `${current.zoom.toFixed(1)}×`}
        </button>
        <button type="button" className="bf-icon-btn" onClick={() => zoomTo(current.zoom / ZOOM_STEP)} disabled={current.zoom <= ZOOM_MIN} aria-label="Zoom out">
          <ZoomOut size={17} aria-hidden="true" />
        </button>
      </div>

      {boardSize.w > 0 && (
        <div className="bf-scale" style={{ width: Math.max(24, scaleFeet * pxPerFoot) }} aria-hidden="true">
          <span>{scaleFeet} ft</span>
          <div className="bf-scale-bar" />
        </div>
      )}

      {selectedVisible && (
        <div className="bf-legend" aria-hidden="true">
          <span><i data-kind="move" /> Movement left · {formatFeet(moveLeft)}</span>
          <span><i /> Reach · {formatFeet(reachFeet)}{inReachIds.size > 0 ? ` · ${inReachIds.size} in reach` : ''}</span>
        </div>
      )}

      {dragging && dragged && (
        <div className="bf-readout" data-over={dragOver ? 'true' : undefined} role="status">
          {getParticipantName(dragged)}
          <span>{formatFeet(dragFeet)}</span>
          <em>{isDM ? 'DM move, no limit' : dragOver ? `${formatFeet(dragFeet - dragLeft)} too far, release to cancel` : `${formatFeet(Math.max(0, dragLeft - dragFeet))} left after`}</em>
        </div>
      )}
    </div>
  );
};

export default BattleMapStage;
