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
- **First module shipped in code (2026-09-09):** Digital HealthPass Card + server-verifiable QR,
  behind `hp2_provider_digital_card`. Mirrors the exact architecture already used for clinical
  field encryption (`functions/src/encryptionService.ts`): a signing key defined via
  `defineSecret`, loaded only inside Cloud Functions, that never reaches the browser. Two new
  callable functions (`functions/src/index.ts`): `generateDigitalCardSignature` (HMAC-SHA256 over
  card number + a 3-year provisional expiry) and `verifyDigitalCardSignature` (constant-time
  signature check, then a **fresh** server-side member lookup by card number — the verifier never
  trusts identity data embedded in the QR itself, so a suspended member's old card correctly
  shows their current status). Client module `src/modules/digitalcard/` renders the card + a real
  QR (new dependency: `qrcode` + `@types/qrcode`) and a verification UI accepting either the
  currently-displayed card or a pasted code, wired into `AgentIdentificationView.tsx`.
  - **Not yet usable — deployment gap, deliberately left undone:** this session has no Firebase
    deploy access. Before this can work for real: `firebase functions:secrets:set
    CARD_SIGNING_KEY` (a strong random value) and `firebase deploy --only functions`. Until then
    the flag must stay off — turning it on would show users a "not yet deployed" error, not a
    broken feature, since the client fails closed with a clear message rather than silently.
  - Verified without deployment: `functions/src/digitalCardSigningService.test.ts` (9 unit tests,
    all passing) proves the signing/verification math directly — correct round-trip, rejects a
    changed card number or expiry, rejects a tampered signature, differs under a different key.
    The client UI (card rendering, real QR image, verify-result states) was rendered and
    screenshotted with the two Cloud Function calls stubbed at the network boundary, since they
    cannot be exercised live pre-deployment.

### Phase 4 — Reimbursement / Payment reconciliation / SLA / Analytics
- **Correction found during discovery (2026-09-10):** Analytics is already mature — `ReportsView.tsx`
  has real, computed KPIs (Total Billed, Total Reimbursed, a genuinely computed average claim
  processing time from real submission/decision dates — not a static placeholder, someone already
  fixed that — rejection rate, provider/organization spend distribution charts) plus a full
  "Policies & Premiums" tab (active/expiring/suspended/expired policy counts, quarterly premium
  payment tracking via `PolicyPayment`). Basic reimbursement already exists too: an invoice is
  auto-generated with coverage %/amount when a claim is approved.
- What's genuinely missing: **SLA tracking** — a static "Target SLA turnaround < 48h" caption
  exists next to the real average, but nothing flags an individual pending claim that is actually
  breaching that target right now. **Payment Reconciliation** — the screen is literally titled
  "Invoices & Reconciliation" (`t.reports` / `InvoicesView.tsx`) but there is no actual
  matching/discrepancy-detection logic behind that name; a real reconciliation engine needs a
  clearer, less financially-sensitive scope before being built. **Reimbursement workflow** — no
  disbursement-status tracking (was the provider/member actually paid), only the invoice record
  itself.
- Decision (agreed 2026-09-10): scope Phase 4 down to SLA tracking first — the cleanest,
  self-contained module. Reimbursement/Reconciliation intentionally deferred pending clearer
  requirements.
- **First module shipped (2026-09-10):** SLA Tracking, behind `hp2_sla_tracking`. Same
  shadow-mode badge pattern as Fraud Detection/Preauthorization/BillAudit: flags a `pending`
  claim whose `submissionDate` is more than 48h old (the same 48h target already shown in
  `ReportsView.tsx` — reused, not invented) with an "SLA breached (Xh over 48h target)" badge on
  the Superviseur validation screen. Never blocks approval/rejection.

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
| Provider digital card / QR | `hp2_provider_digital_card` | Shipped in code, off by default — **not usable until deployed** (see section 3 note: `CARD_SIGNING_KEY` secret + `firebase deploy --only functions` required, neither done by this session) |
| SLA Tracking | `hp2_sla_tracking` | Shipped, off by default (shadow-mode badge only) |
| Reimbursement / Payment Reconciliation | — | Deferred — scope intentionally not yet defined (section 3) |

All flags default to `false` in `src/config/featureFlags.ts` — no shipped module is visible to
any production user until explicitly enabled.

## 6. Status as of pausing (2026-09-10)

Work on HealthPass 2.0 is paused here at the user's request — a deliberate stopping point, not
an incomplete one. Summary of the engagement:

- **Phase 0** (Stabilization & Security): complete. Discovery report, SoD/audit review,
  `firestore.rules` review (no changes needed on either), feature-flag foundation,
  `src/modules/` structure.
- **Phase 1** (Eligibility/Coverage/Tariff Engines): Tariff Engine shipped
  (`hp2_tariff_engine`). Eligibility/Coverage intentionally left on the existing
  `eligibilityService.ts` + org-level coverage rate — already solid, not rebuilt.
- **Phase 2** (Preauthorization/BillAudit/FraudDetection): all 3 shipped
  (`hp2_preauthorization`, `hp2_bill_audit`, `hp2_fraud_detection`) — complete.
- **Phase 3** (Provider ecosystem + digital card): Digital HealthPass Card + server-verifiable
  QR shipped in code (`hp2_provider_digital_card`) — **not usable until deployed** (see section
  3: `CARD_SIGNING_KEY` secret + `firebase deploy --only functions`, neither done by this
  session). Provider/Organization screens confirmed already substantial, not rebuilt.
- **Phase 4** (Reimbursement/Reconciliation/SLA/Analytics): SLA Tracking shipped
  (`hp2_sla_tracking`). Analytics confirmed already mature, not rebuilt. Reimbursement/Payment
  Reconciliation deliberately deferred — real financial workflows without a defined scope yet;
  pick up only once that scope is worked out with the user.

Every shipped module ships behind a flag in `src/config/featureFlags.ts`, all `false` by
default — **nothing here is visible to any production user today.** To resume this work later,
start from this document; the plan-vs-reality corrections in section 2 and the per-phase notes
in section 3 remain the source of truth for what's real vs. what the original plan assumed.
