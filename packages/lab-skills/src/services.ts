import { Context, Crypto, Effect, Layer } from 'effect'
import type { GitInfo, State as StateType } from './model.js'
import { State, decode } from './model.js'
import { LabError, problem } from './error.js'

export interface Info {
  readonly kind: 'file' | 'directory' | 'link' | 'other'
  readonly executable: boolean
  readonly mode: number
}
export interface DiskShape {
  readonly info: (path: string) => Effect.Effect<Info | undefined, LabError>
  readonly read: (path: string) => Effect.Effect<Uint8Array, LabError>
  readonly list: (path: string) => Effect.Effect<ReadonlyArray<string>, LabError>
  readonly realPath: (path: string) => Effect.Effect<string, LabError>
  readonly mkdir: (path: string, recursive: boolean) => Effect.Effect<void, LabError>
  readonly write: (
    path: string,
    data: Uint8Array,
    executable: boolean,
    exclusive?: boolean,
  ) => Effect.Effect<void, LabError>
  readonly chmod: (path: string, mode: number) => Effect.Effect<void, LabError>
  readonly rename: (from: string, to: string) => Effect.Effect<void, LabError>
  readonly remove: (path: string, recursive?: boolean) => Effect.Effect<void, LabError>
  readonly atomic: (path: string, data: Uint8Array) => Effect.Effect<void, LabError>
  readonly unique: () => Effect.Effect<string, LabError>
}
export class Disk extends Context.Service<Disk, DiskShape>()('lab-skills/Disk') {}
export class HttpBytes extends Context.Service<
  HttpBytes,
  {
    readonly get: (url: string) => Effect.Effect<Uint8Array, LabError>
  }
>()('lab-skills/HttpBytes') {}
export interface ArchiveFile {
  readonly path: string
  readonly kind: string
  readonly bytes: Uint8Array
}
export class Archives extends Context.Service<
  Archives,
  {
    readonly unpack: (bytes: Uint8Array) => Effect.Effect<ReadonlyArray<ArchiveFile>, LabError>
  }
>()('lab-skills/Archives') {}
export class SourceInspection extends Context.Service<
  SourceInspection,
  {
    readonly git: (root: string, path?: string) => Effect.Effect<GitInfo | undefined, LabError>
    readonly executable: (name: string) => Effect.Effect<boolean, LabError>
  }
>()('lab-skills/SourceInspection') {}
export class Hashing extends Context.Service<
  Hashing,
  {
    readonly sha256: (bytes: Uint8Array) => Effect.Effect<string, LabError>
  }
>()('lab-skills/Hashing') {
  static readonly Live = Layer.effect(
    this,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto
      return {
        sha256: Effect.fn('Hashing.sha256')(function* (bytes) {
          const result = yield* crypto
            .digest('SHA-256', bytes)
            .pipe(Effect.mapError(() => problem('IO_FAILED', 'Hashing failed', 1)))
          return Array.from(result, (b) => b.toString(16).padStart(2, '0')).join('')
        }),
      }
    }),
  )
}
export class OwnershipState extends Context.Service<
  OwnershipState,
  {
    readonly read: (path: string) => Effect.Effect<StateType, LabError>
    readonly write: (path: string, state: StateType) => Effect.Effect<void, LabError>
  }
>()('lab-skills/OwnershipState') {
  static readonly Live = Layer.effect(
    this,
    Effect.gen(function* () {
      const disk = yield* Disk
      return {
        read: Effect.fn('OwnershipState.read')(function* (path) {
          if (!(yield* disk.info(path)))
            return { schema: 2, owner: 'lloydrichards/lab-skills', installations: {} }
          const bytes = yield* disk.read(path)
          const value = yield* Effect.try({
            try: () => JSON.parse(new TextDecoder().decode(bytes)),
            catch: () => problem('STATE_INVALID', 'Ownership state is not valid JSON', 3, path),
          })
          return yield* decode(State)(value).pipe(
            Effect.mapError(() =>
              problem('STATE_INVALID', 'Unsupported or corrupt ownership state', 3, path),
            ),
          )
        }),
        write: Effect.fn('OwnershipState.write')((path, state) =>
          disk.atomic(path, new TextEncoder().encode(JSON.stringify(state, null, 2) + '\n')),
        ),
      }
    }),
  )
}
export const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n')
// Stable key order makes source digests independent of JSON serialization order.
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'null'
}
export const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b)
