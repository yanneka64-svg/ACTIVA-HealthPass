# `src/modules/` — HealthPass 2.0 modules

This directory is the home for HealthPass 2.0 engines and related visual additions
(Preauthorization, BillAudit, FraudDetection, SLA tracking, Reimbursement, the member ID card
visual, …). See `HEALTHPASS_2_0_DISCOVERY.md` at the repository root for the full plan and the
corrections made against the actual state of this codebase, including two modules (Tariff
Engine, Digital Card + QR) that were built, verified, and then deliberately removed at the
user's request rather than kept behind a flag.

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
