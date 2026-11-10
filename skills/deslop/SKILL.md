---
name: deslop
description: Simplify and refactor code while preserving behavior. Use when asked to "deslop", "clean up code", "simplify code", "refactor", "reduce abstraction tax", or "remove code smell", or after making changes that may have left single-use helpers, pass-through wrappers, duplicate drift, dead branches, noisy type annotations, awkward parameter shapes, or overcomplicated control flow. Prefer a repository's designated architecture-simplification workflow when the task questions whole responsibilities or supported contracts.
metadata:
  version: "1.1.0"
---

# Code cleanup and refactoring

Improve clarity, consistency, and maintainability while preserving behavior. Prefer direct, readable code over clever compactness.

Use this skill for code recently changed or explicitly placed in scope by the user. Keep the boundary tight; do not broaden into unrelated refactors just because nearby code could be prettier.

For requests to reconsider whole responsibilities or supported contracts, follow the repository's designated architecture-simplification workflow when one exists.

## Operating Principles

- Preserve behavior first. Change expression, structure, or names only when the new shape is easier to understand.
- Follow the repository's style, framework conventions, and domain vocabulary.
- Keep edits reviewable. Prefer one obvious refactor at a time over a sweeping rewrite.
- Prefer local patterns over generic "clean code" rules.
- Verify with the narrowest meaningful checks first, then broader checks when risk or project convention calls for them.
- Leave a short note for any smell you intentionally keep because it protects a real boundary or public contract.

## Fast Workflow

1. Identify the requested scope and read nearby code before editing.
2. Classify the main slop type: abstraction, shape/signature, naming, type noise, control flow, duplication, or stale comments.
3. Search before extracting or consolidating. Use `rg` for symbol names, domain verbs/nouns, and nearby duplicate behavior.
4. Apply the smallest behavior-preserving edits that reduce cognitive load.
5. Run formatting, linting, type-checking, and relevant tests according to project instructions.
6. Summarize what changed, what was verified, and what you deliberately left alone.

## Triage Checklist

Use these as prompts to inspect, not automatic rewrite rules:

- **Abstraction tax**: single-use helpers, pass-through wrappers, middle-man modules, premature generic options, or abstractions with no second real case.
- **Shape mismatch**: boolean mode flags, long positional parameter lists, scattered fields from one domain object, options objects with mostly unused fields.
- **Naming noise**: identifiers that repeat file/module context, expose implementation mechanics, or become sentence-shaped to compensate for unclear structure.
- **Type noise**: local return annotations, one-off type aliases, callback annotations, or explicit Effect/UI return types that only restate clear inference.
- **Control-flow noise**: nested branches, repeated validation failure shapes, once-used temporaries, comments that narrate mechanics.
- **Duplication drift**: parallel defaults, near-duplicate transforms, copied test setup, speculative dead branches.

When a category is central to the task, read the matching reference before editing:

| Task focus | Read |
| --- | --- |
| Abstractions, naming, control flow, comments, dead code | `references/smell-catalog.md` |
| Parameters, domain-object passing, return annotations, Effect/UI typing | `references/signatures-and-types.md` |
| Duplicate utilities, parallel behavior, search tactics | `references/duplicate-search.md` |

## Keep, Don't Simplify

Do not remove or flatten code that:

- Defines a real domain concept, public API, service boundary, test boundary, or framework adapter.
- Makes a high-level workflow easier to scan.
- Prevents accidental misuse through a stable type or named boundary.
- Exists because the repository's conventions require it.
- Has a different contract even if it looks similar to nearby code.

## Project Standards

Honor local standards first. In TypeScript projects, common defaults are:

- Use ES modules and the repository's import ordering style.
- Keep explicit return types on exported APIs, recursive helpers, service/layer boundaries, and important package boundaries.
- Prefer explicit props/input types for components and command surfaces.
- Use the project's error-handling style; avoid adding broad `try`/`catch` unless local code does that.
- Keep naming aligned with canonical domain terms already used in the package.

## Final Response

Report:

- The simplification boundary you chose.
- The main slop categories addressed.
- The checks you ran and their result.
- Any smell left in place because it still earns its keep.
