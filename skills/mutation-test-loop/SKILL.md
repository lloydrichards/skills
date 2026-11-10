---
name: mutation-test-loop
description: Prove that every active test in a requested suite can detect a deliberate production regression by running a resumable, one-test-at-a-time mutation audit. Use whenever the user says not to trust tests that have not failed, asks whether tests are actually testing behavior, requests a mutation audit or false-positive audit, or wants fresh subagents to mutate production code, run exact focused tests, restore the source, and record durable JSON evidence. Do not use for ordinary test execution, coverage reports, test refactoring, or automated mutation-score tooling alone.
---

# Mutation Test Loop

Audit tests by making the behavior they claim to protect temporarily wrong. A
passing test is baseline evidence; a test earns behavioral evidence only when a
credible production mutation makes that exact test fail and the restored test
passes again.

The main agent owns inventory, workspace integrity, sequencing, ledger updates,
and completion. Give each trial to a fresh subagent with only the context needed
for one test. Run trials sequentially because agents share the checkout.

This is a campaign, not a sample. The coordinator keeps control until the ledger
has no actionable target. Do not return a progress summary as though it were a
result while `pending` or safely recoverable `running` targets remain.

Read `references/ledger-schema.md` before creating or updating the audit ledger.
Read `references/worker-contract.md` before spawning the first trial worker.

## Scope contract

Before mutating anything, establish:

1. The exact suite entrypoint or entrypoints in scope.
2. What counts as an active test and which skipped, todo, generated, or
   runtime-specific cases are excluded.
3. The production boundary allowed to change temporarily.
4. The exact focused-test command and full-suite command.
5. The ledger path, using a normal resumable `.json` document unless the user
   requests another format.
6. Whether the task is audit-only or also authorizes strengthening survivor
   tests. Default to audit-only.

Do not expand from a named suite into adjacent packages or adapters. Shared
suite cases invoked by multiple runtime entrypoints are separate execution
targets when runtime behavior can differ.

## Phase 1: Establish a trustworthy baseline

Inspect repository instructions, test discovery configuration, suite helpers,
dated or runtime wrappers, and the relevant production code.

Run the untouched suite before starting. Continue only when:

- the suite registers the expected tests;
- all active in-scope tests pass;
- skips and exclusions are inventoried explicitly;
- unrelated failures have been resolved or placed outside the agreed scope;
- the production paths that may be mutated have a captured scoped diff or file
  hash, so pre-existing user changes can be distinguished from audit edits.

Do not start mutation testing when the suite registers zero tests, the selector
is unproven, or the baseline already fails.

## Phase 2: Build a stable inventory

Enumerate every active test from the real runner or repository-native listing
mechanism. Do not rely only on source-text matching when suites generate cases.

Assign each execution target a stable ID. Record its full name, source
location, entrypoint, runtime or protocol variant, focused command, and initial
`pending` status. Preserve prior completed entries when resuming. Append newly
active tests as a new campaign revision rather than rewriting historical
evidence.

Prove the selector on at least one untouched test. It must select exactly the
intended test. Escape regex metacharacters or prefer literal filtering when the
runner supports it.

## Phase 3: Run one fresh-worker trial

### Coordinator control loop

Treat the ledger as the campaign's source of truth. Repeat this exact control
loop in the same task:

1. Validate the ledger and compute `active`, `terminal`, and `remaining`.
2. Recover a `running` attempt first. Confirm that no mutation remains before
   treating it as `pending` again.
3. Select the next stable `pending` target. Record `currentTestId`,
   `remainingBefore`, and an attempt with status `running` in the ledger.
4. Spawn one fresh worker for that target and wait for its result.
5. Adjudicate the result, update the ledger, validate it, and immediately
   return to step 1.
6. Only when no actionable target remains, run the full suite and completion
   checks.

Never batch several mutations into one worker, use the same worker for a second
test, or stop after an arbitrary number of trials. The next ledger query—not
fatigue, a neat intermediate summary, or a long remaining list—decides whether
the campaign continues.

Before sending any final user-facing response, run the same ledger query. If a
target is actionable, send at most a short progress update and continue the
control loop. If a context or execution limit is imminent, checkpoint the
ledger with `nextAction` and the exact next test ID; do not claim completion.

For the next `pending` test, spawn one fresh subagent using the contract in
`references/worker-contract.md`. Never run two mutation workers concurrently in
the same checkout. Record a unique `workerId` for each worker in the terminal
test record so freshness is auditable.

The worker must:

1. Read the test and trace its claimed behavior to the real production
   boundary.
2. Design one minimal production-only mutation that changes that observable
   behavior. Prefer realistic boundary, branch, return-value, state-transition,
   routing, filtering, or omission errors.
3. Reject mutations that only break compilation, fixtures, mocks, test helpers,
   setup, or unrelated behavior.
4. Apply only the mutation and inspect the scoped diff before testing.
5. Run the exact focused test and capture command, exit status, selected-test
   count, and relevant failure output.
6. Restore the exact source without broad reset or checkout commands.
7. Prove the audit mutation is absent while preserving the pre-existing scoped
   diff.
8. Rerun the exact focused test unmutated and capture the clean result.
9. Return a structured trial result to the main agent. The worker must not edit
   the campaign ledger.

The main agent inspects the worker evidence before classifying and updating the
ledger. A worker's confidence is not proof.

## Classification

Use one terminal status per completed target:

- `killed`: the exact test failed because of the intended behavioral
  regression, exact restoration was proven, and the clean focused rerun passed.
- `survived`: the mutation credibly changed the claimed observable behavior but
  the exact test passed, followed by proven restoration and a clean pass.
- `blocked`: a required runner, dependency, permission, runtime, or external
  service is unavailable. This is not a pass or survivor.
- `clean_rerun_failed`: restoration was attempted but the untouched focused
  test did not pass. Stop the campaign and investigate workspace integrity.

Attempts may additionally be `invalid_mutation` when compilation, suite
registration, fixture setup, an unrelated failure, or a malformed mutation
prevented a behavioral trial, or `equivalent_mutation` when the change did not
alter relevant observable behavior. These are attempt outcomes, not proof about
the test. Preserve them and try another credible mutation unless the target is
genuinely blocked.

After an invalid or equivalent attempt, the coordinator must pick another
credible mutation for the same test before moving on. It may classify a target
as `blocked` only with concrete environmental or contract evidence. "I could
not think of another mutation" and "the campaign is taking a long time" are not
blocks.

Keep `pending` for targets not yet attempted. Preserve every attempt inside the
test record, including invalid, equivalent, and superseded attempts.

Do not automatically count a timeout as a kill. Classify it as killed only when
the mutation's intended observable consequence is specifically the detected
timeout and the runner's timeout boundary is part of the test contract.
Otherwise record it as invalid or blocked with evidence.

## Mutation quality gate

A valid mutation should be:

- production-only;
- behavior-changing rather than type- or syntax-breaking;
- minimal enough to attribute the failure;
- on the code path owned by the test's claim;
- plausible as a regression;
- independent of the test's implementation details;
- reversible without disturbing user changes.

When an initial mutation survives because an earlier boundary filters the
changed value, preserve the survivor attempt, trace the actual boundary, and
try a stronger mutation there. Do not relabel the first attempt as killed.

## Survivor handling

In audit-only mode, record the survivor and continue. Do not silently modify
tests or production code.

When the user authorizes survivor hardening:

1. Explain the missing observable assertion.
2. Strengthen the test at the public behavioral boundary.
3. Avoid negative timeout listeners when a deterministic positive observation
   is possible.
4. Re-run a fresh mutation trial and append it as a new attempt.
5. Keep the original survivor as historical evidence.

Use `behavioral-test-refactoring` separately when the requested work becomes a
broad suite redesign rather than focused survivor hardening.

## Restoration and interruption safety

Before every edit, record the target file, the exact original fragment or hash,
and the pre-existing scoped diff. Prefer narrowly contextual patches. Never use
destructive reset, checkout, or broad reverse patches to restore a dirty
worktree.

Mark the attempt `running` in the ledger before spawning the worker. If the
campaign is interrupted, inspect each `running` attempt first, restore any
remaining mutation, verify the scoped diff, and only then resume.

At each checkpoint record `remaining`, `currentTestId`, and `nextAction`. This
makes an interrupted campaign resumable by a new coordinator without relying on
conversation context. A coordinator that inherits an existing ledger must start
from that checkpoint rather than re-inventorying or repeating terminal tests.

Stop immediately when restoration cannot be proven. The campaign is less
important than preserving the user's worktree.

## Ledger discipline

Update the JSON ledger after every trial, not at the end of a batch. Keep raw
commands and concise output excerpts sufficient for reproduction. Do not store
secrets or enormous unbounded logs.

After each update, run:

```bash
node <skill-path>/scripts/validate-ledger.mjs <ledger.json>
```

Treat validator failures as bookkeeping failures that must be corrected before
the next mutation.

## Completion gate

Do not stop merely because progress is substantial. Finish only when:

- every inventoried active execution target is `killed`, `survived`, or
  explicitly `blocked`;
- no attempt remains `running`;
- every `killed` or `survived` result includes proven restoration and a clean
  focused pass;
- blocked targets are reported as unverified rather than absorbed into a score;
- the untouched full suite passes;
- the final scoped diff matches the pre-campaign state;
- ledger IDs and counts validate independently.

If any of these are false, the campaign is incomplete. State the exact blocker,
checkpoint the next action, and keep the result distinct from a completed audit.

Report counts by status, list survivors and blocked targets, identify invalid
attempts separately, give the full-suite result, and state whether workspace
restoration was proven. A partial ledger is progress, never suite completion.
