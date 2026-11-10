# Diagnose delivery failures

Separate execution permissions, process readiness, routing, DNS, and browser behavior. Keep each probe's protocol, host, and port explicit: successful loopback HTTP and failed private HTTPS can both be correct observations of different routes.

On home-lab as coder, inspect `systemctl --user status lab-reports.service`, preview-status.sh, `ss -lntp`, `tailscale serve status`, and `tailscale funnel status`. A sandbox error connecting to the Tailscale socket does not prove the daemon is stopped. Use the harness's normal permission mechanism for the needed host check.

For previews, confirm that the recorded service owns the internal listener. Never kill an unknown process to claim a port. The script checks systemd cgroup membership and loopback binding before installing a route. Preserve failed allocations while repairing them.

For reports, verify the loopback report server at `http://127.0.0.1:8379/`, then the configured `/reports/` route. Prepared content stays under `~/.local/share/lab-publish/` even when HTTPS is unavailable. The operational guide in proj_home-lab gives the exact administrator installation command if the route helper is missing.

If HTTPS works from home-lab but the Mac reports a name-resolution error, ask for a client-side diagnostic. Substitute the hostname and private IPv4 address discovered from the current Tailscale status, not a remembered address.

Run on the MacBook:

```bash
curl -I --resolve HOSTNAME:443:TAILSCALE_IP https://HOSTNAME/reports/
```

Use the preview's actual HTTPS port on both sides of `--resolve` for a preview. This preserves TLS hostname verification while bypassing DNS. A successful response isolates the immediate problem to name resolution; a timeout can indicate routing or client connectivity. It does not establish which VPN caused the issue.

Check Mac Tailscale connectivity and resolver behavior before proposing changes. A hosts-file entry can be a deliberate fallback, but is not the first automatic action. Do not disable certificate verification or replace a private link with Funnel. If user action is necessary, finish independent work and provide the exact remaining command with its machine and account clearly identified.
