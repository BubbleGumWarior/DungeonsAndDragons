import React, { useMemo, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import '../../styles/constructionPanel.css';
import {
  BUILD_TAB_LABELS,
  BUILD_TABS,
  BuildTabId,
  catStyle,
  getBuildingCategory,
  getBuildingDisplayName,
} from './kingdomBuildings';
import { EmptyNote, Icon } from './kingdomUi';

interface ConstructionPanelProps {
  buildings: any[];
  // Catalogue names by building type, for structures stored under their internal key.
  nameByType?: Map<string, string>;
  buildQueueCount: number;
  hasResearchLab: boolean;
  // buildingId -> upgrade info ({ canUpgrade, ... }) from the fief's availableUpgrades.
  upgradeByBuildingId: Map<number, any>;
  onOpenBuild: () => void;
  onOpenQueue: () => void;
  onOpenResearch: () => void;
  onOpenUpgrade: (buildingId: number, ids: number[]) => void;
  onHoverBuilding: (building: any, rect: DOMRect) => void;
  onLeaveBuilding: () => void;
}

interface BuildingGroup {
  key: string;
  rep: any;
  ids: number[];
  category: BuildTabId;
}

const plural = (n: number, one: string, many: string = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Identical structures (same type, level and construction state) collapse into one row with a count.
const groupBuildings = (list: any[]): BuildingGroup[] => {
  const groups = new Map<string, BuildingGroup>();
  for (const b of list) {
    const key = [String(b.building_type), Number(b.level || 1), b.is_complete ? 'done' : `building:${Number(b.days_remaining || 0)}`].join('|');
    const existing = groups.get(key);
    if (existing) existing.ids.push(Number(b.id));
    else groups.set(key, { key, rep: b, ids: [Number(b.id)], category: getBuildingCategory(b) });
  }
  return Array.from(groups.values());
};

const ConstructionPanel: React.FC<ConstructionPanelProps> = ({
  buildings,
  nameByType,
  buildQueueCount,
  hasResearchLab,
  upgradeByBuildingId,
  onOpenBuild,
  onOpenQueue,
  onOpenResearch,
  onOpenUpgrade,
  onHoverBuilding,
  onLeaveBuilding,
}) => {
  const [filter, setFilter] = useState<BuildTabId>('all');
  const [inProgressRef] = useAutoAnimate<HTMLUListElement>({ duration: 180 });

  const nameOf = (b: any) => getBuildingDisplayName(b, nameByType);
  const byName = (a: BuildingGroup, b: BuildingGroup) => nameOf(a.rep).localeCompare(nameOf(b.rep));

  const { built, building } = useMemo(() => {
    const done = buildings.filter((b) => b.is_complete);
    const pending = buildings.filter((b) => !b.is_complete);
    return { built: groupBuildings(done), building: groupBuildings(pending) };
  }, [buildings]);

  const builtCount = built.reduce((s, g) => s + g.ids.length, 0);
  const buildingCount = building.reduce((s, g) => s + g.ids.length, 0);

  const next = useMemo(() => {
    let best: BuildingGroup | null = null;
    for (const g of building) {
      if (!best || Number(g.rep.days_remaining || 0) < Number(best.rep.days_remaining || 0)) best = g;
    }
    return best;
  }, [building]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<BuildTabId, number>();
    for (const g of built) counts.set(g.category, (counts.get(g.category) || 0) + g.ids.length);
    return counts;
  }, [built]);
  const categories = BUILD_TABS.filter((c) => c !== 'all' && (categoryCounts.get(c) || 0) > 0);
  const activeFilter: BuildTabId = filter === 'all' || categoryCounts.has(filter) ? filter : 'all';
  const shownCategories = activeFilter === 'all' ? categories : categories.filter((c) => c === activeFilter);

  const renderRow = (g: BuildingGroup, showCategory = false) => {
    const b = g.rep;
    const count = g.ids.length;
    const done = Boolean(b.is_complete);
    const upgrade = done ? upgradeByBuildingId.get(Number(b.id)) : undefined;
    const isUpgrade = Boolean(b.previous_building_type);
    const days = Math.max(0, Number(b.days_remaining || 0));
    const level = Number(b.level || 1);
    return (
      <li
        key={g.key}
        className="kt-cs-item"
        data-done={done ? 'true' : undefined}
        style={catStyle(g.category)}
        onMouseEnter={done ? (e) => onHoverBuilding(b, (e.currentTarget as HTMLElement).getBoundingClientRect()) : undefined}
        onMouseLeave={done ? onLeaveBuilding : undefined}
      >
        <div className="kt-cs-item-main">
          <div className="kt-cs-item-name">
            <span>{nameOf(b)}</span>
            {count > 1 && <span className="kt-cs-count">×{count}</span>}
          </div>
          <div className="kt-cs-item-meta">
            {showCategory && <span className="kt-cs-cat">{BUILD_TAB_LABELS[g.category]}</span>}
            {level > 1 && <span>Level {level}</span>}
            {!done && (
              <span className="kt-cs-days">
                <Icon name="clock" size={12} />
                {plural(days, 'day')} left
              </span>
            )}
            {!done && isUpgrade && <span className="kt-cs-tag">Upgrade</span>}
          </div>
        </div>
        {upgrade && (
          <button
            type="button"
            className="kt-ui-btn kt-cs-upgrade"
            data-variant={upgrade.canUpgrade ? 'success' : 'ghost'}
            onClick={() => onOpenUpgrade(Number(b.id), g.ids)}
            title={count > 1 ? `Choose how many of these ${count} to upgrade` : upgrade.canUpgrade ? 'Upgrade this structure' : 'View upgrade requirements'}
          >
            <Icon name="up" size={13} />
            Upgrade
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="kt-panel kt-ui kt-cs" data-tone="gold">
      <div className="kt-cs-top">
        <div className="kt-panel-header" style={{ marginBottom: 0 }}>
          <div className="kt-panel-icon" aria-hidden="true">🏗️</div>
          <div className="kt-panel-titles">
            <div className="kt-panel-title">Construction</div>
            <div className="kt-panel-sub">Raise, upgrade and queue your structures</div>
          </div>
        </div>
        <div className="kt-cs-actions">
          <button type="button" className="kt-ui-btn" data-variant="primary" onClick={onOpenBuild}>
            <Icon name="hammer" size={14} />
            Build
          </button>
          <button type="button" className="kt-ui-btn" data-variant="ghost" onClick={onOpenQueue}>
            <Icon name="list" size={14} />
            Build queue
            {buildQueueCount > 0 && <span className="kt-ui-badge">{buildQueueCount}</span>}
          </button>
          {hasResearchLab && (
            <button type="button" className="kt-ui-btn" data-variant="info" onClick={onOpenResearch}>
              <Icon name="flask" size={14} />
              Research
            </button>
          )}
        </div>
      </div>

      <dl className="kt-cs-stats">
        <div className="kt-cs-stat"><dt>Completed</dt><dd>{builtCount}</dd></div>
        <div className="kt-cs-stat"><dt>Under construction</dt><dd>{buildingCount}</dd></div>
        <div className="kt-cs-stat">
          <dt>Next to finish</dt>
          <dd className="kt-cs-next">
            {next ? (
              <>
                <span className="kt-cs-next-name">{nameOf(next.rep)}</span>
                <span className="kt-cs-next-days">{plural(Math.max(0, Number(next.rep.days_remaining || 0)), 'day')}</span>
              </>
            ) : (
              <span className="kt-cs-none">Nothing building</span>
            )}
          </dd>
        </div>
      </dl>

      {building.length > 0 && (
        <section className="kt-cs-section" aria-label="Under construction">
          <h4 className="kt-ui-h">Under construction<span className="kt-ui-count">{buildingCount}</span></h4>
          <ul className="kt-cs-list kt-cs-list-flush" ref={inProgressRef}>
            {[...building]
              .sort((a, b) => Number(a.rep.days_remaining || 0) - Number(b.rep.days_remaining || 0) || byName(a, b))
              .map((g) => renderRow(g, true))}
          </ul>
        </section>
      )}

      <section className="kt-cs-section" aria-label="Built structures">
        <div className="kt-cs-section-head">
          <h4 className="kt-ui-h">Built structures<span className="kt-ui-count">{builtCount}</span></h4>
          {categories.length > 1 && (
            <div className="kt-cs-filters" role="group" aria-label="Filter by category">
              <button type="button" className="kt-ui-chip" aria-pressed={activeFilter === 'all'} onClick={() => setFilter('all')}>
                All <span className="kt-cs-chip-n">{builtCount}</span>
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="kt-ui-chip kt-cs-catchip"
                  style={catStyle(c)}
                  aria-pressed={activeFilter === c}
                  onClick={() => setFilter(c)}
                >
                  {BUILD_TAB_LABELS[c]} <span className="kt-cs-chip-n">{categoryCounts.get(c)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {built.length === 0 ? (
          <EmptyNote title="Nothing built yet">Use Build to start your first structure.</EmptyNote>
        ) : (
          <div className="kt-cs-groups">
            {shownCategories.map((c) => (
              <section key={c} className="kt-cs-group" style={catStyle(c)} aria-label={BUILD_TAB_LABELS[c]}>
                <div className="kt-cs-group-head">
                  <h5 className="kt-cs-group-name">{BUILD_TAB_LABELS[c]}</h5>
                  <span className="kt-cs-group-n">{categoryCounts.get(c)}</span>
                </div>
                <ul className="kt-cs-list">
                  {built.filter((g) => g.category === c).sort(byName).map((g) => renderRow(g))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ConstructionPanel;
