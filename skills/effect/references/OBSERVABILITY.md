# Observability

Use this when adding structured logs, log annotations, spans, metrics, tracing, OpenTelemetry, or OTLP exporters.

Core logging, metrics, and tracing APIs are stable imports from `"effect"`. Exporter integrations under `effect/unstable/observability` are version-sensitive and must be verified against the pinned Effect version.

## Logging

Use structured logs with bounded, useful context. Configure JSON logs in production and set the minimum log level deliberately.

```ts
import { Effect, Layer, Logger, References } from "effect"

const productionLogging = Layer.merge(
  Logger.layer([Logger.consoleJson]),
  Layer.succeed(References.MinimumLogLevel, "Warn"),
)

const charge = chargeCard(order).pipe(
  Effect.annotateLogs({ orderId: order.id, provider: "acme-pay" }),
  Effect.withLogSpan("checkout.charge"),
)
```

- Use `Effect.annotateLogs` for service, operation, request, and stable entity IDs.
- Use `Effect.withLogSpan` when a log-duration boundary is useful.
- `Logger.layer(...)` replaces existing loggers by default. Use `mergeWithExisting` only when additive logger behavior is intended.
- Never log credentials, tokens, or large/private request payloads.

## Tracing

Use a span around meaningful IO and domain boundaries. `Effect.fn("Domain.operation")` already creates a useful operation span; do not add a redundant wrapper span without a distinct boundary.

```ts
const request = callProvider(input).pipe(
  Effect.withSpan("Provider.request", {
    attributes: { "provider.operation": "lookup" },
    kind: "client",
  }),
)
```

- Use `Effect.annotateSpans` for attributes on spans created below the current effect.
- Use `Effect.annotateCurrentSpan` inside a span when the attribute is known only during execution.
- Keep attribute keys stable and values low-cardinality. Do not use user IDs, raw URLs, or payloads as metric labels.

## Metrics

Define metrics once near their owning boundary, then update or track them at the operation boundary.

```ts
import { Effect, Metric } from "effect"

const providerFailures = Metric.counter("provider_failures_total")

const request = callProvider(input).pipe(
  Effect.trackErrors(providerFailures),
)
```

- Use `Metric.counter` for cumulative counts, `gauge` for current values, `histogram` or `timer` for distributions and latency, and `frequency` for bounded categories.
- Use `Effect.track`, `trackSuccesses`, `trackErrors`, `trackDefects`, or `trackDuration` when the metric follows an effect outcome.
- Keep metric names and attribute values stable and bounded.

## OTLP Exporters

For new projects, prefer the current `effect/unstable/observability` OTLP modules when their unstable status is acceptable. `Otlp.layerJson(...)` is the compact combined exporter layer; verify its dependencies and configuration against the pinned version.

Do not introduce an exporter only to create spans. First establish useful operation names, attributes, logs, and metrics at the application boundaries.
