import { Effect, Path } from "effect";
import { MachineConfig, Target, decode, type Selection } from "./model.js";
import { Disk } from "./services.js";
import { json, noLinks } from "./files.js";
import { problem } from "./error.js";

export type Command = "validate" | "status" | "plan" | "apply" | "doctor";
export interface Flags {
  command: Command;
  json: boolean;
  tui?: boolean;
  home?: string;
  profiles?: ReadonlyArray<string>;
  skills?: ReadonlyArray<string>;
  targets?: ReadonlyArray<Target>;
  config?: string;
  archiveDir?: string;
}
export interface Environment {
  readonly home: string;
  readonly config?: string;
  readonly xdgConfig?: string;
}
export { parse } from "./commands.js";
export const configure = Effect.fn("Configuration.resolve")(function* (
  flags: Flags,
  environment: Environment,
) {
  const path = yield* Path.Path,
    disk = yield* Disk;
  const configPath =
    flags.config ??
    environment.config ??
    path.join(
      environment.xdgConfig ?? path.join(environment.home, ".config"),
      "lab-skills/config.json",
    );
  if (!path.isAbsolute(configPath))
    return yield* problem(
      "CONFIG_INVALID",
      "Configuration path must be absolute",
      2,
    );
  yield* noLinks(configPath).pipe(
    Effect.mapError((e) => problem("CONFIG_INVALID", e.message, 2, e.path)),
  );
  let config: MachineConfig = { schema: 1 };
  if (yield* disk.info(configPath))
    config = yield* decode(MachineConfig)(
      yield* json(configPath, "CONFIG_INVALID", 2),
    ).pipe(
      Effect.mapError((e) =>
        problem(
          "CONFIG_INVALID",
          `Invalid machine configuration: ${e.message}`,
          2,
          configPath,
        ),
      ),
    );
  else if (flags.config || environment.config)
    return yield* problem(
      "CONFIG_INVALID",
      "Explicit machine configuration is missing",
      2,
      configPath,
    );

  const home = flags.home ?? config.home ?? environment.home;
  const targets = flags.targets ?? config.targets ?? ["agents"];
  const skills = flags.skills ?? config.skills ?? [];
  const profiles =
    flags.profiles ?? config.profiles ?? (skills.length ? [] : ["default"]);
  const archiveDir = flags.archiveDir ?? config.archiveDir;
  if (!path.isAbsolute(home) || (archiveDir && !path.isAbsolute(archiveDir)))
    return yield* problem(
      "CONFIG_INVALID",
      "Home and archive paths must be absolute",
      2,
    );

  if (
    flags.command === "apply" &&
    (!(flags.home ?? config.home) || !(flags.targets ?? config.targets)?.length)
  )
    return yield* problem(
      "CONFIG_INVALID",
      "apply requires an explicit home and target in flags or machine configuration",
      2,
    );

  if (!targets.length)
    return yield* problem(
      "CONFIG_INVALID",
      "At least one destination target is required",
      2,
    );

  return {
    home: path.normalize(home),
    selection: {
      profiles: [...new Set(profiles)],
      skills: [...new Set(skills)],
      targets: [...new Set(targets)],
    } satisfies Selection,
    ...(archiveDir ? { archiveDir } : {}),
  };
});
