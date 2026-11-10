#!/usr/bin/env node
import { realpathSync, existsSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

// Resolve the actual checkout launcher, including invocation through a PATH symlink.
const ownFile = realpathSync(fileURLToPath(import.meta.url))
// Bun reads this switch at startup. Re-exec the small launcher before any
// application dependency can create the default runtime transpiler cache.
if (process.versions.bun && process.env.BUN_RUNTIME_TRANSPILER_CACHE_PATH !== '0') {
  const child = spawnSync(process.execPath, [ownFile, ...process.argv.slice(2)], {
    env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
    stdio: 'inherit',
  })
  process.exit(child.status ?? 1)
}
const root = resolve(dirname(ownFile), '../../..')
if (root.split(sep).includes('node_modules')) {
  const message =
    'Copied npm installations are unsupported. Link the launcher in the editable source checkout instead.'
  if (process.argv.includes('--json'))
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        command: process.argv[2] ?? 'unknown',
        ok: false,
        exitCode: 2,
        checkout: root,
        selection: { profiles: [], skills: [], targets: [] },
        entries: [],
        diagnostics: [{ code: 'SOURCE_INVALID', severity: 'error', message }],
      }),
    )
  else console.error('SOURCE_INVALID: ' + message)
  process.exit(2)
}
const built = resolve(root, 'packages/lab-skills/dist/cli.js')
if (!existsSync(built)) {
  const result = {
    schemaVersion: 1,
    command: process.argv[2] ?? 'unknown',
    ok: false,
    exitCode: 1,
    checkout: root,
    selection: { profiles: [], skills: [], targets: [] },
    entries: [],
    diagnostics: [
      {
        code: 'BUILD_MISSING',
        severity: 'error',
        message: 'Build this owning checkout explicitly: npm ci --ignore-scripts && npm run build',
      },
    ],
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else console.error('BUILD_MISSING: ' + result.diagnostics[0].message + ' [' + root + ']')
  process.exitCode = 1
} else {
  const { main } = await import(pathToFileURL(built).href)
  await main(root, process.argv.slice(2))
}
