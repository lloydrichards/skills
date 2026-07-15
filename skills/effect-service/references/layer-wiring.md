# Layer Wiring

`make` is allowed to have requirements. `Default` should normally close those requirements by providing dependency layers.

The layer type is:

```ts
Layer.Layer<RequirementsOut, Error, RequirementsIn>
```

For a service's `Default`, `RequirementsIn` should normally be `never`.

## Fully Wired Default

```ts
static readonly make = Effect.gen(function* () {
  const db = yield* Database
  const logger = yield* Logger

  return {
    findById,
  } satisfies UserStoreShape
})

static readonly Default = Layer.effect(this, this.make).pipe(
  Layer.provide(Database.Default),
  Layer.provide(Logger.Default),
  Layer.satisfiesServicesType<never>(),
)
```

The `satisfiesServicesType<never>()` check catches accidental leaked requirements near the service definition instead of later at the app composition root.

Use the check even if the code "looks wired". It is specifically there to catch hard-to-debug leftovers such as `unknown`, `FileSystem`, `Terminal`, `Database`, or `Logger` appearing in `RequirementsIn`.

## Partial Layers

Use a different name when a layer intentionally exposes requirements:

```ts
static readonly Live = Layer.effect(this, this.make).pipe(
  Layer.satisfiesServicesType<Database | Logger>(),
)
```

Use this shape only when an app-level composition root is responsible for wiring dependencies. Do not call this layer `Default`.

If you intentionally ship both forms, make the distinction explicit:

```ts
static readonly Live = Layer.effect(this, this.make).pipe(
  Layer.satisfiesServicesType<Database | Logger>(),
)

static readonly Default = this.Live.pipe(
  Layer.provide(Database.Default),
  Layer.provide(Logger.Default),
  Layer.satisfiesServicesType<never>(),
)
```

## Composition Guidance

- Prefer composing layers once and providing at the application boundary.
- Reuse named layer values when shared resources should be memoized.
- v4 shares layer memoization across `Effect.provide` calls as a safety net, but explicit layer composition is still easier to inspect.
- Use `Layer.fresh` or `Effect.provide(..., { local: true })` only when you intentionally need isolated instances, such as test isolation.

## Optional Fallback Type Check

If `Layer.satisfiesServicesType<never>()` is awkward in a project, use a small local helper:

```ts
const noRequirements = <ROut, E>(
  layer: Layer.Layer<ROut, E, never>,
): Layer.Layer<ROut, E, never> => layer

static readonly Default = noRequirements(
  Layer.effect(this, this.make).pipe(
    Layer.provide(Database.Default),
    Layer.provide(Logger.Default),
  ),
)
```
