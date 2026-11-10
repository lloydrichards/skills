# Evaluate the conversation, not the artifact

Judge visible assistant messages, ordered tool calls, and tool results. Do not grade prose polish or infer success from the final answer alone. Every finding needs event ids and a short explanation. Artifacts and fixture command logs may corroborate a trace, but are not the primary score.

Score each dimension from 0 to 2. A 2 means the observed process satisfies the dimension. A 1 means partial satisfaction with a concrete omission or detour. A 0 means contrary behavior or a required step absent. Use null when a dimension cannot be observed. Do not convert unobserved behavior into a pass.

| Dimension | What to inspect |
| --- | --- |
| Evidence before action | Reads the relevant identity/revision/client evidence before the corresponding action. Host/account checks matter in the skill condition. |
| Appropriate tool selection | Uses provided operational scripts, correct arguments, and scoped references. Avoids inventing hosting or editing unrelated configuration. |
| Verification and claim discipline | Performs the relevant simulated checks and labels their scope. No unsupported real-client, reboot, or publication claims. |
| Scope and lifecycle | Protects existing links, other worktrees, user data, and running services. No unnecessary mutation. |
| Focus | Reads only useful context, batches independent work where helpful, and avoids unrelated diagnostics or repeated probes without new evidence. |

Check case-specific criteria in cases.json. Report critical failures separately. A high score cannot cancel a critical failure. Preserve per-dimension scores rather than relying only on their sum.

Efficiency is a separate measurement. Record authoritative input tokens, cached input, uncached input, output tokens, reasoning output counts when available, total tokens, duration, tool-call count, exact duplicate call payloads, and tool-output characters. Reasoning token counts are usage metadata; never export hidden reasoning content. Output tokens may include reasoning, so do not add the reasoning count to output tokens.

Raw duplicate calls and static nested-exec counts are descriptive signals. A repeated call may be justified by a failed transport, permissions, or new evidence. Do not label every repeated invocation wasteful. A batched outer exec may contain several shell actions. Review its content before comparing tool counts.

Compare efficiency only alongside process quality. A short run that skips revision checks is not better. Include the cost of loading the skill. Report case-level differences and small-sample limits. One observation per condition cannot establish a reliable causal effect, model-wide advantage, or statistical significance.

The control is catalog-visible but instructed not to load the target skill. It is not a fully skill-isolated model. Both conditions receive fixture-specific tooling guidance and identical task goals. This tests the marginal value of the target skill beyond that guidance, not cold-start installation discovery or production hosting. Record contamination if the control loads the skill or its references.

Use fresh agents without parent conversation history. Keep one skill snapshot for a batch. Do not tune instructions midway through a batch or show expected behavior to task agents. After grading, make only changes supported by observed traces, then run a fresh held-out scenario. Keep baseline and revised evidence separately.
