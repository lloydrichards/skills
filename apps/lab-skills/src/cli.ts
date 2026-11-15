import { BunRuntime } from "@effect/platform-bun";
import { NodeRuntime } from "@effect/platform-node";
import {
  Cause,
  Config,
  Console,
  Effect,
  Exit,
  Runtime,
  Schema,
  Stdio,
  Terminal,
} from "effect";
import { renderHuman, renderText } from "./output.js";
import { help, parse } from "./commands.js";
import { runCommand } from "./program.js";
import { runtimeLayer } from "./runtime.js";
import { Result } from "./model.js";

export const present = Effect.fn("Output.present")(function* (
  result: Result,
  json: boolean,
) {
  if (json) {
    const output = yield* Schema.encodeEffect(
      Schema.fromJsonString(Result, { space: 2 }),
    )(result);
    yield* Console.log(output);
    return;
  }
  const stdio = yield* Stdio.Stdio;
  const terminal = yield* Terminal.Terminal;
  const stdoutTty = yield* stdio.stdoutIsTerminal;
  const stderrTty = yield* stdio.stderrIsTerminal;
  const noColor = yield* Config.String("NO_COLOR").pipe(Config.withDefault(""));
  const term = yield* Config.String("TERM").pipe(Config.withDefault(""));
  const colors = noColor.length === 0 && term !== "dumb";
  // Terminal.columns describes stdout. Redirected stdout has no terminal width.
  const columns = stdoutTty ? yield* terminal.columns : 0;
  const width = columns > 0 ? Math.max(1, columns - 1) : 80;
  const output = renderHuman(result, width);
  yield* Console.log(renderText(output.stdout, stdoutTty && colors));
  if (output.stderr.rows)
    yield* Console.error(renderText(output.stderr, stderrTty && colors));
});

const run = Effect.fn("Cli.run")(function* (
  root: string,
  argv: ReadonlyArray<string>,
) {
  const envPath = yield* Config.String("PATH").pipe(Config.withDefault(""));
  if (argv.includes("--help") || argv.includes("-h")) {
    yield* help(argv).pipe(Effect.provide(runtimeLayer(envPath)));
    return 0;
  }
  const result = yield* Effect.gen(function* () {
    const home = yield* Config.String("HOME").pipe(Config.withDefault(""));
    const config = yield* Config.String("LAB_SKILLS_CONFIG").pipe(
      Config.withDefault(""),
    );
    const xdgConfig = yield* Config.String("XDG_CONFIG_HOME").pipe(
      Config.withDefault(""),
    );
    const environment = {
      home,
      ...(config ? { config } : {}),
      ...(xdgConfig ? { xdgConfig } : {}),
    };
    let command = argv[0] ?? "inventory";
    const operation = Effect.gen(function* () {
      const flags = yield* parse(argv);
      command = flags.command;
      if (flags.command === "inventory") {
        const { runInventory, inventoryTerminal } = yield* Effect.promise(
          () => import("./tui/inventory.js"),
        );
        return yield* runInventory(root, flags, environment).pipe(
          Effect.provide(inventoryTerminal),
        );
      }
      if (flags.tui) {
        const { interactive, inspectorTerminal } = yield* Effect.promise(
          () => import("./tui/live.js"),
        );
        return yield* interactive(root, argv, environment).pipe(
          Effect.provide(inspectorTerminal),
        );
      }
      return (yield* runCommand(root, flags, environment)).result;
    }).pipe(
      Effect.catchTag("LabError", (error) =>
        Effect.succeed({
          schemaVersion: 1,
          command,
          ok: false,
          exitCode: error.exitCode,
          checkout: root,
          selection: { profiles: [], skills: [], targets: [] },
          entries: [],
          diagnostics: [
            {
              code: error.code,
              severity: "error",
              message: error.message,
              ...(error.path ? { path: error.path } : {}),
            },
          ],
        } satisfies Result),
      ),
    );
    return yield* operation.pipe(Effect.provide(runtimeLayer(envPath)));
  }).pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterrupts(cause),
      () =>
        Effect.succeed({
          schemaVersion: 1,
          command: argv[0] ?? "unknown",
          ok: false,
          exitCode: 1,
          checkout: root,
          selection: { profiles: [], skills: [], targets: [] },
          entries: [],
          diagnostics: [
            {
              code: "INTERNAL_ERROR",
              severity: "error",
              message:
                "Unexpected runtime failure; no automatic recovery was attempted. Run doctor if apply was interrupted.",
            },
          ],
        } satisfies Result),
    ),
  );
  if (result.command === "inventory" && result.ok) return result.exitCode;
  yield* present(result, argv.includes("--json")).pipe(
    Effect.provide(runtimeLayer(envPath)),
  );
  return result.exitCode;
});

export const main = (root: string, argv: string[]) => {
  const runMain = process.versions["bun"]
    ? BunRuntime.runMain
    : NodeRuntime.runMain;
  runMain(run(root, argv), {
    disableErrorReporting: true,
    teardown(exit, onExit) {
      if (Exit.isSuccess(exit) && typeof exit.value === "number") {
        // Domain failures are successful Effect results. Let stdout drain before
        // Node exits instead of passing their nonzero code to process.exit.
        process.exitCode = exit.value;
        onExit(0);
      } else {
        Runtime.defaultTeardown(exit, onExit);
      }
    },
  });
};
