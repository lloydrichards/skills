# Evaluation plan

Run each evaluation twice in the same iteration: once with `skills/behavioral-test-refactoring` and once without it. Both runs are audits only and must save their reports in the iteration workspace.

- **MemoryFileSystem** is a real shared-conformance versus adapter-invariant case.
- **EvaluationService** is a real behaviour-first Effect service case; do not modify its currently dirty repository file.
- **PaymentGateway** is adversarial and checks that the skill does not optimize for test-file length or erase valuable boundary/regression coverage.

Grade against the expectations in `evals.json`. Human review should primarily compare whether the reports make safe, specific ownership decisions and whether they remain concise enough to use at feature end.
