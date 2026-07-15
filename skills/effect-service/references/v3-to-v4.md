# v3 to v4 Service Notes

Many current examples on the internet still use the v3-style `Effect.Service` API. Do not copy those patterns into an Effect v4 codebase unless the repository already uses v3.

## Main Migration

v3-style:

```ts
export class UserStore extends Effect.Service<UserStore>()("UserStore", {
  dependencies: [Database.Default],
  effect: Effect.gen(function* () {
    const db = yield* Database
    return { findById }
  }),
}) {}
```

v4-style:

```ts
export interface UserStoreShape {
  readonly findById: (id: UserId) => Effect.Effect<User, UserStoreError, never>
}

export class UserStore extends Context.Service<UserStore, UserStoreShape>()(
  "UserStore",
) {
  static readonly make = Effect.gen(function* () {
    const db = yield* Database
    return {
      findById: makeFindById({ db }),
    } satisfies UserStoreShape
  })

  static readonly Default = Layer.effect(this, this.make).pipe(
    Layer.provide(Database.Default),
    Layer.satisfiesServicesType<never>(),
  )
}
```

## What Changed

- The service class is the tag/key and public identity.
- `make` is the service constructor.
- Dependencies are explicit layer wiring, not `dependencies: [...]` metadata.
- Static accessors are not the main service API; yield the service and call its methods.
- `Default` should be a fully wired layer unless deliberately named otherwise.

## Migration Checklist

- Replace `Effect.Service` with `Context.Service<Self, Shape>()("tag")`.
- Extract the returned service shape into a named interface or type.
- Move constructor logic into `static readonly make`.
- Replace `dependencies: [...]` with `Layer.provide(...)` on `Default`.
- Add `satisfies Shape` to the returned object.
- Add `Layer.satisfiesServicesType<never>()` to `Default`.
- Move test fixtures/mocks out of the production service class.
