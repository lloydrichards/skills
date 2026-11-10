import { Data, Effect } from "effect";
import { Prompt } from "effect/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { renderHuman } from "../output.js";
import { Targets, type Diagnostic, type Entry, type Target } from "../model.js";
import {
  canInstall,
  installationRoots,
  type Inspection,
} from "./inspection.js";
import { MarkdownBox } from "./okf/Markdown.js";
import { parseMarkdown } from "./okf/parse.js";
import { blank, frame, line, paragraph, selectedRow } from "./ui.js";

export interface ViewState {
  readonly page: "review" | "profiles" | "targets" | "confirm" | "outcome";
  readonly cursor: number;
  readonly offset: number;
  readonly mode: "preview" | "details" | "help";
  readonly authorize: boolean;
  readonly profiles: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<Target>;
}
export type Intent =
  | { readonly _tag: "Quit" }
  | {
      readonly _tag: "Command";
      readonly command: "plan" | "status" | "doctor" | "validate";
    }
  | { readonly _tag: "Selection"; readonly state: ViewState }
  | { readonly _tag: "Install" };
export const initialView = (model: Inspection): ViewState => ({
  page: "review",
  cursor: 0,
  offset: 0,
  mode: "preview",
  authorize: false,
  profiles: model.options.selection.profiles,
  targets: model.options.selection.targets,
});
export type Row =
  | { readonly entry: Entry }
  | { readonly diagnostic: Diagnostic };
export const inspectionRows = (model: Inspection): ReadonlyArray<Row> => [
  ...model.result.diagnostics.map((diagnostic) => ({ diagnostic })),
  ...model.result.entries
    .filter(
      (entry) =>
        model.result.command === "status" ||
        !["current", "unselected", "unmanaged"].includes(entry.status),
    )
    .map((entry) => ({ entry })),
];
const windowStart = (cursor: number, count: number, height: number) =>
  Math.max(0, Math.min(cursor - Math.floor(height / 2), count - height));
const helpDocument = parseMarkdown(`## Inspector keys

- Up/Down or j/k selects an item.
- Page Up/Down scrolls the current preview.
- m switches Markdown and source details.
- p opens a fresh plan; s shows all installed state.
- d runs doctor; v validates all source definitions.
- r refreshes the current command.
- Esc edits profiles; t edits destination targets.
- Enter reviews installation authority for a clear plan.
- q exits. Ctrl+C interrupts reads and downloads. During writes, exit waits for the installer transaction.

An offline plan does not download or verify upstream payloads. Omitted owned skills are retained. The installer has no force, adoption, removal, or automatic recovery action.`);
const paragraphs = (values: ReadonlyArray<string>, width: number) =>
  Box.vsep(
    values.map((value) => paragraph(value, width)),
    1,
    Box.left,
  );

const detailDocument = (row: Row, model: Inspection, width: number) => {
  if ("diagnostic" in row) {
    const d = row.diagnostic;
    return paragraphs(
      [
        `${d.severity.toUpperCase()} · ${d.code}`,
        d.message,
        ...(d.path ? [d.path] : []),
        ...(d.code === "INTERRUPTED_OPERATION" || d.code === "ROLLBACK_FAILED"
          ? [
              "Preserve the lock, journal, destinations and backups. Establish whether an installer is running, then follow docs/recovery.md.",
            ]
          : []),
      ],
      width,
    );
  }
  const entry = row.entry;
  return paragraphs(
    [
      `${entry.status} · ${entry.id}`,
      ...(entry.reason ? [entry.reason] : []),
      `Destination: ${entry.path}`,
      ...(entry.source
        ? [
            `Source: ${entry.source.repository ?? "checkout"}/${entry.source.path}`,
            ...(entry.source.commit
              ? [`Pinned commit: ${entry.source.commit}`]
              : []),
            `Desired content: ${entry.source.content_sha256}`,
          ]
        : []),
      ...(entry.installedSource
        ? [`Recorded content: ${entry.installedSource.content_sha256}`]
        : []),
      ...(model.previews.get(entry.id)?.reason
        ? [model.previews.get(entry.id)?.reason ?? ""]
        : []),
    ],
    width,
  );
};
const selectedDocument = (
  state: ViewState,
  model: Inspection,
  width: number,
) => {
  if (state.mode === "help") return MarkdownBox(helpDocument, width);
  const row = inspectionRows(model)[state.cursor];
  if (!row)
    return paragraphs(
      [
        model.result.command === "validate" && model.result.ok
          ? "All source definitions are valid."
          : model.result.ok
            ? "No changes or findings for this selection."
            : "This command could not complete.",
        "Press s for installed state, d for diagnosis, or Esc to edit scope.",
      ],
      width,
    );
  if ("diagnostic" in row || state.mode === "details")
    return detailDocument(row, model, width);
  const preview = model.previews.get(row.entry.id);
  return preview
    ? MarkdownBox(preview.document, width)
    : detailDocument(row, model, width);
};
const dimensions = (width: number, rows: number) => {
  const wide = width >= 76;
  const inner = width - 4;
  const bodyHeight = rows - 11;
  const listHeight = wide
    ? bodyHeight
    : Math.min(4, Math.max(1, Math.floor(bodyHeight / 3)));
  const previewHeight = wide ? bodyHeight : bodyHeight - listHeight - 1;
  return {
    wide,
    inner,
    bodyHeight,
    listHeight,
    previewHeight,
    detailWidth: wide ? inner - 29 : inner,
    contentHeight: Math.max(1, previewHeight - 3),
  };
};
const confirmation = (model: Inspection, width: number) =>
  paragraphs(
    [
      "Write the reviewed changes into these roots:",
      ...installationRoots(model.options),
      ...model.result.entries
        .filter((entry) => ["new", "update"].includes(entry.status))
        .map((entry) => `${entry.status} · ${entry.id}`),
      "Apply rechecks this plan, downloads and verifies payloads, then installs. A changed plan requires a new review.",
    ],
    width,
  );
const scrolled = (
  body: Box.Box<Ansi.AnsiStyle>,
  offset: number,
  height: number,
) =>
  body.pipe(
    Box.cropHeight(Math.min(offset, Math.max(0, body.rows - height)), height),
    Box.alignVert(Box.top, height),
  );

export const renderLive = (
  state: ViewState,
  model: Inspection,
  width: number,
  rows = 23,
): Box.Box<Ansi.AnsiStyle> => {
  if (
    state.page === "review" &&
    state.mode !== "help" &&
    !inspectionRows(model).length
  ) {
    return Box.vcat(
      [
        renderHuman(model.result, width).stdout,
        blank,
        line("Enter Installed skills   Esc Scope   ? Help", width, Ansi.dim),
        line("r Refresh   t Targets   q Quit", width, Ansi.dim),
        line(`${model.result.command} · read only`, width, Ansi.dim),
      ],
      Box.left,
    );
  }
  const size = dimensions(width, rows);
  let title: string;
  let body: Box.Box<Ansi.AnsiStyle>;
  let help: ReadonlyArray<string>;
  if (state.page === "profiles" || state.page === "targets") {
    const profiles = state.page === "profiles";
    title = profiles ? "Choose profiles" : "Choose destinations";
    const values = profiles ? model.profileNames : Targets;
    const selected = profiles ? state.profiles : state.targets;
    const retained = profiles && model.options.selection.skills.length > 0;
    const height = rows - 11 - (retained ? 1 : 0);
    const start = windowStart(state.cursor, values.length, height);
    body = frame(
      Box.vcat(
        [
          ...(retained
            ? [
                line(
                  "Explicit skill selection is retained.",
                  size.inner,
                  Ansi.dim,
                ),
              ]
            : []),
          ...values
            .slice(start, start + height)
            .map((value, index) =>
              selectedRow(
                `${selected.some((item) => item === value) ? "[x]" : "[ ]"} ${value}`,
                start + index === state.cursor,
                size.inner,
              ),
            ),
          ...(profiles && !values.length
            ? [
                paragraph(
                  "No profiles declared. Explicit skill selection is retained.",
                  size.inner,
                ),
              ]
            : []),
        ],
        Box.left,
      ),
      width,
    );
    help = [
      "↑↓ Select   Space Toggle   Enter Preview",
      "Esc Back   t Destinations   q Quit",
    ];
  } else if (state.page === "confirm") {
    title = "Install the reviewed changes?";
    body = frame(
      Box.vcat(
        [
          scrolled(
            confirmation(model, size.inner),
            state.offset,
            size.bodyHeight - 2,
          ),
          blank,
          line(
            state.authorize ? "› Install      Back" : "  Install    › Back",
            size.inner,
            Ansi.inverse,
          ),
        ],
        Box.left,
      ),
      width,
    );
    help = [
      "PgUp/PgDn Scroll   ←→ Choose   Enter Confirm",
      "Esc Review   q Quit",
    ];
  } else {
    title =
      state.page === "outcome"
        ? model.result.ok
          ? "Installation complete"
          : "Installation needs attention"
        : model.result.command === "status"
          ? "Installed state"
          : model.result.command === "doctor"
            ? "Diagnosis"
            : model.result.command === "validate"
              ? "Source validation"
              : "Review changes";
    const items = inspectionRows(model);
    const start = windowStart(state.cursor, items.length, size.listHeight - 2);
    const leftWidth = size.wide ? 26 : size.inner;
    const list = Box.vcat(
      [
        line(
          model.result.command === "status"
            ? "Installed entries"
            : "Changes / findings",
          leftWidth,
          Ansi.dim,
        ),
        blank,
        ...items
          .slice(start, start + Math.max(1, size.listHeight - 2))
          .map((row, index) =>
            selectedRow(
              "entry" in row
                ? `${row.entry.status.padEnd(9)} ${model.options.selection.targets.length > 1 ? row.entry.id : row.entry.id.split("/").at(-1)}`
                : `${row.diagnostic.severity === "error" ? "!" : "~"} ${row.diagnostic.code}`,
              start + index === state.cursor,
              leftWidth,
            ),
          ),
        ...(!items.length ? [line("No changes", leftWidth, Ansi.dim)] : []),
      ],
      Box.left,
    ).pipe(
      Box.maxHeight(size.listHeight),
      Box.alignVert(Box.top, size.listHeight),
    );
    const row = items[state.cursor];
    const preview =
      row && "entry" in row ? model.previews.get(row.entry.id) : undefined;
    const detail = Box.vcat(
      [
        line(
          state.mode === "help"
            ? "Help"
            : state.mode === "details" || (row && "diagnostic" in row)
              ? "Details"
              : (preview?.title ?? "Result"),
          size.detailWidth,
          Ansi.bold,
        ),
        line(
          row && "entry" in row ? row.entry.id : "",
          size.detailWidth,
          Ansi.dim,
        ),
        blank,
        scrolled(
          selectedDocument(state, model, size.detailWidth),
          state.offset,
          size.contentHeight,
        ),
      ],
      Box.left,
    );
    body = frame(
      size.wide
        ? Box.hcat(
            [
              list,
              Box.text(
                Array.from({ length: size.bodyHeight }, () => " │ ").join("\n"),
              ).pipe(Box.annotate(Ansi.dim)),
              detail,
            ],
            Box.top,
          )
        : Box.vcat(
            [list, line("─".repeat(size.inner), size.inner, Ansi.dim), detail],
            Box.left,
          ),
      width,
    );
    help = [
      `↑↓ Select   PgUp/PgDn Scroll   m ${state.mode === "preview" ? "Details" : "Preview"}   ? Help`,
      state.page === "outcome"
        ? "Enter Fresh plan   d Doctor   q Quit"
        : `${canInstall(model.result) ? "Enter Continue" : "r Refresh"}   Esc Scope   t Targets   q Quit`,
    ];
  }
  const scope = model.options.selection;
  const context = `${scope.targets.join(", ")} · ${model.options.home}`;
  return Box.vcat(
    [
      line(`◇ ${context}`, width, Ansi.dim),
      line(
        `│ ${scope.profiles.length ? scope.profiles.join(" + ") : "No profiles"}${scope.skills.length ? ` · skills: ${scope.skills.join(", ")}` : ""}`,
        width,
        Ansi.dim,
      ),
      line("│", width, Ansi.dim),
      line(`◆ ${title}`, width, Ansi.bold),
      blank,
      body,
      blank,
      ...help.map((value) => line(value, width, Ansi.dim)),
      line(
        `${model.result.command} · ${state.page === "confirm" ? "awaiting confirmation" : model.result.command === "apply" ? (model.result.ok ? "completed" : "failed; inspect diagnostics") : "read only"}`,
        width,
        Ansi.dim,
      ),
    ],
    Box.left,
  );
};

const Action = Data.taggedEnum<Prompt.ActionDefinition>();
export const navigateLive = (
  key: string,
  state: ViewState,
  model: Inspection,
  width: number,
  rows = 23,
): Prompt.Action<ViewState, Intent> => {
  const next = (patch: Partial<ViewState>) =>
    Action.NextFrame({ state: { ...state, ...patch } });
  const command = (
    command: "plan" | "status" | "doctor" | "validate",
  ): Prompt.Action<ViewState, Intent> =>
    Action.Submit({ value: { _tag: "Command", command } });
  if (key === "q") return Action.Submit({ value: { _tag: "Quit" } });
  const enter = key === "enter" || key === "return";
  const down = key === "down" || key === "j";
  const up = key === "up" || key === "k";
  if (state.page === "profiles" || state.page === "targets") {
    const values = state.page === "profiles" ? model.profileNames : Targets;
    if (down || up)
      return next({
        cursor:
          (state.cursor + (down ? 1 : values.length - 1)) %
          Math.max(1, values.length),
      });
    if (key === "space") {
      if (state.page === "profiles") {
        const value = model.profileNames[state.cursor];
        if (value)
          return next({
            profiles: state.profiles.includes(value)
              ? state.profiles.filter((item) => item !== value)
              : [...state.profiles, value],
          });
      } else {
        const value = Targets[state.cursor];
        if (value)
          return next({
            targets: state.targets.includes(value)
              ? state.targets.filter((item) => item !== value)
              : [...state.targets, value],
          });
      }
    }
    if (enter && state.targets.length)
      return Action.Submit({ value: { _tag: "Selection", state } });
    if (key === "escape")
      return next({
        page: "review",
        cursor: 0,
        offset: 0,
        profiles: model.options.selection.profiles,
        targets: model.options.selection.targets,
      });
    if (key === "t") return next({ page: "targets", cursor: 0 });
    return Action.Beep();
  }
  if (state.page === "confirm") {
    if (key === "escape" || (enter && !state.authorize))
      return next({ page: "review", offset: 0 });
    if (["left", "right", "tab"].includes(key))
      return next({ authorize: !state.authorize });
    if (enter && state.authorize && canInstall(model.result))
      return Action.Submit({ value: { _tag: "Install" } });
  } else {
    if (down || up)
      return next({
        cursor:
          (state.cursor + (down ? 1 : inspectionRows(model).length - 1)) %
          Math.max(1, inspectionRows(model).length),
        offset: 0,
      });
    if (key === "m")
      return next({
        mode: state.mode === "preview" ? "details" : "preview",
        offset: 0,
      });
    if (key === "?" || key === "h")
      return next({
        mode: state.mode === "help" ? "preview" : "help",
        offset: 0,
      });
    if (key === "escape")
      return next({ page: "profiles", cursor: 0, offset: 0 });
    if (key === "t") return next({ page: "targets", cursor: 0, offset: 0 });
    if (key === "p" || (enter && state.page === "outcome"))
      return command("plan");
    if (key === "s") return command("status");
    if (key === "d") return command("doctor");
    if (key === "v") return command("validate");
    if (key === "r")
      return command(
        model.result.command === "status" ||
          model.result.command === "doctor" ||
          model.result.command === "validate"
          ? model.result.command
          : "plan",
      );
    if (enter && !inspectionRows(model).length && model.result.ok)
      return command("status");
    if (enter && canInstall(model.result))
      return next({ page: "confirm", offset: 0, authorize: false });
  }
  if (key === "pagedown" || key === "pageup") {
    const size = dimensions(width, rows);
    const document =
      state.page === "confirm"
        ? confirmation(model, size.inner)
        : selectedDocument(state, model, size.detailWidth);
    const height =
      state.page === "confirm" ? size.bodyHeight - 2 : size.contentHeight;
    return next({
      offset: Math.max(
        0,
        Math.min(
          Math.max(0, document.rows - height),
          state.offset + (key === "pagedown" ? height : -height),
        ),
      ),
    });
  }
  return Action.Beep();
};
export const liveHandlers = (
  model: Inspection,
  width: number,
  rows: number,
): Prompt.Handlers<ViewState, Intent> => ({
  render: (state, action) =>
    Effect.succeed(
      action._tag === "Submit"
        ? ""
        : action._tag === "Beep"
          ? "\u0007"
          : Box.renderPrettySync(Cmd.cursorHide) +
            Box.renderPrettySync(
              renderLive(state, model, width, rows),
            ).replaceAll("\n", "\r\n") +
            Box.renderPrettySync(Cmd.cursorNextLine(1)),
    ),
  process: (input, state) =>
    Effect.succeed(navigateLive(input.key.name, state, model, width, rows)),
  clear: (state) =>
    Box.renderPretty(
      Cmd.clearLines(renderLive(state, model, width, rows).rows + 1),
    ),
});
