import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { Effect, Layer } from "effect";
import { Disk } from "../services.js";
import { problem } from "../error.js";

const osCode = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string"
    ? error.code
    : undefined;
const operation = <A>(
  name: string,
  path: string,
  run: (signal: AbortSignal) => Promise<A>,
) =>
  Effect.tryPromise({
    try: run,
    catch: (error) =>
      problem(
        osCode(error) === "EEXIST" ? "UNOWNED_DESTINATION" : "IO_FAILED",
        `${name} failed (${String(osCode(error) ?? "unknown")})`,
        osCode(error) === "EEXIST" ? 3 : 1,
        path,
      ),
  });

export const makeDiskLayer = (filesystem: typeof fs) =>
  Layer.succeed(Disk, {
    info: Effect.fn("Disk.info")((path) =>
      Effect.tryPromise({
        try: async () => {
          try {
            const stat = await filesystem.lstat(path);
            return {
              kind: stat.isSymbolicLink()
                ? ("link" as const)
                : stat.isDirectory()
                  ? ("directory" as const)
                  : stat.isFile()
                    ? ("file" as const)
                    : ("other" as const),
              executable: !!(stat.mode & 0o111),
              mode: stat.mode & 0o7777,
            };
          } catch (error) {
            if (osCode(error) === "ENOENT") return undefined;
            throw error;
          }
        },
        catch: () => problem("IO_FAILED", "Cannot inspect path", 1, path),
      }),
    ),
    read: Effect.fn("Disk.read")((path) =>
      operation("Read", path, (signal) =>
        filesystem.readFile(path, { signal }),
      ),
    ),
    list: Effect.fn("Disk.list")((path) =>
      operation("List", path, () =>
        filesystem.readdir(path).then((names) => names.sort()),
      ),
    ),
    realPath: Effect.fn("Disk.realPath")((path) =>
      operation("Read link", path, () => filesystem.realpath(path)),
    ),
    mkdir: Effect.fn("Disk.mkdir")((path, recursive) =>
      operation("Create directory", path, async () => {
        await filesystem.mkdir(path, { recursive });
      }),
    ),
    write: Effect.fn("Disk.write")(
      (path, data, executable, exclusive = false) =>
        operation("Write", path, async () => {
          const mode = executable ? 0o755 : 0o644;
          if (!exclusive) {
            await filesystem.writeFile(path, data, { mode });
            await filesystem.chmod(path, mode);
            return;
          }
          // Do not confuse an acquired but incompletely initialized file with a
          // pre-existing lock. Only clean up the inode this call actually created.
          const handle = await filesystem.open(path, "wx", mode);
          let identity: import("node:fs").Stats | undefined;
          let initialized = false;
          try {
            identity = await handle.stat();
            await handle.writeFile(data);
            await handle.chmod(mode);
            await handle.close();
            initialized = true;
          } finally {
            if (!initialized) {
              try {
                await handle.close();
              } catch {
                /* The failed close may already have closed it. */
              }
              const current = await filesystem.lstat(path).catch((error) => {
                if (osCode(error) === "ENOENT") return undefined;
                throw error;
              });
              if (
                identity &&
                current?.dev === identity.dev &&
                current.ino === identity.ino
              )
                await filesystem.unlink(path);
            }
          }
        }),
    ),
    chmod: Effect.fn("Disk.chmod")((path, mode) =>
      operation("Change mode", path, () => filesystem.chmod(path, mode)),
    ),
    rename: Effect.fn("Disk.rename")((from, to) =>
      operation("Rename", from, () => filesystem.rename(from, to)),
    ),
    remove: Effect.fn("Disk.remove")((path, recursive = false) =>
      operation("Remove", path, async () => {
        const stat = await filesystem.lstat(path).catch((error) => {
          if (osCode(error) === "ENOENT") return undefined;
          throw error;
        });
        if (!stat) return;
        if (stat.isDirectory() && !recursive) await filesystem.rmdir(path);
        else await filesystem.rm(path, { recursive, force: false });
      }),
    ),
    atomic: Effect.fn("Disk.atomic")((path, data) =>
      operation("Atomic write", path, async () => {
        const temp = join(dirname(path), ".lab-skills-state-" + randomUUID());
        let replaced = false;
        try {
          const handle = await filesystem.open(temp, "wx", 0o600);
          try {
            await handle.writeFile(data);
            await handle.sync();
          } finally {
            await handle.close();
          }
          await filesystem.rename(temp, path);
          replaced = true;
        } finally {
          // Rename consumes the temporary name. Nothing fallible may turn a
          // successful replacement into an apparent pre-commit failure.
          if (!replaced) await filesystem.rm(temp, { force: true });
        }
      }),
    ),
    unique: Effect.sync(randomUUID),
  });

export const diskLayer = makeDiskLayer(fs);
