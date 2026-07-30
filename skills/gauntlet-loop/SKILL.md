---
name: gauntlet-loop
description: Run an evidence-driven implementation workflow that plans a code change, marks intended edit points with temporary inline anchors, verifies the plan independently, implements safely with subagents where useful, and challenges the result through adversarial code review until the success criteria are proven or user input is required. Invoke explicitly for substantial implementation, refactoring, or bug-fix work that warrants staged planning and independent verification; do not use for explanation-only requests, tiny mechanical edits, or ordinary code review.
---

# Gauntlet Loop

Take a code change from contract to proof. Keep the main agent responsible for
scope, decisions, integration, and the final evidence. Use subagents to create
independent checks, not to outsource judgment.

Read `references/implementation-anchors.md` before adding temporary source
comments. Read `references/review-lenses.md` before prompting verifier or
adversarial subagents.

## Operating contract

- Inspect applicable repository instructions, the real contract, call sites,
  tests, and analogous local code before designing the change.
- Treat the user's success criteria as the definition of done. Translate vague
  goals into observable outcomes without silently expanding scope.
- Preserve unrelated user changes and repository conventions.
- Prefer the smallest coherent implementation. Do not introduce speculative
  abstractions or cleanup merely because nearby code could be improved.
- Use technical evidence to adjudicate feedback. Reviewer confidence is not
  proof.
- Keep the user informed during long work and stop when a material decision,
  authority, or missing input belongs to them.

## Phase 1: Establish the contract

Record a compact working contract:

1. Observable success criteria.
2. Scope and explicit non-goals.
3. Existing behavior and boundaries that must remain intact.
4. Relevant repository instructions and validation commands.
5. Material risks or ambiguities.

Resolve facts from the repository when possible. Ask the user only when
different reasonable answers would materially change the result.

Before planning edit points, run a decision audit: identify every proposed
constant, default, lifecycle rule, data-retention rule, compatibility choice,
or public behavior that is not fixed by the request or repository. Distinguish
an implementation detail that can be changed without observable consequence
from a product or architecture policy that callers will depend on.

Do not make provisional functional edits to answer a policy question. If a
material choice cannot be grounded, stop before adding anchors and ask one
focused question. Examples include inventing a timeout duration, choosing
whether access refreshes expiry, selecting destructive conflict behavior, or
creating a new public fallback. Reversible experimentation is appropriate only
for discovering technical facts, not for silently selecting user-owned policy.

## Phase 2: Plan verifiable slices

Break the work into the smallest independently testable slices. For each slice,
identify:

- the behavior it changes;
- the likely files or architectural boundary;
- the contract or invariant it must preserve;
- the validation that will prove it;
- dependencies on other slices;
- whether its implementation is genuinely independent of other work.

Present the plan before editing when the user requested a review checkpoint or
when the change has broad architectural consequences. Otherwise, continue
through the workflow while making the plan visible in progress updates.

## Phase 3: Place implementation anchors

Add temporary `TODO(gauntlet-N)` comments at the actual intended change points.
Use stable sequential identifiers and follow the format in
`references/implementation-anchors.md`.

Anchors are a reviewable projection of the plan, not a second design document.
Each anchor should state the intended behavior and any non-obvious constraint.
Mention validation only when it helps connect the edit point to proof.

After placing them:

- search for every `TODO(gauntlet-` marker;
- compare their coverage with every planned slice and success criterion;
- inspect the diff to ensure only comments changed;
- avoid formatting or unrelated edits at this stage.

## Phase 4: Pass the plan-verification gate

Spawn one read-only verifier. Give it the original task, success criteria,
repository instructions, and anchored source. Do not tell it that the plan is
good or reveal the conclusion it is expected to reach.

Require exactly one verdict:

- `READY`: another competent implementer has enough grounded detail;
- `NEEDS_REVISION`: list precise omissions, contradictions, or misplaced
  anchors;
- `BLOCKED`: name the user decision or unavailable fact required.

The verifier must check criterion coverage, boundary correctness, feasibility,
ordering, testability, scope discipline, and provenance for every observable
default or policy. An ungrounded product decision is `BLOCKED`, not a detail the
verifier should repair by choosing a value. The main agent must inspect the
evidence behind the verdict. Revise and reverify when the criticism is valid.
Do not implement through a genuine `BLOCKED` verdict.

## Phase 5: Implement controlled slices

Keep integration ownership with the main agent. Delegate only bounded tasks.

Parallelize read-heavy investigation, tests, or implementation slices with
disjoint file and contract ownership. Avoid parallel writes to the same files
or shared architectural seam. When ownership overlaps, implement sequentially.

Tell each implementation subagent:

- its exact slice, success criteria, and allowed files;
- which anchors it owns;
- which contracts and local patterns to preserve;
- which validation to run;
- to reread current files immediately before editing;
- to report changed files, commands, results, and unresolved concerns.

Inspect every returned change before integrating it. Run focused validation
after each slice where practical, then run the relevant combined checks.
Remove an anchor when its behavior is implemented and validated; do not leave
it as a completion marker.

## Phase 6: Challenge the change

After the implementation is coherent and focused checks pass, spawn independent
read-only adversarial reviewers. Choose distinct lenses from
`references/review-lenses.md` based on the actual risk. Use two lenses for a
small but non-trivial change and three or more for broad or high-risk work.

Ask reviewers to assume the change may be wrong and try to prove it, while
making clear that skepticism alone is not a finding. A reported defect must
include at least one of:

- a reproducible failing command or test;
- a concrete code path to incorrect behavior;
- an exact violated contract;
- a minimal counterexample;
- a credible mutation or regression that existing tests would miss.

Keep reviewers independent. Do not pass one reviewer's conclusions into
another's initial prompt.

## Phase 7: Adjudicate and loop

Classify every finding:

- `confirmed`
- `rejected`
- `unproven`
- `out-of-scope`
- `needs-user-decision`

Reproduce confirmed findings locally when practical. Fix confirmed in-scope
defects, add regression coverage when it strengthens the observable contract,
and rerun affected validation. Explain why rejected or out-of-scope findings do
not change the implementation.

After fixes, rerun only the review lenses whose evidence or risk changed. Do
not restart every reviewer mechanically. If a second adversarial pass finds no
new confirmed high- or medium-impact defect, treat the review as converged.

## Completion gate

Finish only when:

- every success criterion has concrete evidence;
- targeted tests pass;
- required broader checks pass, or environmental failures are clearly
  separated from source failures;
- all confirmed in-scope findings are resolved;
- no `TODO(gauntlet-` anchors remain;
- the final diff contains no unintended changes;
- comments and documentation describe the final behavior rather than the
  implementation process.

Report:

1. What changed.
2. Evidence for each success criterion.
3. Validation commands and results.
4. Confirmed adversarial findings fixed.
5. Remaining limitations, infrastructure failures, or user decisions.

Stop for the user instead of claiming completion when criteria conflict, scope
must materially expand, required access is unavailable, or a product or
architecture choice cannot be grounded from the repository.
