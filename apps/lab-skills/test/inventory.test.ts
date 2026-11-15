import { prepareInventory, applyInventory } from "../src/inventory-live.js";
import { problem } from "../src/error.js";
import { assert, describe, it } from "@effect/vitest";
import {
  Cause,
  ConfigProvider,
  Effect,
  Option,
  Queue,
  Stdio,
  Terminal,
} from "effect";
import { mkdir, writeFile, symlink, readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  collectInventory,
  buildInventoryReview,
  enablementPreview,
  inventoryRows,
  membership,
  reviewInventory,
  toggleMembership,
  frontmatter,
} from "../src/inventory.js";
import { runInventory, inventoryTable } from "../src/tui/inventory.js";
import { reviewLayout, reviewTabs } from "../src/tui/inventory-review.js";
import { Box } from "effect-boxes";
import { parse } from "../src/commands.js";
import { runtimeLayer } from "../src/runtime.js";
import { Disk, HttpBytes, OwnershipState } from "../src/services.js";
import { io, temporaryDirectory } from "./support.js";
const live = runtimeLayer(process.env.PATH ?? "");
const fixture = Effect.gen(function* () {
  const base = yield* temporaryDirectory("lab-skills-inventory-");
  const root = join(base, "source"),
    home = join(base, "home");
  const put = (file: string, text: string) =>
    io(async () => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, text);
    });
  const md = (name: string) =>
    `---\nname: ${name}\ndescription: >\n  Real ${name}\n  description.\n---\n`;
  const skills = {
    base: { source: { local: "skills/base" }, dependencies: [] },
    app: { source: { locked: "app" }, dependencies: ["base"] },
    blocked: {
      source: { local: "skills/blocked" },
      dependencies: [],
      blocked_reason: "Missing prerequisite",
    },
  };
  const hash = (text: string) => ({
    sha256: createHash("sha256").update(text).digest("hex"),
    executable: false,
  });
  yield* put(
    join(root, "manifest.json"),
    JSON.stringify({
      schema: 1,
      owner: "fixture",
      skills,
      profiles: { default: ["base"] },
      external: { rex: { reason: "external" }, but: { reason: "external" } },
      candidates: {},
    }),
  );
  yield* put(
    join(root, "sources.lock.json"),
    JSON.stringify({
      schema: 1,
      sources: {
        app: {
          repository: "example/skills",
          commit: "a".repeat(40),
          path: "skills/app",
          revision_basis: "fixture baseline",
          files: {
            "SKILL.md": hash(md("app")),
            "UPSTREAM-LICENSE": hash("license"),
          },
          license_files: { "UPSTREAM-LICENSE": "LICENSE" },
        },
      },
    }),
  );
  for (const name of ["base", "blocked"])
    yield* put(join(root, "skills", name, "SKILL.md"), md(name));
  for (const name of ["base", "app"])
    yield* put(join(home, ".agents/skills", name, "SKILL.md"), md(name));
  yield* put(
    join(home, ".codex/skills/.system/system-only/SKILL.md"),
    md("system-only"),
  );
  yield* io(() => mkdir(join(home, ".claude/skills"), { recursive: true }));
  yield* io(() =>
    symlink(join(home, ".agents/skills/app"), join(home, ".claude/skills/app")),
  );
  return { root, home, base, put, md };
});
const flags = { command: "inventory" as const, json: false, dryRun: true };
const treeSnapshot = async (base: string): Promise<string[]> => {
  const result: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile())
        result.push(
          file +
            ":" +
            createHash("sha256")
              .update(await readFile(file))
              .digest("hex"),
        );
    }
  }
  await walk(base);
  return result.sort();
};
describe("dry-run inventory", () => {
  it.live(
    "compares full payloads, previews matching adoption and licenses, and cannot call writers or downloads",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture,
          disk = yield* Disk,
          store = yield* OwnershipState;
        const before = yield* io(() => treeSnapshot(f.base));
        const unsupported = yield* collectInventory(
          f.root,
          { ...flags, targets: ["codex"] },
          { home: f.home },
        ).pipe(Effect.flip);
        assert.equal(unsupported.code, "ARGUMENT_INVALID");
        const forbidden = () =>
          Effect.die("Dry-run attempted mutation or network access");
        const model = yield* collectInventory(f.root, flags, {
          home: f.home,
        }).pipe(
          Effect.provideService(Disk, {
            ...disk,
            mkdir: forbidden,
            write: forbidden,
            chmod: forbidden,
            rename: forbidden,
            remove: forbidden,
            atomic: forbidden,
          }),
          Effect.provideService(OwnershipState, {
            read: store.read,
            write: forbidden,
          }),
          Effect.provideService(HttpBytes, { get: forbidden }),
        );
        assert.isUndefined(model.skills["system-only"]);
        assert.equal(model.skills["base"]?.copies[0]?.status, "match");
        assert.equal(model.skills["app"]?.copies[0]?.status, "packaging");
        assert.equal(model.skills["app"]?.copies.length, 2);
        assert.match(toggleMembership(model, "app", "client"), /Enabled/);
        const sorted = inventoryRows(model);
        assert.ok(
          sorted.findIndex((row) => row.name === "base") <
            sorted.findIndex((row) => row.name === "app"),
        );
        assert.ok(
          sorted.findIndex((row) => row.name === "app") <
            sorted.findIndex((row) => row.name === "blocked"),
        );
        const review = reviewInventory(model).join("\n");
        assert.match(review, /adopt app/);
        assert.equal(
          review.match(/Add license\/notice:/g)?.length,
          1,
          "shared aliases must not propose duplicate writes",
        );
        assert.match(toggleMembership(model, "base", "client"), /required/i);
        assert.match(
          toggleMembership(model, "blocked", "client"),
          /prerequisite/,
        );
        assert.match(
          toggleMembership(model, "system-only", "client"),
          /No available/,
        );
        const explanation = enablementPreview(model, "app").join("\n");
        assert.match(
          explanation,
          /adopt existing files \+ add 1 license\/notice file/,
        );
        assert.match(explanation, /not replaced or deleted/);
        assert.match(explanation, /Record lab-skills ownership/);
        assert.equal(explanation.match(/Add license\/notice:/g)?.length, 1);
        assert.match(explanation, /Also requires: base/);
        assert.match(
          enablementPreview(model, "app", "home-lab").join("\n"),
          /No remote file operations/,
        );
        const localReview = reviewInventory(model).join("\n");
        toggleMembership(model, "app", "home-lab");
        assert.ok(membership(model, "home-lab").has("base"));
        assert.equal(
          reviewInventory(model)
            .filter((line) => line.startsWith("adopt"))
            .join(),
          localReview
            .split("\n")
            .filter((line) => line.startsWith("adopt"))
            .join(),
        );
        for (const width of [38, 80, 94, 100, 132])
          for (const line of inventoryTable(model, width).lines.flatMap((row) =>
            row.value.split("\n"),
          ))
            assert.ok(line.length <= width, `${width}: ${line}`);
        assert.deepEqual(yield* io(() => treeSnapshot(f.base)), before);
      }).pipe(Effect.scoped, Effect.provide(live)),
  );
  it.live(
    "keeps membership markers separate from warnings and distinguishes status from proposals",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const model = yield* collectInventory(f.root, flags, { home: f.home });
        let table = inventoryTable(model, 132);
        assert.equal(
          table.lines.find((row) => row.name === "base")?.value[2],
          "●",
        );
        assert.equal(
          table.lines.find((row) => row.name === "app")?.value[2],
          " ",
        );
        assert.equal(
          table.rows.find((row) => row.name === "app")?.status,
          "missing notices",
        );
        assert.equal(
          table.rows.find((row) => row.name === "app")?.proposed,
          "",
        );
        assert.match(table.header, /Status +Plan/);
        model.draft.client = ["app"];
        const base = model.skills["base"];
        assert.ok(base);
        if (!base) return;
        base.blocked = "Missing prerequisite";
        table = inventoryTable(model, 132);
        assert.equal(
          table.lines.find((row) => row.name === "app")?.value[2],
          "●",
        );
        assert.equal(
          table.lines.find((row) => row.name === "base")?.value[2],
          "○",
        );
        assert.equal(
          table.rows.find((row) => row.name === "base")?.status,
          "blocked",
        );
        assert.equal(
          table.rows.find((row) => row.name === "app")?.proposed,
          "adopt",
        );
        const ascii = inventoryTable(model, 132, true);
        assert.equal(
          ascii.lines.find((row) => row.name === "app")?.value[2],
          "x",
        );
        assert.equal(
          ascii.lines.find((row) => row.name === "base")?.value[2],
          "o",
        );
        assert.equal(
          ascii.lines.find((row) => row.name === "blocked")?.value[2],
          " ",
        );
        const styled = inventoryTable(model, 132, false, "", "", "all", true)
          .lines.map((row) => row.value)
          .join("\n");
        // oxlint-disable-next-line no-control-regex -- Inspect emitted ANSI style codes.
        const codes = [...styled.matchAll(/\x1b\[([0-9;]+)m/g)].map(
          (match) => match[1],
        );
        assert.ok(codes.includes("1") && codes.includes("90"));
        assert.ok(codes.every((code) => ["0", "1", "90"].includes(code ?? "")));
      }).pipe(Effect.scoped, Effect.provide(live)),
  );
  it.live(
    "shows missing for enabled absent skills and dependencies, available for unselected absent skills",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const model = yield* collectInventory(f.root, flags, { home: f.home });
        const base = model.skills["base"],
          app = model.skills["app"];
        if (!base || !app) return assert.fail("Fixture skills missing");
        base.copies = [];
        app.copies = [];
        let table = inventoryTable(model, 132);
        assert.equal(
          table.rows.find((row) => row.name === "base")?.status,
          "missing",
        );
        assert.equal(
          table.rows.find((row) => row.name === "base")?.proposed,
          "add",
        );
        assert.equal(
          table.rows.find((row) => row.name === "app")?.status,
          "available",
        );
        assert.equal(
          table.rows.find((row) => row.name === "app")?.proposed,
          "",
        );
        model.draft.client = ["app"];
        table = inventoryTable(model, 132);
        for (const name of ["base", "app"]) {
          assert.equal(
            table.rows.find((row) => row.name === name)?.status,
            "missing",
          );
          assert.equal(
            table.rows.find((row) => row.name === name)?.proposed,
            "add",
          );
        }
        assert.equal(
          table.lines.find((row) => row.name === "base")?.value[2],
          "○",
        );
        assert.equal(
          table.lines.find((row) => row.name === "app")?.value[2],
          "●",
        );
      }).pipe(Effect.scoped, Effect.provide(live)),
  );
  it.live(
    "excludes provider bundles and linked aliases while retaining user skills with the same names",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const system = join(f.home, ".codex/skills/.system");
        const plugin = join(
          f.home,
          ".codex/plugins/cache/example/skills/plugin-only",
        );
        const claudePlugin = join(
          f.home,
          ".claude/plugins/cache/example/skills/claude-only",
        );
        yield* f.put(join(system, "base/SKILL.md"), f.md("base"));
        yield* f.put(join(plugin, "SKILL.md"), f.md("plugin-only"));
        yield* f.put(join(claudePlugin, "SKILL.md"), f.md("claude-only"));
        yield* f.put(
          join(f.home, ".codex/skills/user-only/SKILL.md"),
          f.md("user-only"),
        );
        yield* f.put(
          join(f.home, ".codex/plugins-user/near-prefix/SKILL.md"),
          f.md("near-prefix"),
        );
        yield* io(() =>
          symlink(
            join(system, "system-only"),
            join(f.home, ".agents/skills/system-alias"),
          ),
        );
        yield* io(() =>
          symlink(plugin, join(f.home, ".agents/skills/plugin-alias")),
        );
        yield* io(() =>
          symlink(claudePlugin, join(f.home, ".claude/skills/plugin-alias")),
        );
        yield* io(() =>
          symlink(
            join(f.home, ".codex/plugins-user/near-prefix"),
            join(f.home, ".agents/skills/near-prefix"),
          ),
        );
        yield* io(() =>
          mkdir(join(f.home, ".agents/skills/file-alias"), { recursive: true }),
        );
        yield* io(() =>
          symlink(
            join(plugin, "SKILL.md"),
            join(f.home, ".agents/skills/file-alias/SKILL.md"),
          ),
        );
        const before = yield* io(() => treeSnapshot(f.base));
        const model = yield* collectInventory(f.root, flags, { home: f.home });
        for (const name of [
          "system-only",
          "plugin-only",
          "claude-only",
          "file-alias",
        ])
          assert.isUndefined(model.skills[name]);
        assert.equal(model.skills["base"]?.copies.length, 1);
        assert.equal(model.skills["app"]?.copies.length, 2);
        assert.equal(model.skills["user-only"]?.copies.length, 1);
        assert.equal(model.skills["near-prefix"]?.copies.length, 1);
        assert.ok(
          model.skills["blocked"],
          "Catalog-only entries remain available for review",
        );
        assert.ok(
          model.excluded.some((item) => item.path.endsWith("system-alias")),
        );
        assert.ok(
          model.excluded.some((item) =>
            item.path.endsWith("file-alias/SKILL.md"),
          ),
        );
        assert.deepEqual(yield* io(() => treeSnapshot(f.base)), before);
      }).pipe(Effect.scoped, Effect.provide(live)),
  );
  it.live(
    "external skills can join either profile without granting file-management authority",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        yield* f.put(join(f.home, ".agents/skills/but/SKILL.md"), f.md("but"));
        const before = yield* io(() => treeSnapshot(f.base));
        const model = yield* collectInventory(f.root, flags, { home: f.home });
        const installed = JSON.stringify(model.skills["but"]?.copies);
        for (const profile of ["client", "home-lab"] as const)
          for (const name of ["but", "rex"])
            assert.match(toggleMembership(model, name, profile), /Enabled/);
        const rows = inventoryRows(model);
        for (const name of ["but", "rex"]) {
          const row = rows.find((row) => row.name === name);
          assert.equal(row?.enabled, true);
          assert.equal(row?.status, "external");
          assert.equal(row?.proposed, "");
          assert.deepEqual(row?.profiles, ["client", "home-lab"]);
          assert.equal(
            inventoryTable(model, 132).lines.find((row) => row.name === name)
              ?.value[2],
            "●",
          );
        }
        let review = reviewInventory(model).join("\n");
        for (const name of ["but", "rex"]) {
          assert.match(review, new RegExp(`Enable ${name} in \\[client\\]`));
          assert.notMatch(
            review,
            new RegExp(`(?:add|adopt|update|remove|Blocked) ${name}`),
          );
        }
        assert.match(
          review,
          /External membership only:.*Provider files and ownership remain unchanged/,
        );
        assert.match(
          enablementPreview(model, "rex").join("\n"),
          /No installed copy detected/,
        );
        assert.match(
          enablementPreview(model, "but").join("\n"),
          /No install, adoption, update, removal or ownership changes/,
        );
        for (const name of ["but", "rex"]) {
          assert.match(toggleMembership(model, name, "client"), /Disabled/);
          assert.match(toggleMembership(model, name, "home-lab"), /Disabled/);
        }
        // Exercise disabling originally enabled external members as well.
        model.original.client.push("but");
        model.draft.client.push("but");
        toggleMembership(model, "but", "client");
        review = reviewInventory(model).join("\n");
        assert.match(review, /Disable but in \[client\]/);
        assert.notMatch(review, /remove but/);
        assert.equal(JSON.stringify(model.skills["but"]?.copies), installed);
        assert.deepEqual(yield* io(() => treeSnapshot(f.base)), before);
      }).pipe(Effect.scoped, Effect.provide(live)),
  );
  it.live(
    "review separates profile edits, dependencies, adoption, notice additions, installs and blockers",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const before = yield* io(() => treeSnapshot(f.base));
        const model = yield* collectInventory(f.root, flags, { home: f.home });
        toggleMembership(model, "app", "client");
        toggleMembership(model, "app", "home-lab");
        toggleMembership(model, "rex", "home-lab");
        let lines = reviewInventory(model),
          review = lines.join("\n");
        const membershipEnd = review.indexOf("Files and ownership on this Mac");
        assert.ok(review.indexOf("Enable app in [client]") < membershipEnd);
        assert.ok(review.indexOf("Enable rex in [home-lab]") < membershipEnd);
        assert.match(review, /Require base in \[home-lab\] \(via app\)/);
        assert.ok(
          review.indexOf("adopt app") > review.indexOf("Adopt existing ("),
        );
        assert.ok(
          review.indexOf("adopt app") < review.indexOf("Add notices ("),
        );
        assert.ok(
          review.indexOf("Add license/notice:") >
            review.indexOf("Add notices ("),
        );
        assert.equal(
          lines.filter((line) => line.startsWith("Add license/notice:")).length,
          1,
        );
        assert.notMatch(
          review.slice(membershipEnd),
          /(?:add|adopt|remove|update) rex/,
        );
        const app = model.skills["app"];
        assert.ok(app);
        if (!app) return;
        app.copies = [];
        review = reviewInventory(model).join("\n");
        assert.ok(
          review.indexOf("add app") > review.indexOf("Install missing ("),
        );
        assert.notMatch(review, /adopt app/);
        app.blocked = "Missing prerequisite";
        review = reviewInventory(model).join("\n");
        assert.ok(
          review.indexOf("Blocked app:") > review.indexOf("Blockers ("),
        );
        assert.notMatch(review, /add app/);
        assert.match(
          review,
          /Membership above is a draft; blockers are unresolved/,
        );
        model.original.client = [];
        model.draft.client = [];
        model.original["home-lab"] = [];
        model.draft["home-lab"] = ["rex"];
        review = reviewInventory(model).join("\n");
        assert.match(review, /No file or ownership changes proposed/);
        assert.match(review, /Enable rex in \[home-lab\]/);
        assert.deepEqual(yield* io(() => treeSnapshot(f.base)), before);
      }).pipe(Effect.scoped, Effect.provide(live)),
  );
  it.live(
    "tabbed review keeps a complete overview and detail tabs aligned with the same draft",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const model = yield* collectInventory(f.root, flags, { home: f.home });
        toggleMembership(model, "app", "client");
        toggleMembership(model, "rex", "home-lab");
        let review = buildInventoryReview(model);
        let overview = reviewLayout(review, { width: 132 });
        const text = overview.body.join("\n");
        assert.match(text, /Profile membership/);
        assert.match(text, /Local files & ownership/);
        assert.match(
          text,
          /Enable rex in \[home-lab\].*external; membership only/,
        );
        assert.match(text, /adopt app/);
        assert.match(text, /notice app.*UPSTREAM-LICENSE/);
        assert.notInclude(text, f.home, "Overview keeps path detail in Files");
        const files = reviewLayout(review, {
          width: 132,
          tab: "Files",
        }).body.join("\n");
        assert.match(files, /Adopt existing/);
        assert.match(files, /Add notices/);
        assert.match(files, /Add license\/notice:/);
        assert.notMatch(files, /(?:add|adopt|update|remove) rex/);
        const app = model.skills["app"];
        assert.ok(app);
        if (!app) return;
        app.copies = [];
        review = buildInventoryReview(model);
        overview = reviewLayout(review, { width: 80 });
        assert.match(overview.body.join("\n"), /install app/);
        assert.match(
          reviewLayout(review, { width: 80, tab: "Files" }).body.join("\n"),
          /Install missing/,
        );
        app.blocked = "Resolve changed content " + "長い説明".repeat(35);
        review = buildInventoryReview(model);
        for (const tab of reviewTabs)
          for (const width of [38, 80, 132])
            for (const ascii of [false, true])
              for (const styled of [false, true]) {
                const layout = reviewLayout(review, {
                  width,
                  tab,
                  ascii,
                  styled,
                });
                assert.match(layout.pinned.join("\n"), /Blockers 1/);
                if (!styled)
                  assert.ok(
                    layout.pinned.some((line) => line.includes(`[${tab}`)),
                  );
                for (const line of [...layout.pinned, ...layout.body]) {
                  // oxlint-disable-next-line no-control-regex -- Check actual visible terminal cells, excluding renderer-owned styles.
                  const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
                  assert.ok(
                    Box.text(plain).cols <= width,
                    `${width}: ${plain}`,
                  );
                }
              }
        assert.match(
          reviewLayout(review, { width: 80, tab: "Blockers" }).body.join("\n"),
          /Blocked app/,
        );
        assert.notMatch(
          reviewLayout(review, { width: 80, tab: "Files" }).body.join("\n"),
          /add app/,
        );
      }).pipe(Effect.scoped, Effect.provide(live)),
  );
  it.live("changed instructions and internal links cannot be adopted", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* f.put(
        join(f.home, ".agents/skills/app/SKILL.md"),
        f.md("app") + "Local edits",
      );
      let model = yield* collectInventory(f.root, flags, { home: f.home });
      assert.equal(model.skills["app"]?.copies[0]?.status, "changed");
      assert.equal(
        inventoryRows(model).find((row) => row.name === "app")?.status,
        "changed content",
      );
      assert.match(toggleMembership(model, "app", "client"), /differ/);
      const explanation = enablementPreview(model, "app").join("\n");
      assert.match(explanation, /Cannot enable:.*1 changed file/);
      assert.match(explanation, /No replacement, deletion or adoption/);

      yield* f.put(join(f.home, ".agents/skills/app/SKILL.md"), f.md("app"));
      yield* f.put(
        join(f.home, ".agents/skills/app/agents/openai.yaml"),
        "name: local metadata",
      );
      model = yield* collectInventory(f.root, flags, { home: f.home });
      assert.match(enablementPreview(model, "app").join("\n"), /1 extra file/);
      assert.equal(
        inventoryRows(model).find((row) => row.name === "app")?.status,
        "extra files",
      );
      assert.match(
        enablementPreview(model, "app").join("\n"),
        /Existing file contents match where present/,
      );
      assert.match(toggleMembership(model, "app", "client"), /Cannot enable/);
      yield* io(() =>
        symlink(
          join(f.root, "skills/base/SKILL.md"),
          join(f.home, ".agents/skills/base/linked.md"),
        ),
      );
      model = yield* collectInventory(f.root, flags, { home: f.home });
      assert.equal(model.skills["base"]?.copies[0]?.status, "unknown");
      assert.match(toggleMembership(model, "base", "client"), /unverified/);
    }).pipe(Effect.scoped, Effect.provide(live)),
  );
  it.live(
    "terminal flow reviews profile drafts and adoption but never applies, then restores terminal state",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture,
          terminal = yield* Terminal.Terminal,
          stdio = yield* Stdio.Stdio;
        const before = yield* io(() => treeSnapshot(f.base));
        const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>();
        const keys = [
          "down",
          "space",
          "p",
          "right",
          "space",
          "p",
          "return",
          "tab",
          "tab",
          "right",
          "left",
          "pagedown",
          "y",
          "escape",
          "d",
          "escape",
          "q",
        ];
        for (const name of keys)
          yield* Queue.offer(queue, {
            input: Option.some(name.length === 1 ? name : ""),
            key: { name, ctrl: false, meta: false, shift: false },
          });
        const frames: string[] = [];
        yield* runInventory(f.root, flags, { home: f.home }).pipe(
          Effect.provideService(Stdio.Stdio, {
            ...stdio,
            stdinIsTerminal: Effect.succeed(true),
            stdoutIsTerminal: Effect.succeed(true),
          }),
          Effect.provideService(
            Terminal.Terminal,
            Terminal.make({
              ...terminal,
              columns: Effect.succeed(133),
              rows: Effect.succeed(34),
              readInput: Effect.succeed(queue),
              display: (frame) =>
                Effect.sync(() => {
                  frames.push(frame);
                }),
            }),
          ),
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                TERM: "xterm-256color",
                NO_COLOR: "1",
              }),
            ),
          ),
        );
        const output = frames.join("\n");
        assert.match(output, /< home-lab >/);
        assert.match(output, /\[Overview\]/);
        assert.match(output, /\[Profiles 2\]/);
        assert.match(output, /\[Files /);
        assert.match(output, /\[Blockers 0\]/);
        assert.match(output, /Add license\/notice:/);
        assert.match(output, /Enable app in \[home-lab\]/);
        assert.match(output, /Apply is disabled/);
        assert.match(output, /Physical:/);
        assert.ok(frames.at(-1)?.includes("\x1b[?1049l"));
        assert.deepEqual(yield* io(() => treeSnapshot(f.base)), before);
      }).pipe(Effect.scoped, Effect.provide(live)),
  );
  it("reads folded frontmatter and neutralizes terminal controls", () => {
    assert.equal(
      frontmatter(
        "---\nname: example\ndescription: >\n  Hello\n  world.\n---\n",
      ).description,
      "Hello world.",
    );
    assert.equal(
      frontmatter('---\ndescription: "\\e[31mred"\n---\n').description.includes(
        "\x1b",
      ),
      false,
    );
  });
  it.live(
    "accepts only the root dry-run mode and refuses apply combinations",
    () =>
      Effect.gen(function* () {
        assert.equal(
          (yield* parse(["--dry-run", "--ascii"])).command,
          "inventory",
        );
        for (const args of [
          ["apply", "--dry-run"],
          ["--dry-run", "--json"],
          ["--dry-run", "--tui"],
          ["--dry-run=false"],
          ["--dry-run", "false"],
          ["status", "--ascii"],
        ]) {
          const error = yield* parse(args).pipe(Effect.flip);
          assert.equal(error.code, "ARGUMENT_INVALID");
        }
      }).pipe(Effect.provide(live)),
  );
});

describe("live inventory review", () => {
  const setup = Effect.gen(function* () {
    const f = yield* fixture;
    const manifestFile = join(f.root, "manifest.json");
    const manifest = JSON.parse(
      yield* io(() => readFile(manifestFile, "utf8")),
    );
    manifest.skills.fresh = {
      source: { local: "skills/fresh" },
      dependencies: [],
    };
    yield* f.put(join(f.root, "skills/fresh/SKILL.md"), f.md("fresh"));
    yield* f.put(manifestFile, JSON.stringify(manifest));
    const liveFlags = {
      command: "inventory" as const,
      json: false,
      profiles: ["client"],
    };
    manifest.profiles = { client: ["base"], "home-lab": [] };
    yield* f.put(manifestFile, JSON.stringify(manifest));
    const environment = { home: f.home };
    const model = yield* collectInventory(f.root, liveFlags, environment);
    model.draft.client = ["rex", "base", "fresh"];
    model.draft["home-lab"] = ["but"];
    return { ...f, model, environment, liveFlags, manifestFile };
  });
  it.live(
    "saves both profiles, adopts a match and installs missing files, leaving external files alone",
    () =>
      Effect.gen(function* () {
        const f = yield* setup;
        const preview = yield* prepareInventory(
          f.model,
          f.liveFlags,
          f.environment,
        );
        assert.deepStrictEqual(preview.review.blockers, []);
        assert.deepStrictEqual(
          preview.review.operations.map((op) => [op.name, op.action]),
          [
            ["base", "adopt"],
            ["fresh", "add"],
          ],
        );
        const result = yield* applyInventory(
          f.model,
          f.liveFlags,
          f.environment,
          preview,
        );
        assert.isFalse(
          result.entries.some((entry) => entry.status === "conflict"),
        );
        const state = yield* (yield* OwnershipState).read(
          join(f.home, ".local/state/lab-skills/state.json"),
        );
        assert.deepStrictEqual(Object.keys(state.installations).sort(), [
          "agents/base",
          "agents/fresh",
        ]);
        assert.strictEqual(
          yield* io(() =>
            readFile(join(f.home, ".agents/skills/base/SKILL.md"), "utf8"),
          ),
          f.md("base"),
        );
        const saved = JSON.parse(
          yield* io(() => readFile(f.manifestFile, "utf8")),
        );
        assert.deepStrictEqual(saved.profiles, {
          client: ["base", "fresh", "rex"],
          "home-lab": ["but"],
        });
        const config = JSON.parse(
          yield* io(() =>
            readFile(join(f.home, ".config/lab-skills/config.json"), "utf8"),
          ),
        );
        assert.deepStrictEqual(config.profiles, ["client"]);
        const refreshed = yield* collectInventory(
          f.root,
          f.liveFlags,
          f.environment,
        );
        const repeated = yield* prepareInventory(
          refreshed,
          f.liveFlags,
          f.environment,
        );
        assert.deepStrictEqual(repeated.review.operations, []);
        assert.deepStrictEqual(repeated.review.blockers, []);
      }).pipe(Effect.provide(live)),
  );
  it.live("cannot write through the dry-run apply boundary", () =>
    Effect.gen(function* () {
      const f = yield* setup,
        preview = yield* prepareInventory(f.model, f.liveFlags, f.environment);
      const before = yield* io(() => treeSnapshot(f.base));
      const error = yield* applyInventory(
        f.model,
        { ...f.liveFlags, dryRun: true },
        f.environment,
        preview,
      ).pipe(Effect.flip);
      assert.strictEqual(error.code, "ARGUMENT_INVALID");
      assert.deepStrictEqual(yield* io(() => treeSnapshot(f.base)), before);
    }).pipe(Effect.provide(live)),
  );
  it.live(
    "refuses an edited installation after review without saving profiles",
    () =>
      Effect.gen(function* () {
        const f = yield* setup,
          preview = yield* prepareInventory(
            f.model,
            f.liveFlags,
            f.environment,
          );
        yield* f.put(
          join(f.home, ".agents/skills/base/SKILL.md"),
          "local edit",
        );
        const before = yield* io(() => treeSnapshot(f.base));
        const error = yield* applyInventory(
          f.model,
          f.liveFlags,
          f.environment,
          preview,
        ).pipe(Effect.flip);
        assert.strictEqual(error.code, "SOURCE_CHANGED");
        assert.deepStrictEqual(yield* io(() => treeSnapshot(f.base)), before);
      }).pipe(Effect.provide(live)),
  );
  it.live(
    "removes only unchanged owned skills explicitly disabled from the current profile",
    () =>
      Effect.gen(function* () {
        const f = yield* setup;
        yield* applyInventory(
          f.model,
          f.liveFlags,
          f.environment,
          yield* prepareInventory(f.model, f.liveFlags, f.environment),
        );
        const model = yield* collectInventory(
          f.root,
          f.liveFlags,
          f.environment,
        );
        model.draft.client = ["rex", "base"];
        const prepared = yield* prepareInventory(
          model,
          f.liveFlags,
          f.environment,
        );
        assert.deepStrictEqual(
          prepared.review.operations.map((op) => [op.name, op.action]),
          [["fresh", "remove"]],
        );
        yield* applyInventory(model, f.liveFlags, f.environment, prepared);
        assert.isUndefined(
          yield* (yield* Disk).info(join(f.home, ".agents/skills/fresh")),
        );
        const state = yield* (yield* OwnershipState).read(
          join(f.home, ".local/state/lab-skills/state.json"),
        );
        assert.deepStrictEqual(Object.keys(state.installations), [
          "agents/base",
        ]);
        assert.isDefined(
          yield* (yield* Disk).info(
            join(f.home, ".agents/skills/app/SKILL.md"),
          ),
        );
      }).pipe(Effect.provide(live)),
  );
  it.live(
    "rolls back adoption and installation together if the ownership write fails",
    () =>
      Effect.gen(function* () {
        const f = yield* setup,
          store = yield* OwnershipState;
        const preview = yield* prepareInventory(
          f.model,
          f.liveFlags,
          f.environment,
        );
        const sourceBefore = yield* io(() => readFile(f.manifestFile, "utf8"));
        const error = yield* applyInventory(
          f.model,
          f.liveFlags,
          f.environment,
          preview,
        ).pipe(
          Effect.provideService(OwnershipState, {
            read: store.read,
            write: () =>
              Effect.fail(
                problem("IO_FAILED", "injected state write failure", 1),
              ),
          }),
          Effect.flip,
        );
        assert.strictEqual(error.code, "IO_FAILED");
        assert.strictEqual(
          yield* io(() =>
            readFile(join(f.home, ".agents/skills/base/SKILL.md"), "utf8"),
          ),
          f.md("base"),
        );
        assert.isUndefined(
          yield* (yield* Disk).info(join(f.home, ".agents/skills/fresh")),
        );
        assert.strictEqual(
          yield* io(() => readFile(f.manifestFile, "utf8")),
          sourceBefore,
        );
        assert.isUndefined(
          yield* (yield* Disk).info(
            join(f.home, ".local/state/lab-skills/apply.lock"),
          ),
        );
      }).pipe(Effect.provide(live)),
  );
  it.live(
    "adopts notice-only matches without changing existing skill content",
    () =>
      Effect.gen(function* () {
        const f = yield* setup;
        yield* f.put(join(f.root, "LICENSE"), "collection license\n");
        const model = yield* collectInventory(
          f.root,
          f.liveFlags,
          f.environment,
        );
        const preview = yield* prepareInventory(
          model,
          f.liveFlags,
          f.environment,
        );
        assert.strictEqual(preview.review.noticeChanges.length, 1);
        yield* applyInventory(model, f.liveFlags, f.environment, preview);
        assert.strictEqual(
          yield* io(() =>
            readFile(join(f.home, ".agents/skills/base/SKILL.md"), "utf8"),
          ),
          f.md("base"),
        );
        assert.strictEqual(
          yield* io(() =>
            readFile(
              join(f.home, ".agents/skills/base/COLLECTION-LICENSE.txt"),
              "utf8",
            ),
          ),
          "collection license\n",
        );
      }).pipe(Effect.provide(live)),
  );
  it.live(
    "reinstalls a missing owned skill only through an explicit fresh review",
    () =>
      Effect.gen(function* () {
        const f = yield* setup;
        yield* applyInventory(
          f.model,
          f.liveFlags,
          f.environment,
          yield* prepareInventory(f.model, f.liveFlags, f.environment),
        );
        yield* (yield* Disk).remove(join(f.home, ".agents/skills/fresh"), true);
        const model = yield* collectInventory(
          f.root,
          f.liveFlags,
          f.environment,
        );
        const preview = yield* prepareInventory(
          model,
          f.liveFlags,
          f.environment,
        );
        assert.deepStrictEqual(preview.review.blockers, []);
        assert.deepStrictEqual(
          preview.review.operations.map((op) => [op.name, op.action]),
          [["fresh", "add"]],
        );
        yield* applyInventory(model, f.liveFlags, f.environment, preview);
        assert.strictEqual(
          yield* io(() =>
            readFile(join(f.home, ".agents/skills/fresh/SKILL.md"), "utf8"),
          ),
          f.md("fresh"),
        );
      }).pipe(Effect.provide(live)),
  );
  it.live("rolls an owned removal back when state commit fails", () =>
    Effect.gen(function* () {
      const f = yield* setup,
        store = yield* OwnershipState;
      yield* applyInventory(
        f.model,
        f.liveFlags,
        f.environment,
        yield* prepareInventory(f.model, f.liveFlags, f.environment),
      );
      const model = yield* collectInventory(f.root, f.liveFlags, f.environment);
      model.draft.client = ["base"];
      const preview = yield* prepareInventory(
        model,
        f.liveFlags,
        f.environment,
      );
      yield* applyInventory(model, f.liveFlags, f.environment, preview).pipe(
        Effect.provideService(OwnershipState, {
          read: store.read,
          write: () => Effect.fail(problem("IO_FAILED", "injected failure", 1)),
        }),
        Effect.flip,
      );
      assert.strictEqual(
        yield* io(() =>
          readFile(join(f.home, ".agents/skills/fresh/SKILL.md"), "utf8"),
        ),
        f.md("fresh"),
      );
      assert.isDefined(
        (yield* store.read(join(f.home, ".local/state/lab-skills/state.json")))
          .installations["agents/fresh"],
      );
    }).pipe(Effect.provide(live)),
  );
  it.live(
    "reports file commit accurately when shared profile saving fails",
    () =>
      Effect.gen(function* () {
        const f = yield* setup,
          disk = yield* Disk;
        const preview = yield* prepareInventory(
          f.model,
          f.liveFlags,
          f.environment,
        );
        const error = yield* applyInventory(
          f.model,
          f.liveFlags,
          f.environment,
          preview,
        ).pipe(
          Effect.provideService(Disk, {
            ...disk,
            atomic: (file, data) =>
              file === f.manifestFile
                ? Effect.fail(
                    problem("IO_FAILED", "injected metadata failure", 1),
                  )
                : disk.atomic(file, data),
          }),
          Effect.flip,
        );
        assert.include(error.message, "File transaction completed");
        assert.isDefined(
          yield* disk.info(join(f.home, ".agents/skills/fresh/SKILL.md")),
        );
        assert.isDefined(
          (yield* (yield* OwnershipState).read(
            join(f.home, ".local/state/lab-skills/state.json"),
          )).installations["agents/fresh"],
        );
        assert.isUndefined(
          yield* disk.info(join(f.home, ".config/lab-skills/config.json")),
        );
        assert.isUndefined(
          yield* disk.info(join(f.root, ".lab-skills-profiles.lock")),
        );
      }).pipe(Effect.provide(live)),
  );
  it.live("refuses a source payload changed between inventory and review", () =>
    Effect.gen(function* () {
      const f = yield* setup;
      yield* f.put(join(f.root, "skills/fresh/SKILL.md"), "new source");
      const error = yield* prepareInventory(
        f.model,
        f.liveFlags,
        f.environment,
      ).pipe(Effect.flip);
      assert.strictEqual(error.code, "SOURCE_CHANGED");
    }).pipe(Effect.provide(live)),
  );
  it.live(
    "reports configuration directory failure after files and shared profiles commit",
    () =>
      Effect.gen(function* () {
        const f = yield* setup,
          disk = yield* Disk;
        const preview = yield* prepareInventory(
          f.model,
          f.liveFlags,
          f.environment,
        );
        const error = yield* applyInventory(
          f.model,
          f.liveFlags,
          f.environment,
          preview,
        ).pipe(
          Effect.provideService(Disk, {
            ...disk,
            mkdir: (file, recursive) =>
              file === join(f.home, ".config/lab-skills")
                ? Effect.fail(problem("IO_FAILED", "injected mkdir failure", 1))
                : disk.mkdir(file, recursive),
          }),
          Effect.flip,
        );
        assert.include(error.message, "Files and shared profiles were saved");
        assert.deepStrictEqual(
          JSON.parse(yield* io(() => readFile(f.manifestFile, "utf8")))
            .profiles["home-lab"],
          ["but"],
        );
        assert.isDefined(
          yield* disk.info(join(f.home, ".agents/skills/fresh/SKILL.md")),
        );
        assert.isUndefined(
          yield* disk.info(join(f.home, ".config/lab-skills/config.json")),
        );
      }).pipe(Effect.provide(live)),
  );
});
