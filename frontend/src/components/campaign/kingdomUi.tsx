import React from 'react';
import { ArrowRight, ArrowUp, BookOpen, Check, Clock, Coins, Crown, Drumstick, FlaskConical, Gift, Hammer, ListOrdered, Lock, Minus, Mountain, Pencil, Pickaxe, Plus, Search, Shield, Sparkles, Trash2, TreePine, Wheat, X } from 'lucide-react';
import '../../styles/kingdomUi.css';

// Shared controls for the Kingdom tab panels. Styles live in styles/kingdomUi.css (.kt-ui-*).

export const toCount = (value: unknown): number => Math.max(0, Math.floor(Number(value) || 0));

export const clampInt = (value: string | number, min: number, max: number): number => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), Math.max(min, max));
};

/* ── Icons (lucide, one stroke weight) ────────────────────────────────────── */

const ICONS = {
  book: BookOpen,
  lock: Lock,
  arrow: ArrowRight,
  up: ArrowUp,
  check: Check,
  minus: Minus,
  plus: Plus,
  x: X,
  shield: Shield,
  list: ListOrdered,
  flask: FlaskConical,
  search: Search,
  clock: Clock,
  hammer: Hammer,
  crown: Crown,
  pencil: Pencil,
  trash: Trash2,
  gift: Gift,
  wheat: Wheat,
  drumstick: Drumstick,
  tree: TreePine,
  mountain: Mountain,
  pickaxe: Pickaxe,
  coins: Coins,
  sparkles: Sparkles,
} as const;

export type IconName = keyof typeof ICONS;

export const Icon: React.FC<{ name: IconName; size?: number }> = ({ name, size = 14 }) => {
  const Glyph = ICONS[name];
  return <Glyph className="kt-ui-icon" size={size} strokeWidth={2} aria-hidden="true" focusable="false" />;
};

/* ── Quantity stepper: −  [n]  +  ─────────────────────────────────────────── */

interface StepperProps {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  // Amount one press of − / + moves the value (default 1). A fractional step (0.5) allows decimals.
  step?: number;
  // Unit shown after the number, e.g. "%".
  suffix?: string;
  disabled?: boolean;
  label: string;
  size?: 'md' | 'sm';
}

const roundTo2 = (n: number) => Math.round(n * 100) / 100;

export const Stepper: React.FC<StepperProps> = ({ value, onChange, min = 0, max = 9999, step = 1, suffix, disabled, label, size = 'md' }) => {
  const fractional = !Number.isInteger(step);
  const upper = Math.max(min, max);
  const clamp = (n: number) => Math.min(Math.max(fractional ? roundTo2(n) : Math.floor(n), min), upper);
  const parsed = Number(value);
  const current = Number.isFinite(parsed) && value !== '' ? (fractional ? parsed : Math.floor(parsed)) : min;
  const nudge = (direction: 1 | -1) => onChange(String(clamp(current + direction * step)));
  return (
    <div className="kt-ui-stepper" data-size={size} data-disabled={disabled ? 'true' : undefined}>
      <button
        type="button"
        className="kt-ui-stepper-btn"
        onClick={() => nudge(-1)}
        disabled={disabled || current <= min}
        aria-label={`Decrease ${label}`}
      >
        <Icon name="minus" size={13} />
      </button>
      <input
        type="number"
        inputMode={fractional || min < 0 ? 'decimal' : 'numeric'}
        className="kt-ui-stepper-input"
        min={min}
        max={max}
        step={fractional ? step : 1}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onChange(String(clamp(value === '' || !Number.isFinite(Number(value)) ? min : Number(value))))}
        onFocus={(e) => e.target.select()}
      />
      {suffix ? <span className="kt-ui-stepper-suffix" aria-hidden="true">{suffix}</span> : null}
      <button
        type="button"
        className="kt-ui-stepper-btn"
        onClick={() => nudge(1)}
        disabled={disabled || current >= upper}
        aria-label={`Increase ${label}`}
      >
        <Icon name="plus" size={13} />
      </button>
    </div>
  );
};

export const EmptyNote: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="kt-ui-empty">
    <div className="kt-ui-empty-title">{title}</div>
    {children ? <div className="kt-ui-empty-sub">{children}</div> : null}
  </div>
);
