# Open migration decisions

- Confirm ownership of make-pr and mutation-test-loop before bringing their separately preserved snapshots into the public source. The mutation evaluation contains one Mac-specific checkout path. Keep it outside publication until it uses a portable project input. Neither candidate is installable.
- Establish GitButler skill provenance and installed CLI versions, and Rex CLI versions. Their skill names are reserved as externally managed. Do not deduplicate their existing installations as part of this proposal.
- Resolve code-review's tracker setup assumption before removing its explicit installation block. It is third-party, not a custom skill.
- Verify discovery and precedence on HP's installed OpenCode and Pi versions. Select one discovery root per harness to avoid duplicate names. The manifests support variants but do not edit runtime permissions or configuration.
- Resolve Anthropic skill-creator versus Codex's system skill-creator name collision before enabling that optional profile in Codex. Its existing HTML viewer changes are preserved, not newly security-reviewed.
- Review arena's named principle-skill references against the engineering-principles wrapper. The dependency includes the guidance, but tool-specific skill invocation may need an adapter. improve-codebase-architecture still refers to optional codebase-design, which is absent.
- Obtain platform-specific Impeccable engine 0.1.5 separately. Both preserved source variants match upstream 4.3.1, but the local Mac engine was excluded. Installing newer upstream versions is a separate review.
- Decide a later adoption/recovery procedure for current installations. The installer deliberately refuses unowned files, existing links, missing owned directories and orphaned ownership state. It does not delete or repair them.
- Review attribution before publication. Existing notices and discovered upstream licenses are preserved, and comparison baselines are identified accurately. No new ownership claim is made for pending candidates.
- Choose permanent editable checkout locations on Mac and HP. Keep source synchronization separate from installer-owned copies and machine-local state. The publication branch was prepared in an isolated checkout without changing the live Mac workspace.
