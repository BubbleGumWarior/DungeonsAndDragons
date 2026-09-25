import React from 'react';
import { ArrowRight, ArrowUp, BookOpen, Check, Clock, FlaskConical, Hammer, ListOrdered, Lock, Minus, Plus, Search, Shield, X } from 'lucide-react';
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
  disabled?: boolean;
  label: string;
  size?: 'md' | 'sm';
}

export const Stepper: React.FC<StepperProps> = ({ value, onChange, min = 0, max = 9999, disabled, label, size = 'md' }) => {
  const current = Number.isFinite(Number(value)) && value !== '' ? Math.floor(Number(value)) : min;
  const step = (delta: number) => onChange(String(clampInt(current + delta, min, max)));
  return (
    <div className="kt-ui-stepper" data-size={size} data-disabled={disabled ? 'true' : undefined}>
      <button
        type="button"
        className="kt-ui-stepper-btn"
        onClick={() => step(-1)}
        disabled={disabled || current <= min}
        aria-label={`Decrease ${label}`}
      >
        <Icon name="minus" size={13} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="kt-ui-stepper-input"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onChange(String(clampInt(value === '' ? min : value, min, max)))}
        onFocus={(e) => e.target.select()}
      />
      <button
        type="button"
        className="kt-ui-stepper-btn"
        onClick={() => step(1)}
        disabled={disabled || current >= max}
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
