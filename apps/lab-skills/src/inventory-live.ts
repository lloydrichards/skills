import { Effect, Path } from "effect";
import { apply } from "./apply.js";
import { validate } from "./catalog.js";
import { configure, type Flags, type Environment } from "./config.js";
import { inventory, noLinks } from "./files.js";
import {
  buildInventoryReview,
  collectInventory,
  membership,
  type InventoryModel,
} from "./inventory.js";
import { plan, reviewFingerprint, type Options } from "./plan.js";
import { Disk, bytes, canonical } from "./services.js";
import { problem } from "./error.js";
import type { Tree } from "./model.js";

/** The same preparation supplies the UI and the authority checked by apply. */
export const prepareInventory = Effect.fn("Inventory.prepare")(function* (
  model: InventoryModel,
  flags: Flags,
  environment: Environment,
) {
  const path = yield* Path.Path;
  const catalog = yield* validate(model.root);
  if (model.catalogSnapshot && model.catalogSnapshot !== canonical(catalog))
    return yield* problem(
      "SOURCE_CHANGED",
      "Catalog changed. Reopen the inventory before saving or applying.",
      3,
    );
  const configured = yield* configure(
    { ...flags, command: "status" },
    environment,
  );
  const active = model.activeProfile ?? "client";
  const review = buildInventoryReview(model);
  const configuredProfile = flags.profiles ?? configured.config.profiles;
  if (
    !flags.dryRun &&
    (configuredProfile?.length !== 1 || configuredProfile[0] !== active)
  )
    review.blockers.push(
      "Choose this machine's profile explicitly with --profile client or --profile home-lab before the first live save.",
    );
  review.persistence = [
    `Shared profiles: ${model.root}/manifest.json`,
    ...(["client", "home-lab"] as const).map(
      (profile) =>
        `[${profile}] ${model.draft[profile].join(", ") || "(empty)"}; required: ${
          [...membership(model, profile)]
            .filter(([, entry]) => !entry.direct)
            .map(([name]) => name)
            .join(", ") || "none"
        }`,
    ),
    `Machine config: ${configured.configExists ? "update" : "create"} ${configured.configPath}`,
    `Home: ${model.home}; profile: ${active}; destination: ${model.home}/.agents/skills`,
    "Only this machine's files are applied. Other installed skills outside the previous selection are retained.",
  ];
  const adopt: Record<string, Tree> = {};
  const remove: string[] = [];
  for (const operation of review.operations) {
    const destination = path.join(model.home, ".agents/skills", operation.name);
    if (operation.action === "adopt") {
      const copies = model.skills[operation.name]?.copies ?? [];
      if (
        copies.some((copy) => copy.physical !== destination) ||
        !copies.some(
          (copy) => copy.path === destination && copy.physical === destination,
        )
      ) {
        review.blockers.push(
          `Blocked ${operation.name}: adoption requires a single physical copy at ${destination}. Consolidate other copies separately.`,
        );
        continue;
      }
      adopt["agents/" + operation.name] = yield* inventory(destination);
    }
    if (operation.action === "remove") remove.push("agents/" + operation.name);
  }
  const options: Options = {
    home: model.home,
    selection: {
      profiles: [],
      skills: [...membership(model, active).keys()].filter(
        (name) => !model.skills[name]?.external,
      ),
      targets: ["agents"],
    },
    ...(configured.archiveDir ? { archiveDir: configured.archiveDir } : {}),
    adopt,
    remove,
    repairMissing: review.operations
      .filter((operation) => operation.action === "add")
      .map((operation) => "agents/" + operation.name),
  };
  const planned = yield* plan(model.root, catalog, options);
  for (const job of planned.jobs) {
    const name = job.id.slice(job.id.indexOf("/") + 1);
    if (!job.remove && model.skills[name]?.target !== job.source.content_sha256)
      return yield* problem(
        "SOURCE_CHANGED",
        "Source payload changed since inventory collection. Reopen inventory.",
        3,
        name,
      );
  }
  for (const entry of planned.entries) {
    const action = entry.status === "new" ? "add" : entry.status;
    if (["add", "adopt", "update", "remove"].includes(action)) {
      const name = entry.id.slice(entry.id.indexOf("/") + 1);
      if (
        !review.operations.some(
          (operation) => operation.name === name && operation.action === action,
        )
      )
        return yield* problem(
          "SOURCE_CHANGED",
          "File operations differ from the inventory proposal. Reopen inventory and inspect the destination.",
          3,
          entry.path,
        );
    }
  }
  for (const diagnostic of planned.diagnostics)
    if (diagnostic.severity === "error")
      review.blockers.push(
        `${diagnostic.code}: ${diagnostic.message}${diagnostic.path ? ` (${diagnostic.path})` : ""}`,
      );
  review.blockers = [...new Set(review.blockers)];
  const fingerprint = reviewFingerprint(
    model.home,
    options.selection,
    planned.entries,
    planned.diagnostics,
  );
  const token = canonical({
    catalog,
    options,
    fingerprint,
    config: configured.config,
    configPath: configured.configPath,
    configExists: configured.configExists,
    draft: model.draft,
    active,
  });
  return { review, catalog, configured, options, fingerprint, token };
});
export type PreparedInventory = Effect.Success<
  ReturnType<typeof prepareInventory>
>;

export const applyInventory = Effect.fn("Inventory.saveAndApply")(function* (
  model: InventoryModel,
  flags: Flags,
  environment: Environment,
  reviewed: PreparedInventory,
) {
  if (flags.dryRun)
    return yield* problem(
      "ARGUMENT_INVALID",
      "Dry run: saving and applying are disabled.",
      2,
    );
  const fresh = yield* collectInventory(model.root, flags, environment);
  fresh.draft = {
    client: [...model.draft.client],
    "home-lab": [...model.draft["home-lab"]],
  };
  const current = yield* prepareInventory(fresh, flags, environment);
  if (reviewed.token !== current.token)
    return yield* problem(
      "SOURCE_CHANGED",
      "The reviewed changes are stale. Return to inventory and review again.",
      3,
    );
  if (current.review.blockers.length)
    return yield* problem(
      "LOCAL_EDIT",
      "Resolve all blockers before saving and applying.",
      3,
    );
  const disk = yield* Disk,
    path = yield* Path.Path;
  const manifestPath = path.join(model.root, "manifest.json");
  const lock = path.join(model.root, ".lab-skills-profiles.lock");
  yield* noLinks(lock);
  return yield* Effect.acquireUseRelease(
    disk
      .write(lock, bytes({ home: model.home }), false, true)
      .pipe(
        Effect.mapError((e) =>
          e.code === "UNOWNED_DESTINATION"
            ? problem(
                "INTERRUPTED_OPERATION",
                "A profile-save lock exists. Check for an active save before recovering the lock.",
                3,
                lock,
              )
            : e,
        ),
      ),
    () =>
      Effect.gen(function* () {
        // Recheck after acquiring the profile lock; installer apply also rechecks under its own lock.
        const locked = yield* prepareInventory(fresh, flags, environment);
        if (locked.token !== current.token)
          return yield* problem(
            "SOURCE_CHANGED",
            "Profile or configuration changed before apply.",
            3,
          );
        yield* noLinks(manifestPath);
        yield* noLinks(current.configured.configPath);
        const result = yield* apply(
          model.root,
          current.catalog,
          current.options,
          current.fingerprint,
        );
        if (
          result.entries.some((entry) => entry.status === "conflict") ||
          result.diagnostics.some((d) => d.severity === "error")
        )
          return yield* problem(
            "SOURCE_CHANGED",
            "Installer refused the refreshed plan. Profiles were not saved.",
            3,
          );
        let profilesSaved = false;
        // File state, shared profiles and machine configuration commit separately.
        yield* Effect.gen(function* () {
          const afterFiles = yield* configure(
            { ...flags, command: "status" },
            environment,
          );
          if (
            canonical(afterFiles) !== canonical(current.configured) ||
            canonical(yield* validate(model.root)) !==
              canonical(current.catalog)
          )
            return yield* problem(
              "SOURCE_CHANGED",
              "Profiles/configuration changed during apply. Metadata was not overwritten.",
              3,
            );
          const manifest = {
            ...current.catalog.manifest,
            profiles: {
              client: [...model.draft.client].sort(),
              "home-lab": [...model.draft["home-lab"]].sort(),
            },
          };
          const config = {
            ...current.configured.config,
            schema: 1,
            home: model.home,
            profiles: [model.activeProfile ?? "client"],
            skills: [],
            targets: ["agents"],
          };
          yield* noLinks(manifestPath);
          yield* disk.atomic(manifestPath, bytes(manifest));
          profilesSaved = true;
          yield* noLinks(current.configured.configPath);
          yield* disk.mkdir(path.dirname(current.configured.configPath), true);
          yield* noLinks(current.configured.configPath);
          yield* disk.atomic(current.configured.configPath, bytes(config));
        }).pipe(
          Effect.mapError((e) =>
            problem(
              e.code,
              `${profilesSaved ? "Files and shared profiles were saved, but machine configuration failed" : "File transaction completed, but shared profiles could not be saved"}: ${e.message}. Reopen with --profile ${model.activeProfile ?? "client"} before retrying.`,
              e.exitCode,
              e.path,
            ),
          ),
        );
        return result;
      }),
    () => disk.remove(lock),
  ).pipe(Effect.uninterruptible);
});
