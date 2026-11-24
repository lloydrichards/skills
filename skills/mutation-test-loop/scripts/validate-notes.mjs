#!/usr/bin/env node
// Validate mutation audit notes (schemaVersion 2). Checks structure and
// internal consistency only; it cannot prove the recorded evidence is true.

import { readFileSync } from "node:fs"

const path = process.argv[2]
if (!path || process.argv.length > 3) {
  console.error("Usage: validate-notes.mjs <audit-notes.json>")
  process.exit(2)
}

let notes
try {
  notes = JSON.parse(readFileSync(path, "utf8"))
} catch (error) {
  console.error(`Cannot read ${path}: ${error.message}`)
  process.exit(1)
}

const errors = []
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value)
const text = (value) => typeof value === "string" && value.trim().length > 0
const oneOf = (value, allowed, where) => {
  if (!allowed.includes(value)) errors.push(`${where} must be one of ${allowed.join(", ")}`)
}

if (!isObject(notes)) {
  console.error("Audit notes must be a JSON object")
  process.exit(1)
}
if (notes.schemaVersion !== 2) errors.push("schemaVersion must be 2")

const campaign = isObject(notes.campaign) ? notes.campaign : (errors.push("campaign must be an object"), {})
const clusters = Array.isArray(notes.clusters) ? notes.clusters : (errors.push("clusters must be an array"), [])
const tests = notes.tests === undefined ? [] : Array.isArray(notes.tests) ? notes.tests : (errors.push("tests must be an array"), [])

oneOf(campaign.mode, ["audit-only", "audit-and-rewrite"], "campaign.mode")
oneOf(campaign.status, ["in_progress", "complete", "blocked"], "campaign.status")
oneOf(campaign.engine, ["stryker-vitest", "stryker-command", "other", "manual"], "campaign.engine")
if (campaign.engine === "other" && !text(campaign.engineDetail)) errors.push("campaign.engineDetail must name the engine")
if (!isObject(campaign.scope) || !Array.isArray(campaign.scope.mutate) || campaign.scope.mutate.length === 0) {
  errors.push("campaign.scope.mutate must list at least one production path")
}

const baseline = isObject(campaign.baseline) ? campaign.baseline : null
if (!baseline) errors.push("campaign.baseline must be an object")
else {
  if (!text(baseline.command)) errors.push("campaign.baseline.command is required")
  if (baseline.exitCode !== 0) errors.push("campaign.baseline.exitCode must be 0: do not mutate a failing suite")
  if (!Number.isInteger(baseline.active) || baseline.active < 1) errors.push("campaign.baseline.active must be a positive integer")
}

const clusterIds = new Set()
clusters.forEach((cluster, index) => {
  const where = `clusters[${index}]`
  if (!isObject(cluster)) return errors.push(`${where} must be an object`)
  if (!text(cluster.id)) errors.push(`${where}.id is required`)
  else if (clusterIds.has(cluster.id)) errors.push(`${where}.id duplicates ${cluster.id}`)
  else clusterIds.add(cluster.id)
  if (!Array.isArray(cluster.mutants) || cluster.mutants.length === 0) errors.push(`${where}.mutants must list mutant keys`)
  else if (cluster.mutants.some((key) => !text(key) || /^\d+$/.test(key))) {
    errors.push(`${where}.mutants must use report keys, not bare Stryker IDs`)
  }
  oneOf(cluster.verdict, ["gap", "equivalent", "noise", "out_of_scope", "false_survivor"], `${where}.verdict`)
  if (!text(cluster.reason)) errors.push(`${where}.reason is required`)
  oneOf(cluster.resolution, ["open", "killed", "accepted", "handed_off"], `${where}.resolution`)
  if (cluster.resolution === "killed") {
    if (!["gap", "false_survivor"].includes(cluster.verdict)) errors.push(`${where} can only be killed when it is a gap or false_survivor`)
    if (!text(cluster.evidence)) errors.push(`${where}.evidence must cite the re-run that killed it`)
    if (campaign.mode === "audit-only" && cluster.verdict === "gap") errors.push(`${where} cannot be killed in audit-only mode`)
  }
  if (cluster.resolution === "accepted" && cluster.verdict === "gap") errors.push(`${where} is a gap and cannot be accepted; leave it open or hand it off`)
  if (cluster.resolution === "handed_off" && !text(cluster.evidence)) errors.push(`${where}.evidence must name who it was handed to`)
  if (
    campaign.status === "complete" &&
    campaign.mode === "audit-and-rewrite" &&
    cluster.verdict === "gap" &&
    cluster.resolution === "open" &&
    !text(cluster.openReason)
  ) {
    errors.push(`${where} is an open gap in a complete rewrite campaign and needs openReason`)
  }
})

tests.forEach((entry, index) => {
  const where = `tests[${index}]`
  if (!isObject(entry)) return errors.push(`${where} must be an object`)
  if (!text(entry.test)) errors.push(`${where}.test is required`)
  oneOf(entry.signal, ["never_fails", "no_unique_kills", "blind_spot"], `${where}.signal`)
  oneOf(entry.action, ["rewrite", "rename", "handoff", "none"], `${where}.action`)
  oneOf(entry.resolution, ["open", "resolved", "handed_off"], `${where}.resolution`)
  if (!text(entry.note)) errors.push(`${where}.note is required`)
  if (entry.signal === "blind_spot" && !text(entry.source)) {
    errors.push(`${where}.source must name the production file:line of the blind spot`)
  }
  if (entry.signal === "blind_spot" && !text(entry.evidence)) {
    errors.push(`${where}.evidence must cite the try-regression result for the blind spot`)
  }
  if (campaign.mode === "audit-only" && entry.resolution === "resolved" && entry.action !== "none") {
    errors.push(`${where} cannot be resolved by a ${entry.action} in audit-only mode`)
  }
})

if (campaign.status === "blocked" && !text(campaign.blockedReason)) errors.push("campaign.blockedReason is required when blocked")
if (campaign.status === "complete") {
  if (!isObject(campaign.finalSuiteRun) || campaign.finalSuiteRun.exitCode !== 0) {
    errors.push("A complete campaign needs a passing campaign.finalSuiteRun")
  }
  if (campaign.worktreeOnlyIntendedChanges !== true) errors.push("A complete campaign needs worktreeOnlyIntendedChanges: true")
  if (!text(campaign.worktreeNote)) errors.push("A complete campaign needs campaign.worktreeNote listing every worktree difference")
  if (campaign.engine !== "manual" && !text(campaign.reports?.before)) errors.push("A complete campaign needs campaign.reports.before")
  if (campaign.mode === "audit-and-rewrite" && campaign.engine !== "manual" && !text(campaign.reports?.after)) {
    errors.push("A complete rewrite campaign needs campaign.reports.after")
  }
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
const counts = {}
for (const cluster of clusters) counts[cluster.verdict] = (counts[cluster.verdict] ?? 0) + 1
console.log(
  `Valid ${campaign.status} ${campaign.mode} notes: ${clusters.length} clusters (${Object.entries(counts)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ") || "none"}), ${tests.length} test signals`,
)
