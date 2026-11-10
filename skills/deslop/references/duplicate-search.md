# Duplicate Search

Slop often hides as near-duplicate behavior copied across modules under slightly different names. Search first, then consolidate only when the contracts truly match.

## Search Tactics

Search by symbol and by behavior:

```bash
rg "formatDuration|format duration|duration" packages
```

For long-name naming passes:

```bash
rg -n "(?:function\s+\w{28,}|const\s+\w{28,}\s*=|export\s+const\s+\w{28,}\s*=)" apps packages --glob '*.ts' --glob '*.tsx'
```

For high-arity helper scans:

```bash
rg -n "(?:function|const|export const)\s+\w+\s*[=(]\s*\([^)]*,[^)]*,[^)]*" apps packages --glob '*.ts' --glob '*.tsx'
```

For local helpers with explicit return annotations:

```bash
rg -n "const\s+\w+\s*=\s*\([^)]*\):\s*[^=]+=>|function\s+\w+\([^)]*\):\s*[^ {=]+" apps packages --glob '*.ts' --glob '*.tsx'
```

If a structural or fuzzy code-search tool is already installed, use it as a secondary aid. Do not install a third-party fuzzy finder just for this step; `rg` plus reading nearby code is enough.

## Consolidation Rules

- Read every close match. Similar names are evidence to inspect, not evidence of duplication.
- Merge only symbols with the same input shape, side effects, error behavior, and return shape.
- Extract one focused utility that matches repository conventions, repoint every call site, and delete duplicate definitions and dead imports.
- Keep deliberately separate functions when their contracts differ, even if names are close.
- Re-run the search afterward to confirm the intended definitions remain.
