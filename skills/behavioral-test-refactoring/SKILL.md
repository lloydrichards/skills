---
name: behavioral-test-refactoring
description: |
  Audit and refactor existing unit and contract test suites so they express observable behaviour with high signal. Use whenever the user asks to tidy, clean up, consolidate, simplify, reduce duplication in, rename, review, or refactor tests; make tests BDD-style or behaviour-focused; or reduce test noise after a feature. Start with a read-only behaviour audit unless the user explicitly authorizes edits. Use this skill even when the user does not name BDD: implementation-coupled mocks, duplicate test layers, overly large test files, unclear test names, and feature-end test accumulation are all signals to apply it.
version: "0.1.0"
---

# Behavioral Test Hygiene

Improve a test suite's ability to communicate and protect observable behaviour. Test code is a maintained product: reducing it is worthwhile only when every removed or combined test has a clear behavioural owner.

This is not a test-framework setup guide, a coverage-maximization exercise, or a request to convert every test to Gherkin. For Effect mechanics—layers, deterministic time, concurrency, fakes, and assertions—use the existing `effect` skill as well.

## Scope and authority

Prioritize unit and contract suites. Include an integration suite only when it expresses a stable service or adapter boundary. Do not redesign E2E, property, performance, or visual suites in v1 unless the user narrows the request to one of them.

Default to **Audit** mode. Do not edit tests, production code, shared suite architecture, or test commands until the user explicitly asks to apply the plan.

Treat these as human decisions, not cleanup opportunities:

- historical regressions and quirky compatibility cases;
- undocumented or disputed policies;
- a change that needs a new shared contract suite or a production seam;
- a test whose value cannot be established from the code, issue, specification, or maintainers' documented intent.

Flag them as `human decision`. Do not silently delete, merge, or rewrite them.

## Workflow

### 1. Establish the contract boundary

Read the current diff, the production API, the requested test files, nearby tests, and repository instructions. Search for existing shared conformance suites, capability/profile suites, and cross-adapter tests before judging duplication.

For each test or cohesive cluster, identify:

- the observable promise;
- its condition and test level;
- its current owner: public/portable contract, adapter or implementation invariant, integration boundary, regression, or artifact;
- the evidence for that ownership.

Do not infer a portable contract from one host implementation. Keep unresolved policy visible rather than crystallizing it into a baseline test.

### 2. Produce the audit before proposing edits

After an optional one-line title or scope/mode statement, put this compact table first. One row can cover a truly inseparable cluster; otherwise use one row per test. Use the `Decision` heading and exactly one approved decision value per row.

| Test or cluster | Observable behaviour | Current owner | Decision | Evidence and risk |
| --- | --- | --- | --- | --- |
| `…` | `…` | contract / adapter / integration / regression / artifact | keep / combine / move / delete / split / human decision | `…` |

Then show the proposed suite shape, grouped by behaviour. State which coverage moves to an existing shared suite and which remains local. Do not use test-line counts, coverage percentage, or DRY alone as the reason for a decision.

### 3. Apply behaviour-first design rules

- Name every in-scope executable test strictly: `should <observable outcome> when <relevant condition>`.
- A test may contain several assertions when they jointly prove one observable promise. Split it when a failure would identify independent behaviour or would be diagnosed separately.
- Combine tests only when the supplied evidence establishes that they exercise the same promise at the same ownership layer. When equivalence cannot be established, use `human decision` rather than a conditional `combine`. Do not merge unrelated success, failure, lifecycle, cancellation, timing, idempotency, or concurrency behaviour merely to shorten a file.
- Prefer outputs, public errors, emitted events, and state exposed by the service boundary over private state, incidental call order, or mock choreography.
- Replace a mock/spy assertion with a real collaborator or bounded fake only when the resulting observable contract stays clear and inexpensive. Otherwise flag the coupling and explain why it remains.
- Keep snapshots only when they intentionally protect a reviewed public output or format. Flag incidental snapshots for an explicit assertion or a human decision.
- Extract or merge helpers only when they name a repeated domain concept. Leave local setup local when abstraction would hide the scenario.
- Preserve deterministic setup. Treat sleeps, uncontrolled polling, external production data, and order-dependent state as design defects; use the repository's testing guidance to repair them.

Read `references/test-smells.md` when judging a smell or exception.

### 4. Gate refactoring and proof

After an audit, ask for approval to apply the proposed decisions. When authorized:

1. Make small, reviewable test-only batches.
2. Run the focused test command before and after a non-trivial batch where practical.
3. For a risky deletion or merge, perform a targeted proof when practical: make the relevant behaviour fail temporarily, or demonstrate its existing shared/public owner. Restore the workspace immediately after any deliberate mutation.
4. Run available formatting and type checks plus the focused suite. Report broader checks separately when unavailable, blocked, or outside the approved scope.

Do not claim that a rename-only change proves coverage. Do not alter production code or create a shared suite without separate approval.

## Refactor report

After an applied refactor, report:

- the original and final behaviour ownership;
- tests kept, combined, moved, deleted, split, and deferred;
- exact checks run and their results;
- proof used for risky consolidation or deletion;
- human decisions and remaining risks.

Keep the report concise. Its purpose is to make review of lost or moved coverage possible.

## Completion criteria

An audit is complete when every in-scope test has an observable behaviour and a decision, the table identifies human decisions, and the proposed suite shape has no unexplained duplication.

An applied refactor is complete when every in-scope name follows `should … when …`, changed tests preserve their stated observable contracts, the agreed focused validation has run, and unresolved exceptions remain visible.
