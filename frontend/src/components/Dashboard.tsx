import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCampaign } from '../contexts/CampaignContext';
import { Campaign } from '../services/api';
import ConfirmationModal from './ConfirmationModal';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { 
    campaigns, 
    loadMyCampaigns, 
    loadAllCampaigns, 
    createCampaign, 
    deleteCampaign,
    checkCharacterInCampaign, 
    generateCampaignUrl,
    isLoading,
    error,
    clearError
  } = useCampaign();
  
  const [showAddCampaign, setShowAddCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDescription, setNewCampaignDescription] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; campaign: Campaign | null }>({
    isOpen: false,
    campaign: null
  });

  useEffect(() => {
    if (user?.role === 'Dungeon Master') {
      loadMyCampaigns();
    } else {
      loadAllCampaigns();
    }
  }, [user, loadMyCampaigns, loadAllCampaigns]);

  const handleLogout = () => {
    logout();
  };

  const handleAddCampaign = async () => {
    if (!newCampaignName.trim()) return;
    
    try {
      await createCampaign({
        name: newCampaignName.trim(),
        description: newCampaignDescription.trim()
      });
      setNewCampaignName('');
      setNewCampaignDescription('');
      setShowAddCampaign(false);
    } catch (error) {
      // Error is handled by the context
    }
  };

  const handleCampaignClick = async (campaign: Campaign, event?: React.MouseEvent) => {
    // Prevent navigation if clicking on delete button
    if (event && (event.target as HTMLElement).closest('.delete-btn')) {
      return;
    }
    
    const urlName = generateCampaignUrl(campaign.name);
    
    if (user?.role === 'Player') {
      try {
        const { hasCharacter } = await checkCharacterInCampaign(campaign.id);
        if (hasCharacter) {
          // Navigate to campaign with existing character
          navigate(`/campaign/${urlName}`);
        } else {
          // Navigate to character creation for this campaign
          navigate(`/campaign/${urlName}/create-character`);
        }
      } catch (error) {
        // Error is handled by the context
      }
    } else {
      // DM goes directly to campaign
      navigate(`/campaign/${urlName}`);
    }
  };

  const handleDeleteCampaign = (campaign: Campaign, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeleteModal({ isOpen: true, campaign });
  };

  const confirmDeleteCampaign = async () => {
    if (deleteModal.campaign) {
      try {
        await deleteCampaign(deleteModal.campaign.id);
        setDeleteModal({ isOpen: false, campaign: null });
      } catch (error) {
        // Error is handled by the context
      }
    }
  };

  const getRoleColorClass = (role: string): string => {
    return role === 'Dungeon Master' ? 'text-gold' : 'text-secondary';
  };

  const getRoleBadge = (role: string): string => {
    return role === 'Dungeon Master' ? '👑 DM' : '⚔️ Player';
  };

  return (
    <div className="container fade-in">
      <div className="dashboard-container">
        <div className="app-header">
          <h1 className="app-title">Welcome to Dungeon Lair</h1>
          <p className="app-subtitle">Your D&D Adventure Hub</p>
        </div>

        {user && (
          <div className="glass-panel primary">
            <h3>Welcome, {user.username}!</h3>
            <p>
              <strong>Role:</strong>{' '}
              <span className={getRoleColorClass(user.role)}>
                {getRoleBadge(user.role)} {user.role}
              </span>
            </p>
            <p>
              <strong>Email:</strong> {user.email}
            </p>
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <p>{error}</p>
            <button onClick={clearError} className="btn btn-secondary">
              Dismiss
            </button>
          </div>
        )}

        {user?.role === 'Dungeon Master' && (
          <div className="glass-panel success">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4>🎲 Your Campaigns</h4>
              <button
                onClick={() => setShowAddCampaign(true)}
                className="btn btn-primary"
                disabled={isLoading}
              >
                ➕ Add Campaign
              </button>
            </div>
            
            {showAddCampaign && (
              <div className="glass-panel info" style={{ marginBottom: '1rem' }}>
                <h5>Create New Campaign</h5>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Campaign Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    placeholder="Enter campaign name..."
                    required
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Description (Optional)</label>
                  <textarea
                    className="form-input"
                    value={newCampaignDescription}
                    onChange={(e) => setNewCampaignDescription(e.target.value)}
                    placeholder="Describe your campaign..."
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleAddCampaign}
                    className="btn btn-primary"
                    disabled={!newCampaignName.trim() || isLoading}
                  >
                    Create Campaign
                  </button>
                  <button
                    onClick={() => {
                      setShowAddCampaign(false);
                      setNewCampaignName('');
                      setNewCampaignDescription('');
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isLoading && <p className="text-center">Loading campaigns...</p>}
            
            {campaigns.length === 0 && !isLoading && (
              <p className="text-muted text-center">
                No campaigns yet. Create your first campaign to get started!
              </p>
            )}

            {campaigns.length > 0 && (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="glass-panel"
                    style={{ 
                      cursor: 'pointer', 
                      transition: 'all 0.3s ease',
                      border: '1px solid rgba(212, 193, 156, 0.3)',
                      position: 'relative'
                    }}
                    onClick={(e) => handleCampaignClick(campaign, e)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 0 20px rgba(212, 193, 156, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <h5 className="text-gold">{campaign.name}</h5>
                        {campaign.description && (
                          <p className="text-secondary" style={{ marginBottom: '0.5rem' }}>
                            {campaign.description}
                          </p>
                        )}
                        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                          Created: {new Date(campaign.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        className="delete-btn btn btn-danger"
                        onClick={(e) => handleDeleteCampaign(campaign, e)}
                        style={{
                          padding: '0.5rem',
                          minWidth: 'auto',
                          fontSize: '0.9rem',
                          marginLeft: '1rem'
                        }}
                        title="Delete Campaign"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-center text-muted" style={{ marginTop: '1.5rem' }}>
              <em>Click on a campaign to manage it and view players</em>
            </p>
          </div>
        )}

        {user?.role === 'Player' && (
          <div className="glass-panel info">
            <h4>⚔️ Available Campaigns</h4>
            <p style={{ marginBottom: '1.5rem' }}>
              Join campaigns and create your characters. Click on a campaign to join or continue your adventure!
            </p>

            {isLoading && <p className="text-center">Loading campaigns...</p>}
            
            {campaigns.length === 0 && !isLoading && (
              <p className="text-muted text-center">
                No campaigns available yet. Ask your Dungeon Master to create some campaigns!
              </p>
            )}

            {campaigns.length > 0 && (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="glass-panel"
                    style={{ 
                      cursor: 'pointer', 
                      transition: 'all 0.3s ease',
                      border: '1px solid rgba(212, 193, 156, 0.3)'
                    }}
                    onClick={(e) => handleCampaignClick(campaign, e)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 0 20px rgba(212, 193, 156, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                    }}
                  >
                    <h5 className="text-gold">{campaign.name}</h5>
                    {campaign.description && (
                      <p className="text-secondary" style={{ marginBottom: '0.5rem' }}>
                        {campaign.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                        DM: {campaign.dm_username}
                      </p>
                      <span className="text-gold" style={{ fontSize: '0.8rem' }}>
                        Click to join →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-center text-muted" style={{ marginTop: '1.5rem' }}>
              <em>Click on a campaign to join or continue your adventure</em>
            </p>
          </div>
        )}

        <div className="text-center mt-lg">
          <button
            onClick={handleLogout}
            className="btn btn-secondary"
          >
            Logout
          </button>
        </div>

        <div className="mt-lg text-center">
          <p className="text-muted">
            <em>
              "The adventure you're on is the adventure you're having."
            </em>
          </p>
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>
            - Unknown Wise Dungeon Master
          </p>
        </div>
      </div>

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, campaign: null })}
        onConfirm={confirmDeleteCampaign}
        title="Delete Campaign"
        message={`Are you sure you want to delete "${deleteModal.campaign?.name}"? This will permanently delete the campaign and all associated characters. This action cannot be undone.`}
        confirmText="Delete Campaign"
        cancelText="Cancel"
        isDangerous={true}
      />
    </div>
  );
};

export default Dashboard;