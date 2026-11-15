import { Effect, Path } from "effect";
import { parseDocument } from "yaml";
import { configure, type Environment, type Flags } from "./config.js";
import { validate, selection } from "./catalog.js";
import {
  inventory,
  bundleLocalNotices,
  sourceTree,
  treeHash,
} from "./files.js";
import { plan, paths } from "./plan.js";
import { Disk, OwnershipState, equal, canonical } from "./services.js";
import {
  roots,
  Targets,
  type Tree,
  type FileRecord,
  type Owned,
} from "./model.js";
import { problem, type LabError } from "./error.js";

export type Profile = "client" | "home-lab";
export type Comparison = "match" | "packaging" | "changed" | "unknown";
export interface Copy {
  path: string;
  physical: string;
  status: Comparison;
  missing: string[];
  extra: string[];
  changed: string[];
  problem: string;
  owned: boolean;
  edited: boolean;
  current: string;
}
export interface InventorySkill {
  name: string;
  description: string;
  descriptionSource: string;
  dependencies: readonly string[];
  copies: Copy[];
  target: string;
  blocked: string;
  external: boolean;
  catalog: boolean;
}
export interface InventoryModel {
  activeProfile?: Profile;
  catalogSnapshot?: string;
  home: string;
  root: string;
  seed: string;
  targets: readonly string[];
  skills: Record<string, InventorySkill>;
  original: Record<Profile, string[]>;
  draft: Record<Profile, string[]>;
  diagnostics: string[];
  excluded: Array<{ path: string; physical: string }>;
}
export const clean = (value: string) =>
  value
    // oxlint-disable-next-line no-control-regex -- Metadata must not emit terminal controls.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function frontmatter(document: string) {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(document);
  if (!match) return { name: "", description: "" };
  const yaml = parseDocument(match[1] ?? "", { uniqueKeys: true });
  if (yaml.errors.length) return { name: "", description: "" };
  const name: unknown = yaml.get("name"),
    description: unknown = yaml.get("description");
  return {
    name: typeof name === "string" ? clean(name) : "",
    description: typeof description === "string" ? clean(description) : "",
  };
}
export function compareFiles(
  actual: Readonly<Record<string, FileRecord>>,
  expected: Readonly<Record<string, FileRecord>>,
  notices: readonly string[],
) {
  const missing = Object.keys(expected).filter(
    (name) => !Object.hasOwn(actual, name),
  );
  const extra = Object.keys(actual).filter(
    (name) => !Object.hasOwn(expected, name),
  );
  const changed = Object.keys(expected).filter(
    (name) =>
      Object.hasOwn(actual, name) &&
      !equal(
        actual[name] && {
          sha256: actual[name].sha256,
          executable: actual[name].executable,
        },
        expected[name] && {
          sha256: expected[name].sha256,
          executable: expected[name].executable,
        },
      ),
  );
  const status: Comparison =
    !missing.length && !extra.length && !changed.length
      ? "match"
      : !extra.length &&
          !changed.length &&
          missing.every((name) => notices.includes(name))
        ? "packaging"
        : "changed";
  return { status, missing, extra, changed };
}

// This collector has no install, download, ownership-write or configuration-write path.
export const collectInventory = Effect.fn("Inventory.collect")(function* (
  root: string,
  flags: Flags,
  environment: Environment,
) {
  const disk = yield* Disk,
    path = yield* Path.Path;
  const options = yield* configure(
    { ...flags, command: "status" },
    environment,
  );
  if (
    options.selection.targets.length !== 1 ||
    options.selection.targets[0] !== "agents"
  )
    return yield* problem(
      "ARGUMENT_INVALID",
      "Inventory currently manages the shared agents destination only. Use --target agents.",
      2,
    );
  const catalog = yield* validate(root);
  const baseline = yield* plan(root, catalog, options);
  const ownership = yield* (yield* OwnershipState).read(
    paths(options.home).state,
  );
  const direct = [
    ...new Set([
      ...options.selection.profiles.flatMap(
        (profile) => catalog.manifest.profiles[profile] ?? [],
      ),
      ...options.selection.skills,
    ]),
  ];
  yield* selection(catalog.manifest, options.selection);
  if (options.selection.profiles.length > 1 || options.selection.skills.length)
    return yield* problem(
      "ARGUMENT_INVALID",
      "Inventory edits one named profile at a time. Use --profile client or --profile home-lab without --skill.",
      2,
    );
  const selectedProfile = options.selection.profiles[0];
  const activeProfile: Profile =
    selectedProfile === "home-lab" ? "home-lab" : "client";
  const original: Record<Profile, string[]> = {
    client: [
      ...(catalog.manifest.profiles["client"] ??
        (activeProfile === "client" ? direct : [])),
    ],
    "home-lab": [
      ...(catalog.manifest.profiles["home-lab"] ??
        (activeProfile === "home-lab" ? direct : [])),
    ],
  };
  const model: InventoryModel = {
    activeProfile,
    catalogSnapshot: canonical(catalog),
    home: options.home,
    root,
    seed: options.selection.profiles.join(", ") || "explicit skills",
    targets: options.selection.targets,
    skills: Object.create(null),
    original,
    draft: {
      client: [...original.client],
      "home-lab": [...original["home-lab"]],
    },
    diagnostics: baseline.diagnostics.map((item) => item.message),
    excluded: [],
  };
  // User skill roots may contain aliases into application-managed bundles.
  // Filter both the logical location and resolved destination, never skill names.
  const providerRoots = new Set<string>();
  for (const relative of [
    ".codex/skills/.system",
    ".codex/plugins",
    ".claude/plugins",
  ]) {
    const location = path.join(options.home, relative);
    providerRoots.add(location);
    providerRoots.add(
      yield* disk
        .realPath(location)
        .pipe(Effect.catchTag("LabError", () => Effect.succeed(location))),
    );
  }
  const excludeProvider = (location: string, physical: string) => {
    const excluded = [...providerRoots].some((root) =>
      [location, physical].some(
        (value) => value === root || value.startsWith(root + path.sep),
      ),
    );
    if (excluded && !model.excluded.some((item) => item.path === location))
      model.excluded.push({ path: location, physical });
    return excluded;
  };
  const expected = new Map<string, { tree: Tree; notices: string[] }>();
  for (const name of new Set([
    ...Object.keys(catalog.manifest.skills),
    ...Object.keys(catalog.manifest.external),
    ...Object.keys(catalog.manifest.candidates),
  ])) {
    const definition = catalog.manifest.skills[name];
    const skill: InventorySkill = {
      name,
      description: "",
      descriptionSource: "",
      dependencies: definition?.dependencies ?? [],
      copies: [],
      target: "",
      blocked:
        definition?.blocked_reason ??
        catalog.manifest.candidates[name]?.reason ??
        "",
      external: Object.hasOwn(catalog.manifest.external, name),
      catalog: Boolean(definition),
    };
    model.skills[name] = skill;
    const payload = definition?.variants?.["agents"] ?? definition?.source;
    if (!payload) continue;
    const prepared = yield* Effect.gen(function* () {
      if ("local" in payload) {
        const source = path.join(root, payload.local);
        const bundled = yield* bundleLocalNotices(
          root,
          yield* inventory(source, true),
        );
        const descriptionFile = path.join(source, "SKILL.md");
        const fields = frontmatter(
          new TextDecoder().decode(yield* disk.read(descriptionFile)),
        );
        skill.description = fields.description;
        skill.descriptionSource = descriptionFile;
        return { tree: bundled.tree, notices: Object.keys(bundled.sources) };
      }
      const pin = catalog.lock.sources[payload.locked];
      return pin
        ? {
            tree: sourceTree(pin.files),
            notices: Object.keys(pin.license_files),
          }
        : undefined;
    }).pipe(
      Effect.catchTag("LabError", (error) => {
        model.diagnostics.push(`${name}: ${error.message}`);
        skill.blocked ||= error.message;
        return Effect.void;
      }),
    );
    if (prepared) {
      expected.set(name, prepared);
      skill.target = yield* treeHash(prepared.tree);
    }
  }
  const visit = Effect.fn("Inventory.visit")(function* (
    location: string,
    ancestors: ReadonlySet<string>,
    depth: number,
  ): Effect.fn.Return<
    void,
    LabError,
    Disk | Path.Path | import("./services.js").Hashing
  > {
    if (depth > 6) return;
    const inspected = yield* Effect.gen(function* () {
      const physical = yield* disk.realPath(location);
      if (excludeProvider(location, physical) || ancestors.has(physical))
        return;
      const info = yield* disk.info(physical);
      if (info?.kind !== "directory") return;
      const entries = yield* disk.list(location);
      if (!entries.includes("SKILL.md")) {
        const next = new Set([...ancestors, physical]);
        for (const entry of entries)
          if (
            (!entry.startsWith(".") || entry === ".system") &&
            entry !== "node_modules"
          )
            yield* visit(path.join(location, entry), next, depth + 1);
        return;
      }
      let fields = { name: "", description: "" };
      const descriptionFile = path.join(location, "SKILL.md");
      const resolvedDescription = yield* disk
        .realPath(descriptionFile)
        .pipe(
          Effect.catchTag("LabError", () => Effect.succeed(descriptionFile)),
        );
      if (excludeProvider(descriptionFile, resolvedDescription)) return;
      yield* disk.read(descriptionFile).pipe(
        Effect.map((bytes) => {
          fields = frontmatter(new TextDecoder().decode(bytes));
        }),
        Effect.catchTag("LabError", () => Effect.void),
      );
      const name = fields.name || path.basename(location);
      const skill = model.skills[name] ?? {
        name,
        description: "",
        descriptionSource: "",
        dependencies: [],
        copies: [],
        target: "",
        blocked: "",
        external: false,
        catalog: false,
      };
      model.skills[name] = skill;
      if (!skill.description && fields.description) {
        skill.description = fields.description;
        skill.descriptionSource = descriptionFile;
      }
      const owner = owners.get(physical);
      const copy: Copy = {
        path: location,
        physical,
        status: "unknown",
        missing: [],
        extra: [],
        changed: [],
        problem: "",
        owned: Boolean(owner),
        edited: false,
        current: owner?.source.content_sha256 ?? "local",
      };
      skill.copies.push(copy);
      yield* inventory(physical).pipe(
        Effect.map((tree) => {
          const target = expected.get(name);
          if (target)
            Object.assign(
              copy,
              compareFiles(tree.files, target.tree.files, target.notices),
            );
          copy.edited = Boolean(owner && !equal(tree, owner.tree));
        }),
        Effect.catchTag("LabError", (error) => {
          copy.problem = error.message;
          return Effect.void;
        }),
      );
    }).pipe(
      Effect.catchTag("LabError", (error) => {
        if (depth) model.diagnostics.push(`${location}: ${error.message}`);
        return Effect.void;
      }),
    );
    return inspected;
  });
  const owners = new Map<string, Owned>();
  for (const [id, owner] of Object.entries(ownership.installations)) {
    const [target, name] = id.split("/");
    if (!Targets.some((value) => value === target) || !name) continue;
    const targetRoot = Object.entries(roots).find(
      ([key]) => key === target,
    )?.[1];
    if (!targetRoot) continue;
    const location = path.join(options.home, targetRoot, name);
    const physical = yield* disk
      .realPath(location)
      .pipe(Effect.catchTag("LabError", () => Effect.succeed(location)));
    if (excludeProvider(location, physical)) continue;
    owners.set(physical, owner);
    // Missing owned skills still participate in the inventory and can be restored.
    if (!model.skills[name])
      model.skills[name] = {
        name,
        description: "",
        descriptionSource: "",
        dependencies: [],
        copies: [],
        target: "",
        blocked: "No catalog source",
        external: false,
        catalog: false,
      };
  }
  for (const relative of Object.values(roots)) {
    const location = path.join(options.home, relative);
    if (yield* disk.info(location)) yield* visit(location, new Set(), 0);
  }
  return model;
});

export function membership(
  model: InventoryModel,
  profile: Profile,
  original = false,
) {
  const direct = (original ? model.original : model.draft)[profile];
  const found = new Map<string, { direct: boolean; requiredBy: string[] }>();
  const visit = (name: string, parent?: string) => {
    const prior = found.get(name);
    if (prior) {
      if (parent && !prior.requiredBy.includes(parent))
        prior.requiredBy.push(parent);
      return;
    }
    found.set(name, {
      direct: direct.includes(name),
      requiredBy: parent ? [parent] : [],
    });
    for (const child of model.skills[name]?.dependencies ?? [])
      visit(child, name);
  };
  for (const name of direct) visit(name);
  return found;
}
export function adoptable(skill: InventorySkill) {
  return (
    skill.catalog &&
    !skill.blocked &&
    !skill.external &&
    skill.copies.length > 0 &&
    skill.copies.every(
      (copy) => !copy.owned && ["match", "packaging"].includes(copy.status),
    )
  );
}
/** Explain the same conservative enablement rules used by the dry-run toggle. */
export function enablementPreview(
  model: InventoryModel,
  name: string,
  profile: Profile = model.activeProfile ?? "client",
) {
  const skill = model.skills[name];
  if (skill?.external)
    return [
      `If enabled: record [${profile}] membership only. Files remain externally managed.`,
      "No install, adoption, update, removal or ownership changes are proposed for this skill.",
      ...(skill.copies.length
        ? [
            "Detected provider copies: " +
              skill.copies.map((copy) => copy.path).join(", "),
          ]
        : [
            "No installed copy detected. Profile membership does not install the external skill or its CLI.",
          ]),
      "Dry run only. Profile changes stay in memory.",
    ];
  if (
    !skill ||
    !skill.catalog ||
    skill.external ||
    skill.blocked ||
    !skill.target
  )
    return [
      "Cannot enable: " +
        (skill?.blocked ||
          (skill?.external
            ? "externally managed"
            : "no prepared catalog source")) +
        ". No changes proposed.",
    ];
  if (skill.copies.some((copy) => !copy.owned) && !adoptable(skill)) {
    const copies = [
      ...new Map(skill.copies.map((copy) => [copy.physical, copy])).values(),
    ];
    const counts = ["changed", "extra", "missing"] as const;
    const differences = counts
      .map((kind) => ({
        kind,
        count: copies.reduce((total, copy) => total + copy[kind].length, 0),
      }))
      .filter((item) => item.count)
      .map(
        (item) =>
          `${item.count} ${item.kind} file${item.count === 1 ? "" : "s"}`,
      )
      .join(", ");
    return [
      `Cannot enable: copies differ or are unverified${differences ? " (" + differences + ")" : ""}. Press d; preserve existing files.`,
      ...(copies.every((copy) => copy.changed.length === 0 && !copy.problem)
        ? [
            "Existing file contents match where present; extra or missing files still prevent adoption.",
          ]
        : []),
      "Missing notices alone allow adoption. Extra files, changed files, mixed ownership or incomplete comparisons require a separate decision.",
      "No replacement, deletion or adoption is proposed for this skill.",
    ];
  }
  if (skill.copies.some((copy) => copy.edited))
    return [
      "Local edits block file changes. Enabling changes membership only; review reports the blocker.",
    ];
  if (profile === "home-lab")
    return [
      "If enabled: record home-lab membership only. No remote file operations are proposed.",
      "Home-lab inventory has not been inspected.",
    ];
  const copies = [
    ...new Map(skill.copies.map((copy) => [copy.physical, copy])).values(),
  ];
  const notices = copies.reduce(
    (count, copy) => count + copy.missing.length,
    0,
  );
  const result = adoptable(skill)
    ? [
        `If enabled: adopt existing files${notices ? ` + add ${notices} license/notice file${notices === 1 ? "" : "s"}` : ""}; preserve existing content.`,
        "Record lab-skills ownership of the verified physical copies. Existing instructions, scripts and metadata are not replaced or deleted.",
        ...copies.flatMap((copy) => [
          `Adopt existing: ${copy.path}`,
          ...copy.missing.map(
            (file) => `Add license/notice: ${copy.path}/${file}`,
          ),
          ...(skill.copies.filter((alias) => alias.physical === copy.physical)
            .length > 1
            ? [
                "Shared aliases: " +
                  skill.copies
                    .filter((alias) => alias.physical === copy.physical)
                    .map((alias) => alias.path)
                    .join(", "),
              ]
            : []),
        ]),
      ]
    : !copies.length
      ? [
          "If enabled: add the prepared catalog files to the shared agents destination.",
        ]
      : copies.some((copy) => copy.status !== "match")
        ? [
            "If enabled: review an update of owned files to the prepared catalog.",
          ]
        : [
            "If enabled: record profile membership only. Owned files already match the catalog.",
          ];
  if (skill.dependencies.length)
    result.push(
      "Also requires: " +
        skill.dependencies.join(", ") +
        ". Review resolves their own adoption, install and update proposals.",
    );
  if (copies.length > 1 && !adoptable(skill))
    result.push(
      "Multiple physical copies require consolidation before file updates.",
    );
  result.push(
    "Dry run only. These are proposals; no files or ownership records change.",
  );
  return result;
}
export function toggleMembership(
  model: InventoryModel,
  name: string,
  profile: Profile,
) {
  const skill = model.skills[name],
    entry = membership(model, profile).get(name);
  if (!skill) return "No available catalog source.";
  if (!skill.external) {
    if (!skill.catalog || skill.blocked || !skill.target)
      return skill.blocked || "No available catalog source.";
    if (skill.copies.some((copy) => !copy.owned) && !adoptable(skill))
      return (
        enablementPreview(model, name, profile)[0] ??
        "Cannot enable: comparison unavailable."
      );
  }
  if (entry && !entry.direct)
    return `Required by ${entry.requiredBy.join(", ")}. Disable the dependent skill first.`;
  const before = model.draft[profile];
  model.draft[profile] = entry
    ? before.filter((item) => item !== name)
    : [...before, name];
  if (entry && membership(model, profile).has(name)) {
    model.draft[profile] = before;
    return "Still required by another enabled skill.";
  }
  return `${entry ? "Disabled" : "Enabled"} ${name} in [${profile}] draft.`;
}
// Public labels describe the differences; internal comparison codes retain adoption rules.
export function comparisonLabel(copy: Copy) {
  if (copy.status === "packaging") return "missing notices";
  if (copy.status !== "changed") return copy.status;
  if (copy.changed.length) return "changed content";
  if (copy.extra.length) return "extra files";
  return "missing files";
}
export function inventoryRows(model: InventoryModel) {
  const wanted = membership(model, model.activeProfile ?? "client"),
    original = membership(model, model.activeProfile ?? "client", true);
  return Object.values(model.skills)
    .map((skill) => {
      const entry = wanted.get(skill.name),
        owned = skill.copies.some((copy) => copy.owned);
      const enabled = Boolean(entry),
        added = enabled && !original.has(skill.name);
      const removed = !enabled && original.has(skill.name);
      const profiles = (["client", "home-lab"] as const).filter((profile) =>
        membership(model, profile).has(skill.name),
      );
      const addedProfiles = profiles.filter(
        (profile) => !membership(model, profile, true).has(skill.name),
      );
      const statuses = new Set(skill.copies.map((copy) => copy.status));
      const comparison = !skill.catalog
        ? "no catalog"
        : statuses.size > 1
          ? "mixed"
          : (skill.copies[0]?.status ?? "unknown");
      const labels = new Set(skill.copies.map(comparisonLabel));
      const comparisonStatus = labels.has("unknown")
        ? "unknown"
        : labels.has("changed content")
          ? "changed content"
          : labels.has("extra files")
            ? "extra files"
            : labels.has("missing files")
              ? "missing files"
              : labels.size > 1
                ? "mixed"
                : ([...labels][0] ?? "unknown");
      const available =
        skill.catalog &&
        !skill.blocked &&
        !skill.external &&
        Boolean(skill.target) &&
        (!skill.copies.length ||
          (owned && skill.copies.every((copy) => copy.owned)) ||
          adoptable(skill));
      const action = skill.external
        ? "external"
        : skill.copies.some((copy) => copy.edited)
          ? "review"
          : skill.blocked
            ? "blocked"
            : !owned && skill.copies.length
              ? enabled && adoptable(skill)
                ? "adopt"
                : comparison
              : removed && owned
                ? "remove"
                : !skill.copies.length
                  ? "add"
                  : enabled &&
                      skill.copies.some((copy) => copy.status !== "match")
                    ? "update"
                    : "";
      const status = skill.external
        ? "external"
        : skill.copies.some((copy) => copy.edited)
          ? "local edits"
          : skill.blocked
            ? "blocked"
            : !skill.catalog
              ? "no catalog"
              : !skill.copies.length
                ? enabled
                  ? "missing"
                  : "available"
                : owned && comparison === "match"
                  ? "current"
                  : owned && comparison === "changed"
                    ? "outdated"
                    : comparisonStatus;
      const proposed =
        action === "remove" ||
        (enabled && ["add", "adopt", "update"].includes(action))
          ? action
          : "";
      const rank =
        enabled && !added
          ? 0
          : enabled || addedProfiles.length
            ? 1
            : removed
              ? 2
              : 3;
      const current = skill.copies.length
        ? skill.copies.every((copy) => !copy.owned)
          ? "local"
          : new Set(skill.copies.map((copy) => copy.current)).size > 1
            ? "mixed"
            : (skill.copies[0]?.current.slice(0, 7) ?? "-")
        : "-";
      return {
        ...skill,
        enabled,
        direct: entry?.direct ?? false,
        profiles,
        addedProfiles,
        available,
        action,
        status,
        proposed,
        rank,
        current,
        pending:
          added ||
          removed ||
          (enabled && ["adopt", "add", "update"].includes(action)) ||
          addedProfiles.length > 0,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}
export function buildInventoryReview(model: InventoryModel) {
  const profileChanges: Array<{
    action: "Enable" | "Disable";
    name: string;
    profile: Profile;
    external: boolean;
  }> = [];
  const dependencyChanges: Array<{
    action: "Require" | "Release";
    name: string;
    profile: Profile;
    requiredBy: string[];
  }> = [];
  for (const profile of ["client", "home-lab"] as const) {
    const before = membership(model, profile, true),
      after = membership(model, profile);
    for (const name of model.draft[profile]
      .filter((name) => !model.original[profile].includes(name))
      .sort()) {
      profileChanges.push({
        action: "Enable",
        name,
        profile,
        external: Boolean(model.skills[name]?.external),
      });
    }
    for (const name of model.original[profile]
      .filter((name) => !model.draft[profile].includes(name))
      .sort()) {
      profileChanges.push({
        action: "Disable",
        name,
        profile,
        external: Boolean(model.skills[name]?.external),
      });
    }
    for (const [name, entry] of [...after.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!before.has(name) && !entry.direct)
        dependencyChanges.push({
          action: "Require",
          name,
          profile,
          requiredBy: entry.requiredBy,
        });
    }
    for (const [name, entry] of [...before.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!after.has(name) && !entry.direct)
        dependencyChanges.push({
          action: "Release",
          name,
          profile,
          requiredBy: entry.requiredBy,
        });
    }
  }
  const groups = {
    adopt: [] as string[],
    add: [] as string[],
    update: [] as string[],
    remove: [] as string[],
  };
  const counts = { adopt: 0, add: 0, update: 0, remove: 0 };
  const operations: Array<{
    action: "adopt" | "add" | "update" | "remove";
    name: string;
    existingMember: boolean;
  }> = [];
  const noticeChanges: Array<{ name: string; path: string }> = [];
  const notices: string[] = [],
    blockers: string[] = [];
  for (const row of inventoryRows(model).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    // Membership never grants file authority over externally managed skills.
    if (row.external || (!row.enabled && row.action !== "remove")) continue;
    if (!row.available || row.action === "review") {
      blockers.push(
        `Blocked ${row.name}: ${row.blocked || enablementPreview(model, row.name)[0] || "Installed files need comparison."}`,
      );
      continue;
    }
    const action = row.action;
    if (
      action !== "adopt" &&
      action !== "add" &&
      action !== "update" &&
      action !== "remove"
    )
      continue;
    const copies = [
      ...new Map(row.copies.map((copy) => [copy.physical, copy])).values(),
    ];
    if ((action === "update" || action === "remove") && copies.length > 1) {
      blockers.push(
        `Blocked ${row.name}: multiple physical copies require consolidation before ${action}.`,
      );
      continue;
    }
    counts[action]++;
    operations.push({
      action,
      name: row.name,
      existingMember: membership(
        model,
        model.activeProfile ?? "client",
        true,
      ).has(row.name),
    });
    const lines = groups[action];
    lines.push(`${action} ${row.name}`);
    if (action === "adopt")
      lines.push(
        "  Record lab-skills ownership; preserve all existing skill files.",
      );
    for (const copy of copies) {
      lines.push(`  Existing: ${copy.physical}`);
      const aliases = row.copies
        .filter((alias) => alias.physical === copy.physical)
        .map((alias) => alias.path);
      if (aliases.length > 1)
        lines.push("  Shared aliases: " + aliases.join(", "));
      if (action === "adopt")
        for (const missing of copy.missing) {
          const path = `${copy.physical}/${missing}`;
          notices.push(`Add license/notice: ${path}`);
          noticeChanges.push({ name: row.name, path });
        }
    }
    if (action === "add")
      lines.push(`  Destination: ${model.home}/.agents/skills/${row.name}`);
  }
  const externalEdits = Object.values(model.skills).filter(
    (skill) =>
      skill.external &&
      (["client", "home-lab"] as const).some(
        (profile) =>
          model.draft[profile].includes(skill.name) !==
          model.original[profile].includes(skill.name),
      ),
  );
  return {
    profileChanges,
    dependencyChanges,
    operations,
    noticeChanges,
    counts,
    groups,
    notices,
    blockers,
    externalEdits,
    persistence: [] as string[],
  };
}
export type InventoryReview = ReturnType<typeof buildInventoryReview>;

export function reviewInventory(model: InventoryModel) {
  const {
    profileChanges,
    dependencyChanges,
    counts,
    groups,
    notices,
    blockers,
    externalEdits,
  } = buildInventoryReview(model);
  const profileLines = profileChanges.map(
    (change) =>
      `${change.action} ${change.name} in [${change.profile}]${change.external ? " (external; membership only)" : ""}`,
  );
  const dependencyLines = dependencyChanges.map((change) =>
    change.action === "Require"
      ? `Require ${change.name} in [${change.profile}] (via ${change.requiredBy.join(", ")})`
      : `Release ${change.name} from [${change.profile}] (no longer required)`,
  );
  const label = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;
  const lines = [
    [
      label(profileChanges.length, "profile edit"),
      label(counts.adopt, "adoption"),
      label(counts.add, "install"),
      label(notices.length, "notice file"),
      label(blockers.length, "blocker"),
    ].join(" | "),
    "",
    `Draft profile membership (${profileChanges.length})`,
    ...(profileLines.length
      ? profileLines
      : ["No explicit membership changes."]),
    ...(dependencyChanges.length
      ? [
          "",
          `Required dependencies (${dependencyChanges.length})`,
          ...dependencyLines,
        ]
      : []),
    ...(externalEdits.length
      ? [
          "External membership only: " +
            externalEdits.map((skill) => skill.name).join(", ") +
            ". Provider files and ownership remain unchanged.",
        ]
      : []),
    "",
    "Files and ownership on this Mac",
  ];
  if (!counts.adopt && !counts.add && !counts.update && !counts.remove)
    lines.push("No file or ownership changes proposed.");
  if (counts.adopt)
    lines.push("", `Adopt existing (${counts.adopt})`, ...groups.adopt);
  if (notices.length)
    lines.push(
      "",
      `Add notices (${label(notices.length, "file")})`,
      ...notices,
    );
  if (counts.add)
    lines.push("", `Install missing (${counts.add})`, ...groups.add);
  if (counts.update)
    lines.push("", `Update owned (${counts.update})`, ...groups.update);
  if (counts.remove)
    lines.push("", `Remove owned (${counts.remove})`, ...groups.remove);
  lines.push(
    "",
    `Blockers (${blockers.length})`,
    ...(blockers.length ? blockers : ["None."]),
  );
  return [
    ...lines,
    "",
    "Home-lab edits are membership only; remote files were not inspected.",
    "Owned skills outside the original local selection are retained.",
    ...(blockers.length
      ? ["Membership above is a draft; blockers are unresolved."]
      : []),
    "Dry run only. No files, ownership records or configuration will change.",
  ];
}
