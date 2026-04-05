import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { ChatMessage, OutOfCombatRollRequest, DiceGroup } from '../../types/campaignTypes';

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
  { label: 'Initiative',  purpose: 'initiative', purposeDetail: 'Initiative',  modifier: 'dex', defaultDice: 'd20' },
  { label: 'Death Save',  purpose: 'death_save', purposeDetail: 'Death Save',  modifier: 'none', defaultDice: 'd20' },
  { label: 'Attack Roll', purpose: 'attack',     purposeDetail: 'Attack Roll', modifier: 'none', defaultDice: 'd20' },
  { label: 'Damage Roll', purpose: 'damage',     purposeDetail: 'Damage Roll', modifier: 'none', defaultDice: 'd6'  },
];

const ABILITY_BADGE: Record<string, string> = {
  str: '#ef4444', dex: '#22d3ee', con: '#f97316',
  int: '#818cf8', wis: '#4ade80', cha: '#f472b6', none: '#6b7280',
};

const DICE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

const MESSAGE_STYLES: Record<string, React.CSSProperties> = {
  player: { background: 'rgba(255,255,255,0.04)', borderLeft: '3px solid rgba(255,255,255,0.15)' },
  dm:     { background: 'rgba(251,191,36,0.07)',  borderLeft: '3px solid #fbbf24' },
  server: { background: 'rgba(167,139,250,0.07)', borderLeft: '3px solid #7c3aed' },
  roll_result: { background: 'rgba(74,222,128,0.07)', borderLeft: '3px solid #4ade80' },
};

const SENDER_COLORS: Record<string, string> = {
  player: '#e2e8f0', dm: '#fbbf24', server: '#a78bfa', roll_result: '#4ade80',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const ChatPanel: React.FC<Props> = ({
  isOpen, onClose, messages, socket, campaignId,
  currentUserId, currentUserName, isDM, onlinePlayers,
}) => {
  const [inputText, setInputText] = useState('');
  const [showRollPicker, setShowRollPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<PickerTab>('skills');
  const [rollTargetId, setRollTargetId] = useState<number | ''>('');
  const [selectedOption, setSelectedOption] = useState<RollOption | null>(null);
  const [rollDiceGroups, setRollDiceGroups] = useState<DiceGroup[]>([{ count: 1, diceType: 'd20' }]);

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
                  /* Per-group breakdown for multi-dice rolls */
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
                  /* Legacy single-die display */
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
                      <select value={grp.diceType}
                        onChange={e => setRollDiceGroups(prev => prev.map((g, i) => i === idx ? { ...g, diceType: e.target.value } : g))}
                        style={{ ...selectStyle, width: '62px', flex: 'unset' }}>
                        {DICE_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
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
    </div>
  );
};

export default ChatPanel;
