# Information Architecture for Reports

Design the report around the reader's question, not around a universal section list.

## Reader contract

Before outlining, establish:

- **Audience** — who will use the report and what they already know.
- **Job** — what they need to understand, decide, verify, learn, or look up.
- **Scope** — what the report covers and explicitly excludes.
- **Evidence** — what was inspected, tested, measured, or researched.
- **Action** — what the reader should think or do afterward.
- **Lifespan** — whether this is a moment-in-time briefing or a durable record.

Infer these from context when safe. State consequential assumptions in the report.

## Choose the primary job

Select the profile whose ending matches the report's purpose:

- Explain ends in understanding.
- Review ends in findings and actions.
- Decision ends in a choice and consequences.
- Audit ends in conclusions against stated criteria and recommendations.
- Research ends in a synthesis, evidence gaps, and implications.
- Learning ends in demonstrated understanding or practice.
- Reference ends in successful retrieval, not a narrative conclusion.

Reports may mix modes, but one job should control the hierarchy. Do not bury the primary job inside a secondary tutorial or implementation walkthrough.

## Build the argument before the page

Write a one-sentence answer to the reader's main question. Then outline the minimum chain needed to justify it. Each major section should perform one step in that chain.

Good section order usually follows one of these relationships:

- context → mechanism → consequence;
- criteria → observation → finding → action;
- drivers → options → trade-offs → decision;
- question → evidence → synthesis → implication;
- goal → model → example → practice.

If two adjacent sections do not have a clear relationship, change the order, combine them, or remove one.

## Design three reading depths

### Glance

The first screenful should identify the subject, purpose, and main outcome, recommendation, decision, question, or learning objective. Add an orientation strip only for facts that materially affect interpretation.

### Scan

Headings should expose the report's reasoning, not merely label containers. Front-load the distinguishing claim in each section. Keep source actions and evidence states beside the material they qualify.

### Inspect

Place supporting implementation, full matrices, secondary visuals, glossary entries, and long reference lists after the visible claim. Use disclosures only when they improve the main reading path.

## Navigation

- Use one unique `h1` and logical heading ranks.
- Give every major section a stable, descriptive ID.
- Use “On this page” when there are at least three substantial sections or when non-linear lookup is likely.
- Keep DOM order equal to reading order; never use CSS placement to create a different conceptual order.
- Use descriptive link text that makes sense outside its paragraph.
- Add a short orientation before navigation when the intended starting point is not obvious.

## Prose and labels

- Use sentence-case, unique headings.
- Begin task headings with a verb; use noun phrases for conceptual headings.
- Put the section's key distinction or conclusion in its opening sentence.
- Use consistent terms for the same thing.
- Define uncommon abbreviations on first use.
- Prefer short paragraphs and parallel list items.
- Name figures and sections instead of referring to “above,” “below,” “left,” or “right.”

## Progressive disclosure

Keep these visible:

- the primary claim or conclusion;
- material evidence and uncertainty;
- risks and limitations;
- recommendations and requested actions.

Good disclosure candidates include implementation detail, extended examples, raw observations, secondary figures, full matrices, glossaries, and references. Reference reports often benefit more from direct visibility than disclosure.

## Visual choice

Use a visualization only when it materially reduces the effort required to understand a relationship. Prefer:

- tables for repeated exact mappings or comparisons;
- flows and sequences for dependencies or state changes;
- trees for hierarchy and branching;
- before/after figures for structural change;
- annotated examples for causal explanation.

Every visual needs a caption stating its takeaway and enough prose for the conclusion to survive without the image.

