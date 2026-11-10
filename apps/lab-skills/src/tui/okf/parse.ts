/** Adapted from proj_okf-graph. Copyright (c) 2026 Lloyd Richards. MIT; see LICENSE. */
import {
  MarkdownBlock,
  type MarkdownDocument,
  MarkdownInline,
} from "./model.js";
import { Array, Match } from "effect";
import type {
  Definition,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
type GfmTable = {
  readonly type: "table";
  readonly align?: ReadonlyArray<"left" | "center" | "right" | null>;
  readonly children: ReadonlyArray<{
    readonly children: ReadonlyArray<{
      readonly children: ReadonlyArray<PhrasingContent>;
    }>;
  }>;
};

/** Recursively extract plain text from an mdast node */
const extractText = (node: unknown): string => {
  if (node === null || typeof node !== "object") return "";
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("alt" in node && typeof node.alt === "string") return node.alt;
  return "children" in node && globalThis.Array.isArray(node.children)
    ? node.children.map(extractText).join("")
    : "";
};

const mapInline = (
  node: PhrasingContent,
  definitions: ReadonlyMap<string, Definition>,
): ReadonlyArray<MarkdownInline> =>
  Match.value(node).pipe(
    Match.when({ type: "text" }, (n) => [
      MarkdownInline.cases.Text.make({ value: n.value }),
    ]),
    Match.when({ type: "break" }, () => [MarkdownInline.cases.Break.make({})]),
    Match.when({ type: "inlineCode" }, (n) => [
      MarkdownInline.cases.InlineCode.make({ value: n.value }),
    ]),
    Match.when({ type: "emphasis" }, (n) => [
      MarkdownInline.cases.Emphasis.make({
        children: mapInlines(n.children, definitions),
      }),
    ]),
    Match.when({ type: "strong" }, (n) => [
      MarkdownInline.cases.Strong.make({
        children: mapInlines(n.children, definitions),
      }),
    ]),
    Match.when({ type: "delete" }, (n) => [
      MarkdownInline.cases.Delete.make({
        children: mapInlines(n.children, definitions),
      }),
    ]),
    Match.when({ type: "link" }, (n) => [
      MarkdownInline.cases.Link.make({
        url: n.url,
        title: n.title ?? undefined,
        children: mapInlines(n.children, definitions),
      }),
    ]),
    Match.when({ type: "linkReference" }, (n) => {
      const definition = definitions.get(n.identifier);
      return definition === undefined
        ? [MarkdownInline.cases.Text.make({ value: extractText(n) })]
        : [
            MarkdownInline.cases.Link.make({
              url: definition.url,
              title: definition.title ?? undefined,
              children: mapInlines(n.children, definitions),
            }),
          ];
    }),
    Match.orElse((n) => [
      MarkdownInline.cases.Text.make({ value: extractText(n) }),
    ]),
  );

const mapInlines = (
  nodes: ReadonlyArray<PhrasingContent>,
  definitions: ReadonlyMap<string, Definition>,
): ReadonlyArray<MarkdownInline> =>
  Array.flatMap(nodes, (node) => mapInline(node, definitions));

const mapListItem = (
  node: ListItem,
  definitions: ReadonlyMap<string, Definition>,
): ReadonlyArray<MarkdownBlock> =>
  Array.flatMap(node.children, (child) => mapBlock(child, definitions));

const mapBlock = (
  node: RootContent | GfmTable,
  definitions: ReadonlyMap<string, Definition>,
): ReadonlyArray<MarkdownBlock> =>
  Match.value(node).pipe(
    Match.when({ type: "yaml" }, (n) => [
      MarkdownBlock.cases.Frontmatter.make({ value: n.value }),
    ]),
    Match.when({ type: "heading" }, (n) => [
      MarkdownBlock.cases.Heading.make({
        level: n.depth,
        children: mapInlines(n.children, definitions),
      }),
    ]),
    Match.when({ type: "paragraph" }, (n) => [
      MarkdownBlock.cases.Paragraph.make({
        children: mapInlines(n.children, definitions),
      }),
    ]),
    Match.when({ type: "list" }, (n) => [
      MarkdownBlock.cases.List.make({
        ordered: n.ordered ?? false,
        start: n.start ?? undefined,
        items: Array.map(n.children, (item) => mapListItem(item, definitions)),
      }),
    ]),
    Match.when({ type: "blockquote" }, (n) => [
      MarkdownBlock.cases.Blockquote.make({
        children: Array.flatMap(n.children, (child) =>
          mapBlock(child, definitions),
        ),
      }),
    ]),
    Match.when({ type: "code" }, (n) => [
      MarkdownBlock.cases.CodeBlock.make({
        value: n.value,
        language: n.lang ?? undefined,
      }),
    ]),
    Match.when({ type: "table" }, (n) => [
      MarkdownBlock.cases.Table.make({
        alignments: (n.align ?? []).map((alignment) => alignment ?? undefined),
        rows: n.children.map((row) =>
          row.children.map((cell) => mapInlines(cell.children, definitions)),
        ),
      }),
    ]),
    Match.when({ type: "thematicBreak" }, () => [
      MarkdownBlock.cases.Rule.make({}),
    ]),
    Match.when({ type: "html" }, (n) => [
      MarkdownBlock.cases.Html.make({ value: n.value }),
    ]),
    Match.orElse(() => []),
  );

const mapDocument = (
  tree: Root,
  definitions: ReadonlyMap<string, Definition>,
): MarkdownDocument => ({
  blocks: Array.flatMap(tree.children, (node) => mapBlock(node, definitions)),
});

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml"]);

export const parseMarkdown = (raw: string): MarkdownDocument => {
  // File content must not inject terminal controls. Expand tabs for stable cell widths and preserve line breaks.
  const safe = raw
    .replace(/\r\n?/g, "\n")
    .replaceAll("\t", "    ")
    // oxlint-disable-next-line no-control-regex -- Strip terminal controls from document text.
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
  const tree = processor.parse(safe);
  const definitions = new Map(
    tree.children.flatMap((node) =>
      node.type === "definition" ? [[node.identifier, node] as const] : [],
    ),
  );
  const document = mapDocument(tree, definitions);
  return {
    blocks: document.blocks.filter((block) => block._tag !== "Frontmatter"),
  };
};
