import { Effect } from "effect";
import { parse, configure, type Environment, type Flags } from "./config.js";
import { validate, type Catalog } from "./catalog.js";
import { plan } from "./plan.js";
import { apply } from "./apply.js";
import { doctor } from "./doctor.js";
import { Result, decode, type Selection } from "./model.js";
import { SourceInspection } from "./services.js";
import { problem, type LabError } from "./error.js";

const execute = Effect.fn("LabSkills.run")(function* <R>(
  root: string,
  initialCommand: string,
  loadFlags: Effect.Effect<Flags, LabError, R>,
  environment: Environment,
  reviewed?: string,
) {
  let command = initialCommand,
    home: string | undefined;
  let catalog: Catalog | undefined;
  let selection: Selection = { profiles: [], skills: [], targets: [] };
  const operation = Effect.gen(function* () {
    const flags = yield* loadFlags;
    command = flags.command;
    const options = yield* configure(flags, environment);
    home = options.home;
    selection = options.selection;
    catalog = yield* validate(root);
    const sourceGit = yield* (yield* SourceInspection).git(root);
    const output =
      flags.command === "validate"
        ? { entries: [], diagnostics: [] }
        : flags.command === "doctor"
          ? yield* doctor(root, catalog, options)
          : flags.command === "apply"
            ? yield* apply(root, catalog, options, reviewed)
            : yield* plan(root, catalog, options);
    const conflict =
      output.diagnostics.some((d) => d.severity === "error") ||
      output.entries.some((e) => e.status === "conflict");
    const result: Result = {
      schemaVersion: 1,
      command,
      ok: !conflict,
      exitCode: conflict ? 3 : 0,
      checkout: root,
      home,
      selection,
      entries: output.entries,
      diagnostics: output.diagnostics,
      ...(sourceGit ? { sourceGit } : {}),
    };
    return yield* decode(Result)(result).pipe(
      Effect.mapError(() =>
        problem(
          "INTERNAL_ERROR",
          "Generated result violates the public schema",
          1,
        ),
      ),
    );
  });
  const result = yield* operation.pipe(
    Effect.catchTag("LabError", (error) =>
      Effect.succeed({
        schemaVersion: 1,
        command,
        ok: false,
        exitCode: error.exitCode,
        checkout: root,
        ...(home ? { home } : {}),
        selection,
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
  return { result, catalog };
});

export const program = (
  root: string,
  args: ReadonlyArray<string>,
  environment: Environment,
) =>
  execute(root, args[0] ?? "unknown", parse(args), environment).pipe(
    Effect.map(({ result }) => result),
  );

export const runCommand = (
  root: string,
  flags: Flags,
  environment: Environment,
  reviewed?: string,
) => execute(root, flags.command, Effect.succeed(flags), environment, reviewed);
