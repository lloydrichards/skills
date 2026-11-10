# Publish and revise reports

Prepare a private directory outside all project repositories with `index.html` and any companion files. Redact credentials, sensitive raw output, screenshots, and copied excerpts before publication. The scripts validate bundle structure, not whether the content contains secrets.

Use the repository name for the project. Use lowercase identifiers with hyphens within the report topic. Include the topic when needed to distinguish worktrees. The script generates `YYMMDD_<project>_<report-name>` using the first publication date in Europe/Zurich.

On home-lab as coder:

```bash
bash ~/.local/lib/lab-publish/publish-report.sh \
  --source /absolute/path/to/prepared-report \
  --project stack-effect \
  --name graph-redesign-review \
  --title 'Graph redesign review' \
  --summary 'Compare the proposed catalog layouts.'
```

Add `--draft` for a coherent report that is ready for review but still has open questions. Incomplete output stays private. The script emits metadata including `id`, `revision`, and canonical `path`. It prints a complete URL only after verifying its HTML over HTTPS. Check companions and browser behavior separately. Keep the canonical URL from the result, because the browser redirects to an immutable release to keep assets consistent.

For an existing report, first read its current revision from `~/.local/share/lab-publish/state/reports.json`. Read only the matching report record when its id is known. Record that revision before editing. Publish the replacement with the existing `--id` and `--expected-revision REVISION`, plus its project, name, title, and source arguments:

```bash
bash ~/.local/lib/lab-publish/publish-report.sh \
  --source /absolute/path/to/prepared-report \
  --project stack-effect --name graph-review --title 'Graph review' \
  --id EXISTING_ID --expected-revision REVISION
```

Snapshot unrelated records before publication only when preservation needs checking. Compare those records afterward; do not snapshot the registry as one immutable file. Preserve the original id even on a later date. Revisions keep the canonical URL and creation date, and update the last-updated date.

A stale revision is rejected with the second draft's preserved staging path. Inspect both drafts and reconcile them. Do not retry with the latest revision merely to bypass the conflict check. A naming collision on first publication also needs reconciliation or a more specific topic.

When checking that unrelated reports stayed unchanged, compare their individual records or files. The shared registry must change during publication, so its whole-file checksum is not a preservation check. Investigate a failed verification command before describing the revision as verified.

Use immutable GitHub links for committed source and copied browser-readable excerpts for uncommitted source. Include source revision, worktree, or chat context only when relevant to the report. Relative links to files on the server will not open on the Mac unless those files are included in the report bundle.

If HTTPS verification fails, the complete report remains in the store. Mark delivery as pending and diagnose hosting. Do not discard the content or create a second report merely because networking failed. Old immutable releases are retained so open pages keep working. Explicit report deletion removes the report's releases as well as its index entry.

Only after the user explicitly requests deletion:

```bash
bash ~/.local/lib/lab-publish/delete-report.sh --id REPORT_ID
```
