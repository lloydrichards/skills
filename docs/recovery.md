# Recover an interrupted installation

Do not remove a lock or backup merely because it is old. An apply process may still be running. Stop concurrent editors/installers for the affected roots and establish whether the owning process has exited. The CLI does not kill processes or decide that a lock is stale.

1. Run `lab-skills doctor --home /absolute/home --target agents --json`. Add the other selected roots. Doctor scans all known roots for duplicates and installer staging evidence. Keep its output outside source control.
2. Preserve copies of `.local/state/lab-skills/state.json`, `journal.json`, `apply.lock`, and every path named in the journal. Preserve unrecorded stage and backup directories reported by doctor as well. Do not modify histories or authentication files.
3. Read the journal's `previousState`, `nextState` and `items`. Each item identifies the skill, destination, stage, backup and complete old/new file hashes, executable flags and directory inventories. Doctor reports whether the live ownership state matches previous or next state and whether each directory matches old or new content. A failed comparison can also mean a missing directory or unreadable path; inspect the actual path before deciding.
4. If ownership state still matches `previousState`, either finish the reviewed transaction or restore every old directory. For an update, retain the new destination elsewhere before restoring its verified old backup. For a new installation, retain the unrecorded destination elsewhere; do not silently claim ownership. Restore the previous state only after all destinations match its records.
5. If state matches `nextState`, verify every destination against that state before treating the transaction as committed. A journal phase is only a hint; termination can occur between the state rename and the next journal update. Preserve any differing directory and resolve its edits before proceeding.
6. If neither state matches, or a directory matches neither inventory, preserve all evidence and resolve the discrepancy manually. Do not rewrite hashes to suppress a conflict.
7. After the chosen complete state and every affected directory agree, review each remaining stage/backup and preserve anything unique elsewhere. Only then remove the reviewed transaction evidence and lock. Run doctor and plan again before applying anything else.

Recovery is intentionally manual in version 1. No recovery command adopts, deletes or overwrites installations. An ordinary caught failure rolls back directory replacements. If rollback itself fails, lock, journal and surviving backups remain. A cleanup failure after state commit is also an interrupted operation.

The state file is atomically replaced after destination renames, with file fsync before the rename. There is no multi-directory crash transaction, no guarantee against power-loss filesystem behavior, and no protection against hostile same-user symlink races. External tools must not mutate the selected roots during apply. A forced-termination test stops a child after a destination rename and confirms that doctor identifies the preserved journal and content.

OS signals, including SIGINT, are not a promise of graceful rollback. After interrupting apply, use doctor and preserve the evidence before another mutation.

A reported state-write failure does not prove that the state rename failed. Apply reads state back before choosing rollback. If it matches nextState, the new installation and recovery evidence are retained. If it cannot establish either complete state, it preserves destinations, backups, journal and lock. Doctor reports matching previous/next state and old/new directory content for manual review.

An exclusively created lock is removed after failed initialization only when the installer can identify its own inode. If identity inspection or cleanup itself fails, the conservative outcome is a retained lock requiring manual inspection. A pre-existing lock is never removed. Backups changed after installation are also retained rather than deleted during cleanup.
