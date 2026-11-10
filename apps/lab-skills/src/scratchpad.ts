/**
 * Effect Boxes experiments. Installation and diagnostic data is fictional;
 * the combined inspector reads skill previews from the owning checkout.
 * No installer services are wired into this entry point.
 */
import { fileURLToPath } from "node:url";
import {
  combinedHandlers,
  initialState,
  loadSkills,
  pages,
  renderCombined,
} from "./tui/combined.js";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Data, Effect, Option, Stdio, Terminal } from "effect";
import { Command, Flag, Prompt } from "effect/cli";
import { Ansi, Box, Cmd, Flex, Grid } from "effect-boxes";

type Item = {
  readonly title: string;
  readonly badge: string;
  readonly detail: string;
  readonly note: string;
};
const scenes = {
  plan: {
    title: "Plan inspector",
    summary: "2 new / 1 update / 1 current",
    left: "PROPOSED CHANGES",
    right: "SOURCE / DESTINATION",
    items: [
      {
        title: "effect",
        badge: "NEW",
        detail: "Pinned upstream skill -> ~/.agents/skills/effect",
        note: "The payload would be hash-verified before installation.",
      },
      {
        title: "deslop",
        badge: "UPDATE",
        detail: "Editable source -> ~/.agents/skills/deslop",
        note: "Source changed. The installed copy still matches its ownership record.",
      },
      {
        title: "unslop",
        badge: "CURRENT",
        detail: "Editable source -> ~/.agents/skills/unslop",
        note: "The source and installed content match. No write is needed.",
      },
      {
        title: "make-pr",
        badge: "NEW",
        detail: "Editable source -> ~/.agents/skills/make-pr",
        note: "External prerequisites would still need to be checked.",
      },
    ],
  },
  status: {
    title: "Installation dashboard",
    summary: "4 owned / 3 current / 1 update",
    left: "OWNED SKILLS",
    right: "INSTALLATION DETAIL",
    items: [
      {
        title: "effect",
        badge: "CURRENT",
        detail: "Source pin and installed bytes match the ownership record.",
        note: "Destination: ~/.agents/skills/effect",
      },
      {
        title: "deslop",
        badge: "UPDATE",
        detail:
          "A newer source snapshot is available. Local installed files are unchanged.",
        note: "A future UI could show the desired and installed digests here.",
      },
      {
        title: "unslop",
        badge: "CURRENT",
        detail: "All recorded files, permissions, and directories match.",
        note: "Destination: ~/.agents/skills/unslop",
      },
      {
        title: "make-pr",
        badge: "CURRENT",
        detail:
          "Installed from editable source. Git metadata is informational.",
        note: "Destination: ~/.agents/skills/make-pr",
      },
    ],
  },
  doctor: {
    title: "Diagnostic workbench",
    summary: "1 conflict / 2 warnings / 1 healthy",
    left: "FINDINGS",
    right: "EVIDENCE / NEXT STEP",
    items: [
      {
        title: "Installer journal",
        badge: "CONFLICT",
        detail: "An interrupted operation left a journal and backup directory.",
        note: "Preserve the evidence. Review recovery.md before changing any files.",
      },
      {
        title: "Broken skill link",
        badge: "WARN",
        detail:
          "A discovery root contains a link whose destination is missing.",
        note: "Diagnosis only. This demo never removes links.",
      },
      {
        title: "GitButler prerequisite",
        badge: "WARN",
        detail:
          "The selected skill declares an externally managed CLI prerequisite.",
        note: "Executable discovery is not a guarantee that authentication is configured.",
      },
      {
        title: "Source catalog",
        badge: "OK",
        detail:
          "All declared profiles, source pins, and dependency edges are valid.",
        note: "Validation includes unselected declarations.",
      },
    ],
  },
  apply: {
    title: "Apply review / simulated stages",
    summary: "DEMO ONLY / 4 stages / no writes",
    left: "TRANSACTION STAGES",
    right: "STAGE DETAIL",
    items: [
      {
        title: "Fetch and verify",
        badge: "1 / 4",
        detail: "Prepare every payload and verify its pinned hashes.",
        note: "In the real installer, this happens before destination mutation.",
      },
      {
        title: "Recheck and stage",
        badge: "2 / 4",
        detail:
          "Acquire the lock, recheck ownership and sources, then stage directories.",
        note: "A UI must preserve the existing installer safety checks.",
      },
      {
        title: "Journal and replace",
        badge: "3 / 4",
        detail:
          "Record recovery evidence before replacing installation directories.",
        note: "Multiple directory replacements are not crash-atomic.",
      },
      {
        title: "Commit ownership",
        badge: "4 / 4",
        detail:
          "Replace ownership state atomically and clean up verified backups.",
        note: "This is a visual walkthrough, not a running installation.",
      },
    ],
  },
} as const satisfies Record<
  string,
  {
    title: string;
    summary: string;
    left: string;
    right: string;
    items: ReadonlyArray<Item>;
  }
>;
export type Scene = keyof typeof scenes;
export const sceneNames: ReadonlyArray<Scene> = [
  "plan",
  "status",
  "doctor",
  "apply",
];
const Action = Data.taggedEnum<Prompt.ActionDefinition>();
const styled = (value: string, style: Ansi.AnsiAnnotation = Ansi.white) =>
  Box.text(value).pipe(Box.annotate(style));
const tone = (badge: string) =>
  badge === "CONFLICT"
    ? Ansi.red
    : badge === "WARN" || badge === "UPDATE"
      ? Ansi.yellow
      : Ansi.cyan;

const panel = (
  title: string,
  content: ReadonlyArray<Box.Box<Ansi.AnsiStyle>>,
  width: number,
) =>
  Box.vcat([styled(title, Ansi.dim), ...content], Box.left).pipe(
    Box.alignHoriz(Box.left, width - 4),
    Box.pad(0, 1),
    Box.border("rounded", { annotation: Ansi.dim }),
  );

export const renderExperiment = (
  scene: Scene,
  cursor: number,
  width: number,
): Box.Box<Ansi.AnsiStyle> => {
  const example = scenes[scene];
  const item = example.items[cursor] ?? example.items[0];
  const list = (w: number) =>
    panel(
      example.left,
      example.items.map((row, index) =>
        Box.hsep(
          [
            styled(index === cursor ? ">" : " ", Ansi.cyan),
            styled(row.title, index === cursor ? Ansi.bold : Ansi.dim),
            styled(row.badge, tone(row.badge)),
          ],
          1,
          Box.top,
        ).pipe(Box.truncate(w - 4, Box.left)),
      ),
      w,
    );
  const detail = (w: number) =>
    panel(
      example.right,
      [
        styled(item.title, Ansi.bold),
        Box.para(item.detail, Box.left, w - 4),
        Box.emptyBox(1, 0),
        Box.para(item.note, Box.left, w - 4).pipe(Box.annotate(Ansi.dim)),
      ],
      w,
    );
  const body =
    width >= 76
      ? Flex.row([Flex.fill(list), Flex.fill(detail)], width, { gap: 2 })
      : Box.vsep([list(width), detail(width)], 1, Box.left);
  let overview: Box.Box<Ansi.AnsiStyle> = styled(
    example.summary,
    Ansi.green,
  ).pipe(Box.truncate(width, Box.left));
  if (scene === "status") {
    overview = Grid.auto(
      [
        ["4", "OWNED"],
        ["3", "CURRENT"],
        ["1", "UPDATE"],
      ].map(([count, label]) =>
        Box.hsep(
          [
            styled(count ?? "", Ansi.bold),
            styled(label ?? "", label === "UPDATE" ? Ansi.yellow : Ansi.cyan),
          ],
          1,
          Box.top,
        ).pipe(Box.pad(0, 1), Box.border("rounded", { annotation: Ansi.dim })),
      ),
      width,
      { minColWidth: 14, gap: 1 },
    );
  } else if (scene === "doctor") {
    overview = Box.para(
      "RECOVERY EVIDENCE / inspect before making changes",
      Box.left,
      width - 4,
    ).pipe(Box.pad(0, 1), Box.border("single", { annotation: Ansi.yellow }));
  } else if (scene === "apply") {
    const cells = width - 24;
    const filled = Math.floor((cells * (cursor + 1)) / example.items.length);
    overview = Box.hsep(
      [
        styled(`DEMO ${cursor + 1} / 4`, Ansi.yellow),
        styled("━".repeat(filled), Ansi.cyan),
        styled("─".repeat(cells - filled), Ansi.dim),
      ],
      1,
      Box.top,
    );
  }
  return Box.vcat(
    [
      styled(
        `LAB SKILLS / ${scene.toUpperCase()}`,
        Ansi.combine(Ansi.bold, Ansi.cyan),
      ),
      Box.para("SAMPLE DATA · " + example.title, Box.left, width).pipe(
        Box.annotate(Ansi.dim),
      ),
      Box.emptyBox(1, 0),
      overview,
      Box.emptyBox(1, 0),
      body,
      Box.emptyBox(1, 0),
      Box.para(
        "up/down or j/k inspect · enter/q back · ctrl+c quit",
        Box.left,
        width,
      ).pipe(Box.annotate(Ansi.dim)),
    ],
    Box.left,
  );
};

export const navigate = (
  key: string,
  cursor: number,
  count: number,
): Prompt.Action<number, void> => {
  switch (key) {
    case "down":
    case "j":
      return Action.NextFrame({ state: (cursor + 1) % count });
    case "up":
    case "k":
      return Action.NextFrame({ state: (cursor - 1 + count) % count });
    case "return":
    case "enter":
    case "q":
    case "escape":
      return Action.Submit({ value: undefined });
    default:
      return Action.Beep();
  }
};

export const experimentHandlers = (
  scene: Scene,
  width: number,
): Prompt.Handlers<number, void> => ({
  render: (cursor, action) =>
    Effect.succeed(
      Action.$match(action, {
        NextFrame: () =>
          Box.renderPrettySync(Cmd.cursorHide) +
          Box.renderPrettySync(
            renderExperiment(scene, cursor, width),
          ).replaceAll("\n", "\r\n") +
          Box.renderPrettySync(Cmd.cursorNextLine(1)),
        Submit: () => `Closed ${scene} preview. No files changed.\r\n`,
        Beep: () => "\u0007",
      }),
    ),
  process: (input, cursor) =>
    Effect.succeed(
      navigate(input.key.name, cursor, scenes[scene].items.length),
    ),
  // Prompt clears the old frame before rendering the next one. The trailing
  // cursorNextLine adds one empty row to the layout's measured height.
  clear: (cursor) =>
    Box.renderPretty(
      Cmd.clearLines(renderExperiment(scene, cursor, width).rows + 1),
    ),
});

const profileWizard = Effect.fn("Scratchpad.profileWizard")(function* (
  width: number,
) {
  yield* Console.log(
    "Selection wizard / sample profiles. Generates an example command only.",
  );
  const profiles = yield* Prompt.MultiSelect({
    message: "Which profiles would you preview?",
    min: 1,
    choices: [
      {
        title: "Default",
        value: "default",
        description: "Everyday skill collection",
      },
      {
        title: "Effect",
        value: "effect",
        description: "Effect development guidance",
      },
      { title: "Releases", value: "releases", description: "PR preparation" },
    ],
  });
  const target = yield* Prompt.Select({
    message: "Preview destination",
    choices: ["agents", "codex", "claude", "opencode", "pi"].map((value) => ({
      title: value,
      value,
    })),
  });
  const command = `lab-skills plan ${profiles.map((profile) => `--profile ${profile}`).join(" ")} --target ${target}`;
  yield* Console.log(
    Box.renderPrettySync(
      panel(
        "EXAMPLE COMMAND / NOT EXECUTED",
        [Box.para(command, Box.left, Math.min(width, 68) - 4)],
        Math.min(width, 68),
      ),
    ),
  );
  const keep = yield* Prompt.Confirm({
    message: "Keep this selection in the demo summary?",
    initial: false,
  });
  yield* Console.log(
    keep
      ? `Demo selection: ${profiles.join(", ")} -> ${target}. Nothing executed.`
      : "Selection discarded. Nothing executed.",
  );
});

const scratchpad = Command.make(
  "lab-skills-tui",
  {
    demo: Flag.Literals("demo", [
      "plan",
      "status",
      "doctor",
      "apply",
      "profiles",
      "combined",
    ]).pipe(Flag.optional),
    screen: Flag.Literals("screen", pages).pipe(Flag.withDefault("review")),
    preview: Flag.Boolean("preview").pipe(Flag.withDefault(false)),
    plain: Flag.Boolean("plain").pipe(
      Flag.withDescription("Disable ANSI styling in preview output"),
      Flag.withDefault(false),
    ),
    width: Flag.Int("width").pipe(
      Flag.filter(
        (n) => n >= 40 && n <= 140,
        () => "Use a width between 40 and 140",
      ),
      Flag.withDefault(80),
    ),
  },
  Effect.fn("Scratchpad.run")(function* (options) {
    const selectedDemo = Option.getOrUndefined(options.demo);
    if (selectedDemo === undefined || selectedDemo === "combined") {
      const skills = yield* loadSkills(
        fileURLToPath(new URL("../../../", import.meta.url)),
      );
      if (options.preview) {
        const layout = renderCombined(
          { ...initialState, page: options.screen },
          skills,
          options.width,
        );
        yield* Console.log(
          options.plain
            ? Box.renderPlainSync(layout)
            : Box.renderPrettySync(layout),
        );
        return;
      }
      const stdio = yield* Stdio.Stdio;
      if (!(yield* stdio.stdinIsTerminal) || !(yield* stdio.stdoutIsTerminal)) {
        yield* Console.error(
          "Interactive demos need a terminal. Use --preview --plain for captured output.",
        );
        return;
      }
      const terminal = yield* Terminal.Terminal;
      const width = Math.min(options.width, (yield* terminal.columns) - 1);
      const rows = Math.min(23, (yield* terminal.rows) - 1);
      if (width < 40 || rows < 23) {
        yield* Console.error(
          "Use a terminal at least 41 columns by 24 rows, or try --preview --plain.",
        );
        return;
      }
      yield* Prompt.Custom(initialState, combinedHandlers(skills, width, rows));
      return;
    }
    if (options.preview) {
      const chosen = selectedDemo;
      if (chosen === "profiles") {
        yield* Console.log(
          "Profile wizard: MultiSelect profiles -> Select target -> Confirm summary. Interactive demo: --demo profiles",
        );
        return;
      }
      for (const scene of chosen ? [chosen] : sceneNames) {
        const layout = renderExperiment(scene, 0, options.width);
        yield* Console.log(
          options.plain
            ? Box.renderPlainSync(layout)
            : Box.renderPrettySync(layout),
        );
        yield* Console.log("");
      }
      return;
    }
    const stdio = yield* Stdio.Stdio;
    if (!(yield* stdio.stdinIsTerminal) || !(yield* stdio.stdoutIsTerminal)) {
      yield* Console.error(
        "Interactive demos need a terminal. Use --preview --plain for captured output.",
      );
      return;
    }
    const terminal = yield* Terminal.Terminal;
    // Fix the width for one prompt run so clear() erases exactly the old frame.
    // Restart the demo after resizing the terminal.
    const width = Math.min(options.width, (yield* terminal.columns) - 1);
    if (width < 40) {
      yield* Console.error(
        "Use a terminal at least 41 columns wide, or try --preview --width 40.",
      );
      return;
    }
    {
      const demo = selectedDemo;
      if (demo === "profiles") yield* profileWizard(width);
      else {
        const needed =
          Math.max(
            ...scenes[demo].items.map(
              (_, index) => renderExperiment(demo, index, width).rows,
            ),
          ) + 2;
        if ((yield* terminal.rows) < needed) {
          yield* Console.error(
            `This layout needs ${needed} terminal rows. Enlarge the window or use --preview.`,
          );
          return;
        }
        yield* Prompt.Custom(0, experimentHandlers(demo, width));
      }
      if (Option.isSome(options.demo)) return;
    }
  }),
).pipe(
  Command.withDescription(
    "Experimental layouts with sample changes and real skill previews. Never installs, repairs, or executes displayed commands.",
  ),
);

export const main = () => {
  const bun = !!process.versions["bun"];
  const runMain = bun ? BunRuntime.runMain : NodeRuntime.runMain;
  runMain(
    Command.run(scratchpad, { version: "0.1.0" }).pipe(
      Effect.provide(bun ? BunServices.layer : NodeServices.layer),
    ),
  );
};
