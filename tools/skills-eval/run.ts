#!/usr/bin/env bun

import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "node:path"

type EvalCase = {
  id: number
  name: string
  prompt: string
  fixture: string
  harness: {
    testCommand: string[]
    allowedChangedPaths: string[]
    expectedState: "completed" | "blocked"
    requireSkillRead: boolean
  }
}

type EvalFile = { skill_name: string; evals: EvalCase[] }

const root = resolve(import.meta.dir, "../..")

const option = (name: string): string | undefined => {
  const index = Bun.argv.indexOf(name)
  return index === -1 ? undefined : Bun.argv[index + 1]
}

const hasFlag = (name: string): boolean => Bun.argv.includes(name)

const isHarnessEval = (value: unknown): value is EvalCase => {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<EvalCase>
  return typeof item.id === "number" &&
    typeof item.name === "string" &&
    typeof item.prompt === "string" &&
    typeof item.fixture === "string" &&
    Array.isArray(item.harness?.testCommand) &&
    Array.isArray(item.harness?.allowedChangedPaths) &&
    (item.harness?.expectedState === "completed" || item.harness?.expectedState === "blocked") &&
    typeof item.harness?.requireSkillRead === "boolean"
}

const usage = () => {
  console.log("Usage: bun tools/skills-eval/run.ts --skill <name> --eval <name|id> [--json] [--dry-run] [--keep-run] [--allow-host-tools|--yolo]")
}

const run = async (command: string[], cwd: string, env?: Record<string, string | undefined>) => {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ])
  return { command, stdout, stderr, exitCode }
}

const jsonLines = (text: string): unknown[] => text.split("\n").flatMap((line) => {
  try {
    return line.trim() ? [JSON.parse(line)] : []
  } catch {
    return []
  }
})

const finalText = (events: unknown[]): string => {
  for (const event of [...events].reverse()) {
    if (!event || typeof event !== "object") continue
    const record = event as { type?: string; message?: { role?: string; content?: unknown } }
    if (record.type !== "message_end" || record.message?.role !== "assistant") continue
    const content = record.message.content
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
      return content
        .filter((part): part is { type?: string; text?: string } => Boolean(part) && typeof part === "object")
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("")
    }
  }
  return ""
}

const stateFromText = (text: string): string | undefined => {
  const match = text.match(/EVAL_RESULT:\s*(\{[^\n]+\})/)
  if (!match) return undefined
  try {
    const value = JSON.parse(match[1])
    return typeof value.state === "string" ? value.state : undefined
  } catch {
    return undefined
  }
}

const didReadSkill = (events: unknown[], skillPath: string): boolean => events.some((event) => {
  if (!event || typeof event !== "object") return false
  const record = event as {
    type?: string
    toolName?: string
    args?: { path?: string }
    messages?: Array<{ role?: string; content?: Array<{ type?: string; name?: string; arguments?: { path?: string } }> }>
  }
  const readPath = (path: unknown) => typeof path === "string" && resolve(path) === join(skillPath, "SKILL.md")
  if (record.type === "tool_execution_start" && record.toolName === "read" && readPath(record.args?.path)) return true
  return record.type === "agent_end" && record.messages?.some((message) =>
    message.role === "assistant" && message.content?.some((part) =>
      part.type === "toolCall" && part.name === "read" && readPath(part.arguments?.path)
    )
  )
})

const agentErrors = (events: unknown[]): string[] => events.flatMap((event) => {
  if (!event || typeof event !== "object") return []
  const record = event as { message?: { role?: string; stopReason?: string; errorMessage?: string } }
  if (record.message?.role !== "assistant" || record.message.stopReason !== "error") return []
  return [record.message.errorMessage ?? "Pi ended an assistant turn with stopReason=error"]
})

const changedPaths = async (fixture: string): Promise<string[]> => {
  const result = await run(["git", "diff", "--name-only"], fixture)
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean)
}

const allowed = (path: string, patterns: string[]): boolean => patterns.some((pattern) =>
  path === pattern || path.startsWith(`${pattern}/`)
)

const print = (value: unknown, human: () => string) => {
  console.log(hasFlag("--json") ? JSON.stringify(value, null, 2) : human())
}

const humanResult = (result: {
  evaluation: string
  runRoot: string
  artifactsKept: boolean
  checks: Record<string, boolean>
  changes: string[]
  agentErrors: string[]
  pi: { stderr: string }
  test: { stdout: string; stderr: string }
  assistantText: string
}) => {
  const names: Record<string, string> = {
    piExited: "Pi completed without an agent error",
    testPassed: "fixture test command passed",
    skillRead: "selected skill was read",
    terminalState: "terminal state matched expectation",
    changesAllowed: "changes stayed in allowed paths"
  }
  const passed = Object.values(result.checks).every(Boolean)
  const lines = [
    `Skill eval: ${result.evaluation}`,
    `Result: ${passed ? "PASS" : "FAIL"}`,
    "",
    "Checks:"
  ]
  for (const [check, value] of Object.entries(result.checks)) {
    lines.push(`  ${value ? "PASS" : "FAIL"}  ${names[check] ?? check}`)
  }
  lines.push("", `Changes: ${result.changes.length ? result.changes.join(", ") : "none"}`)
  if (result.assistantText) lines.push(`Agent: ${result.assistantText}`)
  if (result.test.stdout.trim()) lines.push("", "Test output:", result.test.stdout.trim())
  const diagnostics = [...result.agentErrors, result.pi.stderr.trim(), result.test.stderr.trim()].filter(Boolean)
  if (diagnostics.length) lines.push("", "Diagnostics:", ...diagnostics)
  lines.push("", result.artifactsKept
    ? `Artifacts: ${result.runRoot}`
    : "Artifacts: removed after this passing run (use --keep-run to retain them)")
  return lines.join("\n")
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    usage()
    return
  }
  const skillName = option("--skill")
  const selector = option("--eval")
  if (!skillName || !selector) {
    usage()
    process.exitCode = 2
    return
  }

  const skillPath = resolve(root, "skills", skillName)
  const evalPath = join(skillPath, "evals", "evals.json")
  const definition = JSON.parse(await readFile(evalPath, "utf8")) as EvalFile
  if (definition.skill_name !== skillName) throw new Error(`Expected ${evalPath} to name ${skillName}`)
  const evaluation = definition.evals.find((item) => item.name === selector || String(item.id) === selector)
  if (!evaluation) throw new Error(`Unknown eval ${selector} for ${skillName}`)
  if (!isHarnessEval(evaluation)) {
    throw new Error(`Eval ${selector} for ${skillName} is not harness-ready: add name, fixture, and harness fields`)
  }

  const fixtureSource = resolve(skillPath, evaluation.fixture)
  if (relative(skillPath, fixtureSource).startsWith("..") || isAbsolute(evaluation.fixture)) {
    throw new Error(`Fixture must stay inside the skill directory: ${evaluation.fixture}`)
  }
  const runRoot = await mkdir(join(root, ".skills-eval-runs"), { recursive: true }).then(() =>
    mkdtemp(join(root, ".skills-eval-runs", `${skillName}-${evaluation.name}-`)))
  const fixture = join(runRoot, "fixture")
  await cp(fixtureSource, fixture, { recursive: true })
  await mkdir(join(fixture, ".pi"), { recursive: true })
  await writeFile(join(fixture, ".pi", "sandbox.json"), JSON.stringify({
    enabled: true,
    network: { allowedDomains: [], deniedDomains: ["*"] },
    filesystem: { denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"], allowWrite: ["."], denyWrite: [".env", ".env.*", "*.pem", "*.key"] }
  }, null, 2))
  await run(["git", "init", "--quiet"], fixture)
  await run(["git", "add", "."], fixture)
  await run([
    "git", "-c", "user.name=skills-eval", "-c", "user.email=skills-eval@local.invalid",
    "commit", "--quiet", "--no-gpg-sign", "-m", "fixture"
  ], fixture)

  const prompt = [
    `Execute this task in the current fixture repository:`,
    evaluation.prompt,
    `You have been given the ${skillName} skill. Read its SKILL.md before taking action.`,
    `At the end, emit exactly one line: EVAL_RESULT: {"state":"completed"} when the work is complete, or EVAL_RESULT: {"state":"blocked"} when a material user decision prevents safe edits.`
  ].join("\n\n")
  const piCommand = [
    "pi", "--print", "--mode", "json", "--no-session", "--yolo", "--no-context-files",
    "--no-skills", "--skill", skillPath, "--tools", "read,bash,edit,write", prompt
  ]
  if (!hasFlag("--allow-host-tools") && !hasFlag("--yolo")) {
    const piSandbox = "/Users/lloyd/.nvm/versions/node/v24.10.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/sandbox/index.ts"
    piCommand.splice(6, 0, "--extension", piSandbox, "--extension", join(root, "tools/skills-eval/pi-fixture-guard.ts"))
  }
  const model = option("--model") ?? "openai-codex/gpt-5.5"
  piCommand.splice(6, 0, "--model", model)

  if (hasFlag("--dry-run")) {
    const plan = { runRoot, fixture, piCommand, prompt }
    print(plan, () => [
      `Skill eval dry run: ${evaluation.name}`,
      `Fixture: ${fixture}`,
      `Model: ${model}`,
      "",
      "Pi command:",
      piCommand.join(" ")
    ].join("\n"))
    return
  }

  const pi = await run(piCommand, fixture, {
    PI_ALLOW_HOST_TOOLS: "1",
    SKILLS_EVAL_SKILL_PATH: skillPath
  })
  await writeFile(join(runRoot, "pi.jsonl"), pi.stdout)
  await writeFile(join(runRoot, "pi.stderr.log"), pi.stderr)
  const events = jsonLines(pi.stdout)
  const errors = agentErrors(events)
  const test = await run(evaluation.harness.testCommand, fixture)
  const changes = await changedPaths(fixture)
  const assistantText = finalText(events)
  const checks = {
    piExited: pi.exitCode === 0 && errors.length === 0,
    testPassed: test.exitCode === 0,
    skillRead: !evaluation.harness.requireSkillRead || didReadSkill(events, skillPath),
    terminalState: stateFromText(assistantText) === evaluation.harness.expectedState,
    changesAllowed: changes.every((path) => allowed(path, evaluation.harness.allowedChangedPaths))
  }
  const passed = Object.values(checks).every(Boolean)
  const artifactsKept = hasFlag("--keep-run") || !passed
  const result = { evaluation: evaluation.name, runRoot, artifactsKept, checks, changes, agentErrors: errors, pi, test, assistantText }
  await writeFile(join(runRoot, "result.json"), JSON.stringify(result, null, 2))
  print(result, () => humanResult(result))
  if (!passed) process.exitCode = 1

  if (!artifactsKept) await rm(runRoot, { recursive: true, force: true })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
