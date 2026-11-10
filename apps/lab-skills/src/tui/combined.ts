import { Data, Effect, FileSystem } from "effect";
import { Prompt } from "effect/cli";
import { Ansi, Box, Cmd } from "effect-boxes";
import { text, line, blank, selectedRow, frame } from "./ui.js";
import { MarkdownBox } from "./okf/Markdown.js";
import type { MarkdownDocument } from "./okf/model.js";
import { parseMarkdown } from "./okf/parse.js";

export const targets = ["agents", "codex", "claude", "opencode", "pi"] as const;
export const profiles = ["default", "effect"] as const;
export const pages = [
  "destination",
  "profiles",
  "review",
  "confirm",
  "done",
] as const;
export type Page = (typeof pages)[number];
export type State = {
  readonly page: Page;
  readonly target: number;
  readonly selected: ReadonlyArray<string>;
  readonly cursor: number;
  readonly offset: number;
  readonly details: boolean;
  readonly authorize: boolean;
};
export type Skill = {
  readonly id: string;
  readonly change: string;
  readonly profile: string;
  readonly reason: string;
  readonly document: MarkdownDocument;
};
export const initialState: State = {
  page: "destination",
  target: 0,
  selected: [...profiles],
  cursor: 0,
  offset: 0,
  details: false,
  authorize: false,
};
const examples = [
  {
    id: "effect",
    change: "Add",
    profile: "effect",
    reason: "Selected by the effect profile.",
  },
  {
    id: "report-builder",
    change: "Add",
    profile: "default",
    reason: "Required by explain-diff.",
  },
  {
    id: "deslop",
    change: "Update",
    profile: "default",
    reason: "Source changed; the installed copy is unedited.",
  },
];

class PreviewParseError extends Data.TaggedError("PreviewParseError")<{
  readonly cause: unknown;
}> {}

export const loadSkills = Effect.fn("Tui.loadSkills")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* Effect.forEach(examples, (item) =>
    fs.readFileString(`${root}/skills/${item.id}/SKILL.md`).pipe(
      Effect.flatMap((raw) =>
        Effect.try({
          try: () => parseMarkdown(raw),
          catch: (cause) => new PreviewParseError({ cause }),
        }),
      ),
      Effect.match({
        onFailure: () => ({
          ...item,
          document: parseMarkdown(
            "Preview unavailable. The checkout's SKILL.md could not be read or parsed.",
          ),
        }),
        onSuccess: (document) => ({ ...item, document }),
      }),
    ),
  );
});
export const visibleSkills = (state: State, skills: ReadonlyArray<Skill>) =>
  skills.filter((skill) => state.selected.includes(skill.profile));
const targetName = (state: State) => targets[state.target] ?? "agents";
export const destination = (state: State) => {
  const paths = [
    ".agents/skills",
    ".codex/skills",
    ".claude/skills",
    ".config/opencode/skills",
    ".pi/agent/skills",
  ];
  return `/home/lloyd/${paths[state.target] ?? paths[0]}`;
};
const history = (state: State, width: number) => {
  const lines: Array<Box.Box<Ansi.AnsiStyle>> = [];
  if (state.page !== "destination")
    lines.push(line(`◇ Destination  ${targetName(state)}`, width, Ansi.dim));
  if (!["destination", "profiles"].includes(state.page))
    lines.push(
      line(`│ Profiles     ${state.selected.join(" + ")}`, width, Ansi.dim),
    );
  if (lines.length) lines.push(line("│", width, Ansi.dim));
  return lines;
};

const inspectorDocument = (skill: Skill, details: boolean, width: number) =>
  details
    ? Box.vsep(
        [
          text(skill.change, Ansi.bold),
          Box.para(skill.reason, Box.left, width),
          Box.para(`Source: skills/${skill.id}/SKILL.md`, Box.left, width),
        ],
        1,
        Box.left,
      )
    : MarkdownBox(skill.document, width).pipe(Box.maxWidth(width));

const inspector = (
  state: State,
  skills: ReadonlyArray<Skill>,
  width: number,
  height: number,
) => {
  const items = visibleSkills(state, skills);
  const skill = items[state.cursor] ?? items[0];
  const inner = width - 4;
  const wide = width >= 76;
  const leftWidth = wide ? 26 : inner;
  const rightWidth = wide ? inner - leftWidth - 3 : inner;
  const list = Box.vcat(
    [
      line("Changes", leftWidth, Ansi.dim),
      blank,
      ...items.map((item, index) =>
        selectedRow(
          `${item.change.padEnd(7)} ${item.id}`,
          index === state.cursor,
          leftWidth,
        ),
      ),
    ],
    Box.left,
  );
  const contentHeight = Math.max(2, height - (wide ? 5 : list.rows + 6));
  const document = skill
    ? inspectorDocument(skill, state.details, rightWidth)
    : text("Choose a profile to preview skills.");
  const offset = Math.min(
    state.offset,
    Math.max(0, document.rows - contentHeight),
  );
  const preview = Box.vcat(
    [
      line(
        state.details ? "Change details" : "SKILL.md",
        rightWidth,
        Ansi.bold,
      ),
      line(skill?.id ?? "", rightWidth, Ansi.dim),
      blank,
      document.pipe(
        Box.cropHeight(offset, contentHeight),
        Box.alignVert(Box.top, contentHeight),
      ),
    ],
    Box.left,
  );
  const body = wide
    ? Box.hcat(
        [
          list.pipe(Box.alignVert(Box.top, preview.rows)),
          Box.text(
            Array.from({ length: preview.rows }, () => " │ ").join("\n"),
          ).pipe(Box.annotate(Ansi.dim)),
          preview,
        ],
        Box.top,
      )
    : Box.vcat(
        [list, line("─".repeat(inner), inner, Ansi.dim), preview],
        Box.left,
      );
  return frame(body, width);
};

export const renderCombined = (
  state: State,
  skills: ReadonlyArray<Skill>,
  width: number,
  rows = 23,
): Box.Box<Ansi.AnsiStyle> => {
  const lead = history(state, width);
  let title: string;
  let body: Box.Box<Ansi.AnsiStyle>;
  let help: ReadonlyArray<string>;
  switch (state.page) {
    case "destination":
      title = "Where should these skills go?";
      body = frame(
        Box.vcat(
          targets.map((target, index) =>
            selectedRow(target, state.target === index, width - 4),
          ),
          Box.left,
        ),
        width,
      );
      help = ["↑↓ Choose   Enter Continue   q Quit"];
      break;
    case "profiles":
      title = "Which profiles would you like?";
      body = frame(
        Box.vcat(
          profiles.map((profile, index) =>
            selectedRow(
              `${state.selected.includes(profile) ? "[x]" : "[ ]"} ${profile}`,
              state.cursor === index,
              width - 4,
            ),
          ),
          Box.left,
        ),
        width,
      );
      help = [
        "↑↓ Choose   Space Toggle   Enter Preview",
        "Esc Destination   q Quit",
      ];
      break;
    case "review":
      title = "Review changes";
      body = inspector(state, skills, width, rows - lead.length - 6);
      help = [
        `↑↓ Select   PgUp/PgDn Scroll   m ${state.details ? "Preview" : "Details"}`,
        "Enter Continue   Esc Profiles   q Quit",
      ];
      break;
    case "confirm":
      title = "Try the installation confirmation";
      body = frame(
        Box.vsep(
          [
            text("Demo destination", Ansi.dim),
            Box.para(destination(state), Box.left, width - 4),
            Box.vcat(
              visibleSkills(state, skills).map((skill) =>
                line(`${skill.change.padEnd(8)} ${skill.id}`, width - 4),
              ),
              Box.left,
            ),
            Box.para(
              "This demo never writes to that destination.",
              Box.left,
              width - 4,
            ).pipe(Box.annotate(Ansi.dim)),
            Box.hsep(
              [
                text(
                  state.authorize ? "› Simulate install" : "  Simulate install",
                  state.authorize ? Ansi.inverse : Ansi.fgDefault,
                ),
                text(
                  state.authorize ? "  Back" : "› Back",
                  state.authorize ? Ansi.fgDefault : Ansi.inverse,
                ),
              ],
              2,
              Box.top,
            ).pipe(Box.maxWidth(width - 4)),
          ],
          1,
          Box.left,
        ),
        width,
      );
      help = ["←→ Choose   Enter Confirm   Esc Review"];
      break;
    case "done":
      title = "Demo complete";
      body = frame(
        Box.vsep(
          [
            text("No skills were installed.", Ansi.bold),
            Box.para(
              "You can return to the inspector or close the preview.",
              Box.left,
              width - 4,
            ),
          ],
          1,
          Box.left,
        ),
        width,
      );
      help = ["Enter Review   Esc Review   q Quit"];
      break;
  }
  return Box.vcat(
    [
      ...lead,
      line(`◆ ${title}`, width, Ansi.bold),
      blank,
      body,
      blank,
      ...help.map((value) => line(value, width, Ansi.dim)),
      line("Sample changes · real checkout previews", width, Ansi.dim),
    ],
    Box.left,
  );
};

const Action = Data.taggedEnum<Prompt.ActionDefinition>();
export const advanceCombined = (
  key: string,
  state: State,
  skills: ReadonlyArray<Skill>,
  width: number,
  rows = 23,
): Prompt.Action<State, void> => {
  if (key === "q") return Action.Submit({ value: undefined });
  const next = (patch: Partial<State>) =>
    Action.NextFrame({ state: { ...state, ...patch } });
  const enter = key === "return" || key === "enter";
  const down = key === "down" || key === "j";
  const up = key === "up" || key === "k";
  switch (state.page) {
    case "destination":
      if (down || up)
        return next({
          target:
            (state.target + (down ? 1 : targets.length - 1)) % targets.length,
        });
      if (enter) return next({ page: "profiles", cursor: 0 });
      if (key === "escape") return Action.Submit({ value: undefined });
      break;
    case "profiles":
      if (down || up)
        return next({ cursor: (state.cursor + 1) % profiles.length });
      if (key === "space") {
        const profile = profiles[state.cursor] ?? "default";
        return next({
          selected: state.selected.includes(profile)
            ? state.selected.filter((value) => value !== profile)
            : profiles.filter(
                (value) => value === profile || state.selected.includes(value),
              ),
        });
      }
      if (enter && state.selected.length)
        return next({ page: "review", cursor: 0, offset: 0 });
      if (key === "escape") return next({ page: "destination", cursor: 0 });
      break;
    case "review": {
      const items = visibleSkills(state, skills);
      if (down || up)
        return next({
          cursor:
            (state.cursor + (down ? 1 : items.length - 1)) %
            Math.max(1, items.length),
          offset: 0,
        });
      if (key === "m") return next({ details: !state.details, offset: 0 });
      if (key === "pagedown" || key === "pageup") {
        const delta = key === "pagedown" ? 3 : -3;
        const skill = items[state.cursor];
        const inner = width - 4;
        const docWidth = width >= 76 ? inner - 29 : inner;
        const height = Math.max(
          2,
          rows - 9 - (width >= 76 ? 5 : items.length + 8),
        );
        const max = skill
          ? Math.max(
              0,
              inspectorDocument(skill, state.details, docWidth).rows - height,
            )
          : 0;
        return next({
          offset: Math.min(max, Math.max(0, state.offset + delta)),
        });
      }
      if (enter && items.length)
        return next({ page: "confirm", authorize: false });
      if (key === "escape")
        return next({ page: "profiles", cursor: 0, offset: 0 });
      break;
    }
    case "confirm":
      if (["left", "right", "tab"].includes(key))
        return next({ authorize: !state.authorize });
      if (key === "escape" || (enter && !state.authorize))
        return next({ page: "review" });
      if (enter && state.authorize) return next({ page: "done" });
      break;
    case "done":
      if (enter || key === "escape") return next({ page: "review" });
      break;
  }
  return Action.Beep();
};

export const combinedHandlers = (
  skills: ReadonlyArray<Skill>,
  width: number,
  rows: number,
): Prompt.Handlers<State, void> => ({
  render: (state, action) =>
    Effect.succeed(
      Action.$match(action, {
        Beep: () => "\u0007",
        Submit: () =>
          Box.renderPrettySync(Cmd.cursorShow) +
          "Preview closed. No files changed.\r\n",
        NextFrame: () =>
          Box.renderPrettySync(Cmd.cursorHide) +
          Box.renderPrettySync(
            renderCombined(state, skills, width, rows),
          ).replaceAll("\n", "\r\n") +
          Box.renderPrettySync(Cmd.cursorNextLine(1)),
      }),
    ),
  process: (input, state) =>
    Effect.succeed(advanceCombined(input.key.name, state, skills, width, rows)),
  clear: (state, action) =>
    action._tag === "Beep"
      ? Effect.succeed("")
      : Box.renderPretty(
          Cmd.clearLines(renderCombined(state, skills, width, rows).rows + 1),
        ),
});
