import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  ConfigProvider,
  Console,
  Effect,
  Layer,
  Stdio,
  Terminal,
} from "effect";
import { present } from "../src/cli.js";
import type { Result } from "../src/model.js";

const failure: Result = {
  schemaVersion: 1,
  command: "plan",
  ok: false,
  exitCode: 2,
  checkout: "/work/skills",
  selection: { profiles: [], skills: [], targets: [] },
  entries: [],
  diagnostics: [
    {
      code: "CONFIG_INVALID",
      severity: "error",
      message: "Home and archive paths must be absolute",
    },
  ],
};
const capture = (stdoutTty: boolean, stderrTty: boolean, columns: number) =>
  Effect.gen(function* () {
    const console = yield* Console.Console;
    const stdio = yield* Stdio.Stdio;
    const terminal = yield* Terminal.Terminal;
    const stdout: string[] = [],
      stderr: string[] = [];
    yield* present(failure, false).pipe(
      Effect.provideService(
        Console.Console,
        Object.assign(Object.create(console), {
          log: (...values: ReadonlyArray<unknown>) => {
            stdout.push(values.map(String).join(" "));
          },
          error: (...values: ReadonlyArray<unknown>) => {
            stderr.push(values.map(String).join(" "));
          },
        }),
      ),
      Effect.provideService(Stdio.Stdio, {
        ...stdio,
        stdoutIsTerminal: Effect.succeed(stdoutTty),
        stderrIsTerminal: Effect.succeed(stderrTty),
      }),
      Effect.provideService(Terminal.Terminal, {
        ...terminal,
        columns: stdoutTty
          ? Effect.succeed(columns)
          : Effect.die(
              "Do not query stdout dimensions when stdout is redirected",
            ),
      }),
    );
    return { stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  });

describe("Human output stream dimensions", () => {
  it.effect(
    "keeps diagnostics readable when stdout is piped and stderr remains a terminal",
    () =>
      Effect.gen(function* () {
        const output = yield* capture(false, true, 0);
        assert.strictEqual(output.stdout, "Cannot build plan");
        assert.include(output.stderr, "CONFIG_INVALID");
        assert.include(output.stderr, failure.diagnostics[0]?.message ?? "");
        assert.isAtMost(output.stderr.split("\n").length, 3);
        assert.notInclude(output.stdout, "\u001b");
        assert.notInclude(output.stderr, "\u001b");
      }).pipe(
        Effect.provide(
          Layer.merge(
            NodeServices.layer,
            ConfigProvider.layer(ConfigProvider.fromUnknown({ NO_COLOR: "1" })),
          ),
        ),
      ),
  );

  it.effect(
    "uses the default width when an attached terminal reports zero columns",
    () =>
      Effect.gen(function* () {
        const output = yield* capture(true, false, 0);
        assert.strictEqual(output.stdout, "Cannot build plan");
        assert.include(
          output.stderr,
          "Home and archive paths must be absolute",
        );
      }).pipe(
        Effect.provide(
          Layer.merge(
            NodeServices.layer,
            ConfigProvider.layer(ConfigProvider.fromUnknown({ TERM: "dumb" })),
          ),
        ),
      ),
  );
});
