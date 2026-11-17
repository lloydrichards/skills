# Behavioral test-smell guide

Use this guide as a set of investigation prompts. A smell is not proof that a test should disappear: each one can protect a real boundary.

## Ownership smells

### Duplicate-layer coverage

The same observable promise appears in a shared conformance suite and a focused adapter or implementation suite.

Ask which suite owns the general promise. Keep the focused test only if it proves a distinct projection, capability, isolation, lifecycle, or other observable invariant. Move or delete it only after recording that owner.

### Host-quirk baseline

A portable test asserts behaviour supplied by a particular operating system, transport, or adapter.

Keep it in a named capability/profile or adapter suite when the behaviour is intentional. If the policy is unknown, record a human decision instead of making it portable by accident.

### Undocumented regression

A test describes an old bug but the reason it must remain is not apparent.

Locate an issue, release note, specification, or durable local explanation. Preserve the regression and defer any deletion or contract change when its intent remains unclear. Missing provenance alone does not justify removal.

## Behaviour and naming smells

### Method-centred title

The name repeats a method name, helper, or internal branch without saying what a caller observes.

Follow the repository naming convention and state the observable outcome and relevant condition. Without a local convention, `should <outcome> when <condition>` is a useful default. If the behaviour cannot be stated, investigate its ownership before renaming.

### False BDD

The name contains `should` and `when` but the body observes a mock call, private field, or implementation sequence rather than the promised result.

Prefer a public output, error, event, or boundary state. Retain interaction checks only when the interaction itself is the contract, such as a published protocol request.

### Eager test

One test covers several independent behaviours or methods.

Split it when the failures identify separate promises. Keep multiple assertions together when they describe one atomic outcome.

### Assertion roulette

Several unrelated assertions make the failure's meaning unclear.

Add contextual messages or split along independent promises. Do not force one assertion per test.

## Isolation smells

### Mock choreography

The test passes only if private collaborator calls happen in a particular sequence.

Use a real collaborator or focused fake when the public contract remains practical to test. Do not discard a necessary protocol/interoperability assertion merely because it observes an interaction.

### Mystery fixture or shared state

Inputs come from a distant fixture, a database, time, network, or another test without showing the required state.

Make the relevant scenario local and deterministic. Extract a named builder only for a repeated domain concept.

### Temporal flake

The test uses sleep, retries, polling, or timing assumptions to establish readiness.

Use an explicit readiness/control mechanism from the repository's test framework. Test time behaviour intentionally rather than waiting for it.

## Assertion smells

### Tautological expectation

The expected value reuses the same algorithm or helper as production.

State a concrete example, an independently derived invariant, or an external contract.

### Snapshot theatre

A large snapshot substitutes for an explicit contract and changes are accepted without review.

Keep a snapshot only for a deliberate stable output surface. Otherwise assert the meaningful fields, errors, ordering, or formatting rules directly.

## Safe decision guide

| Finding                                           | Usual decision                                            | Exception                                                                                             |
| ------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| General behaviour already covered by shared suite | move or delete                                            | local suite proves an additional observable invariant                                                 |
| Separate conditions of one outcome                | combine or table-drive only when equivalence is evidenced | use human decision when the prompt/code does not establish whether conditions have distinct semantics |
| Several independent outcomes                      | split                                                     | outcomes are inseparable parts of one transaction                                                     |
| Mock call order                                   | replace or flag                                           | protocol interaction/order is public contract                                                         |
| Quirky regression                                 | human decision                                            | documented issue/spec proves an intentional contract                                                  |
| Incidental snapshot                               | replace or flag                                           | reviewed public rendering/serialization contract                                                      |

## Development artifacts and edge cases

### Retired prototype or exploratory probe

A test protects a superseded implementation or a temporary investigation rather than a maintained workflow. Establish that the artifact is obsolete and that useful assertions have a retained owner before deleting it. For generated-source assertions, establish the exact supported artifact property and consumer before deciding whether the check is obsolete.

### Speculative input variation

Several inputs exercise the same promise without detecting distinct failures. Keep meaningful examples in a labelled parameterized case where equivalence is established. Assess rare cases by reachability and consequence; preserve consequential failures and demonstrated regressions rather than applying a frequency cutoff.

### Passing without detecting the defect

A test can pass because its fake supplies the expected result or its assertions never observe the relevant production behaviour. Use a focused negative control when needed. One successful mutation check establishes sensitivity to that defect, not the value of the contract or equivalence with another test.

### Generated-source spelling mistaken for a contract

A test requires a helper name, statement order, or source fragment merely because the product generates code. Ask whether a semantics-preserving rename or reformat would break a supported consumer. If not, compare the check with retained compilation, execution, or API-contract coverage and recommend removing or replacing only the incidental assertion.

Do not apply this reasoning to documented exports/import paths, tool-consumed configuration, required dependency absence, registration metadata, or preservation of user-authored bytes without examining their distinct consumers. Unknown compatibility requires a focused decision, not a blanket rule to keep or delete source checks.
