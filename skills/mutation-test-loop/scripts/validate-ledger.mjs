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

const ledger = JSON.parse(await readFile(ledgerPath, "utf8"))
const errors = []

if (ledger.schemaVersion !== 1) errors.push("schemaVersion must be 1")
if (typeof ledger.campaign !== "object" || ledger.campaign === null) {
  errors.push("campaign must be an object")
}
if (!Array.isArray(ledger.tests)) errors.push("tests must be an array")

const tests = Array.isArray(ledger.tests) ? ledger.tests : []
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

  for (const [attemptIndex, attempt] of (test.attempts ?? []).entries()) {
    const attemptLabel = `${label}.attempts[${attemptIndex}]`
    if (!attemptStatuses.has(attempt.status)) errors.push(`${attemptLabel}.status is invalid`)

    if (attempt.status === "killed" || attempt.status === "survived") {
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

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

const counts = Object.fromEntries(
  [...testStatuses].map((status) => [status, tests.filter((test) => test.status === status).length])
)

console.log(JSON.stringify({ tests: tests.length, counts }, null, 2))
