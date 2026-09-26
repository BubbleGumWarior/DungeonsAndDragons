import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import '../../styles/constructionPanel.css';
import '../../styles/customBuildings.css';
import '../../styles/troopTree.css';
import { kingdomAPI, KingdomCustomBuilding, KingdomCustomBuildingInput, KingdomCustomUnit, KingdomCustomUnitInput } from '../../services/api';
import { BuildingEditor } from './CustomBuildingsPanel';
import { clampInt, EmptyNote, Icon, Stepper, Switch } from './kingdomUi';
import { descendantsOf, ROOT_ID, TreeIndex } from './troopTree';

interface CustomUnitEditorProps {
  kingdomId: number;
  kingdomName: string;
  // null = creating a new troop.
  editing: KingdomCustomUnit | null;
  // The troop the DM chose "Add branch" on; the new troop upgrades from it.
  presetParent: string | null;
  index: TreeIndex;
  onSaved: (message: string, savedName: string) => void | Promise<void>;
  onClose: () => void;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const CustomUnitEditor: React.FC<CustomUnitEditorProps> = ({ kingdomId, kingdomName, editing, presetParent, index, onSaved, onClose }) => {
  const [name, setName] = useState(editing?.name || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [parent, setParent] = useState<string>(editing?.parent_unit_type || presetParent || ROOT_ID);
  const [days, setDays] = useState(String(editing?.base_days || 10));
  const [needsBuilding, setNeedsBuilding] = useState(Boolean(editing?.requires_building));
  const [buildingId, setBuildingId] = useState<number | null>(editing?.custom_building_id ?? null);

  const [buildings, setBuildings] = useState<KingdomCustomBuilding[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [showBuildingEditor, setShowBuildingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    kingdomAPI.getCustomBuildings(kingdomId)
      .then((res) => { if (!cancelled) setBuildings(res.buildings || []); })
      .catch(() => { if (!cancelled) setBuildings([]); })
      .finally(() => { if (!cancelled) setBuildingsLoading(false); });
    return () => { cancelled = true; };
  }, [kingdomId]);

  // A troop cannot branch from itself or anything below it.
  const parentOptions = useMemo(() => {
    const blocked = editing ? new Set([editing.name, ...Array.from(descendantsOf(index, editing.name))]) : new Set<string>();
    const q = pickerQuery.trim().toLowerCase();
    return Array.from(index.byId.values())
      .filter((n) => !blocked.has(n.id))
      .filter((n) => !q || n.unit_type.toLowerCase().includes(q) || n.line_key.toLowerCase().includes(q))
      .sort((a, b) => Number(b.is_root) - Number(a.is_root) || a.line_key.localeCompare(b.line_key) || a.tier_index - b.tier_index);
  }, [index, editing, pickerQuery]);

  const parentNode = index.byId.get(parent);
  const selectedBuilding = buildings.find((b) => b.id === buildingId) || null;
  const canSave = name.trim().length >= 2 && !!parentNode && (!needsBuilding || buildingId != null) && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const payload: KingdomCustomUnitInput = {
      name: name.trim(),
      description: description.trim(),
      parentUnitType: parent,
      baseDays: clampInt(days, 1, 365),
      requiresBuilding: needsBuilding,
      customBuildingId: needsBuilding ? buildingId : null,
    };
    setSaving(true);
    setError(null);
    try {
      if (editing) await kingdomAPI.updateCustomUnit(kingdomId, editing.id, payload);
      else await kingdomAPI.createCustomUnit(kingdomId, payload);
      await onSaved(editing ? `Saved ${payload.name}` : `${payload.name} added to the troop tree`, payload.name);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save this troop. Check the fields and try again.');
      setSaving(false);
    }
  };

  // Piping a brand-new building straight into the requirement: create it, select it, and switch the requirement on.
  const createBuilding = async (payload: KingdomCustomBuildingInput): Promise<string | null> => {
    try {
      const res = await kingdomAPI.createCustomBuilding(kingdomId, payload);
      setBuildings((prev) => [...prev, res.building]);
      setBuildingId(res.building.id);
      setNeedsBuilding(true);
      setShowBuildingEditor(false);
      return null;
    } catch (err: any) {
      return err?.response?.data?.error || 'Could not create this building.';
    }
  };

  return (
    <>
      <Dialog.Root open onOpenChange={(open) => { if (!open && !showBuildingEditor) onClose(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="kt-cs-overlay kt-tt-overlay-top" />
          <Dialog.Content
            className="kt-cs-modal kt-cb-modal kt-tt-editor kt-ui"
            aria-describedby="kt-tt-editor-desc"
            onOpenAutoFocus={(e) => { e.preventDefault(); nameRef.current?.focus(); }}
          >
            <div className="kt-cs-modal-head">
              <div>
                <Dialog.Title className="kt-cs-modal-title">{editing ? `Edit ${editing.name}` : 'New troop'}</Dialog.Title>
                <Dialog.Description id="kt-tt-editor-desc" className="kt-cs-modal-sub">
                  Only {kingdomName} can train this. It appears in the troop tree and in Train up.
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
                    <input ref={nameRef} className="kt-cb-input" value={name} maxLength={40} placeholder="e.g. Emberguard" onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label className="kt-cb-field">
                    <span className="kt-cb-label">What they are</span>
                    <textarea
                      className="kt-cb-input kt-cb-textarea"
                      value={description}
                      maxLength={600}
                      rows={2}
                      placeholder="Shown to players when they select this troop in the tree."
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                </section>

                <section className="kt-cb-sec" aria-label="Place in the tree">
                  <div className="kt-cb-sec-head"><h4 className="kt-ui-h">Place in the tree</h4></div>
                  <div className="kt-cb-field">
                    <span className="kt-cb-label">Upgrades from</span>
                    <div className="kt-tt-parent">
                      <span className="kt-tt-parent-chip">
                        <strong>{parentNode?.unit_type || parent}</strong>
                        {parentNode && !parentNode.is_root ? <span className="kt-tt-parent-line">{parentNode.line_key}{parentNode.is_custom ? ' · custom' : ''}</span> : null}
                      </span>
                      <button type="button" className="kt-ui-btn kt-cb-act" data-variant="ghost" onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen}>
                        {pickerOpen ? 'Done' : 'Change'}
                      </button>
                    </div>
                    {pickerOpen && (
                      <div className="kt-tt-picker">
                        <label className="kt-cs-search">
                          <Icon name="search" size={15} />
                          <input type="search" value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Search troops" aria-label="Search troops" />
                        </label>
                        <ul className="kt-tt-picker-list" role="listbox" aria-label="Upgrades from">
                          {parentOptions.length === 0 ? (
                            <li className="kt-tt-picker-none">No troop matches.</li>
                          ) : parentOptions.map((n) => (
                            <li key={n.id} role="option" aria-selected={n.id === parent}>
                              <button
                                type="button"
                                className="kt-tt-picker-row"
                                data-selected={n.id === parent ? 'true' : undefined}
                                onClick={() => { setParent(n.id); setPickerOpen(false); setPickerQuery(''); }}
                              >
                                <span className="kt-tt-picker-name">{n.unit_type}</span>
                                <span className="kt-tt-picker-meta">{n.is_root ? 'Root of the tree' : `${n.line_key}${n.is_custom ? ' · custom' : ''}`}</span>
                                {n.id === parent ? <Icon name="check" size={14} /> : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="kt-cb-field">
                    <span className="kt-cb-label">Training time</span>
                    <Stepper size="sm" min={1} max={365} value={days} onChange={setDays} label="Training time in days" />
                    <span className="kt-cb-hint">days per batch, before any legendary speed bonus</span>
                  </div>
                </section>

                <section className="kt-cb-sec" aria-label="Requirements">
                  <div className="kt-cb-sec-head"><h4 className="kt-ui-h">Requirements</h4></div>
                  <Switch
                    checked={needsBuilding}
                    onChange={setNeedsBuilding}
                    label="Needs a building"
                    hint={needsBuilding ? 'Each fief must build its own copy before it can train this troop.' : 'Trainable as soon as the fief has troops to upgrade from.'}
                  />
                  {needsBuilding && (
                    <div className="kt-tt-req">
                      <span className="kt-cb-label" id="kt-tt-building-label">Unique building required</span>
                      {buildingsLoading ? (
                        <p className="kt-ui-note">Loading buildings…</p>
                      ) : buildings.length === 0 ? (
                        <EmptyNote title={`${kingdomName} has no unique buildings yet`}>Create one now and it will be selected for this troop.</EmptyNote>
                      ) : (
                        <div className="kt-tt-buildings" role="radiogroup" aria-labelledby="kt-tt-building-label">
                          {buildings.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              role="radio"
                              aria-checked={buildingId === b.id}
                              className="kt-tt-building"
                              data-selected={buildingId === b.id ? 'true' : undefined}
                              onClick={() => setBuildingId(b.id)}
                            >
                              <span className="kt-tt-building-name">{b.name}</span>
                              <span className="kt-tt-building-meta">Tier {b.tier_required} · {plural(b.days, 'day')}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div>
                        <button type="button" className="kt-ui-btn kt-cb-act" data-variant="ghost" onClick={() => setShowBuildingEditor(true)}>
                          <Icon name="plus" size={13} />
                          New building
                        </button>
                      </div>
                      {selectedBuilding && (
                        <p className="kt-cb-sec-note">
                          Players will need a finished <strong>{selectedBuilding.name}</strong> in a fief to train {name.trim() || 'this troop'} there.
                        </p>
                      )}
                    </div>
                  )}
                </section>
              </div>

              <div className="kt-cb-foot">
                {error ? <p className="kt-cb-error" role="alert">{error}</p> : <span />}
                <div className="kt-cb-foot-actions">
                  <button type="button" className="kt-ui-btn" data-variant="ghost" onClick={onClose}>Cancel</button>
                  <button type="submit" className="kt-ui-btn" data-variant="primary" disabled={!canSave}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Add troop'}
                  </button>
                </div>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {showBuildingEditor && (
        <BuildingEditor kingdomName={kingdomName} editing={null} onSave={createBuilding} onClose={() => setShowBuildingEditor(false)} />
      )}
    </>
  );
};

export default CustomUnitEditor;
