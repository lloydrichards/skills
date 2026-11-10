import { Effect, Exit, Path } from "effect";
import { type Catalog, validate } from "./catalog.js";
import {
  type Job,
  type Options,
  type Plan,
  plan,
  reviewFingerprint,
} from "./plan.js";
import {
  Archives,
  Disk,
  Hashing,
  HttpBytes,
  OwnershipState,
  bytes,
  equal,
} from "./services.js";
import { inventory, noLinks, relative, writeJSON } from "./files.js";
import {
  type Journal,
  type JournalItem,
  type Owned,
  type State,
} from "./model.js";
import { problem } from "./error.js";

const fetchPayload = Effect.fn("Apply.fetchPayload")(function* (
  catalog: Catalog,
  job: Job,
  options: Options,
) {
  const disk = yield* Disk,
    path = yield* Path.Path,
    hash = yield* Hashing;
  const payload: Record<string, Uint8Array> = {};
  if (job.local) {
    for (const file of Object.keys(job.tree.files)) {
      const notice =
        job.notices && Object.hasOwn(job.notices, file)
          ? job.notices[file]
          : undefined;
      payload[file] = yield* disk.read(notice ?? path.join(job.local, file));
    }
  } else if ("locked" in job.payload) {
    const source = catalog.lock.sources[job.payload.locked];
    if (!source)
      return yield* problem("MANIFEST_INVALID", "Missing source lock", 2);
    const filename =
      source.repository.replace("/", "_") + "_" + source.commit + ".tar.gz";
    const archive = options.archiveDir
      ? yield* disk.read(path.join(options.archiveDir, filename))
      : yield* (yield* HttpBytes).get(
          "https://codeload.github.com/" +
            source.repository +
            "/tar.gz/" +
            source.commit,
        );
    if (archive.length > 64 * 1024 * 1024)
      return yield* problem("DOWNLOAD_FAILED", "Archive exceeds 64 MiB", 1);
    const files = yield* (yield* Archives).unpack(archive);
    for (const file of files) {
      const slash = file.path.indexOf("/");
      if (slash < 0) continue;
      const upstreamPath = file.path.slice(slash + 1);
      const destinations = new Set<string>();
      if (upstreamPath.startsWith(source.path + "/"))
        destinations.add(upstreamPath.slice(source.path.length + 1));
      for (const [destination, original] of Object.entries(
        source.license_files,
      ))
        if (original === upstreamPath) destinations.add(destination);
      for (const destination of destinations) {
        if (!Object.hasOwn(source.files, destination)) continue;
        yield* relative(destination);
        if (file.kind !== "file" || Object.hasOwn(payload, destination))
          return yield* problem(
            "HASH_MISMATCH",
            "Repeated or non-regular locked archive entry",
            1,
            destination,
          );

        payload[destination] = file.bytes;
      }
    }
  }
  if (!equal(Object.keys(payload).sort(), Object.keys(job.tree.files).sort()))
    return yield* problem(
      "HASH_MISMATCH",
      "Payload file set differs from lock",
      1,
      job.destination,
    );

  for (const [file, data] of Object.entries(payload)) {
    if ((yield* hash.sha256(data)) !== job.tree.files[file]?.sha256)
      return yield* problem(
        job.local ? "SOURCE_CHANGED" : "HASH_MISMATCH",
        "Payload hash differs from reviewed source",
        job.local ? 3 : 1,
        file,
      );
  }
  return payload;
});

const assertClear = (value: Plan) =>
  value.diagnostics.some((d) => d.severity === "error") ||
  value.entries.some((e) => e.status === "conflict");
const fingerprint = (value: Plan) => ({
  entries: value.entries.map(({ source, ...entry }) => ({
    ...entry,
    source: source ? { ...source, git: undefined } : undefined,
  })),
  diagnostics: value.diagnostics,
  state: value.state,
  jobs: value.jobs.map(({ source, ...job }) => ({
    ...job,
    source: { ...source, git: undefined },
  })),
});

export const apply = Effect.fn("Apply.run")(function* (
  root: string,
  catalog: Catalog,
  options: Options,
  reviewed?: string,
) {
  const disk = yield* Disk,
    path = yield* Path.Path,
    store = yield* OwnershipState;
  const initial = yield* plan(root, catalog, options);
  if (
    reviewed !== undefined &&
    reviewed !==
      reviewFingerprint(
        options.home,
        options.selection,
        initial.entries,
        initial.diagnostics,
      )
  )
    return yield* problem(
      "SOURCE_CHANGED",
      "The reviewed plan changed. Review a fresh plan before installing.",
      3,
    );
  if (assertClear(initial)) return initial;
  const changes = initial.jobs.filter((job) =>
    initial.entries.some(
      (entry) =>
        entry.id === job.id && ["new", "update"].includes(entry.status),
    ),
  );
  if (!changes.length) return initial;
  const payloads = new Map<string, Record<string, Uint8Array>>();
  for (const job of changes)
    payloads.set(job.id, yield* fetchPayload(catalog, job, options));
  const location = initial.location;
  // The mutating region is uninterruptible by Effect. SIGKILL/power loss still needs the journal.
  return yield* Effect.gen(function* () {
    yield* noLinks(location.state);
    yield* disk.mkdir(path.dirname(location.state), true);
    yield* disk
      .write(
        location.lock,
        bytes({
          schema: 1,
          checkout: root,
          home: options.home,
          journal: location.journal,
        }),
        false,
        true,
      )
      .pipe(
        Effect.mapError((e) =>
          e.code === "UNOWNED_DESTINATION"
            ? problem(
                "INTERRUPTED_OPERATION",
                "Another apply holds the lock",
                3,
                location.lock,
              )
            : e,
        ),
      );
    const staged: string[] = [],
      installed: JournalItem[] = [],
      backedUp: JournalItem[] = [],
      reserved: JournalItem[] = [];
    let committedState = false,
      rollbackFailed = false,
      journalWritten = false,
      commitUncertain = false;
    const transaction = Effect.gen(function* () {
      const currentCatalog = yield* validate(root);
      if (!equal(catalog, currentCatalog))
        return yield* problem(
          "SOURCE_CHANGED",
          "Manifest or lock changed during fetch",
          3,
        );

      const recheck = yield* plan(root, currentCatalog, options, true);
      if (
        assertClear(recheck) ||
        !equal(fingerprint(initial), fingerprint(recheck))
      )
        return yield* problem(
          "SOURCE_CHANGED",
          "Source or installation changed after fetch",
          3,
        );

      const items: JournalItem[] = [];
      const records: Record<string, Owned> = { ...initial.state.installations };
      const token = yield* disk.unique;
      for (const job of changes) {
        const parent = path.dirname(job.destination);
        yield* noLinks(job.destination);
        yield* disk.mkdir(parent, true);
        const stage = path.join(
          parent,
          ".lab-skills-stage-" + token + "-" + path.basename(job.destination),
        );
        const backup = path.join(
          parent,
          ".lab-skills-backup-" + token + "-" + path.basename(job.destination),
        );
        yield* disk.mkdir(stage, false);
        staged.push(stage);
        yield* disk.chmod(stage, job.tree.rootMode);
        for (const dir of job.tree.directories) {
          yield* disk.mkdir(path.join(stage, dir), true);
          yield* disk.chmod(
            path.join(stage, dir),
            job.tree.directoryModes[dir] ?? 0o755,
          );
        }
        const payload = payloads.get(job.id);
        if (!payload)
          return yield* problem("APPLY_FAILED", "Prepared payload missing", 1);
        for (const [file, data] of Object.entries(payload)) {
          const meta = job.tree.files[file];
          if (!meta)
            return yield* problem(
              "APPLY_FAILED",
              "Prepared file metadata missing",
              1,
            );
          yield* disk.write(
            path.join(stage, file),
            data,
            meta.executable,
            true,
          );
        }
        if (!equal(yield* inventory(stage), job.tree))
          return yield* problem(
            "HASH_MISMATCH",
            "Staged payload differs from plan",
            1,
            stage,
          );

        const next = { tree: job.tree, source: job.source },
          old = initial.state.installations[job.id];
        items.push({
          id: job.id,
          destination: job.destination,
          stage,
          backup,
          next,
          ...(old ? { old } : {}),
        });
        records[job.id] = next;
      }
      const finalCatalog = yield* validate(root);
      if (!equal(catalog, finalCatalog))
        return yield* problem(
          "SOURCE_CHANGED",
          "Source definitions changed during staging",
          3,
        );

      const finalPlan = yield* plan(
        root,
        finalCatalog,
        options,
        true,
        new Set(staged),
      );
      if (
        assertClear(finalPlan) ||
        !equal(fingerprint(initial), fingerprint(finalPlan))
      )
        return yield* problem(
          "SOURCE_CHANGED",
          "Source or installation changed during staging",
          3,
        );

      const nextState: State = {
        schema: 2,
        owner: "lloydrichards/lab-skills",
        installations: records,
      };
      const journal: Journal = {
        schema: 1,
        phase: "prepared",
        previousState: initial.state,
        nextState,
        items,
      };
      journalWritten = true;
      yield* writeJSON(location.journal, journal);
      for (const item of items) {
        yield* noLinks(item.destination);
        if (item.old) {
          if (!equal(yield* inventory(item.destination), item.old.tree))
            return yield* problem(
              "LOCAL_EDIT",
              "Installation changed immediately before replacement",
              3,
              item.destination,
            );

          if (yield* disk.info(item.backup))
            return yield* problem(
              "INTERRUPTED_OPERATION",
              "Backup destination already exists",
              3,
              item.backup,
            );

          yield* disk.rename(item.destination, item.backup);
          backedUp.push(item);
        } else {
          // Exclusive directory creation refuses even a concurrently created empty foreign directory.
          yield* disk.mkdir(item.destination, false);
          reserved.push(item);
        }
        const renamed = yield* disk
          .rename(item.stage, item.destination)
          .pipe(Effect.result);
        if (renamed._tag === "Failure") {
          return yield* renamed.failure;
        }
        installed.push(item);
      }
      yield* writeJSON(location.journal, {
        ...journal,
        phase: "destinations-installed",
      });
      const stateWrite = yield* store
        .write(location.state, nextState)
        .pipe(Effect.exit);
      if (Exit.isFailure(stateWrite)) {
        const persisted = yield* noLinks(location.state).pipe(
          Effect.flatMap(() => store.read(location.state)),
          Effect.result,
        );
        if (persisted._tag === "Success" && equal(persisted.success, nextState))
          committedState = true;
        else if (
          persisted._tag === "Failure" ||
          !equal(persisted.success, initial.state)
        )
          commitUncertain = true;
        return yield* Effect.failCause(stateWrite.cause);
      }
      committedState = true;
      // The journal may still say destinations-installed if forced termination occurs here.
      // doctor must compare state hashes rather than trust the phase label alone.
      yield* writeJSON(location.journal, {
        ...journal,
        phase: "state-committed",
      });
    });
    const outcome = yield* Effect.exit(transaction);
    if (Exit.isFailure(outcome) && !committedState && !commitUncertain) {
      const rollback = yield* Effect.exit(
        Effect.gen(function* () {
          for (const item of [...installed].reverse()) {
            if (!equal(yield* inventory(item.destination), item.next.tree))
              return yield* problem(
                "ROLLBACK_FAILED",
                "Destination changed; preserve it and backup for manual recovery",
                3,
                item.destination,
              );

            yield* disk.remove(item.destination, true);
          }
          for (const item of [...reserved].reverse()) {
            if (yield* disk.info(item.destination)) {
              yield* noLinks(item.destination);
              yield* disk.remove(item.destination, false);
            }
          }
          for (const item of [...backedUp].reverse()) {
            if (yield* disk.info(item.destination))
              return yield* problem(
                "ROLLBACK_FAILED",
                "Destination appeared during rollback",
                3,
                item.destination,
              );

            yield* disk.rename(item.backup, item.destination);
          }
        }),
      );
      if (Exit.isFailure(rollback)) rollbackFailed = true;
    }
    if (commitUncertain)
      return yield* problem(
        "INTERRUPTED_OPERATION",
        "State write outcome is uncertain. Preserve lock, journal, destinations and backups; run doctor",
        3,
        location.journal,
      );

    if (rollbackFailed)
      return yield* problem(
        "ROLLBACK_FAILED",
        "Rollback incomplete. Preserve lock, journal, destinations and backups; run doctor",
        3,
        location.journal,
      );

    if (Exit.isFailure(outcome) && committedState)
      return yield* problem(
        "INTERRUPTED_OPERATION",
        "State committed but cleanup did not finish; run doctor",
        3,
        location.journal,
      );

    // Only remove paths created by this transaction, after rollback or committed state.
    const cleanup = yield* Effect.exit(
      Effect.gen(function* () {
        for (const item of backedUp) {
          if (yield* disk.info(item.backup)) {
            if (
              !item.old ||
              !equal(yield* inventory(item.backup), item.old.tree)
            )
              return yield* problem(
                "INTERRUPTED_OPERATION",
                "Backup changed during apply; preserve it for review",
                3,
                item.backup,
              );

            yield* disk.remove(item.backup, true);
          }
        }
        for (const stage of staged)
          if (yield* disk.info(stage)) yield* disk.remove(stage, true);
        if (journalWritten) yield* disk.remove(location.journal);
        yield* disk.remove(location.lock);
      }),
    );
    if (Exit.isFailure(cleanup))
      return yield* problem(
        "INTERRUPTED_OPERATION",
        "Cleanup incomplete. Preserve remaining evidence and run doctor",
        3,
        location.journal,
      );

    if (Exit.isFailure(outcome)) return yield* Effect.failCause(outcome.cause);
    return {
      ...initial,
      entries: initial.entries.map((entry) =>
        changes.some((job) => job.id === entry.id)
          ? {
              ...entry,
              status: "applied" as const,
              ...(entry.source ? { installedSource: entry.source } : {}),
            }
          : entry,
      ),
    };
  }).pipe(Effect.uninterruptible);
});
