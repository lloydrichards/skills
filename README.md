# Shared skills and lab-skills

This repository keeps editable custom skills, maintained adaptations and pinned public-skill sources alongside `lab-skills`. lab-skills is an Effect-based installer. It does not change Git or GitButler state, configure harnesses, install prerequisite CLIs, or authenticate providers.

Authored skills remain in `skills/`. `manifest.json` selects sources, dependencies, variants and profiles. `sources.lock.json` pins public source commits, subdirectories and file hashes with accurate comparison-baseline qualifications. `NOTICE.md` and the maintained skills' upstream license files retain attribution. Generic collection notices are added to generated copies by the installer.

CLI source, package bin launcher and tests are in `apps/lab-skills/`. It runs built JavaScript under Node or Bun using the same core. Generated dist/, node_modules/, installations, machine configuration, histories, credentials, engines and caches do not belong in public source. Machine-local installations and review snapshots stay outside the public source tree.

Development uses Bun 1.4.2 workspaces and Stack Effect configuration in `stack.effect.json`. Shared TypeScript settings live in `packages/config-typescript/`. Effect TSGo patches the native compiler and editor tooling. Oxlint enforces Effect diagnostics. The application emits Node-compatible ESM JavaScript for both runtimes.

Read [the public contract](docs/contract.md), [build and PATH instructions](docs/install.md), [command reference](docs/reference.md), [manual recovery](docs/recovery.md), [source synchronization](docs/sync.md) and [open migration decisions](docs/decisions.md).

`make-pr` and `mutation-test-loop` are owner-confirmed custom skills. The client profile includes PR preparation. Select `--skill mutation-test-loop` for mutation auditing. `make-pr` requires the externally managed `but` skill and authenticated GitButler CLI. `but` and Rex remain externally managed. code-review is pinned but blocked pending its tracker prerequisite. The larger `skill-creator`, `skill-doctor`, and `install-anti-slop` forks are deferred pending a maintenance decision. `rubber-duck` is installed from upstream without its local metadata overlay. Impeccable source variants are pinned, but platform engines must be obtained separately.

Start with `bun install --frozen-lockfile`, `bun run build`, and `node apps/lab-skills/bin/lab-skills.mjs validate`. Review `plan` before any `apply`; existing installations are not adopted automatically.

The authored source set contains the eight previously tracked skills plus `deslop`, `unslop`, `engineering-principles`, `make-pr`, and `mutation-test-loop`. Optional upstream skills are manifest entries and pins. Installed or locally changed skills are not automatically admitted to the maintained source collection.

Open `lab-skills --profile client` on the Mac or `lab-skills --profile home-lab` on home-lab. Space toggles the current profile; `p` edits either profile; Enter opens the tabbed review. In review, `a` then `y` saves both shared profiles and applies files only on this machine. Add `--dry-run` to disable all writes. Redirected output always prints a read-only inventory. Other skills remain in the catalog. See [the inventory reference](docs/reference.md#dry-run-inventory).
