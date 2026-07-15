# Testing and Mocks

Keep production services focused on production construction. Test mocks and fixtures should normally live in separate test-support files.

## Mock Function

```ts
import { Layer } from "effect"

import { UserStore, type UserStoreShape } from "./UserStore.js"

export const makeUserStoreTestLayer = (
  implementation: Layer.PartialEffectful<UserStoreShape>,
) => Layer.mock(UserStore, implementation)
```

If `Layer.PartialEffectful` is unavailable in the installed Effect version, use `Partial<UserStoreShape>` with care, or define a project-local helper type that matches the available API.

For a named fixture, prefer a function that returns a layer:

```ts
export const makeUserStoreSuccessLayer = (users: ReadonlyArray<User>) =>
  Layer.mock(UserStore, {
    findById: (id) =>
      Effect.fromNullable(users.find((user) => user.id === id)).pipe(
        Effect.mapError(() => new UserNotFound({ id })),
      ),
    save: () => Effect.void,
  })
```

Keep this in a test-support file such as `UserStore.test-layer.ts`, not as `static Test` on `UserStore`.

## Test Principles

- Mock at the service boundary being tested, not inside the production service class.
- Only stub methods exercised by the test when using `Layer.mock`; missing effectful methods should fail loudly if called.
- Prefer real lower-level services for integration tests, and focused mock layers for unit tests.
- Provide mocks at the test program boundary with `Effect.provide(testLayer)`.
- Do not make a mock depend on the production service's `Default`; mocks replace the service boundary.

## Avoid

```ts
export class UserStore extends Context.Service<UserStore, UserStoreShape>()(
  "app/UserStore",
) {
  static readonly Test = Layer.succeed(this, { ... })
}
```

This couples test fixtures to production service identity and encourages production files to accumulate test-only scenarios. Keep reusable mocks in `UserStore.test-layer.ts`, `UserStore.fixtures.ts`, or the repository's established test-support location.
