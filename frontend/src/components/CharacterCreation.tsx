import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCampaign } from '../contexts/CampaignContext';
import { characterAPI, D5eReferenceData } from '../services/api';

interface CharacterData {
  name: string;
  race: string;
  class: string;
  background: string;
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  skills: string[];
  equipment: string[];
  spells: string[];
  backstory: string;
  personality_traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  usedRandomClass: boolean;
}

const CharacterCreation: React.FC = () => {
  const { campaignName } = useParams<{ campaignName: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentCampaign, loadCampaign, createCharacter } = useCampaign();

  const [referenceData, setReferenceData] = useState<D5eReferenceData | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Random class selection state
  const [randomClasses, setRandomClasses] = useState<string[]>([]);
  
  // Point buy system state
  const basePoints = 27; // Standard D&D 5e point buy
  const [bonusPoints, setBonusPoints] = useState(0); // +4 for random class selection

  const [characterData, setCharacterData] = useState<CharacterData>({
    name: '',
    race: '',
    class: '',
    background: '',
    abilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    skills: [],
    equipment: [],
    spells: [],
    backstory: '',
    personality_traits: '',
    ideals: '',
    bonds: '',
    flaws: '',
    usedRandomClass: false
  });

  const totalSteps = 6;

  // Point buy cost calculation (D&D 5e rules)
  const getPointCost = (score: number): number => {
    if (score <= 13) return score - 8;
    if (score === 14) return 7;
    if (score === 15) return 9;
    return 0;
  };

  // Calculate total points spent
  const calculatePointsSpent = (): number => {
    return Object.values(characterData.abilities).reduce((total, score) => total + getPointCost(score), 0);
  };

  // Get available points (base + bonus for random class)
  const getAvailablePoints = (): number => {
    return basePoints + bonusPoints;
  };

  // Handle random class selection
  const selectRandomClass = (className: string): void => {
    setCharacterData(prev => ({ ...prev, class: className, usedRandomClass: true }));
    setBonusPoints(4); // Award bonus points for random selection
  };

  // Handle manual class selection
  const selectManualClass = (className: string): void => {
    setCharacterData(prev => ({ ...prev, class: className, usedRandomClass: false }));
    setBonusPoints(0); // No bonus points for manual selection
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        if (campaignName) {
          await loadCampaign(campaignName);
        }
        const refData = await characterAPI.getReferenceData();
        setReferenceData(refData);
        
        // Check for saved random classes in localStorage first
        const savedRandomClasses = localStorage.getItem('dnd-random-classes');
        if (savedRandomClasses) {
          try {
            const parsedClasses = JSON.parse(savedRandomClasses);
            if (Array.isArray(parsedClasses) && parsedClasses.length === 3) {
              setRandomClasses(parsedClasses);
              return; // Don't generate new ones if we have saved ones
            }
          } catch (e) {
            // If parsing fails, generate new ones
            console.warn('Failed to parse saved random classes, generating new ones');
          }
        }
        
        // Generate new random classes if none saved or parsing failed
        if (refData?.classes) {
          const shuffled = [...refData.classes].sort(() => Math.random() - 0.5);
          const selected = shuffled.slice(0, 3).map(c => c.name);
          setRandomClasses(selected);
          
          // Save to localStorage
          localStorage.setItem('dnd-random-classes', JSON.stringify(selected));
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load character creation data');
      }
    };
    loadData();
  }, [campaignName, loadCampaign]);

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleAbilityChange = (ability: keyof CharacterData['abilities'], value: number) => {
    // Check if the new point allocation is valid
    const newAbilities = { ...characterData.abilities, [ability]: value };
    const newTotal = Object.values(newAbilities).reduce((total, score) => total + getPointCost(score), 0);
    
    if (newTotal <= getAvailablePoints()) {
      setCharacterData(prev => ({
        ...prev,
        abilities: newAbilities
      }));
    }
  };

  const handleSkillToggle = (skill: string) => {
    setCharacterData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill]
    }));
  };

  const calculateHitPoints = () => {
    if (!characterData.class || !referenceData) return 8;
    const classData = referenceData.classes.find(c => c.name === characterData.class);
    const conModifier = Math.floor((characterData.abilities.con - 10) / 2);
    return (classData?.hitDie || 8) + conModifier;
  };

  const calculateArmorClass = () => {
    const dexModifier = Math.floor((characterData.abilities.dex - 10) / 2);
    // Base AC (10) + Dex modifier, more complex armor calculations could be added
    return 10 + dexModifier;
  };

  const handleSubmit = async () => {
    if (!currentCampaign) {
      setError('Campaign not found');
      return;
    }

    try {
      setIsLoading(true);
      await createCharacter({
        campaign_id: currentCampaign.campaign.id,
        name: characterData.name,
        race: characterData.race,
        class: characterData.class,
        background: characterData.background,
        level: 1,
        hit_points: calculateHitPoints(),
        armor_class: calculateArmorClass(),
        abilities: characterData.abilities,
        skills: characterData.skills,
        equipment: [], // Start with no equipment - can be added later
        spells: characterData.spells,
        backstory: characterData.backstory,
        personality_traits: characterData.personality_traits,
        ideals: characterData.ideals,
        bonds: characterData.bonds,
        flaws: characterData.flaws
      });

      // Clear saved random classes so next character gets new random options
      localStorage.removeItem('dnd-random-classes');

      navigate(`/campaign/${campaignName}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create character');
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return characterData.class.trim().length > 0; // Class selection
      case 2: return characterData.name.trim().length > 0 && characterData.race && characterData.background; // Name, race, background
      case 3: return true; // Point buy - always allow proceeding even with default stats
      case 4: return true; // Skills - optional
      case 5: return true; // Backstory - optional
      case 6: return true; // Final review
      default: return false;
    }
  };

  if (!referenceData || !currentCampaign) {
    return (
      <div className="container fade-in">
        <div className="dashboard-container">
          <div className="app-header">
            <h1 className="app-title">Creating Character...</h1>
          </div>
          <div className="glass-panel info">
            <p className="text-center">Loading character creation tools...</p>
          </div>
        </div>
      </div>
    );
  }

  if (user?.role !== 'Player') {
    return (
      <div className="container fade-in">
        <div className="dashboard-container">
          <div className="app-header">
            <h1 className="app-title">Access Denied</h1>
          </div>
          <div className="alert alert-error">
            <p>Only players can create characters.</p>
            <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container fade-in">
      <div className="dashboard-container">
        <div className="app-header">
          <h1 className="app-title">Create Character</h1>
          <p className="app-subtitle">
            For {currentCampaign.campaign.name} - Step {currentStep} of {totalSteps}
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <p>{error}</p>
            <button onClick={() => setError(null)} className="btn btn-secondary">
              Dismiss
            </button>
          </div>
        )}

        {/* Progress Bar */}
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map(step => (
              <div
                key={step}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: step <= currentStep ? 'var(--primary-gold)' : 'rgba(255, 255, 255, 0.2)',
                  color: step <= currentStep ? 'var(--primary-black)' : 'var(--text-secondary)',
                  fontWeight: 'bold'
                }}
              >
                {step}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Class Selection */}
        {currentStep === 1 && (
          <div className="glass-panel primary">
            <h3>⚔️ Choose Your Class</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', minHeight: '500px' }}>
              {/* Left side: All classes */}
              <div>
                <h4 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>All Classes</h4>
                <div style={{ maxHeight: '450px', overflowY: 'auto', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                  {referenceData?.classes.map(charClass => (
                    <div
                      key={charClass.name}
                      onClick={() => selectManualClass(charClass.name)}
                      style={{
                        padding: '1rem',
                        marginBottom: '0.5rem',
                        backgroundColor: characterData.class === charClass.name && !characterData.usedRandomClass 
                          ? 'rgba(212, 193, 156, 0.2)' 
                          : 'rgba(255, 255, 255, 0.03)',
                        border: characterData.class === charClass.name && !characterData.usedRandomClass 
                          ? '2px solid var(--primary-gold)' 
                          : '1px solid rgba(212, 193, 156, 0.1)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (characterData.class !== charClass.name || characterData.usedRandomClass) {
                          e.currentTarget.style.backgroundColor = 'rgba(212, 193, 156, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (characterData.class !== charClass.name || characterData.usedRandomClass) {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                        }
                      }}
                    >
                      <div style={{ fontWeight: 'bold', color: 'var(--text-gold)', marginBottom: '0.5rem' }}>
                        {charClass.name}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Hit Die: d{charClass.hitDie} | Primary: {charClass.primaryAbility.join(', ').toUpperCase()}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Choose any class you want to play
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right side: Random selection */}
              <div>
                <h4 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>
                  Random Selection <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>(+4 Points in Point Buy!)</span>
                </h4>
                <div style={{ padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                  <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Take a chance! Pick one of these three randomly selected classes and earn +4 bonus points for your ability scores.
                  </p>
                  
                  <div style={{ 
                    marginBottom: '1rem', 
                    padding: '0.75rem', 
                    backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                    borderRadius: '6px',
                    border: '1px solid rgba(212, 193, 156, 0.2)'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-gold)', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                      ℹ️ Your Random Classes
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      These three classes are saved for this character creation session. You'll get new random options when you create your next character.
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {randomClasses.map(className => {
                      const classData = referenceData?.classes.find(c => c.name === className);
                      return (
                        <div
                          key={className}
                          onClick={() => selectRandomClass(className)}
                          style={{
                            padding: '1rem',
                            backgroundColor: characterData.class === className && characterData.usedRandomClass 
                              ? 'rgba(212, 193, 156, 0.2)' 
                              : 'rgba(255, 255, 255, 0.03)',
                            border: characterData.class === className && characterData.usedRandomClass 
                              ? '2px solid var(--primary-gold)' 
                              : '1px solid rgba(212, 193, 156, 0.1)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (characterData.class !== className || !characterData.usedRandomClass) {
                              e.currentTarget.style.backgroundColor = 'rgba(212, 193, 156, 0.1)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (characterData.class !== className || !characterData.usedRandomClass) {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                            }
                          }}
                        >
                          <div style={{ fontWeight: 'bold', color: 'var(--text-gold)', marginBottom: '0.5rem' }}>
                            {className}
                          </div>
                          {classData && (
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                              Hit Die: d{classData.hitDie} | Primary: {classData.primaryAbility.join(', ').toUpperCase()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {characterData.usedRandomClass && (
                  <div style={{ 
                    marginTop: '1rem', 
                    padding: '1rem', 
                    backgroundColor: 'rgba(0, 255, 0, 0.1)', 
                    border: '1px solid rgba(0, 255, 0, 0.3)', 
                    borderRadius: '8px' 
                  }}>
                    <div style={{ fontWeight: 'bold', color: '#4ade80', marginBottom: '0.25rem' }}>
                      🎉 Bonus Unlocked!
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      You'll get +4 extra points in the Point Buy system for choosing randomly!
                    </div>
                  </div>
                )}
              </div>
            </div>

            {characterData.class && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'rgba(212, 193, 156, 0.1)', borderRadius: '8px' }}>
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '0.5rem' }}>Selected Class: {characterData.class}</h5>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {characterData.usedRandomClass 
                    ? `You chose ${characterData.class} from the random selection and will receive +4 bonus points for abilities!`
                    : `You manually selected ${characterData.class}.`
                  }
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Character Name, Race, Background */}
        {currentStep === 2 && (
          <div className="glass-panel primary">
            <h3>🧙‍♂️ Character Details</h3>
            <div style={{ display: 'grid', gap: '2rem' }}>
              <div>
                <label className="form-label">Character Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={characterData.name}
                  onChange={(e) => setCharacterData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter your character's name..."
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div>
                  <label className="form-label">Race</label>
                  <select
                    className="form-input"
                    value={characterData.race}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, race: e.target.value }))}
                    required
                  >
                    <option value="">Select a race...</option>
                    {referenceData?.races.map(race => (
                      <option key={race.name} value={race.name}>{race.name}</option>
                    ))}
                  </select>
                  {characterData.race && (
                    <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                      <h6>Racial Traits:</h6>
                      {referenceData?.races.find(r => r.name === characterData.race)?.traits.map(trait => (
                        <p key={trait} className="text-muted" style={{ fontSize: '0.9rem', margin: '0.25rem 0' }}>• {trait}</p>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="form-label">Background</label>
                  <select
                    className="form-input"
                    value={characterData.background}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, background: e.target.value }))}
                    required
                  >
                    <option value="">Select a background...</option>
                    {referenceData?.backgrounds.map(background => (
                      <option key={background} value={background}>{background}</option>
                    ))}
                  </select>
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                    <p className="text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                      Your background represents what your character did before becoming an adventurer. 
                      It provides skill proficiencies, languages, and equipment.
                    </p>
                  </div>
                </div>
              </div>

              {characterData.class && (
                <div style={{ padding: '1rem', backgroundColor: 'rgba(212, 193, 156, 0.1)', borderRadius: '8px' }}>
                  <h6 style={{ color: 'var(--text-gold)', marginBottom: '0.5rem' }}>Selected Class: {characterData.class}</h6>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {characterData.usedRandomClass && "🎲 Random selection - you'll get +4 bonus points for abilities!"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Point Buy System */}
        {currentStep === 3 && (
          <div className="glass-panel primary">
            <h3>💪 Point Buy System</h3>
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-gold)' }}>
                    Points Used: {calculatePointsSpent()} / {getAvailablePoints()}
                  </span>
                  {characterData.usedRandomClass && (
                    <span style={{ marginLeft: '1rem', fontSize: '0.9rem', color: '#4ade80' }}>
                      (+4 bonus from random class!)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Remaining: {getAvailablePoints() - calculatePointsSpent()}
                </div>
              </div>
              <div style={{ 
                width: '100%', 
                height: '8px', 
                backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: `${(calculatePointsSpent() / getAvailablePoints()) * 100}%`, 
                  height: '100%', 
                  backgroundColor: calculatePointsSpent() > getAvailablePoints() ? '#ef4444' : 'var(--primary-gold)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>

            <p className="text-muted" style={{ marginBottom: '2rem' }}>
              Standard D&D 5e Point Buy rules. All abilities start at 8. Costs: 8-13 = 1 point each, 14 = 7 points total, 15 = 9 points total.
              {characterData.usedRandomClass && " You have 4 bonus points for choosing a random class!"}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              {Object.entries(characterData.abilities).map(([ability, value]) => {
                const cost = getPointCost(value);
                const newCost = getPointCost(value + 1);
                const canIncrease = value < 15 && (calculatePointsSpent() - cost + newCost) <= getAvailablePoints();
                const canDecrease = value > 8;

                return (
                  <div key={ability} className="glass-panel" style={{ textAlign: 'center' }}>
                    <label className="form-label" style={{ marginBottom: '1rem' }}>
                      {ability.toUpperCase()}
                    </label>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <button
                        onClick={() => handleAbilityChange(ability as keyof CharacterData['abilities'], value - 1)}
                        disabled={!canDecrease}
                        className="btn btn-secondary"
                        style={{ 
                          width: '40px', 
                          height: '40px', 
                          padding: 0,
                          opacity: canDecrease ? 1 : 0.3
                        }}
                      >
                        −
                      </button>
                      
                      <div style={{ minWidth: '60px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-gold)' }}>
                          {value}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {Math.floor((value - 10) / 2) >= 0 ? '+' : ''}{Math.floor((value - 10) / 2)}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleAbilityChange(ability as keyof CharacterData['abilities'], value + 1)}
                        disabled={!canIncrease}
                        className="btn btn-secondary"
                        style={{ 
                          width: '40px', 
                          height: '40px', 
                          padding: 0,
                          opacity: canIncrease ? 1 : 0.3
                        }}
                      >
                        +
                      </button>
                    </div>
                    
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Cost: {cost} point{cost !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            </div>

            {calculatePointsSpent() > getAvailablePoints() && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '1rem', 
                backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid rgba(239, 68, 68, 0.3)', 
                borderRadius: '8px' 
              }}>
                <div style={{ fontWeight: 'bold', color: '#ef4444' }}>
                  ⚠️ Too many points spent!
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  You've spent {calculatePointsSpent() - getAvailablePoints()} too many points. Please reduce some ability scores.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Skills and Proficiencies */}
        {currentStep === 4 && (
          <div className="glass-panel primary">
            <h3>🎯 Skills and Proficiencies</h3>
            <div style={{ marginBottom: '1.5rem' }}>
              <h5>Skills (Select up to 4)</h5>
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                Choose skills that complement your class and background. Some skills may be restricted based on your class choice.
              </p>
              <div style={{ 
                maxHeight: '400px', 
                overflowY: 'auto', 
                padding: '1rem', 
                backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                borderRadius: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '0.5rem'
              }}>
                {referenceData?.skills.map(skill => (
                  <label key={skill} style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    padding: '0.5rem',
                    backgroundColor: characterData.skills.includes(skill) ? 'rgba(212, 193, 156, 0.1)' : 'transparent',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease'
                  }}>
                    <input
                      type="checkbox"
                      checked={characterData.skills.includes(skill)}
                      onChange={() => handleSkillToggle(skill)}
                      disabled={!characterData.skills.includes(skill) && characterData.skills.length >= 4}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <span style={{ fontSize: '0.9rem' }}>{skill}</span>
                  </label>
                ))}
              </div>
              <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Selected: {characterData.skills.length}/4 skills
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Backstory, Personality, etc. */}
        {currentStep === 5 && (
          <div className="glass-panel primary">
            <h3>📖 Character Personality & Backstory</h3>
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              <div>
                <label className="form-label">Backstory</label>
                <textarea
                  className="form-input"
                  value={characterData.backstory}
                  onChange={(e) => setCharacterData(prev => ({ ...prev, backstory: e.target.value }))}
                  placeholder="Describe your character's history, origins, and how they became an adventurer..."
                  rows={4}
                  style={{ resize: 'vertical' }}
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="form-label">Personality Traits</label>
                  <textarea
                    className="form-input"
                    value={characterData.personality_traits}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, personality_traits: e.target.value }))}
                    placeholder="How does your character act? What are their quirks?"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label className="form-label">Ideals</label>
                  <textarea
                    className="form-input"
                    value={characterData.ideals}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, ideals: e.target.value }))}
                    placeholder="What drives your character? What do they believe in?"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label className="form-label">Bonds</label>
                  <textarea
                    className="form-input"
                    value={characterData.bonds}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, bonds: e.target.value }))}
                    placeholder="What connects your character to the world? People, places, things?"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label className="form-label">Flaws</label>
                  <textarea
                    className="form-input"
                    value={characterData.flaws}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, flaws: e.target.value }))}
                    placeholder="What are your character's weaknesses or vices?"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Character Summary */}
        {currentStep === 6 && (
          <div className="glass-panel primary">
            <h3>📋 Character Summary</h3>
            <p className="text-muted" style={{ marginBottom: '2rem' }}>
              Review all your character's details before creating them. Make sure everything looks correct! 
              <span style={{ fontSize: '0.85rem', display: 'block', marginTop: '0.5rem', fontStyle: 'italic' }}>
                ✨ Note: Your backstory and personality details will preserve line breaks exactly as you typed them.
              </span>
            </p>
            
            <div style={{ display: 'grid', gap: '2rem' }}>
              {/* Basic Info */}
              <div className="glass-panel">
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Basic Information</h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <strong>Name:</strong> {characterData.name || 'Not set'}
                  </div>
                  <div>
                    <strong>Race:</strong> {characterData.race || 'Not set'}
                  </div>
                  <div>
                    <strong>Class:</strong> {characterData.class || 'Not set'}
                    {characterData.usedRandomClass && <span style={{ color: '#4ade80', marginLeft: '0.5rem' }}>🎲</span>}
                  </div>
                  <div>
                    <strong>Background:</strong> {characterData.background || 'Not set'}
                  </div>
                </div>
              </div>

              {/* Ability Scores */}
              <div className="glass-panel">
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>
                  Ability Scores 
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '1rem' }}>
                    ({calculatePointsSpent()}/{getAvailablePoints()} points used)
                  </span>
                </h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                  {Object.entries(characterData.abilities).map(([ability, value]) => (
                    <div key={ability} style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{ability}</div>
                      <div style={{ fontSize: '1.2rem', color: 'var(--text-gold)' }}>{value}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {Math.floor((value - 10) / 2) >= 0 ? '+' : ''}{Math.floor((value - 10) / 2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Combat Stats */}
              <div className="glass-panel">
                <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Combat Statistics</h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                  <div>
                    <strong>Hit Points:</strong> {calculateHitPoints()}
                  </div>
                  <div>
                    <strong>Armor Class:</strong> {calculateArmorClass()}
                  </div>
                  <div>
                    <strong>Level:</strong> 1
                  </div>
                </div>
              </div>

              {/* Skills */}
              {characterData.skills.length > 0 && (
                <div className="glass-panel">
                  <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Skills ({characterData.skills.length})</h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {characterData.skills.map(skill => (
                      <span key={skill} style={{ 
                        padding: '0.25rem 0.5rem', 
                        backgroundColor: 'rgba(212, 193, 156, 0.2)', 
                        borderRadius: '4px',
                        fontSize: '0.9rem'
                      }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Personality */}
              {(characterData.backstory || characterData.personality_traits || characterData.ideals || characterData.bonds || characterData.flaws) && (
                <div className="glass-panel">
                  <h5 style={{ color: 'var(--text-gold)', marginBottom: '1rem' }}>Personality & Background</h5>
                  <div style={{ display: 'grid', gap: '1.5rem' }}>
                    {characterData.backstory && (
                      <div>
                        <strong>Backstory:</strong>
                        <div style={{ 
                          marginTop: '0.5rem', 
                          padding: '1rem', 
                          backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                          borderRadius: '4px',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.6'
                        }}>
                          {characterData.backstory}
                        </div>
                      </div>
                    )}
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                      {characterData.personality_traits && (
                        <div>
                          <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Personality Traits:</strong>
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                            borderRadius: '6px', 
                            border: '1px solid rgba(212, 193, 156, 0.2)',
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                          }}>
                            {characterData.personality_traits}
                          </div>
                        </div>
                      )}
                      {characterData.ideals && (
                        <div>
                          <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Ideals:</strong>
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                            borderRadius: '6px', 
                            border: '1px solid rgba(212, 193, 156, 0.2)',
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                          }}>
                            {characterData.ideals}
                          </div>
                        </div>
                      )}
                      {characterData.bonds && (
                        <div>
                          <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Bonds:</strong>
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: 'rgba(212, 193, 156, 0.1)', 
                            borderRadius: '6px', 
                            border: '1px solid rgba(212, 193, 156, 0.2)',
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                          }}>
                            {characterData.bonds}
                          </div>
                        </div>
                      )}
                      {characterData.flaws && (
                        <div>
                          <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Flaws:</strong>
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: 'rgba(220, 53, 69, 0.1)', 
                            borderRadius: '6px', 
                            border: '1px solid rgba(220, 53, 69, 0.2)',
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                          }}>
                            {characterData.flaws}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={handlePrevious}
            className="btn btn-secondary"
            disabled={currentStep === 1}
            style={{ 
              whiteSpace: 'nowrap',
              minWidth: '140px'
            }}
          >
            ← Previous
          </button>

          <span className="text-muted">
            Step {currentStep} of {totalSteps}
          </span>

          {currentStep < totalSteps ? (
            <button
              onClick={handleNext}
              className="btn btn-primary"
              disabled={!canProceed()}
              style={{ 
                whiteSpace: 'nowrap',
                minWidth: '140px'
              }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="btn btn-primary"
              disabled={!canProceed() || isLoading}
              style={{ 
                whiteSpace: 'nowrap',
                minWidth: '140px'
              }}
            >
              {isLoading ? 'Creating...' : 'Create Character'}
            </button>
          )}
        </div>

        <div className="text-center mt-lg">
          <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-secondary"
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              fontSize: '0.9rem'
            }}
          >
            ← Cancel & Return to Campaign Select
          </button>
        </div>
      </div>
    </div>
  );
};

export default CharacterCreation;