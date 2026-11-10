import { Schema } from "effect";
import { DiagnosticCode } from "./model.js";
export class LabError extends Schema.TaggedError<LabError>()("LabError", {
  code: DiagnosticCode,
  message: Schema.String,
  exitCode: Schema.Literals([1, 2, 3]),
  path: Schema.optionalKey(Schema.String),
}) {}
export const problem = (
  code: DiagnosticCode,
  message: string,
  exitCode: 1 | 2 | 3,
  path?: string,
) =>
  new LabError({
    code,
    message,
    exitCode,
    ...(path === undefined ? {} : { path }),
  });
