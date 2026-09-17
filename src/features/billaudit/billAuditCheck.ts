// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 2 — BillAudit (module src/modules/billaudit/),
// derrière le flag `hp2_bill_audit` (désactivé par défaut, voir src/config/featureFlags.ts). Mode
// silencieux STRICT, comme Fraud Detection / Preauthorization : indicateur informatif uniquement,
// n'intercepte jamais la soumission ni approveClaim/rejectClaim (workflowService.ts).
//
// Portée volontairement réduite pour ce premier incrément : UNIQUEMENT la détection de lignes
// d'actes médicaux dupliquées au sein d'un même claim (même description + même catégorie + même
// montant) — un signal fiable, indépendant de la devise. Une vérification "montant total
// cohérent avec la somme des actes" a été envisagée puis écartée : `Claim.medicalActs[].amount`
// est enregistré dans la devise choisie à la saisie (`Claim.currency`, voir
// AgentClaimsView.tsx::handleSubmit), alors que `Claim.amount` est toujours converti en USD —
// les comparer directement produirait un faux signal systématique pour chaque claim soumis en
// LRD, ce qui n'est pas acceptable pour un outil qui se présente comme un audit. À reprendre
// seulement si cette incohérence de modèle de données est résolue ailleurs.
import { Claim } from '../../types';

export interface BillAuditFinding {
  label: string;
}

export interface BillAuditResult {
  flagged: boolean;
  findings: BillAuditFinding[];
}

export function computeBillAudit(claim: Claim): BillAuditResult {
  const findings: BillAuditFinding[] = [];
  const acts = claim.medicalActs || [];

  const seen = new Map<string, number>();
  acts.forEach((a) => {
    const key = `${(a.description || '').trim().toLowerCase()}|${(a.category || '').trim().toLowerCase()}|${Number(a.amount) || 0}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  const duplicateCount = Array.from(seen.values()).filter((count) => count > 1).length;
  if (duplicateCount > 0) {
    findings.push({
      label: duplicateCount === 1
        ? 'One line item appears more than once in this claim (same description, category and amount)'
        : `${duplicateCount} line items appear more than once in this claim (same description, category and amount)`,
    });
  }

  return { flagged: findings.length > 0, findings };
}
