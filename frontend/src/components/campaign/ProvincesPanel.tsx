import React, { useCallback, useEffect, useState } from 'react';
import { kingdomAPI, Province, ProvincesResponse } from '../../services/api';
import { Stepper } from './kingdomUi';

type Toast = (message: string, tone?: 'error' | 'success' | 'info') => void;

const card: React.CSSProperties = { padding: '0.8rem', border: '1px solid rgba(var(--theme-accent-rgb),0.3)', borderRadius: '0.6rem', background: 'rgba(6,78,59,0.18)' };
const btn: React.CSSProperties = {
  padding: '0.4rem 0.75rem', borderRadius: '0.4rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
  border: '1px solid rgba(var(--theme-accent-rgb),0.5)', background: 'rgba(120,53,15,0.5)', color: 'var(--text-gold)',
};
const field: React.CSSProperties = {
  padding: '0.4rem 0.55rem', borderRadius: '0.4rem', border: '1px solid rgba(var(--theme-accent-rgb),0.3)',
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', fontSize: '0.85rem',
};
const COST_LABEL: Record<string, string> = { wood: 'wood', stone: 'stone', minerals: 'iron', gold: 'gold', steel: 'steel', planks: 'planks', dressed_stone: 'dressed stone' };

const loyaltyColor = (n: number) => (n >= 60 ? '#22c55e' : n >= 35 ? '#f59e0b' : '#ef4444');
const loyaltyWord = (n: number) => (n >= 60 ? 'Loyal' : n >= 35 ? 'Restless' : n >= 15 ? 'Unhappy' : 'About to break away');

const ProvinceCard: React.FC<{
  province: Province;
  data: ProvincesResponse;
  isDungeonMaster: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}> = ({ province, data, isDungeonMaster, busy, run }) => {
  const [tribute, setTribute] = useState(String(province.tribute_pct));
  const [governor, setGovernor] = useState(province.governor_name);
  const [move, setMove] = useState('10');
  const [loyaltyEdit, setLoyaltyEdit] = useState(String(Math.round(province.loyalty)));
  useEffect(() => { setTribute(String(province.tribute_pct)); }, [province.tribute_pct]);
  useEffect(() => { setGovernor(province.governor_name); }, [province.governor_name]);
  useEffect(() => { setLoyaltyEdit(String(Math.round(province.loyalty))); }, [province.loyalty]);

  const gone = province.status !== 'active';
  const t = province.tribute_per_day;
  const moveNum = Math.max(1, Math.floor(Number(move) || 1));

  return (
    <div style={{ padding: '0.7rem', borderRadius: '0.5rem', border: `1px solid ${gone ? 'rgba(239,68,68,0.4)' : 'rgba(var(--theme-accent-rgb),0.2)'}`, background: 'rgba(255,255,255,0.03)', opacity: gone ? 0.7 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>🏞️ {province.name}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{province.population.toLocaleString()} people</div>
      </div>

      {gone ? (
        <div style={{ color: '#fca5a5', fontSize: '0.85rem', margin: '0.4rem 0' }}>This province has broken away.</div>
      ) : (
        <>
          <div role="progressbar" aria-valuenow={Math.round(province.loyalty)} aria-valuemin={0} aria-valuemax={100} aria-label={`${province.name} loyalty`}
            style={{ height: '0.6rem', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', margin: '0.5rem 0 0.25rem', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(0, Math.min(100, province.loyalty))}%`, height: '100%', background: loyaltyColor(province.loyalty), transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ color: loyaltyColor(province.loyalty), fontSize: '0.8rem', fontWeight: 600 }}>
            Loyalty: {loyaltyWord(province.loyalty)}
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · drifting toward {Math.round(province.loyalty_target)}</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0.3rem 0 0.6rem' }}>
            Sends you each day: {t.food.toFixed(1)} food, {t.gold.toFixed(1)} gold, {t.wood.toFixed(1)} wood{t.research > 0 ? `, ${t.research.toFixed(1)} research` : ''}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: '0.7rem' }}>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Tribute (share of its output sent to you)</div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <Stepper label={`${province.name} tribute`} value={tribute} onChange={setTribute} min={0} max={100} step={5} suffix="%" size="sm" />
                <button disabled={busy || Number(tribute) === province.tribute_pct} style={{ ...btn, opacity: busy || Number(tribute) === province.tribute_pct ? 0.5 : 1 }}
                  onClick={() => run(() => kingdomAPI.updateProvince(province.id, { tributePct: Number(tribute) }), 'Tribute updated.')}>Set</button>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.2rem' }}>Higher tribute means less loyalty.</div>
            </div>

            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Governor</div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <input aria-label={`${province.name} governor`} value={governor} onChange={(e) => setGovernor(e.target.value)} maxLength={80} placeholder="Name (empty = none)" style={{ ...field, flex: 1, minWidth: '8rem' }} />
                <select aria-label={`${province.name} governor type`} value={province.governor_bonus} disabled={!province.governor_name}
                  onChange={(e) => run(() => kingdomAPI.updateProvince(province.id, { governorBonus: e.target.value }))} style={field}>
                  <option value="">No specialty</option>
                  {Object.entries(data.config.governorBonuses).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.blurb})</option>)}
                </select>
                <button disabled={busy || governor.trim() === province.governor_name} style={{ ...btn, opacity: busy || governor.trim() === province.governor_name ? 0.5 : 1 }}
                  onClick={() => run(() => kingdomAPI.updateProvince(province.id, { governorName: governor.trim() }), governor.trim() ? 'Governor appointed.' : 'Governor dismissed.')}>
                  {governor.trim() ? 'Appoint' : 'Dismiss'}
                </button>
              </div>
              {!province.governor_name && <div style={{ color: '#fcd34d', fontSize: '0.72rem', marginTop: '0.2rem' }}>No governor: half the tribute and lower loyalty.</div>}
            </div>

            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Move people ({data.free_adults} free adults at home)</div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <Stepper label="People to move" value={move} onChange={setMove} min={1} max={data.config.populationCap} step={10} size="sm" />
                <button disabled={busy} style={btn} onClick={() => run(() => kingdomAPI.transferProvincePopulation(province.id, moveNum))}>Send there</button>
                <button disabled={busy} style={btn} onClick={() => run(() => kingdomAPI.transferProvincePopulation(province.id, -moveNum))}>Bring home</button>
              </div>
            </div>

            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Improvements</div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {Object.entries(data.config.improvements).map(([kind, def]) => {
                  const level = Number(province.improvements[kind] || 0);
                  const maxed = level >= data.config.improvementMaxLevel;
                  const cost = def.base * (level + 1);
                  return (
                    <button key={kind} disabled={busy || maxed} title={def.blurb} style={{ ...btn, opacity: busy || maxed ? 0.55 : 1, cursor: maxed ? 'default' : 'pointer' }}
                      onClick={() => run(() => kingdomAPI.improveProvince(province.id, kind), `${def.label} improved.`)}>
                      {def.label} {level}/{data.config.improvementMaxLevel}{maxed ? '' : ` · ${cost.toLocaleString()}g`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {isDungeonMaster && (
        <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(var(--theme-accent-rgb),0.25)', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>DM</span>
          {!gone && (
            <>
              <Stepper label={`${province.name} loyalty`} value={loyaltyEdit} onChange={setLoyaltyEdit} min={0} max={100} step={5} size="sm" />
              <button disabled={busy} style={btn} onClick={() => run(() => kingdomAPI.dmEditProvince(province.id, { loyalty: Number(loyaltyEdit) }), 'Loyalty set.')}>Set loyalty</button>
            </>
          )}
          <button disabled={busy} style={btn} onClick={() => run(() => kingdomAPI.dmEditProvince(province.id, { status: gone ? 'active' : 'seceded' }), gone ? 'Province restored.' : 'Province has broken away.')}>
            {gone ? 'Restore' : 'Break away'}
          </button>
        </div>
      )}
    </div>
  );
};

/** Tier 9 fief section: found provinces, move people into them, appoint governors, set tribute. */
export const ProvincesPanel: React.FC<{
  fiefId: number;
  tier: number;
  campaignId: number;
  isDungeonMaster: boolean;
  socket: any;
  pushToast: Toast;
  onChanged: () => void;
}> = ({ fiefId, tier, campaignId, isDungeonMaster, socket, pushToast, onChanged }) => {
  const [data, setData] = useState<ProvincesResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [people, setPeople] = useState('50');

  const load = useCallback(async () => {
    try { setData(await kingdomAPI.getProvinces(fiefId)); } catch (_) { /* keep previous */ }
  }, [fiefId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket) return undefined;
    const refresh = (d?: { campaignId?: number }) => {
      if (d?.campaignId != null && Number(d.campaignId) !== Number(campaignId)) return;
      load();
    };
    socket.on('provincesChanged', refresh);
    socket.on('dayAdvanced', refresh);
    return () => { socket.off('provincesChanged', refresh); socket.off('dayAdvanced', refresh); };
  }, [socket, campaignId, load]);

  if (tier < 9 || !data) return null;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) pushToast(ok, 'success');
      await load();
      onChanged();
    } catch (e: any) {
      pushToast(e?.response?.data?.error || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const activeCount = data.provinces.filter((p) => p.status === 'active').length;
  const full = activeCount >= data.config.maxProvinces;
  const cost = Object.entries(data.config.foundingCost).map(([k, v]) => `${v.toLocaleString()} ${COST_LABEL[k] || k}`).join(', ');
  const peopleNum = Math.max(1, Math.floor(Number(people) || 1));
  const canFound = !busy && !full && name.trim().length > 0 && peopleNum <= data.free_adults;

  return (
    <div style={card}>
      <div style={{ color: 'var(--text-gold)', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.3rem' }}>🏞️ Provinces ({activeCount}/{data.config.maxProvinces})</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.6rem' }}>
        Move people out of a crowded fief into provinces run by governors. They send you a share of what they make, but a province that is taxed too hard, or has no governor, can break away.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {data.provinces.map((p) => <ProvinceCard key={p.id} province={p} data={data} isDungeonMaster={isDungeonMaster} busy={busy} run={run} />)}
      </div>

      {!isDungeonMaster && !full && (
        <div style={{ marginTop: '0.8rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(var(--theme-accent-rgb),0.2)' }}>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.3rem' }}>Found a new province</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginBottom: '0.4rem' }}>Costs {cost}. You have {data.free_adults} free adults at home.</div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input aria-label="Province name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Province name" style={{ ...field, flex: 1, minWidth: '10rem' }} />
            <Stepper label="Settlers" value={people} onChange={setPeople} min={1} max={Math.max(1, Math.min(data.config.populationCap, data.free_adults))} step={10} size="sm" />
            <button disabled={!canFound} style={{ ...btn, opacity: canFound ? 1 : 0.5, cursor: canFound ? 'pointer' : 'not-allowed' }}
              onClick={() => run(async () => { await kingdomAPI.foundProvince(fiefId, { name: name.trim(), population: peopleNum }); setName(''); }, 'Province founded.')}>
              Found
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
