import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCampaign } from '../contexts/CampaignContext';
import { characterAPI, D5eReferenceData, InventoryItem } from '../services/api';

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

  const [characterData, setCharacterData] = useState<CharacterData>({
    name: '',
    race: '',
    class: '',
    background: '',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    skills: [],
    equipment: [],
    spells: [],
    backstory: '',
    personality_traits: '',
    ideals: '',
    bonds: '',
    flaws: ''
  });

  const totalSteps = 6;

  useEffect(() => {
    const loadData = async () => {
      try {
        if (campaignName) {
          await loadCampaign(campaignName);
        }
        const refData = await characterAPI.getReferenceData();
        setReferenceData(refData);
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
    setCharacterData(prev => ({
      ...prev,
      abilities: { ...prev.abilities, [ability]: value }
    }));
  };

  const handleSkillToggle = (skill: string) => {
    setCharacterData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill]
    }));
  };

  const handleEquipmentToggle = (item: string) => {
    setCharacterData(prev => ({
      ...prev,
      equipment: prev.equipment.includes(item)
        ? prev.equipment.filter(e => e !== item)
        : [...prev.equipment, item]
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
        equipment: characterData.equipment,
        spells: characterData.spells,
        backstory: characterData.backstory,
        personality_traits: characterData.personality_traits,
        ideals: characterData.ideals,
        bonds: characterData.bonds,
        flaws: characterData.flaws
      });

      navigate(`/campaign/${campaignName}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create character');
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return characterData.name.trim().length > 0;
      case 2: return characterData.race && characterData.class;
      case 3: return characterData.background;
      case 4: return true; // Abilities always have default values
      case 5: return true; // Skills are optional
      case 6: return true; // Backstory is optional
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

        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <div className="glass-panel primary">
            <h3>⚔️ Basic Character Information</h3>
            <div style={{ marginBottom: '1.5rem' }}>
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
            <p className="text-muted">
              Choose a memorable name that fits the D&D fantasy setting. This will be how other players know your character.
            </p>
          </div>
        )}

        {/* Step 2: Race and Class */}
        {currentStep === 2 && (
          <div className="glass-panel primary">
            <h3>🧝 Race and Class</h3>
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
                  {referenceData.races.map(race => (
                    <option key={race.name} value={race.name}>{race.name}</option>
                  ))}
                </select>
                {characterData.race && (
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                    <h6>Racial Traits:</h6>
                    {referenceData.races.find(r => r.name === characterData.race)?.traits.map(trait => (
                      <p key={trait} className="text-muted" style={{ fontSize: '0.9rem', margin: '0.25rem 0' }}>• {trait}</p>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="form-label">Class</label>
                <select
                  className="form-input"
                  value={characterData.class}
                  onChange={(e) => setCharacterData(prev => ({ ...prev, class: e.target.value }))}
                  required
                >
                  <option value="">Select a class...</option>
                  {referenceData.classes.map(charClass => (
                    <option key={charClass.name} value={charClass.name}>{charClass.name}</option>
                  ))}
                </select>
                {characterData.class && (
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                    <h6>Class Info:</h6>
                    <p className="text-muted" style={{ fontSize: '0.9rem', margin: '0.25rem 0' }}>
                      Hit Die: d{referenceData.classes.find(c => c.name === characterData.class)?.hitDie}
                    </p>
                    <p className="text-muted" style={{ fontSize: '0.9rem', margin: '0.25rem 0' }}>
                      Primary Abilities: {referenceData.classes.find(c => c.name === characterData.class)?.primaryAbility.join(', ').toUpperCase()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Background */}
        {currentStep === 3 && (
          <div className="glass-panel primary">
            <h3>📚 Background</h3>
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Character Background</label>
              <select
                className="form-input"
                value={characterData.background}
                onChange={(e) => setCharacterData(prev => ({ ...prev, background: e.target.value }))}
                required
              >
                <option value="">Select a background...</option>
                {referenceData.backgrounds.map(background => (
                  <option key={background} value={background}>{background}</option>
                ))}
              </select>
            </div>
            <p className="text-muted">
              Your background represents what your character did before becoming an adventurer. 
              It provides skill proficiencies, languages, and equipment.
            </p>
          </div>
        )}

        {/* Step 4: Ability Scores */}
        {currentStep === 4 && (
          <div className="glass-panel primary">
            <h3>💪 Ability Scores</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
              Set your character's six ability scores. The standard array method gives you scores to distribute: 15, 14, 13, 12, 10, 8.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {Object.entries(characterData.abilities).map(([ability, value]) => (
                <div key={ability} className="glass-panel">
                  <label className="form-label">{ability.toUpperCase()}</label>
                  <input
                    type="range"
                    min="8"
                    max="15"
                    value={value}
                    onChange={(e) => handleAbilityChange(ability as keyof CharacterData['abilities'], parseInt(e.target.value))}
                    className="form-input"
                    style={{ width: '100%', marginBottom: '0.5rem' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <span className="text-gold">{value}</span>
                    <span className="text-muted">
                      Modifier: {Math.floor((value - 10) / 2) >= 0 ? '+' : ''}{Math.floor((value - 10) / 2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Skills and Equipment */}
        {currentStep === 5 && (
          <div className="glass-panel primary">
            <h3>🎯 Skills and Equipment</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <h5>Skills (Select up to 4)</h5>
                <div style={{ maxHeight: '300px', overflowY: 'auto', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                  {referenceData.skills.map(skill => (
                    <label key={skill} style={{ display: 'block', marginBottom: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={characterData.skills.includes(skill)}
                        onChange={() => handleSkillToggle(skill)}
                        disabled={!characterData.skills.includes(skill) && characterData.skills.length >= 4}
                        style={{ marginRight: '0.5rem' }}
                      />
                      {skill}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h5>Starting Equipment</h5>
                <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                  {[...referenceData.equipment.weapons, ...referenceData.equipment.armor, ...referenceData.equipment.tools, ...referenceData.equipment.general].map((item, index) => {
                    // Handle both new object format and legacy string format
                    const itemName = typeof item === 'string' ? item : item.item_name;
                    const itemData = typeof item === 'string' ? null : item;
                    
                    return (
                      <label key={itemName || index} style={{ display: 'block', marginBottom: '1rem', cursor: 'pointer', padding: '0.5rem', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px', border: '1px solid rgba(212, 193, 156, 0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <input
                            type="checkbox"
                            checked={characterData.equipment.includes(itemName)}
                            onChange={() => handleEquipmentToggle(itemName)}
                            style={{ marginTop: '0.2rem' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', color: 'var(--text-gold)', marginBottom: '0.25rem' }}>
                              {itemName}
                            </div>
                            {itemData?.description && (
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', lineHeight: '1.4' }}>
                                {itemData.description}
                              </div>
                            )}
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                              {itemData?.damage_dice && (
                                <span>Damage: {itemData.damage_dice} {itemData.damage_type}</span>
                              )}
                              {itemData?.range_normal && (
                                <span>Range: {itemData.range_normal}/{itemData.range_long} ft</span>
                              )}
                              {itemData?.armor_class && (
                                <span>AC: +{itemData.armor_class}</span>
                              )}
                              {itemData?.weight && (
                                <span>Weight: {itemData.weight} lb</span>
                              )}
                            </div>
                            {itemData?.properties && itemData.properties.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                Properties: {itemData.properties.join(', ')}
                              </div>
                            )}
                            {itemData?.stealth_disadvantage && (
                              <div style={{ fontSize: '0.75rem', color: '#ff6b6b', marginTop: '0.25rem' }}>
                                Gives disadvantage on Stealth checks
                              </div>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Backstory and Personality */}
        {currentStep === 6 && (
          <div className="glass-panel primary">
            <h3>📖 Character Background Story</h3>
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
                    placeholder="How does your character act?"
                    rows={2}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label className="form-label">Ideals</label>
                  <textarea
                    className="form-input"
                    value={characterData.ideals}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, ideals: e.target.value }))}
                    placeholder="What drives your character?"
                    rows={2}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label className="form-label">Bonds</label>
                  <textarea
                    className="form-input"
                    value={characterData.bonds}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, bonds: e.target.value }))}
                    placeholder="What connects your character to the world?"
                    rows={2}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label className="form-label">Flaws</label>
                  <textarea
                    className="form-input"
                    value={characterData.flaws}
                    onChange={(e) => setCharacterData(prev => ({ ...prev, flaws: e.target.value }))}
                    placeholder="What are your character's weaknesses?"
                    rows={2}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

            {/* Character Summary */}
            <div className="glass-panel info" style={{ marginTop: '2rem' }}>
              <h5>Character Summary</h5>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <div>
                  <p><strong>Name:</strong> {characterData.name}</p>
                  <p><strong>Race:</strong> {characterData.race}</p>
                  <p><strong>Class:</strong> {characterData.class}</p>
                  <p><strong>Background:</strong> {characterData.background}</p>
                </div>
                <div>
                  <p><strong>Hit Points:</strong> {calculateHitPoints()}</p>
                  <p><strong>Armor Class:</strong> {calculateArmorClass()}</p>
                  <p><strong>Skills:</strong> {characterData.skills.length} selected</p>
                  <p><strong>Equipment:</strong> {characterData.equipment.length} items</p>
                </div>
              </div>
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
            onClick={() => navigate(`/campaign/${campaignName}`)}
            className="btn btn-secondary"
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              fontSize: '0.9rem'
            }}
          >
            ← Cancel & Return to Campaign
          </button>
        </div>
      </div>
    </div>
  );
};

export default CharacterCreation;