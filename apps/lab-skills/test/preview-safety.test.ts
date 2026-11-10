import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect, reviewedPlan } from "../src/tui/inspection.js";
import { runtimeLayer } from "../src/runtime.js";
import { Disk, SourceInspection } from "../src/services.js";
import { parseMarkdown } from "../src/tui/okf/parse.js";
import type { Flags } from "../src/config.js";

const io = <A>(f: () => Promise<A>) => Effect.tryPromise(f);
const content = "# Example\n\nInstalled skill preview.\n";
const fixture = Effect.gen(function* () {
  const base = yield* Effect.acquireRelease(
    io(async () =>
      fs.mkdtemp(join(await fs.realpath(tmpdir()), "lab-preview-")),
    ),
    (base) =>
      io(() => fs.rm(base, { recursive: true, force: true })).pipe(
        Effect.orDie,
      ),
  );
  const root = join(base, "checkout");
  const home = join(base, "home");
  yield* io(() => fs.mkdir(join(root, "skills/a"), { recursive: true }));
  yield* io(() => fs.writeFile(join(root, "skills/a/SKILL.md"), content));
  const manifest = {
    schema: 1,
    owner: "test",
    skills: { a: { source: { local: "skills/a" }, dependencies: [] } },
    profiles: { default: ["a"] },
    external: {},
    candidates: {},
  };
  yield* io(() =>
    fs.writeFile(join(root, "manifest.json"), JSON.stringify(manifest)),
  );
  yield* io(() =>
    fs.writeFile(
      join(root, "sources.lock.json"),
      JSON.stringify({ schema: 1, sources: {} }),
    ),
  );
  const flags: Flags = {
    command: "plan",
    json: false,
    home,
    targets: ["agents"],
    profiles: ["default"],
  };
  const plan = yield* inspect(root, flags, { home });
  const applied = yield* inspect(
    root,
    { ...flags, command: "apply" },
    { home },
    plan.options,
    reviewedPlan(plan),
  );
  assert.strictEqual(applied.result.exitCode, 0);
  yield* io(() =>
    fs.writeFile(
      join(root, "manifest.json"),
      JSON.stringify({
        ...manifest,
        skills: { a: { source: { locked: "upstream" }, dependencies: [] } },
      }),
    ),
  );
  yield* io(() =>
    fs.writeFile(
      join(root, "sources.lock.json"),
      JSON.stringify({
        schema: 1,
        sources: {
          upstream: {
            repository: "test/upstream",
            commit: "a".repeat(40),
            path: "skill",
            revision_basis: "test fixture",
            files: {
              "SKILL.md": { sha256: "b".repeat(64), executable: false },
            },
            license_files: {},
          },
        },
      }),
    ),
  );
  yield* io(() => fs.rm(join(root, "skills/a"), { recursive: true }));
  return { root, home, flags, file: join(home, ".agents/skills/a/SKILL.md") };
});
const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provideService(SourceInspection, {
      git: () =>
        Effect.succeed({ revision: "f".repeat(40), dirty: false, changes: [] }),
      executable: () => Effect.succeed(false),
    }),
    Effect.provide(runtimeLayer("")),
  );

describe("Skill preview safety", () => {
  it.effect(
    "preserves special-file conflicts without trying to read the unsafe document",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const disk = yield* Disk;
        let reads = 0;
        const result = yield* inspect(f.root, f.flags, { home: f.home }).pipe(
          Effect.provideService(Disk, {
            ...disk,
            info: (path) =>
              path === f.file
                ? Effect.succeed({
                    kind: "other" as const,
                    executable: false,
                    mode: 0,
                  })
                : disk.info(path),
            read: (path) =>
              path === f.file
                ? Effect.sync(() => {
                    reads++;
                    throw new Error("Unsafe document must never be read");
                  })
                : disk.read(path),
          }),
        );
        assert.strictEqual(reads, 0);
        assert.strictEqual(result.result.exitCode, 3);
        assert.isTrue(
          result.result.diagnostics.some((d) => d.code === "PATH_UNSAFE"),
        );
        assert.strictEqual(result.result.entries[0]?.status, "conflict");
        assert.deepStrictEqual(
          result.previews.get("agents/a")?.document,
          parseMarkdown(
            "Preview unavailable. The skill document could not be read safely or parsed.",
          ),
        );
      }).pipe(provide),
  );

  it.effect("still previews regular installed documents", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const result = yield* inspect(f.root, f.flags, { home: f.home });
      assert.strictEqual(
        result.previews.get("agents/a")?.title,
        "Installed SKILL.md",
      );
      assert.deepStrictEqual(
        result.previews.get("agents/a")?.document,
        parseMarkdown(content),
      );
    }).pipe(provide),
  );
});
