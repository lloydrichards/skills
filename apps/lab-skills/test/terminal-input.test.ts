import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option, Queue, Terminal } from "effect";
import { initialView, liveHandlers } from "../src/tui/live-view.js";
import { shouldQuitInspector, promptIntent } from "../src/tui/live.js";
import type { Inspection } from "../src/tui/inspection.js";

const selection = {
  profiles: ["default"],
  skills: [],
  targets: ["agents" as const],
};
const model: Inspection = {
  root: "/checkout",
  options: { home: "/home/test", selection },
  profileNames: ["default"],
  previews: new Map(),
  result: {
    schemaVersion: 1,
    command: "plan",
    ok: true,
    exitCode: 0,
    checkout: "/checkout",
    selection,
    entries: [],
    diagnostics: [],
  },
};

const input = (
  name: string,
  text: string,
  ctrl = false,
): Terminal.UserInput => ({
  input: Option.some(text),
  key: { name, ctrl, meta: false, shift: false },
});

describe("inspector terminal input", () => {
  it.effect("keeps reading after Escape navigates to profiles", () =>
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal;
      const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>();
      const escape = input("escape", "\u001b");
      assert.isFalse(shouldQuitInspector(escape));
      yield* Queue.offer(queue, escape);
      yield* Queue.offer(queue, input("q", "q"));
      const frames: string[] = [];
      const intent = yield* promptIntent(
        initialView(model),
        model,
        80,
        26,
      ).pipe(
        Effect.provideService(
          Terminal.Terminal,
          Terminal.make({
            ...terminal,
            readInput: Effect.succeed(queue),
            display: (frame) =>
              Effect.sync(() => {
                frames.push(frame);
              }),
          }),
        ),
      );
      assert.strictEqual(intent._tag, "Quit");
      assert.isTrue(frames.some((frame) => frame.includes("Choose profiles")));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("opens help for printable input with no parsed key name", () =>
    Effect.gen(function* () {
      const input: Terminal.UserInput = {
        input: Option.some("?"),
        key: { name: "", ctrl: false, meta: false, shift: false },
      };
      const action = yield* liveHandlers(model, 80, 26).process(
        input,
        initialView(model),
      );
      assert.strictEqual(action._tag, "NextFrame");
      if (action._tag === "NextFrame")
        assert.strictEqual(action.state.mode, "help");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("treats closed terminal input as cancellation", () =>
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal;
      const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>();
      yield* Queue.end(queue);
      const exit = yield* promptIntent(initialView(model), model, 80, 26).pipe(
        Effect.provideService(
          Terminal.Terminal,
          Terminal.make({
            ...terminal,
            readInput: Effect.succeed(queue),
            display: () => Effect.void,
          }),
        ),
        Effect.exit,
      );
      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit))
        assert.isTrue(Cause.hasInterruptsOnly(exit.cause));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  for (const key of ["c", "d"]) {
    it.effect(
      `cancels with Ctrl+${key.toUpperCase()} without returning a successful result`,
      () =>
        Effect.gen(function* () {
          const terminal = yield* Terminal.Terminal;
          const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>();
          const cancel = input(key, key === "c" ? "\u0003" : "\u0004", true);
          assert.isTrue(shouldQuitInspector(cancel));
          yield* Queue.offer(queue, cancel);
          yield* Queue.end(queue);
          const silentTerminal = Terminal.make({
            ...terminal,
            readInput: Effect.succeed(queue),
            display: () => Effect.void,
          });
          const exit = yield* promptIntent(
            initialView(model),
            model,
            80,
            26,
          ).pipe(
            Effect.provideService(Terminal.Terminal, silentTerminal),
            Effect.exit,
          );
          assert.isTrue(Exit.isFailure(exit));
          if (Exit.isFailure(exit))
            assert.isTrue(Cause.hasInterruptsOnly(exit.cause));
        }).pipe(Effect.provide(NodeServices.layer)),
    );
  }
});
