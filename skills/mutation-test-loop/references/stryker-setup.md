# Stryker setup for the mutation loop

Facts checked against StrykerJS 10.1.1 (October 2026). Re-check versions with
`npm view @stryker-mutator/core version` before installing.

## Versions

| Package | Minimum | Notes |
|---|---|---|
| `@stryker-mutator/core` | 10.1.x | Node 22 or newer |
| `@stryker-mutator/vitest-runner` | 10.1.x | Required for Vitest 5; 9.x works with Vitest 3–4 |

Install as exact-pinned dev dependencies, or run without installing when the
user does not want dependency changes (`npx -p @stryker-mutator/core@10.1.1
-p @stryker-mutator/vitest-runner@10.1.1 stryker run`). Adding dependencies or
config files to the repository is a change the user must agree to.

Skip `@stryker-mutator/typescript-checker`. It is slow and TypeScript 7 support
is experimental. Type-invalid mutants show up as `CompileError` or are obvious
during triage.

## Baseline config

Save as `reports/mutation/stryker.config.json` and run with
`npx stryker run reports/mutation/stryker.config.json`. Replace the example
paths with the scope's real files (`.ts`, `.mjs`, or `.js`); drop
`vitest.configFile` when the project uses Vitest's default config lookup.

```json
{
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.config.ts" },
  "mutate": ["src/rate-limit.ts"],
  "testFiles": ["test/rate-limit.test.ts"],
  "reporters": ["json", "clear-text", "progress"],
  "jsonReporter": { "fileName": "reports/mutation/mutation.json" },
  "disableBail": true,
  "ignoreStatic": true,
  "incremental": true,
  "incrementalFile": "reports/mutation/stryker-incremental.json",
  "timeoutMS": 10000
}
```

- The Vitest runner always uses per-test coverage; `coverageAnalysis` is ignored.
- `disableBail` costs roughly 10–35% more time but credits every failing test,
  which the "tests that never fail" and overlap judgements need. It also avoids
  the bail race behind issue #6335.
- `ignoreStatic` skips mutants that only run at module load and would otherwise
  run against every selected test.
- `mutate` accepts line ranges: `src/a.ts:10-20` or `src/a.ts:5:4-6:4`. There is
  no `--since`; build ranges from `git diff -U0` when auditing a change.
- `--dryRunOnly` checks the setup without running mutants.

Keep `reports/` out of commits (add it to `.gitignore` only with the user's
agreement).

## Known setup failures

| Symptom | Cause | Fix |
|---|---|---|
| `Unknown stryker config option "vitest"` or runner not found | Isolated installs (bun, pnpm) hide the plugin from Stryker's discovery | Add `"plugins": ["./node_modules/@stryker-mutator/vitest-runner/dist/src/index.js"]` |
| `ts.parseConfigFileTextToJson is not a function` | TypeScript 7 removed the API Stryker uses to rewrite tsconfig in its sandbox | When tsconfigs reach outside the package only through package-name `extends` (no relative paths to rewrite), point `"tsconfigFile"` at a path that does not exist (for example `".stryker-no-tsconfig.json"`) to skip the rewrite. Otherwise `"inPlace": true`, only in a throwaway worktree or copy |
| Golden, snapshot, or fixture-byte tests fail only under Stryker | Stryker prepends `// @ts-nocheck` to test and fixture files in the sandbox, changing bytes those tests compare | `"disableTypeChecks": false`. Safe without the TypeScript checker: Vitest strips types without checking them |
| Tests fail only under Stryker with missing paths | Tests reach outside the package (`../../..`) and the sandbox copy breaks them | `"inPlace": true` in a throwaway worktree or copy |
| Every Vitest project runs | No project selection (#6215) | Point `vitest.configFile` at a single-project config |
| Out of memory or doubled coverage | `isolate: false` (#6331) | Use a Stryker-only Vitest config with `isolate: true` |
| Flaky behaviour under threads | Pool mismatch | `"vitest": { "pool": "forks" }` (10.1+) |
| Baseline tests fail only in the copy | Environment-dependent tests (terminal width, absolute paths) | Exclude those files in a Stryker-only Vitest config and record them as out of scope |

`inPlace` writes mutants into real files. Stryker restores them at the end, but
an interrupted run can leave a mutant behind. Never use `inPlace` in the user's
working checkout. Create the copy with the repository's own VCS tooling or a
plain file copy, and diff the source against the original afterwards.

## False survivors

Open Vitest-runner issues can report a mutant as `Survived` when it was not
tested properly:

- #6335: bail race with Vitest 5 (avoid with `disableBail`).
- #6213: mutants with `testsCompleted: 0` reported as survivors.
- #6256: when no test covers any mutant in a narrow range, all mutants run
  against all tests and come back `Survived` instead of `NoCoverage`.

`summarise-report.mjs` moves survivors with no covering tests or zero completed
tests into "suspect survivors". Confirm a suspect, or any survivor that looks
obviously killable, with a narrow re-run before writing tests for it:

```bash
npx stryker run reports/mutation/stryker.config.json --force --mutate "src/rate-limit.ts:41-41"
```

Always pass the config path, or Stryker silently runs with defaults (no JSON
reporter, bail on). A single-line range needs both ends (`:41-41`); `:41`
selects nothing. A narrowed run rewrites `mutation.json` for that slice only,
so compare it with `before.json` rather than treating it as the whole scope.

## Reducing noise

- Do not exclude `StringLiteral` wholesale: equality checks against string
  constants (`status === "new"`) are real behaviour and arrive as string
  mutants.
- Prefer a reasoned directive on the specific line:
  `// Stryker disable next-line StringLiteral: span name is not observable`.
  Disabled mutants stay in the report as `Ignored` with the reason.
- Use `mutator.excludedMutations` only for whole categories the user agrees are
  not behaviour in this codebase.
- Keep `CallExpression` mutants: they find side effects no test observes.
- Adding directives changes production files; in `audit-only` mode record them
  as recommendations instead.

## Fallback order

Use the first that works and say which one you used:

1. Native runner for the test framework (Vitest, Jest, Mocha, Jasmine, Karma).
2. Stryker's `command` runner (`"testRunner": "command"`) for other JavaScript
   runners such as `node:test`. It has no per-test data, so test-level
   judgements need manual confirmation.
3. The ecosystem's own mutation tool for other languages (for example
   mutmut, cargo-mutants, PIT), summarised by hand into the same verdicts.
4. Manual mode: when no tool can run, work one source module at a time. For
   each behaviour the tests claim, write one production-only regression and
   check it with `scripts/try-regression.mjs`, which runs in a temporary copy
   and never edits the checkout. Record `engine: "manual"`. A `MISSED`
   regression becomes a `gap` cluster whose `mutants` entry describes it, for
   example `"manual: src/payment.mjs:12 refund ignores currency"`, with the
   `try-regression` output in `reason`. Summarise `CAUGHT` checks per test file
   in the final report; they need no notes entry.
5. Otherwise mark the scope `blocked` with the concrete reason.
