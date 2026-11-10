# Fresh mutation worker contract

Use this as the structure for each fresh subagent prompt. Fill every placeholder
from the campaign ledger. Do not include conclusions or mutation ideas from
previous workers.

```text
Audit exactly one test by mutation. You own only this trial.

Repository: <absolute repository path>
Repository instructions: <paths or concise applicable rules>
Test ID: <stable ID>
Worker ID: <new unique worker ID assigned for this test only>
Exact test name: <full test name>
Test source: <absolute path and line when known>
Suite entrypoint: <absolute or repository-relative path>
Exact focused command: <command>
Allowed production scope: <paths>
Pre-existing scoped state: <diff/hash description>

Requirements:
1. Read the test and trace the observable claim through production code.
2. Introduce one minimal production-only behavioral regression.
3. Inspect the mutation diff and reject it if it changes tests, fixtures,
   generated files, configuration, or unrelated production behavior.
4. Run the exact focused command. Confirm exactly the intended test ran.
5. Capture the exit code and the failure or pass evidence.
6. Restore the exact source using a narrow contextual edit. Do not use reset,
   checkout, clean, stash, or any broad destructive command.
7. Prove the scoped source state matches the supplied pre-existing state.
8. Rerun the exact focused command unmutated.
9. Return the structured result below. Do not edit the campaign ledger. Do not
   strengthen the test, even if the mutation survives.

If restoration cannot be proven, stop and return clean_rerun_failed or blocked.
```

Return:

```json
{
  "testId": "...",
  "workerId": "...",
  "claimedBehavior": "...",
  "productionBoundary": "...",
  "attempt": {
    "mutationFile": "...",
    "mutationDescription": "...",
    "mutationDiff": "concise diff or patch description",
    "focusedCommand": "...",
    "mutatedExitCode": 1,
    "selectedTestCount": 1,
    "mutatedOutcome": "failed",
    "failureEvidence": "...",
    "proposedClassification": "killed",
    "classificationReason": "...",
    "restorationMethod": "...",
    "restorationProven": true,
    "cleanExitCode": 0,
    "cleanSelectedTestCount": 1,
    "cleanOutcome": "passed",
    "concerns": []
  }
}
```

The main agent adjudicates the proposed classification. Free-form commentary is
welcome after the JSON when it explains a boundary insight, but the structured
object must be complete.
