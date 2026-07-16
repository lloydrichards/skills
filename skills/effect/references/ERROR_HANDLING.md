# Error Handling

Use this when defining typed failures, adapting throwing or rejecting APIs, recovering from errors, or handling `Cause` and `Exit`.

## Error Model

Use an `Effect` error channel for expected, typed failures. Defects represent unexpected bugs or unwrapped throws; interruption represents cancellation. Do not flatten defects or interruption into ordinary domain errors without a boundary-specific reason.

```ts
import { Data, Effect } from "effect"

export class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly id: string
}> {}

const getUser = (id: string) =>
  Effect.fail(new UserNotFound({ id }))
```

- Use `Data.TaggedError` for runtime-internal failures. Use `Schema.TaggedErrorClass` when an error is serialized, crosses an I/O boundary, or is user-facing.
- Translate infrastructure errors into domain errors at adapter boundaries.
- Include diagnostic context such as operation and stable identifiers, not secrets or unbounded payloads.
- Keep precise errors when callers make different recovery decisions. Group implementation failures only when callers genuinely handle them the same way.
- A cohesive `Schema.TaggedErrorClass` may expose a typed `reason` union when related failures share one transport or presentation policy. Use literal reasons for fieldless cases and tagged reasons when variants carry different data.

## Adapter Boundaries

Use `Effect.try` for synchronous code that can throw and `Effect.tryPromise` for promises that can reject. The `catch` mapper must return an error value; if it throws, that new failure is a defect.

```ts
const loadProfile = (id: string) =>
  Effect.tryPromise({
    try: (signal) => provider.fetchProfile(id, { signal }),
    catch: (cause) => new ProviderError({ operation: "Profile.load", cause }),
  })
```

- Use `Effect.promise` only when the promise cannot reject. A rejection becomes a defect.
- Pass the `AbortSignal` from `tryPromise` into APIs that support cancellation.
- Use `Effect.callback` for callback APIs that need interruption cleanup.
- When several adapter operations map into the same boundary error, prefer a small curried `mapError` helper over repeating wrappers. Name it after the error it produces and preserve operation labels or stable identifiers that aid diagnostics.

## Transform And Recover

Use `Effect.mapError` to translate a typed error at a boundary. Recover only where the current layer has a truthful fallback.

```ts
const displayUser = getUser(id).pipe(
  Effect.catchTag("UserNotFound", () =>
    Effect.succeed({ id, name: "Unknown" }),
  ),
)
```

- Use `Effect.catchTag` for one tagged error and `Effect.catchTags` for a handler table.
- Use `Effect.catchIf` or `Effect.catchFilter` for a meaningful predicate/refinement.
- Prefer typed handlers over broad recovery. They do not catch defects or interruption.
- Use nested `catchReason` / `catchReasons` only when an error intentionally exposes a typed `reason` union. Match the discriminator, never the message text.

## Causes And Outcomes

Use cause-level APIs only at supervision, process, or ingress boundaries that genuinely need to observe typed failures, defects, and interruption together.

```ts
import { Cause, Effect } from "effect"

const reportAndContinue = work.pipe(
  Effect.catchCauseIf(
    (cause) =>
      Cause.hasFails(cause) &&
      !Cause.hasDies(cause) &&
      !Cause.hasInterrupts(cause),
    (cause) => Effect.logError("Worker.failed", cause),
  ),
)
```

- Use `Effect.catchCause` / `catchCauseIf` for full-cause recovery, not ordinary typed errors. A continue policy must exclude defects and interruption unless it explicitly owns them.
- Use `Effect.exit` when an outcome must become data. `Exit.Failure` preserves its `Cause`.
- `Cause` can contain typed failures, defects, and interruption. Keep that distinction visible in diagnostics and policy.

## Do Nots

- Do not throw expected domain failures from Effect code; use `Effect.fail`.
- Do not use `catchCause` when `catchTag`, `catchIf`, or `mapError` expresses the policy.
- Do not catch interruption just to keep a worker alive.
- Do not retry or hide a failure until it has been mapped to the boundary that owns the fallback.
