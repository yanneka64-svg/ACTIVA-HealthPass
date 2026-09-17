// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 2 — Preauthorization ===
// Badge purement informatif (mode silencieux) affiché à côté d'un claim dans la vue Superviseur,
// derrière le flag `hp2_preauthorization`. N'apparaît que pour les claims dont le montant dépasse
// le seuil — silencieux pour l'immense majorité des claims courants.
import React from 'react';
import { FileText } from 'lucide-react';
import { useCurrency } from '../../services/currency';
import { PreauthorizationResult } from './preauthCheck';

interface PreauthorizationBadgeProps {
  result: PreauthorizationResult;
  className?: string;
}

export const PreauthorizationBadge: React.FC<PreauthorizationBadgeProps> = ({ result, className = '' }) => {
  const { formatMoney } = useCurrency();
  if (!result.required) return null;

  return (
    <span
      title={`Amount exceeds the ${formatMoney(result.thresholdUsd, 'DUAL')} preauthorization threshold`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-200 ${className}`}
    >
      <FileText className="w-3 h-3" />
      <span>Preauthorization recommended (&gt; {formatMoney(result.thresholdUsd, 'DUAL')})</span>
    </span>
  );
};
