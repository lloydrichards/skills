# Service Smells

Use this checklist when reviewing an Effect v4 service.

## v3 Service API in v4 Code

Smell:

```ts
class UserStore extends Effect.Service<UserStore>()("UserStore", {
  dependencies: [...],
  effect: ...
}) {}
```

Prefer `Context.Service<Self, Shape>()("tag")` plus explicit `Layer` construction for v4.

## Service Interface Leaks Requirements

Smell:

```ts
export interface UserStoreShape {
  readonly findById: (id: UserId) => Effect.Effect<User, UserStoreError, Database | Logger>
}
```

The service contract now forces callers and tests to provide implementation details. Yield dependencies in `make`, close over them, and expose methods with `R = never`.

## Value-Channel Failure

Smell:

```ts
export interface UserStoreShape {
  readonly findById: (id: UserId) => Effect.Effect<Option.Option<User>, never, never>
}
```

If absence is a meaningful domain failure for the caller, model it in the error channel instead of returning `Option`, `null`, or `undefined` from the success channel:

```ts
export class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly id: UserId
}> {}

export interface UserStoreShape {
  readonly findById: (id: UserId) => Effect.Effect<User, UserNotFound, never>
}
```

Use `Option` only when optionality is truly successful data, not when the caller must branch on a failed use case.

## Implementation Error Leak

Smell:

```ts
export interface UserStoreShape {
  readonly save: (user: User) => Effect.Effect<void, SqlError | ParseError, never>
}
```

The service interface now reveals that persistence is SQL and validation uses a specific parser. Prefer service/domain errors that preserve the cause without exposing implementation choices:

```ts
export class UserStoreError extends Data.TaggedError("UserStoreError")<{
  readonly operation: "save"
  readonly cause: unknown
}> {}
```

Implementation error types can stay inside `make` or method factories. Public errors should describe the service operation and the recovery decision callers can make.

## Lazy Effect Member

Smell:

```ts
export interface ReportServiceShape {
  readonly dailyReport: Effect.Effect<Report, ReportError, never>
}
```

A service operation should usually be a method that creates an effect for each call:

```ts
export interface ReportServiceShape {
  readonly dailyReport: () => Effect.Effect<Report, ReportError, never>
}
```

Lazy effect fields hide when work is created, make parameters awkward, and can accidentally capture construction-time state. Keep service properties for stable values; use methods for operations.

## Method-Level Dependency Leak

Smell:

```ts
const findById = Effect.fn("UserStore.findById")(function* (id: UserId) {
  const db = yield* Database
  const logger = yield* Logger
  return yield* db.queryUser(id)
})
```

Prefer:

```ts
static readonly make = Effect.gen(function* () {
  const db = yield* Database
  const logger = yield* Logger

  return {
    findById: makeFindById({ db, logger }),
  } satisfies UserStoreShape
})
```

Also inspect helpers called by methods:

```ts
const readUser = (id: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem
    return yield* fs.readFileString(id)
  })
```

If a service method calls this helper, the method still leaks `FileSystem`. Pass the `FileSystem` implementation into a factory instead.

## Implementation Capability Leak

Smell:

```ts
export interface UserStoreShape {
  readonly query: DatabaseShape["query"]
  readonly getClient: () => SqlClient
}
```

The service exposes an implementation tool instead of a domain capability. Prefer methods named after the use case:

```ts
export interface UserStoreShape {
  readonly findById: (id: UserId) => Effect.Effect<User, UserStoreError, never>
  readonly save: (user: User) => Effect.Effect<void, UserStoreError, never>
}
```

If callers need the database, they should depend on the database service directly. A higher-level service should not become a pass-through to its internals.

## Floating Effect

Smell:

```ts
Effect.log("saved user")
return user
```

Effects are descriptions. If an effect is not yielded, returned, or composed into the returned computation, it does not run:

```ts
yield* Effect.log("saved user")
return user
```

Treat floating effects as correctness bugs, not formatting issues. Use Effect language-service diagnostics when available.

## Bypassed Effect Runtime APIs

Smell:

```ts
const apiKey = process.env.API_KEY
console.log("saving user", user.id)
const response = yield* Effect.tryPromise(() => fetch(url))
const payload = JSON.parse(text)
```

Prefer Effect-native APIs when the project provides them: `Config`, `Logger`, `HttpClient`, `Schema`, `Clock`, `FileSystem`, and similar modules. These keep requirements, errors, telemetry, and diagnostics visible to the typechecker and to agents.

Use raw platform APIs only when the local codebase intentionally wraps them at a low-level boundary. In that case, keep the raw call inside the wrapper service and expose typed Effect methods above it.

## Default Leaks Requirements

Smell:

```ts
static readonly Default = Layer.effect(this, this.make)
```

If `make` yielded `Database` and `Logger`, this `Default` still requires them. Provide dependency layers and assert:

```ts
static readonly Default = Layer.effect(this, this.make).pipe(
  Layer.provide(Database.Default),
  Layer.provide(Logger.Default),
  Layer.satisfiesServicesType<never>(),
)
```

## Context.Service Assigned To Variable

Smell:

```ts
export const UserStore = Context.Service<UserStoreShape>("UserStore")
```

In v4, prefer class-style service declarations:

```ts
export class UserStore extends Context.Service<UserStore, UserStoreShape>()(
  "UserStore",
) {}
```

## Test Layer Attached To Production Class

Smell:

```ts
static readonly Test = Layer.mock(this, { ... })
```

Prefer exported test-support functions in separate files.

## Too Many Helpers

Smell: the service file contains many generic helpers that do not describe the service use case.

Prefer method factories that close over dependencies, or move pure reusable transformations into domain modules. Service files should make the dependency boundary and service behavior easy to scan.

## Exported Implementation Helpers

Smell:

```ts
export const normalizeUserName = (name: string) => name.trim()
export const buildUserForSaving = (user: User) => ({ ...user, name: normalizeUserName(user.name) })
```

If these helpers are not part of the public service/domain API, keep them private or move true domain logic to a domain module. Exporting implementation helpers from a service file makes the service boundary fuzzier over time.

## Invented Dependency APIs

Smell:

```ts
database.users.findById(id)
```

when the dependency shape was never provided.

Define a minimal `DatabaseShape` or read the existing dependency first. Structural correctness matters more than a polished-looking imagined API.

## Instruction-Only Guardrail

Smell: the only protection against a recurring service mistake is prose in an agent instruction or README.

Prefer deterministic back-pressure when possible:

- type-level checks such as `Layer.satisfiesServicesType<never>()`;
- Effect language-service diagnostics;
- focused lint rules for project conventions;
- tests that prove the service can run with the minimal required layer.

Keep prose guidance, but turn repeated slop into something tools can catch.
