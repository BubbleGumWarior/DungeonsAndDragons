import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, authAPI } from '../services/api';
import ConfirmationModal from './ConfirmationModal';

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; user: User | null }>({
    isOpen: false,
    user: null
  });

  useEffect(() => {
    // Verify user is Dungeon Master
    if (user?.role !== 'Dungeon Master') {
      navigate('/');
      return;
    }

    fetchUsers();
  }, [user, navigate]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const response = await authAPI.getAllUsers();
      setUsers(response.users);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = (userToDelete: User) => {
    setDeleteModal({ isOpen: true, user: userToDelete });
  };

  const confirmDelete = async () => {
    if (!deleteModal.user) return;

    try {
      await authAPI.deleteUser(deleteModal.user.id);
      setUsers(users.filter(u => u.id !== deleteModal.user!.id));
      setDeleteModal({ isOpen: false, user: null });
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete user');
      setDeleteModal({ isOpen: false, user: null });
    }
  };

  return (
    <div className="container fade-in">
      <div className="dashboard-container">
        <div className="app-header">
          <button 
            onClick={() => navigate('/')} 
            className="btn btn-secondary"
            style={{ marginBottom: '1rem' }}
          >
            ← Back to Dashboard
          </button>
          <h1 className="app-title">👑 Admin Panel</h1>
          <p className="app-subtitle">User Management</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            <p>{error}</p>
            <button onClick={() => setError(null)} className="btn btn-secondary">
              Dismiss
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="glass-panel primary text-center">
            <p>Loading users...</p>
          </div>
        ) : (
          <div className="glass-panel primary">
            <h3>📋 Registered Users ({users.length})</h3>
            
            {users.length === 0 ? (
              <p className="text-muted text-center">No users found</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse',
                  marginTop: '1rem'
                }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--primary-gold)' }}>
                      <th style={{ 
                        padding: '0.75rem', 
                        textAlign: 'left', 
                        color: 'var(--primary-gold)',
                        fontWeight: 'bold'
                      }}>
                        ID
                      </th>
                      <th style={{ 
                        padding: '0.75rem', 
                        textAlign: 'left', 
                        color: 'var(--primary-gold)',
                        fontWeight: 'bold'
                      }}>
                        Username
                      </th>
                      <th style={{ 
                        padding: '0.75rem', 
                        textAlign: 'left', 
                        color: 'var(--primary-gold)',
                        fontWeight: 'bold'
                      }}>
                        Email
                      </th>
                      <th style={{ 
                        padding: '0.75rem', 
                        textAlign: 'left', 
                        color: 'var(--primary-gold)',
                        fontWeight: 'bold'
                      }}>
                        Role
                      </th>
                      <th style={{ 
                        padding: '0.75rem', 
                        textAlign: 'left', 
                        color: 'var(--primary-gold)',
                        fontWeight: 'bold'
                      }}>
                        Created
                      </th>
                      <th style={{ 
                        padding: '0.75rem', 
                        textAlign: 'center', 
                        color: 'var(--primary-gold)',
                        fontWeight: 'bold'
                      }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr 
                        key={u.id} 
                        style={{ 
                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                          backgroundColor: 'rgba(255, 255, 255, 0.02)'
                        }}
                      >
                        <td style={{ padding: '0.75rem' }}>{u.id}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <strong>{u.username}</strong>
                          {user?.id === u.id && (
                            <span style={{ marginLeft: '0.5rem', color: 'var(--primary-gold)', fontSize: '0.85rem' }}>
                              (You)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem' }}>{u.email}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ 
                            color: u.role === 'Dungeon Master' ? 'var(--primary-gold)' : 'var(--text-secondary)',
                            fontWeight: u.role === 'Dungeon Master' ? 'bold' : 'normal'
                          }}>
                            {u.role === 'Dungeon Master' ? '👑 DM' : '⚔️ Player'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>
                          {u.created_at && new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteClick(u)}
                            className="btn btn-danger"
                            disabled={user?.id === u.id}
                            style={{
                              fontSize: '0.85rem',
                              padding: '0.4rem 0.8rem',
                              opacity: user?.id === u.id ? 0.5 : 1,
                              cursor: user?.id === u.id ? 'not-allowed' : 'pointer'
                            }}
                          >
                            🗑️ Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        title="Delete User"
        message={`Are you sure you want to delete user "${deleteModal.user?.username}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={confirmDelete}
        onClose={() => setDeleteModal({ isOpen: false, user: null })}
      />
    </div>
  );
};

export default Admin;
