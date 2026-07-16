# Resources And Scopes

Use this when acquiring resources, registering cleanup, managing scopes, building pools, or refreshing long-lived resources.

## Lifetime Chooser

- One acquire/use/release operation: `Effect.acquireUseRelease(...)`.
- Acquire a handle used later in a workflow: `Effect.acquireRelease(...)` inside `Effect.scoped(...)`.
- Service startup/shutdown resource: `Effect.acquireRelease(...)` inside `Layer.effect(...)`.
- Bounded shared scoped resources: `Pool`.
- Refreshable cached scoped resource: `Resource`.

`Scope` is the lifetime boundary that runs registered finalizers on success, failure, or interruption. Prefer `Effect.scoped` and layers over direct scope management.

## One-Shot Resource Use

Use `acquireUseRelease` when acquisition, use, and release belong to one operation.

```ts
const readFile = (path: string) =>
  Effect.acquireUseRelease(
    openFile(path),
    (file) => file.readAll,
    (file) => file.close,
  )
```

Release failures are part of the returned error channel. Handle or preserve them according to the boundary's policy.

## Scoped Handles

Use `acquireRelease` when a handle must remain available across a workflow. It requires `Scope`; wrap the owning workflow with `Effect.scoped`.

```ts
const program = Effect.scoped(
  Effect.gen(function* () {
    const client = yield* Effect.acquireRelease(
      makeClient,
      (client) =>
        client.close.pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Client.close_failed", cause),
          ),
        ),
    )
    return yield* client.request
  }),
)
```

Use `Effect.ensuring` for a general finalizer only when acquire/release does not model the lifecycle. It is not the normal resource-management primitive.

## Layer-Owned Resources

Acquire long-lived clients, connections, listeners, and subscriptions during layer construction. Their lifetime is the layer/build scope, not one service method call.

```ts
export const layer = Layer.effect(
  Client,
  Effect.gen(function* () {
    const client = yield* Effect.acquireRelease(
      makeClient,
      (client) =>
        client.close.pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Client.close_failed", cause),
          ),
        ),
    )
    return Client.of({ request: client.request })
  }),
)
```

`Layer.effect` supplies the layer scope. Its `acquireRelease` finalizer must be infallible, so catch and report cleanup failures inside it. Do not build a resource layer per request or service method unless isolation is intentional.

## Specialized Resources

- Use `Pool.make(...)` when fibers borrow a bounded set of reusable resources. `Pool.get(...)` is scoped and returns the item when its scope closes.
- Use `Resource.manual(...)` or `Resource.auto(...)` for a cached scoped value that may refresh. A successful refresh replaces and releases the prior resource.
- Use `Scope.provide` only when the caller intentionally owns closing the scope. Prefer `Effect.scoped` or `Scope.use` for automatic closure.

## Do Nots

- Do not yield `Effect.acquireRelease` outside a scope.
- Do not use `Effect.ensuring` as a substitute for ordinary resource release.
- Do not forget that a layer's resources stay alive until its scope closes.
- Do not create an unbounded resource pool when a fixed client or bounded `Pool` fits.
