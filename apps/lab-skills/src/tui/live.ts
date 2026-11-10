import { NodeTerminal } from "@effect/platform-node";
import { Effect, Layer, Stdio, Terminal } from "effect";
import { Prompt } from "effect/cli";
import { Box, Cmd } from "effect-boxes";
import { configure, parse, type Environment } from "../config.js";
import { problem } from "../error.js";
import {
  canInstall,
  inspect,
  reviewedPlan,
  withSelection,
} from "./inspection.js";
import { initialView, liveHandlers, type ViewState } from "./live-view.js";
import type { Inspection } from "./inspection.js";

// Escape belongs to screen navigation; only control keys end the input queue.
export const shouldQuitInspector = (input: Terminal.UserInput) =>
  input.key.ctrl && (input.key.name === "c" || input.key.name === "d");

export const inspectorTerminal = Layer.effect(
  Terminal.Terminal,
  NodeTerminal.make(shouldQuitInspector),
);

export const promptIntent = (
  state: ViewState,
  model: Inspection,
  width: number,
  rows: number,
) =>
  Prompt.Custom(state, liveHandlers(model, width, rows)).pipe(
    Effect.catchTag("QuitError", () => Effect.interrupt),
  );

const busy = <A, E, R>(message: string, operation: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    yield* terminal
      .display(Box.renderPrettySync(Cmd.cursorHide) + message)
      .pipe(Effect.orDie);
    return yield* operation.pipe(
      Effect.ensuring(
        terminal
          .display(
            Box.renderPrettySync(Cmd.clearLines(1)) +
              Box.renderPrettySync(Cmd.cursorShow),
          )
          .pipe(Effect.orDie),
      ),
    );
  });

export const interactive = Effect.fn("Tui.run")(function* (
  root: string,
  argv: ReadonlyArray<string>,
  environment: Environment,
) {
  const flags = yield* parse(argv);
  const stdio = yield* Stdio.Stdio;
  if (!(yield* stdio.stdinIsTerminal) || !(yield* stdio.stdoutIsTerminal))
    return yield* problem(
      "ARGUMENT_INVALID",
      "--tui requires an interactive terminal. Omit --tui for readable output or use --json.",
      2,
    );
  const terminal = yield* Terminal.Terminal;
  const width = Math.min(100, (yield* terminal.columns) - 1);
  const rows = Math.min(30, (yield* terminal.rows) - 1);
  if (width < 40 || rows < 23)
    return yield* problem(
      "ARGUMENT_INVALID",
      "The inspector needs at least 41 columns and 24 rows. Enlarge the terminal or omit --tui.",
      2,
    );
  // Resolve configuration once for the session. Explicit scope edits replace its arrays.
  const options = yield* configure(flags, environment);
  let command = flags.command === "apply" ? ("plan" as const) : flags.command;
  let model = yield* busy(
    "Reading installation state…",
    inspect(root, { ...flags, command }, environment, options),
  );
  let state = initialView(model);
  while (true) {
    const intent = yield* promptIntent(state, model, width, rows);
    if (intent._tag === "Quit") return model.result;
    if (intent._tag === "Install") {
      if (!canInstall(model.result)) continue;
      model = yield* busy(
        "Installing reviewed changes. Exit waits during the transaction…",
        inspect(
          root,
          { ...flags, command: "apply" },
          environment,
          model.options,
          reviewedPlan(model),
        ),
      );
      state = { ...initialView(model), page: "outcome", mode: "details" };
    } else if (intent._tag === "Selection") {
      command = "plan";
      const selected = withSelection(model.options, {
        ...model.options.selection,
        profiles: intent.state.profiles,
        targets: intent.state.targets,
      });
      model = yield* busy(
        "Reading installation state…",
        inspect(root, { ...flags, command }, environment, selected),
      );
      state = initialView(model);
    } else {
      command = intent.command;
      model = yield* busy(
        "Reading installation state…",
        inspect(root, { ...flags, command }, environment, model.options),
      );
      state = initialView(model);
    }
  }
});
