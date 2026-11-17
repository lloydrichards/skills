---
name: behavioral-test-refactoring
description: |
  Audit and refactor existing tests around observable behaviour. Use for test cleanup, consolidation, behaviour-focused review, or a requested pre-PR review of accumulated tests. Prefer a repository's designated test-audit workflow unless explicitly requested. Audit requests stay read-only; cleanup requests authorize supported test refactoring.
metadata:
  version: "0.3.0"
---

# Behavioral test hygiene

Retain tests that protect maintained behaviour and make failures useful to diagnose. Test counts, test-to-production line ratios, coverage percentages, and DRY alone do not establish value or redundancy.

## Scope and authority

Read repository testing guidance first. Follow its designated audit workflow unless the user explicitly requests this one. Local test selection, runner commands, and evidence requirements still apply. Use the `effect` skill for Effect-specific testing mechanics when needed.

Audit and review requests are read-only. When the user has already authorized cleanup or refactoring, audit first, then apply supported test-only decisions without asking again. Ask only for unresolved contract decisions or changes beyond the authorized scope. Do not infer permission to change production behaviour, redesign shared suites, or alter test commands from a test-cleanup request.

Prioritize unit and contract suites. A requested PR audit may trace integration and generated-project fixtures to establish coverage ownership across layers. Redesign of E2E, property, performance, or visual suites requires that scope in the request.

Preserve historical regressions, compatibility cases, and disputed policies when their intended contract is unresolved. Record a `human decision` rather than silently deleting or redefining them. A missing issue link is reason to investigate, not proof of low value.

## Establish scope and ownership

Read the production API, in-scope tests, nearby coverage, and repository instructions. Search for existing shared conformance, capability/profile, and cross-adapter suites before judging duplication. Do not infer a portable contract from one implementation.

For a pre-PR pass, establish the intended base and distinguish added, modified, moved, and pre-existing tests newly selected by CI. Inspect executable scenarios inside fixtures and generated projects, not just top-level test declarations. Expand beyond changed tests only to establish their existing coverage owners.

For each test or cohesive cluster, identify:

- the observable promise and relevant condition;
- the plausible defect it detects;
- its owner: public/portable contract, adapter invariant, integration boundary, regression, or artifact;
- the evidence supporting that ownership and retention decision.

Judge edge cases by reachability, consequence, and provenance. Rare data-loss, security, cancellation, and compatibility failures can deserve permanent coverage. A speculative internal branch or arbitrary input variation needs a maintained promise or distinct failure mode to justify its cost.

## Decide what belongs in the durable suite

Account for every in-scope test within a named behaviour cluster. Use `keep`, `combine`, `move`, `delete`, `split`, or `human decision`, with file/test references and evidence. This table is a useful default, not a required output format:

| Test or cluster | Observable behaviour and defect | Owner | Decision | Evidence and risk |
| --------------- | ------------------------------- | ----- | -------- | ----------------- |
| `…`             | `…`                             | `…`   | `…`      | `…`               |

Summarize routine retained coverage by cluster. Expand risky deletions and disputed ownership. Describe the proposed suite shape where it changes, including which existing shared suite receives moved coverage.

Look for obsolete prototype tests, exploratory probes, framework restatements, expectations computed by the production algorithm, and checks that only prove a mock was configured. Remove them only when evidence establishes that they protect no maintained behaviour or a retained test detects the same defect. Interaction assertions remain useful when the interaction itself is a supported protocol contract. For generated source, establish the specific artifact contract below rather than treating all emitted text as durable.

Read [references/test-smells.md](references/test-smells.md) when judging a smell or exception.

## Establish a generated-source contract

For each source-text, AST, or snapshot assertion, name the supported artifact property, its consumer, and the failure that changing it would cause. Evidence can be a documented generated API, configuration/file layout required by a tool, a user-edit preservation rule, or a concrete regression. The assertion itself and the fact that source is emitted are not evidence of a compatibility promise.

Use a semantics-preserving change as a check: could a private helper be renamed, statements reordered, or formatting changed while supported imports, compilation, execution, and user edits still work? An assertion that fails only for such a change usually protects implementation spelling. Identify its retained behavioural/type-check owner, or replace it with the supported property, before recommending removal. If consumer compatibility is genuinely unresolved, defer that decision with the missing evidence; do not automatically keep every emitted identifier as public API.

Keep source assertions for supported export names/import paths, required registration/configuration, machine-read markers, or byte preservation where those exact properties matter. Runtime checks cannot replace compile-time API constraints, absence of a forbidden dependency, or preservation of a user's file. Conversely, source presence alone does not establish that a capability actually runs. Prefer the smallest assertion at the boundary that owns the promise; do not add a second execution environment merely to replace an inexpensive, meaningful artifact check.

## Refactor around behaviour

- Follow repository naming conventions. Otherwise prefer an observable outcome and relevant condition, such as `should <outcome> when <condition>`. Do not rename unrelated tests to satisfy a template.
- Keep several assertions together when they prove one atomic outcome. Split independent promises when separate failures improve diagnosis.
- Combine equivalent examples only with evidence that they protect the same promise at the same ownership layer. Parameterize meaningful inputs with diagnostic case labels. Preserve distinct failure, lifecycle, timing, cancellation, idempotency, and concurrency behaviours.
- Prefer public outputs, errors, events, and boundary state over private state, incidental call order, and mock choreography. Replace coupled mocks with a real collaborator or bounded fake only when that keeps the contract clear and inexpensive.
- Keep snapshots for intentional, reviewed public outputs or formats. Replace incidental snapshots with meaningful assertions when their contract is established; otherwise defer the decision.
- Extract helpers only when they name repeated domain concepts. Keep scenario-defining setup visible.
- Preserve deterministic setup. Repair sleeps, uncontrolled polling, external production data, and order-dependent state using repository guidance.
- Do not add speculative edge cases during hygiene work. Report a concrete uncovered failure separately; add its regression test when the request authorizes it.

## Verify changes and coverage ownership

When edits are authorized:

1. Make small, reviewable test-only batches. Run the focused suite before and after non-trivial changes where practical.
2. For a risky deletion or merge, identify the removed assertion's protected defect and the retained test that detects it. Use a targeted negative control when practical, or show concrete equivalent assertions and exercised paths. Defer deletion when evidence remains insufficient. For an obsolete artifact, establish that no maintained workflow depends on it.
3. Restore temporary mutations immediately, preserving pre-existing edits. A mutation proves sensitivity to that defect only; it does not establish complete equivalence or justify the contract's importance. Passing tests and rename-only changes do not prove redundancy.
4. Run the focused suite and applicable formatting/type checks. Distinguish completed checks from unavailable or out-of-scope checks.

Report changed ownership, decisions applied or deferred, exact checks and results, and proof limits for lost or moved assertions. Do not turn a focused cleanup into a whole-suite mutation campaign.

## Completion

Finish when every in-scope test belongs to an accounted-for cluster, every removed assertion has a retained detector or an evidenced obsolete-artifact rationale, authorized validation has run, and unresolved decisions remain visible. Keep the report proportional to the change and stop at the agreed scope.
