---
name: home-lab-workflow
description: Work on home-lab over SSH and deliver private development previews and HTML reports to the user's Mac through Tailscale. Apply during home-lab work, including worktrees, persistent preview services, report publication, and link troubleshooting. Check the host before machine-specific actions.
---

# Work on home-lab

Agents and builds run on Linux; the user opens links on a separate Mac over Tailscale. Server localhost and filesystem paths are not Mac browser links.

Check `hostname -s` and `id -un` together before machine-specific actions. Hosting runs on `home-lab` as `coder`, using `~/.local/lib/lab-publish/`. Source and the operating guide live in `/home/coder/projects/proj_home-lab/tools/publishing/` and `devices/home-lab/publishing.md`. On another host, give explicitly targeted remote commands; do not install hosting on the Mac.

Load the reference for the immediate task. Add another only when evidence requires it:

| Task | Reference | Verify before sharing |
| --- | --- | --- |
| Publish or revise a report | [reports.md](references/reports.md) | Canonical HTML and relevant companion URLs. |
| Start, change, reuse, or retire a preview | [previews.md](references/previews.md) | Required assets, APIs, deep links, and live updates through its private URL. |
| Reported client/network failure | [troubleshooting.md](references/troubleshooting.md) | Separate server evidence from client DNS, routing, and TLS evidence. |

Use the documented script interface first. Inspect implementation only for a concrete unresolved failure or uncertainty. A prepared report needs delivery, not another design workflow. Use report-builder when creating or redesigning report content; keep routine answers in chat.

Publish reviewable work automatically. Reports stay outside Git until explicitly deleted; preview cleanup never deletes them. Keep preview links in chat. Reuse each worktree/service allocation and never recycle a retired URL for unrelated work.

Match checks to the task. A transport check does not prove browser behavior. Do not start Mac diagnostics without a reported client failure or evidence requiring them. State Mac access as untested when only server checks ran. Investigate failed required checks before claiming readiness; an expected diagnostic failure can establish a problem without being a successful delivery.

Keep previews running until explicitly stopped, or until both the task is finished and its code is merged. Keep their worktrees while active. Before removing a checkout, inspect all its services, uncommitted files, and unpushed commits; preserve uncertain work. Enabled startup is not proof of tested reboot recovery.

If tools or permissions are missing, finish independent work and retain prepared reports as pending. Give the exact remaining command, machine, and account. Do not reset Tailscale, alter DNS or operator privileges, or substitute public Funnel hosting.
