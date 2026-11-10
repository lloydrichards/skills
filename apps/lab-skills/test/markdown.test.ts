import { assert, describe, it } from "@effect/vitest";
import { Box } from "effect-boxes";
import { MarkdownBox } from "../src/tui/okf/Markdown.js";
import { parseMarkdown } from "../src/tui/okf/parse.js";

describe("Adapted OKF Markdown renderer", () => {
  it("should hide frontmatter and controls when rendering skill Markdown", () => {
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

  it("should preserve text within the available width when previews are narrow", () => {
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
