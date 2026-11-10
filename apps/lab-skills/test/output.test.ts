import { assert, describe, it } from "@effect/vitest";
import { Box } from "effect-boxes";
import type { Entry, Result } from "../src/model.js";
import { initialView, navigateLive, renderLive } from "../src/tui/live-view.js";
import type { Inspection } from "../src/tui/inspection.js";
import { renderHuman, renderText } from "../src/output.js";

const entry = (status: Entry["status"], name: string): Entry => ({
  id: `agents/${name}`,
  path: `/home/lloyd/.agents/skills/${name}`,
  status,
});
const result = (
  command: string,
  entries: ReadonlyArray<Entry> = [],
): Result => ({
  schemaVersion: 1,
  command,
  ok: true,
  exitCode: 0,
  checkout: "/work/skills",
  home: "/home/lloyd",
  selection: { profiles: ["default"], skills: [], targets: ["agents"] },
  entries,
  diagnostics: [],
});
const plain = (value: Result, width = 80) => {
  const output = renderHuman(value, width);
  return {
    stdout: renderText(output.stdout, false),
    stderr: renderText(output.stderr, false),
  };
};

describe("Human command output", () => {
  it("shows plan changes with full locations while status retains the complete inventory", () => {
    const entries = [
      entry("new", "effect"),
      entry("update", "deslop"),
      entry("current", "unslop"),
      entry("unselected", "make-pr"),
      entry("unmanaged", "external"),
    ];
    const plan = plain(result("plan", entries));
    for (const text of [
      "Proposed changes",
      "Status",
      "Skill",
      "Location",
      "Add",
      "Update",
      entries[0]?.path ?? "",
    ])
      assert.include(plan.stdout, text);
    for (const text of ["unslop", "make-pr", "external", "╭", "│", "\u001b"])
      assert.notInclude(plan.stdout, text);
    assert.strictEqual(plan.stderr, "");
    const status = plain(result("status", entries));
    for (const text of [
      "Current",
      "unslop",
      "Unselected",
      "make-pr",
      "Unmanaged",
      "external",
    ])
      assert.include(status.stdout, text);
  });

  it("wraps complete skill names and locations into continuation cells without truncation", () => {
    const name = "a-very-long-skill-identifier-that-needs-wrapping";
    const location =
      "/home/lloyd/a/long/nested/destination/with/a/very/long/path/" + name;
    const value = result("status", [
      { ...entry("current", name), path: location },
    ]);
    const lines = plain(value, 48).stdout.split("\n").slice(4);
    const reconstructedName = lines
      .map((line) => line.slice(12, 24).trim())
      .join("");
    const reconstructedLocation = lines
      .map((line) => line.slice(26).trim())
      .join("");
    assert.strictEqual(reconstructedName, name);
    assert.strictEqual(reconstructedLocation, location);
    for (const width of [1, 12, 24, 39, 40, 48, 75, 76, 80, 140]) {
      const output = renderHuman(value, width);
      assert.isAtMost(output.stdout.cols, width);
      assert.isAtMost(output.stderr.cols, width);
    }
  });

  it("does not mistake applied rows for new/update classifications or repeat unchanged rows", () => {
    const output = plain(
      result("apply", [
        entry("applied", "effect"),
        entry("applied", "deslop"),
        entry("current", "unslop"),
      ]),
    );
    for (const text of ["Installed changes", "Installed", "effect", "deslop"])
      assert.include(output.stdout, text);
    assert.notInclude(output.stdout, "unslop");
    assert.notInclude(output.stdout, "Update");
    assert.include(
      plain(result("apply", [entry("current", "effect")])).stdout,
      "No installation needed",
    );
    assert.include(
      plain(result("plan", [entry("current", "effect")])).stdout,
      "All selected skills are up to date",
    );
    assert.include(
      plain(result("plan")).stdout,
      "No changes for this selection",
    );
  });

  it("puts warnings on stdout and errors on stderr, preserving codes, causes and locations", () => {
    const value: Result = {
      ...result("doctor", [entry("current", "quiet-skill")]),
      ok: false,
      exitCode: 3,
      diagnostics: [
        {
          code: "BROKEN_LINK",
          severity: "warning",
          message: "Discovery link has no readable target",
          path: "/home/lloyd/.agents/skills/broken",
        },
        {
          code: "INTERRUPTED_OPERATION",
          severity: "error",
          message: "Installer lock exists",
          path: "/home/lloyd/.local/state/lab-skills/apply.lock",
        },
      ],
    };
    const output = plain(value);
    for (const text of [
      "Warning",
      "BROKEN_LINK",
      "Discovery link has no readable target",
      "/home/lloyd/.agents/skills/broken",
    ])
      assert.include(output.stdout, text);
    for (const text of [
      "Error",
      "INTERRUPTED_OPERATION",
      "Installer lock exists",
      "/home/lloyd/.local/state/lab-skills/apply.lock",
      "docs/recovery.md",
    ])
      assert.include(output.stderr, text);
    assert.notInclude(output.stdout, "INTERRUPTED_OPERATION");
    assert.notInclude(output.stderr, "BROKEN_LINK");
    assert.notInclude(output.stdout, "quiet-skill");
    assert.isAtMost(renderHuman(value, 24).stderr.cols, 24);
  });

  it("preserves a standalone entry reason and avoids repeating a diagnostic's reason", () => {
    const conflict = {
      ...entry("conflict", "deslop"),
      reason: "Owned files changed",
    };
    const standalone = plain({
      ...result("plan", [conflict]),
      ok: false,
      exitCode: 3,
    });
    assert.include(standalone.stdout, "Owned files changed");
    const diagnosed = plain({
      ...result("plan", [conflict]),
      ok: false,
      exitCode: 3,
      diagnostics: [
        {
          code: "LOCAL_EDIT",
          severity: "error",
          message: conflict.reason,
          path: conflict.path,
        },
      ],
    });
    assert.notInclude(diagnosed.stdout, conflict.reason);
    assert.include(diagnosed.stderr, conflict.reason);
  });

  it("keeps valid results compact and does not certify health on a failed command", () => {
    const valid = plain(result("validate"));
    assert.include(valid.stdout, "Source definitions are valid");
    assert.include(valid.stdout, "/work/skills");
    assert.strictEqual(valid.stdout.split("\n").length, 2);
    assert.include(plain(result("doctor")).stdout, "No diagnostic findings");
    const failed: Result = {
      ...result("apply"),
      ok: false,
      exitCode: 1,
      diagnostics: [
        {
          code: "ROLLBACK_FAILED",
          severity: "error",
          message: "Rollback incomplete",
        },
      ],
    };
    const output = plain(failed);
    assert.include(output.stdout, "Installation needs attention");
    assert.notInclude(output.stdout, "No installation needed");
    assert.include(output.stderr, "ROLLBACK_FAILED");
  });

  it("uses explicit color rendering without terminal cursor controls or raw document escape sequences", () => {
    const value = result("status", [
      { ...entry("new", "effect"), path: "/tmp/\u001b[2Jmalicious" },
    ]);
    const output = renderHuman(value);
    const styled = renderText(output.stdout, true);
    assert.include(styled, "\u001b[");
    assert.notInclude(styled, "\u001b[2J");
    assert.notInclude(styled, "\u001b[?25");
    assert.notInclude(renderText(output.stdout, false), "\u001b");
    assert.notMatch(renderText(output.stdout, false), / +\n/);
    const unicode = renderHuman(
      result("plan", [entry("new", "界面-guidance")]),
      48,
    );
    assert.isAtMost(unicode.stdout.cols, 48);
    assert.include(Box.renderPlainSync(unicode.stdout), "界面");
  });
  it("reuses the compact result in an empty live review and opens installed skills on Enter", () => {
    const value = result("plan", [entry("current", "effect")]);
    const model: Inspection = {
      root: value.checkout,
      options: {
        home: value.home ?? "/home/lloyd",
        selection: value.selection,
      },
      profileNames: ["default"],
      result: value,
      previews: new Map(),
    };
    const state = initialView(model);
    const layout = renderLive(state, model, 80);
    const output = renderText(layout, false);
    assert.include(output, "All selected skills are up to date");
    assert.include(output, "Enter Installed skills");
    assert.notInclude(output, "╭");
    assert.isBelow(layout.rows, 10);
    assert.deepStrictEqual(navigateLive("enter", state, model, 80), {
      _tag: "Submit",
      value: { _tag: "Command", command: "status" },
    });
    assert.include(
      renderText(renderLive({ ...state, mode: "help" }, model, 80), false),
      "Help",
    );
  });
});
