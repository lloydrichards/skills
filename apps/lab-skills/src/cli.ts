import { BunRuntime } from "@effect/platform-bun";
import { NodeRuntime } from "@effect/platform-node";
import { Cause, Config, Console, Effect, Exit, Runtime, Schema } from "effect";
import { help } from "./commands.js";
import { program } from "./program.js";
import { runtimeLayer } from "./runtime.js";
import { Result } from "./model.js";

const present = Effect.fn("Output.present")(function* (
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
  yield* Console.log(
    `lab-skills ${result.command}: ${result.ok ? "ok" : "needs attention"}`,
  );
  for (const entry of result.entries)
    yield* Console.log(
      `${entry.status.padEnd(11)} ${entry.id}  ${entry.path}${entry.reason ? "  " + entry.reason : ""}${entry.status === "update" ? "  " + (entry.installedSource?.content_sha256.slice(0, 12) ?? "unknown") + " -> " + (entry.source?.content_sha256.slice(0, 12) ?? "unknown") : ""}`,
    );
  for (const diagnostic of result.diagnostics)
    yield* (diagnostic.severity === "error" ? Console.error : Console.log)(
      `${diagnostic.code}: ${diagnostic.message}${diagnostic.path ? " [" + diagnostic.path + "]" : ""}`,
    );
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
    const operation =
      argv.includes("--tui") || argv.some((arg) => arg.startsWith("--tui="))
        ? Effect.flatMap(
            Effect.promise(() => import("./tui/live.js")),
            ({ interactive }) => interactive(root, argv, environment),
          ).pipe(
            Effect.catchTag("LabError", (error) =>
              Effect.succeed({
                schemaVersion: 1,
                command: argv[0] ?? "unknown",
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
          )
        : program(root, argv, environment);
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
  yield* present(result, argv.includes("--json"));
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
