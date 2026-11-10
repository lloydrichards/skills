# Services And Layers

Use this when defining service contracts, `Context.Service` classes, implementations, layers, runtime wiring, or service review boundaries.

## Canonical Service Shape

Declare the public shape first, then use a domain-named `Context.Service` class as the service identity. Keep construction and production layers on the class so callers can discover them together.

```ts
export interface UserStoreShape {
  readonly findById: (
    id: UserId,
  ) => Effect.Effect<User, UserNotFound | UserStoreUnavailable>
  readonly save: (
    user: User,
  ) => Effect.Effect<void, DuplicateEmail | UserStoreUnavailable>
}

export class UserStore extends Context.Service<UserStore, UserStoreShape>()(
  "app/UserStore",
) {
  static readonly make = Effect.gen(function* () {
    const database = yield* Database

    const findById = Effect.fn("UserStore.findById")(function* (id: UserId) {
      // Translate database failures at this service boundary.
      // Return UserNotFound when the requested identity does not exist.
      return yield* Effect.die("implementation omitted")
    })

    const save = Effect.fn("UserStore.save")(function* (user: User) {
      return yield* Effect.die("implementation omitted")
    })

    return {
      findById,
      save,
    } satisfies UserStoreShape
  })

  static readonly Live = Layer.effect(this, this.make).pipe(
    Layer.satisfiesServicesType<Database>(),
  )

  static readonly Default = this.Live.pipe(
    Layer.provide(Database.Default),
    Layer.satisfiesServicesType<never>(),
  )
}
```

Guidance:

- Name the shape after the domain service, such as `UserStoreShape`; do not use generic `Interface` / `Service` names by default.
- Define public and non-trivial effectful methods with `Effect.fn("Service.operation")`.
- Acquire dependencies once in `make`, then define methods there so they close over the acquired implementations.
- Return the implementation with `satisfies ServiceShape` so contract drift is caught next to construction.
- Keep the service class focused on identity, construction, and production layers. Keep unrelated helpers and test implementations elsewhere.
- Follow an established project-local module convention when it differs. Do not introduce barrels, TypeScript namespaces, or self-reexported module namespaces as a general Effect convention.

## Optional Module Namespace Style

Some applications organize each domain module around file-local role names and expose one canonical ES module namespace. This is a project convention, not an Effect requirement. Use it only when the repository already follows it or the task explicitly adopts it.

```ts
export interface Interface {
  readonly get: (id: UserId) => Effect.Effect<User, NotFound | PersistenceError>
}

export class Service extends Context.Service<Service, Interface>()(
  "@app/UserRepo",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const get = Effect.fn("UserRepo.get")(function* (id: UserId) {
      // ...
    })

    return Service.of({ get })
  }),
)

export * as UserRepo from "./user-repo.js"
```

Consumers then use the domain namespace:

```ts
import { UserRepo } from "./user-repo.js"

const program = Effect.gen(function* () {
  const repo = yield* UserRepo.Service
  return yield* repo.get(id)
})
```

Guidance:

- Keep one style consistent within a module boundary. Do not mechanically convert domain-named service classes to generic names.
- A sibling imports the owning leaf directly; a folder or package barrel may relay the established identity with `export { UserRepo } from "./user-repo.js"`.
- Export only intentional surface. Keep row codecs, helpers, and implementation details local.
- Do not introduce TypeScript `namespace` declarations for organization.
- The self-export creates the unusual runtime relation `UserRepo.UserRepo === UserRepo`. Use named exports or a separate barrel when the runtime, toolchain, or team conventions make that undesirable.

## Requirements: Intentional Versus Leaked

Public service methods should normally have `R = never`. A database, logger, HTTP client, filesystem, or other implementation dependency leaking from a method forces callers to know how the service is built.

Yield implementation dependencies in `make` and close over their concrete values. Also inspect helpers called by public methods: a helper that yields `Database` still leaks `Database` through its caller.

Non-`never` requirements are valid when the requirement is an intentional part of the public capability. Examples include an explicitly scoped operation or a platform/runtime capability deliberately supplied at the application edge. Make that requirement visible in the shape and explain why callers own it.

## Layer Naming And Wiring

Choose the constructor that matches acquisition:

```ts
Layer.succeed(Service, implementation) // already built
Layer.sync(Service, () => implementation) // lazy and synchronous
Layer.effect(Service, make) // effectful acquisition
```

- `make` may require implementation services.
- `Default` means a fully wired production layer with `RequirementsIn = never`. Enforce this with `Layer.satisfiesServicesType<never>()`.
- Use `Live`, `WithoutDependencies`, or another explicit name when application-level composition intentionally supplies requirements.
- Do not invent credentials, database choices, endpoints, or other deployment authority merely to manufacture a `Default` layer.
- If both open and fully wired forms are useful, derive `Default` from `Live` and provide the dependency layers there.
- Prefer composing named layers once near the application boundary.
- Use `Layer.provide(...)` to hide an implementation dependency and `Layer.provideMerge(...)` only when downstream consumers intentionally need it too.
- Use `Layer.mergeAll(...)` for independent exposed layers, not to silence missing-requirement errors.
- Use `Layer.effectContext(...)` when one acquisition intentionally supplies several service tags, especially a first-class test stub or one client backing several capabilities.
- Use `Layer.unwrap(...)` when configuration or runtime discovery selects the layer.
- Reuse named layer values when resources should share layer memoization. Use `Layer.fresh(...)` or local provision only when isolated acquisition is intentional.
- Use `Context.Reference` only for ambient runtime references with a genuinely safe default, not application authority or infrastructure.

## Service Contracts

- Expose domain capabilities, not implementation tools such as `query`, `getClient`, or a dependency's raw API.
- Map persistence, transport, parsing, and SDK errors into service/domain failures. See `ERROR_HANDLING.md` for recoverable errors, internal versus serializable error classes, and reason unions.
- A known-identity lookup that cannot fulfill its contract should fail with a typed `NotFound` error rather than return `Option`, `null`, or `undefined`.
- `Option` remains appropriate when absence is valid domain data, such as an optional override, cached value, or argument.
- Model repeatable operations as methods, including zero-argument methods. Reserve service properties for stable acquired values.
- Keep implementation helpers private. Move meaningful pure domain logic to a domain module instead of exporting service internals.
- Read dependency shapes from the repository before implementing against them; do not invent plausible-looking nested APIs.

## Errors At The Service Boundary

Typed failures should represent recovery or application decisions. Prefer precise errors such as `UserNotFound`, `DuplicateEmail`, or `PermissionDenied` when callers handle them differently.

Collapse implementation failures only when callers genuinely apply the same policy, for example `UserStoreUnavailable { operation, cause }`. Preserve the cause for diagnostics without exposing `SqlError`, vendor SDK errors, or parser internals in the public shape. Do not turn defects or interruption into ordinary service failures.

See `ERROR_HANDLING.md` for error representation and `SCHEMA.md` for serializable error schemas.

When an `Effect.fn(...)` wrapper applies to the whole invocation and needs the original arguments, pass a small transform after the generator. Each transform receives the effect and the original arguments.

```ts
const readAttachment = Effect.fn("Attachment.read")(
  function* (ref: AttachmentRef) {
    return yield* api.read(ref)
  },
  (effect, ref) =>
    effect.pipe(
      attachmentError("Attachment.read", { attachmentId: ref.id }),
    ),
)
```

Good whole-function transforms include error classification, localized recovery, logging annotations, spans, retry, timeout, ensuring cleanup, small local provisioning, and result mapping. Keep branch-local handling in the generator and avoid long transform pipelines.

For boundary errors with operation labels, prefer a shared curried `mapError` helper over hand-writing wrappers in every module.

```ts
const persistenceError = operationError(PersistenceError.make)

const row = yield* query.pipe(
  persistenceError("UserStore.findById"),
)
```

Name the helper after the error it produces. Keep operation labels or stable identifiers that aid diagnosis, and use `Effect.fn(...)` spans in addition to payload labels rather than instead of them.

## Test And Alternate Implementations

Keep mocks, fixtures, stateful fakes, and test control services outside the production service class, normally in a test-support module. A no-op implementation used in production is an alternate adapter and should also be exported separately rather than bundled into the service class.

See `TESTING.md` for `Layer.mock`, reusable test services, and shared test layers.

## Resources And Long-Lived Work

Acquire clients, connections, and other owned resources during layer construction and tie their cleanup to the layer scope. Fork listeners, subscriptions, streams, and forever loops into that scope so layer acquisition can complete.

See `RESOURCES_SCOPES.md` for acquisition/finalization and `STREAMS.md` for long-lived consumers, queues, pubsubs, and interruption.

Use `Effect.forkScoped`, `FiberSet`, or `FiberMap` for scoped background work. Do not expose a public `start` method unless manual lifecycle control is part of the domain contract.

## Review Checklist

- The class is domain-named and its self type matches.
- The returned implementation satisfies the declared shape.
- Implementation dependencies are acquired in `make` and do not leak from methods.
- Every public method requirement is either `never` or explicitly intentional.
- `Default` is fully wired; partial layers have names that advertise open requirements.
- Public errors describe caller decisions rather than implementation libraries.
- Required lookup failures are not hidden in the success channel.
- Effect values are yielded, returned, or composed; none float unused.
- Mocks and implementation helpers do not widen the production surface.
