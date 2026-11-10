import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import fs from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeDiskLayer } from '../src/runtime.js'
import { Disk } from '../src/services.js'

const io = <A>(f: () => Promise<A>) => Effect.tryPromise(f)
const directory = Effect.acquireRelease(
  io(() => fs.mkdtemp(join(realpathSync(tmpdir()), 'lab-skills-runtime-'))),
  (path) => io(() => fs.rm(path, { recursive: true, force: true })).pipe(Effect.orDie),
)

describe('real filesystem adapter failure boundaries', () => {
  it.live(
    'failed exclusive initialization removes only its newly created lock and permits retry',
    () =>
      Effect.gen(function* () {
        const root = yield* directory,
          lock = join(root, 'apply.lock')
        let injected = false
        const filesystem: typeof fs = {
          ...fs,
          open: async (path, flags, mode) => {
            const handle = await fs.open(path, flags, mode)
            if (String(path) !== lock || injected) return handle
            injected = true
            // Keep the real file descriptor and operations, failing only chmod on
            // this acquired handle. Proxy avoids runtime-specific builtin mocking.
            return new Proxy(handle, {
              get(target, property) {
                if (property === 'chmod')
                  return async () => {
                    throw Object.assign(new Error('initialization failure'), { code: 'EIO' })
                  }
                const value = Reflect.get(target, property, target)
                return typeof value === 'function' ? value.bind(target) : value
              },
            })
          },
        }
        yield* Effect.gen(function* () {
          const disk = yield* Disk
          const failed = yield* disk
            .write(lock, new TextEncoder().encode('first'), false, true)
            .pipe(Effect.result)
          assert.strictEqual(failed._tag, 'Failure')
          assert.isTrue(injected)
          assert.isUndefined(yield* disk.info(lock))
          yield* disk.write(lock, new TextEncoder().encode('second'), false, true)
          const foreign = yield* disk
            .write(lock, new TextEncoder().encode('replacement'), false, true)
            .pipe(Effect.result)
          assert.strictEqual(foreign._tag, 'Failure')
          assert.strictEqual(yield* io(() => fs.readFile(lock, 'utf8')), 'second')
        }).pipe(Effect.provide(makeDiskLayer(filesystem)))
      }),
  )

  it.live('successful atomic rename has no fallible temporary cleanup after commit', () =>
    Effect.gen(function* () {
      const root = yield* directory,
        state = join(root, 'state.json')
      yield* io(() => fs.writeFile(state, 'old'))
      let cleanupCalls = 0
      const filesystem: typeof fs = {
        ...fs,
        rm: async (path, options) => {
          if (String(path).includes('.lab-skills-state-')) {
            cleanupCalls++
            throw Object.assign(new Error('cleanup failure'), { code: 'EACCES' })
          }
          return fs.rm(path, options)
        },
      }
      yield* Effect.gen(function* () {
        const disk = yield* Disk
        yield* disk.atomic(state, new TextEncoder().encode('new'))
        assert.strictEqual(yield* io(() => fs.readFile(state, 'utf8')), 'new')
        assert.strictEqual(cleanupCalls, 0)
        assert.deepStrictEqual(yield* disk.list(root), ['state.json'])
      }).pipe(Effect.provide(makeDiskLayer(filesystem)))
    }),
  )
})
