# Explain Diff HTML Report

This is the canonical page-composition specification for `explain-diff`. The skill's `SKILL.md` defines what must be learned and how to investigate it; this file defines how that teaching sequence becomes a consistent HTML artifact.

Read the shared [Design System](../report-builder/DESIGN-SYSTEM.md), [Explain profile](../report-builder/references/profiles/EXPLAIN.md), [Learning profile](../report-builder/references/profiles/LEARNING.md), and [Evidence guidance](../report-builder/references/EVIDENCE-AND-SOURCES.md). Begin with [report-scaffold.html](../report-builder/report-scaffold.html). Do not copy or redefine its tokens, ordinary-element styles, shared components, theme behavior, accessibility rules, or print behavior.

## Canonical learning sequence

Choose only sections that advance the reader's mental model, but preserve this reasoning order:

1. **Orientation** — what changed, why it matters, the learning outcome, scope, and one-sentence model.
2. **The relevant system before** — only the prior concepts, flow, and invariants needed for this change.
3. **Why the prior model was insufficient** — a concrete failure, constraint, or opportunity.
4. **The new model** — intuition before implementation, preferably with a before/after figure.
5. **A worked example** — named data traced through old and new paths, with prediction points.
6. **How the code realizes the model** — a literate walkthrough grouped in causal or dependency order.
7. **Consequences and limits** — behavior, tests, trade-offs, risks, unknowns, and evidence boundaries.
8. **Check your model** — five retrieval/application questions and one transfer prompt, unless intentionally omitted under the skill's quiz rule.

Section headings should communicate the specific claim. The labels above describe functions, not mandatory visible titles.

## Three reading depths

### Glance

The first screenful should contain:

- the change in plain language;
- why the reader should care;
- the one-sentence mental model;
- what the reader should be able to explain or predict afterward;
- compact scope and evidence boundaries when they materially affect trust.

Use a summary card only when it makes this orientation faster to grasp.

### Scan

Headings should expose the causal story by themselves. Keep the worked example's names and component labels consistent across prose, diagrams, and code references. Put evidence states and source actions beside the claims they qualify.

### Inspect

Use native `<details>` for optional prerequisites, secondary code excerpts, full test matrices, alternative paths, glossaries, and long references. Keep the mental model, worked example, material evidence, risks, and limits visible.

## Teaching components

### Before/after model

Use the smallest comparison that reveals the changed responsibility, rule, ownership, state, or flow. Do not compare screenshots or diagrams that differ in many irrelevant ways. Label both the stable parts and the changed part so the reader knows what to attend to.

### Worked example

Prefer an annotated sequence, state table, or paired trace. Use concrete values such as `invoiceId = 42`, not placeholders like `foo`. Show the decision at each step and connect it to a source boundary. A useful pattern is:

```html
<figure>
  <figcaption>Invoice 42 now invalidates only its own cache entry.</figcaption>
  <!-- Annotated old/new trace using shared tokens -->
</figure>

<a class="source-ref" href="https://host/repo/blob/7ab31f2/src/invoices/cache.ts#L12-L16">Inspect invoice-key construction · L12–16</a>
```

### Literate code walkthrough

Each conceptual group should open with its behavioral claim, then show only the excerpt needed to support it. Follow the execution, data, or dependency path. Put secondary syntax and mechanical edits behind a disclosure.

```html
<section id="targeted-invalidation">
  <h2>Invalidation now follows invoice identity</h2>
  <p>The mutation carries <code>invoiceId</code> into the cache boundary, allowing one precise key to be invalidated.</p>
  <a class="source-ref" href="https://host/repo/blob/7ab31f2/src/invoices/cache.ts#L12-L16">Inspect the changed boundary · L12–16</a>
  <details>
    <summary>Inspect the implementation excerpt</summary>
    <pre><code>queryClient.invalidateQueries({ queryKey: invoiceKey(invoice.id) });</code></pre>
  </details>
</section>
```

### Knowledge check

Use semantic `<button>` elements, visible focus states, and `aria-live="polite"` feedback. Reveal feedback only after selection. Vary correct-answer positions and keep options comparable in length and specificity. Feedback should explain the causal model and the misconception represented by the selected distractor.

The transfer prompt should present a nearby scenario that was not answered verbatim in the page. Keep it visible after the scored questions as the final invitation to participate in the system's evolution.

## Visual selection

Use visuals to externalize relationships that would otherwise burden working memory:

- before/after figures for changed structure or responsibility;
- annotated traces for the worked example;
- sequence or flow diagrams for ordered interactions;
- state snapshots for cache, queue, database, or lifecycle changes;
- compact tables for exact mappings and invariants;
- miniature UI mockups only when visible behavior is central.

Use real component names and example data. Every figure needs a caption stating its takeaway and enough prose for the lesson to survive without the image. Avoid legends unless symbols recur enough to justify the lookup cost.

Pre-render graph-shaped Mermaid diagrams as inline SVG. A Mermaid CDN is allowed only with explicit user consent and disclosure. Use hand-built HTML/CSS/SVG for editorial annotation when Mermaid would obscure the teaching point. Never use ASCII diagrams.

## Evidence and source behavior

- Distinguish observed, inferred, and open claims using the shared evidence vocabulary.
- Prefer action-oriented immutable source links with precise line ranges.
- Keep source actions near the claim or code boundary they support.
- State tests not run, callers not inspected, or behavior not demonstrated when those omissions affect trust.
- Do not let polished presentation imply certainty beyond the evidence.

## Artifact requirements

- Save one self-contained HTML file outside the repository with a `YYYY-MM-DD-` filename.
- Start from the shared scaffold and add local CSS only for change-specific comparisons, annotations, or quiz behavior.
- Use inline CSS and JavaScript; do not link external fonts, images, styles, or application code.
- Use `<pre><code>...</code></pre>` for excerpts, escape embedded content, and preserve whitespace with `white-space: pre` or `pre-wrap`.
- Use semantic landmarks, logical headings, accessible colors, keyboard-operable controls, reduced-motion behavior, and responsive layout.
- Keep the main narrative continuous; do not use top-level tabs to hide the teaching sequence.

## Validation

Verify:

- the canonical learning sequence is coherent even if optional sections were omitted;
- orientation, before/after model, worked example, mechanism, and implications agree with one another;
- source links and evidence states support nearby claims;
- quiz interactions and explanatory feedback work by keyboard and pointer;
- correct answers are not exposed through position, length, styling, DOM labels, or accessibility text;
- code newlines are preserved and derived text is safely escaped;
- the page works offline and has no unapproved remote dependency;
- light/dark themes, 320px layout, focus, disclosures, and print remain usable;
- shared components and tokens are used instead of local substitutes.
