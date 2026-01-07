import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCampaign } from '../contexts/CampaignContext';
import { Campaign, Character, campaignAPI } from '../services/api';
import ConfirmationModal from './ConfirmationModal';
import FigureImage from '../assets/images/Board/Figure.png';

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
  const [campaignCharacters, setCampaignCharacters] = useState<{ [key: number]: Character[] }>({});

  useEffect(() => {
    if (user?.role === 'Dungeon Master') {
      loadMyCampaigns();
    } else {
      loadAllCampaigns();
    }
  }, [user, loadMyCampaigns, loadAllCampaigns]);

  useEffect(() => {
    const fetchCampaignCharacters = async () => {
      const charactersData: { [key: number]: Character[] } = {};
      for (const campaign of campaigns) {
        try {
          const details = await campaignAPI.getById(campaign.id);
          charactersData[campaign.id] = details.characters;
        } catch (error) {
          console.error(`Failed to fetch characters for campaign ${campaign.id}`, error);
          charactersData[campaign.id] = [];
        }
      }
      setCampaignCharacters(charactersData);
    };

    if (campaigns.length > 0) {
      fetchCampaignCharacters();
    }
  }, [campaigns]);

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
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch' }}>
                      {/* Left Half - Description */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <h5 className="text-gold" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{campaign.name}</h5>
                        {campaign.description && (
                          <div className="text-secondary" style={{ marginBottom: '0.5rem', flex: 1, textAlign: 'left' }}>
                            {campaign.description.split('\n').map((paragraph, index) => (
                              paragraph.trim() && <p key={index} style={{ margin: '0.5rem 0', fontSize: '0.9rem', textAlign: 'left' }}>{paragraph}</p>
                            ))}
                          </div>
                        )}
                        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                          Created: {new Date(campaign.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Right Half - Characters */}
                      <div style={{ 
                        flex: 1, 
                        borderLeft: '1px solid rgba(212, 193, 156, 0.3)', 
                        paddingLeft: '1rem',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        <h6 className="text-gold" style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Party Members</h6>
                        <div style={{ 
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                          flex: 1
                        }}>
                          {campaignCharacters[campaign.id]?.map((character) => (
                            <div 
                              key={character.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.5rem',
                                background: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '8px',
                                border: '1px solid rgba(212, 193, 156, 0.2)'
                              }}
                            >
                              <img 
                                src={character.image_url || FigureImage} 
                                alt={character.name}
                                style={{
                                  width: '50px',
                                  height: '50px',
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  border: '2px solid rgba(212, 193, 156, 0.5)',
                                  flexShrink: 0
                                }}
                              />
                              <div style={{ flex: 1, textAlign: 'left' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                                  {character.name}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  Level {character.level} {character.class}
                                </div>
                              </div>
                            </div>
                          ))}
                          {(!campaignCharacters[campaign.id] || campaignCharacters[campaign.id].length === 0) && (
                            <p className="text-muted" style={{ fontSize: '0.75rem', gridColumn: '1 / -1' }}>
                              No characters yet
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Delete Button */}
                      <button
                        className="delete-btn btn btn-danger"
                        onClick={(e) => handleDeleteCampaign(campaign, e)}
                        style={{
                          padding: '0.5rem',
                          minWidth: 'auto',
                          fontSize: '0.9rem',
                          height: 'fit-content'
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
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      {/* Left Half - Description */}
                      <div style={{ flex: 1 }}>
                        <h5 className="text-gold" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{campaign.name}</h5>
                        {campaign.description && (
                          <div className="text-secondary" style={{ marginBottom: '0.5rem', textAlign: 'left' }}>
                            {campaign.description.split('\n').map((paragraph, index) => (
                              paragraph.trim() && <p key={index} style={{ margin: '0.5rem 0', fontSize: '0.9rem', textAlign: 'left' }}>{paragraph}</p>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                          <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                            DM: {campaign.dm_username}
                          </p>
                          <span className="text-gold" style={{ fontSize: '0.8rem' }}>
                            Click to join →
                          </span>
                        </div>
                      </div>

                      {/* Right Half - Characters */}
                      <div style={{ 
                        flex: 1, 
                        borderLeft: '1px solid rgba(212, 193, 156, 0.3)', 
                        paddingLeft: '1rem'
                      }}>
                        <h6 className="text-gold" style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Party Members</h6>
                        <div style={{ 
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem'
                        }}>
                          {campaignCharacters[campaign.id]?.map((character) => (
                            <div 
                              key={character.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.5rem',
                                background: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '8px',
                                border: '1px solid rgba(212, 193, 156, 0.2)'
                              }}
                            >
                              <img 
                                src={character.image_url || FigureImage} 
                                alt={character.name}
                                style={{
                                  width: '50px',
                                  height: '50px',
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  border: '2px solid rgba(212, 193, 156, 0.5)',
                                  flexShrink: 0
                                }}
                              />
                              <div style={{ flex: 1, textAlign: 'left' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                                  {character.name}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  Level {character.level} {character.class}
                                </div>
                              </div>
                            </div>
                          ))}
                          {(!campaignCharacters[campaign.id] || campaignCharacters[campaign.id].length === 0) && (
                            <p className="text-muted" style={{ fontSize: '0.75rem', gridColumn: '1 / -1' }}>
                              No characters yet
                            </p>
                          )}
                        </div>
                      </div>
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