# `src/modules/` — HealthPass 2.0 / 3.0 modules

This directory is the home for HealthPass engines and related visual additions
(Preauthorization, BillAudit, FraudDetection, SLA tracking, Reimbursement, the member ID card
visual, …). See `HEALTHPASS_2_0_DISCOVERY.md` at the repository root for the full HealthPass 2.0
plan and the corrections made against the actual state of this codebase, including two modules
(Tariff Engine, Digital Card + QR) that were built, verified, and then deliberately removed at
the user's request rather than kept behind a flag.

## HealthPass 3.0 (2026-09-12 — modernization roadmap)

`claim360/` and `timeline/` are the first additions from the modernization roadmap review
(P1-style, additive, feature-flagged — same discipline as HealthPass 2.0, not a rewrite):
- `timeline/EntityTimeline.tsx` — reusable component reading the already-existing `auditLogs`
  collection, filtered client-side by `entityId`. No new Firestore read, no new field.
- `claim360/Claim360Panel.tsx` — tabbed panel (Overview/Member/Provider/Financial/Timeline)
  aggregating data already passed as props to the Claims screens. Wired as a new "View" button
  in `ClaimsView.tsx` (previously had no detail view at all) and as an additive Timeline section
  appended to the existing detail modal in `AgentClaimsView.tsx` (that modal's own content is
  left untouched). Behind `hp3_claim_360` — started in shadow mode (default off), verified in
  browser, then **promoted to production on 2026-09-12** (default on, direct user request).

## Convention

- **One folder per module, added when that module's phase actually starts** — never created
  in bulk ahead of time.
- A module that reads/writes data or calls a backend ships behind a flag in
  `src/config/featureFlags.ts` and starts in shadow mode (visible/informational, never blocking
  an existing flow) until explicitly promoted. A purely visual module with no backend
  dependency (e.g. `membercard/`) doesn't need a flag.
- Nothing in `src/modules/` replaces or renames existing code — it only adds to it, per the
  "no destroying existing behavior" rule in the discovery report.
- Before a module's screen work is implemented for real, a visual preview of that interface is
  presented and confirmed first.
