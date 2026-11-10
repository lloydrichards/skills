# Smell Catalog

Use these smells as heuristics. A smell is a prompt to inspect whether the current shape helps the next reader; it is not proof that code should change.

## Abstraction Tax

- **Single-use helper longer than the call site**: Inline when it is used once, longer than what it hides, and its name does not add domain meaning. Keep it when the name explains a business rule, isolates an effect boundary, improves testability, or hides noisy low-level detail inside a dense workflow.
- **Pass-through wrapper**: Remove functions, components, classes, services, or layers that only forward arguments without naming a concept, enforcing a boundary, or adapting a contract.
- **Middle-man module**: Collapse files that mostly re-export or delegate to another local module unless they define a stable public API boundary.
- **Premature generic abstraction**: Replace generic helpers, strategy objects, broad options bags, callbacks, or type parameters that only support one real case with direct code.

## Naming Smells

- Inspect names over roughly 28-30 characters, especially names with stacked phrases such as `ForTargets`, `WithProviderSelection`, `NonInteractive`, or `AuthoritativePackageJsonMerge`.
- Prefer names that describe operation or domain intent over names that narrate implementation mechanics.
- Drop words already supplied by the file name, module name, imported symbol, argument names, object property names, or domain types.
- Keep domain terms that encode project vocabulary, invariants, or public API meaning.
- Prefer verb phrases for effectful/workflow functions: `resolveCapabilities`, `assessPackageJsonMerge`.
- Prefer `From` names for pure conversion or derivation helpers when the source is obvious at the call site: `buildSelectionFrom({ collected })`, `targetIdentityFrom(supportedOn)`.
- Avoid `From` names for functions that perform resolution, mutation, I/O, user interaction, or policy decisions; use verbs like `resolve`, `assess`, `collect`, or `apply`.

Do not rename solely because a name is long. Long names are fine when they preserve a necessary domain distinction, disambiguate similar helpers, or describe a public API contract.

## Control Flow and Comments

- Flatten nested conditionals when early returns or local pattern matching make domain progression clearer.
- Consolidate repeated validation branches only when the order and failure shape remain obvious.
- Inline temporary variables used once when the expression stays readable.
- Keep temporaries that name a meaningful intermediate result or avoid repeating expensive/effectful work.
- Delete comments that restate mechanics. Keep comments that explain non-obvious constraints, external behavior, or why a less obvious approach is necessary.

## Data Drift and Dead Code

- Remove code paths, parameters, feature toggles, and exports that are not reachable or not part of the requested behavior.
- Consolidate parallel constants/defaults when changing one without the other would create a real bug.
- Extract test builders only when they make individual tests more readable; otherwise inline small setup so each test remains obvious.
