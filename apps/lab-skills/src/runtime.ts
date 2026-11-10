import { Effect, Layer } from "effect";
import { Hashing, OwnershipState } from "./services.js";
import { diskLayer } from "./adapters/disk.js";
import { httpLayer } from "./adapters/http.js";
import { archiveLayer } from "./adapters/archives.js";
import { inspectionLayer } from "./adapters/inspection.js";

export { makeDiskLayer, diskLayer } from "./adapters/disk.js";
export { inspectionLayer } from "./adapters/inspection.js";

export const runtimeLayer = (envPath: string) => {
  const platform = Layer.unwrap(
    Effect.promise(() =>
      process.versions["bun"]
        ? import("@effect/platform-bun/BunServices").then(
            (module) => module.layer,
          )
        : import("@effect/platform-node/NodeServices").then(
            (module) => module.layer,
          ),
    ),
  );
  const infrastructure = Layer.mergeAll(
    diskLayer,
    httpLayer,
    archiveLayer,
    inspectionLayer(envPath),
    Hashing.Live.pipe(Layer.provide(platform)),
  );
  return Layer.mergeAll(
    platform,
    infrastructure,
    OwnershipState.Live.pipe(Layer.provide(diskLayer)),
  );
};
