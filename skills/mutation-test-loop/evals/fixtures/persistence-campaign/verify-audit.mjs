import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"

const expectedNames = [
  "rejects a zero-night booking",
  "rejects an unknown tier",
  "rejects an unknown coupon",
  "prices a standard booking without a discount",
  "applies SAVE10 to a standard booking",
  "applies SAVE20 only to a premium booking"
]

const originalSource = `export const quote = ({ nights, tier, coupon }) => {\n  if (!Number.isInteger(nights) || nights < 1) {\n    throw new Error("nights must be a positive integer")\n  }\n  if (tier !== "standard" && tier !== "premium") {\n    throw new Error("tier must be standard or premium")\n  }\n  if (coupon !== undefined && coupon !== "SAVE10" && coupon !== "SAVE20") {\n    throw new Error("coupon is invalid")\n  }\n\n  const nightlyRate = tier === "premium" ? 180 : 100\n  const discount = coupon === "SAVE20" && tier === "premium"\n    ? 0.2\n    : coupon === "SAVE10"\n      ? 0.1\n      : 0\n\n  return nights * nightlyRate * (1 - discount)\n}\n`

const ledger = JSON.parse(await readFile("mutation-audit.json", "utf8"))
assert.equal(ledger.campaign.status, "complete")
assert.equal(ledger.tests.length, expectedNames.length)
assert.deepEqual(ledger.tests.map((entry) => entry.name), expectedNames)
assert.equal(new Set(ledger.tests.map((entry) => entry.workerId)).size, expectedNames.length)

for (const entry of ledger.tests) {
  assert.equal(entry.status, "killed", `${entry.name} was not killed`)
  assert.ok(Array.isArray(entry.attempts) && entry.attempts.length > 0, `${entry.name} has no attempts`)
  const attempt = entry.attempts.at(-1)
  assert.equal(attempt.mutatedRun.outcome, "failed", `${entry.name} did not fail while mutated`)
  assert.equal(attempt.mutatedRun.selectedTests, 1, `${entry.name} did not select exactly one test`)
  assert.equal(attempt.restoration.proven, true, `${entry.name} was not restored`)
  assert.equal(attempt.cleanRun.outcome, "passed", `${entry.name} did not pass after restoration`)
  assert.equal(attempt.cleanRun.selectedTests, 1, `${entry.name} clean run selected the wrong tests`)
}

assert.equal(await readFile("src/booking.mjs", "utf8"), originalSource, "production source was not restored exactly")
const suite = spawnSync(process.execPath, ["--test", "test/booking.test.mjs"], { encoding: "utf8" })
assert.equal(suite.status, 0, suite.stderr || suite.stdout)
console.log("historical example ledger is internally consistent and the clean fixture suite passes; no mutation campaign was run")
