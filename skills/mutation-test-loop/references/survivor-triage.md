# Survivor triage and rewrite guide

Judge each survivor cluster by asking: "If this line regressed like this in a
real change, should a user-visible behaviour break?" If yes, the tests have a
gap. If no, the mutant is equivalent or noise.

## What a survivor says about the tests

| Surviving mutation | Usual missing observation | Typical fix |
|---|---|---|
| `&&` ↔ `\|\|`, condition → `true`/`false` | No contrasting example where one side of the condition differs | Add the case where only one operand is true |
| `<` ↔ `<=`, `>` ↔ `>=` | Boundary value never exercised | Test the exact boundary and one step either side |
| `===` ↔ `!==`, string constant → `""` | Branch reached but its result never asserted | Assert the value that branch produces |
| Arithmetic operator swap | Inputs where the swap gives the same result (often 0, 1, 2) or only a loose range checked | Use distinguishing inputs and exact expected values |
| Block emptied (`{}`), call removed (`CallExpression`) | Side effect not observed: state, emitted event, written file, returned value | Assert on the resulting state, not on a mock call count |
| Return value replaced | Caller result only checked for truthiness, length, or type | Assert the actual value or the property that matters |
| Array or object literal emptied | Collection contents never checked | Assert specific members |
| Optional chaining removed | Missing-value path untested | Add the input where the value is absent |
| Regex changed | Pattern only tested with one matching input | Add a near-miss input that must not match |
| Covered by many tests, killed by none | Tests run the code but assert elsewhere | Look for `toBeTruthy`, `toBeDefined`, `toHaveBeenCalled`, snapshots, or assertions on fixtures |

## Equivalent and noise verdicts

Call a mutant `equivalent` only with a concrete reason, for example "`<` → `<=`
on line 297 cannot change the result because the loop guard already excludes
the equal case". When unsure, try to write the test: failing to find any input
that distinguishes the mutant is the evidence.

Typical `noise`: trace or span names, log and debug text, ANSI colour codes that
tests deliberately strip, whitespace or separators in human-only output, and
defensive branches unreachable from the public interface. Error message text is
behaviour when users or callers depend on it; ask if unsure.

## Test-level signals

- **Never fails:** a test that no mutant in scope can make fail. Check whether it
  targets another module (then it is out of scope, not weak), asserts nothing
  meaningful, or only checks mocks.
- **No unique kills:** every mutant it kills is also killed by another test.
  This is overlap evidence for `behavioral-test-refactoring`, not a reason to
  delete it here. A test with no unique kills and a weak assertion is usually
  the one to strengthen.
- **Claim mismatch (`blind_spot`):** the test name promises behaviour the
  assertions do not observe, or the production code has a guard no test
  exercises. Stryker cannot mutate every guard into a credible regression (for
  example removing one operand of `a || b` or a `Math.max` clamp), so read the test names
  against their assertions once per file.

## Writing the replacement test

- Observe behaviour through the public interface the test already uses.
- Use exact expected values. `toBe(429)` beats `toBeGreaterThan(0)`.
- Add the contrasting example as its own named test when it is a separate rule
  ("allows exactly `limit` requests in one window"), not as an extra assertion in an
  unrelated test.
- Avoid sleeps, negative timeout listeners, and mocks of the code under audit.
- Do not change production code to make a mutant killable unless the user asked.
- Keep the old test name honest: if a test cannot be made to observe its claim,
  rename it to what it observes and record the gap.

A rewrite is done when the file passes unmutated and the comparison report shows
the cluster's mutants as `Now killed`.
