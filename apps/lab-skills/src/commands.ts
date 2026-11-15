import { Console, Effect, Option, Ref } from "effect";
import { CliConfig, CliOutput, Command, Flag, GlobalFlag } from "effect/cli";
import type { Command as CommandName, Flags } from "./config.js";
import { problem, type LabError } from "./error.js";

const last = (name: string) =>
  Flag.String(name).pipe(
    Flag.filter(
      (value) => value.length > 0,
      () => "Expected a non-empty value",
    ),
    Flag.atLeast(0),
    Flag.map((values) => values.at(-1)),
  );
const selected = (name: string) =>
  Flag.String(name).pipe(
    Flag.filter(
      (value) => value.length > 0,
      () => "Expected a non-empty value",
    ),
    Flag.atLeast(0),
    Flag.map((values) => (values.length ? values : undefined)),
  );
const options = {
  dryRun: Flag.Boolean("dry-run").pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Preview inventory and profile/adoption proposals without writing files",
    ),
  ),
  ascii: Flag.Boolean("ascii").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Use ASCII selection markers and review borders"),
  ),
  tui: Flag.Boolean("tui").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Open the interactive installation inspector"),
  ),
  json: Flag.Boolean("json").pipe(
    Flag.atLeast(0),
    Flag.map((values) => values.some(Boolean)),
  ),
  home: last("home"),
  profiles: selected("profile"),
  skills: selected("skill"),
  targets: Flag.Literals("target", [
    "agents",
    "codex",
    "claude",
    "opencode",
    "pi",
  ]).pipe(
    Flag.withAlias("harness"),
    Flag.atLeast(0),
    Flag.map((values) => (values.length ? values : undefined)),
  ),
  config: last("config"),
  archiveDir: last("archive-dir"),
};
const commandNames = ["validate", "status", "plan", "apply", "doctor"] as const;
const commandTree = <E, R>(
  handle: (flags: Flags) => Effect.Effect<void, E, R>,
) => {
  const subcommand = (command: CommandName) =>
    Command.make(command, options, (flags) =>
      handle({
        command,
        json: flags.json,
        ...(flags.dryRun ? { dryRun: true } : {}),
        ...(flags.ascii ? { ascii: true } : {}),
        ...(flags.tui ? { tui: true } : {}),
        ...(flags.home === undefined ? {} : { home: flags.home }),
        ...(flags.profiles === undefined ? {} : { profiles: flags.profiles }),
        ...(flags.skills === undefined ? {} : { skills: flags.skills }),
        ...(flags.targets === undefined ? {} : { targets: flags.targets }),
        ...(flags.config === undefined ? {} : { config: flags.config }),
        ...(flags.archiveDir === undefined
          ? {}
          : { archiveDir: flags.archiveDir }),
      }),
    );
  return Command.make(
    "lab-skills",
    options,
    (flags): Effect.Effect<void, E | LabError, R> =>
      handle({
        command: "inventory",
        json: flags.json,
        ...(flags.dryRun ? { dryRun: true } : {}),
        ...(flags.ascii ? { ascii: true } : {}),
        ...(flags.tui ? { tui: true } : {}),
        ...(flags.home === undefined ? {} : { home: flags.home }),
        ...(flags.profiles === undefined ? {} : { profiles: flags.profiles }),
        ...(flags.skills === undefined ? {} : { skills: flags.skills }),
        ...(flags.targets === undefined ? {} : { targets: flags.targets }),
        ...(flags.config === undefined ? {} : { config: flags.config }),
        ...(flags.archiveDir === undefined
          ? {}
          : { archiveDir: flags.archiveDir }),
      }),
  ).pipe(
    Command.withDescription(
      "Toggle skills and review profiles from the editable checkout. Enter reviews; a then y saves and applies local files. --dry-run disables writes. Legacy apply requires explicit home and target. See docs/contract.md.",
    ),
    Command.withSubcommands(commandNames.map(subcommand)),
  );
};

export const parse = Effect.fn("Arguments.parse")(function* (
  args: ReadonlyArray<string>,
) {
  for (const name of ["dry-run", "ascii"])
    if (
      args.some(
        (arg, index) =>
          arg.startsWith(`--${name}=`) ||
          (arg === `--${name}` &&
            ["true", "false"].includes(args[index + 1] ?? "")),
      )
    )
      return yield* problem(
        "ARGUMENT_INVALID",
        `--${name} is a bare switch without a value`,
        2,
      );
  if (
    args.includes("--dry-run") &&
    (args.includes("--json") || args.includes("--tui"))
  )
    return yield* problem(
      "ARGUMENT_INVALID",
      "--dry-run cannot be combined with --json or --tui",
      2,
    );
  // Keep --json a bare switch. Effect CLI also accepts Boolean values, which
  // would disagree with the launcher's raw-token JSON selection on failures.
  if (
    args.some(
      (arg, index) =>
        arg.startsWith("--json=") ||
        (arg === "--json" &&
          (args[index + 1] === "true" || args[index + 1] === "false")),
    )
  ) {
    return yield* problem(
      "ARGUMENT_INVALID",
      "--json is a bare switch without a value",
      2,
    );
  }
  if (
    args.some(
      (arg, index) =>
        arg.startsWith("--tui=") ||
        (arg === "--tui" && ["true", "false"].includes(args[index + 1] ?? "")),
    )
  )
    return yield* problem(
      "ARGUMENT_INVALID",
      "--tui is a bare switch without a value",
      2,
    );
  if (args.includes("--tui") && args.includes("--json"))
    return yield* problem(
      "ARGUMENT_INVALID",
      "--tui cannot be combined with --json",
      2,
    );
  const result = yield* Ref.make(Option.none<Flags>());
  const console = yield* Console.Console;
  // Effect CLI 4.0.5 renders help on parse failures, even with renderErrors
  // disabled. Parsing is silent because the application owns the JSON result.
  yield* Command.runWith(
    commandTree((flags) => Ref.set(result, Option.some(flags))),
    {
      version: "0.1.0",
      renderErrors: false,
    },
  )(args).pipe(
    Effect.provideService(CliConfig.CliConfig, { builtIns: [] }),
    Effect.provideService(
      Console.Console,
      Object.assign(Object.create(console), { log: () => {}, error: () => {} }),
    ),
    Effect.mapError((error) =>
      problem(
        "ARGUMENT_INVALID",
        error._tag === "ShowHelp"
          ? CliOutput.defaultFormatter({ colors: false }).formatErrors(
              error.errors,
            )
          : error.message,
        2,
      ),
    ),
  );
  const parsed = yield* Effect.fromOption(yield* Ref.get(result)).pipe(
    Effect.mapError(() =>
      problem(
        "ARGUMENT_INVALID",
        "Choose a command. Use --help for syntax.",
        2,
      ),
    ),
  );
  if (parsed.command === "inventory" && (parsed.json || parsed.tui))
    return yield* problem(
      "ARGUMENT_INVALID",
      "The inventory cannot be combined with --json or --tui",
      2,
    );
  if (parsed.dryRun && parsed.command !== "inventory")
    return yield* problem(
      "ARGUMENT_INVALID",
      "Use lab-skills --dry-run without a subcommand",
      2,
    );
  if (parsed.ascii && parsed.command !== "inventory")
    return yield* problem(
      "ARGUMENT_INVALID",
      "--ascii requires the inventory",
      2,
    );
  return parsed;
});

export const help = (args: ReadonlyArray<string>) =>
  Command.runWith(
    commandTree(() => Effect.void),
    {
      version: "0.1.0",
    },
  )(
    commandNames.some((name) => name === args[0])
      ? [args[0] ?? "", "--help"]
      : ["--help"],
  ).pipe(
    Effect.provideService(CliConfig.CliConfig, { builtIns: [GlobalFlag.Help] }),
  );
