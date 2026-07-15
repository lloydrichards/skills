# Skills

A curated collection of portable Agent Skills for OpenCode, Claude Code, and other tools that support the `SKILL.md` format.

Each skill is self-contained under `skills/<name>/`. Some skills bundle references, templates, or scripts for progressive disclosure.

## Catalog

| Skill | Purpose |
| --- | --- |
| [`changeset`](skills/changeset/SKILL.md) | Create and review Changesets with appropriate versioning and concise release notes. |
| [`comment-auditor`](skills/comment-auditor/SKILL.md) | Audit comments, docs, and codetags for durable, useful engineering context. |
| [`effect`](skills/effect/SKILL.md) | Build and refactor production Effect v4 applications, with focused references for core patterns and subsystems. |
| [`effect-service`](skills/effect-service/SKILL.md) | Build and review Effect v4 services, layers, and dependency injection. |
| [`explain-diff`](skills/explain-diff/SKILL.md) | Create a standalone HTML walkthrough of a code change, branch, commit range, or pull request. |
| [`report-builder`](skills/report-builder/SKILL.md) | Build polished, self-contained technical HTML reports using a shared design system. |

## Installation

Copy an individual skill into a supported skills directory:

```sh
cp -R skills/effect "$HOME/.agents/skills/effect"
```

For local development, symlink the selected skill instead:

```sh
ln -s "$PWD/skills/effect" "$HOME/.agents/skills/effect"
```

OpenCode discovers skills in `.agents/skills/`, `.opencode/skills/`, and `.claude/skills/`. Claude Code supports `.claude/skills/` and skill-directory symlinks. Preserve the skill directory name when installing it.

## Scope

This repository intentionally publishes only the curated directories listed above. The local `.agents` installation may contain other installed skills, lockfiles, and machine-specific state; those files are ignored rather than mirrored here.

The `effect` skill is a derivative of [kitlangton/skills](https://github.com/kitlangton/skills)'s Effect skill and has been expanded locally. See [NOTICE.md](NOTICE.md) for the required upstream MIT notice.

## License

Unless otherwise noted, this collection is available under the [MIT License](LICENSE). Third-party notices are retained in [NOTICE.md](NOTICE.md).
