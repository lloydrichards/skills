import { Effect, Path } from "effect";
import {
  Manifest,
  SourceLock,
  decode,
  Targets,
  type Source,
  type Selection,
} from "./model.js";
import { Disk } from "./services.js";
import {
  identifier,
  inventory,
  json,
  noLinks,
  relative,
  sourceTree,
  bundleLocalNotices,
} from "./files.js";
import { problem } from "./error.js";

export interface Catalog {
  readonly manifest: Manifest;
  readonly lock: SourceLock;
}
export const selection = (
  manifest: Manifest,
  requested: Selection,
  blocked = true,
) =>
  Effect.gen(function* () {
    const result: string[] = [],
      visiting = new Set<string>();
    const visit = Effect.fn("Catalog.visit")(function* (
      name: string,
    ): Effect.fn.Return<void, import("./error.js").LabError> {
      yield* identifier(name);
      if (result.includes(name)) return;
      if (visiting.has(name))
        return yield* problem(
          "MANIFEST_INVALID",
          `Dependency cycle at ${name}`,
          2,
        );
      const skill = Object.hasOwn(manifest.skills, name)
        ? manifest.skills[name]
        : undefined;
      if (!skill)
        return yield* problem(
          "MANIFEST_INVALID",
          `${name} is unknown, externally managed, or deferred`,
          2,
        );

      if (blocked && skill.blocked_reason)
        return yield* problem("BLOCKED_SKILL", skill.blocked_reason, 2, name);
      visiting.add(name);
      for (const dependency of skill.dependencies) yield* visit(dependency);
      visiting.delete(name);
      result.push(name);
    });
    for (const profile of requested.profiles) {
      yield* identifier(profile).pipe(
        Effect.mapError(() =>
          problem("MANIFEST_INVALID", `Invalid profile ${profile}`, 2),
        ),
      );
      const members = Object.hasOwn(manifest.profiles, profile)
        ? manifest.profiles[profile]
        : undefined;
      if (!members)
        return yield* problem(
          "MANIFEST_INVALID",
          `Unknown profile ${profile}`,
          2,
        );
      for (const name of members) yield* visit(name);
    }
    for (const name of requested.skills) yield* visit(name);
    return result;
  });

export const validate = Effect.fn("Catalog.validate")(function* (root: string) {
  const path = yield* Path.Path,
    disk = yield* Disk;
  const manifestPath = path.join(root, "manifest.json"),
    lockPath = path.join(root, "sources.lock.json");
  const manifest = yield* decode(Manifest)(
    yield* json(manifestPath, "MANIFEST_INVALID", 2),
  ).pipe(
    Effect.mapError((e) =>
      problem(
        "MANIFEST_INVALID",
        `Invalid manifest: ${e.message}`,
        2,
        manifestPath,
      ),
    ),
  );
  const lock = yield* decode(SourceLock)(
    yield* json(lockPath, "MANIFEST_INVALID", 2),
  ).pipe(
    Effect.mapError((e) =>
      problem("MANIFEST_INVALID", `Invalid lock: ${e.message}`, 2, lockPath),
    ),
  );
  const foldedNames = new Set<string>();
  for (const name of [
    ...Object.keys(manifest.external),
    ...Object.keys(manifest.candidates),
  ])
    yield* identifier(name);
  if (!manifest.owner)
    return yield* problem("MANIFEST_INVALID", "Manifest owner is required", 2);
  for (const name of Object.keys(manifest.skills)) {
    yield* identifier(name);
    if (foldedNames.has(name.toLowerCase()))
      return yield* problem(
        "MANIFEST_INVALID",
        `Case-colliding skill ${name}`,
        2,
      );
    foldedNames.add(name.toLowerCase());
    if (
      name in manifest.external ||
      name in manifest.candidates ||
      ["but", "gitbutler", "rex"].includes(name)
    ) {
      return yield* problem(
        "MANIFEST_INVALID",
        `Reserved external/candidate skill ${name} cannot be managed`,
        2,
      );
    }
  }
  for (const [name, value] of Object.entries(lock.sources)) {
    yield* identifier(name);
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository) ||
      !/^[a-f0-9]{40}$/.test(value.commit) ||
      !value.revision_basis
    ) {
      return yield* problem(
        "MANIFEST_INVALID",
        `Source ${name} needs repository, immutable commit and qualified revision basis`,
        2,
      );
    }
    yield* relative(value.path);
    const foldedFiles = new Set<string>();
    for (const [file, record] of Object.entries(value.files)) {
      yield* relative(file);
      if (
        !/^[a-f0-9]{64}$/.test(record.sha256) ||
        foldedFiles.has(file.toLowerCase())
      )
        return yield* problem(
          "MANIFEST_INVALID",
          `Invalid or case-colliding file lock ${name}/${file}`,
          2,
        );

      foldedFiles.add(file.toLowerCase());
      if (/(^|\/)bin\//.test(file))
        return yield* problem(
          "MANIFEST_INVALID",
          `Binary payload is not a source skill: ${file}`,
          2,
        );
    }
    if (!value.files["SKILL.md"])
      return yield* problem(
        "MANIFEST_INVALID",
        `Missing locked SKILL.md for ${name}`,
        2,
      );

    const tree = sourceTree(value.files);
    const foldedDirectories = tree.directories.map((dir) => dir.toLowerCase());
    if (
      new Set(foldedDirectories).size !== foldedDirectories.length ||
      foldedDirectories.some((dir) => foldedFiles.has(dir))
    )
      return yield* problem(
        "MANIFEST_INVALID",
        `File/directory collision in ${name}`,
        2,
      );

    for (const [file, source] of Object.entries(value.license_files)) {
      yield* relative(file);
      yield* relative(source);
      if (!Object.hasOwn(value.files, file))
        return yield* problem(
          "MANIFEST_INVALID",
          `Unhashed license ${name}/${file}`,
          2,
        );
    }
  }
  const checkSource = Effect.fn("Catalog.checkSource")(function* (
    source: Source,
  ) {
    if ("locked" in source) {
      if (!Object.hasOwn(lock.sources, source.locked))
        return yield* problem(
          "MANIFEST_INVALID",
          `Missing lock ${source.locked}`,
          2,
        );
    } else {
      yield* relative(source.local);
      if (!source.local.startsWith("skills/"))
        return yield* problem(
          "SOURCE_INVALID",
          "Local skill source must be under skills/",
          2,
          source.local,
        );

      const local = path.join(root, source.local);
      const bundled = yield* inventory(local, true).pipe(
        Effect.flatMap((tree) => bundleLocalNotices(root, tree)),
        Effect.mapError((e) => problem("SOURCE_INVALID", e.message, 2, e.path)),
      );
      if (!bundled.tree.files["SKILL.md"])
        return yield* problem(
          "SOURCE_INVALID",
          "Local source lacks SKILL.md",
          2,
          local,
        );
    }
  });
  for (const [name, skill] of Object.entries(manifest.skills)) {
    if (!skill.source && !skill.variants)
      return yield* problem(
        "MANIFEST_INVALID",
        `Missing source for ${name}`,
        2,
      );
    if (skill.source) yield* checkSource(skill.source);
    for (const [target, source] of Object.entries(skill.variants ?? {})) {
      if (!Targets.some((t) => t === target))
        return yield* problem(
          "MANIFEST_INVALID",
          `Unknown target variant ${target}`,
          2,
        );

      yield* checkSource(source);
    }
    for (const target of Targets) {
      if (!skill.variants?.[target] && !skill.source)
        return yield* problem(
          "MANIFEST_INVALID",
          `Missing ${target} variant for ${name}`,
          2,
        );
    }
  }
  for (const name of Object.keys(manifest.profiles)) {
    yield* identifier(name);
    yield* selection(
      manifest,
      { profiles: [name], skills: [], targets: [] },
      false,
    );
  }
  yield* selection(
    manifest,
    { profiles: [], skills: Object.keys(manifest.skills), targets: [] },
    false,
  );
  // Detect stray local installations in authored source, instead of ignoring them.
  const skillsPath = path.join(root, "skills");
  yield* noLinks(skillsPath);
  if ((yield* disk.info(skillsPath))?.kind === "directory") {
    const localPaths = new Set(
      Object.values(manifest.skills).flatMap((skill) =>
        [skill.source, ...Object.values(skill.variants ?? {})].flatMap((s) =>
          s && "local" in s ? [s.local] : [],
        ),
      ),
    );
    for (const name of yield* disk.list(skillsPath)) {
      if (!localPaths.has("skills/" + name))
        return yield* problem(
          "SOURCE_INVALID",
          "Unlisted entry in authored skills directory",
          2,
          path.join(skillsPath, name),
        );
    }
  }
  return { manifest, lock } satisfies Catalog;
});
