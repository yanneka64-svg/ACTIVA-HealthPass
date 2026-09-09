# HealthPass 2.0 — Discovery Report (Phase 0, Étape 0.1)

Status: **Discovery only. No functional code has been changed.** This document is the
agreed starting point for the HealthPass 2.0 transformation plan, corrected against the
actual state of this codebase as of 2026-09-09.

## 1. Purpose

The HealthPass 2.0 plan (Eligibility/Coverage/Tariff engines, Preauthorization/BillAudit/
FraudDetection, Provider ecosystem + digital card, Reimbursement/Payment reconciliation/SLA/
Analytics) targets the existing three roles only — **Agent, Superviseur, Admin** — with no
new login portals for Provider, Employer, or Member. This document records where the plan's
original assumptions matched or diverged from reality, so later phases are scoped against
facts rather than the plan's initial guesses.

## 2. Plan vs. Reality — corrections found during Discovery

| # | Plan assumed | Actual state found | Impact |
|---|---|---|---|
| 1 | A role-routing race condition needs fixing | Not reproducible — routing works correctly on the current `main` | Dropped from Phase 0 |
| 2 | `fix_*.cjs` scripts need cleanup | These files do not exist in this repo | Dropped from Phase 0 |
| 3 | An OTP/PIN verification system exists to extend | No OTP/PIN system exists anywhere in the app | Any OTP/PIN feature is net-new work, not an extension |
| 4 | Real HMAC/barcode signing exists for the digital card | No cryptographic signing infrastructure exists | Server-verifiable QR (Phase 3) is foundational new security work |
| 5 | `auditLogs` needs to be built | `auditLogs` is already a mature, populated Firestore collection | Phase 0 audit work becomes "review + fill gaps," not "build from zero" |
| 6 | `firestore.rules` needs hardening | Rules are already reasonably strict | Same: targeted review only |
| 7 | Admin screens (Providers, Organizations, Members, Ceilings, Card Number Management, etc.) need enrichment | All 11 Admin screens already exist and are substantial (confirmed directly, e.g. `CardNumberManagementModal.tsx`) | Phase 3 becomes "add new sub-features to existing screens," not "build out thin screens" |
| 8 | The card numbering system needs to be adapted for Phase 3 | The existing free-form 11-character alphanumeric card system already fits what Phase 3 needs; the real gap is that no QR/barcode exists at all | Scope Phase 3 card work around adding QR generation + verification, not restructuring card numbers |

## 3. Corrected phase plan (agreed 2026-09-09)

### Phase 0 — Stabilization & Security
- ~~Role-routing race-condition fix~~ — dropped (not reproducible).
- ~~`fix_*.cjs` cleanup~~ — dropped (files don't exist).
- SoD + `auditLogs`: reduced to an audit of current logging coverage and targeted gap-filling, not a rebuild.
- `firestore.rules`: targeted review only, not a rewrite.
- Feature-flag foundation: kept as planned.
- `src/modules/` structure: kept, created incrementally, one module folder per phase — never in bulk.

### Phase 1 — Eligibility / Coverage / Tariff Engines
- **Correction found during implementation (2026-09-09):** an Eligibility Engine already exists
  and is already wired into the Agent claim form — `checkCareEligibility` /
  `checkMemberEligibility` in `src/services/eligibilityService.ts` (organization suspension,
  member/dependent status, dynamic age-limit checks against policy ceilings). A Coverage
  calculation also already exists, at the organization level — a flat `Organization.coverageRate`
  drives the "Automated ACTIVA Co-Pay Calculation" shown live in `AgentClaimsView.tsx`. Decision
  (agreed 2026-09-09): leave this calculation as-is for now — the new per-service Tariff Engine
  (below) stays Admin-only management and is not wired into the claim form's coverage
  calculation in this pass. Revisit if/when per-service (rather than flat per-organization)
  coverage becomes a priority.
- Tariff Engine (Phase 1's first and, for now, only new module): implemented and shipped behind
  `hp2_tariff_engine` (see section 6). Per-service tariff entered in USD (the app's base
  currency, per `src/services/currency.tsx`), auto-converted to LRD display at the existing
  exchange rate, with coverage rate per service, grouped by category, and an "Add Service" path
  for services outside the starter catalog. Shape validated visually in the frontend preview
  before implementation, then the real built component was rendered and screenshotted before
  commit.

### Phase 2 — Preauthorization / BillAudit / FraudDetection
- No direct conflicts found. One open dependency flagged: FraudDetection's "similar claims"
  signal needs enough historical claims volume to be meaningful — to be sized once Phase 1
  data is flowing, not assumed up front.
- **First module shipped (2026-09-09):** FraudDetection, behind `hp2_fraud_detection` (see
  section 6). Purely informational shadow-mode score (0-100) shown as a badge on pending claims
  in the Superviseur validation screen (`ClaimsView.tsx`) — never intercepts or blocks
  `approveClaim`/`rejectClaim` (`src/services/workflowService.ts`), which are untouched. Builds
  on two signals that already existed but only at Agent intake (`duplicateWarning` /
  `frequencyWarning` in `AgentClaimsView.tsx`), generalized for the Superviseur's full pending
  queue, plus a third new signal (unusual amount vs. the member's own claim history).
- **Second and third modules shipped (2026-09-09):** Preauthorization (`hp2_preauthorization`)
  and BillAudit (`hp2_bill_audit`) — both same shadow-mode badge treatment as Fraud Detection,
  shown together on the same pending-claim row/card. BillAudit's scope was deliberately kept to
  duplicate line-item detection only: a total-vs-itemized-sum check was considered and dropped
  because `Claim.medicalActs[].amount` is stored in whatever currency was selected at submission
  (`Claim.currency`) while `Claim.amount` is always USD-converted — comparing them directly would
  have produced a false finding on every LRD-submitted claim, which is not acceptable for
  something presented as an audit. **Phase 2 is now complete** (all 3 planned modules shipped,
  all off by default).

### Phase 3 — Provider ecosystem + digital HealthPass card
- Reframed from "enrich thin Admin screens" to "add new sub-features (Tariffs sub-tab, card
  QR) onto the existing, already-substantial Admin screens."
- Digital card QR/barcode signing is new foundational security work (no HMAC infra exists
  today) — to be scoped and built explicitly, not treated as a wiring task.
- Any OTP/PIN verification flow, if kept in scope, is also net-new work for the same reason.

### Phase 4 — Reimbursement / Payment reconciliation / SLA / Analytics
- Not yet investigated in depth. To receive its own discovery pass once Phases 1–3 clarify
  what data and workflows actually exist to reconcile/report on.

## 4. Process rules carried forward from the original plan

- **RÈGLE ABSOLUE — ne pas détruire l'existant** : no deletions or renames without a migration
  plan; Add-Before-Replace; any breaking change requires explicit approval and is never
  auto-executed.
- New engines start in shadow mode (visible/informational, never blocking existing flows)
  until explicitly promoted.
- Everything ships behind a feature flag.
- Only 3 roles ever: Agent, Superviseur, Admin. No new login portals.
- **Before any step that changes what a user sees, a visual preview of that interface is
  presented and confirmed — before it is implemented for real.** (Agreed 2026-09-09.)

## 5. Status

Phase 0 complete (this document, SoD/audit review, `firestore.rules` review — no changes
needed on either — feature-flag foundation, `src/modules/` structure).

| Module | Flag | Status |
|---|---|---|
| Tariff Engine | `hp2_tariff_engine` | Shipped, off by default |
| Fraud Detection | `hp2_fraud_detection` | Shipped, off by default (shadow-mode score only) |
| Preauthorization | `hp2_preauthorization` | Shipped, off by default (shadow-mode badge only, $500 USD threshold — provisional, not yet configurable by Admin) |
| BillAudit | `hp2_bill_audit` | Shipped, off by default (shadow-mode badge only — duplicate line-item detection; amount-vs-tariff checks deliberately deferred, see section 3 note in the module) |
| Eligibility / Coverage Engine | — | Not built — existing `eligibilityService.ts` + org-level coverage rate kept as-is (section 3) |
| Provider digital card / QR | `hp2_provider_digital_card` | Not started |

All flags default to `false` in `src/config/featureFlags.ts` — no shipped module is visible to
any production user until explicitly enabled.

## 6. Next step

Phase 2 complete. Next up is Phase 3 (Provider ecosystem + digital HealthPass card with
server-verifiable QR) — flagged in section 3 as genuinely new foundational security work, since
no HMAC/signing infrastructure exists today. Per the process rule above, a preview is presented
and confirmed before real implementation.
