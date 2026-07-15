---
name: report-builder
description: |
  Build, redesign, or evaluate a self-contained technical HTML report using the shared report design system and scaffold. Use whenever an agent or skill needs to present findings, teach a concept, explain a change, compare options, record a decision, conduct an audit, or publish technical reference material as a polished HTML artifact. Also use when an existing HTML report needs clearer information architecture, stronger evidence, consistent styling, accessibility, responsive behavior, print support, or alignment with the shared design language.
---

# Report Builder

Build a standalone HTML report that helps its reader **glance, scan, then inspect**. This skill is the shared foundation for any skill or agent that needs HTML to make a point or present information.

## Required resources

Read these before creating or redesigning a report:

1. [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) defines the visual language, semantic decisions, tokens, base elements, shared components, and extension rules.
2. [report-scaffold.html](report-scaffold.html) provides the complete document shell and baseline CSS. Start from it; do not recreate the foundation.
3. [design-system.html](design-system.html) is the canonical rendered example of the scaffold's elements, components, and states. Consult it when component choice, markup, composition, or expected appearance is unclear; copy the demonstrated pattern rather than inventing a local variant.
4. [references/INFORMATION-ARCHITECTURE.md](references/INFORMATION-ARCHITECTURE.md) explains how to choose and structure the report's argument.
5. [references/EVIDENCE-AND-SOURCES.md](references/EVIDENCE-AND-SOURCES.md) applies when the report makes factual, evaluative, or source-backed claims.
6. Read only the relevant file in [references/profiles/](references/profiles/) for the report job.

## Responsibility boundary

The shared foundation owns:

- page tokens, typography, spacing, colors, widths, and responsive behavior;
- default styling for ordinary HTML elements;
- report header, orientation strip, table of contents, callouts, evidence states, figures, disclosures, and footer;
- theme, focus, reduced-motion, and print behavior.

The report or consuming skill owns:

- audience, purpose, scope, argument, sections, claims, evidence, and actions;
- domain-specific diagrams or interactive elements that materially improve understanding;
- a small extension layer using shared tokens.

Do not restyle ordinary HTML elements in a consumer. Do not copy the shared CSS into another reference file. If multiple report types need a new primitive, add it to this design system instead of allowing local variants to drift.

## Workflow

1. Establish the reader contract: audience, question or decision, prior knowledge, scope, exclusions, evidence available, and intended lifespan.
2. Select one primary report job and read its profile. When a report mixes jobs, choose the job that determines its ending.
3. Build a claim outline before HTML. Make the reasoning chain visible and keep conclusions within the inspected evidence.
4. Copy `report-scaffold.html` as the starting artifact. Replace placeholders and remove unused optional patterns.
5. Add only report-specific structures and visuals. Extend with semantic or component tokens derived from the shared system; do not add raw colors or an unrelated type/spacing scale.
6. Use static Mermaid only for graph-shaped relationships. Prefer annotated HTML or inline SVG for editorial explanation. Pre-render Mermaid to inline SVG; a disclosed CDN is allowed only with user consent.
7. Inspect at desktop and 320px widths. Check keyboard navigation, headings and landmarks, disclosures, links, light/dark themes, reduced motion, and print.

## Quality bar

- The first screenful states the report's purpose and primary conclusion, recommendation, question, or learning outcome when applicable.
- Headings expose the argument; a reader can understand the report's shape from them alone.
- Each material conclusion is supported, clearly marked as interpretation, or explicitly identified as an open question.
- Essential evidence, risks, limitations, conclusions, and actions remain visible; disclosures contain supporting depth.
- The report uses the shared scaffold and primitives. Local CSS is limited to domain-specific layout or visualization.
- Meaning survives without color, images, animation, or interaction.
- The artifact is self-contained, responsive, keyboard-usable, and printable.
