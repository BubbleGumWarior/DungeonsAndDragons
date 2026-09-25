import React, { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Check, ChevronDown } from 'lucide-react';
import '../../styles/constructionPanel.css';
import { BUILD_TAB_LABELS, BUILD_TABS, BuildTabId, catStyle, getBuildingDisplayName } from './kingdomBuildings';
import { clampInt, EmptyNote, Icon, Stepper } from './kingdomUi';

interface BuildStructuresModalProps {
  tier: number;
  // Buildable options for this fief; each carries __category from getBuildingCategory.
  options: any[];
  busy: string | null;
  getStoredAmount: (resource: string) => number;
  getResourceLabel: (resource: string) => string;
  onQueue: (buildingType: string, count: number, label: string) => void;
  onClose: () => void;
}

const MAX_QUEUE = 100;

const BuildStructuresModal: React.FC<BuildStructuresModalProps> = ({
  tier,
  options,
  busy,
  getStoredAmount,
  getResourceLabel,
  onQueue,
  onClose,
}) => {
  const [filter, setFilter] = useState<BuildTabId>('all');
  const [query, setQuery] = useState('');
  const [hideLocked, setHideLocked] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 160 });

  const categoryCounts = useMemo(() => {
    const map = new Map<BuildTabId, number>();
    for (const o of options) map.set(o.__category, (map.get(o.__category) || 0) + 1);
    return map;
  }, [options]);
  const categories = BUILD_TABS.filter((c) => c !== 'all' && (categoryCounts.get(c) || 0) > 0);
  const lockedCount = options.filter((o) => o?.isLocked).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => {
      if (filter !== 'all' && o.__category !== filter) return false;
      if (hideLocked && o?.isLocked) return false;
      if (q && !`${getBuildingDisplayName(o)} ${o.description || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [options, filter, hideLocked, query]);

  // Rows always sit under their category card, so the colour tells you what you are looking at.
  const sections = useMemo(() => {
    const cats = filter === 'all' ? categories : [filter];
    return cats
      .map((category) => ({ category, rows: visible.filter((o) => o.__category === category) }))
      .filter((s) => s.rows.length > 0);
  }, [filter, visible, categories]);

  const renderOption = (b: any) => {
    const key = String(b.key);
    const name = getBuildingDisplayName(b);
    const locked = Boolean(b?.isLocked);
    const lockReason = String(b?.lockReason || '').trim();
    const isBusy = busy === `build-${key}`;
    const rawCount = counts[key] ?? '1';
    const count = clampInt(rawCount === '' ? 1 : rawCount, 1, MAX_QUEUE);
    const cost = Object.entries((b.cost || {}) as Record<string, number>);
    const canAfford = cost.every(([k, v]) => getStoredAmount(k) >= Math.max(0, Number(v || 0)) * count);
    return (
      <li key={key} className="kt-cs-opt" data-locked={locked ? 'true' : undefined}>
        <div className="kt-cs-opt-main">
          <div className="kt-cs-opt-name">
            <span>{name}</span>
            <span className="kt-cs-opt-meta">
              Tier {Number(b.tierRequired || 1)} · {Number(b.days || 0)} day{Number(b.days || 0) === 1 ? '' : 's'}
            </span>
          </div>
          {b.description && <p className="kt-cs-opt-desc">{b.description}</p>}
          <div className="kt-cs-costs" aria-label="Cost">
            {cost.length === 0 ? (
              <span className="kt-cs-cost" data-ok="true">Free</span>
            ) : (
              cost.map(([k, v]) => {
                const needed = Math.max(0, Number(v || 0)) * count;
                const have = getStoredAmount(k);
                const ok = have >= needed;
                return (
                  <span key={k} className="kt-cs-cost" data-ok={ok ? 'true' : 'false'} title={`${needed} needed · ${have} in stores`}>
                    <span className="kt-cs-cost-n">{needed}</span> {getResourceLabel(k)}
                  </span>
                );
              })
            )}
          </div>
        </div>
        <div className="kt-cs-opt-do">
          {locked ? (
            <span className="kt-cs-lock">
              <Icon name="lock" size={13} />
              {lockReason || 'Locked'}
            </span>
          ) : (
            <>
              <Stepper
                size="sm"
                value={rawCount}
                onChange={(v) => setCounts((prev) => ({ ...prev, [key]: v }))}
                min={1}
                max={MAX_QUEUE}
                disabled={isBusy}
                label={`${name} to build`}
              />
              <button
                type="button"
                className="kt-ui-btn"
                data-variant={canAfford ? 'primary' : 'ghost'}
                onClick={() => onQueue(key, count, name)}
                disabled={isBusy}
                title={canAfford ? undefined : 'Not enough resources in stores. The server will reject this if it is still short.'}
              >
                {isBusy ? 'Queueing…' : count > 1 ? `Build ×${count}` : 'Build'}
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="kt-cs-overlay" />
        <Dialog.Content className="kt-cs-modal kt-ui" aria-describedby="kt-cs-modal-desc">
          <div className="kt-cs-modal-head">
            <div>
              <Dialog.Title className="kt-cs-modal-title">Build structures</Dialog.Title>
              <Dialog.Description id="kt-cs-modal-desc" className="kt-cs-modal-sub">
                Tier {tier} fief · showing what your tier and prerequisites allow. The window stays open so you can queue several.
              </Dialog.Description>
            </div>
            <Dialog.Close className="kt-cs-close" aria-label="Close">
              <Icon name="x" size={18} />
            </Dialog.Close>
          </div>

          <div className="kt-cs-toolbar">
            <label className="kt-cs-search">
              <Icon name="search" size={15} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search structures"
                aria-label="Search structures"
              />
            </label>

            <Select.Root value={filter} onValueChange={(v) => setFilter(v as BuildTabId)}>
              <Select.Trigger className="kt-cs-select" aria-label="Category" style={catStyle(filter)}>
                <span className="kt-cs-select-swatch" aria-hidden="true" />
                <Select.Value />
                <Select.Icon className="kt-cs-select-caret"><ChevronDown size={16} /></Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="kt-cs-select-menu kt-ui" position="popper" sideOffset={6} align="end">
                  <Select.Viewport className="kt-cs-select-viewport">
                    <Select.Item value="all" className="kt-cs-select-item" style={catStyle('all')}>
                      <span className="kt-cs-select-swatch" aria-hidden="true" />
                      <Select.ItemText>All categories</Select.ItemText>
                      <span className="kt-cs-select-n">{options.length}</span>
                      <Select.ItemIndicator className="kt-cs-select-check"><Check size={14} /></Select.ItemIndicator>
                    </Select.Item>
                    {categories.map((c) => (
                      <Select.Item key={c} value={c} className="kt-cs-select-item" style={catStyle(c)}>
                        <span className="kt-cs-select-swatch" aria-hidden="true" />
                        <Select.ItemText>{BUILD_TAB_LABELS[c]}</Select.ItemText>
                        <span className="kt-cs-select-n">{categoryCounts.get(c)}</span>
                        <Select.ItemIndicator className="kt-cs-select-check"><Check size={14} /></Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>

            {lockedCount > 0 && (
              <button type="button" className="kt-ui-chip kt-cs-lockchip" aria-pressed={hideLocked} onClick={() => setHideLocked((v) => !v)}>
                <Icon name="lock" size={12} /> Hide locked ({lockedCount})
              </button>
            )}
          </div>

          <div className="kt-cs-modal-body" ref={listRef}>
            {visible.length === 0 ? (
              <EmptyNote title="No structures match">
                {options.length === 0 ? 'Nothing is available at your current tier yet.' : 'Try a different category or search.'}
              </EmptyNote>
            ) : (
              sections.map((s) => (
                <section key={s.category} className="kt-cs-opt-group" style={catStyle(s.category)} aria-label={BUILD_TAB_LABELS[s.category]}>
                  <div className="kt-cs-group-head">
                    <h5 className="kt-cs-group-name">{BUILD_TAB_LABELS[s.category]}</h5>
                    <span className="kt-cs-group-n">{s.rows.length}</span>
                  </div>
                  <ul className="kt-cs-opts">{s.rows.map(renderOption)}</ul>
                </section>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default BuildStructuresModal;
