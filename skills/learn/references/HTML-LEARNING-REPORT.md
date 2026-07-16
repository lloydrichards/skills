# HTML learning reports

This file owns HTML composition. [PEDAGOGY.md](PEDAGOGY.md) owns the learning sequence; the selected route owns its ending; [INTERACTIONS.md](INTERACTIONS.md) owns shared primitive behavior.

Follow the [report-builder skill](../../report-builder/SKILL.md) and its required resources. Begin with [report-scaffold.html](../../report-builder/report-scaffold.html); do not recreate its tokens, ordinary elements, themes, accessibility, or print rules.

## Composition

The first screenful should connect the artifact to the mission and capability, state the observable outcome and assumptions, and name the activity that will produce evidence. Arrange the remaining page in the selected route's causal order. Keep the model, committed activity, feedback, transfer, evidence handoff, and next check mutually consistent.

Use progressive disclosure for optional prerequisites, secondary examples, implementation detail, and sources. Keep the task, material evidence, uncertainty, feedback, and transfer visible. The meaning must survive without color, motion, canvas, or JavaScript.

## Technology selection

Prefer the smallest sufficient tool:

1. Semantic HTML and native controls.
2. Inline or local SVG for annotated relationships.
3. Canvas for many rapidly changing marks when an equivalent textual representation is present.
4. Observable Plot for concise statistical views.
5. D3 for custom data transforms, layouts, or bespoke SVG interactions.
6. p5.js for generative, spatial, or perception-oriented sketches.
7. Motion for pedagogically meaningful state or SVG transitions.
8. Matter.js for approachable rigid-body models, or Planck.js when Box2D semantics are material.

Use only pinned copies in `assets/vendor/`; do not load a CDN by default. Explain why a dependency is necessary in the vendor README. Prefer vanilla libraries over framework runtimes in standalone reports.

## Shared learning primitives

Copy [learning-primitives.js](../assets/learning-primitives.js) and [learning-primitives.css](../assets/learning-primitives.css) into the workspace `assets/` directory when needed. Use their semantic markup and explicit initializer APIs. Do not copy their logic inline into each lesson.

The primitives enforce sequence, support tracking, feedback presentation, and evidence serialization. Topic-specific evaluators decide correctness; they are not an assessment engine. Read [INTERACTIONS.md](INTERACTIONS.md) only when using them.

## Delivery gate

- The page and evaluator target the same mission capability and route ending.
- The learner commits before reveal; transfer is structurally related but genuinely new.
- Sources, uncertainty, and limitations sit beside the claims they qualify.
- Evidence is copied or exported only by explicit action, contains no answer key, stays local, and never proposes `retained`.
- Semantic controls work by keyboard at 320px and 200% zoom; feedback is announced without relying on color.
- JavaScript-disabled, reduced-motion, nonvisual, forced-color, network-blocked, and print paths preserve the lesson.
- Simulations have pause/reset or step controls plus textual outcomes; no task depends on hover, drag, animation, canvas, or pointer precision.
