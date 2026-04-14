import React, { useState } from 'react';

interface OnlinePlayer {
  userId: number;
  characterName: string;
}

interface GrantKingdomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGrant: (
    targetPlayerId: number,
    availableResources: { wood: number; animals: number; fertile_ground: number; stone: number; minerals: number },
    waterAccess: boolean,
    buildableLand: number
  ) => void;
  onlinePlayers: OnlinePlayer[];
}

const DEFAULT_RESOURCES = { wood: 50, animals: 50, fertile_ground: 50, stone: 50, minerals: 50 };

const GrantKingdomModal: React.FC<GrantKingdomModalProps> = ({ isOpen, onClose, onGrant, onlinePlayers }) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [resources, setResources] = useState({ ...DEFAULT_RESOURCES });
  const [waterAccess, setWaterAccess] = useState(false);
  const [buildableLand, setBuildableLand] = useState(100);

  if (!isOpen) return null;

  const handleGrant = () => {
    if (selectedPlayerId === null) return;
    onGrant(selectedPlayerId, resources, waterAccess, buildableLand);
    // Reset state
    setSelectedPlayerId(null);
    setResources({ ...DEFAULT_RESOURCES });
    setWaterAccess(false);
    setBuildableLand(100);
    onClose();
  };

  const resourceLabels: Record<keyof typeof DEFAULT_RESOURCES, string> = {
    wood: 'Wood',
    animals: 'Animals',
    fertile_ground: 'Fertile Ground',
    stone: 'Stone',
    minerals: 'Minerals',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="glass-panel"
        style={{ minWidth: 420, maxWidth: 560, width: '100%', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h4 style={{ color: 'var(--text-gold)', margin: 0 }}>👑 Grant a Kingdom</h4>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Player selection */}
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select Player</p>
          {onlinePlayers.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.9rem' }}>No players currently online.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {onlinePlayers.map((p) => (
                <label
                  key={p.userId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer',
                    padding: '0.5rem 0.75rem', borderRadius: '6px',
                    background: selectedPlayerId === p.userId ? 'rgba(212,193,156,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${selectedPlayerId === p.userId ? 'rgba(212,193,156,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="grant-player"
                    value={p.userId}
                    checked={selectedPlayerId === p.userId}
                    onChange={() => setSelectedPlayerId(p.userId)}
                    style={{ accentColor: '#f59e0b' }}
                  />
                  <span style={{ color: 'var(--text-primary)' }}>{p.characterName}</span>
                  <span style={{ color: '#64748b', fontSize: '0.8rem', marginLeft: 'auto' }}>uid:{p.userId}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Resource sliders */}
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.65rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Land Quality (0–100%)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {(Object.keys(DEFAULT_RESOURCES) as (keyof typeof DEFAULT_RESOURCES)[]).map((key) => (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 40px', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{resourceLabels[key]}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={resources[key]}
                  onChange={(e) => setResources((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                  style={{ accentColor: '#f59e0b' }}
                />
                <span style={{ color: 'var(--text-gold)', fontSize: '0.9rem', textAlign: 'right' }}>{resources[key]}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Water access */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={waterAccess}
              onChange={(e) => setWaterAccess(e.target.checked)}
              style={{ accentColor: '#f59e0b', width: 16, height: 16 }}
            />
            <span>Water Access</span>
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>(allows docks in future)</span>
          </label>
        </div>

        {/* Buildable land */}
        <div style={{ marginBottom: '1.75rem' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.4rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Buildable Land</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              type="number"
              min={1}
              max={1000}
              value={buildableLand}
              onChange={(e) => setBuildableLand(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
              style={{
                width: 90, padding: '0.45rem 0.6rem',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(212,193,156,0.4)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.95rem',
              }}
            />
            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>max buildings (1–1000)</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '0.55rem 1.25rem', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#94a3b8', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleGrant}
            disabled={selectedPlayerId === null}
            style={{
              padding: '0.55rem 1.5rem',
              background: selectedPlayerId !== null ? '#f59e0b' : '#555',
              border: 'none', borderRadius: 6,
              color: '#000', fontWeight: 'bold', cursor: selectedPlayerId !== null ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
          >
            Grant Kingdom
          </button>
        </div>
      </div>
    </div>
  );
};

export default GrantKingdomModal;
