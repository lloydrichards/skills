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
const reports = fileURLToPath(
  new URL("./fixtures/mutation-test-loop/", import.meta.url),
);
const summarise = join(skill, "scripts/summarise-report.mjs");
const validate = join(skill, "scripts/validate-notes.mjs");
const tryRegression = join(skill, "scripts/try-regression.mjs");
const before = join(reports, "booking-before.json");
const after = join(reports, "booking-after.json");

const node = (script, args) =>
  spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

const withTemp = async (body) => {
  const directory = await mkdtemp(join(tmpdir(), "mutation-loop-test-"));
  try {
    return await body(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const summary = (args) =>
  withTemp(async (directory) => {
    const out = join(directory, "triage.json");
    const result = node(summarise, [
      ...args,
      "--json",
      out,
      "--md",
      "/dev/null",
    ]);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(await readFile(out, "utf8"));
  });

const validNotes = () => ({
  schemaVersion: 2,
  campaign: {
    id: "booking",
    mode: "audit-and-rewrite",
    status: "complete",
    engine: "stryker-vitest",
    scope: { mutate: ["src/booking.mjs"] },
    baseline: { command: "npx vitest run", exitCode: 0, active: 7, skipped: 0 },
    reports: { before: "before.json", after: "mutation.json" },
    finalSuiteRun: { command: "npx vitest run", exitCode: 0 },
    worktreeOnlyIntendedChanges: true,
    worktreeNote: "Only test/booking.test.mjs changed",
  },
  clusters: [
    {
      id: "src/booking.mjs:13",
      mutants: ["src/booking.mjs:13:20-13:61 LogicalOperator -> x"],
      verdict: "gap",
      reason: "SAVE20 is never tried on a standard booking",
      resolution: "killed",
      evidence: "compare: 3 now killed",
    },
  ],
  tests: [],
});

const validateNotes = (notes) =>
  withTemp(async (directory) => {
    const file = join(directory, "notes.json");
    await writeFile(file, JSON.stringify(notes));
    return node(validate, [file]);
  });

const rejects = async (notes, diagnostic) => {
  const result = await validateNotes(notes);
  assert.equal(result.status, 1);
  assert.match(result.stderr, diagnostic);
  assert.doesNotMatch(result.stderr, /TypeError|\n\s+at /);
};

void describe("mutation report triage", () => {
  void test("groups the booking discount survivors into one line cluster", async () => {
    const triage = await summary([before]);
    assert.deepEqual(
      triage.survivorClusters.map((cluster) => [
        cluster.id,
        cluster.mutants.length,
      ]),
      [["src/booking.mjs:13", 3]],
    );
    assert.equal(triage.counts.Survived, 3);
  });

  void test("names covered tests by file and title rather than run-specific ids", async () => {
    const triage = await summary([before]);
    assert.ok(
      triage.survivorClusters[0].tests.includes(
        "test/booking.test.mjs › applies SAVE20 only to a premium booking",
      ),
    );
  });

  void test("flags a weakly asserted test as having no unique kills when bail is off", async () => {
    const triage = await summary([before]);
    assert.deepEqual(
      triage.testsWithoutUniqueKills.map((entry) => entry.name),
      ["prices a premium booking"],
    );
  });

  void test("withholds overlap judgements when the report was produced with bail on", async () => {
    await withTemp(async (directory) => {
      const report = JSON.parse(await readFile(before, "utf8"));
      report.config.disableBail = false;
      const bailed = join(directory, "bailed.json");
      await writeFile(bailed, JSON.stringify(report));
      const triage = await summary([bailed]);
      assert.equal(triage.testsWithoutUniqueKills, null);
    });
  });

  void test("treats a survivor that no test ran against as suspect, not a cluster", async () => {
    await withTemp(async (directory) => {
      const report = JSON.parse(await readFile(before, "utf8"));
      const survivor = Object.values(report.files)[0].mutants.find(
        (mutant) => mutant.status === "Survived",
      );
      survivor.testsCompleted = 0;
      const edited = join(directory, "suspect.json");
      await writeFile(edited, JSON.stringify(report));
      const triage = await summary([edited]);
      assert.equal(triage.suspectSurvivors.length, 1);
      assert.equal(triage.survivorClusters[0].mutants.length, 2);
    });
  });

  void test("reports which earlier survivors a rewrite killed", async () => {
    const triage = await summary([after, "--compare", before]);
    assert.equal(triage.comparison.nowKilled.length, 2);
    assert.deepEqual(triage.comparison.stillSurviving, [
      "src/booking.mjs:13:20-13:39 ConditionalExpression -> true",
    ]);
    assert.deepEqual(triage.comparison.newSurvivors, []);
  });

  void test("lists every generated mutant on a requested line", async () => {
    const triage = await summary([before, "--line", "src/booking.mjs:2"]);
    assert.equal(triage.mutantsOnLine.length, 8);
    assert.ok(
      triage.mutantsOnLine.every((mutant) => mutant.status === "Killed"),
    );
  });

  void test("rejects input that is not a Stryker report", async () => {
    await withTemp(async (directory) => {
      const file = join(directory, "other.json");
      await writeFile(file, "{}");
      const result = node(summarise, [file]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /not a Stryker mutation report/);
    });
  });
});

void describe("mutation audit notes validation", () => {
  void test("accepts a complete rewrite campaign with a killed gap", async () => {
    const result = await validateNotes(validNotes());
    assert.equal(result.status, 0, result.stderr);
  });

  void test("rejects notes taken over a failing baseline", async () => {
    const notes = validNotes();
    notes.campaign.baseline.exitCode = 1;
    await rejects(notes, /baseline\.exitCode must be 0/);
  });

  void test("rejects a killed cluster without re-run evidence", async () => {
    const notes = validNotes();
    delete notes.clusters[0].evidence;
    await rejects(notes, /evidence must cite the re-run/);
  });

  void test("rejects killing a gap in audit-only mode", async () => {
    const notes = validNotes();
    notes.campaign.mode = "audit-only";
    await rejects(notes, /cannot be killed in audit-only mode/);
  });

  void test("rejects accepting a gap instead of leaving it open", async () => {
    const notes = validNotes();
    notes.clusters[0].resolution = "accepted";
    await rejects(notes, /cannot be accepted/);
  });

  void test("requires a reason for an open gap in a completed rewrite", async () => {
    const notes = validNotes();
    notes.clusters[0].resolution = "open";
    await rejects(notes, /needs openReason/);
  });

  void test("rejects bare Stryker ids that change between runs", async () => {
    const notes = validNotes();
    notes.clusters[0].mutants = ["45"];
    await rejects(notes, /not bare Stryker IDs/);
  });

  void test("rejects completion when the worktree was not restored", async () => {
    const notes = validNotes();
    notes.campaign.worktreeOnlyIntendedChanges = false;
    await rejects(notes, /worktreeOnlyIntendedChanges/);
  });

  void test("requires the production line for a blind spot", async () => {
    const notes = validNotes();
    notes.tests.push({
      test: "test/booking.test.mjs › rejects a zero-night booking",
      signal: "blind_spot",
      note: "fractional nights never tested",
      action: "rewrite",
      resolution: "open",
    });
    await rejects(notes, /source must name the production file:line/);
  });

  void test("requires manual evidence before resolving a blind spot", async () => {
    const notes = validNotes();
    notes.tests.push({
      test: "test/booking.test.mjs › rejects a zero-night booking",
      signal: "blind_spot",
      source: "src/booking.mjs:2",
      note: "fractional nights never tested",
      action: "rewrite",
      resolution: "resolved",
    });
    await rejects(notes, /evidence must show the new test fails/);
  });

  void test("requires a note listing worktree differences on completion", async () => {
    const notes = validNotes();
    delete notes.campaign.worktreeNote;
    await rejects(notes, /worktreeNote/);
  });

  void test("requires a reason for a blocked campaign", async () => {
    const notes = validNotes();
    notes.campaign.status = "blocked";
    await rejects(notes, /blockedReason/);
  });
});

void describe("hand-written regression check", () => {
  const project = async (directory, testBody) => {
    await writeFile(
      join(directory, "limit.mjs"),
      "export const allowed = (used, limit) => used < limit\n",
    );
    await writeFile(
      join(directory, "check.mjs"),
      `import { allowed } from "./limit.mjs"\nif (!(${testBody})) process.exit(1)\n`,
    );
  };
  const attempt = (directory) =>
    spawnSync(
      process.execPath,
      [
        tryRegression,
        "--file",
        "limit.mjs",
        "--find",
        "used < limit",
        "--replace",
        "used <= limit",
        "--",
        process.execPath,
        "check.mjs",
      ],
      { cwd: directory, encoding: "utf8" },
    );

  void test("reports a regression the tests catch without editing the checkout", async () => {
    await withTemp(async (directory) => {
      await project(directory, "allowed(1, 2) && !allowed(2, 2)");
      const result = attempt(directory);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /CAUGHT/);
      assert.match(
        await readFile(join(directory, "limit.mjs"), "utf8"),
        /used < limit/,
      );
    });
  });

  void test("reports a regression the tests miss", async () => {
    await withTemp(async (directory) => {
      await project(directory, "allowed(1, 2)");
      const result = attempt(directory);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, /MISSED/);
    });
  });

  void test("refuses an ambiguous find text", async () => {
    await withTemp(async (directory) => {
      await project(directory, "allowed(1, 2)");
      const result = spawnSync(
        process.execPath,
        [
          tryRegression,
          "--file",
          "limit.mjs",
          "--find",
          "limit",
          "--replace",
          "x",
          "--",
          "true",
        ],
        { cwd: directory, encoding: "utf8" },
      );
      assert.equal(result.status, 2);
      assert.match(result.stderr, /must match exactly once/);
    });
  });
});
