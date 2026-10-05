# Contributing

Thanks for helping. Bug reports, fixes, new engine adapters and docs are all welcome. For anything bigger than a
fix, open an issue first so we can agree on the shape before you write it.

## Setup

You need Node 22 (see [.nvmrc](.nvmrc)) and pnpm, which Corepack provides:

```bash
corepack enable
pnpm install
pnpm -r build
```

## Checks

```bash
pnpm check     # lint, format, typecheck, build, test, knip
```

CI runs the same checks on every pull request. `pnpm format` fixes formatting.

Tests that talk to a real engine are skipped unless you point them at one:

| Variables                                               | Runs                           |
| ------------------------------------------------------- | ------------------------------ |
| `ENGINE_URL`, `ENGINE_TOKEN`, `STT_MODEL`               | live transcription             |
| the above plus `TTS_MODEL` (and `TTS_VOICE` for OpenAI) | live speech through the routes |
| `LLM_URL`, `LLM_TOKEN`, `LLM_MODEL`                     | the live speech rewriter       |

## Playground

The playground runs on the packages in this repo, so it is the quickest way to see a change to the aura,
dictation or read-along:

```bash
pnpm --filter @saystack/playground dev
```

## Changesets

Every change that a user of the packages would notice needs a changeset:

```bash
pnpm changeset
```

Pick the packages, the bump (patch for fixes, minor for features and, before 1.0, breaking changes), and write one
or two sentences for the changelog. Exported names, types and error codes are public API: changing them is a
breaking change.

All published packages share one version: a changeset for any of them releases all of them, so an app always
installs a matching set. Merging the version pull request publishes to npm and creates the git tags and GitHub
releases.

## Design rules

- `@saystack/core` has no runtime dependencies and knows no vendor or platform.
- Dependencies point downward: core → web, react, engines → react-web, react-native.
- Name things after the standard, not one server: `createOpenAiSttAdapter`, not `createSomeServerSttAdapter`.
  A server's own protocol or quirk is an opt-in adapter or option.
- Logic any app would need belongs in a package behind an option, not in an app.

## Code style

- Named exports. Components take `interface IProps`, destructured in the signature.
- Handlers are named `handleX` and passed by reference.
- `import type` for type-only imports. No `any`, no enums, no `??=`, `||=` or `&&=`.
- Prefer early returns. Explicit return types on exported functions.
- No inline styles in components; use class names.
- Almost no comments. Keep only the ones that explain a non-obvious why.
