#!/usr/bin/env node
// Check whether the tests catch a regression Stryker cannot generate, without
// touching the user's files. Copies the project into a temporary directory
// inside it (so node_modules, including hoisted monorepo ones, still resolve),
// runs the tests there unchanged, applies one literal find/replace in one file,
// runs the tests again, and deletes the copy.
//
// Usage:
//   node try-regression.mjs [--timeout ms] --file src/rate-limit.ts \
//     --find "Math.max(now, last)" --replace "now" \
//     -- npx vitest run
//
// Exit code: 0 when the tests fail only with the regression (CAUGHT), 1 when
// they still pass (MISSED), 2 for usage or setup errors, including tests that
// already fail in the unmodified copy.

import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"

const usage =
  "Usage: try-regression.mjs [--timeout ms] --file <path> --find <text> --replace <text> -- <test command...>"
const tempParent = ".try-regression-tmp"
// Only these root-level entries are skipped; nested folders with the same names are copied.
// node_modules stays reachable because the copy lives inside the project.
const skippedAtRoot = new Set(["node_modules", ".git", "reports", ".stryker-tmp", tempParent])

class SetupError extends Error {}

const parse = (args) => {
  const separator = args.indexOf("--")
  if (separator === -1 || separator === args.length - 1) throw new SetupError(usage)
  const options = new Map()
  for (let index = 0; index < separator; index += 2) {
    if (!args[index].startsWith("--") || index + 1 >= separator) throw new SetupError(usage)
    options.set(args[index], args[index + 1])
  }
  const file = options.get("--file")
  const find = options.get("--find")
  const replace = options.get("--replace")
  if (!file || find === undefined || replace === undefined) throw new SetupError(usage)
  const timeout = Number(options.get("--timeout") ?? 300_000)
  if (!Number.isInteger(timeout) || timeout < 1) throw new SetupError("--timeout must be a positive integer of milliseconds")
  return { file, find, replace, timeout, command: args.slice(separator + 1) }
}

const runTests = (command, cwd, timeout) => {
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: "utf8",
    timeout,
    shell: process.platform === "win32",
  })
  if (result.error) throw new SetupError(`Could not run ${command.join(" ")}: ${result.error.message}`)
  const tail = `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-15).join("\n")
  return { status: result.status, tail }
}

const main = () => {
  const { file, find, replace, timeout, command } = parse(process.argv.slice(2))
  const root = process.cwd()
  const source = resolve(root, file)
  const inside = relative(root, source)
  if (!inside || inside.startsWith("..") || isAbsolute(inside) || !existsSync(source)) {
    throw new SetupError(`${file} must be an existing file inside ${root}`)
  }
  const original = readFileSync(source, "utf8")
  const occurrences = original.split(find).length - 1
  if (occurrences !== 1) throw new SetupError(`--find must match exactly once in ${file}; it matched ${occurrences} times`)

  mkdirSync(join(root, tempParent), { recursive: true })
  const copy = mkdtempSync(join(root, tempParent, "run-"))
  try {
    // Copy entry by entry: Node refuses to copy a directory into its own subdirectory.
    for (const entry of readdirSync(root)) {
      if (!skippedAtRoot.has(entry)) cpSync(join(root, entry), join(copy, entry), { recursive: true, verbatimSymlinks: true })
    }

    const clean = runTests(command, copy, timeout)
    if (clean.status !== 0) {
      throw new SetupError(
        `The tests fail in the unmodified copy (exit ${clean.status}), so the result would mean nothing. ` +
          `Check the command, or whether tests depend on files outside ${root}.\n${clean.tail}`,
      )
    }

    // A replacer function keeps `$&`, `$$` and similar patterns literal.
    writeFileSync(join(copy, inside), original.replace(find, () => replace))
    const mutated = runTests(command, copy, timeout)
    console.log(mutated.tail)
    if (mutated.status === 0) {
      console.log(`\nMISSED: tests still pass with the regression in ${file}`)
      return 1
    }
    console.log(`\nCAUGHT: tests fail (exit ${mutated.status}) only with the regression in ${file}`)
    return 0
  } finally {
    rmSync(copy, { recursive: true, force: true })
    try {
      rmdirSync(join(root, tempParent)) // removes the parent only when empty
    } catch {}
    if (readFileSync(source, "utf8") !== original) {
      console.error(`${file} changed in the checkout during the check`)
      process.exitCode = 2
    }
  }
}

try {
  const code = main()
  if (process.exitCode === undefined) process.exitCode = code
} catch (error) {
  console.error(error instanceof SetupError ? error.message : `Setup failed: ${error.message}`)
  process.exitCode = 2
}
