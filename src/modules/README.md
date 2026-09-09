# `src/modules/` — HealthPass 2.0 modules

This directory is the home for every new HealthPass 2.0 engine (Eligibility, Coverage,
Tariffs, Preauthorization, BillAudit, FraudDetection, …). See
`HEALTHPASS_2_0_DISCOVERY.md` at the repository root for the full plan and the corrections
made against the actual state of this codebase.

## Convention

- **One folder per module, added when that module's phase actually starts** — never created
  in bulk ahead of time. This directory is intentionally empty until Phase 1 begins.
- Every module ships behind a flag from `src/config/featureFlags.ts`, defaulting to off, and
  starts in shadow mode (visible/informational, never blocking an existing flow) until
  explicitly promoted.
- Nothing in `src/modules/` replaces or renames existing code — it only adds to it, per the
  "no destroying existing behavior" rule in the discovery report.
- Before a module's screen work is implemented for real, a visual preview of that interface is
  presented and confirmed first.
