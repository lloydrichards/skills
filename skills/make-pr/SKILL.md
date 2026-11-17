---
name: make-pr
description: Create or update a pull request for the current work, including relevant commits, changesets, and publishing. Use when asked to make, open, prepare, or update a PR, or write its title or body. Write concise, visual PR descriptions that show the changed behavior and help the reviewer assess it.
---

# Make PR

Make the current task reviewable and publish its PR. A request only to draft or edit a title or body stays within that scope.

## Understand and publish the work

- Read applicable repository instructions and inspect the actual changes against the intended base. Describe the final implementation, including relevant committed and uncommitted work, rather than the conversation or abandoned approaches.
- Identify the current task's changes. Leave unrelated edits, scratchpads, and temporary research out of commits. Ask only when the intended scope or destination cannot be established from the session and repository.
- Use the `but` skill for commits, branches, pushes, and PR creation. Preserve stack relationships and choose the correct base. Follow its current command guidance rather than duplicating its mechanics here.
- Apply the `changeset` skill when release notes are required. Finishing or skipping that subtask does not end PR preparation. Keep a required changeset with the implementation it documents.
- Run the repository's required checks and any focused verification warranted by the change. When adding a workspace or test target, use the task graph, a dry run, or CI logs to verify that the root CI commands select its applicable tests and type checks. Where workflows use path filters, verify that its files trigger them. Fix relevant failures. Leave validation evidence out of the PR body. Put an unresolved readiness blocker in `Comment` and a product limitation in `Description` when relevant.
- A request to make a PR authorizes committing the task's relevant changes, pushing, and creating the PR without another confirmation. If that branch already has a PR, update it instead of opening a duplicate. Explicit requests to draft text or avoid committing/publishing take precedence.
- Create ready for review when the work is complete. Create a draft for unfinished work or unresolved dependencies. Preserve an existing PR's draft/ready status unless the user asks to change it.
- Supply the final title and body through a file or structured argument that preserves Markdown and literal code. With `but pr new`, the message file's first line is the title and the remainder is the body. The command pushes as part of creation.
- Attach every created or updated PR to the chat using the app's PR attachment tool when available. Return the PR link and any material blocker. Stop there unless the user requested CI monitoring or review follow-through.

## Title

Follow the repository's title convention, usually `feat:`, `fix:`, or a scoped equivalent. Name the concrete change. Rewrite the title if the final scope differs from the original plan.

Examples:

- `fix: preserve stateful MCP extension capabilities`
- `feat: add exact nanosecond timestamp conversions`

## Body

Use `## Goal/Scope` first, followed by `## Description`. Write one short sentence under `Goal/Scope` stating the PR's intention. Put the explanation of the changed behavior, code examples, and diagrams in `Description` without repeating that sentence.

Write for Lloyd, a visual reader who looks first at code blocks, then diagrams. Keep the description concrete and easy to scan.

Choose the clearest way to show the change before expanding the prose:

- For an API or CLI change, show a short real usage example from the final implementation.
- For a bug, show the trigger and before/after result. A small diff or output block often suffices.
- For a flow, dependency, or stack, use a compact Mermaid diagram when it makes the relationship easier to understand.
- For repeated behavior comparisons, use a small table.
- For a UI change, use an available verified screenshot when it helps. Keep private details out of images.

The visual should carry information the prose would otherwise need to explain. Keep diagrams readable at normal PR-body width; prefer a top-to-bottom layout for longer flows. State any opt-in action needed to reproduce a scenario. Remove repeated explanation. For a straightforward change, a sentence or a few bullets may be enough. Do not invent an API, output, screenshot, measurement, or verified rendering to fill the format.

Add `## Comment` after `Description` only for review-process context, such as draft status, a dependency on another PR, merge order, or review coordination. Lead that section with any readiness or merge blocker. Keep implementation details, compatibility, migration, and product limitations in `Description`. Omit `Comment` entirely when there is no process context. Honor genuinely required repository fields and checkboxes.

There is no minimum word count. Keep ordinary bodies under 200 words of prose when possible. Give substantial design decisions or migrations the space they need. Keep code and diagrams compact too.

Do not add validation, testing, evidence, or confirmation sections. Do not narrate test results, regression coverage, or proof that the change is correct. Rely on CI for validation status. Omit command logs, passing-test counts, release-note bookkeeping, agent activity, and publication history. A required repository testing field gets a brief, truthful answer.

Apply technical-writing and unslop for plain language. Keep details only when they help the reader understand behavior, assess a tradeoff, or find context. Link issues accurately. Claim closure only when the final change resolves the issue. For each resolved issue, append a horizontal rule and a checked closure item at the end:

```markdown
---

- [x] closes #123
```

Before publishing, inspect the body as a reader. Does `Goal/Scope` state the intention in one line? Does `Description` show what changed? Is `Comment` needed for review-process context? Remove repeated explanation and validation evidence. If you read only an excerpt of this skill, read the full file before publishing.

## Example

This bug-fix body shows the effect directly:

````markdown
## Goal/Scope

Render borders correctly for zero-row content.

## Description

Bordering zero-row content added a spurious middle row. The border now draws only its enabled horizontal edges.

```diff
  ┌───┐
- │   │
  └───┘
```

The declared width still includes enabled vertical sides. With both horizontal edges disabled, the result has zero rows.
````
