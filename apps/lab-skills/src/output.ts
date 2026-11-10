import { Ansi, Box } from "effect-boxes";
import type { Diagnostic, Entry, Result } from "./model.js";
import { blank, literal, paragraph, text } from "./tui/ui.js";

const labels: Record<Entry["status"], string> = {
  new: "Add",
  update: "Update",
  conflict: "Conflict",
  applied: "Installed",
  current: "Current",
  unselected: "Unselected",
  unmanaged: "Unmanaged",
};
const tone = (status: Entry["status"]) =>
  status === "conflict"
    ? Ansi.brightRed
    : status === "new" || status === "applied"
      ? Ansi.brightGreen
      : status === "update"
        ? Ansi.brightYellow
        : Ansi.dim;
const column = (
  rows: ReadonlyArray<Box.Box<Ansi.AnsiStyle>>,
): Box.Box<Ansi.AnsiStyle> => Box.vcat(rows, Box.left);

const entryTable = (
  entries: ReadonlyArray<Entry>,
  diagnostics: ReadonlyArray<Diagnostic>,
  width: number,
) => {
  const statusWidth = 10;
  const nameWidth = width >= 76 ? 20 : width >= 48 ? 12 : 10;
  const pathWidth = width - statusWidth - nameWidth - 4;
  const widths = [statusWidth, nameWidth, pathWidth];
  const row = (cells: ReadonlyArray<Box.Box<Ansi.AnsiStyle>>) => {
    const height = Math.max(1, ...cells.map((cell) => cell.rows));
    return Box.hsep(
      cells.map((cell, index) =>
        cell.pipe(
          Box.alignHoriz(Box.left, widths[index] ?? width),
          Box.alignVert(Box.top, height),
        ),
      ),
      2,
      Box.top,
    );
  };
  const rows: Array<Box.Box<Ansi.AnsiStyle>> = [];
  if (width >= 40)
    rows.push(
      row(
        ["Status", "Skill", "Location"].map((value) => text(value, Ansi.bold)),
      ),
      text(widths.map((size) => "-".repeat(size)).join("  "), Ansi.dim),
    );
  let previousWrapped = false;
  for (const entry of entries) {
    const name = entry.id.slice(entry.id.indexOf("/") + 1);
    const record =
      width >= 40
        ? row([
            text(labels[entry.status], tone(entry.status)),
            literal(name, nameWidth),
            literal(entry.path, pathWidth),
          ])
        : column([
            paragraph(labels[entry.status], width).pipe(
              Box.annotate(tone(entry.status)),
            ),
            literal(name, width),
            literal(entry.path, width),
          ]);
    if (
      rows.length > (width >= 40 ? 2 : 0) &&
      (previousWrapped || record.rows > 1)
    )
      rows.push(blank);
    rows.push(record);
    const reason =
      entry.reason && !diagnostics.some((d) => d.message === entry.reason);
    if (reason) rows.push(paragraph(`${entry.id}: ${entry.reason}`, width));
    previousWrapped = record.rows > 1 || !!reason;
  }
  return column(rows);
};

const diagnosticBlocks = (
  diagnostics: ReadonlyArray<Diagnostic>,
  width: number,
) => {
  if (!diagnostics.length) return Box.nullBox;
  const blocks = diagnostics.map((d) =>
    column([
      paragraph(
        `${d.severity === "error" ? "Error" : "Warning"} · ${d.code}`,
        width,
      ).pipe(
        Box.annotate(
          d.severity === "error" ? Ansi.brightRed : Ansi.brightYellow,
        ),
      ),
      paragraph(d.message, width),
      ...(d.path ? [literal(d.path, width).pipe(Box.annotate(Ansi.dim))] : []),
    ]),
  );
  if (
    diagnostics.some(
      (d) => d.code === "INTERRUPTED_OPERATION" || d.code === "ROLLBACK_FAILED",
    )
  )
    blocks.push(
      paragraph("Preserve evidence; see docs/recovery.md.", width).pipe(
        Box.annotate(Ansi.dim),
      ),
    );
  return Box.vsep(blocks, 1, Box.left);
};

/** Pure human presentation; JSON serialization and stream selection stay at the CLI boundary. */
export const renderHuman = (result: Result, columns = 80) => {
  const width = Math.max(
    1,
    Math.floor(Number.isFinite(columns) ? columns : 80),
  );
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  const warnings = result.diagnostics.filter((d) => d.severity === "warning");
  const entries = result.entries.filter(
    (entry) =>
      result.command === "status" ||
      ["new", "update", "conflict", "applied"].includes(entry.status),
  );
  const body: Array<Box.Box<Ansi.AnsiStyle>> = [];
  const scope = () =>
    column([
      paragraph(result.selection.targets.join(", "), width),
      literal(result.home ?? result.checkout, width),
    ]).pipe(Box.annotate(Ansi.dim));
  let title: string;
  switch (result.command) {
    case "validate":
      title = result.ok
        ? "Source definitions are valid"
        : "Source definitions need attention";
      if (result.ok)
        body.push(literal(result.checkout, width).pipe(Box.annotate(Ansi.dim)));
      break;
    case "doctor":
      title = result.diagnostics.length
        ? "Diagnostic findings"
        : result.ok
          ? "No diagnostic findings"
          : "Diagnosis could not complete";
      if (result.ok && !result.diagnostics.length) body.push(scope());
      break;
    case "apply":
      title = !result.ok
        ? "Installation needs attention"
        : entries.some((e) => e.status === "applied")
          ? "Installed changes"
          : "No installation needed";
      if (entries.length)
        body.push(blank, entryTable(entries, result.diagnostics, width));
      else if (result.ok) body.push(scope());
      break;
    case "plan":
      title = !result.ok
        ? result.exitCode === 3
          ? "Plan blocked"
          : "Cannot build plan"
        : entries.length
          ? "Proposed changes"
          : result.entries.some((e) => e.status === "current")
            ? "All selected skills are up to date"
            : "No changes for this selection";
      if (entries.length)
        body.push(blank, entryTable(entries, result.diagnostics, width));
      else if (result.ok) body.push(scope());
      break;
    case "status":
      title = result.ok ? "Skill status" : "Skill status needs attention";
      if (entries.length)
        body.push(blank, entryTable(entries, result.diagnostics, width));
      else if (result.ok) body.push(scope());
      break;
    default:
      title = "Cannot run command";
  }
  const summary = column([
    paragraph(title, width).pipe(Box.annotate(Ansi.bold)),
    ...body,
  ]);
  return {
    stdout: warnings.length
      ? Box.vsep([summary, diagnosticBlocks(warnings, width)], 1, Box.left)
      : summary,
    stderr: diagnosticBlocks(errors, width),
  };
};

export const renderText = (box: Box.Box<Ansi.AnsiStyle>, colors: boolean) =>
  (colors ? Box.renderPrettySync(box) : Box.renderPlainSync(box))
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
