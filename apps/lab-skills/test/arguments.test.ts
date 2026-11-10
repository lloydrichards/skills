import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { parse } from "../src/commands.js";

const invalidArguments = [
  ["an unknown command", ["unknown"]],
  ["a JSON value", ["validate", "--json", "false"]],
  ["a true JSON value", ["validate", "--json", "true"]],
  ["a JSON assignment", ["validate", "--json=true"]],
  ["a false JSON assignment", ["validate", "--json=false"]],
  ["a missing option value", ["plan", "--home"]],
  ["an invalid destination", ["plan", "--target", "unknown"]],
  ["an unexpected positional argument", ["plan", "extra"]],
  ["an empty home", ["plan", "--home", ""]],
  ["an empty configuration path", ["plan", "--config", ""]],
  ["an empty archive path", ["plan", "--archive-dir", ""]],
  ["an empty profile", ["plan", "--profile", ""]],
  ["an empty skill", ["plan", "--skill", ""]],
  ["an empty destination", ["plan", "--target", ""]],
] as const;

describe("Argument parsing", () => {
  for (const [name, args] of invalidArguments) {
    it.effect(`should reject arguments when given ${name}`, () =>
      parse([...args, "--json"]).pipe(
        Effect.flip,
        Effect.map((error) => {
          assert.strictEqual(error.code, "ARGUMENT_INVALID");
          assert.strictEqual(error.exitCode, 2);
        }),
        Effect.provide(NodeServices.layer),
      ),
    );
  }
  for (const args of [
    ["validate", "--tui", "--json"],
    ["validate", "--tui=false", "--json"],
    ["validate", "--tui", "false", "--json"],
  ]) {
    it.effect(
      `should reject incompatible inspector flags when given ${args.join(" ")}`,
      () =>
        parse(args).pipe(
          Effect.flip,
          Effect.map((error) => {
            assert.strictEqual(error.code, "ARGUMENT_INVALID");
            assert.strictEqual(error.exitCode, 2);
          }),
          Effect.provide(NodeServices.layer),
        ),
    );
  }
  it.effect("should enable JSON output when the switch is repeated", () =>
    parse(["validate", "--json", "--json"]).pipe(
      Effect.map((flags) => assert.isTrue(flags.json)),
      Effect.provide(NodeServices.layer),
    ),
  );
  it.effect(
    "should retain selection order when flags and destination aliases are repeated",
    () =>
      parse([
        "validate",
        "--profile",
        "default",
        "--profile",
        "effect",
        "--skill",
        "unslop",
        "--skill",
        "deslop",
        "--target",
        "agents",
        "--harness",
        "codex",
        "--target",
        "claude",
        "--json",
      ]).pipe(
        Effect.map((flags) => {
          assert.deepStrictEqual(flags.profiles, ["default", "effect"]);
          assert.deepStrictEqual(flags.skills, ["unslop", "deslop"]);
          assert.deepStrictEqual(flags.targets, ["agents", "codex", "claude"]);
        }),
        Effect.provide(NodeServices.layer),
      ),
  );
});
