import { Effect, Path } from 'effect'
import { Disk, Hashing, bytes, canonical } from './services.js'
import { problem } from './error.js'
import type { FileRecord, InstalledFile, Tree } from './model.js'

export const relative = (value: string) =>
  Effect.gen(function* () {
    if (
      !value ||
      value.includes('\\') ||
      value.startsWith('/') ||
      /^[A-Za-z]:/.test(value) ||
      value
        .split('/')
        .some(
          (p) =>
            !p || p === '.' || p === '..' || ['__proto__', 'constructor', 'prototype'].includes(p),
        ) ||
      value.includes('\0')
    ) {
      return yield* Effect.fail(problem('PATH_UNSAFE', 'Expected a safe relative path', 2, value))
    }
    return value
  })
export const identifier = (value: string) =>
  Effect.gen(function* () {
    yield* relative(value)
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value))
      return yield* Effect.fail(
        problem('PATH_UNSAFE', 'Invalid skill or profile identifier', 2, value),
      )
  })
export const noLinks = Effect.fn('Files.noLinks')(function* (file: string) {
  const disk = yield* Disk,
    path = yield* Path.Path
  let current = file
  while (true) {
    const info = yield* disk.info(current)
    if (info?.kind === 'link')
      return yield* Effect.fail(problem('PATH_UNSAFE', 'Unsupported symlink', 3, current))
    if (current !== file && info && info.kind !== 'directory')
      return yield* Effect.fail(problem('PATH_UNSAFE', 'Parent is not a directory', 3, current))
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
})
const native = (data: Uint8Array) => {
  const magic = Array.from(data.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return (
    [
      '7f454c46',
      'cffaedfe',
      'feedfacf',
      'feedface',
      'cefaedfe',
      'cafebabe',
      'bebafeca',
      'cafebabf',
      'bfbafeca',
    ].includes(magic) ||
    (data[0] === 0x4d && data[1] === 0x5a)
  )
}
export const inventory = Effect.fn('Files.inventory')(function* (root: string, source = false) {
  const disk = yield* Disk,
    path = yield* Path.Path,
    hash = yield* Hashing
  yield* noLinks(root)
  if ((yield* disk.info(root))?.kind !== 'directory')
    return yield* Effect.fail(
      problem(
        source ? 'SOURCE_INVALID' : 'MANAGED_MISSING',
        'Expected a skill directory',
        source ? 2 : 3,
        root,
      ),
    )
  const files: Record<string, InstalledFile> = {},
    directories: string[] = [],
    directoryModes: Record<string, number> = {}
  const rootInfo = yield* disk.info(root)
  const walk = Effect.fn('Files.walk')(function* (
    dir: string,
  ): Effect.fn.Return<void, import('./error.js').LabError> {
    const foldedNames = new Set<string>()
    for (const name of yield* disk.list(dir)) {
      if (source && foldedNames.has(name.toLowerCase()))
        return yield* Effect.fail(
          problem('SOURCE_INVALID', 'Case-colliding source paths', 2, path.join(dir, name)),
        )
      foldedNames.add(name.toLowerCase())
      const full = path.join(dir, name),
        rel = path.relative(root, full).split(path.sep).join('/')
      yield* relative(rel)
      const info = yield* disk.info(full)
      if (info?.kind === 'directory') {
        directories.push(rel)
        directoryModes[rel] = source ? 0o755 : info.mode
        yield* walk(full)
      } else if (info?.kind === 'file') {
        const data = yield* disk.read(full)
        if (source && native(data))
          return yield* Effect.fail(
            problem('SOURCE_INVALID', 'Native binaries are not source skills', 2, full),
          )
        files[rel] = {
          sha256: yield* hash.sha256(data),
          executable: info.executable,
          mode: source ? (info.executable ? 0o755 : 0o644) : info.mode,
        }
      } else
        return yield* Effect.fail(
          problem('PATH_UNSAFE', 'Symlink or special file in skill', source ? 2 : 3, full),
        )
    }
  })
  yield* walk(root)
  return {
    files,
    directories: directories.sort(),
    directoryModes,
    rootMode: source ? 0o755 : (rootInfo?.mode ?? 0o755),
  } satisfies Tree
})
export const sourceTree = (files: Readonly<Record<string, FileRecord>>): Tree => {
  const directories = new Set<string>()
  for (const name of Object.keys(files)) {
    const parts = name.split('/')
    parts.pop()
    while (parts.length) {
      directories.add(parts.join('/'))
      parts.pop()
    }
  }
  return {
    files: Object.fromEntries(
      Object.entries(files).map(([name, record]) => [
        name,
        { ...record, mode: record.executable ? 0o755 : 0o644 },
      ]),
    ),
    directories: Array.from(directories).sort(),
    directoryModes: Object.fromEntries([...directories].map((dir) => [dir, 0o755])),
    rootMode: 0o755,
  }
}
export const treeHash = Effect.fn('Files.treeHash')(function* (tree: Tree) {
  return yield* (yield* Hashing).sha256(new TextEncoder().encode(canonical(tree)))
})
export const json = Effect.fn('Files.json')(function* (
  file: string,
  code: import('./model.js').DiagnosticCode,
  exitCode: 1 | 2 | 3,
) {
  const disk = yield* Disk
  yield* noLinks(file)
  const data = yield* disk.read(file)
  return yield* Effect.try({
    try: (): unknown => JSON.parse(new TextDecoder().decode(data)),
    catch: () => problem(code, 'Invalid JSON document', exitCode, file),
  })
})
export const writeJSON = Effect.fn('Files.writeJSON')(function* (file: string, value: unknown) {
  yield* (yield* Disk).atomic(file, bytes(value))
})

// Resolve existing ancestors without creating missing target directories. realpath
// supplies the filesystem's case/normalization spelling rather than guessing it.
export const physicalPath = Effect.fn('Files.physicalPath')(function* (file: string) {
  const disk = yield* Disk,
    path = yield* Path.Path
  let ancestor = file
  const missing: string[] = []
  while (!(yield* disk.info(ancestor))) {
    const parent = path.dirname(ancestor)
    if (parent === ancestor)
      return yield* Effect.fail(problem('PATH_UNSAFE', 'Cannot resolve physical ancestor', 3, file))
    missing.unshift(path.basename(ancestor))
    ancestor = parent
  }
  return path.join(yield* disk.realPath(ancestor), ...missing)
})
