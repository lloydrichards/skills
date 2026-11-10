import { Ansi, Box } from "effect-boxes";
import { MarkdownBox } from "./okf/Markdown.js";

// Terminal controls are never part of displayed paths, messages, or identifiers.
export const clean = (value: string) =>
  // oxlint-disable-next-line no-control-regex -- Displayed paths and metadata cannot contain terminal controls.
  value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
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
