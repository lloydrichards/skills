# Implementation anchors

Use temporary anchors to make the plan reviewable at the exact source
locations where behavior will change.

## Format

```ts
// TODO(gauntlet-2): Decode the response through ApiResponse while preserving
// retry classification for transport failures. Validate malformed bodies and
// retryable status codes through the public client contract.
```

An anchor contains:

1. A stable sequential identifier.
2. The intended observable behavior or local responsibility.
3. A constraint or invariant that is not obvious from nearby code.
4. The proof point when it clarifies how the change will be accepted.

Keep an anchor close to the smallest declaration or branch that owns the
change. Use one anchor per coherent responsibility rather than one per line.

## Quality test

A verifier should be able to answer:

- What behavior changes here?
- Why is this the correct boundary?
- What existing behavior must survive?
- How will we know the change works?

If the nearby code, types, or test names already answer one of these questions,
do not repeat it in the comment.

## Avoid

```ts
// TODO(gauntlet-1): Update this.
```

This has no actionable behavior or constraint.

```ts
// TODO(gauntlet-2): Add parseResponse(), call it below, assign the result to
// parsed, and return parsed.
```

This narrates mechanics and overcommits to an implementation before the code is
written.

```ts
// TODO(gauntlet-3): Refactor this whole module and improve the tests.
```

This is too broad to verify and probably expands scope.

## Lifecycle

Anchors are temporary workflow state:

1. Add them in a comment-only change.
2. Verify them against the plan and success criteria.
3. Remove each one as its slice is implemented and validated.
4. Search for `TODO(gauntlet-` before completion.

Do not convert an anchor automatically into durable source commentary. Keep a
normal `NOTE`, `TODO`, `FIXME`, or documentation comment only when the final
code still needs context that names, types, tests, and structure cannot carry.
