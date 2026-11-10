# Start and manage previews

Inspect the project launch commands and required dependencies. Use the worktree root as the identity, even if the app is nested within it. Keep server listeners on loopback. Browser-facing services get separate private HTTPS ports; internal dependencies do not need browser endpoints.

On home-lab as coder, for a Vite app with a docs package:

```bash
bash ~/.local/lib/lab-publish/start-preview.sh \
  /absolute/path/to/worktree docs -- \
  bun run --cwd apps/docs dev --host 127.0.0.1 --port '{port}' --strictPort
```

The script replaces literal `{port}` in command arguments with the allocated internal port. It stores the argument vector and launch PATH. It supplies `PORT`, `LAB_PREVIEW_PORT`, `LAB_PREVIEW_URL`, `LAB_PREVIEW_HOST`, and Vite's additional allowed hostname. An application's own bind and port options still take precedence. Do not assume every framework uses PORT.

Use `--health-path /health` before `--` when `/` is not a successful readiness endpoint. Use `--env-file /absolute/path/to/private.json` for required environment values. That file must contain a JSON object of strings and is copied privately into the allocation's launch directory. Never put credentials in command arguments, chat, or Git.

Repeat the same worktree and service name to reuse its allocation and stored launch command. After repairing a failed app, the same invocation starts it again and retries publication. Arguments do not silently change the saved launch. Use `--update` before `--` to deliberately replace the saved command, environment, and health path while keeping the allocation. Supply the complete desired environment file again on update.

Inspect current allocations or one exact allocation:

```bash
bash ~/.local/lib/lab-publish/preview-status.sh
bash ~/.local/lib/lab-publish/preview-status.sh PREVIEW_ID
```

The record contains the worktree, service, unit, ports, and URL. Status includes runtime failures, recent journal entries, process ownership, and HTTP checks. Once the administrator helper is installed, the launcher removes its route on exit and restores it after startup readiness. A running process can still have failed readiness. Activation clears the saved ready flag before checking again; failed routing or HTTPS leaves publication-pending with last_error. Prefer current probe results over an old ready snapshot. After an initial launch plus three retries, the launcher leaves the unit failed. Repair it explicitly; do not change ports or fall back to another checkout.

After transport passes, verify required APIs, assets, authentication redirects, and live updates in a browser through the private URL. Start an API service first if the frontend needs its private URL. Use the resulting URL in frontend environment configuration. Separate service ports are separate browser origins, so check CORS and cookies where relevant.

Stop a service only on explicit request or when its task is finished and its code is merged:

```bash
bash ~/.local/lib/lab-publish/stop-preview.sh PREVIEW_ID
```

Stopping removes its route before releasing its internal port, disables its unit, and retains the retired HTTPS allocation. It does not delete reports or worktrees. Check all services in the worktree before removing the checkout. Never edit the allocation records to recycle an old URL. Invalid JSON, invalid fields, or conflicting reservations block allocation and reuse. Preserve those records and diagnose ownership; do not remove a broken reservation merely to obtain a free port. If the reserved HTTPS range is exhausted, report the limit and arrange a deliberate range extension.
