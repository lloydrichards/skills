---
name: make-pr
description: Create or update a pull request for the current work, including relevant commits, changesets, and publishing. Use when asked to make, open, prepare, or update a PR, or write its title or body. Write concise Goal/Scope, Description, and Comment sections in the user's preferred style.
---

# Make PR

Make the current task reviewable and publish its PR. A request only to draft or edit a title or body stays within that scope.

## Understand and publish the work

- Read applicable repository instructions and inspect the actual changes against the intended base. Describe the final implementation, including relevant committed and uncommitted work, rather than the conversation or abandoned approaches.
- Identify the current task's changes. Leave unrelated edits, scratchpads, and temporary research out of commits. Ask only when the intended scope or destination cannot be established from the session and repository.
- Use the `but` skill for commits, branches, pushes, and PR creation. Preserve stack relationships and choose the correct base. Follow its current command guidance rather than duplicating its mechanics here.
- Apply the `changeset` skill when release notes are required. Finishing or skipping that subtask does not end PR preparation. Keep a required changeset with the implementation it documents.
- Run the repository's required checks and any focused verification warranted by the change. When adding a workspace or test target, use the task graph, a dry run, or CI logs to verify that the root CI commands select its applicable tests and type checks. Where workflows use path filters, verify that its files trigger them. Fix relevant failures. Omit routine check results from the PR body; disclose a material unresolved failure or limitation briefly when it affects review or readiness.
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

Use these headings, in this order, even when the repository's template uses different headings. Keep any genuinely required repository fields or checkboxes with the relevant content rather than substituting another body structure.

```markdown
## Goal/Scope

Explain the problem or capability and why this change is needed.

## Description

Describe the resulting behavior and the implementation details that help someone review it.

## Comment

Include useful issue links, limitations, compatibility notes, or review guidance when applicable.
```

Keep all three headings. Leave `Comment` empty when there is nothing useful to add. Do not fill it with "None", a recap, or validation boilerplate.

Aim for 100–200 words of prose. Keep ordinary PRs under 300 words. Treat code separately from the prose budget, but keep it short. Longer bodies are justified when a substantial design decision or concrete example needs the space, not because the diff touches many files.

Write for a reviewer who has not read the chat:

- Lead with the reason for the change, then explain the behavior it produces. For a bug, a short trigger and before/after example often says more than a file list.
- Include a small code example when it clarifies usage or changed behavior. Use actual APIs from the final implementation. Skip diagrams, trees, and examples that repeat what the prose already says.
- Include meaningful performance or memory tradeoffs, breaking changes, migration instructions, and known limitations when they affect the review. Keep measurements accurate and compact.
- Mention a test only when the regression it covers explains the fix. Omit routine validation sections, command lists, passing-test counts, CI status, agent activity, publication-hook history, and generic risk labels. A required testing field gets a brief, truthful answer.
- Link relevant issues. Claim closure only when the final change resolves the issue. Use a non-closing reference in `Comment` for partial work.
- Apply `technical-writing` and `unslop` for plain language. Do not import another PR template from a writing skill. Prefer short connected prose; use bullets for genuinely parallel changes.
- Keep only details that help someone understand the change, assess a tradeoff, or find relevant context. Do not paste the implementation history, a validation report, or an inventory of changed files.

When the PR closes an issue, append a horizontal rule and a checked closure item at the very end of the body, after `Comment`. Use one item per issue and its actual number. Omit this footer when no issue is resolved.

```markdown
---

- [x] closes #123
```

## Example

```markdown
## Goal/Scope

Prevent the workbench from showing stale JavaScript when an edited import becomes a CommonJS `require`.

## Description

Compile both editable sources as roots so the emitted output updates after either source changes. Previously, the second source could disappear from the compiler's import graph and leave its old output visible.

## Comment

The example keeps both module formats editable so the behavior is easy to compare.
```
