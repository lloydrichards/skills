# Shared skills and lab-skills

This repository keeps editable custom skills, maintained adaptations and pinned public-skill sources alongside `lab-skills`. lab-skills is an Effect-based installer. It does not change Git or GitButler state, configure harnesses, install prerequisite CLIs, or authenticate providers.

Authored skills remain in `skills/`. `manifest.json` selects sources, dependencies, variants and profiles. `sources.lock.json` pins public source commits, subdirectories and file hashes with accurate comparison-baseline qualifications. `NOTICE.md` and `licenses/` retain attribution and upstream licenses.

CLI source, package bin launcher and tests are in `packages/lab-skills/`. It runs built JavaScript under Node or Bun using the same core. Generated dist/, node_modules/, installations, machine configuration, histories, credentials, engines and caches do not belong in public source. Machine-local installations and review snapshots stay outside the public source tree.

Read [the public contract](docs/contract.md), [build and PATH instructions](docs/install.md), [command reference](docs/reference.md), [manual recovery](docs/recovery.md), [source synchronization](docs/sync.md) and [open migration decisions](docs/decisions.md).

`make-pr` and `mutation-test-loop` are owner-confirmed custom skills. Select `--profile releases` for PR preparation or `--profile mutation-audits` for mutation auditing. Neither changes the default selection. `make-pr` requires the externally managed `but` skill and authenticated GitButler CLI. `but` and Rex remain externally managed. code-review is pinned but blocked pending its tracker prerequisite. The optional skill-creator profile still needs a Codex collision decision. Impeccable source variants are pinned, but platform engines must be obtained separately.

Start with `npm ci --ignore-scripts`, `npm run build`, and `node packages/lab-skills/bin/lab-skills.mjs validate`. Review `plan` before any `apply`; existing installations are not adopted automatically.
