import React, { useCallback, useEffect, useState } from 'react';
import { kingdomAPI, WonderEntry, WondersResponse } from '../../services/api';

type Toast = (message: string, tone?: 'error' | 'success' | 'info') => void;

const card: React.CSSProperties = { padding: '0.8rem', border: '1px solid rgba(var(--theme-accent-rgb),0.3)', borderRadius: '0.6rem', background: 'rgba(76,29,149,0.18)' };
const btn: React.CSSProperties = {
  padding: '0.4rem 0.75rem', borderRadius: '0.4rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
  border: '1px solid rgba(var(--theme-accent-rgb),0.5)', background: 'rgba(120,53,15,0.5)', color: 'var(--text-gold)',
};
const field: React.CSSProperties = {
  padding: '0.4rem 0.55rem', borderRadius: '0.4rem', border: '1px solid rgba(var(--theme-accent-rgb),0.3)',
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', fontSize: '0.85rem',
};

const COST_LABEL: Record<string, string> = {
  wood: 'Wood', stone: 'Stone', minerals: 'Iron', gold: 'Gold', planks: 'Planks', dressed_stone: 'Dressed Stone', steel: 'Steel', mana: 'Mana',
};

/** Shared loader + live refresh for both views. */
const useWonders = (campaignId: number, socket: any) => {
  const [data, setData] = useState<WondersResponse | null>(null);
  const load = useCallback(async () => {
    try { setData(await kingdomAPI.getWonders(campaignId)); } catch (_) { /* leave previous data */ }
  }, [campaignId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket) return undefined;
    const refresh = (d?: { campaignId?: number }) => {
      if (d?.campaignId != null && Number(d.campaignId) !== Number(campaignId)) return;
      load();
    };
    socket.on('wondersChanged', refresh);
    socket.on('dayAdvanced', refresh);
    return () => { socket.off('wondersChanged', refresh); socket.off('dayAdvanced', refresh); };
  }, [socket, campaignId, load]);
  return { data, load };
};

const statusLine = (w: WonderEntry) => {
  if (w.status === 'built') return `Built — ${w.holder}`;
  if (w.status === 'under_construction') return `Under construction — ${w.holder} (${w.days_remaining ?? '?'} days left)`;
  return 'Available';
};

/** Player view: which Wonders exist, and a Build button for the ones still free. Tier 10 fiefs only. */
export const PlayerWondersPanel: React.FC<{
  campaignId: number; fiefId: number; tier: number; socket: any; pushToast: Toast; onChanged: () => void;
}> = ({ campaignId, fiefId, tier, socket, pushToast, onChanged }) => {
  const { data, load } = useWonders(campaignId, socket);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  if (tier < 10 || !data) return null;

  const mine = data.wonders.find((w) => w.status !== 'available' && Number(w.fief_id) === fiefId);

  const build = async (w: WonderEntry) => {
    setBusyKey(w.key);
    try {
      await kingdomAPI.startWonder(fiefId, w.key);
      pushToast(`${w.name} construction has begun.`, 'success');
      await load();
      onChanged();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to start Wonder');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div style={card}>
      <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.3rem' }}>🏛️ Wonders</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.6rem' }}>
        Only one of each Wonder can exist in the campaign, and a fief can hold only one. Your DM decides what each one does.
        Building takes {data.build.days} days and costs {Object.entries(data.build.cost).map(([k, v]) => `${v.toLocaleString()} ${COST_LABEL[k] || k}`).join(', ')}.
      </div>
      {mine && <div style={{ color: '#86efac', fontSize: '0.85rem', marginBottom: '0.6rem' }}>This fief: {mine.name} ({mine.status === 'built' ? 'built' : 'under construction'}).</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {data.wonders.map((w) => (
          <div key={w.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.45rem 0.6rem', borderRadius: '0.4rem', background: 'rgba(255,255,255,0.03)' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{w.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{w.flavor}</div>
              <div style={{ color: w.status === 'available' ? '#93c5fd' : '#fcd34d', fontSize: '0.78rem' }}>{statusLine(w)}</div>
            </div>
            {w.status === 'available' && (
              <button
                disabled={Boolean(mine) || busyKey !== null}
                onClick={() => build(w)}
                title={mine ? 'This fief already has a Wonder' : undefined}
                style={{ ...btn, opacity: mine || busyKey ? 0.5 : 1, cursor: mine || busyKey ? 'not-allowed' : 'pointer' }}
              >
                {busyKey === w.key ? 'Starting…' : 'Build'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const DmNotes: React.FC<{ wonder: WonderEntry; pushToast: Toast; onSaved: () => void }> = ({ wonder, pushToast, onSaved }) => {
  const [text, setText] = useState(wonder.notes || '');
  useEffect(() => { setText(wonder.notes || ''); }, [wonder.notes, wonder.id]);
  const dirty = text !== (wonder.notes || '');
  return (
    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', alignItems: 'flex-start' }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={4000}
        placeholder="What does this Wonder do? (only you see this)"
        aria-label={`Notes for ${wonder.name}`}
        style={{ ...field, flex: 1, resize: 'vertical' }}
      />
      <button
        disabled={!dirty}
        onClick={async () => {
          try { await kingdomAPI.saveWonderNotes(Number(wonder.id), text); pushToast('Notes saved.', 'success'); onSaved(); }
          catch (e: any) { pushToast(e?.response?.data?.error || 'Failed to save notes'); }
        }}
        style={{ ...btn, opacity: dirty ? 1 : 0.5 }}
      >
        Save
      </button>
    </div>
  );
};

/** DM view: every Wonder in the campaign, plus Set as built / Destroy / Clear and private notes. */
export const DmWondersPanel: React.FC<{
  campaignId: number;
  socket: any;
  fiefOptions: Array<{ id: number; label: string }>;
  pushToast: Toast;
}> = ({ campaignId, socket, fiefOptions, pushToast }) => {
  const { data, load } = useWonders(campaignId, socket);
  const [open, setOpen] = useState(false);
  const [placeKey, setPlaceKey] = useState('');
  const [holderKind, setHolderKind] = useState<'fief' | 'npc'>('npc');
  const [fiefId, setFiefId] = useState('');
  const [npcName, setNpcName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); pushToast(ok, 'success'); await load(); } catch (e: any) { pushToast(e?.response?.data?.error || 'Something went wrong'); } finally { setBusy(false); }
  };

  const available = data.wonders.filter((w) => w.status === 'available');
  const canPlace = placeKey && (holderKind === 'npc' ? npcName.trim() : fiefId) && !busy;

  return (
    <div style={card}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', width: '100%', color: 'var(--text-gold)', fontWeight: 700, fontSize: '1.05rem' }}>
        <span>🏛️ Wonders (DM)</span><span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.wonders.map((w) => (
            <div key={w.key} style={{ padding: '0.5rem 0.6rem', borderRadius: '0.4rem', background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{w.name}</div>
                  <div style={{ color: w.status === 'available' ? '#93c5fd' : '#fcd34d', fontSize: '0.78rem' }}>{statusLine(w)}{w.is_npc ? ' · NPC' : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  {w.status === 'under_construction' && (
                    <button disabled={busy} style={btn} onClick={() => run(() => kingdomAPI.cancelWonder(Number(w.id)), 'Reservation cleared and cost refunded.')}>Clear</button>
                  )}
                  {w.status === 'built' && (
                    <button disabled={busy} style={{ ...btn, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.5)', background: 'transparent' }} onClick={() => run(() => kingdomAPI.destroyWonder(Number(w.id)), `${w.name} destroyed.`)}>Mark destroyed</button>
                  )}
                </div>
              </div>
              {w.status !== 'available' && w.id != null && <DmNotes wonder={w} pushToast={pushToast} onSaved={load} />}
            </div>
          ))}

          <div style={{ borderTop: '1px solid rgba(var(--theme-accent-rgb),0.2)', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem' }}>Set a Wonder as built</div>
            {available.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Every Wonder is in use. Destroy one to free it up.</div>
            ) : (
              <>
                <select aria-label="Wonder" value={placeKey} onChange={(e) => setPlaceKey(e.target.value)} style={field}>
                  <option value="">Choose a Wonder…</option>
                  {available.map((w) => <option key={w.key} value={w.key}>{w.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select aria-label="Holder type" value={holderKind} onChange={(e) => setHolderKind(e.target.value as 'fief' | 'npc')} style={field}>
                    <option value="npc">NPC kingdom</option>
                    <option value="fief">Player fief</option>
                  </select>
                  {holderKind === 'npc' ? (
                    <input aria-label="NPC kingdom name" value={npcName} onChange={(e) => setNpcName(e.target.value)} maxLength={120} placeholder="NPC kingdom name" style={{ ...field, flex: 1 }} />
                  ) : (
                    <select aria-label="Fief" value={fiefId} onChange={(e) => setFiefId(e.target.value)} style={{ ...field, flex: 1 }}>
                      <option value="">Choose a fief…</option>
                      {fiefOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  )}
                </div>
                <textarea aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes: what does it do? (optional, only you see this)" style={{ ...field, resize: 'vertical' }} />
                <div>
                  <button
                    disabled={!canPlace}
                    style={{ ...btn, opacity: canPlace ? 1 : 0.5, cursor: canPlace ? 'pointer' : 'not-allowed' }}
                    onClick={() => run(async () => {
                      await kingdomAPI.placeWonder(campaignId, holderKind === 'npc'
                        ? { wonderKey: placeKey, npcHolderName: npcName.trim(), notes }
                        : { wonderKey: placeKey, fiefId: Number(fiefId), notes });
                      setPlaceKey(''); setNpcName(''); setFiefId(''); setNotes('');
                    }, 'Wonder placed.')}
                  >
                    Set as built
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
