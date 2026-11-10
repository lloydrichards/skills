import { Effect, Layer } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { HttpBytes } from "../services.js";
import { problem } from "../error.js";

export const httpLayer = Layer.effect(
  HttpBytes,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return {
      get: Effect.fn("HttpBytes.get")(function* (url) {
        return yield* Effect.gen(function* () {
          const response = yield* client.get(url);
          if (response.status !== 200)
            return yield* problem(
              "DOWNLOAD_FAILED",
              `Upstream returned HTTP ${response.status}`,
              1,
            );

          const data = new Uint8Array(yield* response.arrayBuffer);
          if (data.length > 64 * 1024 * 1024)
            return yield* problem(
              "DOWNLOAD_FAILED",
              "Archive exceeds 64 MiB",
              1,
            );
          return data;
        }).pipe(
          Effect.timeout("60 seconds"),
          Effect.mapError(() =>
            problem(
              "DOWNLOAD_FAILED",
              "Pinned archive download failed or exceeded limits",
              1,
            ),
          ),
        );
      }),
    };
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
