# Mutation audit ledger

Use a single resumable JSON object. Fields may be extended for repository needs,
but preserve the core meanings so campaigns can be compared and validated.

```json
{
  "schemaVersion": 1,
  "campaign": {
    "id": "2026-08-14-example-suite",
    "suite": ["packages/example/test/conformance.test.ts"],
    "mode": "audit-only",
    "status": "in_progress",
    "startedAt": "2026-08-14T12:00:00.000Z",
    "completedAt": null,
    "baseline": {
      "command": "node_modules/.bin/vitest run packages/example/test/conformance.test.ts",
      "exitCode": 0,
      "active": 12,
      "skipped": 3
    },
    "productionScope": ["packages/example/src"],
    "preCampaignState": "scoped diff or hashes",
    "progress": {
      "active": 12,
      "terminal": 0,
      "remaining": 12,
      "currentTestId": null,
      "nextAction": "Dispatch example-001"
    },
    "finalSuiteRun": null,
    "restorationProven": false
  },
  "tests": [
    {
      "id": "example-001",
      "name": "MUST return a protocol error for an unknown method",
      "source": "packages/example/test/Protocol.test.ts:42",
      "entrypoint": "packages/example/test/conformance.test.ts",
      "variant": "default",
      "workerId": "worker-001",
      "focusedCommand": "node_modules/.bin/vitest run packages/example/test/conformance.test.ts -t '...escaped selector...'",
      "status": "killed",
      "attempts": [
        {
          "number": 1,
          "status": "killed",
          "startedAt": "2026-08-14T12:01:00.000Z",
          "completedAt": "2026-08-14T12:03:00.000Z",
          "claimedBehavior": "Unknown methods are rejected",
          "productionBoundary": "server request dispatch",
          "mutation": {
            "file": "packages/example/src/Server.ts",
            "description": "Return success from the unknown-method branch",
            "diff": "concise mutation diff"
          },
          "mutatedRun": {
            "command": "...",
            "exitCode": 1,
            "selectedTests": 1,
            "outcome": "failed",
            "evidence": "expected error, received success"
          },
          "restoration": {
            "method": "contextual reverse patch",
            "proven": true,
            "evidence": "scoped diff matches pre-trial state"
          },
          "cleanRun": {
            "command": "...",
            "exitCode": 0,
            "selectedTests": 1,
            "outcome": "passed",
            "evidence": "1 passed"
          },
          "notes": []
        }
      ]
    }
  ]
}
```

Allowed campaign modes:

- `audit-only`
- `audit-and-harden-survivors`

Allowed top-level test statuses:

- `pending`
- `running`
- `killed`
- `survived`
- `blocked`
- `clean_rerun_failed`

Attempt statuses additionally allow:

- `invalid_mutation`
- `equivalent_mutation`

Campaign status is `in_progress`, `complete`, or `stopped_for_integrity`.

At every checkpoint, `campaign.progress` records `active`, `terminal`,
`remaining`, `currentTestId`, and `nextAction`. `remaining` is the number of
top-level targets that are not `killed`, `survived`, or `blocked`. Use a unique
top-level `workerId` whenever a fresh worker reaches a valid terminal trial.

Do not erase earlier attempts when a later mutation kills the same test. The
test's top-level status reflects its latest valid adjudicated trial. Invalid or
equivalent attempts leave the target pending until another credible mutation is
tried or the target is explicitly blocked.
