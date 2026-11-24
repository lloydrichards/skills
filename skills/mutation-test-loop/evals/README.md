# Evaluation plan

The booking fixture is a small Vitest project (`src/booking.mjs`, seven tests)
with three planted weaknesses:

- **Survivor gap:** SAVE20 is never tried on a standard booking, so three line-13
  mutants survive.
- **Weak assertion:** "prices a premium booking" only asserts
  `toBeGreaterThan(0)` and has no unique kills.
- **Blind spot Stryker cannot show:** no test passes fractional nights, and
  Stryker generates no mutant that removes only the `Number.isInteger` guard.

The skill text deliberately uses a different domain (a rate limiter) for its
examples, so a run cannot copy these answers from the instructions.

## Run

The fixture needs `npm install` (Stryker 10.1.1, Vitest 5.0.3), so the harness
must allow network access:

```sh
export MUTATION_NOTES_VALIDATOR="$PWD/skills/mutation-test-loop/scripts/validate-notes.mjs"
bun tools/skills-eval/run.ts --skill mutation-test-loop --eval booking-audit-only --allow-host-tools
bun tools/skills-eval/run.ts --skill mutation-test-loop --eval booking-audit-and-rewrite --allow-host-tools
```

`verify.mjs` checks deterministically:

- `--audit-only`: `src/` and `test/` are unchanged, the tests pass, and the notes
  record the line-13 cluster as a `gap` in a complete `audit-only` campaign.
- Default: `src/` is unchanged, the tests pass, the line-13 cluster is `killed`,
  and the rewritten suite catches four regressions in disposable copies: SAVE20
  on any tier, SAVE20 ignoring tier, premium always discounted, and non-integer
  nights accepted.

The harness passes its environment to `verify.mjs`, so the exported
`MUTATION_NOTES_VALIDATOR` also validates the notes; without it, notes
structure is not checked.

Grade the remaining expectations in `evals.json` against the transcript: the
weak-test finding, the blind-spot finding in audit-only mode, the batching,
and whether the report is honest about what was proven.

Eval 3 (no network, `node:test`) is a manual prompt-only case for the fallback
path and is skipped by the deterministic harness.

## History

The redesign was evaluated with fresh-context Claude subagents on disposable
copies, three rounds of both cases:

| Round | Audit-only | Rewrite | Main feedback acted on |
|---|---|---|---|
| 1 | pass, ~80 s | pass, ~100 s, 94.64% → 100% | Config location, worktree accounting, blind-spot fields |
| 2 | pass | pass | Example notes mirrored the fixture; manual regression check needed a helper (`try-regression.mjs`); `--line` view |
| 3 (fixture hints removed from skill text) | pass; found the blind spot unaided plus an extra SAVE10-on-premium gap | pass, 94.64% → 100%, two hand regressions confirmed | Focused `--line` output, mutant keys in the view, wider `blind_spot` definition, hand-off rules, `worktreeOnlyIntendedChanges` rename |

The previous hand-mutation design recorded 6/6 killed for the same tests and
never found the line-13 gap.
