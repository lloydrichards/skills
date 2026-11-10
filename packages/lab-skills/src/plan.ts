import { Effect, Path, Schema } from 'effect'
import { type Catalog, selection } from './catalog.js'
import { Disk, OwnershipState, SourceInspection, equal } from './services.js'
import {
  identifier,
  inventory,
  noLinks,
  relative,
  sourceTree,
  treeHash,
  physicalPath,
} from './files.js'
import {
  roots,
  Target,
  type Diagnostic,
  type Entry,
  type Identity,
  type Selection,
  type Source,
  type Tree,
} from './model.js'
import { problem, LabError } from './error.js'

export interface Options {
  readonly home: string
  readonly selection: Selection
  readonly archiveDir?: string
}
export interface Job {
  readonly id: string
  readonly destination: string
  readonly tree: Tree
  readonly source: Identity
  readonly payload: Source
  readonly local?: string
}
export const paths = (home: string) => ({
  state: home + '/.local/state/lab-skills/state.json',
  lock: home + '/.local/state/lab-skills/apply.lock',
  journal: home + '/.local/state/lab-skills/journal.json',
  legacy: home + '/.local/state/shared-skills/installations.json',
})
export const contentIdentity = (value: Identity) => ({
  kind: value.kind,
  content_sha256: value.content_sha256,
  path: value.path,
  repository: value.repository,
  commit: value.commit,
})
export const verifyTree = Effect.fn('Plan.verifyTree')(function* (tree: Tree, file: string) {
  const check = Effect.gen(function* () {
    const folded = new Set<string>()
    const validMode = (mode: number) => Number.isInteger(mode) && mode >= 0 && mode <= 0o7777
    if (
      !validMode(tree.rootMode) ||
      !equal(Object.keys(tree.directoryModes).sort(), tree.directories)
    )
      return yield* Effect.fail(problem('STATE_INVALID', 'Invalid directory modes', 3, file))
    for (const mode of Object.values(tree.directoryModes))
      if (!validMode(mode))
        return yield* Effect.fail(problem('STATE_INVALID', 'Invalid directory mode', 3, file))
    for (const [name, value] of Object.entries(tree.files)) {
      yield* relative(name)
      if (
        !/^[a-f0-9]{64}$/.test(value.sha256) ||
        folded.has(name.toLowerCase()) ||
        !validMode(value.mode) ||
        !!(value.mode & 0o111) !== value.executable
      )
        return yield* Effect.fail(
          problem('STATE_INVALID', 'Invalid file hash/path in ownership state', 3, file),
        )
      folded.add(name.toLowerCase())
    }
    if (
      !equal([...tree.directories].sort(), tree.directories) ||
      new Set(tree.directories).size !== tree.directories.length
    )
      return yield* Effect.fail(problem('STATE_INVALID', 'Invalid directory inventory', 3, file))
    for (const dir of tree.directories) {
      yield* relative(dir)
      if (Object.hasOwn(tree.files, dir))
        return yield* Effect.fail(
          problem('STATE_INVALID', 'File/directory collision in ownership state', 3, file),
        )
    }
    if (sourceTree(tree.files).directories.some((dir) => !tree.directories.includes(dir)))
      return yield* Effect.fail(problem('STATE_INVALID', 'Incomplete directory inventory', 3, file))
  })
  yield* check.pipe(Effect.mapError((e) => problem('STATE_INVALID', e.message, 3, file)))
})
export const stateKey = (key: string) =>
  Effect.gen(function* () {
    const parts = key.split('/'),
      target = parts[0],
      name = parts[1]
    if (parts.length !== 2 || !Schema.is(Target)(target) || !name)
      return yield* Effect.fail(problem('STATE_INVALID', 'Invalid ownership entry', 3, key))
    yield* identifier(name).pipe(
      Effect.mapError(() => problem('STATE_INVALID', 'Unsafe ownership entry', 3, key)),
    )
    return { target, name }
  })

export const plan = Effect.fn('Plan.compute')(function* (
  root: string,
  catalog: Catalog,
  options: Options,
  heldLock = false,
  artifacts: ReadonlySet<string> = new Set(),
) {
  const disk = yield* Disk,
    path = yield* Path.Path,
    store = yield* OwnershipState,
    inspection = yield* SourceInspection
  yield* noLinks(options.home)
  const physicalRoot = yield* physicalPath(root)
  const location = paths(options.home)
  for (const file of Object.values(location)) yield* noLinks(file)
  const diagnostics: Diagnostic[] = [],
    entries: Entry[] = [],
    jobs: Job[] = []
  if (yield* disk.info(location.legacy))
    diagnostics.push({
      code: 'LEGACY_STATE',
      severity: 'error',
      message: 'Python ownership state exists; explicit migration is required',
      path: location.legacy,
    })
  if (!heldLock && (yield* disk.info(location.lock)))
    diagnostics.push({
      code: 'INTERRUPTED_OPERATION',
      severity: 'error',
      message: 'Installer lock exists; establish whether its process is running before recovery',
      path: location.lock,
    })
  if (yield* disk.info(location.journal))
    diagnostics.push({
      code: 'INTERRUPTED_OPERATION',
      severity: 'error',
      message: 'Recovery journal exists; inspect with doctor before mutation',
      path: location.journal,
    })
  const stateDirectory = path.dirname(location.state)
  if ((yield* disk.info(stateDirectory))?.kind === 'directory')
    for (const name of yield* disk.list(stateDirectory)) {
      if (name.startsWith('.lab-skills-state-'))
        diagnostics.push({
          code: 'INTERRUPTED_OPERATION',
          severity: 'error',
          message: 'Preserved temporary state or journal write',
          path: path.join(stateDirectory, name),
        })
    }
  const state = yield* store.read(location.state)
  for (const [id, record] of Object.entries(state.installations)) {
    yield* stateKey(id)
    yield* verifyTree(record.tree, location.state)
    const source = record.source
    if (
      source.content_sha256 !== (yield* treeHash(record.tree)) ||
      (source.kind === 'upstream' &&
        (!source.repository ||
          !/^[a-f0-9]{40}$/.test(source.commit ?? '') ||
          !source.revision_basis))
    ) {
      return yield* Effect.fail(
        problem('STATE_INVALID', 'Ownership source identity is inconsistent', 3, location.state),
      )
    }
  }
  const resolved = yield* selection(catalog.manifest, options.selection)
  const conflict = (id: string, destination: string, error: LabError) => {
    const oldSource = state.installations[id]?.source,
      desiredSource = jobs.find((job) => job.id === id)?.source
    entries.push({
      id,
      path: destination,
      status: 'conflict',
      reason: error.message,
      ...(oldSource ? { installedSource: oldSource } : {}),
      ...(desiredSource ? { source: desiredSource } : {}),
    })
    diagnostics.push({
      code: error.code,
      severity: 'error',
      message: error.message,
      path: error.path ?? destination,
    })
  }
  for (const target of options.selection.targets) {
    const base = path.join(options.home, roots[target])
    yield* noLinks(base)
    const baseInfo = yield* disk.info(base)
    if (baseInfo && baseInfo.kind !== 'directory')
      return yield* Effect.fail(problem('PATH_UNSAFE', 'Target root is not a directory', 3, base))
    if (baseInfo)
      for (const name of yield* disk.list(base)) {
        if (name.startsWith('.lab-skills-') && !artifacts.has(path.join(base, name)))
          diagnostics.push({
            code: 'INTERRUPTED_OPERATION',
            severity: 'error',
            message: 'Installer staging or backup evidence exists',
            path: path.join(base, name),
          })
      }
    for (const name of resolved) {
      const skill = catalog.manifest.skills[name]
      if (!skill)
        return yield* Effect.fail(problem('MANIFEST_INVALID', 'Resolved skill missing', 2, name))
      const payload = skill.variants?.[target] ?? skill.source
      if (!payload)
        return yield* Effect.fail(problem('MANIFEST_INVALID', 'Missing selected variant', 2, name))
      const destination = path.join(base, name),
        id = target + '/' + name
      const physicalDestination = yield* physicalPath(destination)
      if (
        physicalDestination === physicalRoot ||
        physicalRoot.startsWith(physicalDestination + path.sep) ||
        physicalDestination.startsWith(physicalRoot + path.sep)
      )
        return yield* Effect.fail(
          problem('PATH_UNSAFE', 'Installation overlaps source checkout', 3, destination),
        )
      let tree: Tree, source: Identity, local: string | undefined
      if ('local' in payload) {
        local = path.join(root, payload.local)
        tree = yield* inventory(local, true)
        const git = yield* inspection.git(root, payload.local)
        source = {
          kind: 'local',
          path: payload.local,
          content_sha256: yield* treeHash(tree),
          ...(git ? { git } : {}),
        }
      } else {
        const upstream = catalog.lock.sources[payload.locked]
        if (!upstream)
          return yield* Effect.fail(problem('MANIFEST_INVALID', 'Lock missing', 2, payload.locked))
        tree = sourceTree(upstream.files)
        source = {
          kind: 'upstream',
          path: upstream.path,
          content_sha256: yield* treeHash(tree),
          repository: upstream.repository,
          commit: upstream.commit,
          revision_basis: upstream.revision_basis,
        }
      }
      const job: Job = { id, destination, tree, source, payload, ...(local ? { local } : {}) }
      jobs.push(job)
      const old = state.installations[id]
      const checked = yield* Effect.gen(function* () {
        yield* noLinks(destination)
        const info = yield* disk.info(destination)
        if (!old) {
          if (info)
            return yield* Effect.fail(
              problem(
                'UNOWNED_DESTINATION',
                'Existing installation is not installer-owned',
                3,
                destination,
              ),
            )
          return 'new' as const
        }
        yield* verifyTree(old.tree, location.state)
        if (!info)
          return yield* Effect.fail(
            problem('MANAGED_MISSING', 'Owned installation is missing', 3, destination),
          )
        if (!equal(yield* inventory(destination), old.tree))
          return yield* Effect.fail(
            problem('LOCAL_EDIT', 'Owned files, modes or directories changed', 3, destination),
          )
        return equal(tree, old.tree) && equal(contentIdentity(source), contentIdentity(old.source))
          ? ('current' as const)
          : ('update' as const)
      }).pipe(Effect.result)
      if (checked._tag === 'Failure') conflict(id, destination, checked.failure)
      else
        entries.push({
          id,
          path: destination,
          status: checked.success,
          source,
          ...(old ? { installedSource: old.source } : {}),
        })
    }
  }
  for (const [id, old] of Object.entries(state.installations)) {
    const { target, name } = yield* stateKey(id)
    yield* verifyTree(old.tree, location.state)
    if (jobs.some((job) => job.id === id)) continue
    const destination = path.join(options.home, roots[target], name)
    const checked = yield* inventory(destination).pipe(
      Effect.flatMap((tree) =>
        equal(tree, old.tree)
          ? Effect.void
          : Effect.fail(
              problem(
                'LOCAL_EDIT',
                'Unselected owned installation has local changes',
                3,
                destination,
              ),
            ),
      ),
      Effect.result,
    )
    if (checked._tag === 'Failure') conflict(id, destination, checked.failure)
    else
      entries.push({
        id,
        path: destination,
        status: 'unselected',
        source: old.source,
        installedSource: old.source,
      })
  }
  for (const target of options.selection.targets) {
    const base = path.join(options.home, roots[target])
    if ((yield* disk.info(base))?.kind === 'directory')
      for (const name of yield* disk.list(base)) {
        const id = target + '/' + name
        if (
          !artifacts.has(path.join(base, name)) &&
          !jobs.some((job) => job.id === id) &&
          !state.installations[id]
        )
          entries.push({ id, path: path.join(base, name), status: 'unmanaged' })
      }
  }
  return { entries, diagnostics, jobs, state, location }
})
export type Plan = Effect.Success<ReturnType<typeof plan>>
