# Audit notes

The Stryker JSON reports are the evidence. The audit notes hold only the
judgements the tool cannot make: scope, baseline, verdicts, and what happened to
each gap. Keep them in one JSON file, update them after each source module, and
validate with `scripts/validate-notes.mjs`.

```json
{
  "schemaVersion": 2,
  "campaign": {
    "id": "2026-11-24-rate-limit",
    "mode": "audit-and-rewrite",
    "status": "complete",
    "engine": "stryker-vitest",
    "scope": { "mutate": ["src/rate-limit.ts"], "testFiles": ["test/rate-limit.test.ts"] },
    "baseline": { "command": "npx vitest run test/rate-limit.test.ts", "exitCode": 0, "active": 12, "skipped": 1 },
    "reports": { "before": "reports/mutation/before.json", "after": "reports/mutation/mutation.json" },
    "score": { "before": 71.43, "after": 92.86 },
    "finalSuiteRun": { "command": "npx vitest run", "exitCode": 0 },
    "worktreeOnlyIntendedChanges": true,
    "worktreeNote": "Only test/rate-limit.test.ts changed, plus the reports/mutation/ folder"
  },
  "clusters": [
    {
      "id": "src/rate-limit.ts:41",
      "mutants": ["src/rate-limit.ts:41:9-41:31 EqualityOperator -> used <= limit"],
      "verdict": "gap",
      "reason": "No test makes exactly `limit` requests, so the boundary request is never observed",
      "tests": ["test/rate-limit.test.ts › rejects requests over the limit"],
      "resolution": "killed",
      "evidence": "Compare run: 2 now killed, 0 still surviving"
    },
    {
      "id": "src/rate-limit.ts:12",
      "mutants": ["src/rate-limit.ts:12:28-12:44 StringLiteral -> \"\""],
      "verdict": "noise",
      "reason": "Span name only; no caller or test can observe it",
      "tests": [],
      "resolution": "accepted"
    }
  ],
  "tests": [
    {
      "test": "test/rate-limit.test.ts › tracks usage",
      "renamedTo": "counts each request against the caller's window",
      "signal": "no_unique_kills",
      "note": "Asserts only that the counter is defined",
      "action": "rewrite",
      "resolution": "resolved"
    },
    {
      "test": "test/rate-limit.test.ts › resets the window",
      "signal": "blind_spot",
      "source": "src/rate-limit.ts:27",
      "note": "No test crosses a window boundary with a clock that moves backwards; Stryker generates no mutant that drops the clamp",
      "action": "rewrite",
      "resolution": "resolved",
      "evidence": "try-regression.mjs removing the clamp: MISSED before, CAUGHT after adding 'ignores a clock that moves backwards'"
    }
  ]
}
```

## Fields

`campaign.mode`: `audit-only` or `audit-and-rewrite`.

`campaign.status`: `in_progress`, `complete`, or `blocked` (with
`campaign.blockedReason`).

`campaign.engine`: `stryker-vitest`, `stryker-command`, `other` (name it in
`campaign.engineDetail`), or `manual`.

`clusters[].id`: the triage view's `file:line`. `mutants` holds the mutant keys
printed under each cluster in the triage view (also in `triage.json`); Stryker renumbers mutant IDs every run, so never store bare
IDs.

`clusters[].verdict`: `gap`, `equivalent`, `noise`, `out_of_scope`, or
`false_survivor`. Every verdict needs a `reason`: the missing observation for a
gap, the argument for equivalence, or why the behaviour is noise or out of scope.

`clusters[].resolution`:

- `open`: not addressed yet. Allowed in a complete `audit-only` campaign; in a
  complete `audit-and-rewrite` campaign an open gap needs `openReason`.
- `killed`: a comparison run shows the cluster's mutants killed. Requires
  `evidence`. Only for `gap` or `false_survivor` clusters, and only after a
  re-run.
- `accepted`: equivalent, noise, or out of scope, with no further action.
- `handed_off`: passed to another skill or person (name it in `evidence`).

`campaign.worktreeOnlyIntendedChanges`: true when the worktree differs from the
recorded starting state only by intended changes, all listed in `worktreeNote`.

`campaign.worktreeNote`: every difference from the pre-existing worktree
state: test edits, the reports folder, and files the user's request produced.

`tests[].test`: the triage view's `file › name`, using the original name. A
renamed test keeps its old name here and the new one in `renamedTo`. A blind
spot about an untested production guard is keyed to the nearest related test.

`tests[].signal`: `never_fails`, `no_unique_kills`, or `blind_spot` (a credible
regression no generated mutant represents and no test catches). A `blind_spot`
needs `source`, the production `file:line` it concerns, and an `evidence` line
from `try-regression.mjs`. Do not repeat a regression a gap cluster covers.
`tests[].action`: `rewrite`, `rename`, `handoff`, or `none`. Overlap candidates
(`no_unique_kills`) default to `handoff` with resolution `open`; in a rewrite
they become `resolved` if you strengthened them, with any remaining overlap in
`note`.
`tests[].resolution`: `open`, `resolved`, or `handed_off`. A resolved
`blind_spot` needs `evidence` of the manual check that the new test fails
against the missing regression.

## Completion rules the validator checks

- The baseline passed and registered at least one active test.
- A complete campaign has a passing `finalSuiteRun`,
  `worktreeOnlyIntendedChanges: true`, and a `worktreeNote`.
- A complete `audit-and-rewrite` campaign has `reports.after` and no open gap
  without `openReason`. In `audit-only` there is one run, so `reports.after`
  and `score.after` are optional and normally omitted.
- An `audit-only` campaign has no `killed` gap clusters and no tests resolved by
  a rewrite or rename, because nothing was rewritten.
- Every `blind_spot` has `source` and `evidence`.
- A blocked campaign names its reason.

The validator checks structure and consistency, not whether the evidence is
true. Read the comparison output yourself before marking a cluster `killed`.
