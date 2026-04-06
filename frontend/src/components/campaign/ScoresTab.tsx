import React, { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';

interface Player {
  id: number;
  username: string;
}

interface Character {
  id: number;
  player_id: number;
  name: string;
}

interface ScoreRow {
  inspiration: number;
  discouragement: number;
  wishes: number;
  anti_wishes: number;
}

type ScoreField = 'inspiration' | 'discouragement' | 'wishes' | 'anti_wishes';

interface Props {
  campaignId: number;
  players: Player[];
  characters: Character[];
  isDungeonMaster: boolean;
  socket: any;
}

const SCORE_FIELDS: { field: ScoreField; label: string; icon: string }[] = [
  { field: 'inspiration', label: 'Inspiration', icon: '✨' },
  { field: 'discouragement', label: 'Discouragement', icon: '💀' },
  { field: 'wishes', label: 'Wishes', icon: '⭐' },
  { field: 'anti_wishes', label: 'Anti-Wishes', icon: '🌑' },
];

const DEFAULT_SCORE: ScoreRow = { inspiration: 0, discouragement: 0, wishes: 0, anti_wishes: 0 };

const ScoresTab: React.FC<Props> = ({ campaignId, players, characters, isDungeonMaster, socket }) => {
  const [scores, setScores] = useState<Record<number, ScoreRow>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchScores = useCallback(async () => {
    try {
      const res = await api.get<{ scores: Array<{ player_id: number } & ScoreRow> }>(
        `/campaigns/${campaignId}/scores`
      );
      const map: Record<number, ScoreRow> = {};
      for (const row of res.data.scores) {
        map[row.player_id] = {
          inspiration: row.inspiration,
          discouragement: row.discouragement,
          wishes: row.wishes,
          anti_wishes: row.anti_wishes,
        };
      }
      setScores(map);
    } catch (err) {
      console.error('Failed to load campaign scores:', err);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  // Listen for real-time score updates from other clients
  useEffect(() => {
    if (!socket) return;
    const handleScoreUpdated = (data: { playerId: number; scores: ScoreRow }) => {
      setScores(prev => ({ ...prev, [data.playerId]: data.scores }));
    };
    socket.on('campaignScoreUpdated', handleScoreUpdated);
    return () => {
      socket.off('campaignScoreUpdated', handleScoreUpdated);
    };
  }, [socket]);

  const handleAdjust = async (playerId: number, field: ScoreField, delta: 1 | -1) => {
    const key = `${playerId}-${field}-${delta}`;
    setUpdating(key);

    // Optimistic update
    setScores(prev => {
      const current = prev[playerId] ?? DEFAULT_SCORE;
      return {
        ...prev,
        [playerId]: {
          ...current,
          [field]: Math.max(0, current[field] + delta),
        },
      };
    });

    try {
      const res = await api.put<{ score: ScoreRow }>(
        `/campaigns/${campaignId}/scores/${playerId}`,
        { field, delta }
      );
      const updated = res.data.score;
      setScores(prev => ({ ...prev, [playerId]: updated }));
      // Broadcast to all other clients in the campaign room
      if (socket) {
        socket.emit('campaignScoreUpdate', {
          campaignId,
          playerId,
          scores: updated,
        });
      }
    } catch (err) {
      console.error('Failed to update score:', err);
      // Revert optimistic update on error
      fetchScores();
    } finally {
      setUpdating(null);
    }
  };

  const getCharacterName = (playerId: number) => {
    const char = characters.find(c => Number(c.player_id) === playerId);
    return char ? char.name : '—';
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        Loading scores…
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        No players in this campaign yet.
      </div>
    );
  }

  return (
    <div className="glass-panel">
      <h5 style={{ color: 'var(--text-gold)', marginBottom: '1.5rem' }}>🏆 Campaign Scores</h5>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Player</th>
              <th style={thStyle}>Character</th>
              {SCORE_FIELDS.map(({ field, label, icon }) => (
                <th key={field} style={{ ...thStyle, minWidth: 130 }}>
                  {icon} {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map(player => {
              const row = scores[player.id] ?? DEFAULT_SCORE;
              return (
                <tr key={player.id} style={trStyle}>
                  <td style={tdStyle}>{player.username}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-gold)' }}>{getCharacterName(player.id)}</td>
                  {SCORE_FIELDS.map(({ field }) => {
                    const key = `${player.id}-${field}`;
                    return (
                      <td key={field} style={{ ...tdStyle, textAlign: 'center' }}>
                        {isDungeonMaster ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <button
                              onClick={() => handleAdjust(player.id, field, -1)}
                              disabled={updating !== null || row[field] === 0}
                              style={adjBtnStyle}
                              aria-label={`Decrease ${field} for ${player.username}`}
                            >
                              −
                            </button>
                            <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                              {updating?.startsWith(key) ? '…' : row[field]}
                            </span>
                            <button
                              onClick={() => handleAdjust(player.id, field, 1)}
                              disabled={updating !== null}
                              style={adjBtnStyle}
                              aria-label={`Increase ${field} for ${player.username}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                            {row[field]}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const thStyle: React.CSSProperties = {
  padding: '0.65rem 1rem',
  textAlign: 'left',
  color: 'var(--text-gold)',
  fontWeight: 700,
  fontSize: '0.85rem',
  borderBottom: '2px solid rgba(212, 193, 156, 0.3)',
  whiteSpace: 'nowrap',
};

const trStyle: React.CSSProperties = {
  borderBottom: '1px solid rgba(212, 193, 156, 0.1)',
};

const tdStyle: React.CSSProperties = {
  padding: '0.7rem 1rem',
  color: 'var(--text-secondary)',
  fontSize: '0.9rem',
};

const adjBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '0.35rem',
  border: '1px solid rgba(212, 193, 156, 0.4)',
  background: 'rgba(212, 193, 156, 0.08)',
  color: 'var(--text-gold)',
  fontWeight: 700,
  fontSize: '1rem',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  padding: 0,
  transition: 'background 0.15s',
};

export default ScoresTab;
