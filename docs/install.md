# Build and expose lab-skills

Keep this tree in the editable lloydrichards/skills checkout. Do not run `npm install -g` on a copied package: that would create another source location. The package is private and its bin entry points at the checkout launcher. A resolved owning root inside node_modules is rejected, including copied global npm installations. Dependencies and build output are generated locally and are not included in the source archive.

Use Bun 1.4.2 for development. The built CLI runs under Node 22.12+, Node 24+, or Node 26+, and Bun. From the owning checkout:

```sh
bun install --frozen-lockfile
bun run format:check
bun run check
bun run lint
bun run test
bun run build
node apps/lab-skills/bin/lab-skills.mjs validate
```

To use the Stack Effect Nix development shell, install Nix with flakes enabled. Add the generated files to Git so Nix can see them, then enter the shell:

```sh
git add flake.nix .envrc
nix develop
bun install --frozen-lockfile
bun run build
node apps/lab-skills/bin/lab-skills.mjs validate
```

The shell provides Bun, Node 24, and Git on x86_64 Linux, aarch64 Linux, and Apple Silicon macOS. Nixpkgs determines their versions. The first `nix develop` creates `flake.lock`; commit that file to pin the environment. This environment was generated with Stack Effect 0.18.1's `workspace-devenv-nix-flake` module.

If you use direnv with nix-direnv, run `direnv allow` to load the same shell automatically. `.direnv/` and Nix result links are ignored by Git.

After the build, Node execution does not require a Bun executable. To test Bun execution explicitly:

```sh
bun run test:bun
bun apps/lab-skills/bin/lab-skills.mjs validate
```

The previous `packages/lab-skills/bin/lab-skills.mjs` path is a compatibility launcher that imports the new launcher, so existing PATH links continue to resolve the owning checkout. New links use `apps/lab-skills/bin/lab-skills.mjs`.

The install runs `prepare` to patch TypeScript and Oxlint with Effect TSGo. If you install with `--ignore-scripts`, run `bun run prepare` before checks. `bun run check` and `bun run type-check` check application and test types. `bun run lint` enforces the configured Effect diagnostics.

Native filesystem adapters retain POSIX file identity, exclusive creation, atomic replacement, and Git plumbing. Their lint exceptions are scoped to those adapters. Tests and the dependency-free launcher have separate exceptions; production workflows retain the Effect rules.

Stack Effect setup is recorded in `stack.effect.json`. `bun run stack:schema` and `bun run stack:plan` use CLI version 0.18.1. The generated CLI starter was adapted to `apps/lab-skills` and NodeNext output for execution under both runtimes. Future generated starter files need review before they replace these application-specific choices.

Use the workspace TypeScript version in your editor. The checked-in VS Code settings enable native TSGo and point at `node_modules/typescript/bin`. Other editors must use the Effect TSGo language server as their TypeScript server.

The test suite uses temporary homes. Network payload cases in that suite use an injected HTTP service and a tar fixture. The optional integration check makes real pinned upstream downloads, installs default plus Effect into temporary homes, checks repeat application and status, then removes those homes:

```sh
node apps/lab-skills/test/real-upstream.mjs node
node apps/lab-skills/test/real-upstream.mjs bun
```

Expose the checkout on PATH later, after review. Run these commands only after choosing the permanent source checkout:

```sh
skills_checkout=$(pwd -P)
mkdir -p "$HOME/.local/bin"
ln -s "$skills_checkout/apps/lab-skills/bin/lab-skills.mjs" "$HOME/.local/bin/lab-skills"
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
