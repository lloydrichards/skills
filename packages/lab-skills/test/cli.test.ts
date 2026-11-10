import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const launcher = join(checkout, 'packages/lab-skills/bin/lab-skills.mjs')
const io = <A>(f: () => Promise<A>) => Effect.tryPromise(f)
const fixture = Effect.acquireRelease(
  io(() => fs.mkdtemp(join(realpathSync(tmpdir()), 'lab-skills-cli-'))),
  (p) => io(() => fs.rm(p, { recursive: true, force: true })).pipe(Effect.orDie),
)
const child = (
  command: string,
  args: string[],
  cwd: string,
  home: string,
  path = process.env.PATH ?? '',
) =>
  io(
    () =>
      new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const run = spawn(command, args, {
          cwd,
          env: {
            ...process.env,
            HOME: home,
            PATH: path,
            LAB_SKILLS_CONFIG: '',
            XDG_CONFIG_HOME: join(home, '.config'),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = '',
          stderr = ''
        run.stdout.on('data', (data) => (stdout += data))
        run.stderr.on('data', (data) => (stderr += data))
        run.on('error', reject)
        run.on('close', (code) => resolve({ code, stdout, stderr }))
      }),
  )
describe('built executable public boundary', () => {
  it.live(
    'resolves the owning checkout from another cwd through a symlink under the active runtime',
    () =>
      Effect.gen(function* () {
        const base = yield* fixture,
          home = join(base, 'home'),
          bin = join(base, 'bin')
        yield* io(() => fs.mkdir(bin))
        const link = join(bin, 'lab-skills')
        yield* io(() => fs.symlink(launcher, link))
        const output = yield* child(
          process.execPath,
          [link, 'plan', '--home', home, '--json'],
          base,
          join(base, 'actor'),
        )
        assert.strictEqual(output.code, 0, output.stderr + output.stdout)
        assert.strictEqual(output.stderr, '')
        const result = JSON.parse(output.stdout)
        assert.strictEqual(result.checkout, checkout)
        assert.strictEqual(result.home, home)
        assert.strictEqual(result.entries.length, 7)
        assert.deepStrictEqual(yield* io(() => fs.readdir(base)), ['bin'])
      }),
  )
  it.live('runs the PATH executable with Node and no Bun on PATH', () =>
    Effect.gen(function* () {
      const base = yield* fixture,
        home = join(base, 'home'),
        bin = join(base, 'bin')
      yield* io(() => fs.mkdir(bin))
      yield* io(() => fs.symlink(launcher, join(bin, 'lab-skills')))
      // Put a known Node executable on this test PATH; no Bun is needed by the shebang.
      const node = yield* io(
        () =>
          new Promise<string>((resolve, reject) => {
            const p = spawn('node', ['-p', 'process.execPath'])
            let s = ''
            p.stdout.on('data', (d) => (s += d))
            p.on('error', reject)
            p.on('close', () => resolve(s.trim()))
          }),
      )
      yield* io(() => fs.symlink(node, join(bin, 'node')))
      const output = yield* child(
        'lab-skills',
        ['validate', '--json'],
        base,
        home,
        bin + ':/usr/bin:/bin',
      )
      assert.strictEqual(output.code, 0, output.stderr + output.stdout)
      assert.strictEqual(JSON.parse(output.stdout).checkout, checkout)
    }),
  )
  it.live('refuses a copied npm installation instead of treating it as another skill source', () =>
    Effect.gen(function* () {
      const base = yield* fixture,
        copy = join(base, 'node_modules/copied-skills/packages/lab-skills/bin/lab-skills.mjs')
      yield* io(() => fs.mkdir(dirname(copy), { recursive: true }))
      yield* io(() => fs.copyFile(launcher, copy))
      const output = yield* child(
        process.execPath,
        [copy, 'validate', '--json'],
        base,
        join(base, 'actor'),
      )
      assert.strictEqual(output.code, 2)
      assert.strictEqual(JSON.parse(output.stdout).diagnostics[0].code, 'SOURCE_INVALID')
    }),
  )
  it.live('emits one schema-versioned JSON error and exit 2, with human errors on stderr', () =>
    Effect.gen(function* () {
      const base = yield* fixture,
        home = join(base, 'home')
      const json = yield* child(
        process.execPath,
        [launcher, 'plan', '--typo', '--json'],
        base,
        home,
      )
      assert.strictEqual(json.code, 2)
      assert.strictEqual(json.stderr, '')
      assert.strictEqual(JSON.parse(json.stdout).diagnostics[0].code, 'ARGUMENT_INVALID')
      const human = yield* child(process.execPath, [launcher, 'plan', '--typo'], base, home)
      assert.strictEqual(human.code, 2)
      assert.include(human.stderr, 'ARGUMENT_INVALID')
      assert.notInclude(human.stdout, 'ARGUMENT_INVALID')
    }),
  )
})
