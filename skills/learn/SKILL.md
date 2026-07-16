---
name: learn
description: Run a stateful, mission-driven learning workspace that helps the user acquire and retain a capability across sessions. Use only when the user explicitly invokes `/learn` to start, continue, review, inspect, or update a learning mission; do not initialize or mutate a learning workspace for ordinary explanation requests.
disable-model-invocation: true
argument-hint: "start <mission> | continue | review | status | <capability>"
---

# Learn

Build a durable learning relationship around one confirmed mission. Choose the smallest useful medium, design activities that produce evidence rather than passive completion, and adapt the next session from what the learner can actually do.

This skill is a clean-break successor to `teach`. Do not migrate or infer compatibility with legacy teaching workspaces.

## Core contract

- One workspace represents one learner pursuing one durable mission.
- Confirm the mission and provisional capability map before the first lesson.
- Keep capability evidence qualitative: `introduced → practiced → demonstrated → retained`; untouched planned capabilities use the administrative pre-state `not started`.
- Require independent transfer for `demonstrated` and delayed retrieval in a later session for `retained`.
- Choose the least-complex useful medium; interaction and artifact completion are not learning evidence.
- Keep lesson data local and plan only the next one or two useful moves.

Read [PEDAGOGY.md](references/PEDAGOGY.md) before designing an activity or changing capability state. Read [WORKSPACE.md](references/WORKSPACE.md) before initializing or updating workspace files.

## Locate and operate the workspace

Treat the current directory as the only candidate workspace. It is confirmed only when `MISSION.md` and `CAPABILITIES.md` exist and the mission contains the learner-confirmation marker. Do not search upward or initialize elsewhere without asking. The canonical layout, schemas, and lazy directory policy are in [WORKSPACE.md](references/WORKSPACE.md).

- `status` or `inspect`: read-only summary of the mission, capability states, evidence gaps, and next move. Do not create an activity or mutate files.
- `update`: propose changes first. Confirm material mission changes before writing; capability-map refinements may follow observed evidence.
- Missing or malformed workspace: report what is absent. Do not initialize unless the learner asks to start.

## Start or continue

When no confirmed learning workspace exists:

1. Ask only for missing context: real-world outcome, relevant experience, intended application, constraints and artifact preferences, and the first observable performance.
2. Draft concise provisional `MISSION.md` and `CAPABILITIES.md` content in conversation.
3. Label assumptions, keep the map small, and use `not started` for untouched capabilities.
4. Obtain explicit confirmation before writing files or beginning the first lesson.

Do not conduct a comprehensive intake interview. Refine the model through evidence from real work.

For a confirmed workspace:

1. Read `MISSION.md` and `CAPABILITIES.md`.
2. Read only the learning records, resources, notes, and artifacts relevant to the likely next move.
3. Identify the target capability, its observable verb, current evidence, and next check.
4. State a compact contract: outcome, assumed knowledge, evidence-producing activity, and scope.
5. Select one primary route.

## Route by learning job

Read only the selected route plus any references it requires.

| Learner job | Route | Typical ending |
| --- | --- | --- |
| Build or repair a bounded mental model | [EXPLAIN.md](references/routes/EXPLAIN.md) | Prediction and nearby transfer |
| Acquire a procedure or productive skill | [PRACTICE.md](references/routes/PRACTICE.md) | Independent performance against criteria |
| Explore a relationship by manipulating variables | [LAB.md](references/routes/LAB.md) | Prediction, observation, and causal explanation |
| Retrieve syntax, terminology, mappings, or procedures later | [REFERENCE.md](references/routes/REFERENCE.md) | Fast, successful lookup |
| Establish trustworthy knowledge before teaching | [RESEARCH.md](references/routes/RESEARCH.md) | Cited synthesis, gaps, and implications |
| Revisit learning after a delay | [REVIEW.md](references/routes/REVIEW.md) | Retrieval evidence and the next check |

If jobs mix, choose the route that determines the ending. Source verification may support any route; select Research only when synthesis is itself the learner's job.

## Choose the medium

Follow the artifact policy in `MISSION.md`, then override it only when the learning design clearly benefits.

- Use conversation for diagnosis, brief clarification, reflection, and session wrap-up.
- Use Markdown for plans, concise explanations, text-first exercises, notes, and simple references.
- Use HTML for complex mental models, worked traces, data exploration, simulation, adaptive feedback, or multi-step practice.

Before choosing HTML, name the learner action it improves. If interaction does not improve that action or its feedback loop, use a simpler medium.

For HTML, read [HTML-LEARNING-REPORT.md](references/HTML-LEARNING-REPORT.md). Read [INTERACTIONS.md](references/INTERACTIONS.md) only when using the shared primitives. Browser evidence must return through explicit local copy/export; never add analytics, network submission, a companion server, or direct workspace writes.

## Close the session

At the end of a meaningful session:

1. Summarize what the learner attempted and what the evidence supports.
2. Persist supported `introduced` or `practiced` updates and show them. Propose `demonstrated` or `retained`, then wait before persisting unless the learner explicitly asked you to assess and record returned evidence.
3. Update state evidence, latest check when relevant, and one qualitative next check.
4. Add a learning record only for a durable misconception, insight, mission change, or consequential prior knowledge—not a session log.
5. Update other workspace material only when durable value changed, then recommend one mission-linked next move.

## Quality check

Verify mission alignment, action/verb alignment, defensible evidence, the least-complex medium, and one qualitative next check. Use the selected route and canonical references for detailed checks.
