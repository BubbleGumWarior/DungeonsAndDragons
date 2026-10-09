import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { kingdomAPI, EspionageMission } from '../../services/api';
import { Stepper } from './kingdomUi';

/** Every rank of the spy line may be sent. Mirrors SPY_UNIT_TYPES in backend/utils/espionage.js. */
export const SPY_UNIT_TYPES = ['Spy', 'Master Spy'];

const spyCount = (spies: Record<string, number>) => Object.values(spies || {}).reduce((s, n) => s + Number(n || 0), 0);
const spyLabel = (spies: Record<string, number>) =>
  Object.entries(spies || {}).filter(([, n]) => Number(n) > 0).map(([t, n]) => `${n} ${t}`).join(', ');

const modalShell: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
};
const modalCard: React.CSSProperties = {
  background: 'var(--bg-secondary, #1c1917)', border: '1px solid rgba(var(--theme-accent-rgb),0.4)',
  borderRadius: '0.7rem', width: 'min(28rem, 100%)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem',
};
const buttonBase: React.CSSProperties = {
  padding: '0.5rem 0.9rem', borderRadius: '0.45rem', fontWeight: 700, cursor: 'pointer',
  border: '1px solid rgba(var(--theme-accent-rgb),0.5)', background: 'rgba(120,53,15,0.5)', color: 'var(--text-gold)',
};

/** The only thing a player gets to see about a mission: a bar and a message. */
const MissionRow: React.FC<{
  mission: EspionageMission;
  isDungeonMaster: boolean;
  busy: boolean;
  onRecall: (id: number) => void;
}> = ({ mission, isDungeonMaster, busy, onRecall }) => {
  const failed = mission.status === 'failed';
  const done = mission.status === 'stationed' || mission.status === 'returning' || mission.status === 'returned';
  const color = failed ? '#ef4444' : done ? '#22c55e' : '#f59e0b';
  const pct = Math.round(Math.max(0, Math.min(1, mission.progress)) * 100);

  let message: string | null = null;
  if (mission.status === 'pending') message = 'Awaiting the DM…';
  if (failed) message = 'Your spies were caught and killed.';
  if (mission.status === 'stationed') message = 'Mission successful. Your spies remain in place.';
  if (mission.status === 'returning') message = `Spies returning home — ${mission.return_days_remaining ?? 30} day(s) to go.`;
  if (mission.status === 'returned') message = 'Your spies have returned.';

  return (
    <div style={{ padding: '0.6rem 0.7rem', borderRadius: '0.5rem', border: `1px solid ${failed ? 'rgba(239,68,68,0.4)' : 'rgba(var(--theme-accent-rgb),0.2)'}`, background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>🕵️ {mission.target}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{spyLabel(mission.spies)}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Mission to ${mission.target}`}
        style={{ height: '0.7rem', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', margin: '0.5rem 0 0.35rem', overflow: 'hidden' }}
      >
        <div data-testid="espionage-bar" data-status={mission.status} style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s ease, background 0.3s ease' }} />
      </div>
      {message && <div style={{ color: failed ? '#fca5a5' : done ? '#86efac' : 'var(--text-secondary)', fontSize: '0.82rem' }}>{message}</div>}
      {isDungeonMaster && mission.days_total != null && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', marginTop: '0.2rem' }}>
          DM: {mission.days_total} days · {mission.success_rate}% · rolled {mission.outcome}
        </div>
      )}
      {mission.status === 'stationed' && (
        <button disabled={busy} onClick={() => onRecall(mission.id)} style={{ ...buttonBase, marginTop: '0.5rem', opacity: busy ? 0.6 : 1 }}>
          Recall spies (30 days)
        </button>
      )}
    </div>
  );
};

const RequestModal: React.FC<{
  unitReserves: Record<string, number>;
  busy: boolean;
  onSubmit: (target: string, spies: Record<string, number>) => void;
  onClose: () => void;
}> = ({ unitReserves, busy, onSubmit, onClose }) => {
  const [target, setTarget] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});

  const spies: Record<string, number> = {};
  for (const type of SPY_UNIT_TYPES) {
    const n = Math.max(0, Math.floor(Number(counts[type] || 0)));
    if (n > 0) spies[type] = n;
  }
  const total = spyCount(spies);
  const canSubmit = target.trim().length > 0 && total > 0 && !busy;

  return ReactDOM.createPortal(
    <div style={modalShell} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Request espionage">
        <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '1.05rem' }}>Request Espionage</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Target
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            maxLength={200}
            placeholder="Who or where are you spying on?"
            style={{ padding: '0.45rem 0.6rem', borderRadius: '0.4rem', border: '1px solid rgba(var(--theme-accent-rgb),0.3)', background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)' }}
          />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Spies to send (from your reserve)</div>
          {SPY_UNIT_TYPES.map((type) => {
            const available = Math.max(0, Math.floor(Number(unitReserves[type] || 0)));
            return (
              <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-primary)' }}>{type} <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>({available} available)</span></span>
                <Stepper
                  label={`${type} to send`}
                  value={counts[type] ?? '0'}
                  min={0}
                  max={available}
                  disabled={available === 0}
                  onChange={(v) => setCounts((c) => ({ ...c, [type]: v }))}
                  size="sm"
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button onClick={onClose} style={{ ...buttonBase, background: 'transparent', color: 'var(--text-muted)' }}>Cancel</button>
          <button disabled={!canSubmit} onClick={() => onSubmit(target.trim(), spies)} style={{ ...buttonBase, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
            {busy ? 'Sending…' : total > 0 ? `Send ${total} ${total === 1 ? 'spy' : 'spies'}` : 'Send spies'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

interface PanelProps {
  fiefId: number;
  tier: number;
  isDungeonMaster: boolean;
  unitReserves: Record<string, number>;
  socket: any;
  campaignId: number;
  onChanged: () => void;
  pushToast: (message: string, tone?: 'error' | 'success' | 'info') => void;
}

/** Tier 7+ espionage section of a fief: request button + one progress bar per mission. */
export const EspionagePanel: React.FC<PanelProps> = ({ fiefId, tier, isDungeonMaster, unitReserves, socket, campaignId, onChanged, pushToast }) => {
  const [missions, setMissions] = useState<EspionageMission[]>([]);
  const [showRequest, setShowRequest] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await kingdomAPI.getEspionage(fiefId);
      setMissions(data.missions || []);
    } catch (_) {
      // Panel is optional; keep whatever was last shown.
    }
  }, [fiefId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return undefined;
    const refresh = (data?: { campaignId?: number }) => {
      if (data?.campaignId != null && Number(data.campaignId) !== Number(campaignId)) return;
      load();
    };
    socket.on('espionageChanged', refresh);
    socket.on('dayAdvanced', refresh);
    return () => {
      socket.off('espionageChanged', refresh);
      socket.off('dayAdvanced', refresh);
    };
  }, [socket, campaignId, load]);

  if (tier < 7) return null;

  const submit = async (target: string, spies: Record<string, number>) => {
    setBusy(true);
    try {
      await kingdomAPI.requestEspionage(fiefId, { target, spies });
      setShowRequest(false);
      pushToast('Espionage request sent to the DM.', 'success');
      await load();
      onChanged();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to request espionage');
    } finally {
      setBusy(false);
    }
  };

  const recall = async (missionId: number) => {
    setBusy(true);
    try {
      await kingdomAPI.recallSpies(fiefId, missionId);
      await load();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Failed to recall spies');
    } finally {
      setBusy(false);
    }
  };

  const visible = missions.slice(0, 10);
  const hasSpies = SPY_UNIT_TYPES.some((t) => Number(unitReserves[t] || 0) > 0);

  return (
    <div style={{ padding: '0.8rem', border: '1px solid rgba(var(--theme-accent-rgb),0.3)', borderRadius: '0.6rem', background: 'rgba(30,27,75,0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '1.05rem' }}>🕵️ Espionage</div>
        {!isDungeonMaster && (
          <button onClick={() => setShowRequest(true)} disabled={!hasSpies} title={hasSpies ? undefined : 'You have no spies in reserve'} style={{ ...buttonBase, opacity: hasSpies ? 1 : 0.5, cursor: hasSpies ? 'pointer' : 'not-allowed' }}>
            Request Espionage
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No missions yet. Train spies, then send them out.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {visible.map((m) => <MissionRow key={m.id} mission={m} isDungeonMaster={isDungeonMaster} busy={busy} onRecall={recall} />)}
        </div>
      )}
      {showRequest && <RequestModal unitReserves={unitReserves} busy={busy} onSubmit={submit} onClose={() => setShowRequest(false)} />}
    </div>
  );
};

/**
 * DM-side inbox: opens a modal for the oldest pending request. The DM sets the days and success
 * rate; the player never sees either.
 */
export const EspionageDmInbox: React.FC<{
  campaignId: number;
  socket: any;
  pushToast: (message: string, tone?: 'error' | 'success' | 'info') => void;
}> = ({ campaignId, socket, pushToast }) => {
  const [pending, setPending] = useState<EspionageMission[]>([]);
  const [days, setDays] = useState('10');
  const [rate, setRate] = useState('50');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await kingdomAPI.getCampaignEspionage(campaignId);
      setPending((data.missions || []).filter((m) => m.status === 'pending'));
    } catch (_) {
      // Nothing to show if the request fails.
    }
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return undefined;
    const refresh = (data?: { campaignId?: number }) => {
      if (data?.campaignId != null && Number(data.campaignId) !== Number(campaignId)) return;
      load();
    };
    socket.on('espionageChanged', refresh);
    return () => { socket.off('espionageChanged', refresh); };
  }, [socket, campaignId, load]);

  const current = pending[0];
  // Reset the form for each new request.
  useEffect(() => { setDays('10'); setRate('50'); }, [current?.id]);
  if (!current) return null;

  const daysNum = Math.floor(Number(days));
  const rateNum = Number(rate);
  const valid = Number.isFinite(daysNum) && daysNum >= 1 && Number.isFinite(rateNum) && rateNum >= 0 && rateNum <= 100;

  const act = async (fn: () => Promise<unknown>, okMessage: string) => {
    setBusy(true);
    try {
      await fn();
      pushToast(okMessage, 'success');
      await load();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return ReactDOM.createPortal(
    <div style={modalShell}>
      <div style={modalCard} role="dialog" aria-label="Espionage request">
        <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '1.05rem' }}>🕵️ Espionage request{pending.length > 1 ? ` (1 of ${pending.length})` : ''}</div>
        <div style={{ color: 'var(--text-primary)' }}>
          <strong>{current.kingdom_name || 'A player'}</strong> wants to send <strong>{spyCount(current.spies)}</strong> spies ({spyLabel(current.spies)}) to <strong>{current.target}</strong>.
        </div>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Days it will take
          <Stepper label="Days" value={days} onChange={setDays} min={1} max={3650} size="sm" />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Success rate
          <Stepper label="Success rate" value={rate} onChange={setRate} min={0} max={100} suffix="%" size="sm" />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button disabled={busy} onClick={() => act(() => kingdomAPI.cancelEspionage(current.id), 'Request declined — spies returned.')} style={{ ...buttonBase, background: 'transparent', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.5)' }}>
            Decline
          </button>
          <button disabled={busy || !valid} onClick={() => act(() => kingdomAPI.approveEspionage(current.id, { days: daysNum, successRate: rateNum }), 'Mission started.')} style={{ ...buttonBase, opacity: valid && !busy ? 1 : 0.5 }}>
            Submit
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
