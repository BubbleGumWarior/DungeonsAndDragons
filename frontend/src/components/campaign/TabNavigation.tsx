import React from 'react';

type CampaignTab = 'map' | 'combat' | 'battlefield' | 'news' | 'journal' | 'encyclopedia';

interface TabNavigationProps {
  activeTab: CampaignTab;
  onTabChange: (tab: CampaignTab) => void;
  pendingInvitationsCount?: number;
}

const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
  pendingInvitationsCount = 0
}) => {
  const tabs: { id: CampaignTab; label: string; icon: string }[] = [
    { id: 'map', label: 'World Map', icon: '🗺️' },
    { id: 'combat', label: 'Combat', icon: '⚔️' },
    { id: 'battlefield', label: 'Battlefield', icon: '🏰' },
    { id: 'news', label: 'News', icon: '📰' },
    { id: 'journal', label: 'Journal', icon: '📖' },
    { id: 'encyclopedia', label: 'Encyclopedia', icon: '📚' }
  ];

  return (
    <div className="glass-panel" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: '0.625rem 1.25rem',
              background: activeTab === tab.id
                ? 'rgba(212, 193, 156, 0.3)'
                : 'rgba(255, 255, 255, 0.1)',
              border: activeTab === tab.id
                ? '2px solid var(--primary-gold)'
                : '1px solid rgba(212, 193, 156, 0.2)',
              borderRadius: '1.5rem',
              color: activeTab === tab.id ? 'var(--text-gold)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              transition: 'all var(--transition-normal)',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
              }
            }}
          >
            {tab.icon} {tab.label}
            
            {/* Show notification badge for battlefield tab if there are pending invitations */}
            {tab.id === 'battlefield' && pendingInvitationsCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: 'white',
                fontSize: '0.65rem',
                fontWeight: 'bold',
                padding: '0.2rem 0.5rem',
                borderRadius: '10px',
                minWidth: '20px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                border: '2px solid rgba(0, 0, 0, 0.3)'
              }}>
                {pendingInvitationsCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TabNavigation;
