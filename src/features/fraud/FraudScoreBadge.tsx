// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 2 — Fraud Detection ===
// Badge purement informatif (mode silencieux) affiché à côté d'un claim dans la vue Superviseur,
// derrière le flag `hp2_fraud_detection`. N'apparaît que si un signal a été détecté (score > 0) —
// silencieux pour l'immense majorité des claims, qui n'ont rien d'inhabituel.
import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { FraudScoreResult } from './fraudScore';

const PRIORITY_STYLES: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const PRIORITY_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

interface FraudScoreBadgeProps {
  result: FraudScoreResult;
  className?: string;
}

export const FraudScoreBadge: React.FC<FraudScoreBadgeProps> = ({ result, className = '' }) => {
  if (result.priority === 'none') return null;
  const style = PRIORITY_STYLES[result.priority];
  const label = PRIORITY_LABELS[result.priority];
  const title = result.signals.map((s) => s.label).join(' • ');

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${style} ${className}`}
    >
      <ShieldAlert className="w-3 h-3" />
      <span>Fraud risk: {label} · {result.score}/100</span>
    </span>
  );
};
