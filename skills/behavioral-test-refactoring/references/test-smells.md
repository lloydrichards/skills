# Behavioral Test-Smell Guide

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

Locate an issue, release note, specification, or durable local explanation. If none is available, ask a human before changing it.

## Behaviour and naming smells

### Method-centred title

The name repeats a method name, helper, or internal branch without saying what a caller observes.

Rename it to `should <outcome> when <condition>`. If that sentence cannot be formed, the test may be misplaced or the production responsibility unclear.

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

| Finding | Usual decision | Exception |
| --- | --- | --- |
| General behaviour already covered by shared suite | move or delete | local suite proves an additional observable invariant |
| Separate conditions of one outcome | combine or table-drive only when equivalence is evidenced | use human decision when the prompt/code does not establish whether conditions have distinct semantics |
| Several independent outcomes | split | outcomes are inseparable parts of one transaction |
| Mock call order | replace or flag | protocol interaction/order is public contract |
| Quirky regression | human decision | documented issue/spec proves an intentional contract |
| Incidental snapshot | replace or flag | reviewed public rendering/serialization contract |
