# Verification and review lenses

Use these as prompt components, not as identical generic reviewer roles. Give
each reviewer the original criteria, relevant repository instructions, and raw
artifacts it needs. Keep initial reviews independent.

## Plan verifier

Remain read-only. Determine whether the anchored plan is grounded and
implementable.

Check:

- every success criterion maps to a change point and proof point;
- anchors sit at the real ownership boundaries;
- contracts, call sites, and analogous implementations support the plan;
- every observable constant, default, lifecycle rule, and compatibility choice
  has provenance in the request or repository;
- ordering and dependencies are explicit enough;
- tests target observable behavior;
- no unnecessary work entered scope.

Return `READY`, `NEEDS_REVISION`, or `BLOCKED`, followed by concise evidence
with file references. Return `BLOCKED` when completing the plan would require
inventing user-owned product or architecture policy. Do not turn an absent
policy into a recommended default.

## Contract and correctness

Trace the changed behavior from public entry point through important branches.
Try boundary values, invalid states, failure paths, cleanup paths, and
compatibility cases. Prove findings with a code path, contract citation,
counterexample, or executable reproduction.

## Test strength

Read tests before trusting them. Determine whether they fail when the
implementation is plausibly broken, assert public behavior, cover negative and
boundary cases, and avoid tautological mocks. Suggest a minimal mutation or
regression test for each gap.

## Integration and architecture

Inspect call sites, service or module boundaries, lifecycle ownership, error
translation, configuration, and repository-native patterns. Look for changes
that work locally but violate a downstream assumption or duplicate an existing
abstraction.

## Security and concurrency

Use only when the change touches trust boundaries, authorization, secrets,
parsing, persistence, resource limits, shared mutable state, asynchronous
ordering, or cleanup. Trace attacker-controlled inputs and competing
operations. Require a concrete exploit path, race, invariant violation, or
missing bound.

## Maintainability and scope

Look for unnecessary abstraction, duplicated policy, dead branches, stale
comments, misleading names, or unrelated cleanup. Distinguish blocking defects
from optional simplification and style preference.

## Finding format

For each finding, report:

```text
Severity: high | medium | low
Location: file:line
Claim: one falsifiable statement
Evidence: command, failing test, code path, contract, or counterexample
Impact: observable consequence
Suggested proof: smallest test or check that confirms the fix
```

Return `NO_PROVEN_FINDINGS` when no claim meets the evidence threshold. Do not
invent a finding to satisfy the adversarial framing.
