// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 2 — BillAudit ===
// Badge purement informatif (mode silencieux) affiché à côté d'un claim dans la vue Superviseur,
// derrière le flag `hp2_bill_audit`. N'apparaît que si une anomalie de facturation est détectée.
import React from 'react';
import { FileWarning } from 'lucide-react';
import { BillAuditResult } from './billAuditCheck';

interface BillAuditBadgeProps {
  result: BillAuditResult;
  className?: string;
}

export const BillAuditBadge: React.FC<BillAuditBadgeProps> = ({ result, className = '' }) => {
  if (!result.flagged) return null;
  const title = result.findings.map((f) => f.label).join(' • ');

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border bg-orange-50 text-orange-700 border-orange-200 ${className}`}
    >
      <FileWarning className="w-3 h-3" />
      <span>Bill audit: duplicate line item(s)</span>
    </span>
  );
};
