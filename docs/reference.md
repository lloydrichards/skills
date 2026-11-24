# lab-skills command reference

The authoritative public contract, versioned schemas, selection rules, diagnostics and exit codes are in [contract.md](contract.md). TypeScript definitions are in `apps/lab-skills/src/model.ts`. The CLI uses Effect 4.0.5 with aligned Node/Bun platform packages and a pinned platform-node-shared override. `effect/cli` defines command parsing and help. Node and Bun share the core program; runtime layers provide path, crypto, filesystem, HTTP, archive decoding, state and source inspection services.

| Command | Network | Writes | Purpose |
|---|---|---|---|
| root inventory | Only after confirmation, if pinned archives are needed | Both shared profiles, current machine configuration and reviewed local files | Toggle, review, confirm save and apply |
| validate | No | No | Validate every source, pin, dependency and variant |
| status | No | No | Show desired and recorded identities and local conflicts |
| plan | No | No | Preview current selection and changes |
| apply | Pinned archives unless archive-dir supplied | Selected owned directories and machine-local state | Verify, stage, recheck, journal, install |
| doctor | No | No | Diagnose duplicate names, broken links, prerequisites and interrupted operations in known roots, including Codex system skills |

agents means `.agents/skills` under the target home. Other targets are codex `.codex/skills`, claude `.claude/skills`, opencode `.config/opencode/skills`, and pi `.pi/agent/skills`. Every selected root receives copies and the full dependency closure. Impeccable selects a distinct upstream variant where appropriate. Runtime discovery and permission configuration remain harness responsibilities. Avoid duplicate discovery roots until precedence is verified on that machine.

The catalog has two profiles: `client` and `home-lab`. Both explicitly select but, effect, make-pr and technical-writing. Dependencies add changeset and unslop. Home-lab also selects home-lab-workflow, which requires report-builder. `but` is external membership only. The legacy implicit `default` resolves to client when the catalog has no default profile. Other skills remain available through inventory toggles or `--skill NAME` on the existing subcommands. `--harness` remains an alias for `--target`.

`--tui` opens an opt-in interactive session on any command. It requires a terminal and is incompatible with `--json`. The initial command remains read-only, including an initial plan for `apply --tui`. A session can run other commands. Only choosing Install on an explicit confirmation runs apply, using the displayed home and target roots. Scope edits replace their arrays and never persist machine configuration. See [live inspector instructions](install.md#use-the-live-inspector).

`status` and `plan` share an assessment and write no files, create no directories, acquire no locks and fetch no payloads. Offline plans cannot certify network availability. The supported launcher also prevents Bun's default runtime transpiler cache. User-enabled runtime profilers, Node compile caches and external monitoring tools are outside this filesystem guarantee; disable those when auditing read-only behavior.

Human output uses borderless tables with Status, Skill, and Location columns. Full paths wrap within their cells. `status` includes current, unselected, and unmanaged entries. `plan` shows changes and conflicts, while `apply` lists installed entries or reports a no-op. `doctor` shows findings rather than normal inventory rows. Use `--json` for full source identities and exact structured records. Color follows each stream's terminal status and is disabled by non-empty `NO_COLOR` or `TERM=dumb`.

JSON output goes to stdout, including failures. Human errors go to stderr. An available update is exit 0; an operational failure is exit 1; invalid input/source is exit 2; installation conflicts and interrupted operations are exit 3. There is no force, Git synchronization or permission/authentication command. The root inventory can adopt verified copies and remove explicitly disabled, unchanged owned skills after review; legacy apply still refuses unmanaged destinations and retains omitted skills.

Installed copies normalize files to 0644 or 0755 based on the source executable flag, and directories to 0755. Ownership records then track full POSIX permission modes as well as content and directory membership. Later permission changes are conflicts.

Git inspection does not invoke git status, clean/process filters, fsmonitor hooks or remote fetching. It compares local tree/index objects and raw worktree bytes. This can conservatively mark transformed files or submodules dirty; installation updates remain governed by content and pin identities.

Local generated copies include COLLECTION-LICENSE.txt and COLLECTION-NOTICE.md from the repository root when present. These files are hashed, ownership-checked and updated like other payload files. They are not duplicated in authored skill directories; colliding authored files are rejected.

The core profiles include make-pr and its changeset, technical-writing and unslop dependencies. `--skill mutation-test-loop` selects mutation-test-loop. The but skill and authenticated GitButler CLI remain external prerequisites, not installer-managed dependencies. Mutation-test-loop runs StrykerJS (10.1 or newer for Vitest 5) and needs network access to install it, unless the target project already has it. Its booking fixture evaluations run `npm install` in a disposable copy, so run them with `--allow-host-tools`.

## Dry-run inventory

```sh
lab-skills --dry-run
lab-skills --dry-run --ascii
lab-skills --dry-run --home /home/coder
```

The root command opens the inventory in a terminal. Use `lab-skills --profile client` on the Mac or `lab-skills --profile home-lab` on home-lab for first live use. After a successful save, machine configuration remembers the profile, home and agents destination. Until then, live save requires an explicit profile. Inventory accepts one profile, no `--skill`, and only the shared `agents` destination. It scans copies across all five global roots. Redirected output or `TERM=dumb` prints a read-only table. `--dry-run` is a bare switch that disables save, apply and downloads; it cannot be combined with a subcommand, `--tui` or `--json`. Existing subcommands retain their behavior.

| Key | Action |
| --- | --- |
| Up/Down, j/k | Move between skills |
| Space | Toggle current-machine profile membership |
| p | Enter or exit profile mode |
| Left/Right in profile mode | Choose client or home-lab |
| Space in profile mode | Toggle membership in that profile |
| d | Show descriptions, paths and file comparisons |
| Enter | Review proposals. In profile mode, finish editing first |
| a, then y in review | Save both profiles and apply local files; disabled with --dry-run |
| / | Search names, descriptions, actions and profile chips |
| f | Cycle all, changes, installed and available |
| r | Discard all draft edits |
| ? | Show help and scan diagnostics |
| Esc | Return to the inventory |
| q, Ctrl+C, Ctrl+D | Quit and restore terminal state |

Rows sort by existing current-profile selections, new enables or adoptions, removals, then remaining skills. Names sort alphabetically within each group. The cursor follows the same skill when a toggle moves its row. `●` means explicitly enabled, `○` required, and a blank means unselected. These markers describe current-machine profile membership, even when the skill has a warning. Warnings, comparison results and external ownership appear in Status. Enabled skills with no installed copy show `missing`; unselected catalog skills with no installed copy show `available`. Plan shows only proposed adds, adoptions, updates or removals; an unselected available skill has no planned add. `--ascii` uses x enabled, o required and blank unselected. The terminal uses bold names, muted descriptions and hashes, and an inverted cursor row. No semantic colors are used; `NO_COLOR` disables styling entirely. Profile chips show draft memberships.

Both drafts start from their saved catalog memberships. The active machine profile determines local file operations; editing the other profile changes membership only and never applies remotely. The collector scans user installations under `~/.agents/skills`, `~/.codex/skills`, `~/.claude/skills`, `~/.config/opencode/skills` and `~/.pi/agent/skills`, plus every catalog, external and deferred entry. Codex `.system` skills and Codex/Claude plugin directories are excluded by logical and resolved paths, including directory aliases and linked SKILL.md files. This is a location-based scope, not proof of who installed a copied folder. User-installed skills remain visible even when they share a name with a system skill. Catalog-only entries remain available for additions. Help lists excluded provider paths. Project-local directories are not scanned.

Unmanaged copies show `match`, `missing notices`, `changed content`, `extra files`, `missing files`, `mixed`, `unknown`, or `no catalog`. Comparison covers every file hash and executable bit. Internal links or unreadable payloads prevent adoption. An enabled match proposes `adopt`; notice-only matches also list missing catalog licenses or notices. Shared aliases produce one proposal per physical copy. Different bytes alone cannot distinguish an older version from local edits. Comparisons use the offline catalog and its pins, not latest upstream releases.

Review holds a session-local plan. Saving and applying recomputes the inventory and rejects a changed catalog, payload, installation, configuration or draft. The existing installer transaction stages, journals and rolls back additions, updates, adoptions and removals. Adoption requires one physical copy at the canonical agents destination with matching files, modes and directories, allowing only missing declared notices. Aliases may share that copy; separate physical copies require consolidation. Explicitly disabling a previously selected owned skill proposes removal. Owned skills outside the previous selection are retained. Missing owned skills can be reinstalled after explicit review. Dry-run never saves or applies.

For a focused row, the footer explains the enablement outcome. Details starts with an **If enabled** section, including exact notice additions, verified physical copies, shared aliases and dependencies. `missing notices` means all existing payload files match and only catalog-declared license or notice files are missing; enabling proposes adoption plus those additions while preserving existing files. `changed content` means bytes or executable bits differ; `extra files` means additional files exist without changed content; `missing files` means non-notice files are absent. When copies have multiple kinds of differences, the row prioritizes unknown comparisons, changed content, extra files, then missing files. Details lists every difference per location. Those unmanaged copies cannot be enabled until their differences are resolved; the dry run never replaces or removes them automatically. Review states that adoption records ownership and preserves existing files.

External skills such as `but` and `rex` can be enabled in either profile draft. They retain `external` Status and have no file Plan. Review lists their membership changes only. Enabling an absent external skill does not install it; disabling one never removes its files. Provider ownership remains unchanged. Profile edits stay in memory until confirmation.

The review separates draft profile membership, automatic dependency membership, local files and ownership, and blockers. Existing-copy adoption, missing-skill installation, notice additions, owned updates and owned removals have distinct groups. External memberships never enter file groups. Edits to the other profile show membership only. A blocked file operation appears under Blockers instead of as an executable proposal. Counts describe the pending proposal; opening review applies nothing.

### Review tabs

Enter opens **Overview**, with bordered profile membership and local file/ownership sections. Every proposed enable, adoption, install, notice addition, update or removal is summarized there; paths stay in **Files**. **Profiles** includes explicit and required memberships. **Blockers** lists unresolved work; its count stays visible in the tab bar on every page.

Use Tab/Shift+Tab, Left/Right or 1–4 to switch Overview, Profiles, Files and Blockers. Up/Down and Page Up/Down scroll the selected tab. Switching tabs resets its scroll position; Esc returns to the inventory. The tab bar, summary and dry-run controls remain visible while scrolling. ASCII mode uses simple borders and x/o membership markers. NO_COLOR keeps an explicit bracketed active-tab label. In live mode, press `a` and then `y` to save and apply; Enter alone does not apply. In dry-run mode, apply is disabled. The Profiles tab shows the shared profile file, both memberships, machine configuration path, home and destination.

The file transaction commits before metadata. Shared profile and machine configuration files each use atomic replacement, but the three commits are not one atomic transaction. If metadata saving fails after file commit, the CLI reports what completed and instructs you to reopen before retrying. A profile-save lock serializes cooperating saves in the same checkout; the installer has its own machine-local transaction lock. Neither Git commits nor remote synchronization runs from the UI.
