# Service Template

Use this order for a typical production service file:

1. imports
2. service-local errors
3. service shape/interface
4. service class and `make`
5. fully wired `Default`

Move domain errors and domain types out of the service file when callers need to construct or pattern-match them across service boundaries.

## Template

```ts
import { Context, Data, Effect, Layer } from "effect"

import { Database, type DatabaseShape } from "./Database.js"
import { Logger, type LoggerShape } from "./Logger.js"

export class UserStoreError extends Data.TaggedError("UserStoreError")<{
  readonly operation: "findById" | "save"
  readonly cause: unknown
}> {}

export interface UserStoreShape {
  readonly findById: (id: UserId) => Effect.Effect<User, UserStoreError, never>
  readonly save: (user: User) => Effect.Effect<void, UserStoreError, never>
}

export class UserStore extends Context.Service<UserStore, UserStoreShape>()(
  "app/UserStore",
) {
  static readonly make = Effect.gen(function* () {
    const db = yield* Database
    const logger = yield* Logger

    const findById = makeFindById({ db, logger })
    const save = makeSave({ db, logger })

    return {
      findById,
      save,
    } satisfies UserStoreShape
  })

  static readonly Default = Layer.effect(this, this.make).pipe(
    Layer.provide(Database.Default),
    Layer.provide(Logger.Default),
    Layer.satisfiesServicesType<never>(),
  )
}

const makeFindById =
  ({ db, logger }: { readonly db: DatabaseShape; readonly logger: LoggerShape }) =>
  Effect.fn("UserStore.findById")(function* (id: UserId) {
    yield* logger.debug("Finding user", { id })

    return yield* db.queryUser(id).pipe(
      Effect.mapError(
        (cause) => new UserStoreError({ operation: "findById", cause }),
      ),
    )
  })

const makeSave =
  ({ db }: { readonly db: DatabaseShape }) =>
  Effect.fn("UserStore.save")(function* (user: User) {
    return yield* db.saveUser(user).pipe(
      Effect.mapError((cause) => new UserStoreError({ operation: "save", cause })),
    )
  })
```

## When Dependency Shapes Are Not Given

Before writing the service implementation, define minimal dependency shapes that match the requested service use case:

```ts
export interface DatabaseShape {
  readonly findUserById: (id: string) => Effect.Effect<User | null, unknown, never>
  readonly saveUser: (user: User) => Effect.Effect<void, unknown, never>
}

export interface LoggerShape {
  readonly debug: (
    message: string,
    fields?: Record<string, unknown>,
  ) => Effect.Effect<void, never, never>
}
```

Use those shapes consistently. Do not invent deeper APIs such as `database.users.findById` unless the repository already exposes that shape.

## Helper Policy

Keep free helpers rare in service files. Prefer:

- methods or method factories inside/near `make` when they close over service dependencies;
- pure domain helpers in a domain module when the logic is meaningful outside the service;
- small inline transformations when extracting a helper only hides local details.

Acceptable top-level method factories take concrete dependency implementations as plain values and return service methods with `R = never`.

Avoid top-level helpers that yield services internally. Those helpers recreate hidden requirements and make every method depend on the broader environment.

Avoid exporting service implementation helpers unless they are already a stable public API. Pure transformations that are meaningful outside the service usually belong in a domain module; otherwise keep them private or inline them near the method that uses them.

When refactoring an existing service, first look for helpers that return `Effect` and use `yield* Dependency`. Either turn them into method factories that accept dependency implementations, move dependency access up into `make`, or deliberately keep the requirement and rename the layer away from `Default`.
