import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Box } from "effect-boxes";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import {
  inspect,
  canInstall,
  reviewedPlan,
  withSelection,
  installationRoots,
} from "../src/tui/inspection.js";
import {
  initialView,
  inspectionRows,
  navigateLive,
  renderLive,
  type ViewState,
} from "../src/tui/live-view.js";
import { literalValue } from "../src/tui/ui.js";
import { runtimeLayer } from "../src/runtime.js";
import { HttpBytes, SourceInspection } from "../src/services.js";
import { problem } from "../src/error.js";
import type { Flags } from "../src/config.js";
import { io, temporaryDirectory } from "./support.js";

const fixture = Effect.gen(function* () {
  const base = yield* temporaryDirectory("lab-tui-");
  const root = join(base, "checkout"),
    home = join(base, "home");
  for (const name of ["base", "extra"]) {
    yield* io(() => fs.mkdir(join(root, "skills", name), { recursive: true }));
    yield* io(() =>
      fs.writeFile(
        join(root, "skills", name, "SKILL.md"),
        `---\nname: ${name}\n---\n# ${name}\n\nReal ${name} content.\n`,
      ),
    );
  }
  yield* io(() =>
    fs.writeFile(
      join(root, "manifest.json"),
      JSON.stringify({
        schema: 1,
        owner: "test",
        skills: {
          base: { source: { local: "skills/base" }, dependencies: ["extra"] },
          extra: { source: { local: "skills/extra" }, dependencies: [] },
          upstream: { source: { locked: "upstream" }, dependencies: [] },
        },
        profiles: { everyday: ["base"], advanced: ["upstream"] },
        external: {},
        candidates: {},
      }),
    ),
  );
  yield* io(() =>
    fs.writeFile(
      join(root, "sources.lock.json"),
      JSON.stringify({
        schema: 1,
        sources: {
          upstream: {
            repository: "test/upstream",
            commit: "a".repeat(40),
            path: "skill",
            revision_basis: "test fixture",
            files: {
              "SKILL.md": { sha256: "b".repeat(64), executable: false },
            },
            license_files: {},
          },
        },
      }),
    ),
  );
  const flags: Flags = {
    command: "plan",
    json: false,
    home,
    targets: ["agents"],
    profiles: ["everyday"],
  };
  const environment = { home };
  return { base, root, home, flags, environment };
});
const live = runtimeLayer("");
const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provideService(SourceInspection, {
      git: () =>
        Effect.succeed({ revision: "f".repeat(40), dirty: false, changes: [] }),
      executable: () => Effect.succeed(false),
    }),
    Effect.provideService(HttpBytes, {
      get: () =>
        Effect.fail(
          problem("DOWNLOAD_FAILED", "Inspection must not download", 1),
        ),
    }),
    Effect.provide(live),
  );

// Tests use real temporary checkouts and ownership state. No fixtures reach a user's discovery roots.
describe("Live command inspector", () => {
  it.effect(
    "shows the exact installation root when the home contains repeated spaces",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const home = join(f.base, "two  spaces");
        const model = yield* inspect(f.root, { ...f.flags, home }, { home });
        const rendered = Box.renderPlainSync(
          renderLive(
            { ...initialView(model), page: "confirm" },
            model,
            100,
            30,
          ),
        );
        const encoded = JSON.stringify(join(home, ".agents", "skills")).replace(
          / /g,
          "\\u0020",
        );
        assert.include(rendered, encoded);
        assert.notInclude(rendered, "two spaces");
        const path = "/tmp/a\u00a0\u00a0b\u2003c";
        const details = Box.renderPlainSync(
          renderLive(
            { ...initialView(model), mode: "details" },
            {
              ...model,
              result: {
                ...model.result,
                entries: [{ ...model.result.entries[0]!, path }],
              },
            },
            100,
            30,
          ),
        );
        assert.include(details, literalValue(path));
      }).pipe(Effect.provide(live), Effect.scoped),
  );

  it.effect(
    "reads actual changes and dependencies offline, installs through apply, and then shows current state",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const before = yield* io(() => fs.readdir(f.base));
        const plan = yield* inspect(f.root, f.flags, f.environment);
        assert.deepStrictEqual(
          plan.result.entries.map((e) => [e.id, e.status]),
          [
            ["agents/extra", "new"],
            ["agents/base", "new"],
          ],
        );
        assert.deepStrictEqual(plan.profileNames, ["everyday", "advanced"]);
        assert.include(
          plan.previews.get("agents/extra")?.reason ?? "",
          "agents/base",
        );
        assert.isTrue(canInstall(plan.result));
        assert.deepStrictEqual(yield* io(() => fs.readdir(f.base)), before);
        const upstream = yield* inspect(
          f.root,
          { ...f.flags, profiles: ["advanced"] },
          f.environment,
        );
        assert.include(
          upstream.previews
            .get("agents/upstream")
            ?.document.blocks.map((b) => b._tag)
            .join() ?? "",
          "Paragraph",
        );
        assert.isFalse(
          yield* io(() =>
            fs.access(f.home).then(
              () => true,
              () => false,
            ),
          ),
        );
        const installed = yield* inspect(
          f.root,
          { ...f.flags, command: "apply" },
          f.environment,
          plan.options,
          reviewedPlan(plan),
        );
        assert.strictEqual(installed.result.exitCode, 0);
        assert.isTrue(
          installed.result.entries.every((e) => e.status === "applied"),
        );
        assert.include(
          yield* io(() =>
            fs.readFile(join(f.home, ".agents/skills/base/SKILL.md"), "utf8"),
          ),
          "Real base content",
        );
        const refreshed = yield* inspect(
          f.root,
          f.flags,
          f.environment,
          plan.options,
        );
        assert.isTrue(
          refreshed.result.entries.every((e) => e.status === "current"),
        );
        assert.isFalse(canInstall(refreshed.result));
        assert.deepStrictEqual(inspectionRows(refreshed), []);
        const status = yield* inspect(
          f.root,
          { ...f.flags, command: "status" },
          f.environment,
          plan.options,
        );
        assert.strictEqual(inspectionRows(status).length, 2);
        assert.isFalse(canInstall(status.result));
        const none = withSelection(plan.options, {
          ...plan.options.selection,
          profiles: [],
        });
        const unselected = yield* inspect(f.root, f.flags, f.environment, none);
        assert.deepStrictEqual(unselected.result.selection.profiles, []);
        assert.isTrue(
          unselected.result.entries.every((e) => e.status === "unselected"),
        );
        assert.isTrue(
          yield* io(() =>
            fs
              .access(join(f.home, ".agents/skills/base/SKILL.md"))
              .then(() => true),
          ),
        );
      }).pipe(provide),
  );

  it.effect(
    "blocks local edits in the UI and keeps real diagnostics available to doctor",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const plan = yield* inspect(f.root, f.flags, f.environment);
        yield* inspect(
          f.root,
          { ...f.flags, command: "apply" },
          f.environment,
          plan.options,
          reviewedPlan(plan),
        );
        yield* io(() =>
          fs.appendFile(
            join(f.home, ".agents/skills/base/SKILL.md"),
            "\nLocal change\n",
          ),
        );
        const conflicted = yield* inspect(f.root, f.flags, f.environment);
        assert.strictEqual(conflicted.result.exitCode, 3);
        assert.isFalse(canInstall(conflicted.result));
        assert.isTrue(
          conflicted.result.diagnostics.some((d) => d.code === "LOCAL_EDIT"),
        );
        const state = initialView(conflicted);
        assert.strictEqual(
          navigateLive("enter", state, conflicted, 80)._tag,
          "Beep",
        );
        assert.include(
          Box.renderPlainSync(renderLive(state, conflicted, 80)),
          "Owned files",
        );
        const doctor = yield* inspect(
          f.root,
          { ...f.flags, command: "doctor" },
          f.environment,
          conflicted.options,
        );
        assert.isTrue(
          doctor.result.diagnostics.some((d) => d.code === "LOCAL_EDIT"),
        );
        assert.isFalse(canInstall(doctor.result));
      }).pipe(provide),
  );

  it.effect(
    "rejects a source changed after confirmation before creating the destination home",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const plan = yield* inspect(f.root, f.flags, f.environment);
        yield* io(() =>
          fs.appendFile(
            join(f.root, "skills/base/SKILL.md"),
            "\nChanged after review\n",
          ),
        );
        const applied = yield* inspect(
          f.root,
          { ...f.flags, command: "apply" },
          f.environment,
          plan.options,
          reviewedPlan(plan),
        );
        assert.strictEqual(applied.result.exitCode, 3);
        assert.strictEqual(
          applied.result.diagnostics[0]?.code,
          "SOURCE_CHANGED",
        );
        assert.isFalse(
          yield* io(() =>
            fs.access(f.home).then(
              () => true,
              () => false,
            ),
          ),
        );
        const missingAuthority = yield* inspect(
          f.root,
          { ...f.flags, command: "apply" },
          f.environment,
        ).pipe(Effect.result);
        assert.strictEqual(missingAuthority._tag, "Failure");
      }).pipe(provide),
  );

  it.effect(
    "uses configured homes, targets, explicit skills and profiles, and preserves explicit empty overrides",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const config = join(f.base, "machine.json");
        yield* io(() =>
          fs.writeFile(
            config,
            JSON.stringify({
              schema: 1,
              home: f.home,
              profiles: ["everyday"],
              skills: ["extra"],
              targets: ["codex", "agents"],
            }),
          ),
        );
        const configured = yield* inspect(
          f.root,
          { command: "plan", json: false, config },
          f.environment,
        );
        assert.deepStrictEqual(configured.options.selection, {
          profiles: ["everyday"],
          skills: ["extra"],
          targets: ["codex", "agents"],
        });
        assert.deepStrictEqual(installationRoots(configured.options), [
          join(f.home, ".codex/skills"),
          join(f.home, ".agents/skills"),
        ]);
        const narrowed = yield* inspect(
          f.root,
          { command: "plan", json: false, config },
          f.environment,
          withSelection(configured.options, {
            profiles: [],
            skills: ["extra"],
            targets: ["agents"],
          }),
        );
        assert.deepStrictEqual(narrowed.result.selection, {
          profiles: [],
          skills: ["extra"],
          targets: ["agents"],
        });
        assert.deepStrictEqual(
          narrowed.result.entries.map((e) => e.id),
          ["agents/extra"],
        );
        const invalid = yield* inspect(
          f.root,
          { ...f.flags, profiles: ["constructor"] },
          f.environment,
        );
        assert.strictEqual(invalid.result.exitCode, 2);
        assert.isFalse(canInstall(invalid.result));
        assert.include(
          Box.renderPlainSync(renderLive(initialView(invalid), invalid, 48)),
          "profile",
        );
      }).pipe(provide),
  );

  it.effect(
    "keeps long inventories, pickers, errors and confirmation within the canvas and preserves a safe default",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const model = yield* inspect(f.root, f.flags, f.environment);
        const many = {
          ...model,
          profileNames: Array.from({ length: 50 }, (_, n) => `profile-${n}`),
          result: {
            ...model.result,
            entries: Array.from({ length: 80 }, (_, n) => ({
              ...model.result.entries[0],
              id: `agents/entry-${n}`,
              path: join(f.home, `.agents/skills/entry-${n}`),
              status: "new" as const,
            })),
          },
        };
        for (const width of [40, 48, 75, 76, 80, 100])
          for (const page of [
            "review",
            "profiles",
            "targets",
            "confirm",
            "outcome",
          ] as const)
            for (const cursor of [0, 20, 49]) {
              const state: ViewState = { ...initialView(many), page, cursor };
              const layout = renderLive(state, many, width);
              assert.isAtMost(layout.cols, width, `${page} at ${width}`);
              assert.isAtMost(layout.rows, 23, `${page} at ${width}`);
            }
        const confirm = navigateLive("enter", initialView(model), model, 80);
        assert(confirm._tag === "NextFrame");
        assert.strictEqual(confirm.state.page, "confirm");
        assert.isFalse(confirm.state.authorize);
        const back = navigateLive("enter", confirm.state, model, 80);
        assert(back._tag === "NextFrame");
        assert.strictEqual(back.state.page, "review");
        const selected = navigateLive("right", confirm.state, model, 80);
        assert(selected._tag === "NextFrame");
        assert.deepStrictEqual(
          navigateLive("enter", selected.state, model, 80),
          { _tag: "Submit", value: { _tag: "Install" } },
        );
        const warning = {
          ...model.result,
          diagnostics: [
            {
              code: "PREREQUISITE_MISSING" as const,
              severity: "warning" as const,
              message: "Warning",
            },
          ],
        };
        assert.isTrue(canInstall(warning));
        assert.isFalse(
          canInstall({
            ...warning,
            diagnostics: [
              { code: "LOCAL_EDIT", severity: "error", message: "Blocked" },
            ],
          }),
        );
      }).pipe(provide),
  );
});
