import { Data, Effect, Path } from "effect";
import { type Catalog, validate } from "../catalog.js";
import { configure, type Environment, type Flags } from "../config.js";
import { problem } from "../error.js";
import { noLinks } from "../files.js";
import { roots, type Entry, type Result, type Selection } from "../model.js";
import { reviewFingerprint, type Options } from "../plan.js";
import { runCommand } from "../program.js";
import { Disk } from "../services.js";
import type { MarkdownDocument } from "./okf/model.js";
import { parseMarkdown } from "./okf/parse.js";

export interface Preview {
  readonly title: string;
  readonly reason?: string;
  readonly document: MarkdownDocument;
}
export interface Inspection {
  readonly root: string;
  readonly options: Options;
  readonly profileNames: ReadonlyArray<string>;
  readonly result: Result;
  readonly previews: ReadonlyMap<string, Preview>;
}
class PreviewError extends Data.TaggedError("PreviewError")<{
  readonly cause: unknown;
}> {}

const preview = Effect.fn("Tui.preview")(function* (
  root: string,
  entry: Entry,
  catalog: Catalog | undefined,
) {
  const disk = yield* Disk;
  const path = yield* Path.Path;
  const [target, name] = entry.id.split("/");
  const declared =
    name && catalog && Object.hasOwn(catalog.manifest.skills, name)
      ? catalog.manifest.skills[name]
      : undefined;
  const variant =
    declared?.variants && target ? declared.variants[target] : undefined;
  const source = variant ?? declared?.source;
  let file: string | undefined;
  let title = "Checkout SKILL.md";
  if (source && "local" in source)
    file = path.join(root, source.local, "SKILL.md");
  else if (entry.installedSource) {
    file = path.join(entry.path, "SKILL.md");
    title = "Installed SKILL.md";
  }
  if (!file)
    return {
      title: "Source preview",
      document: parseMarkdown(
        entry.source?.kind === "upstream"
          ? "Pinned upstream content is not downloaded during inspection. Install after reviewing its source identity, or inspect an existing owned copy."
          : "No skill document is available for this entry.",
      ),
    };
  const document = yield* noLinks(file).pipe(
    Effect.flatMap(() => disk.read(file)),
    Effect.flatMap((bytes) =>
      Effect.try({
        try: () => parseMarkdown(new TextDecoder().decode(bytes)),
        catch: (cause) => new PreviewError({ cause }),
      }),
    ),
    Effect.orElseSucceed(() =>
      parseMarkdown(
        "Preview unavailable. The skill document could not be read safely or parsed.",
      ),
    ),
  );
  return { title, document } satisfies Preview;
});

export const inspectionFlags = (
  command: Flags["command"],
  options: Options,
  original: Flags,
): Flags => ({
  command,
  json: false,
  home: options.home,
  targets: options.selection.targets,
  profiles: options.selection.profiles,
  skills: options.selection.skills,
  ...(original.config ? { config: original.config } : {}),
  ...(options.archiveDir ? { archiveDir: options.archiveDir } : {}),
});

export const inspect = Effect.fn("Tui.inspect")(function* (
  root: string,
  flags: Flags,
  environment: Environment,
  options?: Options,
  reviewed?: string,
) {
  if (flags.command === "apply" && reviewed === undefined)
    return yield* problem(
      "ARGUMENT_INVALID",
      "Interactive apply requires a reviewed plan",
      2,
    );
  const resolved = options ?? (yield* configure(flags, environment));
  const result = yield* runCommand(
    root,
    inspectionFlags(flags.command, resolved, flags),
    environment,
    reviewed,
  );
  // The command result owns validation diagnostics. An invalid catalog must still be inspectable.
  const catalog = yield* validate(root).pipe(Effect.result);
  const available = catalog._tag === "Success" ? catalog.success : undefined;
  const previews = yield* Effect.forEach(result.entries, (entry) =>
    preview(root, entry, available).pipe(
      Effect.map((value) => {
        const name = entry.id.split("/")[1] ?? "";
        const selectedBy = resolved.selection.profiles.filter(
          (profile) =>
            available &&
            Object.hasOwn(available.manifest.profiles, profile) &&
            available.manifest.profiles[profile]?.includes(name),
        );
        const parents = result.entries
          .filter(
            (other) =>
              available &&
              Object.hasOwn(
                available.manifest.skills,
                other.id.split("/")[1] ?? "",
              ) &&
              available.manifest.skills[
                other.id.split("/")[1] ?? ""
              ]?.dependencies.includes(name),
          )
          .map((other) => other.id);
        const reason = resolved.selection.skills.includes(name)
          ? "Selected explicitly."
          : selectedBy.length
            ? `Selected by profiles: ${selectedBy.join(", ")}.`
            : parents.length
              ? `Included as a dependency of ${[...new Set(parents)].join(", ")}.`
              : undefined;
        return [entry.id, { ...value, ...(reason ? { reason } : {}) }] as const;
      }),
    ),
  );
  return {
    root,
    options: resolved,
    result,
    profileNames: [
      ...new Set([
        ...Object.keys(available?.manifest.profiles ?? {}),
        ...resolved.selection.profiles,
      ]),
    ],
    previews: new Map(previews),
  } satisfies Inspection;
});

export const canInstall = (result: Result) =>
  result.ok &&
  result.exitCode === 0 &&
  (result.command === "plan" || result.command === "apply") &&
  !result.diagnostics.some((d) => d.severity === "error") &&
  !result.entries.some((e) => e.status === "conflict") &&
  result.entries.some((e) => e.status === "new" || e.status === "update");
export const reviewedPlan = (inspection: Inspection) =>
  reviewFingerprint(
    inspection.options.home,
    inspection.options.selection,
    inspection.result.entries,
    inspection.result.diagnostics,
  );
export const installationRoots = (options: Options) =>
  options.selection.targets.map(
    (target) => `${options.home.replace(/\/$/, "")}/${roots[target]}`,
  );
export const withSelection = (
  options: Options,
  selection: Selection,
): Options => ({ ...options, selection });
