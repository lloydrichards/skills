// Opt-in integration check: real pinned upstream downloads; temporary homes only.
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const launcher = join(root, 'packages/lab-skills/bin/lab-skills.mjs')
const base = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'lab-skills-real-'))
const results = []
try {
  for (const runtime of process.argv.slice(2).length ? process.argv.slice(2) : ['node', 'bun']) {
    const home = join(base, runtime + '-home')
    const args = [
      '--home',
      home,
      '--profile',
      'default',
      '--profile',
      'effect',
      '--target',
      'agents',
      '--json',
    ]
    const run = async (command) => {
      const { stdout, stderr } = await exec(runtime, [launcher, command, ...args], {
        cwd: base,
        env: {
          ...process.env,
          HOME: join(base, 'invoking-user'),
          LAB_SKILLS_CONFIG: '',
          XDG_CONFIG_HOME: join(base, 'config'),
        },
        maxBuffer: 8 * 1024 * 1024,
      })
      assert.equal(stderr, '')
      return JSON.parse(stdout)
    }
    const plan = await run('plan')
    assert.equal(plan.exitCode, 0)
    assert.equal(plan.entries.length, 8)
    await assert.rejects(fs.stat(home), { code: 'ENOENT' })
    const applied = await run('apply')
    assert.equal(applied.entries.filter((e) => e.status === 'applied').length, 8)
    const stateFile = join(home, '.local/state/lab-skills/state.json'),
      state = await fs.readFile(stateFile, 'utf8')
    const repeat = await run('apply')
    assert.ok(repeat.entries.every((e) => e.status === 'current'))
    assert.equal(await fs.readFile(stateFile, 'utf8'), state)
    const status = await run('status')
    assert.ok(status.entries.every((e) => e.status === 'current'))
    const owned = JSON.parse(state)
    results.push({
      runtime,
      passed: true,
      selection: ['default', 'effect'],
      installations: 8,
      files: Object.values(owned.installations).reduce(
        (n, e) => n + Object.keys(e.tree.files).length,
        0,
      ),
      upstream: status.entries.filter((e) => e.source?.kind === 'upstream').map((e) => e.source),
      network: 'Real HTTPS codeload download during apply; no archive-dir or HTTP mock',
      repeat: 'all current; ownership state unchanged',
    })
  }
  console.log(JSON.stringify({ schemaVersion: 1, results }, null, 2))
} finally {
  await fs.rm(base, { recursive: true, force: true })
}
