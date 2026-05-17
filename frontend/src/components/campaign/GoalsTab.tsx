import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import api from '../../services/api';

interface CampaignGoal {
  id: number;
  campaign_id: number;
  title: string;
  description: string;
  reward: string | null;
  completed_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface Character {
  id: number;
  name: string;
}

interface Props {
  campaignId: number;
  isDungeonMaster: boolean;
  characters: Character[];
  socket: any;
}

type Filter = 'all' | 'outstanding' | 'completed';

const GoalsTab: React.FC<Props> = ({ campaignId, isDungeonMaster, characters, socket }) => {
  const [goals, setGoals] = useState<CampaignGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  // Add goal modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGoalData, setNewGoalData] = useState({ title: '', description: '', reward: '' });
  const [addSaving, setAddSaving] = useState(false);

  // Complete goal modal
  const [completeModal, setCompleteModal] = useState<{ open: boolean; goalId: number | null }>({ open: false, goalId: null });
  const [selectedCharacterName, setSelectedCharacterName] = useState('');
  const [customName, setCustomName] = useState('');
  const [useCustomName, setUseCustomName] = useState(false);
  const [completeSaving, setCompleteSaving] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await api.get<CampaignGoal[]>(`/campaigns/${campaignId}/goals`);
      setGoals(res.data);
    } catch (error) {
      console.error('Error fetching goals:', error);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return;

    const onCreated = ({ goal }: { goal: CampaignGoal }) => {
      setGoals(prev => {
        const updated = [...prev, goal];
        return updated.sort((a, b) => a.title.localeCompare(b.title));
      });
    };

    const onUpdated = ({ goal }: { goal: CampaignGoal }) => {
      setGoals(prev => prev.map(g => (g.id === goal.id ? goal : g)));
    };

    const onDeleted = ({ goalId }: { goalId: number }) => {
      setGoals(prev => prev.filter(g => g.id !== goalId));
    };

    socket.on('campaignGoalCreated', onCreated);
    socket.on('campaignGoalUpdated', onUpdated);
    socket.on('campaignGoalDeleted', onDeleted);

    return () => {
      socket.off('campaignGoalCreated', onCreated);
      socket.off('campaignGoalUpdated', onUpdated);
      socket.off('campaignGoalDeleted', onDeleted);
    };
  }, [socket]);

  const filteredGoals = goals.filter(g => {
    if (filter === 'outstanding') return g.completed_by_name === null;
    if (filter === 'completed') return g.completed_by_name !== null;
    return true;
  });

  const handleAddGoal = async () => {
    if (!newGoalData.title.trim() || !newGoalData.description.trim()) return;
    setAddSaving(true);
    try {
      await api.post(`/campaigns/${campaignId}/goals`, {
        title: newGoalData.title.trim(),
        description: newGoalData.description.trim(),
        reward: newGoalData.reward.trim() || null,
      });
      setNewGoalData({ title: '', description: '', reward: '' });
      setShowAddModal(false);
      // Socket will update the list; also fetch to be safe
      fetchGoals();
    } catch (error) {
      console.error('Error creating goal:', error);
    } finally {
      setAddSaving(false);
    }
  };

  const handleDelete = async (goalId: number) => {
    try {
      await api.delete(`/campaigns/${campaignId}/goals/${goalId}`);
      setDeleteConfirm(null);
      fetchGoals();
    } catch (error) {
      console.error('Error deleting goal:', error);
    }
  };

  const handleComplete = async () => {
    if (!completeModal.goalId) return;
    const name = useCustomName ? customName.trim() : selectedCharacterName;
    if (!name) return;
    setCompleteSaving(true);
    try {
      await api.patch(`/campaigns/${campaignId}/goals/${completeModal.goalId}/complete`, {
        completed_by_name: name,
      });
      setCompleteModal({ open: false, goalId: null });
      setSelectedCharacterName('');
      setCustomName('');
      setUseCustomName(false);
      fetchGoals();
    } catch (error) {
      console.error('Error completing goal:', error);
    } finally {
      setCompleteSaving(false);
    }
  };

  const handleUncomplete = async (goalId: number) => {
    try {
      await api.patch(`/campaigns/${campaignId}/goals/${goalId}/uncomplete`);
      fetchGoals();
    } catch (error) {
      console.error('Error uncompleting goal:', error);
    }
  };

  const openCompleteModal = (goalId: number) => {
    const defaultName = characters?.[0]?.name ?? '';
    setSelectedCharacterName(defaultName);
    setCustomName('');
    setUseCustomName(false);
    setCompleteModal({ open: true, goalId });
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        Loading goals...
      </div>
    );
  }

  return (
    <div className="glass-panel">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h5 style={{ color: 'var(--text-gold)', margin: 0 }}>🎯 Campaign Goals</h5>
        {isDungeonMaster && (
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            + Add Goal
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['all', 'outstanding', 'completed'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: `1px solid ${filter === f ? '#f59e0b' : 'rgba(255,255,255,0.15)'}`,
              background: filter === f ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
              color: filter === f ? 'var(--text-gold)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: filter === f ? 'bold' : 'normal',
              textTransform: 'capitalize',
              transition: 'all 0.15s',
            }}
          >
            {f === 'all' && `All (${goals.length})`}
            {f === 'outstanding' && `Outstanding (${goals.filter(g => !g.completed_by_name).length})`}
            {f === 'completed' && `Completed (${goals.filter(g => g.completed_by_name).length})`}
          </button>
        ))}
      </div>

      {/* Goals list */}
      {filteredGoals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          {filter === 'all' ? 'No goals yet.' : `No ${filter} goals.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredGoals.map(goal => {
            const isComplete = goal.completed_by_name !== null;
            return (
              <div
                key={goal.id}
                style={{
                  position: 'relative',
                  background: isComplete
                    ? 'rgba(16,185,129,0.06)'
                    : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${isComplete ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.35)'}`,
                  borderLeft: `4px solid ${isComplete ? '#10b981' : '#f59e0b'}`,
                  borderRadius: '8px',
                  padding: '1rem 1.25rem',
                  opacity: isComplete ? 0.72 : 1,
                }}
              >
                {/* Title row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: 'bold',
                        color: isComplete ? '#6ee7b7' : 'var(--text-gold)',
                        textDecoration: isComplete ? 'line-through' : 'none',
                        opacity: isComplete ? 0.8 : 1,
                      }}
                    >
                      {goal.title}
                    </span>
                    {isComplete && (
                      <span
                        style={{
                          marginLeft: '10px',
                          fontSize: '11px',
                          background: 'rgba(16,185,129,0.25)',
                          color: '#6ee7b7',
                          border: '1px solid rgba(16,185,129,0.4)',
                          borderRadius: '10px',
                          padding: '1px 8px',
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✓ Completed by {goal.completed_by_name}
                      </span>
                    )}
                  </div>

                  {/* DM controls */}
                  {isDungeonMaster && (
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                      {isComplete ? (
                        <button
                          onClick={() => handleUncomplete(goal.id)}
                          title="Mark as outstanding"
                          style={{
                            fontSize: '11px',
                            padding: '3px 10px',
                            background: 'rgba(245,158,11,0.2)',
                            border: '1px solid rgba(245,158,11,0.4)',
                            borderRadius: '5px',
                            color: 'var(--text-gold)',
                            cursor: 'pointer',
                          }}
                        >
                          ↩ Reopen
                        </button>
                      ) : (
                        <button
                          onClick={() => openCompleteModal(goal.id)}
                          title="Mark as complete"
                          style={{
                            fontSize: '11px',
                            padding: '3px 10px',
                            background: 'rgba(16,185,129,0.2)',
                            border: '1px solid rgba(16,185,129,0.4)',
                            borderRadius: '5px',
                            color: '#6ee7b7',
                            cursor: 'pointer',
                          }}
                        >
                          ✓ Complete
                        </button>
                      )}
                      {deleteConfirm === goal.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(goal.id)}
                            style={{
                              fontSize: '11px',
                              padding: '3px 10px',
                              background: 'rgba(239,68,68,0.35)',
                              border: '1px solid rgba(239,68,68,0.6)',
                              borderRadius: '5px',
                              color: '#fff',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              background: 'rgba(75,85,99,0.3)',
                              border: '1px solid rgba(107,114,128,0.4)',
                              borderRadius: '5px',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                            }}
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(goal.id)}
                          title="Delete goal"
                          style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            background: 'rgba(239,68,68,0.15)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '5px',
                            color: '#fca5a5',
                            cursor: 'pointer',
                          }}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Description */}
                <p
                  style={{
                    margin: '0.5rem 0 0',
                    fontSize: '13px',
                    color: isComplete ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.75)',
                    lineHeight: '1.5',
                  }}
                >
                  {goal.description}
                </p>

                {/* Reward */}
                {goal.reward && (
                  <div
                    style={{
                      marginTop: '0.6rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      background: 'rgba(251,191,36,0.12)',
                      border: '1px solid rgba(251,191,36,0.3)',
                      borderRadius: '10px',
                      padding: '2px 10px',
                      color: '#fde68a',
                    }}
                  >
                    🏆 {goal.reward}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Goal Modal ── */}
      {showAddModal && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '2rem 1rem',
            overflowY: 'auto',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div
            style={{
              background: 'var(--bg-panel, #1a1a2e)',
              border: '1px solid rgba(245,158,11,0.4)',
              borderRadius: '12px',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <h5 style={{ color: 'var(--text-gold)', marginTop: 0, marginBottom: '1.25rem' }}>🎯 New Campaign Goal</h5>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Goal Title <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  type="text"
                  value={newGoalData.title}
                  onChange={e => setNewGoalData(d => ({ ...d, title: e.target.value }))}
                  placeholder="Enter goal title..."
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Description <span style={{ color: '#f87171' }}>*</span>
                </label>
                <textarea
                  value={newGoalData.description}
                  onChange={e => setNewGoalData(d => ({ ...d, description: e.target.value }))}
                  placeholder="Describe the goal..."
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '90px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Reward <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={newGoalData.reward}
                  onChange={e => setNewGoalData(d => ({ ...d, reward: e.target.value }))}
                  placeholder="e.g. 500 gold, magic item..."
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => { setShowAddModal(false); setNewGoalData({ title: '', description: '', reward: '' }); }}
                style={cancelBtnStyle}
              >
                Cancel
              </button>
              <button
                onClick={handleAddGoal}
                disabled={addSaving || !newGoalData.title.trim() || !newGoalData.description.trim()}
                style={{
                  ...confirmBtnStyle,
                  opacity: (!newGoalData.title.trim() || !newGoalData.description.trim()) ? 0.5 : 1,
                  cursor: (!newGoalData.title.trim() || !newGoalData.description.trim()) ? 'not-allowed' : 'pointer',
                }}
              >
                {addSaving ? 'Creating...' : 'Create Goal'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Mark Complete Modal ── */}
      {completeModal.open && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '2rem 1rem',
            overflowY: 'auto',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setCompleteModal({ open: false, goalId: null }); }}
        >
          <div
            style={{
              background: 'var(--bg-panel, #1a1a2e)',
              border: '1px solid rgba(16,185,129,0.4)',
              borderRadius: '12px',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <h5 style={{ color: '#6ee7b7', marginTop: 0, marginBottom: '1.25rem' }}>✓ Mark Goal Complete</h5>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Select the character who completed this goal:
            </p>

            {characters && characters.length > 0 && !useCustomName && (
              <div style={{ marginBottom: '0.75rem' }}>
                <select
                  value={selectedCharacterName}
                  onChange={e => setSelectedCharacterName(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {characters.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={useCustomName}
                  onChange={e => setUseCustomName(e.target.checked)}
                />
                Enter a custom name instead
              </label>
              {useCustomName && (
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="Enter name..."
                  style={{ ...inputStyle, marginTop: '0.5rem' }}
                />
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCompleteModal({ open: false, goalId: null })}
                style={cancelBtnStyle}
              >
                Cancel
              </button>
              <button
                onClick={handleComplete}
                disabled={completeSaving || (!useCustomName && !selectedCharacterName) || (useCustomName && !customName.trim())}
                style={{
                  ...confirmBtnStyle,
                  background: 'rgba(16,185,129,0.35)',
                  borderColor: 'rgba(16,185,129,0.6)',
                  color: '#6ee7b7',
                }}
              >
                {completeSaving ? 'Saving...' : 'Mark Complete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px',
  padding: '8px 12px',
  color: '#fff',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'rgba(75,85,99,0.3)',
  border: '1px solid rgba(107,114,128,0.4)',
  borderRadius: '6px',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: '13px',
};

const confirmBtnStyle: React.CSSProperties = {
  padding: '8px 18px',
  background: 'rgba(245,158,11,0.35)',
  border: '1px solid rgba(245,158,11,0.6)',
  borderRadius: '6px',
  color: 'var(--text-gold)',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold',
};

export default GoalsTab;
