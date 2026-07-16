---
name: explain-diff
description: |
  Create a rich single-file HTML explanation of a code change, diff, branch, commit range, or PR. Use whenever the user asks to explain a diff, PR, branch, commit, reviewable change, or "what changed" and a durable teaching artifact, walkthrough, onboarding explanation, diagrams, or knowledge check would help. The goal is not to summarize files but to build and verify an accurate mental model of the change.
metadata:
  source: https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524
  attribution: Adapted from Geoffrey Litt's explain-diff skill; see the repository NOTICE.md.
---

# Explain Diff

Create a self-contained HTML explainer that helps its reader become an active participant in the codebase. The artifact should teach what changed, how it works, and what follows from it—not merely make a diff easier to skim.

The teaching sequence is the heart of this skill:

**relevant prior system → intuitive model of the change → worked example → implementation mechanism → consequences and limits → retrieval practice**

Read [HTML-REPORT.md](HTML-REPORT.md) before generating the artifact. It is the canonical specification for page composition, report-builder integration, markup, visuals, and validation. This file owns the pedagogy and investigation workflow; `HTML-REPORT.md` owns its presentation.

## Reader Contract

Infer and state the reader contract before outlining:

- Who is the likely reader, and what can they safely be assumed to know?
- What should they be able to explain, predict, or review after reading?
- Which change and surrounding system are in scope?
- What evidence was inspected, and what remains inferred or unknown?

If the audience is unspecified, write for a technically capable engineer who is new to this subsystem. Do not attempt to serve beginners and experts by repeating everything twice. Keep the main causal story concise, and use progressive disclosure for optional prerequisites and implementation depth.

## Investigate the Change as a System

Do not write from the patch alone. Reconstruct enough of the system to explain why the patch has its shape.

Inspect:

1. The requested diff, branch, PR, or commit range and its stated intent.
2. Changed files and tests.
3. Callers, callees, types, schemas, routes, state, configuration, and public boundaries touched by the behavior.
4. Existing documentation and tests that reveal invariants or domain language.
5. Test output, CI evidence, migrations, compatibility constraints, or operational effects when relevant.

Build an evidence map while investigating:

- **Observed:** directly supported by inspected code, diff, test, or authoritative documentation.
- **Inferred:** a reasoned interpretation whose evidence can be named.
- **Open:** important behavior that could not be established.

Trace behavior across the boundary that matters to the reader. Stop when additional exploration no longer changes the mental model, consequences, or review risk.

## Build the Mental Model Before the Page

Before writing HTML, draft these in plain text:

1. **One-sentence model:** the single idea the reader should retain.
2. **Prior model:** the smallest description of how the relevant system behaved before.
3. **Pressure for change:** the concrete failure, constraint, or opportunity that made the old model insufficient.
4. **New model:** what responsibility, data flow, invariant, or boundary changed.
5. **Worked example:** one named input or scenario traced through old and new behavior.
6. **Mechanism chain:** how conceptual groups of code realize the new model.
7. **Consequences:** observable behavior, benefits, trade-offs, risks, limits, and unanswered questions.

If these cannot be written clearly, investigate further before designing the artifact.

## Teach in Causal Order

Organize the explanation around questions a reader naturally needs answered:

1. Why should I care about this change?
2. What did the relevant system do before?
3. What was the old model unable to express or guarantee?
4. What is the new idea, in plain language?
5. Can I see one concrete case travel through both models?
6. Which code changes implement each step of that idea?
7. What behavior can I now predict, and where does the model stop applying?

Use headings that state answers or distinctions rather than generic containers. “Invalidation now follows invoice identity” teaches more than “Implementation.”

### Background earns its place

Include only prerequisites needed to understand the change. Begin with the closest useful system boundary, not the history of the whole repository. Define terms at first use and place remedial or optional depth behind disclosures.

### Intuition precedes implementation

Explain the new model without relying on code syntax. Prefer one strong analogy or diagram over several decorative ones. State where an analogy breaks down so it does not become a false model.

### Worked examples carry the explanation

Use concrete names and values. Follow one request, record, event, state transition, or user action through the old path and new path. At each meaningful step, connect:

**input/state → rule or decision → output/state → relevant code boundary**

The example should let the reader predict a nearby case, not merely illustrate the happy path.

### Code is evidence for the model

Present a literate walkthrough in causal or dependency order, not alphabetical file order. Group edits by conceptual role. For each group, explain:

- the claim it implements;
- the relevant code boundary and short excerpt;
- how it changes the worked example;
- any invariant, trade-off, or edge case it introduces.

Do not paste large diffs or narrate syntax that is already self-explanatory.

### End with implications and limits

Distinguish verified behavior from expected behavior. Cover tests, compatibility, migration, performance, security/privacy, and operational consequences only when relevant. State what was not inspected or proven when that limitation changes how the explainer should be trusted.

## Retrieval Practice

Include five medium-difficulty questions by default. The quiz is a speed regulator on the AI loop: it should require the reader to retrieve and apply the model before treating the change as understood. Omit it only when the user asks for a brief/non-learning artifact or when the artifact's purpose clearly makes a quiz inappropriate.

Questions should collectively test:

- the prior-system constraint or motivation;
- the new causal model;
- prediction for a concrete case;
- connection between model and implementation;
- an edge case, trade-off, or limit.

Use plausible distractors based on real misconceptions. Keep answer length, specificity, grammar, and position from revealing the correct option. Give immediate explanatory feedback that repairs the misconception, not just a correct/incorrect label.

End the learning sequence with one short transfer prompt that asks the reader to predict behavior for a nearby case not already walked through. It may be reflective rather than scored.

## Workflow

1. Identify the change and reader contract. If the target is ambiguous and different choices would produce different explainers, ask one concise question.
2. Inspect the diff and surrounding system; record observed, inferred, and open claims.
3. Draft the seven-part mental model before HTML.
4. Choose the minimum examples and visuals that carry the causal story.
5. Follow [HTML-REPORT.md](HTML-REPORT.md) to compose the artifact with report-builder.
6. Validate the factual claims, learning sequence, quiz quality, HTML behavior, accessibility, and offline operation.
7. Return the absolute file path and briefly state scope, evidence inspected, and material limitations.

## Quality Check

Before delivery, verify:

- The first screenful states what changed, why it matters, and what the reader will understand.
- The explainer teaches a coherent old model and new model rather than listing edits.
- At least one worked example connects concept, behavior, and code.
- The walkthrough follows causality or dependency order.
- Every visual has a teaching job and labeled concrete data.
- Material claims are observed, clearly inferred, or left open.
- Consequences and limits follow from the model and evidence.
- Unless intentionally omitted, five questions test retrieval and application without answer-pattern clues.
- A reader who succeeds can predict a nearby case, not just repeat the summary.
