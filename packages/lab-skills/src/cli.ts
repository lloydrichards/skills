import { Effect } from 'effect'
import { program } from './program.js'
import { runtimeLayer } from './runtime.js'
import type { Result } from './model.js'

export const main = async (root: string, argv: string[]) => {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      'lab-skills <validate|status|plan|apply|doctor> [--home ABSOLUTE] [--profile NAME ...] [--skill NAME ...] [--target agents|codex|claude|opencode|pi ...] [--config ABSOLUTE] [--archive-dir ABSOLUTE] [--json]\n\nagents selects ~/.agents/skills; it is a destination, not a harness. apply requires explicit home and target. See docs/contract.md.',
    )
    return
  }
  try {
    const result = await Effect.runPromise(
      program(root, argv, {
        home: process.env.HOME ?? '',
        ...(process.env.LAB_SKILLS_CONFIG ? { config: process.env.LAB_SKILLS_CONFIG } : {}),
        ...(process.env.XDG_CONFIG_HOME ? { xdgConfig: process.env.XDG_CONFIG_HOME } : {}),
      }).pipe(Effect.provide(await runtimeLayer(process.env.PATH ?? ''))),
    )
    present(result, argv.includes('--json'))
    process.exitCode = result.exitCode
  } catch {
    const result: Result = {
      schemaVersion: 1,
      command: argv[0] ?? 'unknown',
      ok: false,
      exitCode: 1,
      checkout: root,
      selection: { profiles: [], skills: [], targets: [] },
      entries: [],
      diagnostics: [
        {
          code: 'INTERNAL_ERROR',
          severity: 'error',
          message:
            'Unexpected runtime failure; no automatic recovery was attempted. Run doctor if apply was interrupted.',
        },
      ],
    }
    present(result, argv.includes('--json'))
    process.exitCode = 1
  }
}
const present = (result: Result, json: boolean) => {
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  console.log(`lab-skills ${result.command}: ${result.ok ? 'ok' : 'needs attention'}`)
  for (const entry of result.entries)
    console.log(
      `${entry.status.padEnd(11)} ${entry.id}  ${entry.path}${entry.reason ? '  ' + entry.reason : ''}${entry.status === 'update' ? '  ' + (entry.installedSource?.content_sha256.slice(0, 12) ?? 'unknown') + ' -> ' + (entry.source?.content_sha256.slice(0, 12) ?? 'unknown') : ''}`,
    )
  for (const diagnostic of result.diagnostics)
    (diagnostic.severity === 'error' ? console.error : console.log)(
      `${diagnostic.code}: ${diagnostic.message}${diagnostic.path ? ' [' + diagnostic.path + ']' : ''}`,
    )
}
