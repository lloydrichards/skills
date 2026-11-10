# Signatures and Types

Read signatures together with their call sites. The issue is rarely raw parameter count or annotation count; it is whether the shape matches the domain.

## Parameter Shape

Prefer passing a domain object when:

- multiple arguments are fields from the same object, such as `createContext(config, node.id, node.identity)`;
- the helper immediately reconstructs or reasons about the original domain concept;
- callers repeatedly perform the same destructuring before calling the helper;
- positional arguments have similar primitive types and are easy to swap;
- a future parameter would likely be another field from the same source object.

Prefer keeping separate parameters when:

- the helper combines genuinely independent inputs;
- the function is a small generic utility like `scroll(state, action, bounds)`;
- the call adapts to an external API or framework signature;
- an options object would contain mostly unused fields or hide a stable boundary.

Good refactor shapes:

- `createTokenContext(config, node.id, node.identity)` -> `createTokenContext(config, node)`
- `annotationFor(file.path, file.contributors)` -> `annotationFor(file)`
- `compose(action.path, baseContents, action.operations)` -> consider `composeFrom(action, baseContents)` when the composer operates on the action as a concept.

## Boolean Flags and Options

- Split a function when a boolean flag makes it do two unrelated jobs.
- Inline a branch when the flag exists only for one nearby call site.
- Narrow an options object that carries mostly unused fields unless it is a stable framework/API payload.

## Type Shape

Prefer inference when:

- the helper is local/private and short;
- the return expression is a simple literal, object, array, `Option`, `Effect`, `Result`, `Box`, `Prompt`, or schema constructor that TypeScript already infers clearly;
- the annotation requires a noisy one-off type alias or complex `typeof Foo.Type` expression;
- the type only restates the implementation;
- the function is a callback in a typed context;
- removing the annotation does not weaken a public API boundary.

Keep explicit annotations when:

- the function is exported or part of a stable package/API boundary;
- the annotation intentionally constrains the implementation;
- the inferred type would expose implementation details;
- the function is recursive or mutually recursive;
- overloads, generics, or Effect environments/errors need to stay legible;
- the function is a service or live layer boundary where the Effect requirement channel must be constrained and reviewed;
- the function is an exported UI component whose public API intentionally promises `Prompt.Prompt<A>` or another stable render contract;
- the return type improves error location for object literals or schema/domain contracts;
- local lint/style rules require the boundary annotation.

For Effect code, let inference do the heavy lifting inside implementation details. Assert Effect channels at edges where dependencies are provided or exposed, not at every helper in the middle of a pipeline.

For Box/TUI or React-like code, prefer explicit input/props types and inferred render returns for local helpers. Keep return annotations for exported component APIs, overloads, or recursive render helpers.
