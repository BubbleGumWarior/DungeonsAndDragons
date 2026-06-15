import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Socket } from 'socket.io-client';
import { ChatMessage, OutOfCombatRollRequest, DiceGroup, CampaignNPC } from '../../types/campaignTypes';
import { npcAPI } from '../../services/api';

interface OnlinePlayer {
  userId: number;
  characterName: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  socket: Socket | null;
  campaignId: number;
  currentUserId: number;
  currentUserName: string;
  isDM: boolean;
  onlinePlayers: OnlinePlayer[];
  campaignNPCs: CampaignNPC[];
  userCharacterId: number | null;
  currentDay: number;
  onNPCRevealed: (npc: CampaignNPC) => void;
  onNPCSaved: (npc: CampaignNPC) => void;
}

type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
type PickerTab = 'skills' | 'saves' | 'other';

interface RollOption {
  label: string;
  purpose: string;
  purposeDetail: string;
  modifier: Ability | 'none';
  defaultDice: string;
}

const SKILLS: RollOption[] = [
  { label: 'Acrobatics',     purpose: 'ability_check', purposeDetail: 'Acrobatics',     modifier: 'dex', defaultDice: 'd20' },
  { label: 'Animal Handling',purpose: 'ability_check', purposeDetail: 'Animal Handling', modifier: 'wis', defaultDice: 'd20' },
  { label: 'Arcana',         purpose: 'ability_check', purposeDetail: 'Arcana',          modifier: 'int', defaultDice: 'd20' },
  { label: 'Athletics',      purpose: 'ability_check', purposeDetail: 'Athletics',       modifier: 'str', defaultDice: 'd20' },
  { label: 'Deception',      purpose: 'ability_check', purposeDetail: 'Deception',       modifier: 'cha', defaultDice: 'd20' },
  { label: 'History',        purpose: 'ability_check', purposeDetail: 'History',         modifier: 'int', defaultDice: 'd20' },
  { label: 'Insight',        purpose: 'ability_check', purposeDetail: 'Insight',         modifier: 'wis', defaultDice: 'd20' },
  { label: 'Intimidation',   purpose: 'ability_check', purposeDetail: 'Intimidation',    modifier: 'cha', defaultDice: 'd20' },
  { label: 'Investigation',  purpose: 'ability_check', purposeDetail: 'Investigation',   modifier: 'int', defaultDice: 'd20' },
  { label: 'Medicine',       purpose: 'ability_check', purposeDetail: 'Medicine',        modifier: 'wis', defaultDice: 'd20' },
  { label: 'Nature',         purpose: 'ability_check', purposeDetail: 'Nature',          modifier: 'int', defaultDice: 'd20' },
  { label: 'Perception',     purpose: 'ability_check', purposeDetail: 'Perception',      modifier: 'wis', defaultDice: 'd20' },
  { label: 'Performance',    purpose: 'ability_check', purposeDetail: 'Performance',     modifier: 'cha', defaultDice: 'd20' },
  { label: 'Persuasion',     purpose: 'ability_check', purposeDetail: 'Persuasion',      modifier: 'cha', defaultDice: 'd20' },
  { label: 'Religion',       purpose: 'ability_check', purposeDetail: 'Religion',        modifier: 'int', defaultDice: 'd20' },
  { label: 'Sleight of Hand',purpose: 'ability_check', purposeDetail: 'Sleight of Hand', modifier: 'dex', defaultDice: 'd20' },
  { label: 'Stealth',        purpose: 'ability_check', purposeDetail: 'Stealth',         modifier: 'dex', defaultDice: 'd20' },
  { label: 'Survival',       purpose: 'ability_check', purposeDetail: 'Survival',        modifier: 'wis', defaultDice: 'd20' },
];

const SAVING_THROWS: RollOption[] = [
  { label: 'STR Save', purpose: 'saving_throw', purposeDetail: 'Strength Save',     modifier: 'str', defaultDice: 'd20' },
  { label: 'DEX Save', purpose: 'saving_throw', purposeDetail: 'Dexterity Save',    modifier: 'dex', defaultDice: 'd20' },
  { label: 'CON Save', purpose: 'saving_throw', purposeDetail: 'Constitution Save', modifier: 'con', defaultDice: 'd20' },
  { label: 'INT Save', purpose: 'saving_throw', purposeDetail: 'Intelligence Save', modifier: 'int', defaultDice: 'd20' },
  { label: 'WIS Save', purpose: 'saving_throw', purposeDetail: 'Wisdom Save',       modifier: 'wis', defaultDice: 'd20' },
  { label: 'CHA Save', purpose: 'saving_throw', purposeDetail: 'Charisma Save',     modifier: 'cha', defaultDice: 'd20' },
];

const OTHER_ROLLS: RollOption[] = [
  { label: 'Initiative',  purpose: 'initiative',    purposeDetail: 'Initiative',  modifier: 'dex',  defaultDice: 'd20' },
  { label: 'Death Save',  purpose: 'death_save',    purposeDetail: 'Death Save',  modifier: 'none', defaultDice: 'd20' },
  { label: 'Attack Roll', purpose: 'attack',        purposeDetail: 'Attack Roll', modifier: 'none', defaultDice: 'd20' },
  { label: 'Damage Roll', purpose: 'damage',        purposeDetail: 'Damage Roll', modifier: 'none', defaultDice: 'd6'  },
  { label: 'Custom Roll', purpose: 'ability_check', purposeDetail: 'Custom Roll', modifier: 'none', defaultDice: 'd20' },
];

const ABILITY_BADGE: Record<string, string> = {
  str: '#ef4444', dex: '#22d3ee', con: '#f97316',
  int: '#818cf8', wis: '#4ade80', cha: '#f472b6', none: '#6b7280',
};

const DICE_TYPES = ['d2', 'd3', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

const MESSAGE_STYLES: Record<string, React.CSSProperties> = {
  player: { background: 'rgba(255,255,255,0.04)', borderLeft: '3px solid rgba(255,255,255,0.15)' },
  dm:     { background: 'rgba(251,191,36,0.07)',  borderLeft: '3px solid var(--text-gold)' },
  server: { background: 'rgba(167,139,250,0.07)', borderLeft: '3px solid #7c3aed' },
  roll_result: { background: 'rgba(74,222,128,0.07)', borderLeft: '3px solid #4ade80' },
  npc_reveal: { background: 'rgba(var(--theme-accent-rgb),0.08)', borderLeft: '3px solid var(--primary-gold)' },
};

const SENDER_COLORS: Record<string, string> = {
  player: '#e2e8f0', dm: 'var(--text-gold)', server: '#a78bfa', roll_result: '#4ade80',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const ChatPanel: React.FC<Props> = ({
  isOpen, onClose, messages, socket, campaignId,
  currentUserId, currentUserName, isDM, onlinePlayers,
  campaignNPCs, userCharacterId, currentDay, onNPCRevealed, onNPCSaved,
}) => {
  const [inputText, setInputText] = useState('');
  const [showRollPicker, setShowRollPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<PickerTab>('skills');
  const [rollTargetId, setRollTargetId] = useState<number | ''>('');
  const [selectedOption, setSelectedOption] = useState<RollOption | null>(null);
  const [rollDiceGroups, setRollDiceGroups] = useState<DiceGroup[]>([{ count: 1, diceType: 'd20' }]);

  // NPC modal state
  type NpcStep = 'form' | 'crop';
  const [showNPCModal, setShowNPCModal] = useState(false);
  const [npcStep, setNpcStep] = useState<NpcStep>('form');
  const [npcName, setNpcName] = useState('');
  const [npcAge, setNpcAge] = useState('');
  const [npcDescription, setNpcDescription] = useState('');
  const [npcImageFile, setNpcImageFile] = useState<File | null>(null);
  const [npcImagePreview, setNpcImagePreview] = useState<string | null>(null);
  const [npcPosition, setNpcPosition] = useState({ x: 50, y: 50 });
  const [npcScale, setNpcScale] = useState(100);
  const [npcSubmitting, setNpcSubmitting] = useState(false);

  // Track which NPCs this user has already saved
  const [savedNPCIds, setSavedNPCIds] = useState<Set<number>>(new Set());
  const [savingNPCId, setSavingNPCId] = useState<number | null>(null);
  const [npcViewImage, setNpcViewImage] = useState<{ url: string; name: string } | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  // Listen for NPC reveals via socket
  useEffect(() => {
    if (!socket) return;
    const handler = (npc: CampaignNPC) => { onNPCRevealed(npc); };
    socket.on('npcRevealed', handler);
    return () => { socket.off('npcRevealed', handler); };
  }, [socket, onNPCRevealed]);

  const closeNpcModal = () => {
    setShowNPCModal(false);
    setNpcStep('form');
    setNpcName('');
    setNpcAge('');
    setNpcDescription('');
    if (npcImagePreview) URL.revokeObjectURL(npcImagePreview);
    setNpcImageFile(null);
    setNpcImagePreview(null);
    setNpcPosition({ x: 50, y: 50 });
    setNpcScale(100);
  };

  const handleNpcImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (npcImagePreview) URL.revokeObjectURL(npcImagePreview);
    const url = URL.createObjectURL(file);
    setNpcImageFile(file);
    setNpcImagePreview(url);
    setNpcPosition({ x: 50, y: 50 });
    setNpcScale(100);
  };

  const submitNPC = async () => {
    if (npcSubmitting) return;
    setNpcSubmitting(true);
    try {
      let fileToUpload: File | null = npcImageFile;

      if (npcImageFile && npcImagePreview) {
        // Crop the image to a 400×400 square using canvas
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = npcImagePreview;
        await new Promise<void>(resolve => { img.onload = () => resolve(); });
        if (ctx) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(0, 0, 400, 400);
          const scale = npcScale / 100;
          const scaledWidth = 400 * scale;
          const scaledHeight = (img.height / img.width) * scaledWidth;
          const cx = (npcPosition.x / 100) * 400;
          const cy = (npcPosition.y / 100) * 400;
          ctx.drawImage(img, cx - scaledWidth / 2, cy - scaledHeight / 2, scaledWidth, scaledHeight);
        }
        fileToUpload = await new Promise<File>(resolve => {
          canvas.toBlob(blob => {
            if (blob) resolve(new File([blob], npcImageFile.name, { type: 'image/jpeg' }));
            else resolve(npcImageFile);
          }, 'image/jpeg', 0.9);
        });
      }

      const formData = new FormData();
      formData.append('name', npcName.trim());
      const ageInput = npcAge.trim();
      const storedAge = ageInput && !isNaN(Number(ageInput))
        ? String(Number(ageInput) - Math.floor((currentDay - 1) / 365))
        : ageInput;
      formData.append('age', storedAge);
      formData.append('description', npcDescription.trim());
      if (fileToUpload) formData.append('image', fileToUpload);

      await npcAPI.createNPC(campaignId, formData);
      // Socket event `npcRevealed` will come back and call onNPCRevealed
      closeNpcModal();
    } catch (err) {
      console.error('Failed to create NPC:', err);
    } finally {
      setNpcSubmitting(false);
    }
  };

  const handleSaveNPC = async (npcId: number) => {
    if (!userCharacterId || savingNPCId !== null) return;
    setSavingNPCId(npcId);
    try {
      await npcAPI.saveNPCToCharacter(userCharacterId, npcId);
      setSavedNPCIds(prev => new Set(prev).add(npcId));
      const savedNpc = campaignNPCs.find(n => n.id === npcId);
      if (savedNpc) onNPCSaved(savedNpc);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setSavedNPCIds(prev => new Set(prev).add(npcId));
      } else {
        console.error('Failed to save NPC:', err);
      }
    } finally {
      setSavingNPCId(null);
    }
  };

  const selectRollOption = (opt: RollOption) => {
    setSelectedOption(opt);
    setRollDiceGroups([{ count: 1, diceType: opt.defaultDice }]);
  };

  const sendMessage = () => {
    const text = inputText.trim();
    if (!text || !socket) return;
    socket.emit('chatMessage', { campaignId, content: text.slice(0, 2000) });
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const sendRollRequest = () => {
    if (!socket || rollTargetId === '' || !selectedOption) return;
    const target = onlinePlayers.find(p => p.userId === rollTargetId);
    if (!target) return;
    const req: Omit<OutOfCombatRollRequest, 'requestId'> = {
      campaignId,
      targetPlayerId: rollTargetId as number,
      targetCharacterName: target.characterName,
      diceType: rollDiceGroups[0].diceType,
      rollPurpose: selectedOption.purpose,
      purposeDetail: selectedOption.purposeDetail,
      modifier: 0,
      precomputedModifier: selectedOption.modifier !== 'none' ? selectedOption.modifier : undefined,
      diceGroups: rollDiceGroups,
      requesterName: currentUserName,
    };
    socket.emit('requestOutOfCombatRoll', req);
    setShowRollPicker(false);
    setRollTargetId('');
    setSelectedOption(null);
    setRollDiceGroups([{ count: 1, diceType: 'd20' }]);
  };

  const tabOptions = pickerTab === 'skills' ? SKILLS : pickerTab === 'saves' ? SAVING_THROWS : OTHER_ROLLS;

  const selectStyle: React.CSSProperties = {
    background: '#2d2540', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '4px', color: '#e2e8f0', padding: '4px 6px', fontSize: '0.8rem', flex: 1,
  };

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '340px',
      background: '#1a1625', borderLeft: '1px solid rgba(255,255,255,0.1)',
      display: 'flex', flexDirection: 'column', zIndex: 1200,
      transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.25s ease',
      boxShadow: isOpen ? '-4px 0 24px rgba(0,0,0,0.6)' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', background: '#13111e', flexShrink: 0 }}>
        <span style={{ color: 'var(--text-gold)', fontWeight: 'bold', fontSize: '0.95rem' }}>💬 Campaign Chat</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
      </div>

      {/* Message list */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {messages.length === 0 && (
          <div style={{ color: '#6b7280', fontStyle: 'italic', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>
            No messages yet. Start the conversation!
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} style={{ ...(MESSAGE_STYLES[msg.message_type] ?? MESSAGE_STYLES.player), borderRadius: '4px', padding: '6px 10px' }}>
            {msg.message_type === 'npc_reveal' ? (() => {
              let npcId: number | null = null;
              try { npcId = JSON.parse(msg.content).npcId; } catch {}
              const npc = npcId !== null ? campaignNPCs.find(n => n.id === npcId) : null;
              const alreadySaved = npcId !== null && savedNPCIds.has(npcId);
              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--primary-gold)', fontWeight: 600, fontSize: '0.78rem' }}>👤 NPC Revealed</span>
                    <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>{formatTime(msg.created_at)}</span>
                  </div>
                  {npc ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {npc.image_url && (
                        <img src={npc.image_url} alt={npc.name}
                          onClick={() => npc.image_url && setNpcViewImage({ url: npc.image_url, name: npc.name })}
                          style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(var(--theme-accent-rgb),0.4)', flexShrink: 0, cursor: 'pointer' }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--primary-gold)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '4px' }}>{npc.name}</div>
                        {!isDM && (
                          <button
                            onClick={() => npcId !== null && handleSaveNPC(npcId)}
                            disabled={alreadySaved || savingNPCId === npcId}
                            style={{
                              padding: '3px 10px', fontSize: '0.75rem', fontWeight: 'bold',
                              background: alreadySaved ? 'rgba(74,222,128,0.1)' : 'rgba(var(--theme-accent-rgb),0.15)',
                              border: `1px solid ${alreadySaved ? '#4ade80' : 'rgba(var(--theme-accent-rgb),0.4)'}`,
                              borderRadius: '4px', cursor: alreadySaved ? 'default' : 'pointer',
                              color: alreadySaved ? '#4ade80' : 'var(--primary-gold)',
                            }}>
                            {alreadySaved ? '✓ Saved' : savingNPCId === npcId ? 'Saving…' : 'Save to Characters'}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Loading NPC data…</div>
                  )}
                </div>
              );
            })() : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: SENDER_COLORS[msg.message_type] ?? '#e2e8f0', fontWeight: 600, fontSize: '0.78rem' }}>
                    {msg.message_type === 'server' ? '⚙ Server' : msg.sender_name}
                    {msg.message_type === 'dm' && ' (DM)'}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>{formatTime(msg.created_at)}</span>
                </div>
                {msg.message_type === 'roll_result' && msg.roll_data ? (
                  <div>
                    <div style={{ color: '#d1d5db', fontSize: '0.85rem', marginBottom: '4px' }}>{msg.content}</div>
                    {msg.roll_data.diceGroups && msg.roll_data.diceGroups.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {msg.roll_data.diceGroups.map((grp, gi) => {
                          const groupSum = grp.rolls.reduce((a, b) => a + b, 0);
                          return (
                            <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid #4ade80', borderRadius: '4px', padding: '1px 7px', color: '#4ade80', fontWeight: 'bold', fontSize: '0.8rem' }}>
                                {grp.rolls.length}{grp.diceType}
                              </span>
                              <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                                [{grp.rolls.join(', ')}] = {groupSum}
                              </span>
                            </div>
                          );
                        })}
                        {msg.roll_data.modifier !== 0 && (
                          <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                            modifier: {msg.roll_data.modifier >= 0 ? '+' : ''}{msg.roll_data.modifier}
                          </span>
                        )}
                        <span style={{ background: 'rgba(74,222,128,0.2)', border: '1px solid #4ade80', borderRadius: '4px', padding: '2px 8px', color: '#4ade80', fontWeight: 'bold', fontSize: '0.9rem', alignSelf: 'flex-start' }}>
                          Total: {msg.roll_data.total}
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid #4ade80', borderRadius: '4px', padding: '2px 8px', color: '#4ade80', fontWeight: 'bold', fontSize: '0.9rem' }}>
                          {msg.roll_data.diceType}: {msg.roll_data.total}
                        </span>
                        {msg.roll_data.modifier !== 0 && (
                          <span style={{ color: '#9ca3af', fontSize: '0.78rem', alignSelf: 'center' }}>
                            (rolls: [{msg.roll_data.rolls.join(', ')}] {msg.roll_data.modifier >= 0 ? '+' : ''}{msg.roll_data.modifier})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#d1d5db', fontSize: '0.85rem', wordBreak: 'break-word' }}>{msg.content}</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* DM Roll Request Picker */}
      {isDM && showRollPicker && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', background: '#1e1930', flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '55vh' }}>
          <div style={{ padding: '0.6rem 0.75rem 0', flexShrink: 0 }}>
            <div style={{ color: 'var(--text-gold)', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '6px' }}>🎲 Request Roll</div>

            {/* Target player */}
            <select style={{ ...selectStyle, width: '100%', marginBottom: '6px' }} value={rollTargetId} onChange={e => setRollTargetId(Number(e.target.value))}>
              <option value="">— Select player —</option>
              {onlinePlayers.filter(p => p.userId !== currentUserId).map(p => (
                <option key={p.userId} value={p.userId}>{p.characterName}</option>
              ))}
            </select>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
              {(['skills', 'saves', 'other'] as PickerTab[]).map(tab => (
                <button key={tab} onClick={() => { setPickerTab(tab); setSelectedOption(null); }}
                  style={{ flex: 1, padding: '4px', background: pickerTab === tab ? '#7c3aed' : '#2d2540', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: pickerTab === tab ? 'white' : '#9ca3af', cursor: 'pointer', fontSize: '0.75rem', fontWeight: pickerTab === tab ? 'bold' : 'normal', textTransform: 'capitalize' }}>
                  {tab === 'skills' ? 'Skills' : tab === 'saves' ? 'Saves' : 'Other'}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable option grid */}
          <div style={{ overflowY: 'auto', padding: '0 0.75rem', flexShrink: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', paddingBottom: '6px' }}>
              {tabOptions.map(opt => {
                const active = selectedOption?.purposeDetail === opt.purposeDetail;
                return (
                  <button key={opt.purposeDetail} onClick={() => selectRollOption(opt)}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 6px', background: active ? 'rgba(124,58,237,0.3)' : '#2d2540', border: `1px solid ${active ? '#7c3aed' : 'rgba(255,255,255,0.1)'}`, borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: '26px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 'bold', color: ABILITY_BADGE[opt.modifier] ?? '#6b7280', background: 'rgba(0,0,0,0.3)', borderRadius: '3px', padding: '1px 2px', flexShrink: 0 }}>
                      {opt.modifier === 'none' ? '—' : opt.modifier.toUpperCase()}
                    </span>
                    <span style={{ color: active ? '#e9d5ff' : '#d1d5db', fontSize: '0.78rem', lineHeight: 1.2 }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected option summary + DiceGroupBuilder + send */}
          <div style={{ padding: '6px 0.75rem 0.75rem', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {selectedOption ? (
              <div style={{ marginBottom: '6px' }}>
                {/* Roll type label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', padding: '4px 8px', background: 'rgba(124,58,237,0.15)', borderRadius: '4px', border: '1px solid rgba(124,58,237,0.3)' }}>
                  <span style={{ color: ABILITY_BADGE[selectedOption.modifier] ?? '#6b7280', fontWeight: 'bold', fontSize: '0.75rem', minWidth: '28px' }}>
                    {selectedOption.modifier === 'none' ? '—' : selectedOption.modifier.toUpperCase()}
                  </span>
                  <span style={{ color: '#e9d5ff', fontSize: '0.82rem', flex: 1 }}>{selectedOption.purposeDetail}</span>
                </div>
                {/* Dice group builder */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {rollDiceGroups.map((grp, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="number" min={1} max={10} value={grp.count}
                        onChange={e => {
                          const v = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                          setRollDiceGroups(prev => prev.map((g, i) => i === idx ? { ...g, count: v } : g));
                        }}
                        style={{ ...selectStyle, width: '42px', flex: 'unset', textAlign: 'center', padding: '3px 4px' }}
                      />
                      <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>×</span>
                      {selectedOption?.purposeDetail === 'Custom Roll' ? (
                        <input
                          type="text"
                          value={grp.diceType}
                          onChange={e => {
                            const v = e.target.value.trim() || 'd20';
                            setRollDiceGroups(prev => prev.map((g, i) => i === idx ? { ...g, diceType: v } : g));
                          }}
                          placeholder="d20"
                          style={{ ...selectStyle, width: '62px', flex: 'unset', textAlign: 'center' }}
                        />
                      ) : (
                        <select value={grp.diceType}
                          onChange={e => setRollDiceGroups(prev => prev.map((g, i) => i === idx ? { ...g, diceType: e.target.value } : g))}
                          style={{ ...selectStyle, width: '62px', flex: 'unset' }}>
                          {DICE_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      )}
                      {rollDiceGroups.length > 1 && (
                        <button onClick={() => setRollDiceGroups(prev => prev.filter((_, i) => i !== idx))}
                          style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '3px', color: '#f87171', cursor: 'pointer', fontSize: '0.7rem', padding: '2px 6px', lineHeight: 1 }}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {rollDiceGroups.length < 6 && (
                    <button onClick={() => setRollDiceGroups(prev => [...prev, { count: 1, diceType: 'd6' }])}
                      style={{ alignSelf: 'flex-start', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '3px', color: '#4ade80', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 8px', marginTop: '2px' }}>
                      + Add Die
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ color: '#6b7280', fontSize: '0.78rem', marginBottom: '6px', fontStyle: 'italic' }}>Select a roll type above</div>
            )}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={sendRollRequest} disabled={rollTargetId === '' || !selectedOption}
                style={{ flex: 1, background: rollTargetId !== '' && selectedOption ? '#7c3aed' : '#3d3651', border: 'none', borderRadius: '4px', color: 'white', padding: '6px', cursor: rollTargetId !== '' && selectedOption ? 'pointer' : 'default', fontSize: '0.82rem', fontWeight: 'bold' }}>
                Send Request
              </button>
              <button onClick={() => { setShowRollPicker(false); setSelectedOption(null); }}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: '#9ca3af', padding: '6px 10px', cursor: 'pointer', fontSize: '0.82rem' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: '6px', padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', background: '#13111e', flexShrink: 0 }}>
        {isDM && !showRollPicker && (
          <button onClick={() => setShowRollPicker(true)} title="Request a dice roll"
            style={{ background: '#3d2c6e', border: '1px solid #7c3aed', borderRadius: '4px', color: '#a78bfa', cursor: 'pointer', padding: '0 10px', fontSize: '1rem', flexShrink: 0 }}>
            🎲
          </button>
        )}
        {isDM && (
          <button onClick={() => { setShowNPCModal(true); setNpcStep('form'); }} title="Show NPC to players"
            style={{ background: '#2c3a1e', border: '1px solid #4ade80', borderRadius: '4px', color: '#86efac', cursor: 'pointer', padding: '0 10px', fontSize: '1rem', flexShrink: 0 }}>
            👤
          </button>
        )}
        <input ref={inputRef}
          style={{ flex: 1, background: '#2d2540', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: '#e2e8f0', padding: '6px 10px', fontSize: '0.88rem', outline: 'none' }}
          placeholder="Type a message…"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
        />
        <button onClick={sendMessage} disabled={!inputText.trim()}
          style={{ background: inputText.trim() ? '#7c3aed' : '#3d3651', border: 'none', borderRadius: '4px', color: 'white', cursor: inputText.trim() ? 'pointer' : 'default', padding: '0 12px', fontSize: '0.88rem', fontWeight: 'bold', flexShrink: 0 }}>
          Send
        </button>
      </div>

      {/* NPC Creation Modal — rendered via portal so it escapes ChatPanel's CSS transform stacking context */}
      {showNPCModal && isDM && ReactDOM.createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={e => { if (e.target === e.currentTarget) closeNpcModal(); }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(26,26,26,0.98) 0%, rgba(17,17,17,0.98) 100%)', borderRadius: '16px', padding: '2rem', width: '90%', maxWidth: '500px', border: '2px solid rgba(var(--theme-accent-rgb),0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            {npcStep === 'form' ? (
              <>
                <h3 style={{ color: 'var(--primary-gold)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '1.3rem' }}>👤 Reveal NPC</h3>

                {/* Image picker */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div
                    onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp'; inp.onchange = e => handleNpcImageSelect(e as any); inp.click(); }}
                    style={{ width: '100px', height: '100px', borderRadius: '50%', border: '2px dashed rgba(var(--theme-accent-rgb),0.5)', cursor: 'pointer', overflow: 'hidden', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {npcImagePreview
                      ? <img src={npcImagePreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: '#6b7280', fontSize: '0.78rem', textAlign: 'center', padding: '0.5rem' }}>Click to add photo</span>}
                  </div>
                  {npcImagePreview && <span style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: '4px' }}>Click to change</span>}
                </div>

                {/* Fields */}
                {[
                  { label: 'Name *', value: npcName, setter: setNpcName, placeholder: 'NPC name', multiline: false },
                  { label: 'Age', value: npcAge, setter: setNpcAge, placeholder: 'Age or era', multiline: false },
                  { label: 'Description', value: npcDescription, setter: setNpcDescription, placeholder: 'Appearance, role, personality…', multiline: true },
                ].map(field => (
                  <div key={field.label} style={{ marginBottom: '0.9rem' }}>
                    <label style={{ display: 'block', color: 'var(--primary-gold)', fontSize: '0.82rem', marginBottom: '4px' }}>{field.label}</label>
                    {field.multiline
                      ? <textarea value={field.value} onChange={e => field.setter(e.target.value)} placeholder={field.placeholder} rows={3}
                          style={{ width: '100%', background: '#2d2540', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#e2e8f0', padding: '6px 10px', fontSize: '0.88rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                      : <input type="text" value={field.value} onChange={e => field.setter(e.target.value)} placeholder={field.placeholder}
                          style={{ width: '100%', background: '#2d2540', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#e2e8f0', padding: '6px 10px', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }} />}
                  </div>
                ))}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button onClick={closeNpcModal}
                    style={{ padding: '0.55rem 1.25rem', background: 'transparent', border: '1px solid rgba(var(--theme-accent-rgb),0.3)', borderRadius: '8px', color: '#9ca3af', cursor: 'pointer', fontSize: '0.88rem' }}>
                    Cancel
                  </button>
                  <button onClick={() => { if (npcName.trim()) { if (npcImagePreview) setNpcStep('crop'); else submitNPC(); } }}
                    disabled={!npcName.trim()}
                    style={{ padding: '0.55rem 1.5rem', background: npcName.trim() ? 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.3), rgba(var(--theme-accent-rgb),0.2))' : 'rgba(255,255,255,0.05)', border: `2px solid ${npcName.trim() ? 'var(--primary-gold)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '8px', color: npcName.trim() ? 'var(--primary-gold)' : '#4b5563', cursor: npcName.trim() ? 'pointer' : 'default', fontWeight: 'bold', fontSize: '0.88rem' }}>
                    {npcImagePreview ? 'Next: Crop Image →' : 'Show NPC'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ color: 'var(--primary-gold)', marginBottom: '1.25rem', textAlign: 'center', fontSize: '1.3rem' }}>📷 Position NPC Photo</h3>

                {/* Crop preview */}
                <div style={{ position: 'relative', width: '300px', height: '300px', margin: '0 auto 1.25rem', border: '3px solid rgba(var(--theme-accent-rgb),0.4)', borderRadius: '12px', overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
                  {npcImagePreview && (
                    <img src={npcImagePreview} alt="crop preview"
                      style={{ position: 'absolute', width: `${npcScale}%`, height: 'auto', left: `${npcPosition.x}%`, top: `${npcPosition.y}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
                  )}
                </div>

                {/* Sliders */}
                {[
                  { label: 'Horizontal Position', key: 'x' as const, min: 0, max: 100, value: npcPosition.x, onChange: (v: number) => setNpcPosition(p => ({ ...p, x: v })) },
                  { label: 'Vertical Position', key: 'y' as const, min: 0, max: 100, value: npcPosition.y, onChange: (v: number) => setNpcPosition(p => ({ ...p, y: v })) },
                  { label: `Zoom (${npcScale}%)`, key: 'zoom' as const, min: 50, max: 200, value: npcScale, onChange: (v: number) => setNpcScale(v) },
                ].map(sl => (
                  <div key={sl.key} style={{ marginBottom: '0.9rem' }}>
                    <label style={{ display: 'block', color: 'var(--primary-gold)', fontSize: '0.82rem', marginBottom: '4px' }}>{sl.label}</label>
                    <input type="range" min={sl.min} max={sl.max} value={sl.value} onChange={e => sl.onChange(parseInt(e.target.value))} style={{ width: '100%' }} />
                  </div>
                ))}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button onClick={() => setNpcStep('form')}
                    style={{ padding: '0.55rem 1.25rem', background: 'transparent', border: '1px solid rgba(var(--theme-accent-rgb),0.3)', borderRadius: '8px', color: '#9ca3af', cursor: 'pointer', fontSize: '0.88rem' }}>
                    ← Back
                  </button>
                  <button onClick={submitNPC} disabled={npcSubmitting}
                    style={{ padding: '0.55rem 1.5rem', background: npcSubmitting ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.3), rgba(var(--theme-accent-rgb),0.2))', border: '2px solid var(--primary-gold)', borderRadius: '8px', color: 'var(--primary-gold)', cursor: npcSubmitting ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '0.88rem' }}>
                    {npcSubmitting ? 'Revealing…' : 'Confirm & Show NPC'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
      {npcViewImage && ReactDOM.createPortal(
        <div
          onClick={() => setNpcViewImage(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
          <img
            src={npcViewImage.url}
            alt={npcViewImage.name}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: '8px', objectFit: 'contain', border: '2px solid rgba(var(--theme-accent-rgb),0.5)', boxShadow: '0 8px 40px rgba(0,0,0,0.7)' }}
          />
          <div style={{ marginTop: '12px', color: 'var(--primary-gold)', fontWeight: 600, fontSize: '1.1rem' }}>{npcViewImage.name}</div>
          <div style={{ marginTop: '6px', color: '#9ca3af', fontSize: '0.8rem' }}>Click outside to close</div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ChatPanel;
