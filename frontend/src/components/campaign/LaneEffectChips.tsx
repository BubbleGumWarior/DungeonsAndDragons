import React, { CSSProperties } from 'react';
import '../../styles/customBuildings.css';
import { formatFlatPerDay, formatPctChange, LaneEffect } from './kingdomBuildings';
import { Icon } from './kingdomUi';

// One chip per production lane a building touches: "Wood  +2/day  +10%".
// Used by the unique-buildings panel, the Build modal and the built-structure tooltip.
const LaneEffectChips: React.FC<{ effects: LaneEffect[]; label?: string }> = ({ effects, label = 'Production effects' }) => {
  if (effects.length === 0) return null;
  return (
    <ul className="kt-cb-fxlist" aria-label={label}>
      {effects.map(({ lane, flat, pct }) => (
        <li key={lane.id} className="kt-cb-fx" style={{ '--lane-rgb': lane.rgb } as CSSProperties}>
          <Icon name={lane.icon} size={12} />
          <span className="kt-cb-fx-name">{lane.label}</span>
          {flat > 0 && <span className="kt-cb-fx-val">{formatFlatPerDay(flat)}</span>}
          {pct !== 0 && <span className="kt-cb-fx-val" data-neg={pct < 0 ? 'true' : undefined}>{formatPctChange(pct)}</span>}
        </li>
      ))}
    </ul>
  );
};

export default LaneEffectChips;
