# ACTIVA Health Claims — Discovery & Architecture Report (Phase 0)

Status: **Discovery only. No functional code has been changed in this pass.** Same discipline
as `HEALTHPASS_2_0_DISCOVERY.md` Phase 0: analyze and reconcile against the actual codebase
before writing a single line of feature code. This document answers the 15 analysis points
requested for "ACTIVA Health Claims," corrected against what already exists in this repository
as of 2026-09-17.

## 0. Headline finding — this is largely already being built, under HealthPass 2.0/3.0

Before drawing a new architecture, a direct comparison against `HEALTHPASS_2_0_DISCOVERY.md`
shows the requested "ACTIVA Health Claims" platform overlaps heavily with modules **already
shipped and live in production** in this exact repository:

| Requested capability | Already exists as | Gap remaining |
|---|---|---|
| Fraud/anomaly detection module (§9) | `src/modules/fraud/` (`fraudScore.ts`, `FraudScoreBadge.tsx`), flag `hp2_fraud_detection`, live | No dedicated "Fraud Review" workflow state/queue — today it's a shadow-mode score badge only, never routes a claim anywhere |
| Preauthorization / ceiling & guarantee checks (§6) | `src/services/eligibilityService.ts` (org suspension, member/dependent status, age-limit checks) + `src/modules/preauthorization/` (`hp2_preauthorization`), live | No formal MONTANT RÉCLAMÉ/ÉLIGIBLE/FRANCHISE breakdown UI — the pieces exist as separate checks, not one consolidated panel |
| Bill/invoice audit (duplicate detection) (§9) | `src/modules/billaudit/` (`hp2_bill_audit`), live | Amount-vs-tariff checks deliberately deferred (see Phase 2 notes below) |
| SLA tracking (§2, §14) | `src/modules/sla/` (`slaCheck.ts`, `SlaBadge.tsx`), `hp2_sla_tracking`, live | Only a 48h badge on pending claims; no configurable per-service-type SLA, no breach notification |
| Payment / reimbursement tracking (§12) | `src/modules/reimbursement/` (`hp2_reimbursement_tracking`) — `paymentStatus`, `payee`, `paidAt`, `paymentReference` on `InvoiceItem`, "Mark as Paid," réfaction, recovery tracking, reconciliation summary — live | No formal `PENDING/APPROVED/PROCESSING/PAID/FAILED/CANCELLED` state machine — today it's binary `unpaid`/`paid` |
| Claim detail / 360 view (§5) | `src/modules/claim360/Claim360Panel.tsx` — tabs: Overview/Member/Provider/Financial/Timeline, `hp3_claim_360`, live | 5 tabs vs. the 10 requested (no dedicated Medical Info, Assessment, Communications, Payments as separate tabs yet) |
| Audit trail (§15) | `auditLogs` Firestore collection (mature, populated), `src/modules/timeline/EntityTimeline.tsx` reading it, immutable by design (write path only through `WorkflowService.logAction`) | Already satisfies "must not be editable from the frontend" — no gap |
| Dashboard & reporting (§2, §14) | `ReportsView.tsx` — real computed KPIs (total billed/reimbursed, real average processing time, rejection rate, provider/org distribution charts), `HealthPolicy`/`PolicyPayment` premium tracking | No claim-status funnel chart (new/in-progress/pending/approved/rejected/paid counts) yet |
| Claim workflow (§4) | `ClaimStatus = 'pending' \| 'approved' \| 'rejected' \| 'returned'` (`src/types/index.ts`), enforced via `WorkflowService` + `firestore.rules` SoD (no self-approval) | Only 4 states vs. the 13 requested (DRAFT→...→CLOSED, CANCELLED, ESCALATED, FRAUD REVIEW); **not admin-configurable** today |
| Multi-step claim creation with guarantee auto-check (§3) | `AgentClaimsView.tsx` already does identification → claim info → attachments, with live eligibility/coverage checks | No explicit "expired/suspended contract" hard warning gate confirmed — to verify in Phase 1 |
| Notifications (§14) | `AppNotification` type, `FirestoreService.subscribeToNotifications`, real-time badge + sound (`playNotificationSound`) | Message set is narrower than the 8 requested; extending is additive |

**What genuinely does not exist today:**
- Roles beyond **Admin / Supervisor / Agent** — no Medical Reviewer, Finance, or Management role
  or portal.
- A dedicated Medical Review interface/record (opinion values, author/date/time) separate from
  the existing Supervisor claim-validation screen.
- A formal Payment state machine and a Communications/messaging module attached to a claim.
- An Admin-configurable claim workflow (states + transitions editable without a code change).
- A `ClaimLine`/itemized-benefit data model distinct from the existing flat `Claim.medicalActs[]`.

## 1. Conflict with a previously agreed, explicit architectural rule — flagged, not silently overridden

`HEALTHPASS_2_0_DISCOVERY.md` §4 records a **RÈGLE ABSOLUE agreed directly with the user on
2026-09-09/10**: *"Only 3 roles ever: Agent, Superviseur, Admin. No new login portals."* Every
HealthPass 2.0/3.0 module since then (Fraud, Preauth, BillAudit, SLA, Reimbursement, Claim360)
was deliberately built as a shadow-mode addition **inside** those 3 existing roles' screens,
specifically to honor that rule.

The "ACTIVA Health Claims" specification explicitly asks for 6 roles/portals (Administrateur,
Claims Agent, Medical Reviewer, Supervisor, Finance, Management) — a direct reversal of that
rule. I'm proceeding on the assumption that this newer, very detailed request supersedes the
2026-09-09 agreement (the product has clearly grown in scope), but flagging it explicitly here
rather than quietly overwriting a documented decision. If 3-roles-only was meant to still hold,
say so and Phase 1 below is re-scoped to add these capabilities as new **sections/permissions**
inside the existing Admin/Supervisor/Agent roles instead of new portals.

## 2. Functional architecture

Claims processing becomes a first-class module set alongside the existing Members/Organizations/
Providers/Enrollments/Reports areas — not a rewrite of them. Firebase (Auth/Firestore/Storage/
Functions) stays the backend, `firestore.rules` stays the real enforcement layer (frontend RBAC
is UX only, per §18 of the spec and the existing SoD pattern already in this repo). New claims
data lives in new Firestore collections (`claimCases`, `medicalReviews`, `claimPayments`,
`claimCommunications`) rather than overloading the existing `claims` collection, so nothing about
the current Agent-facing reimbursement flow changes.

## 3. Technical architecture

Extends the existing structure rather than introducing `pages/`/`features/` alongside it:
- `src/types/healthClaims.ts` — new types, additive to `src/types/index.ts` (§4 below).
- `src/services/claimsWorkflowService.ts` — business logic/state machine, separate from the
  existing `workflowService.ts` (which stays untouched and keeps governing the current
  Claim/Enrollment approval flows).
- `src/modules/healthclaims/` — new module folder, following the exact convention already
  documented in `src/modules/README.md` ("one folder per module, added when that phase actually
  starts... behind a flag... starts in shadow mode").
- `src/utils/authUtils.ts` / `src/theme/roleTheme.ts` — extended additively with new role
  literals; existing `AppRole`/`ROLE_ALLOWED_SECTIONS`/theme entries untouched.
- Backend enforcement: new `firestore.rules` blocks for the new collections, modeled on the
  existing `hasOrgAccess()`/SoD pattern already protecting `claims`/`enrollments`.

## 4. Data model (additive — see §0 for what's reused vs. new)

Reused as-is: `Member` (→ Insured), `Organization` (→ Policy holder), `Provider` (→
HealthcareProvider), `HealthPolicy` (→ Policy/Coverage), `AuditLog`/`auditLogs` collection.

New (all additive, own collections, zero risk to existing `Claim`):
- `ClaimCase` — the rich claims-processing entity (distinct from the existing simple `Claim`
  reimbursement record, so the current Agent claim flow is never touched): reference, insured
  ref, organization, provider, serviceNature, diagnosis, claimedAmount/eligibleAmount/
  approvedAmount, status (§5), priority, slaDueAt, assignedTo, fraudReviewFlag.
- `ClaimLine` — itemized acts (mirrors `Claim.medicalActs[]` but with excludedAmount/
  exclusionReason/deductible/copay per line, per §7).
- `MedicalReviewRecord` — opinion (`APPROVED | APPROVED_WITH_ADJUSTMENT | PENDING | REJECTED |
  ESCALATED`), reviewer, timestamp, notes.
- `ClaimPayment` — status (`PENDING | APPROVED | PROCESSING | PAID | FAILED | CANCELLED`),
  beneficiary, mode, reference, expectedDate, actualDate.
- `ClaimCommunication` — threaded messages tied to a claim reference, author, attachments.
- `ClaimWorkflowConfig` — Admin-editable list of statuses + allowed transitions (§4 spec
  requirement: "workflow configurable by the administrator").

## 5. Claim workflow

Default states shipped: `DRAFT, SUBMITTED, RECEIVED, UNDER_REVIEW, MEDICAL_REVIEW,
PENDING_INFORMATION, APPROVED, REJECTED, PAYMENT_PROCESSING, PAID, CLOSED, CANCELLED, ESCALATED,
FRAUD_REVIEW` — stored as data (`ClaimWorkflowConfig`) with a default seed, not a hardcoded enum,
so Admin can add/reorder without a redeploy. `PAID` is only reachable once a `ClaimPayment` with
status `PAID` exists (spec §12 constraint) — enforced both client-side (UX) and in
`firestore.rules` (real gate).

## 6. Roles & permissions matrix (proposed — see §1 conflict above)

| Section | Admin | Claims Agent | Medical Reviewer | Supervisor | Finance | Management |
|---|---|---|---|---|---|---|
| Claim creation | ✕ | ✔ | ✕ | ✕ | ✕ | ✕ |
| Claim assessment (billed/eligible/excluded) | ✔ | ✔ | ✕ | view | ✕ | view |
| Medical review & opinion | ✕ | ✕ | ✔ | view | ✕ | view |
| Assign / escalate / validate decisions | ✔ | ✕ | ✕ | ✔ | ✕ | view |
| Fraud review queue | ✔ | ✕ | view | ✔ | ✕ | view |
| Payment recording | ✔ | ✕ | ✕ | ✕ | ✔ | view |
| Workflow configuration | ✔ | ✕ | ✕ | ✕ | ✕ | ✕ |
| Global dashboard / KPIs | ✔ | own queue | own queue | team | payments | ✔ (all) |
| User management | ✔ | ✕ | ✕ | ✕ | ✕ | ✕ |

Enforced the same way the existing SoD already is: `firestore.rules` is the real gate (createdByUid
≠ approverUid style checks), frontend `ROLE_ALLOWED_SECTIONS` is UX-only, per spec §18.

## 7. Page structure

`/claims` (list, §13) → `/claims/new` (3-step wizard, §3) → `/claims/:id` (10-tab detail, §5) →
role-specific queues: `/claims/medical-review`, `/claims/fraud-review`, `/claims/payments` →
`/dashboard` (role-scoped) → `/reports` (extends existing `ReportsView.tsx`, doesn't replace it).

## 8. Design system

Reuses the existing design language already validated across this app (navy/slate role palettes
in `src/theme/roleTheme.ts`, the status-badge conventions already used for
`ClaimStatus`/`InvoiceStatus`/`KYPStatus`/`HealthPolicyStatus`, Recharts for charts, the existing
card/table components). New roles get new palette entries in `roleTheme.ts`, following the exact
pattern `SUPERVISOR_THEME` already uses (spread + override), not a new design system.

## 9. Dashboard

Extends `ReportsView.tsx`'s existing KPI-card + chart pattern with the new counts/charts from
spec §2 (status funnel, inpatient/outpatient split, age-bracket distribution) — additive tab, not
a replacement of "Overview"/"Policies & Premiums."

## 10. Claims management

`ClaimsView.tsx`'s existing table (search/filter/sort/export already present per
`HEALTHPASS_2_0_DISCOVERY.md`) gains the new columns/filters from spec §13 (priority, SLA,
fraud-review flag) as additive columns — existing Agent/Supervisor claim flows unaffected.

## 11. Medical review

New screen, new role. Reuses `Claim360Panel.tsx`'s tab pattern and `EntityTimeline.tsx` for the
history sub-tab rather than building a parallel detail-view component from scratch.

## 12. Fraud review

Promotes the existing shadow-mode `fraudScore.ts` badge into a real workflow: a claim whose score
crosses a (configurable) threshold can be moved to `FRAUD_REVIEW` status without losing its prior
history (`auditLogs` already immutable/append-only, satisfies spec §9's "without losing its
history" requirement for free).

## 13. Payment

New `ClaimPayment` state machine (§4/§5 above), modeled directly on the existing, already-shipped
`InvoiceItem.paymentStatus`/`payee`/réfaction pattern in `src/modules/reimbursement/` rather than
inventing a second, incompatible payment concept.

## 14. Reporting

Additive charts/KPIs on top of the already-mature `ReportsView.tsx` (§0 table above) — no
rebuild.

## 15. Audit trail

No gap. `auditLogs` + `EntityTimeline.tsx` already satisfy "every important action logged" and
"must not be editable from the frontend" (write path is exclusively `WorkflowService.logAction`,
never a direct client update). New claim actions just call the same existing logger.

## 16. Process rules carried forward (unchanged from HealthPass 2.0/3.0)

- RÈGLE ABSOLUE — never destroy existing functionality; additive only; any breaking change needs
  explicit approval, never auto-executed.
- New engines/screens start in shadow mode / behind a feature flag until explicitly promoted.
- **Before any step that changes what a user sees, a visual preview of that interface is
  presented and confirmed — before it is implemented for real.**
- One module folder added when its phase actually starts — never created in bulk ahead of time.

## 17. Proposed phased build order

- **Phase 1** (next): data model + roles/permissions extension (additive types, new role
  literals, `firestore.rules` blocks for new collections) + `ClaimWorkflowConfig` seed. No new
  screens yet — pure foundation, matching this document's own "discovery only" discipline.
- **Phase 2**: Claim creation wizard + guarantee-verification panel (§3, §6), reusing
  `eligibilityService.ts`.
- **Phase 3**: Claim detail (10-tab), Assessment, Medical Review screen/role.
- **Phase 4**: Payment module, Fraud Review promotion, Communications.
- **Phase 5**: Dashboard/reporting extensions, notifications, global search.

Each phase ships behind a flag, previewed and confirmed before promotion — same discipline as
every HealthPass 2.0/3.0 module before it.
