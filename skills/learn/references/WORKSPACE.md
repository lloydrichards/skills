# Learning workspace

One workspace serves one confirmed durable mission. Initialize it only after the learner approves the proposed mission and initial capability map.

Treat the current directory as the candidate workspace. It is confirmed only when both `MISSION.md` and `CAPABILITIES.md` exist and the mission includes `Confirmed with learner:`. Do not search parent directories or initialize another location without asking.

## `MISSION.md`

Keep the mission short enough to remain a compass.

```md
# Mission: {topic or outcome}

## Why
{The concrete real-world outcome and why it matters.}

## Success looks like
- {Observable performance}
- {Observable performance}

## Starting point
{Relevant prior experience and important uncertainty.}

## Artifact policy
- Default medium: {conversation | Markdown | HTML}
- Interactivity: {when it is worth using}
- Dependencies: {for example, offline and no CDNs}
- Accessibility or format preferences: {if any}

## Constraints
- {Time, tools, budget, environment, or learning preferences}

## Out of scope
- {Adjacent work deliberately excluded}

Confirmed with learner: {YYYY-MM-DD}
```

Revise the mission only when the real-world outcome changes, and obtain confirmation before making a material change.

## `CAPABILITIES.md`

Use stable, short identifiers so artifacts and records can reference capabilities without depending on headings.

```md
# Capability map

## CAP-001 — {Capability name}

- Verb: {explain | predict | apply | diagnose | create | perform | remember}
- State: {not started | introduced | practiced | demonstrated | retained}
- Evidence: {What supports the current state, or “No learning evidence yet.”}
- Evidence date: {YYYY-MM-DD | —}
- Latest check: {Optional newer evidence that did not change the state.}
- Latest check date: {YYYY-MM-DD | —}
- Next check: {A qualitative next activity or mission-appropriate delayed check.}

## Near-term direction

1. {Next likely move and why}
2. {Optional second move and why}
```

`not started` is an administrative pre-state, not a fifth learning state. Use it for untouched planned capabilities, then use only the four evidence states after exposure. Preserve the evidence supporting the current state; record a failed later retrieval under `Latest check` rather than replacing that basis or mechanically demoting the state.

Start with only the capabilities needed to orient the mission. Add or split capabilities when real work reveals a meaningful distinction. Record dependencies only when they affect what should happen next.

## `RESOURCES.md`

Maintain one mission-level source registry. Artifacts cite only the subset they use.

```md
# {Mission} resources

## Knowledge

- [{Descriptive source title}]({URL})
  Establishes: {claim or boundary}. Use for: {capability or question}. Checked: {YYYY-MM-DD}.

## Wisdom and practice

- [{Community, practitioner, class, or venue}]({URL if applicable})
  Use for: {real-world feedback or practice}. Notes: {quality or participation constraints}.

## Gaps

- {Important question without a trustworthy source yet.}
```

Prefer a few sharp sources. Remove sources that prove shallow, incorrect, or off-mission.

## `learning-records/*.md`

Learning records are compact, durable context—not session logs and not duplicates of capability evidence.

Create `0001-slug.md`, incrementing the highest number.

```md
# {Durable insight, corrected misconception, or mission change}

{One to three sentences explaining what changed and why it should affect future teaching.}

## Evidence
{Include only when the basis may need to be revisited.}

## Implication
{Include only when the future consequence is not obvious.}
```

Use a record when a misconception is corrected, prior knowledge materially changes sequencing, a non-obvious insight becomes durable, or the mission changes. Do not create one merely because material was covered.

## `NOTES.md`

Record learner preferences and temporary working context that should affect future sessions but does not belong in the mission or capability evidence. Prune stale notes.

## Artifact directories

- `lessons/NNNN-slug.md|html` — narrative or interactive learning sequences.
- `reference/slug.md|html` — lookup-oriented material; prefer stable names because other artifacts link here.
- `assets/learning-primitives.js` and `assets/learning-primitives.css` — copy from this skill when an HTML activity uses them.
- `assets/vendor/` — pinned local libraries that have earned their complexity.

When adding a vendor dependency, create or update `assets/vendor/README.md` with its name, version, license, source URL, integrity information when available, why the lesson needs it, and which artifacts use it. Do not use a CDN by default.

## Learner-controlled browser evidence

Interactive artifacts use the local schema in [INTERACTIONS.md](INTERACTIONS.md). Treat imported summaries as learner-provided evidence: inspect the response and task before updating a capability.
