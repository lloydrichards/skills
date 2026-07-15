# HTTP API

Use this when defining incoming schema-first HTTP APIs, handlers, API middleware, OpenAPI documents, or typed clients.

`effect/unstable/httpapi` is an unstable Effect v4 surface. Verify imports and examples against the project-pinned version before editing. This reference covers incoming APIs; use `HTTP_CLIENTS.md` for outgoing provider calls.

## Contract First

Define a shared `HttpApi` contract with groups and endpoints. The same declaration drives server routing, typed clients, and OpenAPI output.

```ts
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const Api = HttpApi.make("AppApi").add(
  HttpApiGroup.make("users")
    .add(HttpApiEndpoint.get("get", "/:id", {
      params: { id: Schema.String },
      success: User,
      error: UserNotFound,
    }))
    .prefix("/users"),
)
```

- Keep contracts separate from handler implementation so clients and OpenAPI share the same source of truth.
- Define schemas for params, query, headers, payload, success, and error as needed.
- Params, query, and headers decode from strings. Use an explicit string-to-domain schema for numeric, UUID, or branded values.
- GET payloads are query-encoded; body methods use a request body by default.

## Typed Errors

Use schema-backed tagged errors for public failure contracts and declare them on the endpoint.

```ts
export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
  "UserNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}
```

- Use `HttpApiSchema.status(...)` when response status belongs with an existing schema.
- Use `HttpApiSchema.asNoContent(...)` only when a no-content response has an intentional decoding policy.
- Do not let adapter or database errors escape as an undeclared API error surface; map them in services or handlers.

## Handlers And Server

Implement handlers group by group, then build a route layer from the full API.

```ts
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

const UsersHandlers = HttpApiBuilder.group(Api, "users", (handlers) =>
  handlers.handle("get", ({ params }) => UserService.get(params.id)),
)

const ApiRoutes = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(UsersHandlers),
)
```

- Every declared group needs a corresponding handler layer.
- Keep handlers thin: receive decoded input, call services, and return declared successes or typed errors.
- Serve the resulting routes through the project platform's `HttpRouter.serve(...)` and HTTP server layer.

## Middleware, Security, And Docs

Define reusable server/client concerns with `HttpApiMiddleware.Service` and apply them at the API, group, or endpoint level.

- Use `HttpApiSecurity.bearer`, `basic`, `apiKey`, or `http` to describe credential shape and OpenAPI metadata.
- Security schemes do not authenticate by themselves; middleware must validate credentials and provide the authenticated context.
- Use `OpenApi.fromApi(Api)` for a generated document, or `HttpApiBuilder.layer(..., { openapiPath })` to serve it.
- Use `HttpApiScalar.layer` or `HttpApiSwagger.layer` only when interactive API docs are needed.

## Clients And Tests

Use `HttpApiClient.make(...)` or `makeWith(...)` for a typed client backed by an Effect HTTP client. Use `HttpApiTest.groups(Api, ["users"])` for in-memory contract round trips for selected groups without opening a network listener.

## Do Nots

- Do not duplicate route types in separate server and client definitions.
- Do not use raw request parsing in handlers when the endpoint schema can decode it.
- Do not assume security metadata enforces authentication.
- Do not treat this unstable module as version-invariant; check the pinned source first.
