# Run a conversation-process evaluation

This framework evaluates what a task agent reads, calls, checks, changes, and claims. It does not score the aesthetic or technical quality of a generated artifact. The simulator supplies task feedback without exposing live services to evaluation mistakes.

## Prepare a batch

Run `python3 evals/plan.py /tmp/unique-evaluation-directory --parent CURRENT_THREAD_ID` from the skill directory. The command creates isolated fixtures, a frozen skill snapshot, hashes, and `launch.json`. Prepare a new directory for every batch. Reuse neither mutable fixture state nor an agent conversation.

Spawn each job using the native collaboration tool with its exact prompt, task_name, and `fork_turns: none`. Do not change the model or reasoning setting between conditions. Do not send coaching, expected answers, or suspected issues to task agents. Record completion and any environment interruption. Fixtures permit local mutations only; fixture URLs are deliberately not routable.

The first exploratory batch in this chat used the same protocol with prompts dispatched manually before the reusable planner was written. Its manifest records that distinction. Initial agents read the original source skill. Later runs must use the frozen snapshot from the planner.

## Capture native traces

After each agent completes, run:

```bash
python3 evals/trace.py --parent CURRENT_THREAD_ID \
  --agent /root/EXACT_AGENT_PATH --output /tmp/run/traces/RUN_ID.json
```

The extractor reads only the named child metadata and its native rollout. It exports visible messages, tool calls, and tool results. It excludes reasoning content, system messages, and developer messages. Treat traces as private until reviewed for credentials and other sensitive data. Do not commit machine histories or raw run traces to this repository.

Usage comes from deduplicated native response records. Never sum cumulative thread usage. Missing usage stays unknown. Cached input, uncached input, output, and reasoning-token counts remain separate. These are token counts, not monetary cost estimates. Provider cache state and common instruction overhead can influence comparisons.

Outer function calls are authoritative tool-call counts. Static mentions of nested exec calls are a lower-fidelity diagnostic because loops and maps can invoke tools dynamically. Exact duplicate payloads are not automatically waste. Native timing and task completion fields may be missing; do not invent them.

## Grade and improve

Give a fresh reviewer rubric.md, cases.json, and normalized traces. Do not give it preferred conclusions. Require event-id evidence, per-dimension scores, critical failures, and limitations. Review final claims against tool results, not final-answer confidence. Review the trace before using fixture artifacts as corroboration.

Compare each task and condition before aggregating. Report counts and denominators. A catalog-visible control with an instruction not to load the target skill does not prove complete isolation. The fixture tooling guide gives both groups useful knowledge, so this estimates marginal value beyond that guide. Three pairs with one sample each are exploratory; they cannot establish statistical significance or generalize to unfamiliar production tasks.

Change the skill only for observed failures or unnecessary work. Freeze the revised snapshot and use a fresh held-out task for a directional retest. Do not compare a revised run with a baseline task it already practiced and call that independent validation. Publish the report and reviewed visible traces centrally, outside Git. Keep framework source and synthetic tests in evals/.

## Compare a proposed revision with the installed skill

Freeze the baseline before making changes. From the skill directory:

```bash
eval_run=/tmp/unique-round-directory
mkdir -p "$eval_run/baseline"
cp SKILL.md "$eval_run/baseline/"
cp -R references "$eval_run/baseline/"
```

Edit the candidate, then run `python3 evals/round2.py "$eval_run" --parent CURRENT_THREAD_ID`. This freezes the candidate and prepares the eight matched jobs in round2-cases.json. Use the exact prompts with fresh agents. Keep both versions and the rubric unchanged during the batch. Capture each child with trace.py and retain its case, condition, and repetition alongside the normalized trace. Give a fresh reviewer both versions under identical process standards without describing the preferred outcome.

The round-2 fixture seeds published report files, uses real local Git worktrees, limits client DNS failures to the DNS scenario, and rejects missing report paths or an incorrect TLS-bypass port. These are controlled observations, not real networking. The source fixtures changed after round 1; comparisons between versions must use the same batch, not different fixture generations.

The native exporter retains response_usage as well as totals so cache misses can be inspected. Do not drop an inconvenient zero-cache response or report a hypothetical cache-adjusted saving. Auxiliary skill reads can also vary; disclose that attribution limit.

Use `python3 evals/round2_report.py RUN OUTPUT --scaffold PATH_TO_REPORT_SCAFFOLD` after review.json is ready. It reuses the conversation viewers and records the version diff, usage tables, review, prompts, and hashes. The current report narrative describes the recorded round-2 experiment; update its claims when interpreting a different experiment rather than treating its conclusions as generic generated grading.

## Exercise failure cases without rebooting

Run `python3 evals/failures.py /tmp/unique-failure-batch`. This freezes the current skill and prepares the five tasks in failure-cases.json. Use the exact launch.json prompts with fresh subagents. The simulated execution target is explicit in context.json and observed through tools/identity.sh; the runner's real hostname is not that target. Administrative, loopback, route, and private HTTPS observations come from isolated tools. Real networking, global changes, and reboot commands are excluded.

Use a separate read-only backend auditor with copied scripts and mocks. Conversation success alone cannot establish implementation safety. Keep independent reproduction evidence, prove defect tests fail against the original implementation, and add durable regressions before deployment. A staged fix is not an installed fix; record both validation and installation status.

After a demonstrated issue, freeze the revised references and prepare a fresh retest with failures.prepare. The corruption case is available as `corrupt-allocation`. Capture native traces and have the reviewer distinguish simulated HTTP/HTTPS origins, blocked read-only help from mutation, and pending delivery from false readiness.

The recorded study corrected an overly broad HTTPS fault that also intercepted loopback HTTP. Its initial and corrected simulator snapshots remain in the published report. Do not silently combine those runs into a causal version comparison. The associated report generator is failures_report.py; its narrative describes that recorded experiment and must be updated for a different study.
