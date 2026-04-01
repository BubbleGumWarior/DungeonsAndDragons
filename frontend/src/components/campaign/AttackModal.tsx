import React, { useState } from 'react';

interface LimbAC {
  head: number;
  chest: number;
  left_arm: number;
  right_arm: number;
  left_leg: number;
  right_leg: number;
}

interface Combatant {
  characterId: string | number;
  name: string;
  isMonster?: boolean;
  monsterId?: number;
  monsterInstanceId?: number;
}

interface Props {
  attacker: Combatant;
  target: Combatant;
  targetLimbAC: LimbAC;
  targetLimbHealth?: Record<string, number>;
  targetLimbHealthMax?: Record<string, number>;
  mode?: 'damage' | 'heal';
  prefillDamage?: number;
  onConfirm: (params: {
    targetKey: string;
    targetType: 'character' | 'monster';
    targetName: string;
    limbName: string;
    attackRoll: number;
    damage: number;
    hit: boolean;
    attackerName: string;
  }) => void;
  onClose: () => void;
}

const LIMBS: { key: keyof LimbAC; label: string; color: string }[] = [
  { key: 'head',      label: 'Head',      color: '#fbbf24' },
  { key: 'chest',     label: 'Chest',     color: '#f87171' },
  { key: 'left_arm',  label: 'Left Arm',  color: '#60a5fa' },
  { key: 'right_arm', label: 'Right Arm', color: '#60a5fa' },
  { key: 'left_leg',  label: 'Left Leg',  color: '#a78bfa' },
  { key: 'right_leg', label: 'Right Leg', color: '#a78bfa' },
];

export const AttackModal: React.FC<Props> = ({ attacker, target, targetLimbAC, targetLimbHealth, targetLimbHealthMax, mode = 'damage', prefillDamage, onConfirm, onClose }) => {
  const [selectedLimb, setSelectedLimb] = useState<keyof LimbAC | null>(null);
  const [damage, setDamage] = useState<string>(prefillDamage !== undefined ? String(prefillDamage) : '');

  const isHeal = mode === 'heal';
  const damageNum = parseInt(damage, 10);

  const handleConfirm = () => {
    if (!selectedLimb || isNaN(damageNum)) return;
    onConfirm({
      targetKey: String(target.characterId),
      targetType: target.isMonster ? 'monster' : 'character',
      targetName: target.name,
      limbName: selectedLimb,
      attackRoll: 0,
      damage: damageNum,
      hit: true,
      attackerName: attacker.name,
    });
  };

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  };
  const modal: React.CSSProperties = {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '2px solid rgba(212,193,156,0.4)',
    borderRadius: '1rem', padding: '2rem', width: '600px', maxWidth: '95vw',
    maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h4 style={{ color: isHeal ? '#4ade80' : 'var(--text-gold)', margin: 0 }}>
            {isHeal ? `💚 ${attacker.name} heals ${target.name}` : `⚔️ ${attacker.name} attacks ${target.name}`}
          </h4>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#999', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
          {/* Body silhouette / limb selector */}
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>Select target limb:</p>
            <div style={{ position: 'relative', width: '160px', margin: '0 auto' }}>
              {/* SVG body silhouette */}
              <svg viewBox="0 0 100 240" style={{ width: '100%', userSelect: 'none' }}>
                {/* Head */}
                <ellipse cx="50" cy="20" rx="16" ry="18"
                  fill={selectedLimb === 'head' ? '#fbbf24' : 'rgba(212,193,156,0.15)'}
                  stroke={selectedLimb === 'head' ? '#fbbf24' : 'rgba(212,193,156,0.4)'}
                  strokeWidth="2" style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedLimb('head')} />
                <text x="50" y="23" textAnchor="middle" fontSize="7" fill="#fff" style={{ pointerEvents: 'none' }}>Head</text>
                {targetLimbAC.head !== undefined && (
                  <text x="50" y="32" textAnchor="middle" fontSize="6" fill="#fbbf24" style={{ pointerEvents: 'none' }}>AC {targetLimbAC.head}</text>
                )}

                {/* Neck */}
                <rect x="44" y="37" width="12" height="8" fill="rgba(212,193,156,0.1)" />

                {/* Torso / Chest */}
                <rect x="26" y="45" width="48" height="60" rx="4"
                  fill={selectedLimb === 'chest' ? '#f87171' : 'rgba(212,193,156,0.15)'}
                  stroke={selectedLimb === 'chest' ? '#f87171' : 'rgba(212,193,156,0.4)'}
                  strokeWidth="2" style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedLimb('chest')} />
                <text x="50" y="74" textAnchor="middle" fontSize="7" fill="#fff" style={{ pointerEvents: 'none' }}>Chest</text>
                {targetLimbAC.chest !== undefined && (
                  <text x="50" y="84" textAnchor="middle" fontSize="6" fill="#f87171" style={{ pointerEvents: 'none' }}>AC {targetLimbAC.chest}</text>
                )}

                {/* Left Arm */}
                <rect x="4" y="46" width="20" height="55" rx="6"
                  fill={selectedLimb === 'left_arm' ? '#60a5fa' : 'rgba(212,193,156,0.15)'}
                  stroke={selectedLimb === 'left_arm' ? '#60a5fa' : 'rgba(212,193,156,0.4)'}
                  strokeWidth="2" style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedLimb('left_arm')} />
                <text x="14" y="72" textAnchor="middle" fontSize="6" fill="#fff" style={{ pointerEvents: 'none' }}>L.Arm</text>
                {targetLimbAC.left_arm !== undefined && (
                  <text x="14" y="81" textAnchor="middle" fontSize="5.5" fill="#60a5fa" style={{ pointerEvents: 'none' }}>AC {targetLimbAC.left_arm}</text>
                )}

                {/* Right Arm */}
                <rect x="76" y="46" width="20" height="55" rx="6"
                  fill={selectedLimb === 'right_arm' ? '#60a5fa' : 'rgba(212,193,156,0.15)'}
                  stroke={selectedLimb === 'right_arm' ? '#60a5fa' : 'rgba(212,193,156,0.4)'}
                  strokeWidth="2" style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedLimb('right_arm')} />
                <text x="86" y="72" textAnchor="middle" fontSize="6" fill="#fff" style={{ pointerEvents: 'none' }}>R.Arm</text>
                {targetLimbAC.right_arm !== undefined && (
                  <text x="86" y="81" textAnchor="middle" fontSize="5.5" fill="#60a5fa" style={{ pointerEvents: 'none' }}>AC {targetLimbAC.right_arm}</text>
                )}

                {/* Left Leg */}
                <rect x="27" y="108" width="20" height="70" rx="6"
                  fill={selectedLimb === 'left_leg' ? '#a78bfa' : 'rgba(212,193,156,0.15)'}
                  stroke={selectedLimb === 'left_leg' ? '#a78bfa' : 'rgba(212,193,156,0.4)'}
                  strokeWidth="2" style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedLimb('left_leg')} />
                <text x="37" y="143" textAnchor="middle" fontSize="6" fill="#fff" style={{ pointerEvents: 'none' }}>L.Leg</text>
                {targetLimbAC.left_leg !== undefined && (
                  <text x="37" y="152" textAnchor="middle" fontSize="5.5" fill="#a78bfa" style={{ pointerEvents: 'none' }}>AC {targetLimbAC.left_leg}</text>
                )}

                {/* Right Leg */}
                <rect x="53" y="108" width="20" height="70" rx="6"
                  fill={selectedLimb === 'right_leg' ? '#a78bfa' : 'rgba(212,193,156,0.15)'}
                  stroke={selectedLimb === 'right_leg' ? '#a78bfa' : 'rgba(212,193,156,0.4)'}
                  strokeWidth="2" style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedLimb('right_leg')} />
                <text x="63" y="143" textAnchor="middle" fontSize="6" fill="#fff" style={{ pointerEvents: 'none' }}>R.Leg</text>
                {targetLimbAC.right_leg !== undefined && (
                  <text x="63" y="152" textAnchor="middle" fontSize="5.5" fill="#a78bfa" style={{ pointerEvents: 'none' }}>AC {targetLimbAC.right_leg}</text>
                )}
              </svg>
            </div>

            {/* Limb chip list */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center', marginTop: '0.5rem' }}>
              {LIMBS.map(l => {
                const curHp = targetLimbHealth?.[l.key];
                const maxHp = targetLimbHealthMax?.[l.key];
                const hpLabel = curHp !== undefined
                  ? (maxHp !== undefined ? ` | ${curHp}/${maxHp} HP` : ` | ${curHp} HP`)
                  : '';
                return (
                  <button key={l.key} onClick={() => setSelectedLimb(l.key)}
                    style={{
                      padding: '0.3rem 0.6rem', borderRadius: '0.5rem', fontSize: '0.75rem', cursor: 'pointer',
                      border: `1px solid ${l.color}`,
                      background: selectedLimb === l.key ? l.color : 'transparent',
                      color: selectedLimb === l.key ? '#000' : l.color,
                      fontWeight: selectedLimb === l.key ? 'bold' : 'normal',
                    }}>
                    {l.label} (AC {targetLimbAC[l.key] ?? '?'}{hpLabel})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Roll + Damage inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Damage / Heal Amount */}
            {(isHeal || !!selectedLimb) && (
              <div>
                <label style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                  {isHeal ? 'Heal Amount' : 'Damage'}
                </label>
                <input
                  type="number" min={0} value={damage}
                  onChange={e => setDamage(e.target.value)}
                  placeholder="e.g. 8"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.4rem', background: 'rgba(255,255,255,0.05)', border: `1px solid ${isHeal ? 'rgba(74,222,128,0.4)' : 'rgba(212,193,156,0.3)'}`, color: '#fff', fontSize: '1rem' }} />
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button onClick={onClose}
                style={{ flex: 1, padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '0.5rem', color: '#fff', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleConfirm}
                disabled={!selectedLimb || isNaN(damageNum)}
                style={{
                  flex: 2, padding: '0.6rem',
                  background: isHeal
                    ? ((!selectedLimb || isNaN(damageNum)) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#4ade80,#22c55e)')
                    : ((!selectedLimb || isNaN(damageNum)) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#f87171,#ef4444)'),
                  border: isHeal
                    ? ((!selectedLimb || isNaN(damageNum)) ? '1px solid rgba(255,255,255,0.1)' : '2px solid #22c55e')
                    : ((!selectedLimb || isNaN(damageNum)) ? '1px solid rgba(255,255,255,0.1)' : '2px solid #ef4444'),
                  borderRadius: '0.5rem', color: isHeal ? '#000' : '#fff',
                  cursor: (!selectedLimb || isNaN(damageNum)) ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold', fontSize: '0.95rem',
                }}>
                {isHeal
                  ? ((!selectedLimb || isNaN(damageNum)) ? 'Select Limb & Amount' : `💚 Heal ${damage || 0} HP`)
                  : ((!selectedLimb || isNaN(damageNum)) ? 'Select Limb & Amount' : `⚔️ Deal ${damage || 0} Damage`)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttackModal;
