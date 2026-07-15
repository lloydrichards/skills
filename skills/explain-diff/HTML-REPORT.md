# Explain Diff HTML Report

Read the shared [Design System](../report-builder/DESIGN-SYSTEM.md), [Explain profile](../report-builder/references/profiles/EXPLAIN.md), and [Evidence guidance](../report-builder/references/EVIDENCE-AND-SOURCES.md). Begin with [report-scaffold.html](../report-builder/report-scaffold.html). Do not copy or redefine its tokens, ordinary-element styles, shared components, theme behavior, accessibility rules, or print behavior.

## Information architecture

Choose only the sections the change needs. A review-oriented default is:

1. **Outcome** — what behavior changed and why a reader should care.
2. **Before / after** — the smallest comparison that makes the change legible.
3. **Evidence** — source references, tests, and the boundary of what was inspected.
4. **Implementation** — code excerpts and secondary detail, usually collapsed.
5. **Risks / checks** — remaining review actions, only when present.

For an unfamiliar change, use an annotated figure. For graph-shaped relationships that add distinct information, pre-render Mermaid as inline SVG and caption it. A Mermaid CDN requires explicit user consent and disclosure.

## Required report behavior

- Use the shared `summary-card` pattern only when a glance layer genuinely helps.
- Make review boundaries explicit: distinguish verified evidence from uninspected callers or inferred behavior.
- Use action-oriented immutable source links when repository references are available.
- Put secondary code, full test matrices, and long references behind informative native `<details>` summaries.
- Include a quiz only when the request is explicitly learning-oriented.
- Save the report outside the repository with a date-prefixed filename.

## Explain-diff composition

```html
<div class="summary-card"><b>Outcome</b><span>The affected invoice now refetches without invalidating unrelated invoices.</span></div>

<a class="source-ref" href="https://host/repo/blob/7ab31f2/src/invoices/cache.ts#L12-L16">Inspect cache key · L12–16</a>

<details>
  <summary>Inspect the invalidation implementation</summary>
  <pre><code>queryClient.invalidateQueries({ queryKey: invoiceKey(invoice.id) });</code></pre>
</details>
```

For quiz feedback, use semantic `<button>` elements, preserve a visible focus state, and announce the result with `aria-live="polite"`.

Add local CSS only for change-specific comparisons, annotated code figures, or quiz behavior. Use the scaffold's tokens and extension rules; do not add raw colors, a second type or spacing scale, or local styles for standard HTML.

## Validation

- Verify light/dark rendering, 320px layout, keyboard focus, disclosures, source links, and print.
- Ensure the artifact has no remote dependency unless the user explicitly approved it.
- Confirm headings, evidence states, cards, and disclosures use the shared system rather than local substitutes.
