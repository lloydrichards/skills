---
name: comment-auditor
description: |
  Audit and improve code comments, inline notes, TODO/FIXME/HACK/NOTE codetags, doc comments, and generated-template comments as durable context for humans and AI coding agents. Use when reviewing comments, adding TODOs, cleaning up comment quality, checking context engineering in code, or after code changes that may have left stale, redundant, misleading, vague, or unowned comments.
version: "0.1.0"
---

# Comment Auditor

You audit comments as durable context. A useful comment helps a future human or coding agent understand a constraint, invariant, domain rule, external dependency, known debt, or non-obvious decision. A bad comment is not harmless: it can become stale context that future agents preserve, amplify, or rely on incorrectly.

Use this skill alongside code cleanup skills such as `deslop`. The cleanup skill simplifies code shape; this skill decides which comments still earn their place after the code is clear.

## Core Rule

A comment earns its place only if it adds context not already carried by code, names, types, tests, schemas, or nearby documentation.

Prefer deleting a redundant comment or improving names/code structure over adding narration. Prefer rewriting a vague comment into specific durable context over leaving it as a weak marker.

## Comment Value Test

For every inline or nearby comment in scope, ask:

1. Is it accurate after the current code change?
2. Who is the intended reader: current implementation maintainer, public API caller, generated-project maintainer, or future coding agent?
3. Does it explain why, when, or under what constraint, rather than restating what?
4. Would that reader make a better decision because this exists?
5. Is it close enough to the code it describes to stay maintained?
6. If it records debt, is the next action or removal condition clear?

If the answer is no, delete it, rewrite it, move it to a better location, or encode the idea in code/tests/docs instead.

## Comment Kinds

Evaluate comments by kind; a useful doc comment and a useful inline comment earn their place differently.

- **Inline/local comments**: Should explain nearby rationale, constraints, invariants, ordering, or non-obvious behavior. Delete narration of simple mechanics.
- **Doc/API comments**: Should describe public contracts, boundary conditions, mini-languages, schemas, generated output, or usage that callers cannot infer from the signature alone.
- **Codetag comments**: Should represent actionable or durable metadata with a clear tag and enough context to act later.
- **Section banners**: Should be rare in ordinary implementation code. Keep short navigation markers when they help maintain long registry, catalog, or template-content files; otherwise prefer smaller functions or clearer module organization. Large decorative banners in generated output usually need deletion or tightening.
- **Generated-template comments**: Audit both layers of meaning. A comment inside a catalog/template string may be intended for the generated project, not for the generator itself. Preserve it if it helps the generated code's future reader.
- **Extension-point comments**: Keep comments that explain why an otherwise-empty placeholder, slot, or subcommand list exists, especially when generated users or future modules are expected to extend it.
- **Parser/AST comments**: Keep compact comments that map hard-to-read structural checks to source syntax, especially with examples such as property access, identifiers, curried calls, generated slots, or emitted code forms. Delete comments that only restate traversal mechanics or library method names.

## Decision Ladder

When a comment feels weak, choose the least destructive useful action:

1. **Keep** when it carries accurate context that code cannot express cleanly.
2. **Tighten** when it has the right idea but too many words.
3. **Retarget** when it addresses the wrong audience, especially in generated-template code.
4. **Rewrite** when it should explain a constraint, invariant, rationale, or removal condition.
5. **Move** when it belongs in an issue, README, API docs, test name, or generated output instead of local code.
6. **Delete** when it only narrates mechanics or has become stale/misleading.

This order matters: the goal is high-signal context, not comment minimalism for its own sake.

## Codetag Taxonomy

Use short, grep-able codetags when the comment represents actionable or durable metadata. Tags should be semantically distinct and lightweight.

- `NOTE`: Durable context: constraints, invariants, domain rules, external behavior, historical decisions, or maintainer guidance.
- `TODO`: Future work that is intended but not required for current correctness. State the specific next action.
- `FIXME`: Known incorrectness, cleanup, or design debt that should be fixed before the code is considered healthy.
- `BUG`: Known defect. Include reproduction context, issue link, or affected condition when available.
- `OPTIMIZE`: Known performance opportunity. Include the bottleneck, measurement, or expected scale concern.
- `HACK`: Intentional workaround. Explain the forcing constraint and the removal condition.
- `XXX`: High-risk attention marker. Use sparingly for code that is dangerous, surprising, or likely to mislead maintainers.
- `[ ]`, `[x]`, `[-]`: Temporary implementation checklist items. Keep them out of long-lived production code unless the repository explicitly uses source comments as a task list.

Prefer this shape:

```ts
// HACK: Work around upstream parser bug #123; remove after parser v2.4.
```

Avoid this shape:

```ts
// HACK
// TODO fix later
// increment the counter
```

## Comment Smells

Treat these as prompts to inspect, not automatic failures:

- **Restates code**: The comment narrates a nearby expression, branch, or assignment without adding intent.
- **Stale assertion**: The comment describes behavior, limits, or dependencies that no longer match the code.
- **Wish with no handle**: `TODO`, `FIXME`, or `OPTIMIZE` says "clean up", "improve", or "make better" without a concrete next action.
- **Unowned debt**: The comment records debt but has no issue link, owner, removal condition, or clear local action.
- **Mystery workaround**: `HACK` says something is weird but not what constraint forced it.
- **LLM bait**: The comment sounds authoritative while being speculative, copied from an old plan, or not grounded in current code.
- **Commented-out code**: Deleted code should live in version control, not source comments.
- **Context duplication**: The comment repeats a README, test name, type, schema, or obvious function name without localizing why it matters here.
- **Overloaded tag**: A `TODO` describes a bug, a `NOTE` hides a warning, or `XXX` is used as a casual placeholder.
- **Temporal drift**: Words like "temporary", "for now", "currently", or "soon" appear without a date, version, issue, or removal condition.
- **Section-banner camouflage**: A large banner hides that a file wants smaller functions/modules, or repeats what the next declaration already says.
- **Generated-context mismatch**: A comment in a template is judged only against the generator, ignoring the generated project's reader.
- **Audience mismatch**: A comment gives API usage detail to an implementation maintainer, or local implementation trivia to a public/generated-code reader.
- **Weak codetag syntax**: A tag appears without a colon, action, rationale, or enough text to be grep-visible and useful in a task list.
- **Stale migration note**: Phrases like "unchanged from before", "old version", or "instead of X" preserve edit history rather than durable context. Rewrite as stable rationale or delete.
- **Boundary vocabulary drift**: The comment uses lifecycle language such as "plan", "apply", "create", "modify", "validate", "merge", or "conflict" imprecisely. In planning/scaffolding code this can mislead future agents into moving policy across boundaries.
- **Operation-label noise**: A comment only maps one obvious operation tag or branch to another obvious name. Keep operation-family comments only when they explain grouping, ordering, one-to-many lowering, optional paired operations, or a policy boundary.
- **Weak suppression rationale**: A lint/type suppression says "easier", "generated code", or "temporary" without explaining why the rule is safe to suppress or what typed alternative would remove it.

## Rewrite Patterns

When a comment fails the value test, choose the smallest useful fix:

- **Keep** if the comment carries accurate context that future readers need.
- **Tighten** if it is useful but wordy.
- **Rename or restructure code** if the comment is compensating for unclear names.
- **Rewrite as context** if the comment should explain a constraint, invariant, external behavior, or rationale.
- **Rewrite as a codetag** if it is actionable work or known debt.
- **Move to docs or an issue** if the comment is broad project planning rather than local code context.
- **Add a removal condition** for temporary workarounds and compatibility shims.
- **Retarget generated comments** if the comment belongs to generated output but currently describes generator internals, or vice versa.
- **Preserve syntax-shape examples** when the code inspects a representation instead of direct source code. A short example can be the only bridge between AST/parser APIs and the source syntax maintainers recognize.
- **Rewrite boundary comments** so they name the actual lifecycle stage and invariant. For example, prefer "existing files are classified as modify so apply-time composition can validate targets" over "then applies composition operations" inside a planner.
- **Delete** if the code is clear and the comment only narrates mechanics.

Examples:

```ts
// Bad: narrates mechanics
// Get modules and map them
const modules = catalog.getModules({ category }).map(toChoice);

// Better: delete the comment
const modules = catalog.getModules({ category }).map(toChoice);
```

```ts
// Bad: unowned debt
// TODO: clean this up

// Better: specific local action
// FIXME: This accepts duplicate module IDs; dedupe before passing into BlueprintService.
```

```ts
// Bad: mystery workaround
// HACK: weird Effect CLI thing

// Better: constraint + removal condition
// HACK: Effect CLI drops nested parse errors here; keep this explicit message until structured diagnostics are exposed.
```

```ts
// Bad: vague importance
// Important!

// Better: durable invariant
// NOTE: Plan remains policy-free here; apply decisions are validated later by ApplyService.
```

```ts
// Bad in generated output: generator-internal planning
// If this duplication grows after the interactive chat command lands, move it later.

// Better outside the template string: catalog-maintainer context
// NOTE: Generated CLI chat intentionally avoids server/RPC imports; extract only if another generated target needs this conversion.
```

```ts
// Good generated-project context
// Subcommands are injected by selected modules; keep the empty list so generated apps have a stable extension point.
```

```ts
// Good AST-shape context
// For curried calls, append to the outer invocation so generated arguments land in the runtime call, not the callee factory.
```

```ts
// Bad boundary context in planning code
// Creates file, then applies composition operations.

// Better
// Existing files are classified as modify; apply-time composition validates and mutates the target call.
```

## Review Workflow

1. Identify changed files or the user-requested scope.
2. Search for comments and codetags with `rg`, including `TODO|BUG|FIXME|NOTE|OPTIMIZE|HACK|XXX|\\[ \\]|\\[x\\]|\\[-\\]`.
3. Identify the comment kind before judging quality: inline/local, doc/API, codetag, section banner, or generated-template comment.
4. Identify the intended reader before deciding whether the context is valuable.
5. Read enough surrounding code to verify each comment against current behavior and intended audience.
6. Classify each comment: keep, tighten, rewrite, retarget, move, delete, or turn into a codetag.
7. Apply only behavior-preserving edits unless the user asked for broader code changes.
8. Report meaningful comment changes and any intentionally retained comments that might look suspicious but carry real context.

## Output Style

For code review, lead with actionable findings:

- File and line.
- Comment text or tag.
- Problem: stale, redundant, vague, unowned, misleading, or valuable.
- Suggested rewrite or deletion.

For editing tasks, keep the final summary short: what comments were deleted, rewritten, added, and why.
