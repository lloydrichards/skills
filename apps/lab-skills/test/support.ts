import { Effect } from "effect";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const io = <A>(f: () => Promise<A>) => Effect.tryPromise(f);

export const temporaryDirectory = (prefix: string) =>
  Effect.acquireRelease(
    io(async () => fs.mkdtemp(join(await fs.realpath(tmpdir()), prefix))),
    (directory) =>
      io(() => fs.rm(directory, { recursive: true, force: true })).pipe(
        Effect.orDie,
      ),
  );
