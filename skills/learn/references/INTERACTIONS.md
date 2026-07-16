# Learning interaction contracts

Use progressively enhanced semantic HTML. Each activity is a section with a heading, instructions, a real form, labeled controls, semantic buttons, and a nearby `<output aria-live="polite" aria-atomic="true">`.

The shared implementation lives in [learning-primitives.js](../assets/learning-primitives.js) with styling in [learning-primitives.css](../assets/learning-primitives.css).

## Common API

```js
const activity = initPrediction(root, {
  activityId: "predict-cache-key",
  capabilityId: "CAP-002",
  title: "Predict the invalidated key",
  activityRole: "guided", // or "transfer"
  capturePrediction(form) { /* return JSON-compatible value */ },
  validatePrediction(value) { /* return message or empty string */ },
  reveal({ prediction, root }) { /* render or activate topic-specific outcome */ },
  captureExplanation(form) { /* return JSON-compatible value */ },
  evaluateExplanation(value) { /* optional result */ },
  onEvidence(envelope) { /* optional local callback */ }
});

activity.getEvidence();
activity.reset();
```

Common configuration:

- `activityId`, `capabilityId`, and `title` are stable and author-provided.
- `activityRole` is `guided` by default; use `transfer` only for a genuinely new independent case.
- `artifact` may include a local path and title.
- `sessionId` may be supplied; otherwise the primitive creates a local identifier.
- `now` may inject a deterministic ISO timestamp function for tests.
- `onEvidence` receives the current envelope without transmitting it.

Do not derive identity from DOM order. Storage is intentionally absent from the initial implementation; add resumable `localStorage` only after a real need, with visible disclosure and reset.

## Prediction primitive

Initialize a root with `data-learn-prediction`.

Required hooks:

```html
<section data-learn-prediction>
  <h2>Predict first</h2>
  <form data-role="prediction-form">
    <label for="prediction">Your prediction</label>
    <textarea id="prediction" name="prediction" required></textarea>
    <button type="submit" data-action="commit">Commit prediction</button>
  </form>
  <button type="button" data-action="reveal" disabled>Reveal outcome</button>
  <section data-role="outcome" tabindex="-1"></section>
  <form data-role="explanation-form">
    <label for="explanation">Explain the result or discrepancy</label>
    <textarea id="explanation" name="explanation" required></textarea>
    <button type="submit" data-action="complete">Complete explanation</button>
  </form>
  <output data-role="feedback" aria-live="polite" aria-atomic="true"></output>
  <button type="button" data-action="copy-evidence" disabled>Copy session summary</button>
  <button type="button" data-action="reset">Reset activity</button>
</section>
```

Do not author the outcome, explanation form, practice stage, or transfer stage with `hidden`; the initializer applies enhancement-only hiding. With JavaScript disabled, the authored prompt and manual-response path therefore remain available. Keep any answer key in an inert template so progressive fallback does not expose it prematurely. A short `<noscript>` note should explain how to record responses manually.

State sequence: `predicting → committed → revealed → explained`. Reveal stays disabled until a valid commitment. Preserve the committed answer. Completing requires an explanation. Reset is the only way to revise a committed prediction. A transfer-role prediction may propose `demonstrated` only when its evaluator returns `correct`.

The outcome may be authored in an inert local `<template data-role="outcome-template">`; the lesson initializer can clone it in `reveal`. Do not include answer keys in copied evidence.

## Worked-to-transfer primitive

Initialize a root with `data-learn-worked-transfer` containing three labeled stages:

- `[data-stage="worked"]` — visible annotated example, preferably an ordered list of decisions.
- `[data-stage="practice"]` — a separate form for the faded case and optional ordered hints.
- `[data-stage="transfer"]` — a separate form for the independent, nearby case.

Required actions and outputs:

- `[data-action="start-practice"]`
- `[data-action="hint"]` when hints exist
- `[data-action="start-transfer"]`
- `[data-action="copy-evidence"]`
- `[data-action="reset"]`
- `[data-role="feedback"]`

Initialize with:

```js
const activity = initWorkedTransfer(root, {
  activityId: "trace-stream-failure",
  capabilityId: "CAP-003",
  title: "Trace failure and finalization",
  practice: {
    capture(form) {},
    validate(value) {},
    evaluate(value) {},
    hints: [{ id: "boundary", text: "Locate the typed error boundary first." }]
  },
  transfer: {
    capture(form) {},
    validate(value) {},
    evaluate(value) {}
  }
});
```

Evaluators return:

```js
{
  status: "correct" | "incorrect" | "partial" | "unassessed",
  feedback: "Explanatory feedback for the learner.",
  criteria: [{ id: "names-boundary", met: true, note: "Optional evidence note" }]
}
```

Reveal practice hints one at a time and record their identifiers. Version 1 intentionally provides no transfer hints or solution API. Incorrect or partial transfer attempts stay editable and remain in the evidence envelope; a correct retry may complete the activity. An unassessed response may complete for external review but proposes only `practiced`.

## Evidence envelope

Both primitives return and explicitly copy a JSON-compatible envelope:

```json
{
  "schemaVersion": "1.0",
  "sessionId": "local-session-id",
  "activityId": "stable-activity-id",
  "primitive": "prediction",
  "activityRole": "guided",
  "capabilityId": "CAP-002",
  "startedAt": "2026-07-16T10:00:00.000Z",
  "completedAt": null,
  "artifact": { "path": "lessons/0001-example.html", "title": "Example" },
  "attempts": [
    {
      "stage": "prediction",
      "attempt": 1,
      "response": "Learner response",
      "submittedAt": "2026-07-16T10:01:00.000Z",
      "result": { "status": "unassessed", "criteria": [] },
      "support": { "hintIds": [], "solutionViewed": false, "learnerReported": false }
    }
  ],
  "completion": {
    "completed": false,
    "proposedState": "practiced",
    "rationale": "A committed attempt was made; independent transfer was not assessed."
  }
}
```

Do not include fingerprints, time-on-task competence claims, hidden answer keys, or full private evaluator logic. `proposedState` is advisory. An artifact may propose `introduced`, `practiced`, or `demonstrated`; it must never propose `retained`.

The component visibly discloses that copied evidence contains learner responses and remains local until the learner chooses to copy it.

## Validation paths

Test at minimum:

- reveal cannot occur before a valid prediction commitment;
- commitment preserves the response and completion requires explanation;
- transfer submission is required for worked-to-transfer completion;
- incorrect and partial transfer attempts preserve evidence and permit retry;
- practice hints are recorded; transfer intentionally offers no hints or solution;
- `demonstrated` is proposed only for a correct, unsupported transfer;
- empty multi-field forms do not count as responses and repeated field names remain arrays;
- duplicate initialization is rejected;
- evidence timestamps can be deterministic through the injected clock;
- copy happens only on explicit action and contains no answer key;
- denied or unavailable clipboard access reveals a labeled, read-only text field for manual copying;
- feedback is announced, errors preserve existing descriptions, and authored no-JavaScript content remains readable.

Use the HTML report delivery gate for responsive, keyboard, forced-color, reduced-motion, print, and offline integration checks.
