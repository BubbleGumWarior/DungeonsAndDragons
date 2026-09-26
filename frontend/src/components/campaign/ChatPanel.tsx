import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Socket } from 'socket.io-client';
import { ChatMessage, OutOfCombatRollRequest, DiceGroup, CampaignNPC, RollMode } from '../../types/campaignTypes';
import { npcAPI } from '../../services/api';
import { IMAGE_WIDTH, sizedImageUrl } from '../../utils/imageUrls';

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

const PICKER_TABS: { id: PickerTab; label: string }[] = [
  { id: 'skills', label: 'Skills' },
  { id: 'saves', label: 'Saves' },
  { id: 'other', label: 'Other' },
];

const ABILITY_BADGE: Record<string, string> = {
  str: '#f87171', dex: '#22d3ee', con: '#fb923c',
  int: '#a5b4fc', wis: '#4ade80', cha: '#f472b6', none: '#9ca3af',
};

const ROLL_MODES: { id: RollMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'advantage', label: 'Advantage' },
  { id: 'disadvantage', label: 'Disadvantage' },
];

const DICE_TYPES = ['d2', 'd3', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const MAX_LENGTH = 2000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Stable, readable name colour per sender so players are tellable apart at a glance. */
function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 58% 74%)`;
}

/* ───────────────────────── Icons (one stroke weight, one family) ───────────────────────── */

const Svg: React.FC<{ size?: number; children: React.ReactNode }> = ({ size = 18, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const IconChat: React.FC<{ size?: number }> = ({ size }) => (
  <Svg size={size}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /></Svg>
);
const IconClose: React.FC<{ size?: number }> = ({ size }) => (
  <Svg size={size}><path d="M6 6l12 12M18 6L6 18" /></Svg>
);
const IconSend: React.FC<{ size?: number }> = ({ size }) => (
  <Svg size={size}><path d="M21.5 2.5L10.5 13.5M21.5 2.5l-7 19-4-8.5-8.5-4 19.5-6.5z" /></Svg>
);
const IconD20: React.FC<{ size?: number }> = ({ size }) => (
  <Svg size={size}>
    <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" />
    <path d="M12 6.5l5 8.5H7z" />
    <path d="M12 2v4.5M17 15l3.5 2M7 15l-3.5 2M12 6.5l8.5 .5M12 6.5L3.5 7M7 15l5 7 5-7" />
  </Svg>
);
const IconUser: React.FC<{ size?: number }> = ({ size }) => (
  <Svg size={size}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></Svg>
);
const IconArrowDown: React.FC<{ size?: number }> = ({ size }) => (
  <Svg size={size}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>
);
const IconPlus: React.FC<{ size?: number }> = ({ size }) => (
  <Svg size={size}><path d="M12 5v14M5 12h14" /></Svg>
);
const IconCheck: React.FC<{ size?: number }> = ({ size }) => (
  <Svg size={size}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
);

/* ───────────────────────── Styles ───────────────────────── */

const CHAT_CSS = `
.cp-root {
  --cp-acc: var(--theme-accent-rgb, 212, 193, 156);
  --cp-bg: #141312;
  --cp-surface: #1d1c1a;
  --cp-surface-2: #262421;
  --cp-line: rgba(255,255,255,0.08);
  --cp-text: #ece8df;
  --cp-muted: rgba(236,232,223,0.62);
  --cp-ease: cubic-bezier(0.16, 1, 0.3, 1);
  position: fixed; top: 12px; right: 12px; bottom: 12px;
  width: min(440px, calc(100vw - 24px));
  z-index: 1200;
  display: flex; flex-direction: column;
  background: var(--cp-bg);
  border: 1px solid rgba(var(--cp-acc), 0.24);
  border-radius: 18px;
  box-shadow: 0 28px 64px -16px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,0,0,0.4);
  color: var(--cp-text);
  font-family: var(--font-primary, 'Segoe UI', sans-serif);
  overflow: hidden;
  color-scheme: dark;
  transform-origin: 100% 100%;
  transform: translateX(32px) scale(0.96);
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: transform 0.22s var(--cp-ease), opacity 0.18s ease, visibility 0s linear 0.22s;
}
.cp-root.cp-open {
  transform: none; opacity: 1; visibility: visible; pointer-events: auto;
  transition: transform 0.45s var(--cp-ease), opacity 0.25s ease, visibility 0s;
}
.cp-root *, .cp-root *::before, .cp-root *::after { box-sizing: border-box; }
.cp-root ::selection { background: rgba(var(--cp-acc), 0.45); color: #fff; }
.cp-root button:focus-visible, .cp-root textarea:focus-visible, .cp-root select:focus-visible, .cp-root input:focus-visible {
  outline: 2px solid rgba(var(--cp-acc), 0.9); outline-offset: 2px;
}

/* Header */
.cp-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 14px 12px 18px; border-bottom: 1px solid var(--cp-line); }
.cp-title { margin: 0; font-family: var(--font-fantasy, serif); font-size: 1.08rem; letter-spacing: 0.05em; color: var(--text-gold, #d4c19c); line-height: 1.2; }
.cp-sub { display: flex; align-items: center; gap: 7px; margin-top: 3px; font-size: 0.75rem; color: var(--cp-muted); }
.cp-dot { width: 7px; height: 7px; border-radius: 50%; background: #5ec27b; flex: none; }
.cp-iconbtn { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 11px; border: 1px solid transparent; background: transparent; color: var(--cp-muted); cursor: pointer; transition: background 0.15s ease, color 0.15s ease, transform 0.2s var(--cp-ease); }
.cp-iconbtn:hover { background: rgba(255,255,255,0.07); color: var(--cp-text); }
.cp-iconbtn:active { transform: scale(0.9); }

/* Message list */
.cp-listwrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.cp-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px 14px 10px; display: flex; flex-direction: column; scrollbar-width: thin; scrollbar-color: rgba(var(--cp-acc), 0.35) transparent; -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 16px); mask-image: linear-gradient(to bottom, transparent 0, #000 16px); }
.cp-list::-webkit-scrollbar { width: 8px; }
.cp-list::-webkit-scrollbar-thumb { background: rgba(var(--cp-acc), 0.3); border-radius: 8px; border: 2px solid var(--cp-bg); }
.cp-empty { margin: auto; text-align: center; max-width: 250px; color: var(--cp-muted); display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 0; }
.cp-empty svg { color: rgba(var(--cp-acc), 0.7); }
.cp-empty strong { color: var(--cp-text); font-weight: 600; font-size: 0.98rem; }
.cp-empty span { font-size: 0.84rem; line-height: 1.5; }

.cp-row { display: flex; flex-direction: column; align-items: flex-start; max-width: 100%; margin-top: 12px; }
.cp-row.cp-own { align-items: flex-end; }
.cp-row.cp-cont { margin-top: 3px; }
.cp-meta { display: flex; align-items: center; gap: 8px; margin: 0 6px 4px; font-size: 0.76rem; }
.cp-name { font-weight: 600; }
.cp-time { color: var(--cp-muted); font-size: 0.7rem; font-variant-numeric: tabular-nums; }
.cp-dmtag { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; padding: 1px 6px; border-radius: 999px; color: var(--text-gold, #d4c19c); background: rgba(var(--cp-acc), 0.14); border: 1px solid rgba(var(--cp-acc), 0.4); }
.cp-bubble { max-width: 88%; padding: 8px 13px; border-radius: 16px; background: var(--cp-surface); border: 1px solid var(--cp-line); font-size: 0.92rem; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.cp-row:not(.cp-own) .cp-bubble { border-bottom-left-radius: 5px; }
.cp-row.cp-own .cp-bubble { border-bottom-right-radius: 5px; background: rgba(var(--cp-acc), 0.2); border-color: rgba(var(--cp-acc), 0.36); color: #f7f2e7; }
.cp-row.cp-cont:not(.cp-own) .cp-bubble { border-top-left-radius: 5px; }
.cp-row.cp-cont.cp-own .cp-bubble { border-top-right-radius: 5px; }
.cp-row.cp-dm:not(.cp-own) .cp-bubble { background: rgba(var(--cp-acc), 0.08); border-color: rgba(var(--cp-acc), 0.42); }

/* Server line */
.cp-sys { align-self: center; display: flex; align-items: center; gap: 8px; margin-top: 14px; padding: 6px 14px; max-width: 94%; border-radius: 999px; background: rgba(255,255,255,0.045); font-size: 0.78rem; line-height: 1.35; color: var(--cp-muted); text-align: center; }
.cp-sys svg { flex: none; color: rgba(var(--cp-acc), 0.85); }

/* Roll result */
.cp-roll { align-self: stretch; display: flex; align-items: center; gap: 14px; margin-top: 12px; padding: 12px 14px 12px 12px; border-radius: 16px; background: linear-gradient(160deg, var(--cp-surface-2), var(--cp-surface)); border: 1px solid var(--cp-line); }
.cp-roll-total { position: relative; flex: none; width: 66px; height: 66px; display: grid; place-items: center; border-radius: 15px; background: rgba(var(--cp-acc), 0.14); border: 1px solid rgba(var(--cp-acc), 0.45); color: var(--text-gold, #d4c19c); font-size: 1.95rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.cp-roll-total.nat20 { background: rgba(94,194,123,0.15); border-color: rgba(94,194,123,0.65); color: #8fe3a8; }
.cp-roll-total.nat1 { background: rgba(239,84,84,0.14); border-color: rgba(239,84,84,0.6); color: #ff9494; }
.cp-roll-total.nat20::after { content: ''; position: absolute; inset: -1px; border-radius: 15px; border: 2px solid rgba(94,194,123,0.75); pointer-events: none; opacity: 0; }
.cp-roll-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.cp-roll-title { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; font-weight: 600; font-size: 0.96rem; line-height: 1.2; }
.cp-flag { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; }
.cp-flag.nat20 { color: #8fe3a8; background: rgba(94,194,123,0.16); }
.cp-flag.nat1 { color: #ff9494; background: rgba(239,84,84,0.16); }
.cp-roll-by { font-size: 0.75rem; color: var(--cp-muted); }
.cp-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.cp-glabel { font-size: 0.72rem; color: var(--cp-muted); margin-right: 1px; }
.cp-die { min-width: 27px; height: 27px; padding: 0 7px; display: inline-grid; place-items: center; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid var(--cp-line); font-size: 0.82rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.cp-die.mod { color: var(--text-gold, #d4c19c); border-color: rgba(var(--cp-acc), 0.3); background: rgba(var(--cp-acc), 0.08); }
.cp-plain-roll { font-size: 0.86rem; color: var(--cp-text); }
.cp-flag.adv { color: #8fe3a8; background: rgba(94,194,123,0.16); }
.cp-flag.dis { color: #ff9494; background: rgba(239,84,84,0.16); }
.cp-sets { display: flex; flex-direction: column; gap: 5px; }
.cp-set { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 4px 8px 4px 6px; border-radius: 10px; border: 1px solid transparent; }
.cp-set.kept { border-color: var(--cp-set-color); background: color-mix(in srgb, var(--cp-set-color) 12%, transparent); }
.cp-set.dropped { border-style: dashed; border-color: var(--cp-line); opacity: 0.6; }
.cp-set-tag { margin-left: auto; font-size: 0.64rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
.cp-set.kept .cp-set-tag { color: var(--cp-set-color); }
.cp-set.dropped .cp-set-tag { color: var(--cp-muted); }
.cp-set.dropped .cp-die { text-decoration: line-through; color: var(--cp-muted); }
.cp-set.kept .cp-die { border-color: var(--cp-set-color); }
.cp-seg.modes { margin-bottom: 0; }
.cp-seg.modes .cp-seg-ind.advantage { background: rgba(94,194,123,0.2); border-color: rgba(94,194,123,0.6); }
.cp-seg.modes .cp-seg-ind.disadvantage { background: rgba(239,84,84,0.2); border-color: rgba(239,84,84,0.6); }

/* NPC reveal */
.cp-npc { align-self: stretch; display: flex; align-items: center; gap: 14px; margin-top: 12px; padding: 12px; border-radius: 16px; background: linear-gradient(160deg, rgba(var(--cp-acc), 0.15), rgba(var(--cp-acc), 0.04)); border: 1px solid rgba(var(--cp-acc), 0.38); }
.cp-npc img { width: 68px; height: 68px; flex: none; border-radius: 16px; object-fit: cover; border: 1px solid rgba(var(--cp-acc), 0.55); cursor: zoom-in; transition: transform 0.3s var(--cp-ease); }
.cp-npc img:hover { transform: scale(1.04); }
.cp-npc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.cp-npc-name { font-family: var(--font-fantasy, serif); font-size: 1.05rem; color: var(--text-gold, #d4c19c); line-height: 1.2; }
.cp-npc-sub { font-size: 0.75rem; color: var(--cp-muted); margin-bottom: 5px; }

/* Buttons */
.cp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 14px; border-radius: 12px; border: 1px solid rgba(var(--cp-acc), 0.55); background: rgba(var(--cp-acc), 0.16); color: var(--cp-text); font: inherit; font-size: 0.86rem; font-weight: 600; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease, transform 0.2s var(--cp-ease), filter 0.15s ease; }
.cp-btn:hover:not(:disabled) { background: rgba(var(--cp-acc), 0.26); }
.cp-btn:active:not(:disabled) { transform: scale(0.97); }
.cp-btn:disabled { opacity: 0.4; cursor: default; }
.cp-btn.primary { background: rgb(var(--cp-acc)); border-color: transparent; color: #141312; }
.cp-btn.primary:hover:not(:disabled) { filter: brightness(1.08); background: rgb(var(--cp-acc)); }
.cp-btn.ghost { background: transparent; border-color: var(--cp-line); color: var(--cp-muted); }
.cp-btn.ghost:hover:not(:disabled) { background: rgba(255,255,255,0.06); color: var(--cp-text); }
.cp-btn.sm { padding: 5px 11px; font-size: 0.78rem; border-radius: 9px; }
.cp-btn.saved { background: rgba(94,194,123,0.14); border-color: rgba(94,194,123,0.5); color: #8fe3a8; opacity: 1; }

/* New message pill */
.cp-jump { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px 7px 12px; border-radius: 999px; border: 1px solid rgba(var(--cp-acc), 0.6); background: var(--cp-surface-2); color: var(--cp-text); font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; box-shadow: 0 10px 24px -8px rgba(0,0,0,0.8); animation: cp-jump-in 0.4s var(--cp-ease) both; }
.cp-jump:hover { background: rgba(var(--cp-acc), 0.22); }

/* Roll drawer */
.cp-drawer { flex: none; display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.38s var(--cp-ease); }
.cp-drawer.open { grid-template-rows: 1fr; }
.cp-drawer-clip { min-height: 0; overflow: hidden; visibility: hidden; transition: visibility 0s linear 0.38s; }
.cp-drawer.open .cp-drawer-clip { visibility: visible; transition: visibility 0s; }
.cp-picker { max-height: calc(100vh - 300px); overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(var(--cp-acc), 0.35) transparent; padding: 14px 14px 12px; border-top: 1px solid var(--cp-line); background: linear-gradient(to bottom, rgba(var(--cp-acc), 0.05), transparent 60%); }
.cp-ph { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.cp-ptitle { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 600; color: var(--text-gold, #d4c19c); }
.cp-ph .cp-iconbtn { width: 30px; height: 30px; }
.cp-plabel { font-size: 0.72rem; color: var(--cp-muted); margin-bottom: 6px; }
.cp-players { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.cp-pill { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--cp-line); background: var(--cp-surface); color: var(--cp-text); font: inherit; font-size: 0.82rem; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease, transform 0.2s var(--cp-ease); }
.cp-pill:hover { border-color: rgba(var(--cp-acc), 0.5); }
.cp-pill:active { transform: scale(0.95); }
.cp-pill.on { background: rgba(var(--cp-acc), 0.22); border-color: rgba(var(--cp-acc), 0.8); color: #fff; }
.cp-none { font-size: 0.82rem; color: var(--cp-muted); margin-bottom: 12px; }
.cp-seg { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); padding: 3px; margin-bottom: 8px; border-radius: 13px; background: var(--cp-surface); border: 1px solid var(--cp-line); }
.cp-seg-ind { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 3); border-radius: 10px; background: rgba(var(--cp-acc), 0.22); border: 1px solid rgba(var(--cp-acc), 0.5); transition: transform 0.38s var(--cp-ease); }
.cp-seg button { position: relative; z-index: 1; padding: 7px 0; border: 0; background: transparent; color: var(--cp-muted); font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: color 0.2s ease; }
.cp-seg button.on { color: #fff; }
.cp-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; max-height: min(22vh, 190px); overflow-y: auto; padding: 2px 3px 2px 0; scrollbar-width: thin; scrollbar-color: rgba(var(--cp-acc), 0.35) transparent; }
.cp-opt { display: flex; align-items: center; gap: 8px; padding: 8px 9px; border-radius: 11px; background: var(--cp-surface); border: 1px solid var(--cp-line); color: var(--cp-text); font: inherit; font-size: 0.83rem; text-align: left; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease, transform 0.2s var(--cp-ease); }
.cp-opt:hover { border-color: rgba(var(--cp-acc), 0.5); }
.cp-opt:active { transform: scale(0.97); }
.cp-opt.on { background: rgba(var(--cp-acc), 0.2); border-color: rgba(var(--cp-acc), 0.8); color: #fff; }
.cp-abil { flex: none; min-width: 32px; padding: 2px 0; text-align: center; border-radius: 6px; background: rgba(0,0,0,0.38); font-size: 0.64rem; font-weight: 700; letter-spacing: 0.05em; }
.cp-build { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--cp-line); display: flex; flex-direction: column; gap: 8px; }
.cp-hint { font-size: 0.82rem; color: var(--cp-muted); }
.cp-drow { display: flex; align-items: center; gap: 7px; }
.cp-times { color: var(--cp-muted); font-size: 0.8rem; }
.cp-field { background: var(--cp-surface-2); border: 1px solid var(--cp-line); border-radius: 9px; color: var(--cp-text); padding: 7px 9px; font: inherit; font-size: 0.86rem; }
.cp-field.num { width: 54px; text-align: center; }
.cp-field.die { width: 76px; text-align: center; }
.cp-add { align-self: flex-start; }
.cp-actions { display: flex; gap: 8px; margin-top: 4px; }
.cp-actions .cp-btn.primary { flex: 1; }

/* Composer */
.cp-composer { flex: none; padding: 10px 12px 12px; border-top: 1px solid var(--cp-line); }
.cp-inputwrap { display: flex; align-items: flex-end; gap: 4px; padding: 5px; border-radius: 18px; background: var(--cp-surface); border: 1px solid var(--cp-line); transition: border-color 0.2s ease, box-shadow 0.25s ease; }
.cp-inputwrap:focus-within { border-color: rgba(var(--cp-acc), 0.65); box-shadow: 0 0 0 4px rgba(var(--cp-acc), 0.13); }
.cp-tool { width: 38px; height: 38px; flex: none; display: grid; place-items: center; border-radius: 13px; border: 0; background: transparent; color: var(--cp-muted); cursor: pointer; transition: background 0.15s ease, color 0.15s ease, transform 0.2s var(--cp-ease); }
.cp-tool:hover { background: rgba(var(--cp-acc), 0.14); color: var(--text-gold, #d4c19c); }
.cp-tool:active { transform: scale(0.9); }
.cp-tool.on { background: rgba(var(--cp-acc), 0.22); color: var(--text-gold, #d4c19c); }
.cp-textarea { flex: 1; min-width: 0; resize: none; border: 0; outline: 0 !important; background: transparent; color: var(--cp-text); font: inherit; font-size: 0.93rem; line-height: 1.4; padding: 9px 6px; max-height: 120px; }
.cp-textarea::placeholder { color: rgba(236,232,223,0.6); }
.cp-send { width: 38px; height: 38px; flex: none; display: grid; place-items: center; border-radius: 13px; border: 0; background: rgb(var(--cp-acc)); color: #141312; cursor: pointer; transition: transform 0.25s var(--cp-ease), opacity 0.2s ease, filter 0.15s ease; }
.cp-send:hover:not(:disabled) { filter: brightness(1.08); }
.cp-send:active:not(:disabled) { transform: scale(0.88); }
.cp-send:disabled { opacity: 0.28; cursor: default; }
.cp-count { margin: 5px 8px 0; text-align: right; font-size: 0.7rem; color: var(--cp-muted); font-variant-numeric: tabular-nums; }

/* Motion — entrances only for messages that arrive live */
.cp-fresh { animation: cp-in 0.42s var(--cp-ease) both; }
.cp-row.cp-own.cp-fresh { transform-origin: 100% 100%; }
.cp-row:not(.cp-own).cp-fresh { transform-origin: 0 100%; }
.cp-roll.cp-fresh .cp-roll-total { animation: cp-pop 0.6s var(--cp-ease) 0.08s both; }
.cp-roll.cp-fresh .cp-roll-total.nat20::after { animation: cp-ring 1s var(--cp-ease) 0.3s both; }
@keyframes cp-in { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes cp-pop { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes cp-ring { 0% { opacity: 0.9; transform: scale(1); } 100% { opacity: 0; transform: scale(1.55); } }
@keyframes cp-jump-in { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }

@media (max-width: 560px) {
  .cp-root { top: 0; right: 0; bottom: 0; width: 100vw; border-radius: 0; border-width: 0; transform-origin: 100% 100%; }
  .cp-opts { max-height: 24vh; }
}
@media (prefers-reduced-motion: reduce) {
  .cp-root, .cp-root *, .cp-root *::before, .cp-root *::after, .cp-fab, .cp-fab * {
    animation-duration: 0.01ms !important; animation-delay: 0s !important;
    transition-duration: 0.01ms !important; transition-delay: 0s !important;
  }
}
`;

const FAB_CSS = `
.cp-fab { position: fixed; right: 1.5rem; bottom: 1.5rem; width: 54px; height: 54px; z-index: 1201; display: grid; place-items: center; border-radius: 17px; background: #1a1917; border: 1px solid rgba(var(--theme-accent-rgb, 212, 193, 156), 0.55); color: var(--text-gold, #d4c19c); cursor: pointer; box-shadow: 0 12px 28px -8px rgba(0,0,0,0.75); transition: transform 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease, box-shadow 0.25s ease, background 0.2s ease, visibility 0s; }
.cp-fab:hover { transform: translateY(-3px); background: #232120; box-shadow: 0 16px 30px -8px rgba(0,0,0,0.8), 0 0 0 4px rgba(var(--theme-accent-rgb, 212, 193, 156), 0.14); }
.cp-fab:active { transform: scale(0.93); }
.cp-fab:focus-visible { outline: 2px solid rgba(var(--theme-accent-rgb, 212, 193, 156), 0.9); outline-offset: 3px; }
.cp-fab.hide { transform: scale(0.55) translateY(10px); opacity: 0; pointer-events: none; visibility: hidden; transition: transform 0.2s ease, opacity 0.15s ease, visibility 0s linear 0.2s; }
.cp-fab-badge { position: absolute; top: -7px; right: -7px; min-width: 21px; height: 21px; padding: 0 5px; display: grid; place-items: center; border-radius: 999px; background: #e5484d; color: #fff; border: 2px solid #141312; font-size: 0.68rem; font-weight: 700; font-variant-numeric: tabular-nums; animation: cp-fab-pop 0.5s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes cp-fab-pop { 0% { transform: scale(0.4); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .cp-fab, .cp-fab * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; transition-delay: 0s !important; } }
`;

/** Floating launcher for the chat panel. It steps aside while the panel is open. */
export const ChatToggleButton: React.FC<{ open: boolean; unread: number; onClick: () => void }> = ({ open, unread, onClick }) => (
  <>
    <style>{FAB_CSS}</style>
    <button className={`cp-fab${open ? ' hide' : ''}`} onClick={onClick} aria-label={unread > 0 ? `Open campaign chat, ${unread} unread` : 'Open campaign chat'} title="Campaign chat" tabIndex={open ? -1 : 0}>
      <IconChat size={24} />
      {unread > 0 && !open && (
        <span key={unread} className="cp-fab-badge">{unread > 99 ? '99+' : unread}</span>
      )}
    </button>
  </>
);

/* ───────────────────────── Panel ───────────────────────── */

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
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  const [newBelow, setNewBelow] = useState(0);

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(messages.length);
  const prevIdsRef = useRef<Set<number> | null>(null);

  // Messages that arrived live since the last render animate in; a bulk history load does not.
  const freshIds = new Set<number>();
  if (prevIdsRef.current) {
    const added = messages.filter(m => !prevIdsRef.current!.has(m.id));
    if (added.length <= 3) added.forEach(m => freshIds.add(m.id));
  }
  useEffect(() => { prevIdsRef.current = new Set(messages.map(m => m.id)); }, [messages]);

  const scrollToBottom = (smooth: boolean) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  // Follow new messages when the reader is at the bottom (or wrote the message); otherwise surface a jump pill.
  useLayoutEffect(() => {
    const added = messages.length - prevLenRef.current;
    prevLenRef.current = messages.length;
    if (added <= 0) return;
    const last = messages[messages.length - 1];
    const own = !!last && last.sender_id !== null && Number(last.sender_id) === Number(currentUserId);
    if (!isOpen) { scrollToBottom(false); return; }
    if (atBottomRef.current || own) scrollToBottom(true);
    else setNewBelow(n => n + added);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (isOpen) {
      atBottomRef.current = true;
      setNewBelow(0);
      scrollToBottom(false);
    }
  }, [isOpen]);

  // Keep the latest message in view when the list is resized (roll drawer, composer growth).
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (atBottomRef.current) scrollToBottom(false); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Grow the composer with its content, up to a cap
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [inputText]);

  // Listen for NPC reveals via socket
  useEffect(() => {
    if (!socket) return;
    const handler = (npc: CampaignNPC) => { onNPCRevealed(npc); };
    socket.on('npcRevealed', handler);
    return () => { socket.off('npcRevealed', handler); };
  }, [socket, onNPCRevealed]);

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottomRef.current && newBelow) setNewBelow(0);
  };

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
    socket.emit('chatMessage', { campaignId, content: text.slice(0, MAX_LENGTH) });
    setInputText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendMessage(); }
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
      rollMode,
    };
    socket.emit('requestOutOfCombatRoll', req);
    setShowRollPicker(false);
    setRollTargetId('');
    setSelectedOption(null);
    setRollDiceGroups([{ count: 1, diceType: 'd20' }]);
    setRollMode('normal');
  };

  const handleRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || showNPCModal || npcViewImage) return;
    if (showRollPicker) setShowRollPicker(false);
    else onClose();
  };

  const tabOptions = pickerTab === 'skills' ? SKILLS : pickerTab === 'saves' ? SAVING_THROWS : OTHER_ROLLS;
  const tabIndex = PICKER_TABS.findIndex(t => t.id === pickerTab);
  const selectablePlayers = onlinePlayers.filter(p => p.userId !== currentUserId);
  const targetPlayer = selectablePlayers.find(p => p.userId === rollTargetId);
  const canSendRoll = rollTargetId !== '' && !!selectedOption;

  /* ── Message renderers ── */

  const renderRoll = (msg: ChatMessage, fresh: boolean) => {
    const rd = msg.roll_data;
    if (!rd) return null;
    const groups = rd.diceGroups && rd.diceGroups.length > 0
      ? rd.diceGroups
      : [{ diceType: rd.diceType, rolls: rd.rolls }];
    const isSingleD20 = groups.length === 1 && groups[0].diceType === 'd20' && groups[0].rolls.length === 1;
    const nat20 = isSingleD20 && groups[0].rolls[0] === 20;
    const nat1 = isSingleD20 && groups[0].rolls[0] === 1;
    const purpose = (rd as any).purpose || rd.purposeDetail || 'Roll';
    const tone = nat20 ? ' nat20' : nat1 ? ' nat1' : '';
    const sets = rd.rollMode && rd.rollMode !== 'normal' && rd.rollSets && rd.rollSets.length > 1 ? rd.rollSets : null;
    const isAdv = rd.rollMode === 'advantage';
    const setColor = isAdv ? '#8fe3a8' : '#ff9494';
    const modChip = rd.modifier !== 0 && (
      <span className="cp-die mod" title="Modifier">{rd.modifier >= 0 ? '+' : '−'}{Math.abs(rd.modifier)}</span>
    );
    return (
      <div key={msg.id} className={`cp-roll${fresh ? ' cp-fresh' : ''}`}>
        <div className={`cp-roll-total${tone}`} aria-label={`Total ${rd.total}`}>{rd.total}</div>
        <div className="cp-roll-body">
          <div>
            <div className="cp-roll-title">
              <span>{purpose}</span>
              {nat20 && <span className="cp-flag nat20">Natural 20</span>}
              {nat1 && <span className="cp-flag nat1">Natural 1</span>}
              {sets && <span className={`cp-flag ${isAdv ? 'adv' : 'dis'}`}>{isAdv ? 'Advantage' : 'Disadvantage'}</span>}
            </div>
            <div className="cp-roll-by">{msg.sender_name} · {formatTime(msg.created_at)}</div>
          </div>
          {sets ? (
            <div className="cp-sets" style={{ ['--cp-set-color' as any]: setColor }}>
              {sets.map((set, si) => (
                <div key={si} className={`cp-set ${set.kept ? 'kept' : 'dropped'}`}>
                  <span className="cp-glabel">Roll {si + 1}</span>
                  {set.groups.map((grp, gi) => (
                    <React.Fragment key={gi}>
                      {set.groups.length > 1 && <span className="cp-glabel">{grp.rolls.length}{grp.diceType}</span>}
                      {grp.rolls.map((r, ri) => <span key={ri} className="cp-die">{r}</span>)}
                    </React.Fragment>
                  ))}
                  {set.groups.reduce((n, g) => n + g.rolls.length, 0) > 1 && <span className="cp-glabel">= {set.sum}</span>}
                  <span className="cp-set-tag">{set.kept ? `✔ kept (${isAdv ? 'higher' : 'lower'})` : '✖ dropped'}</span>
                </div>
              ))}
              {modChip && <div className="cp-chips">{modChip}</div>}
            </div>
          ) : (
            <div className="cp-chips">
              {groups.map((grp, gi) => (
                <React.Fragment key={gi}>
                  <span className="cp-glabel">{grp.rolls.length}{grp.diceType}</span>
                  {grp.rolls.map((r, ri) => <span key={ri} className="cp-die">{r}</span>)}
                </React.Fragment>
              ))}
              {modChip}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderNpc = (msg: ChatMessage, fresh: boolean) => {
    let npcId: number | null = null;
    try { npcId = JSON.parse(msg.content).npcId; } catch {}
    const npc = npcId !== null ? campaignNPCs.find(n => n.id === npcId) : null;
    const alreadySaved = npcId !== null && savedNPCIds.has(npcId);
    return (
      <div key={msg.id} className={`cp-npc${fresh ? ' cp-fresh' : ''}`}>
        {npc ? (
          <>
            {npc.image_url ? (
              <img src={sizedImageUrl(npc.image_url, IMAGE_WIDTH.small)} alt={npc.name} loading="lazy"
                onClick={() => npc.image_url && setNpcViewImage({ url: sizedImageUrl(npc.image_url, IMAGE_WIDTH.large) || npc.image_url, name: npc.name })} />
            ) : null}
            <div className="cp-npc-body">
              <div className="cp-npc-name">{npc.name}</div>
              <div className="cp-npc-sub">Revealed to the table · {formatTime(msg.created_at)}</div>
              {!isDM && (
                <button
                  className={`cp-btn sm${alreadySaved ? ' saved' : ''}`}
                  onClick={() => npcId !== null && handleSaveNPC(npcId)}
                  disabled={alreadySaved || savingNPCId === npcId}>
                  {alreadySaved ? <><IconCheck size={14} /> Saved</> : savingNPCId === npcId ? 'Saving…' : 'Save to characters'}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="cp-npc-sub" style={{ margin: 0 }}>Loading NPC…</div>
        )}
      </div>
    );
  };

  const renderMessages = () => messages.map((msg, i) => {
    const fresh = freshIds.has(msg.id);

    if (msg.message_type === 'npc_reveal') return renderNpc(msg, fresh);
    if (msg.message_type === 'roll_result' && msg.roll_data) return renderRoll(msg, fresh);
    if (msg.message_type === 'server') {
      return (
        <div key={msg.id} className={`cp-sys${fresh ? ' cp-fresh' : ''}`}>
          <IconD20 size={14} />
          <span>{msg.content}</span>
        </div>
      );
    }

    // Chat message (player / dm, or a roll_result that lost its data)
    const isOwn = msg.sender_id !== null && Number(msg.sender_id) === Number(currentUserId);
    const prev = messages[i - 1];
    const continues = !!prev
      && (prev.message_type === 'player' || prev.message_type === 'dm')
      && (msg.message_type === 'player' || msg.message_type === 'dm')
      && prev.sender_id === msg.sender_id
      && new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS;
    const isDmMsg = msg.message_type === 'dm';

    return (
      <div key={msg.id}
        className={`cp-row${isOwn ? ' cp-own' : ''}${isDmMsg ? ' cp-dm' : ''}${continues ? ' cp-cont' : ''}${fresh ? ' cp-fresh' : ''}`}>
        {!continues && (
          <div className="cp-meta">
            <span className="cp-name" style={{ color: isDmMsg ? 'var(--text-gold)' : nameColor(msg.sender_name) }}>
              {isOwn ? 'You' : msg.sender_name}
            </span>
            {isDmMsg && <span className="cp-dmtag">DM</span>}
            <span className="cp-time">{formatTime(msg.created_at)}</span>
          </div>
        )}
        <div className="cp-bubble">{msg.content}</div>
      </div>
    );
  });

  return (
    <div className={`cp-root${isOpen ? ' cp-open' : ''}`} onKeyDown={handleRootKeyDown} role="complementary" aria-label="Campaign chat" aria-hidden={!isOpen}>
      <style>{CHAT_CSS}</style>

      {/* Header */}
      <div className="cp-head">
        <div>
          <h2 className="cp-title">Campaign Chat</h2>
          <div className="cp-sub">
            <span className="cp-dot" />
            {onlinePlayers.length === 0 ? 'No adventurers online' : `${onlinePlayers.length} ${onlinePlayers.length === 1 ? 'adventurer' : 'adventurers'} at the table`}
          </div>
        </div>
        <button className="cp-iconbtn" onClick={onClose} aria-label="Close chat" title="Close (Esc)"><IconClose /></button>
      </div>

      {/* Message list */}
      <div className="cp-listwrap">
        <div className="cp-list" ref={listRef} onScroll={handleListScroll} role="log" aria-live="polite">
          {messages.length === 0 ? (
            <div className="cp-empty">
              <IconChat size={30} />
              <strong>The table is quiet</strong>
              <span>Messages, dice rolls and NPC reveals will gather here.</span>
            </div>
          ) : renderMessages()}
        </div>
        {newBelow > 0 && (
          <button className="cp-jump" onClick={() => { scrollToBottom(true); setNewBelow(0); }}>
            <IconArrowDown size={15} />
            {newBelow === 1 ? '1 new message' : `${newBelow} new messages`}
          </button>
        )}
      </div>

      {/* DM roll request drawer */}
      {isDM && (
        <div className={`cp-drawer${showRollPicker ? ' open' : ''}`}>
          <div className="cp-drawer-clip">
            <div className="cp-picker">
              <div className="cp-ph">
                <div className="cp-ptitle"><IconD20 size={18} /> Request a roll</div>
                <button className="cp-iconbtn" onClick={() => { setShowRollPicker(false); setSelectedOption(null); }} aria-label="Close roll request"><IconClose size={16} /></button>
              </div>

              <div className="cp-plabel">Who rolls?</div>
              {selectablePlayers.length === 0 ? (
                <div className="cp-none">No players are online right now.</div>
              ) : (
                <div className="cp-players">
                  {selectablePlayers.map(p => (
                    <button key={p.userId} className={`cp-pill${rollTargetId === p.userId ? ' on' : ''}`}
                      aria-pressed={rollTargetId === p.userId}
                      onClick={() => setRollTargetId(prev => prev === p.userId ? '' : p.userId)}>
                      {p.characterName}
                    </button>
                  ))}
                </div>
              )}

              <div className="cp-seg" role="tablist">
                <span className="cp-seg-ind" style={{ transform: `translateX(${tabIndex * 100}%)` }} />
                {PICKER_TABS.map(tab => (
                  <button key={tab.id} role="tab" aria-selected={pickerTab === tab.id} className={pickerTab === tab.id ? 'on' : ''}
                    onClick={() => { setPickerTab(tab.id); setSelectedOption(null); }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="cp-opts">
                {tabOptions.map(opt => {
                  const active = selectedOption?.purposeDetail === opt.purposeDetail;
                  return (
                    <button key={opt.purposeDetail} className={`cp-opt${active ? ' on' : ''}`} onClick={() => selectRollOption(opt)} aria-pressed={active}>
                      <span className="cp-abil" style={{ color: ABILITY_BADGE[opt.modifier] ?? '#9ca3af' }}>
                        {opt.modifier === 'none' ? '—' : opt.modifier.toUpperCase()}
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="cp-build">
                {selectedOption ? (
                  <>
                    <div>
                      <div className="cp-plabel">Roll mode</div>
                      <div className="cp-seg modes" role="radiogroup" aria-label="Roll mode">
                        <span className={`cp-seg-ind ${rollMode}`} style={{ transform: `translateX(${ROLL_MODES.findIndex(m => m.id === rollMode) * 100}%)` }} />
                        {ROLL_MODES.map(m => (
                          <button key={m.id} role="radio" aria-checked={rollMode === m.id} className={rollMode === m.id ? 'on' : ''}
                            onClick={() => setRollMode(m.id)}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                      {rollMode !== 'normal' && (
                        <div className="cp-hint" style={{ marginTop: 6 }}>
                          Rolls the dice twice and keeps the {rollMode === 'advantage' ? 'higher' : 'lower'} result. Both rolls show in the chat.
                        </div>
                      )}
                    </div>
                    {rollDiceGroups.map((grp, idx) => (
                      <div key={idx} className="cp-drow">
                        <input className="cp-field num" type="number" min={1} max={10} value={grp.count} aria-label="Number of dice"
                          onChange={e => {
                            const v = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                            setRollDiceGroups(prev => prev.map((g, i) => i === idx ? { ...g, count: v } : g));
                          }} />
                        <span className="cp-times">×</span>
                        {selectedOption.purposeDetail === 'Custom Roll' ? (
                          <input className="cp-field die" type="text" value={grp.diceType} placeholder="d20" aria-label="Die type"
                            onChange={e => {
                              const v = e.target.value.trim() || 'd20';
                              setRollDiceGroups(prev => prev.map((g, i) => i === idx ? { ...g, diceType: v } : g));
                            }} />
                        ) : (
                          <select className="cp-field die" value={grp.diceType} aria-label="Die type"
                            onChange={e => setRollDiceGroups(prev => prev.map((g, i) => i === idx ? { ...g, diceType: e.target.value } : g))}>
                            {DICE_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        )}
                        <span className="cp-hint" style={{ flex: 1, minWidth: 0 }}>
                          {idx === 0 ? selectedOption.purposeDetail : 'extra dice'}
                        </span>
                        {rollDiceGroups.length > 1 && (
                          <button className="cp-iconbtn" style={{ width: 30, height: 30 }} aria-label="Remove dice group"
                            onClick={() => setRollDiceGroups(prev => prev.filter((_, i) => i !== idx))}>
                            <IconClose size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                    {rollDiceGroups.length < 6 && (
                      <button className="cp-btn ghost sm cp-add" onClick={() => setRollDiceGroups(prev => [...prev, { count: 1, diceType: 'd6' }])}>
                        <IconPlus size={14} /> Add dice
                      </button>
                    )}
                  </>
                ) : (
                  <div className="cp-hint">Pick a skill, save or roll type above.</div>
                )}
                <div className="cp-actions">
                  <button className="cp-btn primary" onClick={sendRollRequest} disabled={!canSendRoll}>
                    {targetPlayer && selectedOption ? `Ask ${targetPlayer.characterName} to roll${rollMode !== 'normal' ? ` with ${rollMode}` : ''}` : 'Send request'}
                  </button>
                  <button className="cp-btn ghost" onClick={() => { setShowRollPicker(false); setSelectedOption(null); }}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="cp-composer">
        <div className="cp-inputwrap">
          {isDM && (
            <button className={`cp-tool${showRollPicker ? ' on' : ''}`} onClick={() => setShowRollPicker(v => !v)}
              aria-label="Request a dice roll" aria-expanded={showRollPicker} title="Request a dice roll">
              <IconD20 size={20} />
            </button>
          )}
          {isDM && (
            <button className="cp-tool" onClick={() => { setShowNPCModal(true); setNpcStep('form'); }}
              aria-label="Reveal an NPC to the players" title="Reveal an NPC to the players">
              <IconUser size={20} />
            </button>
          )}
          <textarea ref={inputRef} className="cp-textarea" rows={1}
            placeholder="Say something to the table…"
            aria-label="Message"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_LENGTH}
          />
          <button className="cp-send" onClick={sendMessage} disabled={!inputText.trim()} aria-label="Send message" title="Send (Enter)">
            <IconSend size={19} />
          </button>
        </div>
        {inputText.length > MAX_LENGTH - 300 && (
          <div className="cp-count">{inputText.length} / {MAX_LENGTH}</div>
        )}
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
