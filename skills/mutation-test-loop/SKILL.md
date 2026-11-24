---
name: mutation-test-loop
description: Find tests that would not catch a real regression and rewrite them to observe behaviour. Runs a mutation tool (StrykerJS for TypeScript/JavaScript with Vitest) to generate and score mutants, then spends the model's effort triaging survivor clusters, judging equivalent or noisy mutants, and strengthening tests with fast incremental re-runs. Use when the user says not to trust tests that have never failed, asks whether tests actually test behaviour, requests a mutation audit, mutation score, false-positive or survivor review, or wants weak tests hardened with mutation evidence. Do not use for ordinary test runs, coverage reports alone, or test cleanup without a mutation question; use behavioral-test-refactoring for broad suite redesign.
---

# Mutation Test Loop

A passing test is only baseline evidence. A test earns behavioural evidence when
a credible production regression makes it fail. Let the mutation tool create and
run the regressions; spend model effort on judging survivors and writing better
tests, not on reading production code to invent mutants.

The coordinator owns scope, the baseline, triage judgements, the audit notes, and
completion. The tool owns mutant generation, sandboxing, and per-test kill data.

## Phase 0: Scope contract

Establish before running anything:

1. Production files or line ranges to mutate (`mutate`).
2. Test files in scope (`testFiles`) and the exact full-suite command.
3. Mode: `audit-only` (default) or `audit-and-rewrite`. Rewrites change tests
   only; production code changes need explicit permission.
4. Where the config, reports, and audit notes live. Default to
   `reports/mutation/` for all three (`stryker.config.json`, `mutation.json`,
   `audit-notes.json`) and pass the config path to `stryker run`, so the audit
   adds nothing outside that folder. A request to mutation-test is consent to
   create that folder; ask before adding dependencies to `package.json` or a
   root-level config (use `npx -p` instead, see the setup reference). When the
   project already lists Stryker as a dependency, use the installed copy.
   Never commit reports unless asked.

Stay inside the named scope. On a large package, start with the modules the
user named or the ones with the most behaviour, not everything at once.

## Phase 1: Baseline and tool readiness

1. Record the pre-existing worktree state (`git status --short`, scoped
   `git diff`) before anything else, including a requested install, so tool,
   install, and rewrite changes are distinguishable from user edits.
2. Read repository test guidance (if any), the test runner config, and the
   package manager.
3. Run the untouched in-scope tests. Continue only when they register the
   expected tests and pass. Take the exit code from an unpiped run (a pipe
   through `tail` reports `tail`'s status). Record active and skipped counts;
   Stryker's dry run does not catch a selector that registers zero tests or
   silently skipped cases.
4. Choose the engine. Read `references/stryker-setup.md` for versions, config,
   known setup failures, and the fallback order. Prefer the Vitest runner for
   Vitest projects; never default to the slower `command` runner when a native
   runner works.

Stop and report if the baseline fails or the tool cannot run after the
documented fixes. Do not silently fall back to hand mutation for a whole suite;
see the fallback rules in the setup reference.

## Phase 2: One scoped mutation run

Run Stryker once over the scope with `disableBail: true` (so every failing test
is credited), `ignoreStatic: true`, `incremental: true`, and the JSON reporter.
Then summarise:

```bash
npx stryker run reports/mutation/stryker.config.json
cp reports/mutation/mutation.json reports/mutation/before.json
node <skill-path>/scripts/summarise-report.mjs reports/mutation/before.json \
  --json reports/mutation/triage.json --md reports/mutation/triage.md
```

Stryker's exit code is not a pass/fail signal for the audit; read the report.
Read the Markdown triage view, not the raw report. It lists survivor clusters
(one per production line), suspect survivors, tests that never fail, tests with
no unique kills, and uncovered lines. `before.json` is the evidence later
comparisons use; do not overwrite it.

Two helpers answer questions the triage view cannot:

- `summarise-report.mjs <report> --line src/rate-limit.ts:27,src/rate-limit.ts:41`
  prints only the mutants Stryker generated on those lines, their status, and
  which tests killed them.
- `try-regression.mjs` applies one hand-written regression in a temporary copy
  (never in the checkout), runs the tests there, and reports `CAUGHT` or
  `MISSED`:

  ```bash
  node <skill-path>/scripts/try-regression.mjs --file src/rate-limit.ts \
    --find "Math.max(now, last)" --replace "now" \
    -- npx vitest run
  ```

  To show that one test is weak on its own, append that test's filter (for
  Vitest, `-t "<exact name>"`) and check the output registered exactly one
  test, not zero.

With `--md`, the summary script writes the view to that file and prints a
one-line summary; without it, the view goes to stdout. Mutant keys for the
audit notes are listed under each cluster.

## Phase 3: Triage, one source module at a time

Read `references/survivor-triage.md` before the first verdict.

For each survivor cluster, read only the mutated line, its immediate context,
and the tests the triage view lists as covering it. Give the cluster one
verdict:

- `gap`: a plausible regression the tests should catch. Name the missing
  observation (for example "no test makes exactly `limit` requests, so the
  boundary request is never observed").
- `equivalent`: the mutant cannot change observable behaviour. Say why.
- `noise`: behaviour the tests intentionally ignore (span names, colour codes,
  log text). Prefer a narrowly scoped ignore over excluding a whole mutator.
- `out_of_scope`: behaviour owned by another suite or layer the user excluded.
- `false_survivor`: re-running showed it is actually killed, or no test ran.

Suspect survivors (no covering test or zero tests completed) are never `gap`
until a targeted re-run confirms them.

Then review the tests themselves, still per test file:

- Tests that never fail: assertion-free, mocked away from production, or
  asserting on fixtures. These are the strongest weak-test signal.
- Tests with no unique kills: overlap candidates. Record them with
  `action: "handoff"`; do not delete them in this skill. Consolidation belongs
  to `behavioral-test-refactoring`, with the kill evidence. If you strengthen
  such a test in a rewrite, resolve it and note any overlap that remains.
- Claim check: compare each test name with what its assertions observe, and
  each rule in the module with the inputs the tests use. Mutation operators miss
  some regressions (for example a dropped clamp, one operand of a compound
  guard, or an untested combination of inputs), so any credible regression no
  generated mutant represents and no test catches is a `blind_spot`, even when
  nothing survived. Use `--line` to see which mutants exist there and
  `try-regression.mjs` to show the missing regression is `MISSED` (also in
  audit-only mode; it does not touch the checkout). Record the production line in `source` and the
  `try-regression` result in `evidence`. Do not record a blind spot for a
  regression a `gap` cluster already covers; a test already explained by a
  cluster gets its own `tests[]` entry only when its name over-claims.
- Uncovered lines: report as coverage gaps; propose tests only for behaviour in
  scope.

Record verdicts in the audit notes as you go (`references/audit-notes.md`).
Batch by source module; do not dispatch one agent per test or per mutant.

## Phase 4: Rewrite and verify (audit-and-rewrite only)

Work one test file at a time:

1. For each `gap` cluster and `blind_spot`, write or strengthen a test at the
   public behavioural boundary. Prefer exact values, contrasting examples, and
   observed state over mock call counts, truthiness, or snapshots.
2. Run the test file normally; it must pass against unmutated code.
3. Re-run Stryker with the same config. Incremental mode re-tests only mutants
   whose code or covering tests changed, so this usually takes seconds. On a
   large scope, narrow the run to the slice you touched with
   `--mutate "src/rate-limit.ts:10-20" --testFiles test/rate-limit.test.ts`; the
   comparison then reports untouched clusters as "not in this run". Compare:

   ```bash
   npx stryker run reports/mutation/stryker.config.json
   node <skill-path>/scripts/summarise-report.mjs reports/mutation/mutation.json \
     --compare reports/mutation/before.json --md reports/mutation/triage-after.md
   ```

   The output is the full triage view of the new run plus a "Compared with
   previous report" section.

4. A cluster is resolved only when its mutants appear as `Now killed`. If a
   mutant still survives, fix the test or revise the verdict with a reason;
   never relabel a survivor as killed.
5. A test written for a `blind_spot` will show as "never fails", because
   Stryker cannot generate the regression it catches. Re-run the same
   `try-regression.mjs` command: it must now report `CAUGHT`. Record that in
   the test entry's `evidence`.
6. When a rewrite renames a test, keep the original name in `test` and put the
   new one in `renamedTo`.

Subagents are optional here, not a rule. Use them only for independent test
files in separate worktrees, or for an independent reviewer who checks the
rewritten tests against the survivor evidence without seeing your reasoning.
Never run two Stryker processes in the same checkout.

## Completion

The audit is complete when:

- every survivor cluster and suspect survivor in scope has a verdict;
- tests that never fail and claim-check blind spots are listed;
- in `audit-and-rewrite`, every `gap` is resolved by a comparison showing it
  killed, or left open with a stated reason;
- the full in-scope suite passes untouched by mutants;
- the worktree differs from the recorded pre-existing state only by intended
  test edits, the `reports/mutation/` folder, and files the user's request
  produced (for example a lockfile from a requested install), each listed in
  `campaign.worktreeNote`;
- the audit notes validate:

  ```bash
  node <skill-path>/scripts/validate-notes.mjs reports/mutation/audit-notes.json
  ```

Report: score before and after, survivor clusters by verdict, tests that never
fail, blind spots, overlap candidates handed off, rewrites made, anything
blocked, and the exact commands used. A partial triage is progress, not
completion.
