import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Command } from "effect/cli";
import * as fs from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { spawn } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { pack } from "tar-stream";
import { program } from "../src/program.js";
import { runtimeLayer } from "../src/runtime.js";
import {
  Disk,
  HttpBytes,
  OwnershipState,
  SourceInspection,
  bytes,
  canonical,
} from "../src/services.js";
import {
  type Manifest,
  type SourceLock,
  type MachineConfig,
  type Result,
  type Journal,
  type Skill,
  type LockedSource,
} from "../src/model.js";
import { problem } from "../src/error.js";
import { paths } from "../src/plan.js";
import { io, temporaryDirectory } from "./support.js";

const live = runtimeLayer(process.env.PATH ?? "");
const write = (file: string, content: string | Uint8Array) =>
  io(async () => {
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  });
const md = (name: string) => `---\nname: ${name}\n---\n# ${name}\n`;
const snapshot = (root: string) =>
  io(async () => {
    const values: unknown[] = [];
    const visit = async (path: string): Promise<void> => {
      let stat;
      try {
        stat = await fs.lstat(path);
      } catch (error) {
        if (
          typeof error === "object" &&
          error &&
          "code" in error &&
          error.code === "ENOENT"
        )
          return;
        throw error;
      }
      values.push([
        path,
        stat.mode,
        stat.mtimeMs,
        stat.isSymbolicLink()
          ? await fs.readlink(path)
          : stat.isFile()
            ? Array.from(await fs.readFile(path))
            : null,
      ]);
      if (stat.isDirectory())
        for (const name of (await fs.readdir(path)).sort())
          await visit(join(path, name));
    };
    await visit(root);
    return canonical(values);
  });
const fixture = Effect.gen(function* () {
  const base = yield* temporaryDirectory("lab-skills-test-");
  const root = join(base, "source"),
    home = join(base, "home"),
    config = join(base, "machine.json");
  const skills: Record<string, Skill> = {
    base: {
      ownership: "custom",
      source: { local: "skills/base" },
      dependencies: [],
    },
    app: {
      ownership: "custom",
      source: { local: "skills/app" },
      dependencies: ["base"],
    },
  };
  const manifest = {
    schema: 1 as const,
    owner: "lloydrichards/shared-skills",
    skills,
    profiles: { default: ["app"], base: ["base"] },
    external: { but: { reason: "external" } },
    candidates: {
      "make-pr": { installable: false as const, reason: "pending" },
    },
  } satisfies Manifest;
  const sources: Record<string, LockedSource> = {};
  const lock = { schema: 1 as const, sources } satisfies SourceLock;
  const save = () =>
    Effect.gen(function* () {
      yield* write(join(root, "manifest.json"), bytes(manifest));
      yield* write(join(root, "sources.lock.json"), bytes(lock));
    });
  yield* write(join(root, "skills/base/SKILL.md"), md("base"));
  yield* write(join(root, "skills/app/SKILL.md"), md("app"));
  yield* write(config, bytes({ schema: 1 }));
  yield* save();
  const run = (command: string, ...args: string[]) =>
    program(root, [command, "--config", config, "--home", home, ...args], {
      home: join(base, "invoking-user"),
    });
  return {
    base,
    root,
    home,
    config,
    manifest,
    lock,
    save,
    run,
    baseFile: join(home, ".agents/skills/base/SKILL.md"),
    appFile: join(home, ".agents/skills/app/SKILL.md"),
  };
});
const successful = (result: Result) =>
  assert.strictEqual(result.exitCode, 0, JSON.stringify(result));
const code = (result: Result, expected: string, exit: number) => {
  assert.strictEqual(result.exitCode, exit, JSON.stringify(result));
  assert.isTrue(
    result.diagnostics.some((d) => d.code === expected),
    JSON.stringify(result),
  );
};
const test = (
  name: string,
  body: () => Effect.Effect<
    unknown,
    unknown,
    | Disk
    | HttpBytes
    | OwnershipState
    | import("effect").Path.Path
    | import("../src/services.js").Hashing
    | import("../src/services.js").SourceInspection
    | import("../src/services.js").Archives
    | import("effect").Scope.Scope
    | Command.Environment
  >,
) => it.live(name, () => body().pipe(Effect.provide(live)));

const remote = (f: Effect.Success<typeof fixture>) =>
  Effect.gen(function* () {
    const archive = yield* io(async () => {
      const tar = pack();
      tar.entry({ name: "repo-a/skills/app/SKILL.md" }, md("claude-app"));
      tar.entry({ name: "repo-a/LICENSE" }, "fixture license");
      tar.finalize();
      const chunks: Buffer[] = [];
      for await (const chunk of tar) chunks.push(Buffer.from(chunk));
      return gzipSync(Buffer.concat(chunks));
    });
    const record = (content: string) => ({
      sha256: createHash("sha256").update(content).digest("hex"),
      executable: false,
    });
    f.lock.sources.variant = {
      repository: "example/skills",
      commit: "a".repeat(40),
      path: "skills/app",
      revision_basis: "test fixture, not a historic install pin",
      files: {
        "SKILL.md": record(md("claude-app")),
        "UPSTREAM-LICENSE": record("fixture license"),
      },
      license_files: { "UPSTREAM-LICENSE": "LICENSE" },
    };
    const old = f.manifest.skills.app;
    if (!old) throw new Error("Fixture app missing");
    f.manifest.skills.app = {
      ...old,
      variants: { claude: { locked: "variant" } },
    };
    yield* f.save();
    return archive;
  });

describe("lab-skills filesystem contract, no upstream network", () => {
  test("plan and status are read-only, including nonexistent homes and offline payloads", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* remote(f);
      const before = yield* snapshot(f.base);
      for (const command of ["plan", "status"]) {
        const result = yield* f.run(command, "--target", "claude");
        successful(result);
        assert.deepStrictEqual(
          result.entries.map((e) => e.status),
          ["new", "new"],
        );
        assert.strictEqual(yield* snapshot(f.base), before);
      }
    }));
  test("dependencies install, content hashes are owned, repeat apply changes nothing", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      successful(yield* f.run("apply", "--target", "agents"));
      assert.strictEqual(
        yield* io(() => fs.readFile(f.baseFile, "utf8")),
        md("base"),
      );
      const state = yield* (yield* OwnershipState).read(paths(f.home).state);
      assert.strictEqual(
        state.installations["agents/app"]?.tree.files["SKILL.md"]?.sha256,
        createHash("sha256").update(md("app")).digest("hex"),
      );
      const before = yield* snapshot(f.home);
      successful(yield* f.run("apply", "--target", "agents"));
      assert.strictEqual(yield* snapshot(f.home), before);
    }));
  test("Git provenance is recorded and visible while content remains authoritative", () =>
    Effect.gen(function* () {
      const f = yield* fixture,
        inspection = yield* SourceInspection;
      const git = (revision: string) => ({
        ...inspection,
        git: () =>
          Effect.succeed({
            revision,
            dirty: true,
            changes: [" M fixture-source"],
          }),
      });
      successful(
        yield* f
          .run("apply", "--target", "agents")
          .pipe(Effect.provideService(SourceInspection, git("a".repeat(40)))),
      );
      const result = yield* f
        .run("status")
        .pipe(Effect.provideService(SourceInspection, git("b".repeat(40))));
      successful(result);
      assert.isTrue(result.entries.every((e) => e.status === "current"));
      const entry = result.entries.find((e) => e.id === "agents/app");
      assert.strictEqual(entry?.source?.git?.revision, "b".repeat(40));
      assert.strictEqual(entry?.installedSource?.git?.revision, "a".repeat(40));
    }));
  test("source edits plan updates while installed edits conflict and preserve all files", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      successful(yield* f.run("apply", "--target", "agents"));
      yield* write(join(f.root, "skills/app/SKILL.md"), md("version-two"));
      const next = yield* f.run("plan");
      successful(next);
      assert.strictEqual(
        next.entries.find((e) => e.id === "agents/app")?.status,
        "update",
      );
      yield* write(f.baseFile, "local edit");
      const before = yield* snapshot(f.home);
      code(yield* f.run("apply", "--target", "agents"), "LOCAL_EDIT", 3);
      assert.strictEqual(yield* snapshot(f.home), before);
    }));
  test("source updates add and remove only owned payload files", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      successful(yield* f.run("apply", "--target", "agents"));
      yield* write(join(f.root, "skills/app/new.md"), "new");
      successful(yield* f.run("apply", "--target", "agents"));
      assert.strictEqual(
        yield* io(() =>
          fs.readFile(join(dirname(f.appFile), "new.md"), "utf8"),
        ),
        "new",
      );
      yield* io(() => fs.unlink(join(f.root, "skills/app/new.md")));
      successful(yield* f.run("apply", "--target", "agents"));
      assert.isFalse(
        !!(yield* (yield* Disk).info(join(dirname(f.appFile), "new.md"))),
      );
    }));
  test("unowned identical destinations are not adopted; unrelated skills and links survive", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* write(f.appFile, md("app"));
      const before = yield* snapshot(f.home);
      code(
        yield* f.run("apply", "--target", "agents"),
        "UNOWNED_DESTINATION",
        3,
      );
      assert.strictEqual(yield* snapshot(f.home), before);
      yield* io(() =>
        fs.rename(
          dirname(f.appFile),
          join(dirname(dirname(f.appFile)), "unrelated"),
        ),
      );
      yield* io(() =>
        fs.symlink(
          "/nonexistent/lab-skills-test",
          join(f.home, ".agents/skills/unrelated-link"),
        ),
      );
      successful(yield* f.run("apply", "--target", "agents"));
      assert.strictEqual(
        yield* io(() =>
          fs.readFile(
            join(f.home, ".agents/skills/unrelated/SKILL.md"),
            "utf8",
          ),
        ),
        md("app"),
      );
      assert.strictEqual(
        yield* io(() =>
          fs.readlink(join(f.home, ".agents/skills/unrelated-link")),
        ),
        "/nonexistent/lab-skills-test",
      );
    }));
  for (const change of [
    "file",
    "directory",
    "mode",
    "permissions",
    "directory-mode",
    "missing",
  ] as const)
    test(`${change} changes in an owned skill block apply`, () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        successful(yield* f.run("apply", "--target", "agents"));
        if (change === "file")
          yield* write(join(dirname(f.appFile), "extra.md"), "mine");
        if (change === "directory")
          yield* io(() => fs.mkdir(join(dirname(f.appFile), "empty")));
        if (change === "mode") yield* io(() => fs.chmod(f.appFile, 0o755));
        if (change === "permissions")
          yield* io(() => fs.chmod(f.appFile, 0o600));
        if (change === "directory-mode")
          yield* io(() => fs.chmod(dirname(f.appFile), 0o700));
        if (change === "missing") yield* io(() => fs.unlink(f.appFile));
        const before = yield* snapshot(f.home);
        code(yield* f.run("apply", "--target", "agents"), "LOCAL_EDIT", 3);
        assert.strictEqual(yield* snapshot(f.home), before);
      }));
  test("missing owned directory conflicts; omitted skills stay installed as unselected", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      successful(yield* f.run("apply", "--target", "agents"));
      const result = yield* f.run(
        "apply",
        "--target",
        "agents",
        "--profile",
        "base",
      );
      successful(result);
      assert.strictEqual(
        result.entries.find((e) => e.id === "agents/app")?.status,
        "unselected",
      );
      yield* io(() => fs.rm(dirname(f.appFile), { recursive: true }));
      code(yield* f.run("plan"), "MANAGED_MISSING", 3);
    }));
  test("parent and selected symlinks are refused without touching their targets", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const outside = join(f.base, "outside");
      yield* io(() => fs.mkdir(outside));
      yield* io(() => fs.mkdir(f.home));
      yield* io(() => fs.symlink(outside, join(f.home, ".agents")));
      code(yield* f.run("apply", "--target", "agents"), "PATH_UNSAFE", 3);
      assert.deepStrictEqual(yield* io(() => fs.readdir(outside)), []);
    }));
  test("source symlinks, unsafe paths, mutable pins, cycles and case collisions fail validation", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const app = f.manifest.skills.app;
      if (!app) throw new Error("Fixture missing");
      f.manifest.skills.app = { ...app, source: { local: "../escape" } };
      yield* f.save();
      code(yield* f.run("validate"), "PATH_UNSAFE", 2);
      f.manifest.skills.app = { ...app, dependencies: ["app"] };
      yield* f.save();
      code(yield* f.run("validate"), "MANIFEST_INVALID", 2);
      f.manifest.skills.app = app;
      yield* remote(f);
      const locked = f.lock.sources.variant;
      if (!locked) throw new Error("Fixture lock missing");
      f.lock.sources.variant = { ...locked, commit: "main" };
      yield* f.save();
      code(yield* f.run("validate"), "MANIFEST_INVALID", 2);
      f.lock.sources.variant = locked;
      f.manifest.skills.APP = app;
      yield* f.save();
      code(yield* f.run("validate"), "MANIFEST_INVALID", 2);
      delete f.manifest.skills.APP;
      yield* f.save();
      yield* io(() =>
        fs.symlink("/nonexistent", join(f.root, "skills/app/link")),
      );
      code(yield* f.run("validate"), "SOURCE_INVALID", 2);
    }));
  test("case-colliding local files are rejected before home or ownership state is created", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const disk = yield* Disk;
      const source = join(f.root, "skills/app");
      const original = join(source, "SKILL.md");
      const collision = join(source, "skill.md");
      // Model a case-sensitive source even when the host filesystem folds case.
      const collidingDisk = {
        ...disk,
        list: (path: string) =>
          disk
            .list(path)
            .pipe(
              Effect.map((names) =>
                path === source ? [...names, "skill.md"] : names,
              ),
            ),
        info: (path: string) => disk.info(path === collision ? original : path),
        read: (path: string) => disk.read(path === collision ? original : path),
      };
      for (const command of ["validate", "apply"]) {
        const result = yield* f
          .run(command, "--target", "agents")
          .pipe(Effect.provideService(Disk, collidingDisk));
        code(result, "SOURCE_INVALID", 2);
        assert.isTrue(
          result.diagnostics.some((d) => d.message.includes("Case-colliding")),
        );
        assert.isUndefined(yield* disk.info(f.home));
      }
      successful(yield* f.run("apply", "--target", "agents"));
      successful(yield* f.run("status", "--target", "agents"));
    }));
  test("owner-confirmed workflow names can be managed after leaving candidates", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const app = f.manifest.skills.app;
      if (!app) throw new Error("fixture");
      Reflect.deleteProperty(f.manifest.candidates, "make-pr");
      for (const name of ["make-pr", "mutation-test-loop"])
        f.manifest.skills[name] = { ...app, dependencies: ["app"] };
      yield* f.save();
      successful(yield* f.run("validate"));
      successful(
        yield* f.run(
          "apply",
          "--target",
          "agents",
          "--skill",
          "make-pr",
          "--skill",
          "mutation-test-loop",
        ),
      );
      for (const name of ["app", "make-pr", "mutation-test-loop"])
        assert.equal(
          yield* io(() =>
            fs.readFile(
              join(f.home, ".agents/skills", name, "SKILL.md"),
              "utf8",
            ),
          ),
          md("app"),
        );
    }));
  test("candidates, external entries and blocked skills cannot be selected", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      for (const name of ["make-pr", "but"])
        code(yield* f.run("plan", "--skill", name), "MANIFEST_INVALID", 2);
      const app = f.manifest.skills.app;
      if (!app) throw new Error("fixture");
      f.manifest.skills.app = {
        ...app,
        blocked_reason: "tracker prerequisite",
      };
      yield* f.save();
      successful(yield* f.run("validate"));
      code(yield* f.run("apply", "--target", "agents"), "BLOCKED_SKILL", 2);
    }));
  test("pinned variants and license hashes are checked before home creation", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const archive = yield* remote(f);
      let calls = 0;
      const http = {
        get: () =>
          Effect.sync(() => {
            calls++;
            return archive;
          }),
      };
      successful(
        yield* f
          .run("plan", "--target", "claude")
          .pipe(Effect.provideService(HttpBytes, http)),
      );
      assert.strictEqual(calls, 0);
      successful(
        yield* f
          .run("apply", "--target", "claude")
          .pipe(Effect.provideService(HttpBytes, http)),
      );
      assert.strictEqual(calls, 1);
      assert.strictEqual(
        yield* io(() =>
          fs.readFile(join(f.home, ".claude/skills/app/SKILL.md"), "utf8"),
        ),
        md("claude-app"),
      );
      assert.strictEqual(
        yield* io(() =>
          fs.readFile(
            join(f.home, ".claude/skills/app/UPSTREAM-LICENSE"),
            "utf8",
          ),
        ),
        "fixture license",
      );
    }));
  test("hash mismatch and download failure produce exit 1 without creating target home", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const archive = yield* remote(f),
        locked = f.lock.sources.variant;
      if (!locked) throw new Error("fixture");
      f.lock.sources.variant = {
        ...locked,
        files: {
          ...locked.files,
          "SKILL.md": { sha256: "0".repeat(64), executable: false },
        },
      };
      yield* f.save();
      code(
        yield* f.run("apply", "--target", "claude").pipe(
          Effect.provideService(HttpBytes, {
            get: () => Effect.succeed(archive),
          }),
        ),
        "HASH_MISMATCH",
        1,
      );
      assert.isUndefined(yield* (yield* Disk).info(f.home));
      code(
        yield* f.run("apply", "--target", "claude").pipe(
          Effect.provideService(HttpBytes, {
            get: () =>
              Effect.fail(problem("DOWNLOAD_FAILED", "fixture offline", 1)),
          }),
        ),
        "DOWNLOAD_FAILED",
        1,
      );
    }));
  test("configuration precedence, explicit mutation targets and unknown fields", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      code(yield* f.run("apply"), "CONFIG_INVALID", 2);
      const config: MachineConfig = {
        schema: 1,
        home: join(f.base, "configured-home"),
        profiles: ["base"],
        targets: ["pi"],
      };
      yield* write(f.config, bytes(config));
      const result = yield* f.run(
        "plan",
        "--profile",
        "default",
        "--target",
        "claude",
      );
      successful(result);
      assert.strictEqual(result.home, f.home);
      assert.deepStrictEqual(result.selection.profiles, ["default"]);
      assert.deepStrictEqual(result.selection.targets, ["claude"]);
      const configured = yield* program(
        f.root,
        ["apply", "--config", f.config],
        {
          home: join(f.base, "actor"),
        },
      );
      successful(configured);
      assert.strictEqual(configured.home, config.home);
      yield* write(f.config, bytes({ ...config, typo: true }));
      code(yield* f.run("plan"), "CONFIG_INVALID", 2);
    }));
  test("Python state is diagnosed and cannot be silently adopted", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* write(
        paths(f.home).legacy,
        bytes({
          schema: 1,
          owner: "lloydrichards/shared-skills",
          installations: {},
        }),
      );
      const before = yield* snapshot(f.home);
      code(yield* f.run("apply", "--target", "agents"), "LEGACY_STATE", 3);
      assert.strictEqual(yield* snapshot(f.home), before);
    }));
  test("ordinary state-write failure rolls back updated directories and keeps old state", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      successful(yield* f.run("apply", "--target", "agents"));
      const old = yield* (yield* OwnershipState).read(paths(f.home).state);
      yield* write(join(f.root, "skills/app/SKILL.md"), "updated");
      const state = yield* OwnershipState;
      code(
        yield* f.run("apply", "--target", "agents").pipe(
          Effect.provideService(OwnershipState, {
            read: state.read,
            write: () =>
              Effect.fail(problem("IO_FAILED", "injected state failure", 1)),
          }),
        ),
        "IO_FAILED",
        1,
      );
      assert.strictEqual(
        yield* io(() => fs.readFile(f.appFile, "utf8")),
        md("app"),
      );
      assert.deepStrictEqual(yield* state.read(paths(f.home).state), old);
      assert.isUndefined(yield* (yield* Disk).info(paths(f.home).lock));
      assert.isUndefined(yield* (yield* Disk).info(paths(f.home).journal));
    }));
  test("intervening source changes and concurrent installer lock are refused", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const archive = yield* remote(f);
      code(
        yield* f.run("apply", "--target", "claude").pipe(
          Effect.provideService(HttpBytes, {
            get: () =>
              write(
                join(f.root, "skills/base/SKILL.md"),
                "changed during download",
              ).pipe(
                Effect.as(archive),
                Effect.mapError(() =>
                  problem("IO_FAILED", "fixture write failed", 1),
                ),
              ),
          }),
        ),
        "SOURCE_CHANGED",
        3,
      );
      assert.isUndefined(
        yield* (yield* Disk).info(join(f.home, ".claude/skills")),
      );
      yield* write(paths(f.home).lock, "another process");
      const before = yield* snapshot(f.home);
      code(
        yield* f.run("apply", "--target", "agents"),
        "INTERRUPTED_OPERATION",
        3,
      );
      assert.strictEqual(yield* snapshot(f.home), before);
    }));
  test("source changes during staging are detected before any destination rename", () =>
    Effect.gen(function* () {
      const f = yield* fixture,
        disk = yield* Disk;
      const wrapped = {
        ...disk,
        write: (
          file: string,
          data: Uint8Array,
          executable: boolean,
          exclusive?: boolean,
        ) =>
          disk
            .write(file, data, executable, exclusive)
            .pipe(
              Effect.tap(() =>
                file.includes(".lab-skills-stage-") && file.endsWith("SKILL.md")
                  ? disk.write(
                      join(f.root, "skills/app/SKILL.md"),
                      new TextEncoder().encode("changed during staging"),
                      false,
                    )
                  : Effect.void,
              ),
            ),
      };
      code(
        yield* f
          .run("apply", "--target", "agents")
          .pipe(Effect.provideService(Disk, wrapped)),
        "SOURCE_CHANGED",
        3,
      );
      assert.isUndefined(yield* disk.info(f.appFile));
      assert.isUndefined(yield* disk.info(f.baseFile));
      assert.isUndefined(yield* disk.info(paths(f.home).lock));
    }));
  test("doctor ignores ordinary files and links to files in discovery roots without writes", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      for (const root of [
        ".agents/skills",
        ".codex/skills",
        ".codex/skills/.system",
        ".claude/skills",
        ".config/opencode/skills",
        ".pi/agent/skills",
      ]) {
        const file = join(f.home, root, ".DS_Store");
        yield* write(file, "ordinary discovery-root file");
        yield* io(() => fs.symlink(file, join(f.home, root, "file-link")));
      }
      const before = yield* snapshot(f.home);
      successful(yield* f.run("doctor"));
      assert.strictEqual(yield* snapshot(f.home), before);
    }));
  test("doctor reports duplicates, broken links, stage evidence and missing prerequisites without writes", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* write(f.appFile, md("duplicate"));
      yield* write(
        join(f.home, ".claude/skills/other/SKILL.md"),
        md("duplicate"),
      );
      yield* write(
        join(f.home, ".codex/skills/.system/system-skill/SKILL.md"),
        md("duplicate"),
      );
      yield* io(() =>
        fs.symlink(
          "/nonexistent/doctor-link",
          join(f.home, ".agents/skills/broken"),
        ),
      );
      yield* io(() =>
        fs.mkdir(join(f.home, ".agents/skills/.lab-skills-stage-orphan")),
      );
      const before = yield* snapshot(f.home),
        result = yield* f.run("doctor");
      code(result, "INTERRUPTED_OPERATION", 3);
      assert.isTrue(result.diagnostics.some((d) => d.code === "BROKEN_LINK"));
      assert.isTrue(
        result.diagnostics.some(
          (d) =>
            d.code === "DUPLICATE_NAME" &&
            d.message.includes(".system/system-skill"),
        ),
      );
      assert.strictEqual(yield* snapshot(f.home), before);
    }));
  test("forced termination leaves diagnosable journal and installed files without claiming crash atomicity", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const checkout = resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../..",
      );
      const url = (file: string) =>
        JSON.stringify(pathToFileURL(join(checkout, file)).href);
      const script = join(f.base, "interrupted.mjs");
      yield* write(
        script,
        `
import {Effect} from ${JSON.stringify(import.meta.resolve("effect"))};
import {runtimeLayer} from ${url("apps/lab-skills/dist/runtime.js")};
import {program} from ${url("apps/lab-skills/dist/program.js")};
import {Disk} from ${url("apps/lab-skills/dist/services.js")};
const layer=runtimeLayer(process.env.PATH??'');
await Effect.runPromise(Effect.gen(function*(){
 const disk=yield*Disk;
 return yield*program(${JSON.stringify(f.root)},['apply','--config',${JSON.stringify(f.config)},'--home',${JSON.stringify(f.home)},'--target','agents'],{home:${JSON.stringify(join(f.base, "actor"))}}).pipe(Effect.provideService(Disk,{...disk,
 rename:(from,to)=>disk.rename(from,to).pipe(Effect.tap(()=>to===${JSON.stringify(dirname(f.appFile))}&&from.includes('.lab-skills-stage-')?Effect.sync(()=>{process.stdin.resume();process.stdout.write('READY\\n')}).pipe(Effect.andThen(Effect.never)):Effect.void))
 }));
}).pipe(Effect.provide(layer)));
`,
      );
      yield* io(
        () =>
          new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, [script], {
              env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
              stdio: ["pipe", "pipe", "pipe"],
            });
            let output = "",
              errors = "",
              killed = false;
            child.stdout.on("data", (data) => {
              output += data;
              if (output.includes("READY") && !killed) {
                killed = true;
                child.kill("SIGKILL");
              }
            });
            child.stderr.on("data", (data) => (errors += data));
            child.on("error", reject);
            child.on("close", (_exit, signal) =>
              killed && signal === "SIGKILL"
                ? resolve()
                : reject(
                    new Error(
                      "Child did not reach the SIGKILL interruption barrier: " +
                        errors +
                        output,
                    ),
                  ),
            );
          }),
      );
      assert.isDefined(yield* (yield* Disk).info(paths(f.home).lock));
      assert.isDefined(yield* (yield* Disk).info(paths(f.home).journal));
      const before = yield* snapshot(f.home),
        result = yield* f.run("doctor");
      code(result, "INTERRUPTED_OPERATION", 3);
      assert.isTrue(
        result.diagnostics.some((d) =>
          d.message.includes("new-content-match=true"),
        ),
      );
      assert.strictEqual(yield* snapshot(f.home), before);
    }));
  test("failed rollback preserves lock, journal and backups for doctor", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      successful(yield* f.run("apply", "--target", "agents"));
      yield* write(join(f.root, "skills/app/SKILL.md"), "update");
      const disk = yield* Disk,
        state = yield* OwnershipState;
      const result = yield* f.run("apply", "--target", "agents").pipe(
        Effect.provideService(OwnershipState, {
          read: state.read,
          write: () => Effect.fail(problem("IO_FAILED", "state failure", 1)),
        }),
        Effect.provideService(Disk, {
          ...disk,
          remove: (path, recursive) =>
            path === dirname(f.appFile)
              ? Effect.fail(problem("IO_FAILED", "rollback failure", 1))
              : disk.remove(path, recursive),
        }),
      );
      code(result, "ROLLBACK_FAILED", 3);
      assert.isDefined(yield* disk.info(paths(f.home).lock));
      assert.isDefined(yield* disk.info(paths(f.home).journal));
      const before = yield* snapshot(f.home);
      code(yield* f.run("doctor"), "INTERRUPTED_OPERATION", 3);
      assert.strictEqual(yield* snapshot(f.home), before);
    }));
  test("journal diagnosis identifies destinations, backups and matching old/new content", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      successful(yield* f.run("apply", "--target", "agents"));
      const state = yield* (yield* OwnershipState).read(paths(f.home).state),
        owned = state.installations["agents/app"];
      if (!owned) throw new Error("fixture");
      const parent = dirname(dirname(f.appFile)),
        stage = join(parent, ".lab-skills-stage-fixture"),
        backup = join(parent, ".lab-skills-backup-fixture");
      const journal: Journal = {
        schema: 1,
        phase: "prepared",
        previousState: state,
        nextState: state,
        items: [
          {
            id: "agents/app",
            destination: dirname(f.appFile),
            stage,
            backup,
            old: owned,
            next: owned,
          },
        ],
      };
      yield* write(paths(f.home).journal, bytes(journal));
      const before = yield* snapshot(f.home),
        result = yield* f.run("doctor");
      code(result, "INTERRUPTED_OPERATION", 3);
      assert.isTrue(
        result.diagnostics.some((d) =>
          d.message.includes("old-content-match=true"),
        ),
      );
      assert.strictEqual(yield* snapshot(f.home), before);
    }));
});

describe("adversarial safety regressions", () => {
  test("reserved and inherited profile names return input errors rather than defects", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      for (const name of ["constructor", "__proto__", "toString", "missing"]) {
        code(yield* f.run("plan", "--profile", name), "MANIFEST_INVALID", 2);
      }
    }));

  test("physical source aliases cannot receive installations, including missing descendants", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const aliases = [f.root];
      const caseAlias = join(f.base, "SOURCE");
      const existing = yield* (yield* Disk).info(caseAlias);
      // The extra cases exercise real case aliases on macOS; Linux still checks
      // direct overlap. No case-insensitivity is assumed from the OS name.
      if (existing) aliases.push(caseAlias, join(caseAlias, "future-home"));
      const before = yield* snapshot(f.base);
      for (const home of aliases) {
        const result = yield* program(
          f.root,
          ["apply", "--config", f.config, "--home", home, "--target", "agents"],
          { home: join(f.base, "actor") },
        );
        code(result, "PATH_UNSAFE", 3);
      }
      assert.strictEqual(yield* snapshot(f.base), before);
    }));

  for (const magic of ["cafebabf", "bfbafeca"]) {
    test(`FAT64 native payload ${magic} is rejected before installation`, () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        yield* write(
          join(f.root, "skills/app/engine"),
          Buffer.from(magic + "00000000", "hex"),
        );
        code(yield* f.run("validate"), "SOURCE_INVALID", 2);
        assert.isUndefined(yield* (yield* Disk).info(f.home));
      }));
  }

  test("one in-subtree license can populate its original and multiple explicit destinations", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* remote(f);
      const original = f.lock.sources.variant;
      if (!original) throw new Error("Fixture source missing");
      const license = "fixture nested license";
      const record = {
        sha256: createHash("sha256").update(license).digest("hex"),
        executable: false,
      };
      f.lock.sources.variant = {
        ...original,
        files: {
          ...original.files,
          LICENSE: record,
          "UPSTREAM-LICENSE": record,
          "COPY-LICENSE": record,
        },
        license_files: {
          "UPSTREAM-LICENSE": "skills/app/LICENSE",
          "COPY-LICENSE": "skills/app/LICENSE",
        },
      };
      yield* f.save();
      const archive = yield* io(async () => {
        const tar = pack();
        tar.entry({ name: "repo-a/skills/app/SKILL.md" }, md("claude-app"));
        tar.entry({ name: "repo-a/skills/app/LICENSE" }, license);
        tar.finalize();
        const chunks: Buffer[] = [];
        for await (const chunk of tar) chunks.push(Buffer.from(chunk));
        return gzipSync(Buffer.concat(chunks));
      });
      successful(
        yield* f.run("apply", "--target", "claude").pipe(
          Effect.provideService(HttpBytes, {
            get: () => Effect.succeed(archive),
          }),
        ),
      );
      for (const name of ["LICENSE", "UPSTREAM-LICENSE", "COPY-LICENSE"]) {
        assert.strictEqual(
          yield* io(() =>
            fs.readFile(join(f.home, ".claude/skills/app", name), "utf8"),
          ),
          license,
        );
      }
    }));

  test("a reported state-write failure after persistence never rolls back committed payloads", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      successful(yield* f.run("apply", "--target", "agents"));
      yield* write(
        join(f.root, "skills/app/SKILL.md"),
        "new committed payload",
      );
      const store = yield* OwnershipState;
      code(
        yield* f.run("apply", "--target", "agents").pipe(
          Effect.provideService(OwnershipState, {
            read: store.read,
            write: (file, value) =>
              store
                .write(file, value)
                .pipe(
                  Effect.andThen(
                    Effect.fail(
                      problem(
                        "IO_FAILED",
                        "post-commit acknowledgement failure",
                        1,
                      ),
                    ),
                  ),
                ),
          }),
        ),
        "INTERRUPTED_OPERATION",
        3,
      );
      assert.strictEqual(
        yield* io(() => fs.readFile(f.appFile, "utf8")),
        "new committed payload",
      );
      const state = yield* store.read(paths(f.home).state);
      assert.strictEqual(
        state.installations["agents/app"]?.tree.files["SKILL.md"]?.sha256,
        createHash("sha256").update("new committed payload").digest("hex"),
      );
      assert.isDefined(yield* (yield* Disk).info(paths(f.home).lock));
      assert.isDefined(yield* (yield* Disk).info(paths(f.home).journal));
      const diagnosis = yield* f.run("doctor");
      code(diagnosis, "INTERRUPTED_OPERATION", 3);
      assert.isTrue(
        diagnosis.diagnostics.some((d) =>
          d.message.includes("next-match=true"),
        ),
      );
    }));

  test("an unreadable state-write outcome preserves destinations and recovery evidence", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      successful(yield* f.run("apply", "--target", "agents"));
      yield* write(
        join(f.root, "skills/app/SKILL.md"),
        "uncertain new payload",
      );
      const store = yield* OwnershipState;
      let attempted = false;
      code(
        yield* f.run("apply", "--target", "agents").pipe(
          Effect.provideService(OwnershipState, {
            read: (file) =>
              attempted
                ? Effect.fail(problem("IO_FAILED", "unreadable state", 1))
                : store.read(file),
            write: () =>
              Effect.sync(() => {
                attempted = true;
              }).pipe(
                Effect.andThen(
                  Effect.fail(problem("IO_FAILED", "uncertain write", 1)),
                ),
              ),
          }),
        ),
        "INTERRUPTED_OPERATION",
        3,
      );
      assert.strictEqual(
        yield* io(() => fs.readFile(f.appFile, "utf8")),
        "uncertain new payload",
      );
      assert.isDefined(yield* (yield* Disk).info(paths(f.home).journal));
      assert.isDefined(yield* (yield* Disk).info(paths(f.home).lock));
      code(yield* f.run("doctor"), "INTERRUPTED_OPERATION", 3);
    }));

  test("failed cleanup of an exclusively reserved new destination retains its journal", () =>
    Effect.gen(function* () {
      const f = yield* fixture,
        disk = yield* Disk;
      const destination = dirname(f.appFile);
      code(
        yield* f.run("apply", "--target", "agents").pipe(
          Effect.provideService(Disk, {
            ...disk,
            rename: (from, to) =>
              to === destination && from.includes(".lab-skills-stage-")
                ? Effect.fail(problem("IO_FAILED", "rename denied", 1))
                : disk.rename(from, to),
            remove: (file, recursive) =>
              file === destination
                ? Effect.fail(
                    problem("IO_FAILED", "reservation cleanup denied", 1),
                  )
                : disk.remove(file, recursive),
          }),
        ),
        "ROLLBACK_FAILED",
        3,
      );
      assert.isDefined(yield* disk.info(paths(f.home).journal));
      assert.isDefined(yield* disk.info(paths(f.home).lock));
      assert.isDefined(yield* disk.info(destination));
      code(yield* f.run("doctor"), "INTERRUPTED_OPERATION", 3);
    }));

  test("committed backup edits survive cleanup instead of being deleted", () =>
    Effect.gen(function* () {
      const f = yield* fixture,
        disk = yield* Disk,
        store = yield* OwnershipState;
      successful(yield* f.run("apply", "--target", "agents"));
      yield* write(join(f.root, "skills/app/SKILL.md"), "new payload");
      let backup: string | undefined;
      code(
        yield* f.run("apply", "--target", "agents").pipe(
          Effect.provideService(OwnershipState, {
            read: store.read,
            write: (file, value) =>
              store.write(file, value).pipe(
                Effect.andThen(
                  Effect.gen(function* () {
                    const parent = dirname(dirname(f.appFile));
                    const name = (yield* disk.list(parent)).find(
                      (n) =>
                        n.startsWith(".lab-skills-backup-") &&
                        n.endsWith("-app"),
                    );
                    if (!name)
                      return yield* problem(
                        "IO_FAILED",
                        "fixture backup absent",
                        1,
                      );
                    backup = join(parent, name, "SKILL.md");
                    yield* disk.write(
                      backup,
                      new TextEncoder().encode("backup edit"),
                      false,
                    );
                  }),
                ),
              ),
          }),
        ),
        "INTERRUPTED_OPERATION",
        3,
      );
      if (!backup) throw new Error("Fixture backup missing");
      const backupFile = backup;
      assert.strictEqual(
        yield* io(() => fs.readFile(backupFile, "utf8")),
        "backup edit",
      );
      assert.strictEqual(
        yield* io(() => fs.readFile(f.appFile, "utf8")),
        "new payload",
      );
      assert.isDefined(yield* disk.info(paths(f.home).journal));
    }));
});

describe("collection notice packaging", () => {
  test("plan hashes root notices read-only and apply bundles them without source duplicates", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* write(join(f.root, "LICENSE"), "collection license");
      yield* write(join(f.root, "NOTICE.md"), "upstream attribution");
      yield* write(
        join(f.root, "skills/app/toString"),
        "ordinary authored file",
      );
      const before = yield* snapshot(f.base);
      successful(yield* f.run("plan"));
      assert.strictEqual(yield* snapshot(f.base), before);
      successful(yield* f.run("apply", "--target", "agents"));
      assert.strictEqual(
        yield* io(() =>
          fs.readFile(
            join(dirname(f.appFile), "COLLECTION-LICENSE.txt"),
            "utf8",
          ),
        ),
        "collection license",
      );
      assert.strictEqual(
        yield* io(() =>
          fs.readFile(join(dirname(f.appFile), "COLLECTION-NOTICE.md"), "utf8"),
        ),
        "upstream attribution",
      );
      assert.isUndefined(
        yield* (yield* Disk).info(
          join(f.root, "skills/app/COLLECTION-LICENSE.txt"),
        ),
      );
      assert.strictEqual(
        yield* io(() =>
          fs.readFile(join(dirname(f.appFile), "toString"), "utf8"),
        ),
        "ordinary authored file",
      );
      yield* write(join(f.root, "NOTICE.md"), "updated attribution");
      const planned = yield* f.run("plan");
      successful(planned);
      assert.isTrue(
        planned.entries.every((entry) => entry.status === "update"),
      );
      successful(yield* f.run("apply", "--target", "agents"));
      assert.strictEqual(
        yield* io(() =>
          fs.readFile(join(dirname(f.appFile), "COLLECTION-NOTICE.md"), "utf8"),
        ),
        "updated attribution",
      );
    }));
  test("authored notice collisions are rejected without overwriting either file", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* write(join(f.root, "LICENSE"), "root license");
      yield* write(
        join(f.root, "skills/app/COLLECTION-LICENSE.txt"),
        "authored file",
      );
      const before = yield* snapshot(f.base);
      code(yield* f.run("apply", "--target", "agents"), "SOURCE_INVALID", 2);
      assert.strictEqual(yield* snapshot(f.base), before);
    }));
});
