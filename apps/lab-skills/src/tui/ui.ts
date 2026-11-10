import { Ansi, Box } from "effect-boxes";
import { MarkdownBox } from "./okf/Markdown.js";

// Escape controls so displayed metadata cannot execute terminal commands or hide characters.
export const clean = (value: string) =>
  value.replace(
    // oxlint-disable-next-line no-control-regex -- Escape untrusted terminal controls visibly.
    /[\u0000-\u001f\u007f-\u009f]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

/** JSON notation keeps whitespace in paths unambiguous, including at wrapped line endings. */
export const literalValue = (value: string) =>
  /[\s"\\]/u.test(value) || clean(value) !== value
    ? clean(JSON.stringify(value)).replace(
        /\s/g,
        (character) =>
          `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
      )
    : value;

/** Wrap metadata by terminal cells without Markdown's whitespace normalization. */
export const literal = (
  value: string,
  width: number,
): Box.Box<Ansi.AnsiStyle> => {
  const available = Math.max(1, Math.floor(width));
  const rows: Array<Box.Box<Ansi.AnsiStyle>> = [];
  let current = "";
  let cells = 0;
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(literalValue(value))) {
    const size = Box.text(segment).cols;
    if (cells + size > available && current) {
      rows.push(Box.text(current));
      current = "";
      cells = 0;
    }
    current += size > available ? "�" : segment;
    cells += size > available ? 1 : size;
  }
  rows.push(Box.text(current));
  return Box.vcat(rows, Box.left);
};
export const text = (
  value: string,
  style: Ansi.AnsiAnnotation = Ansi.fgDefault,
) => Box.text(clean(value)).pipe(Box.annotate(style));
export const line = (
  value: string,
  width: number,
  style: Ansi.AnsiAnnotation = Ansi.fgDefault,
) =>
  text(value).pipe(
    Box.truncate(width, Box.left),
    Box.alignHoriz(Box.left, width),
    Box.annotate(style),
  );
export const paragraph = (value: string, width: number) =>
  MarkdownBox(
    {
      blocks: [
        {
          _tag: "Paragraph",
          children: [{ _tag: "Text", value: clean(value) }],
        },
      ],
    },
    Math.max(1, width),
  );
export const blank = Box.text("");
export const selectedRow = (label: string, active: boolean, width: number) =>
  line(
    `${active ? "›" : " "} ${label}`,
    width,
    active ? Ansi.inverse : Ansi.fgDefault,
  );
export const frame = (body: Box.Box<Ansi.AnsiStyle>, width: number) =>
  body.pipe(
    Box.maxWidth(width - 4),
    Box.alignHoriz(Box.left, width - 4),
    Box.pad(0, 1),
    Box.border("rounded", { annotation: Ansi.dim }),
  );
