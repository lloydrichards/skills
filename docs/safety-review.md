# Adversarial safety review

Three reviewers started with clean contexts and separate briefs: filesystem purity, ownership and hostile paths, and transaction failure/recovery. They reviewed read-only and reproduced findings in isolated temporary fixtures. Confirmed fixes were re-reviewed independently. No installer command targeted the live Mac home; no live configuration, links, branches or GitButler state was changed.

| Severity before fixes | Finding | Resolution |
|---|---|---|
| P1 | An atomic state rename could succeed before a cleanup error, causing old payloads to be restored while new state remained | Remove fallible post-rename cleanup and reconcile persisted state before rollback. Unknown outcomes retain evidence. |
| P2 | Git inspection could execute fsmonitor hooks and clean/process filters during plan | Replace status with observational plumbing and raw hashing. Disable optional locks, helpers, replacement objects and lazy/remote fetching. |
| P2 | Lock initialization could fail after creating its file, leaving an avoidable orphan lock | Initialize through an exclusive handle and clean only the inode acquired by that call. Preserve existing or unidentified locks. |
| P2 | Case aliases bypassed lexical source/destination overlap checks | Compare physical paths through nearest existing ancestors, including missing destination trees. |
| P2 | In-subtree license mappings and multiple destinations for one license failed | Map each archive entry to every explicitly locked destination and applicable subtree destination. |
| P2 | Reserved or inherited profile names caused an internal failure instead of an input diagnostic | Validate identifiers and require own dictionary entries. |
| P3 | FAT64 Mach-O magic values bypassed local native-source validation | Recognize both byte orders and add regression fixtures. |

Additional guards preserve transaction evidence if removal of a new destination reservation fails, retain modified backups instead of deleting them, and avoid following ownership-state symlinks during reconciliation and diagnosis.

Validation includes the contract suite under both Node and Bun, plus full test-project type-checking. Filesystem tests use temporary homes. HTTP payload cases use fixture services; a separate integration run downloads real immutable upstream archives for default plus Effect under both runtimes. It installs eight skills per runtime, checks repeat application and status, then removes the temporary homes. Git helper tests use manually constructed temporary repositories, proving hooks/filters are not invoked, index bytes are unchanged, and missing promisor objects do not trigger remote execution.

This is not a multi-directory crash transaction or a sandbox against hostile same-user races. Forced termination, uncertain state writes, failed rollback/cleanup, or inability to establish lock identity can still require the documented manual recovery procedure. No force, adoption, removal or Git synchronization behavior was added. HP/Linux execution remains a separate validation step.

Scope reduction retains eleven deliberate local skill sources. Collection licenses and notices are generated during installation, with read-only planning, hash-based updates and collision rejection covered by regression tests. Deferred forks remain preserved outside public source.
