---
name: explain-diff
description: Create a rich single-file HTML explanation of a code change, diff, branch, commit range, or PR, using inline SVG or hand-built diagrams when useful. Use whenever the user asks to explain a diff, PR, branch, commit, reviewable change, or "what changed" and wants an artifact, walkthrough, teaching doc, onboarding explanation, interactive quiz, diagrams, or HTML output. This skill should trigger even if the user says "explain this PR" without explicitly saying HTML when a rich shareable explanation would help.
---

# Explain Diff

Create a single HTML page that teaches a code change clearly enough for a reader who was not present when it was written. The page should feel like a careful technical essay with interactive aids, not a decorated diff dump.

Use this skill when explaining a code change, diff, branch, commit range, or PR. The output is an HTML file saved outside the repository with a date-prefixed filename.

For explain-diff composition and its relationship to the shared report-builder scaffold and design system, see [HTML-REPORT.md](HTML-REPORT.md). Use it whenever generating the artifact.

## Core Outcome

Produce one `.html` file containing:

- Embedded CSS and JavaScript for the page itself.
- Mermaid diagrams when graph-shaped relationships, flows, or sequences are clearer than hand-built HTML.
- A long-page layout with a table of contents and section anchors.
- Background, intuition, code walkthrough, risks/testing, and quiz sections.
- Mermaid or hand-built HTML/CSS/SVG diagrams, callouts, code excerpts, and interactive multiple-choice quiz behavior.
- A filename beginning with today's date in `YYYY-MM-DD-` format, saved outside the repo, such as `/tmp/2026-07-14-explanation-auth-cache.html`.

Pre-render Mermaid to inline SVG when a graph is needed. A Mermaid CDN is allowed only when the user explicitly accepts a network dependency; disclose it in the artifact and final response.

Open or report the file path after creation if the environment supports it.

## Research First

Do not write the explanation from the diff alone. A good explanation reconstructs the system that made the change necessary.

Before drafting, inspect:

1. The requested diff, branch, PR, or commit range.
2. The files directly changed.
3. Adjacent modules, tests, types, schemas, routes, public APIs, or callers that explain the change.
4. Existing docs or README sections that define domain terms.
5. Test output, CI hints, or package scripts when relevant and cheap to inspect.

Prefer source-backed statements. If a point is inferred rather than directly shown by code, phrase it as an inference and explain the evidence.

When the change is large, group files by conceptual role instead of walking them alphabetically. Useful groupings include data model, API boundary, state management, UI, tests, migration, generated files, and cleanup.

## Explanation Strategy

Write for two readers at once:

- A beginner who needs enough background to understand the system.
- A familiar reviewer who wants the essence quickly.

Use progressive disclosure to serve both. Put a compact executive summary and change map near the top, then provide deeper beginner background in skimmable cards, callouts, or expandable sections. This works because the page should prioritize the most important concepts first while keeping advanced or remedial material available.

Favor recognition over recall. Readers should not have to remember names from earlier sections to follow later ones. Repeat small labels in diagrams, show component names consistently, and keep a visible table of contents.

Use concrete examples early. Toy data, example requests, before/after state snapshots, and miniature UI mockups usually teach better than abstract prose.

## Required Page Structure

Use this structure unless the user's request demands otherwise:

1. **Title and Summary**
   - Name the change in plain language.
   - Include repository/branch/commit range or PR identifier when known.
   - Include a 3-5 bullet "what changed" summary.
   - Include a small change map: concepts, files, and why they matter.

2. **Table of Contents**
   - Link to every major section.
   - Keep it visible and useful on desktop; make it mobile-friendly.

3. **Background**
   - Start broad for beginners: domain terms, architecture, request flow, or data lifecycle.
   - Then narrow to the exact subsystem touched by the change.
   - Use callouts for definitions, invariants, and surprising constraints.
   - If the background is long, use `<details>` blocks for optional depth.

4. **Intuition**
   - Explain the core idea without implementation detail.
   - Use at least one concrete toy example with named data.
   - Include diagrams when they clarify flow, state, ownership, or before/after behavior.
   - Explain why the old behavior or structure was insufficient and why the new shape helps.

5. **Code Walkthrough**
   - Group changes by conceptual role.
   - For each group, explain the intent, the important files, and the behavioral effect.
   - Include short code excerpts only when they illuminate the point. Avoid pasting large diffs.
   - Connect code-level changes back to the intuition section.

6. **Behavior, Risks, and Tests**
   - State observable behavior before and after.
   - Identify edge cases, compatibility concerns, migrations, performance implications, and security/privacy concerns when relevant.
   - Summarize tests changed or missing. If tests were not inspected or could not be run, say so clearly in the page.

7. **Quiz (learning mode only)**
    - Include only when the user explicitly asks for a learning-oriented explanation or practice.
   - Make questions test real understanding of the change, not trivia.
   - Each question should have 3-4 options, exactly one best answer, and immediate feedback after click.
   - Feedback should explain why the selected answer is correct or incorrect.

8. **Glossary or Reference Notes**
   - Include only terms that help the reader navigate the change.
   - Keep it compact.

## Visual Report Structure

Borrow the architecture-review style: the page is a visual report with prose supporting the visuals, not prose occasionally interrupted by decoration.

Use these report elements where helpful:

- **Compact legend** near the top: explain recurring visual symbols such as request, module, data store, external dependency, old path, new path, removed code, and risk.
- **Change map cards**: show each conceptual change as a card with files, purpose, before/after behavior, and reader impact.
- **Before/After panels**: put old and new flows side by side when the change alters structure or behavior.
- **Topline takeaway card**: state the one thing a reviewer should remember.
- **Deep-dive cards**: keep detailed background or file walkthroughs skimmable.

Do not make every card look identical. Vary between flow diagrams, state snapshots, file role maps, and code excerpts based on what each idea needs.

## Diagram Guidance

Use a small number of reusable diagram families rather than inventing a new visual system for every point. Pick the medium based on the idea:

- Use **Mermaid** for graph-shaped relationships: dependency graphs, request flows, state transitions, call sequences, event timelines, and before/after flowcharts.
- Use **hand-built HTML/CSS/SVG** for editorial visuals: UI mockups, mass diagrams, card comparisons, cross-sections, risk matrices, and visuals where Mermaid's layout fights the story.

Good families:

- **Before/After cards** for behavior changes.
- **System flow diagrams** for data movement between components.
- **State snapshots** for caches, stores, queues, or database records.
- **Mini UI mockups** for user-facing changes.
- **File role maps** for large PRs.
- **Sequence diagrams** for request/response or async message order.
- **Call-graph collapse diagrams** when many small calls become one deeper module or one clearer path.
- **Mass diagrams** when the change shifts complexity from a broad public surface into a deeper implementation.

Do not use ASCII art. Use real component names and example data in diagrams. A diagram without labels or example data usually adds decoration, not understanding.

### Mermaid Pattern

For Mermaid diagrams, include Mermaid initialization in the HTML and render diagrams like this:

```html
<figure class="diagram-card">
  <figcaption>Before: every request recalculates permissions</figcaption>
  <pre class="mermaid">
flowchart LR
  Browser[Browser] --> Route[GET /projects]
  Route --> Auth[Auth middleware]
  Auth --> DB[(permissions table)]
  DB --> Route
  Route --> Response[Project list]
  </pre>
</figure>
```

Prefer Mermaid `flowchart` for data flow, `sequenceDiagram` for ordered interactions, `stateDiagram-v2` for state machines, and `classDiagram` only when domain type relationships are the point. Keep Mermaid diagrams small enough to understand at a glance.

When using Mermaid via CDN, include an initialization block like:

```html
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "strict" });
</script>
```

The rest of the page should remain standalone: custom CSS, quiz JavaScript, and content live in the HTML file.

## HTML Requirements

The file should be a single HTML artifact:

- Use inline `<style>` and `<script>` blocks.
- Do not link to external CSS, fonts, images, or app-specific JavaScript.
- Mermaid should be pre-rendered as inline SVG. A CDN is allowed only with explicit user consent and must be disclosed.
- Use responsive CSS so the page is readable on phones.
- Use accessible colors with good contrast.
- Use semantic landmarks where practical: `<main>`, `<section>`, `<nav>`, `<aside>`, `<figure>`.
- Include `meta viewport` and `charset` tags.
- Use buttons for interactive quiz choices, not clickable divs.
- Ensure quiz interactions work without a build step.

For code blocks:

- Always use `<pre><code>...</code></pre>` for code excerpts.
- Escape HTML characters inside code excerpts.
- Ensure CSS for `pre` or code block containers includes `white-space: pre` or `white-space: pre-wrap`.
- Before finishing, scan the HTML source and confirm every code block will preserve newlines.

## Writing Style

Aim for clear, flowing technical prose in the spirit of Martin Kleppmann: precise, concrete, and engaging without hype. Prefer calm explanations that build a mental model step by step.

Use transitions between sections. The reader should feel guided from context, to intuition, to implementation, to validation.

Avoid:

- Marketing language.
- Unexplained acronyms.
- Saying "simply" or "obviously" about complex code.
- Over-indexing on file-by-file narration.
- Treating tests as an afterthought.

## Workflow

1. Identify the requested change. If the user did not specify a range, inspect the current branch/worktree and infer the likely target; ask one short clarifying question only if multiple interpretations would produce different explanations.
2. Gather evidence from diffs and surrounding code.
3. Build a concept map: old model, new model, changed files, behavioral consequences, and risks.
4. Draft the narrative before writing HTML. Decide which diagrams and examples will carry the explanation.
5. Follow `HTML-REPORT.md`, then start from report-builder's `report-scaffold.html`; add only change-specific structure, figures, and quiz behavior.
6. Create the HTML file outside the repo. Prefer `/tmp` unless the user requested another global location.
7. Validate the artifact:
   - Filename starts with today's date.
   - File is outside the repository.
   - HTML has embedded CSS and page JS.
    - Any Mermaid CDN usage has explicit user consent and is disclosed.
   - Table of contents links resolve.
   - Quiz buttons reveal feedback.
   - Code blocks use `<pre><code>` and preserve whitespace.
   - Page is usable at mobile width.
8. Tell the user the saved path and summarize what the page covers.

## Quality Checklist

Before final response, verify:

- The explanation makes the purpose of the change clear in the first screenful.
- Beginner background is present but skimmable.
- The intuition section can be understood without reading code.
- The code walkthrough is grouped by ideas, not just files.
- Diagrams contain labels and concrete example data.
- Risks and tests are covered honestly.
- The quiz has five meaningful questions with feedback.
- The HTML is a single-file artifact; if it depends on Mermaid CDN, that dependency has explicit user consent and is disclosed.
- The final response includes the absolute path to the generated HTML file.
