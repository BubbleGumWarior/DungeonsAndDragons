import React, { useEffect, useMemo, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { KingdomFief, UnitAnimalChoice } from '../../services/api';
import '../../styles/militiaPanel.css';
import { clampInt, EmptyNote, Icon, Stepper, toCount } from './kingdomUi';

type TabKey = 'train' | 'guards' | 'dm';

interface MilitiaTrainingPanelProps {
  fief: KingdomFief;
  unassignedAdults: number;
  isDungeonMaster: boolean;
  busy: string | null;
  // Maps a unit type (e.g. "Longbowman") to its progression line key (e.g. "Archer").
  unitTypeToLine: Map<string, string>;
  onOpenProgression: () => void;
  onTrain: (unitType: string, amount: number) => Promise<boolean>;
  onCollect: () => void;
  onUpgrade: (fromUnitType: string, amount: number, toUnitType: string, animals?: UnitAnimalChoice) => void;
  // Assigns animals to troops that finished training without one, moving them into the reserve.
  onMount: (unitType: string, amount: number, animals: UnitAnimalChoice) => Promise<boolean>;
  onAdjustGuards: (buildingType: string, unitType: string, delta: number) => void;
  // Signed per-unit deltas; removals come out of reserve first, then out of guard posts (server-side).
  onDmAdjust: (deltas: Record<string, number>) => Promise<boolean>;
}

// Mirrors the server: training time is base days reduced by the legendary speed bonus, rounded up, never below 1.
const effectiveDays = (baseDays: number, speedPct: number): number =>
  Math.max(1, Math.ceil(baseDays * (1 - speedPct / 100)));

// "war_horse" -> "War Horse"
const animalLabel = (key: string): string =>
  key.split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

// Ten 10%-wide buckets of the free animals' qualities, so the player can see where their herd sits.
const qualityBuckets = (qualities: number[]): number[] => {
  const buckets = new Array(10).fill(0);
  for (const q of qualities) buckets[Math.min(9, Math.max(0, Math.floor(q / 10)))] += 1;
  return buckets;
};

interface MountChoice { animalType: string; min: string; max: string }

interface MountResolved { animalType: string; bandLo: number; bandHi: number; free: number[]; inBand: number }

const resolveMount = (required: string[], pool: Record<string, number[]>, choice: MountChoice | undefined): MountResolved => {
  const animalType = choice?.animalType || required.find((a) => (pool[a] || []).length > 0) || required[0] || '';
  const lo = clampInt(choice?.min === undefined || choice.min === '' ? 0 : choice.min, 0, 100);
  const hi = clampInt(choice?.max === undefined || choice.max === '' ? 100 : choice.max, 0, 100);
  const [bandLo, bandHi] = lo <= hi ? [lo, hi] : [hi, lo];
  const free = pool[animalType] || [];
  return { animalType, bandLo, bandHi, free, inBand: free.filter((q) => q >= bandLo && q <= bandHi).length };
};

// Which animal a troop locks and the quality band it is drawn from, with a live count of the herd inside the band.
const MountPicker: React.FC<{
  unit: string;
  required: string[];
  pool: Record<string, number[]>;
  choice: MountChoice | undefined;
  onChange: (next: MountChoice) => void;
  wanted: number;
  waitNote: string;
}> = ({ unit, required, pool, choice, onChange, wanted, waitNote }) => {
  const r = resolveMount(required, pool, choice);
  const current: MountChoice = choice || { animalType: r.animalType, min: '0', max: '100' };
  const set = (patch: Partial<MountChoice>) => onChange({ ...current, animalType: r.animalType, ...patch });
  const buckets = qualityBuckets(r.free);
  const bucketMax = Math.max(1, ...buckets);
  const short = r.inBand < wanted;
  return (
    <div className="kt-mt-mount" role="group" aria-label={`Animals for ${unit}`}>
      <div className="kt-mt-mount-head">
        <span className="kt-mt-mount-title">Each troop locks one {required.map(animalLabel).join(' or ')}</span>
        {required.length > 1 && (
          <div className="kt-ui-seg" role="group" aria-label="Animal to assign">
            {required.map((a) => (
              <button key={a} type="button" className="kt-ui-seg-btn" aria-pressed={r.animalType === a} onClick={() => set({ animalType: a })}>
                {animalLabel(a)} <span className="kt-mt-mount-free">{(pool[a] || []).length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="kt-mt-mount-band">
        <label className="kt-mt-mount-field">
          <span>From quality</span>
          <Stepper size="sm" value={current.min} onChange={(v) => set({ min: v })} min={0} max={100} step={5} suffix="%" label="Lowest quality to assign" />
        </label>
        <label className="kt-mt-mount-field">
          <span>To quality</span>
          <Stepper size="sm" value={current.max} onChange={(v) => set({ max: v })} min={0} max={100} step={5} suffix="%" label="Highest quality to assign" />
        </label>
      </div>
      <div className="kt-mt-mount-hist" aria-hidden="true">
        {buckets.map((n, i) => {
          const lo = i * 10;
          const hi = i === 9 ? 100 : lo + 9;
          const active = hi >= r.bandLo && lo <= r.bandHi;
          return <span key={i} className="kt-mt-mount-bar" data-active={active ? 'true' : undefined} title={`${lo}–${hi}%: ${n}`} style={{ height: `${Math.max(n > 0 ? 12 : 3, (n / bucketMax) * 100)}%` }} />;
        })}
      </div>
      <p className="kt-mt-mount-count" data-short={short ? 'true' : undefined} role="status">
        <b>{r.inBand}</b> free {animalLabel(r.animalType)} {plural(r.inBand, 'is', 'are')} between {r.bandLo}% and {r.bandHi}% ({r.free.length} free in total).
        The lowest quality in range are taken first; the rest stay available for breeding.
        {short && <span className="kt-ui-bad"> {waitNote}</span>}
      </p>
    </div>
  );
};

/* ── Panel ────────────────────────────────────────────────────────────────── */

const MilitiaTrainingPanel: React.FC<MilitiaTrainingPanelProps> = ({
  fief,
  unassignedAdults,
  isDungeonMaster,
  busy,
  unitTypeToLine,
  onOpenProgression,
  onTrain,
  onCollect,
  onUpgrade,
  onMount,
  onAdjustGuards,
  onDmAdjust,
}) => {
  const [tab, setTab] = useState<TabKey>('train');
  const [trainUnitType, setTrainUnitType] = useState('Militia');
  const [trainAmount, setTrainAmount] = useState('1');
  const [upgradeAmounts, setUpgradeAmounts] = useState<Record<string, string>>({});
  // Per upgrade row: which animal a mounted troop locks and the quality band it is drawn from.
  const [mountChoices, setMountChoices] = useState<Record<string, MountChoice>>({});
  // 'max' moves as many as the reserve and the post's free capacity allow (or recalls everything posted).
  const [guardStep, setGuardStep] = useState<number | 'max'>(1);
  const [dmEdit, setDmEdit] = useState<{ unit: string; value: string } | null>(null);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [queueRef] = useAutoAnimate<HTMLUListElement>({ duration: 180 });

  const progression = useMemo(() => fief.unit_progression || [], [fief.unit_progression]);
  const trainable = useMemo(() => fief.trainable_unit_types || [], [fief.trainable_unit_types]);
  const reserves = useMemo(() => fief.unit_reserves || {}, [fief.unit_reserves]);
  const queue = useMemo(() => fief.training_queue || [], [fief.training_queue]);
  const speedPct = Math.min(90, Number((fief.legendary_bonuses || {}).unit_training_speed_reduction_pct || 0)) || 0;

  useEffect(() => {
    if (trainable.length > 0 && !trainable.includes(trainUnitType)) setTrainUnitType(trainable[0]);
  }, [trainable, trainUnitType]);

  // Unit -> { line, tier index, base training days, buildings still missing } for ordering and copy.
  const unitInfo = useMemo(() => {
    const map = new Map<string, { line: string; tier: number; baseDays: number; missing: string[] }>();
    for (const line of progression) {
      for (const t of line.tiers || []) {
        map.set(t.unit_type, {
          line: line.line_key,
          tier: t.tier_index,
          baseDays: Number(t.base_days || 1),
          missing: (t.required_buildings || []).filter((b) => !b.completed).map((b) => b.building_name),
        });
      }
    }
    return map;
  }, [progression]);

  const unitRequired = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const line of progression) for (const t of line.tiers) map.set(t.unit_type, t.required_animal_types || []);
    return map;
  }, [progression]);

  const reserveEntries = useMemo(
    () => Object.entries(reserves).map(([unit, n]) => [unit, toCount(n)] as [string, number]).filter(([, n]) => n > 0),
    [reserves]
  );
  const reserveTotal = reserveEntries.reduce((sum, [, n]) => sum + n, 0);

  const readyCount = queue.filter((r) => String(r.status).toLowerCase() === 'ready').reduce((s, r) => s + Math.max(1, toCount(r.count)), 0);
  const trainingTotal = queue.reduce((s, r) => s + Math.max(1, toCount(r.count)), 0);
  const guards = useMemo(() => fief.guard_assignments || [], [fief.guard_assignments]);
  const guardsPosted = guards.reduce((s, g) => s + toCount(g.assigned_total), 0);
  const guardsCapacity = guards.reduce((s, g) => s + toCount(g.capacity), 0);

  const tabs: Array<{ key: TabKey; label: string; badge?: string; badgeTitle?: string; tone?: 'ready' }> = [
    { key: 'train', label: 'Train', badge: readyCount > 0 ? String(readyCount) : trainingTotal > 0 ? String(trainingTotal) : undefined, badgeTitle: readyCount > 0 ? `${readyCount} ready to collect` : `${trainingTotal} in training`, tone: readyCount > 0 ? 'ready' : undefined },
    { key: 'guards', label: 'Guards', badge: guardsCapacity > 0 ? `${guardsPosted}/${guardsCapacity}` : undefined, badgeTitle: `${guardsPosted} of ${guardsCapacity} guard posts filled` },
    ...(isDungeonMaster ? [{ key: 'dm' as TabKey, label: 'DM Tools' }] : []),
  ];

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next].key);
    requestAnimationFrame(() => document.getElementById(`kt-mt-tab-${tabs[next].key}`)?.focus());
  };

  /* ── Recruit ── */

  const recruitDays = effectiveDays(unitInfo.get(trainUnitType)?.baseDays || 1, speedPct);
  const trainAmountNum = toCount(trainAmount);
  const trainOverLimit = trainAmountNum > unassignedAdults;
  const trainDisabled = busy === 'train-soldiers' || unassignedAdults <= 0 || trainAmountNum <= 0 || trainOverLimit || !trainUnitType;
  const trainHint = unassignedAdults <= 0
    ? 'No unassigned adults to recruit. Free workers up from the assignments table.'
    : trainOverLimit
      ? `Only ${unassignedAdults} unassigned adult${unassignedAdults === 1 ? '' : 's'} available.`
      : '';

  const submitTrain = async () => {
    if (trainDisabled) return;
    const ok = await onTrain(trainUnitType, trainAmountNum);
    if (ok) setTrainAmount('1');
  };

  const quickAmounts = [1, 5, 10, 25].filter((n) => n < unassignedAdults);
  const sortedQueue = useMemo(
    () => [...queue].sort((a, b) => Number(String(b.status).toLowerCase() === 'ready') - Number(String(a.status).toLowerCase() === 'ready')),
    [queue]
  );

  const renderTrain = () => (
    <div className="kt-mt-stack">
      <section className="kt-mt-recruit" aria-label="Recruit units">
        {trainable.length === 0 ? (
          <EmptyNote title="No units unlocked yet">Complete a Militia Camp to begin recruiting.</EmptyNote>
        ) : (
          <>
            <div className="kt-mt-recruit-pick">
              {trainable.length > 1 ? (
                <div className="kt-mt-options" role="radiogroup" aria-label="Unit to train">
                  {trainable.map((unit) => {
                    const days = effectiveDays(unitInfo.get(unit)?.baseDays || 1, speedPct);
                    return (
                      <button
                        key={unit}
                        type="button"
                        role="radio"
                        aria-checked={unit === trainUnitType}
                        className="kt-mt-option"
                        data-selected={unit === trainUnitType ? 'true' : undefined}
                        onClick={() => setTrainUnitType(unit)}
                      >
                        <span className="kt-mt-option-name">{unit}</span>
                        <span className="kt-mt-option-meta">{days} day{days === 1 ? '' : 's'}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="kt-mt-recruit-unit">
                  <span className="kt-mt-recruit-name">Recruit {trainUnitType}</span>
                  <span className="kt-mt-recruit-meta">
                    From unassigned adults · {recruitDays} day{recruitDays === 1 ? '' : 's'}
                    {speedPct !== 0 && (
                      <span className={speedPct > 0 ? 'kt-ui-good' : 'kt-ui-bad'}>
                        {' · '}{speedPct > 0 ? `${speedPct.toFixed(1)}% faster` : `${Math.abs(speedPct).toFixed(1)}% slower`}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="kt-mt-recruit-do">
              <div className="kt-mt-recruit-amount">
                <Stepper
                  value={trainAmount}
                  onChange={setTrainAmount}
                  min={1}
                  max={Math.max(1, unassignedAdults)}
                  disabled={unassignedAdults <= 0 || busy === 'train-soldiers'}
                  label="recruits"
                />
                <div className="kt-mt-quick" role="group" aria-label="Quick amounts">
                  {quickAmounts.map((n) => (
                    <button key={n} type="button" className="kt-ui-chip" onClick={() => setTrainAmount(String(n))} aria-pressed={trainAmountNum === n}>
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="kt-ui-chip"
                    onClick={() => setTrainAmount(String(unassignedAdults))}
                    disabled={unassignedAdults <= 0}
                    aria-pressed={unassignedAdults > 0 && trainAmountNum === unassignedAdults}
                  >
                    Max {unassignedAdults}
                  </button>
                </div>
              </div>
              <button type="button" className="kt-ui-btn" data-variant="primary" onClick={submitTrain} disabled={trainDisabled}>
                {busy === 'train-soldiers'
                  ? 'Queueing…'
                  : trainAmountNum > 0 ? `Recruit ${trainAmountNum}` : 'Recruit'}
              </button>
              {trainHint && <p className="kt-ui-hint" role="status">{trainHint}</p>}
            </div>
          </>
        )}
      </section>

      <section className="kt-mt-section" aria-label="Training queue">
        <div className="kt-mt-section-head">
          <h4 className="kt-ui-h">
            In training
            {trainingTotal > 0 && <span className="kt-ui-count">{trainingTotal}</span>}
          </h4>
          <button
            type="button"
            className="kt-ui-btn"
            data-variant="success"
            onClick={onCollect}
            disabled={busy === 'collect-units' || readyCount <= 0}
            title={readyCount <= 0 ? 'Nothing has finished training yet' : undefined}
          >
            <Icon name="check" size={14} />
            {busy === 'collect-units' ? 'Collecting…' : readyCount > 0 ? `Collect ${readyCount} ready` : 'Collect ready'}
          </button>
        </div>
        {sortedQueue.length === 0 ? (
          <EmptyNote title="No units in training">Queue recruits above and they will appear here.</EmptyNote>
        ) : (
          <ul className="kt-mt-queue" ref={queueRef}>
            {sortedQueue.map((row) => {
              const isReady = String(row.status || '').toLowerCase() === 'ready';
              const count = Math.max(1, toCount(row.count));
              const required = Math.max(0, Number(row.training_days_required || 0));
              const remaining = Math.max(0, Number(row.days_remaining || 0));
              const pct = isReady ? 100 : required > 0 ? Math.min(100, Math.max(0, ((required - remaining) / required) * 100)) : 0;
              return (
                <li key={row.id} className="kt-mt-queue-row" data-ready={isReady ? 'true' : undefined}>
                  <div className="kt-mt-queue-what">
                    <span className="kt-mt-queue-name">{row.unit_type}</span>
                    <span className="kt-mt-queue-count">×{count}</span>
                    {row.source_unit_type ? <span className="kt-mt-queue-from">from {row.source_unit_type}</span> : null}
                  </div>
                  <div className="kt-mt-queue-when">{isReady ? 'Ready to collect' : `${remaining} day${remaining === 1 ? '' : 's'} left`}</div>
                  <div className="kt-ui-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`${row.unit_type} training progress`}>
                    <div className="kt-ui-progress-fill" style={{ transform: `scaleX(${(pct / 100).toFixed(3)})` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {renderAwaiting()}

      {renderLadders()}
    </div>
  );

  /* ── Train up: every unit starts as Militia, then climbs a line tier by tier ── */

  const ladders = useMemo(() => {
    const upgradeMap = new Map<string, NonNullable<KingdomFief['upgradable_units']>[number]>();
    for (const u of fief.upgradable_units || []) upgradeMap.set(`${u.unit_type}->${u.next_unit_type}`, u);
    const requiredByUnit = new Map<string, string[]>();
    for (const line of progression) for (const t of line.tiers) requiredByUnit.set(t.unit_type, t.required_animal_types || []);
    return progression
      .filter((line) => line.line_key !== 'Militia')
      .map((line) => {
        const tiers = line.tiers.map((t, i) => {
          // Custom troops name the unit they upgrade from; built-in tiers follow the line order.
          const source = t.parent_unit_type || (i === 0 ? 'Militia' : line.tiers[i - 1].unit_type);
          const entry = upgradeMap.get(`${source}->${t.unit_type}`);
          const required = entry?.required_animal_types ?? t.required_animal_types ?? [];
          const sourceRequired = requiredByUnit.get(source) || [];
          return {
            required,
            // A troop that already rides/bonds with a suitable animal keeps it when it moves up a tier.
            keepsMount: required.length > 0 && sourceRequired.some((a) => required.includes(a)),
            unit: t.unit_type,
            source,
            held: toCount(reserves[t.unit_type]),
            available: toCount(reserves[source]),
            unlocked: entry ? entry.unlocked : t.unlocked,
            days: effectiveDays(Number(t.base_days || 1), speedPct),
            missing: (t.required_buildings || []).filter((b) => !b.completed).map((b) => b.building_name),
          };
        });
        const total = tiers.reduce((s, t) => s + t.held, 0);
        return { key: line.line_key, tiers, total, custom: Boolean(line.is_custom), active: tiers[0].unlocked || total > 0 };
      });
  }, [fief.upgradable_units, progression, reserves, speedPct]);

  const activeLadders = ladders.filter((l) => l.active);
  const lockedLadders = ladders.filter((l) => !l.active);
  const militiaHeld = toCount(reserves.Militia);

  const renderTierRow = (tier: (typeof ladders)[number]['tiers'][number]) => {
    const amountKey = `${tier.source}->${tier.unit}`;
    const busyKey = `upgrade-units-${tier.source}-${tier.unit}`;
    const isBusy = busy === busyKey;
    const rawAmount = upgradeAmounts[amountKey] ?? '1';
    const needsMount = tier.required.length > 0 && !tier.keepsMount;
    const pool = fief.unit_animal_pool || {};
    const mount = resolveMount(tier.required, pool, mountChoices[amountKey]);
    const maxTrainable = tier.available;
    const amount = clampInt(rawAmount === '' ? 1 : rawAmount, 1, Math.max(1, maxTrainable));
    const canTrain = tier.unlocked && tier.available > 0;
    return (
      <li key={tier.unit} className="kt-mt-tier" data-locked={tier.unlocked ? undefined : 'true'} data-idle={tier.unlocked && !canTrain ? 'true' : undefined}>
        <div className="kt-mt-tier-what">
          <span className="kt-mt-tier-name">{tier.unit}</span>
          <span className="kt-mt-tier-held" data-empty={tier.held === 0 ? 'true' : undefined}>{tier.held}</span>
        </div>
        {!tier.unlocked ? (
          <span className="kt-mt-tier-note kt-ui-bad">
            <Icon name="lock" size={12} />
            {tier.missing.length > 0 ? `Requires ${tier.missing.join(' + ')}` : 'Locked'}
          </span>
        ) : !canTrain ? (
          <span className="kt-mt-tier-note">No {tier.source} in reserve</span>
        ) : (
          <div className="kt-mt-tier-do">
            <span className="kt-mt-tier-from">from {tier.source} <b>{tier.available}</b> · {tier.days}d</span>
            <Stepper
              size="sm"
              value={rawAmount}
              onChange={(v) => setUpgradeAmounts((prev) => ({ ...prev, [amountKey]: v }))}
              min={1}
              max={Math.max(1, maxTrainable)}
              disabled={isBusy}
              label={`${tier.unit} to train`}
            />
            <button
              type="button"
              className="kt-ui-chip"
              onClick={() => setUpgradeAmounts((prev) => ({ ...prev, [amountKey]: String(Math.max(1, maxTrainable)) }))}
              disabled={isBusy}
              aria-label={`Train all ${maxTrainable} ${tier.source} into ${tier.unit}`}
            >
              All
            </button>
            <button
              type="button"
              className="kt-ui-btn"
              data-variant="primary"
              onClick={() => onUpgrade(
                tier.source,
                amount,
                tier.unit,
                needsMount ? { animalType: mount.animalType, minQuality: mount.bandLo, maxQuality: mount.bandHi } : undefined
              )}
              disabled={isBusy}
            >
              {isBusy ? 'Queueing…' : `Train ${amount}`}
            </button>
          </div>
        )}
        {tier.unlocked && canTrain && tier.keepsMount && (
          <p className="kt-mt-mount-note">
            <Icon name="check" size={12} /> Keeps its {tier.required.map(animalLabel).join(' / ')}, so no new animal is needed.
          </p>
        )}
        {tier.unlocked && canTrain && needsMount && (
          <MountPicker
            unit={tier.unit}
            required={tier.required}
            pool={pool}
            choice={mountChoices[amountKey]}
            onChange={(next) => setMountChoices((prev) => ({ ...prev, [amountKey]: next }))}
            wanted={amount}
            waitNote={`Only ${Math.min(amount, mount.inBand)} of ${amount} will get an animal now. The rest finish training but wait, unusable, until you assign one.`}
          />
        )}
      </li>
    );
  };

  const awaitingEntries = useMemo(
    () => Object.entries(fief.unit_awaiting_animals || {}).map(([unit, n]) => [unit, toCount(n)] as [string, number]).filter(([, n]) => n > 0),
    [fief.unit_awaiting_animals]
  );
  const awaitingTotal = awaitingEntries.reduce((sum, [, n]) => sum + n, 0);
  const [awaitAmounts, setAwaitAmounts] = useState<Record<string, string>>({});

  const renderAwaiting = () => {
    if (awaitingEntries.length === 0) return null;
    const pool = fief.unit_animal_pool || {};
    return (
      <section className="kt-mt-section" aria-label="Troops awaiting animals">
        <div className="kt-mt-section-head">
          <h4 className="kt-ui-h">Awaiting animals<span className="kt-ui-count">{awaitingTotal}</span></h4>
        </div>
        <p className="kt-ui-note">These troops are trained but have no animal. They are not in reserve, cannot be upgraded or posted as guards until you assign animals.</p>
        <ul className="kt-mt-tiers">
          {awaitingEntries.map(([unit, waiting]) => {
            const required = (unitRequired.get(unit) || []);
            const key = `await:${unit}`;
            const mount = resolveMount(required, pool, mountChoices[key]);
            const maxAssign = Math.min(waiting, mount.inBand);
            const rawAmount = awaitAmounts[key] ?? String(Math.max(1, maxAssign));
            const amount = clampInt(rawAmount === '' ? 1 : rawAmount, 1, Math.max(1, maxAssign));
            const isBusy = busy === `mount-units-${unit}`;
            return (
              <li key={unit} className="kt-mt-tier">
                <div className="kt-mt-tier-what">
                  <span className="kt-mt-tier-name">{unit}</span>
                  <span className="kt-mt-tier-held">{waiting}</span>
                </div>
                <div className="kt-mt-tier-do">
                  <Stepper size="sm" value={rawAmount} onChange={(v) => setAwaitAmounts((p) => ({ ...p, [key]: v }))} min={1} max={Math.max(1, maxAssign)} disabled={isBusy || maxAssign <= 0} label={`${unit} to give animals`} />
                  <button
                    type="button"
                    className="kt-ui-btn"
                    data-variant="primary"
                    disabled={isBusy || maxAssign <= 0}
                    onClick={async () => {
                      const ok = await onMount(unit, amount, { animalType: mount.animalType, minQuality: mount.bandLo, maxQuality: mount.bandHi });
                      if (ok) setAwaitAmounts((p) => ({ ...p, [key]: '' }));
                    }}
                  >
                    {isBusy ? 'Assigning…' : `Assign ${maxAssign > 0 ? amount : 0}`}
                  </button>
                </div>
                <MountPicker
                  unit={unit}
                  required={required}
                  pool={pool}
                  choice={mountChoices[key]}
                  onChange={(next) => setMountChoices((p) => ({ ...p, [key]: next }))}
                  wanted={waiting}
                  waitNote={`${waiting - Math.min(waiting, mount.inBand)} of ${waiting} would still be waiting.`}
                />
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  const renderLadders = () => (
    <section className="kt-mt-section" aria-label="Train up">
      <div className="kt-mt-section-head">
        <h4 className="kt-ui-h">Train up</h4>
        <span className="kt-mt-pool">
          <b>{militiaHeld}</b> Militia in reserve
        </span>
      </div>
      {reserveTotal === 0 && queue.length === 0 ? (
        <EmptyNote title="No troops to train yet">Recruit Militia first. Once collected, train them into specialised troops here.</EmptyNote>
      ) : (
        <>
          <div className="kt-mt-lines">
            {activeLadders.map((line) => (
              <div key={line.key} className="kt-mt-line">
                <div className="kt-mt-line-head">
                  <h5 className="kt-mt-line-name">{line.key}{line.custom ? <span className="kt-tt-tag">Unique</span> : null}</h5>
                  {line.total > 0 && <span className="kt-mt-line-total">{line.total} in reserve</span>}
                </div>
                <ul className="kt-mt-tiers">{line.tiers.map(renderTierRow)}</ul>
              </div>
            ))}
          </div>
          {lockedLadders.length > 0 && (
            <details className="kt-mt-locked">
              <summary>
                <Icon name="lock" size={13} />
                {lockedLadders.length} locked line{lockedLadders.length === 1 ? '' : 's'}
              </summary>
              <ul className="kt-mt-locked-list">
                {lockedLadders.map((line) => (
                  <li key={line.key}>
                    <span className="kt-mt-locked-name">{line.key}</span>
                    <span className="kt-mt-locked-req">{line.tiers[0].missing.length > 0 ? `Requires ${line.tiers[0].missing.join(' + ')}` : 'Locked'}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );

  /* ── Guards ── */

  const renderGuards = () => {
    if (guards.length === 0) {
      return <EmptyNote title="No posts to guard">Build a defensive structure with guard capacity to post troops.</EmptyNote>;
    }
    return (
      <div className="kt-mt-stack">
        <div className="kt-mt-guard-bar">
          <span className="kt-mt-guard-bar-label" id="kt-mt-step-label">Troops moved per click</span>
          <div className="kt-ui-seg" role="group" aria-labelledby="kt-mt-step-label">
            {([1, 5, 10, 100, 1000, 'max'] as const).map((n) => (
              <button key={n} type="button" className="kt-ui-seg-btn" aria-pressed={guardStep === n} onClick={() => setGuardStep(n)}>
                {n === 'max' ? 'Max' : n}
              </button>
            ))}
          </div>
        </div>
        <div className="kt-mt-posts">
          {guards.map((g) => {
            const capacity = toCount(g.capacity);
            const assigned = toCount(g.assigned_total);
            const remaining = Math.max(0, capacity - assigned);
            const pct = capacity > 0 ? Math.min(1, assigned / capacity) : 0;
            const level = pct >= 1 ? 'full' : pct >= 0.75 ? 'high' : 'ok';
            const isBusy = busy === `guards-${g.building_type}`;
            const assignedBy = g.assigned_by_type || {};
            const units = Array.from(new Set([
              ...reserveEntries.map(([u]) => u),
              ...Object.entries(assignedBy).filter(([, n]) => toCount(n) > 0).map(([u]) => u),
            ])).sort((a, b) => (unitInfo.get(a)?.tier ?? 99) - (unitInfo.get(b)?.tier ?? 99) || a.localeCompare(b));
            return (
              <section key={g.building_type} className="kt-mt-post" aria-label={g.building_name}>
                <div className="kt-mt-post-head">
                  <h4 className="kt-ui-h">{g.building_name}</h4>
                  <span className="kt-mt-post-cap" data-level={level}>{assigned} / {capacity}</span>
                </div>
                <div className="kt-ui-progress" data-level={level} role="progressbar" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={assigned} aria-label={`${g.building_name} guard capacity`}>
                  <div className="kt-ui-progress-fill" style={{ transform: `scaleX(${pct.toFixed(3)})` }} />
                </div>
                {units.length === 0 ? (
                  <p className="kt-ui-note">No troops in reserve or posted here.</p>
                ) : (
                  <ul className="kt-mt-guards">
                    <li className="kt-mt-guards-cols" aria-hidden="true">
                      <span>Unit</span><span>In reserve</span><span>Posted</span>
                    </li>
                    {units.map((unit) => {
                      const free = toCount(reserves[unit]);
                      const posted = toCount(assignedBy[unit]);
                      const stepSize = guardStep === 'max' ? Number.POSITIVE_INFINITY : guardStep;
                      const addBy = Math.min(stepSize, free, remaining);
                      const removeBy = Math.min(stepSize, posted);
                      return (
                        <li key={unit} className="kt-mt-guard">
                          <span className="kt-mt-guard-name">{unit}</span>
                          <span className="kt-mt-guard-free">{free}</span>
                          <div className="kt-ui-stepper kt-mt-stepper-static" data-size="sm">
                            <button
                              type="button"
                              className="kt-ui-stepper-btn"
                              onClick={() => onAdjustGuards(g.building_type, unit, -removeBy)}
                              disabled={isBusy || removeBy <= 0}
                              aria-label={`Recall ${removeBy || (guardStep === 'max' ? 0 : guardStep)} ${unit} from ${g.building_name}`}
                            >
                              <Icon name="minus" size={13} />
                            </button>
                            <span className="kt-ui-stepper-readout" aria-live="polite">{posted}</span>
                            <button
                              type="button"
                              className="kt-ui-stepper-btn"
                              onClick={() => onAdjustGuards(g.building_type, unit, addBy)}
                              disabled={isBusy || addBy <= 0}
                              aria-label={remaining <= 0 ? `${g.building_name} is at capacity` : `Post ${addBy || (guardStep === 'max' ? 0 : guardStep)} ${unit} to ${g.building_name}`}
                              title={remaining <= 0 ? 'Post is at capacity' : undefined}
                            >
                              <Icon name="plus" size={13} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  /* ── DM tools: every unit the kingdom holds, with its total and an Edit button ── */

  const postedByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of guards) {
      for (const [unit, n] of Object.entries(g.assigned_by_type || {})) {
        map.set(unit, (map.get(unit) || 0) + toCount(n));
      }
    }
    return map;
  }, [guards]);

  const dmLines = useMemo(
    () =>
      progression
        .map((line) => ({
          key: line.line_key,
          rows: line.tiers
            .map((t) => {
              const reserve = toCount(reserves[t.unit_type]);
              const posted = postedByUnit.get(t.unit_type) || 0;
              const awaiting = toCount((fief.unit_awaiting_animals || {})[t.unit_type]);
              return { unit: t.unit_type, reserve, posted, awaiting, total: reserve + posted + awaiting };
            })
            .filter((r) => r.total > 0 || dmEdit?.unit === r.unit),
        }))
        .filter((line) => line.rows.length > 0),
    [progression, reserves, postedByUnit, dmEdit, fief.unit_awaiting_animals]
  );

  const startDmEdit = (unit: string, total: number) => {
    setDmEdit({ unit, value: String(total) });
    setDmPickerOpen(false);
  };

  const saveDmEdit = async (currentTotal: number) => {
    if (!dmEdit) return;
    const next = clampInt(dmEdit.value === '' ? 0 : dmEdit.value, 0, 999999);
    const delta = next - currentTotal;
    if (delta === 0) {
      setDmEdit(null);
      return;
    }
    const ok = await onDmAdjust({ [dmEdit.unit]: delta });
    if (ok) setDmEdit(null);
  };

  const renderDmRow = (row: { unit: string; reserve: number; posted: number; awaiting: number; total: number }) => {
    const editing = dmEdit?.unit === row.unit;
    if (!editing || !dmEdit) {
      return (
        <li key={row.unit} className="kt-mt-dm-row">
          <span className="kt-mt-dm-unit">{row.unit}</span>
          <span className="kt-mt-dm-split">{row.reserve} in reserve · {row.posted} posted{row.awaiting > 0 ? ` · ${row.awaiting} awaiting animals` : ''}</span>
          <span className="kt-mt-dm-total" aria-label={`${row.total} total`}>{row.total}</span>
          <button type="button" className="kt-ui-btn" data-variant="ghost" onClick={() => startDmEdit(row.unit, row.total)} disabled={busy === 'dm-adjust-units'}>
            Edit
          </button>
        </li>
      );
    }
    const next = clampInt(dmEdit.value === '' ? 0 : dmEdit.value, 0, 999999);
    const delta = next - row.total;
    const fromReserve = Math.min(row.reserve, Math.max(0, -delta));
    const fromPosts = Math.max(0, -delta) - fromReserve;
    const preview = delta === 0
      ? 'No change'
      : delta > 0
        ? `Adds ${delta} to reserve`
        : fromPosts > 0
          ? `Removes ${fromReserve} from reserve and unassigns ${fromPosts} from posts`
          : `Removes ${fromReserve} from reserve`;
    return (
      <li key={row.unit} className="kt-mt-dm-row" data-editing="true">
        <span className="kt-mt-dm-unit">{row.unit}</span>
        <span className="kt-mt-dm-split">{row.reserve} in reserve · {row.posted} posted{row.awaiting > 0 ? ` · ${row.awaiting} awaiting animals` : ''}</span>
        <div className="kt-mt-dm-edit">
          <Stepper
            size="sm"
            value={dmEdit.value}
            onChange={(v) => setDmEdit({ unit: row.unit, value: v })}
            min={0}
            label={`Total ${row.unit}`}
            disabled={busy === 'dm-adjust-units'}
          />
          <button type="button" className="kt-ui-btn" data-variant="primary" onClick={() => saveDmEdit(row.total)} disabled={busy === 'dm-adjust-units' || delta === 0}>
            {busy === 'dm-adjust-units' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="kt-ui-btn" data-variant="ghost" onClick={() => setDmEdit(null)} disabled={busy === 'dm-adjust-units'}>
            Cancel
          </button>
        </div>
        <p className={`kt-mt-dm-preview${fromPosts > 0 ? ' kt-ui-bad' : ''}`} role="status">{preview}</p>
      </li>
    );
  };

  const renderDm = () => (
    <div className="kt-mt-stack">
      <div className="kt-mt-section-head">
        <p className="kt-ui-note">Totals include troops posted as guards. Lowering a total takes from reserve first, then unassigns from posts.</p>
        <button type="button" className="kt-ui-btn" data-variant="ghost" onClick={() => setDmPickerOpen((o) => !o)} aria-expanded={dmPickerOpen}>
          <Icon name="plus" size={14} />
          Add unit type
        </button>
      </div>

      {dmPickerOpen && (
        <div className="kt-mt-picker">
          {progression.map((line) => (
            <div key={line.line_key} className="kt-mt-picker-line">
              <span className="kt-mt-picker-name">{line.line_key}</span>
              <div className="kt-mt-picker-chips">
                {line.tiers.map((t) => (
                  <button
                    key={t.unit_type}
                    type="button"
                    className="kt-ui-chip"
                    onClick={() => startDmEdit(t.unit_type, toCount(reserves[t.unit_type]) + (postedByUnit.get(t.unit_type) || 0))}
                  >
                    {t.unit_type}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {dmLines.length === 0 ? (
        <EmptyNote title="This kingdom has no troops">Use Add unit type to grant some.</EmptyNote>
      ) : (
        <div className="kt-mt-lines">
          {dmLines.map((line) => (
            <div key={line.key} className="kt-mt-line">
              <div className="kt-mt-line-head">
                <h5 className="kt-mt-line-name">{line.key}</h5>
                <span className="kt-mt-line-total">{line.rows.reduce((s, r) => s + r.total, 0)} total</span>
              </div>
              <ul className="kt-mt-dm-list">{line.rows.map(renderDmRow)}</ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="kt-panel kt-mt kt-ui" data-tone="gold">
      <div className="kt-mt-top">
        <div className="kt-panel-header" style={{ marginBottom: 0 }}>
          <div className="kt-panel-icon" aria-hidden="true">⚔️</div>
          <div className="kt-panel-titles">
            <div className="kt-panel-title">Militia &amp; Unit Training</div>
            <div className="kt-panel-sub">Recruit, upgrade and post your troops</div>
          </div>
        </div>
        <button type="button" className="kt-ui-btn" data-variant="ghost" onClick={onOpenProgression}>
          <Icon name="book" size={14} />
          Troop progression
        </button>
      </div>

      <dl className="kt-mt-stats">
        <div className="kt-mt-stat"><dt>Unassigned adults</dt><dd>{unassignedAdults}</dd></div>
        <div className="kt-mt-stat"><dt>In reserve</dt><dd>{reserveTotal}</dd></div>
        <div className="kt-mt-stat"><dt>In training</dt><dd>{trainingTotal}{readyCount > 0 && <span className="kt-ui-good"> · {readyCount} ready</span>}</dd></div>
        <div className="kt-mt-stat"><dt>Posted as guards</dt><dd>{guardsPosted}</dd></div>
      </dl>

      <div className="kt-mt-tabs" role="tablist" aria-label="Military sections" onKeyDown={onTabKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`kt-mt-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`kt-mt-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            className="kt-mt-tab"
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.badge && <span className="kt-ui-badge" data-tone={t.tone} title={t.badgeTitle} aria-label={t.badgeTitle}>{t.badge}</span>}
          </button>
        ))}
      </div>

      <div id={`kt-mt-panel-${tab}`} role="tabpanel" aria-labelledby={`kt-mt-tab-${tab}`} className="kt-mt-body">
        {tab === 'train' && renderTrain()}
        {tab === 'guards' && renderGuards()}
        {tab === 'dm' && isDungeonMaster && renderDm()}
      </div>
    </div>
  );
};

export default MilitiaTrainingPanel;
