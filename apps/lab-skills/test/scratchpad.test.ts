import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Box } from "effect-boxes";
import {
  experimentHandlers,
  navigate,
  renderExperiment,
  sceneNames,
} from "../src/scratchpad.js";

describe("Effect Boxes scratchpad", () => {
  it("keeps every sample view within its requested width, including stacked layouts", () => {
    for (const width of [40, 48, 75, 76, 92, 140]) {
      for (const scene of sceneNames) {
        for (const cursor of [0, 1, 2, 3]) {
          const layout = renderExperiment(scene, cursor, width);
          assert.isAtMost(layout.cols, width, `${scene} at ${width}`);
          const plain = Box.renderPlainSync(layout);
          assert.notInclude(plain, "\u001b");
          assert.include(plain, "SAMPLE DATA");
          for (const line of plain.split("\n")) {
            assert.strictEqual(
              line.split("╭").length,
              line.split("╮").length,
              "Rounded cards must not clip their closing border",
            );
            assert.isAtMost(
              Array.from(
                new Intl.Segmenter("en", { granularity: "grapheme" }).segment(
                  line,
                ),
              ).length,
              width,
            );
          }
        }
      }
    }
  });

  it("changes the detail pane as the inspected skill changes", () => {
    const first = Box.renderPlainSync(renderExperiment("plan", 0, 92));
    const second = Box.renderPlainSync(renderExperiment("plan", 1, 92));
    assert.include(first, "Pinned upstream skill");
    assert.include(second, "Source changed");
    assert.notInclude(first, "Source changed");
  });

  it("wraps selection at both ends, supports keyboard aliases, and submits without an operation", () => {
    assert.deepStrictEqual(navigate("down", 3, 4), {
      _tag: "NextFrame",
      state: 0,
    });
    assert.deepStrictEqual(navigate("up", 0, 4), {
      _tag: "NextFrame",
      state: 3,
    });
    assert.deepStrictEqual(navigate("j", 0, 4), {
      _tag: "NextFrame",
      state: 1,
    });
    assert.deepStrictEqual(navigate("k", 1, 4), {
      _tag: "NextFrame",
      state: 0,
    });
    for (const key of ["return", "q", "escape"]) {
      assert.deepStrictEqual(navigate(key, 0, 4), {
        _tag: "Submit",
        value: undefined,
      });
    }
    assert.deepStrictEqual(navigate("x", 0, 4), { _tag: "Beep" });
  });

  it.effect(
    "erases the previous frame height and emits only a bell for ignored input",
    () =>
      Effect.gen(function* () {
        const handlers = experimentHandlers("doctor", 48);
        const clear = yield* handlers.clear(0, { _tag: "NextFrame", state: 1 });
        assert.strictEqual(
          clear.split("\u001b[2K").length - 1,
          renderExperiment("doctor", 0, 48).rows + 1,
        );
        assert.strictEqual(
          yield* handlers.render(0, { _tag: "Beep" }),
          "\u0007",
        );
        const rendered = yield* handlers.render(1, {
          _tag: "NextFrame",
          state: 1,
        });
        assert.include(rendered, "Broken skill link");
        assert.notMatch(rendered.replaceAll("\r\n", ""), /\n/);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
