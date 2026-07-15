---
name: changeset
description: |
  Analyze git changes and create or edit Changesets entries in the user's preferred style. Use when preparing a PR, branch is ready for review, user mentions changeset, changelog, release notes, version bump, patch/minor/major, or asks whether a changeset is needed. Inspect committed branch changes, choose semver from user-visible impact and Conventional Commits, create via the repo's Changesets CLI when possible, and write concise user-facing changelog prose: patch one-liners, minor summary plus example, major impact plus migration.
---

# Changeset

## Purpose

Use this skill when a branch introduces a user-visible change that should appear in a changelog or release notes. Changesets record release intent: which package is released, what semver bump it receives, and the changelog entry users will read.

Write for users, not maintainers. Describe the observable behavior change rather than the implementation.

Do not create a changeset for pure refactors, test-only changes, internal cleanup, CI-only changes, dev-tool configuration, or documentation changes that do not affect published user-facing docs.

## Workflow

### 1. Inspect Existing Changesets

Check for existing files in `.changeset/*.md`, excluding `.changeset/README.md`.

If a relevant changeset already exists, edit it instead of creating another. If a changeset exists but may cover a different change, ask before creating an additional changeset.

Multiple changesets are fine when a PR contains distinct user-facing changes that should become separate top-level changelog items.

### 2. Inspect Branch Changes

Find the base branch from the repo context. Prefer the PR base if known, then `origin/main`, `main`, `origin/master`, or `master`.

Inspect committed changes first:

```shell
git log <base>..HEAD --oneline
git diff <base>...HEAD
```

If there are no branch commits, inspect the working tree only if the user is explicitly asking for a changeset before committing:

```shell
git diff
```

Use the diff to answer three questions:

- Which published packages are affected?
- Is each affected change user-visible?
- Is the correct bump `patch`, `minor`, or `major`?

Identify package names from existing `.changeset/*.md`, package manifests, workspace config, and changed file paths. Use the actual published package name from `package.json`, not the folder name, unless existing changesets prove otherwise.

### 3. Decide Whether a Changeset Is Needed

Usually create a changeset for:

- Bug fixes in published behavior.
- New features, options, commands, rules, components, exports, or supported syntax.
- Formatter, parser, CLI, API, or output changes users can observe.
- Deprecations, removals, renamed APIs, changed defaults, or migration-required changes.
- User-facing docs that ship with the package or site and are part of the release artifact.

Usually skip a changeset for:

- `docs:`, `chore:`, `ci:`, `test:`, or `refactor:` commits with no package behavior change.
- README-only edits that are not part of package release notes.
- Internal dependency bumps with no user-visible change.
- Build, lint, formatting, or test infrastructure changes that do not affect published output.

If all changes are non-user-visible, explain that no changeset is needed and stop.

## Choose the Change Type

Use Conventional Commits as a signal, then confirm against the actual diff.

- `patch`: `fix:` commits, bug fixes, performance improvements, compatibility fixes, and narrow behavior corrections.
- `minor`: `feat:` commits and backward-compatible new capability, such as new options, exports, commands, components, rules, or supported syntax.
- `major`: commits with `BREAKING CHANGE` footers, `!` markers, removals, renamed APIs, changed defaults that can break users, incompatible output changes, or any change that requires users to update code or configuration.

When in doubt between `patch` and `minor`, choose `patch` for fixes and `minor` for newly available capability. When in doubt between `minor` and `major`, identify whether existing users must change code, configuration, snapshots, generated output expectations, or workflows.

Ask the user when the bump is ambiguous. Include your suggested bump and the reason.

## Create the File

Prefer the repository's Changesets command. Look for scripts or docs first, then use the package manager already used by the repo.

Common interactive commands:

```shell
pnpm changeset
yarn changeset
npm run changeset
npx @changesets/cli
```

The Changesets CLI also supports non-interactive creation:

```shell
pnpm changeset --message "description." --patch package-name
pnpm changeset --message "description." --minor package-name
pnpm changeset --message "description." --major package-name
```

For multiple packages, pass multiple bump flags:

```shell
pnpm changeset --message "description." --patch package-a --minor package-b
```

After the CLI writes `.changeset/<generated-id>.md`, edit that generated file to match the final wording. Do not rely on the first CLI message as final prose if the entry needs examples or migration notes.

Manual file creation is acceptable only when the repo has no working Changesets command and existing `.changeset` files make the format clear.

Do not commit the changeset unless the user explicitly asks you to commit. If committing is requested, keep the changeset with the implementation change it documents: amend or fold it into the related feature/fix commit rather than creating a standalone `chore: add changeset` commit. Standalone changeset commits are only appropriate when the user explicitly asks for them or when the changeset documents already-merged work that cannot be amended.

## Format

Use standard Changesets frontmatter:

```markdown
---
"package-name": patch
---

Description here.
```

For multiple packages in one coherent change:

```markdown
---
"package-a": minor
"package-b": patch
---

`package-a` now supports custom themes, and `package-b` resolves the shared theme tokens correctly.
```

Prefer one changeset per distinct user-facing intent. Split unrelated bug fixes and features even if they touch the same package.

## Writing Style

Write changelog prose, not commit messages. Conventional Commit labels such as `fix:`, `feat:`, `Fixed:`, and `Added:` belong in commits, not in Changesets bodies.

General rules:

- Write in the same language and style as the surrounding repo changesets. If the repo mixes styles, follow the user's stated preference first, then the dominant style in existing changesets.
- Keep the first line scan-friendly.
- Describe the issue fixed or user-visible behavior added as a sentence or sentence fragment suitable for release notes.
- For bug fixes, describe the incorrect behavior that no longer happens or the case that now works.
- For features, describe the newly available capability without a commit-style prefix.
- End every sentence with a full stop.
- Link issues, docs, APIs, rules, commands, or components when the target is stable and useful.
- Avoid implementation details unless they directly explain user impact.

## Patch Entries

Patch entries should usually be one short line. Include an issue link when one exists.

Template:

```markdown
`<thing>` now handles <case> correctly.
```

Examples:

```markdown
`parseConfig` now preserves comments in nested objects.
```

```markdown
`useOptionalChain` now detects negated logical OR chains ([#4444](https://github.com/org/repo/issues/4444)).
```

If the fix is hard to understand without context, add one more sentence, but keep patch entries compact.

## Minor Entries

Minor entries should have a one-line summary plus a concrete example when an example helps users understand the feature.

Template:

````markdown
`<feature>` now supports <capability>.

For example:

```ts
exampleCode();
```
````

Examples:

````markdown
`createClient` now supports custom retry policies.

For example:

```ts
createClient({ retries: 3 });
```
````

````markdown
The formatter now preserves multiline arrow function parameters.

For example:

```diff
- const fn = (a, b) => {};
+ const fn = (
+   a,
+   b,
+ ) => {};
```
````

Use inline code for very small examples and fenced code blocks for anything multiline or syntax-sensitive.

## Major Entries

Major entries should be longer because users need to understand impact and migration. Include what changed, why it matters, and how to update.

Template:

````markdown
Breaking: <short summary of the breaking change>.

<Describe the old behavior and the new behavior. Explain who is affected.>

To migrate, <give the smallest clear migration path>:

```ts
// before
oldApi();

// after
newApi();
```
````

Example:

````markdown
Breaking: `createClient` now requires an explicit `baseUrl` option.

Previously, `createClient` defaulted to `http://localhost:3000`. This default made production misconfiguration too easy to miss, so callers must now provide the target service URL.

To migrate, pass `baseUrl` when creating the client:

```ts
// before
createClient();

// after
createClient({ baseUrl: "https://api.example.com" });
```
````

## Validation

After creating or editing a changeset, run the repo's relevant validation if available.

Good checks include:

```shell
pnpm changeset status
pnpm textlint .changeset/<file>.md
pnpm lint
```

Use the narrowest check that matches the repo. If textlint or markdown lint fails, fix punctuation, grammar, spacing, or formatting and rerun the check.

Show the generated file path and final content in your response.

## Final Check

Before finishing, verify:

- A changeset is actually needed for a user-visible change.
- Existing changesets were reused when appropriate.
- The frontmatter package names and bump types are correct.
- Patch entries are short one-liners unless extra context is necessary.
- Minor entries include a summary and an example when examples clarify the change.
- Major entries explain impact and migration.
- Every sentence ends with a full stop.
- No commit was made unless the user explicitly requested it.
