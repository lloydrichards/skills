# Functional Style

Use this when refactoring local TypeScript transformations, working with optional values, tagged unions, collections, records, sorting, predicates, or immutable nested updates.

Effect's standard-library modules make multi-step transformations explicit, composable, and type-safe. Prefer them when they clarify meaningful work; do not replace direct, readable TypeScript merely to make code look functional.

## Core Style

- Use direct data-first calls for a single clear operation; do not introduce `pipe` solely to use a data-last overload.
- Use `pipe(value, ...)` for multi-step transformations of ordinary data such as arrays, records, and structs.
- Use `.pipe(...)` when the value already exposes it, including `Option`, `Match` matchers, `Effect`, and `Stream` values.
- Use `flow(...)` for a reusable left-to-right transformation function.
- Keep transformations immutable. Prefer module operations over mutation and accumulator loops.
- Use direct property access, `??`, short ternaries, and object spreads when they are clearer than an abstraction.

```ts
import { Array, String, pipe } from "effect"

const parseCsvLine = (input: string) =>
  pipe(
    input,
    String.trim,
    String.split(","),
    Array.map(String.trim),
    Array.filter(String.isNonEmpty),
    Array.dedupe,
  )
```

## Module Selection

| Intent | Module | Prefer |
| --- | --- | --- |
| Transform collections | `Array` | `get`, `map`, `filter`, `flatMap`, `reduce`, `groupBy`, `sort`, `sortBy` |
| Model absence | `Option` | `head`, `findFirst`, `Record.get`, `map`, `flatMap`, `match` |
| Branch on shape | `Match` | `tag`, `when`, `exhaustive`, `orElse` |
| Transform records | `Record` | `get`, `map`, `filter`, `set`, `remove` |
| Transform object fields | `Struct` | `pick`, `omit`, `evolve`, `renameKeys` |
| Normalize strings | `String` | `trim`, `split`, `isNonEmpty` |
| Normalize numbers | `Number` | `clamp`, `between` |
| Define reusable sorting | `Order` | `mapInput`, `combineAll`, `flip` |
| Combine meaningful checks | `Predicate` | `and`, `or`, `not`, `every`, `some` |
| Read/update deep immutable paths | `Optic` | `key`, `optionalKey`, `at`, `modify`, `replace` |

## Optional Values

Use `Option` when absence is intentional data, especially for optional configuration, overrides, arguments, cached state, or collection access. Prefer it to ambiguous `null` / `undefined` in internal application contracts.

Do not use `Option` to avoid modeling a failed required operation. A lookup for a required known identity should fail with a typed `NotFound` error when absence means the operation could not fulfill its contract.

Potentially missing array and record access should remain explicit as `Option`. Use `Option` when absence flows through multiple operations or has domain meaning. A simple `value ?? fallback` remains best for an isolated default.

```ts
import { Array, Option } from "effect"

const displayName = Array.findFirst(users, (user) => user.id === targetId).pipe(
  Option.map((user) => user.name),
  Option.getOrElse(() => "Unknown user"),
)
```

- Use `Option.fromNullishOr(value)` when an external value may be `null` or `undefined`.
- Use `Option.fromUndefinedOr(value)` or `Option.fromNullOr(value)` when the distinction is part of the contract.
- Use `Array.get` for dynamic index access.
- Do not use `Array.getUnsafe` or bracket indexing where the index may be absent.

## Collections And Records

Replace imperative loops and mutation with `Array` or `Record` transformations when there is a clear transformation pipeline.

```ts
import { Array, Record, String, pipe } from "effect"

const activeNames = pipe(
  users,
  Array.filter((user) => user.active),
  Array.map((user) => String.toUpperCase(user.name)),
)

const passingScores = Record.filter(scores, (score) => score >= 60)
```

Use `Effect.forEach` rather than `Array.map` when each operation is effectful. Set its concurrency deliberately when parallel work is safe and bounded.

## Branching With Match

Use `Match` for tagged unions and branches with several independently meaningful cases. It provides exhaustive checking without a growing `switch` statement.

```ts
import { Match } from "effect"

const label = (event: AppEvent) =>
  Match.value(event).pipe(
    Match.tag("UserCreated", ({ name }) => `Welcome ${name}`),
    Match.tag("UserDeleted", ({ name }) => `Goodbye ${name}`),
    Match.tag("OrderPlaced", ({ id }) => `Order #${id} confirmed`),
    Match.exhaustive,
  )
```

Use a direct ternary for a simple two-branch decision. For internal Effect-owned variants, read the `Data.TaggedEnum` guidance in `SCHEMA.md`.

## Object Fields And Deep Updates

Use `Struct.evolve` when several named fields change while the rest of an object stays intact.

```ts
import { Number, Struct } from "effect"

const normalized = Struct.evolve(config, {
  timeout: Number.clamp({ minimum: 0, maximum: 10_000 }),
  retries: Number.clamp({ minimum: 0, maximum: 10 }),
})
```

Use `Optic` when a nested path is reused, contains optional keys or indexed elements, or needs composable immutable updates. Use a direct spread for a short, single update. `optionalKey` focuses `T | undefined`: replacing with a value can add the key, and replacing with `undefined` removes it.

```ts
import { Optic } from "effect"

const displayName = Optic.id<User>()
  .key("profile")
  .optionalKey("displayName")

const renamed = displayName.replace("Ada", user)
```

Useful path steps include `.key(...)`, `.optionalKey(...)`, `.at(...)`, `.pick(...)`, `.omit(...)`, `.tag(...)`, and `.refine(...)`. Use `.modify(...)` to transform a focused value and `.modifyAll(...)` for a traversal.

## Sorting And Predicates

Define reusable ordering criteria with `Order`; combine independent predicates when each has a domain name.

```ts
import { Array, Order, Predicate, pipe } from "effect"

const byName = Order.mapInput(Order.String, (user: User) => user.name)
const byAge = Order.mapInput(Order.Number, (user: User) => user.age)

const oldestFirst = pipe(users, Array.sortBy(Order.flip(byAge), byName))

const isEligible = Predicate.every([isAdult, isVerified, isNotBanned])
const eligibleUsers = Array.filter(users, isEligible)
```

Use an inline comparator for a trivial one-off only when it is clearer. Prefer `Order` for multi-field, reusable, reversed, or domain-significant orderings.

## Do Nots

- Do not force `pipe` around one simple operation.
- Do not wrap a single null-coalesce in `Option` only to unwrap it immediately.
- Do not replace a clear short object spread with `Optic` or `Struct.evolve`.
- Do not use `Match` where a two-branch ternary is clearer.
- Do not use native mutable array sorting; use `Array.sort` or `Array.sortBy`.
- Do not use manual accumulator loops for ordinary collection transforms.
