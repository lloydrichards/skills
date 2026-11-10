import { Effect } from "effect";
import { parse, configure, type Environment } from "./config.js";
import { validate } from "./catalog.js";
import { plan } from "./plan.js";
import { apply } from "./apply.js";
import { doctor } from "./doctor.js";
import { Result, decode, type Selection } from "./model.js";
import { SourceInspection } from "./services.js";
import { problem } from "./error.js";

export const program = Effect.fn("LabSkills.run")(function* (
  root: string,
  args: ReadonlyArray<string>,
  environment: Environment,
) {
  let command = args[0] ?? "unknown",
    home: string | undefined;
  let selection: Selection = { profiles: [], skills: [], targets: [] };
  const operation = Effect.gen(function* () {
    const flags = yield* parse(args);
    command = flags.command;
    const options = yield* configure(flags, environment);
    home = options.home;
    selection = options.selection;
    const catalog = yield* validate(root);
    const sourceGit = yield* (yield* SourceInspection).git(root);
    const output =
      flags.command === "validate"
        ? { entries: [], diagnostics: [] }
        : flags.command === "doctor"
          ? yield* doctor(root, catalog, options)
          : flags.command === "apply"
            ? yield* apply(root, catalog, options)
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
  return yield* operation.pipe(
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
});
