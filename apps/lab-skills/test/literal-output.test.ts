import { assert, describe, it } from "@effect/vitest";
import { Box } from "effect-boxes";
import { renderHuman, renderText } from "../src/output.js";
import { literal, literalValue, paragraph } from "../src/tui/ui.js";

describe("Literal metadata", () => {
  it("represents whitespace and controls reversibly without terminal control bytes", () => {
    for (const path of [
      "/tmp/two  spaces",
      "/tmp/tab\tname",
      "/tmp/\u001b[2J",
      "/tmp/end ",
      "/tmp/\u0085name",
      '/tmp/"quoted"\\name',
    ]) {
      const displayed = literalValue(path);
      assert.strictEqual(JSON.parse(displayed), path);
      assert.notInclude(displayed, "\u001b");
      assert.strictEqual(renderText(literal(path, 200), false), displayed);
      for (const width of [1, 2, 7, 24]) {
        const box = literal(path, width);
        assert.isAtMost(box.cols, width);
        assert.strictEqual(
          renderText(box, false).split("\n").join(""),
          displayed,
        );
      }
    }
  });

  it("wraps Unicode by terminal cells while keeping graphemes intact", () => {
    const path = "/tmp/界面/cafe\u0301";
    for (const width of [2, 3, 8]) {
      const box = literal(path, width);
      assert.isAtMost(box.cols, width);
      assert.strictEqual(renderText(box, false).split("\n").join(""), path);
    }
    assert.isAtMost(literal(path, 1).cols, 1);
    assert.strictEqual(
      Box.renderPlainSync(paragraph("two  words", 80)),
      "two words",
    );
  });

  it("uses literal locations in human tables and diagnostic output", () => {
    const path = "/tmp/two  spaces/\tname";
    const output = renderHuman(
      {
        schemaVersion: 1,
        command: "status",
        ok: true,
        exitCode: 0,
        checkout: "/work/skills",
        home: "/tmp/two  spaces",
        selection: { profiles: ["default"], skills: [], targets: ["agents"] },
        entries: [{ id: "agents/example", path, status: "current" }],
        diagnostics: [
          { code: "LOCAL_EDIT", severity: "warning", message: "Changed", path },
        ],
      },
      120,
    );
    assert.include(renderText(output.stdout, false), literalValue(path));
  });
});
