# lab-skills command reference

The authoritative public contract, versioned schemas, selection rules, diagnostics and exit codes are in [contract.md](contract.md). TypeScript definitions are in `packages/lab-skills/src/model.ts`. The CLI uses Effect 4.0.5 with aligned Node/Bun platform packages and a pinned platform-node-shared override. Node and Bun share the core program; runtime layers provide path, crypto, filesystem, HTTP, archive decoding, state and source inspection services.

| Command | Network | Writes | Purpose |
|---|---|---|---|
| validate | No | No | Validate every source, pin, dependency and variant |
| status | No | No | Show desired and recorded identities and local conflicts |
| plan | No | No | Preview current selection and changes |
| apply | Pinned archives unless archive-dir supplied | Selected owned directories and machine-local state | Verify, stage, recheck, journal, install |
| doctor | No | No | Diagnose duplicate names, broken links, prerequisites and interrupted operations in known roots, including Codex system skills |

agents means `.agents/skills` under the target home. Other targets are codex `.codex/skills`, claude `.claude/skills`, opencode `.config/opencode/skills`, and pi `.pi/agent/skills`. Every selected root receives copies and the full dependency closure. Impeccable selects a distinct upstream variant where appropriate. Runtime discovery and permission configuration remain harness responsibilities. Avoid duplicate discovery roots until precedence is verified on that machine.

Default resolves to seven skills. Add profile effect for eight. Profiles frontend, learning, explanations, advanced, releases and llm remain optional. Explicit profiles replace the implicit default; use both `--profile default` and `--profile effect` to combine them. `--harness` remains an alias for `--target`.

`status` and `plan` share an assessment and write no files, create no directories, acquire no locks and fetch no payloads. Offline plans cannot certify network availability. The supported launcher also prevents Bun's default runtime transpiler cache. User-enabled runtime profilers, Node compile caches and external monitoring tools are outside this filesystem guarantee; disable those when auditing read-only behavior.

JSON output goes to stdout, including failures. Human errors go to stderr. An available update is exit 0; an operational failure is exit 1; invalid input/source is exit 2; installation conflicts and interrupted operations are exit 3. No force, adoption, removal, Git synchronization or permission/authentication command exists.

Installed copies normalize files to 0644 or 0755 based on the source executable flag, and directories to 0755. Ownership records then track full POSIX permission modes as well as content and directory membership. Later permission changes are conflicts.

Git inspection does not invoke git status, clean/process filters, fsmonitor hooks or remote fetching. It compares local tree/index objects and raw worktree bytes. This can conservatively mark transformed files or submodules dirty; installation updates remain governed by content and pin identities.

Local generated copies include COLLECTION-LICENSE.txt and COLLECTION-NOTICE.md from the repository root when present. These files are hashed, ownership-checked and updated like other payload files. They are not duplicated in authored skill directories; colliding authored files are rejected.

Owner-confirmed custom workflows are optional. `--profile releases` selects changeset and make-pr, including technical-writing and unslop dependencies. `--profile mutation-audits` selects mutation-test-loop. The but skill and authenticated GitButler CLI remain external prerequisites, not installer-managed dependencies. Mutation evaluation 1 uses a disposable copy of the bundled booking fixture instead of a machine-specific checkout. Its supplied ledger is historical example evidence, not proof of a new campaign.
