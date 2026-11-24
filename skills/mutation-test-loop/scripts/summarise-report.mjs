#!/usr/bin/env node
// Turn a StrykerJS mutation-testing-report-schema JSON into a per-test-file
// triage view: survivor clusters, suspect survivors, tests that never fail,
// tests without unique kills, and uncovered line ranges.
//
// Usage:
//   node summarise-report.mjs <mutation.json> [--json out.json] [--md out.md]
//                             [--max N] [--compare before.json] [--line file:line]
//
// Without --md the Markdown view is written to stdout. --compare adds a section
// comparing survivors with an earlier report. --line lists every mutant Stryker
// generated on the given production lines (comma-separated), with status and
// killing tests, and prints only that section. With --md, stdout gets a
// one-line summary instead of the full view.

import { readFileSync, writeFileSync } from "node:fs"

const usage =
  "Usage: summarise-report.mjs <mutation.json> [--json out.json] [--md out.md] [--max N] [--compare before.json] [--line file:line]"
const fail = (message) => {
  console.error(message)
  process.exit(2)
}

const args = process.argv.slice(2)
const options = new Map()
const positional = []
for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg.startsWith("--")) {
    const value = args[index + 1]
    if (value === undefined || value.startsWith("--")) fail(`${arg} needs a value\n${usage}`)
    options.set(arg, value)
    index++
  } else positional.push(arg)
}
if (positional.length !== 1) fail(usage)
const max = Number(options.get("--max") ?? 20)
if (!Number.isInteger(max) || max < 1) fail("--max must be a positive integer")

const load = (path) => {
  let report
  try {
    report = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    fail(`Cannot read ${path}: ${error.message}`)
  }
  if (!report || typeof report.files !== "object" || report.files === null) {
    fail(`${path} is not a Stryker mutation report: missing files`)
  }
  return report
}

// Stryker renumbers test and mutant IDs on every run, so compare by content.
const mutantKey = (file, m) => {
  const { start, end } = m.location
  return `${file}:${start.line}:${start.column}-${end.line}:${end.column} ${m.mutatorName} -> ${m.replacement ?? "?"}`
}

const snippet = (source, m) => {
  const lines = source.split("\n")
  const { start, end } = m.location
  const original = lines[start.line - 1] ?? ""
  if (start.line !== end.line || m.replacement === undefined) {
    return { original: original.trim(), mutated: `${m.mutatorName}: ${(m.replacement ?? "?").slice(0, 120)}` }
  }
  const mutated = original.slice(0, start.column - 1) + m.replacement + original.slice(end.column - 1)
  return { original: original.trim(), mutated: mutated.trim() }
}

const analyse = (report) => {
  const tests = new Map()
  for (const [file, testFile] of Object.entries(report.testFiles ?? {})) {
    for (const t of testFile.tests ?? []) {
      tests.set(t.id, { file, name: t.name, line: t.location?.start?.line ?? null, kills: 0, uniqueKills: 0, coveredSurvivors: 0 })
    }
  }
  const testLabel = (id) => {
    const t = tests.get(id)
    return t ? `${t.file} › ${t.name}` : `unknown test ${id}`
  }

  const mutants = []
  let unlocated = 0
  for (const [file, entry] of Object.entries(report.files)) {
    for (const m of entry.mutants ?? []) {
      if (!m.location?.start || !m.location?.end) {
        unlocated++
        continue
      }
      const killedBy = m.killedBy ?? []
      const coveredBy = m.coveredBy ?? []
      // Known Vitest-runner defects can report a mutant as Survived when no
      // test actually ran against it. Treat those as unconfirmed.
      const suspect = m.status === "Survived" && (coveredBy.length === 0 || m.testsCompleted === 0)
      mutants.push({
        key: mutantKey(file, m),
        file,
        line: m.location.start.line,
        mutator: m.mutatorName,
        status: suspect ? "SuspectSurvived" : m.status,
        static: Boolean(m.static),
        killedBy,
        coveredBy,
        ...snippet(entry.source ?? "", m),
      })
    }
  }

  for (const m of mutants) {
    for (const id of m.killedBy) {
      const t = tests.get(id)
      if (!t) continue
      t.kills++
      if (m.killedBy.length === 1) t.uniqueKills++
    }
    if (m.status === "Survived") for (const id of m.coveredBy) if (tests.has(id)) tests.get(id).coveredSurvivors++
  }

  const counts = {}
  for (const m of mutants) counts[m.status] = (counts[m.status] ?? 0) + 1
  const detected = (counts.Killed ?? 0) + (counts.Timeout ?? 0)
  const scored = detected + (counts.Survived ?? 0) + (counts.SuspectSurvived ?? 0) + (counts.NoCoverage ?? 0)

  // One cluster per production line: mutants there almost always point at the
  // same missing observation, so the model judges them together.
  const clusters = new Map()
  for (const m of mutants.filter((x) => x.status === "Survived")) {
    const id = `${m.file}:${m.line}`
    if (!clusters.has(id)) clusters.set(id, { id, file: m.file, line: m.line, original: m.original, tests: new Set(), mutants: [] })
    const cluster = clusters.get(id)
    cluster.mutants.push({ key: m.key, mutator: m.mutator, mutated: m.mutated })
    for (const t of m.coveredBy) cluster.tests.add(testLabel(t))
  }

  const noCoverage = new Map()
  for (const m of mutants.filter((x) => x.status === "NoCoverage")) {
    if (!noCoverage.has(m.file)) noCoverage.set(m.file, new Set())
    noCoverage.get(m.file).add(m.line)
  }

  const lineFilter = options.has("--line") ? new Set(options.get("--line").split(",")) : null
  const mutantsOnLine = lineFilter
    ? mutants
        .filter((m) => lineFilter.has(`${m.file}:${m.line}`))
        .map((m) => ({ line: `${m.file}:${m.line}`, key: m.key, status: m.status, mutated: m.mutated, killedBy: m.killedBy.map(testLabel) }))
    : null

  const bail = report.config?.disableBail !== true
  const perTest = tests.size > 0
  return {
    disableBail: !bail,
    perTestData: perTest,
    unlocatedMutants: unlocated,
    mutantsOnLine,
    counts,
    mutationScore: scored ? Number(((100 * detected) / scored).toFixed(2)) : null,
    survivorClusters: [...clusters.values()]
      .map((c) => ({ ...c, tests: [...c.tests].sort() }))
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    suspectSurvivors: mutants
      .filter((m) => m.status === "SuspectSurvived")
      .map(({ key, original, mutated }) => ({ key, original, mutated })),
    testsThatNeverFail: perTest
      ? [...tests.values()].filter((t) => t.kills === 0).map(({ file, name, line }) => ({ file, name, line }))
      : null,
    testsWithoutUniqueKills: bail || !perTest
      ? null
      : [...tests.values()].filter((t) => t.kills > 0 && t.uniqueKills === 0).map(({ file, name, kills }) => ({ file, name, kills })),
    tests: [...tests.values()],
    noCoverage: [...noCoverage.entries()].map(([file, lines]) => ({ file, lines: [...lines].sort((a, b) => a - b) })),
    survivorKeys: mutants.filter((m) => m.status === "Survived").map((m) => m.key),
    suspectKeys: new Set(mutants.filter((m) => m.status === "SuspectSurvived").map((m) => m.key)),
    detectedKeys: new Set(mutants.filter((m) => m.status === "Killed" || m.status === "Timeout").map((m) => m.key)),
  }
}

const lineFilter = (value) => value.split(",")
const current = analyse(load(positional[0]))
let comparison = null
if (options.has("--compare")) {
  const before = analyse(load(options.get("--compare")))
  const now = new Set(current.survivorKeys)
  comparison = {
    nowKilled: before.survivorKeys.filter((k) => current.detectedKeys.has(k)),
    stillSurviving: before.survivorKeys.filter((k) => now.has(k)),
    nowSuspect: before.survivorKeys.filter((k) => current.suspectKeys.has(k)),
    newSurvivors: current.survivorKeys.filter((k) => !before.survivorKeys.includes(k)),
    notInCurrentRun: before.survivorKeys.filter(
      (k) => !now.has(k) && !current.detectedKeys.has(k) && !current.suspectKeys.has(k),
    ),
  }
}

const { survivorKeys, detectedKeys, suspectKeys, ...summary } = current
const output = { ...summary, comparison }
if (options.has("--json")) writeFileSync(options.get("--json"), `${JSON.stringify(output, null, 2)}\n`)

const lines = []
const list = (items, render) => {
  for (const item of items.slice(0, max)) lines.push(render(item))
  if (items.length > max) lines.push(`- … ${items.length - max} more (see --json output)`)
}
lines.push("# Mutation triage view", "")
if (output.unlocatedMutants) lines.push(`> Skipped ${output.unlocatedMutants} mutants without a location.`, "")
lines.push(`Score: ${output.mutationScore ?? "n/a"}% · ${Object.entries(output.counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`)
if (!output.perTestData) {
  lines.push("", "> This report has no per-test data (for example Stryker's command runner). Test-level sections are omitted; judge tests by hand.")
} else if (!output.disableBail) {
  lines.push("", "> Bail was on: only the first failing test is credited per mutant. Per-test kill counts are partial; rerun with disableBail for test-level judgements.")
}
lines.push("", `## Survivor clusters (${output.survivorClusters.length})`, "")
list(output.survivorClusters, (c) =>
  [
    `### ${c.id}`,
    `\`${c.original.slice(0, 140)}\``,
    ...c.mutants.map((m) => `- ${m.mutator}: \`${m.mutated.slice(0, 140)}\`\n  - key: \`${m.key}\``),
    `- Covering tests: ${c.tests.length ? c.tests.join("; ") : "none"}`,
    "",
  ].join("\n"),
)
if (output.suspectSurvivors.length) {
  lines.push("", `## Suspect survivors (${output.suspectSurvivors.length}): no test ran against them; confirm before acting`, "")
  list(output.suspectSurvivors, (m) => `- ${m.key}`)
}
if (output.testsThatNeverFail) {
  lines.push("", `## Tests that never fail (${output.testsThatNeverFail.length})`, "")
  lines.push("> Zero here does not rule out blind spots: Stryker cannot generate every regression. Run the claim check.", "")
  list(output.testsThatNeverFail, (t) => `- ${t.file} › ${t.name} (line ${t.line ?? "?"})`)
}
if (output.testsWithoutUniqueKills) {
  lines.push("", `## Tests without unique kills (${output.testsWithoutUniqueKills.length}): overlap candidates, not deletions`, "")
  list(output.testsWithoutUniqueKills, (t) => `- ${t.file} › ${t.name} (${t.kills} shared kills)`)
}
lines.push("", `## Uncovered lines (${output.noCoverage.length} files)`, "")
list(output.noCoverage, (n) => `- ${n.file}: ${n.lines.join(", ")}`)
if (comparison) {
  lines.push("", "## Compared with previous report", "")
  lines.push(`- Now killed: ${comparison.nowKilled.length}`)
  lines.push(`- Still surviving: ${comparison.stillSurviving.length}`)
  lines.push(`- Now suspect (no test ran against them; confirm): ${comparison.nowSuspect.length}`)
  lines.push(`- New survivors: ${comparison.newSurvivors.length}`)
  lines.push(`- Not in this run (narrowed scope, or code or file names changed): ${comparison.notInCurrentRun.length}`)
  for (const key of comparison.stillSurviving.slice(0, max)) lines.push(`  - still: ${key}`)
  for (const key of comparison.newSurvivors.slice(0, max)) lines.push(`  - new: ${key}`)
}
if (output.mutantsOnLine) {
  const view = []
  for (const line of lineFilter(options.get("--line"))) {
    const onLine = output.mutantsOnLine.filter((m) => m.line === line)
    view.push(`## Mutants on ${line} (${onLine.length})`, "")
    if (!onLine.length) view.push("- none generated")
    for (const m of onLine) {
      view.push(`- [${m.status}] \`${m.mutated.slice(0, 140)}\` killed by: ${m.killedBy.length ? m.killedBy.join("; ") : "none"}`)
    }
    view.push("")
  }
  process.stdout.write(`${view.join("\n")}`)
} else {
  const markdown = `${lines.join("\n")}\n`
  if (options.has("--md")) {
    writeFileSync(options.get("--md"), markdown)
    const compared = comparison
      ? ` · now killed ${comparison.nowKilled.length}, still surviving ${comparison.stillSurviving.length}, new ${comparison.newSurvivors.length}`
      : ""
    console.log(
      `Score ${output.mutationScore ?? "n/a"}% · ${output.survivorClusters.length} survivor clusters · ${output.suspectSurvivors.length} suspect · ${output.testsThatNeverFail?.length ?? "n/a"} never fail${compared} → ${options.get("--md")}`,
    )
  } else process.stdout.write(markdown)
}
