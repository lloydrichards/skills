# Date And Time

Use this when reading current time, parsing or formatting dates, handling time zones, or applying calendar arithmetic.

Use `DateTime` and `Clock` for application time. Avoid `Date.now()` and ad hoc `Date` construction in Effect workflows because `DateTime.now` reads the testable Effect clock.

## Model And Construction

`DateTime.Utc` and `DateTime.Zoned` represent the same kind of absolute instant; zoned values also retain a time zone for wall-clock parts, calendar arithmetic, and formatting.

```ts
import { DateTime, Option } from "effect"

const parsed = DateTime.make("2026-06-05T14:30:00.000Z")

const deadline = Option.getOrElse(parsed, () =>
  DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
)
```

- Use `DateTime.make`, `makeZoned`, or `makeZonedFromString` for untrusted input; they return `Option`.
- Reserve `makeUnsafe` and other unsafe constructors for trusted construction where a throw is acceptable.
- A date-time string without zone information is interpreted as UTC. Require an explicit zone when wall-clock intent matters.

## Current Time And Zones

Read current time with `DateTime.now`, not `DateTime.nowUnsafe`, inside an Effect.

```ts
import { DateTime, Effect } from "effect"

const expiresAt = Effect.gen(function* () {
  const now = yield* DateTime.now
  return DateTime.addDuration(now, "15 minutes")
})
```

- Use `DateTime.nowInCurrentZone` only when application behavior genuinely depends on the configured current zone.
- Use `DateTime.withCurrentZoneNamed(...)` or its layer form to provide a deterministic zone in an application or test.
- `setZone` normally attaches a zone while preserving the instant. Use `adjustForTimeZone: true` only when interpreting input as wall-clock time in that zone.
- For ambiguous DST wall-clock times, choose a `Disambiguation` deliberately; use `"reject"` when ambiguity must fail validation.

## Formatting And Arithmetic

Use ISO formatting for wire values and logs; use `Intl` formatting only for user-facing display.

```ts
import { DateTime } from "effect"

const dateTime = DateTime.makeUnsafe("2026-06-05T14:30:00.000Z")

const displayDate = DateTime.format(dateTime, {
  dateStyle: "medium",
  timeStyle: "short",
})

const wireDate = DateTime.formatIso(dateTime)
```

- Use `formatIso`, `formatIsoDate`, `formatIsoOffset`, or `formatIsoZoned` for stable machine-readable output.
- `formatLocal` depends on the host's locale and time zone; avoid it for persistent or deterministic output.
- Use `DateTime.add` / `subtract` for calendar arithmetic such as days and months.
- Use `addDuration` / `subtractDuration` for elapsed-time arithmetic.
- Use `startOf`, `endOf`, or `nearest` for reporting and calendar boundaries.

## Testing

Use `TestClock.setTime(...)` or `TestClock.adjust(...)` to test `DateTime.now` behavior. Do not stub `Date.now()` in Effect tests.

## Do Nots

- Do not compare formatted date strings; use `DateTime.Order`, comparison helpers, or epoch milliseconds.
- Do not assume adding one day is the same as adding 24 elapsed hours across DST.
- Do not use the system local zone for business rules unless that is the explicit domain policy.
