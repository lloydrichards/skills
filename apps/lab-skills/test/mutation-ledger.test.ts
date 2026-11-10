import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const skill = fileURLToPath(
  new URL("../../../skills/mutation-test-loop/", import.meta.url),
);
const validator = join(skill, "scripts/validate-ledger.mjs");
const fixture = (name: string) => join(skill, "evals/fixtures", name);
const run = async (ledger: unknown) => {
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
const rejected = async (ledger: unknown, diagnostic: RegExp) => {
  const result = await run(ledger);
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(diagnostic);
  expect(result.stderr).not.toMatch(/TypeError|\n\s+at /);
};

describe("mutation ledger evidence validation", () => {
  test.each([
    ["persistence-campaign", "mutation-audit.json"],
    ["persistence-campaign-revised", "mutation-audit.json"],
    ["persistence-campaign-terra", "mutation-audit.json"],
    ["persistence-campaign-terra", "terra-mutation-audit.json"],
  ])("accepts historical evidence from %s/%s", async (directory, filename) => {
    const ledger: unknown = JSON.parse(
      await readFile(join(fixture(directory), filename), "utf8"),
    );
    const result = await run(ledger);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  test("rejects killed tests without a trial", async () => {
    const ledger = valid();
    ledger.tests[0]!.attempts = [];
    await rejected(ledger, /attempt|trial/i);
  });

  test("rejects a killed trial whose mutated test passed", async () => {
    const ledger = valid();
    ledger.tests[0]!.attempts[0]!.mutatedRun = {
      outcome: "passed",
      exitCode: 0,
      selectedTests: 1,
    };
    await rejected(ledger, /mutatedRun|killed/i);
  });

  test("rejects a survived trial whose mutated test failed", async () => {
    const ledger = valid();
    ledger.tests[0]!.status = "survived";
    ledger.tests[0]!.attempts[0]!.status = "survived";
    await rejected(ledger, /mutatedRun|survived/i);
  });

  test("rejects completion while a later trial is running", async () => {
    const ledger = valid();
    ledger.tests[0]!.attempts.push({
      ...ledger.tests[0]!.attempts[0]!,
      status: "running",
    });
    await rejected(ledger, /running|attempt|latest/i);
  });

  test("rejects a top-level result that disagrees with the latest terminal trial", async () => {
    const ledger = valid();
    ledger.tests[0]!.attempts.push({
      ...ledger.tests[0]!.attempts[0]!,
      status: "survived",
      mutatedRun: { outcome: "passed", exitCode: 0, selectedTests: 1 },
    });
    await rejected(ledger, /status|latest|match/i);
  });

  test("rejects an empty completed campaign with no baseline tests", async () => {
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

  test.each([{ value: null }, { value: [] }])(
    "reports malformed root $value without throwing",
    async ({ value: root }) => {
      await rejected(root, /ledger|root|object/i);
    },
  );

  test.each([{ value: null }, { value: [] }])(
    "reports malformed campaign $value without throwing",
    async ({ value: campaign }) => {
      await rejected({ ...valid(), campaign }, /campaign/i);
    },
  );

  test.each([{ value: null }, { value: [] }])(
    "reports malformed progress $value without throwing",
    async ({ value: progress }) => {
      const ledger = valid();
      await rejected(
        { ...ledger, campaign: { ...ledger.campaign, progress } },
        /progress/i,
      );
    },
  );

  test("reports a non-array test inventory without throwing", async () => {
    await rejected({ ...valid(), tests: {} }, /tests/i);
  });

  test.each([{ value: null }, { value: [] }])(
    "reports malformed test $value without throwing",
    async ({ value: entry }) => {
      await rejected({ ...valid(), tests: [entry] }, /tests/i);
    },
  );

  test.each([null, {}])(
    "reports malformed attempts %j without throwing",
    async (attempts) => {
      const ledger = valid();
      await rejected(
        { ...ledger, tests: [{ ...ledger.tests[0], attempts }] },
        /attempts/i,
      );
    },
  );

  test.each([{ value: null }, { value: [] }])(
    "reports malformed attempt $value without throwing",
    async ({ value: attempt }) => {
      const ledger = valid();
      await rejected(
        { ...ledger, tests: [{ ...ledger.tests[0], attempts: [attempt] }] },
        /attempts\[0\]/i,
      );
    },
  );
});
