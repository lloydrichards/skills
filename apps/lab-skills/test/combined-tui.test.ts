import { assert, describe, it } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Box } from "effect-boxes";
import { fileURLToPath } from "node:url";
import {
  advanceCombined,
  combinedHandlers,
  initialState,
  loadSkills,
  pages,
  renderCombined,
  visibleSkills,
  type Skill,
  type State,
} from "../src/tui/combined.js";
import { MarkdownBox } from "../src/tui/okf/Markdown.js";
import { parseMarkdown } from "../src/tui/okf/parse.js";

const skills: ReadonlyArray<Skill> = [
  {
    id: "effect",
    change: "Add",
    profile: "effect",
    reason: "Effect profile",
    document: parseMarkdown(
      "# Effect\n\n" +
        Array.from(
          { length: 30 },
          (_, i) => `Paragraph ${i} for scrolling.`,
        ).join("\n\n"),
    ),
  },
  {
    id: "report-builder",
    change: "Add",
    profile: "default",
    reason: "Required by explain-diff.",
    document: parseMarkdown("# Report builder\n\nBuild a report."),
  },
  {
    id: "deslop",
    change: "Update",
    profile: "default",
    reason: "Source changed.",
    document: parseMarkdown("# Deslop\n\nSimplify code."),
  },
];
const step = (state: State, key: string): State => {
  const action = advanceCombined(key, state, skills, 80);
  assert(action._tag === "NextFrame");
  return action.state;
};

describe("Combined setup and inspector", () => {
  it("keeps conversational answers, selectable changes, and Markdown previews within the terminal", () => {
    for (const width of [40, 48, 75, 76, 80, 140]) {
      for (const page of pages) {
        for (const cursor of [0, 1, 2]) {
          const state = { ...initialState, page, cursor };
          const layout = renderCombined(state, skills, width);
          assert.isAtMost(layout.cols, width, `${page} at ${width}`);
          assert.isAtMost(layout.rows, 23, `${page} at ${width}`);
        }
      }
    }
    const review = Box.renderPlainSync(
      renderCombined({ ...initialState, page: "review" }, skills, 80),
    );
    assert.include(review, "◇ Destination  agents");
    assert.include(review, "│ Profiles     default + effect");
    assert.include(review, "SKILL.md");
    assert.include(review, "Paragraph 0");
    assert.notInclude(review, "# Effect");
  });

  it("previews the selected profiles and defaults confirmation to Back", () => {
    let state = step(initialState, "enter");
    state = step(state, "space");
    assert.deepStrictEqual(state.selected, ["effect"]);
    state = step(state, "enter");
    assert.deepStrictEqual(
      visibleSkills(state, skills).map((s) => s.id),
      ["effect"],
    );
    state = step(state, "enter");
    assert.strictEqual(state.page, "confirm");
    assert.isFalse(state.authorize);
    state = step(state, "enter");
    assert.strictEqual(state.page, "review");
    state = step(step(state, "enter"), "right");
    state = step(state, "enter");
    assert.strictEqual(state.page, "done");
    assert.include(
      Box.renderPlainSync(renderCombined(state, skills, 80)),
      "No skills were installed.",
    );
    const empty = { ...initialState, page: "profiles" as const, selected: [] };
    assert.strictEqual(
      advanceCombined("enter", empty, skills, 80)._tag,
      "Beep",
    );
  });

  it("scrolls the document, switches skills, and resets the scroll on navigation", () => {
    const state = { ...initialState, page: "review" as const };
    const scrolled = step(state, "pagedown");
    assert.isAbove(scrolled.offset, 0);
    const before = Box.renderPlainSync(renderCombined(state, skills, 80));
    const after = Box.renderPlainSync(renderCombined(scrolled, skills, 80));
    assert.notStrictEqual(before, after);
    const selected = step(scrolled, "down");
    assert.strictEqual(selected.offset, 0);
    assert.include(
      Box.renderPlainSync(renderCombined(selected, skills, 80)),
      "Report builder",
    );
    const details = step(selected, "m");
    assert.include(
      Box.renderPlainSync(renderCombined(details, skills, 80)),
      "Required by explain-diff",
    );
  });

  it.effect(
    "reads skill previews from the owning checkout and reports missing files without inventing content",
    () =>
      Effect.gen(function* () {
        const root = fileURLToPath(new URL("../../../", import.meta.url));
        const loaded = yield* loadSkills(root);
        const output = Box.renderPlainSync(
          renderCombined({ ...initialState, page: "review" }, loaded, 80),
        );
        assert.include(output, "Use current Effect v4 APIs");
        const missing = yield* loadSkills(
          "/nonexistent-lab-skills-preview-root",
        );
        assert.include(
          Box.renderPlainSync(
            MarkdownBox(missing[0]?.document ?? { blocks: [] }, 40),
          ),
          "Preview unavailable",
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "clears the previous frame exactly and leaves ignored keys out of the frame",
    () =>
      Effect.gen(function* () {
        const handlers = combinedHandlers(skills, 48, 23);
        const state = { ...initialState, page: "review" as const };
        const cleared = yield* handlers.clear(state, {
          _tag: "NextFrame",
          state: step(state, "m"),
        });
        assert.strictEqual(
          cleared.split("\u001b[2K").length - 1,
          renderCombined(state, skills, 48).rows + 1,
        );
        assert.strictEqual(
          yield* handlers.render(state, { _tag: "Beep" }),
          "\u0007",
        );
        assert.strictEqual(
          advanceCombined("q", state, skills, 48)._tag,
          "Submit",
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("Adapted OKF Markdown renderer", () => {
  it("renders skill Markdown and reference links without frontmatter or terminal controls", () => {
    const document = parseMarkdown(
      "---\nname: sample\n---\n# Sample\n\nA **bold** and *emphasized* [reference][ref].\n\n> A quote\n\n- First\n- Second\n\n```ts\n\tconst x = 1\n```\n\n| Name | Value |\n| --- | --- |\n| one | two |\n\n[ref]: https://example.com\n\n\u001b[2JUnsafe",
    );
    const output = Box.renderPlainSync(MarkdownBox(document, 48));
    for (const value of [
      "Sample",
      "bold",
      "reference ↗",
      "│ A quote",
      "• First",
      "const x = 1",
      "one",
      "two",
    ])
      assert.include(output, value);
    assert.notInclude(output, "name: sample");
    assert.notInclude(output, "\u001b");
    assert.notInclude(output, "\t");
  });

  it("wraps long words without losing text and stacks tables in narrow previews", () => {
    const token = "abcdefghijklmnopqrstuvwxyz0123456789";
    const wrapped = Box.renderPlainSync(MarkdownBox(parseMarkdown(token), 8));
    assert.strictEqual(wrapped.replaceAll("\n", "").replaceAll(" ", ""), token);
    for (const width of [1, 8, 40]) {
      const layout = MarkdownBox(
        parseMarkdown(
          "# 界界\n\n| Long heading | Value |\n| --- | --- |\n| " +
            token +
            " | test |",
        ),
        width,
      );
      assert.isAtMost(layout.cols, width);
    }
  });
});
