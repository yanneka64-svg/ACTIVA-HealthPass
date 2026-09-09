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
- No conflicts found with current reality. Proceeds largely as originally scoped.
- Tariff Engine shape already validated visually in the frontend preview: per-service tariff
  entered in USD (the app's base currency, per `src/services/currency.tsx`), auto-converted
  to LRD display at the existing exchange rate, with coverage rate per service, grouped by
  category, and an "Add Service" path for services outside the starter catalog.

### Phase 2 — Preauthorization / BillAudit / FraudDetection
- No direct conflicts found. One open dependency flagged: FraudDetection's "similar claims"
  signal needs enough historical claims volume to be meaningful — to be sized once Phase 1
  data is flowing, not assumed up front.

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

## 5. Next step

Phase 0's remaining scope (SoD/audit review, `firestore.rules` review, feature-flag
foundation, empty `src/modules/` structure) is non-UI groundwork. Per the process rule above,
the next visible checkpoint will be at the start of Phase 1, when the first real Eligibility/
Coverage/Tariff screens are ready to preview.
