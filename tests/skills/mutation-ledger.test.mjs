import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const skill = fileURLToPath(
  new URL("../../skills/mutation-test-loop/", import.meta.url),
);
const validator = join(skill, "scripts/validate-ledger.mjs");
const fixture = (name) => join(skill, "evals/fixtures", name);
const run = async (ledger) => {
  const directory = await mkdtemp(join(tmpdir(), "mutation-ledger-test-"));
  try {
    const file = join(directory, "ledger.json");
    await writeFile(file, JSON.stringify(ledger));
    return spawnSync(process.execPath, [validator, file], { encoding: "utf8" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
const valid = () => ({
  schemaVersion: 1,
  campaign: {
    status: "complete",
    baseline: { exitCode: 0, active: 1, skipped: 0 },
    restorationProven: true,
    finalSuiteRun: { outcome: "passed", exitCode: 0 },
    progress: {
      active: 1,
      terminal: 1,
      remaining: 0,
      currentTestId: null,
      nextAction: "Complete",
    },
  },
  tests: [
    {
      id: "booking-001",
      workerId: "worker-001",
      status: "killed",
      attempts: [
        {
          status: "killed",
          mutatedRun: { outcome: "failed", exitCode: 1, selectedTests: 1 },
          restoration: { proven: true },
          cleanRun: { outcome: "passed", exitCode: 0, selectedTests: 1 },
        },
      ],
    },
  ],
});
const rejected = async (ledger, diagnostic) => {
  const result = await run(ledger);
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, diagnostic);
  assert.doesNotMatch(result.stderr, /TypeError|\n\s+at /);
};

void describe("mutation ledger evidence validation", () => {
  for (const [directory, filename] of [
    ["persistence-campaign", "mutation-audit.json"],
    ["persistence-campaign-revised", "mutation-audit.json"],
    ["persistence-campaign-terra", "mutation-audit.json"],
    ["persistence-campaign-terra", "terra-mutation-audit.json"],
  ]) {
    void test(`should accept historical evidence when reading ${directory}/${filename}`, async () => {
      const result = await run(
        JSON.parse(await readFile(join(fixture(directory), filename), "utf8")),
      );
      assert.strictEqual(result.stderr, "");
      assert.strictEqual(result.status, 0);
    });
  }

  void test("should reject killed results when no trial is recorded", async () => {
    const ledger = valid();
    ledger.tests[0].attempts = [];
    await rejected(ledger, /attempt|trial/i);
  });

  void test("should reject a killed trial when the mutated test passed", async () => {
    const ledger = valid();
    ledger.tests[0].attempts[0].mutatedRun = {
      outcome: "passed",
      exitCode: 0,
      selectedTests: 1,
    };
    await rejected(ledger, /mutatedRun|killed/i);
  });

  void test("should reject a survived trial when the mutated test failed", async () => {
    const ledger = valid();
    ledger.tests[0].status = "survived";
    ledger.tests[0].attempts[0].status = "survived";
    await rejected(ledger, /mutatedRun|survived/i);
  });

  void test("should reject completion when a later trial is running", async () => {
    const ledger = valid();
    ledger.tests[0].attempts.push({
      ...ledger.tests[0].attempts[0],
      status: "running",
    });
    await rejected(ledger, /running|attempt|latest/i);
  });

  void test("should reject a result when it disagrees with the latest terminal trial", async () => {
    const ledger = valid();
    ledger.tests[0].attempts.push({
      ...ledger.tests[0].attempts[0],
      status: "survived",
      mutatedRun: { outcome: "passed", exitCode: 0, selectedTests: 1 },
    });
    await rejected(ledger, /status|latest|match/i);
  });

  void test("should reject completion when the baseline contains no tests", async () => {
    const ledger = valid();
    ledger.tests = [];
    ledger.campaign.baseline.active = 0;
    ledger.campaign.progress = {
      ...ledger.campaign.progress,
      active: 0,
      terminal: 0,
    };
    await rejected(ledger, /baseline|empty|active|test/i);
  });

  for (const value of [null, []]) {
    /** @type {ReadonlyArray<readonly [string, unknown, RegExp]>} */
    const cases = [
      ["root", value, /ledger|root|object/i],
      ["campaign", { ...valid(), campaign: value }, /campaign/i],
      [
        "progress",
        { ...valid(), campaign: { ...valid().campaign, progress: value } },
        /progress/i,
      ],
      ["test", { ...valid(), tests: [value] }, /tests/i],
      [
        "attempt",
        { ...valid(), tests: [{ ...valid().tests[0], attempts: [value] }] },
        /attempts\[0\]/i,
      ],
    ];
    for (const [name, ledger, diagnostic] of cases) {
      void test(`should report a validation error when ${name} is ${JSON.stringify(value)}`, async () => {
        await rejected(ledger, diagnostic);
      });
    }
  }
  void test("should report a validation error when the test inventory is not an array", async () => {
    await rejected({ ...valid(), tests: {} }, /tests/i);
  });
  for (const attempts of [null, {}]) {
    void test(`should report a validation error when attempts is ${JSON.stringify(attempts)}`, async () => {
      await rejected(
        { ...valid(), tests: [{ ...valid().tests[0], attempts }] },
        /attempts/i,
      );
    });
  }
});
