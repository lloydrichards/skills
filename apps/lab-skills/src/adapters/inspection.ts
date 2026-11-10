import fs from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { Effect, Layer } from "effect";
import { SourceInspection } from "../services.js";
import { problem } from "../error.js";
import { inspectGit } from "../source-inspection.js";

export const inspectionLayer = (envPath: string) =>
  Layer.succeed(SourceInspection, {
    git: Effect.fn("SourceInspection.git")((root, path) =>
      Effect.tryPromise({
        try: () => inspectGit(root, path),
        catch: () => problem("IO_FAILED", "Source inspection failed", 1, root),
      }),
    ),
    executable: Effect.fn("SourceInspection.executable")((name) =>
      Effect.tryPromise({
        try: async () => {
          for (const dir of envPath.split(delimiter).filter(Boolean)) {
            try {
              await fs.access(join(dir, name), constants.X_OK);
              if ((await fs.stat(join(dir, name))).isFile()) return true;
            } catch {
              /* Not available in this PATH directory. */
            }
          }
          return false;
        },
        catch: () =>
          problem("IO_FAILED", "Cannot inspect executable prerequisite", 1),
      }),
    ),
  });
