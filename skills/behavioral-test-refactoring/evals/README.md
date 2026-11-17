# Evaluation plan

The order-total fixture is self-contained and uses Node's test runner. Its contract distinguishes maintained boundary behaviour, a documented regression, a coupled expectation, and an abandoned development probe. Both audit and authorized-refactor cases use the local harness:

```sh
bun tools/skills-eval/matrix.ts --skill behavioral-test-refactoring --dry-run
bun tools/skills-eval/run.ts --skill behavioral-test-refactoring --eval authorized-order-total-cleanup
```

The audit case mechanically checks that files remain unchanged and the baseline passes. The applied case checks changed-path bounds, removal of the retired probe, a passing baseline, and detection of three production regressions in disposable copies. These checks establish bounded sensitivity, not complete equivalence or semantic review quality. Review the expectations in evals.json against the actual transcript and diff.

The payment-gateway case remains a manual, read-only adversarial audit. It is intentionally reported as skipped by the deterministic harness; it is not a passing automated case. Its fixture has no installed Vitest dependency. Do not claim it was executed without arranging a runner.

For comparative evidence, run matched isolated inputs with and without the skill using the same model and record skill/input revisions. Grade ownership decisions, justified deletion, preserved regressions, authorization handling, and maintainer usefulness. Do not grade exact headings, table placement, naming syntax, final test counts, or line reduction as quality.

Keep proposed decisions separate from applied changes and independently verified outcomes. Include unsuccessful runs; copied or inherited transcripts are not additional invocations. Real-project follow-ups should record their base/head revisions and relevant fixtures rather than relying on absolute machine paths.
