# Validate the proposal on HP

Transfer `lab-skills-source.tar.gz` and its `.sha256` file to coder's home. The archive includes editable source, manifests and the npm lockfile. It excludes Git metadata, node_modules, build output, platform engines and pending ownership candidates. SNAPSHOT.json records the original source base; Git provenance becomes available when this work is integrated into the owning checkout later.

On HP, use a supported Node version and a new extraction directory:

```sh
cd "$HOME"
sha256sum -c lab-skills-source.tar.gz.sha256
review_dir=$(mktemp -d "$HOME/lab-skills-review.XXXXXX")
tar -xzf "$HOME/lab-skills-source.tar.gz" -C "$review_dir"
cd "$review_dir/source"
npm ci --ignore-scripts
npm run check
npm test
node packages/lab-skills/test/real-upstream.mjs node
```

The integration script installs into temporary homes and removes them afterward. It fetches real pinned upstream archives. It never targets /home/coder. If Bun is already installed, also run `npm run test:bun` and `node packages/lab-skills/test/real-upstream.mjs bun`.

Preview the real account read-only:

```sh
node packages/lab-skills/bin/lab-skills.mjs validate --json
node packages/lab-skills/bin/lab-skills.mjs plan \
  --home "$HOME" --profile default --profile effect --target agents --json
node packages/lab-skills/bin/lab-skills.mjs doctor \
  --home "$HOME" --profile default --profile effect --target agents --json
```

These commands do not create machine configuration or ownership state. Existing unowned installations, Python state or interrupted operations can return exit 3. Preserve the output for review; do not clear conflicts by deleting originals. Runtime discovery and any later adoption/install action remain separate decisions. The same read-only preview can select pi or opencode destinations without changing their configuration.
