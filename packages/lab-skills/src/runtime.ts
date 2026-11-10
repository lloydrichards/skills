import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { delimiter, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import { extract } from 'tar-stream'
import { Effect, Layer } from 'effect'
import * as HttpClient from 'effect/http/HttpClient'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import {
  Archives,
  Disk,
  Hashing,
  HttpBytes,
  OwnershipState,
  SourceInspection,
  type ArchiveFile,
} from './services.js'
import { problem } from './error.js'
import { inspectGit } from './source-inspection.js'

const osCode = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
const operation = <A>(name: string, path: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (error) =>
      problem(
        osCode(error) === 'EEXIST' ? 'UNOWNED_DESTINATION' : 'IO_FAILED',
        `${name} failed (${String(osCode(error) ?? 'unknown')})`,
        osCode(error) === 'EEXIST' ? 3 : 1,
        path,
      ),
  })

export const makeDiskLayer = (filesystem: typeof fs) =>
  Layer.succeed(Disk, {
    info: Effect.fn('Disk.info')((path) =>
      Effect.tryPromise({
        try: async () => {
          try {
            const stat = await filesystem.lstat(path)
            return {
              kind: stat.isSymbolicLink()
                ? ('link' as const)
                : stat.isDirectory()
                  ? ('directory' as const)
                  : stat.isFile()
                    ? ('file' as const)
                    : ('other' as const),
              executable: !!(stat.mode & 0o111),
              mode: stat.mode & 0o7777,
            }
          } catch (error) {
            if (osCode(error) === 'ENOENT') return undefined
            throw error
          }
        },
        catch: () => problem('IO_FAILED', 'Cannot inspect path', 1, path),
      }),
    ),
    read: Effect.fn('Disk.read')((path) =>
      operation('Read', path, () => filesystem.readFile(path)),
    ),
    list: Effect.fn('Disk.list')((path) =>
      operation('List', path, () => filesystem.readdir(path).then((names) => names.sort())),
    ),
    realPath: Effect.fn('Disk.realPath')((path) =>
      operation('Read link', path, () => filesystem.realpath(path)),
    ),
    mkdir: Effect.fn('Disk.mkdir')((path, recursive) =>
      operation('Create directory', path, async () => {
        await filesystem.mkdir(path, { recursive })
      }),
    ),
    write: Effect.fn('Disk.write')((path, data, executable, exclusive = false) =>
      operation('Write', path, async () => {
        const mode = executable ? 0o755 : 0o644
        if (!exclusive) {
          await filesystem.writeFile(path, data, { mode })
          await filesystem.chmod(path, mode)
          return
        }
        // Do not confuse an acquired but incompletely initialized file with a
        // pre-existing lock. Only clean up the inode this call actually created.
        const handle = await filesystem.open(path, 'wx', mode)
        let identity: import('node:fs').Stats | undefined
        let initialized = false
        try {
          identity = await handle.stat()
          await handle.writeFile(data)
          await handle.chmod(mode)
          await handle.close()
          initialized = true
        } finally {
          if (!initialized) {
            try {
              await handle.close()
            } catch {
              /* The failed close may already have closed it. */
            }
            const current = await filesystem.lstat(path).catch((error) => {
              if (osCode(error) === 'ENOENT') return undefined
              throw error
            })
            if (identity && current?.dev === identity.dev && current.ino === identity.ino)
              await filesystem.unlink(path)
          }
        }
      }),
    ),
    chmod: Effect.fn('Disk.chmod')((path, mode) =>
      operation('Change mode', path, () => filesystem.chmod(path, mode)),
    ),
    rename: Effect.fn('Disk.rename')((from, to) =>
      operation('Rename', from, () => filesystem.rename(from, to)),
    ),
    remove: Effect.fn('Disk.remove')((path, recursive = false) =>
      operation('Remove', path, async () => {
        const stat = await filesystem.lstat(path).catch((error) => {
          if (osCode(error) === 'ENOENT') return undefined
          throw error
        })
        if (!stat) return
        if (stat.isDirectory() && !recursive) await filesystem.rmdir(path)
        else await filesystem.rm(path, { recursive, force: false })
      }),
    ),
    atomic: Effect.fn('Disk.atomic')((path, data) =>
      operation('Atomic write', path, async () => {
        const temp = join(dirname(path), '.lab-skills-state-' + randomUUID())
        let replaced = false
        try {
          const handle = await filesystem.open(temp, 'wx', 0o600)
          try {
            await handle.writeFile(data)
            await handle.sync()
          } finally {
            await handle.close()
          }
          await filesystem.rename(temp, path)
          replaced = true
        } finally {
          // Rename consumes the temporary name. Nothing fallible may turn a
          // successful replacement into an apparent pre-commit failure.
          if (!replaced) await filesystem.rm(temp, { force: true })
        }
      }),
    ),
    unique: Effect.fn('Disk.unique')(() => Effect.succeed(randomUUID())),
  })

export const diskLayer = makeDiskLayer(fs)

const httpLayer = Layer.effect(
  HttpBytes,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return {
      get: Effect.fn('HttpBytes.get')(function* (url) {
        return yield* Effect.gen(function* () {
          const response = yield* client.get(url)
          if (response.status !== 200)
            return yield* Effect.fail(
              problem('DOWNLOAD_FAILED', `Upstream returned HTTP ${response.status}`, 1),
            )
          const data = new Uint8Array(yield* response.arrayBuffer)
          if (data.length > 64 * 1024 * 1024)
            return yield* Effect.fail(problem('DOWNLOAD_FAILED', 'Archive exceeds 64 MiB', 1))
          return data
        }).pipe(
          Effect.timeout('60 seconds'),
          Effect.mapError(() =>
            problem('DOWNLOAD_FAILED', 'Pinned archive download failed or exceeded limits', 1),
          ),
        )
      }),
    }
  }),
).pipe(Layer.provide(FetchHttpClient.layer))

const archiveLayer = Layer.succeed(Archives, {
  unpack: Effect.fn('Archives.unpack')((data) =>
    Effect.tryPromise({
      try: (signal) =>
        new Promise<ReadonlyArray<ArchiveFile>>((resolve, reject) => {
          const parser = extract(),
            unzip = createGunzip(),
            input = Readable.from([data])
          const files: ArchiveFile[] = []
          let total = 0
          const fail = (error: unknown) => {
            input.destroy()
            unzip.destroy()
            parser.destroy()
            reject(error)
          }
          signal.addEventListener('abort', () => fail(new Error('Interrupted')), { once: true })
          input.on('error', fail)
          unzip.on('error', fail)
          parser.on('error', fail)
          parser.on('entry', (header, stream, next) => {
            const chunks: Uint8Array[] = []
            stream.on('data', (chunk: Buffer) => {
              total += chunk.length
              if (total > 256 * 1024 * 1024) {
                fail(new Error('Expanded archive exceeds 256 MiB'))
                return
              }
              chunks.push(chunk)
            })
            stream.on('error', fail)
            stream.on('end', () => {
              files.push({
                path: header.name,
                kind: header.type ?? 'file',
                bytes: Buffer.concat(chunks),
              })
              next()
            })
            stream.resume()
          })
          parser.on('finish', () => resolve(files))
          input.pipe(unzip).pipe(parser)
        }),
      catch: () => problem('DOWNLOAD_FAILED', 'Cannot decode pinned tar.gz archive', 1),
    }),
  ),
})

export const inspectionLayer = (envPath: string) =>
  Layer.succeed(SourceInspection, {
    git: Effect.fn('SourceInspection.git')((root, path) =>
      Effect.tryPromise({
        try: async () => {
          return inspectGit(root, path)
        },
        catch: () => problem('IO_FAILED', 'Source inspection failed', 1, root),
      }),
    ),
    executable: Effect.fn('SourceInspection.executable')((name) =>
      Effect.tryPromise({
        try: async () => {
          for (const dir of envPath.split(delimiter).filter(Boolean)) {
            try {
              await fs.access(join(dir, name), constants.X_OK)
              if ((await fs.stat(join(dir, name))).isFile()) return true
            } catch {
              /* Not available in this PATH directory. */
            }
          }
          return false
        },
        catch: () => problem('IO_FAILED', 'Cannot inspect executable prerequisite', 1),
      }),
    ),
  })

export const runtimeLayer = async (envPath: string) => {
  const platform = process.versions.bun
    ? (await import('@effect/platform-bun/BunServices')).layer
    : (await import('@effect/platform-node/NodeServices')).layer
  const infrastructure = Layer.mergeAll(
    diskLayer,
    httpLayer,
    archiveLayer,
    inspectionLayer(envPath),
    Hashing.Live.pipe(Layer.provide(platform)),
  )
  return Layer.mergeAll(
    platform,
    infrastructure,
    OwnershipState.Live.pipe(Layer.provide(diskLayer)),
  )
}
