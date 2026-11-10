import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { inspectGit } from "../src/source-inspection.js";

const io = <A>(f: () => Promise<A>) => Effect.tryPromise(f);

// Write a tiny real Git repository directly. No test setup invokes Git writers,
// user identity configuration, hooks, filters, or the caller's home directory.
const fixture = Effect.acquireRelease(
  io(async () => {
    const root = await fs.mkdtemp(
      join(realpathSync(tmpdir()), "lab-skills-inspection-"),
    );
    const metadata = join(root, ".git");
    await fs.mkdir(join(metadata, "objects"), { recursive: true });
    await fs.mkdir(join(metadata, "refs/heads"), { recursive: true });
    const object = async (type: string, bytes: Buffer) => {
      const data = Buffer.concat([
        Buffer.from(`${type} ${bytes.length}\0`),
        bytes,
      ]);
      const hash = createHash("sha1").update(data).digest("hex");
      const dir = join(metadata, "objects", hash.slice(0, 2));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(join(dir, hash.slice(2)), deflateSync(data));
      return hash;
    };
    const original = Buffer.from("original\n");
    const hash = await object("blob", original);
    const tree = await object(
      "tree",
      Buffer.concat([
        Buffer.from("100644 tracked.txt\0"),
        Buffer.from(hash, "hex"),
      ]),
    );
    const revision = await object(
      "commit",
      Buffer.from(
        `tree ${tree}\nauthor Audit <audit@example.invalid> 0 +0000\ncommitter Audit <audit@example.invalid> 0 +0000\n\nfixture\n`,
      ),
    );
    await fs.writeFile(join(metadata, "HEAD"), "ref: refs/heads/main\n");
    await fs.writeFile(join(metadata, "refs/heads/main"), revision + "\n");
    await fs.writeFile(
      join(metadata, "config"),
      "[core]\nrepositoryformatversion = 0\nbare = false\n",
    );
    await fs.writeFile(join(root, "tracked.txt"), original);
    const stage = async (bytes: Buffer) => {
      const hash = await object("blob", bytes);
      const entry = Buffer.alloc(80);
      entry.writeUInt32BE(0o100644, 24);
      entry.writeUInt32BE(bytes.length, 36);
      Buffer.from(hash, "hex").copy(entry, 40);
      entry.writeUInt16BE("tracked.txt".length, 60);
      entry.write("tracked.txt", 62);
      const header = Buffer.alloc(12);
      header.write("DIRC");
      header.writeUInt32BE(2, 4);
      header.writeUInt32BE(1, 8);
      const index = Buffer.concat([header, entry]);
      await fs.writeFile(
        join(metadata, "index"),
        Buffer.concat([index, createHash("sha1").update(index).digest()]),
      );
    };
    await stage(original);
    return { root, metadata, revision, stage, tree };
  }),
  (f) =>
    io(() => fs.rm(f.root, { recursive: true, force: true })).pipe(
      Effect.orDie,
    ),
);

describe("observational Git source inspection", () => {
  it.live(
    "reports tracked edits, untracked additions, and staged changes",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        assert.deepStrictEqual(yield* io(() => inspectGit(f.root)), {
          revision: f.revision,
          dirty: false,
          changes: [],
        });
        yield* io(() => fs.writeFile(join(f.root, "tracked.txt"), "edited\n"));
        yield* io(() => fs.writeFile(join(f.root, "new.txt"), "new\n"));
        assert.deepStrictEqual((yield* io(() => inspectGit(f.root)))?.changes, [
          " M tracked.txt",
          "?? new.txt",
        ]);
        yield* io(() => f.stage(Buffer.from("edited\n")));
        assert.deepStrictEqual((yield* io(() => inspectGit(f.root)))?.changes, [
          "?? new.txt",
          "M  tracked.txt",
        ]);
        assert.deepStrictEqual(
          (yield* io(() => inspectGit(f.root, "new.txt")))?.changes,
          ["?? new.txt"],
        );
        assert.deepStrictEqual(
          (yield* io(() => inspectGit(f.root, "absent")))?.changes,
          [],
        );
      }),
  );

  it.live("never invokes fsmonitor hooks or clean/process filters", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const marker = join(f.root, "helper-called");
      const helper = join(f.metadata, "helper");
      yield* io(() =>
        fs.writeFile(
          helper,
          `#!/bin/sh\nprintf called >> '${marker}'\nexit 1\n`,
          { mode: 0o755 },
        ),
      );
      yield* io(() =>
        fs.appendFile(
          join(f.metadata, "config"),
          `fsmonitor = ${helper}\n[filter "probe"]\nclean = ${helper}\nprocess = ${helper}\nrequired = true\n`,
        ),
      );
      yield* io(() =>
        fs.writeFile(join(f.root, ".gitattributes"), "*.txt filter=probe\n"),
      );
      yield* io(() =>
        fs.writeFile(join(f.root, "tracked.txt"), "changed bytes\n"),
      );
      const originalIndex = yield* io(() =>
        fs.readFile(join(f.metadata, "index")),
      );
      const result = yield* io(() => inspectGit(f.root));
      assert.strictEqual(result?.revision, f.revision);
      assert.strictEqual(result?.dirty, true);
      assert.include(result?.changes ?? [], " M tracked.txt");
      assert.strictEqual(
        yield* io(() =>
          fs.stat(marker).then(
            () => true,
            () => false,
          ),
        ),
        false,
      );
      assert.deepStrictEqual(
        yield* io(() => fs.readFile(join(f.metadata, "index"))),
        originalIndex,
      );
      assert.deepStrictEqual((yield* io(() => fs.readdir(f.metadata))).sort(), [
        "HEAD",
        "config",
        "helper",
        "index",
        "objects",
        "refs",
      ]);
    }),
  );

  it.live("does not fetch missing objects from a promisor remote", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const marker = join(f.root, "remote-called");
      const remote = join(f.metadata, "remote-helper");
      yield* io(() =>
        fs.writeFile(
          remote,
          `#!/bin/sh\nprintf called >> '${marker}'\nexit 1\n`,
          { mode: 0o755 },
        ),
      );
      yield* io(() =>
        fs.appendFile(
          join(f.metadata, "config"),
          `[remote "origin"]\nurl = ext::${remote}\npromisor = true\n[protocol "ext"]\nallow = always\n`,
        ),
      );
      yield* io(() =>
        fs.unlink(
          join(f.metadata, "objects", f.tree.slice(0, 2), f.tree.slice(2)),
        ),
      );
      assert.strictEqual(yield* io(() => inspectGit(f.root)), undefined);
      assert.strictEqual(
        yield* io(() =>
          fs.stat(marker).then(
            () => true,
            () => false,
          ),
        ),
        false,
      );
    }),
  );
});
