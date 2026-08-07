# Local skill-eval harness

This is a deliberately small, local-first harness for behavioural skill evals.
Pi is only the executor. Pass/fail is determined by the fixture's test command,
an allowlist of changed paths, and a structured terminal state; no second model
grades a required check.

## Run

```sh
bun tools/skills-eval/run.ts --skill gauntlet-loop --eval bounded-retry-parser-fix --dry-run
bun tools/skills-eval/run.ts --skill gauntlet-loop --eval bounded-retry-parser-fix
bun tools/skills-eval/run.ts --skill gauntlet-loop --eval bounded-retry-parser-fix --model openai-codex/gpt-5.5
bun tools/skills-eval/run.ts --skill gauntlet-loop --eval bounded-retry-parser-fix --allow-host-tools
bun tools/skills-eval/run.ts --skill gauntlet-loop --eval bounded-retry-parser-fix --json
bun tools/skills-eval/matrix.ts
bun tools/skills-eval/matrix.ts --skill gauntlet-loop --models openai-codex/gpt-5.5,openai-codex/gpt-5.6-terra,openai-codex/gpt-5.6-sol
```

The runner creates a disposable copy of the declared fixture, invokes Pi with
the selected `SKILL.md`, records Pi's JSONL stream, then emits `result.json`.
Its run directory is under `.skills-eval-runs/`, which stays ignored.

Normal runs print a compact human summary. Add `--json` for the complete
machine-readable result, including the Pi trace, test output, and diagnostics.

## Compare the whole suite

`matrix.ts` finds every `skills/*/evals/evals.json` case and runs each case
against the configured models sequentially when the case has the deterministic
fixture/harness contract. Older prompt-only evals are shown as skipped rather
than counted as model failures. By default it compares
`openai-codex/gpt-5.5`, `openai-codex/gpt-5.6-terra`, and
`openai-codex/gpt-5.6-sol`, then prints a compact matrix:

```text
| skill/eval | gpt-5.5 | gpt-5.6-terra | gpt-5.6-sol |
| --- | --- | --- | --- |
| gauntlet-loop/bounded-retry-parser-fix | PASS | PASS | FAIL |
```

Use `--skill`, `--eval`, or a comma-separated `--models` list to narrow the
matrix. Model names may omit the `openai-codex/` prefix. `--json` emits the matrix plus each underlying single-run result for
automation. A matrix exits non-zero if any cell fails; failed cells name the
deterministic checks that failed. Pass `--keep-run` to retain passing fixture
directories too; failures are retained automatically.

The Pi command includes `--yolo` (`--allow-host-tools`) and sets the matching
`PI_ALLOW_HOST_TOOLS=1` process flag required by the local dev-container guard.
This is safe only because the harness starts Pi in a disposable fixture,
enables Pi's shell sandbox with networking disabled, and loads the direct-file
guard below. The guard allows read-only access to the selected skill and its
bundled references, but restricts edits to the fixture.

The default executor is Pi's ChatGPT Codex subscription route,
`openai-codex/gpt-5.5`; pass `--model` to override it. An assistant event with
`stopReason: "error"` fails the run even if Pi itself exits with status 0.

For an actual agent run, provide Pi provider credentials through its normal
environment. The runner enables Pi's sandbox extension for shell commands with
network access disabled, and loads a companion guard that restricts Pi's direct
file tools to the disposable fixture. Treat this as a local development
boundary, not a substitute for a VM/container when fixtures are untrusted.

Pass `--allow-host-tools` (alias: `--yolo`) to skip both guard extensions and
let Pi tools run directly on the host. Use this only for trusted fixtures.

## Eval contract

Each case in `skills/<name>/evals/evals.json` declares:

- a versioned fixture;
- a test command;
- an allowlist for changed paths;
- whether the skill file must appear in Pi's read trace; and
- an expected terminal state, reported as the final `EVAL_RESULT` JSON line.

The executor receives an explicit `--skill` path. This measures skill-guided
behaviour, separately from whether a particular agent's dispatcher chooses the
skill automatically.
