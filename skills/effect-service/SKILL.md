---
name: effect-service
description: Build and review Effect v4 services in TypeScript. Use whenever creating, refactoring, or reviewing services, Context.Service tags, Layer constructors, Default layers, service mocks, dependency injection, leaking requirements, or Effect v3-to-v4 service migrations. Prefer this skill for any codebase using Effect v4 or effect-smol service/layer patterns.
---

# Effect v4 Service Authoring

Use this skill to create and refine Effect v4 services with clean service contracts, explicit layer construction, and type-level checks that catch dependency leaks close to the service file.

Effect v4 service style centers on `Context.Service`, not v3-style `Effect.Service`. Many online examples still use `Effect.Service`; treat those as legacy unless the local codebase clearly uses Effect v3.

## Core Shape

- Define services as class-style `Context.Service<Self, Shape>()("tag")` declarations.
- Keep the service class thin: it is the dependency key and public identity, not a place for arbitrary helpers.
- Put the public contract in a `Shape` interface or nearby type.
- Keep service method requirements closed: returned methods should normally be `Effect.Effect<A, E, never>`.
- Model public failures with service/domain errors; avoid leaking implementation errors, `Option`-style failures, or lazy effect fields in the service interface.
- Yield dependency services once in `make`, then close over the dependency implementations in returned methods.
- Build `Default` from `make` and provide constructor dependency layers there.
- Add a `Layer.satisfiesServicesType<never>()` check to `Default` unless the layer is intentionally partial.
- Keep test mocks outside the production service class, usually as separate test-support functions.
- If dependency shapes are unknown, define minimal explicit shapes before writing service methods instead of inventing nested APIs.

## Routing

Read the focused reference when the task touches that area:

| Task focus | Read |
| --- | --- |
| New service file, file order, `make`, `Default` template | `references/service-template.md` |
| Layer wiring, `Default` requirement checks, composition | `references/layer-wiring.md` |
| Testing layers, mocks, partial implementations | `references/testing-and-mocks.md` |
| Smells and review checklist | `references/service-smells.md` |
| Migrating or comparing v3 `Effect.Service` examples | `references/v3-to-v4.md` |

## Fast Workflow

1. Identify the service boundary: what capability is exposed, and which dependencies are implementation details.
2. Define or review dependency shapes before using them. Do not assume nested APIs like `database.users.findById` unless the codebase shows them.
3. Define or review the service `Shape`.
4. Ensure dependency services are yielded in `make`, not inside each method or helper used by each method.
5. Ensure returned methods satisfy the service shape and do not leak `R`.
6. Check that absence, parsing, transport, persistence, and validation failures use the error channel with service/domain errors.
7. Ensure `Default` provides dependencies and satisfies `RequirementsIn = never`.
8. Place mocks/test layers outside the production service class.
9. When refactoring, preserve user-visible behavior but still improve public contracts that expose implementation errors, `Option`-style failures, lazy effect fields, or requirement leaks; call out API-breaking contract changes explicitly.
10. Summarize any intentional exceptions, such as a deliberately partial `Live` layer.

## Naming

- Prefer `Default` for the fully wired production layer that callers can provide directly.
- Use `Live`, `layer`, or `WithoutDeps` only when the layer intentionally exposes requirements for an app-level composition root.
- Do not call a layer `Default` if its `RequirementsIn` is not `never`.

## Verification

When editing real code, run the repository's typecheck. If available, Effect's language-service diagnostics are useful for catching:

- service methods that leak requirements;
- floating effects that are constructed but not yielded or returned;
- `Context.Service` used as a variable instead of a class declaration;
- `Effect.fn` opportunities for reusable effectful methods.

If no typecheck is available, still structure the code so TypeScript would catch leaks through:

```ts
return {
  method,
} satisfies MyServiceShape

static readonly Default = Layer.effect(this, this.make).pipe(
  Layer.provide(Dependency.Default),
  Layer.satisfiesServicesType<never>(),
)
```
