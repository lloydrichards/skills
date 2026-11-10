import { Effect, Path } from 'effect'
import { MachineConfig, Target, decode, type Selection } from './model.js'
import { Disk } from './services.js'
import { json, noLinks } from './files.js'
import { problem } from './error.js'

export type Command = 'validate' | 'status' | 'plan' | 'apply' | 'doctor'
export interface Flags {
  command: Command
  json: boolean
  home?: string
  profiles?: string[]
  skills?: string[]
  targets?: Target[]
  config?: string
  archiveDir?: string
}
export interface Environment {
  readonly home: string
  readonly config?: string
  readonly xdgConfig?: string
}
export const parse = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const commands = ['validate', 'status', 'plan', 'apply', 'doctor']
    const command = args[0]
    if (!command || !commands.includes(command))
      return yield* Effect.fail(
        problem(
          'ARGUMENT_INVALID',
          'Choose validate, status, plan, apply, or doctor. Use --help for syntax.',
          2,
        ),
      )
    // Narrowing through explicit branches keeps the public command type separate from argv strings.
    const flags: Flags = {
      command:
        command === 'validate'
          ? 'validate'
          : command === 'status'
            ? 'status'
            : command === 'plan'
              ? 'plan'
              : command === 'apply'
                ? 'apply'
                : 'doctor',
      json: false,
    }
    for (let i = 1; i < args.length; i++) {
      const flag = args[i]
      if (flag === '--json') {
        flags.json = true
        continue
      }
      if (
        ![
          '--home',
          '--profile',
          '--skill',
          '--target',
          '--harness',
          '--config',
          '--archive-dir',
        ].includes(flag ?? '')
      )
        return yield* Effect.fail(problem('ARGUMENT_INVALID', `Unknown option ${flag}`, 2))
      const value = args[++i]
      if (!value || value.startsWith('--'))
        return yield* Effect.fail(problem('ARGUMENT_INVALID', `Missing value for ${flag}`, 2))
      switch (flag) {
        case '--home':
          flags.home = value
          break
        case '--profile':
          ;(flags.profiles ??= []).push(value)
          break
        case '--skill':
          ;(flags.skills ??= []).push(value)
          break
        case '--config':
          flags.config = value
          break
        case '--archive-dir':
          flags.archiveDir = value
          break
        case '--target':
        case '--harness':
          if (!['agents', 'codex', 'claude', 'opencode', 'pi'].includes(value))
            return yield* Effect.fail(
              problem('ARGUMENT_INVALID', `Unknown destination target ${value}`, 2),
            )
          if (
            value === 'agents' ||
            value === 'codex' ||
            value === 'claude' ||
            value === 'opencode' ||
            value === 'pi'
          )
            (flags.targets ??= []).push(value)
          break
      }
    }
    return flags
  })
export const configure = Effect.fn('Configuration.resolve')(function* (
  flags: Flags,
  environment: Environment,
) {
  const path = yield* Path.Path,
    disk = yield* Disk
  const configPath =
    flags.config ??
    environment.config ??
    path.join(
      environment.xdgConfig ?? path.join(environment.home, '.config'),
      'lab-skills/config.json',
    )
  if (!path.isAbsolute(configPath))
    return yield* Effect.fail(problem('CONFIG_INVALID', 'Configuration path must be absolute', 2))
  yield* noLinks(configPath).pipe(
    Effect.mapError((e) => problem('CONFIG_INVALID', e.message, 2, e.path)),
  )
  let config: MachineConfig = { schema: 1 }
  if (yield* disk.info(configPath))
    config = yield* decode(MachineConfig)(yield* json(configPath, 'CONFIG_INVALID', 2)).pipe(
      Effect.mapError((e) =>
        problem('CONFIG_INVALID', `Invalid machine configuration: ${e.message}`, 2, configPath),
      ),
    )
  else if (flags.config || environment.config)
    return yield* Effect.fail(
      problem('CONFIG_INVALID', 'Explicit machine configuration is missing', 2, configPath),
    )
  const home = flags.home ?? config.home ?? environment.home
  const targets = flags.targets ?? config.targets ?? ['agents']
  const skills = flags.skills ?? config.skills ?? []
  const profiles = flags.profiles ?? config.profiles ?? (skills.length ? [] : ['default'])
  const archiveDir = flags.archiveDir ?? config.archiveDir
  if (!path.isAbsolute(home) || (archiveDir && !path.isAbsolute(archiveDir)))
    return yield* Effect.fail(
      problem('CONFIG_INVALID', 'Home and archive paths must be absolute', 2),
    )
  if (
    flags.command === 'apply' &&
    (!(flags.home ?? config.home) || !(flags.targets ?? config.targets)?.length)
  )
    return yield* Effect.fail(
      problem(
        'CONFIG_INVALID',
        'apply requires an explicit home and target in flags or machine configuration',
        2,
      ),
    )
  if (!targets.length)
    return yield* Effect.fail(
      problem('CONFIG_INVALID', 'At least one destination target is required', 2),
    )
  return {
    home: path.normalize(home),
    selection: {
      profiles: [...new Set(profiles)],
      skills: [...new Set(skills)],
      targets: [...new Set(targets)],
    } satisfies Selection,
    ...(archiveDir ? { archiveDir } : {}),
  }
})
