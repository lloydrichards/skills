import { Effect, Path } from 'effect'
import type { Catalog } from './catalog.js'
import { Disk, SourceInspection, OwnershipState, equal } from './services.js'
import { Journal, decode, roots, type Diagnostic, type Entry } from './model.js'
import { inventory, json, noLinks } from './files.js'
import { paths, plan, type Options, stateKey, verifyTree } from './plan.js'

export const doctor = Effect.fn('Doctor.inspect')(function* (
  root: string,
  catalog: Catalog,
  options: Options,
) {
  const disk = yield* Disk,
    path = yield* Path.Path,
    inspection = yield* SourceInspection
  const diagnostics: Diagnostic[] = [],
    entries: Entry[] = []
  const planned = yield* plan(root, catalog, options).pipe(Effect.result)
  if (planned._tag === 'Failure' && planned.failure.exitCode !== 3)
    return yield* Effect.fail(planned.failure)
  if (planned._tag === 'Failure')
    diagnostics.push({
      code: planned.failure.code,
      severity: 'error',
      message: planned.failure.message,
      ...(planned.failure.path ? { path: planned.failure.path } : {}),
    })
  else {
    entries.push(...planned.success.entries)
    diagnostics.push(...planned.success.diagnostics)
  }
  const declared = new Map<string, string[]>()
  // Scan every known discovery root for diagnosis, without installing into any of them.
  for (const [target, suffix] of Object.entries(roots)) {
    const base = path.join(options.home, suffix)
    const safe = yield* noLinks(base).pipe(Effect.result)
    if (safe._tag === 'Failure') {
      diagnostics.push({
        code: safe.failure.code,
        severity: 'warning',
        message: safe.failure.message,
        path: base,
      })
      continue
    }
    if ((yield* disk.info(base))?.kind !== 'directory') continue
    const candidates = (yield* disk.list(base)).map((name) => ({
      name,
      original: path.join(base, name),
    }))
    if (target === 'codex') {
      const system = path.join(base, '.system')
      const systemSafe = yield* noLinks(system).pipe(Effect.result)
      if (systemSafe._tag === 'Success' && (yield* disk.info(system))?.kind === 'directory') {
        for (const name of yield* disk.list(system))
          candidates.push({ name: '.system/' + name, original: path.join(system, name) })
      }
    }
    for (const { name, original } of candidates) {
      if (name.startsWith('.lab-skills-')) {
        diagnostics.push({
          code: 'INTERRUPTED_OPERATION',
          severity: 'error',
          message:
            'Preserved installer stage or backup; do not delete without comparing state and journal',
          path: original,
        })
        continue
      }
      const stat = yield* disk.info(original)
      let resolved = original
      if (stat?.kind === 'link') {
        const linked = yield* disk.realPath(original).pipe(Effect.result)
        if (linked._tag === 'Failure') {
          diagnostics.push({
            code: 'BROKEN_LINK',
            severity: 'warning',
            message: 'Discovery link has no readable target',
            path: original,
          })
          continue
        }
        resolved = linked.success
      }
      const skillFile = path.join(resolved, 'SKILL.md'),
        info = yield* disk.info(skillFile)
      if (info?.kind === 'link') {
        const linked = yield* disk.realPath(skillFile).pipe(Effect.result)
        if (linked._tag === 'Failure')
          diagnostics.push({
            code: 'BROKEN_LINK',
            severity: 'warning',
            message: 'SKILL.md link is broken',
            path: skillFile,
          })
        continue
      }
      if (info?.kind !== 'file') continue
      const content = new TextDecoder().decode(yield* disk.read(skillFile))
      const match = /^---\r?\n[\s\S]*?^name:\s*["']?([a-zA-Z0-9][a-zA-Z0-9._-]*)["']?\s*$/m.exec(
        content,
      )
      const declaredName = match?.[1] ?? name
      const existing = declared.get(declaredName) ?? []
      existing.push(target + ':' + original)
      declared.set(declaredName, existing)
    }
  }
  for (const [name, locations] of declared)
    if (locations.length > 1)
      diagnostics.push({
        code: 'DUPLICATE_NAME',
        severity: 'warning',
        message: `${name} occurs in ${locations.join(', ')}. Actual precedence depends on harness discovery.`,
      })
  const location = paths(options.home)
  const journalPathSafe = yield* noLinks(location.journal).pipe(Effect.result)
  if (journalPathSafe._tag === 'Success' && (yield* disk.info(location.journal))) {
    const loaded = yield* json(location.journal, 'STATE_INVALID', 3).pipe(
      Effect.flatMap(decode(Journal)),
      Effect.result,
    )
    if (loaded._tag === 'Failure')
      diagnostics.push({
        code: 'STATE_INVALID',
        severity: 'error',
        message: 'Cannot validate recovery journal; preserve it for manual inspection',
        path: location.journal,
      })
    else {
      const store = yield* OwnershipState
      const current = yield* noLinks(location.state).pipe(
        Effect.flatMap(() => store.read(location.state)),
        Effect.result,
      )
      diagnostics.push({
        code: 'INTERRUPTED_OPERATION',
        severity: 'error',
        message:
          current._tag === 'Success'
            ? `Ownership state: previous-match=${equal(current.success, loaded.success.previousState)}, next-match=${equal(current.success, loaded.success.nextState)}`
            : 'Ownership state cannot be decoded; preserve it for recovery',
        path: location.state,
      })
      for (const item of loaded.success.items) {
        const { target, name } = yield* stateKey(item.id)
        const expected = path.join(options.home, roots[target], name)
        if (
          item.destination !== expected ||
          path.dirname(item.stage) !== path.dirname(expected) ||
          path.dirname(item.backup) !== path.dirname(expected) ||
          !path.basename(item.stage).startsWith('.lab-skills-stage-') ||
          !path.basename(item.backup).startsWith('.lab-skills-backup-')
        ) {
          diagnostics.push({
            code: 'STATE_INVALID',
            severity: 'error',
            message: 'Journal path is inconsistent; no referenced path was changed',
            path: location.journal,
          })
          continue
        }
        yield* verifyTree(item.next.tree, location.journal)
        if (item.old) yield* verifyTree(item.old.tree, location.journal)
        for (const [kind, file] of [
          ['destination', item.destination],
          ['stage', item.stage],
          ['backup', item.backup],
        ]) {
          if (!file) continue
          const actual = yield* inventory(file).pipe(Effect.result)
          const oldMatch =
            actual._tag === 'Success' && !!item.old && equal(actual.success, item.old.tree)
          const newMatch = actual._tag === 'Success' && equal(actual.success, item.next.tree)
          diagnostics.push({
            code: 'INTERRUPTED_OPERATION',
            severity: 'error',
            message: `${item.id} ${kind}: old-content-match=${oldMatch}, new-content-match=${newMatch}; journal phase=${loaded.success.phase}`,
            path: file,
          })
        }
      }
    }
  }
  const knownExecutables: Record<string, string[]> = {
    'skill-creator': ['python3', 'claude'],
    'skill-doctor': ['python3'],
    'technical-writing': [],
    why: ['git', 'gh'],
  }
  for (const job of planned._tag === 'Success' ? planned.success.jobs : []) {
    const name = job.id.slice(job.id.indexOf('/') + 1),
      skill = catalog.manifest.skills[name]
    for (const executable of (Object.hasOwn(knownExecutables, name)
      ? knownExecutables[name]
      : []) ?? []) {
      if (!(yield* inspection.executable(executable)))
        diagnostics.push({
          code: 'PREREQUISITE_MISSING',
          severity: 'warning',
          message: `${name} requires ${executable} for some workflows; unavailable on this process PATH`,
        })
    }
    for (const prerequisite of skill?.prerequisites ?? [])
      diagnostics.push({
        code: 'PREREQUISITE_UNVERIFIED',
        severity: 'warning',
        message: `${name}: ${prerequisite}`,
      })
    if (name === 'skill-creator' && job.id.startsWith('codex/'))
      diagnostics.push({
        code: 'DUPLICATE_NAME',
        severity: 'warning',
        message: 'skill-creator has a known collision with the Codex system skill',
      })
    if (name === 'impeccable') {
      const engine = path.join(options.home, '.impeccable/bin/0.1.5/impeccable')
      if (!(yield* disk.info(engine)))
        diagnostics.push({
          code: 'PREREQUISITE_MISSING',
          severity: 'warning',
          message:
            'Pinned Impeccable engine 0.1.5 is not in its versioned cache. A PATH override, platform and actual version remain unverified.',
          path: engine,
        })
    }
  }
  return { entries, diagnostics }
})
