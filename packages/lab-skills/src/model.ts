import { Schema } from 'effect'

export const Targets = ['agents', 'codex', 'claude', 'opencode', 'pi'] as const
export const Target = Schema.Literals(Targets)
export type Target = typeof Target.Type
export const roots: Record<Target, string> = {
  agents: '.agents/skills',
  codex: '.codex/skills',
  claude: '.claude/skills',
  opencode: '.config/opencode/skills',
  pi: '.pi/agent/skills',
}
export const Source = Schema.Union([
  Schema.Struct({ local: Schema.String }),
  Schema.Struct({ locked: Schema.String }),
])
export type Source = typeof Source.Type
export const FileRecord = Schema.Struct({ sha256: Schema.String, executable: Schema.Boolean })
export type FileRecord = typeof FileRecord.Type
export const InstalledFile = Schema.Struct({ ...FileRecord.fields, mode: Schema.Number })
export type InstalledFile = typeof InstalledFile.Type
export const Tree = Schema.Struct({
  files: Schema.Record(Schema.String, InstalledFile),
  directories: Schema.Array(Schema.String),
  directoryModes: Schema.Record(Schema.String, Schema.Number),
  rootMode: Schema.Number,
})
export type Tree = typeof Tree.Type
export const Skill = Schema.Struct({
  ownership: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Source),
  variants: Schema.optionalKey(Schema.Record(Schema.String, Source)),
  dependencies: Schema.Array(Schema.String),
  prerequisites: Schema.optionalKey(Schema.Array(Schema.String)),
  blocked_reason: Schema.optionalKey(Schema.String),
  provenance: Schema.optionalKey(
    Schema.Struct({
      repo: Schema.String,
      sha: Schema.String,
      path: Schema.String,
      basis: Schema.String,
    }),
  ),
})
export type Skill = typeof Skill.Type
export const Manifest = Schema.Struct({
  schema: Schema.Literal(1),
  owner: Schema.String,
  skills: Schema.Record(Schema.String, Skill),
  profiles: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  external: Schema.Record(Schema.String, Schema.Struct({ reason: Schema.String })),
  candidates: Schema.Record(
    Schema.String,
    Schema.Struct({ installable: Schema.Literal(false), reason: Schema.String }),
  ),
})
export type Manifest = typeof Manifest.Type
export const LockedSource = Schema.Struct({
  repository: Schema.String,
  commit: Schema.String,
  path: Schema.String,
  revision_basis: Schema.String,
  files: Schema.Record(Schema.String, FileRecord),
  license_files: Schema.Record(Schema.String, Schema.String),
})
export type LockedSource = typeof LockedSource.Type
export const SourceLock = Schema.Struct({
  schema: Schema.Literal(1),
  sources: Schema.Record(Schema.String, LockedSource),
})
export type SourceLock = typeof SourceLock.Type
export const MachineConfig = Schema.Struct({
  schema: Schema.Literal(1),
  home: Schema.optionalKey(Schema.String),
  profiles: Schema.optionalKey(Schema.Array(Schema.String)),
  skills: Schema.optionalKey(Schema.Array(Schema.String)),
  targets: Schema.optionalKey(Schema.Array(Target)),
  archiveDir: Schema.optionalKey(Schema.String),
})
export type MachineConfig = typeof MachineConfig.Type
export const GitInfo = Schema.Struct({
  revision: Schema.String,
  dirty: Schema.Boolean,
  changes: Schema.Array(Schema.String),
})
export type GitInfo = typeof GitInfo.Type
export const Identity = Schema.Struct({
  kind: Schema.Literals(['local', 'upstream']),
  content_sha256: Schema.String,
  path: Schema.String,
  repository: Schema.optionalKey(Schema.String),
  commit: Schema.optionalKey(Schema.String),
  revision_basis: Schema.optionalKey(Schema.String),
  git: Schema.optionalKey(GitInfo),
})
export type Identity = typeof Identity.Type
export const Owned = Schema.Struct({ tree: Tree, source: Identity })
export type Owned = typeof Owned.Type
export const State = Schema.Struct({
  schema: Schema.Literal(2),
  owner: Schema.Literal('lloydrichards/lab-skills'),
  installations: Schema.Record(Schema.String, Owned),
})
export type State = typeof State.Type
export const DiagnosticCode = Schema.Literals([
  'ARGUMENT_INVALID',
  'CONFIG_INVALID',
  'MANIFEST_INVALID',
  'SOURCE_INVALID',
  'STATE_INVALID',
  'LEGACY_STATE',
  'PATH_UNSAFE',
  'UNOWNED_DESTINATION',
  'LOCAL_EDIT',
  'MANAGED_MISSING',
  'SOURCE_CHANGED',
  'INTERRUPTED_OPERATION',
  'DOWNLOAD_FAILED',
  'HASH_MISMATCH',
  'IO_FAILED',
  'APPLY_FAILED',
  'ROLLBACK_FAILED',
  'BROKEN_LINK',
  'DUPLICATE_NAME',
  'PREREQUISITE_MISSING',
  'PREREQUISITE_UNVERIFIED',
  'BLOCKED_SKILL',
  'BUILD_MISSING',
  'INTERNAL_ERROR',
])
export type DiagnosticCode = typeof DiagnosticCode.Type
export const Diagnostic = Schema.Struct({
  code: DiagnosticCode,
  severity: Schema.Literals(['warning', 'error']),
  message: Schema.String,
  path: Schema.optionalKey(Schema.String),
})
export type Diagnostic = typeof Diagnostic.Type
export const Entry = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  status: Schema.Literals([
    'new',
    'current',
    'update',
    'conflict',
    'unselected',
    'unmanaged',
    'applied',
  ]),
  source: Schema.optionalKey(Identity),
  installedSource: Schema.optionalKey(Identity),
  reason: Schema.optionalKey(Schema.String),
})
export type Entry = typeof Entry.Type
export const Selection = Schema.Struct({
  profiles: Schema.Array(Schema.String),
  skills: Schema.Array(Schema.String),
  targets: Schema.Array(Target),
})
export type Selection = typeof Selection.Type
export const Result = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  command: Schema.String,
  ok: Schema.Boolean,
  exitCode: Schema.Literals([0, 1, 2, 3]),
  checkout: Schema.String,
  home: Schema.optionalKey(Schema.String),
  selection: Selection,
  entries: Schema.Array(Entry),
  diagnostics: Schema.Array(Diagnostic),
  sourceGit: Schema.optionalKey(GitInfo),
})
export type Result = typeof Result.Type
export const JournalItem = Schema.Struct({
  id: Schema.String,
  destination: Schema.String,
  stage: Schema.String,
  backup: Schema.String,
  old: Schema.optionalKey(Owned),
  next: Owned,
})
export type JournalItem = typeof JournalItem.Type
export const Journal = Schema.Struct({
  schema: Schema.Literal(1),
  phase: Schema.String,
  previousState: State,
  nextState: State,
  items: Schema.Array(JournalItem),
})
export type Journal = typeof Journal.Type
export const decode = <S extends Schema.Constraint>(schema: S) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: 'error' })
