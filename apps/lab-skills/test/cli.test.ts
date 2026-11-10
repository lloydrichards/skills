import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const launcher = join(checkout, "apps/lab-skills/bin/lab-skills.mjs");
const io = <A>(f: () => Promise<A>) => Effect.tryPromise(f);
const fixture = Effect.acquireRelease(
  io(() => fs.mkdtemp(join(realpathSync(tmpdir()), "lab-skills-cli-"))),
  (p) =>
    io(() => fs.rm(p, { recursive: true, force: true })).pipe(Effect.orDie),
);
const child = (
  command: string,
  args: string[],
  cwd: string,
  home: string,
  path = process.env.PATH ?? "",
) =>
  io(
    () =>
      new Promise<{ code: number | null; stdout: string; stderr: string }>(
        (resolve, reject) => {
          const run = spawn(command, args, {
            cwd,
            env: {
              ...process.env,
              HOME: home,
              PATH: path,
              LAB_SKILLS_CONFIG: "",
              XDG_CONFIG_HOME: join(home, ".config"),
            },
            stdio: ["ignore", "pipe", "pipe"],
          });
          let stdout = "",
            stderr = "";
          run.stdout.on("data", (data) => (stdout += data));
          run.stderr.on("data", (data) => (stderr += data));
          run.on("error", reject);
          run.on("close", (code) => resolve({ code, stdout, stderr }));
        },
      ),
  );
describe("built executable public boundary", () => {
  for (const [name, path] of [
    ["the current launcher", launcher],
    [
      "the legacy launcher",
      join(checkout, "packages/lab-skills/bin/lab-skills.mjs"),
    ],
  ] as const) {
    it.live(
      `resolves the owning checkout from another cwd through a symlink to ${name}`,
      () =>
        Effect.gen(function* () {
          const base = yield* fixture,
            home = join(base, "home"),
            bin = join(base, "bin");
          yield* io(() => fs.mkdir(bin));
          const link = join(bin, "lab-skills");
          yield* io(() => fs.symlink(path, link));
          const output = yield* child(
            process.execPath,
            [link, "plan", "--home", home, "--json"],
            base,
            join(base, "actor"),
          );
          assert.strictEqual(output.code, 0, output.stderr + output.stdout);
          assert.strictEqual(output.stderr, "");
          const result = JSON.parse(output.stdout);
          assert.strictEqual(result.checkout, checkout);
          assert.strictEqual(result.home, home);
          assert.strictEqual(result.entries.length, 7);
          assert.deepStrictEqual(yield* io(() => fs.readdir(base)), ["bin"]);
        }),
    );
  }
  it.live("runs the PATH executable with Node and no Bun on PATH", () =>
    Effect.gen(function* () {
      const base = yield* fixture,
        home = join(base, "home"),
        bin = join(base, "bin");
      yield* io(() => fs.mkdir(bin));
      yield* io(() => fs.symlink(launcher, join(bin, "lab-skills")));
      // Put a known Node executable on this test PATH; no Bun is needed by the shebang.
      const node = yield* io(
        () =>
          new Promise<string>((resolve, reject) => {
            const p = spawn("node", ["-p", "process.execPath"]);
            let s = "";
            p.stdout.on("data", (d) => (s += d));
            p.on("error", reject);
            p.on("close", () => resolve(s.trim()));
          }),
      );
      yield* io(() => fs.symlink(node, join(bin, "node")));
      const output = yield* child(
        "lab-skills",
        ["validate", "--json"],
        base,
        home,
        bin + ":/usr/bin:/bin",
      );
      assert.strictEqual(output.code, 0, output.stderr + output.stdout);
      assert.strictEqual(JSON.parse(output.stdout).checkout, checkout);
    }),
  );
  it.live(
    "refuses a copied npm installation instead of treating it as another skill source",
    () =>
      Effect.gen(function* () {
        const base = yield* fixture,
          copy = join(
            base,
            "node_modules/copied-skills/apps/lab-skills/bin/lab-skills.mjs",
          );
        yield* io(() => fs.mkdir(dirname(copy), { recursive: true }));
        yield* io(() => fs.copyFile(launcher, copy));
        const output = yield* child(
          process.execPath,
          [copy, "validate", "--json"],
          base,
          join(base, "actor"),
        );
        assert.strictEqual(output.code, 2);
        assert.strictEqual(
          JSON.parse(output.stdout).diagnostics[0].code,
          "SOURCE_INVALID",
        );
      }),
  );
  it.live(
    "emits one schema-versioned JSON error and exit 2, with human errors on stderr",
    () =>
      Effect.gen(function* () {
        const base = yield* fixture,
          home = join(base, "home");
        const json = yield* child(
          process.execPath,
          [launcher, "plan", "--typo", "--json"],
          base,
          home,
        );
        assert.strictEqual(json.code, 2);
        assert.strictEqual(json.stderr, "");
        assert.strictEqual(
          JSON.parse(json.stdout).diagnostics[0].code,
          "ARGUMENT_INVALID",
        );
        const human = yield* child(
          process.execPath,
          [launcher, "plan", "--typo"],
          base,
          home,
        );
        assert.strictEqual(human.code, 2);
        assert.include(human.stderr, "ARGUMENT_INVALID");
        assert.notInclude(human.stdout, "ARGUMENT_INVALID");
      }),
  );
  it.live("accepts repeated --json flags and prints exactly one result", () =>
    Effect.gen(function* () {
      const base = yield* fixture;
      const output = yield* child(
        process.execPath,
        [launcher, "validate", "--json", "--json"],
        base,
        join(base, "actor"),
      );
      assert.strictEqual(output.code, 0, output.stderr + output.stdout);
      assert.strictEqual(output.stderr, "");
      const result = JSON.parse(output.stdout);
      assert.strictEqual(result.schemaVersion, 1);
      assert.strictEqual(result.command, "validate");
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.checkout, checkout);
      assert.deepStrictEqual(yield* io(() => fs.readdir(base)), []);
    }),
  );
  it.live("drains a large JSON argument error before exiting", () =>
    Effect.gen(function* () {
      const base = yield* fixture;
      const output = yield* child(
        process.execPath,
        [launcher, "validate", "--" + "x".repeat(120_000), "--json"],
        base,
        base,
      );
      assert.strictEqual(output.code, 2);
      assert.strictEqual(output.stderr, "");
      const result = JSON.parse(output.stdout);
      assert.strictEqual(result.exitCode, 2);
      assert.strictEqual(result.diagnostics[0].code, "ARGUMENT_INVALID");
    }),
  );

  it.live(
    "preserves operational exit 1 and conflict exit 3 at the process boundary",
    () =>
      Effect.gen(function* () {
        const base = yield* fixture;
        const failed = yield* child(
          process.execPath,
          [launcher, "validate", "--config", base, "--json"],
          base,
          base,
        );
        assert.strictEqual(failed.code, 1, failed.stderr + failed.stdout);
        assert.strictEqual(failed.stderr, "");
        assert.strictEqual(JSON.parse(failed.stdout).exitCode, 1);
        const home = join(base, "home");
        const state = join(home, ".local/state/lab-skills");
        yield* io(() => fs.mkdir(state, { recursive: true }));
        yield* io(() => fs.writeFile(join(state, "apply.lock"), "held"));
        const conflict = yield* child(
          process.execPath,
          [launcher, "doctor", "--home", home, "--json"],
          base,
          home,
        );
        assert.strictEqual(conflict.code, 3, conflict.stderr + conflict.stdout);
        assert.strictEqual(conflict.stderr, "");
        const result = JSON.parse(conflict.stdout);
        assert.strictEqual(result.exitCode, 3);
        assert.isTrue(
          result.diagnostics.some(
            (d: { code: string }) => d.code === "INTERRUPTED_OPERATION",
          ),
        );
        assert.strictEqual(
          yield* io(() => fs.readFile(join(state, "apply.lock"), "utf8")),
          "held",
        );
      }),
  );

  it.live(
    "interrupts a pending configuration read without reporting an internal error",
    () =>
      Effect.gen(function* () {
        const base = yield* fixture;
        const config = join(base, "config.fifo");
        const created = yield* child("mkfifo", [config], base, base);
        assert.strictEqual(created.code, 0, created.stderr);
        const driver = join(base, "signal-driver.mjs");
        yield* io(() =>
          fs.writeFile(
            driver,
            `process.on("SIGTERM", () => process.stdout.write("signal-received\\n"));
await import(${JSON.stringify(pathToFileURL(launcher).href)});
`,
          ),
        );
        const proc = yield* Effect.acquireRelease(
          Effect.sync(() =>
            spawn(
              process.execPath,
              [driver, "validate", "--config", config, "--json"],
              {
                cwd: base,
                env: {
                  ...process.env,
                  HOME: base,
                  BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
                },
                stdio: ["ignore", "pipe", "pipe"],
              },
            ),
          ),
          (proc) =>
            Effect.sync(() => {
              if (proc.exitCode === null) proc.kill("SIGKILL");
            }),
        );
        let stdout = "",
          stderr = "";
        const signaled = new Promise<void>((resolve) => {
          proc.stdout.on("data", (chunk) => {
            stdout += chunk;
            if (stdout.includes("signal-received\n")) resolve();
          });
        });
        proc.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        const closed = new Promise<number | null>((resolve, reject) => {
          proc.on("error", reject);
          proc.on("close", resolve);
        });
        // The FIFO proves that the CLI reached its read. Release it after the
        // signal acknowledgement because Node waits for native reads at exit.
        const writer = yield* Effect.acquireRelease(
          io(() => fs.open(config, "w")),
          (handle) => io(() => handle.close()).pipe(Effect.orDie),
        );
        proc.kill("SIGTERM");
        yield* io(() => signaled);
        yield* io(() => writer.close());
        assert.strictEqual(yield* io(() => closed), 130);
        assert.strictEqual(stdout, "signal-received\n");
        assert.strictEqual(stderr, "");
      }),
  );

  it.live("prints readable success output when --json is omitted", () =>
    Effect.gen(function* () {
      const base = yield* fixture;
      const output = yield* child(
        process.execPath,
        [launcher, "validate"],
        base,
        join(base, "actor"),
      );
      assert.strictEqual(output.code, 0, output.stderr + output.stdout);
      assert.strictEqual(output.stderr, "");
      assert.strictEqual(output.stdout.trim(), "lab-skills validate: ok");
      assert.deepStrictEqual(yield* io(() => fs.readdir(base)), []);
    }),
  );
  it.live(
    "retains repeated selection flags and mixed target aliases in invocation order",
    () =>
      Effect.gen(function* () {
        const base = yield* fixture;
        const output = yield* child(
          process.execPath,
          [
            launcher,
            "validate",
            "--profile",
            "default",
            "--profile",
            "effect",
            "--skill",
            "unslop",
            "--skill",
            "deslop",
            "--target",
            "agents",
            "--harness",
            "codex",
            "--target",
            "claude",
            "--json",
          ],
          base,
          join(base, "actor"),
        );
        assert.strictEqual(output.code, 0, output.stderr + output.stdout);
        assert.strictEqual(output.stderr, "");
        assert.deepStrictEqual(JSON.parse(output.stdout).selection, {
          profiles: ["default", "effect"],
          skills: ["unslop", "deslop"],
          targets: ["agents", "codex", "claude"],
        });
        assert.deepStrictEqual(yield* io(() => fs.readdir(base)), []);
      }),
  );
  it.live(
    "uses configured selection arrays when omitted and replaces supplied arrays",
    () =>
      Effect.gen(function* () {
        const base = yield* fixture;
        const config = join(base, "machine.json");
        const configuredHome = join(base, "configured-home");
        yield* io(() =>
          fs.writeFile(
            config,
            JSON.stringify({
              schema: 1,
              home: configuredHome,
              profiles: ["effect"],
              skills: ["deslop"],
              targets: ["claude"],
            }),
          ),
        );
        const configured = yield* child(
          process.execPath,
          [launcher, "validate", "--config", config, "--json"],
          base,
          join(base, "actor"),
        );
        assert.strictEqual(
          configured.code,
          0,
          configured.stderr + configured.stdout,
        );
        assert.strictEqual(configured.stderr, "");
        const result = JSON.parse(configured.stdout);
        assert.strictEqual(result.home, configuredHome);
        assert.deepStrictEqual(result.selection, {
          profiles: ["effect"],
          skills: ["deslop"],
          targets: ["claude"],
        });
        const overridden = yield* child(
          process.execPath,
          [
            launcher,
            "validate",
            "--config",
            config,
            "--profile",
            "default",
            "--skill",
            "unslop",
            "--target",
            "codex",
            "--json",
          ],
          base,
          join(base, "actor"),
        );
        assert.strictEqual(
          overridden.code,
          0,
          overridden.stderr + overridden.stdout,
        );
        assert.strictEqual(overridden.stderr, "");
        assert.deepStrictEqual(JSON.parse(overridden.stdout).selection, {
          profiles: ["default"],
          skills: ["unslop"],
          targets: ["codex"],
        });
        assert.deepStrictEqual(yield* io(() => fs.readdir(base)), [
          "machine.json",
        ]);
      }),
  );
  it.live("uses the last repeated home and configuration path", () =>
    Effect.gen(function* () {
      const base = yield* fixture;
      const config = join(base, "machine.json");
      const home = join(base, "last-home");
      yield* io(() =>
        fs.writeFile(
          config,
          JSON.stringify({ schema: 1, profiles: ["effect"] }),
        ),
      );
      const output = yield* child(
        process.execPath,
        [
          launcher,
          "validate",
          "--home",
          join(base, "first-home"),
          "--home",
          home,
          "--config",
          join(base, "missing.json"),
          "--config",
          config,
          "--json",
        ],
        base,
        join(base, "actor"),
      );
      assert.strictEqual(output.code, 0, output.stderr + output.stdout);
      assert.strictEqual(output.stderr, "");
      const result = JSON.parse(output.stdout);
      assert.strictEqual(result.home, home);
      assert.deepStrictEqual(result.selection.profiles, ["effect"]);
      assert.deepStrictEqual(yield* io(() => fs.readdir(base)), [
        "machine.json",
      ]);
    }),
  );
  for (const [name, args] of [
    ["an unknown command", ["unknown"]],
    ["a JSON value", ["validate", "--json", "false"]],
    ["a true JSON value", ["validate", "--json", "true"]],
    ["a JSON assignment", ["validate", "--json=true"]],
    ["a false JSON assignment", ["validate", "--json=false"]],
    ["a missing option value", ["plan", "--home"]],
    ["an invalid destination", ["plan", "--target", "unknown"]],
    ["an unexpected positional argument", ["plan", "extra"]],
    ["an empty home", ["plan", "--home", ""]],
    ["an empty configuration path", ["plan", "--config", ""]],
    ["an empty archive path", ["plan", "--archive-dir", ""]],
    ["an empty profile", ["plan", "--profile", ""]],
    ["an empty skill", ["plan", "--skill", ""]],
    ["an empty destination", ["plan", "--target", ""]],
  ] as const) {
    it.live(`returns one argument error result for ${name}`, () =>
      Effect.gen(function* () {
        const base = yield* fixture;
        const output = yield* child(
          process.execPath,
          [launcher, ...args, "--json"],
          base,
          join(base, "actor"),
        );
        assert.strictEqual(output.code, 2, output.stderr + output.stdout);
        assert.strictEqual(output.stderr, "");
        const result = JSON.parse(output.stdout);
        assert.strictEqual(result.schemaVersion, 1);
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.exitCode, 2);
        assert.strictEqual(result.diagnostics[0].code, "ARGUMENT_INVALID");
        assert.deepStrictEqual(yield* io(() => fs.readdir(base)), []);
      }),
    );
  }
  for (const args of [["--help"], ["plan", "--help"], ["apply", "-h"]]) {
    it.live(
      `prints help for ${args.join(" ")} without reading machine configuration`,
      () =>
        Effect.gen(function* () {
          const base = yield* fixture;
          const output = yield* child(
            process.execPath,
            [launcher, ...args, "--config", join(base, "missing.json")],
            base,
            join(base, "actor"),
          );
          assert.strictEqual(output.code, 0, output.stderr + output.stdout);
          assert.strictEqual(output.stderr, "");
          assert.include(output.stdout, "lab-skills");
          assert.include(output.stdout, "--help");
          assert.notInclude(output.stdout, "CONFIG_INVALID");
          assert.deepStrictEqual(yield* io(() => fs.readdir(base)), []);
        }),
    );
  }
});
