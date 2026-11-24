// Deterministic checks for the booking fixture.
//   node verify.mjs --audit-only   production and tests unchanged, notes record the gaps
//   node verify.mjs                rewritten tests catch the known regressions
// Requires `npm install` to have run in this directory.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const auditOnly = process.argv.includes("--audit-only")
const notesPath = join(here, "reports/mutation/audit-notes.json")
const validator = process.env.MUTATION_NOTES_VALIDATOR

const originalSource = `export const quote = ({ nights, tier, coupon }) => {
  if (!Number.isInteger(nights) || nights < 1) {
    throw new Error("nights must be a positive integer")
  }
  if (tier !== "standard" && tier !== "premium") {
    throw new Error("tier must be standard or premium")
  }
  if (coupon !== undefined && coupon !== "SAVE10" && coupon !== "SAVE20") {
    throw new Error("coupon is invalid")
  }

  const nightlyRate = tier === "premium" ? 180 : 100
  const discount = coupon === "SAVE20" && tier === "premium"
    ? 0.2
    : coupon === "SAVE10"
      ? 0.1
      : 0

  return nights * nightlyRate * (1 - discount)
}
`

const vitest = (cwd) =>
  spawnSync(process.execPath, [join(here, "node_modules/vitest/vitest.mjs"), "run"], { cwd, encoding: "utf8" })

assert.ok(existsSync(join(here, "node_modules/vitest")), "Run npm install in the fixture first")
assert.equal(readFileSync(join(here, "src/booking.mjs"), "utf8"), originalSource, "Production source must be unchanged")

const baseline = vitest(here)
assert.equal(baseline.status, 0, `Fixture tests must pass:\n${baseline.stdout}\n${baseline.stderr}`)

assert.ok(existsSync(notesPath), "Expected audit notes at reports/mutation/audit-notes.json")
const notes = JSON.parse(readFileSync(notesPath, "utf8"))
if (validator) {
  const result = spawnSync(process.execPath, [validator, notesPath], { encoding: "utf8" })
  assert.equal(result.status, 0, `Audit notes failed validation:\n${result.stderr}`)
}
assert.equal(notes.campaign.status, "complete")
const discountCluster = notes.clusters.find((cluster) => /booking\.mjs:13$/.test(cluster.id))
assert.ok(discountCluster, "The SAVE20 discount line (13) survivor cluster must be recorded")
assert.equal(discountCluster.verdict, "gap", "The SAVE20 discount survivors are a real gap")

if (auditOnly) {
  assert.equal(notes.campaign.mode, "audit-only")
  if (existsSync(join(here, ".git"))) {
    const diff = spawnSync("git", ["diff", "--quiet", "HEAD", "--", "test", "src"], { cwd: here })
    assert.equal(diff.status, 0, "Audit-only runs must not change tests or production code")
  }
  console.log("audit-only checks passed")
  process.exit(0)
}

assert.equal(notes.campaign.mode, "audit-and-rewrite")
assert.equal(discountCluster.resolution, "killed")

const regressions = [
  ["SAVE20 applies to any tier", (s) => s.replace('coupon === "SAVE20" && tier === "premium"', 'coupon === "SAVE20" || tier === "premium"')],
  ["SAVE20 ignores the tier", (s) => s.replace('coupon === "SAVE20" && tier === "premium"', 'coupon === "SAVE20"')],
  ["premium always discounted", (s) => s.replace('coupon === "SAVE20" && tier === "premium"', 'tier === "premium"')],
  ["non-integer nights accepted", (s) => s.replace("!Number.isInteger(nights) || nights < 1", "nights < 1")],
]
const missed = []
for (const [name, mutate] of regressions) {
  const mutated = mutate(originalSource)
  assert.notEqual(mutated, originalSource, `Regression "${name}" did not apply`)
  // A copy inside the fixture resolves vitest from the fixture's node_modules.
  mkdirSync(join(here, ".verify-tmp"), { recursive: true })
  const copy = mkdtempSync(join(here, ".verify-tmp", "regression-"))
  try {
    cpSync(join(here, "test"), join(copy, "test"), { recursive: true })
    cpSync(join(here, "src"), join(copy, "src"), { recursive: true })
    cpSync(join(here, "vitest.config.mjs"), join(copy, "vitest.config.mjs"))
    writeFileSync(join(copy, "src/booking.mjs"), mutated)
    if (vitest(copy).status === 0) missed.push(name)
  } finally {
    rmSync(copy, { recursive: true, force: true })
  }
}
rmSync(join(here, ".verify-tmp"), { recursive: true, force: true })
assert.deepEqual(missed, [], `The rewritten tests miss: ${missed.join(", ")}`)
console.log("rewrite checks passed")
