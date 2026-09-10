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
- ~~Tariff Engine~~ — **built (2026-09-09) then removed (2026-09-10), at the user's explicit
  request.** A per-service, Admin-managed tariff catalog was shipped behind `hp2_tariff_engine`,
  validated visually, and confirmed working in the real component. The user then decided tariffs
  should stay under the control of medical providers rather than a centralized catalog in the
  app, since they're dynamic — the module (`src/modules/tariffs/`, the `medicalTariffs`
  collection, its Firestore rule, the `MedicalTariff` type, and the flag) was fully removed from
  the codebase. Phase 1 has no Tariff Engine going forward.

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
- ~~Digital HealthPass Card + server-verifiable QR~~ — **built (2026-09-09) then removed
  (2026-09-10), at the user's explicit request.** HMAC-SHA256 signing via `defineSecret` (mirroring
  `functions/src/encryptionService.ts`), two callable functions, a client card+QR UI — all
  implemented, unit-tested (9 passing tests on the signing/verification math), and confirmed
  working end to end in production once flags were enabled (visible "Digital Card" button,
  correct graceful "not yet deployed" message when clicked, exactly as designed). The user then
  asked to remove it: it depended on a Cloud Functions deployment (`CARD_SIGNING_KEY` secret +
  `firebase deploy --only functions`) outside this session's reach, and wasn't the actual need.
  `functions/src/digitalCardSigningService.ts` (+ test), the two callable functions in
  `functions/src/index.ts`, `src/modules/digitalcard/`, the `qrcode`/`@types/qrcode` dependency,
  and the flag were all removed.
- **Replaced with (2026-09-10):** `MemberIdCard` (`src/modules/membercard/MemberIdCard.tsx`) — a
  purely visual "member card" (navy gradient, chip, avatar, name, organization, card number,
  status), reusing the visual design validated earlier but with no signing, no Cloud Functions,
  no Firestore dependency at all. Shown automatically (no button, no flag) whenever an Agent
  selects an insured member on the Identification screen, right below the existing profile
  header.
  - **QR code added back (2026-09-10, same day, on request):** the user asked for the QR
    specifically — but as a plain, unsigned code that just encodes the same general information
    already on the card (name, card number, organization, status) as readable text, generated
    client-side with the `qrcode` package. No server round-trip, no verification claim, no
    deployment dependency — a standard QR scanner reads the member's information directly.
    Deliberately distinct from the removed Digital Card: no HMAC signature, nothing to deploy.
  - **Card-shaped redesign, "Option A" (2026-09-10, same day, on request):** the user reported the
    card rendered as a full-width stretched block ("je veux vraiment que la carte s'affiche comme
    une carte") and asked for proposals. Three real, rendered variants were built and screenshotted
    side by side (A: classic layout, QR in the corner; B: same ratio with a security-pattern
    texture and a larger QR; C: portrait badge style); the user picked **Option A**. Implemented as
    fixed card proportions (`aspect-ratio: 340 / 214`, close to the ISO/IEC 7810 ID-1 ratio,
    `max-w-[340px]` instead of stretching full width), with the card number restyled monospace/
    tracked ("embossed" look) and the QR code moved to a small corner tile. No props/usage changes
    in `AgentIdentificationView.tsx` — only `MemberIdCard.tsx`'s internal layout changed.

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
- **Reimbursement / Payment Reconciliation scope confirmed with the user (2026-09-10):** unlike
  the shadow-mode badges above, this is a real Admin-facing workflow, not a read-only indicator —
  scoped narrowly on purpose:
  - **Payee**: confirmed as "both, depending on the case" — some claims are direct-billed to the
    provider, some reimburse the insured who paid upfront. `InvoiceItem` gained a `payee:
    'provider' | 'member'` field recorded per payment rather than assuming one model app-wide.
  - **Reconciliation target**: confirmed as "claims paid vs. approved" specifically (not premium
    payments — `PolicyPayment` already covers those separately, out of scope here).
  - **Data source**: confirmed as manual Admin entry only — no bank statement import, no
    automatic matching. An Admin/Supervisor explicitly records a payment reference + date per
    invoice.
  - **Shipped module**, behind `hp2_reimbursement_tracking`: `InvoiceItem` gained
    `paymentStatus`/`payee`/`paidAt`/`paymentReference` (all optional, additive — every existing
    invoice reads as "unpaid" by default, no migration, no regression on the `status` field
    already used everywhere else in `InvoicesView.tsx`/`printUtils.ts`). A "Mark as Paid" action
    (Admin/Supervisor only) records the payment; a new "Payment Reconciliation" panel shows
    Approved vs. Paid vs. Outstanding totals, computed for real from the data — not the
    decorative "100% verified disbursements" caption the existing "PROCESSED INVOICES" KPI card
    already displays without any real number behind it (left untouched, this panel sits
    alongside it with the genuine figure).

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
| ~~Tariff Engine~~ | — | **Removed (2026-09-10)** — tariffs stay under provider control, not a centralized catalog |
| Fraud Detection | `hp2_fraud_detection` | Live for all users (shadow-mode score only) |
| Preauthorization | `hp2_preauthorization` | Live for all users (shadow-mode badge only, $500 USD threshold — provisional, not yet configurable by Admin) |
| BillAudit | `hp2_bill_audit` | Live for all users (shadow-mode badge only — duplicate line-item detection; amount-vs-tariff checks deliberately deferred) |
| Eligibility / Coverage Engine | — | Not built — existing `eligibilityService.ts` + org-level coverage rate kept as-is (section 3) |
| ~~Provider digital card / QR~~ | — | **Removed (2026-09-10)** — depended on a Cloud Functions deployment out of reach; replaced by `MemberIdCard` (pure visual, no backend) |
| SLA Tracking | `hp2_sla_tracking` | Live for all users (shadow-mode badge only) |
| Reimbursement / Payment Reconciliation | `hp2_reimbursement_tracking` | Live for all users — manual payment tracking + reconciliation summary |
| Member ID Card visual | — | Live for all Agents — no flag, pure UI, always shown when a member is selected |

All remaining flags default to `true` in `src/config/featureFlags.ts` (promoted 2026-09-10, at
the user's explicit request — "rendre tout ça visible... pour que tout le monde puisse le
voir"). `hp2_eligibility_engine`/`hp2_coverage_engine` remain unused by any module.

## 6. Status (2026-09-10)

Summary of the engagement so far:

- **Phase 0** (Stabilization & Security): complete. Discovery report, SoD/audit review,
  `firestore.rules` review (no changes needed on either), feature-flag foundation,
  `src/modules/` structure.
- **Phase 1** (Eligibility/Coverage/Tariff Engines): Tariff Engine built, then removed at the
  user's request (tariffs stay under provider control). Eligibility/Coverage intentionally left
  on the existing `eligibilityService.ts` + org-level coverage rate — already solid, not rebuilt.
- **Phase 2** (Preauthorization/BillAudit/FraudDetection): all 3 shipped and live for every user
  (`hp2_preauthorization`, `hp2_bill_audit`, `hp2_fraud_detection`) — complete.
- **Phase 3** (Provider ecosystem + digital card): Digital HealthPass Card + server-verifiable QR
  built, unit-tested, confirmed working end to end in production (correct graceful failure with
  Cloud Functions undeployed) — then removed at the user's request, replaced by `MemberIdCard`
  (pure visual, live for every Agent, no backend dependency at all). Provider/Organization screens
  confirmed already substantial, not rebuilt.
- **Phase 4** (Reimbursement/Reconciliation/SLA/Analytics): complete. SLA Tracking
  (`hp2_sla_tracking`) and Reimbursement/Payment Reconciliation (`hp2_reimbursement_tracking`,
  scope confirmed with the user before building) both shipped and live for every user. Analytics
  confirmed already mature, not rebuilt.

**Current live state (2026-09-10):** Fraud Detection, Preauthorization, BillAudit, SLA Tracking,
and Reimbursement & Reconciliation are all enabled by default in `src/config/featureFlags.ts` and
fully functional for every user — promoted at the user's explicit request, after each was
individually previewed and verified. The Member ID Card visual is always on for Agents, no flag.
Tariff Engine and Digital Card were built, verified working, and then deliberately removed rather
than kept behind a flag — they are gone from the codebase, not just disabled. This document
remains the source of truth for what's real vs. what the original plan assumed; the
plan-vs-reality corrections in section 2 and the per-phase notes in section 3 apply to any future
work here.
