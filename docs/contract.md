# lab-skills public contract, version 1

This contract precedes the Effect implementation. Source lives in skills/, manifest.json and sources.lock.json. CLI source, launcher and tests live in packages/lab-skills/. Generated dist/ and node_modules/ are ignored. Machine state and copied installations are outside the source checkout.

## Commands and selection

```
lab-skills validate --json
lab-skills plan --home /home/coder --profile default --profile effect --target agents
lab-skills status --home /home/coder --target pi
lab-skills apply --home /home/coder --profile default --target agents
lab-skills doctor --home /home/coder --target agents --target claude
```

agents is a destination root, ~/.agents/skills, not a harness. Targets codex, claude, opencode and pi select their respective roots. --harness is a compatibility alias for --target. Explicit profiles replace the implicit default. --skill selects individual skills with transitive dependencies. Profiles and skills combine. With explicit skills and no profiles, there is no implicit default. Omitted previously owned skills remain installed and are reported as unselected.

## Configuration precedence

CLI flags override the corresponding machine configuration fields, then defaults apply. Repeated flags replace configuration arrays, not append to them. Explicit --config FILE selects one JSON file. Otherwise, read LAB_SKILLS_CONFIG if set, then $XDG_CONFIG_HOME/lab-skills/config.json or $HOME/.config/lab-skills/config.json. Missing implicit configuration is allowed; missing explicit configuration is an error. Environment variables are read only by the entry boundary. They never override selection flags.

Machine configuration schema 1: {"schema":1,"home":"/home/coder","profiles":["default"],"skills":[],"targets":["agents"],"archiveDir":"/optional/offline/archives"}. Only schema is mandatory. All paths must be absolute. Unknown configuration fields are errors. Default home is the invoking account's home for read-only commands. Default target is agents. apply requires both home and targets explicitly supplied in flags or configuration. validate requires neither.

## Sources and state

Retain Python manifest and source-lock schema 1, including ownership, provenance, candidates, external entries, profiles, dependencies, variants, prerequisites and blocked_reason. Sources are exactly one of {local: relative-directory} or {locked: lock-key}. Variant keys are destination names. Pins are full lowercase 40-character Git commits. File records contain lowercase 64-character SHA-256 and executable boolean. Relative paths exclude dot segments, backslashes, empty segments, absolute paths and reserved object-property segments __proto__, constructor and prototype. No local source symlinks or native executables are accepted. Every local skill and locked payload contains SKILL.md. Unknown manifest fields fail validation. All profiles, graph edges, locks and variants are validated, including unselected ones. Blocked skills are valid declarations, but cannot be selected for installation.

New state uses <home>/.local/state/lab-skills/state.json, schema 2, owner lloydrichards/lab-skills. Each target/skill records the entire file hash, full POSIX permission mode, directory mode and directory inventory and source identity. Local identity includes content digest, source-relative path and Git HEAD plus dirty-source details when available. Git inspection uses read-only object/index plumbing and raw file hashing, with hooks, filters, replacement objects and lazy fetching disabled. Transformed worktrees and submodules can conservatively appear dirty. Git metadata is informational: content and source pin differences determine updates, not unrelated Git commits. Upstream identity includes repository, commit, path, qualified revision basis and digest. Python state at .local/state/shared-skills/installations.json is diagnosed and blocks apply. It is never adopted, modified or silently reinterpreted.

## Results and diagnostics

Readable terminal output is default. --json writes exactly one versioned result to stdout, including failures, and no progress text. Human error diagnostics go to stderr. Result schema: {schemaVersion:1, command, ok, exitCode, checkout, home?, selection:{profiles,skills,targets}, entries:[], diagnostics:[], sourceGit?}. Entry fields: id, path, status, source?, installedSource?, reason?. Desired and recorded source identities are both visible for owned entries. Status is new, current, update, conflict, unselected, unmanaged or applied. Diagnostic fields: code, severity, message, path?. Errors use stable codes, never string matching for control flow.

Codes: ARGUMENT_INVALID, CONFIG_INVALID, MANIFEST_INVALID, SOURCE_INVALID, STATE_INVALID, LEGACY_STATE, PATH_UNSAFE, UNOWNED_DESTINATION, LOCAL_EDIT, MANAGED_MISSING, SOURCE_CHANGED, INTERRUPTED_OPERATION, DOWNLOAD_FAILED, HASH_MISMATCH, IO_FAILED, APPLY_FAILED, ROLLBACK_FAILED, BROKEN_LINK, DUPLICATE_NAME, PREREQUISITE_MISSING, PREREQUISITE_UNVERIFIED, BLOCKED_SKILL, BUILD_MISSING, INTERNAL_ERROR.

Exit 0 means success, including available updates and warnings. Exit 1 means operational failure. Exit 2 means invalid arguments, configuration, manifest or source definition. Exit 3 means installed-state conflict or interrupted operation. An unsupported/corrupt ownership state is a conflict, not an available update. doctor reports unrelated broken links and duplicate names as warnings; unresolved installer locks/journals/backups are conflicts. Missing known executables are warnings. Descriptive prerequisites are explicitly unverified, not silently certified.

## Apply and recovery

Recompute the plan on every apply. Fetch and hash-verify all payloads before any destination mutation. Acquire an exclusive installer lock, revalidate sources/state/destinations, stage all changed directories, recheck again for source and destination changes, and journal absolute stage/backup/destination paths plus previous ownership state before renames. Preserve unrelated entries and reject local changes, missing owned directories, unowned destinations and symlinks. Recheck each installation immediately before replacement. Commit state with an atomic rename after all destinations are installed. Preserve rollback for ordinary failures. A state-write error is reconciled with persisted state before rollback: if the new state is present, preserve its payload and recovery evidence; if the outcome is unreadable or unexpected, preserve evidence without guessing. Leave evidence and the lock if rollback fails. No force, removal, automatic adoption or executable saved plan exists.

Multi-directory installation is NOT crash-atomic. Forced termination can leave a lock, journal, staged directory, backup or installed content not yet recorded in state. doctor identifies those paths without deleting anything. First ensure no installer is running. Preserve state and journal. Compare each destination and backup against journaled old/new hashes. Restore the previous payload and state, or complete the reviewed new state, only after identifying every entry. Never delete a backup or stale lock merely based on its age. Detailed manual recovery is in recovery.md. No concurrent external tool may mutate these roots during apply; this is not a defense against hostile same-user filesystem races.

## Differences from Python

Use --target, human output plus --json, explicit machine configuration, validate and doctor, stable diagnostics/exit codes, Git-aware source identity, a separate state schema and journaled recovery. Retain source format and conflict-first copy semantics. Planning remains offline and genuinely read-only. Git synchronization stays outside the CLI.

## Distribution

Use built ESM JavaScript. A small executable launcher resolves its own real path, finds the owning checkout, and loads dist/cli.js independently of cwd. Node runs this without Bun or a TypeScript loader; Bun runs the same JavaScript. Expose the checkout launcher with a symlink, not npm install -g, which can copy the source into another prefix. The root package has a bin entry and is private. Global npm-copy distribution is unsupported. The launcher rejects a resolved owning root inside node_modules, so a copied npm installation cannot silently become a second skill source. Build and dependency installation are explicit development steps. No launcher auto-build or download occurs during read-only commands.

## Manifest and result shapes

The complete executable schemas are in `packages/lab-skills/src/model.ts`. Manifest schema 1 has these required root fields:

```json
{
  "schema": 1,
  "owner": "lloydrichards/shared-skills",
  "skills": {
    "example": {
      "ownership": "custom",
      "source": {"local": "skills/example"},
      "dependencies": []
    }
  },
  "profiles": {"default": ["example"]},
  "external": {},
  "candidates": {}
}
```

A skill can also declare variants, prerequisites, provenance and blocked_reason. Every variant key is a known target, every source is local or locked, and every selected target needs a variant or fallback source. The lock root is `{schema:1,sources:{}}`. Each source value requires repository, commit, path, revision_basis, files and license_files. Each file has sha256 and executable. license_files maps generated license destinations to their source paths in the pinned repository. The repository's sources.lock.json contains complete real examples.

A minimal successful plan result has this shape. Actual owned entries also include desired and installed identities, including content digests and available Git metadata:

```json
{
  "schemaVersion": 1,
  "command": "plan",
  "ok": true,
  "exitCode": 0,
  "checkout": "/home/coder/projects/skills",
  "home": "/home/coder",
  "selection": {"profiles": ["default"], "skills": [], "targets": ["agents"]},
  "entries": [{"id": "agents/example", "path": "/home/coder/.agents/skills/example", "status": "new"}],
  "diagnostics": []
}
```

Ownership tree records contain files with sha256, executable and full numeric POSIX mode, sorted directory paths, directoryModes and rootMode. Source snapshots normalize installation modes; existing installation inventories retain the observed modes for conflict checks. The recovery journal schema 1 contains phase, previousState, nextState and items with destination, stage, backup, old and next records. No runtime action executes data read from the journal.

Destination overlap checks resolve physical existing ancestors, including filesystem case aliases, without creating missing paths. License mappings can generate multiple locked destinations from one original, including originals inside the selected source subtree.
