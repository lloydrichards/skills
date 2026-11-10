# Build and expose lab-skills

Keep this tree in the editable lloydrichards/skills checkout. Do not run `npm install -g` on a copied package: that would create another source location. The package is private and its bin entry points at the checkout launcher. A resolved owning root inside node_modules is rejected, including copied global npm installations. Dependencies and build output are generated locally and are not included in the source archive.

Use Node 22.12+, Node 24+, or Node 26+. The optional Bun execution path was tested with Bun 1.4.0. From the owning checkout:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
node packages/lab-skills/bin/lab-skills.mjs validate
```

Bun is optional. Node execution does not require a Bun executable. To test Bun explicitly:

```sh
npm run test:bun
bun packages/lab-skills/bin/lab-skills.mjs validate
```

The test suite uses temporary homes. Network payload cases in that suite use an injected HTTP service and a tar fixture. The optional integration check makes real pinned upstream downloads, installs default plus Effect into temporary homes, checks repeat application and status, then removes those homes:

```sh
node packages/lab-skills/test/real-upstream.mjs node
node packages/lab-skills/test/real-upstream.mjs bun
```

Expose the checkout on PATH later, after review. Run these commands only after choosing the permanent source checkout:

```sh
skills_checkout=$(pwd -P)
mkdir -p "$HOME/.local/bin"
ln -s "$skills_checkout/packages/lab-skills/bin/lab-skills.mjs" "$HOME/.local/bin/lab-skills"
export PATH="$HOME/.local/bin:$PATH"
```

`ln -s` refuses an existing destination. Inspect it rather than replacing it blindly. Add the PATH export to your shell configuration only if you want it persisted. No CLI command changes PATH or shell configuration. The launcher resolves its real path, so it uses the same editable source when called from another directory or through the symlink.

`lab-skills` uses the Node shebang. Run `bun "$HOME/.local/bin/lab-skills" ...` to select Bun explicitly. Before importing application modules, the small launcher restarts Bun with its runtime transpiler cache disabled. This prevents Bun's default cache creation during read-only commands. See [Bun's cache documentation](https://bun.com/docs/runtime/environment-variables).

For a persistent machine selection, create the machine-local file only after review:

```json
{
  "schema": 1,
  "home": "/home/coder",
  "profiles": ["default", "effect"],
  "targets": ["agents"]
}
```

Its default location is `$XDG_CONFIG_HOME/lab-skills/config.json`, or `$HOME/.config/lab-skills/config.json`. CLI fields override its corresponding fields. An explicit `--config` overrides `LAB_SKILLS_CONFIG`. No configuration file is created automatically. apply requires an explicit home and target through configuration or flags.

Read [the contract](contract.md) before using apply and [the recovery procedure](recovery.md) if doctor reports interrupted operations. Existing Mac directories are not automatically adopted. Python ownership state blocks mutation and needs a separately reviewed migration.
