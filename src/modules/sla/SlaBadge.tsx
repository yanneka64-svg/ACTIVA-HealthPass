// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 4 — SLA Tracking ===
// Badge purement informatif (mode silencieux) affiché à côté d'un claim dans la vue Superviseur,
// derrière le flag `hp2_sla_tracking`. N'apparaît que si le claim a dépassé le seuil.
import React from 'react';
import { Timer } from 'lucide-react';
import { SlaCheckResult, SLA_TARGET_HOURS } from './slaCheck';

interface SlaBadgeProps {
  result: SlaCheckResult;
  className?: string;
}

export const SlaBadge: React.FC<SlaBadgeProps> = ({ result, className = '' }) => {
  if (!result.breached) return null;
  const hoursOver = Math.round(result.hoursElapsed - SLA_TARGET_HOURS);

  return (
    <span
      title={`Submitted ${Math.round(result.hoursElapsed)}h ago — exceeds the ${SLA_TARGET_HOURS}h target turnaround`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border bg-rose-50 text-rose-700 border-rose-200 ${className}`}
    >
      <Timer className="w-3 h-3" />
      <span>SLA breached ({hoursOver}h over {SLA_TARGET_HOURS}h target)</span>
    </span>
  );
};
