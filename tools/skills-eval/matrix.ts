#!/usr/bin/env bun

import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

type EvalCase = { id: number; name: string; fixture: string; harness: object }
type EvalFile = { skill_name: string; evals: unknown[] }
type RunResult = {
  evaluation: string
  runRoot: string
  artifactsKept: boolean
  checks: Record<string, boolean>
  changes: string[]
  agentErrors: string[]
  pi: { stderr: string; exitCode: number }
  test: { stderr: string; exitCode: number }
  assistantText: string
}

type MatrixCell = {
  skill: string
  evaluation: string
  model: string
  passed: boolean
  status: "PASS" | "FAIL" | "DRY RUN"
  durationMs: number
  result?: RunResult
  error?: string
}

type SkippedEval = { skill: string; id: number | string; reason: string }

const root = resolve(import.meta.dir, "../..")
const defaultModels = ["openai-codex/gpt-5.5", "openai-codex/gpt-5.6-terra", "openai-codex/gpt-5.6-sol"]

const hasFlag = (name: string) => Bun.argv.includes(name)
const option = (name: string) => {
  const index = Bun.argv.indexOf(name)
  return index === -1 ? undefined : Bun.argv[index + 1]
}

const usage = () => {
  console.log("Usage: bun tools/skills-eval/matrix.ts [--skill <name>] [--eval <name|id>] [--models <model,...>] [--json] [--dry-run] [--keep-run] [--allow-host-tools|--yolo]")
}

const modelLabel = (model: string) => model.split("/").at(-1) ?? model
const normalizeModel = (model: string) => model.includes("/") ? model : `openai-codex/${model}`
const isHarnessEval = (value: unknown): value is EvalCase => {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<EvalCase>
  return typeof item.id === "number" && typeof item.name === "string" && typeof item.fixture === "string" && Boolean(item.harness)
}

const markdownTable = (cells: MatrixCell[], models: string[]) => {
  const modelNames = models.map(modelLabel)
  const cases = [...new Map(cells.map((cell) => [`${cell.skill}/${cell.evaluation}`, cell])).values()]
  const lines = [
    `| skill/eval | ${modelNames.join(" | ")} |`,
    `| --- | ${modelNames.map(() => "---").join(" | ")} |`
  ]
  for (const entry of cases) {
    const row = modelNames.map((label) => {
      const cell = cells.find((candidate) => candidate.skill === entry.skill && candidate.evaluation === entry.evaluation && modelLabel(candidate.model) === label)
      if (!cell) return "—"
      return cell.status
    })
    lines.push(`| ${entry.skill}/${entry.evaluation} | ${row.join(" | ")} |`)
  }
  return lines.join("\n")
}

const describeFailure = (cell: MatrixCell) => {
  if (cell.error) return cell.error
  if (!cell.result) return "no result returned"
  const failed = Object.entries(cell.result.checks).filter(([, passed]) => !passed).map(([name]) => name)
  return failed.length ? failed.join(", ") : "runner exited unsuccessfully"
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    usage()
    return
  }

  const requestedSkill = option("--skill")
  const requestedEval = option("--eval")
  const configuredModels = option("--models")
  const models = configuredModels
    ? configuredModels.split(",").map((model) => model.trim()).filter(Boolean).map(normalizeModel)
    : defaultModels
  if (!models.length) throw new Error("Specify at least one model")

  const skillDirectories = requestedSkill ? [requestedSkill] : (await Array.fromAsync(new Bun.Glob("skills/*/evals/evals.json").scan({ cwd: root })))
    .map((path) => path.split("/")[1])
  const cases: Array<{ skill: string; evaluation: EvalCase }> = []
  const skipped: SkippedEval[] = []
  for (const skill of skillDirectories) {
    const file = JSON.parse(await readFile(join(root, "skills", skill, "evals", "evals.json"), "utf8")) as EvalFile
    for (const evaluation of file.evals) {
      const id = typeof evaluation === "object" && evaluation !== null && "id" in evaluation ? (evaluation as { id?: unknown }).id : "unknown"
      const name = typeof evaluation === "object" && evaluation !== null && "name" in evaluation ? (evaluation as { name?: unknown }).name : undefined
      if (requestedEval && name !== requestedEval && String(id) !== requestedEval) continue
      if (isHarnessEval(evaluation)) {
        cases.push({ skill, evaluation })
      } else {
        skipped.push({ skill, id: typeof id === "number" || typeof id === "string" ? id : "unknown", reason: "missing deterministic fixture/harness contract" })
      }
    }
  }
  if (!cases.length && !skipped.length) throw new Error("No evals matched the requested filters")

  const total = cases.length * models.length
  const dryRun = hasFlag("--dry-run")
  const cells: MatrixCell[] = []
  let index = 0
  for (const item of cases) {
    for (const model of models) {
      index += 1
      if (!hasFlag("--json")) console.log(`Running ${index}/${total}: ${item.skill}/${item.evaluation.name} with ${modelLabel(model)}`)
      const command = ["bun", join(root, "tools/skills-eval/run.ts"), "--skill", item.skill, "--eval", item.evaluation.name, "--model", model, "--json"]
      for (const flag of ["--dry-run", "--keep-run", "--allow-host-tools", "--yolo"]) if (hasFlag(flag)) command.push(flag)
      const started = performance.now()
      const child = Bun.spawn(command, { cwd: root, stdout: "pipe", stderr: "pipe" })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited
      ])
      const durationMs = Math.round(performance.now() - started)
      try {
        const result = JSON.parse(stdout) as RunResult
        const passed = !dryRun && exitCode === 0 && Object.values(result.checks).every(Boolean)
        cells.push({ skill: item.skill, evaluation: item.evaluation.name, model, passed, status: dryRun ? "DRY RUN" : passed ? "PASS" : "FAIL", durationMs, result, error: stderr.trim() || undefined })
      } catch {
        cells.push({ skill: item.skill, evaluation: item.evaluation.name, model, passed: false, status: "FAIL", durationMs, error: stderr.trim() || stdout.trim() || `runner exited ${exitCode}` })
      }
    }
  }

  const passed = dryRun || cells.every((cell) => cell.passed)
  const result = { models, cells, skipped, passed }
  if (hasFlag("--json")) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log("\n" + markdownTable(cells, models))
    const failures = dryRun ? [] : cells.filter((cell) => !cell.passed)
    if (failures.length) {
      console.log("\nFailures:")
      for (const failure of failures) console.log(`- ${failure.skill}/${failure.evaluation} · ${modelLabel(failure.model)}: ${describeFailure(failure)}`)
    }
    if (skipped.length) {
      console.log("\nSkipped (not harness-ready):")
      for (const item of skipped) console.log(`- ${item.skill}/${item.id}: ${item.reason}`)
    }
  }
  if (!passed) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
