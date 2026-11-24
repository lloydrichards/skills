#!/usr/bin/env node
// Check whether the tests catch a regression Stryker cannot generate, without
// touching the user's checkout. Copies the project (minus node_modules, .git
// and reports) to a temporary directory, links node_modules, applies one
// literal find/replace in one file, runs the test command there, and deletes
// the copy.
//
// Usage:
//   node try-regression.mjs --file src/rate-limit.ts \
//     --find "Math.max(now, last)" --replace "now" \
//     -- npx vitest run
//
// Exit code: 0 when the tests fail (regression caught), 1 when they pass
// (regression missed), 2 for usage or setup errors.

import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"

const usage = "Usage: try-regression.mjs --file <path> --find <text> --replace <text> -- <test command...>"
const fail = (message) => {
  console.error(message)
  process.exit(2)
}

const args = process.argv.slice(2)
const separator = args.indexOf("--")
if (separator === -1 || separator === args.length - 1) fail(usage)
const command = args.slice(separator + 1)
const options = new Map()
for (let index = 0; index < separator; index += 2) {
  if (!args[index].startsWith("--") || index + 1 >= separator) fail(usage)
  options.set(args[index], args[index + 1])
}
const file = options.get("--file")
const find = options.get("--find")
const replace = options.get("--replace")
if (!file || find === undefined || replace === undefined) fail(usage)

const root = process.cwd()
const source = resolve(root, file)
if (!source.startsWith(`${root}/`) || !existsSync(source)) fail(`${file} must be an existing file inside ${root}`)
const original = readFileSync(source, "utf8")
const occurrences = original.split(find).length - 1
if (occurrences !== 1) fail(`--find must match exactly once in ${file}; it matched ${occurrences} times`)

const skip = new Set(["node_modules", ".git", "reports", ".stryker-tmp"])
const copy = mkdtempSync(join(tmpdir(), "try-regression-"))
try {
  cpSync(root, copy, { recursive: true, filter: (path) => path === root || !skip.has(basename(path)) })
  if (existsSync(join(root, "node_modules"))) symlinkSync(join(root, "node_modules"), join(copy, "node_modules"), "dir")
  writeFileSync(join(copy, file), original.replace(find, replace))
  const result = spawnSync(command[0], command.slice(1), { cwd: copy, encoding: "utf8" })
  if (result.error) fail(`Could not run ${command.join(" ")}: ${result.error.message}`)
  const output = `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-15).join("\n")
  console.log(output)
  if (result.status === 0) {
    console.log(`\nMISSED: tests still pass with the regression in ${file}`)
    process.exitCode = 1
  } else {
    console.log(`\nCAUGHT: tests fail (exit ${result.status}) with the regression in ${file}`)
  }
} finally {
  rmSync(copy, { recursive: true, force: true })
}
if (readFileSync(source, "utf8") !== original) fail(`${file} changed in the checkout during the check`)
