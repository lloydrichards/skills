# Synchronize source from either machine

Edit custom skills and maintained adaptations in the owning source checkout, not installed copies. Review the diff, attribution and tests. Commit and push through your normal repository workflow. Integrate the changes on the other machine while preserving its source edits, then run validate, plan and apply for its selected profiles and roots.

Git synchronization is external to lab-skills. The CLI never pulls, resets, commits, changes branches or manages GitButler. In a GitButler workspace, use its documented workflow. This proposal does not publish anything or prescribe a destructive merge strategy.

Installed edits are conflicts. Preserve them in source or another reviewed location before any adoption/recovery decision. The CLI does not overwrite them or silently fold them into Git. Local content digests are authoritative; Git revision and dirty-source information are recorded and shown beside installed provenance. An unrelated Git commit alone does not reinstall identical skill contents. A changed upstream commit remains an explicit planned update even when its locked files match.

When updating third-party sources, review the immutable commit, subdirectory, all locked file hashes and license records together. Preserve local adaptations as deliberate forks/overlays. A recorded comparison baseline is not an original installer pin. Do not refresh pins with a floating branch at install time.
