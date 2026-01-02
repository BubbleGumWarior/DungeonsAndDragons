import React from 'react';
import { calculateCharacterHealth } from '../../utils/characterUtils';

interface Character {
  id: number;
  name: string;
  level: number;
  race: string;
  class: string;
  limb_health: any;
  [key: string]: any;
}

interface CharacterListProps {
  characters: Character[];
  selectedCharacter: number | null;
  onSelectCharacter: (id: number) => void;
  isKeyboardNavigating?: boolean;
}

const CharacterList: React.FC<CharacterListProps> = ({
  characters,
  selectedCharacter,
  onSelectCharacter,
  isKeyboardNavigating = false
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {characters.map((character) => {
        const health = calculateCharacterHealth(character);
        const healthColor = health.percentage > 50
          ? '#28a745'
          : health.percentage > 25
          ? '#ffc107'
          : '#dc3545';

        return (
          <button
            key={character.id}
            onClick={() => onSelectCharacter(character.id)}
            style={{
              padding: '0.75rem',
              background: selectedCharacter === character.id
                ? 'rgba(212, 193, 156, 0.2)'
                : 'rgba(255, 255, 255, 0.08)',
              border: selectedCharacter === character.id
                ? '2px solid var(--primary-gold)'
                : '1px solid rgba(212, 193, 156, 0.2)',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'all var(--transition-normal)',
              boxShadow: selectedCharacter === character.id && isKeyboardNavigating
                ? '0 0 20px rgba(212, 193, 156, 0.6)'
                : selectedCharacter === character.id
                ? '0 0 10px rgba(212, 193, 156, 0.3)'
                : 'none',
              textAlign: 'left',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem'
            }}
            onMouseEnter={(e) => {
              if (selectedCharacter !== character.id) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedCharacter !== character.id) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(212, 193, 156, 0.2)';
              }
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="text-gold" style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                {character.name}
              </div>
              {characters.length > 1 && selectedCharacter === character.id && (
                <div style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  backgroundColor: 'rgba(212, 193, 156, 0.1)',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(212, 193, 156, 0.2)'
                }}>
                  {characters.findIndex(c => c.id === character.id) + 1}/{characters.length}
                </div>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Lvl {character.level} {character.race} {character.class}
            </div>

            {/* Health Bar and Status */}
            <div style={{ marginTop: '0.5rem' }}>
              {/* Health Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.25rem'
              }}>
                {/* Status Icon */}
                <div style={{
                  fontSize: '1rem',
                  filter: '❤️'
                }} title={'Alive'}>
                  ❤️
                </div>

                {/* Health Bar Background */}
                <div style={{
                  flex: 1,
                  height: '12px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid rgba(212, 193, 156, 0.3)',
                  position: 'relative'
                }}>
                  {/* Health Bar Fill */}
                  <div style={{
                    width: `${health.percentage}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${healthColor} 0%, ${healthColor}dd 100%)`,
                    transition: 'width 0.3s ease',
                    boxShadow: `0 0 8px ${healthColor}88`
                  }} />

                  {/* Health Text Overlay */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.65rem',
                    fontWeight: 'bold',
                    color: '#fff',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
                    pointerEvents: 'none'
                  }}>
                    {health.current}/{health.max}
                  </div>
                </div>
              </div>

              {/* Health Percentage */}
              <div style={{
                fontSize: '0.65rem',
                color: healthColor,
                textAlign: 'right',
                fontWeight: 'bold'
              }}>
                {health.percentage.toFixed(0)}% HP
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default CharacterList;
