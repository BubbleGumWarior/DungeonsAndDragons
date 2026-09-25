import React, { CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import '../../styles/constructionPanel.css';
import '../../styles/customBuildings.css';
import { kingdomAPI, KingdomCustomBuilding, KingdomCustomBuildingInput } from '../../services/api';
import { catStyle, getLaneEffects, PRODUCTION_LANES } from './kingdomBuildings';
import { clampInt, EmptyNote, Icon, Stepper } from './kingdomUi';
import LaneEffectChips from './LaneEffectChips';

interface FiefOption {
  id: number;
  name: string;
  tier?: number;
}

interface CustomBuildingsPanelProps {
  kingdomId: number;
  kingdomName: string;
  fiefs: FiefOption[];
  currentFiefId: number | null;
  // Changes whenever the open fief is re-fetched, so the list's built counts stay current.
  reloadKey?: unknown;
  // Called after anything that changes what a fief can build or produces.
  onChanged: () => void | Promise<void>;
  pushToast: (message: string, tone?: 'error' | 'success' | 'info') => void;
}

/* ── Form state ─────────────────────────────────────────────────────────────
   Every numeric field is held as a string so the steppers can show what is typed. */

const COST_FIELDS = [
  { key: 'wood', label: 'Wood' },
  { key: 'stone', label: 'Stone' },
  { key: 'iron', label: 'Iron' },
  { key: 'gold', label: 'Gold' },
] as const;

interface FormState {
  name: string;
  description: string;
  tier: string;
  days: string;
  maxPerFief: string;
  cost: Record<string, string>;
  flat: Record<string, string>;
  pct: Record<string, string>;
}

const emptyForm = (): FormState => ({
  name: '',
  description: '',
  tier: '1',
  days: '3',
  maxPerFief: '1',
  cost: { wood: '0', stone: '0', iron: '0', gold: '0' },
  flat: Object.fromEntries(PRODUCTION_LANES.map((l) => [l.id, '0'])),
  pct: Object.fromEntries(PRODUCTION_LANES.map((l) => [l.id, '0'])),
});

const formFromBuilding = (b: KingdomCustomBuilding): FormState => {
  const form = emptyForm();
  form.name = b.name;
  form.description = b.description || '';
  form.tier = String(b.tier_required || 1);
  form.days = String(b.days || 1);
  form.maxPerFief = String(b.max_per_fief || 0);
  for (const field of COST_FIELDS) form.cost[field.key] = String(Number(b.cost?.[field.key] || 0));
  for (const lane of PRODUCTION_LANES) {
    const flatRaw = lane.id === 'iron' ? (b.resource_output?.minerals ?? b.resource_output?.iron) : b.resource_output?.[lane.flatKey];
    form.flat[lane.id] = String(Number(flatRaw || 0));
    form.pct[lane.id] = String(Number(b.bonus_pct?.[lane.pctKey] || 0));
  }
  return form;
};

const toPayload = (form: FormState): KingdomCustomBuildingInput => {
  const num = (value: string) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const resourceOutput: Record<string, number> = {};
  const bonusPct: Record<string, number> = {};
  for (const lane of PRODUCTION_LANES) {
    if (num(form.flat[lane.id]) > 0) resourceOutput[lane.flatKey] = num(form.flat[lane.id]);
    if (num(form.pct[lane.id]) !== 0) bonusPct[lane.pctKey] = num(form.pct[lane.id]);
  }
  const cost: Record<string, number> = {};
  for (const field of COST_FIELDS) if (num(form.cost[field.key]) > 0) cost[field.key] = Math.floor(num(form.cost[field.key]));
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    tierRequired: clampInt(form.tier, 1, 10),
    days: clampInt(form.days, 1, 365),
    maxPerFief: clampInt(form.maxPerFief, 0, 100),
    cost,
    resourceOutput,
    bonusPct,
  };
};

const plural = (n: number, one: string, many: string = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ── Editor ───────────────────────────────────────────────────────────────── */

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="kt-cb-field">
    <span className="kt-cb-label">{label}</span>
    {children}
    {hint ? <span className="kt-cb-hint">{hint}</span> : null}
  </div>
);

interface EditorProps {
  kingdomName: string;
  editing: KingdomCustomBuilding | null;
  onSave: (payload: KingdomCustomBuildingInput) => Promise<string | null>;
  onClose: () => void;
}

const BuildingEditor: React.FC<EditorProps> = ({ kingdomName, editing, onSave, onClose }) => {
  const [form, setForm] = useState<FormState>(() => (editing ? formFromBuilding(editing) : emptyForm()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const setIn = (group: 'cost' | 'flat' | 'pct', key: string, value: string) =>
    setForm((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));

  const payload = useMemo(() => toPayload(form), [form]);
  const effects = useMemo(() => getLaneEffects({ resourceOutput: payload.resourceOutput, bonusPct: payload.bonusPct }), [payload]);
  const canSave = payload.name.length > 0 && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const failure = await onSave(payload);
    if (failure) {
      setError(failure);
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="kt-cs-overlay" />
        <Dialog.Content className="kt-cs-modal kt-cb-modal kt-ui" aria-describedby="kt-cb-editor-desc">
          <div className="kt-cs-modal-head">
            <div>
              <Dialog.Title className="kt-cs-modal-title">{editing ? `Edit ${editing.name}` : 'New unique building'}</Dialog.Title>
              <Dialog.Description id="kt-cb-editor-desc" className="kt-cs-modal-sub">
                Only {kingdomName} can build this. Other kingdoms never see it.
              </Dialog.Description>
            </div>
            <Dialog.Close className="kt-cs-close" aria-label="Close">
              <Icon name="x" size={18} />
            </Dialog.Close>
          </div>

          <form className="kt-cb-form" onSubmit={submit}>
            <div className="kt-cb-scroll">
              <section className="kt-cb-sec" aria-label="Identity">
                <label className="kt-cb-field">
                  <span className="kt-cb-label">Name</span>
                  <input
                    className="kt-cb-input"
                    value={form.name}
                    maxLength={120}
                    placeholder="e.g. The Sunken Reliquary"
                    onChange={(e) => set('name', e.target.value)}
                    autoFocus
                  />
                </label>
                <label className="kt-cb-field">
                  <span className="kt-cb-label">What it is</span>
                  <textarea
                    className="kt-cb-input kt-cb-textarea"
                    value={form.description}
                    maxLength={1000}
                    rows={3}
                    placeholder="Shown to players in the Build list and when they hover the finished building."
                    onChange={(e) => set('description', e.target.value)}
                  />
                </label>
              </section>

              <section className="kt-cb-sec" aria-label="Production">
                <div className="kt-cb-sec-head">
                  <h4 className="kt-ui-h">Production</h4>
                  <p className="kt-cb-sec-note">
                    Flat adds a fixed amount every day for each copy. A percentage changes the whole lane after seasons, location and legendary bonuses. Leave a lane at 0 to skip it.
                  </p>
                </div>
                <div className="kt-cb-lanes" role="group" aria-label="Production lanes">
                  <div className="kt-cb-lanes-head" aria-hidden="true">
                    <span>Lane</span>
                    <span>Flat per day</span>
                    <span>Lane total</span>
                  </div>
                  {PRODUCTION_LANES.map((lane) => {
                    const active = Number(form.flat[lane.id]) > 0 || Number(form.pct[lane.id]) !== 0;
                    return (
                      <div key={lane.id} className="kt-cb-lane" data-active={active ? 'true' : undefined} style={{ '--lane-rgb': lane.rgb } as CSSProperties}>
                        <span className="kt-cb-lane-name"><Icon name={lane.icon} size={15} />{lane.label}</span>
                        <div className="kt-cb-cell" data-label="Flat per day">
                          <Stepper
                            size="sm"
                            step={0.5}
                            min={0}
                            max={10000}
                            value={form.flat[lane.id]}
                            onChange={(v) => setIn('flat', lane.id, v)}
                            label={`${lane.label} flat per day`}
                          />
                        </div>
                        <div className="kt-cb-cell" data-label="Lane total">
                          <Stepper
                            size="sm"
                            step={5}
                            min={-100}
                            max={1000}
                            suffix="%"
                            value={form.pct[lane.id]}
                            onChange={(v) => setIn('pct', lane.id, v)}
                            label={`${lane.label} percent change`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="kt-cb-preview" aria-live="polite">
                  <span className="kt-cb-preview-label">Each copy</span>
                  {effects.length > 0 ? <LaneEffectChips effects={effects} /> : <span className="kt-cb-preview-none">has no production effect yet.</span>}
                </div>
              </section>

              <section className="kt-cb-sec" aria-label="Building terms">
                <div className="kt-cb-sec-head"><h4 className="kt-ui-h">Building terms</h4></div>
                <div className="kt-cb-terms">
                  <Field label="Fief tier needed">
                    <Stepper size="sm" min={1} max={10} value={form.tier} onChange={(v) => set('tier', v)} label="Fief tier needed" />
                  </Field>
                  <Field label="Build time" hint="days">
                    <Stepper size="sm" min={1} max={365} value={form.days} onChange={(v) => set('days', v)} label="Build time in days" />
                  </Field>
                  <Field label="Limit per fief" hint={Number(form.maxPerFief) === 0 ? 'No limit' : 'copies at most'}>
                    <Stepper size="sm" min={0} max={100} value={form.maxPerFief} onChange={(v) => set('maxPerFief', v)} label="Limit per fief, 0 for no limit" />
                  </Field>
                </div>
                <div className="kt-cb-costs">
                  {COST_FIELDS.map((field) => (
                    <Field key={field.key} label={`${field.label} cost`}>
                      <Stepper
                        size="sm"
                        step={10}
                        min={0}
                        max={1000000}
                        value={form.cost[field.key]}
                        onChange={(v) => setIn('cost', field.key, v)}
                        label={`${field.label} cost`}
                      />
                    </Field>
                  ))}
                </div>
                <p className="kt-cb-sec-note">Players pay this from the fief's stores when they queue it. Use Place to give one away for free.</p>
              </section>
            </div>

            <div className="kt-cb-foot">
              {error ? <p className="kt-cb-error" role="alert">{error}</p> : <span />}
              <div className="kt-cb-foot-actions">
                <button type="button" className="kt-ui-btn" data-variant="ghost" onClick={onClose}>Cancel</button>
                <button type="submit" className="kt-ui-btn" data-variant="primary" disabled={!canSave}>
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Create building'}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/* ── Place a finished copy ────────────────────────────────────────────────── */

interface GrantProps {
  building: KingdomCustomBuilding;
  fiefs: FiefOption[];
  initialFiefId: number | null;
  onGrant: (fiefId: number, count: number) => Promise<string | null>;
  onClose: () => void;
}

const GrantDialog: React.FC<GrantProps> = ({ building, fiefs, initialFiefId, onGrant, onClose }) => {
  const [fiefId, setFiefId] = useState<number | null>(initialFiefId ?? fiefs[0]?.id ?? null);
  const [count, setCount] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = building.max_per_fief;
  const have = fiefId != null ? (building.by_fief?.[fiefId]?.built || 0) + (building.by_fief?.[fiefId]?.queued || 0) : 0;
  const room = limit > 0 ? Math.max(0, limit - have) : 100;

  const submit = async () => {
    if (fiefId == null) return;
    setBusy(true);
    setError(null);
    const failure = await onGrant(fiefId, clampInt(count, 1, Math.max(1, room)));
    if (failure) {
      setError(failure);
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="kt-cs-overlay" />
        <Dialog.Content className="kt-cs-modal kt-cb-modal kt-cb-modal-sm kt-ui" aria-describedby="kt-cb-grant-desc">
          <div className="kt-cs-modal-head">
            <div>
              <Dialog.Title className="kt-cs-modal-title">Place {building.name}</Dialog.Title>
              <Dialog.Description id="kt-cb-grant-desc" className="kt-cs-modal-sub">
                Appears finished straight away. No cost, no build time, no tier check.
              </Dialog.Description>
            </div>
            <Dialog.Close className="kt-cs-close" aria-label="Close">
              <Icon name="x" size={18} />
            </Dialog.Close>
          </div>
          <div className="kt-cb-grant">
            <div className="kt-cb-field">
              <span className="kt-cb-label">Fief</span>
              <div className="kt-cb-fiefs" role="group" aria-label="Fief">
                {fiefs.map((f) => {
                  const there = (building.by_fief?.[f.id]?.built || 0) + (building.by_fief?.[f.id]?.queued || 0);
                  return (
                    <button key={f.id} type="button" className="kt-ui-chip" aria-pressed={fiefId === f.id} onClick={() => setFiefId(f.id)}>
                      {f.name}{there > 0 ? <span className="kt-cs-chip-n">×{there}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="kt-cb-field">
              <span className="kt-cb-label">Copies</span>
              <div className="kt-cb-grant-row">
                <Stepper size="sm" min={1} max={Math.max(1, room)} value={count} onChange={setCount} label="Copies to place" disabled={room === 0} />
                {limit > 0 ? <span className="kt-cb-hint">{room === 0 ? `Already at the limit of ${limit}` : `Room for ${room} more (limit ${limit})`}</span> : null}
              </div>
            </div>
            {error ? <p className="kt-cb-error" role="alert">{error}</p> : null}
            <div className="kt-cb-foot-actions">
              <button type="button" className="kt-ui-btn" data-variant="ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="kt-ui-btn" data-variant="primary" onClick={submit} disabled={busy || fiefId == null || room === 0}>
                {busy ? 'Placing…' : clampInt(count, 1, Math.max(1, room)) > 1 ? `Place ×${clampInt(count, 1, Math.max(1, room))}` : 'Place now'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/* ── Panel ────────────────────────────────────────────────────────────────── */

const CustomBuildingsPanel: React.FC<CustomBuildingsPanelProps> = ({
  kingdomId,
  kingdomName,
  fiefs,
  currentFiefId,
  reloadKey,
  onChanged,
  pushToast,
}) => {
  const [buildings, setBuildings] = useState<KingdomCustomBuilding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ building: KingdomCustomBuilding | null } | null>(null);
  const [granting, setGranting] = useState<KingdomCustomBuilding | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [listRef] = useAutoAnimate<HTMLUListElement>({ duration: 180 });

  const load = useCallback(async () => {
    try {
      const res = await kingdomAPI.getCustomBuildings(kingdomId);
      setBuildings(res.buildings || []);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.response?.data?.error || 'Could not load unique buildings');
    } finally {
      setLoading(false);
    }
  }, [kingdomId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, reloadKey]);

  const save = async (payload: KingdomCustomBuildingInput): Promise<string | null> => {
    try {
      if (editor?.building) {
        await kingdomAPI.updateCustomBuilding(kingdomId, editor.building.id, payload);
        pushToast(`Saved ${payload.name}`, 'success');
      } else {
        await kingdomAPI.createCustomBuilding(kingdomId, payload);
        pushToast(`${payload.name} is now buildable in ${kingdomName}`, 'success');
      }
      setEditor(null);
      await load();
      await onChanged();
      return null;
    } catch (e: any) {
      return e?.response?.data?.error || 'Could not save this building. Check the fields and try again.';
    }
  };

  const grant = async (fiefId: number, count: number): Promise<string | null> => {
    if (!granting) return null;
    try {
      await kingdomAPI.grantCustomBuilding(fiefId, granting.id, count);
      const fiefName = fiefs.find((f) => f.id === fiefId)?.name || 'the fief';
      pushToast(`Placed ${count > 1 ? `${count}× ` : ''}${granting.name} in ${fiefName}`, 'success');
      setGranting(null);
      await load();
      await onChanged();
      return null;
    } catch (e: any) {
      return e?.response?.data?.error || 'Could not place this building.';
    }
  };

  const remove = async (b: KingdomCustomBuilding) => {
    const copies = (b.built_total || 0) + (b.queued_total || 0);
    const warning = copies > 0
      ? `Delete ${b.name}? The ${plural(copies, 'copy', 'copies')} built or queued across ${kingdomName} will be removed too, and their bonuses stop immediately.`
      : `Delete ${b.name}?`;
    if (!window.confirm(warning)) return;
    setBusyId(b.id);
    try {
      await kingdomAPI.deleteCustomBuilding(kingdomId, b.id);
      pushToast(`Deleted ${b.name}`, 'success');
      await load();
      await onChanged();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Could not delete this building');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="kt-panel kt-ui kt-cb" data-tone="gold" style={catStyle('custom')}>
      <div className="kt-cs-top">
        <div className="kt-panel-header" style={{ marginBottom: 0 }}>
          <div className="kt-panel-icon" aria-hidden="true"><Icon name="crown" size={18} /></div>
          <div className="kt-panel-titles">
            <div className="kt-panel-title">Unique buildings</div>
            <div className="kt-panel-sub">Made by you for {kingdomName} alone, with their own production bonuses</div>
          </div>
        </div>
        <div className="kt-cs-actions">
          <button type="button" className="kt-ui-btn" data-variant="primary" onClick={() => setEditor({ building: null })}>
            <Icon name="plus" size={14} />
            New building
          </button>
        </div>
      </div>

      {loading && buildings.length === 0 ? (
        <p className="kt-ui-note">Loading…</p>
      ) : loadError ? (
        <EmptyNote title="Could not load unique buildings">{loadError}</EmptyNote>
      ) : buildings.length === 0 ? (
        <EmptyNote title="Nothing unique yet">
          Design a building only {kingdomName} can raise. It joins every fief's Build list under Kingdom Unique.
        </EmptyNote>
      ) : (
        <ul className="kt-cb-list" ref={listRef}>
          {buildings.map((b) => {
            const effects = getLaneEffects(b);
            const cost = Object.entries(b.cost || {}).filter(([, v]) => Number(v) > 0);
            const built = b.built_total || 0;
            const queued = b.queued_total || 0;
            return (
              <li key={b.id} className="kt-cb-item">
                <div className="kt-cb-item-main">
                  <div className="kt-cb-item-name">
                    <span>{b.name}</span>
                    <span className="kt-cb-item-meta">
                      Tier {b.tier_required} · {plural(b.days, 'day')}{b.max_per_fief > 0 ? ` · limit ${b.max_per_fief} per fief` : ''}
                    </span>
                  </div>
                  {b.description ? <p className="kt-cb-item-desc">{b.description}</p> : null}
                  {effects.length > 0 ? <LaneEffectChips effects={effects} /> : <p className="kt-cb-item-plain">No production effect.</p>}
                  <div className="kt-cs-costs" aria-label="Cost">
                    {cost.length === 0
                      ? <span className="kt-cs-cost" data-ok="true">Free to build</span>
                      : cost.map(([k, v]) => <span key={k} className="kt-cs-cost"><span className="kt-cs-cost-n">{v}</span> {k}</span>)}
                  </div>
                </div>
                <div className="kt-cb-item-side">
                  <div className="kt-cb-item-count" title="Copies standing and under construction across the kingdom">
                    <strong>{built}</strong> built{queued > 0 ? <> · <strong>{queued}</strong> queued</> : null}
                  </div>
                  <div className="kt-cb-item-actions">
                    <button type="button" className="kt-ui-btn kt-cb-act" data-variant="success" onClick={() => setGranting(b)} disabled={fiefs.length === 0}>
                      <Icon name="gift" size={13} />
                      Place
                    </button>
                    <button type="button" className="kt-ui-btn kt-cb-act" data-variant="ghost" onClick={() => setEditor({ building: b })}>
                      <Icon name="pencil" size={13} />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="kt-ui-btn kt-cb-act kt-cb-act-icon"
                      data-variant="danger"
                      onClick={() => remove(b)}
                      disabled={busyId === b.id}
                      aria-label={`Delete ${b.name}`}
                      title="Delete this building"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editor && (
        <BuildingEditor kingdomName={kingdomName} editing={editor.building} onSave={save} onClose={() => setEditor(null)} />
      )}
      {granting && (
        <GrantDialog building={granting} fiefs={fiefs} initialFiefId={currentFiefId} onGrant={grant} onClose={() => setGranting(null)} />
      )}
    </div>
  );
};

export default CustomBuildingsPanel;
