// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 4 — SLA Tracking ===
// Badge purement informatif (mode silencieux) affiché à côté d'un claim dans la vue Superviseur,
// derrière le flag `hp2_sla_tracking`. N'apparaît que si le claim a dépassé le seuil.
import React from 'react';
import { Timer } from 'lucide-react';
import { SlaCheckResult, SLA_TARGET_HOURS } from './slaCheck';
// === AMÉLIORATION AJOUTÉE : traduction du badge SLA (2026-09-10) — `lang` optionnel, repli en
// anglais si non fourni, pour ne rien changer au comportement des appelants existants.
import { Language } from '../../types';
import { useTranslation } from '../../i18n/translations';

interface SlaBadgeProps {
  result: SlaCheckResult;
  className?: string;
  lang?: Language;
}

export const SlaBadge: React.FC<SlaBadgeProps> = ({ result, className = '', lang }) => {
  if (!result.breached) return null;
  const t = useTranslation(lang || 'en');
  const hoursOver = Math.round(result.hoursElapsed - SLA_TARGET_HOURS);
  const tooltip = t.claims.slaTooltip
    .replace('{elapsed}', String(Math.round(result.hoursElapsed)))
    .replace('{target}', String(SLA_TARGET_HOURS));
  const badgeText = t.claims.slaBreachedBadge
    .replace('{hours}', String(hoursOver))
    .replace('{target}', String(SLA_TARGET_HOURS));

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border bg-rose-50 text-rose-700 border-rose-200 ${className}`}
    >
      <Timer className="w-3 h-3" />
      <span>{badgeText}</span>
    </span>
  );
};
