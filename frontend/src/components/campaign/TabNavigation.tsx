import React from 'react';

type CampaignTab = 'map' | 'scores' | 'combat' | 'battlefield' | 'news' | 'journal' | 'encyclopedia' | 'goals';

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
    { id: 'scores', label: 'Scores', icon: '🏆' },
    { id: 'combat', label: 'Combat', icon: '⚔️' },
    { id: 'battlefield', label: 'Battlefield', icon: '🏰' },
    { id: 'news', label: 'News', icon: '📰' },
    { id: 'journal', label: 'Journal', icon: '📖' },
    { id: 'encyclopedia', label: 'Encyclopedia', icon: '📚' },
    { id: 'goals', label: 'Goals', icon: '🎯' }
  ];

  return (
    <div className="campaign-topnav-tab-group">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`campaign-topnav-tab${activeTab === tab.id ? ' active' : ''}`}
        >
          {tab.icon} {tab.label}
          {tab.id === 'battlefield' && pendingInvitationsCount > 0 && (
            <span className="campaign-topnav-tab-badge">{pendingInvitationsCount}</span>
          )}
        </button>
      ))}
    </div>
  );
};

export default TabNavigation;
