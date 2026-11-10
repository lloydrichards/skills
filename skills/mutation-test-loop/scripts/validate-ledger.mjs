#!/usr/bin/env node

import { readFile } from "node:fs/promises"

const testStatuses = new Set([
  "pending",
  "running",
  "killed",
  "survived",
  "blocked",
  "clean_rerun_failed"
])

const attemptStatuses = new Set([
  ...testStatuses,
  "invalid_mutation",
  "equivalent_mutation"
])

const [ledgerPath] = process.argv.slice(2)
if (ledgerPath === undefined) {
  console.error("Usage: validate-ledger.mjs <ledger.json>")
  process.exit(2)
}

let ledger
try {
  ledger = JSON.parse(await readFile(ledgerPath, "utf8"))
} catch (error) {
  console.error(`- Cannot read ledger: ${error.message}`)
  process.exit(1)
}
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
if (!object(ledger)) {
  console.error("- ledger must be an object")
  process.exit(1)
}
const errors = []

if (ledger.schemaVersion !== 1) errors.push("schemaVersion must be 1")
if (!object(ledger.campaign)) {
  errors.push("campaign must be an object")
}
if (!Array.isArray(ledger.tests)) errors.push("tests must be an array")

const tests = Array.isArray(ledger.tests) ? ledger.tests.filter(object) : []
if (Array.isArray(ledger.tests) && tests.length !== ledger.tests.length) {
  errors.push("tests must contain only objects")
}
if (object(ledger.campaign) && !["in_progress", "complete", "stopped_for_integrity"].includes(ledger.campaign.status)) {
  errors.push("campaign.status is invalid")
}
const ids = new Set()
const workerIds = new Set()

for (const [index, test] of tests.entries()) {
  const label = `tests[${index}]`
  if (typeof test.id !== "string" || test.id.length === 0) {
    errors.push(`${label}.id must be a non-empty string`)
  } else if (ids.has(test.id)) {
    errors.push(`${label}.id duplicates ${test.id}`)
  } else {
    ids.add(test.id)
  }

  if (!testStatuses.has(test.status)) errors.push(`${label}.status is invalid`)
  if (!Array.isArray(test.attempts)) errors.push(`${label}.attempts must be an array`)

  if (test.status === "killed" || test.status === "survived") {
    if (typeof test.workerId !== "string" || test.workerId.length === 0) {
      errors.push(`${label}.workerId is required for a verified trial`)
    } else if (workerIds.has(test.workerId)) {
      errors.push(`${label}.workerId reuses ${test.workerId}`)
    } else {
      workerIds.add(test.workerId)
    }
  }

  const attempts = Array.isArray(test.attempts) ? test.attempts : []
  if (test.status === "killed" || test.status === "survived") {
    const latest = attempts.findLast((attempt) => object(attempt) &&
      (attempt.status === "killed" || attempt.status === "survived"))
    if (!latest || latest.status !== test.status) {
      errors.push(`${label} requires a matching latest adjudicated attempt`)
    }
  }
  for (const [attemptIndex, attempt] of attempts.entries()) {
    const attemptLabel = `${label}.attempts[${attemptIndex}]`
    if (!object(attempt)) {
      errors.push(`${attemptLabel} must be an object`)
      continue
    }
    if (ledger.campaign?.status === "complete" && attempt.status === "running") {
      errors.push(`${attemptLabel} is still running in a complete campaign`)
    }
    if (!attemptStatuses.has(attempt.status)) errors.push(`${attemptLabel}.status is invalid`)

    if (attempt.status === "killed" || attempt.status === "survived") {
      const run = attempt.mutatedRun
      if (attempt.status === "killed" &&
          (run?.outcome !== "failed" || !Number.isInteger(run?.exitCode) || run.exitCode <= 0)) {
        errors.push(`${attemptLabel} killed requires a failed mutated run with a nonzero exitCode`)
      }
      if (attempt.status === "survived" && (run?.outcome !== "passed" || run?.exitCode !== 0)) {
        errors.push(`${attemptLabel} survived requires a passing mutated run`)
      }
      if (attempt.restoration?.proven !== true) {
        errors.push(`${attemptLabel} requires proven restoration`)
      }
      if (attempt.cleanRun?.outcome !== "passed" || attempt.cleanRun?.exitCode !== 0) {
        errors.push(`${attemptLabel} requires a passing clean run`)
      }
      if (attempt.mutatedRun?.selectedTests !== 1) {
        errors.push(`${attemptLabel} must select exactly one mutated test`)
      }
      if (attempt.cleanRun?.selectedTests !== 1) {
        errors.push(`${attemptLabel} must select exactly one clean test`)
      }
    }
  }
}

if (ledger.campaign?.status === "complete") {
  if (tests.length === 0) errors.push("complete campaign requires active tests")
  const baseline = ledger.campaign.baseline
  if (baseline?.exitCode !== 0 || baseline?.active !== tests.length) {
    errors.push("complete campaign requires a passing baseline with a matching active test count")
  }
  const incomplete = tests.filter(
    (test) => test.status !== "killed" && test.status !== "survived" && test.status !== "blocked"
  )
  if (incomplete.length > 0) errors.push("complete campaign contains unverified tests")
  if (ledger.campaign.restorationProven !== true) {
    errors.push("complete campaign requires restorationProven=true")
  }
  if (ledger.campaign.finalSuiteRun?.outcome !== "passed" || ledger.campaign.finalSuiteRun?.exitCode !== 0) {
    errors.push("complete campaign requires a passing finalSuiteRun")
  }
}

if (ledger.campaign?.progress !== undefined) {
  const progress = ledger.campaign.progress
  if (!object(progress)) {
    errors.push("campaign.progress must be an object")
  } else {
    const terminal = tests.filter((test) =>
      test.status === "killed" || test.status === "survived" || test.status === "blocked"
    ).length
    const remaining = tests.length - terminal
    if (progress.active !== tests.length) errors.push("campaign.progress.active does not match tests length")
    if (progress.terminal !== terminal) errors.push("campaign.progress.terminal does not match terminal tests")
    if (progress.remaining !== remaining) errors.push("campaign.progress.remaining does not match remaining tests")
    if (typeof progress.nextAction !== "string" || progress.nextAction.length === 0) {
      errors.push("campaign.progress.nextAction must be a non-empty string")
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

const counts = Object.fromEntries(
  [...testStatuses].map((status) => [status, tests.filter((test) => test.status === status).length])
)

console.log(JSON.stringify({ tests: tests.length, counts }, null, 2))
